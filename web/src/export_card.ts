// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The build, as a picture you can keep.
//
// A run ends and everything it was disappears: the ring you assembled, the
// pathways you lit, the depth you reached. The report card says what
// HAPPENED; this says what you BUILT, and it is the only artefact that
// leaves the game.
//
// Drawn to its own offscreen canvas at a fixed size, not scraped from the
// screen. A screenshot of a phone is a screenshot of a phone -- bars,
// notches, whatever was mid-animation. This is composed: square, legible at
// thumbnail size, and the same on every device.

import { buildWeb } from "./web_layout.js";
import { drawWeb, fitWeb } from "./web_render.js";
import { GENES, type GeneId } from "./biology.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";
import { CREDIT_LINE } from "./credits.js";

export interface CardData {
  readonly strain: string;
  readonly generation: number;
  readonly floor: number;
  readonly maxFloor: number;
  readonly turns: number;
  readonly lysed: number;
  readonly installed: ReadonlyMap<GeneId, number>;
  readonly held: ReadonlySet<GeneId>;
  /** How it ended, in the game's own words. */
  readonly epitaph: string;
  readonly won: boolean;
}

/** Side of the exported square, in pixels. */
export const CARD_SIZE = 1080;

/**
 * Compose the card. Returns the canvas so the caller decides what to do
 * with it -- download, share sheet, or nothing.
 */
export function drawCard(
  ctx: CanvasRenderingContext2D, d: CardData, size = CARD_SIZE,
): void {
  const u = size / 420;
  ctx.fillStyle = "#070b09";
  ctx.fillRect(0, 0, size, size);

  // The map, centred and given most of the square. It IS the picture; the
  // text is a caption.
  const web = buildWeb(d.installed, d.held);
  const v = fitWeb(size, size * 0.82);
  drawWeb(ctx, web, { ...v, cy: size * 0.46 }, u * 0.8, null, 0);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `${20 * u}px ui-monospace,monospace`;
  ctx.fillText(d.strain, size / 2, 34 * u);

  ctx.fillStyle = d.won ? "#7fe0a4" : "#8fa89a";
  ctx.font = `${11 * u}px ui-monospace,monospace`;
  ctx.fillText(
    d.won ? `reached the bottom \u00b7 generation ${String(d.generation)}`
      : `floor ${String(d.floor)}/${String(d.maxFloor)} `
        + `\u00b7 generation ${String(d.generation)}`,
    size / 2, 50 * u);

  // What it was made of: the pathways actually lit, in their own colours.
  // A list of gene names would be unreadable at thumbnail size and this is
  // the thing a build IS -- which chemistry you committed to.
  const lit = new Map<string, number>();
  for (const id of d.installed.keys()) {
    const p = GENES[id].pathway;
    lit.set(p, (lit.get(p) ?? 0) + 1);
  }
  const paths = [...lit].sort((a, b) => b[1] - a[1]).slice(0, 6);
  let x = size / 2 - (paths.length - 1) * 42 * u;
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  for (const [p, n] of paths) {
    ctx.fillStyle = PATHWAY_COLOUR[p as keyof typeof PATHWAY_COLOUR];
    ctx.fillText(`${p} ${String(n)}`, x, size - 52 * u);
    x += 84 * u;
  }

  ctx.fillStyle = "#6f8f7c";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText(
    `${String(d.installed.size)} genes \u00b7 ${String(d.turns)} turns `
    + `\u00b7 ${String(d.lysed)} lysed`, size / 2, size - 34 * u);

  if (d.epitaph.length > 0) {
    ctx.fillStyle = "#8fa89a";
    ctx.font = `italic ${10 * u}px ui-monospace,monospace`;
    ctx.fillText(clip(ctx, d.epitaph, size - 40 * u), size / 2, size - 18 * u);
  }

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.font = `${8 * u}px ui-monospace,monospace`;
  ctx.textAlign = "right";
  ctx.fillText(CREDIT_LINE, size - 12 * u, size - 6 * u);
  ctx.textAlign = "left";
}

function clip(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 4 && ctx.measureText(`${t}\u2026`).width > max) {
    t = t.slice(0, -1);
  }
  return `${t}\u2026`;
}

/** A filename that sorts and does not collide. */
export function cardName(strain: string, floor: number): string {
  const safe = strain.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 32)
    || "strain";
  return `microgue-${safe}-F${String(floor)}.png`;
}
