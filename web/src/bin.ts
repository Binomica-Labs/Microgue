// The parts bin.
//
// Split from plasmid.ts when that hit the 900-line ceiling `spec` enforces.
// The boundary is real: plasmid.ts owns the RING -- what a position is, how it
// wraps, what may occupy it -- and this owns the bin, which is a list with
// stacking rules and no geometry at all.
//
// Everything here goes through `stack.ts` for the stacking invariant, so there
// is one place that decides when two copies are the same thing.

import { GENES } from "./biology.js";
import { MAX_STACK, betterOf, countOf, fullStackIndex, stackIndex }
  from "./stack.js";
import { BIN_CAP, type Part, type Plasmid, type Result } from "./plasmid.js";

/**
   * Put a part in the bin, stacking a duplicate rather than refusing it.
   *
   * A second copy of a gene you already carry used to be turned away, so a
   * better roll of something you owned was simply unpickupable. It stacks now,
   * up to MAX_STACK, and only with a copy of the SAME RARITY -- rarity here
   * describes the copy, so a rare mtrC and a common one are different objects
   * that share a name.
   */
export function b_stash(_p: Plasmid, part: Part): Result {
    const at = stackIndex(_p.bin, part);
    if (at >= 0) {
      const held = _p.bin[at];
      if (held?.kind === "gene" && part.kind === "gene") {
        const keep = betterOf(held, part);
        _p.bin[at] = { ...keep, count: countOf(held) + countOf(part) };
        _p.touch();
        return { ok: true };
      }
    }
    if (fullStackIndex(_p.bin, part) >= 0 && part.kind === "gene") {
      return { ok: false, err: `already carrying ${String(MAX_STACK)} of `
        + GENES[part.id].name };
    }
    // No "already carried" refusal any more. Having one installed and a spare
    // in the bin is the POINT of stacking -- you want a second copy to put in
    // another operon, or a better roll to swap in. The only thing that turns a
    // pickup away now is a full stack or a full bin.
    if (_p.bin.length >= BIN_CAP) return { ok: false, err: "parts bin is full" };
    _p.bin.push(part);
    _p.touch();
    return { ok: true };
  }
/** Take ONE copy off a stack, leaving the rest. Returns what came off. */
export function b_takeOne(_p: Plasmid, binIndex: number): Part | null {
    const held = _p.bin[binIndex];
    if (!held) return null;
    const n = countOf(held);
    if (n <= 1) {
      _p.bin.splice(binIndex, 1);
      _p.touch();
      return held;
    }
    if (held.kind !== "gene") return held;      // only genes stack
    _p.bin[binIndex] = { ...held, count: n - 1 };
    _p.touch();
    return { ...held, count: 1 };
  }
/** Bin -> ring. Whatever was in the slot goes back to the bin, so a swap
   *  never destroys a part. */
export function b_install(_p: Plasmid, binIndex: number, slot: number): Result {
    const part = _p.bin[binIndex];
    if (!part) return { ok: false, err: "no such part" };
    if (!_p.usable(slot)) {
      return { ok: false,
               err: `the chromosome has only ${String(_p.usableSlots)} positions` };
    }
    const displaced = _p.at(slot);
    if (displaced?.kind === "gene" && displaced.id === "ori") {
      return { ok: false, err: "cannot displace the origin" };
    }
    // ONE copy off the stack, not the whole row. Splicing the row out put
    // three copies onto a single position and lost two of them.
    const one = _p.takeOne(binIndex);
    if (!one) return { ok: false, err: "no such part" };
    _p.put(slot, one);
    if (displaced) _p.stash(displaced);
    return { ok: true };
  }
/** Ring -> bin. */
export function b_uninstall(_p: Plasmid, slot: number): Result {
    const part = _p.at(slot);
    if (!part) return { ok: false, err: "empty slot" };
    if (part.kind === "gene" && part.id === "ori") {
      return { ok: false, err: "cannot excise the origin" };
    }
    if (_p.bin.length >= BIN_CAP) return { ok: false, err: "parts bin is full" };
    _p.put(slot, null);
    _p.bin.push(part);
    return { ok: true };
  }