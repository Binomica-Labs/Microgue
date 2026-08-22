// KEGG-style module map.
//
// Modules, not pathway maps: a full KEGG map is dozens of nodes and unreadable
// on a phone, whereas a MODULE is exactly this -- a small functional unit,
// which is the granularity KEGG itself uses for genome completeness checks.
// Identifiers are the real ones so the map lines up with kegg.jp.
//
// A module is drawn as a chain of metabolites joined by enzyme-labelled arrows.
// An enzyme you do not carry greys its arrow, so the map shows WHICH step is
// broken rather than just that something is.

import { GENES, type GeneId, type Pathway } from "./biology.js";

export interface Step {
  readonly from: string;        // substrate
  readonly to: string;          // product
  readonly gene: GeneId;
  readonly ec: string;
}

export interface Module {
  readonly id: string;          // real KEGG module identifier
  readonly name: string;
  readonly pathway: Pathway;
  readonly steps: readonly Step[];
  readonly note: string;
}

export const MODULES: readonly Module[] = [
  {
    id: "M00529", name: "Denitrification", pathway: "nitrogen",
    steps: [
      { from: "NO3-", to: "NO2-", gene: "narG", ec: "1.7.5.1" },
      { from: "NO2-", to: "NO",   gene: "nirS", ec: "1.7.2.1" },
      { from: "NO",   to: "N2O",  gene: "norB", ec: "1.7.2.5" },
      { from: "N2O",  to: "N2",   gene: "nosZ", ec: "1.7.2.4" },
    ],
    note: "Nitrate to dinitrogen. Stop short and the intermediate accumulates.",
  },
  {
    id: "M00528", name: "Nitrification", pathway: "nitrogen",
    steps: [
      { from: "NH3",  to: "NO2-", gene: "amoA", ec: "1.14.99.39" },
      { from: "NO2-", to: "NO3-", gene: "nxrA", ec: "1.7.99.-" },
    ],
    note: "Ammonia to nitrate. Feeds the denitrifiers below you.",
  },
  {
    id: "M00596", name: "Dissimilatory sulfate reduction", pathway: "sulfur",
    steps: [
      { from: "SO4^2-", to: "APS",    gene: "sat",  ec: "2.7.7.4" },
      { from: "APS",    to: "SO3^2-", gene: "aprA", ec: "1.8.99.2" },
      { from: "SO3^2-", to: "H2S",    gene: "dsrA", ec: "1.8.99.5" },
    ],
    note: "Sulfate to sulfide. The H2S blackens the sediment and burns neighbours.",
  },
  {
    id: "M00567", name: "Methanogenesis, CO2 => CH4", pathway: "methane",
    steps: [
      { from: "CO2",       to: "CH3-S-CoM", gene: "hdrB", ec: "1.8.98.1" },
      { from: "CH3-S-CoM", to: "CH4",       gene: "mcrA", ec: "2.8.4.1" },
    ],
    note: "The last respiration. Flavin bifurcation makes CO2 worth reducing.",
  },
  {
    id: "M00595", name: "Sulfur oxidation, SOX system", pathway: "sulfur",
    steps: [
      { from: "H2S",     to: "S0",     gene: "sqr",  ec: "1.8.5.4" },
      { from: "S0",      to: "SO4^2-", gene: "soxB", ec: "3.1.6.20" },
    ],
    note: "Runs the sulfur cycle backwards, at the oxic/anoxic front.",
  },
  {
    id: "M00175", name: "Nitrogen fixation", pathway: "nitrogen",
    steps: [
      { from: "N2", to: "NH3", gene: "nifH", ec: "1.18.6.1" },
      { from: "H2", to: "e- (Fd)", gene: "hydA", ec: "1.12.7.2" },
    ],
    note: "Nitrogenase evolves H2 obligately; an uptake hydrogenase recovers it.",
  },
  {
    id: "M00165", name: "Reductive pentose phosphate cycle", pathway: "carbon",
    steps: [
      { from: "H2O", to: "O2 + e-", gene: "psbA", ec: "1.10.3.9" },
      { from: "CO2", to: "3-PGA",   gene: "cbbL", ec: "4.1.1.39" },
    ],
    note: "Calvin cycle driven by oxygenic photosynthesis. Expensive, universal.",
  },
  {
    id: "M00173", name: "Reductive citrate cycle", pathway: "carbon",
    steps: [
      { from: "light", to: "e- (Q)",    gene: "pufM", ec: "1.10.9.9" },
      { from: "CO2",   to: "acetyl-CoA", gene: "aclB", ec: "2.3.3.8" },
    ],
    note: "rTCA under anoxygenic light. Fewer ATP per carbon than Calvin.",
  },
  {
    id: "M00028", name: "Extracellular electron transfer", pathway: "iron",
    steps: [
      { from: "quinol", to: "Fe(III) surface", gene: "mtrC", ec: "1.-.-.-" },
      { from: "MtrC",   to: "distal Fe(III)",  gene: "omcS", ec: "1.-.-.-" },
    ],
    note: "Not a canonical KEGG module; grouped here because it behaves like one.",
  },
];

export type StepState = "have" | "missing";

export interface ModuleState {
  readonly module: Module;
  readonly steps: readonly StepState[];
  readonly complete: boolean;
  readonly held: number;
  readonly total: number;
}

/** Completeness against a set of carried genes -- ring and bin both count,
 *  the same way KEGG Mapper scores a genome rather than a transcriptome. */
export function moduleState(m: Module, carried: ReadonlySet<GeneId>): ModuleState {
  const steps = m.steps.map((s): StepState => (carried.has(s.gene) ? "have" : "missing"));
  const held = steps.filter((s) => s === "have").length;
  return { module: m, steps, complete: held === steps.length, held, total: steps.length };
}

export function allStates(carried: ReadonlySet<GeneId>): ModuleState[] {
  return MODULES.map((m) => moduleState(m, carried));
}

/** Which enzymes a module still needs. This is what the map is for. */
export function missingGenes(m: Module, carried: ReadonlySet<GeneId>): GeneId[] {
  return m.steps.filter((s) => !carried.has(s.gene)).map((s) => s.gene);
}

/** Total kb a module would occupy on the plasmid. */
export function moduleKb(m: Module): number {
  return m.steps.reduce((a, s) => a + GENES[s.gene].kb, 0);
}


// ------------------------------------------------------------------- graph
//
// Metabolites are shared between modules, so the modules are not eight
// parallel chains -- they close into the actual biogeochemical cycles. N2
// leaves denitrification and re-enters at nitrogen fixation; H2S leaves
// sulfate reduction and re-enters at sulfur oxidation. Laying it out as a
// graph makes that visible, which a list cannot.
//
// Positions are hand-placed in an abstract space; the view pans and zooms over
// them. Cycles are drawn as rings so they read as cycles.

export interface Node {
  readonly id: string;          // the metabolite label
  readonly x: number;
  readonly y: number;
  readonly group: Pathway;
}

const ring = (
  cx: number, cy: number, r: number, group: Pathway, labels: readonly string[],
): Node[] => labels.map((id, i) => {
  const a = (i / labels.length) * Math.PI * 2 - Math.PI / 2;
  return { id, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, group };
});

export const NODES: readonly Node[] = [
  // nitrogen cycle -- a genuine ring
  ...ring(0, 0, 150, "nitrogen", ["N2", "NH3", "NO2-", "NO3-", "NO", "N2O"]),
  // sulfur cycle -- also a ring, sharing nothing with nitrogen
  // H2S and HS- are the same pool at circumneutral pH (pKa1 ~ 7.0), so they
  // are one node -- which is what lets the sulfur cycle close.
  ...ring(400, 0, 140, "sulfur", ["H2S", "S0", "SO4^2-", "APS", "SO3^2-"]),
  // carbon and methane
  { id: "CO2",       x: 760, y: -110, group: "carbon" },
  { id: "CH3-S-CoM", x: 900, y: -40,  group: "methane" },
  { id: "CH4",       x: 900, y: 50,   group: "methane" },
  { id: "3-PGA",     x: 640, y: -10,  group: "carbon" },
  { id: "acetyl-CoA",x: 640, y: 90,   group: "carbon" },
  { id: "H2O",       x: 790, y: 220,  group: "photo" },
  { id: "O2 + e-",   x: 640, y: 190,  group: "photo" },
  { id: "light",     x: 790, y: 130,  group: "photo" },
  { id: "e- (Q)",    x: 660, y: 300,  group: "energy" },
  { id: "e- (Fd)",   x: -180, y: 250, group: "energy" },
  { id: "H2",        x: -180, y: 140, group: "energy" },
  // iron
  { id: "quinol",           x: 150,  y: 300, group: "iron" },
  { id: "Fe(III) surface",  x: 330,  y: 300, group: "iron" },
  { id: "MtrC",             x: 150,  y: 380, group: "iron" },
  { id: "distal Fe(III)",   x: 330,  y: 380, group: "iron" },
];

export interface Edge {
  readonly from: Node;
  readonly to: Node;
  readonly gene: GeneId;
  readonly ec: string;
  readonly module: Module;
}

const nodeById = new Map(NODES.map((n) => [n.id, n]));

/** Edges derive from MODULES, so the graph cannot drift from the module data. */
export const EDGES: readonly Edge[] = MODULES.flatMap((m) =>
  m.steps.flatMap((s) => {
    const from = nodeById.get(s.from);
    const to = nodeById.get(s.to);
    if (!from || !to) return [];
    return [{ from, to, gene: s.gene, ec: s.ec, module: m }];
  }));

/** Metabolites named by a module but absent from NODES. Should always be empty;
 *  the suite asserts it, so adding a step without a node fails the build. */
export function orphanMetabolites(): string[] {
  const out = new Set<string>();
  for (const m of MODULES) {
    for (const s of m.steps) {
      if (!nodeById.has(s.from)) out.add(s.from);
      if (!nodeById.has(s.to)) out.add(s.to);
    }
  }
  return [...out];
}

export function graphBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of NODES) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  return { minX, minY, maxX, maxY };
}
