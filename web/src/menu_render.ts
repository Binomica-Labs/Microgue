// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Drawing the front-of-game menus.
//
// Four modes, one per screen, plus a confirm modal that can sit over any of
// them. Every tappable thing is returned as a Box so input.ts can hit-test
// without the renderer knowing what a tap means.

import { mainRows, type Confirm, type MenuMode } from "./menu.js";
import { CREDIT_LINE } from "./credits.js";
import type { SlotInfo } from "./saves.js";
import type { Box, Insets } from "./chrome.js";

/** Just the boolean settings a row can flip. */
export interface ToggleView {
  autoAttack: boolean; minimap: boolean; diagonal: boolean;
  highContrast: boolean; reduceMotion: boolean;
}

export interface MenuBoxes {
  /** Rows on whichever screen is current: a mode to enter, a slot to act on,
   *  or a setting to toggle. */
  rows: { box: Box; mode?: MenuMode; slot?: number; del?: boolean;
          toggle?: keyof ToggleView }[];
  back: Box | null;
  confirm: { yes: Box; no: Box } | null;
}

const INK = "#d8ffe8";
const DIM = "rgba(216,255,232,0.45)";
const LINE = "rgba(160,220,180,0.35)";

function title(ctx: CanvasRenderingContext2D, W: number, u: number,
               top: number, text: string): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `${26 * u}px ui-monospace,monospace`;
  ctx.fillText(text, W / 2, top);
}

/** A full-width row with a label and optional right-aligned note. */
function row(
  ctx: CanvasRenderingContext2D, box: Box, u: number,
  label: string, note: string, bright: boolean,
): void {
  ctx.strokeStyle = bright ? LINE : "rgba(160,220,180,0.18)";
  ctx.lineWidth = Math.max(1.4 * u, 1.2);
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 8 * u);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = bright ? INK : DIM;
  ctx.font = `${15 * u}px ui-monospace,monospace`;
  ctx.fillText(label, box.x + 18 * u, box.y + box.h / 2);
  if (note) {
    ctx.textAlign = "right";
    ctx.fillStyle = DIM;
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText(note, box.x + box.w - 16 * u, box.y + box.h / 2);
  }
}

const LABEL: Record<MenuMode, string> = {
  main: "", newGame: "New Game", continue: "Continue", settings: "Settings",
};

export function drawMenu(
  ctx: CanvasRenderingContext2D, W: number, H: number, ins: Insets, u: number,
  mode: MenuMode, slots: (SlotInfo | null)[], confirm: Confirm | null,
  toggles: ToggleView,
): MenuBoxes {
  ctx.fillStyle = "#050d0a";
  ctx.fillRect(0, 0, W, H);

  const boxes: MenuBoxes = { rows: [], back: null, confirm: null };
  const top = ins.top + 92 * u;
  const rowH = 56 * u, gap = 12 * u;
  const rw = Math.min(W - ins.left - ins.right - 36 * u, 420 * u);
  const rx = (W - rw) / 2;

  if (mode === "main") {
    title(ctx, W, u, top - 30 * u, "MICROGUE");
    ctx.textAlign = "center";
    ctx.fillStyle = DIM;
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText("descend the Winogradsky column", W / 2, top - 6 * u);
    // The copyright, on the first screen anyone sees. A LICENSE file in a
    // repo is invisible to a player; this is not.
    ctx.fillStyle = "rgba(216,255,232,0.32)";
    ctx.font = `${8.5 * u}px ui-monospace,monospace`;
    ctx.fillText(CREDIT_LINE, W / 2, H - ins.bottom - 14 * u);

    const has = slots.some((s) => s !== null);
    const rows = mainRows(has);
    rows.forEach((m, i) => {
      const box: Box = { x: rx, y: top + 24 * u + i * (rowH + gap), w: rw, h: rowH };
      row(ctx, box, u, LABEL[m], "", true);
      boxes.rows.push({ box, mode: m });
    });
    return boxes;
  }

  title(ctx, W, u, top - 20 * u, LABEL[mode]);

  if (mode === "settings") {
    const opts: [string, keyof ToggleView][] = [
      ["auto-attack", "autoAttack"],
      ["minimap", "minimap"],
      ["diagonal movement", "diagonal"],
      ["high contrast", "highContrast"],
      ["reduce motion", "reduceMotion"],
    ];
    opts.forEach(([label, key], i) => {
      const box: Box = { x: rx, y: top + 14 * u + i * (rowH + gap), w: rw, h: rowH };
      row(ctx, box, u, label, toggles[key] ? "on" : "off", true);
      boxes.rows.push({ box, toggle: key });
    });
  }

  if (mode === "newGame" || mode === "continue") {
    ctx.textAlign = "center";
    ctx.fillStyle = DIM;
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText(mode === "newGame"
      ? "choose a slot to inoculate"
      : "choose a strain to continue, or delete one",
      W / 2, top);

    slots.forEach((s, i) => {
      const box: Box = { x: rx, y: top + 20 * u + i * (rowH + gap), w: rw, h: rowH };
      if (s) {
        row(ctx, box, u, s.name,
            `F${String(s.depth)} \u00b7 ${String(s.genes)} loci`, true);
        // Continue lists a delete tab on each used slot; New Game does not --
        // its whole job is to write, and overwrite is warned at the tap.
        if (mode === "continue") {
          const del: Box = { x: box.x + box.w - 46 * u, y: box.y + 8 * u,
                             w: 38 * u, h: box.h - 16 * u };
          ctx.strokeStyle = "rgba(224,138,90,0.5)";
          ctx.lineWidth = Math.max(1.2 * u, 1);
          ctx.beginPath();
          ctx.roundRect(del.x, del.y, del.w, del.h, 6 * u);
          ctx.stroke();
          ctx.fillStyle = "rgba(224,138,90,0.8)";
          ctx.font = `${10 * u}px ui-monospace,monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("del", del.x + del.w / 2, del.y + del.h / 2);
          boxes.rows.push({ box: del, slot: i, del: true });
        }
      } else if (mode === "newGame") {
        // New Game shows empty slots as targets; Continue hides them, since
        // there is nothing to continue.
        row(ctx, box, u, "empty", "tap to inoculate", false);
        boxes.rows.push({ box, slot: i });
      }
      // The whole-row tap on a used slot: resume (Continue) or overwrite
      // (New Game). Registered after the del tab so del wins where they
      // overlap.
      if (s) boxes.rows.push({ box, slot: i });
    });
  }

  // Back, on every screen but main.
  const back: Box = { x: rx, y: H - ins.bottom - 52 * u, w: rw, h: 40 * u };
  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(1.2 * u, 1);
  ctx.beginPath();
  ctx.roundRect(back.x, back.y, back.w, back.h, 7 * u);
  ctx.stroke();
  ctx.fillStyle = DIM;
  ctx.font = `${13 * u}px ui-monospace,monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("back", back.x + back.w / 2, back.y + back.h / 2);
  boxes.back = back;

  if (confirm) {
    const [head, body, danger] = confirm.kind === "overwrite"
      ? ["overwrite this slot?",
         `slot ${String(confirm.slot + 1)} holds a strain`, true]
      : ["delete this strain?",
         `slot ${String(confirm.slot + 1)} \u2014 this cannot be undone`, true];
    boxes.confirm = drawConfirmModal(ctx, W, H, u, head, body, danger);
  }
  return boxes;
}

/** A yes/no modal with no as the safe default and yes marked as the danger. */
function drawConfirmModal(
  ctx: CanvasRenderingContext2D, W: number, H: number, u: number,
  head: string, body: string, danger: boolean,
): { yes: Box; no: Box } {
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, W, H);
  const w = Math.min(W - 48 * u, 340 * u), h = 158 * u;
  const x = (W - w) / 2, y = (H - h) / 2;
  ctx.fillStyle = "#0e1411";
  ctx.strokeStyle = danger ? "rgba(224,138,90,0.5)" : LINE;
  ctx.lineWidth = Math.max(1.4 * u, 1.2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10 * u);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `${14 * u}px ui-monospace,monospace`;
  ctx.fillText(head, x + w / 2, y + 34 * u);
  ctx.fillStyle = DIM;
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText(body, x + w / 2, y + 58 * u);

  const bw = (w - 44 * u) / 2, bh = 40 * u, by = y + h - bh - 18 * u;
  // No on the LEFT and drawn as the plain default; yes on the right in the
  // danger colour. The safe choice is where a thumb rests.
  const no: Box = { x: x + 16 * u, y: by, w: bw, h: bh };
  const yes: Box = { x: x + w - bw - 16 * u, y: by, w: bw, h: bh };
  for (const [box, label, colour] of [
    [no, "cancel", INK],
    [yes, danger ? "delete" : "yes", "#e08a5a"],
  ] as [Box, string, string][]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.3 * u, 1.1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7 * u);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.font = `${13 * u}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2);
  }
  return { yes, no };
}
