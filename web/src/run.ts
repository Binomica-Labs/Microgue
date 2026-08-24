// Run state: the roguelike layer.
//
// From the original design: "If your character dies, you get resynthesized
// with some of the genes you acquired in the previous run so you can quickly
// get to where you left off." So death ends the run and costs you, but it is
// not a wipe -- the lineage carries part of its genome forward, which is what
// a culture actually does.

import type { Part } from "./transcription.js";
import { GENES, MICROBES, stratum, type GeneId } from "./biology.js";
import { SOURCES, type Record_ } from "./ncbi.js";
import { MODIFIERS, PROMOTERS, TERMINATORS } from "./parts.js";

/** Fraction of acquired loci that survive resynthesis. */
export const CARRYOVER = 0.5;

export interface RunState {
  /** Deepest stratum reached this lineage, which is the score. */
  deepest: number;
  deaths: number;
  /** Loci ever seen, and organisms ever met -- the field notebook. */
  bestiary: string[];
  library: GeneId[];
}

export function newRun(): RunState {
  return { deepest: 1, deaths: 0, bestiary: [], library: [] };
}

export function recordSighting(run: RunState, microbeId: string): boolean {
  if (run.bestiary.includes(microbeId)) return false;
  run.bestiary.push(microbeId);
  return true;
}

export function recordLocus(run: RunState, gene: GeneId): void {
  if (!run.library.includes(gene)) run.library.push(gene);
}

/**
 * Which loci survive death. Deterministic given the order they were acquired,
 * so a run is reproducible and the loss is legible rather than arbitrary: the
 * earliest-acquired half is kept, because that is what the lineage has had
 * longest to stabilise.
 */
export function resynthesise(carried: readonly GeneId[]): GeneId[] {
  const real = carried.filter((g) => g !== "ori");
  const keep = Math.floor(real.length * CARRYOVER);
  return real.slice(0, keep);
}

export interface Sighting {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly note: string;
  readonly genes: readonly GeneId[];
}

/** The field notebook, in the order the column would present them. */
export function notebook(run: RunState): Sighting[] {
  return MICROBES
    .filter((m) => run.bestiary.includes(m.id))
    .sort((a, b) => a.depth - b.depth)
    .map((m) => ({ id: m.id, name: m.name, depth: m.depth, note: m.note, genes: m.genes }));
}

export function completeness(run: RunState): { seen: number; total: number } {
  return { seen: run.bestiary.length, total: MICROBES.length };
}

/**
 * The plasmid as a FASTA record.
 *
 * Sequences come from NCBI. Any locus that could not be fetched is emitted as
 * a comment carrying its Entrez query, so it stays obtainable by hand. Nothing
 * is ever invented -- a record either holds the bases NCBI returned or admits
 * it has none.
 */
export function exportAnnotation(
  name: string, depth: number,
  slots: readonly (Part | null)[],
  sequences?: Map<GeneId, Record_>,
): string {
  const s = stratum(depth);
  const lines: string[] = [
    `; Microgue plasmid export`,
    `; culture   ${name}`,
    `; depth     D${depth} ${s.name} (${s.teap}, ${s.e0 >= 0 ? "+" : ""}${s.e0} mV)`,
    `; loci are real. Sequences below are as returned by NCBI; any locus`,
    `; without one carries its Entrez query instead. Nothing here is invented.`,
    ``,
  ];
  // Map first: the arrangement is the thing the player built.
  slots.forEach((p, i) => {
    if (!p) return;
    const at = String(i).padStart(2, "0");
    if (p.kind === "promoter") lines.push(`; ${at}  promoter    ${PROMOTERS[p.id].name} (${PROMOTERS[p.id].mode})`);
    else if (p.kind === "terminator") {
      const t = TERMINATORS[p.id];
      lines.push(`; ${at}  terminator  ${t.name.padEnd(10)} ` +
                 `${((1 - t.readthrough) * 100).toFixed(0)}% efficient`);
    }
    else {
      const g = GENES[p.id];
      const extra = [
        p.level > 1 ? `L${String(p.level)}` : "",
        ...p.mods.map((m) => MODIFIERS[m].name),
      ].filter(Boolean).join(", ");
      lines.push(`; ${at}  CDS         ${g.name.padEnd(6)} ${g.kb.toFixed(1)} kb  ` +
                 `${g.product}${extra ? `  [${extra}]` : ""}`);
    }
  });
  lines.push("");

  // Then the sequences themselves.
  for (const [i, p] of slots.entries()) {
    if (p?.kind !== "gene") continue;
    const g = GENES[p.id];
    const rec = sequences?.get(p.id);
    const src = SOURCES[p.id];
    if (rec) {
      lines.push(`>${rec.accession} ${g.name} | ${g.product} | slot ${String(i)} | ${rec.defline}`);
      for (let k = 0; k < rec.seq.length; k += 70) lines.push(rec.seq.slice(k, k + 70));
    } else if (src) {
      lines.push(`; ${g.name} | ${g.product} | slot ${String(i)}`);
      lines.push(`;   no sequence retrieved. Entrez: ${src.query}`);
    } else {
      lines.push(`; ${g.name} | ${g.product} | slot ${String(i)}`);
      lines.push(`;   design element, no NCBI record`);
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
