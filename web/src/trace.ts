// A flight recorder.
//
// "Killed by an affliction" is the kind of report you cannot act on: the log
// says what happened but not the sequence that led there, and by the time you
// notice something is wrong the state that caused it is gone. This keeps the
// last few hundred events in a ring buffer so a death, a stuck turn or a
// wrong number can be read backwards.
//
// It is always on. The cost is one small object per event and a bounded array,
// which is nothing against a turn that already runs pathfinding and a
// 31-invariant audit -- and a recorder you have to remember to switch on is
// never on when you need it.

export type TraceKind =
  | "input" | "move" | "attack" | "hurt" | "status" | "floor"
  | "loot" | "turn" | "death" | "note";

export interface TraceEvent {
  /** Turn number, so events line up with the game clock. */
  readonly t: number;
  readonly kind: TraceKind;
  readonly what: string;
}

/** Kept. Enough to cover a long fight and its lead-up, small enough to hold
 *  in a save or paste into a report. */
export const TRACE_CAP = 400;

export class Trace {
  private readonly ring: TraceEvent[] = [];
  private head = 0;
  /** Turned off only by tests that assert on allocation. */
  enabled = true;

  push(t: number, kind: TraceKind, what: string): void {
    if (!this.enabled) return;
    const e: TraceEvent = {
      t: Number.isFinite(t) ? Math.round(t) : 0,
      kind,
      // Bounded: a runaway string would defeat the point of a bounded buffer.
      what: what.length > 120 ? `${what.slice(0, 117)}...` : what,
    };
    if (this.ring.length < TRACE_CAP) this.ring.push(e);
    else { this.ring[this.head] = e; this.head = (this.head + 1) % TRACE_CAP; }
  }

  /** Oldest first. */
  all(): TraceEvent[] {
    return this.ring.length < TRACE_CAP
      ? [...this.ring]
      : [...this.ring.slice(this.head), ...this.ring.slice(0, this.head)];
  }

  /** The last `n`, oldest first. */
  recent(n: number): TraceEvent[] {
    const all = this.all();
    return all.slice(Math.max(all.length - Math.max(Math.round(n), 0), 0));
  }

  clear(): void {
    this.ring.length = 0;
    this.head = 0;
  }

  /** Plain text, newest LAST, for a console or a bug report. */
  dump(n = TRACE_CAP): string {
    return this.recent(n)
      .map((e) => `T${String(e.t).padStart(5)}  ${e.kind.padEnd(7)} ${e.what}`)
      .join("\n");
  }

  /** The tail, for a death report: what actually happened at the end. */
  epitaph(n = 10): string[] {
    return this.recent(n)
      .filter((e) => e.kind !== "note")
      .map((e) => `${e.kind}: ${e.what}`);
  }
}
