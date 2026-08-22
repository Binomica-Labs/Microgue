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

import { GENES, energyYield, stratum, type GeneId, type Teap } from "./biology.js";

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

  constructor() {
    // You start replicable and minimally transcribing.
    this.slots[0] = { kind: "promoter", strength: "medium" };
    this.slots[1] = { kind: "gene", id: "ori", optimised: false };
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

  /** Total output, which is what combat scales from. */
  power(depth: number): number {
    let a = 0;
    for (const p of this.slots) {
      if (p?.kind !== "gene") continue;
      a += this.expression(p.id, depth) * GENES[p.id].tier;
    }
    return a;
  }
}
