// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// A boss you have to answer, not just out-damage.
//
// A boss was an elite with bigger numbers: the same fight as the mob beside
// it, taking longer. Nothing about it asked what you had BUILT, so a boss
// floor rewarded the same thing every other floor rewarded -- more power --
// and a player with a wrong-shaped genome lost by attrition rather than by
// being answered.
//
// Two things fix that, and both reuse machinery that already exists:
//
//   VULNERABILITY. The damage channels are already modelled (resistance.ts
//   tracks six). A boss shrugs off most of them and is open to one or two,
//   so the question stops being "is my power high enough" and becomes "do I
//   carry anything that can hurt THIS". That is a loadout question, and it
//   has an answer you can go and find rather than grind toward.
//
//   PHASES. The opening is not fixed. A cell under attack does something --
//   encysts, blooms, vents its periplasm -- and each of those changes which
//   channel reaches it. A player who found the one thing that worked has to
//   keep looking, and a player carrying two answers is rewarded for breadth
//   in a game that otherwise rewards depth.
//
// Every phase here is a real stress response. Encystment, oxidative burst
// and a bloom of daughters are what cells actually do when something is
// killing them.

import type { Channel } from "./resistance.js";

export type PhaseId = "open" | "encyst" | "burst" | "bloom";

export interface Phase {
  readonly id: PhaseId;
  readonly name: string;
  /** Channels that reach it in this phase. Everything else is halved. */
  readonly open: readonly Channel[];
  /** Fraction of max hp at or below which this phase begins. */
  readonly below: number;
  /** What the player is told when it starts. */
  readonly tell: string;
  readonly note: string;
}

/**
 * The ladder, read from the TOP DOWN: the first phase whose threshold the
 * boss has fallen below is the one it is in.
 */
export const PHASES: readonly Phase[] = [
  {
    id: "open", name: "exposed", open: ["bite", "enzyme", "spear"],
    below: 1,
    tell: "It is open.",
    note: "Nothing is holding it together yet. Physical damage lands.",
  },
  {
    id: "burst", name: "oxidative burst", open: ["sulfide", "cold"],
    below: 0.7,
    tell: "It floods the water with peroxide.",
    note: "An oxidative burst is a defence, and it also means the cell is "
      + "spending reductant it can no longer use on itself. Reducing "
      + "chemistry reaches it now; oxidising chemistry does not.",
  },
  {
    id: "encyst", name: "encysted", open: ["enzyme"],
    below: 0.4,
    tell: "It encysts. The wall thickens.",
    note: "A cyst wall stops nearly everything. Only something that "
      + "DIGESTS the wall gets through -- which is what a secreted enzyme "
      + "is for.",
  },
  {
    id: "bloom", name: "dividing", open: ["bite", "oxidative", "spear"],
    below: 0.15,
    tell: "It starts dividing. It is trying to outlast you.",
    note: "A cell that cannot win a fight tries to win the census. Dividing "
      + "costs it the wall it was hiding behind.",
  },
];

/** Which phase a boss at this health is in. */
export function phaseOf(hp: number, maxhp: number): Phase {
  const max = Number.isFinite(maxhp) && maxhp > 0 ? maxhp : 1;
  const frac = Number.isFinite(hp) ? Math.min(Math.max(hp / max, 0), 1) : 1;
  // Lowest threshold that the boss is at or under wins, so the ladder is
  // read from the bottom: at 10% it is blooming, not merely encysted.
  const first = PHASES[0];
  if (!first) throw new Error("no phases");
  let best = first;
  for (const p of PHASES) {
    if (frac <= p.below && p.below <= best.below) best = p;
  }
  return best;
}

/**
 * Damage multiplier for a channel against a boss in this phase.
 *
 * Halved rather than nullified. A hard immunity would mean a player with
 * the wrong genome simply cannot finish, with no route but to walk away --
 * and a roguelike that can deal an unwinnable hand is broken rather than
 * difficult. Halved is a real penalty you can still grind through, and the
 * right channel is twice as fast, which is what makes it worth building for.
 */
export function phaseScale(p: Phase, c: Channel): number {
  return p.open.includes(c) ? 1 : 0.5;
}

/** Everything the player needs to decide what to do, in one line. */
export function phaseLine(p: Phase): string {
  return `${p.tell} ${p.note}`;
}
