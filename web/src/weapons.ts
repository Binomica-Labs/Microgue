// How a microbe attacks at range.
//
// These are four genuinely different mechanisms, so they are four different
// mechanics rather than one with different colours:
//
//   SPEAR   Type VI secretion. A contractile phage-tail homolog that fires a
//           VgrG/PAAR spike into a neighbouring cell. Contact-dependent, so
//           adjacent only -- but it hits far harder than a bump, and it winds
//           up first, which is the tell.
//   BOLT    Extracellular electron transfer down an OmcS nanowire. Instant,
//           straight, needs an unobstructed line.
//   PACKET  A tailocin or an outer membrane vesicle: a discrete particle that
//           travels a tile per turn. Slow enough to sidestep.
//   CLOUD   Diffusible bacteriocin, sulfuric acid, hydrogen sulfide. Not a
//           shot at all -- a gradient that lingers and denies ground.

import type { StatusId } from "./status.js";

export type WeaponKind = "melee" | "spear" | "bolt" | "packet" | "cloud";

export interface Weapon {
  readonly kind: WeaponKind;
  readonly name: string;
  readonly range: number;
  /** Damage multiplier against the wielder's base attack. */
  readonly power: number;
  /** Turns between firings. A speargun must re-arm its sheath. */
  readonly cooldown: number;
  /** Turns of visible wind-up before it fires. Zero is instant. */
  readonly windup: number;
  /** Status inflicted on hit, if any. */
  readonly inflicts: StatusId | null;
  /** For clouds: radius in tiles, and how long the gradient persists. */
  readonly radius: number;
  readonly persist: number;
  readonly note: string;
}

export const WEAPONS: Readonly<Record<WeaponKind, Weapon>> = {
  melee: {
    kind: "melee", name: "contact lysis", range: 1, power: 1, cooldown: 0,
    windup: 0, inflicts: null, radius: 0, persist: 0,
    note: "Surface enzymes digesting whatever it is pressed against.",
  },
  spear: {
    kind: "spear", name: "type VI secretion", range: 1, power: 2.6, cooldown: 3,
    windup: 1, inflicts: null, radius: 0, persist: 0,
    note: "A contractile spike driven straight through the envelope. Re-arming the sheath takes time.",
  },
  bolt: {
    kind: "bolt", name: "nanowire discharge", range: 3, power: 1.1, cooldown: 1,
    windup: 0, inflicts: null, radius: 0, persist: 0,
    note: "Electrons down a conductive pilus. Instant, but it needs a clear line.",
  },
  packet: {
    kind: "packet", name: "tailocin release", range: 6, power: 1.5, cooldown: 4,
    windup: 0, inflicts: "phage", radius: 0, persist: 0,
    note: "A phage-tail particle drifting until it meets something. Slow enough to step around.",
  },
  cloud: {
    kind: "cloud", name: "diffusible toxin", range: 4, power: 0.6, cooldown: 5,
    windup: 1, inflicts: "acid", radius: 2, persist: 6,
    note: "A gradient, not a shot. It lingers and takes ground away from you.",
  },
};

/** Line of sight on a grid, by supercover traversal. Used by bolt and packet. */
export function lineOfSight(
  x0: number, y0: number, x1: number, y1: number,
  blocked: (x: number, y: number) => boolean,
): boolean {
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 512; guard++) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if ((x !== x1 || y !== y1) && blocked(x, y)) return false;
  }
  return false;
}

/** Tiles a cloud covers, as a filled disc. */
export function cloudTiles(
  cx: number, cy: number, radius: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) out.push({ x: cx + dx, y: cy + dy });
    }
  }
  return out;
}
