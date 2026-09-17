// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Cross-feeding: some genes need what another organism makes.
//
// A strain could be entirely self-sufficient, which is exactly what real
// microbial communities are NOT. Most environmental bacteria are auxotrophs
// leaning on each other -- the community makes the vitamins, not the cell.
//
// So the highest-tier genes carry a COFACTOR requirement: a metabolite you
// can only get by lysing the organism that makes it. The gene installs
// fine, transcribes fine, and produces nothing until you have the cofactor.
// The bestiary stops being a list of things that hurt you and becomes a
// supply chain.
//
// Deliberately narrow: only a handful of genes, all tier 4+, all with one
// obvious source organism, and the cofactor lasts a whole run once obtained.
// A mechanic that made every gene conditional would be bookkeeping.

import type { GeneId } from "./biology.js";

export interface Cofactor {
  readonly id: string;
  readonly name: string;
  /** The organism whose lysate yields it. */
  readonly from: string;
  readonly note: string;
}

export const COFACTORS: Readonly<Record<string, Cofactor>> = {
  b12: { id: "b12", name: "cobalamin", from: "Desulfovibrio",
         note: "Vitamin B12. Almost nothing makes it and almost everything "
           + "needs it -- the classic community dependency." },
  f430: { id: "f430", name: "coenzyme F430", from: "Methanosarcina",
          note: "The nickel tetrapyrrole at the heart of methanogenesis. "
            + "Made nowhere else in biology." },
  heme: { id: "heme", name: "heme b", from: "Geobacter",
          note: "Iron protoporphyrin. Iron-reducers make it in bulk; many "
            + "cells cannot make it at all." },
};

/** Which cofactor a gene needs, if any. */
/**
 * Deliberately NARROW. The first version gated mcrA, dsrA and mtrC -- the
 * workhorse genes of the deep strata -- and broke twenty existing tests,
 * which was the balance telling the truth: making a core metabolic route
 * conditional on a scavenger hunt is a different game, and a worse one.
 *
 * These five are peripheral by design: metal-handling and CO oxidation,
 * where needing a metal cofactor is also the real biology. A build never
 * REQUIRES them, so the mechanic adds a reason to hunt without ever gating
 * the descent.
 */
export const REQUIRES: Readonly<Partial<Record<GeneId, string>>> = {
  czcA: "b12",
  copA: "heme",
  acrB: "heme",
  merA: "b12",
  cooS: "f430",
};

export function cofactorFor(gene: GeneId): Cofactor | null {
  const id = REQUIRES[gene];
  return id !== undefined ? COFACTORS[id] ?? null : null;
}

/** Which cofactor an organism's lysate yields, if any. */
export function yieldsCofactor(organism: string): Cofactor | null {
  for (const c of Object.values(COFACTORS)) {
    if (c.from.toLowerCase() === organism.toLowerCase()) return c;
  }
  return null;
}

/** Does the strain have what this gene needs? */
export function satisfied(gene: GeneId, held: ReadonlySet<string>): boolean {
  const id = REQUIRES[gene];
  return id === undefined || held.has(id);
}
