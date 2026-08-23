// Travelling particles and lingering gradients.
//
// A tailocin or vesicle moves a tile per turn, which is the point: it can be
// stepped around, so positioning matters. A gradient does not move at all --
// it sits on the ground, decays, and takes that ground away from you.

import type { Grid } from "./mapgen.js";
import type { StatusId } from "./status.js";
import { cloudTiles } from "./weapons.js";

export interface Packet {
  x: number; y: number;
  /** Unit-ish step per turn. */
  dx: number; dy: number;
  dmg: number;
  ttl: number;
  inflicts: StatusId | null;
  colour: string;
  alive: boolean;
}

export interface Cloud {
  cx: number; cy: number;
  radius: number;
  dmg: number;
  ttl: number;
  inflicts: StatusId | null;
  colour: string;
}

export interface HitReport {
  readonly dmg: number;
  readonly inflicts: StatusId | null;
}

export function launch(
  from: { x: number; y: number }, to: { x: number; y: number },
  dmg: number, inflicts: StatusId | null, colour: string, ttl = 8,
): Packet {
  const dx = to.x - from.x, dy = to.y - from.y;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  return {
    x: from.x, y: from.y,
    dx: Math.round(dx / n), dy: Math.round(dy / n),
    dmg, ttl, inflicts, colour, alive: true,
  };
}

/**
 * Advance every packet one tile. Returns whatever struck the player.
 *
 * A packet dies on a wall, on the player, or when its time runs out -- so a
 * missed shot cannot orbit the level forever.
 */
export function stepPackets(
  packets: Packet[], grid: Grid,
  player: { x: number; y: number },
  blockedBy: (x: number, y: number) => boolean,
): HitReport[] {
  const hits: HitReport[] = [];
  for (const p of packets) {
    if (!p.alive) continue;
    p.x += p.dx;
    p.y += p.dy;
    p.ttl -= 1;

    if (p.x === player.x && p.y === player.y) {
      hits.push({ dmg: p.dmg, inflicts: p.inflicts });
      p.alive = false;
      continue;
    }
    if (grid.isWall(p.x, p.y) || blockedBy(p.x, p.y) || p.ttl <= 0) p.alive = false;
  }
  // Compact in place so the array never grows without bound.
  for (let i = packets.length - 1; i >= 0; i--) {
    if (!packets[i]?.alive) packets.splice(i, 1);
  }
  return hits;
}

/** Decay every gradient and report what the player is standing in. */
export function stepClouds(
  clouds: Cloud[], player: { x: number; y: number },
): HitReport[] {
  const hits: HitReport[] = [];
  for (const c of clouds) {
    c.ttl -= 1;
    const d2 = (player.x - c.cx) ** 2 + (player.y - c.cy) ** 2;
    if (d2 <= c.radius * c.radius) hits.push({ dmg: c.dmg, inflicts: c.inflicts });
  }
  for (let i = clouds.length - 1; i >= 0; i--) {
    if ((clouds[i]?.ttl ?? 0) <= 0) clouds.splice(i, 1);
  }
  return hits;
}

/** Fraction of a cloud's life remaining, for fading it out. */
export const cloudAlpha = (c: Cloud, maxTtl: number): number =>
  Math.max(Math.min(c.ttl / Math.max(maxTtl, 1), 1), 0);

export { cloudTiles };
