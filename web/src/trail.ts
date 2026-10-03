// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// What a cell does when it loses you.
//
// Sensing was BINARY and MEMORYLESS: a mob either had the player in range
// this turn or had never heard of them. Step one tile out of range and
// every pursuer instantly forgot you existed and went back to foraging, which
// is the single thing that made the floor feel like a set of switches rather
// than like being hunted.
//
// A real chemotactic cell does not work that way. It follows a GRADIENT,
// and a gradient persists after the source moves: the molecules you shed
// are still there, thinning, for some seconds after you have gone. A cell
// swimming up that trail is doing exactly what this models -- heading for
// where the signal was strongest, and giving up when the trail is too old
// to follow rather than the instant the source steps behind a rock.
//
// The effect in play is that breaking line of sight buys you distance, not
// safety. You have to actually leave.

/** How long a trail stays worth following, in turns. */
export const TRAIL_LIFE = 12;

export interface Trail {
  /** Where the player was when last sensed. */
  readonly x: number;
  readonly y: number;
  /** Turn it was laid. */
  readonly at: number;
}

/** Lay or refresh a trail. Called whenever a mob actually senses the player. */
export function mark(x: number, y: number, turn: number): Trail {
  return { x, y, at: turn };
}

/** Is this trail still worth following? */
export function warm(t: Trail | undefined, turn: number): boolean {
  if (!t) return false;
  const age = turn - t.at;
  return Number.isFinite(age) && age >= 0 && age < TRAIL_LIFE;
}

/**
 * How hard to press, given what the target looks like.
 *
 * Mobs attacked a full-health player exactly as hard as a dying one, and a
 * weak cell threw itself at a strong one as readily as at prey. Both are
 * wrong about cells: chemotaxis runs toward damaged, leaking targets --
 * a wounded cell sheds amino acids and nucleotides that are a FOOD SIGNAL --
 * and a small cell near a large one does have receptors telling it so.
 *
 * Returns a multiplier on sense range. Above 1 means pressed harder.
 */
export function appetite(
  hpNow: number, hpMax: number, threat: number,
): number {
  const max = Number.isFinite(hpMax) && hpMax > 0 ? hpMax : 1;
  const hp = Number.isFinite(hpNow)
    ? Math.min(Math.max(hpNow / max, 0), 1) : 1;
  const t = Number.isFinite(threat) ? Math.min(Math.max(threat, 0), 1) : 0;

  // ONLY EVER ADDS.
  //
  // The first version multiplied base sense range by a wariness factor, so
  // a healthy player at threat 0.2 was sensed at 91% of the old range --
  // which means getting stronger makes the floor notice you LESS. That is
  // backwards: power should buy the ability to win fights, not a stealth
  // field, and I had written a comment saying exactly that while
  // implementing the opposite.
  //
  // So the floor's baseline attention never drops. A leaking target is a
  // food signal -- a wounded cell sheds amino acids and nucleotides, which
  // really is chemoattractant -- and that is a BONUS of up to +60% at the
  // point of death. A dangerous target damps the bonus, because a cell does
  // hesitate near something much larger, but it can never damp it below the
  // range the mob always had.
  const bonus = (1 - hp) * 0.6 * (1 - t * 0.45);
  return Math.min(Math.max(1 + bonus, 1), 1.6);
}
