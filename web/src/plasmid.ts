// The plasmid as an arrangeable ring, not a bag.
//
// Genes occupy contiguous slots. A promoter transcribes everything downstream
// of it until a terminator, an empty slot, or the next promoter -- that run is
// an operon. Three real consequences make this a puzzle rather than a list:
//
//   * TRANSCRIPTIONAL POLARITY. Expression falls with distance from the
//     promoter, so a long operon starves its tail.
//   * FUNCTIONAL CLUSTERING. Real operons group genes of one pathway, because
//     co-regulation is the point. Same-pathway neighbours get a synergy bonus.
//   * METABOLIC BURDEN. Carrying more than you express still costs you.
//
// Everything else -- substrate gating, oxygen lability, codon optimisation --
// carries over from the previous flat model.

import { COMPLEXES, GENES, HAZARDS, energyYield, stratum,
         type Complex, type GeneId, type Hazard, type Teap } from "./biology.js";

export const SLOTS = 16;
export const BIN_CAP = 18;

export type Strength = "weak" | "medium" | "strong";

export const PROMOTER_POWER: Readonly<Record<Strength, number>> =
  { weak: 0.55, medium: 0.85, strong: 1.2 };

/** Per-step decay downstream of the promoter. */
const POLARITY = 0.82;
/** Bonus per same-pathway neighbour in the same operon. */
const SYNERGY = 0.18;
const BURDEN_KNEE = 0.7;

// ---------------------------------------------------------------------- ATP
//
// Expression is not free. Transcription and translation are a large slice of a
// cell's energy budget, which is exactly why carrying a big, highly-expressed
// plasmid is a real burden rather than a pure upgrade.
//
// Supply comes from respiration, and respiration pays less as you descend --
// the same redox tower that gates which genes work at all. Terminal reductases
// and light-harvesting genes are what actually generate; everything else only
// consumes.

export const ATP_MAX = 100;

/** Per-action ATP produced by a gene, when it is expressing. */
const GENERATORS: Partial<Record<GeneId, number>> = {
  // terminal reductases -- these ARE the respiration, so they must out-earn
  // their own expression cost or the game punishes the correct build
  narG: 4.6, dsrA: 12.0, mcrA: 6.6, nosZ: 2.6, norB: 2.0, nirS: 2.4,
  // light harvesting
  psbA: 4.4, pufM: 3.8, fmoA: 3.4, csmA: 1.8,
  // chemolithotrophy and hydrogen
  amoA: 3.0, nxrA: 2.8, soxB: 3.2, sqr: 1.6, hydA: 3.6, aprA: 1.6,
  // luciferase consumes reducing power and FMNH2 to make photons.
  luxAB: -0.8,
  // ATP sulfurylase CONSUMES ATP -- sulfate must be activated to APS before
  // anything can reduce it, at a cost of two ATP equivalents. It is why
  // sulfate reduction is energetically marginal and why sulfate reducers grow
  // slowly. A negative generator is the honest way to model it.
  sat: -1.6,
  // extracellular electron transfer: respiring a mineral still pays
  mtrC: 4.2, omcS: 2.0,
};

/** Cost scales with size and how hard the gene is being driven. */
const COST_PER_KB = 0.7;

export type Part =
  | { kind: "gene"; id: GeneId; optimised: boolean }
  | { kind: "promoter"; strength: Strength }
  | { kind: "terminator" };

export interface Operon {
  readonly promoter: number;
  readonly strength: Strength;
  readonly genes: readonly { slot: number; id: GeneId; rank: number }[];
}

const O2_LABILE: ReadonlySet<GeneId> = new Set(["nifH", "hydA", "mcrA"]);
const CHLOROSOME: ReadonlySet<GeneId> = new Set(["fmoA", "csmA"]);
const NEEDS: Partial<Record<GeneId, "light" | Teap>> = {
  // Luciferase is an oxygenase; without O2 it simply does not turn over.
  luxAB: "O2",
  psbA: "light", pufM: "light", fmoA: "light", csmA: "light",
  mtrC: "Fe(III)", omcS: "Fe(III)",
  dsrA: "SO4", aprA: "SO4",
  mcrA: "CO2", narG: "NO3-",
};

export type Result = { ok: true } | { ok: false; err: string };

export class Plasmid {
  readonly slots: (Part | null)[] = Array<Part | null>(SLOTS).fill(null);

  /** Parts you hold but have not installed. Loot lands here, so acquiring a
   *  gene and deciding where it goes are separate acts. */
  readonly bin: Part[] = [];

  constructor() {
    // You start replicable and minimally transcribing, with spare regulatory
    // parts to build a second transcript once you have something to put in it.
    this.slots[0] = { kind: "promoter", strength: "medium" };
    this.slots[1] = { kind: "gene", id: "ori", optimised: false };
    // A working parts library, not a token. Two weak and two medium promoters
    // plus three terminators is enough to lay down three transcripts before
    // you have looted anything, which is what makes the ring feel like a
    // bench rather than a puzzle piece.
    this.bin.push(
      { kind: "promoter", strength: "weak" },
      { kind: "promoter", strength: "weak" },
      { kind: "promoter", strength: "medium" },
      { kind: "promoter", strength: "medium" },
      { kind: "terminator" },
      { kind: "terminator" },
      { kind: "terminator" },
    );
  }

  /** Put a part in the bin rather than on the ring. */
  stash(part: Part): Result {
    if (part.kind === "gene" && (this.has(part.id) || this.inBin(part.id))) {
      return { ok: false, err: `${GENES[part.id].name} already carried` };
    }
    if (this.bin.length >= BIN_CAP) return { ok: false, err: "parts bin is full" };
    this.bin.push(part);
    this.touch();
    return { ok: true };
  }

  inBin(id: GeneId): boolean {
    return this.bin.some((p) => p.kind === "gene" && p.id === id);
  }

  /** Bin -> ring. Whatever was in the slot goes back to the bin, so a swap
   *  never destroys a part. */
  install(binIndex: number, slot: number): Result {
    const part = this.bin[binIndex];
    if (!part) return { ok: false, err: "no such part" };
    const displaced = this.at(slot);
    if (displaced?.kind === "gene" && displaced.id === "ori") {
      return { ok: false, err: "cannot displace the origin" };
    }
    this.bin.splice(binIndex, 1);
    this.put(slot, part);
    if (displaced) this.bin.push(displaced);
    return { ok: true };
  }

  /** Ring -> bin. */
  uninstall(slot: number): Result {
    const part = this.at(slot);
    if (!part) return { ok: false, err: "empty slot" };
    if (part.kind === "gene" && part.id === "ori") {
      return { ok: false, err: "cannot excise the origin" };
    }
    if (this.bin.length >= BIN_CAP) return { ok: false, err: "parts bin is full" };
    this.put(slot, null);
    this.bin.push(part);
    return { ok: true };
  }

  private norm(i: number): number { return ((i % SLOTS) + SLOTS) % SLOTS; }

  at(i: number): Part | null { return this.slots[this.norm(i)] ?? null; }

  has(id: GeneId): boolean {
    return this.slots.some((p) => p?.kind === "gene" && p.id === id);
  }

  genes(): GeneId[] {
    return this.slots.flatMap((p) => (p?.kind === "gene" ? [p.id] : []));
  }

  free(): number { return this.slots.filter((p) => p === null).length; }

  used(): number {
    return this.slots.reduce((a, p) => a + (p?.kind === "gene" ? GENES[p.id].kb : 0), 0);
  }

  capacityKb(): number { return 18; }

  /** Place a part in the first free slot after `from`, or fail. */
  add(part: Part, from = 0): Result {
    if (part.kind === "gene" && this.has(part.id)) {
      return { ok: false, err: `${GENES[part.id].name} already present` };
    }
    for (let k = 0; k < SLOTS; k++) {
      const i = this.norm(from + k);
      if (this.slots[i] === null) { this.slots[i] = part; this.touch(); return { ok: true }; }
    }
    return { ok: false, err: "no free slot on the plasmid" };
  }

  put(i: number, part: Part | null): void {
    this.slots[this.norm(i)] = part;
    this.touch();
  }

  /** Swap two slots -- the drag-and-drop primitive. */
  swap(a: number, b: number): Result {
    const ia = this.norm(a), ib = this.norm(b);
    // Moving the origin is fine; only excising it is refused (see remove).
    const pa = this.slots[ia] ?? null;
    const pb = this.slots[ib] ?? null;
    this.slots[ia] = pb;
    this.slots[ib] = pa;
    this.touch();
    return { ok: true };
  }

  remove(i: number): Result {
    const p = this.at(i);
    if (p?.kind === "gene" && p.id === "ori") {
      return { ok: false, err: "cannot excise the origin" };
    }
    this.slots[this.norm(i)] = null;
    this.touch();
    return { ok: true };
  }

  /** Rotate the whole ring. Purely cosmetic for the player, but it means the
   *  drag target under a thumb can always be brought to a comfortable spot. */
  rotate(by: number): void {
    const n = this.norm(by);
    if (n === 0) return;
    const copy = this.slots.slice();
    for (let i = 0; i < SLOTS; i++) this.slots[this.norm(i + n)] = copy[i] ?? null;
    this.touch();
  }

  /** Read the ring into operons. Memoised on the revision counter. */
  operons(): Operon[] {
    if (this.memoOperons?.rev === this.rev) return this.memoOperons.value;
    const value = this.computeOperons();
    this.memoOperons = { rev: this.rev, value };
    return value;
  }

  private computeOperons(): Operon[] {
    const out: Operon[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const head = this.slots[i];
      if (head?.kind !== "promoter") continue;
      const genes: { slot: number; id: GeneId; rank: number }[] = [];
      let rank = 0;
      for (let k = 1; k < SLOTS; k++) {
        const j = this.norm(i + k);
        const p = this.slots[j];
        if (p === null || p === undefined) break;          // a gap ends it
        if (p.kind === "promoter") break;                  // next transcript
        if (p.kind === "terminator") break;                // explicit stop
        genes.push({ slot: j, id: p.id, rank });
        rank++;
      }
      out.push({ promoter: i, strength: head.strength, genes });
    }
    return out;
  }

  /** The operon a slot belongs to, if any. */
  operonOf(id: GeneId): { operon: Operon; rank: number } | null {
    for (const op of this.operons()) {
      const hit = op.genes.find((g) => g.id === id);
      if (hit) return { operon: op, rank: hit.rank };
    }
    return null;
  }

  burden(): number {
    const frac = this.used() / this.capacityKb();
    if (frac <= BURDEN_KNEE) return 0;
    const over = (frac - BURDEN_KNEE) / (1 - BURDEN_KNEE);
    // Capped below 1. An over-stuffed plasmid should be crippling, not a
    // cliff that silently switches the entire cell off with no warning --
    // which is what a burden of exactly 1 did.
    return Math.min(over * over, 0.85);
  }

  /** Same-pathway neighbours within one operon co-regulate; that is what
   *  operons are for, so reproducing it is rewarded. */
  private synergy(op: Operon, id: GeneId): number {
    const mine = GENES[id].pathway;
    const same = op.genes.filter((g) => g.id !== id && GENES[g.id].pathway === mine).length;
    return 1 + same * SYNERGY;
  }

  /** Bumped by every mutation. Memoised reads key on it, so a stale cache is
   *  impossible as long as `touch()` is the only way the ring changes -- and
   *  there is a test asserting every public mutator calls it. */
  private rev = 0;
  private memoOperons: { rev: number; value: Operon[] } | null = null;
  private memoAtp = new Map<string, number>();

  private touch(): void {
    this.rev++;
    this.memoOperons = null;
    this.memoAtp.clear();
    this.ensureOrigin();
  }

  /**
   * The origin is not optional.
   *
   * Without `ori` every expression is zero, so the cell is dead -- and the
   * origin is in no loot table, so nothing can bring it back. `remove` and
   * `uninstall` refuse to excise it, but `put` is public and `applySave`
   * writes the whole ring through it, so a save without an origin loaded a
   * permanently dead plasmid with nothing said. Restore rather than refuse:
   * the invariant matters more than the individual write.
   */
  private ensureOrigin(): void {
    if (this.slots.some((s) => s?.kind === "gene" && s.id === "ori")) return;
    const free = this.slots.findIndex((s) => s === null);
    const at = free >= 0 ? free : this.slots.findIndex((s) => s?.kind !== "gene");
    const i = at >= 0 ? at : 0;
    // Direct assignment: going through put() would recurse into touch().
    this.slots[i] = { kind: "gene", id: "ori", optimised: false };
  }

  /** Revision counter, exposed so tests can assert invalidation. */
  revision(): number { return this.rev; }

  /** Fraction of demand the ATP pool can actually meet, 0..1. Set each turn.
   *  Under-supply browns expression out rather than switching it off, which is
   *  what a cell does under energy limitation. */
  supply = 1;

  /** Expression before the ATP brownout. Cost is computed from this, so the
   *  two do not chase each other. */
  rawExpression(id: GeneId, depth: number): number {
    const slot = this.slots.find((p) => p?.kind === "gene" && p.id === id);
    if (slot?.kind !== "gene") return 0;
    if (!this.has("ori")) return 0;

    const ctx = this.operonOf(id);
    if (!ctx) return 0;                                     // untranscribed

    const s = stratum(depth);
    const need = NEEDS[id];
    if (O2_LABILE.has(id) && s.teap === "O2") return 0;
    if (need === "light" && s.light <= 0.02 && !CHLOROSOME.has(id)) return 0;
    if (need && need !== "light" && need !== s.teap) return 0;

    // Expression is set by regulation -- promoter strength, position in the
    // transcript, co-regulation -- NOT by the terminal acceptor's midpoint
    // potential. Folding energyYield in here made every gene express at 4% on
    // the methanogenic floor, including mcrA, which is what that floor is for.
    // Depth belongs on the ATP income instead, where it is a real constraint
    // rather than an invisible tax.
    let e = need === "light" ? Math.max(s.light, 0.25) : 1;

    e *= PROMOTER_POWER[ctx.operon.strength];
    e *= POLARITY ** ctx.rank;                              // polarity
    e *= this.synergy(ctx.operon, id);
    if (!slot.optimised) e *= 0.6;
    return Math.max(e * (1 - this.burden()), 0);
  }

  expression(id: GeneId, depth: number): number {
    // `supply` is public and set from an ATP division. Clamping it here means
    // one bad frame cannot make every downstream number NaN for the rest of
    // the run -- expression, power, vitality and combat all read through this.
    const s = Number.isFinite(this.supply) ? Math.min(Math.max(this.supply, 0), 1) : 1;
    return this.rawExpression(id, depth) * s;
  }

  /** ATP drawn per action. Memoised: it depends only on the ring and the
   *  depth, NOT on `supply`, because it is computed from rawExpression. */
  atpCost(depth: number): number {
    const key = `c${depth}`;
    const hit = this.memoAtp.get(key);
    if (hit !== undefined) return hit;
    const v = this.computeAtpCost(depth);
    this.memoAtp.set(key, v);
    return v;
  }

  private computeAtpCost(depth: number): number {
    let c = 0;
    for (const p of this.slots) {
      if (p?.kind !== "gene") continue;
      c += this.rawExpression(p.id, depth) * GENES[p.id].kb * COST_PER_KB;
    }
    return c;
  }

  /** ATP produced per action. Scaled by the stratum's energy yield, so the
   *  same kit generates far less on the methanogenic floor than at the surface. */
  atpGain(depth: number): number {
    const key = `g${depth}`;
    const hit = this.memoAtp.get(key);
    if (hit !== undefined) return hit;
    const v = this.computeAtpGain(depth);
    this.memoAtp.set(key, v);
    return v;
  }

  private computeAtpGain(depth: number): number {
    let g = 1.2;                                    // baseline fermentation
    for (const p of this.slots) {
      if (p?.kind !== "gene") continue;
      const rate = GENERATORS[p.id];
      if (rate !== undefined) g += rate * this.rawExpression(p.id, depth);
    }
    // The whole depth gradient lives here: the same proteome earns far less
    // when CO2 is the only acceptor left than when O2 is.
    // Floor and slope found by sweeping against a fixture of intended builds:
    // every canonical respiration must pay for itself at its own depth, and
    // every generator-free hoard must drain -- and drain harder the deeper it
    // is carried.
    return Math.max(g, 0) * (0.4 + 0.6 * energyYield(depth));
  }

  atpBalance(depth: number): number {
    return this.atpGain(depth) - this.atpCost(depth);
  }

  optimise(id: GeneId): Result {
    const p = this.slots.find((x) => x?.kind === "gene" && x.id === id);
    if (p?.kind !== "gene") return { ok: false, err: "not carried" };
    if (p.optimised) return { ok: false, err: "already optimised" };
    p.optimised = true;
    this.touch();
    return { ok: true };
  }

  /** Every gene you carry, installed or stashed -- KEGG completeness is scored
   *  against the genome, not against what happens to be transcribing. */
  carried(): Set<GeneId> {
    const out = new Set<GeneId>();
    for (const p of this.slots) if (p?.kind === "gene") out.add(p.id);
    for (const p of this.bin) if (p.kind === "gene") out.add(p.id);
    return out;
  }

  /** Lay a module out as one operon: promoter, genes in reaction order, then a
   *  terminator if one is spare.
   *
   *  Deliberately NOT a free win. It needs a promoter from the bin and a run of
   *  contiguous free slots, and it fails with a reason rather than shuffling
   *  the ring for you. The arrangement puzzle -- promoter strength, polarity
   *  order, what you displace -- stays yours; this only saves the dragging. */
  assemble(genes: readonly GeneId[]): Result {
    const missing = genes.filter((g) => !this.has(g) && !this.inBin(g));
    if (missing.length > 0) {
      return { ok: false, err: `missing ${missing.map((g) => GENES[g].name).join(", ")}` };
    }

    const pi = this.bin.findIndex((p) => p.kind === "promoter");
    if (pi < 0) return { ok: false, err: "no spare promoter in the bin" };

    // A run long enough for promoter + genes, ignoring slots those genes
    // already occupy since they are about to move.
    const movable = new Set<number>();
    this.slots.forEach((p, i) => {
      if (p?.kind === "gene" && genes.includes(p.id)) movable.add(i);
    });
    const usable = (i: number): boolean =>
      this.slots[this.norm(i)] === null || movable.has(this.norm(i));

    const need = genes.length + 1;
    let start = -1;
    for (let i = 0; i < SLOTS; i++) {
      let ok = true;
      for (let k = 0; k < need; k++) if (!usable(i + k)) { ok = false; break; }
      if (ok) { start = i; break; }
    }
    if (start < 0) {
      return { ok: false, err: `needs ${need} contiguous free slots` };
    }

    // Pull the genes off the ring, then lay everything down in order.
    const parts: Part[] = [];
    for (const g of genes) {
      const at = this.slots.findIndex((p) => p?.kind === "gene" && p.id === g);
      if (at >= 0) {
        const p = this.slots[at];
        if (p) parts.push(p);
        this.slots[at] = null;
      } else {
        const bi = this.bin.findIndex((p) => p.kind === "gene" && p.id === g);
        const p = this.bin[bi];
        if (p) { parts.push(p); this.bin.splice(bi, 1); }
      }
    }
    const promoter = this.bin[pi];
    if (!promoter) return { ok: false, err: "no spare promoter in the bin" };
    this.bin.splice(pi, 1);

    this.put(start, promoter);
    parts.forEach((p, k) => { this.put(start + 1 + k, p); });

    // Cap it if a terminator is spare and the next slot is free.
    const tail = this.norm(start + need);
    const ti = this.bin.findIndex((p) => p.kind === "terminator");
    if (ti >= 0 && this.slots[tail] === null) {
      const t = this.bin[ti];
      if (t) { this.bin.splice(ti, 1); this.put(tail, t); }
    }
    return { ok: true };
  }

  /** Complexes active right now: every gene in one operon and all expressing
   *  at this depth. A kit built for the sulfidic zone is inert at the surface. */
  complexes(depth: number): Complex[] {
    const ops = this.operons();
    return COMPLEXES.filter((c) =>
      ops.some((op) => c.genes.every((g) =>
        op.genes.some((x) => x.id === g) && this.expression(g, depth) > 0)));
  }

  /** Half-built pathways. The intermediate accumulates and it is cytotoxic. */
  hazards(depth: number): Hazard[] {
    return HAZARDS.filter((h) =>
      this.expression(h.present, depth) > 0 && this.expression(h.missing, depth) <= 0);
  }

  /** Damage taken per action from accumulated intermediates. */
  toxicity(depth: number): number {
    return this.hazards(depth).reduce((a, h) => a + h.dmg, 0);
  }

  /** Incoming damage multiplier after any armour complex. */
  armour(depth: number): number {
    let frac = 0;
    for (const c of this.complexes(depth)) {
      if (c.effect.kind === "armour") frac = Math.max(frac, c.effect.frac);
    }
    return 1 - frac;
  }

  regen(depth: number): number {
    return this.complexes(depth)
      .reduce((a, c) => a + (c.effect.kind === "regen" ? c.effect.hp : 0), 0);
  }

  reach(depth: number): number {
    return this.complexes(depth)
      .reduce((a, c) => Math.max(a, c.effect.kind === "reach" ? c.effect.tiles : 1), 1);
  }

  aura(depth: number): number {
    return this.complexes(depth)
      .reduce((a, c) => a + (c.effect.kind === "aura" ? c.effect.dmg : 0), 0);
  }

  /**
   * How much punishment the cell can take.
   *
   * A bigger, better-expressed genome is a more robust organism, so toughness
   * comes from the plasmid rather than from a level counter. This is the only
   * progression the player has and it must exist: without it maxhp stayed at
   * 30 for all 24 floors while microbe damage went from 3 to 25, and the last
   * stratum could two-shot a fully built cell.
   */
  vitality(depth: number): number {
    let expressed = 0;
    for (const s of this.slots) {
      if (s?.kind !== "gene" || s.id === "ori") continue;
      if (this.rawExpression(s.id, depth) > 0) expressed++;
    }
    const complexes = this.complexes(depth).length;
    return Math.round(Math.min(20 + expressed * 3.5 + complexes * 5, 92));
  }

  /** Total output, which is what combat scales from. */
  power(depth: number): number {
    let a = 0;
    for (const p of this.slots) {
      if (p?.kind !== "gene") continue;
      a += this.expression(p.id, depth) * GENES[p.id].tier;
    }
    for (const c of this.complexes(depth)) {
      if (c.effect.kind === "power") a *= c.effect.mult;
    }
    return a;
  }
}
