// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The furniture.
//
// The stations were FLOOR TILES with no drawing, so the room rendered as a
// white space with grey walls and nothing in it -- benches you were told about
// in the log and could not see. A room you are asked to walk around needs
// things in it to walk around.
//
// Drawn under the player and over the floor, in the same tile space as
// everything else, so a bench is where the tile says it is.

import { STATION_NOTE, type StationId } from "./lab_level.js";
import type { Game } from "./main.js";

/** Bench top, its shadow, and what sits on it. */
const TOP = "#d8dedb";
const EDGE = "#a8b3ae";
const SHADOW = "rgba(20,40,34,0.10)";

interface Kit { readonly label: string; readonly colour: string }

const KIT: Readonly<Record<StationId, Kit>> = {
  culture: { label: "cultures", colour: "#7fc98f" },
  sequencer: { label: "sequencer", colour: "#7fb6d8" },
  notes: { label: "notebook", colour: "#d8c07f" },
  incubator: { label: "column", colour: "#8fd8c0" },
};

/** One tile of bench, with a lip so a run of them reads as one surface. */
function slab(
  ctx: CanvasRenderingContext2D, x: number, y: number, px: number,
): void {
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x * px + px * 0.06, y * px + px * 0.14, px * 0.94, px * 0.92);
  ctx.fillStyle = TOP;
  ctx.fillRect(x * px, y * px, px, px * 0.92);
  ctx.fillStyle = EDGE;
  ctx.fillRect(x * px, y * px + px * 0.84, px, px * 0.10);
}

export function r_labFurniture(_g: Game, px: number): void {
  if (!_g.intro) return;
  const ctx = _g.ctx;

  for (const id of Object.keys(_g.introStations) as StationId[]) {
    const tiles = _g.introStations[id];
    if (tiles.length === 0) continue;
    for (const t of tiles) slab(ctx, t.x, t.y, px);

    // What is ON the bench: one mark per tile, in the station's colour, so
    // the four are told apart at a glance rather than by walking onto them.
    const kit = KIT[id];
    for (const [i, t] of tiles.entries()) {
      ctx.fillStyle = kit.colour;
      if (id === "incubator") {
        // The column itself: a tall stratified cylinder, not a rack.
        const w = px * 0.34, h = px * 0.78;
        ctx.fillStyle = "rgba(120,190,210,0.35)";
        ctx.fillRect(t.x * px + (px - w) / 2, t.y * px + px * 0.08, w, h);
        ctx.fillStyle = kit.colour;
        ctx.fillRect(t.x * px + (px - w) / 2, t.y * px + px * 0.08, w, h * 0.25);
      } else {
        // Racks, tubes, a stack of paper -- three small marks, offset per tile
        // so a four-tile bench is not four identical squares.
        for (let k = 0; k < 3; k++) {
          const ox = 0.18 + k * 0.26 + (i % 2) * 0.06;
          ctx.fillRect(t.x * px + px * ox, t.y * px + px * 0.24,
                       px * 0.13, px * 0.34);
        }
      }
    }

    // A label above the leftmost tile of the run, so you know what a bench is
    // before you walk to it.
    const lead = tiles.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
    ctx.fillStyle = "rgba(20,40,34,0.55)";
    ctx.font = `${Math.max(px * 0.30, 7)}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(kit.label, lead.x * px, lead.y * px - px * 0.16);
  }

  // Desks other people work at. Same slab, no kit: they are scenery, and
  // giving them marks would make them look interactive.
  for (const d of _g.introDesks) slab(ctx, d.x, d.y, px);
  void STATION_NOTE;
}
