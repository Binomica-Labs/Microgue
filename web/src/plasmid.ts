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

import { b_install, b_stash, b_takeOne, b_uninstall } from "./bin.js";
import { COMPLEXES, GENES, HAZARDS, energyYield, stratum,
         type Complex, type GeneId, type Hazard } from "./biology.js";

/** Re-exported from transcription.ts, which owns the ring model. There were
 *  two of these and they disagreed: the plasmid capped at 16 while the
 *  transcription model allowed 24, so the largest replicon was silently
 *  clamped and levelling appeared to do nothing. */
export { SLOTS } from "./transcription.js";
export const BIN_CAP = 18;

/** Regulatory parts the starting vector puts in the bin. The lab cannot
 *  order more constructs than the remainder will hold. */
export const STARTING_PARTS = 7;

export type Strength = "weak" | "medium" | "strong";

export const PROMOTER_POWER: Readonly<Record<Strength, number>> =
  { weak: 0.55, medium: 0.85, strong: 1.2 };

/** Per-step decay downstream of the promoter. */
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

// The part model lives in transcription.ts and the catalogue in parts.ts, so
// adding a promoter, a terminator or a gene modifier does not touch this class.
export type { Part } from "./transcription.js";
import { CHLOROSOME, COST_PER_KB, GENERATORS, NEEDS, O2_LABILE, WASTE_PER_UNIT }
  from "./metabolism.js";
import { SLOTS, modEffect, transcribe, type Part } from "./transcription.js";
import { WILD_TYPE, alleleEffect } from "./allele.js";
import { buildOperon } from "./operon.js";
import { rescueStranded } from "./stack.js";
import { capacityFor, copiesFor, copyBurden,
         dosage, slotsFor,
         type TraitId } from "./chromosome.js";
import { TERMINATORS } from "./parts.js";
import { bonusCapacityKb, bonusSlots } from "./strain.js";
import { MAX_LEVEL, MODIFIERS, evolutionCost, levelMultiplier, modifierSlots,
         type Context, type ModifierId } from "./parts.js";

export interface Operon {
  readonly promoter: number;
  readonly output: number;
  readonly genes: readonly { slot: number; id: GeneId; rank: number; flow: number }[];
}

export type Result = { ok: true } | { ok: false; err: string };

export class Plasmid {
  readonly slots: (Part | null)[] = Array<Part | null>(SLOTS).fill(null);

  /** Parts you hold but have not installed. Loot lands here, so acquiring a
   *  gene and deciding where it goes are separate acts. */
  readonly bin: Part[] = [];

  constructor() {
    // You start replicable and minimally transcribing, with spare regulatory
    // parts to build a second transcript once you have something to put in it.
    this.slots[0] = { kind: "promoter", id: "j23106" };
    this.slots[1] = { kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE };
    // A terminator, because a real vector has one. Without it the starting
    // transcript runs off the end of the origin and burns ATP on nothing --
    // which is exactly the cost the terminator model is meant to teach, and a
    // poor thing to open the game with.
    this.slots[2] = { kind: "terminator", id: "rrnbt1" };
    // A working parts library, not a token. Two weak and two medium promoters
    // plus three terminators is enough to lay down three transcripts before
    // you have looted anything, which is what makes the ring feel like a
    // bench rather than a puzzle piece.
    this.bin.push(
      { kind: "promoter", id: "j23114" },
      { kind: "promoter", id: "j23114" },
      { kind: "promoter", id: "j23106" },
      { kind: "promoter", id: "j23106" },
      { kind: "terminator", id: "rrnbt1" },
      { kind: "terminator", id: "rrnbt1" },
      { kind: "terminator", id: "rrnbt1" },
    );
  }

  /**
   * Run a compound edit, or leave nothing behind.
   *
   * Validating everything before touching anything is better where it is
   * possible -- `expand`, `acquire` and `buy` all do that. But a multi-step
   * edit that places parts one at a time cannot always know its last failure
   * in advance: `assemble` splices parts OUT of the bin and then places them,
   * and a refused `put` partway through destroys whatever it had removed.
   *
   * Snapshots the ring and the bin, runs `fn`, and restores both if it returns
   * a failure OR throws. A throw is re-raised afterwards: rolling back is not
   * the same as pretending nothing went wrong, and swallowing it would turn a
   * crash into silent corruption -- which is the failure class this exists to
   * remove.
   *
   * A shallow copy of each array is enough. Parts are replaced wholesale,
   * never mutated in place; a deep copy would be slower and would HIDE a real
   * bug if that ever stopped being true.
   */
  transact(fn: () => Result): Result {
    const slots = this.slots.slice();
    const bin = this.bin.slice();
    const restore = (): void => {
      this.slots.length = 0;
      this.slots.push(...slots);
      this.bin.length = 0;
      this.bin.push(...bin);
      this.touch();
    };
    let out: Result;
    try {
      out = fn();
    } catch (e) {
      restore();
      throw e;
    }
    if (!out.ok) restore();
    return out;
  }

  /** Put a part in the bin rather than on the ring. */
  /**
   * Put a part in the bin, stacking a duplicate rather than refusing it.
   *
   * A second copy of a gene you already carry used to be turned away, so a
   * better roll of something you owned was simply unpickupable. It stacks now,
   * up to MAX_STACK, and only with a copy of the SAME RARITY -- rarity here
   * describes the copy, so a rare mtrC and a common one are different objects
   * that share a name.
   */
  stash(part: Part): Result { return b_stash(this, part); }

  /** Take ONE copy off a stack, leaving the rest. Returns what came off. */
  takeOne(binIndex: number): Part | null { return b_takeOne(this, binIndex); }

  inBin(id: GeneId): boolean {
    return this.bin.some((p) => p.kind === "gene" && p.id === id);
  }

  /** Bin -> ring. Whatever was in the slot goes back to the bin, so a swap
   *  never destroys a part. */
  install(binIndex: number, slot: number): Result { return b_install(this, binIndex, slot); }

  /** Ring -> bin. */
  uninstall(slot: number): Result { return b_uninstall(this, slot); }

  /**
   * Wrap a ring index.
   *
   * Modulo the USABLE slots, not the array length. The array is sized for the
   * largest replicon; the ring is however much of it this replicon owns, and a
   * plasmid is a circle that closes THERE. Wrapping modulo the array meant an
   * operon starting near the end ran into positions the replicon does not
   * have -- which is how `assemble` stranded parts at 16 on a 16-slot
   * backbone, and why transcription never actually wrapped.
   */
  /** @internal: public because operon building lives in operon.ts, and the
   *  ring's wrap rule is exactly what it needs. */
  norm(i: number): number {
    const used = this.usableSlots;
    const k = Number.isFinite(i) ? Math.round(i) : 0;
    return ((k % used) + used) % used;
  }

  /**
   * Empty a position regardless of whether the replicon still owns it.
   *
   * `put` refuses unusable positions, which is right everywhere except when
   * MOVING to a smaller backbone -- the one operation whose whole job is to
   * clear the positions that have just stopped existing. Without this,
   * subcloning down could not unstrand what it had just stranded.
   */
  vacate(i: number): Part | null {
    const k = this.exact(i);
    if (k < 0 || k >= SLOTS) return null;
    const was = this.slots[k] ?? null;
    if (was === null) return null;
    this.slots[k] = null;
    this.touch();
    return was;
  }

  /**
   * An explicit index, NOT wrapped.
   *
   * `norm` is for walking ring neighbours, where wrapping is the whole point.
   * Applying it to a caller-supplied index is different and dangerous: with a
   * 16-slot replicon it silently maps 20 onto 4, so loading a save whose array
   * runs to 23 would overwrite the first eight positions.
   */
  private exact(i: number): number {
    return Number.isFinite(i) ? Math.round(i) : -1;
  }

  /** The part at an exact position. Out of range reads as empty rather than
   *  wrapping onto something else. */
  at(i: number): Part | null {
    const k = this.exact(i);
    return k >= 0 && k < SLOTS ? this.slots[k] ?? null : null;
  }

  has(id: GeneId): boolean {
    return this.slots.some((p) => p?.kind === "gene" && p.id === id);
  }

  genes(): GeneId[] {
    return this.slots.flatMap((p) => (p?.kind === "gene" ? [p.id] : []));
  }

  /** Empty positions the replicon actually has. Counting the whole array
   *  reported free space that nothing could be put in. */
  free(): number {
    let n = 0;
    for (let i = 0; i < this.usableSlots; i++) if (this.slots[i] === null) n++;
    return n;
  }

  used(): number {
    return this.slots.reduce((a, p) => a + (p?.kind === "gene" ? GENES[p.id].kb : 0), 0);
  }

  /** Copy number multiplies product. Sub-linear, because transcription and
   *  translation saturate long before the DNA does. */
  /**
   * The ATP fraction, 0..1, set by the game each turn. A runaway replicon
   * reads it; nothing else does.
   */
  private _energy = 1;
  get energy(): number { return this._energy; }
  set energy(v: number) {
    const e = Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 1;
    // Quantised, then it invalidates the memo. The ATP figures are cached on
    // depth alone, so a runaway backbone's cost never recomputed when its copy
    // number changed -- it reported the cost of whatever energy it first saw.
    // Quantising keeps a continuously drifting value from clearing the cache
    // every single turn.
    const q = Math.round(e * 20) / 20;
    if (q === this._energy) return;
    this._energy = q;
    if (this.traits.has("runaway")) this.memoAtp.clear();
  }

  /** Copies actually present, which a runaway backbone varies with energy. */
  copies(): number {
    return copiesFor(this.traits.has("runaway"), this.energy);
  }

  dosage(): number { return dosage(this.copies()); }

  capacityKb(): number {
    return capacityFor(this.usableSlots, bonusCapacityKb(this.strain));
  }

  /** Place a part in the first free USABLE slot after `from`, or fail. */
  add(part: Part, from = 0): Result {
    // Both places, as `stash` does. Ring-only let a gene sit on the ring AND
    // in the bin: the "carried twice" invariant fires, and a save round-trip
    // drops one copy silently -- parseRing/parseBin dedupe separately.
    if (part.kind === "gene" && (this.has(part.id) || this.inBin(part.id))) {
      return { ok: false, err: `${GENES[part.id].name} already carried` };
    }
    for (let k = 0; k < this.usableSlots; k++) {
      const i = this.norm(from + k);
      if (!this.usable(i)) continue;
      if (this.slots[i] === null) { this.slots[i] = part; this.touch(); return { ok: true }; }
    }
    return { ok: false, err: "no free slot on the plasmid" };
  }

  /** Is this ring position available on the current replicon? Positions past
   *  `usableSlots` exist in the array but are not yours to fill. */
  usable(i: number): boolean {
    return Number.isInteger(i) && i >= 0 && i < this.usableSlots;
  }

  put(i: number, part: Part | null): void {
    // Refuse a position the replicon does not have. Allowing it is precisely
    // how parts ended up stranded past the end of the ring.
    const k = this.exact(i);
    if (!this.usable(k)) return;
    this.slots[k] = part;
    this.touch();
  }

  /** Swap two slots -- the drag-and-drop primitive. */
  swap(a: number, b: number): Result {
    const ia = this.exact(a), ib = this.exact(b);
    // Same reason as rotate: a position past the replicon's last is not a
    // place a part may go.
    if (!this.usable(ia) || !this.usable(ib)) {
      return { ok: false, err: "no such position on this plasmid" };
    }
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
    const k = this.exact(i);
    if (k < 0 || k >= SLOTS) return { ok: false, err: "no such position" };
    this.slots[k] = null;
    this.touch();
    return { ok: true };
  }

  /** Rotate the whole ring. Purely cosmetic for the player, but it means the
   *  drag target under a thumb can always be brought to a comfortable spot. */
  /**
   * Spin the ring.
   *
   * Only the USABLE positions rotate. The array is sized for the largest
   * replicon, so spinning all of it pushed parts into positions the current
   * replicon does not have -- reachable by simply dragging the ring, which is
   * the most ordinary thing a player does on that screen.
   */
  rotate(by: number): void {
    const used = this.usableSlots;
    const n = ((Math.round(Number.isFinite(by) ? by : 0) % used) + used) % used;
    if (n === 0) return;
    const copy = this.slots.slice();
    for (let i = 0; i < used; i++) this.slots[(i + n) % used] = copy[i] ?? null;
    this.touch();
  }

  /** Read the ring into operons. Memoised on the revision counter. */
  operons(): Operon[] {
    if (this.memoOperons?.rev === this.rev) return this.memoOperons.value;
    const value = this.computeOperons();
    this.memoOperons = { rev: this.rev, value };
    return value;
  }

  /**
   * Operons are now derived from the transcription model, which attenuates at
   * a terminator rather than stopping there. A gene downstream of a leaky
   * hairpin really does get a share of the upstream promoter.
   */
  private computeOperons(): Operon[] {
    const ctx = this.context();
    return transcribe(this.slots, ctx, this.usableSlots).map((t) => ({
      promoter: t.promoter,
      output: t.output,
      genes: t.readings.map((r) => ({ slot: r.slot, id: r.id, rank: r.rank, flow: r.flow })),
    }));
  }

  /**
   * What conditional and inducible promoters can see.
   *
   * Accessors, not fields: these are INPUTS to `transcribe`, but the operon
   * memo keys on `rev`, which only ring mutations bumped. As plain fields,
   * changing floor did not re-evaluate PfnrS or PsoxS until something touched
   * the ring. They invalidate on a real change, and only on a real change.
   */
  private _depth = 1;
  get depth(): number { return this._depth; }
  set depth(v: number) {
    const d = Number.isFinite(v) ? v : 1;
    if (d === this._depth) return;
    this._depth = d;
    this.invalidate();
  }

  private _inducers: ReadonlySet<string> = new Set();
  get inducers(): ReadonlySet<string> { return this._inducers; }
  set inducers(v: ReadonlySet<string>) {
    // By CONTENT: upkeep rebuilds this set every turn, so a reference compare
    // would clear the memo every turn and it would never serve anything.
    if (v.size === this._inducers.size) {
      let same = true;
      for (const k of v) if (!this._inducers.has(k)) { same = false; break; }
      if (same) return;
    }
    this._inducers = v;
    this.invalidate();
  }

  /** Which plasmid this is. Copy number multiplies both expression and burden;
   *  slots and capacity come from the replicon plus whatever the strain has
   *  earned. See replicon.ts and strain.ts. */
  /** Cassette sites integrated beyond the base. Bought with ATP; see
   *  chromosome.ts. Dies with the strain -- the LAB buys a higher start.
   *  An accessor for the same reason as `depth`: it sets `usableSlots`, an
   *  argument to `transcribe`, so a site must open to transcription on the
   *  turn it is paid for. */
  private _integrated = 0;
  get integrated(): number { return this._integrated; }
  set integrated(v: number) {
    // NOT clamped here: `slotsFor` clamps and `usableSlots` bounds again, so
    // a third clamp would only make the "chromosome is no larger than it has
    // been grown to" invariant unreachable -- and an invariant that cannot be
    // broken is one nobody is checking.
    const n = Number.isFinite(v) ? Math.round(v) : 0;
    if (n === this._integrated) return;
    const before = this.usableSlots;
    this._integrated = n;
    const after = this.usableSlots;

    // SHRINKING strands whatever sat on the positions that just went away --
    // they are still in the array, still counted by `used()`, and no operation
    // can ever reach them again. Rescue them to the bin, or drop them if the
    // bin is full; either is better than a part that exists and cannot be
    // touched.
    if (after < before) rescueStranded(this, after, before);
    this.invalidate();
  }

  /** Architecture acquired, once each and kept for the run. Mutated only
   *  through `acquire`/`setTraits`: `runaway` moves copy number from 1 to as
   *  much as 61, which multiplies every ATP figure on the plasmid. */
  private readonly _traits = new Set<TraitId>();
  get traits(): ReadonlySet<TraitId> { return this._traits; }

  acquire(id: TraitId): void {
    if (this._traits.has(id)) return;
    this._traits.add(id);
    this.invalidate();
  }

  setTraits(ids: Iterable<TraitId>): void {
    this._traits.clear();
    for (const id of ids) this._traits.add(id);
    this.invalidate();
  }

  /** Strain level, from the notebook and the deepest floor. Drives
   *  `bonusSlots` and `bonusCapacityKb` -- ring size and burden. */
  private _strain = 1;
  get strain(): number { return this._strain; }
  set strain(v: number) {
    const n = Number.isFinite(v) ? Math.round(v) : 1;
    if (n === this._strain) return;
    this._strain = n;
    this.invalidate();
  }

  /** Ring positions actually usable: the replicon's, plus strain bonus. */
  get usableSlots(): number {
    return Math.min(slotsFor(this.integrated, bonusSlots(this.strain)), SLOTS);
  }
  private context(): Context {
    return { stratum: stratum(this.depth), inducers: this.inducers };
  }

  /** The operon a slot belongs to, if any. */
  operonOf(id: GeneId): { operon: Operon; rank: number; flow: number } | null {
    let best: { operon: Operon; rank: number; flow: number } | null = null;
    for (const op of this.operons()) {
      const hit = op.genes.find((g) => g.id === id);
      // The strongest driver wins when several promoters reach one gene,
      // which happens as soon as a terminator leaks.
      if (!hit) continue;
      const here = { operon: op, rank: hit.rank, flow: hit.flow };
      if (!best || op.output * hit.flow > best.operon.output * best.flow) best = here;
    }
    return best;
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
  /** @internal: the energy setter clears this from outside the accessor. */
  private memoAtp = new Map<string, number>();

  /** Drop every memoised read. No origin check: the non-ring inputs
   *  (depth, inducers, strain) cannot lose it. */
  private invalidate(): void {
    this.rev++;
    this.memoOperons = null;
    this.memoAtp.clear();
  }

  /** @internal: public because bin.ts mutates the bin and must invalidate. */
  touch(): void {
    this.invalidate();
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
    const free = this.slots.findIndex((s, i) => s === null && this.usable(i));
    const at = free >= 0 ? free
      : this.slots.findIndex((s, i) => this.usable(i) && s?.kind !== "gene");
    const i = at >= 0 ? at : 0;
    // Displaced part goes back to the bin: this was the one path that broke
    // the conservation install/uninstall guarantee, by overwriting a
    // regulatory part on a full ring to put the origin back.
    const displaced = this.slots[i] ?? null;
    if (displaced && this.bin.length < BIN_CAP) this.bin.push(displaced);
    // Direct assignment: going through put() would recurse into touch().
    this.slots[i] = { kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE };
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

    // `flow` already carries polarity AND every terminator's readthrough on
    // the path from the promoter, so it must not be recomputed here -- doing
    // that silently discarded the whole attenuation model.
    e *= ctx.operon.output * ctx.flow;
    e *= this.synergy(ctx.operon, id);
    // Modifiers, evolution level and the rolled allele.
    const m = modEffect(slot.mods);
    const a = alleleEffect(slot.allele);
    e *= m.expression * a.expression * levelMultiplier(slot.level);
    e *= this.dosage();                       // gene dosage from copy number
    // kcat is raw turnover. Km is affinity, and a LOW Km still works when the
    // substrate has almost run out -- which is the deep column, so it is
    // weighted by how little supply there is.
    // Read through the same clamp `expression` uses: reaching for the raw
    // field here reintroduced exactly the NaN path the audit test guards.
    const supply = Number.isFinite(this.supply)
      ? Math.min(Math.max(this.supply, 0), 1) : 1;
    const scarcity = 1 - supply;
    e *= a.kcat * (1 + scarcity * (1 / Math.max(a.km, 0.2) - 1) * 0.5);
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
      const mods = modEffect(p.mods);
      const allele = alleleEffect(p.allele);
      c += this.rawExpression(p.id, depth) * GENES[p.id].kb * COST_PER_KB
        * mods.upkeep * allele.upkeep;
    }
    // Replicating the plasmid is most of what carrying one costs, and a
    // high-copy origin costs proportionally more.
    c *= copyBurden(this.copies());
    // Transcription that reads past the last gene of an operon is polymerase
    // and nucleotide spent on nothing. THIS is why a terminator matters
    // beyond isolating the next promoter: a leaky one wastes ATP every turn,
    // for ever, and a tandem one is cheap to run as well as tight.
    return c + this.wastedTranscription(depth);
  }

  /**
   * ATP burned on transcription that produces no protein.
   *
   * Flow that survives the last gene in an operon and runs into a gap is real
   * transcription with nothing downstream to translate. A hairpin leaks 38% of
   * it; a tandem rrnB T1T2 leaks 2%.
   */
  wastedTranscription(depth: number): number {
    let waste = 0;
    for (const op of this.operons()) {
      if (op.output <= 0) continue;
      const last = op.genes[op.genes.length - 1];
      const tail = last === undefined ? 1 : last.flow;
      // What is still running after the final gene, times the promoter output.
      let leak = tail;
      // USABLE positions, not the array: `norm` wraps at `usableSlots`, so
      // iterating to SLOTS walked an 8-slot ring three times and re-applied
      // every terminator on each pass. Fifth bug from that same root.
      for (let k = 1; k <= this.usableSlots; k++) {
        const at = this.norm((last?.slot ?? op.promoter) + k);
        const part = this.slots[at];
        if (part === undefined || part === null) break;
        if (part.kind === "promoter") break;
        if (part.kind === "terminator") leak *= TERMINATORS[part.id].readthrough;
        if (leak < 0.01) break;
      }
      waste += op.output * leak * WASTE_PER_UNIT;
    }
    void depth;
    return waste;
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
    // Baseline fermentation. Raised from 1.2 when transcriptional waste became
    // a real cost: the "never dead on arrival" invariant was passing with a
    // margin of 0.005, which is not a margin. A starting cell should be
    // clearly viable, not arithmetically viable.
    let g = 1.6;
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
    // Codon optimisation is one modifier among several now, so this is a thin
    // wrapper over the general slot machinery.
    return this.addModifier(id, "codon");
  }

  /** Attach a modifier to a carried gene, if it has a free slot. */
  addModifier(id: GeneId, mod: ModifierId): Result {
    const g = this.slots.find((x) => x?.kind === "gene" && x.id === id);
    if (g?.kind !== "gene") return { ok: false, err: "not carried" };
    if (g.mods.includes(mod)) {
      return { ok: false, err: `already has ${MODIFIERS[mod].name}` };
    }
    const slots = modifierSlots(g.level);
    if (g.mods.length >= slots) {
      return { ok: false, err: `no free modifier slot (level ${String(g.level)} allows ${String(slots)})` };
    }
    g.mods.push(mod);
    this.touch();
    return { ok: true };
  }

  /** Directed evolution: raise a gene's level. The caller pays the ATP. */
  evolve(id: GeneId): Result {
    const g = this.slots.find((x) => x?.kind === "gene" && x.id === id);
    if (g?.kind !== "gene") return { ok: false, err: "not carried" };
    if (g.level >= MAX_LEVEL) return { ok: false, err: "already fully evolved" };
    g.level += 1;
    this.touch();
    return { ok: true };
  }

  /** What the next round of directed evolution would cost. */
  evolutionCost(id: GeneId): number {
    const g = this.slots.find((x) => x?.kind === "gene" && x.id === id);
    return g?.kind === "gene" ? evolutionCost(g.level, id) : Infinity;
  }

  /** Every gene you carry, installed or stashed -- KEGG completeness is scored
   *  against the genome, not against what happens to be transcribing. */
  carried(): Set<GeneId> {
    const out = new Set<GeneId>();
    for (const p of this.slots) if (p?.kind === "gene") out.add(p.id);
    for (const p of this.bin) if (p.kind === "gene") out.add(p.id);
    return out;
  }

    /** Lay a whole operon down from the bin. See operon.ts. */
  assemble(genes: readonly GeneId[]): Result { return buildOperon(this, genes); }

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
    // Faithful segregation means no daughter is ever left holding half a
    // pathway, which is where a toxic intermediate comes from.
    if (this.traits.has("partitioned")) return [];
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
