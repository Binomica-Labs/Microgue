// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Unsequenced DNA: loot you cannot read yet.
//
// Every cassette in the game arrives fully characterised -- gene, allele,
// every stat, on the card, the moment it drops. The allele roll underneath
// is already a bell curve, so the VARIATION was there; what was missing is
// the not-knowing. A reward you can evaluate at a glance is a number going
// up. A reward you have to pay to look at is a decision.
//
// The honest version of this is better than an identify scroll, because of
// what you can actually learn about DNA without reading it:
//
//   * LENGTH is free. A gel tells you how long a fragment is and nothing
//     whatsoever about what it says. So an unsequenced fragment shows its
//     kb and hides everything else -- no invented fog, just the real limit
//     of the cheap measurement.
//   * GC content is nearly free, from melting behaviour. A high-GC fragment
//     really does hint at a thermophile, which is a hint about WHERE it came
//     from rather than what it does.
//   * The sequence costs you. Reading scales with length, so the big
//     fragment that might hold something remarkable is also the expensive
//     one. That is the gamble, and it is the real economics.
//
// The ATP price is what makes it a decision: ATP is also your combat and
// survival budget, so sequencing is curiosity competing with staying alive.

import { GENES, type GeneId } from "./biology.js";
import type { Rng } from "./rng.js";

export interface Fragment {
  /** What it turns out to be. Hidden until sequenced -- the player sees a
   *  length and a melting hint, and nothing else. */
  readonly gene: GeneId;
  /** Apparent length in kb, from the gel. This is TRUE: it is the gene's
   *  real size, because length is the one thing a gel does not lie about. */
  readonly kb: number;
  /** GC fraction, from melting. A hint about origin, not about function. */
  readonly gc: number;
}

/** ATP to read it. Scales with length, because sequencing always has. */
export function sequencingCost(kb: number): number {
  const k = Number.isFinite(kb) && kb > 0 ? kb : 1;
  return Math.max(Math.round(6 + k * 7), 4);
}

/**
 * What the gel and the melt tell you, in words.
 *
 * Deliberately says nothing about function. A player who learns to read
 * "long and GC-rich" as "expensive, probably from something deep" has
 * learned to read a gel, which is a real skill and not a fake one.
 */
export function gelLine(f: Fragment): string {
  // Thresholds taken from the actual distribution, not from what "long"
  // sounds like. Genes here run 0.2-3.7 kb with a median of 1.5, so bands at
  // 4 and 2 put 71% of everything in "short" and NOTHING in "long" -- a
  // descriptor that never fires is not a descriptor. At 2.2 and 1.2 the
  // three bands actually divide the set.
  const size = f.kb >= 2.2 ? "a long fragment"
    : f.kb >= 1.2 ? "a fair-sized fragment" : "a short fragment";
  const melt = f.gc >= 0.62 ? "melts high \u2014 GC-rich, from something hot or deep"
    : f.gc <= 0.42 ? "melts low \u2014 AT-rich"
    : "melts mid-range";
  return `${size}, ${f.kb.toFixed(1)} kb. It ${melt}.`;
}

/**
 * Roll a fragment for a gene.
 *
 * GC is drawn around a value implied by the gene's tier: deeper, stranger
 * genes read GC-rich. It is a correlation, not a tell -- a player can lean
 * on it and still be wrong, which is what makes leaning on it interesting.
 */
export function fragmentOf(gene: GeneId, rng: Rng): Fragment {
  const g = GENES[gene];
  const base = 0.40 + Math.min(Math.max(g.tier, 1), 8) * 0.028;
  // Two draws averaged: a small bell, so the hint is soft rather than a
  // lookup table with extra steps.
  const jitter = (rng.next() + rng.next()) / 2 - 0.5;
  const gc = Math.min(Math.max(base + jitter * 0.22, 0.25), 0.78);
  return { gene, kb: g.kb, gc };
}
