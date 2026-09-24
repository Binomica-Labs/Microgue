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

export type AbilityKind = "secrete" | "bolt" | "burst" | "surge"
  | "steal" | "purge";

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
  /**
   * Strain level required, 1..MAX_STRAIN.
   *
   * The second axis. A gene GRANTS an ability; the strain's level decides
   * whether the cell is developed enough to run it. Levelling gave slots and
   * ATP -- more room and more fuel -- and nothing you could DO, so the
   * reward for a long run was invisible in play. These are the payoff.
   */
  readonly minStrain?: number;
}

const BASE: readonly Ability[] = [
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
    // Phage is reserved for its own update -- lysogeny, CRISPR defence and
    // horizontal transfer deserve a system, not a damage number. This is a
    // contact-dependent killing machine instead: the Type VI secretion
    // system, a spring-loaded spear real bacteria fire into neighbours.
    id: "t6ss", name: "T6SS spear", gene: "tssB", kind: "bolt",
    cost: 10, cooldown: 6, power: 7, range: 5, linger: 0, glyph: "\u27A4",
    note: "Fire a Type VI secretion spear in a line. Contact-dependent "
      + "killing: it hits the first thing it reaches, up to five tiles out.",
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

/**
 * Abilities that unlock with the strain, not just with a gene.
 *
 * Each is a real thing a bacterium does, chosen so the ladder teaches
 * something rather than escalating a damage number:
 *
 *   L2 flash        bioluminescence as a weapon -- blind what is next to you
 *   L3 efflux       the multidrug pump, run in reverse: purge every status
 *   L5 conjugation  extend a pilus and STEAL a gene from an adjacent cell
 *   L7 sporulation  become an endospore: untouchable, immobile, repairing
 */
const LEVELLED: readonly Ability[] = [
  {
    id: "flash", name: "luminous flash", gene: "luxAB", kind: "burst",
    cost: 6, cooldown: 5, power: 1, range: 2, linger: 0, glyph: "\u2739",
    minStrain: 2,
    note: "Fire every luciferase at once. Anything in two tiles is blinded "
      + "and loses track of you. Real bioluminescence is a startle display "
      + "before it is anything else.",
  },
  {
    id: "efflux", name: "efflux purge", gene: "acrB", kind: "purge",
    cost: 12, cooldown: 9, power: 1, range: 0, linger: 0, glyph: "\u21BB",
    minStrain: 3,
    note: "Run the multidrug pump flat out. Every status on you is expelled "
      + "-- poison, chelation, infection, all of it -- at a steep price in "
      + "ATP, because that is what the pump costs a real cell.",
  },
  {
    id: "conjugate", name: "conjugation", gene: "comA", kind: "steal",
    cost: 14, cooldown: 12, power: 1, range: 1, linger: 0, glyph: "\u26AD",
    minStrain: 5,
    note: "Extend a pilus into an adjacent cell and pull a gene across. "
      + "Horizontal transfer, taken rather than waited for -- this is how "
      + "resistance actually spreads.",
  },
  {
    id: "spore", name: "sporulation", gene: "otsA", kind: "surge",
    cost: 18, cooldown: 20, power: 0, range: 0, linger: 5, glyph: "\u25CF",
    minStrain: 7,
    note: "Commit to an endospore. Nothing touches you for five turns and "
      + "you repair while it lasts -- but you cannot act either. The oldest "
      + "survival strategy there is, and the most total.",
  },
];

export const ABILITIES: readonly Ability[] = [...BASE, ...LEVELLED];

export const ABILITY_BY_ID: Readonly<Record<string, Ability>> =
  Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

/**
 * The abilities available right now: gene expressed here AND the strain
 * developed enough to run it.
 *
 * `strain` defaults to MAX so a caller that does not track levels (a test, a
 * tool) sees everything its genes grant rather than silently nothing.
 */
export function grantedAbilities(
  expression: (g: GeneId) => number, strain = 8,
): Ability[] {
  const lvl = Number.isFinite(strain) ? strain : 8;
  return ABILITIES.filter((a) =>
    expression(a.gene) > 0 && lvl >= (a.minStrain ?? 1));
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
