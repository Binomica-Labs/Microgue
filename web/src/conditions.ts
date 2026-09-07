// The column, this time.
//
// Every strain that goes down meets the SAME twenty-four strata -- the seed
// only reshapes the cave. So two runs of one class feel identical, and the
// class trade-offs matter less than they should.
//
// A run condition is one persistent environmental fact, rolled at inoculation,
// that reweights the whole descent without new content: it scales substrate,
// hazards, the day cycle, mob speed and where the chemistry sits. A phototroph
// is easy most runs and brutal in an anoxic event; a methanogen's nightmare
// opening becomes survivable in a sulfide upwelling. That is what makes a
// second phototroph run a different run.
//
// Data only. Every field is a MULTIPLIER or a SHIFT with a neutral default, so
// a system reads the condition and scales one number; nothing has to know the
// whole set. `none` is a real entry, so an ordinary run is just the one with
// every multiplier at 1.

export type ConditionId =
  | "none" | "bloom" | "coldSnap" | "sulfideUpwelling" | "anoxic"
  | "ironRich" | "oligotrophic";

export interface Condition {
  readonly id: ConditionId;
  readonly name: string;
  /** One line, shown when the strain is inoculated. */
  readonly note: string;
  /** Substrate available per floor, x1 neutral. A bloom feeds you; an
   *  oligotrophic column starves you. */
  readonly substrate: number;
  /** Hazard damage, x1 neutral. Higher means the wrong operon hurts more. */
  readonly hazard: number;
  /** Mob action speed, x1 neutral. A cold snap slows everything. */
  readonly mobSpeed: number;
  /** How much the oxic zone thins at night, x1 neutral. Anoxic events make the
   *  dark far more dangerous for anything oxygen-dependent. */
  readonly nightThinning: number;
  /** Chemocline shift in STRATA: +1 pushes sulfidic chemistry one floor
   *  shallower, so deep genes pay sooner and shallow ones fade earlier. */
  readonly chemoclineShift: number;
  /** Rarer loot rolls richer here, x1 neutral -- a lean run that pays better. */
  readonly lootRichness: number;
}

const NEUTRAL = {
  substrate: 1, hazard: 1, mobSpeed: 1, nightThinning: 1,
  chemoclineShift: 0, lootRichness: 1,
} as const;

export const CONDITIONS: Readonly<Record<ConditionId, Condition>> = {
  none: {
    id: "none", name: "Stable column",
    note: "The column is settled. Nothing unusual.",
    ...NEUTRAL,
  },
  bloom: {
    id: "bloom", name: "Bloom",
    note: "A surface bloom has sunk through the column. Food everywhere -- and "
      + "competition for it.",
    ...NEUTRAL, substrate: 1.6, mobSpeed: 1.15,
  },
  coldSnap: {
    id: "coldSnap", name: "Cold snap",
    note: "The water has cooled. Everything moves slowly; cold-shock genes earn "
      + "their place.",
    ...NEUTRAL, mobSpeed: 0.7, substrate: 0.85,
  },
  sulfideUpwelling: {
    id: "sulfideUpwelling", name: "Sulfide upwelling",
    note: "H2S is rising through the column. Sulfur chemistry pays higher, and "
      + "shallower.",
    ...NEUTRAL, chemoclineShift: 1, hazard: 1.2,
  },
  anoxic: {
    id: "anoxic", name: "Anoxic event",
    note: "Oxygen is scarce from the top down. The dark is lethal to anything "
      + "that needs to breathe.",
    ...NEUTRAL, nightThinning: 2, hazard: 1.3, substrate: 0.9,
  },
  ironRich: {
    id: "ironRich", name: "Ferruginous column",
    note: "Iron is everywhere. Metal-reducing chemistry thrives; the water "
      + "stains red.",
    ...NEUTRAL, substrate: 1.2, lootRichness: 1.2,
  },
  oligotrophic: {
    id: "oligotrophic", name: "Oligotrophic column",
    note: "A starved column. Little to eat, but what settles here is choice.",
    ...NEUTRAL, substrate: 0.6, lootRichness: 1.5, mobSpeed: 0.9,
  },
};

export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

/**
 * Roll a condition for a run.
 *
 * `none` is weighted heavily: an unusual column should be unusual, or the
 * baseline stops being a baseline. Roughly half of runs are stable; the rest
 * spread across the six.
 */
export function rollCondition(roll: number): ConditionId {
  const r = Number.isFinite(roll) ? ((roll % 1) + 1) % 1 : 0;
  if (r < 0.5) return "none";
  const rest: ConditionId[] = ["bloom", "coldSnap", "sulfideUpwelling",
                               "anoxic", "ironRich", "oligotrophic"];
  const i = Math.min(Math.floor(((r - 0.5) / 0.5) * rest.length), rest.length - 1);
  return rest[i] ?? "none";
}

export function isConditionId(v: unknown): v is ConditionId {
  return typeof v === "string"
    && Object.prototype.hasOwnProperty.call(CONDITIONS, v);
}
