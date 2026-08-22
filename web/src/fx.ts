// Effects. Timing, easing and decay live here as pure functions so the feel is
// testable without a canvas -- the failure mode for juice is an effect that
// never expires, and that is exactly the kind of thing a test catches and an
// eyeball does not.

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
export const easeOutQuad: Ease = (t) => 1 - (1 - t) * (1 - t);
export const easeInQuad: Ease = (t) => t * t;
/** Out and back: 0 -> 1 -> 0. The shape of a lunge. */
export const pulse: Ease = (t) => Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI);

export interface Lunge {
  kind: "lunge"; t0: number; dur: number;
  from: { x: number; y: number }; to: { x: number; y: number };
  who: string;                       // mob id, or "player"
}
export interface Flash {
  kind: "flash"; t0: number; dur: number; x: number; y: number; colour: string;
}
export interface FloatText {
  kind: "text"; t0: number; dur: number; x: number; y: number;
  text: string; colour: string;
}
export interface Burst {
  kind: "burst"; t0: number; dur: number; x: number; y: number;
  colour: string; n: number; seed: number;
}
export interface Bolt {
  kind: "bolt"; t0: number; dur: number;
  from: { x: number; y: number }; to: { x: number; y: number };
  colour: string; seed: number;
}
export interface Ring {
  kind: "ring"; t0: number; dur: number; x: number; y: number;
  colour: string; r: number;
}
export interface Wipe {
  kind: "wipe"; t0: number; dur: number; colour: string; down: boolean;
}

export type Fx = Lunge | Flash | FloatText | Burst | Bolt | Ring | Wipe;

/** Deterministic jitter, so a burst looks the same every frame of its life. */
export function jitter(seed: number, i: number): { x: number; y: number } {
  const a = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  const b = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345;
  return { x: (a - Math.floor(a)) * 2 - 1, y: (b - Math.floor(b)) * 2 - 1 };
}

const MAX_FX = 160;

export class Effects {
  private items: Fx[] = [];
  private shakeMag = 0;
  private shakeT0 = 0;
  private shakeDur = 0;
  private stopUntil = 0;

  add(fx: Fx): void {
    // Bounded: a runaway producer degrades the look, it does not leak.
    if (this.items.length >= MAX_FX) this.items.shift();
    this.items.push(fx);
  }

  /** Drop everything expired. Called once a frame. */
  prune(now: number): void {
    this.items = this.items.filter((f) => now - f.t0 < f.dur);
  }

  clear(): void {
    this.items = [];
    this.shakeMag = 0;
    this.stopUntil = 0;
  }

  all(): readonly Fx[] { return this.items; }
  count(): number { return this.items.length; }

  /** Progress of an effect in [0,1]. */
  static t(f: Fx, now: number): number {
    return Math.min(Math.max((now - f.t0) / Math.max(f.dur, 1), 0), 1);
  }

  // ------------------------------------------------------------- shake
  shake(mag: number, dur: number, now: number): void {
    // A bigger hit during a smaller shake wins; it never sums into a seizure.
    if (mag >= this.shakeMag || now - this.shakeT0 > this.shakeDur) {
      this.shakeMag = Math.min(mag, 14);
      this.shakeT0 = now;
      this.shakeDur = dur;
    }
  }

  shakeOffset(now: number): { x: number; y: number } {
    const t = (now - this.shakeT0) / Math.max(this.shakeDur, 1);
    if (t >= 1 || this.shakeMag <= 0) return { x: 0, y: 0 };
    const decay = (1 - t) ** 2;
    const j = jitter(this.shakeT0, Math.floor(now / 16));
    return { x: j.x * this.shakeMag * decay, y: j.y * this.shakeMag * decay };
  }

  // ------------------------------------------------------------ hitstop
  /** Freeze the animation clock briefly so a hit lands with weight. Capped, so
   *  a flurry of kills cannot lock the game up. */
  hitstop(ms: number, now: number): void {
    this.stopUntil = Math.min(Math.max(this.stopUntil, now) + ms, now + 120);
  }

  frozen(now: number): boolean { return now < this.stopUntil; }
}

/** Lunge offset in tiles: out toward the target and back, peaking at 45%. */
export function lungeOffset(f: Lunge, now: number): { x: number; y: number } {
  const p = pulse(Effects.t(f, now)) * 0.45;
  return { x: (f.to.x - f.from.x) * p, y: (f.to.y - f.from.y) * p };
}
