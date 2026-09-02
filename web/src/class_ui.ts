// Choosing what to inoculate.
//
// Shown once, when an EMPTY slot is tapped: the class is fixed for the life of
// the strain, so this is the last moment it can be decided. Tapping a slot
// that already holds a culture resumes it and never comes here.
//
// The card leads with the TRADE rather than the flavour. A player picking a
// class for the first time needs to know where it is strong and where it will
// be in trouble; the organism it is drawn from is interesting and secondary.

import { CLASSES, CLASS_IDS, type ClassId } from "./classes.js";
import { GENES } from "./biology.js";
import { stratum } from "./biology.js";
import type { Box, Insets } from "./chrome.js";

export interface ClassRow { readonly box: Box; readonly id: ClassId }

export function drawClassPicker(
  ctx: CanvasRenderingContext2D, W: number, H: number, ins: Insets, u: number,
  rows: ClassRow[], slot: number,
): void {
  rows.length = 0;
  ctx.fillStyle = "rgba(0,0,0,0.93)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `${17 * u}px ui-monospace,monospace`;
  ctx.fillText("what goes into the column", ins.left + 18 * u, ins.top + 46 * u);
  ctx.fillStyle = "#8fa89a";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText(`slot ${String(slot + 1)} \u00b7 chosen once, and not again`,
               ins.left + 18 * u, ins.top + 64 * u);

  // Sized to the room available rather than a fixed height: four cards have to
  // fit a 640px android as well as a tablet.
  const top = ins.top + 82 * u;
  const bottom = H - ins.bottom - 12 * u;
  const gap = 8 * u;
  const cardH = Math.max((bottom - top - gap * (CLASS_IDS.length - 1))
    / CLASS_IDS.length, 54 * u);

  CLASS_IDS.forEach((id, i) => {
    const c = CLASSES[id];
    const box: Box = {
      x: ins.left + 14 * u, y: top + i * (cardH + gap),
      w: W - ins.left - ins.right - 28 * u, h: cardH,
    };
    rows.push({ box, id });

    const st = stratum(c.native[1]);
    ctx.fillStyle = "rgba(14,20,17,0.92)";
    ctx.strokeStyle = st.accent;
    ctx.lineWidth = Math.max(1.4 * u, 1.2);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7 * u);
    ctx.fill();
    ctx.stroke();

    // A spine in the colour of the stratum it belongs to, so the four read as
    // positions on the column before a word is read.
    ctx.fillStyle = st.wall;
    ctx.fillRect(box.x + 2 * u, box.y + 5 * u, 4 * u, box.h - 10 * u);

    ctx.fillStyle = "#ffffff";
    ctx.font = `${13 * u}px ui-monospace,monospace`;
    ctx.fillText(c.name, box.x + 14 * u, box.y + 20 * u);

    ctx.textAlign = "right";
    ctx.fillStyle = st.accent;
    ctx.font = `${9 * u}px ui-monospace,monospace`;
    ctx.fillText(c.native[0] === c.native[1]
      ? `native D${String(c.native[0])}`
      : `native D${String(c.native[0])}-${String(c.native[1])}`,
                 box.x + box.w - 12 * u, box.y + 20 * u);
    ctx.textAlign = "left";

    ctx.fillStyle = "#8fa89a";
    ctx.font = `${9 * u}px ui-monospace,monospace`;
    ctx.fillText(c.blurb, box.x + 14 * u, box.y + 34 * u);

    // The trade, in the two colours the rest of the game already uses for
    // "this helps" and "this hurts".
    let y = box.y + 48 * u;
    const line = (text: string, colour: string): void => {
      if (y > box.y + box.h - 6 * u) return;
      ctx.fillStyle = colour;
      ctx.font = `${8 * u}px ui-monospace,monospace`;
      ctx.fillText(text, box.x + 14 * u, y);
      y += 11 * u;
    };
    for (const p of c.pros) line(`+ ${p}`, "#7fe0a4");
    for (const n of c.cons) line(`\u2212 ${n}`, "#e08a5a");
    line(`starts with ${c.genes.map((g) => GENES[g].name).join(", ")}`, "#6f8f7c");
  });
}
