// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The full-screen modals drawn over a paused world: research and the field
// notebook.
//
// Split from render.ts at the ceiling. Each is a screen the player opens with a
// button and closes to return to the game; none of them animates or depends on
// the frame past the state it reads. `r_drawModals` returns true when it has
// taken the frame, so the caller stops.

import { stage, uiUnit } from "./chrome.js";
import { raisedCard } from "./relief.js";
import { TRAITS, TRAIT_IDS, expansionCost } from "./chromosome.js";
import { ellipsise, type ResearchRow } from "./screens.js";
import { drawTree } from "./bench_render.js";
import { drawClose, drawHeader, type Box } from "./chrome.js";
import { drawNotes, drawResearch } from "./screens.js";
import type { Game } from "./main.js";

export function r_drawModals(_g: Game, W: number, H: number): boolean {
  const ctx = _g.ctx;
  if (_g.showResearch) {
    const u = uiUnit(W, H);
    if (benchTree()) {
      // The tree. The list it replaced is kept whole in bench_list.ts --
      // set BENCH_MODE to "list" and it comes straight back.
      _g.closeBox = drawBenchTree(_g, ctx, W, H, u);
      _g.drawToasts(W, H);
      return true;
    }
    _g.closeBox = drawResearch(ctx, W, H, stage(W, _g.insets(), u), u,
      _g.genome.slots.flatMap((p) =>
        p?.kind === "gene" && p.id !== "ori"
          ? [{ id: p.id, level: p.level, mods: p.mods }] : []),
      _g.mods, _g.player.atp, _g.researchPick, _g.researchRows,
      _g.genome.strain, _g.genome.usableSlots,
      _g.genome.capacityKb(), _g.genome.traits);
    _g.drawToasts(W, H);
    return true;
  }
  if (_g.showNotes) {
    _g.closeBox = drawNotes(ctx, W, H, stage(W, _g.insets(), uiUnit(W, H)),
      uiUnit(W, H), _g.run,
      (t, w) => _g.wrap(t, w));
    _g.drawToasts(W, H);
    return true;
  }
  return false;
}

/**
 * The tree bench: header, then the tree.
 *
 * The chromosome and trait upgrades stay as a compact strip under the
 * header -- they are one-off purchases, not a ladder, and forcing them onto
 * a tree would be a shape that lied about what they are.
 */
function drawBenchTree(
  _g: Game, ctx: CanvasRenderingContext2D, W: number, H: number, u: number,
): Box {
  const ins = stage(W, _g.insets(), u);
  ctx.fillStyle = "rgba(4,7,6,0.97)";
  ctx.fillRect(0, 0, W, H);
  drawHeader(ctx, ins, u, "THE BENCH",
    `${String(Math.round(_g.player.atp))} ATP \u00b7 strain L${String(_g.genome.strain)}`
    + ` \u00b7 ${String(_g.genome.usableSlots)} sites`, W);

  // The chromosome and trait purchases, as a strip under the header. They
  // are one-off buys, not a ladder, and forcing them onto a tree would be a
  // shape that lied about what they are -- but they must still be HERE, or
  // the bench silently stops offering half of what it used to.
  const strip: ResearchRow[] = [];
  const sw = W - ins.left - ins.right - 28 * u;
  const growY = ins.top + 74 * u;
  const grow = expansionCost(_g.genome.integrated);
  const canGrow = Number.isFinite(grow) && _g.player.atp >= grow;
  const growBox: Box = { x: ins.left + 14 * u, y: growY, w: sw, h: 30 * u };
  strip.push({ box: growBox, kind: "expand", gene: "ori",
               cost: Number.isFinite(grow) ? grow : 0, afford: canGrow });
  raisedCard(ctx, growBox.x, growBox.y, growBox.w, growBox.h, 5 * u,
             "#141c18", 2 * u);
  ctx.strokeStyle = canGrow ? "#cfe04a" : "rgba(255,255,255,0.14)";
  ctx.lineWidth = Math.max(1.4 * u, 1);
  ctx.beginPath();
  ctx.roundRect(growBox.x, growBox.y, growBox.w, growBox.h, 5 * u);
  ctx.stroke();
  ctx.fillStyle = canGrow ? "#ffffff" : "#7f8f87";
  ctx.font = `${11 * u}px ui-monospace,monospace`;
  ctx.textBaseline = "middle";
  ctx.fillText("another cassette site", growBox.x + 10 * u,
               growBox.y + growBox.h / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = canGrow ? "#cfe04a" : "#6f8f7c";
  ctx.fillText(Number.isFinite(grow) ? `${String(grow)} ATP` : "maxed",
               growBox.x + growBox.w - 10 * u, growBox.y + growBox.h / 2);
  ctx.textAlign = "left";

  // Traits, as small pips beside it -- acquired ones lit, the rest dim.
  const tw = (sw - 16 * u) / TRAIT_IDS.length;
  TRAIT_IDS.forEach((id, i) => {
    const tr = TRAITS[id];
    const have = _g.genome.traits.has(id);
    const can = !have && _g.player.atp >= tr.cost;
    const bx = ins.left + 14 * u + i * (tw + 8 * u);
    const box: Box = { x: bx, y: growY + 36 * u, w: tw, h: 26 * u };
    strip.push({ box, kind: "trait", gene: "ori", trait: id, cost: tr.cost,
                 afford: can });
    raisedCard(ctx, box.x, box.y, box.w, box.h, 4 * u,
               have ? "#1c3a2a" : "#141c18", 2 * u);
    ctx.strokeStyle = have ? "#7fe0a4" : can ? "#cfe04a" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = Math.max(1.2 * u, 1);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 4 * u);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = have ? "#7fe0a4" : can ? "#ffffff" : "#6f8f7c";
    ctx.font = `${8.5 * u}px ui-monospace,monospace`;
    ctx.fillText(ellipsise(ctx, tr.name, tw - 6 * u), bx + tw / 2,
                 box.y + 11 * u);
    ctx.fillStyle = have ? "#5ec98a" : "#6f8f7c";
    ctx.font = `${8 * u}px ui-monospace,monospace`;
    ctx.fillText(have ? "acquired" : `${String(tr.cost)} ATP`,
                 bx + tw / 2, box.y + 20 * u);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const genes = _g.genome.slots.flatMap((p) =>
    p?.kind === "gene" && p.id !== "ori" ? [{ id: p.id, level: p.level }] : []);

  // ...plus LEVELLED genes sitting in the bin, as ghosts. Uninstalling
  // keeps a gene's levels (the Part carries them), but the tree was built
  // from ring slots only, so a branch vanished and nothing told the player
  // their ATP was still banked. Only levelled ones: an L1 spare is a spare,
  // not an investment, and drawing every bin gene would bury the signal.
  const shelved = _g.genome.bin.flatMap((p) =>
    p.kind === "gene" && p.id !== "ori" && p.level > 1
      ? [{ id: p.id, level: p.level, detached: true }] : []);
  const onTree = [...genes, ...shelved];

  if (onTree.length === 0) {
    ctx.fillStyle = "#6f8f7c";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText("No genes on the ring to work on.", ins.left + 14 * u,
                 ins.top + 160 * u);
    _g.researchRows = strip;
    return drawClose(ctx, W, ins, u);
  }

  const t = drawTree(ctx, W, H, ins, u, onTree, _g.player.atp,
                     _g.researchPick, _g.now);
  _g.researchRows = [...strip, ...t.rows.map((r) => ({
    box: r.box, kind: "evolve" as const, gene: r.gene,
    cost: r.cost, afford: r.afford,
  }))];
  ctx.fillStyle = "#6f8f7c";
  ctx.font = `${9 * u}px ui-monospace,monospace`;
  ctx.textAlign = "center";
  ctx.fillText("evolution is permanent \u00b7 cost rises steeply with level",
               W / 2, H - _g.insets().bottom - 14 * u);
  ctx.textAlign = "left";
  return drawClose(ctx, W, ins, u);
}

/**
 * Flip to false to restore the list in bench_list.ts.
 *
 * A two-valued union behind a function, not a boolean: an inferred `true`
 * narrows to always-truthy and the strict build calls the fallback dead
 * code, while an annotated `boolean` is "trivially inferred". The two rules
 * contradict each other for a literal flag. A union read through a call
 * satisfies both and keeps the fallback genuinely reachable.
 */
function benchTree(): boolean { return BENCH_MODE === "tree"; }

/** "tree" or "list". The list is kept whole in bench_list.ts. */
const BENCH_MODE: "tree" | "list" = "tree";
