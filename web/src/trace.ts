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
  | "loot" | "turn" | "death" | "note"
  /**
   * The energy budget, when it is NEGATIVE.
   *
   * The recorder tracked everything that hits you and nothing that drains you,
   * so "I am losing ATP and the readout says +0.1" was unanswerable from the
   * log. The displayed balance is metabolic only; repair is spent on top of
   * it and is frequently the larger term.
   *
   * Logged only when the pool is actually falling -- a line every turn would
   * fill a 400-entry ring in seven minutes and push out everything else.
   */
  | "atp"
  /**
   * A periodic snapshot of the variables.
   *
   * Events tell you what HAPPENED; they do not tell you what the world looked
   * like while it was happening. A bug reported as "my ATP is draining" or
   * "the bar is not moving" is a question about STATE over time, and the log
   * could not answer either. One compact line every SNAPSHOT_EVERY turns, plus
   * one on any transition worth anchoring to.
   */
  | "state"
  /** Installing, removing, evolving -- everything that edits the chromosome.
   *  A build that stops working is nearly always something you changed. */
  | "build"
  /** Screens opened and closed, and settings changed. Cheap, and it is how
   *  you tell a misread UI from a misbehaving one. */
  | "ui";

export interface TraceEvent {
  /** Turn number, so events line up with the game clock. */
  readonly t: number;
  readonly kind: TraceKind;
  readonly what: string;
}

/**
 * Kept.
 *
 * Raised from 400 once the recorder started logging builds, screens and
 * periodic state: at 400 a busy few minutes evicted the beginning of the
 * session, which is usually where the cause is. Entries are small -- a kind,
 * a turn number and a bounded string -- so this is well under a hundred
 * kilobytes.
 */
export const TRACE_CAP = 900;

/** Turns between state snapshots. Small enough to see a drift develop, large
 *  enough that snapshots are a minority of the ring. */
export const SNAPSHOT_EVERY = 20;

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
