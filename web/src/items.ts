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

import { GENES, type GeneId } from "./biology.js";

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
  | { kind: "cassette"; gene: GeneId }
  | { kind: "substrate"; id: SubstrateId };

export interface Drop {
  x: number; y: number;
  items: Item[];
}

export const itemName = (it: Item): string =>
  it.kind === "cassette" ? GENES[it.gene].name : SUBSTRATES[it.id].name;

export const itemColour = (it: Item): string =>
  it.kind === "cassette" ? "#a0ffd0" : SUBSTRATES[it.id].colour;

export function itemNote(it: Item): string {
  return it.kind === "cassette" ? GENES[it.gene].desc : SUBSTRATES[it.id].note;
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
