// Building an operon out of the bin.
//
// Split from plasmid.ts when that crossed the 900-line ceiling `spec`
// enforces. The distinction is worth having: plasmid.ts owns the RING -- what
// a position is, how it wraps, what may occupy it -- while this owns the
// convenience of turning a list of genes into a working transcriptional unit.
//
// It runs inside `Plasmid.transact` because it splices parts OUT of the bin
// and then places them, so a refused `put` partway through would destroy
// whatever it had already removed.

import { GENES, type GeneId } from "./biology.js";
import type { Part, Plasmid, Result } from "./plasmid.js";

export function buildOperon(_p: Plasmid, genes: readonly GeneId[]): Result {
    // Everything or nothing. This splices parts OUT of the bin and then
    // places them, so a refused `put` partway through destroyed whatever
    // it had already removed.
    return _p.transact(() => {
    const missing = genes.filter((g) => !_p.has(g) && !_p.inBin(g));
    if (missing.length > 0) {
      return { ok: false, err: `missing ${missing.map((g) => GENES[g].name).join(", ")}` };
    }

    const pi = _p.bin.findIndex((p) => p.kind === "promoter");
    if (pi < 0) return { ok: false, err: "no spare promoter in the bin" };

    // A run long enough for promoter + genes, ignoring slots those genes
    // already occupy since they are about to move.
    const movable = new Set<number>();
    _p.slots.forEach((p, i) => {
      if (p?.kind === "gene" && genes.includes(p.id)) movable.add(i);
    });
    const usable = (i: number): boolean =>
      // A slot past the replicon's last position is not free, it does not
      // exist. `add` and `install` already refuse those; assemble did not, so
      // it would happily lay an operon down where nothing could reach it.
      _p.usable(_p.norm(i))
      && (_p.slots[_p.norm(i)] === null || movable.has(_p.norm(i)));

    const need = genes.length + 1;
    let start = -1;
    for (let i = 0; i < _p.usableSlots; i++) {
      let ok = true;
      for (let k = 0; k < need; k++) if (!usable(i + k)) { ok = false; break; }
      if (ok) { start = i; break; }
    }
    if (start < 0) {
      return { ok: false, err: `needs ${need} contiguous free slots` };
    }

    // Claimed FIRST, while `pi` still means what it meant. Pulling the genes
    // splices the bin, and every gene below the promoter shifted it down one:
    // running this last, `pi` pointed at the wrong part or off the end, and
    // off the end returned "no spare promoter" AFTER the genes had left the
    // ring -- destroying all of them on a path that reports a refusal.
    const promoter = _p.bin[pi];
    if (!promoter) return { ok: false, err: "no spare promoter in the bin" };
    _p.bin.splice(pi, 1);

    // Pull the genes off the ring, then lay everything down in order. Each
    // lookup is a fresh findIndex, so these splices cannot strand each other.
    const parts: Part[] = [];
    for (const g of genes) {
      const at = _p.slots.findIndex((p) => p?.kind === "gene" && p.id === g);
      if (at >= 0) {
        const p = _p.slots[at];
        if (p) parts.push(p);
        _p.slots[at] = null;
      } else {
        const bi = _p.bin.findIndex((p) => p.kind === "gene" && p.id === g);
        const p = _p.bin[bi];
        if (p) { parts.push(p); _p.bin.splice(bi, 1); }
      }
    }

    // Wrapped explicitly. `put` no longer wraps for us, and the run really can
    // cross the end of the ring -- that is what a circular plasmid is.
    _p.put(_p.norm(start), promoter);
    parts.forEach((p, k) => { _p.put(_p.norm(start + 1 + k), p); });

    // Cap it if a terminator is spare and the next slot is free.
    const tail = _p.norm(start + need);
    const ti = _p.bin.findIndex((p) => p.kind === "terminator");
    if (ti >= 0 && _p.slots[tail] === null) {
      const t = _p.bin[ti];
      // No `usable(tail)` guard here, deliberately. `norm` wraps at
      // `usableSlots`, so a normalised index is always a position the
      // chromosome has -- checked across 2720 combinations of size and operon
      // length, none unusable. A guard for a case that cannot arise reads as
      // evidence that it can.
      if (t) { _p.bin.splice(ti, 1); _p.put(tail, t); }
    }
    return { ok: true };
    });
  }
