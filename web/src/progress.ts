// Progression: what happens to the lineage rather than to the turn.
//
// Death, catabolism, subcloning and the research bench. Split out when turn.ts
// crossed the 900-line ceiling `spec` enforces -- these are about the strain
// and the lab, not about time passing.

import * as bio from "./biology.js";
import { MODIFIERS } from "./parts.js";
import { REPLICONS, availableAt, type RepliconId } from "./replicon.js";
import { creditFor, recordRun } from "./lab.js";
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
  const credit = creditFor(outcome);
  const rec = recordRun(_g.lab, outcome, credit);
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
 * Move the whole plasmid onto a different replicon.
 *
 * Subcloning: you are lifting every part off one backbone and ligating it onto
 * another. It costs ATP and a turn, it fails if the new replicon cannot hold
 * what you are carrying, and parts that no longer fit go to the bin rather
 * than being destroyed -- losing loot to a UI decision would be indefensible.
 */
export function t_subclone(_g: Game, to: RepliconId): void {
  if (_g.dead) return;             // a lost strain does not act
  const def = REPLICONS[to];
  if (_g.genome.replicon === to) return;
  if (!availableAt(_g.genome.strain).some((r) => r.id === to)) {
    _g.toasts.push(`${def.name} needs strain L${String(def.unlock)}.`, "warn", _g.now);
    return;
  }
  const cost = 30 + def.copies;
  if (_g.player.atp < cost) {
    _g.toasts.push(`Subcloning needs ${String(cost)} ATP.`, "warn", _g.now);
    return;
  }

  const before = _g.genome.replicon;
  _g.genome.replicon = to;
  _g.player.atp = Math.max(_g.player.atp - cost, 0);

  // Anything past the new replicon's last position comes off the backbone. It
  // goes to the bin if there is room, and only then is it lost.
  let displaced = 0, lost = 0;
  for (let i = _g.genome.slots.length - 1; i >= 0; i--) {
    if (_g.genome.usable(i)) continue;
    const part = _g.genome.vacate(i);
    if (part === null) continue;
    displaced++;
    if (!_g.genome.stash(part).ok) lost++;
  }

  _g.note(`Subcloned from ${REPLICONS[before].name} onto ${def.name}. ${def.note}`);
  if (displaced > 0) {
    _g.note(`${String(displaced)} part${displaced === 1 ? "" : "s"} would not fit `
      + `and came off the backbone${lost > 0 ? `; ${String(lost)} had nowhere to go` : ""}.`);
  }
  _g.mobTurn();
  _g.save();
}

export function t_research(_g: Game, row: ResearchRow): void {
  if (_g.dead) return;             // a lost strain does not act
  if (row.kind === "subclone") {
    if (row.replicon !== undefined) t_subclone(_g, row.replicon);
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