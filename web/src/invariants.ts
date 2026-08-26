// Sacred invariants.
//
// Each of these is a property that must NEVER be false. Not a balance
// preference, not a nicety -- if one is violated the game is broken, and the
// violation is usually silent: a body inside rock is invisible and unhittable,
// a lost origin makes every expression zero, a NaN coordinate simply stops
// being drawn.
//
// They are checked in the soak test after every turn, and available at runtime
// so a violation surfaces as a toast rather than as a mystery.
//
// RULES FOR ADDING ONE
//   * It must be cheap. These run every turn.
//   * It must be a MUST, not a SHOULD. "Openness is around 40%" is a balance
//     target and belongs in a balance test; "every body stands on floor" is an
//     invariant.
//   * It must name what broke, specifically enough to act on.

import { MAX_DEPTH, stratum } from "./biology.js";
import { SIZES } from "./behaviour.js";
import type { Level, Mob } from "./dungeon.js";
import { covers, tilesOf } from "./footprint.js";
import type { Plasmid } from "./plasmid.js";
import { BIN_CAP, SLOTS } from "./plasmid.js";
import { MAX_LEVEL, modifierSlots } from "./parts.js";
import { BASE_SLOTS, MAX_SLOTS } from "./chromosome.js";
import { MAX_STRAIN } from "./strain.js";
import type { Barrier } from "./barrier.js";
import type { Drop } from "./items.js";
import type { Packet, Cloud } from "./projectile.js";
import type { RunState } from "./run.js";

export interface WorldView {
  readonly plasmid: Plasmid;
  readonly level: Level;
  readonly player: {
    x: number; y: number; hp: number; maxhp: number; atp: number; atpMax: number;
  };
  readonly drops: readonly Drop[];
  readonly packets: readonly Packet[];
  readonly clouds: readonly Cloud[];
  readonly barriers: readonly Barrier[];
  readonly run: RunState;
  readonly floor: number;
  /** True once the strain is lost. A dead world is not an invalid one. */
  readonly dead: boolean;
}

export interface Violation {
  readonly name: string;
  readonly detail: string;
}

type Check = (w: WorldView) => string | null;

const finite = (v: number): boolean => Number.isFinite(v);

/** The invariants themselves. Order is diagnostic, not significant. */
export const INVARIANTS: Readonly<Record<string, Check>> = {
  // --- the plasmid ---------------------------------------------------------
  "ring is exactly SLOTS long": (w) =>
    w.plasmid.slots.length === SLOTS ? null
      : `ring has ${String(w.plasmid.slots.length)} slots`,

  "the origin exists": (w) =>
    w.plasmid.has("ori") ? null
      : "no origin: every expression would be zero and nothing can restore it",

  "the bin is within capacity": (w) =>
    w.plasmid.bin.length <= BIN_CAP ? null
      : `bin holds ${String(w.plasmid.bin.length)} of ${String(BIN_CAP)}`,

  "no gene is carried twice": (w) => {
    const seen = new Set<string>();
    for (const p of [...w.plasmid.slots, ...w.plasmid.bin]) {
      if (p?.kind !== "gene") continue;
      if (seen.has(p.id)) return `${p.id} is carried twice`;
      seen.add(p.id);
    }
    return null;
  },

  "expression supply is a fraction": (w) =>
    finite(w.plasmid.supply) && w.plasmid.supply >= 0 && w.plasmid.supply <= 1
      ? null : `supply is ${String(w.plasmid.supply)}`,

  "no gene carries more modifiers than its level allows": (w) => {
    for (const p of [...w.plasmid.slots, ...w.plasmid.bin]) {
      if (p?.kind !== "gene") continue;
      const cap = modifierSlots(p.level);
      if (p.mods.length > cap) {
        return `${p.id} has ${String(p.mods.length)} modifiers at level ` +
               `${String(p.level)}, which allows ${String(cap)}`;
      }
      if (new Set(p.mods).size !== p.mods.length) {
        return `${p.id} carries the same modifier twice`;
      }
    }
    return null;
  },

  "no gene is evolved past the cap": (w) => {
    for (const p of [...w.plasmid.slots, ...w.plasmid.bin]) {
      if (p?.kind !== "gene") continue;
      if (p.level < 1 || p.level > MAX_LEVEL || !Number.isInteger(p.level)) {
        return `${p.id} is at level ${String(p.level)}`;
      }
    }
    return null;
  },

  "expression is finite and non-negative everywhere": (w) => {
    // The transcription model multiplies promoter output, polarity, every
    // terminator's readthrough, modifiers and level. One bad factor anywhere
    // in that chain would be invisible except as a number that stops making
    // sense.
    for (const p of w.plasmid.slots) {
      if (p?.kind !== "gene") continue;
      const e = w.plasmid.expression(p.id, w.level.depth);
      if (!Number.isFinite(e) || e < 0) return `${p.id} expresses at ${String(e)}`;
      if (e > 100) return `${p.id} expresses at ${String(e)}, which is absurd`;
    }
    return null;
  },

  "the chromosome is no larger than it has been grown to": (w) => {
    const grown = w.plasmid.integrated;
    if (!Number.isInteger(grown) || grown < 0 || grown > MAX_SLOTS - BASE_SLOTS) {
      return `${String(grown)} integrated sites, which is not reachable`;
    }
    return null;
  },

  "strain level is within its band": (w) =>
    Number.isInteger(w.plasmid.strain) && w.plasmid.strain >= 1
      && w.plasmid.strain <= MAX_STRAIN
      ? null : `strain is ${String(w.plasmid.strain)}`,

  "nothing occupies a slot the replicon does not have": (w) => {
    // Subcloning onto a smaller backbone must clear what will not fit. A part
    // stranded past the last usable position is invisible and untouchable.
    for (let i = 0; i < w.plasmid.slots.length; i++) {
      if (w.plasmid.usable(i)) continue;
      if (w.plasmid.slots[i] !== null && w.plasmid.slots[i] !== undefined) {
        return `a part sits at position ${String(i)}, past the `
          + `${String(w.plasmid.usableSlots)} the replicon provides`;
      }
    }
    return null;
  },

  "wasted transcription is finite and non-negative": (w) => {
    const waste = w.plasmid.wastedTranscription(w.level.depth);
    return Number.isFinite(waste) && waste >= 0
      ? null : `wasted transcription is ${String(waste)}`;
  },

  // --- the player ----------------------------------------------------------
  "a living player is alive and not over-healed": (w) =>
    // A LOST strain legitimately sits at zero. Auditing it as a live world
    // reported the death itself as a violation, which is both wrong and the
    // first thing a player sees on the death screen.
    w.dead || (w.player.hp > 0 && w.player.hp <= w.player.maxhp) ? null
      : `hp ${String(w.player.hp)}/${String(w.player.maxhp)}`,

  "atp is within its pool": (w) =>
    w.player.atp >= 0 && w.player.atp <= w.player.atpMax ? null
      : `atp ${String(w.player.atp)}/${String(w.player.atpMax)}`,

  "player state is finite": (w) => {
    // Only the NUMBERS. The live player object carries more than WorldView
    // declares -- status lists, a heading -- and Number.isFinite([]) is false,
    // so checking every field made the invariant report itself.
    for (const [k, v] of Object.entries(w.player)) {
      if (typeof v === "number" && !finite(v)) return `player.${k} is ${String(v)}`;
    }
    return null;
  },

  "player stands on floor": (w) =>
    w.level.grid.isFloor(w.player.x, w.player.y) ? null
      : `player at ${String(w.player.x)},${String(w.player.y)} is inside rock`,

  // --- bodies --------------------------------------------------------------
  "every living body stands entirely on floor": (w) => {
    for (const m of w.level.mobs) {
      if (!m.alive) continue;
      for (const t of tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)) {
        if (!w.level.grid.isFloor(t.x, t.y)) {
          return `${m.name} (#${String(m.uid)}) has a tile inside rock at ${String(t.x)},${String(t.y)}`;
        }
      }
    }
    return null;
  },

  "no two bodies share a tile": (w) => {
    const seen = new Map<string, Mob>();
    for (const m of w.level.mobs) {
      if (!m.alive) continue;
      for (const t of tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)) {
        const k = `${String(t.x)},${String(t.y)}`;
        const other = seen.get(k);
        if (other) return `${m.name} overlaps ${other.name} at ${k}`;
        seen.set(k, m);
      }
    }
    return null;
  },

  "a boss floor actually holds a boss": (w) =>
    !w.level.boss || w.level.mobs.some((m) => m.elite) ? null
      : "a boss floor with no elite: isCleared waves you straight through",

  "no body stands on a stair": (w) => {
    const L = w.level;
    for (const m of L.mobs) {
      if (!m.alive) continue;
      const fp = SIZES[m.size].footprint;
      if (covers(fp, m.x, m.y, m.heading, L.up.x, L.up.y)) {
        return `${m.name} stands on the way up; arriving would put you inside it`;
      }
      if (L.down && covers(fp, m.x, m.y, m.heading, L.down.x, L.down.y)) {
        return `${m.name} stands on the way down`;
      }
    }
    return null;
  },

  "bodies never stand on the player": (w) => {
    for (const m of w.level.mobs) {
      if (!m.alive) continue;
      if (covers(SIZES[m.size].footprint, m.x, m.y, m.heading, w.player.x, w.player.y)) {
        return `${m.name} is standing on the player`;
      }
    }
    return null;
  },

  "body identities are unique": (w) => {
    const seen = new Set<number>();
    for (const m of w.level.mobs) {
      if (seen.has(m.uid)) return `two bodies share uid ${String(m.uid)}`;
      seen.add(m.uid);
    }
    return null;
  },

  "body state is finite": (w) => {
    for (const m of w.level.mobs) {
      if (!finite(m.x) || !finite(m.y)) return `${m.name} at a non-finite tile`;
      if (m.heading !== null && !finite(m.heading)) return `${m.name} has a NaN heading`;
      if (!finite(m.hp)) return `${m.name} has non-finite hp`;
    }
    return null;
  },

  // --- the level -----------------------------------------------------------
  "the stairs are on floor": (w) => {
    const L = w.level;
    if (!L.grid.isFloor(L.up.x, L.up.y)) return "the way up is inside rock";
    if (L.down && !L.grid.isFloor(L.down.x, L.down.y)) return "the way down is inside rock";
    return null;
  },

  "the level matches the floor it claims": (w) =>
    w.level.floor === w.floor ? null
      : `level says floor ${String(w.level.floor)}, game says ${String(w.floor)}`,

  "the stratum is a real one": (w) =>
    w.level.depth >= 1 && w.level.depth <= MAX_DEPTH
      && stratum(w.level.depth).depth === w.level.depth
      ? null : `depth ${String(w.level.depth)} is out of range`,

  "sight buffers match the grid": (w) =>
    w.level.sight.visible.length === w.level.grid.w * w.level.grid.h
      ? null : "sight buffer is the wrong size for the grid",

  // --- transient collections must stay bounded -----------------------------
  "nothing transient grows without bound": (w) => {
    if (w.drops.length > 60) return `${String(w.drops.length)} drops`;
    if (w.packets.length > 200) return `${String(w.packets.length)} packets`;
    if (w.clouds.length > 200) return `${String(w.clouds.length)} clouds`;
    for (const d of w.drops) {
      if (d.items.length > 8) return `a pile of ${String(d.items.length)} items`;
    }
    return null;
  },

  "barriers stand on floor and off the stairs": (w) => {
    const L = w.level;
    for (const b of w.barriers) {
      if (!L.grid.isFloor(b.x, b.y)) return `a barrier at ${String(b.x)},${String(b.y)} is inside rock`;
      if (b.x === L.up.x && b.y === L.up.y) return "a barrier stands on the way up";
      if (L.down?.x === b.x && L.down.y === b.y) return "a barrier stands on the way down";
    }
    return null;
  },

  // --- the lineage ---------------------------------------------------------
  "the notebook holds no duplicates": (w) =>
    new Set(w.run.bestiary).size === w.run.bestiary.length
      ? null : "an organism is recorded twice",

  "the deepest reached is within the column": (w) =>
    w.run.deepest >= 1 && w.run.deepest <= MAX_DEPTH * 3
      ? null : `deepest is ${String(w.run.deepest)}`,
};

/** Built once. `Object.entries` allocated a 31-entry array on every call, and
 *  this runs every turn. */
const ENTRIES: readonly (readonly [string, Check])[] = Object.entries(INVARIANTS);

/** Every violation, named. Empty means the world is sound. */
export function check(w: WorldView): Violation[] {
  const out: Violation[] = [];
  for (const [name, fn] of ENTRIES) {
    let detail: string | null;
    try {
      detail = fn(w);
    } catch (e) {
      detail = `check threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (detail !== null) out.push({ name, detail });
  }
  return out;
}

/**
 * The first violation, or null.
 *
 * Short-circuits. This is what runs every turn, and evaluating all 23 checks
 * only to discard 22 of them was paying full price for a yes-or-no answer.
 */
export function firstViolation(w: WorldView): Violation | null {
  for (const [name, fn] of ENTRIES) {
    let detail: string | null;
    try {
      detail = fn(w);
    } catch (e) {
      detail = `check threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (detail !== null) return { name, detail };
  }
  return null;
}

export const INVARIANT_COUNT = Object.keys(INVARIANTS).length;
