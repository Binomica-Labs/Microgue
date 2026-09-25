// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Drawing the bench tree. Layout lives in bench_tree.ts; this only paints.

import { layout, type TreeLayout } from "./bench_tree.js";
import { GENES, type GeneId } from "./biology.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";
import { MAX_LEVEL, evolutionCost, levelMultiplier } from "./parts.js";
import { shade } from "./relief.js";
import type { Box, Insets } from "./chrome.js";

export interface TreeRow { box: Box; gene: GeneId; cost: number; afford: boolean }

export interface BenchTreeResult {
  readonly layout: TreeLayout;
  readonly rows: TreeRow[];
}

/**
 * Paint the tree.
 *
 * Order matters: trunk, then branches, then nodes, so a limb never draws
 * over the thing it connects to.
 */
export function drawTree(
  ctx: CanvasRenderingContext2D, W: number, H: number, ins: Insets, u: number,
  genes: readonly { id: GeneId; level: number }[],
  atp: number, selected: GeneId | null, now: number,
): BenchTreeResult {
  const top = ins.top + 96 * u;
  const l = layout(genes, W, H - top, u);
  const rows: TreeRow[] = [];
  const shift = top;

  // The trunk: the chromosome everything is anchored to.
  //
  // SAVED, because `lineCap` is global canvas state and leaving it on
  // "round" leaked into every later screen in the frame. The plasmid ring
  // draws its wedges as thick stroked arcs, so round caps turned each one
  // into a blob -- and a short unused-slot arc became a CIRCLE. Those were
  // the "grey circles floating around the plasmid" I wrongly blamed on the
  // world showing through the backdrop last release.
  ctx.save();
  ctx.strokeStyle = "#3a4a40";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(11 * u, 5);
  ctx.beginPath();
  ctx.moveTo(l.rootX, l.rootY + shift);
  ctx.lineTo(l.rootX, l.forkY + shift);
  ctx.stroke();

  // Branches, thickening with the levels they carry -- a specialised strain
  // LOOKS specialised, which a list of rows can never show.
  for (const b of l.branches) {
    const tint = PATHWAY_COLOUR[b.pathway];
    ctx.strokeStyle = shade(tint, -0.35);
    ctx.lineWidth = Math.max(b.thickness, 2);
    ctx.beginPath();
    ctx.moveTo(l.rootX, l.forkY + shift);
    ctx.lineTo(b.tipX, b.tipY + shift);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const nd of l.nodes) {
    const tint = PATHWAY_COLOUR[nd.pathway];
    const capped = nd.level >= MAX_LEVEL;
    const cost = evolutionCost(nd.level, nd.id);
    const afford = Number.isFinite(cost) && atp >= cost && !capped;
    const on = selected === nd.id;
    const cy = nd.y + shift;
    rows.push({ box: { x: nd.x - nd.r * 1.6, y: cy - nd.r * 1.6,
                       w: nd.r * 3.2, h: nd.r * 3.2 },
                gene: nd.id, cost, afford });

    // An affordable node pulses. This is the whole point of the screen --
    // what can I buy right now -- and on a tree it can be seen at a glance
    // instead of read row by row.
    if (afford) {
      const pulse = 0.22 + 0.12 * Math.sin(now / 320 + nd.x);
      ctx.fillStyle = tint;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(nd.x, cy, nd.r * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = capped ? tint : shade(tint, -0.55);
    ctx.beginPath();
    ctx.arc(nd.x, cy, nd.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = on ? "#ffffff" : capped ? "#ffffff" : tint;
    ctx.lineWidth = Math.max((on ? 2.6 : 1.6) * u, 1.2);
    ctx.stroke();

    // A ring arc for how far up the ladder this gene is: level without a
    // number, readable while the eye is moving.
    if (!capped) {
      ctx.strokeStyle = tint;
      ctx.lineWidth = Math.max(2.4 * u, 1.6);
      ctx.beginPath();
      ctx.arc(nd.x, cy, nd.r + 3 * u, -Math.PI / 2,
              -Math.PI / 2 + (nd.level / MAX_LEVEL) * Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.max(8.5 * u, 7)}px ui-monospace,monospace`;
    ctx.fillText(GENES[nd.id].name, nd.x, cy + nd.r + 12 * u);
  }

  // The selected gene's detail, in the space the trunk leaves at the bottom.
  const pick = l.nodes.find((n) => n.id === selected);
  if (pick) {
    const cost = evolutionCost(pick.level, pick.id);
    const capped = pick.level >= MAX_LEVEL;
    const afford = Number.isFinite(cost) && atp >= cost && !capped;
    const tint = PATHWAY_COLOUR[pick.pathway];
    const by = l.rootY + shift - 34 * u;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.fillText(`${GENES[pick.id].name}  L${String(pick.level)}`, W / 2, by);
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    if (capped) {
      ctx.fillStyle = tint;
      ctx.fillText("maxed", W / 2, by + 15 * u);
    } else {
      ctx.fillStyle = afford ? tint : "#6f8f7c";
      ctx.fillText(
        `${String(cost)} ATP   x${levelMultiplier(pick.level).toFixed(2)}`
        + ` \u2192 x${levelMultiplier(pick.level + 1).toFixed(2)}`,
        W / 2, by + 15 * u);
      if (!afford) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = `${9 * u}px ui-monospace,monospace`;
        ctx.fillText(`${String(Math.max(Math.ceil(cost - atp), 0))} ATP short`,
                     W / 2, by + 28 * u);
      }
    }
  }
  ctx.textAlign = "left";
  ctx.restore();
  return { layout: l, rows };
}
