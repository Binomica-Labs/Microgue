// The turn engine: everything that happens because time passed.
//
// Split out of main.ts, which had reached 2272 lines and was where every save
// and state bug in this project has hidden. These take the Game rather than
// being methods on it, and Game keeps a one-line delegate for each, so no call
// site and no test had to change -- which is what made a refactor this size
// verifiable rather than hopeful.
//
// The parameter is `_g` and not `g` because several bodies declare a local `g`
// for a gene or a grid, and a mechanical rename to `g` silently pointed at the
// wrong one.

import { WILD_TYPE, quality, rollAllele } from "./allele.js";
import { describeLevel, strainLevel } from "./strain.js";
import { REPLICONS, availableAt, type RepliconId } from "./replicon.js";
import * as bio from "./biology.js";
import * as say from "./flavour.js";
import { BARRIERS, barrierAt, blockedBy, degrade } from "./barrier.js";
import { Dungeon, MAX_FLOOR } from "./dungeon.js";
import type { Mob } from "./dungeon.js";
import { computeFov, isSeen, isVisible, sightRadius } from "./fov.js";
import { isNight, lightAt } from "./cycle.js";
import { firstViolation, type WorldView } from "./invariants.js";
import { MODIFIERS, RARITY } from "./parts.js";
import { addDrop, dropAt, itemName, removeDrop, rollPart, substratesAt,
         yieldOf, type Item } from "./items.js";
import { ROOM_STYLE, roomAt } from "./rooms.js";
import { STATUS, apply as applyStatus, tick as tickStatus } from "./status.js";
import { WEAPONS } from "./weapons.js";
import { microbeTurn } from "./combat.js";
import { nextAction, type Action } from "./pursuit.js";
import { stepClouds, stepPackets } from "./projectile.js";
import { makeRng } from "./rng.js";
import { recordLocus, recordSighting } from "./run.js";
import { creditFor, recordRun } from "./lab.js";
import { writeLab } from "./lab_save.js";
import { deleteSlot } from "./saves.js";
import { findPath } from "./path.js";
import { nextExplore, unexplored } from "./explore.js";
import { headingOf, turnToward } from "./motion.js";
import type { Part } from "./plasmid.js";
import type { ResearchRow } from "./screens.js";
import type { Game } from "./main.js";

/**
 * Take damage, recording what did it.
 *
 * Every path went through a bare `player.hp -= n` and only ONE of the five set
 * `lastAttacker`, so the ledger reported "starvation" for hazards, status
 * effects, toxic intermediates and genuine mob kills alike. A run history that
 * lies about cause of death is worse than none.
 */
export function hurt(_g: Game, amount: number, cause: string): number {
  const dmg = Math.max(Math.round(Number.isFinite(amount) ? amount : 0), 0);
  if (dmg <= 0) return 0;
  _g.player.hp = Math.max(_g.player.hp - dmg, 0);
  _g.lastAttacker = cause;
  return dmg;
}

export function t_mobTurn(_g: Game): void {
  // Every mutating entry point is guarded, not just the obvious ones. Only
  // `step` and `takeTurn` were, so a dead strain could still descend the
  // column -- and the run had already been written to the ledger.
  if (_g.dead) return;
    const wasNight = isNight(_g.clock);
    _g.clock.turn++;
    if (isNight(_g.clock) !== wasNight) {
      // Oxygenic photosynthesis stops but respiration does not, so the oxic
      // zone thins overnight and the chemocline rises. Real, and measured.
      _g.note(isNight(_g.clock)
        ? "The light fails. Photosynthesis stops; the oxic zone begins to thin."
        : "Light returns to the column. The phototrophs stir.");
    }
    _g.upkeep();

    const events = microbeTurn({
      grid: _g.level.grid,
      mobs: _g.level.mobs,
      player: _g.player,
      rng: makeRng(_g.turnSeed++),
      armour: _g.genome.armour(_g.dungeon.depth),
      packets: _g.packets,
      clouds: _g.clouds,
    });

    // Particles fly and gradients decay after the microbes have acted, so a
    // shot fired this turn does not also land this turn.
    const arm = _g.genome.armour(_g.dungeon.depth);
    for (const h of stepPackets(_g.packets, _g.level.grid, _g.player,
                                (x, y) => _g.dungeon.mobAt(x, y) !== undefined)) {
      hurt(_g, Math.max(h.dmg * arm, 1), "a tailocin particle");
      if (h.inflicts) applyStatus(_g.player.status, h.inflicts, 5, 1);
      _g.fx.add({ kind: "burst", t0: _g.now, dur: 380, x: _g.player.x,
                    y: _g.player.y, colour: "#c8a0ff", n: 8, seed: _g.now });
      _g.fx.shake(3, 200, _g.now);
    }
    for (const h of stepClouds(_g.clouds, _g.player)) {
      hurt(_g, Math.max(h.dmg * arm, 1), "a cloud of exudate");
      if (h.inflicts) applyStatus(_g.player.status, h.inflicts, 3, 1);
    }

    for (const e of events) {
      if (e.kind === "strike") {
        _g.fx.add({ kind: "lunge", t0: _g.now, dur: 210, who: e.mob.id,
                      from: { x: e.mob.x, y: e.mob.y },
                      to: { x: _g.player.x, y: _g.player.y } });
        _g.fx.add({ kind: "flash", t0: _g.now + 70, dur: 140,
                      x: _g.player.x, y: _g.player.y, colour: "#ff6a5a" });
        _g.fx.add({ kind: "text", t0: _g.now + 70, dur: 560, x: _g.player.x,
                      y: _g.player.y, text: `-${e.dmg ?? 0}`, colour: "#ff8a7a" });
        _g.fx.shake(2.5, 180, _g.now);
        _g.note(say.incomingLine(e.mob.name, e.mob.weapon, e.dmg ?? 0,
                                   _g.turnSeed + e.mob.y));
        _g.lastAttacker = e.mob.name;
      } else if (e.kind === "charge") {
        // The wind-up is the warning. Ring the microbe that is about to fire.
        _g.fx.add({ kind: "ring", t0: _g.now, dur: 400, x: e.mob.x, y: e.mob.y,
                      colour: "#ffd166", r: 1.1 });
        _g.note(say.chargeLine(e.mob.name, e.mob.weapon));
      } else if (e.kind === "fire") {
        const w = WEAPONS[e.mob.weapon];
        if (w.kind === "bolt" || w.kind === "spear") {
          _g.fx.add({ kind: "bolt", t0: _g.now, dur: 240,
                        colour: w.kind === "spear" ? "#ffd0a0" : "#8fe6ff",
                        seed: _g.now, from: { x: e.mob.x, y: e.mob.y },
                        to: e.at ?? { x: _g.player.x, y: _g.player.y } });
          _g.fx.shake(w.kind === "spear" ? 5 : 3, 200, _g.now);
        }
        _g.note(say.incomingLine(e.mob.name, e.mob.weapon, e.dmg ?? 0,
                                  _g.turnSeed + e.mob.x));
      } else if (e.kind === "status" && e.status) {
        _g.note(`${e.mob.name}: ${STATUS[e.status].name}.`);
        _g.fx.add({ kind: "ring", t0: _g.now, dur: 420, x: _g.player.x,
                      y: _g.player.y, colour: "#c8a0ff", r: 1.2 });
      }
    }

    // The player's own afflictions resolve here too.
    const selfDmg = tickStatus(_g.player.status);
    if (selfDmg > 0) {
      const worst = _g.player.status[0];
      hurt(_g, selfDmg, worst ? STATUS[worst.id].name : "an affliction");
      _g.fx.add({ kind: "text", t0: _g.now, dur: 700, x: _g.player.x,
                    y: _g.player.y, text: `-${selfDmg}`, colour: "#c8a0ff" });
    }

    if (_g.player.hp <= 0) _g.die();
    _g.audit();
    _g.save();
  }

export function t_upkeep(_g: Game): void {
    const d = _g.dungeon.depth;
    // Conditional and inducible promoters read this. Without it every promoter
    // would silently behave as constitutive.
    _g.genome.depth = d;
    _g.genome.inducers = new Set(
      _g.drops.flatMap((dr) => dr.items.flatMap(
        (it) => (it.kind === "substrate" ? [it.id] : []))));

    // Strain level, from what the lineage has actually catalogued. Without
    // this the whole levelling system sits at 1 for ever and the replicons it
    // unlocks are unreachable.
    const level = strainLevel({
      catalogued: _g.run.bestiary.length, deepest: _g.run.deepest,
    });
    if (level !== _g.genome.strain) {
      const before = _g.genome.strain;
      _g.genome.strain = level;
      if (level > before) {
        _g.toasts.push(`Strain advances to L${String(level)}.`, "info", _g.now);
        _g.note(`The lineage has learned enough to carry more. ${describeLevel(level)}.`);
      }
    }

    // Toughness tracks the genome, so building a good plasmid is the whole of
    // character progression. Growth heals; shrinking does not kill.
    const vit = _g.genome.vitality(d);
    if (vit !== _g.player.maxhp) {
      const gain = vit - _g.player.maxhp;
      _g.player.maxhp = vit;
      if (gain > 0) _g.player.hp = Math.min(_g.player.hp + gain, vit);
      _g.player.hp = Math.max(Math.min(_g.player.hp, vit), 1);
    }

    // Energy first: everything below depends on what the pool can supply.
    const gain = _g.genome.atpGain(d);
    const cost = _g.genome.atpCost(d);
    _g.player.atp = Math.min(_g.player.atp + gain, _g.player.atpMax);
    if (cost <= _g.player.atp) {
      _g.player.atp -= cost;
      _g.genome.supply = 1;
    } else {
      // Brownout: you cannot power the proteome you are carrying.
      _g.genome.supply = _g.player.atp / Math.max(cost, 0.001);
      _g.player.atp = 0;

      // "Each layer poses an environmental risk due to lack of means to keep
      // ATP pumps going so lifebar slowly drops until metab genes found."
      // Without a respiration that works at this depth you cannot hold the
      // membrane potential, and you bleed until you find one.
      const shortfall = cost - gain;
      if (shortfall > 0) {
        const bleed = hurt(_g, Math.max(shortfall * 0.5, 1),
                           "ATP starvation — nothing on the ring respires here");
        applyStatus(_g.player.status, "starved", 2, 1);
        _g.fx.add({ kind: "text", t0: _g.now, dur: 700, x: _g.player.x,
                      y: _g.player.y, text: `-${bleed}`, colour: "#7fc4e8" });
        if (Math.random() < 0.2) {
          const s = bio.stratum(d);
          _g.note(say.starveLine(s.donor, s.teap));
        }
      }
    }
    const tox = _g.genome.toxicity(d);
    if (tox > 0) {
      const h = _g.genome.hazards(d)[0];
      hurt(_g, tox, h ? `${h.name}, a toxic intermediate of its own pathway` : "a toxic intermediate");
      if (h && Math.random() < 0.2) _g.note(`${h.name} — ${tox} damage.`);
    }
    const regen = _g.genome.regen(d);
    if (regen > 0 && _g.player.hp < _g.player.maxhp) {
      _g.player.hp = Math.min(_g.player.hp + regen, _g.player.maxhp);
      _g.fx.add({ kind: "text", t0: _g.now, dur: 700, x: _g.player.x,
                    y: _g.player.y, text: `+${regen}`, colour: "#7fe0a4" });
    }
    if (tox > 0) {
      _g.fx.add({ kind: "text", t0: _g.now, dur: 700, x: _g.player.x,
                    y: _g.player.y, text: `-${tox}`, colour: "#ff9a5a" });
    }
    const aura = _g.genome.aura(d);
    if (aura > 0) {
      _g.fx.add({ kind: "ring", t0: _g.now, dur: 420, x: _g.player.x,
                    y: _g.player.y, colour: "#c8b0ff", r: 1.6 });
      for (const m of _g.level.mobs) {
        if (!m.alive) continue;
        if (Math.abs(m.x - _g.player.x) <= 1 && Math.abs(m.y - _g.player.y) <= 1) {
          m.hp = Math.max(m.hp - aura, 0);
          if (m.hp <= 0) { m.alive = false; _g.note(`${m.name} dissolved by H2S.`); }
        }
      }
    }
  }

export function t_step_(_g: Game, t: number): void {
    _g.now = t;
    let dt = Math.min(Math.max((t - _g.last) / 1000, 0), 1 / 15);
    _g.last = t;

    // No world exists until a slot is chosen, so nothing below may run.
    if (_g.showSplash || !_g.started) {
      _g.draw();
      return;
    }
    // Hitstop freezes the animation clock only. Turn state already resolved,
    // so nothing desyncs -- the world just holds still for a beat.
    if (_g.fx.frozen(t)) dt = 0;
    _g.fx.prune(t);
    _g.toasts.prune(t);

    // slide toward the logical tile; clamped so a hitch cannot overshoot
    const k = _g.settings.reduceMotion ? 1 : Math.min(_g.player.speed * dt, 1);
    _g.player.ax += (_g.player.x - _g.player.ax) * k;
    _g.player.ay += (_g.player.y - _g.player.ay) * k;
    // Face the way you are actually travelling, easing round the short way.
    const TURN = 14;                              // radians per second
    const ph = headingOf(_g.player.x - _g.player.ax, _g.player.y - _g.player.ay);
    if (ph !== null) {
      _g.player.heading = _g.player.heading === null
        ? ph : turnToward(_g.player.heading, ph, TURN * dt);
    }
    for (const m of _g.level.mobs) {
      if (!m.alive) continue;
      const mk = Math.min(11 * dt, 1);        // microbes glide a touch slower
      m.ax += (m.x - m.ax) * mk;
      m.ay += (m.y - m.ay) * mk;
      if (Math.abs(m.x - m.ax) < 0.02) m.ax = m.x;
      if (Math.abs(m.y - m.ay) < 0.02) m.ay = m.y;
      const mh = headingOf(m.x - m.ax, m.y - m.ay);
      if (mh !== null) {
        m.heading = m.heading === null ? mh : turnToward(m.heading, mh, TURN * dt);
      }
    }

    const at = Math.abs(_g.player.x - _g.player.ax) < 0.02
            && Math.abs(_g.player.y - _g.player.ay) < 0.02;
    if (at) { _g.player.ax = _g.player.x; _g.player.ay = _g.player.y; }

    // Auto-attack and pursuit both act on a timer so the fight is watchable
    // rather than resolving instantly.
    const busy = _g.showPlasmid || _g.showMap;
    // Only AUTO-attack ticks on its own. A tapped target used to keep
    // pursuing turn after turn without another input, which is the opposite of
    // how a turn-based roguelike should feel: one input, one turn. Crawl makes
    // you press the key each time and that is the whole texture of its combat.
    if (!busy && at && _g.autoAttack && t - _g.autoAt > 230) {
      _g.autoAt = t;
      if (!_g.takeTurn()) {
        // nothing in range: stop rather than spinning
        _g.autoAttack = false;
        const btn = _g.buttons.find((b) => b.id === "auto");
        if (btn) btn.active = false;
        _g.note("No targets in range. Auto-attack off.");
      }
    }

    // Belt and braces: openPlasmid() clears the walk, but the loop refuses to
    // advance one while the screen is up regardless.
    if (_g.walk && at && !_g.showPlasmid) {
      _g.walk.i++;
      const n = _g.walk.nodes[_g.walk.i];
      const blocker = n ? _g.dungeon.mobAt(n.x, n.y) : null;

      // Travel that ends in a blow. Arriving next to the thing you tapped
      // spends the last step ON it, then stops -- one input, one approach, one
      // strike, and you decide what happens next.
      if (blocker && blocker === _g.strikeAfterTravel) {
        _g.attack(blocker);
        _g.walk = null;
        _g.strikeAfterTravel = null;
        _g.exploring = false;
      } else if (!n || blocker || !_g.step(n.x, n.y)) {
        _g.walk = null;
        _g.strikeAfterTravel = null;
      }
    } else if (_g.exploring && at && !_g.walk && !_g.showPlasmid) {
      t_exploreStep(_g);
    }

    _g.draw();
  }

export function t_step(_g: Game, x: number, y: number): boolean {
  if (_g.dead) return false;
    const m = _g.dungeon.mobAt(x, y);
    if (m) { _g.attack(m); return false; }
    if (!_g.level.grid.isFloor(x, y)) return false;

    // Material you have to digest through. Expressing the enzyme is the key;
    // merely carrying it is not.
    const bar = barrierAt(_g.level.barriers, x, y);
    if (bar) {
      const r = degrade(bar, (g) => _g.genome.expression(g, _g.dungeon.depth) > 0);
      if (r.kind === "blocked") {
        _g.note(blockedBy(r.def, (g) => bio.GENES[g].name));
        _g.walk = null;
        return false;
      }
      _g.fx.add({ kind: "burst", t0: _g.now, dur: 340, x, y,
                    colour: r.def.colour, n: 7, seed: _g.now + x });
      if (r.kind === "working") {
        _g.note(`You begin digesting the ${r.def.name}. ${String(r.left)} more.`);
        _g.mobTurn();
        return false;
      }
      _g.level.barriers = _g.level.barriers.filter((b) => b !== bar);
      _g.note(`The ${r.def.name} gives way.`);
    }
    _g.player.x = x; _g.player.y = y;
    _g.look();
    _g.onTile(x, y);
    _g.mobTurn();
    return true;
  }

export function t_attack(_g: Game, m: Mob): void {
  if (_g.dead) return;             // a lost strain does not act
    const dmg = Math.max(Math.round(_g.atk()), 1);
    const ranged = Math.abs(m.x - _g.player.x) > 1 || Math.abs(m.y - _g.player.y) > 1;
    const now = _g.now;

    if (ranged) {
      // Nanowire strike. The bolt IS the feedback; there is nothing else.
      _g.fx.add({ kind: "bolt", t0: now, dur: 220, colour: "#8fe6ff", seed: now,
                    from: { x: _g.player.x, y: _g.player.y }, to: { x: m.x, y: m.y } });
    } else {
      _g.fx.add({ kind: "lunge", t0: now, dur: 190, who: "player",
                    from: { x: _g.player.x, y: _g.player.y }, to: { x: m.x, y: m.y } });
    }
    _g.fx.add({ kind: "flash", t0: now + 60, dur: 130, x: m.x, y: m.y, colour: "#ffffff" });
    _g.fx.add({ kind: "text", t0: now + 60, dur: 620, x: m.x, y: m.y,
                  text: String(dmg), colour: "#ffe0a0" });
    _g.fx.shake(Math.min(2 + dmg * 0.35, 7), 190, now);
    _g.fx.hitstop(28, now);

    m.hp = Math.max(m.hp - dmg, 0);
    if (m.hp > 0) _g.note(say.hitLine(m.name, dmg, false, _g.turnSeed + dmg));
    if (m.hp <= 0) {
      m.alive = false;
      if (m.elite && Dungeon.isCleared(_g.level)) {
        _g.note("The floor goes quiet. The way down is clear.");
        _g.toasts.push("Floor cleared.", "info", _g.now);
        if (_g.dungeon.floor >= MAX_FLOOR) _g.win();
      }
      if (recordSighting(_g.run, m.id)) {
        _g.note(`You record the ${m.name} in your notebook.`);
      }

      // Remains fall where the cell died. Nothing is picked up for free.
      const loot: Item[] = [];
      const rng = makeRng(_g.turnSeed + m.x * 31 + m.y);
      const pool = m.genes.filter(
        (g) => !_g.genome.has(g) && !_g.genome.inBin(g));
      const gene = pool[rng.int(Math.max(pool.length, 1))];
      if (gene !== undefined && rng.next() < 0.8) {
        loot.push({ kind: "cassette", gene, allele: rollAllele(rng, _g.dungeon.depth) });
      }
      const subs = substratesAt(_g.dungeon.depth);
      const n = 1 + rng.int(2);
      for (let i = 0; i < n; i++) {
        const id = subs[rng.int(subs.length)];
        if (id) loot.push({ kind: "substrate", id });
      }
      if (m.elite) {
        // A boss always yields a regulatory part, rolled at its own depth.
        const part = rollPart(rng.next(), rng.next(), _g.dungeon.depth);
        if (part) loot.push(part);
      }
      addDrop(_g.drops, m.x, m.y, loot);
      if (loot.length > 1) _g.note(say.lysateLine(loot.length, m.name));
      // Lysis: the cell bursts. Bigger shake, longer stop, scattered debris.
      _g.fx.add({ kind: "burst", t0: _g.now + 40, dur: 520, x: m.x, y: m.y,
                    colour: m.pigment, n: 14, seed: _g.now + m.x * 31 + m.y });
      _g.fx.shake(7, 260, _g.now);
      _g.fx.hitstop(70, _g.now);
      _g.note(say.hitLine(m.name, 0, true, _g.turnSeed + m.x));

      // Natural transformation: free DNA released by a lysing neighbour is the
      // classic substrate for it, so an occasional direct uptake is right --
      // but most of the genome ends up on the floor to be collected.
      const free = m.genes.filter((g) => !_g.genome.has(g) && !_g.genome.inBin(g));
      const direct = free[rng.int(Math.max(free.length, 1))];
      if (direct !== undefined && rng.next() < 0.25
          && _g.genome.stash({ kind: "gene", id: direct, level: 1, mods: [], allele: WILD_TYPE }).ok) {
        recordLocus(_g.run, direct);
        _g.note(say.hgtLine(direct, m.name));
        _g.fx.add({ kind: "bolt", t0: _g.now + 120, dur: 380, colour: "#a0ffd0",
                      seed: _g.now, from: { x: m.x, y: m.y },
                      to: { x: _g.player.x, y: _g.player.y } });
      }
    }
    _g.mobTurn();
    _g.save();
  }

/**
 * The strain dies. Permanently.
 *
 * There is no resynthesising it in place and carrying on -- that made death a
 * setback rather than an ending, and an ending is what gives a run its shape.
 * What survives is what a lab keeps: the sequence data, the notebook, and the
 * credit to order constructs for whatever goes down next.
 */
export function t_die(_g: Game): void {
  const carried = [..._g.genome.carried()].filter((g) => g !== "ori");
  const best = _g.genome.slots.reduce((m, p) =>
    p?.kind === "gene" ? Math.max(m, quality(p.allele)) : m, 1);

  const outcome = {
    floor: _g.dungeon.floor,
    turns: _g.clock.turn,
    catalogued: _g.run.bestiary.length,
    bossesCleared: Math.floor((_g.dungeon.floor - 1) / 3),
    genesCarried: carried.length,
    bestAllele: best,
    killedBy: _g.lastAttacker ?? "starvation",
    won: _g.won,
  };
  const credit = creditFor(outcome);
  const rec = recordRun(_g.lab, outcome, credit);
  writeLab(_g.lab);

  _g.dead = true;
  _g.deathAt = _g.now;
  _g.deathRecord = rec;
  deleteSlot(_g.slot);

  _g.toasts.push(`The strain is lost. +${String(credit)} synthesis credit.`,
                 "warn", _g.now);
  _g.note(`Lysed on F${String(outcome.floor)} after ${String(outcome.turns)} turns. `
    + `${String(carried.length)} loci sequenced, ${String(outcome.catalogued)} organisms `
    + `recorded. The lab banks ${String(credit)} credit.`);
}

export function t_descend(_g: Game): void {
  if (_g.dead) return;             // a lost strain does not act
    if (!Dungeon.isCleared(_g.level)) {
      _g.note("The way down is choked. Something here has to die first.");
      _g.toasts.push("Clear the floor before descending.", "warn", _g.now);
      return;
    }
    const r = _g.dungeon.descend();
    if ("err" in r) { _g.note(r.err); return; }
    _g.enter(r.level, r.arrive);
    _g.audit();
  }

export function t_ascend(_g: Game): void {
  if (_g.dead) return;             // a lost strain does not act
    const r = _g.dungeon.ascend();
    if ("err" in r) { _g.note(r.err); return; }
    _g.enter(r.level, r.arrive);
  }

export function t_look(_g: Game): void {
    const s = _g.level.sight;
    // Bioluminescence is its own light source, and luciferase needs O2 -- so
    // the glow only helps in the oxic zone, which is where you least need it.
    const glow = _g.genome.expression("luxAB", _g.dungeon.depth) > 0 ? 2 : 0;
    const lit = lightAt(_g.level.stratum.light, _g.clock);
    computeFov(s, _g.level.grid, _g.player.x, _g.player.y,
               sightRadius(lit) + glow);

    // Keyed on the INSTANCE. Keying on species-plus-position re-fired every
    // time a microbe took a step, which is once per turn, for ever.
    const nowVisible = new Set<number>();
    const arrivals: Mob[] = [];
    for (const mob of _g.level.mobs) {
      if (!mob.alive || !isVisible(s, mob.x, mob.y)) continue;
      nowVisible.add(mob.uid);
      if (!_g.spotted.has(mob.uid)) arrivals.push(mob);
    }
    // Leaving sight is what re-arms the alert, so a thing pacing in and out of
    // a doorway does not shout on every step.
    for (const uid of [..._g.spotted]) if (!nowVisible.has(uid)) _g.spotted.delete(uid);
    for (const mob of arrivals) _g.spotted.add(mob.uid);

    if (arrivals.length > 0 && (_g.walk || _g.exploring)) {
      // Total stop. Clearing only the walk left `exploring` set, so the next
      // tick immediately picked a new frontier and walked on past the thing
      // that had just appeared.
      _g.walk = null;
      _g.exploring = false;
      _g.strikeAfterTravel = null;
      const btn = _g.buttons.find((b) => b.id === "explore");
      if (btn) btn.active = false;
      _g.path = null;
      const names = [...new Set(arrivals.map((a) => a.name))];
      const what = names.length === 1
        ? `a ${names[0] ?? ""}`
        : `${String(arrivals.length)} things`;
      _g.note(`You stop. ${what.charAt(0).toUpperCase()}${what.slice(1)} comes into view.`);
      _g.toasts.push(`${what} in view.`, "warn", _g.now);
    }
  }

export function t_onTile(_g: Game, x: number, y: number): void {
  if (_g.dead) return;             // a lost strain does not act
    const room = roomAt(_g.level.rooms, x, y);
    if (room && room !== _g.inRoom) {
      _g.inRoom = room;
      _g.note(`${ROOM_STYLE[room.kind].name}. ${ROOM_STYLE[room.kind].note}`);
    } else if (!room) {
      _g.inRoom = null;
    }
    const d = dropAt(_g.drops, x, y);
    if (!d) return;
    if (d.items.length === 1) {
      const it = d.items[0];
      if (it && _g.take(it)) removeDrop(_g.drops, d);
      return;
    }
    // More than one: open it rather than swallowing it blind.
    _g.openDrop = d;
    _g.walk = null;
  }

export function t_take(_g: Game, it: Item): boolean {
    if (it.kind === "cassette") {
      const r = _g.genome.stash({ kind: "gene", id: it.gene, level: 1, mods: [],
                                  allele: it.allele });
      if (!r.ok) { _g.toasts.push(r.err, "warn", _g.now); return false; }
      recordLocus(_g.run, it.gene);
      _g.note(say.pickupLine(it, 0, null));
      return true;
    }
    // Regulatory parts go to the bin; only substrates are metabolised.
    if (it.kind !== "substrate") {
      // A modifier is not a ring part: it is held until attached to a gene.
      if (it.kind === "modifier") {
        _g.mods.push(it.id);
        _g.note(say.pickupLine(it, 0, null));
        _g.toasts.push(`${RARITY[it.rarity].name}: ${MODIFIERS[it.id].name}`,
                         "info", _g.now);
        return true;
      }
      const part: Part = it.kind === "promoter"
        ? { kind: "promoter", id: it.id }
        : { kind: "terminator", id: it.id };
      const r = _g.genome.stash(part);
      if (!r.ok) { _g.toasts.push(r.err, "warn", _g.now); return false; }
      _g.note(say.pickupLine(it, 0, null));
      if (it.rarity !== "common") {
        _g.toasts.push(`${RARITY[it.rarity].name} part: ${itemName(it)}`,
                         "info", _g.now);
      }
      return true;
    }
    const { atp, blocked } = yieldOf(it.id, (g) => _g.genome.has(g));
    _g.player.atp = Math.min(_g.player.atp + atp, _g.player.atpMax);
    _g.note(say.pickupLine(it, atp, blocked));
    if (atp > 0) {
      _g.fx.add({ kind: "text", t0: _g.now, dur: 700, x: _g.player.x,
                    y: _g.player.y, text: `+${String(atp)}`, colour: "#7fc4e8" });
    }
    return true;
  }

export function t_describeTile(_g: Game, x: number, y: number): void {
    const s = _g.level.sight;
    if (!isSeen(s, x, y)) { _g.note("You have not been there."); return; }
    if (!isVisible(s, x, y)) { _g.note("You remember the ground there."); return; }

    const parts: string[] = [];
    const mob = _g.dungeon.mobAt(x, y);
    if (mob) parts.push(`A ${mob.name}. ${mob.note}`);
    const d = dropAt(_g.drops, x, y);
    if (d) {
      parts.push(d.items.length === 1 && d.items[0]
        ? `${itemName(d.items[0])} lies here.`
        : `A lysate of ${String(d.items.length)} things lies here.`);
    }
    const bar = barrierAt(_g.level.barriers, x, y);
    if (bar) parts.push(`${BARRIERS[bar.id].name}. ${BARRIERS[bar.id].note}`);
    if (_g.level.down?.x === x && _g.level.down.y === y) {
      parts.push("A way down into the next layer.");
    }
    if (x === _g.level.up.x && y === _g.level.up.y) parts.push("A way back up.");
    if (parts.length > 0) _g.note(parts.join(" "));
  }

export function t_research(_g: Game, row: ResearchRow): void {
  if (_g.dead) return;             // a lost strain does not act
  if (row.kind === "subclone") {
    if (row.replicon !== undefined) t_subclone(_g, row.replicon);
    return;
  }
    if (row.kind === "evolve") {
      // Selecting is always allowed; paying is not.
      _g.researchPick = row.gene;
      if (!row.afford) {
        _g.toasts.push(
          Number.isFinite(row.cost)
            ? `Need ${String(row.cost)} ATP.` : "Already fully evolved.",
          "warn", _g.now);
        return;
      }
      const r = _g.genome.evolve(row.gene);
      if (!r.ok) { _g.toasts.push(r.err, "warn", _g.now); return; }
      _g.player.atp = Math.max(_g.player.atp - row.cost, 0);
      _g.note(`${bio.GENES[row.gene].name} evolves. Rounds of mutagenesis and `
        + "selection, and the enzyme comes back better than it went in.");
      _g.fx.add({ kind: "ring", t0: _g.now, dur: 520, x: _g.player.x,
                    y: _g.player.y, colour: "#cfe04a", r: 2.2 });
      _g.save();
      return;
    }
    if (row.mod === undefined) return;
    if (!row.afford) {
      _g.toasts.push(_g.researchPick === null
        ? "Choose a gene first." : "No free modifier slot on that gene.",
        "warn", _g.now);
      return;
    }
    const r = _g.genome.addModifier(row.gene, row.mod);
    if (!r.ok) { _g.toasts.push(r.err, "warn", _g.now); return; }
    // Consume exactly one, not every copy held.
    const i = _g.mods.indexOf(row.mod);
    if (i >= 0) _g.mods.splice(i, 1);
    _g.note(`${MODIFIERS[row.mod].name} attached to ${bio.GENES[row.gene].name}. `
      + MODIFIERS[row.mod].note);
    _g.save();
  }

export function t_win(_g: Game): void {
    if (_g.won) return;
    _g.won = true;
    _g.run.deepest = MAX_FLOOR;
    _g.toasts.push("You have reached the bottom of the column.", "info", _g.now);
    _g.note("Nothing below but carbonate and the glass. The column is yours.");
    _g.save();
  }

export function t_audit(_g: Game): void {
  // Nothing to validate once the strain is gone: the run is over and hp 0 is
  // the correct state for a dead one.
  if (_g.dead) return;
    const v = firstViolation(_g.world());
    if (!v) return;
    _g.toasts.push(`invariant: ${v.name} — ${v.detail}`, "error", _g.now);
  }

export function t_world(_g: Game): WorldView {
    return {
      plasmid: _g.genome, level: _g.level, player: _g.player,
      drops: _g.drops, packets: _g.packets, clouds: _g.clouds,
      barriers: _g.level.barriers, run: _g.run, floor: _g.dungeon.floor,
      dead: _g.dead,
    };
  }

export function t_takeTurn(_g: Game): boolean {
    const act: Action = nextAction(
      { x: _g.player.x, y: _g.player.y }, _g.level.mobs, _g.level.grid,
      _g.target, _g.autoAttack,
      { reach: _g.genome.reach(_g.dungeon.depth), maxRange: 24 });

    switch (act.kind) {
      case "attack":
        _g.target = act.target;
        _g.attack(act.target);
        return true;
      case "step":
        _g.target = act.target;
        _g.step(act.to.x, act.to.y);
        return true;
      case "idle":
        _g.target = null;
        return false;
    }
  }

export function t_repath(_g: Game): void {
    _g.path = findPath(_g.level.grid, { x: _g.player.x, y: _g.player.y },
                         _g.cursor, { diagonal: _g.settings.diagonal });
  }


/**
 * Catabolise a cassette: eat the DNA.
 *
 * This is not a game convenience. Extracellular DNA is a real nutrient --
 * competent bacteria take it up for phosphate, nitrogen and carbon as readily
 * as for the information in it, and in sediments eDNA is a significant part of
 * the phosphorus budget. A long gene is simply more nucleotide.
 *
 * It is also the loot sink the hunt needs: a junk roll of a gene you already
 * carry is worth something, so screening a hundred cassettes for one good
 * mtrC is not a hundred wasted pickups.
 */
export function t_catabolise(_g: Game, binIndex: number): void {
  if (_g.dead) return;             // a lost strain does not act
  const part = _g.genome.bin[binIndex];
  if (part === undefined) return;
  if (part.kind === "gene" && part.id === "ori") {
    _g.toasts.push("Not the origin.", "warn", _g.now);
    return;
  }

  const kb = part.kind === "gene" ? bio.GENES[part.id].kb
    : part.kind === "promoter" ? 0.1 : 0.06;
  // A better allele is more intact DNA and yields more, which keeps the choice
  // honest: eating a good roll costs you the good roll.
  const grade = part.kind === "gene" ? quality(part.allele) : 1;
  const hp = Math.max(Math.round(kb * 2.4 * grade), 1);
  const atp = Math.max(Math.round(kb * 5.5 * grade), 1);

  _g.genome.bin.splice(binIndex, 1);
  _g.player.hp = Math.min(_g.player.hp + hp, _g.player.maxhp);
  _g.player.atp = Math.min(_g.player.atp + atp, _g.player.atpMax);
  _g.fx.add({ kind: "ring", t0: _g.now, dur: 460, x: _g.player.x, y: _g.player.y,
              colour: "#a0ffd0", r: 1.8 });
  _g.note(`You digest the cassette. ${kb.toFixed(1)} kb of nucleotide, `
    + `recovered as phosphate and base. +${String(hp)} hp, +${String(atp)} ATP.`);
  _g.save();
}


/**
 * Move the whole plasmid onto a different replicon.
 *
 * Subcloning: you are lifting every part off one backbone and ligating it onto
 * another. It costs ATP and a turn, it fails if the new replicon cannot hold
 * what you are carrying, and parts that no longer fit go to the bin rather
 * than being destroyed -- losing loot to a UI decision would be indefensible.
 */
export function t_subclone(_g: Game, to: RepliconId): void {
  if (_g.dead) return;             // a lost strain does not act
  const def = REPLICONS[to];
  if (_g.genome.replicon === to) return;
  if (!availableAt(_g.genome.strain).some((r) => r.id === to)) {
    _g.toasts.push(`${def.name} needs strain L${String(def.unlock)}.`, "warn", _g.now);
    return;
  }
  const cost = 30 + def.copies;
  if (_g.player.atp < cost) {
    _g.toasts.push(`Subcloning needs ${String(cost)} ATP.`, "warn", _g.now);
    return;
  }

  const before = _g.genome.replicon;
  _g.genome.replicon = to;
  _g.player.atp = Math.max(_g.player.atp - cost, 0);

  // Anything past the new replicon's last position comes off the backbone. It
  // goes to the bin if there is room, and only then is it lost.
  let displaced = 0, lost = 0;
  for (let i = _g.genome.slots.length - 1; i >= 0; i--) {
    if (_g.genome.usable(i)) continue;
    const part = _g.genome.vacate(i);
    if (part === null) continue;
    displaced++;
    if (!_g.genome.stash(part).ok) lost++;
  }

  _g.note(`Subcloned from ${REPLICONS[before].name} onto ${def.name}. ${def.note}`);
  if (displaced > 0) {
    _g.note(`${String(displaced)} part${displaced === 1 ? "" : "s"} would not fit `
      + `and came off the backbone${lost > 0 ? `; ${String(lost)} had nowhere to go` : ""}.`);
  }
  _g.mobTurn();
  _g.save();
}


/**
 * One leg of auto-explore.
 *
 * Called when the walk queue has emptied and nothing interrupted, so this
 * either finds the next frontier or declares the level done. The interrupt
 * itself lives in `look()`: anything coming into view clears `walk`, and
 * clearing `exploring` alongside it is what makes the stop total.
 */
export function t_exploreStep(_g: Game): void {
  if (_g.dead || !_g.exploring) return;
  const r = nextExplore(_g.level.grid, _g.level.sight, _g.player);
  if (r.kind === "done") {
    _g.exploring = false;
    const left = unexplored(_g.level.grid, _g.level.sight);
    _g.note(left < 0.02
      ? "The floor is fully mapped."
      : `${r.why} ${String(Math.round(left * 100))}% of the floor is still dark.`);
    const btn = _g.buttons.find((b) => b.id === "explore");
    if (btn) btn.active = false;
    return;
  }
  _g.walk = { nodes: [...r.path], i: 0 };
}

/** Start or stop exploring. */
export function t_explore(_g: Game): void {
  if (_g.dead) return;
  _g.exploring = !_g.exploring;
  const btn = _g.buttons.find((b) => b.id === "explore");
  if (btn) btn.active = _g.exploring;
  if (!_g.exploring) { _g.walk = null; _g.note("Exploration halted."); return; }
  _g.target = null;
  _g.autoAttack = false;
  _g.strikeAfterTravel = null;
  t_exploreStep(_g);
}
