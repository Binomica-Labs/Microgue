import { describe, expect, it } from "vitest";
import { EMBLEM_NAME, drawGlyph, glyphOfItem, glyphOfPart, type Glyph }
  from "../src/part_glyph.js";
import { PATHWAY_COLOUR } from "../src/plasmid_ui.js";
import { GENES, type GeneId, type Pathway } from "../src/biology.js";
import { WILD_TYPE } from "../src/allele.js";
import type { Item } from "../src/items.js";

/**
 * The part symbols are drawn from paths, so they can be checked the way the
 * layout is: record every point a glyph visits and make sure there are some,
 * that they are finite, and that they stay inside the box they were given.
 */
interface Rec { pts: [number, number][]; fills: number; strokes: number }

function recCtx(r: Rec): CanvasRenderingContext2D {
  const pt = (x: unknown, y: unknown): void => { r.pts.push([Number(x), Number(y)]); };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_o, p: string) => (...a: unknown[]) => {
      if (p === "moveTo" || p === "lineTo") pt(a[0], a[1]);
      if (p === "quadraticCurveTo") { pt(a[0], a[1]); pt(a[2], a[3]); }
      if (p === "bezierCurveTo") { pt(a[0], a[1]); pt(a[2], a[3]); pt(a[4], a[5]); }
      if (p === "arc") {
        const [x, y, rad] = a as number[];
        pt((x ?? 0) - (rad ?? 0), (y ?? 0) - (rad ?? 0));
        pt((x ?? 0) + (rad ?? 0), (y ?? 0) + (rad ?? 0));
      }
      if (p === "ellipse") {
        const [x, y, rx] = a as number[];
        pt((x ?? 0) - (rx ?? 0), (y ?? 0) - (rx ?? 0));
        pt((x ?? 0) + (rx ?? 0), (y ?? 0) + (rx ?? 0));
      }
      if (p === "fill") r.fills++;
      if (p === "stroke") r.strokes++;
      return undefined;
    },
    set: () => true,
  });
}

const PATHWAYS = Object.keys(PATHWAY_COLOUR) as Pathway[];
const ALL: Glyph[] = [
  ...PATHWAYS.map((pathway): Glyph => ({ kind: "cds", pathway })),
  { kind: "promoter" }, { kind: "terminator" }, { kind: "origin" },
  { kind: "modifier" }, { kind: "substrate" }, { kind: "symbiont" },
];
const label = (g: Glyph): string => g.kind === "cds" ? `cds/${g.pathway}` : g.kind;

describe("part glyphs", () => {
  it.each(ALL.map((g) => [label(g), g] as const))("%s draws, finite and inside its box", (_n, g) => {
    const r: Rec = { pts: [], fills: 0, strokes: 0 };
    const x = 10, y = 20, s = 40;
    drawGlyph(recCtx(r), g, x, y, s, "#fff");
    expect(r.fills + r.strokes, "it drew nothing").toBeGreaterThan(0);
    for (const [px, py] of r.pts) {
      expect(Number.isFinite(px) && Number.isFinite(py)).toBe(true);
      // Line width reaches a little past the geometry; a tenth of the box.
      expect(px).toBeGreaterThanOrEqual(x - s * 0.1);
      expect(px).toBeLessThanOrEqual(x + s * 1.1);
      expect(py).toBeGreaterThanOrEqual(y - s * 0.1);
      expect(py).toBeLessThanOrEqual(y + s * 1.1);
    }
  });

  it("every pathway has its own emblem, distinct from every other", () => {
    // Drawn at one size, the emblem's point list is its fingerprint. Two
    // pathways sharing one would be the same symbol under two colours.
    const prints = new Map<string, string>();
    for (const pw of PATHWAYS) {
      const r: Rec = { pts: [], fills: 0, strokes: 0 };
      drawGlyph(recCtx(r), { kind: "cds", pathway: pw }, 0, 0, 100, "#fff");
      const key = r.pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
      expect(prints.get(key), `${pw} draws the same as ${prints.get(key) ?? ""}`).toBeUndefined();
      prints.set(key, pw);
      expect(EMBLEM_NAME[pw], `${pw} has no emblem name`).toBeTruthy();
    }
  });

  it("every gene in the game maps to a pathway that has an emblem", () => {
    for (const id of Object.keys(GENES) as GeneId[]) {
      const g = glyphOfPart({ kind: "gene", id, level: 1, mods: [], allele: WILD_TYPE });
      if (id === "ori") { expect(g.kind).toBe("origin"); continue; }
      expect(g.kind).toBe("cds");
      if (g.kind === "cds") expect(PATHWAYS).toContain(g.pathway);
    }
  });

  it("items get the symbol of the part they become", () => {
    const cases: [Item, Glyph["kind"]][] = [
      [{ kind: "cassette", gene: "psbA", allele: WILD_TYPE }, "cds"],
      [{ kind: "promoter", id: "j23106", rarity: "common" }, "promoter"],
      [{ kind: "terminator", id: "rrnbt1", rarity: "uncommon" }, "terminator"],
      [{ kind: "substrate", id: "glucose" }, "substrate"],
      [{ kind: "modifier", id: "codon", rarity: "uncommon" }, "modifier"],
      [{ kind: "symbiont", id: "hydrogenosome" }, "symbiont"],
    ];
    for (const [it, kind] of cases) expect(glyphOfItem(it).kind).toBe(kind);
  });

  it("a zero, negative or NaN size draws nothing rather than garbage", () => {
    for (const s of [0, -5, Number.NaN]) {
      const r: Rec = { pts: [], fills: 0, strokes: 0 };
      drawGlyph(recCtx(r), { kind: "cds", pathway: "photo" }, 0, 0, s, "#fff");
      expect(r.pts.length + r.fills + r.strokes).toBe(0);
    }
  });
});
