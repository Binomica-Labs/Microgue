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

/**
 * A floor may grow to this MULTIPLE of the population it generated with.
 *
 * An absolute cap of 90 was wrong twice over: a floor starting at 81 grew
 * 11% and one starting at 74 grew 22%, so how much life a floor gained
 * depended on how close its roll happened to land to an arbitrary number.
 * Relative growth is the same everywhere and reads as the column filling in
 * rather than as a quota being met.
 */
export const GROWTH_CAP = 1.25;

/** A hard ceiling regardless, so a huge floor cannot swell without bound. */
export const CROWD_CAP = 110;

/**
 * Same-species neighbours that stop a cell dividing.
 *
 * THIS is what "everyone divided" looked like: a daughter is born adjacent
 * to her parent, so divisions clump, and a clump of identical cells reads
 * as a duplication glitch rather than as growth. Density-dependent
 * inhibition is also the real thing -- a cell packed among its own kind is
 * nutrient-limited and stops dividing long before the water is full.
 */
export const CONTACT_INHIBIT = 3;

export interface FissionWorld {
  /** How many living mobs are on this floor. */
  readonly population: number;
  /** How many the floor generated with, for the relative cap. */
  readonly founding: number;
  /** Turns since this cell last took damage; Infinity if never. */
  readonly calm: number;
  /** Living cells of the SAME species within a tile or two. */
  readonly kin: number;
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
  if (w.calm < 6) return false;                  // not while being hit
  // Local crowding first: a cell hemmed in by its own kind stops dividing
  // whatever the floor's total is. Without this, divisions clumped into
  // knots of identical cells.
  if (w.kin >= CONTACT_INHIBIT) return false;
  const ceiling = Math.min(
    Math.round((Number.isFinite(w.founding) && w.founding > 0 ? w.founding : 40)
               * GROWTH_CAP),
    CROWD_CAP);
  if (w.population >= ceiling) return false;
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
