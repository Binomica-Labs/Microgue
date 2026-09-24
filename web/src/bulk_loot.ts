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
import { removeDrop, yieldOf as substrateYield, type Drop, type Item } from "./items.js";
import type { Game } from "./main.js";

export interface BulkResult { taken: number; left: number; hp: number; atp: number }

/**
 * Take everything on the drop that will go. What will not, stays.
 *
 * `take` pops a "catabolise this or leave it?" offer when the bin or a stack
 * is full. That is right for ONE deliberate pickup and wrong for a bulk
 * button: it fired once per refused item and left a stale modal hanging over
 * a tile the player had already finished with. A bulk action answers its own
 * questions -- take what fits, leave what does not, and say which.
 */
export function takeAll(_g: Game, d: Drop): BulkResult {
  let taken = 0;
  const hadOffer = _g.offer;
  // Iterate over a copy: `take` mutates the bin and the drop.
  for (const it of [...d.items]) {
    if (_g.take(it)) {
      const i = d.items.indexOf(it);
      if (i >= 0) d.items.splice(i, 1);
      taken++;
    }
  }
  // Any offer raised by a refusal inside the loop is an artefact of bulk,
  // not a question the player asked. Restore whatever was there before.
  _g.offer = hadOffer;
  const left = d.items.length;
  if (left === 0) { removeDrop(_g.drops, d); _g.openDrop = null; }
  _g.note(taken === 0 ? "Nothing here will fit -- the bin is full."
    : left === 0 ? `You take everything. ${String(taken)} items.`
    : `You take ${String(taken)}; ${String(left)} would not fit. `
      + `Eat them, or make room.`);
  return { taken, left, hp: 0, atp: 0 };
}

/** The hp/ATP a cassette yields when digested. Same formula as the bin path
 *  in progress.ts, so eating from the floor is worth exactly what eating from
 *  the bin is. */
function yieldOf(it: Item, _g: Game): { hp: number; atp: number } {
  if (it.kind === "cassette") {
    const kb = bio.GENES[it.gene].kb;
    const grade = quality(it.allele);
    return { hp: Math.max(Math.round(kb * 2.4 * grade), 1),
             atp: Math.max(Math.round(kb * 5.5 * grade), 1) };
  }
  if (it.kind === "substrate") {
    // The SAME yield a pickup gives, genes and all -- eating a molecule off
    // the floor must pay what carrying it would, or one of the two routes is
    // strictly better and the other is a trap.
    const { atp } = substrateYield(it.id, (g) => _g.genome.has(g));
    return { hp: 0, atp };
  }
  // A regulatory part is a short piece of DNA. Worth something, not much.
  return { hp: 0, atp: 2 };
}

/**
 * Digest EVERYTHING on the drop.
 *
 * It used to eat only cassettes and leave substrates and parts where they
 * lay, which made "eat all" a lie: a pile with a glucose molecule in it
 * still had a glucose molecule in it afterwards, and the player had to tap
 * the leftovers individually. A cell offered a heap of organic matter does
 * not sort it by category.
 *
 * Each kind yields what it is actually worth:
 *   cassette   hp and ATP from the nucleotide, scaled by the allele
 *   substrate  its real metabolic yield -- the same `yieldOf` a pickup uses,
 *              so eating from the floor pays exactly what carrying it would
 *   part       a little ATP; a promoter is a short piece of DNA and no more
 *   symbiont   NEVER. A living endosymbiont is not a snack, and eating a
 *              landmark find by accident is the kind of loss a bulk button
 *              must not be able to cause.
 */
export function eatAll(_g: Game, d: Drop): BulkResult {
  if (_g.dead) return { taken: 0, left: d.items.length, hp: 0, atp: 0 };
  let hp = 0, atp = 0, n = 0;
  d.items = d.items.filter((it) => {
    if (it.kind === "symbiont") return true;      // not food; see above
    const y = yieldOf(it, _g);
    hp += y.hp; atp += y.atp; n++;
    return false;
  });
  if (n === 0) { _g.note("Nothing here to digest."); return { taken: 0, left: d.items.length, hp: 0, atp: 0 }; }
  _g.player.hp = Math.min(_g.player.hp + hp, _g.player.maxhp);
  _g.player.atp = Math.min(_g.player.atp + atp, _g.player.atpMax);
  _g.fx.add({ kind: "ring", t0: _g.now, dur: 460, x: _g.player.x, y: _g.player.y,
              colour: "#a0ffd0", r: 1.8 });
  _g.note(`You digest ${String(n)} item${n === 1 ? "" : "s"} where they lie. `
    + `+${String(hp)} hp, +${String(atp)} ATP.`);
  const left = d.items.length;
  if (left === 0) { removeDrop(_g.drops, d); _g.openDrop = null; }
  return { taken: n, left, hp, atp };
}
