// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Which organisms live in THIS column.
//
// Audited earlier: all twenty-three species appear in every full descent.
// Good pacing -- about one new organism per floor -- and no run-to-run
// variety whatsoever. The bestiary was a checklist rather than a discovery,
// and the second run showed you nothing the first had not.
//
// The first attempt dropped species from the column, and measuring it
// killed the idea: there are only TWO TO FOUR species per depth. Cutting
// 72% of a three-species floor leaves two, which made floors thinner within
// a run while varying almost nothing between runs -- and it pushed
// same-species spawn clumps from three to five, because fewer species means
// more of each.
//
// So vary ABUNDANCE, not membership. That is what actually differs between
// two real columns a mile apart: the same organisms are available, and one
// is dominated by Nitrosomonas while the other is mostly Beggiatoa. Nothing
// is lost from the loot pool, no floor empties, no gene becomes unreachable
// -- and the run still feels different, because the thing you keep meeting
// is different.

import { MICROBES, type Microbe } from "./biology.js";
import { makeRng, type Rng } from "./rng.js";

/** The widest and narrowest a species' abundance may be scaled. */
export const MIN_ABUNDANCE = 0.25;
export const MAX_ABUNDANCE = 2.6;

/**
 * The species present in a column, by depth.
 *
 * Deterministic in the seed, so a daily column really is the same column
 * for everyone and a resumed run finds the same organisms it left.
 */
export type Community = ReadonlyMap<string, number>;

export function communityOf(seed: number): Community {
  const rng: Rng = makeRng(Number.isFinite(seed) ? seed ^ 0x5eed17 : 1);
  const out = new Map<string, number>();
  for (const m of MICROBES) {
    // Two draws averaged: a soft bell, so most species sit near their
    // baseline and a few are genuinely dominant or genuinely scarce. A flat
    // roll would make every column equally strange.
    const t = (rng.next() + rng.next()) / 2;
    out.set(m.id, MIN_ABUNDANCE + t * (MAX_ABUNDANCE - MIN_ABUNDANCE));
  }
  return out;
}

/** This column's spawn weight for an organism. */
export function abundanceOf(c: Community, id: string): number {
  const v = c.get(id);
  return Number.isFinite(v) && v !== undefined
    ? Math.min(Math.max(v, MIN_ABUNDANCE), MAX_ABUNDANCE) : 1;
}

/**
 * The organisms at a depth, with this column's abundances applied.
 *
 * EVERY species is still present -- nothing is removed, so no gene leaves
 * the loot pool and no floor can empty. Only how often you meet each one
 * changes.
 */
export function microbesIn(community: Community, depth: number): Microbe[] {
  return MICROBES.filter((m) => m.depth === depth).map((m) => ({
    ...m, weight: (m.weight ?? 1) * abundanceOf(community, m.id),
  }));
}
