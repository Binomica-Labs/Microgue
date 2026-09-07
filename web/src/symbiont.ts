// Symbionts: loot that is a CHOICE, not a stat.
//
// Every other drop is additive -- a gene, a part, a substrate, all pure gain.
// A symbiont grants something strong and TAKES something in return: an
// endosymbiont that doubles ATP but cannot tolerate oxygen, a capsule that
// halves incoming damage but dulls the senses. They force build identity
// rather than accumulation, and only one can be held at a time -- taking a
// second expels the first.
//
// Modelled after real endosymbiosis: the mitochondrion and the chloroplast
// were free-living cells absorbed whole, trading autonomy for a metabolic
// windfall. That is exactly the shape of the trade.

import type { GeneId } from "./biology.js";

export type SymbiontId =
  | "hydrogenosome" | "capsule" | "magnetosome" | "cyanelle" | "grazer";

export interface Symbiont {
  readonly id: SymbiontId;
  readonly name: string;
  readonly note: string;
  /** Flat power multiplier while held, x1 neutral. */
  readonly power: number;
  /** Incoming-damage multiplier while held, x1 neutral. */
  readonly armour: number;
  /** ATP gain multiplier while held, x1 neutral. */
  readonly atp: number;
  /** Sight-radius delta in tiles while held. */
  readonly sight: number;
  /**
   * Genes this symbiont is INCOMPATIBLE with: expressing any of them while it
   * is held does nothing (the operon is there, the symbiont vetoes it). This
   * is the cost that makes it a choice -- a hydrogenosome shuts down the whole
   * oxidative-phosphorylation route it replaces.
   */
  readonly vetoes: readonly GeneId[];
}

export const SYMBIONTS: Readonly<Record<SymbiontId, Symbiont>> = {
  hydrogenosome: {
    id: "hydrogenosome", name: "hydrogenosome",
    note: "An anaerobic powerhouse. Doubles ATP -- but it poisons on oxygen, "
      + "and the aerobic chain goes dark.",
    power: 1.15, armour: 1, atp: 2, sight: 0,
    vetoes: ["ccoN", "cyoA", "bd"],          // the aerobic terminal oxidases
  },
  capsule: {
    id: "capsule", name: "polysaccharide capsule",
    note: "A thick protective sheath. Halves incoming damage -- but it muffles "
      + "the cell; you sense things late.",
    power: 1, armour: 0.5, atp: 0.9, sight: -3,
    vetoes: [],
  },
  magnetosome: {
    id: "magnetosome", name: "magnetosome chain",
    note: "Iron crystals that orient the cell. It sees far and moves with "
      + "purpose -- but building them drains ATP.",
    power: 1.1, armour: 1, atp: 0.75, sight: 3,
    vetoes: [],
  },
  cyanelle: {
    id: "cyanelle", name: "cyanelle",
    note: "A captive photosynthate. Strong power in the light -- but its thin "
      + "wall offers no protection at all.",
    power: 1.4, armour: 1.4, atp: 1, sight: 1,
    vetoes: ["mcrA", "hdrB"],                // cannot house a methanogen
  },
  grazer: {
    id: "grazer", name: "grazing vacuole",
    note: "Engulfs and digests whole cells. Every kill feeds it -- but a full "
      + "vacuole is slow to defend.",
    power: 1.25, armour: 1.2, atp: 1.15, sight: 0,
    vetoes: [],
  },
};

export const SYMBIONT_IDS = Object.keys(SYMBIONTS) as SymbiontId[];

export function isSymbiontId(v: unknown): v is SymbiontId {
  return typeof v === "string"
    && Object.prototype.hasOwnProperty.call(SYMBIONTS, v);
}
