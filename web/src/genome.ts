// The player's plasmid. Inventory as a circular map.
//
// The constraints are the real ones, because they are already good game design:
//   * finite capacity in kb, and carrying more than you need costs you
//     (metabolic burden -- large plasmids measurably slow growth)
//   * nothing replicates without an origin
//   * some genes are destroyed by oxygen, so the deep kit is a liability if you
//     climb back up
//   * a gene from a distant donor expresses poorly until codon-optimised

import { GENES, type GeneId, type Teap, energyYield, stratum } from "./biology.js";

const BASE_CAPACITY = 12.0; // kb
const BURDEN_KNEE = 0.7;    // burden starts biting past this occupancy

/** Inactivated by molecular oxygen. Nitrogenase is irreversibly damaged;
 *  [FeFe] hydrogenases are inactivated within minutes. */
const O2_LABILE: ReadonlySet<GeneId> = new Set(["nifH", "hydA", "mcrA"]);

/** Genes that only pay out where their substrate exists. */
type Need = "light" | Teap;

const NEEDS: Partial<Record<GeneId, Need>> = {
  psbA: "light", pufM: "light", fmoA: "light", csmA: "light",
  mtrC: "Fe(III)", omcS: "Fe(III)",
  dsrA: "SO4", aprA: "SO4",
  mcrA: "CO2", narG: "NO3-",
};

/** Works at trace light where other phototrophy genes go dark. */
const CHLOROSOME: ReadonlySet<GeneId> = new Set(["fmoA", "csmA"]);

export interface Slot {
  readonly id: GeneId; readonly name: string; readonly kb: number;
  readonly product: string; readonly tier: number; optimised: boolean;
}

export interface Feature extends Slot {
  readonly expression: number;
  readonly start: number; // degrees
  readonly stop: number;
}

export type Result = { ok: true } | { ok: false; err: string };

export class Genome {
  readonly capacity: number;
  readonly slots: Slot[] = [];

  constructor(capacity: number = BASE_CAPACITY) {
    this.capacity = capacity;
    this.insert("ori"); // you start with an origin or you are not alive
  }

  used(): number { return this.slots.reduce((a, s) => a + s.kb, 0); }
  free(): number { return this.capacity - this.used(); }
  has(id: GeneId): boolean { return this.slots.some((s) => s.id === id); }
  count(): number { return this.slots.length; }

  insert(id: GeneId): Result {
    const def = GENES[id];
    if (this.has(id)) return { ok: false, err: `${def.name} already present` };
    if (def.kb > this.free()) {
      return { ok: false, err: `no room: ${def.name} is ${def.kb.toFixed(1)} kb, ${this.free().toFixed(1)} kb free` };
    }
    this.slots.push({
      id, name: def.name, kb: def.kb, product: def.product,
      tier: def.tier, optimised: false,
    });
    return { ok: true };
  }

  remove(id: GeneId): Result {
    if (id === "ori") return { ok: false, err: "cannot excise the origin" };
    const i = this.slots.findIndex((s) => s.id === id);
    if (i < 0) return { ok: false, err: "not carried" };
    this.slots.splice(i, 1);
    return { ok: true };
  }

  /** 0 below the knee, rising steeply past it. Hoarding loot is a real choice. */
  burden(): number {
    const frac = this.used() / this.capacity;
    if (frac <= BURDEN_KNEE) return 0;
    const over = (frac - BURDEN_KNEE) / (1 - BURDEN_KNEE);
    return Math.min(over * over, 1);
  }

  /** 0 when the substrate is absent or oxygen has destroyed it; otherwise
   *  scaled by the stratum's energy yield and reduced by burden. */
  expression(id: GeneId, depth: number): number {
    const slot = this.slots.find((s) => s.id === id);
    if (!slot || !this.has("ori")) return 0;

    const s = stratum(depth);
    const need = NEEDS[id];

    if (O2_LABILE.has(id) && s.teap === "O2") return 0;
    if (need === "light" && s.light <= 0.02 && !CHLOROSOME.has(id)) return 0;
    if (need && need !== "light" && need !== s.teap) return 0;

    let e = energyYield(depth);
    if (need === "light") e = Math.max(s.light, e);
    if (!slot.optimised) e *= 0.6;
    return e * (1 - this.burden());
  }

  optimise(id: GeneId): Result {
    const slot = this.slots.find((s) => s.id === id);
    if (!slot) return { ok: false, err: "not carried" };
    if (slot.optimised) return { ok: false, err: "already optimised" };
    slot.optimised = true;
    return { ok: true };
  }

  /** Arc layout for the plasmid map, plus what each gene is doing here. */
  report(depth: number): Feature[] {
    const used = this.used();
    let angle = 0;
    return this.slots.map((s) => {
      const arc = used > 0 ? (s.kb / used) * 360 : 0;
      const f: Feature = {
        ...s, expression: this.expression(s.id, depth),
        start: angle, stop: angle + arc,
      };
      angle += arc;
      return f;
    });
  }
}
