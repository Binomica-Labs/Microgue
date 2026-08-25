// Movement speed.
//
// Bacteria do not all move at one rate, and the differences are enormous and
// well measured: a flagellated swimmer manages tens of body lengths a second
// while a gliding filament creeps and a stalked cell never moves at all. Using
// one tick for everything threw that away and made every encounter feel the
// same.
//
// Implemented as an energy budget rather than a "moves twice" flag: each turn
// every actor banks its speed and spends 1 per action, so a 1.5x creature
// genuinely acts three times in two turns rather than lurching.

import type { Behaviour, Size } from "./behaviour.js";

/** Actions per turn, relative to the player at 1.0. */
export const BASE_SPEED: Readonly<Record<Behaviour, number>> = {
  // A flagellated chaser. Fast, and it is coming for you.
  chase: 1.15,
  // Gliding needs a surface and is slow: Beggiatoa manages micrometres a second.
  glide: 0.6,
  // Brownian drift. It is not going anywhere on purpose.
  drift: 0.45,
  // Attached. It waits.
  sessile: 0,
  // Nanowire feeders barely reposition.
  wire: 0.5,
  // A swarm coordinates and moves as one, quickly.
  swarm: 1.3,
};

/** Bigger cells are slower. Drag scales with length; thrust does not. */
export const SIZE_DRAG: Readonly<Record<Size, number>> = {
  pico: 1.25, small: 1.1, medium: 1, large: 0.82, filament: 0.6,
};

export function speedOf(b: Behaviour, s: Size): number {
  return Math.max(BASE_SPEED[b] * SIZE_DRAG[s], 0);
}

/**
 * The player's speed, from what is actually expressed.
 *
 * Motility is a real cost: building and turning a flagellum is among the most
 * expensive things a cell does, which is why so many give it up. So this is
 * something you choose to carry, not something you have.
 */
export function playerSpeed(has: (g: string) => boolean): number {
  let s = 0.85;                       // twitching along on pili alone
  if (has("flhD")) s += 0.35;         // the flagellar regulon is switched on
  if (has("cheA")) s += 0.15;         // and steered rather than tumbling
  if (has("pilA")) s += 0.08;         // type IV pili, for the last stretch
  return Math.min(s, 1.6);
}

/** One actor's movement budget across turns. */
export interface Budget { banked: number }

/**
 * Bank a turn's worth of speed and report how many actions it buys.
 *
 * Fractional speed carries over, so 0.6 gives an action every other turn
 * rather than none, and a haste effect compounds cleanly.
 */
export function tick(b: Budget, speed: number, haste = 1): number {
  const rate = Number.isFinite(speed) ? Math.max(speed, 0) : 0;
  const mult = Number.isFinite(haste) ? Math.max(haste, 0) : 1;
  b.banked = Math.min(b.banked + rate * mult, 4);
  const acts = Math.floor(b.banked);
  b.banked -= acts;
  return acts;
}
