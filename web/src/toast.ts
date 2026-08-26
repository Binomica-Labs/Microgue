// Transient notices, including recovered errors.
//
// The failure mode this exists to prevent is the one that already happened: a
// throw that killed the frame loop and left a black screen with no console to
// read on a phone. Anything that can fail now surfaces here and the game keeps
// running.

export type ToastLevel = "info" | "warn" | "error";

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly level: ToastLevel;
  readonly t0: number;
  readonly dur: number;
}

const MAX = 4;
const DUR: Readonly<Record<ToastLevel, number>> = {
  info: 2600, warn: 4200, error: 7000,
};

export class Toasts {
  private items: Toast[] = [];
  private next = 1;
  /** Identical messages are collapsed, so a per-frame failure cannot spam. */
  /** Keyed by TEXT, not by "the last one pushed". Two failures alternating
   *  each frame each saw the other as `lastText`, so neither ever collapsed
   *  and the guarantee this exists for did not hold for more than one
   *  distinct message. Bounded so the map cannot grow without limit. */
  private readonly seenAt = new Map<string, number>();

  push(text: string, level: ToastLevel, now: number): void {
    const clean = text.slice(0, 160);
    const last = this.seenAt.get(clean);
    if (last !== undefined && now - last < 3000) return;
    if (this.seenAt.size > 64) this.seenAt.clear();
    this.seenAt.set(clean, now);
    this.items.push({ id: this.next++, text: clean, level, t0: now, dur: DUR[level] });
    while (this.items.length > MAX) this.items.shift();
  }

  prune(now: number): void {
    this.items = this.items.filter((t) => now - t.t0 < t.dur);
  }

  all(): readonly Toast[] { return this.items; }
  count(): number { return this.items.length; }
  clear(): void { this.items = []; }

  /** 0..1 opacity, fading over the final quarter of the lifetime. */
  static alpha(t: Toast, now: number): number {
    const p = (now - t.t0) / Math.max(t.dur, 1);
    if (p >= 1) return 0;
    return p > 0.75 ? Math.max((1 - p) / 0.25, 0) : 1;
  }
}

export const TOAST_COLOUR: Readonly<Record<ToastLevel, string>> = {
  info: "rgba(20,40,32,0.92)",
  warn: "rgba(80,58,16,0.94)",
  error: "rgba(96,22,22,0.95)",
};

export const TOAST_EDGE: Readonly<Record<ToastLevel, string>> = {
  info: "#7fe0a4", warn: "#ffc46a", error: "#ff8a7a",
};

/**
 * Run `fn`, and on failure report instead of propagating. Returns the value or
 * `fallback`. Used at every boundary the browser calls into: frame, pointer,
 * key, resize, storage.
 */
export function guard<T>(
  label: string, fn: () => T, fallback: T, report: (msg: string) => void,
): T {
  try {
    return fn();
  } catch (err) {
    report(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
