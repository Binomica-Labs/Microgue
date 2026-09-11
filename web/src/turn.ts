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

export { t_acquire, t_catabolise, t_die, t_expand, t_research, t_win }
  from "./progress.js";


export function t_descend(_g: Game): void {
  if (_g.dead) return;             // a lost strain does not act
  //  is the lab floor but  is NOT -- separate objects -- so
  // this moved the dungeon and dropped the researcher into D1 with no class.
  if (_g.intro) { _g.note("Not from here. The column is on the bench."); return; }
  _g.trace.push(_g.clock.turn, "floor", `descend from F${String(_g.dungeon.floor)}`);
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
  if (_g.intro) { _g.note("Not from here. The column is on the bench."); return; }
    const r = _g.dungeon.ascend();
    if ("err" in r) { _g.note(r.err); return; }
    _g.enter(r.level, r.arrive);
  }


export function t_onTile(_g: Game, x: number, y: number): void {
  if (_g.dead) return;             // a lost strain does not act
    const room = roomAt(_g.level.rooms, x, y);
    if (room && room !== _g.inRoom) {
      _g.inRoom = room;
      // A relict says WHICH layer it is, because that is the whole reason to
      // break into one: it tells you what metabolism you are about to be
      // handed, several strata out of place.
      const where = room.kind === "relict" && room.from !== undefined
        ? ` This came from the ${bio.STRATA[
            Math.min(Math.max(room.from - 1, 0), bio.STRATA.length - 1)
          ]?.name ?? "column above"}.`
        : "";
      _g.note(`${ROOM_STYLE[room.kind].name}. ${ROOM_STYLE[room.kind].note}${where}`);
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
    // A symbiont is picked up whole and REPLACES any held one -- a cell houses
    // one endosymbiont, and taking a second expels the first.
    if (it.kind === "symbiont") {
      const old = _g.genome.symbiont;
      _g.genome.symbiont = it.id;    // the setter invalidates the caches
      _g.note(old !== null
        ? `${SYMBIONTS[it.id].name} takes hold; the ${SYMBIONTS[old].name} is expelled.`
        : `${SYMBIONTS[it.id].name} takes hold. ${SYMBIONTS[it.id].note}`);
      _g.trace.push(_g.clock.turn, "build", `symbiont ${it.id}`);
      return true;
    }
    if (it.kind === "cassette") {
      const part: Part = { kind: "gene", id: it.gene, level: 1, mods: [],
                           allele: it.allele };
      // A copy you cannot hold is not a refusal, it is a CHOICE: the thing on
      // the floor is still DNA, and eating it is a real option.
      //
      // That was true of a full STACK and not of a full BIN, which just said
      // no -- so a full bin turned every cassette on the floor into litter you
      // had to walk past, when catabolising it is exactly what a cell would
      // do. Same offer, same reasons, different cause.
      const stackFull = fullStackIndex(_g.genome.bin, part) >= 0
        && stackIndex(_g.genome.bin, part) < 0;
      const binFull = _g.genome.bin.length >= BIN_CAP
        && stackIndex(_g.genome.bin, part) < 0;
      if (stackFull || binFull) {
        _g.offer = { part, at: { x: _g.player.x, y: _g.player.y } };
        _g.note(stackFull
          ? `Already carrying ${String(MAX_STACK)} of `
            + `${bio.GENES[it.gene].name}. Catabolise this one, or leave it.`
          : `No room for ${bio.GENES[it.gene].name}. Catabolise it, or leave it.`);
        return false;
      }
      const r = _g.genome.stash(part);
      if (!r.ok) { _g.toasts.push(r.err, "warn", _g.now); return false; }
      recordLocus(_g.run, it.gene);
      const held = _g.genome.bin.find((p) => stacks(p, part));
      const n = held ? countOf(held) : 1;
      _g.note(say.pickupLine(it, 0, null)
        + (n > 1 ? ` You now hold ${String(n)}.` : ""));
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
    const mob = _g.dungeon.mobAt(x, y, _g.level);
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
export { t_eatOffered, t_declineOffered } from "./offer.js";

import { tickSecretions } from "./cast.js";
import type { Intent } from "./combat.js";

/** How each posture is shown. The word floats; the line goes to the log. */
const INTENT_WORD: Readonly<Record<Intent, string>> = {
  flees: "flees", circles: "circles", springs: "springs!", latches: "latches",
  encircles: "encircles", presses: "presses",
};
const INTENT_LINE: Readonly<Record<Intent, string>> = {
  flees: "breaks off, hurt.", circles: "circles you, looking for an opening.",
  springs: "springs from stillness!", latches: "latches on. It will not let go.",
  encircles: "moves to encircle you.", presses: "presses in.",
};
const INTENT_COLOUR: Readonly<Record<Intent, string>> = {
  flees: "#8fd8c0", circles: "#ffd166", springs: "#ff6b6b", latches: "#e08a5a",
  encircles: "#c9a3ff", presses: "#ffd166",
};
import { isBiofilm } from "./biofilm.js";
import { SYMBIONTS } from "./symbiont.js";
import { CONDITIONS } from "./conditions.js";
import * as bio from "./biology.js";
import * as say from "./flavour.js";
import { BARRIERS, barrierAt } from "./barrier.js";
import { Dungeon } from "./dungeon.js";
import { isSeen, isVisible } from "./fov.js";
import { isNight } from "./cycle.js";
import { firstViolation, type WorldView } from "./invariants.js";
import { MODIFIERS, RARITY } from "./parts.js";
import { dropAt, itemName, removeDrop, yieldOf, type Item } from "./items.js";
import { ROOM_STYLE, roomAt } from "./rooms.js";
import { STATUS, apply as applyStatus, tick as tickStatus } from "./status.js";
import { WEAPONS } from "./weapons.js";
import { microbeTurn } from "./combat.js";
import { nextAction, type Action } from "./pursuit.js";
import { stepClouds, stepPackets } from "./projectile.js";
import { makeRng } from "./rng.js";
import { recordLocus } from "./run.js";
import { findPath } from "./path.js";
import { nextExplore, unexplored } from "./explore.js";
export { t_look, t_visibleHostile } from "./sight.js";
import { MAX_STACK, countOf, fullStackIndex, stackIndex, stacks }
  from "./stack.js";


import { BIN_CAP } from "./plasmid.js";
import type { Part } from "./plasmid.js";
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
  // A cold-shock surge halves incoming damage while it lasts. Applied here so
  // every damage source -- melee, status, hazard, your own sulfide -- goes
  // through it.
  const surged = _g.surge && _g.surge.until > _g.clock.turn
    ? amount * _g.surge.armour : amount;
  const dmg0 = Math.max(Math.round(Number.isFinite(surged) ? surged : 0), 0);
  if (dmg0 > 0) {
    _g.trace.push(_g.clock.turn, "hurt",
                  `${cause} for ${String(dmg0)}; hp ${String(_g.player.hp)} -> ` +
                  String(Math.max(_g.player.hp - dmg0, 0)));
  }
  const dmg = dmg0;
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
      // How threatening the strain is at this depth: its power against a
      // reference that rises with depth, clamped to 0..1. Reactive predators
      // press a weak cell and circle a strong one. The reference (2 + depth) is
      // the rough power a floor expects you to bring; below it you are prey.
      threat: Math.min(_g.genome.power(_g.dungeon.depth)
        / (2 + _g.dungeon.depth), 1),
      mobSpeed: CONDITIONS[_g.run.condition].mobSpeed,
      mired: (x, y) => isBiofilm(_g.biofilm, _g.dungeon.floor, x, y),
      packets: _g.packets,
      clouds: _g.clouds,
    });

    // Secreted enzymes bite whatever ended its move on them, then expire.
    tickSecretions(_g);

    // Particles fly and gradients decay after the microbes have acted, so a
    // shot fired this turn does not also land this turn.
    const arm = _g.genome.armour(_g.dungeon.depth);
    for (const h of stepPackets(_g.packets, _g.level.grid, _g.player,
                                (x, y) => _g.dungeon.mobAt(x, y, _g.level) !== undefined)) {
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
      } else if (e.kind === "intent" && e.intent) {
        // A posture change, said once: the reactive AI is only interesting if
        // you can READ it. A floating word over the mob and a log line.
        const word = INTENT_WORD[e.intent];
        const visible = isVisible(_g.level.sight, e.mob.x, e.mob.y);
        if (visible) {
          _g.fx.add({ kind: "text", t0: _g.now, dur: 900, x: e.mob.x, y: e.mob.y,
                      text: word, colour: INTENT_COLOUR[e.intent] });
          _g.note(`The ${e.mob.name} ${INTENT_LINE[e.intent]}`);
        }
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
      } else if (e.kind === "died") {
        // A status the player applied finished it. Counted here rather than in
        // combat.ts, which is pure and has no run to write to.
        _g.run.killed += 1;
        _g.trace.push(_g.clock.turn, "attack", `${e.mob.name} succumbed`);
      } else if (e.kind === "status" && e.status) {
        _g.note(`${e.mob.name}: ${STATUS[e.status].name}.`);
        _g.fx.add({ kind: "ring", t0: _g.now, dur: 420, x: _g.player.x,
                      y: _g.player.y, colour: "#c8a0ff", r: 1.2 });
      }
    }

    // The player's own afflictions resolve here too.
    //
    // The cause is read BEFORE ticking. `tickStatus` removes what has expired,
    // so a status that killed you on its last turn was already gone by the
    // time it was named -- every such death read "killed by an affliction".
    const causes = _g.player.status.map((s) => STATUS[s.id].name);
    const selfDmg = tickStatus(_g.player.status);
    if (selfDmg > 0) {
      const cause = causes.length > 0 ? causes.join(" and ") : "an affliction";
      _g.trace.push(_g.clock.turn, "status",
                    `${cause} deals ${String(selfDmg)}; hp ${String(_g.player.hp)}`);
      hurt(_g, selfDmg, cause);
      _g.fx.add({ kind: "text", t0: _g.now, dur: 700, x: _g.player.x,
                    y: _g.player.y, text: `-${selfDmg}`, colour: "#c8a0ff" });
    }

    if (_g.player.hp <= 0) _g.die();
    _g.audit();
    _g.save();
  }

export { t_attack, t_explore, t_step, t_step_, t_upkeep }
  from "./actions.js";



