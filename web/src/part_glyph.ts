// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// A symbol for every part, so an inventory can be read at a glance.
//
// The shapes are SBOL Visual, the notation synthetic biologists actually draw
// constructs in: a coding sequence is a block arrow, a promoter a bent arrow
// off the backbone, a terminator a T, an origin a circle on the line. A player
// who learns them here can read a real plasmid map.
//
// A gene's arrow also carries its PATHWAY's emblem. The name says which gene;
// the emblem says what it is for, which is what you are deciding on.
//
// Everything is drawn as paths in a unit box, not as font glyphs: emoji and
// symbol coverage differs per platform, and a missing glyph is a tofu box.

import { GENES, type Pathway } from "./biology.js";
import type { Part } from "./plasmid.js";
import type { Item } from "./items.js";

export type Glyph =
  | { kind: "cds"; pathway: Pathway }
  | { kind: "promoter" }
  | { kind: "terminator" }
  | { kind: "origin" }
  | { kind: "fragment" }
  | { kind: "modifier" }
  | { kind: "substrate" }
  | { kind: "symbiont" };

export function glyphOfPart(p: Part): Glyph {
  if (p.kind === "gene") {
    return p.id === "ori" ? { kind: "origin" } : { kind: "cds", pathway: GENES[p.id].pathway };
  }
  return { kind: p.kind };
}

export function glyphOfItem(it: Item): Glyph {
  if (it.kind === "cassette") {
    return it.gene === "ori" ? { kind: "origin" } : { kind: "cds", pathway: GENES[it.gene].pathway };
  }
  // A fragment gets its own emblem: it is not a cassette yet and drawing it
  // as one would promise the player something they have not paid for.
  if (it.kind === "fragment") return { kind: "fragment" };
  return { kind: it.kind };
}

/** Short word for each emblem, for tests and for anything read aloud. */
export const EMBLEM_NAME: Readonly<Record<Pathway, string>> = {
  photo: "sun", carbon: "ring", nitrogen: "triple bond", sulfur: "crown",
  iron: "crystal", methane: "tetrahedron", energy: "bolt", core: "circle",
  stress: "cross", motility: "flagellum", secretion: "drop", resist: "shield",
};

/**
 * Draw `g` centred in a `s` x `s` box at (x, y).
 *
 * `colour` is the glyph's ink; for a gene it should be the pathway colour.
 * `ink` is what the emblem is cut out in when it sits on a filled shape.
 */
export function drawGlyph(
  ctx: CanvasRenderingContext2D, g: Glyph, x: number, y: number, s: number,
  colour: string, ink = "#0b100d",
): void {
  if (!(s > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const lw = Math.max(s * 0.075, 1);
  const cx = x + s / 2, cy = y + s / 2;

  // The DNA backbone every SBOL part sits on.
  const backbone = (at: number): void => {
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(s * 0.04, 0.8);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.06, at);
    ctx.lineTo(x + s * 0.94, at);
    ctx.stroke();
  };

  switch (g.kind) {
    case "cds": {
      // Block arrow: body, then the head.
      const t = y + s * 0.2, b = y + s * 0.8, l = x + s * 0.06, r = x + s * 0.94;
      const neck = x + s * 0.68;
      backbone(cy);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(l, t + s * 0.06);
      ctx.lineTo(neck, t + s * 0.06);
      ctx.lineTo(neck, t - s * 0.04);
      ctx.lineTo(r, cy);
      ctx.lineTo(neck, b + s * 0.04);
      ctx.lineTo(neck, b - s * 0.06);
      ctx.lineTo(l, b - s * 0.06);
      ctx.closePath();
      ctx.fill();
      drawEmblem(ctx, g.pathway, x + s * 0.4, cy, s * 0.21, ink, lw);
      break;
    }
    case "promoter": {
      // Bent arrow: up from the backbone, across, arrowhead.
      const base = y + s * 0.78;
      backbone(base);
      ctx.strokeStyle = colour;
      ctx.lineWidth = lw * 1.5;
      const x0 = x + s * 0.24, top = y + s * 0.26, x1 = x + s * 0.7;
      ctx.beginPath();
      ctx.moveTo(x0, base);
      ctx.lineTo(x0, top);
      ctx.lineTo(x1, top);
      ctx.stroke();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(x1 + s * 0.16, top);
      ctx.lineTo(x1 - s * 0.02, top - s * 0.13);
      ctx.lineTo(x1 - s * 0.02, top + s * 0.13);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "terminator": {
      const base = y + s * 0.78;
      backbone(base);
      ctx.strokeStyle = colour;
      ctx.lineWidth = lw * 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, base);
      ctx.lineTo(cx, y + s * 0.26);
      ctx.moveTo(cx - s * 0.26, y + s * 0.26);
      ctx.lineTo(cx + s * 0.26, y + s * 0.26);
      ctx.stroke();
      break;
    }
    case "fragment": {
      // A gel lane: a bare double strand with ragged ends and no arrow,
      // because an arrow would claim a reading frame the player has not
      // paid to learn. Three bands, the way a gel actually looks.
      ctx.strokeStyle = colour;
      ctx.lineWidth = lw;
      for (const f of [0.3, 0.5, 0.7]) {
        ctx.beginPath();
        ctx.moveTo(x + s * 0.22, y + s * f);
        ctx.lineTo(x + s * 0.78, y + s * f);
        ctx.stroke();
      }
      break;
    }
    case "origin": {
      backbone(cy);
      ctx.fillStyle = "#0b100d";
      ctx.strokeStyle = colour;
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "modifier": {
      // A four-point spark: it changes a gene rather than being one.
      ctx.fillStyle = colour;
      const R = s * 0.4, q = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx + q, cy - q);
      ctx.lineTo(cx + R, cy);
      ctx.lineTo(cx + q, cy + q);
      ctx.lineTo(cx, cy + R);
      ctx.lineTo(cx - q, cy + q);
      ctx.lineTo(cx - R, cy);
      ctx.lineTo(cx - q, cy - q);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "substrate": {
      // A small molecule: three atoms, two bonds.
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = lw;
      const pts = [[cx - s * 0.26, cy + s * 0.16], [cx, cy - s * 0.2],
                   [cx + s * 0.26, cy + s * 0.16]] as const;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.stroke();
      for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(px, py, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "symbiont": {
      // A cell with its nucleoid: another organism, not a part.
      ctx.strokeStyle = colour;
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.38, s * 0.26, -0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(cx + s * 0.05, cy - s * 0.02, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** The pathway emblem, centred on (cx, cy) with radius r. */
export function drawEmblem(
  ctx: CanvasRenderingContext2D, pw: Pathway, cx: number, cy: number, r: number,
  colour: string, lw = Math.max(r * 0.3, 1),
): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (pw) {
    case "photo": {            // sun
      ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
      break;
    }
    case "carbon": {           // a sugar ring
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = cx + Math.cos(a) * r * 0.9, py = cy + Math.sin(a) * r * 0.9;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case "nitrogen": {         // N≡N
      for (const k of [-1, 0, 1]) {
        ctx.moveTo(cx - r, cy + k * r * 0.5);
        ctx.lineTo(cx + r, cy + k * r * 0.5);
      }
      ctx.stroke();
      break;
    }
    case "sulfur": {           // the S8 crown, seen side on
      for (let i = 0; i <= 4; i++) {
        const px = cx - r + (i / 4) * 2 * r;
        const py = cy + (i % 2 === 0 ? r * 0.55 : -r * 0.55);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case "iron": {             // an oxide crystal
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.75, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.75, cy);
      ctx.closePath();
      ctx.moveTo(cx - r * 0.75, cy);
      ctx.lineTo(cx + r * 0.75, cy);
      ctx.stroke();
      break;
    }
    case "methane": {          // CH4: a centre and four bonds
      // Three bonds in the plane, the fourth foreshortened toward you.
      for (const [a, k] of [[-Math.PI / 2, 1], [Math.PI / 6, 1], [(5 * Math.PI) / 6, 1],
                            [Math.PI / 2, 0.45]] as const) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "energy": {           // a bolt
      ctx.moveTo(cx + r * 0.25, cy - r);
      ctx.lineTo(cx - r * 0.5, cy + r * 0.12);
      ctx.lineTo(cx + r * 0.05, cy + r * 0.12);
      ctx.lineTo(cx - r * 0.25, cy + r);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.12);
      ctx.lineTo(cx - r * 0.05, cy - r * 0.12);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "core": {
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "stress": {           // repair: a cross
      const a = r * 0.34;
      ctx.moveTo(cx - a, cy - r); ctx.lineTo(cx + a, cy - r); ctx.lineTo(cx + a, cy - a);
      ctx.lineTo(cx + r, cy - a); ctx.lineTo(cx + r, cy + a); ctx.lineTo(cx + a, cy + a);
      ctx.lineTo(cx + a, cy + r); ctx.lineTo(cx - a, cy + r); ctx.lineTo(cx - a, cy + a);
      ctx.lineTo(cx - r, cy + a); ctx.lineTo(cx - r, cy - a); ctx.lineTo(cx - a, cy - a);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "motility": {         // a flagellum
      ctx.moveTo(cx - r, cy);
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        ctx.lineTo(cx - r + t * 2 * r, cy + Math.sin(t * Math.PI * 3) * r * 0.5);
      }
      ctx.stroke();
      break;
    }
    case "secretion": {        // a drop
      ctx.moveTo(cx, cy - r);
      ctx.bezierCurveTo(cx + r * 0.2, cy - r * 0.4, cx + r * 0.75, cy - r * 0.05,
                        cx + r * 0.75, cy + r * 0.3);
      ctx.arc(cx, cy + r * 0.3, r * 0.75, 0, Math.PI);
      ctx.bezierCurveTo(cx - r * 0.75, cy - r * 0.05, cx - r * 0.2, cy - r * 0.4, cx, cy - r);
      ctx.fill();
      break;
    }
    case "resist": {           // a shield
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.8, cy - r * 0.62);
      ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.5, cx, cy + r);
      ctx.quadraticCurveTo(cx - r * 0.8, cy + r * 0.5, cx - r * 0.8, cy - r * 0.62);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
