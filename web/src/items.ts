// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Things on the floor.
//
// Two kinds, and they are different in kind rather than in degree:
//
//   CASSETTE  a gene, which goes into the parts bin.
//   SUBSTRATE a molecule, which is fuel. Every one of these is something a
//             real cell in this layer would actually eat, and several are
//             gated: sulfide is only useful to a cell carrying sqr, and
//             hydrogen only to one carrying a hydrogenase.
//
// A tile holding more than one becomes a lysate -- the burst remains of a
// cell -- which opens as a container rather than being hoovered up blind.

import { gelLine } from "./fragment.js";
import type { Fragment } from "./fragment.js";
import { GENES, type GeneId } from "./biology.js";
import { SYMBIONTS, type SymbiontId } from "./symbiont.js";
import { alleleName, alleleRarity, type Allele } from "./allele.js";
import { MODIFIERS, PROMOTERS, RARITY, TERMINATORS, partsOfRarity, rollRarity,
         type ModifierId, type PromoterId, type Rarity, type TerminatorId }
  from "./parts.js";

export type SubstrateId =
  | "acetate" | "glucose" | "h2" | "sulfide" | "nitrate" | "ferric" | "co2";

export interface SubstrateDef {
  readonly id: SubstrateId;
  readonly name: string;
  readonly formula: string;
  /** ATP restored, before any gating. */
  readonly atp: number;
  /** Gene required to get anything out of it, if any. */
  readonly needs: GeneId | null;
  readonly colour: string;
  readonly note: string;
}

export const SUBSTRATES: Readonly<Record<SubstrateId, SubstrateDef>> = {
  acetate: { id: "acetate", name: "acetate", formula: "CH3COO-", atp: 14, needs: null,
    colour: "#d8c98a", note: "The universal currency of anaerobic food webs." },
  glucose: { id: "glucose", name: "glucose", formula: "C6H12O6", atp: 22, needs: null,
    colour: "#e8dcae", note: "Sinking from the photic zone. Rich, and rare down here." },
  h2:      { id: "h2", name: "hydrogen", formula: "H2", atp: 18, needs: "hydA",
    colour: "#bfe6ff", note: "Worthless without a hydrogenase to oxidise it." },
  sulfide: { id: "sulfide", name: "sulfide", formula: "H2S", atp: 16, needs: "sqr",
    colour: "#e0c25a", note: "Toxic unless you can route it into the quinone pool." },
  nitrate: { id: "nitrate", name: "nitrate", formula: "NO3-", atp: 12, needs: "narG",
    colour: "#cfe04a", note: "An acceptor, not a donor. Useless without a reductase." },
  ferric:  { id: "ferric", name: "ferric iron", formula: "Fe(III)", atp: 10, needs: "mtrC",
    colour: "#d0603c", note: "A mineral you must touch to respire." },
  co2:     { id: "co2", name: "carbonate", formula: "CO2", atp: 8, needs: "mcrA",
    colour: "#c9a55e", note: "The last acceptor. Only methanogens bother." },
};

export type Item =
  | { kind: "cassette"; gene: GeneId; allele: Allele }
  // Unsequenced DNA. You get the gel -- a length and a melting hint -- and
  // pay ATP to find out the rest. See fragment.ts.
  | { kind: "fragment"; frag: Fragment }
  | { kind: "substrate"; id: SubstrateId }
  // Regulatory parts. These are the rare drops: a conditional promoter or a
  // tandem terminator changes what your plasmid can BE, not just what it does.
  | { kind: "promoter"; id: PromoterId; rarity: Rarity }
  | { kind: "terminator"; id: TerminatorId; rarity: Rarity }
  // A symbiont is a CHOICE, not a stat -- strong effect, real cost, one at a
  // time. See symbiont.ts.
  | { kind: "symbiont"; id: SymbiontId }
  | { kind: "modifier"; id: ModifierId; rarity: Rarity };

/** Rarity of an item, for colouring and for messages. `common` for anything
 *  that has no tier of its own. */
export function rarityOf(it: Item): Rarity {
  // A malformed item -- from a corrupt save, or a shape that predates a
  // field -- must grade as common, not crash the screen drawing it. Loot is
  // the one thing that round-trips through storage and back into a render.
  // TypeScript proves `it.rarity` is always present, so a `??` fallback is
  // flagged as unnecessary -- but the type system only describes values that
  // came through the type system. Loot round-trips through storage, and a
  // shape from a corrupt save or an older version arrives untyped. The check
  // is on the VALUE, which no narrowing can elide.
  const raw: unknown = it;
  if (raw === null || typeof raw !== "object") return "common";
  // A cassette's rarity is its ROLL, not its base. Same gene, different find.
  if (it.kind === "cassette") return alleleRarity(it.gene, it.allele);
  if (it.kind === "substrate") return "common";
  // A symbiont is always a landmark find.
  if (it.kind === "symbiont") return "legendary";
  const r: unknown = (raw as { rarity?: unknown }).rarity;
  return typeof r === "string" && r in RARITY ? r as Rarity : "common";
}

/**
 * Roll a regulatory part, biased richer with depth.
 *
 * Falls DOWN the ladder if a tier happens to be empty, so adding a rarity with
 * no members can never produce nothing.
 */
export function rollPart(roll: number, pick: number, depth: number): Item | null {
  const order: Rarity[] = ["legendary", "epic", "rare", "uncommon", "common"];
  const start = order.indexOf(rollRarity(roll, depth));
  for (let k = Math.max(start, 0); k < order.length; k++) {
    const tier = order[k];
    if (!tier) continue;
    const { promoters, terminators, modifiers } = partsOfRarity(tier);
    const pool: Item[] = [
      ...promoters.map((id): Item => ({ kind: "promoter", id, rarity: tier })),
      ...terminators.map((id): Item => ({ kind: "terminator", id, rarity: tier })),
      ...modifiers.map((id): Item => ({ kind: "modifier", id, rarity: tier })),
    ];
    if (pool.length > 0) {
      // A non-finite pick must not index to nothing: the whole point of this
      // function is that it always yields a part.
      const p = Number.isFinite(pick) ? Math.abs(pick) % 1 : 0;
      return pool[Math.min(Math.floor(p * pool.length), pool.length - 1)] ?? null;
    }
  }
  return null;
}

export interface Drop {
  x: number; y: number;
  items: Item[];
}

/**
 * The name that fits a 60px tile.
 *
 * `itemName` gives the full decorated allele -- "psychrophilic psaA of tight
 * coupling" -- which is the right thing for a detail panel and impossible on
 * a loot card: at the smallest legible size it is still wider than the cell,
 * so it printed straight across its neighbours. A card shows WHICH gene and
 * HOW GOOD; the adjectives belong in the inspector.
 */
export function itemShortName(it: Item): string {
  if (it.kind === "cassette") return GENES[it.gene].name;
  if (it.kind === "fragment") return `${it.frag.kb.toFixed(1)}kb`;
  return itemName(it);
}

export function itemName(it: Item): string {
  switch (it.kind) {
    case "cassette":    return alleleName(it.gene, it.allele);
    // Named by what you can MEASURE, not by what it is -- the player has a
    // gel and nothing else until they pay for the sequence.
    case "fragment":    return `${it.frag.kb.toFixed(1)} kb fragment`;
    case "substrate":   return SUBSTRATES[it.id].name;
    case "promoter":    return PROMOTERS[it.id].name;
    case "terminator":  return TERMINATORS[it.id].name;
    case "modifier":    return MODIFIERS[it.id].name;
    case "symbiont":    return SYMBIONTS[it.id].name;
  }
}

export function itemColour(it: Item): string {
  if (it.kind === "cassette") return RARITY[alleleRarity(it.gene, it.allele)].colour;
  if (it.kind === "substrate") return SUBSTRATES[it.id].colour;
  // A symbiont is always a landmark drop; give it the legendary colour so it
  // reads as one on the floor.
  if (it.kind === "symbiont") return RARITY.legendary.colour;
  // An unsequenced fragment has NO rarity colour, deliberately. Colouring it
  // by what it will turn out to be would answer the question the player is
  // being asked to pay for. A neutral grey is the honest signal: you do not
  // know yet.
  if (it.kind === "fragment") return "#8b9aa4";
  return RARITY[it.rarity].colour;      // rarity is the signal that matters
}


export function itemNote(it: Item): string {
  switch (it.kind) {
    case "fragment": return gelLine(it.frag);
    case "cassette":   return GENES[it.gene].desc;
    case "substrate":  return SUBSTRATES[it.id].note;
    case "promoter":   return PROMOTERS[it.id].note;
    case "terminator": return TERMINATORS[it.id].note;
    case "modifier":   return MODIFIERS[it.id].note;
    case "symbiont":   return SYMBIONTS[it.id].note;
  }
}

/** ATP actually recovered, which is zero without the enzyme for it. */
export function yieldOf(
  id: SubstrateId, has: (g: GeneId) => boolean,
): { atp: number; blocked: GeneId | null } {
  const s = SUBSTRATES[id];
  if (s.needs !== null && !has(s.needs)) return { atp: 0, blocked: s.needs };
  return { atp: s.atp, blocked: null };
}

/** What a layer's floor is littered with. Substrates follow the chemistry of
 *  the stratum: nitrate in the nitrogenous zone, sulfide below the chemocline. */
export function substratesAt(depth: number): SubstrateId[] {
  if (depth <= 1) return ["glucose", "acetate"];
  if (depth === 2) return ["nitrate", "acetate", "glucose"];
  if (depth === 3) return ["sulfide", "nitrate", "acetate"];
  if (depth === 4) return ["ferric", "acetate"];
  if (depth === 5) return ["sulfide", "acetate"];
  if (depth === 6) return ["sulfide", "acetate", "h2"];
  if (depth === 7) return ["h2", "acetate", "sulfide"];
  return ["h2", "co2", "acetate"];
}

const MAX_DROPS = 60;

/** Add a drop, merging onto an existing tile so piles do not stack invisibly. */
export function addDrop(drops: Drop[], x: number, y: number, items: Item[]): void {
  if (items.length === 0) return;
  const at = drops.find((d) => d.x === x && d.y === y);
  if (at) {
    at.items.push(...items);
    if (at.items.length > 8) at.items.length = 8;
    return;
  }
  if (drops.length >= MAX_DROPS) drops.shift();
  drops.push({ x, y, items: items.slice(0, 8) });
}

export function dropAt(drops: readonly Drop[], x: number, y: number): Drop | null {
  return drops.find((d) => d.x === x && d.y === y) ?? null;
}

export function removeDrop(drops: Drop[], d: Drop): void {
  const i = drops.indexOf(d);
  if (i >= 0) drops.splice(i, 1);
}
