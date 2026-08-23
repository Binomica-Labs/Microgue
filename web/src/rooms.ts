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
//   CHAMBER   Plain open ground.

import { columnRadius, FLOOR, WALL, type Grid, type Point } from "./mapgen.js";
import type { Rng } from "./rng.js";

export type RoomKind = "port" | "mat" | "bloom" | "enrichment" | "chamber";

export interface Room {
  readonly kind: RoomKind;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Tiles that belong to this room, for placing contents. */
  readonly tiles: Point[];
  /** Set once its contents have been placed. */
  stocked: boolean;
}

export interface RoomStyle {
  readonly name: string;
  readonly note: string;
  /** Loot multiplier, and how much extra it is guarded. */
  readonly loot: number;
  readonly guard: number;
}

export const ROOM_STYLE: Readonly<Record<RoomKind, RoomStyle>> = {
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

/** A straight corridor, carved one tile wide. */
function carveCorridor(g: Grid, a: Point, b: Point): void {
  let x = a.x, y = a.y;
  let guard = 0;
  while ((x !== b.x || y !== b.y) && guard++ < 4000) {
    if (x !== b.x) x += Math.sign(b.x - x);
    else if (y !== b.y) y += Math.sign(b.y - y);
    if (x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1) g.set(x, y, FLOOR);
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
    const r = kind === "enrichment" ? 3 + rng.int(2)
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

    // An enrichment is sealed: wall it, then punch exactly one way in.
    if (kind === "enrichment") {
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
    if (a && b) carveCorridor(g, { x: a.cx, y: a.cy }, { x: b.cx, y: b.cy });
  }

  // Then hang the chain off the largest existing cave, so the rooms and the
  // cave are one region rather than two.
  const first = rooms[0];
  if (first) {
    const own = new Set(rooms.flatMap((rm) =>
      rm.tiles.map((t) => `${String(t.x)},${String(t.y)}`)));
    const link = nearestFloor(g, { x: first.cx, y: first.cy }, own);
    if (link) carveCorridor(g, { x: first.cx, y: first.cy }, link);
  }
  return rooms;
}

/** Which room kinds a stratum offers. Mats belong at the redox interface. */
export function planFor(depth: number, boss: boolean): RoomPlan {
  const kinds: RoomKind[] = ["chamber", "chamber", "port"];
  if (depth >= 3 && depth <= 7) kinds.push("mat");
  if (depth >= 2) kinds.push("bloom");
  if (depth >= 2) kinds.push("enrichment");
  return { kinds, count: boss ? 3 : 4 + Math.floor(depth / 3) };
}

export function roomAt(rooms: readonly Room[], x: number, y: number): Room | null {
  return rooms.find((r) => (r.cx - x) ** 2 + (r.cy - y) ** 2 <= r.r * r.r) ?? null;
}
