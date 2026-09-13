// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Biofilm: holding ground.
//
// The whole game is descent -- every mechanic pushes you down, and the reactive
// AI gives you something chasing you down. Biofilm is the one thing that pushes
// BACK: express a matrix gene, and you can lay a patch of extracellular polymer
// on the floor you are standing on. It is territory.
//
// A biofilm tile does two things: it slowly regenerates substrate (a real
// biofilm concentrates nutrients), and it MIRES a pursuer -- a mob crossing one
// loses part of its move, the way a real biofilm traps and slows what swims
// into it. So a cornered strain can build a defensible pocket instead of only
// running, and the flankers and leeches from v1.17 have something to fight
// through.
//
// State is a Set of packed tile keys on the run, small and cheap. It is capped:
// a biofilm is a pocket you defend, not a carpet you pave the floor with.

export const BIOFILM_CAP = 12;

/** Pack a tile into one integer. Grids are never wider than a few hundred. */
export const bfKey = (x: number, y: number): number => y * 4096 + x;

export interface Biofilm {
  /** Packed keys of claimed tiles, and the floor they belong to. Cleared when
   *  the floor changes -- a biofilm does not follow you down. */
  readonly tiles: Set<number>;
  floor: number;
}

export function newBiofilm(): Biofilm {
  return { tiles: new Set<number>(), floor: -1 };
}

/**
 * Lay biofilm on a tile, if there is room and a matrix gene is expressed.
 *
 * @returns why it failed, or null on success. The caller shows the reason;
 *   silent refusal on a deliberate action is the worst UI.
 */
export function layBiofilm(
  bf: Biofilm, floor: number, x: number, y: number, expressed: boolean,
): string | null {
  if (!expressed) return "No matrix. Express eps to build biofilm.";
  if (bf.floor !== floor) { bf.tiles.clear(); bf.floor = floor; }
  const key = bfKey(x, y);
  if (bf.tiles.has(key)) return "Already biofilm here.";
  if (bf.tiles.size >= BIOFILM_CAP) return "Biofilm at its limit.";
  bf.tiles.add(key);
  return null;
}

/** Is this tile biofilm on the current floor? */
export function isBiofilm(bf: Biofilm, floor: number, x: number, y: number): boolean {
  return bf.floor === floor && bf.tiles.has(bfKey(x, y));
}

/** Drop the biofilm when leaving a floor. */
export function clearBiofilm(bf: Biofilm): void {
  bf.tiles.clear();
  bf.floor = -1;
}
