// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The expensive reads, computed.
//
// Split from plasmid.ts to leave headroom under the 900-line ceiling for the
// features still to come. These three are the bodies behind the memoised
// accessors: `power`, `vitality` and `expression` cache their results and
// call in here on a miss. Keeping the maths separate from the caching makes
// both easier to read -- the accessor is four lines of memo and the
// computation is uninterrupted.

import { GENES, type GeneId } from "./biology.js";
import { SYMBIONTS } from "./symbiont.js";
import { satisfied } from "./crossfeed.js";
import type { Plasmid } from "./plasmid.js";

export function p_computeExpression(_p: Plasmid, id: GeneId, depth: number): number {
  // A symbiont can VETO a gene: the operon is there, but the symbiont shuts
  // down the route it replaces -- a hydrogenosome kills the aerobic chain.
  // This is the cost that makes a symbiont a choice, not a stat.
  if (_p.symbiont !== null
      && SYMBIONTS[_p.symbiont].vetoes.includes(id)) return 0;
  // Cross-feeding: a few deep genes need a cofactor only one organism
  // makes. The gene installs and transcribes; it simply produces nothing
  // until you have lysed the thing that supplies it. See crossfeed.ts.
  if (!satisfied(id, _p.cofactors)) return 0;
  // `supply` is public and set from an ATP division. Clamping it here means
  // one bad frame cannot make every downstream number NaN for the rest of
  // the run -- expression, power, vitality and combat all read through _p.
  const s = Number.isFinite(_p.supply) ? Math.min(Math.max(_p.supply, 0), 1) : 1;
  return _p.rawExpression(id, depth) * s;
}

export function p_computeVitality(_p: Plasmid, depth: number): number {
  let expressed = 0;
  for (const s of _p.slots) {
    if (s?.kind !== "gene" || s.id === "ori") continue;
    if (_p.rawExpression(s.id, depth) > 0) expressed++;
  }
  const complexes = _p.complexes(depth).length;
  return Math.round(Math.min(20 + expressed * 3.5 + complexes * 5, 92));
}

export function p_computePower(_p: Plasmid, depth: number): number {
  let a = 0;
  for (const p of _p.slots) {
    if (p?.kind !== "gene") continue;
    a += _p.expression(p.id, depth) * GENES[p.id].tier;
  }
  for (const c of _p.complexes(depth)) {
    if (c.effect.kind === "power") a *= c.effect.mult;
  }
  if (_p.symbiont !== null) a *= SYMBIONTS[_p.symbiont].power;
  return a;
}

