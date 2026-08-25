// The plasmid screen: a ring you spin, with slots you drag parts between.
//
// Everything is hit-tested in polar coordinates, which is what makes a circular
// inventory workable with a thumb: slot index is just an angle, so the target
// is as large as the ring is wide.

import type { Box } from "./chrome.js";
import { GENES, type Pathway } from "./biology.js";
import { SLOTS, type Part, type Plasmid } from "./plasmid.js";
import { MODIFIERS, PROMOTERS, RARITY, TERMINATORS, type Rarity } from "./parts.js";
import { PREFIXES, SUFFIXES, alleleName, alleleRarity, alleleReadout }
  from "./allele.js";

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
  if (p.kind === "promoter") return PROMOTERS[p.id].name;
  return TERMINATORS[p.id].name;
}

function partColour(p: Part): string {
  if (p.kind === "gene") return PATHWAY_COLOUR[GENES[p.id].pathway];
  if (p.kind === "promoter") return "#ffd166";
  return "#8a8f96";
}

export interface BinGeom {
  x: number; y: number; cell: number; gap: number; cols: number;
}

/** Screen point -> bin index, or null. */
export function binAt(g: BinGeom, n: number, x: number, y: number): number | null {
  for (let i = 0; i < n; i++) {
    const c = i % g.cols, r = Math.floor(i / g.cols);
    const bx = g.x + c * (g.cell + g.gap);
    const by = g.y + r * (g.cell + g.gap);
    if (x >= bx && x <= bx + g.cell && y >= by && y <= by + g.cell) return i;
  }
  return null;
}

export function binCell(g: BinGeom, i: number): { x: number; y: number } {
  const c = i % g.cols, r = Math.floor(i / g.cols);
  return { x: g.x + c * (g.cell + g.gap), y: g.y + r * (g.cell + g.gap) };
}

/** The rarity of anything that can sit in the bin. Genes take theirs from
 *  their tier, so the ladder is one thing rather than two. */
export function partRarity(p: Part): Rarity {
  // A gene's rarity is its ROLL, not its base: same gene, different find.
  if (p.kind === "gene") return alleleRarity(p.id, p.allele);
  if (p.kind === "promoter") return PROMOTERS[p.id].rarity;
  return TERMINATORS[p.id].rarity;
}

export function drawBin(
  ctx: CanvasRenderingContext2D, g: BinGeom, parts: readonly Part[],
  u: number, dragging: number | null,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    const c = binCell(g, i);
    const held = dragging === i;
    const tier = RARITY[partRarity(p)];
    ctx.globalAlpha = held ? 0.25 : 1;

    // Body in the pathway colour, which says what it DOES; outline in the
    // rarity colour, which says how hard it was to find. Two axes, two
    // channels, so neither has to be read off the other.
    ctx.fillStyle = partColour(p);
    ctx.beginPath();
    ctx.roundRect(c.x, c.y, g.cell, g.cell, g.cell * 0.22);
    ctx.fill();

    ctx.strokeStyle = tier.colour;
    ctx.lineWidth = Math.max(g.cell * 0.075, 1.5);
    ctx.beginPath();
    ctx.roundRect(c.x + ctx.lineWidth / 2, c.y + ctx.lineWidth / 2,
                  g.cell - ctx.lineWidth, g.cell - ctx.lineWidth, g.cell * 0.2);
    ctx.stroke();

    // A corner pip for the top two tiers, so they read at a glance and to a
    // colourblind eye.
    if (tier.id === "epic" || tier.id === "legendary") {
      ctx.fillStyle = tier.colour;
      ctx.beginPath();
      ctx.moveTo(c.x + g.cell, c.y);
      ctx.lineTo(c.x + g.cell, c.y + g.cell * 0.3);
      ctx.lineTo(c.x + g.cell * 0.7, c.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#141414";
    ctx.font = `${Math.max(g.cell * 0.26, 8)}px ui-monospace,monospace`;
    ctx.fillText(partLabel(p), c.x + g.cell / 2, c.y + g.cell / 2);
    ctx.globalAlpha = 1;
  }
  // Empty outline for the next slot, so the bin reads as a container.
  const c = binCell(g, parts.length);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(c.x, c.y, g.cell, g.cell, g.cell * 0.22);
  ctx.stroke();
  void u;
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
    ctx.strokeStyle = `rgba(255,209,102,${0.25 + 0.45 * Math.min(op.output / 1.4, 1)})`;
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
  if (part.kind === "terminator") {
    const t = TERMINATORS[part.id];
    return [t.name,
            `${((1 - t.readthrough) * 100).toFixed(0)}% efficient · ` +
            `${(t.readthrough * 100).toFixed(0)}% reads through`,
            t.note];
  }
  if (part.kind === "promoter") {
    const pr = PROMOTERS[part.id];
    return [`${pr.name} · ${pr.mode}`,
            `output x${pr.strength.toFixed(2)} when active`,
            pr.note];
  }
  const g = GENES[part.id];
  const ctx = p.operonOf(part.id);
  const e = p.expression(part.id, depth);
  if (!ctx) return [`${g.name} — ${g.product}`, "NOT TRANSCRIBED: no promoter upstream"];
  const sameCount = ctx.operon.genes.filter(
    (x) => x.id !== part.id && GENES[x.id].pathway === g.pathway).length;
  const lines = [
    `${g.name} — ${g.product}`,
    e > 0
      ? `${(e * 100) | 0}% · position ${ctx.rank + 1} · ${sameCount} ${g.pathway} neighbour${sameCount === 1 ? "" : "s"}`
      : `transcribed, but no substrate at this depth`,
    g.desc,
  ];
  if (part.mods.length > 0) {
    lines.push(`+ ${part.mods.map((mm) => MODIFIERS[mm].name).join(", ")}`);
  }
  if (part.level > 1) lines.push(`evolved to level ${String(part.level)}`);
  for (const c of p.complexes(depth)) {
    if (c.genes.includes(part.id)) lines.push(`\u2713 ${c.name}: ${c.note}`);
  }
  for (const h of p.hazards(depth)) {
    if (h.present === part.id) lines.push(`\u26A0 ${h.name}: ${h.note}`);
  }
  return lines;
}

/**
 * The item card.
 *
 * A roguelike lets you look at a thing and learn what it is. This is that:
 * what it does mechanically, and where it came from historically. The
 * discovery line is real in every case -- the point of the game is the
 * organisms and the chemistry, and an invented citation would undercut it.
 */
export function drawItemCard(
  ctx: CanvasRenderingContext2D, W: number, H: number, u: number,
  part: Part, plasmid: Plasmid, depth: number,
  wrap: (s: string, max: number) => string[],
  edible = false,
): Box | null {
  const tier = RARITY[partRarity(part)];
  const pad = 14 * u;
  const cardW = Math.min(W - 40 * u, 340 * u);

  // Build the body first so the card can be sized to it.
  const title = part.kind === "gene" && part.id !== "ori"
    ? alleleName(part.id, part.allele) : partLabel(part);
  const lines: { text: string; colour: string; size: number }[] = [];
  const add = (text: string, colour = "#c8d6ce", size = 10): void => {
    for (const l of wrap(text, cardW - pad * 2)) lines.push({ text: l, colour, size });
  };

  if (part.kind === "gene") {
    const gene = GENES[part.id];
    add(gene.product, "#ffffff", 11);
    // The roll, before anything else: this is what distinguishes this copy
    // from every other copy of the same gene.
    if (part.id !== "ori") {
      for (const line of alleleReadout(part.allele)) add(line, "#cfe04a", 9.5);
      for (const af of [part.allele.prefix, part.allele.suffix]) {
        if (af === null) continue;
        const def = af in PREFIXES
          ? PREFIXES[af as keyof typeof PREFIXES]
          : SUFFIXES[af as keyof typeof SUFFIXES];
        add(def.note, "#9fb0d8", 9);
      }
    }
    add(`${gene.kb.toFixed(1)} kb · tier ${String(gene.tier)} · ${gene.pathway}`, "#8fa89a", 9.5);
    const e = plasmid.expression(part.id, depth);
    add(e > 0
      ? `expressing at ${String(Math.round(e * 100))}%`
      : "not expressing here", e > 0 ? "#7fe0a4" : "#e0a37a", 9.5);
    if (part.level > 1) add(`evolved to level ${String(part.level)}`, "#cfe04a", 9.5);
    if (part.mods.length > 0) {
      add(part.mods.map((m) => MODIFIERS[m].name).join(", "), "#cfe04a", 9.5);
    }
    lines.push({ text: "", colour: "#000", size: 5 });
    add(gene.desc);
    lines.push({ text: "", colour: "#000", size: 5 });
    add(gene.discovery, "#9fb0d8", 9.5);
  } else if (part.kind === "promoter") {
    const pr = PROMOTERS[part.id];
    add(`${pr.mode} promoter`, "#ffffff", 11);
    add(`output x${pr.strength.toFixed(2)} when active`, "#8fa89a", 9.5);
    lines.push({ text: "", colour: "#000", size: 5 });
    add(pr.note);
  } else {
    const t = TERMINATORS[part.id];
    add("terminator", "#ffffff", 11);
    add(`${String(Math.round((1 - t.readthrough) * 100))}% efficient · ` +
        `${String(Math.round(t.readthrough * 100))}% reads through`, "#8fa89a", 9.5);
    lines.push({ text: "", colour: "#000", size: 5 });
    add(t.note);
  }

  const bodyH = lines.reduce((a, l) => a + l.size * u * 1.45, 0);
  const cardH = bodyH + (edible ? 88 : 54) * u;
  const x = (W - cardW) / 2;
  const y = Math.max((H - cardH) / 2, 20 * u);

  ctx.fillStyle = "rgba(2,4,4,0.72)";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(12,18,15,0.99)";
  ctx.strokeStyle = tier.colour;
  ctx.lineWidth = Math.max(2 * u, 2);
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, cardH, 9 * u);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = tier.colour;
  ctx.font = `${15 * u}px ui-monospace,monospace`;
  ctx.fillText(title, x + pad, y + 26 * u);
  ctx.font = `${9 * u}px ui-monospace,monospace`;
  ctx.textAlign = "right";
  ctx.fillText(tier.name.toUpperCase(), x + cardW - pad, y + 26 * u);

  ctx.textAlign = "left";
  let ly = y + 46 * u;
  for (const l of lines) {
    if (l.text !== "") {
      ctx.fillStyle = l.colour;
      ctx.font = `${l.size * u}px ui-monospace,monospace`;
      ctx.fillText(l.text, x + pad, ly);
    }
    ly += l.size * u * 1.45;
  }

  // The eat target. Deliberately its own box: catabolising destroys the
  // cassette, so it must not be the same tap that dismisses the card.
  if (!edible) return null;
  const bw = cardW - pad * 2;
  const box: Box = { x: x + pad, y: y + cardH - 34 * u, w: bw, h: 26 * u };
  ctx.fillStyle = "rgba(160,255,208,0.14)";
  ctx.strokeStyle = "#a0ffd0";
  ctx.lineWidth = Math.max(1.2 * u, 1);
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 5 * u);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#a0ffd0";
  ctx.font = `${9.5 * u}px ui-monospace,monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("catabolise \u2014 DNA is food as well as information",
               box.x + box.w / 2, box.y + box.h / 2);
  return box;
}
