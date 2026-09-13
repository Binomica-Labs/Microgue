// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Active abilities: what a gene lets you DO, not just what it makes you.
//
// Every build in the game was passive. Genes raised power, armour, ATP; combat
// was walking into things. The plasmid said what you WERE and never what you
// could DO -- so a well-built strain and a badly-built one played the same,
// they just took different numbers of hits.
//
// An ability is an action a gene grants, with a cost in ATP and a cooldown in
// turns. This is the "spell slot" -- but the slots are not a separate system:
// they ARE your operons. Carry the gene, express it at this depth, and the
// ability is on the bar. Lose the gene, lose the move. That keeps the build
// screen the only place identity lives.
//
// Four kinds of thing an ability can do, each a real bacterial behaviour:
//
//   secrete   lay an enzyme on tiles -- short-lived, damages what crosses it.
//             Your "attack tile". Cellulase eats a chaser; protease lyses.
//   bolt      a directed shot: a phage burst, a toxin packet. Ranged combat.
//   burst     an aura pulse around you: a sulfide release, a bloom of ROS.
//   surge     a self-effect: a cold-shock hardening, a motility burst.

import type { GeneId } from "./biology.js";

export type AbilityKind = "secrete" | "bolt" | "burst" | "surge";

export interface Ability {
  readonly id: string;
  readonly name: string;
  /** The gene that grants it. Expressed at depth > 0, or the ability is off. */
  readonly gene: GeneId;
  readonly kind: AbilityKind;
  readonly cost: number;         // ATP
  readonly cooldown: number;     // turns
  /** Damage, or the magnitude of the effect. Scaled by the gene's expression. */
  readonly power: number;
  /** Tiles: reach for a bolt, radius for a burst, footprint for a secretion. */
  readonly range: number;
  /** How many turns a secreted tile lasts. */
  readonly linger: number;
  readonly note: string;
  /** Glyph for the bar. */
  readonly glyph: string;
}

export const ABILITIES: readonly Ability[] = [
  {
    id: "cellulase", name: "cellulase field", gene: "celA", kind: "secrete",
    cost: 6, cooldown: 4, power: 3, range: 1, linger: 4, glyph: "\u2591",
    note: "Secrete endoglucanase on the tiles around you. Anything that "
      + "crosses it is digested. Lasts four turns.",
  },
  {
    id: "protease", name: "protease field", gene: "aprE", kind: "secrete",
    cost: 8, cooldown: 5, power: 5, range: 1, linger: 3, glyph: "\u2592",
    note: "A protease sheet. Harsher and shorter than cellulase: it eats "
      + "membrane, not fibre.",
  },
  {
    id: "phage", name: "phage burst", gene: "recA", kind: "bolt",
    cost: 10, cooldown: 6, power: 7, range: 5, linger: 0, glyph: "\u27A4",
    note: "Release induced prophage in a line. Hits the first thing it "
      + "reaches, up to five tiles out.",
  },
  {
    id: "sulfide", name: "sulfide release", gene: "dsrA", kind: "burst",
    cost: 9, cooldown: 6, power: 4, range: 2, linger: 0, glyph: "\u25C9",
    note: "Vent H2S in a two-tile ring. Everything in it takes damage and is "
      + "slowed. You are not immune -- unless you carry sqr.",
  },
  {
    id: "ros", name: "oxidative burst", gene: "katG", kind: "burst",
    cost: 7, cooldown: 5, power: 3, range: 1, linger: 0, glyph: "\u2600",
    note: "A pulse of peroxide at everything adjacent. Catalase means you "
      + "survive your own weapon.",
  },
  {
    id: "coldshock", name: "cold hardening", gene: "cspA", kind: "surge",
    cost: 5, cooldown: 8, power: 0.5, range: 0, linger: 3, glyph: "\u2744",
    note: "Cold-shock proteins stiffen the membrane. Halve incoming damage "
      + "for three turns.",
  },
  {
    id: "dash", name: "flagellar dash", gene: "flhD", kind: "surge",
    cost: 4, cooldown: 3, power: 3, range: 3, linger: 0, glyph: "\u21D2",
    note: "A burst of flagellar thrust: move three tiles in a straight line "
      + "in one turn. Breaks a leech's grip.",
  },
];

export const ABILITY_BY_ID: Readonly<Record<string, Ability>> =
  Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

/** The abilities a genome grants: those whose gene is expressed here. */
export function grantedAbilities(
  expression: (g: GeneId) => number,
): Ability[] {
  return ABILITIES.filter((a) => expression(a.gene) > 0);
}

/** Per-ability cooldown state, keyed by id. Turn number when it is next usable. */
export type Cooldowns = Map<string, number>;

export function ready(cd: Cooldowns, id: string, turn: number): boolean {
  // A non-finite entry -- from a corrupt save or a NaN turn -- must read as
  // READY, not as infinitely recharging. `NaN <= turn` is false, which would
  // lock the ability for the rest of the run with no way to clear it.
  const until = cd.get(id);
  return until === undefined || !Number.isFinite(until) || until <= turn;
}

export function spend(cd: Cooldowns, a: Ability, turn: number): void {
  cd.set(a.id, turn + a.cooldown);
}
