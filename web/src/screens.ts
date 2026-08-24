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
import { SUBSTRATES, itemColour, itemName, itemNote, type Drop }
  from "./items.js";
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

/** One tappable row in the research screen. */
export interface ResearchRow {
  readonly box: Box;
  readonly kind: "evolve" | "attach";
  readonly gene: GeneId;
  readonly mod?: ModifierId;
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
): Box {
  ctx.fillStyle = "rgba(4,7,6,0.97)";
  ctx.fillRect(0, 0, W, H);
  rows.length = 0;

  let y = drawHeader(ctx, ins, u, "DIRECTED EVOLUTION",
    `${String(Math.floor(atp))} ATP available · ${String(held.length)} modifiers held`);

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
      ctx.font = `${Math.max(cell * 0.19, 9)}px ui-monospace,monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
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
