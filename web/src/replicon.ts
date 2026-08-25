// Replicons: which plasmid you are carrying, not just what is on it.
//
// The request was for separate attack / defence / utility plasmids. Bacteria
// really do carry several plasmids at once -- but they are not divided by
// function, they are divided by REPLICON: the origin and its copy-control
// machinery. That distinction is more interesting than a labelled slot,
// because it comes with two real constraints that generate builds on their
// own:
//
//   COPY NUMBER. A pUC-family origin sits at hundreds of copies per cell and a
//   BAC sits at one. Copy number multiplies expression directly and multiplies
//   metabolic burden with it. A small high-copy replicon carrying one enzyme
//   is a genuinely different strategy from a large single-copy one carrying a
//   whole pathway.
//
//   INCOMPATIBILITY. Two plasmids sharing a replication control system cannot
//   be stably maintained together -- they partition against each other and one
//   is lost. Inc groups are why a strain can carry four plasmids and not five
//   of the same kind. This is the constraint that makes "which plasmids" a
//   decision rather than "all of them".
//
// So the class you end up playing is not chosen from a menu. It falls out of
// which replicons you have found and what you decided to put on each.

export type RepliconId = "puc" | "pbr322" | "psc101" | "bac" | "rsf1010";

/** Incompatibility group. Two replicons in the same group cannot coexist. */
export type IncGroup = "ColE1" | "IncP" | "IncQ" | "IncF";

/**
 * The one thing this backbone does that no other does.
 *
 * Five points on a single line -- more copies, fewer slots -- is a stat block,
 * not a decision: every replicon sat on the same trade and there was never a
 * reason to prefer one over its neighbour. Each carries a RULE now, and every
 * rule is something the real plasmid actually does.
 */
export type Signature =
  /** Copy number tracks the energy available. Real: pUC's copy control is
   *  temperature-sensitive and genuinely runs away, to hundreds of copies. */
  | "runaway"
  /** Size costs nothing. Real: a BAC carries three hundred kilobases without
   *  complaint, because one copy is one copy however long it is. */
  | "roomy"
  /** Actively partitioned, so nothing is lost and nothing is silenced. Real:
   *  pSC101 carries a par locus; that is why it is the stable one. */
  | "partitioned"
  /** Survives the host. Real: IncQ plasmids are MOBILISABLE -- they transfer
   *  themselves into another cell, which is how resistance spreads. */
  | "mobilisable"
  /** Nothing. The baseline everything else is measured against. */
  | "plain";

export interface RepliconDef {
  readonly id: RepliconId;
  readonly name: string;
  readonly inc: IncGroup;
  /** Copies per cell. Multiplies expression AND burden. */
  readonly copies: number;
  /** Ring positions. */
  readonly slots: number;
  /** How much DNA it will carry before burden bites. */
  readonly capacityKb: number;
  /** Strain level at which this becomes available. */
  readonly unlock: number;
  readonly signature: Signature;
  /** What the signature does, in one line, for the bench. */
  readonly rule: string;
  readonly note: string;
}

export const REPLICONS: Readonly<Record<RepliconId, RepliconDef>> = {
  psc101: {
    id: "psc101", name: "pSC101", inc: "IncF", copies: 5, slots: 12,
    capacityKb: 16, unlock: 1, signature: "partitioned",
    rule: "immune to hazards: intermediates never accumulate",
    note: "The first plasmid ever cloned into. It carries a partition locus, which is why it is the stable one -- nothing is lost and nothing goes wrong.",
  },
  pbr322: {
    id: "pbr322", name: "pBR322", inc: "ColE1", copies: 20, slots: 16,
    capacityKb: 18, unlock: 1, signature: "plain",
    rule: "no tricks; the backbone everything else is measured against",
    note: "The workhorse of early cloning. Moderate copy number and room to arrange a real operon.",
  },
  puc: {
    id: "puc", name: "pUC19", inc: "ColE1", copies: 90, slots: 10,
    capacityKb: 11, unlock: 3, signature: "runaway",
    rule: "copy number tracks your ATP: enormous when flush, feeble when starved",
    note: "A crippled copy-control mutant. Its replication is not held in check, so it runs away when the cell can afford it and collapses when it cannot.",
  },
  rsf1010: {
    id: "rsf1010", name: "RSF1010", inc: "IncQ", copies: 14, slots: 14,
    capacityKb: 20, unlock: 5, signature: "mobilisable",
    rule: "survives the host: half its genes pass to the next strain",
    note: "Broad host range and mobilisable. It carries the machinery to transfer itself into another cell, which is how resistance crosses species.",
  },
  bac: {
    id: "bac", name: "BAC (F-derived)", inc: "IncF", copies: 1, slots: 22,
    capacityKb: 44, unlock: 7, signature: "roomy",
    rule: "size costs nothing: no burden however much DNA you load",
    note: "Single copy. One copy is one copy however long it is, so a BAC will carry three hundred kilobases without complaint -- and express all of it faintly.",
  },
};

export const REPLICON_IDS = Object.keys(REPLICONS) as RepliconId[];

/**
 * Expression multiplier from copy number.
 *
 * Compressed hard: gene dosage is real but it is not linear, because
 * transcription and translation saturate long before the DNA does. A
 * ninety-fold copy difference is worth roughly three-fold in product, which is
 * what keeps a BAC playable and a pUC from being simply correct.
 *
 * NORMALISED to pBR322. The whole ATP and combat economy was tuned against a
 * single implicit plasmid; making that plasmid the baseline means introducing
 * replicons re-balances nothing, and every other one is a deliberate deviation
 * from a known-good centre.
 */
const BASELINE_COPIES = 20;      // pBR322: the replicon everything is tuned against

export const dosage = (copies: number): number =>
  Math.pow(Math.max(Number.isFinite(copies) ? copies : 1, 1), 0.28)
  / Math.pow(BASELINE_COPIES, 0.28);

/** Burden multiplier from copy number. Replicating a high-copy plasmid is
 *  most of what it costs to carry one. */
export const copyBurden = (copies: number): number =>
  (1 + Math.log2(Math.max(Number.isFinite(copies) ? copies : 1, 1)) * 0.22)
  / (1 + Math.log2(BASELINE_COPIES) * 0.22);

/** Which replicons a strain of this level may carry. */
export function availableAt(level: number): RepliconDef[] {
  const l = Number.isFinite(level) ? level : 1;
  return REPLICON_IDS.map((id) => REPLICONS[id]).filter((r) => r.unlock <= l);
}

/** Can these coexist? Two of one Inc group cannot. */
export function compatible(ids: readonly RepliconId[]): boolean {
  const groups = ids.map((id) => REPLICONS[id].inc);
  return new Set(groups).size === groups.length;
}

/** Why not, in words. */
export function incompatibleReason(
  held: readonly RepliconId[], add: RepliconId,
): string | null {
  const clash = held.find((h) => REPLICONS[h].inc === REPLICONS[add].inc);
  if (clash === undefined) return null;
  return `${REPLICONS[add].name} and ${REPLICONS[clash].name} share `
    + `incompatibility group ${REPLICONS[add].inc}. They partition against `
    + `each other and one will be lost.`;
}


/**
 * Effective copy number.
 *
 * A runaway replicon is not held in check by the cell, so it replicates as
 * hard as the energy budget allows: hundreds of copies when flush, a handful
 * when starved. Everything else sits at its nominal number.
 *
 * `energy` is the ATP fraction, 0..1.
 */
export function effectiveCopies(def: RepliconDef, energy: number): number {
  if (def.signature !== "runaway") return def.copies;
  const e = Number.isFinite(energy) ? Math.min(Math.max(energy, 0), 1) : 0.5;
  // A wide swing, because that is the point of taking it. Dosage is
  // compressed (copies^0.28), so a modest range in copies is almost no range
  // in product -- it has to be an order of magnitude to be felt.
  return Math.max(def.copies * (0.08 + e * 1.4), 1);
}
