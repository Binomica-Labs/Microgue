// Primary production and the biological pump.
//
// A Winogradsky column is fed from the TOP. Phototrophs in the photic zone fix
// carbon while there is light; that biomass sinks, and everything below lives
// on what falls. Nothing down there makes its own food.
//
// Two consequences, and they are the whole point of this module:
//
//   * A floor you have stripped does not refill on its own. It refills from
//     ABOVE, over time.
//   * Production stops at night, because photosynthesis does.
//
// So a level is a resource that regenerates at a rate set by its depth and by
// the clock, and stripping one and moving on is not free. Going back UP is
// where the food is -- which is the tension the column was missing: descend
// now with what you have, or spend turns climbing to fund the next tier of
// directed evolution while the clock runs and the microbes act.

import { MAX_DEPTH } from "./biology.js";
import { daylight, type Clock } from "./cycle.js";

/** Turns before a fully stripped surface floor is fully restocked. */
/** Turns of full daylight to restock a stripped surface floor. Tuned so a
 *  climb to the surface pays for itself inside one day; the deep floors never
 *  meaningfully refill, which is what pushes you back up. */
export const RESTOCK_TURNS = 150;

/** How many substrate drops a floor holds when fully stocked. */
export function capacityAt(depth: number): number {
  // Math.round(NaN) is NaN and clamps to NaN, so the guard has to come first.
  const raw = Number.isFinite(depth) ? Math.round(depth) : 1;
  const d = Math.min(Math.max(raw, 1), MAX_DEPTH);
  // The pump attenuates with depth: less reaches the bottom, and less of what
  // does is still edible by the time it gets there.
  return Math.max(Math.round(16 * (1 - (d - 1) / MAX_DEPTH * 0.72)), 4);
}

/**
 * Fraction of capacity a floor regains per turn.
 *
 * Falls with depth, because that is the pump, and goes to zero at night,
 * because that is photosynthesis. `light` is the value from `daylight()`.
 */
export function rateAt(depth: number, light: number): number {
  const raw = Number.isFinite(depth) ? Math.round(depth) : 1;
  const d = Math.min(Math.max(raw, 1), MAX_DEPTH);
  const l = Number.isFinite(light) ? Math.min(Math.max(light, 0), 1) : 0;
  const attenuation = 1 / (1 + (d - 1) * 0.55);
  return (l * 0.9 + 0.1) * attenuation / RESTOCK_TURNS;
}

/**
 * Mean daylight over a span of turns.
 *
 * Sampled across the interval, NOT at its endpoints. Endpoint sampling made
 * the result depend on where in the day the span happened to begin and end:
 * 600 turns away could return LESS than 300, because both ends landed at
 * night. Non-monotonic regeneration is indefensible and was invisible until
 * the numbers were actually printed.
 */
export function meanLight(from: number, turns: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(turns) || turns <= 0) return 0;
  const n = 24;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += daylight({ turn: from + (turns * (i + 0.5)) / n });
  }
  return total / n;
}

/** How many drops to add to a floor after `elapsed` turns away from it. */
export function restockAmount(
  depth: number, present: number, elapsed: number, clock: Clock, since: number,
): number {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  if (!Number.isFinite(present) || present < 0) return 0;
  const cap = capacityAt(depth);
  if (present >= cap) return 0;
  const span = Math.min(elapsed, RESTOCK_TURNS * 6);
  const rate = rateAt(depth, meanLight(since, span));
  void clock;
  const gained = Math.floor(cap * rate * span);
  return Math.max(Math.min(gained, cap - present), 0);
}

/** How a floor reads when you arrive, for the log. */
export function describeStock(depth: number, present: number): string {
  const cap = capacityAt(depth);
  if (!Number.isFinite(present)) return describeStock(depth, 0);
  const f = cap > 0 ? present / cap : 0;
  if (f <= 0.05) return "Stripped bare. Nothing here has settled since you left.";
  if (f < 0.3) return "Thin pickings. What sank here has mostly been taken already.";
  if (f < 0.7) return "Some material has settled since you were last through.";
  return depth <= 2
    ? "Fresh production everywhere -- this is where the column feeds itself."
    : "A good fall of material has settled here.";
}
