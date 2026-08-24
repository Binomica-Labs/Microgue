// Overlays that need nothing from the Game object beyond plain data.
//
// Extracted so main.ts stops being the only place a screen can live, and so
// each is callable from a test without constructing a game.

import * as bio from "./biology.js";
import { drawClose, drawHeader, type Box, type Insets } from "./chrome.js";
import { notebook, type RunState } from "./run.js";
import { SLOTS as SAVE_SLOTS, listSlots } from "./saves.js";
import { BUILD, VERSION } from "./version.js";

export type Wrap = (text: string, max: number) => string[];

/** Title screen: the column as a backdrop, one card per culture. */
export function drawSplash(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  ins: Insets, u: number, slotBoxes: Box[], names: readonly string[],
): Box {
  ctx.fillStyle = "#050d0a";
  ctx.fillRect(0, 0, W, H);

  // The column itself, eight bands top to bottom.
  const bandH = H / bio.MAX_DEPTH;
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < bio.MAX_DEPTH; i++) {
    const st = bio.STRATA[i];
    if (!st) continue;
    ctx.fillStyle = st.wall;
    ctx.fillRect(0, i * bandH, W, bandH);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `${34 * u}px ui-monospace,monospace`;
  ctx.fillText("MICROGUE", W / 2, ins.top + 72 * u);
  ctx.fillStyle = "#9fd8b4";
  ctx.font = `${11 * u}px ui-monospace,monospace`;
  ctx.fillText("descend the Winogradsky column", W / 2, ins.top + 94 * u);
  ctx.fillStyle = "#6f8f7c";
  ctx.fillText("O2 · NO3- · Mn(IV) · Fe(III) · S0 · H2S · SO4 · CO2",
               W / 2, ins.top + 112 * u);

  const slots = listSlots();
  const cardH = 62 * u;
  const gap = 10 * u;
  const top = ins.top + 148 * u;
  slotBoxes.length = 0;

  for (let i = 0; i < SAVE_SLOTS; i++) {
    const box: Box = {
      x: ins.left + 20 * u, y: top + i * (cardH + gap),
      w: W - ins.left - ins.right - 40 * u, h: cardH,
    };
    slotBoxes.push(box);
    const info = slots[i];

    ctx.fillStyle = info ? "rgba(20,34,26,0.9)" : "rgba(0,0,0,0.5)";
    ctx.strokeStyle = info ? "#5ec98a" : "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1.5 * u, 1.5);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8 * u);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    if (info) {
      const st = bio.stratum(info.depth);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${15 * u}px ui-monospace,monospace`;
      ctx.fillText(info.name, box.x + 14 * u, box.y + 26 * u);
      ctx.fillStyle = st.accent;
      ctx.font = `${10.5 * u}px ui-monospace,monospace`;
      ctx.fillText(`D${String(info.depth)} ${st.name}  ·  ${String(info.genes)} loci`,
                   box.x + 14 * u, box.y + 45 * u);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = `${13 * u}px ui-monospace,monospace`;
      ctx.fillText(`new culture  ${names[i % names.length] ?? ""}`,
                   box.x + 14 * u, box.y + 36 * u);
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#6f8f7c";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText("tap a culture to begin", W / 2, H - ins.bottom - 20 * u);

  // The build's identity, where you look at launch. This is the only place
  // that answers "did the app actually update?" without guessing.
  ctx.fillStyle = "#4f6a5c";
  ctx.font = `${9 * u}px ui-monospace,monospace`;
  ctx.fillText(`${VERSION} · ${BUILD}`, W / 2, H - ins.bottom - 6 * u);
  return drawClose(ctx, W, ins, u);
}

/** The field notebook: everything this lineage has met. */
export function drawNotes(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  ins: Insets, u: number, run: RunState, wrap: Wrap,
): Box {
  ctx.fillStyle = "rgba(4,7,6,0.97)";
  ctx.fillRect(0, 0, W, H);

  const seen = notebook(run);
  let y = drawHeader(ctx, ins, u, `FIELD NOTEBOOK  ${VERSION}`,
    `${String(seen.length)}/${String(bio.MICROBES.length)} recorded · ` +
    `deepest D${String(run.deepest)} · ${String(run.deaths)} lysis events`);

  const maxW = W - ins.left - ins.right - 28 * u;
  const floor = H - ins.bottom - 60 * u;

  for (const s of seen) {
    if (y > floor) {
      ctx.fillStyle = "#6f8f7c";
      ctx.font = `${10 * u}px ui-monospace,monospace`;
      ctx.fillText("…more recorded than fits on screen", ins.left + 14 * u, y);
      break;
    }
    const st = bio.stratum(s.depth);
    ctx.fillStyle = st.accent;
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.fillText(`D${String(s.depth)}  ${s.name}`, ins.left + 14 * u, y);
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    for (const line of wrap(s.note, maxW)) {
      y += 14 * u;
      ctx.fillText(line, ins.left + 14 * u, y);
    }
    ctx.fillStyle = "#6f8f7c";
    y += 14 * u;
    ctx.fillText(s.genes.map((g) => bio.GENES[g].name).join(" "), ins.left + 14 * u, y);
    y += 22 * u;
  }

  if (seen.length === 0) {
    ctx.fillStyle = "#6f8f7c";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText("Nothing recorded yet. Lyse something.", ins.left + 14 * u, y);
  }

  ctx.fillStyle = "#6f8f7c";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.textAlign = "center";
  ctx.fillText("tap anywhere to export the plasmid as FASTA",
               W / 2, H - ins.bottom - 20 * u);
  return drawClose(ctx, W, ins, u);
}
