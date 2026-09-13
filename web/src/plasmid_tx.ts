// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Transactional edits to the ring.
//
// Split from plasmid.ts at the 900-line ceiling. An edit that fails partway
// -- a rotate that would displace the origin, an install refused after a
// stash succeeded -- must leave the plasmid as it was, or the next invariant
// check finds a half-applied state. Snapshot, run, restore on failure.

import type { Plasmid, Result } from "./plasmid.js";

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
export function p_transact(_p: Plasmid, fn: () => Result): Result {
  const slots = _p.slots.slice();
  const bin = _p.bin.slice();
  const restore = (): void => {
    _p.slots.length = 0;
    _p.slots.push(...slots);
    _p.bin.length = 0;
    _p.bin.push(...bin);
    _p.touch();
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
