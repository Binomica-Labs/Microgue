// Progression: what happens to the lineage rather than to the turn.
//
// Death, catabolism, subcloning and the research bench. Split out when turn.ts
// crossed the 900-line ceiling `spec` enforces -- these are about the strain
// and the lab, not about time passing.

import * as bio from "./biology.js";
import { MODIFIERS } from "./parts.js";
import { TRAITS, atpCeiling, expansionCost, type TraitId }
  from "./chromosome.js";
import { creditFor, recordRun, stockCap } from "./lab.js";
import { writeLab } from "./lab_save.js";
import { deleteSlot } from "./saves.js";
import { quality } from "./allele.js";
import { MAX_FLOOR } from "./dungeon.js";
import type { ResearchRow } from "./screens.js";
import type { Game } from "./main.js";

/**
 * The strain dies. Permanently.
 *
 * There is no resynthesising it in place and carrying on -- that made death a
 * setback rather than an ending, and an ending is what gives a run its shape.
 * What survives is what a lab keeps: the sequence data, the notebook, and the
 * credit to order constructs for whatever goes down next.
 */
export function t_die(_g: Game): void {
  const carried = [..._g.genome.carried()].filter((g) => g !== "ori");
  const best = _g.genome.slots.reduce((m, p) =>
    p?.kind === "gene" ? Math.max(m, quality(p.allele)) : m, 1);

  const outcome = {
    floor: _g.dungeon.floor,
    turns: _g.clock.turn,
    catalogued: _g.run.bestiary.length,
    bossesCleared: Math.floor((_g.dungeon.floor - 1) / 3),
    genesCarried: carried.length,
    bestAllele: best,
    killedBy: _g.lastAttacker ?? "starvation",
    won: _g.won,
  };
  // Recorded BEFORE the ledger entry is built, so the epitaph ends with the
  // death rather than with whatever happened just before it.
  _g.trace.push(_g.clock.turn, "death",
                `F${String(_g.dungeon.floor)} by ${outcome.killedBy}`);

  // A mobilisable replicon transfers itself out of a dying cell. Half of what
  // it carried reaches the next strain -- which is how resistance genuinely
  // crosses between organisms, and the one way anything survives a death.
  if (_g.genome.traits.has("mobilisable")) {
    const aboard = [..._g.genome.carried()].filter((g) => g !== "ori");
    const cap = stockCap(_g.lab.startSites);
    const rescued = aboard.filter((_, i) => i % 2 === 0).slice(0, cap);
    const room = Math.max(cap - _g.lab.stock.length, 0);
    const taken = rescued.filter((g) => !_g.lab.stock.includes(g)).slice(0, room);
    if (taken.length > 0) {
      _g.lab.stock.push(...taken);
      _g.note(`The plasmid mobilises out of the dying cell. `
        + `${String(taken.length)} locus${taken.length === 1 ? "" : "es"} `
        + "reaches the next strain.");
    }
  }

  const credit = creditFor(outcome, _g.lab.deepestEver);
  const rec = recordRun(_g.lab, outcome, credit, _g.trace.epitaph(8));
  writeLab(_g.lab);

  _g.dead = true;
  _g.deathAt = _g.now;
  _g.deathRecord = rec;
  deleteSlot(_g.slot);

  _g.toasts.push(`The strain is lost. +${String(credit)} synthesis credit.`,
                 "warn", _g.now);
  _g.note(`Lysed on F${String(outcome.floor)} after ${String(outcome.turns)} turns. `
    + `${String(carried.length)} loci sequenced, ${String(outcome.catalogued)} organisms `
    + `recorded. The lab banks ${String(credit)} credit.`);
}

/**
 * Catabolise a cassette: eat the DNA.
 *
 * This is not a game convenience. Extracellular DNA is a real nutrient --
 * competent bacteria take it up for phosphate, nitrogen and carbon as readily
 * as for the information in it, and in sediments eDNA is a significant part of
 * the phosphorus budget. A long gene is simply more nucleotide.
 *
 * It is also the loot sink the hunt needs: a junk roll of a gene you already
 * carry is worth something, so screening a hundred cassettes for one good
 * mtrC is not a hundred wasted pickups.
 */
export function t_catabolise(_g: Game, binIndex: number): void {
  if (_g.dead) return;             // a lost strain does not act
  const part = _g.genome.bin[binIndex];
  if (part === undefined) return;
  if (part.kind === "gene" && part.id === "ori") {
    _g.toasts.push("Not the origin.", "warn", _g.now);
    return;
  }

  const kb = part.kind === "gene" ? bio.GENES[part.id].kb
    : part.kind === "promoter" ? 0.1 : 0.06;
  // A better allele is more intact DNA and yields more, which keeps the choice
  // honest: eating a good roll costs you the good roll.
  const grade = part.kind === "gene" ? quality(part.allele) : 1;
  const hp = Math.max(Math.round(kb * 2.4 * grade), 1);
  const atp = Math.max(Math.round(kb * 5.5 * grade), 1);

  _g.genome.bin.splice(binIndex, 1);
  _g.player.hp = Math.min(_g.player.hp + hp, _g.player.maxhp);
  _g.player.atp = Math.min(_g.player.atp + atp, _g.player.atpMax);
  _g.fx.add({ kind: "ring", t0: _g.now, dur: 460, x: _g.player.x, y: _g.player.y,
              colour: "#a0ffd0", r: 1.8 });
  _g.note(`You digest the cassette. ${kb.toFixed(1)} kb of nucleotide, `
    + `recovered as phosphate and base. +${String(hp)} hp, +${String(atp)} ATP.`);
  _g.save();
}

/**
 * Integrate another cassette site into the chromosome.
 *
 * Paid in ATP because replicating and maintaining more DNA is what it actually
 * costs a cell: every extra kilobase is copied at every division, for ever.
 * Steeply super-linear, so late expansion competes with everything else the
 * energy could have done.
 */
export function t_expand(_g: Game): void {
  if (_g.dead) return;
  const slots = _g.genome.usableSlots;
  const cost = expansionCost(slots);
  if (!Number.isFinite(cost)) {
    _g.toasts.push("The chromosome is as large as it will get.", "warn", _g.now);
    return;
  }
  if (_g.player.atp < cost) {
    _g.toasts.push(`Integration needs ${String(cost)} ATP.`, "warn", _g.now);
    return;
  }
  _g.player.atp = Math.max(_g.player.atp - cost, 0);
  _g.genome.integrated += 1;
  // The pool grows with the molecule; upkeep would apply it next turn anyway,
  // but not before the message says what you now have.
  _g.player.atpMax = atpCeiling(_g.genome.integrated, _g.genome.strain);
  _g.note(`An integron captures another cassette site. The chromosome now `
    + `carries ${String(_g.genome.usableSlots)} positions and `
    + `${_g.genome.capacityKb().toFixed(1)} kb of headroom.`);
  _g.trace.push(_g.clock.turn, "input", `integrate -> ${String(_g.genome.usableSlots)} slots`);
  _g.mobTurn();
  _g.save();
}

/** Acquire a piece of architecture, once. */
export function t_acquire(_g: Game, id: TraitId): void {
  if (_g.dead) return;
  const t = TRAITS[id];
  if (_g.genome.traits.has(id)) return;
  if (_g.player.atp < t.cost) {
    _g.toasts.push(`${t.name} needs ${String(t.cost)} ATP.`, "warn", _g.now);
    return;
  }
  _g.player.atp = Math.max(_g.player.atp - t.cost, 0);
  _g.genome.acquire(id);
  _g.note(`${t.name} acquired. ${t.rule}. ${t.note}`);
  _g.trace.push(_g.clock.turn, "input", `acquire ${id}`);
  _g.mobTurn();
  _g.save();
}

export function t_research(_g: Game, row: ResearchRow): void {
  if (_g.dead) return;             // a lost strain does not act
  if (row.kind === "expand") { t_expand(_g); return; }
  if (row.kind === "trait") {
    if (row.trait !== undefined) t_acquire(_g, row.trait);
    return;
  }
    if (row.kind === "evolve") {
      // Selecting is always allowed; paying is not.
      _g.researchPick = row.gene;
      if (!row.afford) {
        _g.toasts.push(
          Number.isFinite(row.cost)
            ? `Need ${String(row.cost)} ATP.` : "Already fully evolved.",
          "warn", _g.now);
        return;
      }
      const r = _g.genome.evolve(row.gene);
      if (!r.ok) { _g.toasts.push(r.err, "warn", _g.now); return; }
      _g.player.atp = Math.max(_g.player.atp - row.cost, 0);
      _g.note(`${bio.GENES[row.gene].name} evolves. Rounds of mutagenesis and `
        + "selection, and the enzyme comes back better than it went in.");
      _g.fx.add({ kind: "ring", t0: _g.now, dur: 520, x: _g.player.x,
                    y: _g.player.y, colour: "#cfe04a", r: 2.2 });
      _g.save();
      return;
    }
    if (row.mod === undefined) return;
    if (!row.afford) {
      _g.toasts.push(_g.researchPick === null
        ? "Choose a gene first." : "No free modifier slot on that gene.",
        "warn", _g.now);
      return;
    }
    const r = _g.genome.addModifier(row.gene, row.mod);
    if (!r.ok) { _g.toasts.push(r.err, "warn", _g.now); return; }
    // Consume exactly one, not every copy held.
    const i = _g.mods.indexOf(row.mod);
    if (i >= 0) _g.mods.splice(i, 1);
    _g.note(`${MODIFIERS[row.mod].name} attached to ${bio.GENES[row.gene].name}. `
      + MODIFIERS[row.mod].note);
    _g.save();
  }

export function t_win(_g: Game): void {
    if (_g.won) return;
    _g.won = true;
    _g.run.deepest = MAX_FLOOR;
    _g.toasts.push("You have reached the bottom of the column.", "info", _g.now);
    _g.note("Nothing below but carbonate and the glass. The column is yours.");
    _g.save();
  }