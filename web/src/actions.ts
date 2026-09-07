// Acting: the turn loop, moving, striking, exploring.
//
// Split from turn.ts, which had been one line under the 900-line ceiling for
// three versions. The seam is real: this file is what the cell DOES and what a
// passing turn does TO it -- `t_upkeep` (metabolism, hazards, the day cycle,
// the strain advancing), `t_step_` (the animation frame), `t_step`, `t_attack`
// and `t_explore`. What is left in turn.ts is the bookkeeping around an action:
// stairs, pickup, world-building, repath.

import { CONDITIONS } from "./conditions.js";
import type { Game } from "./main.js";
import * as bio from "./biology.js";
import * as say from "./flavour.js";
import { WILD_TYPE, rollAllele } from "./allele.js";
import { barrierAt, blockedBy, degrade } from "./barrier.js";
import { atpCeiling } from "./chromosome.js";
import { Dungeon, MAX_FLOOR } from "./dungeon.js";
import type { Mob } from "./dungeon.js";
import { ELITES } from "./elite.js";
import type { EliteStrain } from "./elite.js";
import { isVisible } from "./fov.js";
import { addDrop, rollPart, substratesAt } from "./items.js";
import type { Item } from "./items.js";
import { labStation } from "./lab_station.js";
import { MAX_STACK, countOf } from "./stack.js";
import { headingOf, turnToward } from "./motion.js";
import { findPath } from "./path.js";
import { distanceTo } from "./pursuit.js";
import { upkeepRepair } from "./repair_turn.js";
import { makeRng } from "./rng.js";
import { recordLocus, recordSighting } from "./run.js";
import { t_visibleHostile } from "./sight.js";
import { isSnapshotTurn, snapshot } from "./snapshot.js";
import { apply as applyStatus } from "./status.js";
import { describeLevel, strainLevel } from "./strain.js";
import { hurt, t_exploreStep } from "./turn.js";

export function t_upkeep(_g: Game): void {
    // No metabolism in the lab. You are a person crossing a room: nothing to
    // burn, nothing to repair, no hazards, and no status ticking down.
    //
    // A strain that died of oxidative stress left the status on the player,
    // `enterLab` did not clear it, and it kept ticking in a room with nothing
    // in it -- two steps into a new culture and dead on F0. Clearing the
    // status alone would have fixed that one; stopping upkeep fixes the class,
    // including every hazard and drain that has not been written yet.
    if (_g.intro) return;
    const d = _g.dungeon.depth;
    // Conditional and inducible promoters read this. Without it every promoter
    // would silently behave as constitutive.
    _g.genome.depth = d;
    // A runaway replicon reads this. Without it pUC sits at a quarter of
    // its nominal copy number for ever, which is the wrong end of its
    // own trade.
    _g.genome.energy = _g.player.atpMax > 0
      ? _g.player.atp / _g.player.atpMax : 1;
    _g.genome.inducers = new Set(
      _g.drops.flatMap((dr) => dr.items.flatMap(
        (it) => (it.kind === "substrate" ? [it.id] : []))));

    // Strain level, from what the lineage has actually catalogued. Without
    // this the whole levelling system sits at 1 for ever and the replicons it
    // unlocks are unreachable.
    // The lab's purchased start is a FLOOR under the earned level, not a
    // starting value: without the max, `upkeep` recomputed the level from a
    // notebook that is empty on turn one and silently downgraded a strain the
    // lab had paid escalating credit for -- from L8 to L1, and three ring
    // positions with it, one turn into the run and with no message.
    const level = Math.max(
      strainLevel({ catalogued: _g.run.bestiary.length, deepest: _g.run.deepest,
                    killed: _g.run.killed }),
      _g.lab.startStrain);
    // Strain first, THEN the ceiling: reading `genome.strain` before assigning
    // it computed the pool from last turn's strain, so the ATP ceiling lagged
    // a level behind for one turn after every advance.
    const before = _g.genome.strain;
    if (level !== before) {
      _g.genome.strain = level;
      // Anchored with a full snapshot: a level change moves ring positions,
      // kilobases and the ATP ceiling all at once, and "everything shifted
      // around turn 300" is otherwise very hard to place.
      _g.trace.push(_g.clock.turn, "state",
        `strain L${String(before)} -> L${String(level)}; ${snapshot(_g)}`);
    }

    // The energy a cell can hold scales with how big and how adapted it is.
    // Without this the ceiling sat at 100 for ever and most of the growth
    // curve, and every trait, was unreachable.
    const ceiling = atpCeiling(_g.genome.integrated, _g.genome.strain);
    if (ceiling !== _g.player.atpMax) {
      _g.player.atpMax = ceiling;
      _g.player.atp = Math.min(_g.player.atp, ceiling);
    }

    if (level !== before) {
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
    _g.repairSpend = 0;                  // set below if anything is repaired

    // A periodic picture of every variable, so the log can answer a question
    // about STATE and not only about events.
    if (isSnapshotTurn(_g.clock.turn)) {
      _g.trace.push(_g.clock.turn, "state", snapshot(_g));
    }
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
    const base = _g.genome.toxicity(d);
    // The condition scales hazard damage: an anoxic or sulfidic column makes a
    // mis-built operon bite harder.
    const tox = Math.round(base * CONDITIONS[_g.run.condition].hazard);
    if (tox > 0) {
      const h = _g.genome.hazards(d)[0];
      hurt(_g, tox, h ? `${h.name}, a toxic intermediate of its own pathway` : "a toxic intermediate");
      if (h && Math.random() < 0.2) _g.note(`${h.name} — ${String(tox)} damage.`);
    }
    // Biofilm concentrates nutrients: each claimed tile has a small chance per
    // turn to grow a substrate drop on itself. A defended pocket slowly feeds
    // you -- the reward for holding ground instead of only descending.
    if (_g.biofilm.floor === _g.dungeon.floor && _g.biofilm.tiles.size > 0) {
      for (const key of _g.biofilm.tiles) {
        if (Math.random() < 0.04) {
          const bx = key % 4096, by = Math.floor(key / 4096);
          const subs = substratesAt(d);
          const sid = subs[Math.floor(Math.random() * subs.length)];
          if (sid && !_g.drops.some((dr) => dr.x === bx && dr.y === by)) {
            addDrop(_g.drops, bx, by, [{ kind: "substrate", id: sid }]);
          }
        }
      }
    }

    // Competence: on a tile with substrate, a cell expressing comA can take up
    // ambient DNA -- a gene drifting from a NEIGHBOURING stratum, one you could
    // not synthesise here yet. Rare, and only where there is lysate to scavenge
    // from, so it rewards lingering in a rich pocket rather than rushing down.
    // Unlike a relict (dead DNA, sealed) this is living transfer in open water.
    if (_g.genome.expression("comA", d) > 0 && !_g.dead) {
      const onSubstrate = _g.drops.some(
        (dr) => dr.x === _g.player.x && dr.y === _g.player.y
          && dr.items.some((it) => it.kind === "substrate"));
      if (onSubstrate && Math.random() < 0.03) {
        const near = d + (Math.random() < 0.5 ? -1 : 1);
        const nd = Math.min(Math.max(near, 1), 8);
        const pool = bio.microbesAt(nd).flatMap((p) => [...p.genes])
          .filter((g) => !_g.genome.has(g) && !_g.genome.inBin(g)
            && !bio.microbesAt(d).some((p) => p.genes.includes(g)));
        const g = pool[Math.floor(Math.random() * pool.length)];
        if (g !== undefined) {
          const r = _g.genome.stash({ kind: "gene", id: g, level: 1, mods: [],
                                      allele: rollAllele(makeRng(_g.turnSeed++), d) });
          if (r.ok) _g.note(`Competence: took up ${bio.GENES[g].name} from the water.`);
        }
      }
    }

    // Repair: spend ATP to close damage. This is the ordinary way to recover
    // -- only two of nine complexes grant free regeneration, so without it a
    upkeepRepair(_g, d, gain, cost);

    // Regeneration complexes are free healing ON TOP, which is what makes
    // them worth building around rather than merely nice.
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
          if (m.hp <= 0) {
            m.alive = false;
            // The aura is the PLAYER's -- it is centred on them and it exists
            // because of a gene they express. A kill by it is theirs.
            _g.run.killed += 1;
            _g.note(`${m.name} dissolved by H2S.`);
          }
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
    // Face the way you are travelling, easing round the short way -- or the
    // thing you are hitting.
    //
    // Travel alone meant a cell that attacked without moving kept whatever
    // heading it arrived with, so you could be swinging at something directly
    // behind you. Striking is as much a direction as walking is, and it
    // OVERRIDES: the blow is the more recent intent.
    const TURN = 14;                              // radians per second
    const struck = _g.facingAt;
    const ph = struck !== null
      ? headingOf(struck.x - _g.player.ax, struck.y - _g.player.ay)
      : headingOf(_g.player.x - _g.player.ax, _g.player.y - _g.player.ay);
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
      const quarry = _g.strikeAfterTravel;
      const inReach = (): boolean => quarry !== null && quarry.alive
        && distanceTo(_g.player, quarry) <= _g.genome.reach(_g.dungeon.depth);

      if (quarry) {
        // Reach is checked BEFORE the step and again AFTER it. Checking only
        // before meant arriving adjacent on the final node and then giving up,
        // because the next tick had no node left and the re-path returned a
        // length-1 path from where the player already stood.
        if (inReach()) {
          _g.attack(quarry);
          _g.walk = null;
          _g.strikeAfterTravel = null;
          _g.chaseLegs = 0;
          _g.exploring = false;
        } else if (n && (!blocker || blocker === quarry) && _g.step(n.x, n.y)) {
          if (inReach()) {
            _g.attack(quarry);
            _g.walk = null;
            _g.strikeAfterTravel = null;
            _g.chaseLegs = 0;
          }
        } else {
          // The quarry moves while you cross the room, so the path runs out
          // where it no longer is. Re-path to where it actually went.
          _g.chaseLegs += 1;
          const again = _g.chaseLegs <= 6 && quarry.alive
            && isVisible(_g.level.sight, quarry.x, quarry.y)
            ? findPath(_g.level.grid, { x: _g.player.x, y: _g.player.y },
                       { x: quarry.x, y: quarry.y },
                       { diagonal: _g.settings.diagonal })
            : null;
          if (again && again.length > 1) {
            _g.walk = { nodes: again, i: 0 };
          } else {
            _g.walk = null;
            _g.strikeAfterTravel = null;
            if (quarry.alive && _g.chaseLegs > 6) _g.note("It keeps ahead of you.");
          }
        }
      } else if (!n || blocker || !_g.step(n.x, n.y)) {
        _g.walk = null;
      }
    } else if (_g.exploring && at && !_g.walk && !_g.showPlasmid) {
      // Something in view halts it, not just something ARRIVING in view: a
      // creature already visible when you press the button would otherwise be
      // walked straight past.
      const seen = t_visibleHostile(_g);
      if (seen) {
        _g.exploring = false;
        const btn = _g.buttons.find((b) => b.id === "explore");
        if (btn) btn.active = false;
        _g.note(`You stop. A ${seen.name} is in view.`);
      } else {
        t_exploreStep(_g);
      }
    }

    _g.draw();
  }

export function t_step(_g: Game, x: number, y: number): boolean {
  if (_g.dead) return false;
  _g.trace.push(_g.clock.turn, "move",
                `to ${String(x)},${String(y)} from ${String(_g.player.x)},${String(_g.player.y)}`);
    const m = _g.dungeon.mobAt(x, y, _g.level);
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
    // Moving is a newer intent than the last blow.
    _g.facingAt = null;
    _g.look();

    if (_g.intro && labStation(_g, x, y)) return true;
    _g.onTile(x, y);
    _g.mobTurn();
    return true;
  }

export function t_attack(_g: Game, m: Mob): void {
  if (_g.dead) return;             // a lost strain does not act
    // Turn to face it. Held until the next move, so the swing and the
    // recovery both point the right way rather than snapping back.
    _g.facingAt = { x: m.x, y: m.y };
    const dmg = Math.max(Math.round(_g.atk()), 1);
    _g.trace.push(_g.clock.turn, "attack",
                  `${m.name} for ${String(dmg)} (had ${String(m.hp)})`);
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
    _g.fx.add({ kind: "text", t0: now + 60, dur: 900, x: m.x, y: m.y,
                  text: String(dmg), colour: dmg >= 8 ? "#ffd24a" : "#ffe8c0" });
    _g.fx.shake(Math.min(2 + dmg * 0.35, 7), 190, now);
    _g.fx.hitstop(28, now);

    m.hp = Math.max(m.hp - dmg, 0);
    if (m.hp > 0) _g.note(say.hitLine(m.name, dmg, false, _g.turnSeed + dmg));
    if (m.hp <= 0) {
      m.alive = false;
      // Fighting used to advance nothing: only the FIRST kill of a species
      // counted, as cataloguing. See strain.ts -- the term saturates, so
      // this rewards fighting without rewarding grinding.
      _g.run.killed += 1;
      // Only on a BOSS floor, and only once.
      //
      // `isCleared` answers "is the seal holding", and on a floor with no seal
      // it is trivially true -- so this fired on every elite kill on every
      // floor, announcing that a way down had opened which had never been
      // shut. `cleared` was declared on Level and never read or written by
      // anything; it latches the transition now, which is what it was for.
      if (m.elite && _g.level.boss && !_g.level.cleared
          && Dungeon.isCleared(_g.level)) {
        _g.level.cleared = true;
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
      // Prefer what you do NOT have, but never go dry.
      //
      // This used to drop only unowned genes, so an organism stopped giving
      // anything once you held its three-to-twelve loci -- and the commonest
      // species on a floor went silent first. Stacking then made a duplicate
      // valuable in its own right: a spare for a second operon, or a better
      // roll to swap in. The filter was written before that and turned away
      // exactly the drops stacking exists to accept.
      // THREE tiers, not two. The comment above describes stacking correctly
      // and the code did not follow it: a gene you hold one of can still take
      // two more -- a spare for a second operon, or a better roll to swap in --
      // and it was being scored as waste alongside a full stack.
      //
      // Measured before this: a floor whose species you had fully sampled fell
      // from 80% to 35% a kill, which is what "genes stop dropping" felt like.
      const room = (g: bio.GeneId): boolean => {
        const held = _g.genome.bin.find(
          (p) => p.kind === "gene" && p.id === g);
        return held === undefined || countOf(held) < MAX_STACK;
      };
      const fresh = m.genes.filter(
        (g) => !_g.genome.has(g) && !_g.genome.inBin(g));
      const stackable = m.genes.filter((g) => !fresh.includes(g) && room(g));
      const pool = fresh.length > 0 ? fresh
        : stackable.length > 0 ? stackable
        : m.genes;
      const gene = pool[rng.int(Math.max(pool.length, 1))];
      // An elite has been dividing on the substrate longer, so it carries more
      // of it. This is the reason to fight one rather than walk past.
      const strain = m.elite ? m.eliteStrain : undefined;
      const bonus = strain !== undefined && strain in ELITES
        ? ELITES[strain as EliteStrain].loot : 0;
      // A discovery, then a spare, then a copy you cannot hold. Only the last
      // is genuinely near-worthless, and only that one is rare.
      const chance = fresh.length > 0 ? 0.8
        : stackable.length > 0 ? 0.6
        : 0.2;
      if (gene !== undefined && rng.next() < chance) {
        loot.push({ kind: "cassette", gene, allele: rollAllele(rng, _g.dungeon.depth) });
      }
      // Extra cassettes for an elite, rolled at depth like any other. A
      // second copy of something you hold now STACKS rather than being wasted,
      // which is what makes this a reward and not a consolation.
      for (let i = 0; i < bonus; i++) {
        const extra = m.genes[rng.int(m.genes.length)];
        if (extra !== undefined) {
          loot.push({ kind: "cassette", gene: extra,
                      allele: rollAllele(rng, _g.dungeon.depth) });
        }
      }


      const subs = substratesAt(_g.dungeon.depth);
      const n = 1 + rng.int(2) + (m.elite ? 1 : 0);
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



/** Start or stop exploring. */
/** Anything alive and currently lit. Exploring with one of these in view is
 *  how you walk into a fight without meaning to. */

export function t_explore(_g: Game): void {
  if (_g.dead) return;
  const seen = t_visibleHostile(_g);
  if (seen && !_g.exploring) {
    _g.note(`Not while a ${seen.name} is in view.`);
    return;
  }
  _g.exploring = !_g.exploring;
  const btn = _g.buttons.find((b) => b.id === "explore");
  if (btn) btn.active = _g.exploring;
  if (!_g.exploring) { _g.walk = null; _g.note("Exploration halted."); return; }
  _g.target = null;
  _g.autoAttack = false;
  _g.strikeAfterTravel = null;
  t_exploreStep(_g);
}
