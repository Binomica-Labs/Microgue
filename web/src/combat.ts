// Combat and the microbe turn, lifted out of main.ts.
//
// Everything here takes its world explicitly rather than reaching for game
// state, which is what makes it testable without a canvas.

import { canStrike, chebyshev, decideStep, senseRange, SIZES } from "./behaviour.js";
import { speedOf, tick as speedTick } from "./speed.js";
import { covers, tilesOf } from "./footprint.js";
import type { Mob } from "./dungeon.js";
import type { Grid } from "./mapgen.js";
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
    | "intent";
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

  for (const m of w.mobs) {
    if (!m.alive) continue;

    // Status effects resolve first: a poisoned microbe still takes damage.
    const selfDmg = tick(m.status);
    if (selfDmg > 0) {
      m.hp = Math.max(m.hp - selfDmg, 0);
      if (m.hp <= 0) {
        m.alive = false;
        events.push({ kind: "died", mob: m });
        continue;
      }
    }

    // Large bodies act less often, and impaired ones less still.
    if (m.cooldown > 0) { m.cooldown -= 1; continue; }
    m.cooldown = Math.round(SIZES[m.size].cooldown / haste(m.status));

    // Distance from the NEAREST tile of the body: a three-tile filament can
    // reach you from either end.
    const fp = SIZES[m.size].footprint;
    const dist = Math.min(...tilesOf(fp, m.x, m.y, m.heading)
      .map((t) => chebyshev(t.x, t.y, w.player.x, w.player.y)));
    if (dist > senseRange(m.behaviour) && m.behaviour !== "sessile") continue;

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
          events.push({ kind: "charge", mob: m, weapon: weapon.name });
          continue;
        }
        m.charging = 0;
        m.reload = weapon.cooldown;
        const raw = Math.max(Math.round(m.atk * weapon.power), 1);

        if (weapon.kind === "packet") {
          w.packets.push(launch({ x: m.x, y: m.y }, { x: w.player.x, y: w.player.y },
                                raw, weapon.inflicts, m.pigment));
        } else if (weapon.kind === "cloud") {
          w.clouds.push({
            cx: w.player.x, cy: w.player.y, radius: weapon.radius, dmg: raw,
            ttl: weapon.persist, inflicts: weapon.inflicts, colour: m.pigment,
          });
        } else {
          const dmg = Math.max(Math.round(raw * w.armour), 1);
          w.player.hp = Math.max(w.player.hp - dmg, 0);
          if (weapon.inflicts) apply(w.player.status, weapon.inflicts, 4, 1);
        }
        events.push({ kind: "fire", mob: m, weapon: weapon.name,
                      at: { x: w.player.x, y: w.player.y } });
        continue;
      }
    }
    if (m.charging > 0 && dist > weapon.range) m.charging = 0;   // lost the shot

    if (weapon.kind === "melee" && canStrike(m.behaviour, m.size, dist)) {
      // 0.35 made the first stratum survivable for fifty consecutive hits,
      // which is no threat at all. Tuned against the whole 24-floor curve.
      const dmg = Math.max(Math.round(m.atk * 0.55 * w.armour), 1);
      w.player.hp = Math.max(w.player.hp - dmg, 0);
      events.push({ kind: "strike", mob: m, dmg });

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

    const allyList = w.mobs.filter(
      (o) => o.alive && o !== m && o.id === m.id && chebyshev(o.x, o.y, m.x, m.y) <= 3);
    const allies = allyList.length;
    for (let s = 0; s < steps; s++) {
    const step = decideStep(
      m.behaviour, { x: m.x, y: m.y },
      { px: w.player.x, py: w.player.y, dist, alliesNear: allies,
        hpFrac: m.maxhp > 0 ? m.hp / m.maxhp : 1, threat: w.threat,
        allyAt: allyList.map((o) => ({ x: o.x, y: o.y })) },
      w.grid, w.rng,
      (x, y) => (x === w.player.x && y === w.player.y)
        || w.mobs.some((o) => o.alive && o !== m
             && covers(SIZES[o.size].footprint, o.x, o.y, o.heading, x, y)),
      fp);

    if (!step) break;
    // Read the posture off the step: closing, holding distance, or opening.
    const dBefore = chebyshev(m.x, m.y, w.player.x, w.player.y);
    const dAfter = chebyshev(step.x, step.y, w.player.x, w.player.y);
    const intent = intentOf(m, dBefore, dAfter);
    m.heading = Math.atan2(step.y - m.y, step.x - m.x);
    m.x = step.x; m.y = step.y;
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

  return events;
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
