// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Gene ids that have been renamed, and what they became.
//
// v1.61.0 renamed `bd` to `cydA`, because "bd" is the name of the cytochrome
// bd oxidase COMPLEX and the genes are cydA/cydB. Correct -- and it silently
// destroyed every save that had one installed: `isGeneId` tests membership
// in GENES, an unknown id fails it, and the part is dropped from the ring
// with no message at all. The player loses a gene and is never told.
//
// A rename in a table players have saved data against is a MIGRATION, not an
// edit. This module is the record of them, applied at load before validation.
//
// Add to this map whenever a gene id changes. Never remove an entry: a save
// can be arbitrarily old, and the cost of carrying a line here for ever is
// nothing next to a run quietly losing part of itself.

export const RENAMED: Readonly<Record<string, string>> = {
  // v1.61.0 -- complex name corrected to its gene
  bd: "cydA",
};

/** The current id for a possibly-historical one. */
export function currentGeneId(id: string): string {
  return RENAMED[id] ?? id;
}
