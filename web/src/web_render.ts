// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Drawing the gene constellation. Layout lives in web_layout.ts.

import { buildWeb, webNodeAt, type Web, type WebNode } from "./web_layout.js";
import { GENES, type GeneId } from "./biology.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";
import { shade } from "./relief.js";

export interface WebView { cx: number; cy: number; scale: number }

/** A view that fits the whole map in the space given. */
export function fitWeb(w: number, h: number): WebView {
  return { cx: w / 2, cy: h / 2, scale: Math.min(w, h) * 0.44 };
}

export function clampWeb(v: WebView, w: number, h: number): WebView {
  const min = Math.min(w, h) * 0.30;
  const max = Math.min(w, h) * 2.4;
  // A non-finite view is a blank screen with no way back: `Math.min(NaN, x)`
  // is NaN, so clamping alone never recovers. One bad pinch -- two pointers
  // reporting the same position gives a ratio of 0/0 -- would have ended the
  // session's use of this screen.
  const safe = (n: number, fallback: number): number =>
    Number.isFinite(n) ? n : fallback;
  const scale = Math.min(Math.max(safe(v.scale, min), min), max);
  // The centre may wander but not so far that the map leaves the screen
  // entirely -- a player who pans into the void has no way back.
  const slack = scale * 1.2;
  return {
    scale,
    cx: Math.min(Math.max(safe(v.cx, w / 2), w / 2 - slack), w / 2 + slack),
    cy: Math.min(Math.max(safe(v.cy, h / 2), h / 2 - slack), h / 2 + slack),
  };
}

const sx = (v: WebView, x: number): number => v.cx + x * v.scale;
const sy = (v: WebView, y: number): number => v.cy + y * v.scale;

/**
 * Paint the map.
 *
 * Unlit first, then live strands, then nodes: a dim node must never draw
 * over a lit one, because the lit ones are the whole point.
 */
export function drawWeb(
  ctx: CanvasRenderingContext2D, web: Web, v: WebView, u: number,
  selected: GeneId | null, now: number,
): void {
  // Dim strands: the shape of everything that exists.
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = Math.max(u, 1);
  // ONE path for every dim strand: they share a colour and a width, so
  // stroking them individually was seventy-seven state changes a frame for
  // a single visual result.
  ctx.beginPath();
  for (const e of web.edges) {
    if (e.live) continue;
    ctx.moveTo(sx(v, e.ax), sy(v, e.ay));
    ctx.lineTo(sx(v, e.bx), sy(v, e.by));
  }
  ctx.stroke();
  // Live strands, in their pathway's colour.
  for (const e of web.edges) {
    if (!e.live) continue;
    ctx.strokeStyle = PATHWAY_COLOUR[e.pathway];
    ctx.lineWidth = Math.max(2.2 * u, 1.4);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(sx(v, e.ax), sy(v, e.ay));
    ctx.lineTo(sx(v, e.bx), sy(v, e.by));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const n of web.nodes) {
    const x = sx(v, n.x), y = sy(v, n.y);
    const tint = PATHWAY_COLOUR[n.pathway];
    const lit = n.installed || n.held;
    const r = Math.max((lit ? 5.5 + Math.min(n.level, 5) * 0.9 : 3.4)
                       * (v.scale / 180) * u, 2);

    if (n.installed) {
      // A soft halo, so an installed gene is findable at a glance across a
      // map of eighty-eight dots.
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.16 + 0.05 * Math.sin(now / 900 + n.x * 6);
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = n.installed ? tint
      : n.held ? shade(tint, -0.5) : "rgba(255,255,255,0.13)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (n.held && !n.installed) {
      ctx.strokeStyle = shade(tint, -0.1);
      ctx.lineWidth = Math.max(1.2 * u, 1);
      ctx.stroke();
    }
    if (n.id === selected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2 * u, 1.4);
      ctx.beginPath();
      ctx.arc(x, y, r + 4 * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Names only when there is room for them: eighty-eight labels at once
    // is a wall of text, and the map is for finding regions, not reading.
    if (v.scale > 420 && (lit || n.id === selected)) {
      ctx.fillStyle = n.installed ? "#ffffff" : "rgba(255,255,255,0.5)";
      ctx.font = `${Math.max(7.5 * u, 6)}px ui-monospace,monospace`;
      ctx.fillText(GENES[n.id].name, x, y + r + 9 * u);
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Hit-test in screen space. */
export function webHit(
  web: Web, v: WebView, px: number, py: number, u: number,
): WebNode | null {
  return webNodeAt(web, (px - v.cx) / v.scale, (py - v.cy) / v.scale,
                   Math.max(16 * u / v.scale, 0.03));
}

export { buildWeb };
