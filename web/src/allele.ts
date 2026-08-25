// Allelic variation: the loot roll.
//
// Two copies of the same gene are not the same enzyme. Homologues of mtrC from
// different Shewanella isolates differ in turnover, in substrate affinity and
// in how long they survive; that is ordinary sequence variation, and it is why
// directed evolution works at all. So a dropped cassette is a BASE (the gene)
// plus a rolled ALLELE, and hunting for a better roll of a gene you already
// carry is the same activity as screening a library -- which is what a
// microbiologist actually does.
//
// The rolled parameters are the ones an enzymologist would measure:
//
//   kcat       turnover number. Raw output.
//   km         substrate affinity. LOW is good: a low-Km enzyme still works
//              when its substrate is scarce, which is exactly the deep column.
//   stability  how well it survives. Resists denaturation and degradation.
//
// Affixes are real molecular-biology provenance, not invented adjectives, and
// each carries a genuine trade: thermostable enzymes are famously slower,
// psychrophilic ones famously fragile, chimeras fold badly.

import { GENES, type GeneId } from "./biology.js";
import { RARITY_RANK, rarityOfTier, type Rarity } from "./parts.js";
import type { Rng } from "./rng.js";

export type PrefixId =
  | "thermostable" | "psychrophilic" | "ancestral" | "chimeric"
  | "halotolerant" | "hyperactive";

export type SuffixId =
  | "broadSpecificity" | "tightCoupling" | "highCopy" | "fastFolding"
  | "proofreading";

export interface AffixEffect {
  readonly kcat?: number;
  readonly km?: number;          // multiplier; below 1 is BETTER affinity
  readonly stability?: number;
  readonly upkeep?: number;
  readonly expression?: number;
  /** Can stand in for a missing partner in a complex. */
  readonly promiscuous?: boolean;
}

export interface AffixDef {
  readonly name: string;
  readonly effect: AffixEffect;
  readonly note: string;
}

export const PREFIXES: Readonly<Record<PrefixId, AffixDef>> = {
  thermostable: {
    name: "thermostable", effect: { stability: 1.45, kcat: 0.88 },
    note: "From a thermophile. Rigid, long-lived, and measurably slower for it -- the classic stability/activity trade.",
  },
  psychrophilic: {
    name: "psychrophilic", effect: { kcat: 1.35, stability: 0.72 },
    note: "Cold-adapted. A floppier active site turns over faster and falls apart sooner.",
  },
  ancestral: {
    // Resurrected ancestors really are more stable and more promiscuous -- and
    // that promiscuity is the cost: a generalist is worse at its day job than
    // the specialist that descended from it.
    name: "ancestral", effect: { stability: 1.3, km: 0.9, kcat: 0.85, promiscuous: true },
    note: "Reconstructed from an inferred ancestral sequence. Resurrected enzymes are reliably more stable and more promiscuous than their descendants, and slower at any one reaction.",
  },
  chimeric: {
    name: "chimeric", effect: { kcat: 1.28, expression: 0.78 },
    note: "Domains spliced from two homologues. Active, but a poor folder.",
  },
  halotolerant: {
    // The acidic surface that holds the hydration shell is a real cost: these
    // enzymes are notoriously sluggish and often need salt to fold at all.
    name: "halotolerant", effect: { stability: 1.2, km: 0.88, kcat: 0.82 },
    note: "From a brine. Acidic surface residues hold a hydration shell where others precipitate, at the price of a slow active site.",
  },
  hyperactive: {
    name: "hyperactive", effect: { kcat: 1.5, upkeep: 1.35, stability: 0.9 },
    note: "A screening hit with an unusually fast active site. It costs to keep one of these running.",
  },
};

export const SUFFIXES: Readonly<Record<SuffixId, AffixDef>> = {
  broadSpecificity: {
    name: "of broad specificity", effect: { km: 1.15, promiscuous: true },
    note: "Accepts more than one substrate, and is worse at each of them. Can substitute for a missing partner.",
  },
  tightCoupling: {
    // Tight coupling means the enzyme will not turn over unless the gradient
    // is there to do work with. Efficient, and inflexible.
    name: "of tight coupling", effect: { upkeep: 0.7, kcat: 0.9 },
    note: "Little proton leak, and no slippage: far cheaper to run, and it will not turn over faster than the gradient allows.",
  },
  highCopy: {
    name: "of high copy", effect: { expression: 1.3, upkeep: 1.15 },
    note: "Carried on a high-copy replicon. More of it, and more burden.",
  },
  fastFolding: {
    name: "of fast folding", effect: { expression: 1.22, stability: 1.1, km: 1.12 },
    note: "Folds without chaperones. More of what is made is functional, though the fast-folding core sits a little loose around the substrate.",
  },
  proofreading: {
    name: "of proofreading", effect: { kcat: 0.9, km: 0.72 },
    note: "Slow and discriminating. Still works where the substrate has almost run out.",
  },
};

export interface Allele {
  /** Rolled multipliers, all centred near 1. */
  readonly kcat: number;
  readonly km: number;
  readonly stability: number;
  readonly prefix: PrefixId | null;
  readonly suffix: SuffixId | null;
}

/** The default: an unremarkable wild-type copy. */
export const WILD_TYPE: Allele = {
  kcat: 1, km: 1, stability: 1, prefix: null, suffix: null,
};

const PREFIX_IDS = Object.keys(PREFIXES) as PrefixId[];
const SUFFIX_IDS = Object.keys(SUFFIXES) as SuffixId[];

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : lo;

/**
 * Roll an allele.
 *
 * Deeper strata roll wider, not merely higher: the chance of something
 * exceptional rises, and so does the chance of junk. A distribution that only
 * shifts upward stops being a hunt.
 */
export function rollAllele(rng: Rng, depth: number): Allele {
  const d = clamp(depth, 1, 8);
  const spread = 0.18 + d * 0.035;
  const roll = (): number => {
    // Two samples averaged: a hump around 1 rather than a flat band, so an
    // extreme roll is genuinely uncommon.
    const a = rng.next(), b = rng.next();
    return 1 + ((a + b) / 2 - 0.5) * 2 * spread;
  };
  // An affix is meant to be a find. At 0.16 + d*0.045 both slots filled a
  // quarter of the time at depth, and the pair bonus alone made a third of
  // deep drops top-tier.
  const affixChance = 0.09 + d * 0.026;
  return {
    kcat: clamp(roll(), 0.55, 1.9),
    km: clamp(roll(), 0.55, 1.9),
    stability: clamp(roll(), 0.55, 1.9),
    prefix: rng.next() < affixChance ? PREFIX_IDS[rng.int(PREFIX_IDS.length)] ?? null : null,
    suffix: rng.next() < affixChance * 0.75
      ? SUFFIX_IDS[rng.int(SUFFIX_IDS.length)] ?? null : null,
  };
}

/** Everything an allele does, folded together. */
export function alleleEffect(a: Allele): Required<Omit<AffixEffect, "promiscuous">>
  & { promiscuous: boolean } {
  let kcat = clamp(a.kcat, 0.4, 2.2);
  let km = clamp(a.km, 0.4, 2.2);
  let stability = clamp(a.stability, 0.4, 2.2);
  let upkeep = 1, expression = 1, promiscuous = false;
  for (const def of [a.prefix ? PREFIXES[a.prefix] : null,
                     a.suffix ? SUFFIXES[a.suffix] : null]) {
    if (!def) continue;
    const e = def.effect;
    kcat *= e.kcat ?? 1;
    km *= e.km ?? 1;
    stability *= e.stability ?? 1;
    upkeep *= e.upkeep ?? 1;
    expression *= e.expression ?? 1;
    promiscuous ||= e.promiscuous ?? false;
  }
  return { kcat, km, stability, upkeep, expression, promiscuous };
}

/**
 * How good this roll is, as a single number around 1.
 *
 * Low Km counts as GOOD, which is why it is inverted here. Getting that
 * backwards would make every hunt reward the wrong thing.
 */
export function quality(a: Allele): number {
  const e = alleleEffect(a);
  // 1/km is asymmetric: a km of 0.55 reads as 1.8 while 1.45 reads as 0.69, so
  // using it raw made every roll look good and nothing ever came out common.
  // Compressed to put a bad affinity as far below 1 as a good one is above.
  const affinity = 2 - Math.min(Math.max(e.km, 0.4), 1.9);
  const raw = (e.kcat * 1.1 + affinity * 0.9 + e.stability * 0.6) / 2.6
    * e.expression / Math.max(e.upkeep, 0.3) ** 0.5;
  return Number.isFinite(raw) ? raw : 1;
}

/** The rarity a cassette displays: its gene's tier, raised by a good roll. */
export function alleleRarity(gene: GeneId, a: Allele): Rarity {
  const base = RARITY_RANK[rarityOfTier(GENES[gene].tier)];
  const q = quality(a);
  // Tuned so most finds are unremarkable. A ladder where a third of drops are
  // top-tier is not a hunt; the good roll has to be worth stopping for.
  const bump = q > 1.42 ? 2 : q > 1.18 ? 1 : q < 0.97 ? -1 : 0;
  const affixes = (a.prefix ? 1 : 0) + (a.suffix ? 1 : 0);
  const rank = Math.min(Math.max(base + bump + (affixes === 2 ? 1 : 0), 0), 4);
  return (["common", "uncommon", "rare", "epic", "legendary"] as const)[rank]
    ?? "common";
}

/** "thermostable mtrC of broad specificity" */
export function alleleName(gene: GeneId, a: Allele): string {
  const parts = [
    a.prefix ? PREFIXES[a.prefix].name : "",
    GENES[gene].name,
    a.suffix ? SUFFIXES[a.suffix].name : "",
  ].filter((s) => s !== "");
  return parts.join(" ");
}

/** Lines for the item card: what this particular roll is worth. */
export function alleleReadout(a: Allele): string[] {
  const e = alleleEffect(a);
  const pct = (v: number): string =>
    `${v >= 1 ? "+" : ""}${String(Math.round((v - 1) * 100))}%`;
  const out = [
    `kcat ${pct(e.kcat)} turnover`,
    // Inverted deliberately: a low Km is a HIGH affinity.
    `Km ${pct(1 / e.km)} affinity`,
    `stability ${pct(e.stability)}`,
  ];
  if (e.expression !== 1) out.push(`expression ${pct(e.expression)}`);
  if (e.upkeep !== 1) out.push(`upkeep ${pct(e.upkeep)}`);
  if (e.promiscuous) out.push("accepts more than one substrate");
  return out;
}
