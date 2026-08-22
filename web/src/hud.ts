// Graphical HUD.
//
// The centrepiece is a Winogradsky column running down the screen edge: eight
// bands in their stratum colours with your position marked. It is the game's
// structure drawn literally, and it replaces "D2/8" with something you read at
// a glance -- how far down you are, and how much darker it gets.

import { MAX_DEPTH, STRATA, type Stratum } from "./biology.js";
import type { Plasmid } from "./plasmid.js";

export interface HudLayout {
  readonly u: number;          // ui scale
  readonly left: number; readonly right: number;
  readonly top: number; readonly bottom: number;
  readonly w: number; readonly h: number;
  /** Height of the status bar the gauge must stop above. Omitting this ran
   *  the column off the bottom of the screen and under the bar. */
  readonly reserve: number;
}

/** The column gauge. Returns the width it consumed. */
export function drawColumn(
  ctx: CanvasRenderingContext2D, L: HudLayout, depth: number,
): number {
  const w = Math.max(14 * L.u, 12);
  const pad = 6 * L.u;
  const x = L.left + pad;
  const top = L.top + pad;
  const h = L.h - L.top - L.bottom - L.reserve - pad * 2;
  const band = h / MAX_DEPTH;

  ctx.save();
  // Opaque backing. Without it the dimmed bands composite against whatever
  // wall colour happens to be behind, and the palette reads wrong.
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.fillRect(x - pad * 0.5, top - pad * 0.5, w + pad, h + pad);

  for (let i = 0; i < MAX_DEPTH; i++) {
    const s: Stratum | undefined = STRATA[i];
    if (!s) continue;
    const y = top + i * band;
    const here = s.depth === depth;
    ctx.globalAlpha = here ? 1 : 0.62;
    ctx.fillStyle = s.wall;
    ctx.fillRect(x, y, w, band - 1);

    // Redundant, non-colour depth cue: tick marks matching the wall hatch.
    if (s.hatch > 0) {
      ctx.globalAlpha = here ? 0.5 : 0.3;
      ctx.fillStyle = s.floor;
      for (let t = 1; t <= s.hatch; t++) {
        ctx.fillRect(x + w * 0.3, y + (band * t) / (s.hatch + 1), w * 0.4,
                     Math.max(band * 0.05, 1));
      }
    }
  }

  // Position marker: a wedge pointing at the current band, plus the numeral.
  const my = top + (depth - 0.5) * band;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(x + w + 2, my);
  ctx.lineTo(x + w + 2 + 7 * L.u, my - 5 * L.u);
  ctx.lineTo(x + w + 2 + 7 * L.u, my + 5 * L.u);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(2 * L.u, 2);
  ctx.strokeRect(x - 1, top + (depth - 1) * band - 1, w + 2, band + 1);
  ctx.restore();

  return w + pad * 2 + 8 * L.u;
}


/** Horizontal bar with a label. Value is shown as a number too -- length alone
 *  is hard to read, and colour alone excludes a chunk of players. */
export function drawBar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  frac: number, fill: string, label: string, font: string,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.min(Math.max(frac, 0), 1), h);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, x + 6, y + h / 2 + 0.5);
  ctx.restore();
}


/** Miniature plasmid ring: occupancy as arc coverage, burden as ring colour. */
export function drawPlasmidRing(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
  genome: Plasmid, depth: number,
): void {
  ctx.save();
  ctx.lineWidth = Math.max(r * 0.36, 3);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // One arc per operon, brightness by mean expression at this depth.
  for (const op of genome.operons()) {
    if (op.genes.length === 0) continue;
    const step = (Math.PI * 2) / 16;
    const a0 = op.promoter * step - Math.PI / 2;
    const a1 = a0 + (op.genes.length + 1) * step;
    const e = op.genes.reduce((a, g) => a + genome.expression(g.id, depth), 0)
            / op.genes.length;
    ctx.strokeStyle = `rgba(${120 + 135 * e},${140 + 110 * e},130,${0.45 + 0.55 * e})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0 + 0.04, a1 - 0.04);
    ctx.stroke();
  }

  const burden = genome.burden();
  if (burden > 0) {
    ctx.fillStyle = `rgba(255,${Math.round(180 - 140 * burden)},80,${0.5 + burden * 0.5})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
