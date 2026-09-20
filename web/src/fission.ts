// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Binary fission: the thing a bacterium is actually for.
//
// Every organism in this game reproduces by splitting in two, and none of
// them ever did. A floor's population was fixed at generation and only ever
// went down. That makes the column a shooting gallery rather than an
// ecosystem, and it wastes the one behaviour every player already
// associates with bacteria.
//
// So a well-fed, unharmed, undisturbed cell DOUBLES. The conditions are the
// real ones:
//
//   * it must be at full health -- a damaged cell repairs before it divides;
//   * it must have room -- a free adjacent tile, because two cells need two
//     tiles;
//   * it must not be in combat -- a cell under attack is not dividing;
//   * and the floor must not already be crowded, or one quiet corner
//     becomes a hundred cells while the player is elsewhere.
//
// The daughter is a copy at half health, which is both correct (the
// cytoplasm is divided, not duplicated) and the balance lever: doubling
// makes MORE targets, not tougher ones, and a floor that doubles unchecked
// is full of weak cells rather than an unkillable wall.

import type { Rng } from "./rng.js";

/** Chance per turn that a qualifying cell divides. */
export const FISSION_CHANCE = 0.018;

/** Above this many mobs on a floor, nothing divides. */
export const CROWD_CAP = 90;

export interface FissionWorld {
  /** How many living mobs are on this floor. */
  readonly population: number;
  /** Turns since this cell last took damage; Infinity if never. */
  readonly calm: number;
}

/**
 * Should this cell divide right now?
 *
 * Deliberately conservative: at 1.8% a turn a qualifying cell divides about
 * once every 55 turns, which across a floor is a slow background swell
 * rather than a bloom. A player who clears a room and comes back finds it
 * repopulating; a player who camps finds the pressure rising.
 */
export function divides(
  hp: number, maxhp: number, w: FissionWorld, rng: Rng,
  /** Per-turn chance, so a bloom can raise it. Defaults to the base rate. */
  chance: number = FISSION_CHANCE,
): boolean {
  if (!Number.isFinite(hp) || !Number.isFinite(maxhp) || maxhp <= 0) return false;
  if (hp < maxhp) return false;                  // repair before reproduction
  if (w.population >= CROWD_CAP) return false;   // no room on the floor
  if (w.calm < 6) return false;                  // not while being hit
  const p = Number.isFinite(chance) ? Math.min(Math.max(chance, 0), 1)
    : FISSION_CHANCE;
  return rng.next() < p;
}

/**
 * The split: what the two daughters get.
 *
 * A dividing cell partitions its cytoplasm, so both halves start at half
 * health. The parent is not "unchanged plus a free minion" -- that would
 * make doubling pure profit and the correct play would be to leave every
 * healthy cell alone.
 */
export function partition(maxhp: number): { parent: number; daughter: number } {
  const m = Number.isFinite(maxhp) && maxhp > 0 ? maxhp : 1;
  const half = Math.max(Math.floor(m / 2), 1);
  return { parent: half, daughter: half };
}

/** A bloom: the condition that makes a floor double far faster. */
export function chanceUnder(conditionId: string): number {
  return conditionId === "bloom" ? FISSION_CHANCE * 3.2
    : conditionId === "oligotrophic" ? FISSION_CHANCE * 0.35
    : FISSION_CHANCE;
}
