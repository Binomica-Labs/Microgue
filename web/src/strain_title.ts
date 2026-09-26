// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// What the strain BECAME.
//
// Reaching the bottom was two lines of text and then the player was left
// standing on floor twenty-four with nothing to do. No ending, no record,
// no reason the twenty-four floors were worth it.
//
// The fix is not a bigger congratulation. A run in this game is a BUILD, so
// the ending should name what you built -- and because two players reach
// the bottom with completely different genomes, that naming varies without
// a single line of procedural text generation.
//
// Every title here is a real physiological category with real organisms in
// it. A player who finishes as a methanogen and reads that methanogens are
// the only things that make methane biologically has learned something the
// game never stopped to tell them.

import { GENES, type GeneId, type Pathway } from "./biology.js";

export interface Title {
  /** What to call the strain. */
  readonly name: string;
  /** One line on why it is that. */
  readonly note: string;
}

const BY_PATHWAY: Readonly<Record<Pathway, Title>> = {
  photo: { name: "a phototroph",
    note: "Light in, carbon fixed. The trick that rebuilt the atmosphere." },
  carbon: { name: "an autotroph",
    note: "You made your own carbon from the water. Nothing had to die "
      + "for you." },
  nitrogen: { name: "a diazotroph",
    note: "You broke the triple bond. Almost nothing alive can, and "
      + "everything alive depends on the few that do." },
  sulfur: { name: "a sulfur reducer",
    note: "The chemistry that ran the ocean for a billion years before "
      + "oxygen." },
  iron: { name: "an iron breather",
    note: "You respired rock. The electrons went out of you into a mineral." },
  methane: { name: "a methanogen",
    note: "The last step of every anaerobic food web, and the only "
      + "biological source of methane there is." },
  energy: { name: "a chemolithotroph",
    note: "You ate electrons. No sunlight, no organic carbon, just a "
      + "gradient worth exploiting." },
  core: { name: "a generalist",
    note: "No specialism and no gaps. The strategy that survives when the "
      + "column changes." },
  stress: { name: "an extremophile",
    note: "Built to endure rather than to exploit. Nothing down here "
      + "bothered you." },
  resist: { name: "a resistant lineage",
    note: "Pumps, chelators, efflux. You survived the water rather than "
      + "using it." },
  motility: { name: "a swarmer",
    note: "You out-ran the column. Chemotaxis is the oldest way of "
      + "finding somewhere better." },
  secretion: { name: "a predator",
    note: "You dissolved what you met. Secreted enzymes are how a cell "
      + "eats something bigger than itself." },
};

/**
 * Classify a build by where its expression actually went.
 *
 * Weighted by LEVEL, not by gene count: a strain with one gene at L5 in a
 * pathway committed to it harder than one with three untouched genes, and
 * the title should describe the commitment rather than the shopping list.
 */
export function titleOf(
  installed: ReadonlyMap<GeneId, number>,
): Title {
  const weight = new Map<Pathway, number>();
  for (const [id, level] of installed) {
    if (id === "ori") continue;
    const g = GENES[id];
    const lv = Number.isFinite(level) ? Math.max(level, 1) : 1;
    weight.set(g.pathway, (weight.get(g.pathway) ?? 0) + lv + g.tier * 0.4);
  }
  if (weight.size === 0) {
    return { name: "a survivor",
             note: "You reached the bottom carrying almost nothing. That is "
               + "its own kind of answer." };
  }
  let best: Pathway = "core";
  let top = -1;
  // Ties break on the fixed pathway order, so the same build always gets
  // the same title -- a result that changed between identical runs would
  // read as a bug.
  for (const p of Object.keys(BY_PATHWAY) as Pathway[]) {
    const w = weight.get(p) ?? 0;
    if (w > top) { top = w; best = p; }
  }
  return BY_PATHWAY[best];
}

/** Was the build broad rather than deep? A different kind of achievement. */
export function isGeneralist(
  installed: ReadonlyMap<GeneId, number>,
): boolean {
  const paths = new Set<Pathway>();
  for (const id of installed.keys()) {
    if (id !== "ori") paths.add(GENES[id].pathway);
  }
  return paths.size >= 6;
}
