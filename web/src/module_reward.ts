// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// What completing a KEGG module is worth.
//
// The research map was decorative. `moduleState` computed how many steps of
// a pathway you held, drew a box, and that was the end of it -- nothing in
// the game read it. So the one screen that shows a long-term goal offered
// no reason to pursue it, and "complete denitrification" meant a caption
// changed colour.
//
// A completed module is a whole metabolic route the cell can actually run,
// so the reward is metabolic: the pathway's genes get cheaper to express
// and yield more. That is what having the full route MEANS -- the
// intermediates stop being dead ends, and nothing is wasted.
//
// Deliberately modest per module and capped overall. The map has enough
// modules that an uncapped bonus would eventually dominate every other
// decision, and a research screen that trivialises the game is worse than
// one that does nothing.

import { MODULES, moduleState, type Module } from "./kegg.js";
import type { GeneId, Pathway } from "./biology.js";

/** Upkeep multiplier for a pathway whose module is complete. */
export const UPKEEP_RELIEF = 0.82;

/** Yield multiplier for the same. */
export const YIELD_BONUS = 1.12;

/** No more than this many modules ever count, however many are finished. */
export const MAX_COUNTED = 5;

export interface Mastery {
  /** Pathways with at least one complete module. */
  readonly pathways: ReadonlySet<Pathway>;
  /** How many complete modules are counting, after the cap. */
  readonly counted: number;
  /** The modules themselves, for the screen. */
  readonly complete: readonly Module[];
}

export function masteryOf(carried: ReadonlySet<GeneId>): Mastery {
  const complete: Module[] = [];
  for (const m of MODULES) {
    if (moduleState(m, carried).complete) complete.push(m);
  }
  const counted = Math.min(complete.length, MAX_COUNTED);
  // Only the capped prefix contributes, so the set of pathways matches the
  // bonus actually being applied -- a screen that credits a pathway the
  // maths ignores is a lie.
  const pathways = new Set<Pathway>(
    complete.slice(0, MAX_COUNTED).map((m) => m.pathway));
  return { pathways, counted, complete };
}

/** Upkeep multiplier for one gene, given what the strain has mastered. */
export function upkeepFactor(pathway: Pathway, m: Mastery): number {
  return m.pathways.has(pathway) ? UPKEEP_RELIEF : 1;
}

/** Yield multiplier for one gene. */
export function yieldFactor(pathway: Pathway, m: Mastery): number {
  return m.pathways.has(pathway) ? YIELD_BONUS : 1;
}
