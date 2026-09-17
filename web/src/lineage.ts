// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Inheritance: the next strain descends from the last one.
//
// The meta-loop was OPEN. Credit accumulated with nothing to spend it on
// (the store is paused pending a rebalance), the lab is tabled, and death
// cost you the entire plasmid. A roguelike lives on what you carry forward,
// and nothing was carried.
//
// A shop is hard to balance because you are buying power with a currency
// whose value you have to guess. Inheritance is self-balancing: the ceiling
// is whatever you already built, and the tax is entropy. When a strain dies
// the next one starts from its plasmid, DEGRADED:
//
//   * some genes are lost outright -- segregational instability, the real
//     reason plasmids need selection to be maintained;
//   * some alleles drift a grade, usually down;
//   * regulatory parts are the first thing to go, because a promoter is
//     small and a gene is not.
//
// So a lineage is a slope, not a ladder. A good run leaves a good starting
// point; a long chain of bad runs erodes back toward nothing. You are never
// starting from zero and never simply keeping what you had.

import { alleleRarity, degrade, WILD_TYPE, type Allele } from "./allele.js";
import type { Part } from "./plasmid.js";
import type { Rng } from "./rng.js";

/** What survives a death, as a flat list of parts for the next strain. */
export interface Inheritance {
  /** Parts the heir starts with, in the bin. */
  readonly parts: readonly Part[];
  /** What was lost, for the report: gene ids and part kinds. */
  readonly lost: readonly string[];
  /** How many alleles drifted down. */
  readonly drifted: number;
  /** Generation number: 1 is a founder. */
  readonly generation: number;
}

/**
 * How much survives. A deeper run is a better-established lineage: reaching
 * the sulfidic zone means the strain was actually viable, and that is worth
 * more than a strain that died on F2.
 *
 * Never everything -- at floor 24 it is still only ~75%, because a lineage
 * that inherits perfectly is just a save file.
 */
export function survivalRate(floor: number): number {
  const f = Number.isFinite(floor) ? Math.min(Math.max(floor, 1), 24) : 1;
  return 0.35 + (f / 24) * 0.4;
}

/**
 * Build the heir's starting parts from the dead strain's ring and bin.
 *
 * Genes are kept preferentially over regulatory parts: losing your whole
 * promoter set is recoverable in a few floors, losing a deep gene you found
 * at D7 is not, and the frustrating version of this mechanic is the one that
 * takes the rare thing.
 */
export function inherit(
  ring: readonly (Part | null)[], bin: readonly Part[],
  floor: number, generation: number, rng: Rng,
): Inheritance {
  const rate = survivalRate(floor);
  const lost: string[] = [];
  const kept: Part[] = [];
  let drifted = 0;

  // The origin is never inherited -- every plasmid has its own.
  const all = [...ring.filter((p): p is Part => p !== null), ...bin]
    .filter((p) => !(p.kind === "gene" && p.id === "ori"));

  for (const p of all) {
    // A regulatory part is half as likely to survive as a gene.
    const odds = p.kind === "gene" ? rate : rate * 0.5;
    if (rng.next() > odds) {
      lost.push(p.kind === "gene" ? p.id : p.kind);
      continue;
    }
    if (p.kind !== "gene") { kept.push(p); continue; }
    // Alleles drift. Mostly down -- entropy is not symmetric -- but a lucky
    // copy can come through improved, which is what makes a lineage worth
    // running rather than just a slower decline.
    const roll = rng.next();
    if (roll < 0.28) {
      const worse = degrade(p.allele, rng);
      if (alleleRarity(p.id, worse) !== alleleRarity(p.id, p.allele)) drifted++;
      kept.push({ ...p, allele: worse });
    } else {
      kept.push({ ...p });
    }
  }

  return { parts: kept, lost, drifted,
           generation: Math.max(Math.round(generation), 1) };
}

/** A fresh founder: nothing inherited. */
export function founder(): Inheritance {
  return { parts: [], lost: [], drifted: 0, generation: 1 };
}

/** Wild-type allele, for a part rebuilt from nothing. */
export const FOUNDER_ALLELE: Allele = WILD_TYPE;
