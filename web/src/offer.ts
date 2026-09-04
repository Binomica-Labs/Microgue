// Answering the eat-or-leave prompt.
//
// Split from turn.ts at the 900-line ceiling. The seam is real: this is where
// the game turns a refusal into a choice. A copy you cannot hold -- because
// the stack is full, or the bin is -- is still DNA on the floor, and eating it
// is what a cell would do.

/**
 * Eat the copy you could not carry.
 *
 * A full stack leaves a cassette on the floor. It is still DNA, and the cell
 * can still digest it -- so the offer is catabolise or leave, not a bare
 * refusal. Yields the same as eating one from the bin, because it is the same
 * molecule; the only difference is that it never got picked up.
 */
import * as bio from "./biology.js";
import type { Game } from "./main.js";
import { dropAt, removeDrop } from "./items.js";
import { quality } from "./allele.js";

export function t_eatOffered(_g: Game): void {
  if (_g.dead) return;
  const offer = _g.offer;
  if (!offer) return;
  const part = offer.part;
  if (part.kind !== "gene") { _g.offer = null; return; }

  const kb = bio.GENES[part.id].kb;
  const grade = quality(part.allele);
  const hp = Math.max(Math.round(kb * 2.4 * grade), 1);
  const atp = Math.max(Math.round(kb * 5.5 * grade), 1);

  _g.offer = null;
  _g.player.hp = Math.min(_g.player.hp + hp, _g.player.maxhp);
  _g.player.atp = Math.min(_g.player.atp + atp, _g.player.atpMax);
  // And take it off the floor: it has been eaten.
  const drop = dropAt(_g.drops, offer.at.x, offer.at.y);
  if (drop) {
    const i = drop.items.findIndex(
      (x) => x.kind === "cassette" && x.gene === part.id);
    if (i >= 0) drop.items.splice(i, 1);
    if (drop.items.length === 0) removeDrop(_g.drops, drop);
  }
  _g.note(`You digest it where it lies. +${String(hp)} hp, +${String(atp)} ATP.`);
  _g.trace.push(_g.clock.turn, "loot", `ate a surplus ${bio.GENES[part.id].name}`);
  _g.save();
}

/** Leave it. The offer lapses; the cassette stays where it is. */
export function t_declineOffered(_g: Game): void {
  _g.offer = null;
}
