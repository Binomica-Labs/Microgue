// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Burden: expression capacity is finite and shared.
//
// Measured before writing this. Power per ATP RISES with genome size --
// 0.43 at two genes, 1.87 at ten -- so bigger was not merely better, it was
// increasingly better, and per-gene expression never diluted no matter how
// many genes shared a promoter. There was no decision anywhere on the ring:
// fill it, always, and it was never close.
//
// Meanwhile the help text said "expression costs ATP", so a player who
// believed the game played badly, and a player who worked out the truth had
// nothing left to decide. The two failures hid each other.
//
// The missing thing has a name. A cell has a finite pool of RNA polymerase
// and ribosomes, and every construct competes for it: express more and each
// construct gets less, while growth slows. Ceroni and colleagues built a
// capacity monitor for exactly this in 2015, and burden is arguably the
// constraint that actually bites at a bench -- the reason a design that
// works on paper crawls in a cell.
//
// So: demand is what the ring is ASKING for, capacity is what the cell can
// give, and the share each gene actually gets falls as demand rises. The
// result is a genome size that is optimal rather than a slider that only
// goes one way.

import { GENES, type GeneId } from "./biology.js";

/**
 * The cell's baseline expression capacity.
 *
 * Tuned by measurement, not feel. At 4.5 a small ring is comfortable, a
 * mid-size one is "working", and an ambitious one is "strained" -- so the
 * pressure arrives as a consequence of ambition rather than greeting you at
 * the door. Per-gene expression falls 0.275 -> 0.143 across that range,
 * which is the dilution that did not exist before: it was FLAT at 0.367 no
 * matter how many genes shared a promoter.
 */
export const BASE_CAPACITY = 4.5;

/**
 * Demand: what the ring is asking the cell to make.
 *
 * Weighted by KILOBASES, not gene count. A 5.2 kb nitrogenase is a heavier
 * ask than a 0.9 kb ferredoxin, which is both true and the reason the kb
 * figure on the ring finally means something.
 */
export function demandOf(
  genes: readonly { id: GeneId; raw: number }[],
): number {
  let d = 0;
  for (const g of genes) {
    const kb = GENES[g.id].kb;
    const r = Number.isFinite(g.raw) ? Math.max(g.raw, 0) : 0;
    d += r * kb;
  }
  return d;
}

/**
 * The fraction of what it asked for that each construct actually gets.
 *
 * A saturating share, `C / (C + D)`: gentle while the cell has headroom,
 * biting hard once demand passes capacity. Never zero -- a cell under load
 * is slow, not silent, and a curve that hit zero would make one gene too
 * many into a dead run.
 */
export function shareOf(demand: number, capacity: number): number {
  const d = Number.isFinite(demand) ? Math.max(demand, 0) : 0;
  const c = Number.isFinite(capacity) && capacity > 0 ? capacity : BASE_CAPACITY;
  return c / (c + d);
}

/**
 * How hard the cell is straining, 0..1+, for display.
 *
 * 1.0 means demand exactly equals capacity. Above that the ring is asking
 * for more than the cell can make and everything on it is getting less.
 */
export function loadOf(demand: number, capacity: number): number {
  const c = Number.isFinite(capacity) && capacity > 0 ? capacity : BASE_CAPACITY;
  const d = Number.isFinite(demand) ? Math.max(demand, 0) : 0;
  return d / c;
}

export type Strain = "idle" | "easy" | "working" | "strained" | "choked";

export function strainOf(load: number): Strain {
  const l = Number.isFinite(load) ? Math.max(load, 0) : 0;
  return l >= 2.2 ? "choked" : l >= 1.3 ? "strained"
    : l >= 0.7 ? "working" : l >= 0.25 ? "easy" : "idle";
}

/** A line for the ring readout, so the player can see the constraint. */
export function strainLine(s: Strain): string {
  switch (s) {
    case "idle":     return "capacity to spare";
    case "easy":     return "comfortable";
    case "working":  return "working hard";
    case "strained": return "over capacity \u2014 everything is getting less";
    case "choked":   return "choked \u2014 the ring is starving itself";
  }
}
