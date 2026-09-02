// What you inoculate.
//
// Chosen once, at the moment the culture goes into the column, and never
// again: the strain that goes down is the strain you built. When it dies the
// slate is clean and the next one is a fresh choice.
//
// The column is a redox ladder and expression is already depth-gated, so the
// interesting axis is not "warrior or mage" -- it is WHERE ON THE LADDER YOU
// ARE NATIVE. That one choice decides where the game is nearly free, where it
// is a crisis, and when you are forced to re-tool. Everything else is
// decoration on top of it.
//
// The trades are made almost entirely out of STARTING GENES rather than
// numeric modifiers, because the depth gating already turns a gene into a
// trade: a photosystem is free energy at the surface and dead weight below the
// photic zone, and nothing had to be written to make that true.

import type { GeneId } from "./biology.js";
import type { TraitId } from "./chromosome.js";

export type ClassId = "phototroph" | "chemolithotroph" | "heterotroph"
  | "methanogen";

export interface StrainClass {
  readonly id: ClassId;
  /** What the lab calls it. */
  readonly name: string;
  /** One line, on the selection card. */
  readonly blurb: string;
  /**
   * Laid down as a working operon at inoculation -- promoter, genes,
   * terminator -- not merely dropped in the bin.
   *
   * TWO genes, not three. Three plus its regulation is five positions, and
   * with the starting vector's three that filled an eight-slot chromosome
   * completely: two of the four classes began with nowhere to build at all.
   * A class should give you an opening, not spend your whole genome on one.
   */
  readonly genes: readonly GeneId[];
  /** Architecture it is built with, if any. */
  readonly trait?: TraitId;
  /** Cassette sites beyond the base eight. A smaller chromosome is a real
   *  handicap and a larger one is a real head start. */
  readonly sites: number;
  /** Where it is comfortable, as a depth range, for the card. */
  readonly native: readonly [number, number];
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  /** The real organism this is drawn from. */
  readonly note: string;
}

export const CLASSES: Readonly<Record<ClassId, StrainClass>> = {
  phototroph: {
    id: "phototroph",
    name: "Phototroph",
    blurb: "Fixes its own carbon in the light. Helpless in the dark.",
    // psbA AND katG. Photosystem II leaks reactive oxygen, and a cyanobacterium
    // that could not deal with its own peroxide would not exist -- catalase is
    // not an upgrade for these organisms, it is a precondition. Shipping
    // psbA alone made the starting class take a point of damage every turn
    // from turn one, which is not a trade, it is a countdown.
    genes: ["psbA", "katG"],
    sites: 2,
    // Light attenuates rather than stopping, so the photosystem keeps making
    // SOMETHING down to D6 -- less and less of it. The range is where it is
    // worth having, not where it is non-zero.
    native: [1, 3],
    pros: [
      "the oxic column costs almost nothing to survive",
      "catalase from the start: the surface cannot corrode it",
    ],
    cons: [
      "output collapses below the photic zone",
      "nothing it carries is worth anything in the dark",
    ],
    note: "A Synechococcus. Oxygenic photosynthesis is the most productive "
      + "thing on this planet and it stops working a few metres down.",
  },

  chemolithotroph: {
    id: "chemolithotroph",
    name: "Chemolithotroph",
    blurb: "Eats rock. At home wherever two chemistries meet.",
    genes: ["soxB", "sqr"],
    sites: 2,
    native: [3, 6],
    pros: [
      "the redox fronts are its home ground",
      "no dependence on light or on anything organic",
    ],
    cons: [
      "nothing special at either end of the column",
      "needs a gradient; dies in water that has settled",
    ],
    note: "A Beggiatoa or a Thiobacillus. Sulfur oxidisers hold the O2/H2S "
      + "interface and are the reason that boundary is a sharp line.",
  },

  heterotroph: {
    id: "heterotroph",
    name: "Heterotroph",
    blurb: "Digests everything. Makes nothing.",
    genes: ["celA", "katG"],
    trait: "partitioned",
    sites: 2,
    native: [1, 8],
    pros: [
      "chews through crusts and sealed pockets earliest",
      "catabolises DNA well -- other people's genes are food",
      "par locus: intermediates never accumulate",
    ],
    cons: [
      "no primary production at any depth",
      "permanently dependent on what is lying around",
    ],
    note: "A Pseudomonas. Metabolically the most versatile thing in the "
      + "column and the least self-sufficient.",
  },

  methanogen: {
    id: "methanogen",
    name: "Methanogen",
    blurb: "Native to the bottom. Oxygen is poison.",
    // One fewer than the others, not fewer than the base: a small ancient
    // genome is a handicap, not an inability to play.
    genes: ["mcrA", "hdrB"],
    sites: 1,
    // D8 only. Measured, not assumed: mcrA does not express at all until the
    // methanogenic zone, so the claimed range was a guess that the data
    // contradicted. That is the point of this class -- it is native to exactly
    // one stratum, the last one, and everything above it is survival.
    native: [8, 8],
    pros: [
      "the deep column is home, where everything else is struggling",
      "methanogenesis is the last rung and nothing competes for it",
    ],
    cons: [
      "the oxic zone is actively hostile -- the opening is a race",
      "one fewer cassette site: a small, ancient genome",
    ],
    note: "An archaeon, not a bacterium. Methanogens are strict anaerobes: "
      + "oxygen does not merely stop them, it destroys the enzymes.",
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

/** The default, for a save written before classes existed. */
export const DEFAULT_CLASS: ClassId = "phototroph";

export function isClassId(v: unknown): v is ClassId {
  return typeof v === "string"
    && Object.prototype.hasOwnProperty.call(CLASSES, v);
}
