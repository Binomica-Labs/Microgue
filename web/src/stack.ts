// Stacking duplicate genes.
//
// A second find of a gene you already carry used to be REFUSED outright, so
// the bin never held duplicates and a good roll of something you owned was
// simply unpickupable. Stacking is the fix, and it is also what keeps the bin
// readable once seventy genes are in play.
//
// Two copies stack only if they are the same gene AND the same rarity. That is
// not a technicality: rarity here describes the COPY -- its rolled kinetics
// and its affixes -- so a rare mtrC and a common mtrC are different objects
// that happen to share a name. Merging them would quietly average away the
// thing you went looking for.

import { alleleRarity } from "./allele.js";
import type { Part } from "./plasmid.js";

/** Copies of one gene a strain will carry. Beyond this it is spare. */
export const MAX_STACK = 3;

/** How many copies a part represents. */
export const countOf = (p: Part): number =>
  p.kind === "gene" ? Math.max(Math.round(p.count ?? 1), 1) : 1;

/**
 * Do these two belong in the same stack?
 *
 * The origin never stacks: there is exactly one, and a stack of them would
 * imply you could carry a spare.
 */
export function stacks(a: Part, b: Part): boolean {
  if (a.kind !== "gene" || b.kind !== "gene") return false;
  if (a.id !== b.id) return false;
  if (a.id === "ori") return false;
  return alleleRarity(a.id, a.allele) === alleleRarity(b.id, b.allele);
}

/** Index of the stack `part` would join, or -1. */
export function stackIndex(bin: readonly Part[], part: Part): number {
  return bin.findIndex((p) => stacks(p, part) && countOf(p) < MAX_STACK);
}

/** Index of a FULL stack of the same kind, or -1. Used to tell "no room in the
 *  bin" apart from "no room in this stack", which need different answers. */
export function fullStackIndex(bin: readonly Part[], part: Part): number {
  return bin.findIndex((p) => stacks(p, part) && countOf(p) >= MAX_STACK);
}

/**
 * The better of two copies, for when a stack keeps one allele.
 *
 * Keeps the higher rarity, then the better roll. A stack must never quietly
 * downgrade what you already had.
 */
export function betterOf(
  a: Extract<Part, { kind: "gene" }>, b: Extract<Part, { kind: "gene" }>,
): Extract<Part, { kind: "gene" }> {
  const ra = alleleRarity(a.id, a.allele);
  const rb = alleleRarity(b.id, b.allele);
  if (ra !== rb) return a;              // same-rarity is a precondition anyway
  // Prefer the one already evolved or modified: that work is not recoverable.
  const worth = (p: typeof a): number => p.level * 10 + p.mods.length;
  return worth(b) > worth(a) ? b : a;
}

/**
 * Move parts off ring positions the chromosome no longer has.
 *
 * Shrinking the chromosome strands whatever sat on the positions that just
 * went away: they are still in the array, still counted by `used()`, and no
 * operation can ever reach them again. A part that exists and cannot be
 * touched is worse than one that is gone.
 *
 * The origin is not optional, so it is relocated rather than binned.
 */
export function rescueStranded(
  p: {
    slots: (Part | null)[];
    bin: Part[];
    stash: (part: Part) => { ok: boolean };
  },
  from: number, to: number,
): void {
  for (let i = from; i < to && i < p.slots.length; i++) {
    const part = p.slots[i];
    if (!part) continue;
    p.slots[i] = null;
    if (part.kind === "gene" && part.id === "ori") {
      const free = p.slots.findIndex((s, k) => s === null && k < from);
      if (free >= 0) p.slots[free] = part;
      else p.bin.push(part);
    } else {
      p.stash(part);
    }
  }
}
