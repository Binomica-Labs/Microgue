// The entity model.
//
// A tagged union rather than an ECS. With two kinds today and maybe six later,
// the win from component storage is nil at this scale, while the win from
// EXHAUSTIVENESS is large: add a kind and every switch stops compiling until
// it is handled. The recurring bug in this codebase has been forgetting a
// parallel path, and this converts that class of bug into a build failure.
//
// If entity kinds pass roughly six AND their behaviours genuinely cross-cut,
// revisit. Until then this is strictly safer.

import type { GeneId } from "./biology.js";
import type { Facing } from "./motion.js";
import type { Status } from "./status.js";
import type { Behaviour, Size } from "./behaviour.js";

/** Fields every entity has, whatever its kind. */
export interface Body {
  x: number; y: number;          // logical tile
  ax: number; ay: number;        // drawn position, eased toward the tile
  heading: number | null;
  hp: number; maxhp: number;
  alive: boolean;
  status: Status[];
}

export interface Player extends Body {
  readonly kind: "player";
  atp: number; atpMax: number;
  speed: number;
}

export interface Microbe extends Body {
  readonly kind: "microbe";
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly genes: readonly GeneId[];
  readonly note: string;
  readonly pigment: string;
  readonly facing: Facing;
  readonly behaviour: Behaviour;
  readonly size: Size;
  atk: number;
  /** Turns until this entity may act again. Slow, large bodies act less often. */
  cooldown: number;
}

/** Reserved kinds. Declared now so the union is the thing that grows, and
 *  every switch over it is checked. */
export interface Hazard extends Body {
  readonly kind: "hazard";
  readonly id: string;
  readonly radius: number;
  readonly potency: number;
}

export interface Item extends Body {
  readonly kind: "item";
  readonly id: string;
  readonly gene: GeneId | null;
}

export type Entity = Player | Microbe | Hazard | Item;

export const isMicrobe = (e: Entity): e is Microbe => e.kind === "microbe";
export const isPlayer = (e: Entity): e is Player => e.kind === "player";

/** Display name, exhaustive over the union. Adding a kind breaks this. */
export function describeEntity(e: Entity): string {
  switch (e.kind) {
    case "player": return "nanobot";
    case "microbe": return e.name;
    case "hazard": return e.id;
    case "item": return e.gene ?? e.id;
  }
}

/** Whether a tile occupied by this entity blocks movement. */
export function blocks(e: Entity): boolean {
  switch (e.kind) {
    case "player": return true;
    case "microbe": return e.alive;
    case "hazard": return false;          // you can walk into a gradient
    case "item": return false;
  }
}

export function makeBody(x: number, y: number, hp: number): Body {
  return { x, y, ax: x, ay: y, heading: null, hp, maxhp: hp, alive: true, status: [] };
}
