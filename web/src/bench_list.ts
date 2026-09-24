// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// THE BENCH, as a list. The previous design, kept whole.
//
// Backed up verbatim before the tree replaced it, because a redesign is a
// bet and this one was working: affordability colours, level pips and the
// x1.22 -> x1.44 delta all landed in v1.55.0 and none of that was the
// problem. If the tree plays worse, `BENCH_TREE` flips back to this with
// one edit and nothing to rebuild from memory.

/**
 * Directed evolution.
 *
 * ATP is otherwise only ever spent passively, on upkeep. This is the one place
 * it becomes a decision: bank it against a deeper stratum, or convert it into
 * a permanently better enzyme now. Cost rises steeply with level so the answer
 * is never simply "always evolve".
 */
import { raisedCard } from "./relief.js";
import { drawClose, drawHeader, type Box, type Insets } from "./chrome.js";
import { MAX_LEVEL, MODIFIERS, RARITY, evolutionCost, levelMultiplier,
         modifierSlots, type ModifierId } from "./parts.js";
import { GENES, type GeneId } from "./biology.js";
import { TRAITS, TRAIT_IDS, expansionCost, type TraitId }
  from "./chromosome.js";
import { describeLevel } from "./strain.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";

import { ellipsise, type ResearchRow } from "./screens.js";

export function drawResearchList(
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
    raisedCard(ctx, box.x, box.y, box.w, box.h, 5 * u, "#141c18", 2.5 * u);
    if (can) {
      // The one upgrade you can always aim at gets a halo when it is in
      // reach, so the screen has an obvious first move.
      ctx.strokeStyle = "#cfe04a";
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = Math.max(5 * u, 2);
      ctx.beginPath();
      ctx.roundRect(box.x - 1.5 * u, box.y - 1.5 * u,
                    box.w + 3 * u, box.h + 3 * u, 6.5 * u);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.strokeStyle = can ? "#cfe04a" : "rgba(255,255,255,0.14)";
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
    const canBuy = !have && atp >= tr.cost;
    raisedCard(ctx, bx, by, cw, 34 * u, 5 * u,
               have ? "#1c3a2a" : "#141c18", 2 * u);
    ctx.strokeStyle = have ? "#7fe0a4"
      : canBuy ? "#cfe04a" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = Math.max((canBuy ? 1.8 : 1.2) * u, 1);
    ctx.beginPath();
    ctx.roundRect(bx, by, cw, 34 * u, 5 * u);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0)";
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
    // A raised card in the gene's own pathway colour, so the bench matches
    // the ring and the bin rather than being a third visual language.
    const tint = PATHWAY_COLOUR[GENES[g.id].pathway];
    raisedCard(ctx, box.x, box.y, box.w, box.h, 6 * u,
               on ? "#1e3428" : "#141c18", 2.5 * u);

    // Affordability is the PRIMARY signal. Every card used to carry the same
    // yellow outline whether you could buy it or not, so "what can I
    // actually do right now" took arithmetic. Affordable glows in the
    // pathway colour; unaffordable recedes and says how much short you are.
    ctx.strokeStyle = capped ? "#7fe0a4" : afford ? tint : "rgba(255,255,255,0.13)";
    ctx.lineWidth = Math.max((afford && !capped ? 2 : 1.3) * u, 1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 6 * u);
    ctx.stroke();
    if (afford && !capped) {
      ctx.strokeStyle = tint;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(5 * u, 2);
      ctx.beginPath();
      ctx.roundRect(box.x - 1.5 * u, box.y - 1.5 * u,
                    box.w + 3 * u, box.h + 3 * u, 7.5 * u);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.fillText(`${GENES[g.id].name}  L${String(g.level)}`, box.x + 10 * u, box.y + 18 * u);

    // Level pips. The one you are about to buy is outlined rather than
    // filled -- a visible "this is the next one", which is what makes a
    // ladder pull instead of just recording where you are.
    for (let i = 0; i < MAX_LEVEL; i++) {
      const px = box.x + 10 * u + i * 10 * u, py = box.y + 23 * u;
      const pw = 7 * u, ph = 5 * u;
      if (i < g.level) {
        ctx.fillStyle = tint;
        ctx.fillRect(px, py, pw, ph);
      } else if (i === g.level && !capped) {
        ctx.strokeStyle = afford ? tint : "rgba(255,255,255,0.3)";
        ctx.lineWidth = Math.max(1.2 * u, 1);
        ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.13)";
        ctx.fillRect(px, py, pw, ph);
      }
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
      // The DELTA, not the destination. "x1.22 efficacy" is a fact about a
      // level you have not bought; "x1.22 -> x1.31" is the thing you are
      // buying, and it is the whole reason to press the button.
      ctx.font = `${9 * u}px ui-monospace,monospace`;
      const now = levelMultiplier(g.level).toFixed(2);
      const next = levelMultiplier(g.level + 1).toFixed(2);
      ctx.fillStyle = "#6f8f7c";
      ctx.fillText(`x${now} \u2192 `, box.x + box.w - 10 * u - ctx.measureText(`x${next}`).width, box.y + 36 * u);
      ctx.fillStyle = afford ? tint : "#6f8f7c";
      ctx.fillText(`x${next}`, box.x + box.w - 10 * u, box.y + 36 * u);
    }
    // How far short, when you cannot afford it -- a target rather than a
    // flat refusal.
    if (!capped && !afford && Number.isFinite(cost)) {
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.font = `${8.5 * u}px ui-monospace,monospace`;
      ctx.textAlign = "left";
      ctx.fillText(`${String(Math.max(Math.ceil(cost - atp), 0))} ATP short`,
                   box.x + 10 * u + MAX_LEVEL * 10 * u + 8 * u, box.y + 28 * u);
      ctx.textAlign = "right";
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
