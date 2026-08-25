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
import { REPLICONS, type RepliconId } from "./replicon.js";
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
}

export interface Lab {
  credit: number;
  /** Deepest floor any strain has reached. The number that matters. */
  deepestEver: number;
  /** Every attempt, newest last. Capped; see recordRun. */
  ledger: RunRecord[];
  /** Genes ordered from synthesis, present on every future strain. */
  stock: GeneId[];
  /** Backbone every future strain starts on. */
  startReplicon: RepliconId;
  /** Head start on strain level. */
  startStrain: number;
}

export const newLab = (): Lab => ({
  credit: 0, deepestEver: 0, ledger: [], stock: [],
  startReplicon: "pbr322", startStrain: 1,
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
export function creditFor(o: RunOutcome): number {
  const floor = Math.min(Math.max(finite(o.floor, 1), 1), MAX_FLOOR);
  const total =
      floor * 9
    + Math.max(finite(o.catalogued, 0), 0) * 7
    + Math.max(finite(o.bossesCleared, 0), 0) * 30
    + Math.max(finite(o.genesCarried, 0), 0) * 4
    // A well-rolled allele is knowledge worth banking even if the strain died.
    + Math.max(finite(o.bestAllele, 1) - 1, 0) * 60
    + (o.won ? 400 : 0);
  return Math.max(Math.round(total), 5);
}

const finite = (v: number, fallback: number): number =>
  Number.isFinite(v) ? v : fallback;

/** Add a run to the ledger and bank its credit. */
export function recordRun(lab: Lab, o: RunOutcome, credit: number): RunRecord {
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
  | { kind: "replicon"; id: RepliconId }
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

export function repliconPrice(id: RepliconId): number {
  return Math.round(120 + REPLICONS[id].unlock * 55);
}

export const strainPrice = (level: number): number =>
  Math.round(140 * Math.max(level, 1) ** 1.35);

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
export const STOCK_CAP = BIN_CAP - STARTING_PARTS;

export function offers(lab: Lab, seen: readonly GeneId[]): Offer[] {
  const out: Offer[] = [];
  const known = [...new Set(seen)].filter((g) => g !== "ori");
  known.sort((a, b) => GENES[a].tier - GENES[b].tier || a.localeCompare(b));

  const full = lab.stock.length >= STOCK_CAP;
  for (const gene of known) {
    const have = lab.stock.includes(gene);
    out.push({
      id: { kind: "gene", gene },
      name: GENES[gene].name,
      price: genePrice(gene),
      note: full && !have
        ? `no room — a strain carries ${String(STOCK_CAP)} constructs`
        : GENES[gene].product,
      // A full manifest reads as owned: it cannot be ordered either way, and
      // showing it as affordable would invite spending on nothing.
      owned: have || full,
    });
  }
  for (const id of Object.keys(REPLICONS) as RepliconId[]) {
    const r = REPLICONS[id];
    if (r.unlock <= 1) continue;
    out.push({
      id: { kind: "replicon", id },
      name: `start on ${r.name}`,
      price: repliconPrice(id),
      note: `${String(r.copies)}x copy · ${String(r.slots)} slots · ${String(r.capacityKb)} kb`,
      owned: lab.startReplicon === id,
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
  if (lab.credit < offer.price) {
    return { ok: false, err: `needs ${String(offer.price)} credit` };
  }
  switch (offer.id.kind) {
    case "gene":
      if (lab.stock.includes(offer.id.gene)) {
        return { ok: false, err: "already ordered" };
      }
      if (lab.stock.length >= STOCK_CAP) {
        return { ok: false,
                 err: `a strain carries ${String(STOCK_CAP)} constructs; drop one first` };
      }
      lab.stock.push(offer.id.gene);
      break;
    case "replicon":
      if (REPLICONS[offer.id.id].unlock > MAX_STRAIN) {
        return { ok: false, err: "no such backbone" };
      }
      lab.startReplicon = offer.id.id;
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
