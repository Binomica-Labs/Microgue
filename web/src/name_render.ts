// The "name your strain" screen.
//
// The real text lives in a hidden <input> (name_entry.ts); this draws what it
// holds so the player sees the name form on the canvas, with a caret, in the
// game's own type. It also draws a "done" button for a phone whose keyboard
// has no obvious Enter, and a "skip" that takes the suggested name.

import type { Box, Insets } from "./chrome.js";
import type { Game } from "./main.js";

export interface NameBoxes { done: Box; skip: Box }

export function drawNaming(
  _g: Game, W: number, H: number, ins: Insets, u: number,
): NameBoxes {
  const ctx = _g.ctx;
  ctx.fillStyle = "#050d0a";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const top = ins.top + 110 * u;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#d8ffe8";
  ctx.font = `${22 * u}px ui-monospace,monospace`;
  ctx.fillText("Name your strain", cx, top);
  ctx.fillStyle = "rgba(216,255,232,0.5)";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText("it will carry this name down the column", cx, top + 20 * u);

  // The field. Its text comes from the hidden input; the caret blinks.
  const fw = Math.min(W - ins.left - ins.right - 48 * u, 320 * u);
  const fh = 54 * u;
  const fx = (W - fw) / 2, fy = top + 50 * u;
  ctx.fillStyle = "rgba(16,22,18,0.95)";
  ctx.strokeStyle = "#7fe0a4";
  ctx.lineWidth = Math.max(1.6 * u, 1.4);
  ctx.beginPath();
  ctx.roundRect(fx, fy, fw, fh, 9 * u);
  ctx.fill();
  ctx.stroke();

  const text = _g.nameField?.value() ?? "";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = text.length > 0 ? "#ffffff" : "rgba(216,255,232,0.35)";
  ctx.font = `${20 * u}px ui-monospace,monospace`;
  const shown = text.length > 0 ? text : "type a name";
  ctx.fillText(shown, fx + 16 * u, fy + fh / 2);
  if (text.length > 0 && Math.floor(_g.now / 500) % 2 === 0) {
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "#7fe0a4";
    ctx.fillRect(fx + 16 * u + w + 3 * u, fy + fh * 0.25, 2 * u, fh * 0.5);
  }

  // Buttons: done (commit what is typed) and skip (take the suggestion).
  const bw = (fw - 12 * u) / 2, bh = 42 * u, by = fy + fh + 18 * u;
  const skip: Box = { x: fx, y: by, w: bw, h: bh };
  const done: Box = { x: fx + bw + 12 * u, y: by, w: bw, h: bh };
  for (const [box, label, colour] of [
    [skip, "use suggested", "rgba(216,255,232,0.55)"],
    [done, "done", "#7fe0a4"],
  ] as [Box, string, string][]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.3 * u, 1.1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7 * u);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2);
  }
  return { done, skip };
}
