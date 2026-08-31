// What the cell LOOKS like, derived from what it is expressing.
//
// The avatar was a fixed white capsule for the whole game. You spend a run
// assembling a genome -- pigments, appendages, luciferase -- and none of it
// showed. This turns the plasmid into an appearance, which is the one place
// the build can be read at a glance without opening a screen.
//
// Every trait here is something the gene actually does to a real cell.
// Bacteriochlorophyll IS purple; sulfur oxidisers DO carry refractile globules
// of elemental sulfur; luciferase DOES emit around 490 nm. The point is not
// decoration -- it is that a photoferrotroph and a methanogen should not look
// alike, and until now they did.

import { GENES, type GeneId } from "./biology.js";
import type { Plasmid } from "./plasmid.js";

export interface Phenotype {
  /** Membrane pigment. */
  readonly body: string;
  /** Organelles, septa, granule cores. */
  readonly dark: string;
  /** Appendages and lighter membrane. */
  readonly accent: string;
  /** Inclusions and highlights. */
  readonly hi: string;
  /** 0..1. Bioluminescence -- a real glow, drawn as a halo. */
  readonly glow: number;
  /** 0..1. Flagellar motility: how strongly the filament reads. */
  readonly flagellum: number;
  /** 0..1. Type IV pili: short filaments around the pole. */
  readonly pili: number;
  /** 0..1. Refractile inclusions -- sulfur globules, chlorosomes, granules. */
  readonly granules: number;
  /** A cheap identity for cache keys. */
  readonly key: string;
}

/** The baseline: an unpigmented, unadorned cell. */
const PLAIN = {
  body: "#ffffff", dark: "#1d2b33", accent: "#cfe8f5", hi: "#6fe6ff",
} as const;

/**
 * Pigments, in the order they dominate.
 *
 * A cell expressing both a photosystem and bacteriochlorophyll is not a blend
 * of the two -- it is whichever it makes more of, because pigment saturates.
 * So this is a weighted argmax, not an average: averaging two strong pigments
 * gave a muddy grey that looked like a bug.
 */
const PIGMENTS: readonly { genes: readonly GeneId[]; body: string;
                           dark: string; accent: string }[] = [
  // Oxygenic photosynthesis: chlorophyll a.
  { genes: ["psbA", "psaA"], body: "#7fd08a", dark: "#1c3a26", accent: "#c8f0c4" },
  // Green sulfur bacteria: bacteriochlorophyll c in chlorosomes.
  { genes: ["fmoA", "csmA"], body: "#93c47d", dark: "#243d1e", accent: "#d6e8b8" },
  // Purple bacteria: bacteriochlorophyll a plus carotenoids.
  { genes: ["pufM", "pufL", "bchG"], body: "#c98ac4", dark: "#3a1d38", accent: "#efc9ec" },
  // Iron respiration: cytochrome-dense, rust-toned.
  { genes: ["mtrC", "omcS", "cymA"], body: "#d99a6c", dark: "#402417", accent: "#f0cfae" },
  // Sulfate reduction: dark, iron-sulfide stained.
  { genes: ["dsrA", "aprA"], body: "#8a8f9c", dark: "#22242c", accent: "#c4c8d2" },
  // Methanogens: F420 autofluorescence, a cold blue-green.
  { genes: ["mcrA", "hdrB"], body: "#8fd6c4", dark: "#173330", accent: "#c9f0e6" },
  // Carbon fixation without a photosystem: pale, granular.
  { genes: ["cbbL", "aclB"], body: "#cfd8b8", dark: "#2e3323", accent: "#eaf0d8" },
];

/** Genes whose product is a visible structure rather than a pigment. */
const APPENDAGE: Readonly<Record<string, readonly GeneId[]>> = {
  flagellum: ["flhD", "cheA"],
  pili: ["pilA"],
  granules: ["soxB", "dsrA", "csmA"],
  glow: ["luxAB"],
};

/** Total expression of a set, so a strong promoter shows more than a weak one. */
function output(p: Plasmid, genes: readonly GeneId[], depth: number): number {
  let sum = 0;
  for (const g of genes) {
    if (Object.prototype.hasOwnProperty.call(GENES, g)) sum += p.expression(g, depth);
  }
  return sum;
}

/** Squash an expression total into 0..1 without a hard ceiling. */
const saturate = (x: number): number => x <= 0 ? 0 : x / (x + 1.2);

/**
 * Read the cell's appearance off its plasmid.
 *
 * Expression, not mere presence: a gene sitting on the ring with no promoter
 * upstream produces no protein and should change nothing about how the cell
 * looks. That is the same rule the rest of the model uses, and breaking it
 * here would make the avatar lie about the build.
 */
/**
 * Memoised PER PLASMID, not in a module-level slot.
 *
 * The first version cached one entry keyed on `revision()`, which counts
 * mutations on ONE plasmid and is not unique across instances: two plasmids
 * built with the same number of operations both read revision 5, so a purple
 * cell rendered green. A WeakMap keys on the object itself, which is the only
 * identity that cannot collide, and lets a discarded plasmid be collected.
 */
const memo = new WeakMap<Plasmid,
  { rev: number; depth: number; supply: number; value: Phenotype }>();

export function phenotypeOf(p: Plasmid, depth: number): Phenotype {
  // Memoised on the same things it reads. It runs once a frame and walks
  // twenty genes; without this it was ten microseconds of expression maths per
  // frame to produce a value that changes when the build does, which is rarely.
  const supply = Math.round(p.supply * 20);
  const hit = memo.get(p);
  if (hit?.rev === p.revision() && hit.depth === depth
      && hit.supply === supply) {
    return hit.value;
  }
  const value = compute(p, depth);
  memo.set(p, { rev: p.revision(), depth, supply, value });
  return value;
}

function compute(p: Plasmid, depth: number): Phenotype {
  let best = -1;
  let pigment: (typeof PIGMENTS)[number] | null = null;
  for (const cand of PIGMENTS) {
    const v = output(p, cand.genes, depth);
    if (v > best && v > 0.15) { best = v; pigment = cand; }
  }

  const glow = saturate(output(p, APPENDAGE["glow"] ?? [], depth));
  const flagellum = saturate(output(p, APPENDAGE["flagellum"] ?? [], depth));
  const pili = saturate(output(p, APPENDAGE["pili"] ?? [], depth));
  const granules = saturate(output(p, APPENDAGE["granules"] ?? [], depth));

  const body = pigment?.body ?? PLAIN.body;
  const dark = pigment?.dark ?? PLAIN.dark;
  const accent = pigment?.accent ?? PLAIN.accent;
  // Luciferase emits around 490 nm, so a glowing cell's highlights go cyan
  // whatever its pigment.
  const hi = glow > 0.2 ? "#9dfbff" : granules > 0.3 ? "#ffe9a8" : PLAIN.hi;

  // Quantised into the key so a drifting expression value does not invalidate
  // the sprite cache every single frame.
  const q = (x: number): number => Math.round(x * 4);
  return {
    body, dark, accent, hi, glow, flagellum, pili, granules,
    key: `${body}|${hi}|${String(q(glow))}${String(q(flagellum))}`
      + `${String(q(pili))}${String(q(granules))}`,
  };
}
