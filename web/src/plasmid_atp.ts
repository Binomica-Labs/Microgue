// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The plasmid's energy budget.
//
// Split from plasmid.ts at the 900-line ceiling: cost, gain, balance and the
// transcription wasted past the last gene of an operon. One coherent
// subsystem -- everything here answers "what does carrying this ring cost to
// run, and what does it pay back".

import { GENES, energyYield } from "./biology.js";
import { COST_PER_KB, GENERATORS, WASTE_PER_UNIT } from "./metabolism.js";
import { modEffect } from "./transcription.js";
import { alleleEffect } from "./allele.js";
import { TERMINATORS } from "./parts.js";
import { copyBurden } from "./chromosome.js";
import { SYMBIONTS } from "./symbiont.js";
import { masteryOf, upkeepFactor } from "./module_reward.js";
import type { Plasmid } from "./plasmid.js";

/** ATP drawn per action. Memoised: it depends only on the ring and the
 *  depth, NOT on `supply`, because it is computed from rawExpression. */
export function p_atpCost(_p: Plasmid, depth: number): number {
  const key = `c${depth}`;
  const hit = _p.memoAtp.get(key);
  if (hit !== undefined) return hit;
  const v = p_computeAtpCost(_p, depth);
  _p.memoAtp.set(key, v);
  return v;
}

export function p_computeAtpCost(_p: Plasmid, depth: number): number {
  let c = 0;
  const mastery = masteryOf(_p.carried());
  for (const p of _p.slots) {
    if (p?.kind !== "gene") continue;
    const mods = modEffect(p.mods);
    const allele = alleleEffect(p.allele);
    // A completed KEGG module makes its pathway cheaper to run: the whole
    // route exists, so no intermediate is a dead end. Computed once outside
    // the loop -- `masteryOf` walks every module and the loop walks every
    // slot, and doing both together is the sort of quadratic that only
    // shows up on a full ring. See module_reward.ts.
    c += _p.rawExpression(p.id, depth) * GENES[p.id].kb * COST_PER_KB
      * mods.upkeep * allele.upkeep
      * upkeepFactor(GENES[p.id].pathway, mastery);
  }
  // Replicating the plasmid is most of what carrying one costs, and a
  // high-copy origin costs proportionally more.
  c *= copyBurden(_p.copies());
  // Transcription that reads past the last gene of an operon is polymerase
  // and nucleotide spent on nothing. THIS is why a terminator matters
  // beyond isolating the next promoter: a leaky one wastes ATP every turn,
  // for ever, and a tandem one is cheap to run as well as tight.
  return c + _p.wastedTranscription(depth);
}

/**
 * ATP burned on transcription that produces no protein.
 *
 * Flow that survives the last gene in an operon and runs into a gap is real
 * transcription with nothing downstream to translate. A hairpin leaks 38% of
 * it; a tandem rrnB T1T2 leaks 2%.
 */
export function p_wastedTranscription(_p: Plasmid, depth: number): number {
  let waste = 0;
  for (const op of _p.operons()) {
    if (op.output <= 0) continue;
    const last = op.genes[op.genes.length - 1];
    const tail = last === undefined ? 1 : last.flow;
    // What is still running after the final gene, times the promoter output.
    let leak = tail;
    // USABLE positions, not the array: `norm` wraps at `usableSlots`, so
    // iterating to SLOTS walked an 8-slot ring three times and re-applied
    // every terminator on each pass. Fifth bug from that same root.
    for (let k = 1; k <= _p.usableSlots; k++) {
      const at = _p.norm((last?.slot ?? op.promoter) + k);
      const part = _p.slots[at];
      if (part === undefined || part === null) break;
      if (part.kind === "promoter") break;
      if (part.kind === "terminator") leak *= TERMINATORS[part.id].readthrough;
      if (leak < 0.01) break;
    }
    waste += op.output * leak * WASTE_PER_UNIT;
  }
  void depth;
  return waste;
}

/** ATP produced per action. Scaled by the stratum's energy yield, so the
 *  same kit generates far less on the methanogenic floor than at the surface. */
export function p_atpGain(_p: Plasmid, depth: number): number {
  // The memo is keyed on depth and ring only, so the symbiont multiplier is
  // applied OUTSIDE it -- caching it would return a stale value the moment
  // the symbiont changed.
  const key = `g${depth}`;
  let base = _p.memoAtp.get(key);
  if (base === undefined) {
    base = p_computeAtpGain(_p, depth);
    _p.memoAtp.set(key, base);
  }
  return _p.symbiont !== null ? base * SYMBIONTS[_p.symbiont].atp : base;
}

export function p_computeAtpGain(_p: Plasmid, depth: number): number {
  // Baseline fermentation. Raised from 1.2 when transcriptional waste became
  // a real cost: the "never dead on arrival" invariant was passing with a
  // margin of 0.005, which is not a margin. A starting cell should be
  // clearly viable, not arithmetically viable.
  let g = 1.6;
  for (const p of _p.slots) {
    if (p?.kind !== "gene") continue;
    const rate = GENERATORS[p.id];
    if (rate !== undefined) g += rate * _p.rawExpression(p.id, depth);
  }
  // The whole depth gradient lives here: the same proteome earns far less
  // when CO2 is the only acceptor left than when O2 is.
  // Floor and slope found by sweeping against a fixture of intended builds:
  // every canonical respiration must pay for itself at its own depth, and
  // every generator-free hoard must drain -- and drain harder the deeper it
  // is carried.
  return Math.max(g, 0) * (0.4 + 0.6 * energyYield(depth));
}

export function p_atpBalance(_p: Plasmid, depth: number): number {
  return _p.atpGain(depth) - _p.atpCost(depth);
}
