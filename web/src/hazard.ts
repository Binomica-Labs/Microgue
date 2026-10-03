// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Chemistry you can walk into, if you can take it.
//
// A barrier is a LOCKED DOOR: the right gene opens it and without that gene
// the room may as well not exist. That is a fine shape for the relicts, but
// it is the only shape the game had, and a lock has no decision in it --
// you either turn around or you do not.
//
// A hazard is the other shape. The loot is visible, the room is open, and
// crossing to it hurts. The right gene makes it cost nothing; the wrong
// loadout makes it cost blood you may not be able to spare. A desperate
// player can still take it, which is the whole point: a tunable cost is a
// decision, and a gate is a checklist.
//
// Every seam here is a real selective pressure -- the chemistry that
// actually decides which organisms live where in a column. A player who
// learns that katG is what lets things survive peroxide has learned why
// catalase is nearly universal.

import type { GeneId } from "./biology.js";

export type HazardId = "peroxide" | "acid" | "metal" | "thermal" | "anoxic";

export interface HazardDef {
  readonly id: HazardId;
  readonly name: string;
  /** Any ONE of these makes it survivable. */
  readonly resists: readonly GeneId[];
  /** HP per turn standing in it, unprotected. */
  readonly bite: number;
  /** What it leaves on you. */
  readonly colour: string;
  readonly note: string;
  /** Strata this chemistry occurs in. */
  readonly depths: readonly number[];
}

export const HAZARDS: Readonly<Record<HazardId, HazardDef>> = {
  peroxide: {
    id: "peroxide", name: "peroxide seam",
    resists: ["katG", "sodA"], bite: 3, colour: "#d8e8f0",
    note: "Hydrogen peroxide, from oxygen chemistry upstream. Catalase "
      + "splits it to water and oxygen; without one you are being oxidised.",
    depths: [1, 2, 3],
  },
  acid: {
    id: "acid", name: "acid pocket",
    // mnhA, the Na+/H+ antiporter -- not the ATP synthase I first reached
    // for. Acid tolerance is specifically an ANTIPORTER problem: a cell in
    // low pH trades sodium out for the protons flooding in. That is the
    // actual mechanism, and the gene was already in the table.
    resists: ["mnhA", "groL"], bite: 3, colour: "#e8d07a",
    note: "Protons leak in faster than you can throw them out. An antiporter "
      + "trades them for sodium; a chaperone refolds what the acid unfolds.",
    depths: [2, 3, 4, 5],
  },
  metal: {
    id: "metal", name: "metal seam",
    resists: ["acrB", "mtrC"], bite: 4, colour: "#9fb0c8",
    note: "Dissolved heavy metals. An efflux pump throws them back out; "
      + "a metal-reducing cytochrome puts them to work instead.",
    depths: [4, 5, 6, 7],
  },
  thermal: {
    id: "thermal", name: "thermal plume",
    resists: ["groL", "dnaK"], bite: 4, colour: "#e59a6a",
    note: "Hot water from below. Heat-shock chaperones hold proteins in "
      + "shape; without them you are cooking.",
    depths: [5, 6, 7, 8],
  },
  anoxic: {
    id: "anoxic", name: "anoxic pocket",
    resists: ["narG", "dsrA", "mcrA", "cydA"], bite: 2, colour: "#6f7f8c",
    note: "No oxygen at all. Anything that can respire something ELSE walks "
      + "through; anything that cannot is suffocating.",
    depths: [3, 4, 5, 6, 7, 8],
  },
};

export interface Hazard {
  readonly id: HazardId;
  readonly x: number;
  readonly y: number;
}

/** The hazards that can occur at a depth. */
export function hazardsAt(depth: number): HazardDef[] {
  const d = Number.isFinite(depth) ? Math.round(depth) : 1;
  return Object.values(HAZARDS).filter((h) => h.depths.includes(d));
}

/**
 * What a tile of this costs, given what the player carries.
 *
 * Resistance is total rather than partial. A partial reduction would make
 * the right gene feel like a small discount; being able to simply walk
 * through what was hurting you is the moment the loadout pays off, and it
 * is also what the biology says -- catalase does not take the edge off
 * peroxide, it destroys it.
 */
export function hazardBite(
  h: HazardDef, carried: ReadonlySet<GeneId>,
): number {
  for (const g of h.resists) if (carried.has(g)) return 0;
  return Math.max(h.bite, 0);
}

/** The line shown on stepping in. */
export function hazardLine(h: HazardDef, bite: number): string {
  return bite <= 0
    ? `${h.name}: you are built for this.`
    : `${h.name}. ${h.note}`;
}
