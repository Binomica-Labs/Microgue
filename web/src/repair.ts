// Repair.
//
// A cell does not heal. It repairs, and repair is expensive: damage to a
// bacterium is oxidised protein, broken DNA and a leaking envelope, and fixing
// any of it costs energy. That is not a metaphor -- every repair enzyme in
// this game is literally an ATPase:
//
//   groL  GroEL hydrolyses ATP on every folding cycle
//   dnaK  Hsp70 binds and releases unfolded substrate ATP-dependently
//   recA  an ATPase; strand exchange is driven by hydrolysis
//   uvrA  an ATPase; damage recognition costs to reset
//
// So healing is a CONVERSION: spend ATP, recover hp, at a rate and efficiency
// set by what you are expressing. Carry no repair machinery and you can still
// limp, slowly and wastefully. Carry chaperones and you recover properly.
//
// This is why the wait button matters. Holding position after a fight is the
// rest command, but resting spends the energy budget you were going to need
// deeper down, and the clock runs while you do it.

import type { GeneId } from "./biology.js";

/** Genes that make repair faster and cheaper, with why. */
export const REPAIR_GENES: Readonly<Record<string, { rate: number; thrift: number }>> = {
  groL: { rate: 0.22, thrift: 0.72 },   // refolds what oxidation denatured
  dnaK: { rate: 0.16, thrift: 0.80 },   // holds the damaged until it can be fixed
  recA: { rate: 0.14, thrift: 0.86 },   // repairs double-strand breaks
  uvrA: { rate: 0.10, thrift: 0.90 },   // excises damaged bases
  sodA: { rate: 0.08, thrift: 0.94 },   // less new damage to repair
  katG: { rate: 0.08, thrift: 0.94 },
};

/** Baseline, with no repair machinery at all: you can limp. */
export const BASE_RATE = 0.14;
export const BASE_COST = 3.4;

export interface RepairProfile {
  /** Hit points recoverable per turn. */
  readonly rate: number;
  /** ATP spent per hit point. */
  readonly cost: number;
}

/** What this cell can do, given what it expresses. */
export function profileFor(expresses: (g: GeneId) => boolean): RepairProfile {
  let rate = BASE_RATE;
  let thrift = 1;
  for (const [id, e] of Object.entries(REPAIR_GENES)) {
    if (!expresses(id as GeneId)) continue;
    rate += e.rate;
    thrift *= e.thrift;
  }
  return { rate: Math.min(rate, 1.1), cost: Math.max(BASE_COST * thrift, 0.9) };
}

export interface RepairResult {
  readonly hp: number;
  readonly atp: number;
}

/**
 * One turn of repair.
 *
 * Never spends the last of the ATP: running the pumps dry to close a scratch
 * is how you die to the next thing, and a game that lets you do it by accident
 * is punishing the wrong mistake. A floor of 20% is left untouched.
 */
export function repairTurn(
  p: RepairProfile, hp: number, maxhp: number, atp: number, atpMax: number,
): RepairResult {
  // Finiteness first, before any arithmetic: NaN survives max() and Infinity
  // makes `missing` infinite, either of which would poison hp directly.
  const h = Number.isFinite(hp) ? hp : 0;
  const mx = Number.isFinite(maxhp) ? maxhp : 0;
  const a = Number.isFinite(atp) ? atp : 0;
  const aMax = Number.isFinite(atpMax) ? atpMax : 0;

  const missing = Math.max(mx - h, 0);
  if (missing <= 0) return { hp: 0, atp: 0 };

  const reserve = aMax * 0.2;
  const spendable = Math.max(a - reserve, 0);
  if (spendable <= 0) return { hp: 0, atp: 0 };

  const wanted = Math.min(p.rate, missing);
  const affordable = spendable / p.cost;
  const healed = Math.min(wanted, affordable);
  if (healed <= 0) return { hp: 0, atp: 0 };
  return { hp: healed, atp: healed * p.cost };
}

/** For the readout: turns to close a given gap, and what it will cost. */
export function estimate(p: RepairProfile, missing: number): {
  turns: number; atp: number;
} {
  const m = Math.min(Math.max(Number.isFinite(missing) ? missing : 0, 0), 1e6);
  // The PROFILE was trusted. `profileFor` never yields a zero rate, but this
  // takes any profile, and dividing by zero here puts "Infinity turns" on a
  // screen a player reads.
  const rate = Number.isFinite(p.rate) && p.rate > 1e-6 ? p.rate : BASE_RATE;
  const cost = Number.isFinite(p.cost) ? p.cost : BASE_COST;
  return { turns: Math.ceil(m / rate), atp: Math.round(m * cost) };
}
