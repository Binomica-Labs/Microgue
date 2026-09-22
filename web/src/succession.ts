// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Succession: the column remembers.
//
// A Winogradsky column is not a set of levels, it is a body of water that
// changes over weeks. What grew and died in it last time is the substrate
// for what grows next. Rerolling the dungeon every run threw that away and
// made the column a slot machine.
//
// So a floor keeps a faint trace of what the previous lineage did there:
// biofilm laid, cells lysed, floors cleared. The trace is not the old level
// -- the layout still rerolls, because a memorised map is a worse game --
// it is a per-floor ENRICHMENT that changes what the new layout contains:
//
//   grazed   many kills here: fewer organisms, they have not recovered
//   fouled   biofilm was laid: more substrate, matrix feeds the next wave
//   settled  lysate accumulated: richer loot, the dead feed the living
//
// Capped and decaying, so a floor farmed forever drifts back to baseline
// and the incentive to grind evaporates on its own.

/** What a lineage left on one floor. */
export interface Trace {
  /** Cells lysed here, all generations, decayed. */
  grazed: number;
  /** Biofilm tiles laid here. */
  fouled: number;
  /** Lysate left behind. */
  settled: number;
}

export type Succession = Map<number, Trace>;

export const newSuccession = (): Succession => new Map();

/** Nothing accumulates without bound: a floor saturates. */
const CAP = 40;

export function traceOf(s: Succession, floor: number): Trace {
  if (!Number.isFinite(floor)) return { grazed: 0, fouled: 0, settled: 0 };
  return s.get(Math.round(floor)) ?? { grazed: 0, fouled: 0, settled: 0 };
}

/** Record what a run did to a floor, at the moment it leaves or dies. */
export function leaveTrace(
  s: Succession, floor: number, add: Partial<Trace>,
): void {
  if (!Number.isFinite(floor)) return;
  const f = Math.round(floor);
  const t = traceOf(s, f);
  const clamp = (v: number): number =>
    Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), CAP);
  s.set(f, {
    grazed: clamp(t.grazed + (add.grazed ?? 0)),
    fouled: clamp(t.fouled + (add.fouled ?? 0)),
    settled: clamp(t.settled + (add.settled ?? 0)),
  });
}

/** The succession as JSON can carry it. A Map stringifies to `{}`, which is
 *  how the whole column forgot itself on every death: written, then read back
 *  as nothing. */
export function successionEntries(s: Succession): [number, Trace][] {
  return [...s];
}

/** Read stored entries back, through `leaveTrace` so the same clamps apply
 *  to a stored trace as to one made in play. */
export function parseSuccession(raw: unknown, maxFloor: number): Succession {
  const s = newSuccession();
  if (!Array.isArray(raw)) return s;
  for (const e of raw as unknown[]) {
    if (!Array.isArray(e) || e.length !== 2) continue;
    const [f, t] = e as [unknown, unknown];
    if (typeof f !== "number" || f < 1 || f > maxFloor) continue;
    if (typeof t !== "object" || t === null) continue;
    const r = t as Record<string, unknown>;
    const n = (k: string): number => (typeof r[k] === "number" ? r[k] : 0);
    leaveTrace(s, f, { grazed: n("grazed"), fouled: n("fouled"), settled: n("settled") });
  }
  return s;
}

/**
 * Decay every floor by one generation's worth.
 *
 * Without this a heavily-farmed floor stays altered for ever and the optimal
 * play is to grind one floor. With it, a trace is worth something for a few
 * runs and then the column moves on -- which is what a real one does.
 */
export function decay(s: Succession): void {
  for (const [f, t] of s) {
    const next = {
      grazed: t.grazed * 0.72,
      fouled: t.fouled * 0.72,
      settled: t.settled * 0.6,       // lysate is consumed fastest
    };
    if (next.grazed < 0.5 && next.fouled < 0.5 && next.settled < 0.5) s.delete(f);
    else s.set(f, next);
  }
}

/**
 * How the trace changes a floor's generation, as multipliers.
 *
 * Bounded hard: at saturation a floor is at most 40% emptier or 60% richer,
 * never a wasteland and never a jackpot.
 */
export function influence(t: Trace): { mobs: number; loot: number; substrate: number } {
  const n = (v: number): number => Math.min(Math.max(v, 0), CAP) / CAP;
  return {
    mobs: 1 - n(t.grazed) * 0.4,
    loot: 1 + n(t.settled) * 0.6,
    substrate: 1 + n(t.fouled) * 0.5,
  };
}

/** A one-line description, for the floor announcement. Null when a floor is
 *  effectively untouched, so a fresh column says nothing. */
export function traceLine(t: Trace): string | null {
  const strong = Math.max(t.grazed, t.fouled, t.settled);
  if (strong < 6) return null;
  if (t.settled >= t.grazed && t.settled >= t.fouled) {
    return "The sediment here is thick with old lysate.";
  }
  if (t.fouled >= t.grazed) return "Someone's matrix still coats these walls.";
  return "This water has been grazed thin.";
}
