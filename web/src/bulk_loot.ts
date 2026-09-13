// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Bulk loot: take all, eat all.
//
// The container was one tap per item. With three cassettes and two substrates
// on a tile that is five taps to clear it, and every tap is a decision you
// already made. Two buttons: TAKE ALL puts everything that fits in the bin;
// EAT ALL catabolises every cassette on the floor for hp and ATP, without the
// round-trip through the bin.
//
// Both report what they did, because a bulk action that silently skips
// things -- a full stack, a substrate you cannot use -- teaches the player
// that the button lies.

import * as bio from "./biology.js";
import { quality } from "./allele.js";
import { removeDrop, type Drop, type Item } from "./items.js";
import type { Game } from "./main.js";

export interface BulkResult { taken: number; left: number; hp: number; atp: number }

/** Take everything on the drop that will go. What will not, stays. */
export function takeAll(_g: Game, d: Drop): BulkResult {
  let taken = 0;
  // Iterate over a copy: `take` mutates the bin and the drop.
  for (const it of [...d.items]) {
    if (_g.take(it)) {
      const i = d.items.indexOf(it);
      if (i >= 0) d.items.splice(i, 1);
      taken++;
    }
  }
  const left = d.items.length;
  if (left === 0) { removeDrop(_g.drops, d); _g.openDrop = null; }
  _g.note(taken === 0 ? "Nothing here will fit."
    : left === 0 ? `You take everything. ${String(taken)} items.`
    : `You take ${String(taken)}; ${String(left)} would not fit.`);
  return { taken, left, hp: 0, atp: 0 };
}

/** The hp/ATP a cassette yields when digested. Same formula as the bin path
 *  in progress.ts, so eating from the floor is worth exactly what eating from
 *  the bin is. */
function yieldOf(it: Item): { hp: number; atp: number } {
  if (it.kind !== "cassette") return { hp: 0, atp: 0 };
  const kb = bio.GENES[it.gene].kb;
  const grade = quality(it.allele);
  return { hp: Math.max(Math.round(kb * 2.4 * grade), 1),
           atp: Math.max(Math.round(kb * 5.5 * grade), 1) };
}

/** Digest every cassette on the drop for hp and ATP. Substrates and parts
 *  are not nucleotide and are left where they are. */
export function eatAll(_g: Game, d: Drop): BulkResult {
  if (_g.dead) return { taken: 0, left: d.items.length, hp: 0, atp: 0 };
  let hp = 0, atp = 0, n = 0;
  d.items = d.items.filter((it) => {
    if (it.kind !== "cassette") return true;      // keep non-nucleotide
    const y = yieldOf(it);
    hp += y.hp; atp += y.atp; n++;
    return false;
  });
  if (n === 0) { _g.note("Nothing here to digest."); return { taken: 0, left: d.items.length, hp: 0, atp: 0 }; }
  _g.player.hp = Math.min(_g.player.hp + hp, _g.player.maxhp);
  _g.player.atp = Math.min(_g.player.atp + atp, _g.player.atpMax);
  _g.fx.add({ kind: "ring", t0: _g.now, dur: 460, x: _g.player.x, y: _g.player.y,
              colour: "#a0ffd0", r: 1.8 });
  _g.note(`You digest ${String(n)} cassette${n === 1 ? "" : "s"} where they lie. `
    + `+${String(hp)} hp, +${String(atp)} ATP.`);
  const left = d.items.length;
  if (left === 0) { removeDrop(_g.drops, d); _g.openDrop = null; }
  return { taken: n, left, hp, atp };
}
