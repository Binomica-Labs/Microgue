// The Winogradsky redox tower as game data.
//
// ORDERING PRINCIPLE: strata descend the terminal-electron-accepting-process
// (TEAP) sequence, O2 > NO3- > Mn(IV) > Fe(III) > SO4 > CO2. Free energy per
// electron falls as you go, so depth is difficulty, loot tier and energy
// economy on one axis.
//
// Fe(III) reduction sits ABOVE sulfate reduction and methanogenesis, not at the
// bottom: in real columns Fe2+ DECLINES below ~50 cm as sulfide precipitates it
// as FeS -- which is what blackens the sediment -- and methanogenesis is the
// floor.
//   Pelletier et al. 2017, FEMS Microbiol Ecol 93:fix089
//   Rundell et al. 2014, PLoS ONE 9:e104134  (16S survey by depth)
//   Madigan et al., Brock Biology of Microorganisms  (redox tower)
//
// E0' are midpoint potentials at pH 7 in mV. Fe(III)/Fe(II) is deliberately set
// near zero: it swings roughly -100..+100 mV at circumneutral pH depending on
// mineral phase (ferrihydrite vs goethite vs magnetite). The +770 mV textbook
// figure is the pH 2 aqueous couple and does not apply here.

export type GeneId =
  | "psbA" | "cbbL" | "katG" | "amoA" | "narG" | "nosZ" | "nifH"
  | "soxB" | "sqr"  | "mtrC" | "omcS" | "pufM" | "fmoA" | "csmA"
  | "aclB" | "dsrA" | "aprA" | "hydA" | "mcrA" | "hdrB" | "ori";

export type Teap = "O2" | "NO3-" | "Mn(IV)" | "Fe(III)" | "S0" | "H2S" | "SO4" | "CO2";

export interface Gene {
  readonly id: GeneId; readonly name: string; readonly kb: number;
  readonly product: string; readonly tier: number; readonly desc: string;
  /** Real operons cluster genes of one pathway. Same-pathway neighbours in an
   *  operon co-regulate, and the plasmid rewards reproducing that. */
  readonly pathway: Pathway;
}

export type Pathway =
  | "photo" | "carbon" | "nitrogen" | "sulfur" | "iron"
  | "methane" | "energy" | "defense" | "core";

export const GENES: Readonly<Record<GeneId, Gene>> = {
  psbA: { id:"psbA", name:"psbA", kb:1.1, product:"PSII D1 protein",               tier:1, desc:"Harvest light. Photodamaged constantly; needs repair.", pathway:"photo" },
  cbbL: { id:"cbbL", name:"cbbL", kb:1.4, product:"RuBisCO large subunit",         tier:1, desc:"Fix CO2 into biomass. Slow, universal.", pathway:"carbon" },
  katG: { id:"katG", name:"katG", kb:2.2, product:"catalase-peroxidase",           tier:1, desc:"Detoxify H2O2. The oxic zone is corrosive without it.", pathway:"defense" },
  amoA: { id:"amoA", name:"amoA", kb:0.8, product:"ammonia monooxygenase A",       tier:2, desc:"Oxidise NH3. A steady trickle.", pathway:"nitrogen" },
  narG: { id:"narG", name:"narG", kb:3.7, product:"nitrate reductase alpha",       tier:2, desc:"Respire nitrate once oxygen runs out.", pathway:"nitrogen" },
  nosZ: { id:"nosZ", name:"nosZ", kb:1.9, product:"N2O reductase",                 tier:2, desc:"Complete denitrification. Vents N2.", pathway:"nitrogen" },
  nifH: { id:"nifH", name:"nifH", kb:0.9, product:"nitrogenase Fe protein",        tier:4, desc:"Fix N2. Ruinously expensive; oxygen destroys it.", pathway:"nitrogen" },
  soxB: { id:"soxB", name:"soxB", kb:1.7, product:"thiosulfate oxidation SoxB",    tier:3, desc:"Oxidise reduced sulfur at the O2/H2S front.", pathway:"sulfur" },
  sqr:  { id:"sqr",  name:"sqr",  kb:1.3, product:"sulfide:quinone oxidoreductase",tier:3, desc:"Feed sulfide to the quinone pool. Sulfide tolerance.", pathway:"sulfur" },
  mtrC: { id:"mtrC", name:"mtrC", kb:2.1, product:"decaheme cytochrome MtrC",      tier:4, desc:"Dump electrons onto solid Fe(III). Respire minerals.", pathway:"iron" },
  omcS: { id:"omcS", name:"omcS", kb:1.2, product:"OmcS nanowire cytochrome",      tier:4, desc:"Conductive filament. Strike along a wire.", pathway:"iron" },
  pufM: { id:"pufM", name:"pufM", kb:1.0, product:"type-2 RC subunit M",           tier:5, desc:"Anoxygenic photosynthesis. Light without oxygen.", pathway:"photo" },
  fmoA: { id:"fmoA", name:"fmoA", kb:1.1, product:"Fenna-Matthews-Olson protein",  tier:6, desc:"Near-lossless excitonic funnel. Works in near-darkness.", pathway:"photo" },
  csmA: { id:"csmA", name:"csmA", kb:0.2, product:"chlorosome envelope CsmA",      tier:6, desc:"Chlorosome antenna. Enormous absorption cross-section.", pathway:"photo" },
  aclB: { id:"aclB", name:"aclB", kb:1.2, product:"ATP citrate lyase beta",        tier:6, desc:"Reverse TCA carbon fixation. Cheaper than Calvin.", pathway:"carbon" },
  dsrA: { id:"dsrA", name:"dsrA", kb:1.3, product:"dissimilatory sulfite reductase A", tier:7, desc:"Respire sulfate. Exhales H2S.", pathway:"sulfur" },
  aprA: { id:"aprA", name:"aprA", kb:1.9, product:"APS reductase alpha",           tier:7, desc:"Activate sulfate for reduction.", pathway:"sulfur" },
  hydA: { id:"hydA", name:"hydA", kb:1.7, product:"[FeFe] hydrogenase",            tier:7, desc:"Run on hydrogen. Oxygen-labile within minutes.", pathway:"energy" },
  mcrA: { id:"mcrA", name:"mcrA", kb:1.5, product:"methyl-CoM reductase alpha",    tier:8, desc:"Reduce CO2 to methane. The last acceptor.", pathway:"methane" },
  hdrB: { id:"hdrB", name:"hdrB", kb:0.8, product:"heterodisulfide reductase B",   tier:8, desc:"Flavin-based electron bifurcation.", pathway:"methane" },
  ori:  { id:"ori",  name:"oriV", kb:0.7, product:"broad-host-range origin",       tier:0, desc:"Origin of replication. Without one, nothing replicates.", pathway:"core" },
};

export interface Microbe {
  readonly id: string; readonly name: string; readonly depth: number;
  readonly hp: number; readonly atk: number; readonly glyph: string;
  readonly genes: readonly GeneId[]; readonly note: string;
  /** Actual pigmentation, not a stratum tint. Also guarantees the organism
   *  contrasts with the wall, which a stratum-derived colour did not. */
  readonly pigment: string;
}

export const MICROBES: readonly Microbe[] = [
  { id:"synechococcus",   name:"Synechococcus",   depth:1, hp:6,  atk:2,  glyph:"s", genes:["psbA","cbbL"], note:"Oxygenic picocyanobacterium. Vents O2 that burns you." , pigment:"#4ec9c0" },
  { id:"chlorella",       name:"Chlorella",       depth:1, hp:8,  atk:1,  glyph:"c", genes:["cbbL","katG"], note:"Green alga. Passive, tough cell wall." , pigment:"#7ed957" },
  { id:"nitzschia",       name:"Nitzschia",       depth:1, hp:10, atk:3,  glyph:"d", genes:["psbA","katG"], note:"Pennate diatom. Silica frustule; glides." , pigment:"#d4a24c" },
  { id:"nitrosomonas",    name:"Nitrosomonas",    depth:2, hp:9,  atk:3,  glyph:"n", genes:["amoA"],        note:"Ammonia oxidiser. Acidifies its surroundings." , pigment:"#cbbb9c" },
  { id:"nitrobacter",     name:"Nitrobacter",     depth:2, hp:9,  atk:3,  glyph:"N", genes:["narG"],        note:"Nitrite oxidiser. Completes nitrification." , pigment:"#bfae8e" },
  { id:"pseudomonas",     name:"Pseudomonas",     depth:2, hp:12, atk:4,  glyph:"p", genes:["narG","nosZ"], note:"Facultative denitrifier. Motile, opportunistic." , pigment:"#cfe04a" },
  { id:"beggiatoa",       name:"Beggiatoa",       depth:3, hp:16, atk:5,  glyph:"B", genes:["soxB","sqr"],  note:"Gliding sulfur mat. Stores S0 granules internally." , pigment:"#f2f2e6" },
  { id:"thiothrix",       name:"Thiothrix",       depth:3, hp:14, atk:5,  glyph:"t", genes:["soxB"],        note:"Filamentous, rosette-forming sulfur oxidiser." , pigment:"#e6e6da" },
  { id:"thiobacillus",    name:"Thiobacillus",    depth:3, hp:11, atk:6,  glyph:"T", genes:["sqr","soxB"],  note:"Chemolithoautotroph. Generates sulfuric acid." , pigment:"#d8cfa0" },
  { id:"geobacter",       name:"Geobacter",       depth:4, hp:18, atk:7,  glyph:"G", genes:["omcS","mtrC"], note:"Grows conductive pili. Reduces solid Fe(III) oxides." , pigment:"#d0603c" },
  { id:"shewanella",      name:"Shewanella",      depth:4, hp:16, atk:6,  glyph:"S", genes:["mtrC"],        note:"Mtr pathway respires minerals. Wildly versatile." , pigment:"#dd9078" },
  { id:"rhodospirillum",  name:"Rhodospirillum",  depth:4, hp:15, atk:5,  glyph:"r", genes:["pufM","nifH"], note:"Purple non-sulfur. Photoheterotroph, fixes N2." , pigment:"#b0527a" },
  { id:"allochromatium",  name:"Allochromatium",  depth:5, hp:22, atk:8,  glyph:"C", genes:["pufM","sqr"],  note:"Purple sulfur. Intracellular S0 globules." , pigment:"#b34a86" },
  { id:"thiocapsa",       name:"Thiocapsa",       depth:5, hp:20, atk:8,  glyph:"h", genes:["pufM"],        note:"Purple sulfur, capsulate. Colonies in slime." , pigment:"#a34fa8" },
  { id:"chlorobium",      name:"Chlorobium",      depth:6, hp:24, atk:9,  glyph:"L", genes:["fmoA","csmA"], note:"Green sulfur. Photosynthesis at near-zero photon flux." , pigment:"#5fd47a" },
  { id:"prosthecochloris",name:"Prosthecochloris",depth:6, hp:22, atk:10, glyph:"P", genes:["csmA","aclB"], note:"Prosthecate green sulfur. Fixes carbon via rTCA." , pigment:"#4fc98e" },
  { id:"desulfovibrio",   name:"Desulfovibrio",   depth:7, hp:28, atk:11, glyph:"D", genes:["dsrA","hydA"], note:"Sulfate reducer. Exhaled H2S blackens the sediment." , pigment:"#a6acb6" },
  { id:"desulfobacter",   name:"Desulfobacter",   depth:7, hp:30, atk:12, glyph:"b", genes:["dsrA","aprA"], note:"Oxidises acetate completely to CO2." , pigment:"#949ba6" },
  { id:"methanosarcina",  name:"Methanosarcina",  depth:8, hp:36, atk:14, glyph:"M", genes:["mcrA","hdrB"], note:"The most metabolically flexible methanogen known." , pigment:"#dcc179" },
  { id:"methanobacterium",name:"Methanobacterium",depth:8, hp:32, atk:13, glyph:"m", genes:["mcrA"],        note:"Hydrogenotrophic. CO2 + H2. The last respiration." , pigment:"#cdba8b" },
];

export interface Stratum {
  readonly depth: number; readonly name: string; readonly teap: Teap;
  readonly e0: number; readonly light: number;
  readonly wall: string; readonly floor: string; readonly accent: string;
  // Redundant, non-colour depth cue: wall fill pattern. Hue alone excludes
  // roughly 8% of men, and D1 and D6 are both green.
  readonly hatch: 0 | 1 | 2 | 3;
  readonly density: number; readonly passes: number; readonly blurb: string;
}

export const STRATA: readonly Stratum[] = [
  { depth:1, name:"Oxic water column",  teap:"O2",      e0: 820, light:1.00, wall:"#6ec78d", floor:"#050d0a", accent:"#d8ffe8", hatch:0, density:0.38, passes:4, blurb:"Sunlit, oxygen-saturated. Everything here burns you slowly." },
  { depth:2, name:"Sediment interface", teap:"NO3-",    e0: 430, light:0.70, wall:"#8cb86b", floor:"#0a0c06", accent:"#e6ffc9", hatch:1, density:0.4, passes:4, blurb:"Oxygen is running out. Nitrate takes over as acceptor." },
  { depth:3, name:"Suboxic Mn/S front", teap:"Mn(IV)",  e0: 400, light:0.42, wall:"#c7bd6e", floor:"#0d0b06", accent:"#fff4c2", hatch:1, density:0.41, passes:5, blurb:"The O2/H2S interface. Beggiatoa mats hold the boundary." },
  { depth:4, name:"Ferruginous zone",   teap:"Fe(III)", e0:   0, light:0.22, wall:"#c26b41", floor:"#0f0703", accent:"#ffcaa8", hatch:2, density:0.42, passes:5, blurb:"Rust. Fe(III) minerals respired by contact and by wire." },
  { depth:5, name:"Purple sulfur band", teap:"S0",      e0:-120, light:0.12, wall:"#a4529c", floor:"#0c050c", accent:"#f0c2ec", hatch:2, density:0.43, passes:5, blurb:"Anoxygenic photosynthesis. Sulfide is the donor now." },
  { depth:6, name:"Green sulfur band",  teap:"H2S",     e0:-180, light:0.05, wall:"#4da767", floor:"#050b07", accent:"#c4f0d2", hatch:3, density:0.44, passes:6, blurb:"Almost no light reaches here. Chlorosomes catch what does." },
  { depth:7, name:"Sulfidogenic black", teap:"SO4",     e0:-220, light:0.01, wall:"#6b6875", floor:"#060608", accent:"#ccc8d8", hatch:3, density:0.45, passes:6, blurb:"FeS precipitate. Sulfide everywhere. The column's black floor." },
  { depth:8, name:"Methanogenic floor", teap:"CO2",     e0:-240, light:0.00, wall:"#8a7a52", floor:"#080602", accent:"#ffe9b0", hatch:3, density:0.47, passes:6, blurb:"The last acceptor. Nothing below is left to reduce." },
];

export const MAX_DEPTH = STRATA.length;

const SURFACE: Stratum = STRATA[0] ?? {
  depth: 1, name: "Oxic water column", teap: "O2", e0: 820, light: 1,
  wall: "#6ec78d", floor: "#050d0a", accent: "#d8ffe8", hatch: 0,
  density: 0.38, passes: 4, blurb: "",
};

/** Total: any depth clamps into range rather than returning undefined. */
export const stratum = (d: number): Stratum =>
  STRATA[Math.min(Math.max(Math.floor(d), 1), MAX_DEPTH) - 1] ?? SURFACE;

export const microbesAt = (d: number): Microbe[] =>
  MICROBES.filter((m) => m.depth === d);

/** Energy multiplier: 1.0 at the oxic top, ~0.04 on the methanogenic floor. */
export function energyYield(depth: number): number {
  const lo = -240, hi = 820;
  return Math.max((stratum(depth).e0 - lo) / (hi - lo), 0.04);
}
