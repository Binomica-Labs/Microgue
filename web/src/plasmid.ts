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

export type Strength = "weak" | "medium" | "strong";

export const PROMOTER_POWER: Readonly<Record<Strength, number>> =
  { weak: 0.55, medium: 0.85, strong: 1.2 };

/** Per-step decay downstream of the promoter. */
const POLARITY = 0.82;
/** Bonus per same-pathway neighbour in the same operon. */
const SYNERGY = 0.18;
const BURDEN_KNEE = 0.7;

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
    this.bin.push(
      { kind: "promoter", strength: "weak" },
      { kind: "promoter", strength: "medium" },
      { kind: "terminator" },
      { kind: "terminator" },
    );
  }

  /** Put a part in the bin rather than on the ring. */
  stash(part: Part): Result {
    if (part.kind === "gene" && (this.has(part.id) || this.inBin(part.id))) {
      return { ok: false, err: `${GENES[part.id].name} already carried` };
    }
    if (this.bin.length >= 12) return { ok: false, err: "parts bin is full" };
    this.bin.push(part);
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
    if (this.bin.length >= 12) return { ok: false, err: "parts bin is full" };
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
      if (this.slots[i] === null) { this.slots[i] = part; return { ok: true }; }
    }
    return { ok: false, err: "no free slot on the plasmid" };
  }

  put(i: number, part: Part | null): void { this.slots[this.norm(i)] = part; }

  /** Swap two slots -- the drag-and-drop primitive. */
  swap(a: number, b: number): Result {
    const ia = this.norm(a), ib = this.norm(b);
    // Moving the origin is fine; only excising it is refused (see remove).
    const pa = this.slots[ia] ?? null;
    const pb = this.slots[ib] ?? null;
    this.slots[ia] = pb;
    this.slots[ib] = pa;
    return { ok: true };
  }

  remove(i: number): Result {
    const p = this.at(i);
    if (p?.kind === "gene" && p.id === "ori") {
      return { ok: false, err: "cannot excise the origin" };
    }
    this.slots[this.norm(i)] = null;
    return { ok: true };
  }

  /** Rotate the whole ring. Purely cosmetic for the player, but it means the
   *  drag target under a thumb can always be brought to a comfortable spot. */
  rotate(by: number): void {
    const n = this.norm(by);
    if (n === 0) return;
    const copy = this.slots.slice();
    for (let i = 0; i < SLOTS; i++) this.slots[this.norm(i + n)] = copy[i] ?? null;
  }

  /** Read the ring into operons. */
  operons(): Operon[] {
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
    return Math.min(over * over, 1);
  }

  /** Same-pathway neighbours within one operon co-regulate; that is what
   *  operons are for, so reproducing it is rewarded. */
  private synergy(op: Operon, id: GeneId): number {
    const mine = GENES[id].pathway;
    const same = op.genes.filter((g) => g.id !== id && GENES[g.id].pathway === mine).length;
    return 1 + same * SYNERGY;
  }

  expression(id: GeneId, depth: number): number {
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

    let e = energyYield(depth);
    if (need === "light") e = Math.max(s.light, e);

    e *= PROMOTER_POWER[ctx.operon.strength];
    e *= POLARITY ** ctx.rank;                              // polarity
    e *= this.synergy(ctx.operon, id);
    if (!slot.optimised) e *= 0.6;
    return Math.max(e * (1 - this.burden()), 0);
  }

  optimise(id: GeneId): Result {
    const p = this.slots.find((x) => x?.kind === "gene" && x.id === id);
    if (p?.kind !== "gene") return { ok: false, err: "not carried" };
    if (p.optimised) return { ok: false, err: "already optimised" };
    p.optimised = true;
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
