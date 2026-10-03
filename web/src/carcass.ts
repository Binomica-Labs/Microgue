// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Something died here, and it was not you.
//
// Every scrap of DNA in the game came from a cell the player killed, which
// made the floors between fights empty: exploring a room you had already
// cleared paid nothing, so there was no reason to look in one.
//
// A carcass is the reason. Some cells on a floor died before you arrived --
// starved at the bottom of their stratum, lysed by something that moved on,
// caught by the chemistry. What is left is a genome nobody is using, and
// the fragments in it are UNSEQUENCED, so finding one is a decision about
// ATP rather than a free gift.
//
// This is also the most real thing in the game. Environmental DNA from
// lysed cells is exactly what natural transformation takes up -- the game
// already models that with comA -- and a dead cell's genome really is the
// richest source of it in any water column. Scavenging a corpse for genes
// is not a mechanic borrowed from fantasy loot; it is what bacteria do.

import { MICROBES, type GeneId, type Microbe } from "./biology.js";
import { fragmentOf, type Fragment } from "./fragment.js";
import type { Rng } from "./rng.js";

export interface Carcass {
  /** What it was. The genes in it are ITS genes -- you scavenge what that
   *  organism actually carried, not a random draw from the whole table. */
  readonly species: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Unsequenced. The whole point. */
  readonly fragments: readonly Fragment[];
  /** How it died, for the line the player reads. */
  readonly cause: string;
  /** Picked over already. */
  taken: boolean;
}

/**
 * Causes of death that are not the player.
 *
 * Each is something the game's own chemistry does, so a carcass reads as
 * part of the column rather than as set dressing: a cell that ran out of
 * acceptor, one that could not hold its gradient, one that something else
 * ate most of.
 */
const CAUSES: readonly string[] = [
  "starved \u2014 nothing left here it could respire",
  "lysed \u2014 something larger found it first",
  "osmotic failure \u2014 the gradient went the wrong way",
  "stranded \u2014 the chemistry changed under it",
  "phage \u2014 the capsid shells are still scattered round it",
  "senescent \u2014 it simply stopped dividing",
];

/** How many fragments a carcass carries. A genome is many genes; a USABLE
 *  salvage is a handful, or the hold fills from one corpse. */
export const MIN_FRAGMENTS = 1;
export const MAX_FRAGMENTS = 3;

/**
 * Roll a carcass of something that lives at this depth.
 *
 * Its fragments are drawn from its OWN gene list. A player who learns that
 * sulfur reducers carry dsrA and goes looking for dead ones is playing the
 * game the way it is meant to be read.
 */
export function carcassAt(
  depth: number, x: number, y: number, rng: Rng,
  pool: readonly Microbe[] = MICROBES,
): Carcass | null {
  const here = pool.filter((m) => m.depth === depth && m.genes.length > 0);
  const m = here[rng.int(Math.max(here.length, 1))];
  if (!m) return null;
  const n = MIN_FRAGMENTS
    + rng.int(MAX_FRAGMENTS - MIN_FRAGMENTS + 1);
  const picked: Fragment[] = [];
  const seen = new Set<GeneId>();
  for (let i = 0; i < n; i++) {
    const g = m.genes[rng.int(m.genes.length)];
    // One copy of each gene: a corpse holding three of the same fragment
    // would read as a bug, and it IS one genome.
    if (g === undefined || seen.has(g)) continue;
    seen.add(g);
    picked.push(fragmentOf(g, rng));
  }
  if (picked.length === 0) return null;
  const cause = CAUSES[rng.int(CAUSES.length)] ?? "dead";
  return { species: m.id, name: m.name, x, y, fragments: picked,
           cause, taken: false };
}

/** The line a player reads on finding one. */
export function carcassLine(c: Carcass): string {
  return `A dead ${c.name}. ${c.cause}. `
    + `${String(c.fragments.length)} fragment`
    + `${c.fragments.length === 1 ? "" : "s"} still readable.`;
}

/** How a stripped corpse is remembered across a reload. */
export function carcassKey(floor: number, x: number, y: number): string {
  const n = (v: number): string =>
    String(Number.isFinite(v) ? Math.trunc(v) : 0);
  return `${n(floor)}:${n(x)}:${n(y)}`;
}
