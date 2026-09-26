// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Drawing the bench tree. Layout lives in bench_tree.ts; this only paints.

import { benchGeometry, layout, type TreeLayout } from "./bench_tree.js";
import { GENES, type GeneId } from "./biology.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";
import { MAX_LEVEL, evolutionCost, levelMultiplier } from "./parts.js";
import { raisedCard, shade } from "./relief.js";
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
  genes: readonly { id: GeneId; level: number; detached?: boolean }[],
  atp: number, selected: GeneId | null, now: number,
): BenchTreeResult {
  // The tree gets the space that is ACTUALLY free, which is neither the
  // whole screen nor what I assumed.
  //
  // `ins.top + 96u` put the tree's coordinate origin INSIDE the trait strip
  // (which runs to about ins.top + 136u), and the full height let a
  // two-gene tree stretch across 2000px with a void above it. A tree should
  // grow into its space, not be inflated to fill a box it was never given.
  const geo = benchGeometry(H, u, ins.top, ins.bottom, 4);
  const top = geo.treeTop;
  const l = layout(genes, W, geo.treeH, u);
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
    // A detached gene can NEVER be bought: `evolve` searches the ring, so a
    // purchase would take the ATP and refuse. Offering a button that cannot
    // work is worse than not showing one.
    const afford = Number.isFinite(cost) && atp >= cost && !capped
      && !nd.detached;
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

    if (nd.detached) {
      // HOLLOW, and dashed to its limb: this gene is in the bin, keeping
      // every level you bought for it. It is not working -- but it is not
      // lost either, and the tree now says so instead of silently dropping
      // a branch when you take a gene off the ring.
      ctx.setLineDash([3 * u, 3 * u]);
      ctx.strokeStyle = shade(tint, -0.1);
      ctx.lineWidth = Math.max(1.4 * u, 1);
      ctx.beginPath();
      ctx.arc(nd.x, cy, nd.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = capped ? tint : shade(tint, -0.55);
      ctx.beginPath();
      ctx.arc(nd.x, cy, nd.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = on ? "#ffffff" : capped ? "#ffffff" : tint;
      ctx.lineWidth = Math.max((on ? 2.6 : 1.6) * u, 1.2);
      ctx.stroke();
    }

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

    ctx.fillStyle = nd.detached ? "rgba(255,255,255,0.55)" : "#ffffff";
    ctx.font = `${Math.max(8.5 * u, 7)}px ui-monospace,monospace`;
    ctx.fillText(GENES[nd.id].name, nd.x, cy + nd.r + 12 * u);
    if (nd.detached) {
      ctx.fillStyle = shade(tint, 0.2);
      ctx.font = `${Math.max(7.5 * u, 6)}px ui-monospace,monospace`;
      ctx.fillText("in the bin", nd.x, cy + nd.r + 21 * u);
    }
  }

  // The selected gene's detail, in the space the trunk leaves at the bottom.
  //
  // A tree of coloured dots is abstract: it shows the SHAPE of a build and
  // says nothing about what any node is. Tapping one now opens a card --
  // what the gene does, which pathway it serves, what the next level buys
  // -- so the shape is the overview and the card is the detail, rather than
  // the shape being the whole interface.
  const pick = l.nodes.find((n) => n.id === selected);
  if (pick) {
    const cost = evolutionCost(pick.level, pick.id);
    const capped = pick.level >= MAX_LEVEL;
    const afford = Number.isFinite(cost) && atp >= cost && !capped
      && !pick.detached;
    const tint = PATHWAY_COLOUR[pick.pathway];

    // Laid out from the BOTTOM UP, against the footer.
    //
    // It was positioned off the trunk's root and sized by guesswork: the
    // card swallowed the footer line, and its two text rows sat 8u apart at
    // a 12u font so the product printed through the gene name. Anchoring to
    // the one fixed thing on the screen -- the footer -- and stacking rows
    // at a spacing derived from the font size is the difference between a
    // layout and a hope.
    const line = 15 * u;
    const rows = capped || pick.detached ? 3 : afford ? 3 : 4;
    const g2 = benchGeometry(H, u, ins.top, ins.bottom, rows);
    const cardH = g2.cardH;
    const cardW = Math.min(W - 36 * u, 340 * u);
    const top0 = g2.cardTop;
    const cx = W / 2;

    raisedCard(ctx, cx - cardW / 2, top0, cardW, cardH, 6 * u,
               "#141c18", 2.5 * u);
    ctx.strokeStyle = tint;
    ctx.lineWidth = Math.max(1.6 * u, 1);
    ctx.beginPath();
    ctx.roundRect(cx - cardW / 2, top0, cardW, cardH, 6 * u);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let y = top0 + 12 * u;

    // WHAT IT IS -- the one thing a coloured dot can never tell you.
    ctx.fillStyle = shade(tint, 0.35);
    ctx.font = `${9 * u}px ui-monospace,monospace`;
    ctx.fillText(`${GENES[pick.id].product}  \u00b7  ${pick.pathway}`, cx, y);
    y += line;

    ctx.fillStyle = "#ffffff";
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.fillText(`${GENES[pick.id].name}  L${String(pick.level)}`, cx, y);
    y += line;

    ctx.font = `${10 * u}px ui-monospace,monospace`;
    if (pick.detached) {
      ctx.fillStyle = shade(tint, 0.3);
      ctx.fillText("kept in the bin \u2014 install it to evolve it", cx, y);
    } else if (capped) {
      ctx.fillStyle = tint;
      ctx.fillText("maxed", cx, y);
    } else {
      ctx.fillStyle = afford ? tint : "#6f8f7c";
      ctx.fillText(
        `${String(cost)} ATP   x${levelMultiplier(pick.level).toFixed(2)}`
        + ` \u2192 x${levelMultiplier(pick.level + 1).toFixed(2)}`, cx, y);
      if (!afford) {
        y += line;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = `${9 * u}px ui-monospace,monospace`;
        ctx.fillText(`${String(Math.max(Math.ceil(cost - atp), 0))} ATP short`,
                     cx, y);
      }
    }
    ctx.textBaseline = "alphabetic";
  }
  ctx.textAlign = "left";
  ctx.restore();
  return { layout: l, rows };
}
