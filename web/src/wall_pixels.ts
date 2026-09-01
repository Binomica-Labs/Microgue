// Wall art, as sprite sheets in source.
//
// The walls were a flat fill plus a handful of scattered dots. This replaces
// the dots with authored 16x16 tiles in the same format `pixels.ts` uses for
// organisms: a grid of ROLE characters rather than colours, so the stratum's
// own palette still tints it and every tile stays a block of editable text in
// version control. No binary assets, nothing to load, nothing for the service
// worker to cache, and the diff of a texture change is readable.
//
//   .  matrix     the wall's base colour, untouched
//   1  pore       shadow between grains; the gaps
//   2  grain      a particle, mid tone
//   3  lit        the upper face of a grain, catching light
//
// Tiles are MATERIALS, not strata. Six materials cover twenty-four floors
// because what actually changes down the column is the palette and which
// material dominates -- silt does not become a different shape when it is
// iron-stained. Each has variants so a wall is not one tile repeated.

export const WALL_PX = 16;

export type WallTile = readonly string[];

/**
 * Packed silt and sand. The default: rounded grains of mixed size with pore
 * space between them, which is what most of a sediment column actually is.
 */
const granular: WallTile[] = [
  [
    "..1..2211....2..",
    ".2321..12...232.",
    ".2321...1...121.",
    "..11.....2...1..",
    "...2.1..232..1..",
    "..232.1.121..2..",
    "..121..1..1..1..",
    "...1..232....2..",
    ".2....121...232.",
    "232....1....121.",
    "121..2.......1..",
    ".1..232..1..2...",
    "....121.232.1...",
    "..2..1..121.....",
    ".232.....1...2..",
    ".121........232.",
  ],
  [
    "232....1....2...",
    "121...232..232..",
    ".1....121..121..",
    "...2...1....1...",
    "..232.......2...",
    "..121..2...232..",
    "...1..232..121..",
    ".2....121...1...",
    "232....1........",
    "121......2...2..",
    ".1......232.232.",
    "....2...121.121.",
    "...232...1...1..",
    "...121..........",
    "....1....2..2...",
    "........232.232.",
  ],
];

/**
 * Varves. Fine horizontal laminae from seasonal deposition -- the reason a
 * sediment core reads like tree rings. Nearly flat, which is what makes it
 * read as LAYERED rather than as noise.
 */
const laminated: WallTile[] = [
  [
    "................",
    "1111.11111.1111.",
    "2222222222222222",
    "................",
    "..............1.",
    "3333.333333.3333",
    "................",
    "111.1111.111111.",
    "2222222222222222",
    "................",
    "................",
    ".33333.33333.333",
    "................",
    "11111.111.111111",
    "2222222222222222",
    "................",
  ],
  [
    "2222222222222222",
    "................",
    ".111111.1111.111",
    "................",
    "33.333333.33333.",
    "................",
    "................",
    "2222222222222222",
    "1111.1111111.111",
    "................",
    "................",
    ".3333.333333.333",
    "................",
    "2222222222222222",
    "................",
    "11111111.1111111",
  ],
];

/**
 * A Beggiatoa mat. Tangled filaments, each a chain of cells, running mostly
 * one way but never straight -- they glide, so the mat has a grain to it.
 */
const filamentous: WallTile[] = [
  [
    "..3.......3.....",
    ".3.3.....3.3....",
    "3...3...3...3..3",
    "..2..3.3..2..3..",
    "..2...3...2.....",
    "..2.......2...3.",
    "..3.....3.3..3.3",
    "...3...3...33...",
    "....3.3....2....",
    "..3..3.....2....",
    ".3.3.......2....",
    "3...3....3.3....",
    "..2..3..3...3...",
    "..2...33.....3..",
    "..2....3........",
    "..3.....3.......",
  ],
  [
    "....3.......3...",
    "...3.3.....3.3..",
    "..3...3...3...3.",
    ".3..2..3.3..2..3",
    "3...2...3...2...",
    "....2.......2...",
    "....3.....3.3...",
    "..3..3...3...3..",
    ".3.3..3.3.....3.",
    "3...3..3.......3",
    "..2....3....3...",
    "..2...3.3..3.3..",
    "..2..3...33...3.",
    "..3.3.....3.....",
    "...3.......3....",
    "..3.........3...",
  ],
];

/**
 * Angular oxide crust. Mn and Fe oxides precipitate as plates and blades, not
 * as rounded grains -- the difference between a crust and a sand.
 */
const crystalline: WallTile[] = [
  [
    "...33...........",
    "..3..3....333...",
    ".3....3..3...3..",
    "3......33.....3.",
    ".3....3.3......3",
    "..3..3...3....3.",
    "...33.....3..3..",
    "..........33....",
    "....33..........",
    "...3..3....333..",
    "..3....3..3...3.",
    ".3......33.....3",
    "..3....3.3.....3",
    "...3..3...3...3.",
    "....33.....333..",
    "................",
  ],
  [
    "......33........",
    ".33..3..3.......",
    "3..33....3...33.",
    ".33.......3.3..3",
    "...........33...",
    "..33...........3",
    ".3..3....33...3.",
    "3....3..3..3.3..",
    ".3....33....3...",
    "..3..3..3.......",
    "...33....3...33.",
    "..........3.3..3",
    ".....33....33...",
    "....3..3........",
    "...3....3.......",
    "..33.....3......",
  ],
];

/**
 * Framboidal pyrite. Microcrystals pack into raspberry-like spheres a few
 * microns across -- the classic signature of sulfate reduction in sediment.
 */
const framboidal: WallTile[] = [
  [
    "...121..........",
    "..12321.....121.",
    "..12321....12321",
    "...121.....12321",
    "............121.",
    ".....121........",
    "....12321.......",
    "....12321...121.",
    ".....121...12321",
    "...........12321",
    "..121.......121.",
    ".12321..........",
    ".12321.....121..",
    "..121.....12321.",
    "..........12321.",
    "...........121..",
  ],
  [
    ".......121......",
    "..121.12321.....",
    ".12321.12321....",
    ".12321..121.....",
    "..121...........",
    "..........121...",
    "...121...12321..",
    "..12321..12321..",
    "..12321...121...",
    "...121..........",
    ".......121......",
    "..121.12321.....",
    ".12321.12321....",
    ".12321..121.....",
    "..121...........",
    "................",
  ],
];

/**
 * Massive mud. Dense, fine, structureless -- the deep anoxic clays, where
 * there is almost nothing to see and that IS the character.
 */
const massive: WallTile[] = [
  [
    "................",
    "....1...........",
    "..........2.....",
    "................",
    ".......1........",
    "................",
    "..2.............",
    "................",
    "..........1.....",
    "................",
    "......2.........",
    "................",
    "................",
    "...1............",
    "............2...",
    "................",
  ],
];

export const WALL_MATERIALS = {
  granular, laminated, filamentous, crystalline, framboidal, massive,
} as const;

export type WallMaterial = keyof typeof WALL_MATERIALS;

/**
 * Which material a stratum is made of.
 *
 * Down the column: an oxic sand, then seasonal laminae at the interface, the
 * Beggiatoa mat holding the O2/H2S front, oxide crusts through the metal
 * zones, framboidal pyrite where sulfate reduction dominates, and structureless
 * clay at the bottom.
 */
export const MATERIAL_AT: readonly WallMaterial[] = [
  "granular", "laminated", "filamentous", "crystalline",
  "crystalline", "framboidal", "framboidal", "massive",
];

export function materialFor(depth: number): WallMaterial {
  const d = Number.isFinite(depth) ? Math.round(depth) : 1;
  return MATERIAL_AT[Math.min(Math.max(d - 1, 0), MATERIAL_AT.length - 1)]
    ?? "granular";
}
