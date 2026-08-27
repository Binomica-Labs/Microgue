// The lab: what persists when the strain does not.
//
// A run is one strain sent down the column. When it dies, it dies -- there is
// no resynthesising it in place and carrying on. What survives is what a lab
// actually keeps: the sequence data, the notebook, and the standing order with
// the synthesis company.
//
// That framing is not decoration. Modern molecular biology is largely "order
// the construct" -- you do not isolate a gene from an organism any more, you
// pay someone to write it. So SYNTHESIS CREDIT earned by one strain buys
// constructs for the next, and the meta-progression is the laboratory getting
// better funded rather than the microbe getting mysteriously stronger.
//
// The ledger is the other half. Every run is recorded: how deep, how long,
// what killed it. Crawl keeps morgue files for the same reason -- the record
// of the attempts IS the long game.

import { GENES, stratum, type GeneId } from "./biology.js";
import { MAX_FLOOR, strataOf } from "./dungeon.js";
import { BASE_SLOTS, MAX_SLOTS, capacityFor, slotsFor } from "./chromosome.js";
import { BIN_CAP, STARTING_PARTS } from "./plasmid.js";
import { MAX_STRAIN } from "./strain.js";

export interface RunRecord {
  /** Which attempt this was, counting from one. */
  readonly n: number;
  readonly floor: number;
  readonly stratum: string;
  readonly turns: number;
  readonly catalogued: number;
  readonly killedBy: string;
  readonly credit: number;
  /** True if the strain reached the bottom and cleared it. */
  readonly won: boolean;
  /** The last few things that happened, so a death is never a dead end. */
  readonly epitaph: readonly string[];
}

export interface Lab {
  credit: number;
  /** Deepest floor any strain has reached. The number that matters. */
  deepestEver: number;
  /** Every attempt, newest last. Capped; see recordRun. */
  ledger: RunRecord[];
  /** Genes ordered from synthesis, present on every future strain. */
  stock: GeneId[];
  /** Cassette sites every future strain starts with. */
  startSites: number;
  /** Head start on strain level. */
  startStrain: number;
}

export const newLab = (): Lab => ({
  credit: 0, deepestEver: 0, ledger: [], stock: [],
  startSites: 0, startStrain: 1,
});

/** Ledger entries kept. Enough to see a trend, not enough to bloat a save. */
export const LEDGER_CAP = 40;

export interface RunOutcome {
  readonly floor: number;
  readonly turns: number;
  readonly catalogued: number;
  readonly bossesCleared: number;
  readonly genesCarried: number;
  readonly bestAllele: number;
  readonly killedBy: string;
  readonly won: boolean;
}

/**
 * Synthesis credit earned by a run.
 *
 * Depth dominates, because depth is the game. But it cannot be the only term
 * or the optimal play is to dive blindly past everything, and the column is
 * supposed to be studied as well as survived -- so cataloguing, clearing
 * strata and the quality of what you recovered all pay.
 */
/** What ground already covered is worth. Not nothing -- you still bring back
 *  samples -- but not what it paid the first time. */
const REPEAT = 0.22;

/**
 * Synthesis credit earned by a run.
 *
 * Depth dominates, because depth is the game. But it cannot be the only term
 * or the optimal play is to dive blindly past everything, so cataloguing,
 * clearing strata and the quality of what you recovered all pay.
 *
 * **Ground already covered pays a fraction.** Three hundred instant deaths on
 * the first floor earned 2700 credit -- more per SECOND than descending -- so
 * the optimal strategy was to kill yourself repeatedly. A lab learns nothing
 * from the three hundredth identical failure, and now it is paid accordingly:
 * full rate for floors deeper than any strain has reached, a fifth for
 * retreading.
 */
export function creditFor(o: RunOutcome, deepestEver = 0): number {
  const floor = Math.min(Math.max(finite(o.floor, 1), 1), MAX_FLOOR);
  const known = Math.min(Math.max(finite(deepestEver, 0), 0), MAX_FLOOR);
  const retrod = Math.min(floor, known);
  const fresh = Math.max(floor - known, 0);

  const total =
      fresh * 9 + retrod * 9 * REPEAT
    + Math.max(finite(o.catalogued, 0), 0) * 7
    + Math.max(finite(o.bossesCleared, 0), 0) * 30
    + Math.max(finite(o.genesCarried, 0), 0) * 4
    // A well-rolled allele is knowledge worth banking even if the strain died.
    + Math.max(finite(o.bestAllele, 1) - 1, 0) * 60
    + (o.won ? 400 : 0);
  return Math.max(Math.round(total), 2);
}

const finite = (v: number, fallback: number): number =>
  Number.isFinite(v) ? v : fallback;

/** Add a run to the ledger and bank its credit. */
export function recordRun(
  lab: Lab, o: RunOutcome, credit: number, epitaph: readonly string[] = [],
): RunRecord {
  const floor = Math.min(Math.max(finite(o.floor, 1), 1), MAX_FLOOR);
  const rec: RunRecord = {
    n: lab.ledger.length + 1,
    floor,
    stratum: stratum(strataOf(floor)).name,
    turns: Math.max(Math.round(finite(o.turns, 0)), 0),
    catalogued: Math.max(Math.round(finite(o.catalogued, 0)), 0),
    killedBy: o.killedBy,
    credit: Math.max(Math.round(finite(credit, 0)), 0),
    won: o.won,
    epitaph: epitaph.slice(-8),
  };
  lab.ledger.push(rec);
  while (lab.ledger.length > LEDGER_CAP) lab.ledger.shift();
  lab.credit += rec.credit;
  lab.deepestEver = Math.max(lab.deepestEver, floor);
  return rec;
}

// ---------------------------------------------------------------------------
// The catalogue you can order from
// ---------------------------------------------------------------------------

export type OfferId =
  | { kind: "gene"; gene: GeneId }
  | { kind: "sites" }
  | { kind: "strain" };

export interface Offer {
  readonly id: OfferId;
  readonly name: string;
  readonly price: number;
  readonly note: string;
  /** Already bought, or otherwise unavailable. */
  readonly owned: boolean;
}

/** What a gene costs to have synthesised. Longer and more complex is dearer,
 *  which is exactly how real synthesis is priced. */
export function genePrice(gene: GeneId): number {
  const g = GENES[gene];
  return Math.round(30 + g.kb * 22 + g.tier * 18);
}

/**
 * Bounded as well as checked.
 *
 * This already tested `Number.isFinite(owned)` -- and 1e308 is finite, so
 * `1.5 ** 1e308` overflowed to Infinity and the shop offered a site at an
 * infinite price. Same shape as the lysis seed and the map viewport: the
 * guard has to be on MAGNITUDE, not just on finiteness. Clamped to the range
 * the chromosome actually has.
 */
export const sitesPrice = (owned: number): number => {
  const n = Math.min(Math.max(Number.isFinite(owned) ? owned : 0, 0), MAX_SLOTS - BASE_SLOTS);
  return Math.round(160 * Math.pow(1.5, n));
};

/** As above, and this one had no guard at all: NaN ** 1.35 is NaN. */
export const strainPrice = (level: number): number => {
  const l = Math.min(Math.max(Number.isFinite(level) ? level : 1, 1), MAX_STRAIN);
  return Math.round(140 * l ** 1.35);
};

/**
 * The order form.
 *
 * Only genes the lab has actually SEEN are offered. You cannot order a
 * construct for an organism nobody has sequenced, and it keeps the first
 * shop small enough to read.
 */
/**
 * How many constructs a strain can actually carry to the column.
 *
 * The bin holds BIN_CAP parts and the starting vector already occupies some of
 * it. Ordering more than this used to be possible and the surplus was SILENTLY
 * DROPPED at inoculation -- credit spent on genes that never arrived, which is
 * the worst kind of bug because nothing anywhere said so.
 */
/**
 * How many constructs a strain can usefully carry down.
 *
 * Derived from the CHROMOSOME the lab has paid for, not from the bin. The bin
 * is about carrying; the chromosome is about using. A flat cap of eleven sold
 * eleven constructs to a strain with five free ring positions -- credit spent
 * on genes that sit in the bin for most of a run.
 *
 * Two spare, because swapping one out for a better roll is normal play. Still
 * bounded by the bin, which has to hold them all at once.
 */
export function stockCap(startSites: number): number {
  const ring = slotsFor(startSites, 0);
  const usable = ring - VECTOR_PARTS + 2;
  return Math.max(Math.min(usable, BIN_CAP - STARTING_PARTS), 3);
}

/** Positions the starting vector occupies on the ring: promoter, origin,
 *  terminator. */
const VECTOR_PARTS = 3;

export function offers(lab: Lab, seen: readonly GeneId[]): Offer[] {
  const out: Offer[] = [];
  const known = [...new Set(seen)].filter((g) => g !== "ori");
  known.sort((a, b) => GENES[a].tier - GENES[b].tier || a.localeCompare(b));

  const cap = stockCap(lab.startSites);
  const full = lab.stock.length >= cap;
  for (const gene of known) {
    const have = lab.stock.includes(gene);
    out.push({
      id: { kind: "gene", gene },
      name: GENES[gene].name,
      price: genePrice(gene),
      note: full && !have
        ? `no room — this strain carries ${String(cap)} constructs`
        : GENES[gene].product,
      // A full manifest reads as owned: it cannot be ordered either way, and
      // showing it as affordable would invite spending on nothing.
      owned: have || full,
    });
  }
  // A bigger chromosome to begin with. Bought repeatedly, dearer each time,
  // so the lab grows the LINE rather than picking a backbone off a shelf.
  if (lab.startSites < MAX_SLOTS - BASE_SLOTS) {
    const slots = slotsFor(lab.startSites, 0);
    out.push({
      id: { kind: "sites" },
      name: `start with ${String(slots + 1)} cassette sites`,
      price: sitesPrice(lab.startSites),
      note: `${capacityFor(slots + 1, 0).toFixed(1)} kb of headroom, from turn one`,
      owned: false,
    });
  }
  if (lab.startStrain < MAX_STRAIN) {
    out.push({
      id: { kind: "strain" },
      name: `start at strain L${String(lab.startStrain + 1)}`,
      price: strainPrice(lab.startStrain),
      note: "more ring positions and more headroom, from turn one",
      owned: false,
    });
  }
  return out;
}

export type BuyResult = { ok: true; spent: number } | { ok: false; err: string };

/** Spend credit. Validates fully before it changes anything. */
export function buy(lab: Lab, offer: Offer): BuyResult {
  if (offer.owned) return { ok: false, err: "already ordered" };
  // A non-finite price does not block a purchase, it unlocks every purchase:
  // `credit < NaN` is FALSE, so the sale goes through, `credit -= NaN` makes
  // the credit NaN, and from then on every comparison is false and the whole
  // shop is free for the rest of the session. Defence in depth -- the prices
  // are guarded at source too, but a future pricing bug must not be able to
  // turn into free money.
  if (!Number.isFinite(offer.price) || offer.price < 0) {
    return { ok: false, err: "that order could not be priced" };
  }
  if (!Number.isFinite(lab.credit)) lab.credit = 0;
  if (lab.credit < offer.price) {
    return { ok: false, err: `needs ${String(offer.price)} credit` };
  }
  switch (offer.id.kind) {
    case "gene":
      if (lab.stock.includes(offer.id.gene)) {
        return { ok: false, err: "already ordered" };
      }
      if (lab.stock.length >= stockCap(lab.startSites)) {
        return { ok: false,
                 err: `this strain carries ${String(stockCap(lab.startSites))} `
                   + "constructs; a bigger chromosome carries more" };
      }
      lab.stock.push(offer.id.gene);
      break;
    case "sites":
      if (lab.startSites >= MAX_SLOTS - BASE_SLOTS) {
        return { ok: false, err: "already fully grown" };
      }
      lab.startSites += 1;
      break;
    case "strain":
      if (lab.startStrain >= MAX_STRAIN) {
        return { ok: false, err: "already fully adapted" };
      }
      lab.startStrain += 1;
      break;
  }
  lab.credit -= offer.price;
  return { ok: true, spent: offer.price };
}

/** One line summarising the lab, for a header. */
export function describeLab(lab: Lab): string {
  const best = lab.deepestEver;
  return `${String(lab.credit)} credit · ${String(lab.ledger.length)} strains sent · `
    + (best > 0
      ? `deepest F${String(best)} (${stratum(strataOf(best)).name})`
      : "none returned yet");
}
