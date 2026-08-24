// Barriers: material you have to digest your way through.
//
// Every one is something that genuinely accumulates in a column, and every one
// is opened by an enzyme or a metabolism that genuinely degrades it. That
// gives the plasmid a second axis -- what you can eat, and what you can get
// past -- and gives a level a reason to be explored rather than crossed.
//
// A barrier is passable the moment you EXPRESS the gene, not merely carry it,
// so the answer is always "arrange your plasmid", never "find the key".

import type { GeneId } from "./biology.js";

export type BarrierId =
  | "biofilm" | "cellulose" | "chitin" | "ferric" | "sulfur" | "carbonate";

export interface BarrierDef {
  readonly id: BarrierId;
  readonly name: string;
  /** Any ONE of these opens it. */
  readonly opens: readonly GeneId[];
  readonly colour: string;
  readonly note: string;
  /** Turns of work once you can degrade it at all. */
  readonly turns: number;
  /** Strata this material is found in. */
  readonly depths: readonly number[];
}

export const BARRIERS: Readonly<Record<BarrierId, BarrierDef>> = {
  biofilm: {
    id: "biofilm", name: "biofilm matrix", opens: ["dspB"], colour: "#8fbf9a", turns: 2,
    // From D2: dispersin B comes off Pseudomonas, and a barrier that can only
    // be opened by a gene from deeper down is just a wall.
    depths: [2, 3, 4, 5],
    note: "Poly-N-acetylglucosamine holding a community together. Dispersin B cuts it.",
  },
  cellulose: {
    id: "cellulose", name: "cellulose raft", opens: ["celA"], colour: "#c8b878", turns: 2,
    depths: [1, 2, 3],
    note: "Plant debris settled out of the water column. Needs an endoglucanase.",
  },
  chitin: {
    id: "chitin", name: "chitin drift", opens: ["chiA"], colour: "#d8c0a0", turns: 2,
    // From D3: chitinase comes off Thiobacillus.
    depths: [3, 4, 5],
    note: "Arthropod and fungal remains. Chitinase, or go around.",
  },
  ferric: {
    id: "ferric", name: "ferric crust", opens: ["mtrC", "omcS"], colour: "#c0603c", turns: 3,
    // From D4: the Mtr pathway comes off Shewanella and Geobacter.
    depths: [4, 5, 6],
    note: "Iron oxide cemented across the gap. Reduce the Fe(III) and it dissolves.",
  },
  sulfur: {
    id: "sulfur", name: "sulfur crust", opens: ["soxB", "sqr"], colour: "#e0c25a", turns: 3,
    depths: [5, 6, 7],
    note: "Elemental sulfur globules fused into a plug. Oxidise them away.",
  },
  carbonate: {
    id: "carbonate", name: "carbonate crust", opens: ["soxB", "aprA"], colour: "#cfc6b0", turns: 3,
    depths: [7, 8],
    note: "Precipitated carbonate. Acidify it and it goes into solution.",
  },
};

export interface Barrier {
  x: number; y: number;
  readonly id: BarrierId;
  /** Turns of degradation done so far. */
  work: number;
}

export const barriersAt = (depth: number): BarrierDef[] =>
  Object.values(BARRIERS).filter((b) => b.depths.includes(depth));

export function barrierAt(list: readonly Barrier[], x: number, y: number): Barrier | null {
  return list.find((b) => b.x === x && b.y === y) ?? null;
}

export type Attempt =
  | { kind: "blocked"; def: BarrierDef }
  | { kind: "working"; def: BarrierDef; left: number }
  | { kind: "opened"; def: BarrierDef };

/** One turn of chewing. `can` reports whether a gene is currently EXPRESSED. */
export function degrade(
  b: Barrier, can: (g: GeneId) => boolean,
): Attempt {
  const def = BARRIERS[b.id];
  if (!def.opens.some(can)) return { kind: "blocked", def };
  // A non-finite work count never reaches the threshold, so the barrier could
  // never be opened by anything. Repair rather than accumulate onto it.
  b.work = (Number.isFinite(b.work) ? b.work : 0) + 1;
  if (b.work >= def.turns) return { kind: "opened", def };
  return { kind: "working", def, left: def.turns - b.work };
}

/** What the player is told when they cannot get through. */
export function blockedBy(def: BarrierDef, geneName: (g: GeneId) => string): string {
  const names = def.opens.map(geneName);
  const list = names.length === 1
    ? names[0] ?? ""
    : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1] ?? ""}`;
  return `A ${def.name} blocks the way. ${def.note} You would need ${list} expressing.`;
}
