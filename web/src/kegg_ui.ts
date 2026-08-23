// The pathway graph: metabolite boxes joined by enzyme-labelled edges, panned
// and zoomed over freely.
//
// The layout is a graph rather than a list because KEGG metabolites are shared
// between modules, so the modules close into the real biogeochemical cycles --
// N2 leaves denitrification and re-enters at fixation, H2S leaves sulfate
// reduction and re-enters at sulfur oxidation. A list cannot show that.

import { GENES } from "./biology.js";
import { EDGES, MODULES, NODES, graphBounds, moduleState, type Edge, type Module }
  from "./kegg.js";
import type { Plasmid } from "./plasmid.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";

export interface View { x: number; y: number; scale: number; }

export const NODE_W = 92;
export const NODE_H = 30;

export const toScreen = (v: View, x: number, y: number): { x: number; y: number } =>
  ({ x: (x - v.x) * v.scale, y: (y - v.y) * v.scale });

export const toWorld = (v: View, x: number, y: number): { x: number; y: number } =>
  ({ x: x / v.scale + v.x, y: y / v.scale + v.y });

/** Centre the graph in a viewport and pick a scale that fits it. */
export function fitView(w: number, h: number, pad = 60): View {
  const b = graphBounds();
  const gw = b.maxX - b.minX + NODE_W + pad * 2;
  const gh = b.maxY - b.minY + NODE_H + pad * 2;
  const scale = Math.min(w / gw, h / gh, 1.4);
  return {
    x: b.minX - (w / scale - (b.maxX - b.minX)) / 2,
    y: b.minY - (h / scale - (b.maxY - b.minY)) / 2,
    scale,
  };
}

export function clampView(v: View, w: number, h: number): View {
  const b = graphBounds();
  const scale = Math.min(Math.max(v.scale, 0.35), 2.5);
  const margin = 220;

  // When the viewport is larger than the content on an axis, the two clamp
  // bounds CROSS and min/max forces the view to an extreme. On a portrait
  // phone that dropped the whole graph 1500px down the screen. Centre it
  // instead: there is nothing to pan to on an axis that already fits.
  const axis = (
    val: number, lo: number, hi: number, span: number, viewport: number,
  ): number => {
    const visible = viewport / scale;
    if (visible >= span) return lo + span / 2 - visible / 2;   // centred
    return Math.min(Math.max(val, lo), hi - visible);
  };

  return {
    scale,
    x: axis(v.x, b.minX - margin, b.maxX + margin,
            b.maxX - b.minX + margin * 2, w),
    y: axis(v.y, b.minY - margin, b.maxY + margin,
            b.maxY - b.minY + margin * 2, h),
  };
}

/** Screen point -> the module whose label box was hit, if any. */
export function moduleLabelAt(
  v: View, x: number, y: number, boxes: readonly ModuleBox[],
): Module | null {
  for (const b of boxes) {
    const s = toScreen(v, b.x, b.y);
    const w = b.w * v.scale, h = 22 * v.scale;
    if (x >= s.x && x <= s.x + w && y >= s.y && y <= s.y + h) return b.module;
  }
  return null;
}

export interface ModuleBox {
  readonly module: Module; readonly x: number; readonly y: number; readonly w: number;
}

const BOX_W = 150;
const BOX_H = 22;

/** A caption per module at the centroid of its own edges, then pushed clear of
 *  other captions and of every metabolite box. Raw centroids collided -- two
 *  modules that share a region land in the same place. */
export function moduleBoxes(): ModuleBox[] {
  const boxes = MODULES.map((m) => {
    const own = EDGES.filter((e) => e.module.id === m.id);
    if (own.length === 0) return { module: m, x: 0, y: 0, w: BOX_W };
    let sx = 0, sy = 0;
    for (const e of own) { sx += (e.from.x + e.to.x) / 2; sy += (e.from.y + e.to.y) / 2; }
    return { module: m, x: sx / own.length - BOX_W / 2, y: sy / own.length - BOX_H / 2, w: BOX_W };
  });

  const overlaps = (ax: number, ay: number, aw: number, ah: number,
                    bx: number, by: number, bw: number, bh: number): boolean =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  // A few relaxation passes: nudge vertically, which keeps a caption near the
  // reactions it labels while clearing both other captions and node boxes.
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      if (!a) continue;
      let hit = NODES.some((n) => overlaps(a.x, a.y, BOX_W, BOX_H, n.x, n.y, NODE_W, NODE_H));
      if (!hit) {
        for (let j = 0; j < boxes.length; j++) {
          const b = boxes[j];
          if (!b || j === i) continue;
          if (overlaps(a.x, a.y, BOX_W, BOX_H, b.x, b.y, BOX_W, BOX_H)) { hit = true; break; }
        }
      }
      if (hit) { a.y += (i % 2 === 0 ? 1 : -1) * (BOX_H + 6); moved = true; }
    }
    if (!moved) break;
  }
  return boxes;
}

function edgeCarried(e: Edge, carried: ReadonlySet<string>): boolean {
  return carried.has(e.gene);
}

export function drawGraph(
  ctx: CanvasRenderingContext2D, v: View, p: Plasmid, u: number,
  boxes: readonly ModuleBox[],
): void {
  const carried = p.carried();
  const s = v.scale;

  // Edges first, so boxes sit on top of their own connections.
  for (const e of EDGES) {
    const have = edgeCarried(e, carried);
    const a = toScreen(v, e.from.x + NODE_W / 2, e.from.y + NODE_H / 2);
    const b = toScreen(v, e.to.x + NODE_W / 2, e.to.y + NODE_H / 2);
    const tint = PATHWAY_COLOUR[e.module.pathway];

    ctx.strokeStyle = have ? tint : "rgba(255,255,255,0.11)";
    ctx.lineWidth = have ? Math.max(2.2 * s, 1.4) : Math.max(1.1 * s, 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // arrowhead, backed off so it lands on the box edge rather than its centre
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const back = (NODE_W / 2) * s * 0.72;
    const hx = b.x - Math.cos(ang) * back, hy = b.y - Math.sin(ang) * back;
    const head = Math.max(7 * s, 4);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(ang - 0.4) * head, hy - Math.sin(ang - 0.4) * head);
    ctx.lineTo(hx - Math.cos(ang + 0.4) * head, hy - Math.sin(ang + 0.4) * head);
    ctx.closePath();
    ctx.fill();

    if (s > 0.5) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.save();
      ctx.translate(mx, my);
      const flip = Math.abs(ang) > Math.PI / 2;
      ctx.rotate(flip ? ang + Math.PI : ang);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = `${Math.max(10 * s, 7)}px ui-monospace,monospace`;
      ctx.fillStyle = have ? tint : "rgba(255,255,255,0.28)";
      ctx.fillText(GENES[e.gene].name, 0, -3 * s);
      ctx.restore();
    }
  }

  // Metabolite boxes.
  for (const n of NODES) {
    const a = toScreen(v, n.x, n.y);
    const w = NODE_W * s, h = NODE_H * s;
    const lit = EDGES.some((e) =>
      (e.from.id === n.id || e.to.id === n.id) && edgeCarried(e, carried));
    ctx.fillStyle = lit ? "rgba(16,22,18,0.96)" : "rgba(12,12,14,0.9)";
    ctx.strokeStyle = lit ? PATHWAY_COLOUR[n.group] : "rgba(255,255,255,0.16)";
    ctx.lineWidth = Math.max(1.6 * s, 1);
    ctx.beginPath();
    ctx.roundRect(a.x, a.y, w, h, 5 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = lit ? "#ffffff" : "rgba(255,255,255,0.4)";
    ctx.font = `${Math.max(11 * s, 7)}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n.id, a.x + w / 2, a.y + h / 2);
  }

  // Module captions, which double as the build targets.
  for (const box of boxes) {
    const st = moduleState(box.module, carried);
    const a = toScreen(v, box.x, box.y);
    const w = box.w * s, h = 22 * s;
    ctx.fillStyle = st.complete ? "rgba(40,90,55,0.92)" : "rgba(0,0,0,0.72)";
    ctx.strokeStyle = st.complete ? "#7fe0a4" : "rgba(255,255,255,0.2)";
    ctx.lineWidth = Math.max(1.4 * s, 1);
    ctx.beginPath();
    ctx.roundRect(a.x, a.y, w, h, 4 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = st.complete ? "#ffffff" : "rgba(255,255,255,0.5)";
    ctx.font = `${Math.max(9.5 * s, 6.5)}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      st.complete ? `${box.module.id}  BUILD` : `${box.module.id}  ${st.held}/${st.total}`,
      a.x + w / 2, a.y + h / 2);
  }
  void u;
}
