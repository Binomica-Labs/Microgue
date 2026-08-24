// The transcription model.
//
// Extracted from the plasmid so the part catalogue can grow without touching
// the class that owns everything else, and so the model itself is testable in
// isolation.
//
// The important change from the old model: a terminator does not STOP
// transcription, it attenuates it. Real terminators are 60-98% efficient and
// the remainder reads through into whatever is downstream. That single fact
// makes terminators a decision -- a leaky hairpin is cheap and lets a little
// signal bleed into the next operon, a tandem rrnB T1T2 costs twice the space
// and seals it -- and it makes gene ORDER matter beyond simple polarity.

import type { GeneId } from "./biology.js";
import { MODIFIERS, PROMOTERS, TERMINATORS, levelMultiplier,
         type Context, type ModifierId, type PromoterId, type TerminatorId }
  from "./parts.js";

export type Part =
  | { kind: "gene"; id: GeneId; level: number; mods: ModifierId[] }
  | { kind: "promoter"; id: PromoterId }
  | { kind: "terminator"; id: TerminatorId };

export const SLOTS = 16;

/** Polarity: expression decays with distance from the promoter. */
const POLARITY = 0.82;

export interface Reading {
  readonly slot: number;
  readonly id: GeneId;
  /** Distance from the promoter that reached it. */
  readonly rank: number;
  /** Fraction of that promoter's output arriving here, before gene modifiers. */
  readonly flow: number;
  /** Which promoter slot drove this. */
  readonly from: number;
}

export interface Transcript {
  readonly promoter: number;
  readonly output: number;
  readonly readings: Reading[];
}

/** Combined effect of a gene's modifiers. */
export function modEffect(mods: readonly ModifierId[]): {
  expression: number; kb: number; power: number; upkeep: number; relief: number;
} {
  let expression = 1, kb = 0, power = 1, upkeep = 1, relief = 0;
  for (const m of mods) {
    const e = MODIFIERS[m].effect;
    expression *= e.expression ?? 1;
    kb += e.kb ?? 0;
    power *= e.power ?? 1;
    upkeep *= e.upkeep ?? 1;
    relief = Math.max(relief, e.polarityRelief ?? 0);
  }
  return { expression, kb, power, upkeep, relief };
}

/**
 * Walk the ring from every promoter, carrying a flow that decays with polarity
 * and is attenuated -- not stopped -- by each terminator it passes.
 *
 * Stops when flow falls below a floor, when it meets another promoter, or
 * after a full lap, so a ring of terminators cannot loop forever.
 */
export function transcribe(slots: readonly (Part | null)[], ctx: Context): Transcript[] {
  const n = slots.length;
  const norm = (i: number): number => ((i % n) + n) % n;
  const out: Transcript[] = [];
  const FLOOR = 0.01;

  for (let p = 0; p < n; p++) {
    const head = slots[p];
    if (head?.kind !== "promoter") continue;
    const def = PROMOTERS[head.id];
    const output = def.strength * Math.min(Math.max(def.active(ctx), 0), 1);
    const readings: Reading[] = [];

    let flow = 1;
    let rank = 0;
    let relief = 0;
    for (let step = 1; step < n; step++) {
      const at = norm(p + step);
      const part = slots[at] ?? null;
      if (part === null) break;                     // a gap ends the transcript
      if (part.kind === "promoter") break;          // the next unit starts here

      if (part.kind === "terminator") {
        flow *= TERMINATORS[part.id].readthrough;
        if (flow < FLOOR) break;
        continue;                                   // and keep reading
      }

      const decay = POLARITY + (1 - POLARITY) * relief;
      flow *= rank === 0 ? 1 : decay;
      if (flow < FLOOR) break;
      readings.push({ slot: at, id: part.id, rank, flow, from: p });
      relief = Math.max(relief, modEffect(part.mods).relief);
      rank++;
    }

    if (output > 0 || readings.length > 0) out.push({ promoter: p, output, readings });
  }
  return out;
}

/** Every transcript that reaches a given slot. A gene can be driven by more
 *  than one promoter once terminators leak. */
export function drivers(ts: readonly Transcript[], slot: number): Reading[] {
  const out: Reading[] = [];
  for (const t of ts) {
    for (const r of t.readings) if (r.slot === slot) out.push(r);
  }
  return out;
}

/** Raw expression at a slot: every promoter that reaches it, summed. */
export function expressionAt(
  ts: readonly Transcript[], slots: readonly (Part | null)[], slot: number,
): number {
  const part = slots[slot];
  if (part?.kind !== "gene") return 0;
  let total = 0;
  for (const t of ts) {
    for (const r of t.readings) {
      if (r.slot === slot) total += t.output * r.flow;
    }
  }
  const m = modEffect(part.mods);
  return total * m.expression * levelMultiplier(part.level);
}
