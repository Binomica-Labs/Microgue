// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// What a microbe does when it is not thinking about you.
//
// Six of ten behaviours returned `null` the moment the player left sense
// range: the mob froze in place until you came back. That is a monster
// waiting for a hero, not an organism. A real cell in a column is always
// doing something -- following a gradient, holding a good patch, dividing --
// and the player is an interruption, not the purpose.
//
// So every mob carries an AGENDA: a private goal it pursues when nothing
// else is pressing. Agendas are cheap (a target tile and a countdown) and
// they make the floor feel inhabited, because a room you re-enter has
// changed while you were away.
//
//   forage   walk a chemotactic gradient toward substrate
//   patrol   circuit a few remembered points; territorial
//   rest     hold still and recover, the way a starved cell shuts down
//   divide   seek space, then split -- see doubling below
//
// The agenda yields to combat: anything that senses the player drops what
// it was doing. That ordering is what keeps the AI readable -- a mob is
// either living its life or hunting you, never visibly torn.

import type { Point } from "./mapgen.js";
import type { Rng } from "./rng.js";

export type AgendaKind = "forage" | "patrol" | "rest" | "divide";

export interface Agenda {
  kind: AgendaKind;
  /** Where it is heading, if anywhere. */
  target: Point | null;
  /** Turns before it reconsiders. Agendas are not commitments. */
  ttl: number;
}

/**
 * Which agenda a behaviour naturally falls into.
 *
 * Grounded in what the organism actually is: a glider holds surface, a
 * swarmer forages in company, a sessile filament does not move at all and
 * so rests or divides. The mapping means a floor's idle life LOOKS
 * different per species without any extra per-species code.
 */
export function defaultAgenda(behaviour: string, rng: Rng): AgendaKind {
  const r = rng.next();
  switch (behaviour) {
    case "sessile": case "wire":
      return r < 0.7 ? "rest" : "divide";
    case "glide":
      return r < 0.5 ? "patrol" : "forage";
    case "swarm":
      return r < 0.6 ? "forage" : "patrol";
    case "ambush":
      // An ambusher's whole life is waiting somewhere good.
      return r < 0.75 ? "rest" : "patrol";
    case "hunt": case "flank":
      return r < 0.55 ? "patrol" : "forage";
    default:
      return r < 0.6 ? "forage" : r < 0.85 ? "patrol" : "rest";
  }
}

export function newAgenda(behaviour: string, rng: Rng): Agenda {
  return { kind: defaultAgenda(behaviour, rng), target: null,
           ttl: 8 + rng.int(18) };
}

/**
 * Tick an agenda. Returns true when it has expired and should be replaced --
 * an organism that pursued one goal for ever would be as static as one that
 * pursued none.
 */
export function ageAgenda(a: Agenda): boolean {
  a.ttl -= 1;
  return a.ttl <= 0;
}

/**
 * The step an agenda wants, given where the mob is and what it can see.
 *
 * `toward` is a tile the mob is drawn to (substrate for forage, a patrol
 * point otherwise) or null. `free` tests a candidate tile. Returns null for
 * "hold", which for `rest` is the whole point.
 */
export function agendaStep(
  a: Agenda, at: Point, toward: Point | null, rng: Rng,
  free: (x: number, y: number) => boolean,
): Point | null {
  // A non-finite position yields a non-finite step, and a mob at NaN,NaN is
  // drawn nowhere and collides with nothing -- it silently leaves the game.
  // The same guard `free()` carries in behaviour.ts, applied at the source
  // rather than trusting every caller's free().
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
  if (a.kind === "rest") return null;
  const raw = toward ?? a.target;
  const goal = raw !== null && Number.isFinite(raw.x) && Number.isFinite(raw.y)
    ? raw : null;
  if (goal === null) {
    // No goal: a slow random walk, so an idle mob still drifts.
    if (rng.next() < 0.45) return null;
    const dx = rng.int(3) - 1, dy = rng.int(3) - 1;
    if (dx === 0 && dy === 0) return null;
    return free(at.x + dx, at.y + dy) ? { x: at.x + dx, y: at.y + dy } : null;
  }
  // Toward the goal, one step, with a small chance of a sideways wander so
  // the path is not a ruler-straight line.
  const sx = Math.sign(goal.x - at.x), sy = Math.sign(goal.y - at.y);
  const jitter = rng.next() < 0.25;
  const cx = jitter ? rng.int(3) - 1 : sx;
  const cy = jitter ? rng.int(3) - 1 : sy;
  if (cx === 0 && cy === 0) return null;
  if (free(at.x + cx, at.y + cy)) return { x: at.x + cx, y: at.y + cy };
  // Blocked: try the two single-axis moves before giving up.
  if (sx !== 0 && free(at.x + sx, at.y)) return { x: at.x + sx, y: at.y };
  if (sy !== 0 && free(at.x, at.y + sy)) return { x: at.x, y: at.y + sy };
  return null;
}
