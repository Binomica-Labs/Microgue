// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Idle life: nothing alive is ever perfectly still.
//
// A sprite that only moves when it steps reads as a token on a board. Real
// cells breathe -- the membrane flexes, the body drifts on currents, a
// flagellated cell twitches even when it holds position. Three small
// motions, all cheap and all deterministic in time:
//
//   breath   a slow squash-and-stretch, a few percent, on a per-creature
//            period so a crowd does not pulse in unison;
//   drift    a sub-pixel bob, so the body is never pinned to a tile centre;
//   flinch   a sharp squash-away on being hit, decaying over ~300ms, so
//            damage visibly LANDS rather than only appearing as a number.
//
// All phased by uid, so two Chlorella side by side breathe at different
// points in their cycle. That desynchrony is most of what makes a crowd look
// alive rather than animated.

export interface Life {
  /** Squash factor for the x axis (y is its reciprocal-ish). 1 is at rest. */
  sx: number; sy: number;
  /** Sub-pixel offset, in tile units. */
  dx: number; dy: number;
}

/** A per-creature phase from its uid, 0..2pi. */
const phaseOf = (uid: number): number => ((uid * 2654435761) >>> 0) / 4294967296 * Math.PI * 2;

/**
 * @param now      ms
 * @param uid      the creature, for desync
 * @param hurtAt   ms of the last hit taken, or -Infinity
 * @param motile   whether it swims (twitches) or sits (only breathes)
 * @param still    reduce-motion: breath only, no drift, no flinch
 */
export function lifeOf(
  now: number, uid: number, hurtAt: number, motile: boolean, still: boolean,
): Life {
  // A NaN or infinite clock -- a tab restored from sleep, a stubbed timer --
  // turns every sin() below into NaN, and a NaN scale on the canvas blanks
  // the sprite SILENTLY: the body simply stops being drawn, no error. Same
  // failure squashFor already guards. Fall to rest rather than vanish.
  if (!Number.isFinite(now)) return { sx: 1, sy: 1, dx: 0, dy: 0 };
  const ph = phaseOf(Number.isFinite(uid) ? uid : 0);
  // Breath: 2.2s period, +-3% -- a membrane, not a heartbeat.
  const breath = still ? 0 : Math.sin(now / 350 + ph) * 0.03;
  let sx = 1 + breath, sy = 1 - breath * 0.8;

  // Drift: two incommensurate sines so the path never visibly repeats.
  let dx = 0, dy = 0;
  if (!still) {
    const amp = motile ? 0.045 : 0.02;
    dx = Math.sin(now / 900 + ph) * amp + Math.sin(now / 1300 + ph * 1.7) * amp * 0.5;
    dy = Math.cos(now / 1100 + ph * 0.6) * amp + Math.sin(now / 700 + ph) * amp * 0.4;
  }

  // Flinch: a sharp squash that decays. Hit at t0 -> sx 0.72 -> back to rest
  // over 320ms, with a small overshoot so it reads as recoil, not fade.
  if (!still && Number.isFinite(hurtAt)) {
    const t = (now - hurtAt) / 320;
    if (t >= 0 && t < 1) {
      const k = (1 - t) * (1 - t);              // ease-out
      const wobble = Math.sin(t * Math.PI * 3) * 0.06 * (1 - t);
      sx *= 1 - 0.28 * k + wobble;
      sy *= 1 + 0.22 * k - wobble;
    }
  }
  return { sx, sy, dx, dy };
}
