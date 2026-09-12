// The part catalogue.
//
// Everything the plasmid can hold, as DATA with declared effects, so adding a
// promoter or a modifier is a table entry rather than a change to the
// transcription model. This is the extensibility layer: `transcription.ts`
// reads these and knows nothing about any specific part.
//
// Why this and not an ECS: an ECS pays off when many entity KINDS need
// orthogonal behaviours composed at runtime and iterated in bulk. What is
// wanted here is composition WITHIN a part -- a gene carrying modifiers, a
// promoter carrying an activation rule -- which is a socket system, not an
// entity system. A registry of declared effects gives the same extensibility
// with static exhaustiveness, which an ECS explicitly gives up.

import { GENES, type GeneId, type Stratum } from "./biology.js";

// ---------------------------------------------------------------------------
// Promoters
// ---------------------------------------------------------------------------

export type PromoterId =
  | "j23114" | "j23106" | "j23119"        // constitutive, Anderson series
  | "pfnr" | "psoxs" | "pdsra"            // conditional on the local chemistry
  | "plac"                                // inducible
  | "pnark" | "pfe" | "pcold" | "plight"  // more conditionals: N, Fe, cold, light
  | "pbidir" | "pbianox"                  // BIDIRECTIONAL: drives both ways
  | "pquorum";                            // density-sensing

export type PromoterMode = "constitutive" | "conditional" | "inducible";

/** What a promoter can see when deciding whether to fire. */
export interface Context {
  readonly stratum: Stratum;
  /** Substrates currently carried, for inducible promoters. */
  readonly inducers: ReadonlySet<string>;
  /** Whether it is day, for light-responsive promoters. Absent means unknown
   *  (treated as day). */
  readonly light?: boolean;
  /** How many allies of your own kind are near -- for quorum sensing. The
   *  player has none, so a quorum promoter reads player density as low. */
  readonly density?: number;
}

export interface PromoterDef {
  readonly id: PromoterId;
  readonly name: string;
  readonly mode: PromoterMode;
  /** Output when fully active. */
  readonly strength: number;
  readonly kb: number;
  /** 0..1. How much of `strength` applies in this context. */
  readonly active: (c: Context) => number;
  readonly rarity: Rarity;
  readonly note: string;
  /**
   * A bidirectional promoter drives transcription BOTH ways from its site:
   * rightward as normal, and leftward to the previous terminator/promoter.
   * One part, two operons. Real divergent promoters (the lac/lacI pair, the
   * many tRNA/protein pairs in E. coli) work exactly this way. They cost more
   * kb and are rarer, because they double what a single site is worth.
   */
  readonly bidirectional?: boolean;
}

export const PROMOTERS: Readonly<Record<PromoterId, PromoterDef>> = {
  j23114: {
    id: "j23114", name: "J23114", mode: "constitutive", strength: 0.55, kb: 0.04,
    active: () => 1, rarity: "common",
    note: "Anderson series, weak. Always on, everywhere, whatever the cost.",
  },
  j23106: {
    id: "j23106", name: "J23106", mode: "constitutive", strength: 0.85, kb: 0.04,
    active: () => 1, rarity: "common",
    note: "Anderson series, medium. The workhorse.",
  },
  j23119: {
    id: "j23119", name: "J23119", mode: "constitutive", strength: 1.2, kb: 0.04,
    active: () => 1, rarity: "uncommon",
    note: "Anderson series, strong. Consensus sigma-70. Expensive to run.",
  },
  pfnr: {
    id: "pfnr", name: "PfnrS", mode: "conditional", strength: 1.35, kb: 0.12,
    // FNR carries a [4Fe-4S] cluster that oxygen destroys. This is why the
    // promoter exists: it is how a facultative anaerobe knows O2 has gone.
    active: (c) => (c.stratum.teap === "O2" ? 0.05 : 1), rarity: "rare",
    note: "FNR-dependent. Its iron-sulfur cluster is destroyed by O2, so it fires only once oxygen is gone.",
  },
  psoxs: {
    id: "psoxs", name: "PsoxS", mode: "conditional", strength: 1.25, kb: 0.1,
    // SoxR senses superoxide, which is a problem only where there is oxygen.
    active: (c) => (c.stratum.teap === "O2" ? 1 : 0.08), rarity: "rare",
    note: "SoxRS oxidative stress response. Only worth carrying where O2 can hurt you.",
  },
  pdsra: {
    id: "pdsra", name: "PdsrA", mode: "conditional", strength: 1.3, kb: 0.11,
    active: (c) => (c.stratum.donor.includes("H2S") ? 1 : 0.1), rarity: "epic",
    note: "Sulfide-responsive. Fires in the sulfidic zone and nowhere else.",
  },
  plac: {
    id: "plac", name: "Plac", mode: "inducible", strength: 1.45, kb: 0.13,
    // An inducible promoter is dead weight until you are carrying the inducer.
    active: (c) => (c.inducers.has("glucose") ? 1 : 0.02), rarity: "legendary",
    note: "Induced by sugar. Silent until you are carrying some, then the strongest thing on the ring.",
  },
  pnark: {
    id: "pnark", name: "PnarK", mode: "conditional", strength: 1.3, kb: 0.11,
    // NarL senses nitrate. This is how a denitrifier knows it has an acceptor.
    active: (c) => (c.stratum.teap === "NO3-" ? 1 : 0.08), rarity: "rare",
    note: "Nitrate-responsive. Fires in the denitrifying zone, where NO3- is the acceptor.",
  },
  pfe: {
    id: "pfe", name: "Pfur", mode: "conditional", strength: 1.3, kb: 0.1,
    // Fur represses in the presence of iron; the promoter fires where Fe is the acceptor.
    active: (c) => (c.stratum.teap === "Fe(III)" || c.stratum.teap === "Mn(IV)" ? 1 : 0.08),
    rarity: "rare",
    note: "Fur-controlled. On where iron and manganese are the electron acceptors.",
  },
  pcold: {
    id: "pcold", name: "PcspA", mode: "conditional", strength: 1.2, kb: 0.09,
    // The cspA promoter is the archetypal cold-shock promoter. Fires at night,
    // when the column cools.
    active: (c) => (c.light === false ? 1 : 0.15), rarity: "uncommon",
    note: "Cold-shock promoter. Fires at night when the water cools; weak by day.",
  },
  plight: {
    id: "plight", name: "PpsbA", mode: "conditional", strength: 1.2, kb: 0.09,
    // The psbA promoter is light-regulated: a phototroph's whole day cycle.
    active: (c) => (c.light === false ? 0.15 : 1), rarity: "uncommon",
    note: "Light-regulated. Strong by day, nearly off at night. The phototroph's clock.",
  },
  pbidir: {
    id: "pbidir", name: "Pdiv", mode: "constitutive", strength: 0.9, kb: 0.14,
    active: () => 1, rarity: "epic", bidirectional: true,
    note: "A divergent promoter. Drives one operon rightward and another leftward from the same site.",
  },
  pbianox: {
    id: "pbianox", name: "PdivFNR", mode: "conditional", strength: 1.25, kb: 0.18,
    active: (c) => (c.stratum.teap === "O2" ? 0.05 : 1), rarity: "legendary",
    bidirectional: true,
    note: "FNR-controlled AND divergent. Two anaerobic operons from one site, silent in oxygen.",
  },
  pquorum: {
    id: "pquorum", name: "Plux", mode: "conditional", strength: 1.4, kb: 0.12,
    // LuxR senses autoinducer. A lone cell has no quorum; the player is
    // always alone, so this rewards... nothing, unless density is supplied.
    active: (c) => ((c.density ?? 0) >= 3 ? 1 : 0.12), rarity: "epic",
    note: "Quorum-sensing. Fires only when enough of your kind are near. A lone cell gets little from it.",
  },
};

export const PROMOTER_IDS = Object.keys(PROMOTERS) as PromoterId[];

// ---------------------------------------------------------------------------
// Terminators
// ---------------------------------------------------------------------------

export type TerminatorId = "hairpin" | "rrnbt1" | "rrnbt1t2" | "trpa"
  | "leaky"       // a deliberate half-stop: a weak secondary operon
  | "riboswitch"  // conditional: opens in one zone, seals elsewhere
  | "attenuator"; // opens under starvation, seals when fed

export interface TerminatorDef {
  readonly id: TerminatorId;
  readonly name: string;
  /** Fraction of transcription that continues PAST it, 0..1. */
  readonly readthrough: number;
  readonly kb: number;
  readonly rarity: Rarity;
  readonly note: string;
  /**
   * A CONDITIONAL terminator: readthrough in this context, overriding the
   * flat value. A riboswitch is a terminator that opens when it binds its
   * ligand; an attenuator opens under starvation. These make a single
   * transcript SPLIT differently depending on where you are -- one operon in
   * the oxic zone, two in the sulfidic. Absent means flat.
   */
  readonly readthroughIn?: (c: Context) => number;
}

/**
 * Terminator efficiency is measured as readthrough, and it is never zero.
 * Tandem terminators are standard practice precisely because a single one
 * leaks -- which is what makes stacking them a real decision rather than
 * decoration.
 */
export const TERMINATORS: Readonly<Record<TerminatorId, TerminatorDef>> = {
  hairpin: {
    id: "hairpin", rarity: "common", name: "hairpin", readthrough: 0.38, kb: 0.02,
    note: "A bare stem-loop. Leaks badly: over a third of transcription carries on downstream.",
  },
  trpa: {
    id: "trpa", rarity: "common", name: "trpA", readthrough: 0.2, kb: 0.03,
    note: "Intrinsic terminator from the trp operon. Respectable, not tight.",
  },
  rrnbt1: {
    id: "rrnbt1", rarity: "uncommon", name: "rrnB T1", readthrough: 0.1, kb: 0.04,
    note: "The standard single terminator. Roughly 90% efficient.",
  },
  rrnbt1t2: {
    id: "rrnbt1t2", rarity: "epic", name: "rrnB T1T2", readthrough: 0.02, kb: 0.08,
    note: "Tandem T1 and T2. Costs twice the space and leaks a fifth as much.",
  },
  leaky: {
    id: "leaky", rarity: "uncommon", name: "leaky stem", readthrough: 0.55, kb: 0.02,
    note: "A weak hairpin that lets half the polymerase through. For a secondary operon you want running at half strength.",
  },
  riboswitch: {
    id: "riboswitch", rarity: "rare", name: "riboswitch", readthrough: 0.08, kb: 0.05,
    // A sulfide-sensing riboswitch: sealed in oxygen, open where H2S is.
    readthroughIn: (c) => (c.stratum.donor.includes("H2S") ? 0.85 : 0.08),
    note: "Conditional. Sealed in the oxic zone; opens where sulfide is, so what is behind it wakes up as you descend.",
  },
  attenuator: {
    id: "attenuator", rarity: "epic", name: "attenuator", readthrough: 0.12, kb: 0.06,
    // trp-style attenuation: the leader stalls when starved and the terminator
    // does not form. Opens when you carry NO inducer -- starved -- and seals
    // when you are fed.
    readthroughIn: (c) => (c.inducers.size === 0 ? 0.8 : 0.12),
    note: "Attenuation. Opens when the cell is starved, seals when it is carrying substrate. What lies past it is your famine response.",
  },
};

export const TERMINATOR_IDS = Object.keys(TERMINATORS) as TerminatorId[];

// ---------------------------------------------------------------------------
// Gene modifiers
// ---------------------------------------------------------------------------

export type ModifierId =
  | "codon" | "rbs" | "chaperone" | "ssra" | "signal" | "fusion";

export interface ModifierEffect {
  /** Multiplies this gene's expression. */
  readonly expression?: number;
  /** Added to the gene's length, in kb. */
  readonly kb?: number;
  /** Multiplies this gene's contribution to combat power. */
  readonly power?: number;
  /** Multiplies the ATP this gene costs to run. */
  readonly upkeep?: number;
  /** Reduces polarity decay for genes downstream of this one. */
  readonly polarityRelief?: number;
}

export interface ModifierDef {
  readonly id: ModifierId;
  readonly name: string;
  readonly effect: ModifierEffect;
  readonly rarity: Rarity;
  readonly note: string;
}

export const MODIFIERS: Readonly<Record<ModifierId, ModifierDef>> = {
  codon: {
    id: "codon", rarity: "uncommon", name: "codon optimised", effect: { expression: 1.65 },
    note: "Rare codons replaced. The single largest win available on most genes.",
  },
  rbs: {
    id: "rbs", rarity: "uncommon", name: "strong RBS", effect: { expression: 1.3, kb: 0.02 },
    note: "A stronger ribosome binding site. Translation initiation is usually the bottleneck.",
  },
  chaperone: {
    id: "chaperone", rarity: "epic", name: "chaperone fusion", effect: { power: 1.35, kb: 0.9, upkeep: 1.2 },
    note: "Fused folding chaperone. More of what you make ends up correctly folded, and it costs.",
  },
  ssra: {
    id: "ssra", rarity: "rare", name: "ssrA degradation tag", effect: { expression: 0.55, upkeep: 0.45 },
    note: "Tagged for rapid proteolysis. Much cheaper to carry, much less of it around.",
  },
  signal: {
    id: "signal", rarity: "rare", name: "secretion signal", effect: { power: 1.25, kb: 0.2, upkeep: 1.1 },
    note: "Sec-dependent export. The enzyme works outside the cell, where the substrate is.",
  },
  fusion: {
    id: "fusion", rarity: "legendary", name: "operon linker", effect: { polarityRelief: 0.6, kb: 0.15 },
    note: "A translational coupler. Genes downstream of this one lose far less to polarity.",
  },
};

export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];

/** How many modifiers a gene can hold at a given evolution level. */
export const modifierSlots = (level: number): number =>
  Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL) === 1 ? 1
    : Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL) >= 4 ? 3 : 2;

// ---------------------------------------------------------------------------
// Directed evolution
// ---------------------------------------------------------------------------

export const MAX_LEVEL = 5;

/** Efficacy multiplier from directed evolution. */
export function levelMultiplier(level: number): number {
  const l = Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL);
  return 1 + (l - 1) * 0.22;
}

/** ATP to take a gene from `level` to the next. Rises steeply. */
export function evolutionCost(level: number, gene: GeneId): number {
  const l = Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL);
  if (l >= MAX_LEVEL) return Infinity;
  return Math.round((28 + GENES[gene].tier * 9) * l ** 1.6);
}

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

export type Rarity =
  | "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface RarityDef {
  readonly id: Rarity;
  readonly name: string;
  readonly colour: string;
  /** Relative weight when rolling a drop. */
  readonly weight: number;
}

/** The classic ladder, in the colours everyone already reads without being
 *  told: grey, green, blue, purple, orange. */
export const RARITY: Readonly<Record<Rarity, RarityDef>> = {
  common:    { id: "common",    name: "common",    colour: "#9aa5a0", weight: 100 },
  uncommon:  { id: "uncommon",  name: "uncommon",  colour: "#4fd07a", weight: 40 },
  rare:      { id: "rare",      name: "rare",      colour: "#4aa3f0", weight: 15 },
  epic:      { id: "epic",      name: "epic",      colour: "#b45cf0", weight: 5 },
  legendary: { id: "legendary", name: "legendary", colour: "#f0902a", weight: 1.5 },
};

/** Rank, for comparisons and for sorting an inventory. */
export const RARITY_RANK: Readonly<Record<Rarity, number>> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};

/**
 * A gene's rarity follows its tier, which already encodes how deep you must
 * go and how much it does. Deriving it means the two can never disagree.
 */
export function rarityOfTier(tier: number): Rarity {
  if (tier <= 1) return "common";
  if (tier <= 3) return "uncommon";
  if (tier <= 5) return "rare";
  if (tier <= 7) return "epic";
  return "legendary";
}

export const RARITY_IDS = Object.keys(RARITY) as Rarity[];

/** Everything of a given rarity, so a loot table is a filter not a second list. */
export function partsOfRarity(r: Rarity): {
  promoters: PromoterId[]; terminators: TerminatorId[]; modifiers: ModifierId[];
} {
  return {
    promoters: PROMOTER_IDS.filter((id) => PROMOTERS[id].rarity === r),
    terminators: TERMINATOR_IDS.filter((id) => TERMINATORS[id].rarity === r),
    modifiers: MODIFIER_IDS.filter((id) => MODIFIERS[id].rarity === r),
  };
}

/** Roll a rarity. Deeper strata skew richer, which is the reason to descend. */
export function rollRarity(roll: number, depth: number): Rarity {
  const bias = 1 + Math.min(Math.max(depth, 1), 8) * 0.16;
  const weights = RARITY_IDS.map((id) =>
    RARITY[id].weight * (id === "common" ? 1 : bias));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = (Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999) : 0) * total;
  for (let i = 0; i < RARITY_IDS.length; i++) {
    t -= weights[i] ?? 0;
    if (t < 0) return RARITY_IDS[i] ?? "common";
  }
  return "common";
}
