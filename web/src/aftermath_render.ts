// The three aftermath screens: report, store, ready.
//
// Each names itself, says in one line what it is for, and has one big action
// button at the bottom that says what it does. The store keeps the credit
// balance in a fixed strip so you never lose track of what you can afford.

import { drawClose, type Box, type Insets } from "./chrome.js";
import { ellipsise, type ShopRow } from "./screens.js";
import { offers, type Lab, type RunRecord } from "./lab.js";
import { stageCopy, type AftermathStage } from "./aftermath.js";
import type { GeneId } from "./biology.js";

export interface AftermathBoxes {
  /** The one forward action. */
  action: Box;
  /** Close, on the report only -- it returns to the menu without spending. */
  close: Box | null;
  /** Store rows, when on the store. */
  rows: ShopRow[];
  maxScroll: number;
}

const INK = "#ffffff";
const DIM = "#8fa89a";
const GOLD = "#cfe04a";
const GREEN = "#7fe0a4";

/** A screen title, its explanatory line, and a thin rule beneath. */
function heading(
  ctx: CanvasRenderingContext2D, W: number, ins: Insets, u: number,
  title: string, sub: string, colour = INK,
): number {
  const left = ins.left + 16 * u;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colour;
  ctx.font = `${18 * u}px ui-monospace,monospace`;
  ctx.fillText(title, left, ins.top + 30 * u);
  ctx.fillStyle = DIM;
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText(ellipsise(ctx, sub, W - left - ins.right - 60 * u), left, ins.top + 46 * u);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(left, ins.top + 56 * u, W - left - ins.right - 16 * u, Math.max(u, 1));
  return ins.top + 70 * u;
}

/** The one action button. Wide, low, unmistakable. */
function actionButton(
  ctx: CanvasRenderingContext2D, W: number, H: number, ins: Insets, u: number,
  label: string, colour: string,
): Box {
  const w = Math.min(W - ins.left - ins.right - 32 * u, 360 * u);
  const h = 46 * u;
  const box: Box = { x: (W - w) / 2, y: H - ins.bottom - h - 16 * u, w, h };
  ctx.fillStyle = "rgba(10,16,13,0.95)";
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1.6 * u, 1.4);
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 9 * u);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.font = `${14 * u}px ui-monospace,monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2);
  return box;
}

export function drawAftermath(
  ctx: CanvasRenderingContext2D, W: number, H: number, ins: Insets, u: number,
  stage: AftermathStage, lab: Lab, last: RunRecord | null,
  seen: readonly GeneId[], wrap: (s: string, w: number) => string[],
  scrollTop = 0,
): AftermathBoxes {
  ctx.fillStyle = "rgba(4,7,6,0.98)";
  ctx.fillRect(0, 0, W, H);
  const won = last?.won ?? false;
  const copy = stageCopy(stage, won);
  const out: AftermathBoxes = { action: { x: 0, y: 0, w: 0, h: 0 }, close: null,
                                rows: [], maxScroll: 0 };
  const left = ins.left + 16 * u;
  const wide = W - ins.left - ins.right - 32 * u;

  if (stage === "report") {
    let y = heading(ctx, W, ins, u, copy.title, copy.sub, won ? GREEN : "#e0a37a");
    out.close = drawClose(ctx, W, ins, u);
    if (last) {
      // The obituary, given room.
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = won ? GREEN : "#e0a37a";
      ctx.font = `${12 * u}px ui-monospace,monospace`;
      for (const line of wrap(
        `Strain ${String(last.n)} reached F${String(last.floor)}, the `
        + `${last.stratum}, in ${String(last.turns)} turns. `
        + `${String(last.catalogued)} organisms recorded. `
        + (won ? "It got to the bottom." : `Killed by ${last.killedBy}.`), wide)) {
        ctx.fillText(line, left, y);
        y += 17 * u;
      }
      y += 6 * u;
      // The credit, as the headline number it is.
      ctx.fillStyle = GOLD;
      ctx.font = `${22 * u}px ui-monospace,monospace`;
      ctx.fillText(`+${String(last.credit)}`, left, y + 12 * u);
      ctx.fillStyle = DIM;
      ctx.font = `${10 * u}px ui-monospace,monospace`;
      ctx.fillText("synthesis credit earned", left + 62 * u, y + 12 * u);
      y += 36 * u;

      // Final moments, labelled so it reads as a log and not stray debug text.
      if (last.epitaph.length > 0) {
        ctx.fillStyle = DIM;
        ctx.font = `${9 * u}px ui-monospace,monospace`;
        ctx.fillText("final moments", left, y);
        y += 14 * u;
        ctx.fillStyle = "#6f8f7c";
        ctx.font = `${9 * u}px ui-monospace,monospace`;
        for (const line of last.epitaph.slice(-5)) {
          ctx.fillText(ellipsise(ctx, line, wide), left, y);
          y += 12 * u;
        }
      }
      // A one-line lineage summary at the bottom, so the totals stay visible.
      ctx.fillStyle = DIM;
      ctx.font = `${9.5 * u}px ui-monospace,monospace`;
      ctx.fillText(ellipsise(ctx, `${String(lab.credit)} credit banked  \u00b7  `
        + `${String(lab.ledger.length)} strains sent  \u00b7  deepest F${String(lab.deepestEver)}`,
        wide), left, H - ins.bottom - 80 * u);
    }
    out.action = actionButton(ctx, W, H, ins, u, copy.action, GOLD);
    return out;
  }

  if (stage === "store") {
    let y = heading(ctx, W, ins, u, copy.title, copy.sub);
    // The credit balance, fixed under the heading. What you have is the one
    // number a shop must never make you scroll to find.
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = GOLD;
    ctx.font = `${16 * u}px ui-monospace,monospace`;
    ctx.fillText(String(lab.credit), left, y + 4 * u);
    ctx.fillStyle = DIM;
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText("credit available  \u00b7  green rows are already ordered",
                 left + 50 * u, y + 4 * u);
    y += 22 * u;

    const rowH = 36 * u;
    const floor = H - ins.bottom - 78 * u;
    const list = offers(lab, seen);
    const listTop = y;
    const visible = Math.max(Math.floor((floor - listTop) / rowH), 1);
    out.maxScroll = Math.max(list.length - visible, 0);
    const want = Number.isFinite(scrollTop) ? Math.round(scrollTop) : 0;
    const from = Math.min(Math.max(want, 0), out.maxScroll);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listTop - 4 * u, W, floor - listTop + 4 * u);
    ctx.clip();
    for (const offer of list.slice(from, from + visible + 1)) {
      if (y + rowH > floor + rowH) break;
      const box: Box = { x: left, y, w: wide, h: rowH - 5 * u };
      const afford = !offer.owned && lab.credit >= offer.price;
      out.rows.push({ box, offer });
      ctx.fillStyle = offer.owned ? "rgba(90,200,140,0.16)" : "rgba(16,22,18,0.9)";
      ctx.strokeStyle = offer.owned ? "#5ec98a"
        : afford ? "rgba(207,224,74,0.65)" : "rgba(255,255,255,0.13)";
      ctx.lineWidth = Math.max(1.2 * u, 1);
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, 6 * u);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = offer.owned ? GREEN : afford ? INK : "#7f8f87";
      ctx.font = `${11.5 * u}px ui-monospace,monospace`;
      ctx.fillText(offer.name, box.x + 10 * u, box.y + 14 * u);
      ctx.fillStyle = DIM;
      ctx.font = `${8.5 * u}px ui-monospace,monospace`;
      ctx.fillText(ellipsise(ctx, offer.note, box.w - 76 * u),
                   box.x + 10 * u, box.y + 26 * u);
      ctx.textAlign = "right";
      ctx.fillStyle = offer.owned ? "#5ec98a" : afford ? GOLD : "#6f8f7c";
      ctx.font = `${10.5 * u}px ui-monospace,monospace`;
      ctx.fillText(offer.owned ? "ordered" : `${String(offer.price)} cr`,
                   box.x + box.w - 10 * u, box.y + 20 * u);
      y += rowH;
    }
    ctx.restore();
    if (out.maxScroll > 0) {
      const trackH = floor - listTop;
      const knobH = Math.max(trackH * (visible / list.length), 18 * u);
      const t = from / out.maxScroll;
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(W - ins.right - 6 * u, listTop, 3 * u, trackH);
      ctx.fillStyle = "rgba(207,224,74,0.65)";
      ctx.fillRect(W - ins.right - 6 * u, listTop + (trackH - knobH) * t, 3 * u, knobH);
    }
    out.action = actionButton(ctx, W, H, ins, u, copy.action, GREEN);
    return out;
  }

  // ready
  let y = heading(ctx, W, ins, u, copy.title, copy.sub, GREEN);
  const ordered = offers(lab, seen).filter((o) => o.owned);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DIM;
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText(ordered.length > 0
    ? `${String(ordered.length)} construct${ordered.length === 1 ? "" : "s"} aboard from turn one:`
    : "Nothing ordered. The strain goes down as it is.", left, y);
  y += 18 * u;
  ctx.fillStyle = GREEN;
  ctx.font = `${10.5 * u}px ui-monospace,monospace`;
  for (const o of ordered.slice(0, 14)) {
    ctx.fillText(`\u2713  ${o.name}`, left + 6 * u, y);
    y += 15 * u;
  }
  if (ordered.length > 14) {
    ctx.fillStyle = DIM;
    ctx.fillText(`\u2026 and ${String(ordered.length - 14)} more`, left + 6 * u, y);
  }
  out.action = actionButton(ctx, W, H, ins, u, copy.action, GREEN);
  return out;
}
