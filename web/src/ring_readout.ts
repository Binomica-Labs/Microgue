// The three lines inside the plasmid ring.
//
// Split from render.ts at the 900-line ceiling. It is the one place the
// player is told what their energy budget actually is, and getting that sum
// right matters more than where it lives: the balance is METABOLIC, repair is
// spent on top of it, and for a damaged cell repair is usually the larger of
// the two.

import type { Game } from "./main.js";

export function r_ringReadout(_g: Game, u: number): void {
  const ctx = _g.ctx;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Sized to the RING, not to the screen.
  //
  // These were `15 * u`, scaled by the smaller screen dimension, while the
  // ring hole is sized from `H * 0.46`. On a wide, short screen the hole
  // shrinks and the text does not, so the readout was drawn straight across
  // the plasmid -- which is what a landscape phone actually looked like.
  // 0.86 of the diameter, not the diameter: a chord across a circle is only
  // that long at the exact middle, and three lines are stacked.
  const hole = _g.ring.rInner * 2 * 0.86;
  const fit = (text: string, want: number): number => {
    let size = want;
    for (let i = 0; i < 14; i++) {
      ctx.font = `${size}px ui-monospace,monospace`;
      if (ctx.measureText(text).width <= hole || size <= 6) break;
      size = Math.max(size * 0.9, 6);
    }
    return size;
  };

  ctx.fillStyle = "#ffffff";
  // toFixed on BOTH: capacity is a float sum, printed raw as "13.1499999 kb".
  const kbText = `${_g.genome.used().toFixed(1)}/`
    + `${_g.genome.capacityKb().toFixed(1)} kb`;
  const kbSize = fit(kbText, 15 * u);
  ctx.fillText(kbText, _g.ring.cx, _g.ring.cy - 9 * u);
  const d = _g.dungeon.depth;
  const bal = _g.genome.atpBalance(d);
  // The balance is METABOLIC: gain minus expression. Repair is spent on top
  // and is often the larger number, so a cell reading +0.1 while healing was
  // really running at about -1.0 and losing ATP with nothing to explain it.
  const rep = _g.repairSpend;
  const net = bal - rep;
  // Coloured on the NET: what the player needs to know is whether the pool
  // is filling or draining, not which half of the sum they are looking at.
  ctx.fillStyle = net >= 0 ? "#7fc4e8" : "#e08a5a";
  const atpText = `ATP ${Math.round(_g.player.atp)}/${_g.player.atpMax}   `
    + `${bal >= 0 ? "+" : ""}${bal.toFixed(1)}/action`
    + (rep > 0.01 ? `  \u2212${rep.toFixed(1)} repair` : "");
  fit(atpText, Math.min(11 * u, kbSize * 0.75));
  ctx.fillText(
    atpText,
    _g.ring.cx, _g.ring.cy + 10 * u);
  ctx.fillStyle = "#8fa89a";
  const powerText = `power ${_g.genome.power(d).toFixed(1)}`
    + (_g.genome.burden() > 0 ? `   burden ${String((_g.genome.burden() * 100) | 0)}%` : "")
    + (_g.genome.supply < 0.99 ? `   brownout ${String((_g.genome.supply * 100) | 0)}%` : "");
  fit(powerText, Math.min(11 * u, kbSize * 0.75));
  ctx.fillText(powerText, _g.ring.cx, _g.ring.cy + 27 * u);

}
