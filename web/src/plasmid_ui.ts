// The plasmid screen: a ring you spin, with slots you drag parts between.
//
// Everything is hit-tested in polar coordinates, which is what makes a circular
// inventory workable with a thumb: slot index is just an angle, so the target
// is as large as the ring is wide.

import { GENES, type Pathway } from "./biology.js";
import { PROMOTER_POWER, SLOTS, type Part, type Plasmid } from "./plasmid.js";

export const PATHWAY_COLOUR: Readonly<Record<Pathway, string>> = {
  photo: "#5ec98a", carbon: "#8fd4c2", nitrogen: "#cfe04a", sulfur: "#e0c25a",
  iron: "#d0603c", methane: "#c9a55e", energy: "#9ec9e8", defense: "#c58ad0",
  core: "#e8e8e8",
};

export interface RingGeom {
  cx: number; cy: number; rInner: number; rOuter: number; rot: number;
}

/** Screen point -> slot index, or null if outside the ring. */
export function slotAt(g: RingGeom, x: number, y: number): number | null {
  const dx = x - g.cx, dy = y - g.cy;
  const d = Math.hypot(dx, dy);
  if (d < g.rInner || d > g.rOuter) return null;
  const a = Math.atan2(dy, dx) + Math.PI / 2 - g.rot;
  const t = ((a / (Math.PI * 2)) % 1 + 1) % 1;
  return Math.floor(t * SLOTS) % SLOTS;
}

export function slotCentre(g: RingGeom, i: number): { x: number; y: number } {
  const a = ((i + 0.5) / SLOTS) * Math.PI * 2 - Math.PI / 2 + g.rot;
  const r = (g.rInner + g.rOuter) / 2;
  return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r };
}

function partLabel(p: Part): string {
  if (p.kind === "gene") return GENES[p.id].name;
  if (p.kind === "promoter") return p.strength === "strong" ? "P+++"
    : p.strength === "medium" ? "P++" : "P+";
  return "term";
}

function partColour(p: Part): string {
  if (p.kind === "gene") return PATHWAY_COLOUR[GENES[p.id].pathway];
  if (p.kind === "promoter") return "#ffd166";
  return "#8a8f96";
}

export interface DrawOpts {
  readonly depth: number;
  readonly dragFrom: number | null;
  readonly dragXY: { x: number; y: number } | null;
  readonly selected: number | null;
  readonly u: number;
}

export function drawRing(
  ctx: CanvasRenderingContext2D, g: RingGeom, p: Plasmid, o: DrawOpts,
): void {
  const mid = (g.rInner + g.rOuter) / 2;
  const band = g.rOuter - g.rInner;
  const step = (Math.PI * 2) / SLOTS;

  // Operon arcs, drawn under the slots so a transcript reads as one sweep.
  for (const op of p.operons()) {
    if (op.genes.length === 0) continue;
    const a0 = (op.promoter / SLOTS) * Math.PI * 2 - Math.PI / 2 + g.rot;
    const a1 = a0 + (op.genes.length + 1) * step;
    ctx.strokeStyle = `rgba(255,209,102,${0.25 + 0.45 * PROMOTER_POWER[op.strength] / 1.2})`;
    ctx.lineWidth = band + 8 * o.u;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, mid, a0 + 0.01, a1 - 0.01);
    ctx.stroke();
  }

  for (let i = 0; i < SLOTS; i++) {
    const a0 = (i / SLOTS) * Math.PI * 2 - Math.PI / 2 + g.rot;
    const part = p.at(i);
    const dragging = o.dragFrom === i;

    ctx.strokeStyle = dragging ? "rgba(255,255,255,0.15)"
      : part ? partColour(part) : "rgba(255,255,255,0.1)";
    ctx.lineWidth = band;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, mid, a0 + 0.018, a0 + step - 0.018);
    ctx.stroke();

    if (part && !dragging) {
      const c = slotCentre(g, i);
      const e = part.kind === "gene" ? p.expression(part.id, o.depth) : 1;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(a0 + step / 2 + Math.PI / 2);
      ctx.font = `${9 * o.u}px ui-monospace,monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Dim an untranscribed gene, so a broken operon is visible at a glance.
      ctx.fillStyle = part.kind !== "gene" ? "#1a1a1a"
        : e > 0 ? "#141414" : "rgba(20,20,20,0.35)";
      ctx.fillText(partLabel(part), 0, 0);
      ctx.restore();
    }
    if (o.selected === i) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.rOuter + 3, a0 + 0.02, a0 + step - 0.02);
      ctx.stroke();
    }
  }

  // The part under the thumb rides above everything.
  if (o.dragFrom !== null && o.dragXY) {
    const part = p.at(o.dragFrom);
    if (part) {
      ctx.fillStyle = partColour(part);
      ctx.beginPath();
      ctx.arc(o.dragXY.x, o.dragXY.y, band * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#141414";
      ctx.font = `${10 * o.u}px ui-monospace,monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(partLabel(part), o.dragXY.x, o.dragXY.y);
    }
  }
}

/** One-line explanation of what a slot is doing, for the detail panel. */
export function describe(p: Plasmid, i: number, depth: number): string[] {
  const part = p.at(i);
  if (!part) return ["empty slot", "drag a part here"];
  if (part.kind === "terminator") return ["terminator", "ends the transcript"];
  if (part.kind === "promoter") {
    return [`${part.strength} promoter`,
            `transcribes downstream at x${PROMOTER_POWER[part.strength].toFixed(2)}`];
  }
  const g = GENES[part.id];
  const ctx = p.operonOf(part.id);
  const e = p.expression(part.id, depth);
  if (!ctx) return [`${g.name} — ${g.product}`, "NOT TRANSCRIBED: no promoter upstream"];
  const sameCount = ctx.operon.genes.filter(
    (x) => x.id !== part.id && GENES[x.id].pathway === g.pathway).length;
  return [
    `${g.name} — ${g.product}`,
    e > 0
      ? `${(e * 100) | 0}% · position ${ctx.rank + 1} · ${sameCount} ${g.pathway} neighbour${sameCount === 1 ? "" : "s"}`
      : `transcribed, but no substrate at this depth`,
    g.desc,
  ];
}
