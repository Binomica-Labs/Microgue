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
/**
 * Ring positions the strain has earned.
 *
 * One every other level rather than every third: the plasmid visibly grows as
 * the lineage learns, which is the point. It is the only thing levelling gives
 * you that you can see on the ring.
 */
export const bonusSlots = (level: number): number =>
  Math.floor((Math.min(Math.max(Number.isFinite(level) ? level : 1, 1), MAX_STRAIN) - 1) / 2);

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


/**
 * Progress toward the next level, 0..1.
 *
 * There is no separate experience track and there should not be: a second bar
 * that fills from killing things would compete with the notebook rather than
 * reinforce it. This is the SAME measure the level comes from, exposed so it
 * can be drawn -- what was missing was visibility, not a mechanic.
 */
export function levelProgress(p: Progress): number {
  const c = Number.isFinite(p.catalogued) ? p.catalogued : 0;
  const d = Number.isFinite(p.deepest) ? p.deepest : 1;
  const catalogued = Math.min(Math.max(c, 0), MICROBES.length);
  const deepest = Math.min(Math.max(d, 1), MAX_FLOOR);
  const score = (catalogued / MICROBES.length) * 0.55
    + ((deepest - 1) / (MAX_FLOOR - 1)) * 0.45;
  // At the cap the bar reads full, not empty: `raw - floor(raw)` is 0 at
  // exactly 8.0, which would show a fully adapted strain as having made no
  // progress at all.
  if (strainLevel(p) >= MAX_STRAIN) return 1;
  const raw = score * MAX_STRAIN;
  return Math.min(Math.max(raw - Math.floor(raw), 0), 1);
}
