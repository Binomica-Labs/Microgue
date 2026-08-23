// Combat and the microbe turn, lifted out of main.ts.
//
// Everything here takes its world explicitly rather than reaching for game
// state, which is what makes it testable without a canvas.

import { canStrike, chebyshev, decideStep, senseRange, SIZES } from "./behaviour.js";
import { covers, tilesOf } from "./footprint.js";
import type { Mob } from "./dungeon.js";
import type { Grid } from "./mapgen.js";
import type { Rng } from "./rng.js";
import { apply, haste, tick, type Status, type StatusId } from "./status.js";

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
}

export interface TurnEvent {
  readonly kind: "strike" | "move" | "status";
  readonly mob: Mob;
  readonly dmg?: number;
  readonly status?: StatusId;
}

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
      if (m.hp <= 0) { m.alive = false; continue; }
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

    if (canStrike(m.behaviour, m.size, dist)) {
      const dmg = Math.max(Math.round(m.atk * 0.35 * w.armour), 1);
      w.player.hp = Math.max(w.player.hp - dmg, 0);
      events.push({ kind: "strike", mob: m, dmg });

      const inflict = INFLICTS[m.id];
      if (inflict !== undefined && w.rng.next() < 0.35) {
        apply(w.player.status, inflict, 4, 1);
        events.push({ kind: "status", mob: m, status: inflict });
      }
      continue;
    }

    const allies = w.mobs.filter(
      (o) => o.alive && o !== m && o.id === m.id && chebyshev(o.x, o.y, m.x, m.y) <= 3).length;
    const step = decideStep(
      m.behaviour, { x: m.x, y: m.y },
      { px: w.player.x, py: w.player.y, dist, alliesNear: allies },
      w.grid, w.rng,
      (x, y) => (x === w.player.x && y === w.player.y)
        || w.mobs.some((o) => o.alive && o !== m
             && covers(SIZES[o.size].footprint, o.x, o.y, o.heading, x, y)),
      fp);

    if (step) {
      m.heading = Math.atan2(step.y - m.y, step.x - m.x);
      m.x = step.x; m.y = step.y; events.push({ kind: "move", mob: m }); }
  }

  return events;
}
