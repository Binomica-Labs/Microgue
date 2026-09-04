// Sprite primitives in unit space (0..1), emitted as data rather than drawn
// directly. Two reasons: the same shape list renders on canvas in the browser
// and in an offline previewer, so what I check is exactly what ships; and a
// morphology becomes an editable table instead of imperative drawing code.

export type Role = "body" | "dark" | "accent" | "hi" | "thread";

export interface Ellipse {
  k: "ellipse"; cx: number; cy: number; rx: number; ry: number;
  rot?: number; role: Role;
}
export interface Poly { k: "poly"; pts: readonly [number, number][]; role: Role; }
export interface Path {
  k: "path"; pts: readonly [number, number][]; w: number; role: Role;
}
export type Shape = Ellipse | Poly | Path;

const el = (cx: number, cy: number, rx: number, ry: number, role: Role, rot = 0): Ellipse =>
  ({ k: "ellipse", cx, cy, rx, ry, rot, role });
const path = (pts: readonly [number, number][], w: number, role: Role): Path =>
  ({ k: "path", pts, w, role });

/** A flagellum: sine wave trailing from an attachment point. */
function flagellum(x0: number, y0: number, len: number, dir: number, amp = 0.035): Path {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([x0 + dir * len * t, y0 + Math.sin(t * Math.PI * 2.6) * amp * t]);
  }
  return path(pts, 0.026, "thread");
}

/** Conductive pili -- Geobacter's nanowires. Straight, radiating, many. */
function pili(cx: number, cy: number, n: number, len: number): Path[] {
  const out: Path[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    out.push(path([[cx, cy], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]], 0.018, "thread"));
  }
  return out;
}

/** A rod with rounded ends, as a polygon-free stack of ellipses. */
function rod(cx: number, cy: number, halfLen: number, r: number, role: Role = "body"): Shape[] {
  return [
    el(cx, cy, halfLen, r, role),
    el(cx - halfLen + r * 0.1, cy, r, r, role),
    el(cx + halfLen - r * 0.1, cy, r, r, role),
  ];
}

/** Sulfur globules, chlorosomes, granules -- bright inclusions in a cell. */
function inclusions(cx: number, cy: number, n: number, spread: number, r: number, role: Role = "hi"): Ellipse[] {
  const out: Ellipse[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 1.1;
    out.push(el(cx + Math.cos(a) * spread, cy + Math.sin(a) * spread * 0.55, r, r, role));
  }
  return out;
}

// ---------------------------------------------------------------- organisms
// Every entry is the organism's actual diagnostic morphology.

export const MORPHOLOGY: Readonly<Record<string, readonly Shape[]>> = {
  // D1 -- oxic water column
  synechococcus: [
    ...rod(0.5, 0.5, 0.26, 0.16),
    path([[0.3, 0.44], [0.7, 0.44]], 0.02, "dark"),
    path([[0.3, 0.56], [0.7, 0.56]], 0.02, "dark"),   // thylakoids
  ],
  chlorella: [
    el(0.5, 0.5, 0.31, 0.31, "hi"),
    // parietal cup chloroplast: an arc hugging the wall, open on one side
    ...Array.from({ length: 26 }, (_v, i): Shape => {
      const a = 0.62 + (i / 25) * Math.PI * 1.55;
      return el(0.5 + Math.cos(a) * 0.24, 0.5 + Math.sin(a) * 0.24, 0.075, 0.075, "body");
    }),
    el(0.5, 0.5, 0.15, 0.15, "hi"),
    el(0.5, 0.66, 0.07, 0.07, "dark"),
  ],
  nitzschia: [
    // pennate diatom: elongate lens, central raphe, transverse striae
    { k: "poly", role: "body", pts: [[0.08,0.5],[0.35,0.36],[0.65,0.36],[0.92,0.5],[0.65,0.64],[0.35,0.64]] },
    path([[0.12,0.5],[0.88,0.5]], 0.016, "dark"),
    ...[0.22,0.32,0.42,0.52,0.62,0.72,0.82].map((x) =>
      path([[x, 0.41], [x, 0.59]], 0.014, "dark")),
  ],

  // D2 -- sediment interface, nitrogen cycling
  nitrosomonas: [
    ...rod(0.44, 0.5, 0.22, 0.15),
    path([[0.3,0.44],[0.58,0.44]], 0.016, "dark"),
    path([[0.3,0.5],[0.58,0.5]], 0.016, "dark"),
    path([[0.3,0.56],[0.58,0.56]], 0.016, "dark"),    // stacked ICM
    flagellum(0.66, 0.5, 0.28, 1),
  ],
  nitrobacter: [
    // pear-shaped, with a polar cap of intracytoplasmic membrane
    { k: "poly", role: "body", pts: [[0.22,0.5],[0.34,0.28],[0.6,0.24],[0.78,0.4],[0.78,0.6],[0.6,0.76],[0.34,0.72]] },
    path([[0.62,0.34],[0.71,0.39]], 0.032, "hi"),
    path([[0.62,0.5],[0.73,0.5]], 0.032, "hi"),
    path([[0.62,0.66],[0.71,0.61]], 0.032, "hi"),
  ],
  pseudomonas: [
    ...rod(0.42, 0.5, 0.24, 0.14),
    flagellum(0.68, 0.5, 0.3, 1, 0.05),
  ],

  // D3 -- suboxic Mn/S front
  beggiatoa: [
    // filament of segments, each holding bright S0 granules
    ...[0.16,0.38,0.6,0.82].flatMap((x) => [
      el(x, 0.5, 0.11, 0.19, "body"),
      el(x, 0.44, 0.045, 0.045, "hi"),
      el(x - 0.02, 0.58, 0.04, 0.04, "hi"),
    ]),
  ],
  thiothrix: [
    // tapering filament on a holdfast
    { k: "poly", role: "body", pts: [[0.5,0.06],[0.62,0.3],[0.66,0.6],[0.6,0.88],[0.4,0.88],[0.34,0.6],[0.38,0.3]] },
    el(0.5, 0.9, 0.16, 0.06, "dark"),
    ...inclusions(0.5, 0.45, 4, 0.09, 0.035),
  ],
  thiobacillus: [
    ...rod(0.5, 0.5, 0.22, 0.15),
    ...inclusions(0.5, 0.5, 3, 0.11, 0.045),          // deposited S0
  ],

  // D4 -- ferruginous zone
  geobacter: [
    ...pili(0.5, 0.5, 9, 0.44),
    ...rod(0.5, 0.5, 0.2, 0.13),
  ],
  shewanella: [
    ...rod(0.44, 0.5, 0.22, 0.13),
    flagellum(0.66, 0.5, 0.3, 1, 0.045),
  ],
  rhodospirillum: [
    // spiral
    path(Array.from({ length: 40 }, (_v, i): [number, number] => {
      const t = i / 39;
      return [0.14 + t * 0.72, 0.5 + Math.sin(t * Math.PI * 3.4) * 0.22];
    }), 0.1, "body"),
    flagellum(0.88, 0.5, 0.18, 1, 0.04),
  ],

  // D5 -- purple sulfur band
  allochromatium: [
    ...rod(0.5, 0.5, 0.28, 0.2),
    ...inclusions(0.5, 0.5, 7, 0.17, 0.055),          // intracellular S0
  ],
  thiocapsa: [
    el(0.5, 0.5, 0.4, 0.38, "dark"),
    el(0.5, 0.5, 0.34, 0.32, "accent"),
    el(0.37, 0.4, 0.14, 0.14, "body"),
    el(0.63, 0.4, 0.14, 0.14, "body"),
    el(0.5, 0.63, 0.14, 0.14, "body"),
    el(0.33, 0.36, 0.05, 0.05, "hi"),
    el(0.59, 0.36, 0.05, 0.05, "hi"),
    el(0.46, 0.59, 0.05, 0.05, "hi"),
  ],

  // D6 -- green sulfur band
  chlorobium: [
    ...rod(0.5, 0.5, 0.26, 0.18),
    // chlorosomes: oblong bodies pressed against the membrane
    ...[-0.16,-0.05,0.06,0.17].flatMap((dx) => [
      el(0.5 + dx, 0.36, 0.05, 0.028, "hi"),
      el(0.5 + dx, 0.64, 0.05, 0.028, "hi"),
    ]),
  ],
  prosthecochloris: [
    el(0.5, 0.5, 0.2, 0.2, "body"),
    ...Array.from({ length: 7 }, (_v, i): Shape => {
      const a = (i / 7) * Math.PI * 2;
      return el(0.5 + Math.cos(a) * 0.29, 0.5 + Math.sin(a) * 0.29, 0.085, 0.085, "body");
    }),
    ...Array.from({ length: 7 }, (_v, i): Shape => {
      const a = (i / 7) * Math.PI * 2;
      return path([[0.5 + Math.cos(a) * 0.14, 0.5 + Math.sin(a) * 0.14],
                   [0.5 + Math.cos(a) * 0.27, 0.5 + Math.sin(a) * 0.27]], 0.07, "body");
    }),
  ],

  // D7 -- sulfidogenic black
  desulfovibrio: [
    // vibrio: curved comma with a polar flagellum
    path(Array.from({ length: 24 }, (_v, i): [number, number] => {
      const t = i / 23;
      const a = -0.9 + t * 1.9;
      return [0.46 + Math.cos(a) * 0.3, 0.52 + Math.sin(a) * 0.3];
    }), 0.17, "body"),
    flagellum(0.66, 0.78, 0.26, 1, 0.05),
  ],
  desulfobacter: [
    // plump rod mid-division: a septum, not a hole
    ...rod(0.5, 0.5, 0.3, 0.2),
    path([[0.5, 0.32], [0.5, 0.68]], 0.03, "dark"),
    ...inclusions(0.5, 0.5, 4, 0.16, 0.035, "dark"),
  ],

  // D8 -- methanogenic floor
  methylomonas: [
    // A rod stacked with internal membranes. Type I methanotrophs pack their
    // cytoplasm with parallel membrane sheets carrying the monooxygenase --
    // the enzyme is IN the membrane, so more membrane is more of it.
    el(0.50, 0.50, 0.40, 0.26, "dark"),
    el(0.50, 0.50, 0.36, 0.22, "body"),
    { k: "poly", role: "accent", pts: [[0.20,0.40],[0.80,0.40],[0.80,0.43],[0.20,0.43]] },
    { k: "poly", role: "accent", pts: [[0.20,0.485],[0.80,0.485],[0.80,0.515],[0.20,0.515]] },
    { k: "poly", role: "accent", pts: [[0.20,0.57],[0.80,0.57],[0.80,0.60],[0.20,0.60]] },
  ],
  methanosarcina: [
    // sarcina: a cuboidal packet held in a common matrix
    { k: "poly", role: "dark", pts: [[0.13,0.13],[0.87,0.13],[0.87,0.87],[0.13,0.87]] },
    { k: "poly", role: "body", pts: [[0.19,0.19],[0.47,0.19],[0.47,0.47],[0.19,0.47]] },
    { k: "poly", role: "body", pts: [[0.53,0.19],[0.81,0.19],[0.81,0.47],[0.53,0.47]] },
    { k: "poly", role: "body", pts: [[0.19,0.53],[0.47,0.53],[0.47,0.81],[0.19,0.81]] },
    { k: "poly", role: "body", pts: [[0.53,0.53],[0.81,0.53],[0.81,0.81],[0.53,0.81]] },
    el(0.28, 0.28, 0.05, 0.05, "hi"), el(0.62, 0.28, 0.05, 0.05, "hi"),
    el(0.28, 0.62, 0.05, 0.05, "hi"), el(0.62, 0.62, 0.05, 0.05, "hi"),
  ],
  methanobacterium: [
    ...rod(0.5, 0.5, 0.36, 0.11),
    path([[0.2,0.5],[0.8,0.5]], 0.02, "dark"),
  ],

  // the player: an engineered nanobot -- deliberately not a cell
  player: [
    { k: "poly", role: "body", pts: [[0.5,0.12],[0.85,0.32],[0.85,0.68],[0.5,0.88],[0.15,0.68],[0.15,0.32]] },
    { k: "poly", role: "dark", pts: [[0.5,0.26],[0.72,0.38],[0.72,0.62],[0.5,0.74],[0.28,0.62],[0.28,0.38]] },
    el(0.5, 0.5, 0.11, 0.11, "hi"),                   // the plasmid, carried
  ],
};
