// The module map. Metabolites as nodes, enzymes as labelled arrows between
// them, greyed where you lack the gene -- so the map shows WHICH step breaks
// the chain, not merely that something does.

import { GENES } from "./biology.js";
import { allStates, moduleKb, type ModuleState } from "./kegg.js";
import type { Plasmid } from "./plasmid.js";
import { PATHWAY_COLOUR } from "./plasmid_ui.js";

export interface MapGeom {
  x: number; y: number; w: number; rowH: number; scroll: number;
}

export interface MapRow {
  readonly state: ModuleState;
  readonly y: number;
  readonly h: number;
  readonly canAssemble: boolean;
}

/** Lay the modules out as rows. Returns the rows and the total content height. */
export function layoutMap(
  g: MapGeom, p: Plasmid,
): { rows: MapRow[]; contentH: number } {
  const carried = p.carried();
  const rows: MapRow[] = [];
  let y = g.y - g.scroll;
  for (const state of allStates(carried)) {
    rows.push({ state, y, h: g.rowH, canAssemble: state.complete });
    y += g.rowH;
  }
  return { rows, contentH: rows.length * g.rowH };
}

export function rowAt(rows: readonly MapRow[], y: number): MapRow | null {
  return rows.find((r) => y >= r.y && y < r.y + r.h) ?? null;
}

export function drawMap(
  ctx: CanvasRenderingContext2D, g: MapGeom, rows: readonly MapRow[],
  u: number, clipTop: number, clipBottom: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, clipTop, g.x + g.w + 40 * u, clipBottom - clipTop);
  ctx.clip();

  for (const row of rows) {
    if (row.y + row.h < clipTop || row.y > clipBottom) continue;
    const m = row.state.module;
    const tint = PATHWAY_COLOUR[m.pathway];

    // header: identifier, name, completeness
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillStyle = row.state.complete ? tint : "rgba(255,255,255,0.42)";
    ctx.fillText(`${m.id}  ${m.name}`, g.x, row.y + 14 * u);

    ctx.fillStyle = row.state.complete ? "#7fe0a4" : "rgba(255,255,255,0.35)";
    ctx.textAlign = "right";
    ctx.fillText(
      row.state.complete ? `COMPLETE · ${moduleKb(m).toFixed(1)}kb · tap to build`
                         : `${row.state.held}/${row.state.total}`,
      g.x + g.w, row.y + 14 * u);

    // the chain: [metabolite] -enzyme-> [metabolite] ...
    const steps = m.steps;
    const cellW = g.w / steps.length;
    const chainY = row.y + 34 * u;
    ctx.textAlign = "center";
    ctx.font = `${9 * u}px ui-monospace,monospace`;

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const st = row.state.steps[i];
      if (!s || !st) continue;
      const have = st === "have";
      const cx = g.x + i * cellW;

      // substrate node
      ctx.fillStyle = have ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)";
      ctx.fillText(s.from, cx + cellW * 0.12, chainY + 4 * u);

      // arrow
      const a0 = cx + cellW * 0.3, a1 = cx + cellW * 0.82;
      ctx.strokeStyle = have ? tint : "rgba(255,255,255,0.14)";
      ctx.lineWidth = have ? Math.max(2 * u, 2) : Math.max(u, 1);
      ctx.beginPath();
      ctx.moveTo(a0, chainY);
      ctx.lineTo(a1, chainY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a1, chainY);
      ctx.lineTo(a1 - 5 * u, chainY - 3.5 * u);
      ctx.lineTo(a1 - 5 * u, chainY + 3.5 * u);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();

      // enzyme label above the arrow, greyed when absent
      ctx.fillStyle = have ? tint : "rgba(255,255,255,0.3)";
      ctx.fillText(GENES[s.gene].name, (a0 + a1) / 2, chainY - 8 * u);
      ctx.fillStyle = have ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)";
      ctx.font = `${7.5 * u}px ui-monospace,monospace`;
      ctx.fillText(`EC ${s.ec}`, (a0 + a1) / 2, chainY + 12 * u);
      ctx.font = `${9 * u}px ui-monospace,monospace`;

      // final product
      if (i === steps.length - 1) {
        ctx.fillStyle = have ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)";
        ctx.fillText(s.to, cx + cellW * 0.94, chainY + 4 * u);
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.x, row.y + row.h - 6 * u);
    ctx.lineTo(g.x + g.w, row.y + row.h - 6 * u);
    ctx.stroke();
  }
  ctx.restore();
}
