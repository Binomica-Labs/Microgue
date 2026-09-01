// Chambers carved into the cave.
//
// A pure cellular automaton gives you caves and nothing else: no landmarks, no
// reason to go anywhere but the stairs. Rooms are what make a level a place
// you explore rather than a corridor you cross.
//
// Every kind is something a real column contains:
//
//   PORT      A sampling port. Winogradsky columns are built in cylinders with
//             ports cut down the side; they are how you get material out.
//             Stocked, and set against the glass where a port would be.
//   MAT       A microbial mat. Beggiatoa and Thiothrix build these at the
//             sulfide/oxygen interface -- dense, sessile, and worth the trouble.
//   BLOOM     A single species that has run away with a layer's chemistry.
//   ENRICHMENT A pocket that has been growing undisturbed. Sealed but for one
//             way in, and something has got large in there.
//   RELICT    A slumped horizon. Sediment on a slope fails and carries a whole
//             upper-column community downward, burying it metres below where
//             it lived, instantly and in the wrong chemistry. The cells die.
//             The DNA does not: extracellular DNA adsorbs to clay minerals and
//             persists in sediment for a very long time, and that sedimentary
//             DNA pool is a real reservoir for horizontal gene transfer.
//
//             So a relict pocket is a piece of a SHALLOWER floor, sealed in a
//             deeper one, holding the genes of organisms that never lived
//             here. It is the only way to carry a surface metabolism down.
//   CHAMBER   Plain open ground.

import { MAX_DEPTH } from "./biology.js";
import { columnRadius, FLOOR, WALL, type Grid, type Point } from "./mapgen.js";
import type { Rng } from "./rng.js";

export type RoomKind = "port" | "mat" | "bloom" | "enrichment" | "relict"
  | "chamber";

export interface Room {
  /** Mutable so an unsealable relict can be DEMOTED. Off-stratum genes are
   *  the one reward that must be earned through a barrier; a relict whose
   *  seal had to be dropped would hand them over free. */
  kind: RoomKind;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Tiles that belong to this room, for placing contents. */
  readonly tiles: Point[];
  /** Set once its contents have been placed. */
  stocked: boolean;
  /** For a relict: which stratum the buried layer came from. Set when the
   *  pocket is stocked, because that is when the slump depth is rolled. */
  from?: number;
}

export interface RoomStyle {
  readonly name: string;
  readonly note: string;
  /** Loot multiplier, and how much extra it is guarded. */
  readonly loot: number;
  readonly guard: number;
}

export const ROOM_STYLE: Readonly<Record<RoomKind, RoomStyle>> = {
  relict: { name: "slumped horizon", loot: 4, guard: 0,
    note: "A piece of a shallower layer, carried down by a slope failure and "
      + "buried where it could not live. The cells died. Their DNA is still "
      + "here, held on the clay." },
  port: { name: "sampling port", loot: 3, guard: 0,
    note: "A port cut through the glass. Someone has been taking material out here." },
  mat: { name: "microbial mat", loot: 2, guard: 2,
    note: "A dense mat at the redox interface. Filaments all the way across." },
  bloom: { name: "bloom", loot: 1, guard: 4,
    note: "One species has taken this chamber entirely." },
  enrichment: { name: "enrichment", loot: 4, guard: 3,
    note: "A pocket that has been growing undisturbed. Something in here got large." },
  chamber: { name: "chamber", loot: 1, guard: 1,
    note: "Open ground." },
};

const carveDisc = (g: Grid, cx: number, cy: number, r: number): Point[] => {
  const tiles: Point[] = [];
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      g.set(x, y, FLOOR);
      tiles.push({ x, y });
    }
  }
  return tiles;
};

/**
 * A corridor that wanders.
 *
 * This used to walk all the way along x and then all the way along y: a pure
 * L, one tile wide, and between distant rooms that is a ruler-straight passage
 * fifty tiles long. No amount of contouring at the render layer rescues that
 * -- the silhouette was being polished over a mask made of straight lines.
 *
 * Now it still always closes the distance, but it weaves: while both axes have
 * ground to cover it picks between them at random, which produces a ragged
 * diagonal instead of a right angle, and once one axis is done it wanders
 * perpendicular a fraction of the time. The bias is strong enough that it
 * always converges -- and the guard is still there.
 *
 * The brush varies too. Most steps carve one tile; some open a small pocket,
 * which is where the nooks come from.
 */
function carveCorridor(g: Grid, a: Point, b: Point, rng: Rng): void {
  let x = a.x, y = a.y;
  let guard = 0;
  const dig = (px: number, py: number): void => {
    if (px > 0 && py > 0 && px < g.w - 1 && py < g.h - 1) g.set(px, py, FLOOR);
  };
  while ((x !== b.x || y !== b.y) && guard++ < 4000) {
    const dx = Math.sign(b.x - x), dy = Math.sign(b.y - y);
    const r = rng.next();
    if (dx !== 0 && dy !== 0) {
      // Both axes to go: weave between them rather than finishing one first.
      if (r < 0.5) x += dx; else y += dy;
    } else if (dx !== 0) {
      // One axis left. Wander off it sometimes, but mostly close the gap.
      if (r < 0.82) x += dx;
      else y += rng.next() < 0.5 ? 1 : -1;
    } else {
      if (r < 0.82) y += dy;
      else x += rng.next() < 0.5 ? 1 : -1;
    }
    x = Math.min(Math.max(x, 1), g.w - 2);
    y = Math.min(Math.max(y, 1), g.h - 2);
    dig(x, y);
    // A pocket every so often: a corridor of constant width is still a tube.
    if (rng.next() < 0.22) {
      dig(x + 1, y); dig(x, y + 1);
      if (rng.next() < 0.4) { dig(x + 1, y + 1); dig(x - 1, y); }
    }
  }
}

/** Nearest existing floor tile that is not part of `exclude`. */
function nearestFloor(g: Grid, from: Point, exclude: Set<string>): Point | null {
  let best: Point | null = null;
  let bd = Infinity;
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!g.isFloor(x, y) || exclude.has(`${String(x)},${String(y)}`)) continue;
      const d = (x - from.x) ** 2 + (y - from.y) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

export interface RoomPlan {
  readonly kinds: readonly RoomKind[];
  readonly count: number;
}

/**
 * Carve rooms into an already-generated, disc-masked cave, connecting each to
 * the existing floor so nothing is stranded. Returns what was placed.
 */
export function carveRooms(g: Grid, rng: Rng, plan: RoomPlan): Room[] {
  const rooms: Room[] = [];
  const rim = columnRadius(g);
  const cx0 = (g.w - 1) / 2, cy0 = (g.h - 1) / 2;

  for (let i = 0; i < plan.count; i++) {
    const kind = plan.kinds[rng.int(plan.kinds.length)] ?? "chamber";
    // A relict is small: it is a POCKET of another layer, not a chamber of
    // its own. Making it room-sized read as "a room you cannot enter" rather
    // than "something buried".
    const r = kind === "relict" ? 2 + rng.int(2)
            : kind === "enrichment" ? 3 + rng.int(2)
            : kind === "port" ? 3
            : 4 + rng.int(3);

    // A port belongs against the glass; everything else sits inland.
    const angle = rng.next() * Math.PI * 2;
    const dist = kind === "port"
      ? rim - r - 1
      : rng.next() * Math.max(rim - r - 4, 1);
    const cx = Math.round(cx0 + Math.cos(angle) * dist);
    const cy = Math.round(cy0 + Math.sin(angle) * dist);
    if ((cx - cx0) ** 2 + (cy - cy0) ** 2 > (rim - r) ** 2) continue;

    // Do not stack rooms on top of one another.
    if (rooms.some((o) => (o.cx - cx) ** 2 + (o.cy - cy) ** 2 < (o.r + r + 2) ** 2)) continue;

    // A relict is sealed COMPLETELY -- no mouth at all. The only way in is
    // through the crust that buried it, which means expressing the right gene
    // rather than finding the right corridor.
    if (kind === "enrichment" || kind === "relict") {
      carveDisc(g, cx, cy, r + 1);
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          const d2 = (x - cx) ** 2 + (y - cy) ** 2;
          if (d2 > r * r && d2 <= (r + 1) * (r + 1)
              && x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1) {
            g.set(x, y, WALL);
          }
        }
      }
    }

    const tiles = carveDisc(g, cx, cy, r);
    if (tiles.length === 0) continue;

    rooms.push({ kind, cx, cy, r, tiles, stocked: false });
  }

  // Chain every room to the one before it, so the set is connected to itself
  // whatever the cave does. Linking each room to its nearest floor tile could
  // attach it to a pocket that the connectivity sweep then prunes, taking the
  // room with it.
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    if (a && b) carveCorridor(g, { x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, rng);
  }

  // Then hang the chain off the largest existing cave, so the rooms and the
  // cave are one region rather than two.
  const first = rooms[0];
  if (first) {
    const own = new Set(rooms.flatMap((rm) =>
      rm.tiles.map((t) => `${String(t.x)},${String(t.y)}`)));
    const link = nearestFloor(g, { x: first.cx, y: first.cy }, own);
    if (link) carveCorridor(g, { x: first.cx, y: first.cy }, link, rng);
  }
  return rooms;
}

/** Which room kinds a stratum offers. Mats belong at the redox interface. */
export function planFor(depth: number, boss: boolean): RoomPlan {
  // A NaN depth made `count` NaN, and a NaN count carves no rooms at all --
  // a level with no ports, no caches and no landmarks, and nothing saying so.
  const d = Math.min(Math.max(Number.isFinite(depth) ? Math.round(depth) : 1, 1), MAX_DEPTH);
  const kinds: RoomKind[] = ["chamber", "chamber", "port"];
  if (d >= 3 && d <= 7) kinds.push("mat");
  if (d >= 2) kinds.push("bloom");
  if (d >= 2) kinds.push("enrichment");
  // A slump has to have had something above it to carry down, so no relict on
  // the first stratum. Rarer deeper: the column has had longer to bury them,
  // but there is also more sediment on top and fewer survive intact.
  if (d >= 3) kinds.push("relict");
  // More rooms: they are the landmarks, the caches and the reason to cross a
  // level rather than beeline for the stairs.
  return { kinds, count: boss ? 5 : 7 + Math.floor(d / 2) };
}

export function roomAt(rooms: readonly Room[], x: number, y: number): Room | null {
  return rooms.find((r) => (r.cx - x) ** 2 + (r.cy - y) ** 2 <= r.r * r.r) ?? null;
}
