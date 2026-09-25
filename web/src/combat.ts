// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Combat and the microbe turn, lifted out of main.ts.
//
// Everything here takes its world explicitly rather than reaching for game
// state, which is what makes it testable without a canvas.

import { biteScale, chaseLimit, hunts, senseScale } from "./quorum.js";
import { divides, partition } from "./fission.js";
import { ageAgenda, agendaStep, newAgenda } from "./agenda.js";
import { canStrike, chebyshev, decideStep, senseRange, SIZES } from "./behaviour.js";
import { speedOf, tick as speedTick } from "./speed.js";
import { covers, tilesOf } from "./footprint.js";
import { AnchorIndex, BodyIndex } from "./bodies.js";
import type { Mob } from "./dungeon.js";
import type { Grid, Point } from "./mapgen.js";
import type { Rng } from "./rng.js";
import { apply, haste, tick, type Status, type StatusId } from "./status.js";
import { WEAPONS, lineOfSight } from "./weapons.js";
import { launch, type Cloud, type Packet } from "./projectile.js";

export interface Target {
  x: number; y: number;
  hp: number;
  status: Status[];
}

export interface TurnWorld {
  readonly grid: Grid;
  readonly mobs: Mob[];
  readonly player: Target;
  readonly rng: Rng;
  /** Incoming damage multiplier from the player's armour complexes. */
  readonly armour: number;
  /** How threatening the player is, 0..1: their expressed power against what a
   *  cell at this depth expects. Reactive behaviours read it -- a predator
   *  presses a weak strain and circles a strong one. */
  readonly threat: number;
  /** Mob action-speed multiplier from the run condition, x1 neutral. */
  readonly mobSpeed: number;
  /** Floor drops, so a forager can walk a gradient toward substrate.
   *  Optional: a caller that does not supply them gets patrol-style
   *  wandering, which is a graceful degradation, not a bug. */
  readonly drops?: readonly { x: number; y: number }[];
  /** Per-turn fission chance; a bloom raises it. See fission.ts. */
  readonly fissionChance?: number;
  /** Tiles a wandering mob must not settle on -- the stairs. */
  readonly stairs?: readonly { x: number; y: number }[];
  /** How many mobs this floor generated with, for the relative growth cap.
   *  Absent means "use the current count", which makes the first turn on a
   *  floor the baseline -- fine for a caller that does not track it. */
  readonly founding?: number;
  /** Floor-wide quorum signal, 0..1. Widens senses, stops disengagement and
   *  sharpens bites as it rises. See quorum.ts. */
  readonly quorum?: number;
  /** Whether a tile is biofilm: a mob stepping onto one is mired and forfeits
   *  the rest of its move. */
  readonly mired: (x: number, y: number) => boolean;
  /** Travelling particles and lingering gradients, mutated in place. */
  readonly packets: Packet[];
  readonly clouds: Cloud[];
}

export interface TurnEvent {
  /**
   * `died` is reported so the CALLER can count it.
   *
   * A microbe finished off by a status the player applied -- poison, oxidative
   * stress -- died in here and nothing outside ever knew. The kill counter
   * only saw the melee path, so a build that wins by poisoning things earned
   * no adaptation from any of its kills.
   */
  readonly kind: "strike" | "move" | "status" | "charge" | "fire" | "died"
    | "intent" | "divide";
  readonly mob: Mob;
  readonly dmg?: number;
  readonly status?: StatusId;
  readonly weapon?: string;
  readonly at?: { x: number; y: number };
  /** For `intent`: what the mob just decided to do. A posture CHANGE, not
   *  every step -- fleeing, circling, springing, latching. The reactive AI
   *  was invisible without it: a mob circling and a mob charging both read
   *  as "a mob moving". */
  readonly intent?: Intent;
}

export type Intent = "flees" | "circles" | "springs" | "latches" | "encircles"
  | "presses";

/** Which status a microbe inflicts, if any. Grounded in what it actually
 *  produces: Thiobacillus makes sulfuric acid, sulfate reducers exhale H2S,
 *  cyanobacteria evolve oxygen. */
const INFLICTS: Readonly<Record<string, StatusId>> = {
  thiobacillus: "acid",
  desulfovibrio: "sulfide",
  desulfobacter: "sulfide",
  synechococcus: "oxidative",
  nitzschia: "oxidative",
};

/** Footprint-aware: a filament blocks three tiles, not one. */
export function occupiedBy(mobs: readonly Mob[], x: number, y: number): boolean {
  return mobs.some((m) => m.alive
    && covers(SIZES[m.size].footprint, m.x, m.y, m.heading, x, y));
}

/** One microbe turn for the whole level. Returns what happened, so the caller
 *  can attach effects without this module knowing anything about rendering. */
export function microbeTurn(w: TurnWorld): TurnEvent[] {
  const events: TurnEvent[] = [];
  const born: Mob[] = [];
  const alive = w.mobs.filter((o) => o.alive).length;
  // Every body on the floor, indexed by tile, and kept current as they move,
  // die and divide below. See bodies.ts: the occupancy scan it replaces was
  // the entire cost of a turn.
  const idx = new BodyIndex(w.grid.w, w.grid.h);
  // ...and every living cell by where it is anchored, for the kin and ally
  // counts. `order` is its place in the turn -- daughters after everyone --
  // so a list rebuilt from the buckets comes back in the order the scan
  // produced, and the swarm's float sums do not shift.
  const near = new AnchorIndex<Mob>(w.grid.w, w.grid.h);
  const order = new Map<Mob, number>();
  w.mobs.forEach((o, i) => {
    order.set(o, i);
    if (!o.alive) return;
    idx.add(SIZES[o.size].footprint, o.x, o.y, o.heading);
    near.add(o.x, o.y, o);
  });
  const moveTo = (o: Mob, x: number, y: number, heading: number): void => {
    const f = SIZES[o.size].footprint;
    idx.remove(f, o.x, o.y, o.heading);
    near.remove(o.x, o.y, o);
    o.heading = heading;
    o.x = x; o.y = y;
    idx.add(f, o.x, o.y, o.heading);
    near.add(o.x, o.y, o);
  };

  for (const m of w.mobs) {
    if (!m.alive) continue;

    // Binary fission: the thing a bacterium is actually for. A well-fed,
    // undamaged, undisturbed cell with room DOUBLES. Collected into `born`
    // and appended after the loop -- pushing into `w.mobs` while iterating
    // it would give the daughter a turn on the turn it was born.
    // "Turns since it last took damage", measured HERE rather than reset at
    // each damage site: five paths hurt a mob (the strike, the aura, three
    // casts) and none of them reset it, so "not while being hit" never held.
    // Comparing against last turn's hp catches every one, and any added later.
    m.calm = m.hp < (m.seenHp ?? m.hp) ? 0 : (m.calm ?? 0) + 1;
    // Regrowth. Fission needs a whole cell and leaves two halves, and nothing
    // ever healed a mob -- so every cell on a floor divided exactly once,
    // ever, and a cleared room never refilled. An undisturbed cell grows back,
    // about forty turns from half to whole. GROWTH_CAP still bounds the floor.
    if (m.calm >= REGROW_AFTER && m.calm % 4 === 0 && m.hp < m.maxhp) {
      m.hp = Math.min(m.hp + Math.max(Math.round(m.maxhp * 0.1), 1), m.maxhp);
    }
    // Kin within two tiles: the contact-inhibition term. Counted here
    // rather than in fission.ts because it needs the world.
    let kin = 0;
    near.near(m.x, m.y, 2, (o) => {
      if (o !== m && o.id === m.id && chebyshev(o.x, o.y, m.x, m.y) <= 2) kin++;
    });
    // Never an elite. `{ ...m }` copies `elite`, the name and the grown
    // stats, so a boss that divided left a second boss holding the floor's
    // gate shut, and an elite floor gained elites (and their loot) the
    // promotion count never allowed.
    if (!m.elite && divides(m.hp, m.maxhp,
                { population: alive + born.length, founding: w.founding ?? alive,
                  calm: m.calm, kin },
                w.rng, w.fissionChance ?? undefined)) {
      const spot = freeNeighbour(m, w, born, idx);
      if (spot) {
        const share = partition(m.maxhp);
        m.hp = share.parent;
        m.calm = 0;
        // A fresh agenda, not the parent's: two daughters that behave
        // identically read as a duplication glitch rather than as life.
        const d: Mob = { ...m, uid: daughterUid(w, born), x: spot.x, y: spot.y,
                         ax: spot.x, ay: spot.y, hp: share.daughter,
                         calm: 0, seenHp: share.daughter, banked: 0, status: [],
                         agenda: newAgenda(m.behaviour, w.rng) };
        order.set(d, w.mobs.length + born.length);
        born.push(d);
        idx.add(SIZES[d.size].footprint, d.x, d.y, d.heading);
        near.add(d.x, d.y, d);
        events.push({ kind: "divide", mob: m, at: spot });
      }
    }
    m.seenHp = m.hp;

    // Status effects resolve first: a poisoned microbe still takes damage.
    const selfDmg = tick(m.status);
    if (selfDmg > 0) {
      m.hp = Math.max(m.hp - selfDmg, 0);
      if (m.hp <= 0) {
        m.alive = false;
        idx.remove(SIZES[m.size].footprint, m.x, m.y, m.heading);
        near.remove(m.x, m.y, m);
        events.push({ kind: "died", mob: m });
        continue;
      }
    }

    // Sensing and the boredom clocks run BEFORE the cooldown gate. After it,
    // a body that acts every other turn aged them at half speed, so a
    // filament chased for twenty turns and sulked for eighty.
    // Distance from the NEAREST tile of the body: a three-tile filament can
    // reach you from either end.
    const fp = SIZES[m.size].footprint;
    let dist = Infinity;
    for (const t of tilesOf(fp, m.x, m.y, m.heading)) {
      dist = Math.min(dist, chebyshev(t.x, t.y, w.player.x, w.player.y));
    }
    // Out of sense range, a mob used to be SKIPPED entirely -- it did not
    // move, did not age its agenda, did nothing at all until the player
    // walked close enough. That is the freeze the agenda layer exists to
    // fix, and it sits upstream of every behaviour, so wiring agendas into
    // `decideStep`'s null case alone changed nothing.
    //
    // Now an unaware mob takes its own turn: it lives its life (forage,
    // patrol, rest, divide) and skips only the combat half.
    // SENSORY ADAPTATION. Mobs latched on and never let go: a wandering
    // cell drifted into sense range, switched to pursuit, and pursued
    // forever. Measured, a walking player collected thirteen followers over
    // six hundred turns and kept six of them -- the floor emptied itself
    // into a knot around whoever was moving. Diffusion in, directed pursuit
    // that never releases, is a ratchet.
    //
    // Real chemotaxis adapts: receptors methylate and a cell stops
    // responding to a signal it cannot resolve. A mob that has chased
    // fruitlessly for CHASE_LIMIT turns loses interest and goes back to its
    // own life for BORED_TURNS, during which it does not sense the player at
    // all. Landing a hit resets the clock -- something that is actually
    // catching you has no reason to give up.
    m.bored = Math.max((m.bored ?? 0) - 1, 0);
    // Sense range widens with the floor's alarm: a roused population is
    // looking for you, and at `alarmed` it does not stop looking.
    const q = w.quorum ?? 0;
    const reach = senseRange(m.behaviour) * senseScale(q);
    const senses = dist <= reach || m.behaviour === "sessile";
    // Not a sessile cell: it cannot chase, so it cannot chase fruitlessly.
    // It "senses" from anywhere so it strikes whatever comes adjacent, and
    // that made it bored after ten turns of you being elsewhere on the floor
    // -- then passive for forty while you stood next to it.
    if (senses && m.bored === 0 && m.behaviour !== "sessile") {
      m.chase = (m.chase ?? 0) + 1;
      if (m.chase > chaseLimit(q, CHASE_LIMIT)) {
        m.bored = BORED_TURNS;
        m.chase = 0;
        // ...and it LEAVES. Simply not chasing was not enough: a bored mob
        // fell back on an agenda that wanders near wherever it already is,
        // so it milled about the player anyway and the knot kept growing
        // (nine followers instead of six). A cell that has given up on a
        // gradient swims away from it. Point the agenda at somewhere far
        // on the far side, so disengaging actually disperses the floor.
        const ax = m.x - w.player.x, ay = m.y - w.player.y;
        const len = Math.hypot(ax, ay) || 1;
        const tx = Math.round(m.x + (ax / len) * 16);
        const ty = Math.round(m.y + (ay / len) * 16);
        m.agenda = { kind: "patrol",
                     target: w.grid.isFloor(tx, ty) ? { x: tx, y: ty } : null,
                     ttl: BORED_TURNS };
      }
    } else if (!senses) {
      m.chase = 0;
    }
    // Large bodies act less often, and impaired ones less still.
    if (m.cooldown > 0) { m.cooldown -= 1; continue; }
    m.cooldown = Math.round(SIZES[m.size].cooldown / haste(m.status));

    const aware = senses && m.bored === 0;
    if (!aware) {
      const budget = { banked: m.banked ?? 0 };
      const steps = speedTick(budget,
        speedOf(m.behaviour, m.size) * w.mobSpeed, haste(m.status));
      m.banked = budget.banked;
      const occupied = occupancy(w, m, born, idx);
      for (let s = 0; s < steps; s++) {
        const act = agendaMove(m, w, occupied, fp);
        if (!act) break;
        moveTo(m, act.x, act.y, Math.atan2(act.y - m.y, act.x - m.x));
        events.push({ kind: "move", mob: m });
      }
      continue;
    }

    // Ranged weapons resolve before contact. A speargun winds up first, and
    // that wind-up is the only warning you get.
    const weapon = WEAPONS[m.weapon];
    // Readiness is sampled BEFORE the decrement. Decrementing first made a
    // cooldown of 1 gate nothing at all: the counter dropped to zero and the
    // very same turn passed the check.
    const ready = m.reload <= 0;
    if (m.reload > 0) m.reload -= 1;

    if (weapon.kind !== "melee" && ready && dist <= weapon.range) {
      const clear = weapon.kind === "cloud" || lineOfSight(
        m.x, m.y, w.player.x, w.player.y, (x, y) => w.grid.isWall(x, y));

      if (clear) {
        if (m.charging < weapon.windup) {
          m.charging += 1;
          m.chase = 0;        // winding up a shot at you is not giving up
          events.push({ kind: "charge", mob: m, weapon: weapon.name });
          continue;
        }
        m.charging = 0;
        m.reload = weapon.cooldown;
        // A hit at range resets the clock like a hit in contact. Only the
        // melee path did, so a gunner gave up while it was hitting you.
        m.chase = 0;
        const raw = Math.max(Math.round(m.atk * weapon.power), 1);

        if (weapon.kind === "packet") {
          w.packets.push(launch({ x: m.x, y: m.y }, { x: w.player.x, y: w.player.y },
                                raw, weapon.inflicts, m.pigment));
        } else if (weapon.kind === "cloud") {
          w.clouds.push({
            cx: w.player.x, cy: w.player.y, radius: weapon.radius, dmg: raw,
            ttl: weapon.persist, inflicts: weapon.inflicts, colour: m.pigment,
          });
        }
        // Direct hits (bolt, spear) land now and say how hard. Without `dmg`
        // the log line read "for 0" and the caller could not blame the mob.
        let direct: number | undefined;
        if (weapon.kind !== "packet" && weapon.kind !== "cloud") {
          direct = Math.max(Math.round(raw * w.armour), 1);
          w.player.hp = Math.max(w.player.hp - direct, 0);
          if (weapon.inflicts) apply(w.player.status, weapon.inflicts, 4, 1);
        }
        events.push({ kind: "fire", mob: m, weapon: weapon.name,
                      at: { x: w.player.x, y: w.player.y },
                      ...(direct !== undefined ? { dmg: direct } : {}) });
        continue;
      }
    }
    if (m.charging > 0 && dist > weapon.range) m.charging = 0;   // lost the shot

    if (weapon.kind === "melee" && canStrike(m.behaviour, m.size, dist)) {
      // 0.35 made the first stratum survivable for fifty consecutive hits,
      // which is no threat at all. Tuned against the whole 24-floor curve.
      const dmg = Math.max(
        Math.round(m.atk * 0.55 * w.armour * biteScale(w.quorum ?? 0)), 1);
      w.player.hp = Math.max(w.player.hp - dmg, 0);
      events.push({ kind: "strike", mob: m, dmg });
      m.chase = 0;            // it is catching you; no reason to give up

      const inflict = INFLICTS[m.id];
      if (inflict !== undefined && w.rng.next() < 0.35) {
        apply(w.player.status, inflict, 4, 1);
        events.push({ kind: "status", mob: m, status: inflict });
      }
      continue;
    }

    // Movement budget. A flagellated chaser genuinely acts more often than a
    // gliding filament rather than lurching two tiles at once, because the
    // fractional remainder carries across turns.
    const budget = { banked: m.banked ?? 0 };
    // The condition scales every mob's pace: a cold snap slows the column, a
    // bloom quickens it.
    const steps = speedTick(budget,
      speedOf(m.behaviour, m.size) * w.mobSpeed, haste(m.status));
    m.banked = budget.banked;

    // Living cells already on the floor, not this turn's daughters.
    const allyList: Mob[] = [];
    near.near(m.x, m.y, 3, (o) => {
      if (o !== m && o.id === m.id && (order.get(o) ?? 0) < w.mobs.length
          && chebyshev(o.x, o.y, m.x, m.y) <= 3) allyList.push(o);
    });
    allyList.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const allies = allyList.length;
    // One occupancy test, shared by the combat decision and the agenda --
    // two copies would drift and a mob would walk through another.
    // Pending daughters count as occupants: they are on the floor from the
    // moment they are born, but they are not in `w.mobs` until the loop
    // ends. Without them here, a cell that moved later in the same turn
    // walked straight onto a newborn.
    const occupied = occupancy(w, m, born, idx);
    for (let s = 0; s < steps; s++) {
    const step = decideStep(
      m.behaviour, { x: m.x, y: m.y },
      { px: w.player.x, py: w.player.y, dist, alliesNear: allies,
        hpFrac: m.maxhp > 0 ? m.hp / m.maxhp : 1, threat: w.threat,
        allyAt: allyList.map((o) => ({ x: o.x, y: o.y })) },
      w.grid, w.rng,
      occupied,
      fp);

    // Combat first, agenda second. If nothing about the player moved this
    // cell, it goes back to its own life -- foraging, patrolling, resting,
    // looking for room to divide. Six behaviours used to return null here
    // and simply FREEZE until the player came back, which is a monster
    // waiting for a hero rather than an organism. See agenda.ts.
    const act = step ?? agendaMove(m, w, occupied, fp);

    if (!act) break;
    // Read the posture off the step: closing, holding distance, or opening.
    const dBefore = chebyshev(m.x, m.y, w.player.x, w.player.y);
    const dAfter = chebyshev(act.x, act.y, w.player.x, w.player.y);
    // Only a COMBAT step has a posture worth announcing. A cell wandering
    // toward a substrate patch is not "circling you".
    const intent = step ? intentOf(m, dBefore, dAfter) : null;
    moveTo(m, act.x, act.y, Math.atan2(act.y - m.y, act.x - m.x));
    events.push({ kind: "move", mob: m });
    if (intent !== null && intent !== m.lastIntent) {
      m.lastIntent = intent;
      events.push({ kind: "intent", mob: m, intent });
    }
    // Biofilm mires: a mob that steps onto a claimed tile forfeits the rest of
    // its move this turn -- the matrix traps what swims into it. This is what
    // makes a biofilm pocket defensible against the reactive pursuers.
    if (w.mired(m.x, m.y)) break;
    }
  }

  for (const d of born) w.mobs.push(d);
  return events;
}

/**
 * A uid for a daughter that cannot collide with any live mob's.
 *
 * The dungeon's own counter is not reachable here and a duplicate uid is
 * not cosmetic -- lunge offsets, life phase and the intent memo are all
 * keyed by it, so two cells sharing one would animate as a single organism.
 */
function daughterUid(w: TurnWorld, born: readonly Mob[]): number {
  // max+1 over the LIVING mobs is not enough: the dungeon keeps its own
  // counter and will issue that number later for a spawn, and a dead mob's
  // uid is still referenced by effects in flight. Daughters take a separate
  // high range that the dungeon's sequential counter cannot reach in a run.
  // ...and `born` must be counted too: daughters are appended AFTER the
  // loop, so two divisions in one turn both saw the same max and took the
  // same uid.
  let max = DAUGHTER_BASE;
  for (const o of w.mobs) if (o.uid >= DAUGHTER_BASE) max = Math.max(max, o.uid);
  for (const o of born) if (o.uid >= DAUGHTER_BASE) max = Math.max(max, o.uid);
  return max + 1;
}

/** Where daughter uids start. The dungeon issues from 1 upward and a floor
 *  holds a few hundred mobs, so this is unreachable by that counter. */
const DAUGHTER_BASE = 1_000_000;

/** Turns of FRUITLESS pursuit before a mob loses interest. A mob that lands
 *  a hit resets this, so a real fight is never interrupted -- this only ever
 *  fires on something that cannot reach you. Tuned by measurement: 26 left
 *  three followers crowding the player, 10 leaves two. */
const CHASE_LIMIT = 10;

/** How long it stays disengaged. Long enough to actually lose you. */
const BORED_TURNS = 40;
/** Calm turns before a split or wounded cell starts to grow back. Matches the
 *  calm fission itself asks for. */
const REGROW_AFTER = 6;

/**
 * A free tile beside a cell, for a daughter to occupy.
 *
 * The daughter is a spread copy, so she inherits the parent's heading AND
 * size -- and an elite's `block2` body rotates with that heading. Testing
 * the candidate with anything else let an overgrown Desulfovibrio put a
 * daughter's far tile inside rock. The occupancy predicate is the shared
 * one, so stairs and newborns are covered here too.
 */
function freeNeighbour(
  m: Mob, w: TurnWorld, born: readonly Mob[], idx: BodyIndex,
): Point | null {
  const fp = SIZES[m.size].footprint;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = m.x + Math.round(Math.cos(a)), y = m.y + Math.round(Math.sin(a));
    if (x === m.x && y === m.y) continue;
    if (x === w.player.x && y === w.player.y) continue;
    let ok = true;
    for (const t of tilesOf(fp, x, y, m.heading)) {
      if (!w.grid.isFloor(t.x, t.y)) { ok = false; break; }
    }
    if (!ok) continue;
    // EVERY tile of the daughter's own footprint must be clear, not just
    // its centre. A block2 organism is 2x2: checking one tile let a large
    // daughter be born half-inside its neighbour, which is what "two
    // Allochromatium overlap" was. Stairs count too -- the agenda path
    // learned that and fission had the same hole, one floor further on.
    let clash = false;
    const taken = occupancy(w, m, born, idx);
    for (const t of tilesOf(fp, x, y, m.heading)) {
      if (taken(t.x, t.y)) { clash = true; break; }
      // Anyone at all, the parent included -- a daughter cannot be born
      // inside the cell she is splitting from.
      if (idx.inBounds(t.x, t.y)) {
        if (idx.count(t.x, t.y) > 0
            || (t.x === w.player.x && t.y === w.player.y)) {
          clash = true;
          break;
        }
        continue;
      }
      if (w.mobs.some((o) => o.alive
            && covers(SIZES[o.size].footprint, o.x, o.y, o.heading, t.x, t.y))
          || born.some((o) =>
            covers(SIZES[o.size].footprint, o.x, o.y, o.heading, t.x, t.y))
          || (t.x === w.player.x && t.y === w.player.y)) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    return { x, y };
  }
  return null;
}

/**
 * What a step MEANS, for the reactive behaviours. Null for the simple ones --
 * a drifter has no posture to announce.
 */
function intentOf(m: Mob, dBefore: number, dAfter: number): Intent | null {
  switch (m.behaviour) {
    case "hunt":
      if (dAfter > dBefore) return "flees";
      if (dAfter === dBefore && dBefore > 1) return "circles";
      return "presses";
    case "ambush":
      return dAfter < dBefore ? "springs" : null;
    case "leech":
      return dAfter <= 1 ? "latches" : "presses";
    case "flank":
      return dAfter === dBefore ? "circles" : "presses";
    case "swarm":
      return dAfter === dBefore ? "encircles" : "presses";
    case "chase": case "glide": case "drift": case "sessile": case "wire":
      return null;                      // no posture to announce
  }
}

/**
 * The step a mob's own agenda wants, when combat wants nothing.
 *
 * Built here rather than in agenda.ts because it needs the world: the grid
 * to test walkability, and (for foraging) the nearest substrate drop. The
 * agenda itself is stored on the mob and rerolled when it expires.
 */
function agendaMove(
  m: Mob, w: TurnWorld, occupied: (x: number, y: number) => boolean,
  fp: ReturnType<typeof tilesOf> extends never ? never : Parameters<typeof covers>[0],
): Point | null {
  m.agenda ??= newAgenda(m.behaviour, w.rng);
  if (ageAgenda(m.agenda)) m.agenda = newAgenda(m.behaviour, w.rng);
  const a = m.agenda;

  // A roused floor follows the GRADIENT.
  //
  // Widening sense range was not enough: a mob that never came within ten
  // tiles still never came at all, so `alarmed` did zero damage while
  // `swarming` did plenty. Autoinducer diffuses, and chemotaxis up a
  // gradient is exactly how a cell finds a source it cannot otherwise
  // sense. Above `roused`, an unaware mob heads for the player regardless
  // of distance -- it does not SEE you, it is following the signal you left.
  let toward: Point | null = null;
  if (hunts(w.quorum ?? 0, m.uid)) {
    toward = { x: w.player.x, y: w.player.y };
  }
  if (toward === null && a.kind === "forage") {
    let best = Infinity;
    for (const d of w.drops ?? []) {
      const dist = chebyshev(d.x, d.y, m.x, m.y);
      if (dist < best && dist <= 14) { best = dist; toward = { x: d.x, y: d.y }; }
    }
  }
  if (!toward && a.target === null) {
    // Pick somewhere to be. A patrol point near where it already is, so a
    // mob stays in its own region rather than crossing the whole floor.
    const rx = m.x + w.rng.int(13) - 6, ry = m.y + w.rng.int(13) - 6;
    if (w.grid.isFloor(rx, ry)) a.target = { x: rx, y: ry };
  }
  if (a.target && chebyshev(a.target.x, a.target.y, m.x, m.y) <= 1) {
    a.target = null;                         // arrived; pick a new one
  }

  const free = (x: number, y: number): boolean => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    // The heading a mob would have AFTER the step, not the one it has now:
    // a multi-tile body rotates as it turns, so testing with the stale
    // heading let a filament swing its far end into rock. behaviour.ts has
    // always done this; the agenda path had to as well.
    // A rotating body (line3, block2) sweeps different tiles depending on
    // its heading, and the move ASSIGNS a new heading -- so the tiles to
    // validate are the ones it will occupy AFTER the turn, computed exactly
    // as the assignment computes them. A 3-tile boss spawns with
    // `heading: null` (horizontal); the first agenda step that pointed it
    // vertically swung its far end through the wall, because the check and
    // the assignment disagreed about which heading to use.
    const h = Math.atan2(y - m.y, x - m.x);
    for (const t of tilesOf(fp, x, y, h)) {
      // EVERY tile, against rock AND against other bodies -- a one-tile
      // occupancy test let two large cells overlap at their edges.
      if (!w.grid.isFloor(t.x, t.y)) return false;
      if (occupied(t.x, t.y)) return false;
      // Stairs stay clear. They were only kept clear at SPAWN, because
      // nothing had ever walked far enough on its own to reach one -- the
      // agendas made a latent rule into a visible violation.
      if (w.stairs?.some((s) => s.x === t.x && s.y === t.y)) return false;
    }
    return true;
  };
  return agendaStep(a, { x: m.x, y: m.y }, toward, w.rng, free);
}

/**
 * Is a tile taken? One definition, shared by every path that moves a body.
 *
 * There were two copies -- one for the combat step, one for the unaware
 * agenda step -- and they DIVERGED: the agenda copy learned that stairs are
 * off-limits and the combat copy did not, so a hunting mob could still end
 * a turn standing on the way down. Two predicates for one rule is a bug
 * waiting for whichever copy gets updated alone.
 */
function occupancy(
  w: TurnWorld, self: Mob, born: readonly Mob[], idx: BodyIndex,
): (x: number, y: number) => boolean {
  const own = SIZES[self.size].footprint;
  return (x, y) => {
    if (x === w.player.x && y === w.player.y) return true;
    if (w.stairs?.some((s) => s.x === x && s.y === y) === true) return true;
    if (idx.inBounds(x, y)) {
      // Everyone on the tile, less this mob itself if it is one of them.
      const mine = self.alive && covers(own, self.x, self.y, self.heading, x, y)
        ? 1 : 0;
      return idx.count(x, y) - mine > 0;
    }
    // Off the grid the index holds nothing, so ask the long way.
    return w.mobs.some((o) => o.alive && o !== self
         && covers(SIZES[o.size].footprint, o.x, o.y, o.heading, x, y))
      || born.some((o) => o !== self
         && covers(SIZES[o.size].footprint, o.x, o.y, o.heading, x, y));
  };
}
