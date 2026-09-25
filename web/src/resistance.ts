// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The floor adapts to what keeps killing it.
//
// A player who finds one good weapon uses it for twenty-four floors. That
// is not a build, it is a habit, and no amount of extra mob health makes it
// interesting -- it just makes it longer.
//
// Bacteria are the organisms that famously do NOT let this happen. Kill a
// population with one mechanism and the survivors are the ones it did not
// work on; keep using it and you are selecting for resistance as fast as
// you apply it. That is the single most consequential fact about the things
// this game is made of, and it was not in the game.
//
// The canonical demonstration: Luria and Delbruck, 1943. They showed that
// resistant bacteria are not induced BY the attack -- the mutants are
// already there, and the attack selects them. The fluctuation test is how
// anyone knows that, and it is why this system raises resistance on KILLS
// rather than on hits: you are not teaching them, you are removing everyone
// the mechanism worked on.
//
// So: each damage channel carries a resistance that RISES when you use it
// and DECAYS when you do not. Nothing is ever locked out -- resistance caps
// well short of immunity -- but leaning on one channel costs you more each
// time, and the answer is to rotate.

export type Channel = "bite" | "oxidative" | "sulfide" | "enzyme" | "spear"
  | "cold";

export const CHANNELS: readonly Channel[] = ["bite", "oxidative", "sulfide",
  "enzyme", "spear", "cold"];

/** How much one kill on a channel raises its resistance. */
export const PER_KILL = 0.055;

/** Decay per turn for a channel you are NOT using. */
export const RELAX = 0.0035;

/**
 * The most resistance a channel can reach.
 *
 * Deliberately short of 1: a channel that could be shut off entirely would
 * turn a bad streak into an unwinnable run, and a roguelike that can hand
 * you a dead position is not difficult, it is broken. At 0.6 the worst case
 * is that your favourite is 40% worse and something else is better.
 */
export const CAP = 0.6;

export type Resistance = Record<Channel, number>;

export function newResistance(): Resistance {
  return { bite: 0, oxidative: 0, sulfide: 0, enzyme: 0, spear: 0, cold: 0 };
}

/** Damage multiplier for a channel: 1 when naive, 0.4 when fully adapted. */
export function factor(r: Resistance, c: Channel): number {
  const v = r[c];
  return 1 - (Number.isFinite(v) ? Math.min(Math.max(v, 0), CAP) : 0);
}

/** Record a kill: the channel that did it gets harder from here. */
export function selected(r: Resistance, c: Channel): void {
  const v = r[c];
  r[c] = Math.min((Number.isFinite(v) ? v : 0) + PER_KILL, CAP);
}

/** One turn of relaxation on every channel except the one just used. */
export function relax(r: Resistance, used: Channel | null): void {
  for (const c of CHANNELS) {
    if (c === used) continue;
    const v = r[c];
    r[c] = Math.max((Number.isFinite(v) ? v : 0) - RELAX, 0);
  }
}

/** The channel the floor has adapted to most, if it is worth mentioning. */
export function hardened(r: Resistance): Channel | null {
  let best: Channel | null = null;
  let top = 0.3;                        // below this it is not worth a line
  for (const c of CHANNELS) {
    const v = r[c];
    if (Number.isFinite(v) && v > top) { top = v; best = c; }
  }
  return best;
}

export function resistanceLine(c: Channel): string {
  switch (c) {
    case "bite":      return "They are tougher-walled than they were.";
    case "oxidative": return "Catalase everywhere. Your peroxide is thinning.";
    case "sulfide":   return "They have started binding the sulfide.";
    case "enzyme":    return "Their coats resist your enzymes now.";
    case "spear":     return "They have thickened against puncture.";
    case "cold":      return "The cold does not slow them the way it did.";
  }
}
