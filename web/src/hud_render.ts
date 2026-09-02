// The heads-up display.
//
// Split from render.ts when that hit the 900-line ceiling `spec` enforces.
// The distinction is real: render.ts draws the WORLD -- tiles, bodies, fog,
// under a camera transform -- while this draws the frame around it, in screen
// coordinates, and never moves with the view.

import { MAX_FLOOR } from "./dungeon.js";
import { GENES } from "./biology.js";
import { drawBar, drawColumn, type HudLayout } from "./hud.js";
import { timeName } from "./cycle.js";
import { MAX_STRAIN, bonusSlots, levelProgress } from "./strain.js";
import { t_visibleHostile } from "./turn.js";
import { ellipsise } from "./screens.js";
import { Dungeon } from "./dungeon.js";
import type { Game } from "./main.js";

export function r_drawHud(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const ins = _g.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
    const pad = 8 * u;
    const left = ins.left + pad;
    const s = _g.level.stratum;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const L: HudLayout = {
      u, left: ins.left, right: ins.right, top: ins.top, bottom: ins.bottom,
      w: W, h: H, reserve: _g.barH,
    };

    // The column gauge: eight bands in their stratum colours, your depth
    // marked. The game's structure, drawn literally.
    const gaugeW = drawColumn(ctx, L, _g.dungeon.depth);
    // A sealed floor must say so, or the blocked stair reads as a bug.
    const sealed = !Dungeon.isCleared(_g.level);
    const upBtn = _g.buttons.find((b) => b.id === "up");
    const downBtn = _g.buttons.find((b) => b.id === "down");
    if (upBtn) upBtn.enabled = _g.dungeon.depth > 1;
    if (downBtn) downBtn.enabled = _g.level.down !== null;
    const pl = _g.buttons.find((b) => b.id === "plasmid");
    if (pl) pl.active = _g.showPlasmid;

    const barX = left + gaugeW;
    const barW = Math.min(W - barX - ins.right - pad, 260 * u);
    // The gauges are capped at 260u; the status LINE gets whatever is actually
    // there, or it is ellipsised against a width narrower than the screen.
    const statusW = W - barX - ins.right - pad;
    const size = Math.min(_g.fitFont(s.name, barW - 12, 13 * u), 13 * u);
    ctx.font = `${size}px ui-monospace,monospace`;
    const lh = size * 1.35;
    const barH = lh * 2.6 + pad;
    const barTop = H - ins.bottom - barH;
    _g.barH = barH;

    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, barTop, W, barH + ins.bottom);

    ctx.fillStyle = s.accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // MEASURED. Real Chrome showed this running off the right edge of every
    // phone: "before dawn" arriving as "before da".
    const status = `F${_g.dungeon.floor}/${MAX_FLOOR}${sealed ? " \u26D4" : ""} ${s.name}  `
      + `${s.teap} ${s.e0 >= 0 ? "+" : ""}${s.e0}mV  ${timeName(_g.clock)}`;
    ctx.fillText(ellipsise(ctx, status, statusW), barX, barTop + lh * 0.9);

    // One row: hp gauge, then plain readouts. A miniature plasmid ring used to
    // sit here and read as an unexplained circle, so it is gone -- the real
    // ring is one tap away and legible.
    const gaugeH = Math.max(lh * 0.8, 12);
    const hpW = Math.min(barW * 0.44, 150 * u);
    drawBar(ctx, barX, barTop + lh * 1.15, hpW, gaugeH,
            _g.player.hp / _g.player.maxhp, "#4fbf6a",
            `hp ${Math.max(_g.player.hp, 0)}/${_g.player.maxhp}`,
            `${size * 0.86}px ui-monospace,monospace`);

    const bal = _g.genome.atpBalance(_g.dungeon.depth);
    drawBar(ctx, barX + hpW + 8 * u, barTop + lh * 1.15, hpW, gaugeH,
            _g.player.atp / _g.player.atpMax,
            bal >= 0 ? "#4a9fd8" : "#c86a3a",
            `atp ${Math.round(_g.player.atp)}  ${bal >= 0 ? "+" : ""}${bal.toFixed(1)}`,
            `${size * 0.86}px ui-monospace,monospace`);

    // Strain progress. A thin line rather than a third gauge: it advances
    // slowly and over the whole run, so it should not compete with hp and ATP
    // for attention.
    const prog = levelProgress({
      catalogued: _g.run.bestiary.length, deepest: _g.run.deepest,
    });
    const sy = barTop + lh * 1.15 + gaugeH + 3 * u;
    const sw = hpW * 2 + 8 * u;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(barX, sy, sw, Math.max(2 * u, 2));
    ctx.fillStyle = _g.genome.strain >= MAX_STRAIN ? "#7fe0a4" : "#cfe04a";
    ctx.fillRect(barX, sy, sw * prog, Math.max(2 * u, 2));

    // Say what the bar IS. It has been advancing and granting ring positions
    // and headroom since the first floor, and nothing on screen said so -- an
    // unlabelled bar is indistinguishable from decoration.
    // Legible, not merely present. 7.5px of #7f9488 on black is on screen
    // at every viewport and still invisible enough to be asked "is that
    // bar doing anything?". A label nobody can read is decoration.
    ctx.font = `${9 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = _g.genome.strain >= MAX_STRAIN ? "#7fe0a4" : "#b9cbb0";
    const slots = bonusSlots(_g.genome.strain);
    const next = _g.genome.strain >= MAX_STRAIN
      ? "fully adapted"
      : `strain L${String(_g.genome.strain)} \u2192 L${String(_g.genome.strain + 1)}`;
    ctx.fillText(
      // What it has GRANTED, not just where it is: the bar earns ring
      // positions, and that was never named on screen.
      `${next}${slots > 0 ? `  +${String(slots)} site`
        + (slots === 1 ? "" : "s") : ""}`,
      barX, sy + 4 * u);

    // Explore is unavailable while anything is in view. Greyed rather than
    // hidden: a button that vanishes is harder to learn than one that dims.
    const ex = _g.buttons.find((b) => b.id === "explore");
    if (ex) ex.enabled = t_visibleHostile(_g) === null;

    const ops = _g.genome.operons().filter((op) => op.genes.length > 0).length;
    ctx.font = `${size * 0.86}px ui-monospace,monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    // Shortened and measured: the long form clipped off the right edge.
    const tailX = barX + hpW * 2 + 18 * u;
    const room = W - ins.right - 6 * u - tailX;
    const long = `${ops} operon${ops === 1 ? "" : "s"}   ${_g.dungeon.aliveCount()} hostile`;
    const short = `${ops}op  ${_g.dungeon.aliveCount()}hp`;
    // The SHORT form was never measured either; on a 320-wide phone it
    // overflows too, and there is nothing below it to fall back to.
    const tail = ctx.measureText(long).width <= room ? long
      : ctx.measureText(short).width <= room ? short : "";
    if (tail !== "") ctx.fillText(tail, tailX, barTop + lh * 1.15 + gaugeH / 2);
    ctx.textBaseline = "alphabetic";

    const LIFE = 9000;
    const FADE = 2000;
    const now = performance.now();
    const wrapped: { line: string; alpha: number }[] = [];
    const logW = W - barX - ins.right - pad;
    // Wrap at the font the log is DRAWN in. The readout above sets 0.86*size,
    // so wrapping under it and drawing at full size underestimated by 16%.
    ctx.font = `${size}px ui-monospace,monospace`;
    for (const entry of _g.log) {
      const age = now - entry.t;
      if (age > LIFE) continue;
      const alpha = age > LIFE - FADE ? (LIFE - age) / FADE : 1;
      // Wrapped to where it is DRAWN: the log sits at barX, indented past the
      // gauge, so wrapping to the full width overran by exactly that gauge.
      for (const line of _g.wrap(entry.text, logW)) wrapped.push({ line, alpha });
    }
    const shown = wrapped.slice(-4);
    // +lh: text is positioned by baseline, so the top line's ascender sits
    // ABOVE its y. Sizing the panel to shown.length*lh left it exposed.
    const logH = shown.length > 0 ? (shown.length + 0.4) * lh + pad * 0.5 : 0;
    _g.logH = logH;

    if (logH > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, barTop - logH, W, logH);
    }
    ctx.font = `${size}px ui-monospace,monospace`;

    for (let i = shown.length - 1; i >= 0; i--) {
      const row = shown[i];
      if (row === undefined) continue;
      ctx.globalAlpha = row.alpha;
      ctx.fillStyle = "#cfe8d4";
      ctx.fillText(row.line, barX, barTop - (shown.length - i) * lh - pad * 0.25);
    }
    ctx.globalAlpha = 1;
  }

/**
 * The surplus-cassette prompt.
 *
 * A full stack leaves a copy on the floor, and it is still DNA. Rather than a
 * bare refusal the cell is offered the choice it actually has: digest it, or
 * walk on. Drawn over the world because it is a decision about the tile you
 * are standing on.
 */
export function r_drawOffer(_g: Game, u: number, W: number, H: number): void {
  const offer = _g.offer;
  if (offer?.part.kind !== "gene") { _g.offerBoxes = null; return; }
  const ctx = _g.ctx;
  const w = Math.min(W - 40 * u, 300 * u);
  const h = 92 * u;
  const x = (W - w) / 2;
  const y = H - _g.insets().bottom - h - 96 * u;

  ctx.fillStyle = "rgba(10,14,12,0.95)";
  ctx.strokeStyle = "#cfe04a";
  ctx.lineWidth = Math.max(1.4 * u, 1.2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 7 * u);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `${11 * u}px ui-monospace,monospace`;
  ctx.fillText(ellipsise(ctx, `${GENES[offer.part.id].name} — stack is full`,
                         w - 20 * u), x + 10 * u, y + 18 * u);
  ctx.fillStyle = "#8fa89a";
  ctx.font = `${8.5 * u}px ui-monospace,monospace`;
  ctx.fillText(ellipsise(ctx, "you already carry the most a strain will hold",
                         w - 20 * u), x + 10 * u, y + 31 * u);

  const bw = (w - 30 * u) / 2;
  const by = y + h - 34 * u;
  const eat = { x: x + 10 * u, y: by, w: bw, h: 26 * u };
  const leave = { x: x + 20 * u + bw, y: by, w: bw, h: 26 * u };
  const button = (b: typeof eat, label: string, colour: string): void => {
    ctx.fillStyle = "rgba(20,26,22,0.9)";
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 5 * u);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.font = `${9.5 * u}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  };
  button(eat, "catabolise it", "#a0ffd0");
  button(leave, "leave it", "#9fb8a8");
  _g.offerBoxes = { eat, leave };
}
