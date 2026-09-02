// Elites on ordinary floors.
//
// Elites existed only on boss floors -- 8.4 per boss, zero across the other
// 320 floors sampled. So twenty of every twenty-four floors had exactly one
// difficulty, and the only thing that changed as you descended was which
// species was in front of you.
//
// An elite here is not a boss. It is one individual that has done better than
// its neighbours, which is what actually happens in a population: the same
// genotype in the same water, one cell that found the substrate first and has
// been dividing on it ever since.
//
// Each strain is a real phenotype a microbe can have, not a stat bundle with a
// colour.

import type { Mob } from "./dungeon.js";
import type { Rng } from "./rng.js";

export type EliteStrain = "gorged" | "encrusted" | "swarming" | "resistant";

export interface EliteDef {
  readonly id: EliteStrain;
  /** Appended to the organism's name. */
  readonly epithet: string;
  readonly note: string;
  /** Multipliers on the base organism. */
  readonly hp: number;
  readonly atk: number;
  /** Extra loot rolls when it dies. */
  readonly loot: number;
}

export const ELITES: Readonly<Record<EliteStrain, EliteDef>> = {
  gorged: {
    id: "gorged", epithet: "gorged", hp: 2.6, atk: 1.15, loot: 2,
    note: "It reached the substrate first and has been dividing on it since. "
      + "Large, slow to kill, and full of the carbon it took.",
  },
  encrusted: {
    id: "encrusted", epithet: "encrusted", hp: 3.4, atk: 0.9, loot: 1,
    note: "A mineral crust has precipitated on its sheath -- iron oxides, or "
      + "sulfur. It is armoured by its own waste and slower for it.",
  },
  swarming: {
    id: "swarming", epithet: "swarming", hp: 1.4, atk: 1.7, loot: 1,
    note: "Quorum-sensing has tipped it into the attacking phenotype. Thin, "
      + "fast, and committed.",
  },
  resistant: {
    id: "resistant", epithet: "resistant", hp: 2.0, atk: 1.4, loot: 2,
    note: "It carries the plasmid that survived whatever killed the rest of "
      + "its cohort. Everything you have works on it a little less well.",
  },
};

export const ELITE_IDS = Object.keys(ELITES) as EliteStrain[];

/**
 * How many elites a floor gets.
 *
 * A COUNT, not a per-mob probability. A floor holds around a hundred and fifty
 * organisms, so a 4% chance each produced six elites -- and an elite you meet
 * six times a floor is just the local difficulty, not an event. Rises with
 * depth because a deeper population has had longer to differentiate.
 */
export function eliteCount(depth: number): number {
  const d = Math.min(Math.max(Number.isFinite(depth) ? depth : 1, 1), 8);
  return d <= 2 ? 1 : d <= 5 ? 2 : 3;
}

/** Promote a mob in place. Returns the strain, or null if it was left alone. */
export function promote(m: Mob, depth: number, rng: Rng): EliteStrain | null {
  if (m.elite) return null;
  const id = ELITE_IDS[rng.int(ELITE_IDS.length)];
  void depth;
  if (!id) return null;
  const def = ELITES[id];

  m.elite = true;
  m.eliteStrain = id;
  //  is readonly on the base type; a promoted mob is a distinct
  // instance, so writing through a cast here is honest rather than a leak.
  (m as { name: string }).name = `${def.epithet} ${m.name}`;
  // Rounded UP: a 1.4x on a 1 hp organism must not round back to 1, or the
  // elite is a normal one with a different name.
  m.maxhp = Math.max(Math.ceil(m.maxhp * def.hp), m.maxhp + 1);
  m.hp = m.maxhp;
  m.atk = Math.max(Math.ceil(m.atk * def.atk), 1);
  return id;
}

/**
 * Promote a few of a floor's organisms, chosen at random from what is there.
 *
 * Done as a pass over the finished population rather than per spawn, because
 * the count has to be a count: deciding per organism means the number of
 * elites tracks how crowded the floor happens to be.
 */
export function promoteSome(mobs: Mob[], depth: number, rng: Rng): void {
  const want = eliteCount(depth);
  const eligible = mobs.filter((m) => !m.elite && m.alive);
  for (let i = 0; i < want && eligible.length > 0; i++) {
    const pick = rng.int(eligible.length);
    const m = eligible[pick];
    eligible.splice(pick, 1);
    if (m) promote(m, depth, rng);
  }
}
