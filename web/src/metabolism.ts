// Per-gene metabolic data.
//
// Split out of plasmid.ts, which owns ARRANGEMENT and economics rather than
// the chemistry of individual loci. These are tables: which genes generate
// ATP and how much, what each one needs from its stratum to turn over at all,
// and what oxygen destroys. Adding a gene's metabolism is an entry here, not a
// branch in the expression path.

import type { GeneId, Teap } from "./biology.js";

/** Per-action ATP produced by a gene, when it is expressing. */
export const GENERATORS: Partial<Record<GeneId, number>> = {
  // terminal reductases -- these ARE the respiration, so they must out-earn
  // their own expression cost or the game punishes the correct build
  narG: 4.6, dsrA: 12.0, mcrA: 6.6, nosZ: 2.6, norB: 2.0, nirS: 2.4,
  // light harvesting
  psbA: 4.4, pufM: 3.8, fmoA: 3.4, csmA: 1.8,
  // chemolithotrophy and hydrogen
  amoA: 3.0, nxrA: 2.8, soxB: 3.2, sqr: 1.6, hydA: 3.6, aprA: 1.6,
  // luciferase consumes reducing power and FMNH2 to make photons.
  luxAB: -0.8,
  // ATP sulfurylase CONSUMES ATP -- sulfate must be activated to APS before
  // anything can reduce it, at a cost of two ATP equivalents. It is why
  // sulfate reduction is energetically marginal and why sulfate reducers grow
  // slowly. A negative generator is the honest way to model it.
  sat: -1.6,
  // extracellular electron transfer: respiring a mineral still pays
  mtrC: 4.2, omcS: 2.0,
};

/** Cost scales with size and how hard the gene is being driven. */
export const COST_PER_KB = 0.7;

/** ATP burned per unit of transcription that runs off the end of an operon
 *  without producing anything. Tuned so a bare hairpin is a real tax and a
 *  tandem terminator is nearly free. */
export const WASTE_PER_UNIT = 1.15;

export const O2_LABILE: ReadonlySet<GeneId> = new Set(["nifH", "hydA", "mcrA"]);
export const CHLOROSOME: ReadonlySet<GeneId> = new Set(["fmoA", "csmA"]);
export const NEEDS: Partial<Record<GeneId, "light" | Teap>> = {
  // Luciferase is an oxygenase; without O2 it simply does not turn over.
  luxAB: "O2",
  psbA: "light", pufM: "light", fmoA: "light", csmA: "light",
  mtrC: "Fe(III)", omcS: "Fe(III)",
  dsrA: "SO4", aprA: "SO4",
  mcrA: "CO2", narG: "NO3-",
};

