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
    "................",
    "..3331....22....",
    "..3331...2332...",
    "..3331...2332...",
    "...111....22....",
    "................",
    ".....2222.......",
    "....233331..3...",
    "....233331.333..",
    ".....1111...3...",
    "................",
    "..22.......333..",
    ".2332......333..",
    ".2332.......11..",
    "..22............",
    "................",
  ],
  [
    "................",
    ".....333........",
    "....23331...22..",
    "....23331..2332.",
    ".....111...2332.",
    "............22..",
    "..22............",
    ".2332....3333...",
    ".2332....3333...",
    "..11......111...",
    "................",
    "......22........",
    "..33.2332.......",
    ".3331.2332...33.",
    ".3331..11...333.",
    "..11.........1..",
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
    "3333333333333333",
    "1111111111111111",
    "................",
    "................",
    "................",
    "2222222222222222",
    "1111111111111111",
    "................",
    "................",
    "3333333.33333333",
    "1111111.11111111",
    "................",
    "................",
    "................",
    "2222222222222222",
  ],
  [
    "1111111111111111",
    "................",
    "................",
    "................",
    "33333333.3333333",
    "11111111.1111111",
    "................",
    "................",
    "2222222222222222",
    "1111111111111111",
    "................",
    "................",
    "................",
    "3333333333333333",
    "1111111111111111",
    "................",
  ],
];

/**
 * A Beggiatoa mat. Tangled filaments, each a chain of cells, running mostly
 * one way but never straight -- they glide, so the mat has a grain to it.
 */
const filamentous: WallTile[] = [
  [
    "..333...........",
    "....333.....333.",
    "......3333333...",
    "...........33...",
    "................",
    ".....3333.......",
    "..333....333....",
    "................",
    "................",
    ".3333......333..",
    ".....3333333....",
    "................",
    "................",
    "...333......3333",
    "......33333.....",
    "................",
  ],
  [
    "................",
    ".....333333.....",
    "..333......333..",
    "................",
    "...........3333.",
    "....3333333.....",
    ".333............",
    "................",
    "................",
    "......3333......",
    "..3333....33333.",
    "................",
    "..333...........",
    ".....33333......",
    "..........3333..",
    "................",
  ],
];

/**
 * Angular oxide crust. Mn and Fe oxides precipitate as plates and blades, not
 * as rounded grains -- the difference between a crust and a sand.
 */
const crystalline: WallTile[] = [
  [
    "................",
    "...3333.........",
    "..33331.........",
    ".33331.....333..",
    "..111.....33331.",
    "..........3331..",
    "..........111...",
    "................",
    ".....3333.......",
    "....33331.......",
    "....3331...333..",
    ".....111..33331.",
    "..........331...",
    "..........11....",
    "................",
    "................",
  ],
  [
    "................",
    ".........3333...",
    "..333....33331..",
    ".33331...3331...",
    ".3331.....111...",
    "..111...........",
    "................",
    "....33333.......",
    "....33331.......",
    ".....1111.......",
    "................",
    "..3333.....333..",
    "..33331...33331.",
    "...1111....111..",
    "................",
    "................",
  ],
];

/**
 * Framboidal pyrite. Microcrystals pack into raspberry-like spheres a few
 * microns across -- the classic signature of sulfate reduction in sediment.
 */
const framboidal: WallTile[] = [
  [
    "................",
    "...2332.........",
    "..233332........",
    "..233332....233.",
    "...2332....23333",
    "............2333",
    ".............23.",
    "................",
    ".....2332.......",
    "....233332......",
    "....233332......",
    ".....2332.......",
    "................",
    "..233.......2332",
    ".23333.....23333",
    ".23333.....23333",
  ],
  [
    "................",
    "........2332....",
    "..2332.233332...",
    ".233332.33332...",
    ".233332..2332...",
    "..2332..........",
    "................",
    "................",
    "....2332........",
    "...233332...233.",
    "...233332..23333",
    "....2332...23333",
    "............233.",
    "..2332..........",
    ".233332.........",
    ".233332.........",
  ],
];

/**
 * Massive mud. Dense, fine, structureless -- the deep anoxic clays, where
 * there is almost nothing to see and that IS the character.
 */
const massive: WallTile[] = [
  [
    "................",
    "................",
    ".....22.........",
    ".....22.........",
    "................",
    "................",
    "............33..",
    "............33..",
    "................",
    "..22............",
    "..22............",
    "................",
    "................",
    ".........22.....",
    ".........22.....",
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
