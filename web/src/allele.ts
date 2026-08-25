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
import { RARITY_RANK, rollRarity, type Rarity } from "./parts.js";
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
  /**
   * What this COPY is worth, rolled first and then made true.
   *
   * Rarity used to come from the gene's tier, so a wild-type psaA with +0% on
   * every stat displayed as RARE -- the colour described the gene rather than
   * the find, and promised something the item did not have. Now it describes
   * only this copy, and the generator guarantees it: rare and above ALWAYS
   * carry at least one affix, and the stat spread widens with the tier.
   */
  readonly rarity: Rarity;
}

/** The default: an unremarkable wild-type copy. */
export const WILD_TYPE: Allele = {
  kcat: 1, km: 1, stability: 1, prefix: null, suffix: null, rarity: "common",
};

const PREFIX_IDS = Object.keys(PREFIXES) as PrefixId[];
const SUFFIX_IDS = Object.keys(SUFFIXES) as SuffixId[];

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : lo;

/** What each tier is guaranteed to be. Roll the tier, then make it true. */
const BAND: Readonly<Record<Rarity, {
  spread: number; bias: number; affixes: number; extra: number;
}>> = {
  // spread: how far the stats may stray. bias: how far the CENTRE sits above
  // 1. affixes: guaranteed. extra: chance of one more.
  common:    { spread: 0.10, bias: 0.00, affixes: 0, extra: 0 },
  uncommon:  { spread: 0.16, bias: 0.05, affixes: 0, extra: 0.45 },
  rare:      { spread: 0.22, bias: 0.11, affixes: 1, extra: 0.20 },
  epic:      { spread: 0.27, bias: 0.18, affixes: 1, extra: 0.70 },
  legendary: { spread: 0.32, bias: 0.26, affixes: 2, extra: 0 },
};

/**
 * Roll an allele.
 *
 * The RARITY is rolled FIRST and the stats are then generated to justify it.
 * Deriving rarity from the gene's tier produced "rare" copies with nothing
 * rare about them -- a wild-type psaA at +0% on every stat, displayed in blue.
 * Rolling the tier first is the only way the label can be trusted, and it is
 * what Diablo actually does: the item's class is chosen, then affixes are
 * drawn to fill it.
 */
export function rollAllele(rng: Rng, depth: number): Allele {
  const rarity = rollRarity(rng.next(), clamp(depth, 1, 8));
  const band = BAND[rarity];

  const roll = (): number => {
    const x = rng.next(), y = rng.next();
    return 1 + band.bias + ((x + y) / 2 - 0.5) * 2 * band.spread;
  };

  let prefix: PrefixId | null = null;
  let suffix: SuffixId | null = null;
  const wanted = band.affixes + (rng.next() < band.extra ? 1 : 0);
  if (wanted >= 1) prefix = PREFIX_IDS[rng.int(PREFIX_IDS.length)] ?? null;
  if (wanted >= 2) suffix = SUFFIX_IDS[rng.int(SUFFIX_IDS.length)] ?? null;

  return {
    kcat: clamp(roll(), 0.55, 1.9),
    // Km is INVERTED: a good roll is a LOW Km. Rolling it like the others made
    // every high-tier allele worse at the one stat that matters most when the
    // substrate has nearly run out.
    km: clamp(2 - roll(), 0.55, 1.9),
    stability: clamp(roll(), 0.55, 1.9),
    prefix, suffix, rarity,
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

/**
 * The rarity a cassette displays: its own, CLAMPED to what its stats justify.
 *
 * A stored allele cannot claim legendary while carrying wild-type numbers, so
 * a hand-edited save cannot mint a colour it has not earned and the label can
 * never overstate the item.
 */
export function alleleRarity(gene: GeneId, a: Allele): Rarity {
  void gene;
  const claimed = RARITY_RANK[a.rarity];
  const q = quality(a);
  const affixes = (a.prefix ? 1 : 0) + (a.suffix ? 1 : 0);
  const earned = affixes >= 2 ? 4
    : q > 1.26 ? 3
    : affixes >= 1 ? 2
    : q > 1.05 ? 1 : 0;
  const rank = Math.min(claimed, Math.max(earned, 0));
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
  const near = (v: number): boolean => Math.abs(v - 1) < 0.02;

  // Only what actually differs. Three lines of "+0%" told you nothing and made
  // an unremarkable copy look like it had statistics.
  const out: string[] = [];
  if (!near(e.kcat)) out.push(`kcat ${pct(e.kcat)} turnover`);
  // Inverted deliberately: a low Km is a HIGH affinity.
  if (!near(e.km)) out.push(`Km ${pct(1 / e.km)} affinity`);
  if (!near(e.stability)) out.push(`stability ${pct(e.stability)}`);
  if (!near(e.expression)) out.push(`expression ${pct(e.expression)}`);
  if (!near(e.upkeep)) out.push(`upkeep ${pct(e.upkeep)}`);
  if (e.promiscuous) out.push("accepts more than one substrate");
  if (out.length === 0) out.push("an ordinary copy \u2014 nothing to distinguish it");
  return out;
}
