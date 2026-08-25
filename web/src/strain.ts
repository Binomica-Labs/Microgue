// Strain level: what the lineage has learned.
//
// Not experience points. A strain advances by CATALOGUING -- by how much of
// the column it has recorded and how deep it has been -- because that is the
// only thing this cell is actually doing. The notebook was a score; this makes
// it the progression.
//
// Level buys two things: access to better replicons, and headroom on whatever
// you are carrying. It does not buy raw power. Power comes from what you find
// and how you arrange it, which is where the decisions are.

import { MICROBES } from "./biology.js";
import { MAX_FLOOR } from "./dungeon.js";

export const MAX_STRAIN = 8;

export interface Progress {
  /** Organisms recorded in the notebook. */
  readonly catalogued: number;
  /** Deepest floor reached. */
  readonly deepest: number;
}

/**
 * Strain level from what has been learned.
 *
 * Both terms matter: diving to the floor without recording anything leaves you
 * shallow, and so does cataloguing the surface exhaustively. The column has to
 * be understood as well as survived.
 */
export function strainLevel(p: Progress): number {
  // Math.min/max propagate NaN, so the finiteness guard has to come first.
  const c = Number.isFinite(p.catalogued) ? p.catalogued : 0;
  const d = Number.isFinite(p.deepest) ? p.deepest : 1;
  const catalogued = Math.min(Math.max(c, 0), MICROBES.length);
  const deepest = Math.min(Math.max(d, 1), MAX_FLOOR);
  const breadth = catalogued / MICROBES.length;
  const depth = (deepest - 1) / (MAX_FLOOR - 1);
  const score = breadth * 0.55 + depth * 0.45;
  return Math.min(Math.max(Math.floor(score * MAX_STRAIN) + 1, 1), MAX_STRAIN);
}

/** Extra ring positions the strain has earned, on top of the replicon's own. */
export const bonusSlots = (level: number): number =>
  Math.floor(Math.min(Math.max(Number.isFinite(level) ? level : 1, 1), MAX_STRAIN) / 3);

/** Extra kilobases of headroom. A better-adapted strain tolerates more DNA. */
export const bonusCapacityKb = (level: number): number =>
  (Math.min(Math.max(Number.isFinite(level) ? level : 1, 1), MAX_STRAIN) - 1) * 1.4;

/** What the next level needs, in words, for the notebook header. */
export function nextLevelHint(p: Progress): string {
  const now = strainLevel(p);
  if (now >= MAX_STRAIN) return "fully adapted";
  for (let extra = 1; extra <= MICROBES.length; extra++) {
    if (strainLevel({ ...p, catalogued: p.catalogued + extra }) > now) {
      return `${String(extra)} more organism${extra === 1 ? "" : "s"} recorded, `
        + "or go deeper";
    }
  }
  return "go deeper";
}

/** Level thresholds, for a readout. */
export function describeLevel(level: number): string {
  const l = Math.min(Math.max(level, 1), MAX_STRAIN);
  return `strain L${String(l)} · ${String(bonusSlots(l))} bonus slots · `
    + `+${bonusCapacityKb(l).toFixed(1)} kb headroom`;
}
