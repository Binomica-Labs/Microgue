// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The plasmid screen: the ring, the bin, and the notes under them.
//
// Split from render.ts to leave headroom under the 900-line ceiling. This is
// a whole screen with nothing in common with the world pass it used to sit
// beside -- it draws no tiles, no mobs and no effects, and it never runs on
// the same frame as them.

import { BIN_ROW, describe as describeSlot, drawBinList, drawItemCard, drawRing }
  from "./plasmid_ui.js";
import { drawClose, stage, uiUnit } from "./chrome.js";
import { BIN_CAP } from "./plasmid.js";
import { r_ringReadout } from "./ring_readout.js";
import { ringHole } from "./render.js";
import type { Game } from "./main.js";

export function r_drawPlasmid(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const u = uiUnit(W, H, _g.settings.uiScale);
    const ins = stage(W, _g.insets(), u);
    // OPAQUE. At 0.93 the world showed through at 7%: the HUD text and the
    // minimap frame were legible behind the ring, and world sprites read as
    // unexplained grey blobs floating around the plasmid. A modal that is
    // almost opaque is not atmospheric, it is noise the player has to learn
    // to ignore.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    // Landscape splits the screen: ring on the left, parts and notes on the
    // right. Stacked, the ring had to fit 46% of a 390px height, so it was
    // small, and the list under it ran off the bottom of the glass -- on a
    // landscape phone the second half of the parts bin was simply not there.
    const raw = _g.insets();
    const fullW = W - raw.left - raw.right;
    const side = fullW >= H * 1.25;
    const span = side ? Math.min(fullW, 860 * u) : 0;
    const x0 = raw.left + (fullW - span) / 2;
    const ringW = span * 0.44;
    // The right pane starts below the close button, which owns that corner.
    const paneX = x0 + ringW + 12 * u;
    const paneW = span - ringW - 12 * u;
    const avail = Math.min(W - ins.left - ins.right, H * 0.46);
    const sideR = Math.min(ringW, H - raw.top - raw.bottom - 24 * u) * 0.46;
    // Level with the top of the ring where there is height to spare, so the
    // two panes read as one screen rather than a list stuck in the corner.
    const paneTop = Math.max(ins.top + 70 * u, (raw.top + H - raw.bottom) / 2 - sideR);
    _g.ring = side ? {
      used: _g.genome.usableSlots,
      cx: x0 + ringW / 2,
      cy: (raw.top + H - raw.bottom) / 2,
      rOuter: Math.max(sideR, 1),
      rInner: ringHole(sideR, Math.max(sideR * 0.26, 30 * u)),
      rot: _g.ring.rot,
    } : {
      // The ring is the REPLICON's, not the array's. Drawing all 24 on a
      // 16-slot backbone put eight phantom wedges on screen that could be
      // tapped, selected and dropped into, and did nothing when you did.
      used: _g.genome.usableSlots,
      cx: W / 2,
      cy: ins.top + avail * 0.55 + 20 * u,
      rOuter: Math.max(avail * 0.42, 1),
      rInner: ringHole(avail * 0.42, Math.max(avail * 0.11, 30 * u)),
      rot: _g.ring.rot,
    };

    drawRing(ctx, _g.ring, _g.genome, {
      depth: _g.dungeon.depth,
      dragFrom: _g.dragFrom,
      dragXY: _g.dragXY, selected: _g.selected, u,
    });

    r_ringReadout(_g, u);

  // Parts bin: everything you hold but have not installed.
  const gap = 8 * u;
  // Bounded by the width it has, never by a floor: the list is full-width
  // ROWS now, and a 44px cell floor left over from the old tile grid pushed
  // the list off the right of anything under 320px.
  const cell = side
    ? Math.max((paneW - 7 * gap) / 6, 1)
    : Math.max(Math.min((W - ins.left - ins.right - 7 * gap) / 6, 62 * u), 1);
  _g.bin = {
    x: side ? paneX + gap : ins.left + gap,
    y: side ? paneTop : _g.ring.cy + _g.ring.rOuter + 16 * u,
    cell, gap, cols: 6,
  };
  // Where the notes under the list go, and how wide they may run.
  const textX = _g.bin.x;
  const textW = side ? paneW - 2 * gap : W - (ins.left + ins.right + 32 * u);
  ctx.fillStyle = "#8fa89a";
  ctx.font = `${11 * u}px ui-monospace,monospace`;

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`PARTS BIN  ${_g.genome.bin.length}/${BIN_CAP}`,
                 _g.bin.x, _g.bin.y - 6 * u);
    // Full rows, scrolled. The tile grid could not name a part: allele names
    // run to "psychrophilic mtrC of high copy" and a tile showed half of it.
    // The list gets the room the tile grid used, and no more: complexes and
    // hazards still have to fit under it.
    const binW = _g.bin.cell * _g.bin.cols + _g.bin.gap * (_g.bin.cols - 1);
    // Beside the ring the list has the pane's height to itself; leave room
    // for a few lines of notes under it rather than a fixed 152.
    const binCap = side ? Math.max(H - raw.bottom - paneTop - 110 * u, 3 * BIN_ROW * u)
                          : 4 * BIN_ROW * u;
    const binH = Math.min(_g.genome.bin.length * BIN_ROW * u, binCap);
    const list = drawBinList(ctx, { ..._g.bin, w: binW, h: binH },
                             _g.genome.bin, u, _g.dragBin, _g.binScroll,
                             _g.binRows);
    _g.binMaxScroll = list.maxScroll;
    // Deferred: the card belongs on top of everything else on this screen.
    const card = _g.card;

    // Active complexes and hazards, which is the payoff for arranging well.
    let cy = _g.bin.y + binH + 16 * u;
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    for (const c of _g.genome.complexes(_g.dungeon.depth)) {
      ctx.fillStyle = "#7fe0a4";
      ctx.fillText(`\u2713 ${c.name}`, _g.bin.x, cy);
      cy += 15 * u;
    }
    for (const h of _g.genome.hazards(_g.dungeon.depth)) {
      ctx.fillStyle = "#ff9a5a";
      ctx.fillText(`\u26A0 ${h.name}  -${h.dmg}/turn`, _g.bin.x, cy);
      cy += 15 * u;
    }

    // Detail panel for the tapped slot.
    const py = cy + 8 * u;
    const lines = _g.selected === null
      ? ["promoter → gene → terminator switches an operon on",
         "tap a part below to inspect it, then install or catabolise",
         "drag the list to scroll · drag outside the ring to spin it",
         // This line used to read "expression costs ATP; respiration pays
         // less the deeper you go", which told the player to be frugal
         // while the maths rewarded filling the ring. Now the maths has a
         // real tradeoff, the text can state it.
         "polymerase is finite: more genes means less of each"]
      : describeSlot(_g.genome, _g.selected, _g.dungeon.depth);
    ctx.textAlign = "left";
    // Shrink to the room that is actually left, and stop when there is none.
    // The screen stacks VERTICALLY while `u` scales off the SMALLER dimension,
    // so on a landscape phone or a desktop the footer ran off the bottom --
    // 1114px of content on a 1080px display.
    const bottom = H - ins.bottom - 6 * u;
    const wrapped: { text: string; head: boolean }[] = [];
    for (const [i, line] of lines.entries()) {
      for (const w of _g.wrap(line, textW)) {
        wrapped.push({ text: w, head: i === 0 });
      }
    }
    let lh = 17 * u;
    let fs = 11.5 * u;
    const need = wrapped.length * lh;
    const room = Math.max(bottom - py, 0);
    if (need > room && wrapped.length > 0) {
      const k = Math.max(room / need, 0.55);
      lh *= k;
      fs *= k;
    }
    ctx.font = `${fs}px ui-monospace,monospace`;
    wrapped.forEach((w, row) => {
      const y = py + row * lh;
      if (y > bottom) return;             // nothing is drawn past the edge
      ctx.fillStyle = w.head ? "#ffffff" : "#9fb8a8";
      ctx.fillText(w.text, textX, y);
    });

    // A real close target. "Tap outside" was ambiguous, and it was what let a
    // button press dismiss the screen in the same gesture that opened it.
    _g.closeBox = drawClose(ctx, W, ins, u);
    if (card) {
      const isOrigin = card.kind === "gene" && card.id === "ori";
      _g.cardBoxes = drawItemCard(ctx, W, H, u, card, _g.genome, _g.dungeon.depth,
                                  (s, max) => _g.wrap(s, max),
                                  _g.cardIndex >= 0 && !isOrigin,
                                  _g.cardIndex >= 0 && !isOrigin
                                    && _g.genome.free() > 0,
                                  _g.cardConfirm);
    }
  }
