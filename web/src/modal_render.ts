// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The full-screen modals drawn over a paused world: research and the field
// notebook.
//
// Split from render.ts at the ceiling. Each is a screen the player opens with a
// button and closes to return to the game; none of them animates or depends on
// the frame past the state it reads. `r_drawModals` returns true when it has
// taken the frame, so the caller stops.

import { stage, uiUnit } from "./chrome.js";
import { raisedCard, shade } from "./relief.js";
import { TRAITS, TRAIT_IDS, expansionCost } from "./chromosome.js";
import { ellipsise, type ResearchRow } from "./screens.js";
import { GENES } from "./biology.js";
import { MAX_LEVEL, evolutionCost, levelMultiplier } from "./parts.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";
import type { Web } from "./web_layout.js";
import type { Insets } from "./chrome.js";
import { buildWeb, drawWeb, fitWeb, webHit } from "./web_render.js";
import type { GeneId } from "./biology.js";
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

  // THE MAP. Every gene in the game, dim until held.
  //
  // The tree was built from what the player HAS, so a new strain got two
  // dots and a V -- and three releases of tuning could not fix that,
  // because the problem was never the proportions. An empty tree has
  // nothing to draw. A map of what EXISTS is full from the first second and
  // lighting a node is the reward.
  // Rebuilt only when the ring or the bin actually changes. The map is a
  // pure function of those two, and nothing else on this screen moves it.
  const rev = _g.genome.ringRev, binN = _g.genome.bin.length;
  if (_g.webCache?.rev !== rev || _g.webCache.bin !== binN) {
    const installed = new Map(genes.map((g) => [g.id, g.level]));
    const held = new Set(shelved.map((g) => g.id));
    _g.webCache = { rev, bin: binN, web: buildWeb(installed, held) };
  }
  const web = _g.webCache.web;
  const top = ins.top + 150 * u;
  const bottom = H - ins.bottom - 120 * u;
  _g.webView ??= fitWeb(W, bottom - top);
  const v = { ..._g.webView, cy: _g.webView.cy + top };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, W, bottom - top);
  ctx.clip();
  drawWeb(ctx, web, v, u, _g.webPick, _g.now);
  ctx.restore();
  _g.webHitAt = (px: number, py: number) => webHit(web, v, px, py, u);
  // THE CARD, and the purchase.
  //
  // Replacing the tree with the map dropped this entirely: `rows` was
  // stubbed to an empty array, so no gene on the bench was buyable at all.
  // A screen whose whole purpose is spending ATP shipped unable to spend
  // any.
  const t = { rows: drawPick(ctx, _g, W, H, ins, u, web) };
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

/**
 * The selected gene's card, with its evolve action.
 *
 * Anchored to the bottom inset like the report's, because that is the one
 * fixed thing on the screen -- and because three separate layout
 * collisions this week all came from measuring off something that moved.
 */
function drawPick(
  ctx: CanvasRenderingContext2D, _g: Game, W: number, H: number,
  ins: Insets, u: number, web: Web,
): { box: Box; gene: GeneId; cost: number; afford: boolean }[] {
  const pick = _g.webPick === null
    ? null : web.nodes.find((n) => n.id === _g.webPick);
  if (!pick) {
    ctx.fillStyle = "#6f8f7c";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.fillText("tap a gene \u00b7 drag to pan \u00b7 pinch to zoom",
                 W / 2, H - ins.bottom - 34 * u);
    ctx.textAlign = "left";
    return [];
  }
  const tint = PATHWAY_COLOUR[pick.pathway];
  const capped = pick.level >= MAX_LEVEL;
  const cost = evolutionCost(Math.max(pick.level, 1), pick.id);
  const owned = pick.installed;
  const afford = owned && !capped && Number.isFinite(cost)
    && _g.player.atp >= cost;

  const line = 15 * u;
  const cardH = 4 * line + 14 * u;
  const cardW = Math.min(W - 36 * u, 340 * u);
  const top = H - ins.bottom - 30 * u - cardH;
  const cx = W / 2;
  raisedCard(ctx, cx - cardW / 2, top, cardW, cardH, 6 * u, "#141c18", 2.5 * u);
  ctx.strokeStyle = afford ? tint : "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(afford ? 2 : 1.4, 1) * u;
  ctx.beginPath();
  ctx.roundRect(cx - cardW / 2, top, cardW, cardH, 6 * u);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y = top + 12 * u;
  ctx.fillStyle = shade(tint, 0.35);
  ctx.font = `${9 * u}px ui-monospace,monospace`;
  ctx.fillText(`${GENES[pick.id].product}  \u00b7  ${pick.pathway}`, cx, y);
  y += line;
  ctx.fillStyle = "#ffffff";
  ctx.font = `${12 * u}px ui-monospace,monospace`;
  ctx.fillText(owned ? `${GENES[pick.id].name}  L${String(pick.level)}`
    : GENES[pick.id].name, cx, y);
  y += line;
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  if (!owned) {
    // A gene you do not have cannot be bought here. Saying WHERE it comes
    // from is more use than greying out a button with no explanation.
    ctx.fillStyle = "#6f8f7c";
    ctx.fillText(pick.held ? "in the bin \u2014 install it to evolve it"
      : "not yet found \u2014 sequence one in the column", cx, y);
  } else if (capped) {
    ctx.fillStyle = tint;
    ctx.fillText("fully evolved", cx, y);
  } else {
    ctx.fillStyle = afford ? tint : "#6f8f7c";
    ctx.fillText(
      `${String(cost)} ATP   x${levelMultiplier(pick.level).toFixed(2)}`
      + ` \u2192 x${levelMultiplier(pick.level + 1).toFixed(2)}`, cx, y);
    if (!afford) {
      y += line;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `${9 * u}px ui-monospace,monospace`;
      ctx.fillText(
        `${String(Math.max(Math.ceil(cost - _g.player.atp), 0))} ATP short`,
        cx, y);
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // The whole card is the button when the purchase is possible. A separate
  // target inside a card the player already tapped to open is one tap too
  // many on a phone.
  return owned && !capped
    ? [{ box: { x: cx - cardW / 2, y: top, w: cardW, h: cardH },
         gene: pick.id, cost, afford }]
    : [];
}
