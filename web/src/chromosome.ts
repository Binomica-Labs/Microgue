// The chromosome.
//
// One replicon, not a menu of them. A bacterial chromosome is a single
// circular molecule that GROWS: genes arrive by horizontal transfer and are
// integrated, and the machinery for doing that is real and well described.
// An INTEGRON is literally a site that accepts gene cassettes one after
// another, each with its own promoter, and the array grows as more are
// captured. That is a slot system that already exists in biology.
//
// So the chromosome starts small and you buy room on it. Expansion is paid in
// ATP because replicating and maintaining more DNA is what it actually costs a
// cell -- every extra kilobase is copied at every division, for ever.
//
// The old design offered five backbones to choose between, which was a menu of
// alternatives rather than a thing that grew. What was worth keeping from it
// were the SIGNATURES -- runaway copy control, active partitioning, mobility --
// and those are better as architecture you invest in than as a fork in the
// road. They are traits now: one chromosome, progressively rebuilt.

export const BASE_SLOTS = 8;
export const BASE_CAPACITY_KB = 9;
/** Ceiling. The array is sized for this; nothing may exceed it. */
export const MAX_SLOTS = 24;

/** Kilobases of headroom each integrated site brings with it. */
export const KB_PER_SLOT = 1.35;

/**
 * ATP to integrate one more cassette site.
 *
 * Steeply super-linear: each integration is a larger molecule to replicate
 * than the last, and the point is that late expansion competes with everything
 * else the energy could have done.
 */
export function expansionCost(current: number): number {
  const n = Math.min(Math.max(Math.round(Number.isFinite(current) ? current : BASE_SLOTS),
                              BASE_SLOTS), MAX_SLOTS);
  if (n >= MAX_SLOTS) return Infinity;
  const step = n - BASE_SLOTS;
  // Rises, but it has to stay inside the energy a cell of that size can hold.
  // At 1.42 per step the eighth site cost 744 against a 100 ATP ceiling, so
  // thirteen of sixteen expansions and every trait were simply unreachable --
  // eighty percent of the system was decoration.
  return Math.round(35 * Math.pow(1.16, step));
}

/**
 * How much ATP a cell of this size can hold.
 *
 * A bigger, better-adapted cell stores more: the pool scales with biomass, and
 * a strain that has grown its chromosome and learned the column has more of
 * both. This is what makes the growth curve reachable at all -- the costs rise
 * and so does the budget that pays them.
 */
export function atpCeiling(integrated: number, strain: number): number {
  const i = Math.min(Math.max(Number.isFinite(integrated) ? integrated : 0, 0),
                     MAX_SLOTS - BASE_SLOTS);
  const s = Math.min(Math.max(Number.isFinite(strain) ? strain : 1, 1), 8);
  return Math.round(BASE_ATP + (s - 1) * 22 + i * 6);
}

export const BASE_ATP = 100;

export type TraitId = "partitioned" | "runaway" | "mobilisable";

export interface TraitDef {
  readonly id: TraitId;
  readonly name: string;
  /** ATP to acquire. Once only. */
  readonly cost: number;
  readonly rule: string;
  readonly note: string;
}

/**
 * Architecture, bought once each and kept.
 *
 * Every one is something a real replicon does, and every one is a different
 * KIND of advantage -- not a number on the same axis.
 */
export const TRAITS: Readonly<Record<TraitId, TraitDef>> = {
  partitioned: {
    id: "partitioned", name: "par locus", cost: 130,
    rule: "intermediates never accumulate: immune to hazards",
    note: "An active partition system. Faithful segregation means no daughter is ever left holding half a pathway, which is where toxic intermediates come from.",
  },
  runaway: {
    id: "runaway", name: "relaxed copy control", cost: 190,
    rule: "copy number tracks your ATP: enormous when flush, feeble when starved",
    note: "The copy-control circuit is broken, as in pUC. Replication runs as hard as the energy budget allows, and collapses when it cannot.",
  },
  mobilisable: {
    id: "mobilisable", name: "oriT and relaxase", cost: 260,
    rule: "survives the host: half its loci pass to the next strain",
    note: "An origin of transfer and the enzyme to nick it. The molecule can move itself into another cell, which is how resistance crosses species.",
  },
};

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** Usable ring positions from integrated sites plus whatever the strain earned. */
export function slotsFor(integrated: number, bonus: number): number {
  const i = Math.min(Math.max(Number.isFinite(integrated) ? Math.round(integrated) : 0, 0),
                     MAX_SLOTS - BASE_SLOTS);
  const b = Math.max(Number.isFinite(bonus) ? Math.round(bonus) : 0, 0);
  return Math.min(BASE_SLOTS + i + b, MAX_SLOTS);
}

/** Headroom in kilobases, which grows with the molecule. */
export function capacityFor(slots: number, bonusKb: number): number {
  const s = Math.min(Math.max(Number.isFinite(slots) ? slots : BASE_SLOTS,
                              BASE_SLOTS), MAX_SLOTS);
  const b = Number.isFinite(bonusKb) ? Math.max(bonusKb, 0) : 0;
  return BASE_CAPACITY_KB + (s - BASE_SLOTS) * KB_PER_SLOT + b;
}

/**
 * Effective copy number.
 *
 * A chromosome is single-copy. Relaxed copy control breaks that, and then it
 * replicates as hard as the energy budget allows.
 */
export function copiesFor(hasRunaway: boolean, energy: number): number {
  if (!hasRunaway) return 1;
  const e = Number.isFinite(energy) ? Math.min(Math.max(energy, 0), 1) : 0.5;
  return Math.max(1 + e * 60, 1);
}


// ---------------------------------------------------------------------------
// Gene dosage
//
// Kept from the replicon design, which is otherwise gone. Copy number still
// matters -- relaxed copy control is a trait -- and the compression is the
// part worth preserving: transcription and translation saturate long before
// the DNA does, so a ninety-fold copy difference is worth roughly three-fold
// in product. Normalised to 20 copies, which is what the whole ATP and combat
// economy was tuned against.

const BASELINE_COPIES = 20;      // pBR322: the replicon everything is tuned against

export const dosage = (copies: number): number =>
  Math.pow(Math.max(Number.isFinite(copies) ? copies : 1, 1), 0.28)
  / Math.pow(BASELINE_COPIES, 0.28);

/** Burden multiplier from copy number. Replicating a high-copy plasmid is
 *  most of what it costs to carry one. */
export const copyBurden = (copies: number): number =>
  (1 + Math.log2(Math.max(Number.isFinite(copies) ? copies : 1, 1)) * 0.22)
  / (1 + Math.log2(BASELINE_COPIES) * 0.22);
