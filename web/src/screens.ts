// Overlays that need nothing from the Game object beyond plain data.
//
// Extracted so main.ts stops being the only place a screen can live, and so
// each is callable from a test without constructing a game.

import * as bio from "./biology.js";
import { drawClose, drawHeader, type Box, type Insets } from "./chrome.js";
import { notebook, type RunState } from "./run.js";
import { SLOTS as SAVE_SLOTS, listSlots } from "./saves.js";
import { MAX_LEVEL, MODIFIERS, RARITY, evolutionCost, levelMultiplier,
         modifierSlots, type ModifierId } from "./parts.js";
import { GENES, type GeneId } from "./biology.js";
import { TRAITS, TRAIT_IDS, expansionCost, type TraitId }
  from "./chromosome.js";
import { describeLevel } from "./strain.js";
import { describeLab, offers, type Lab, type Offer, type RunRecord }
  from "./lab.js";
import { SUBSTRATES, itemColour, itemName, itemNote, type Drop }
  from "./items.js";
import { BUILD, VERSION } from "./version.js";

export type Wrap = (text: string, max: number) => string[];

/** Title screen: the column as a backdrop, one card per culture. */
export function drawSplash(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  ins: Insets, u: number, slotBoxes: Box[],
  lab: Lab | null = null,
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
      // An EMPTY slot says it is empty. It used to preview a name from the
      // pool -- "new culture  K-12" -- which reads as a save that already
      // exists and belongs to someone else. A blank slot has no strain, no
      // designation, and nothing about it to explain.
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      ctx.font = `${13 * u}px ui-monospace,monospace`;
      ctx.fillText("empty", box.x + 14 * u, box.y + 30 * u);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.font = `${10 * u}px ui-monospace,monospace`;
      ctx.fillText("tap to inoculate a new culture",
                   box.x + 14 * u, box.y + 47 * u);
    }
  }

  ctx.textAlign = "center";
  // The record, where it belongs: the first thing you see, every time.
  if (lab !== null && lab.ledger.length > 0) {
    ctx.fillStyle = "#cfe04a";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText(describeLab(lab), W / 2, H - ins.bottom - 38 * u);
  }
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
    // F, not D: `run.deepest` is a FLOOR (1..24) and everything else in the
    // game prints floors as F. "D24" is not a stratum that exists.
    `deepest F${String(run.deepest)} · ${String(run.deaths)} lysis events`, W);

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

/** One tappable row in the research screen. */
export interface ResearchRow {
  readonly box: Box;
  readonly kind: "evolve" | "attach" | "expand" | "trait";
  readonly gene: GeneId;
  readonly mod?: ModifierId;
  readonly trait?: TraitId;
  readonly cost: number;
  readonly afford: boolean;
}

/**
 * Directed evolution.
 *
 * ATP is otherwise only ever spent passively, on upkeep. This is the one place
 * it becomes a decision: bank it against a deeper stratum, or convert it into
 * a permanently better enzyme now. Cost rises steeply with level so the answer
 * is never simply "always evolve".
 */
export function drawResearch(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  ins: Insets, u: number,
  genes: readonly { id: GeneId; level: number; mods: readonly ModifierId[] }[],
  held: readonly ModifierId[],
  atp: number,
  selected: GeneId | null,
  rows: ResearchRow[],
  strain: number,
  slots: number,
  capKb: number,
  traits: ReadonlySet<TraitId>,
): Box {
  ctx.fillStyle = "rgba(4,7,6,0.97)";
  ctx.fillRect(0, 0, W, H);
  rows.length = 0;

  let y = drawHeader(ctx, ins, u, "THE BENCH",
    `${String(Math.floor(atp))} ATP · ${String(held.length)} modifiers held · `
    + describeLevel(strain), W);

  // The chromosome itself: how big it is, and what it costs to grow.
  const wideTop = W - ins.left - ins.right - 28 * u;
  const grow = expansionCost(slots);
  ctx.fillStyle = "#8fa89a";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`chromosome — ${String(slots)} cassette sites, `
    + `${capKb.toFixed(1)} kb`, ins.left + 14 * u, y);
  y += 14 * u;

  {
    const box: Box = { x: ins.left + 14 * u, y, w: wideTop, h: 30 * u };
    const can = Number.isFinite(grow) && atp >= grow;
    rows.push({ box, kind: "expand", gene: "ori", cost: Number.isFinite(grow) ? grow : 0,
                afford: can });
    ctx.fillStyle = "rgba(16,22,18,0.9)";
    ctx.strokeStyle = can ? "rgba(207,224,74,0.65)" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = Math.max(1.2 * u, 1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 5 * u);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = can ? "#ffffff" : "#7f8f87";
    ctx.font = `${10.5 * u}px ui-monospace,monospace`;
    ctx.fillText("integrate another cassette site", box.x + 9 * u, box.y + 13 * u);
    ctx.fillStyle = "#6f8f7c";
    ctx.font = `${8 * u}px ui-monospace,monospace`;
    ctx.fillText(ellipsise(ctx, "an integron captures one more; every kilobase is copied for ever",
                           box.w - 18 * u),
                 box.x + 9 * u, box.y + 24 * u);
    ctx.textAlign = "right";
    ctx.fillStyle = can ? "#cfe04a" : "#6f8f7c";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText(Number.isFinite(grow) ? `${String(grow)} ATP` : "maxed",
                 box.x + box.w - 9 * u, box.y + 19 * u);
    ctx.textAlign = "left";
    y += 34 * u;
  }

  // Architecture, once each and kept.
  const cw = Math.max((wideTop - 6 * u * 2) / 3, 60);
  TRAIT_IDS.forEach((id, i2) => {
    const tr = TRAITS[id];
    const c = i2 % 3, rr = Math.floor(i2 / 3);
    const bx = ins.left + 14 * u + c * (cw + 6 * u);
    const by = y + rr * 38 * u;
    const have = traits.has(id);
    rows.push({ box: { x: bx, y: by, w: cw, h: 34 * u }, kind: "trait",
                gene: "ori", trait: id, cost: tr.cost,
                afford: !have && atp >= tr.cost });
    ctx.fillStyle = have ? "rgba(90,200,140,0.28)" : "rgba(16,22,18,0.9)";
    ctx.strokeStyle = have ? "#5ec98a"
      : atp >= tr.cost ? "rgba(207,224,74,0.6)" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = Math.max(1.2 * u, 1);
    ctx.beginPath();
    ctx.roundRect(bx, by, cw, 34 * u, 5 * u);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `${9 * u}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.fillText(ellipsise(ctx, tr.name, cw - 8 * u), bx + cw / 2, by + 12 * u);
    ctx.fillStyle = have ? "#7fe0a4" : "#8fa89a";
    ctx.font = `${7 * u}px ui-monospace,monospace`;
    ctx.fillText(ellipsise(ctx, tr.rule, cw - 8 * u), bx + cw / 2, by + 22 * u);
    ctx.fillStyle = have ? "#5ec98a" : "#6f8f7c";
    ctx.fillText(have ? "acquired" : `${String(tr.cost)} ATP`,
                 bx + cw / 2, by + 30 * u);
  });
  y += Math.ceil(TRAIT_IDS.length / 3) * 38 * u + 10 * u;
  ctx.textAlign = "left";

  if (genes.length === 0) {
    ctx.fillStyle = "#6f8f7c";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText("No genes on the ring to work on.", ins.left + 14 * u, y);
    return drawClose(ctx, W, ins, u);
  }

  const left = ins.left + 14 * u;
  const wide = W - ins.left - ins.right - 28 * u;
  const rowH = 46 * u;
  const floor = H - ins.bottom - 40 * u;

  for (const g of genes) {
    if (y + rowH > floor) break;
    const cost = evolutionCost(g.level, g.id);
    const afford = Number.isFinite(cost) && atp >= cost;
    const capped = g.level >= MAX_LEVEL;
    const box: Box = { x: left, y, w: wide, h: rowH - 6 * u };
    rows.push({ box, kind: "evolve", gene: g.id, cost, afford: afford && !capped });

    const on = selected === g.id;
    ctx.fillStyle = on ? "rgba(30,52,40,0.95)" : "rgba(16,22,18,0.85)";
    ctx.strokeStyle = capped ? "#7fe0a4" : afford ? "#cfe04a" : "rgba(255,255,255,0.16)";
    ctx.lineWidth = Math.max(1.4 * u, 1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 6 * u);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.fillText(`${GENES[g.id].name}  L${String(g.level)}`, box.x + 10 * u, box.y + 18 * u);

    // Level pips, so progress is visible without reading a number.
    for (let i = 0; i < MAX_LEVEL; i++) {
      ctx.fillStyle = i < g.level ? "#cfe04a" : "rgba(255,255,255,0.18)";
      ctx.fillRect(box.x + 10 * u + i * 9 * u, box.y + 24 * u, 6 * u, 4 * u);
    }

    ctx.fillStyle = "#8fa89a";
    ctx.font = `${9.5 * u}px ui-monospace,monospace`;
    const slots = modifierSlots(g.level);
    ctx.fillText(`${String(g.mods.length)}/${String(slots)} modifier slots`,
                 box.x + 10 * u, box.y + 38 * u);

    ctx.textAlign = "right";
    ctx.fillStyle = capped ? "#7fe0a4" : afford ? "#cfe04a" : "#6f8f7c";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText(capped ? "maxed" : `${String(cost)} ATP`,
                 box.x + box.w - 10 * u, box.y + 22 * u);
    if (!capped) {
      ctx.fillStyle = "#6f8f7c";
      ctx.font = `${9 * u}px ui-monospace,monospace`;
      ctx.fillText(`x${levelMultiplier(g.level + 1).toFixed(2)} efficacy`,
                   box.x + box.w - 10 * u, box.y + 36 * u);
    }
    y += rowH;
  }

  // Held modifiers, attachable to whatever is selected.
  const target = genes.find((g) => g.id === selected);
  if (held.length > 0 && y + 40 * u < floor) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText(target
      ? `attach to ${GENES[target.id].name}:`
      : "tap a gene above, then a modifier:", left, y + 12 * u);
    y += 22 * u;

    const cell = Math.max((wide - 18 * u) / 3, 60);
    held.forEach((mod, i) => {
      const c = i % 3, r = Math.floor(i / 3);
      const bx = left + c * (cell + 6 * u);
      const by = y + r * (30 * u);
      if (by + 26 * u > floor) return;
      const room = target !== undefined
        && !target.mods.includes(mod)
        && target.mods.length < modifierSlots(target.level);
      rows.push({ box: { x: bx, y: by, w: cell, h: 26 * u },
                  kind: "attach", gene: target?.id ?? "ori", mod, cost: 0, afford: room });

      ctx.fillStyle = room ? RARITY[MODIFIERS[mod].rarity].colour : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.roundRect(bx, by, cell, 26 * u, 5 * u);
      ctx.fill();
      ctx.fillStyle = room ? "#0f1512" : "rgba(255,255,255,0.4)";
      ctx.font = `${9 * u}px ui-monospace,monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(MODIFIERS[mod].name, bx + cell / 2, by + 13 * u);
    });
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#6f8f7c";
  ctx.font = `${9.5 * u}px ui-monospace,monospace`;
  ctx.fillText("evolution is permanent · cost rises steeply with level",
               W / 2, H - ins.bottom - 16 * u);
  return drawClose(ctx, W, ins, u);
}


/**
 * An opened lysate, as a container with slots.
 *
 * Self-contained: it needs the drop and the geometry and nothing else from the
 * game, which is why it could move out of main.ts without ceremony.
 */
export function drawContainer(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  ins: Insets, u: number, d: Drop, boxes: Box[], wrap: Wrap,
): void {
                    
    ctx.fillStyle = "rgba(4,7,6,0.86)";
    ctx.fillRect(0, 0, W, H);

    const cols = 4;
    const cell = Math.max(Math.min((W - ins.left - ins.right - 60 * u) / cols, 74 * u), 52);
    const gap = 10 * u;
    const rows = Math.ceil(d.items.length / cols);
    const panelW = cols * cell + (cols - 1) * gap + 28 * u;
    const panelH = rows * (cell + gap) + 96 * u;
    const px0 = (W - panelW) / 2;
    const py0 = (H - panelH) / 2;

    ctx.fillStyle = "rgba(14,22,18,0.97)";
    ctx.strokeStyle = "#5ec98a";
    ctx.lineWidth = Math.max(1.6 * u, 1.5);
    ctx.beginPath();
    ctx.roundRect(px0, py0, panelW, panelH, 10 * u);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${13 * u}px ui-monospace,monospace`;
    ctx.fillText("LYSATE", px0 + 14 * u, py0 + 26 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText("tap to take · tap outside to leave it", px0 + 14 * u, py0 + 42 * u);

    boxes.length = 0;
    d.items.forEach((it, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const bx = px0 + 14 * u + c * (cell + gap);
      const by = py0 + 58 * u + r * (cell + gap);
      boxes.push({ x: bx, y: by, w: cell, h: cell });

      ctx.fillStyle = itemColour(it);
      ctx.beginPath();
      ctx.roundRect(bx, by, cell, cell, cell * 0.2);
      ctx.fill();
      ctx.fillStyle = "#0f1512";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Fitted to the tile. Allele names run to "psbA of fast folding" now, and
      // a fixed size overflowed the tile and printed across its neighbours.
      fitInto(ctx, itemName(it), cell - 6 * u, Math.max(cell * 0.19, 9), 6);
      ctx.fillText(itemName(it), bx + cell / 2, by + cell / 2 - cell * 0.06);
      ctx.font = `${Math.max(cell * 0.14, 7)}px ui-monospace,monospace`;
      ctx.fillText(
        it.kind === "cassette" ? "cassette"
          : it.kind === "substrate" ? SUBSTRATES[it.id].formula
          : `${RARITY[it.rarity].name} ${it.kind}`,
                   bx + cell / 2, by + cell / 2 + cell * 0.16);
    });

    const first = d.items[0];
    if (first) {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#8fa89a";
      ctx.font = `${9.5 * u}px ui-monospace,monospace`;
      const y = py0 + panelH - 22 * u;
      wrap(itemNote(first), panelW - 28 * u).slice(0, 2)
        .forEach((l, i) => { ctx.fillText(l, px0 + 14 * u, y + i * 12 * u); });
    }
}

export interface ShopRow { readonly box: Box; readonly offer: Offer }

/**
 * Shrink a font until the text fits, down to a floor.
 *
 * Returns having SET ctx.font. Sizing text to a tile by guessing a point size
 * works until the strings get longer, and allele names made every tile label
 * overflow onto its neighbours.
 */
function fitInto(
  ctx: CanvasRenderingContext2D, text: string, max: number,
  start: number, min: number,
): void {
  let size = start;
  for (let i = 0; i < 12; i++) {
    ctx.font = `${size}px ui-monospace,monospace`;
    if (ctx.measureText(text).width <= max || size <= min) return;
    size = Math.max(size * 0.9, min);
  }
}

/** Trim to a measured width, with a real ellipsis. */
export function ellipsise(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (max <= 0) return "";
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}\u2026`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}\u2026`;
}

/**
 * The morgue and the order form, on one screen.
 *
 * Shown when a strain dies. It has to do two jobs at once: give the run an
 * ending you can read, and immediately show what that run bought -- because
 * the moment after a death is exactly when "what do I get for that" is the
 * only question the player has.
 */
export function drawLab(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  ins: Insets, u: number,
  lab: Lab, last: RunRecord | null, seen: readonly GeneId[],
  rows: ShopRow[], wrap: Wrap, toastBand = 0,
  // Named `scrollTop`, not `scroll`: a bare `scroll` shadows the global
  // function of that name and resolves to it instead.
  scrollTop = 0,
): { close: Box; maxScroll: number } {
  ctx.fillStyle = "rgba(4,7,6,0.98)";
  ctx.fillRect(0, 0, W, H);
  rows.length = 0;

  // Toasts overlay from the top inset down, and the obituary is the one thing
  // on this screen that must be readable. Start below them.
  const below: Insets = { ...ins, top: ins.top + toastBand * u };
  let y = drawHeader(ctx, below, u,
    last === null ? "THE LAB" : last.won ? "THE COLUMN IS YOURS" : "STRAIN LOST",
    describeLab(lab), W);

  const left = ins.left + 14 * u;
  const wide = W - ins.left - ins.right - 28 * u;

  // The obituary.
  if (last !== null) {
    ctx.fillStyle = last.won ? "#7fe0a4" : "#e0a37a";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    for (const line of wrap(
      `Strain ${String(last.n)} reached F${String(last.floor)}, the `
      + `${last.stratum}, in ${String(last.turns)} turns. `
      + `${String(last.catalogued)} organisms recorded. `
      + (last.won ? "It got to the bottom." : `Killed by ${last.killedBy}.`),
      wide)) {
      ctx.fillText(line, left, y);
      y += 15 * u;
    }
    ctx.fillStyle = "#cfe04a";
    ctx.fillText(`+${String(last.credit)} synthesis credit`, left, y + 4 * u);
    y += 22 * u;

    // What actually happened at the end. "Killed by an affliction" is a report
    // you cannot act on; the last few events are.
    if (last.epitaph.length > 0) {
      ctx.fillStyle = "#6f8f7c";
      ctx.font = `${8.5 * u}px ui-monospace,monospace`;
      for (const line of last.epitaph.slice(-4)) {
        ctx.fillText(ellipsise(ctx, line, wide), left, y);
        y += 11 * u;
      }
      y += 8 * u;
    }
  }

  // The order form.
  ctx.fillStyle = "#8fa89a";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText("order constructs for the next strain:", left, y);
  y += 16 * u;

  const rowH = 34 * u;
  const floor = H - ins.bottom - 52 * u;

  // Scrolled, not truncated. With 69 genes the form runs to 72 rows and only
  // about 15 fit -- so most of what a run earned credit for was unreachable.
  const list = offers(lab, seen);
  const listTop = y;
  const visible = Math.max(Math.floor((floor - listTop) / rowH), 1);
  const maxScroll = Math.max(list.length - visible, 0);
  // Finiteness first: Math.round(NaN) is NaN and survives min/max, which
  // would slice(NaN, NaN) and render an empty form.
  const want = Number.isFinite(scrollTop) ? Math.round(scrollTop) : 0;
  const from = Math.min(Math.max(want, 0), maxScroll);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, listTop - 4 * u, W, floor - listTop + 4 * u);
  ctx.clip();
  y -= 0;
  for (const offer of list.slice(from, from + visible + 1)) {
    if (y + rowH > floor + rowH) break;
    const box: Box = { x: left, y, w: wide, h: rowH - 5 * u };
    const afford = !offer.owned && lab.credit >= offer.price;
    rows.push({ box, offer });

    ctx.fillStyle = offer.owned ? "rgba(90,200,140,0.16)" : "rgba(16,22,18,0.9)";
    ctx.strokeStyle = offer.owned ? "#5ec98a"
      : afford ? "rgba(207,224,74,0.65)" : "rgba(255,255,255,0.13)";
    ctx.lineWidth = Math.max(1.2 * u, 1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 5 * u);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = offer.owned ? "#7fe0a4" : afford ? "#ffffff" : "#7f8f87";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText(offer.name, box.x + 9 * u, box.y + 14 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${8.5 * u}px ui-monospace,monospace`;
    // Measured, not counted. A fixed character cut ended "from turn one" as
    // "from tu" -- a truncation that looks like a bug rather than an ellipsis.
    ctx.fillText(ellipsise(ctx, offer.note, box.w - 70 * u),
                 box.x + 9 * u, box.y + 25 * u);

    ctx.textAlign = "right";
    ctx.fillStyle = offer.owned ? "#5ec98a" : afford ? "#cfe04a" : "#6f8f7c";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText(offer.owned ? "ordered" : String(offer.price),
                 box.x + box.w - 9 * u, box.y + 19 * u);
    y += rowH;
  }

  ctx.restore();

  // A scrollbar, so it is obvious there is more.
  if (maxScroll > 0) {
    const trackH = floor - listTop;
    const knobH = Math.max(trackH * (visible / list.length), 18 * u);
    const t = maxScroll === 0 ? 0 : from / maxScroll;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(W - ins.right - 6 * u, listTop, 3 * u, trackH);
    ctx.fillStyle = "rgba(207,224,74,0.65)";
    ctx.fillRect(W - ins.right - 6 * u, listTop + (trackH - knobH) * t, 3 * u, knobH);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#6f8f7c";
  ctx.font = `${9.5 * u}px ui-monospace,monospace`;
  ctx.fillText(maxScroll > 0
    ? `drag to see all ${String(list.length)} · close to send the next strain down`
    : "close to send the next strain down", W / 2, H - ins.bottom - 18 * u);
  return { close: drawClose(ctx, W, ins, u), maxScroll };
}

/**
 * Confirm an order.
 *
 * Modal over the lab. The shop is a scrolling list on a phone and an order was
 * a single tap, so a scroll that ended on a row bought whatever it landed on
 * -- with credit that takes several runs to earn and no way to undo it.
 *
 * The cost is repeated here, and so is what is left afterwards: the number
 * that matters at the moment of spending is not the price but the balance you
 * are about to have.
 */
export function drawConfirm(
  ctx: CanvasRenderingContext2D, W: number, H: number, u: number,
  name: string, cost: number, credit: number,
): { yes: Box; no: Box } {
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, W, H);

  const w = Math.min(W - 48 * u, 340 * u);
  const h = 152 * u;
  const x = (W - w) / 2, y = (H - h) / 2;

  ctx.fillStyle = "#0e1411";
  ctx.strokeStyle = "rgba(200,230,210,0.35)";
  ctx.lineWidth = Math.max(1.4 * u, 1.2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10 * u);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `${13 * u}px ui-monospace,monospace`;
  ctx.fillText("order this?", x + w / 2, y + 28 * u);

  ctx.fillStyle = "#cfe04a";
  ctx.font = `${12 * u}px ui-monospace,monospace`;
  ctx.fillText(name, x + w / 2, y + 52 * u);

  const short = cost > credit;
  ctx.fillStyle = short ? "#e08a5a" : "#8fa89a";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText(short
    ? `${String(cost)} credit \u2014 you have ${String(credit)}`
    : `${String(cost)} credit, leaving ${String(credit - cost)}`,
    x + w / 2, y + 74 * u);

  const bw = (w - 44 * u) / 2, bh = 38 * u, by = y + h - bh - 16 * u;
  const no: Box = { x: x + 16 * u, y: by, w: bw, h: bh };
  const yes: Box = { x: x + w - bw - 16 * u, y: by, w: bw, h: bh };

  for (const [box, label, colour] of [
    [no, "cancel", "rgba(255,255,255,0.5)"],
    [yes, short ? "not enough" : "order", short ? "rgba(255,255,255,0.25)" : "#7fe0a4"],
  ] as [Box, string, string][]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.3 * u, 1.1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7 * u);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2 + 4 * u);
  }
  return { yes, no };
}
