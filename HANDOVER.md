# Microgue — handover

A turn-based roguelike descending the redox tower of a Winogradsky column. You
play an engineered microbial nanobot; you fight real microorganisms and take
their genes by horizontal transfer into a plasmid with finite capacity.

Live: `https://binomica-labs.github.io/Microgue/`
Repo: `Binomica-Labs/Microgue` — the playable game is in `web/`.

---

## Read this first

Six things a reasonable-looking change will break. Each of these was arrived at
the hard way; none are arbitrary.

1. **The service worker cache name is derived, not written.** `build.mjs`
   hashes the bundle, index.html, manifest and icons and injects the result as
   `__BUILD__`. Do not replace it with a constant: a hand-bumped version was
   forgotten twice, and a forgotten bump ships a deploy that CI passes and no
   user ever receives. The build fails if the hash does not reach `sw.js`.
   `public/BUILD` records the current value.

2. **Keep stratum `density` under about 0.47.** The cellular automaton is
   bistable: past that the open space fragments into pockets and
   `keepLargestRegion` seals almost all of it. D5–D8 once shipped at 0.50–0.58
   and generated levels with 1–3% open floor — solid rock with twenty microbes
   in it. `Dungeon.build` retries at lower density as a backstop and `spec`
   asserts every level clears 25% open, but the tuning is the real fix.

3. **Fe(III) reduction belongs at D4, not at the bottom.** The original brief
   said "down to anaerobic iron reducers," and that is wrong. In real columns
   Fe²⁺ *declines* below ~50 cm as sulfide precipitates it as FeS — which is
   what blackens the sediment — and methanogenesis is the floor. The ladder is
   O₂ → NO₃⁻ → Mn(IV) → Fe(III) → S⁰ → H₂S → SO₄²⁻ → CO₂. `spec` asserts this;
   if a test starts failing there, the test is right.

4. **Sprites are role grids, not colours.** `pixels.ts` stores `.1234` per
   pixel — transparent, dark, body, accent, hi — which is why the organism's
   own pigment still tints them. Writing hex into a sprite breaks that. If a
   sprite is missing from `PIXELS`, `paint.ts` falls back to the vector
   morphology in `shapes.ts`, so both paths must keep working.

5. **Mob colour comes from `pigment`, never from the stratum.** An earlier
   version derived it from `stratum.wall`, which made Geobacter rust-coloured on
   a rust-coloured wall — invisible. Pigments are the organisms' real
   pigmentation (phycocyanin, fucoxanthin, bacteriochlorophyll, FeS grey), and
   they double as the contrast guarantee. The soft halo in `paint.ts` is the
   other half of that guarantee; don't remove it.

6. **`Grid` is a class over a `Uint8Array` for type safety, not speed.** Its
   `get` is total — out of bounds returns `WALL`, because the world genuinely is
   solid outside the map — so it returns `Tile`, never `Tile | undefined`.
   Reverting to `Tile[][]` reintroduces ~20 non-null assertions. Benchmarks say
   the typed array is *not* faster here; V8 already packs small-int arrays.

7. **Pathfinding is `DIAGONAL` with tunnelling off.** Not orthogonal. A
   diagonal step is refused only when *both* orthogonal neighbours are walls, so
   routes cut across open ground but cannot squeeze a wall pinch. Orthogonal
   made every route a right-angle detour: 20% longer on a real level, 89% on
   clear ground.

8. **Walls are traced, not tiled.** `walls.ts` rounds a corner where both
   orthogonal neighbours are floor and adds a meniscus fillet where three tiles
   meet in an L. Every tile is a subpath filled together under nonzero winding,
   so shared edges merge seamlessly — drawing them separately reopens the seams.
   Radius 0.5 was chosen by rendering a sweep; below ~0.4 the grid is still
   legible in the silhouette.

9. **`npm run verify` gates the build and everything in it is an error, not a
   warning.** `any`, `@ts-ignore`, non-null `!`, `==`, implicit coercion, and
   any `.js` file appearing under `src/` or `test/` all fail the build. That is
   deliberate; the owner explicitly wants TypeScript, not JavaScript with types
   sprinkled on.

---

## Layout

```
web/
  src/
    rng.ts        seeded mulberry32; generation is reproducible
    biology.ts    8 strata, 20 organisms, 21 loci, pigments   <- the design doc
    genome.ts     plasmid: capacity, burden, O2 lability, expression
    mapgen.ts     Grid class, CA caves, region sealing, spawn placement
    path.ts       A* with a binary heap (~90 lines, replaced jumper's ~1400)
    dungeon.ts    multi-level descent, level caching, mob spawning
    shapes.ts     organism morphologies as shape data in unit space
    paint.ts      shape painter, sprite cache, per-stratum wall motifs
    walls.ts      organic wall contouring (corner classification + tracing)
    pixels.ts     16x16 pixel art as role grids -- EDIT THIS for sprite work
    shapes.ts     the vector morphologies pixels.ts was seeded from
    plasmid.ts    the ring + parts bin: operons, polarity, synergy, complexes
    plasmid_ui.ts ring rendering + polar hit-testing for drag and spin
    kegg.ts       KEGG modules + the metabolite graph they derive into
    kegg_ui.ts    pannable node graph, caption relaxation, screen/world transforms
    buttons.ts    on-screen controls
    gesture.ts    pointer gesture classification, pure and tested
    entity.ts     the tagged union -- add a kind and switches stop compiling
    status.ts     status effects: one list per entity, one loop
    behaviour.ts  motility patterns and size classes
    footprint.ts  multi-tile bodies: filaments lie along their own axis
    weapons.ts    the four ranged mechanisms, line of sight, cloud discs
    projectile.ts travelling particles and lingering gradients
    pursuit.ts    chase-to-kill, re-pathed every turn
    run.ts        the roguelike layer: resynthesis, notebook, export
    ncbi.ts       real sequences: Entrez queries, caching, throttling
    chrome.ts     shared screen furniture: close button, header, wrap
    screens.ts    splash and notebook, as free functions
    items.ts      floor loot: gene cassettes and metabolisable substrates
    flavour.ts    all player-facing combat and pickup text
    fov.ts        recursive shadowcasting, plus remembered terrain
    cycle.ts      the diel cycle: daylight, night, chemocline shift
    rooms.ts      chambers carved into the cave: ports, mats, blooms, vaults
    combat.ts     the microbe turn, extracted and testable without a canvas
    saves.ts      named characters in numbered slots
    toast.ts      transient notices + guard(), the error boundary
    fx.ts         effects: easing, lunge, shake decay, hitstop -- all pure
    motion.ts     facing, short-arc turning, squash, wake -- all pure
    hud.ts        Winogradsky column gauge, bars, plasmid ring
    save.ts       localStorage with a real runtime validator
    main.ts       canvas, input, game loop  <- the only DOM-aware file
    sw.ts         service worker (own tsconfig: WebWorker lib)
  test/logic.test.ts    45 assertions, no browser needed
  public/               build output + icons + manifest
.github/workflows/pages.yml     push -> verify -> build -> deploy
sync.sh              one-command update from a downloaded tarball
```

`biology.ts` is where the game design actually lives. Strata, organisms, genes,
and their constraints are all data; changing the game usually means changing
that table, not the code.

**Engine-free core.** `biology.ts`, `genome.ts`, `mapgen.ts`, `path.ts`,
`dungeon.ts`, `rng.ts`, `shapes.ts` contain zero DOM references. That is what
made the port from Lua cheap, and it is worth preserving — keep `main.ts` and
`paint.ts`/`hud.ts` as the only files that touch a canvas.

---

## Commands

```bash
cd web
npm ci
npm run dev       # esbuild --watch
npx serve public  # then open localhost; service workers work on localhost

npm test          # 45 assertions, headless
npm run check     # tsc --noEmit, both tsconfigs
npm run lint      # eslint strictTypeChecked
npm run verify    # guard + check + lint + test
npm run build     # verify, then bundle main.ts and sw.ts
```

Deploy is `git push`. The workflow filters on `web/**`, so touching only docs
won't trigger a build.

---

## Decision log

**Left LÖVE for the browser.** The game draws rectangles and one circle; a
love.js WASM build ships several megabytes of engine to do it. The TypeScript
build is 14 kB gzipped and needs no install on any platform, which was the
actual goal — "playable on any device" meant a URL, not more native targets.

**No framework, no renderer library.** Canvas 2D with a hand-rolled A*. At
these grid sizes the per-frame budget is ~0.008% consumed; a rendering library
would be pure weight. If sprite counts ever reach thousands, PixiJS is the
drop-in.

**RNG is injected, not global.** The Lua version called `love.math.random`,
which made generation unreproducible and coupled logic to the engine. Now the
same seed gives a byte-identical column, which is what lets `spec` verify that
every level is fully connected and every mob reachable.

**Sprites are data, not drawing code.** `shapes.ts` emits primitives in unit
space; `paint.ts` replays them on canvas. The same list can be replayed
offline, which is how the art was reviewed without a browser. It also makes a
morphology an editable table.

**Morphology is diagnostic.** Rhodospirillum is a spiral, Desulfovibrio a
curved vibrio, Nitzschia a pennate frustule with raphe and striae,
Methanosarcina a cuboidal packet, Geobacter a rod with radiating pili. The
sprite is meant to teach recognition. Keep new organisms honest.

**Sources for the biology:**
- Pelletier et al. 2017, *FEMS Microbiol Ecol* 93:fix089 — TEAP gradients,
  Fe²⁺ decline and FeS/pyrite formation below ~50 cm
- Rundell et al. 2014, *PLoS ONE* 9:e104134 — 16S community structure by depth
- Madigan et al., *Brock Biology of Microorganisms* — the redox tower

E°′ values are midpoint potentials at pH 7 in mV. Fe(III)/Fe(II) is
deliberately near zero: it swings roughly −100..+100 mV at circumneutral pH
depending on mineral phase. The +770 mV textbook figure is the pH 2 aqueous
couple and does not apply here.

---

## Why a tagged union and not an ECS

Two entity kinds today, four declared, at most 22 on screen. ECS earns its keep
at many kinds with combinatorial capabilities or thousands of entities; neither
applies, and the frame budget was measured at 0.13% for the whole plasmid read
path.

The decisive argument is the opposite of performance. The recurring bug in this
codebase has been forgetting a parallel path -- the keyboard guard missed after
the pointer fix, the stale test file, the sprite palette left on the old
function. A discriminated union makes that a build failure: add a kind and
`describeEntity` and `blocks` stop compiling until it is handled. Component
bags are dynamically typed at the query boundary, so a system that should have
handled a new component silently does not.

Revisit if kinds pass roughly six AND behaviours genuinely cross-cut.

`status.ts` is the useful tenth of an ECS: one list on the entity, one loop
applying it, effects as data. Adding antibiotic exposure or phage infection is
a table entry rather than a branch in three places.

## Timing assertions are smoke bounds, not measurements

Three tests check wall-clock cost. They caught a real 5.6 ms regression, so
they earn their place -- but a bound tight enough to measure this machine is a
bound that fails on a loaded one, and a flaky test is worse than none. Where
the guarantee can be asserted directly it is: the pathfinding budget is tested
by showing a tiny `maxNodes` fails even where a path EXISTS, which proves the
cap does the work. The clock bounds that remain are deliberately loose and
only trip on an order-of-magnitude regression.

## The player sprite

A round body with a thick stalk reads as an eyeball with an optic nerve. The
cell is a BACILLUS -- elongate, capped at both poles, aspect ratio asserted in
`spec` -- with a thin plasmid ring set posterior and off the midline, because a
ring dead centre in a round body is a pupil.

The flagellum is NOT in the pixel art. It is stroked in `paint.ts` inside the
body's own rotated frame, as a travelling sine whose amplitude grows toward the
free end, with a soft halo pass beneath the filament so it reads against any
wall. It is drawn that way so it can BEAT: the phase runs off the clock and
speeds up while swimming, and motion is most of what makes a filament read as
one. `settings.reduceMotion` freezes it.

## Two identity bugs worth remembering

`Microbe.uid` exists because `id` is the SPECIES and position changes every
turn. Keying the sighting alert on species-plus-position re-fired it on every
step, for ever -- "A Nitzschia comes into view" once per turn until you killed
it. Anything that must happen ONCE per creature keys on `uid`.

The player sprite has been rendered 90 degrees off since v26: `drawBody` was
given `axis: "north"` when the art pointed north, then the art was redrawn
pointing east at v32 and the axis was never changed. There is a test asserting
the player art's long axis is horizontal and that the flagellum sits WEST of
the body -- behind it, since the cell points east.

## Sprite art axis

Organism sprites are drawn as horizontal rods, so their long axis is EAST. The
player nanobot has a prow drawn pointing NORTH. `drawBody` takes an `ArtAxis`
for exactly this reason: between v20 and v25 it assumed north for everything,
which rendered every rod perpendicular to its own direction of travel. If a new
sprite is authored vertically, pass `"north"`.

## Multi-tile bodies

Size is not decorative. A Beggiatoa filament reaches 200 um across against
about 1 um for a Synechococcus cell, so `filament` occupies three tiles along
its own long axis and `large` occupies a 2x2 block. Consequences that fall out
rather than being scripted:

- A filament needs its whole footprint clear to move, so it cannot turn in a
  corridor narrower than itself.
- Distance is measured from the NEAREST occupied tile, so a filament reaches
  you from either end.
- Spawning validates the whole footprint, so a large body never appears half
  inside rock.

`covers()` and `tilesOf()` are the only sources of truth for occupancy;
`mobAt`, `occupiedBy`, `decideStep` and spawning all go through them. A test
runs 25 turns of mixed footprints and asserts no two bodies ever share a tile.

## The original brief, and what it demands

The design is from a thread of Sebastian's, July 2021. Two clauses in it are
the whole game and are easy to lose:

**"Each layer poses an environmental risk due to lack of means to keep ATP
pumps going so lifebar slowly drops until metab genes found."** When ATP hits
zero and the balance is negative, hp bleeds. That is not a flourish -- it is
the reason to descend carefully and the reason a looted gene matters. Do not
soften it into a cosmetic warning.

**"If your character dies, you get resynthesized with some of the genes you
acquired in the previous run."** Death ends the run and reseeds the dungeon,
but the lineage keeps the earliest-acquired half of its loci. Not permadeath,
not a free respawn.

Also from the thread: layers run on the WASTE of their neighbours -- biomass
sinks, sulfide rises -- which is why every stratum names a `donor` and a
`donorFrom`. And the notebook exists because the brief says "recording the
bugs you find along the way".

The export emits real FASTA, with sequences pulled from NCBI at export time.

Two choices worth keeping. **Queries, not accessions**: `SOURCES` holds an
Entrez query per locus (`mtrC[Gene] AND "Shewanella oneidensis"[Organism]`)
rather than a baked accession, because a query is self-documenting, survives
reannotation, and is legible when wrong. **Fetched, not bundled**: two dozen
coding sequences are tens of kilobytes of bases, more than the whole rest of
the game, so they are pulled on demand and cached in localStorage.

`parseFasta` refuses anything that is not bases, so an NCBI error page cannot
become a sequence. A locus that fails to fetch is emitted as a comment
carrying its query -- never as invented bases, and there is a test asserting
that. NCBI asks for at most three requests a second without an API key, hence
the 400 ms throttle.

CORS on eutils could not be verified from the build environment, so the path
is written to degrade rather than assume: if the fetch is blocked the export
still succeeds, with queries in place of sequences.

## How microbes shoot

Four mechanisms, four mechanics, because they really are different things:

- **spear** — type VI secretion. A contractile phage-tail homolog firing a
  VgrG/PAAR spike. Contact-dependent, so adjacent only, but 2.6x damage and a
  visible wind-up turn. Pseudomonas.
- **bolt** — extracellular electron transfer down an OmcS nanowire. Instant,
  range 3, requires clear line of sight. Geobacter.
- **packet** — a tailocin (R-type pyocin) or an outer membrane vesicle. A real
  particle moving one tile per turn, so it can be sidestepped. Carries the
  phage status on impact. Prosthecochloris, Methanosarcina.
- **cloud** — diffusible bacteriocin, sulfuric acid, exhaled H2S. Not a shot:
  a gradient that lingers on the ground for six turns and denies it.
  Thiobacillus, Desulfovibrio.

Wind-up is the tell and it is abortable -- stepping out of range clears a
charge rather than banking it. Readiness is sampled before the reload
decrement, because doing it the other way round made a cooldown of 1 gate
nothing.

## Motility is diagnostic

`Behaviour` is not a difficulty knob. Pseudomonas chases because it has a polar
flagellum and chemotaxis. Beggiatoa and Nitzschia glide, and gliding needs a
surface -- they cannot cross open water. Thiothrix is `sessile` because a
holdfast anchors it. Geobacter is `wire`: it never closes distance and strikes
down a conductive pilus instead. Sizes span pico to filament because the real
range does, from a 1 um Synechococcus to a 200 um Beggiatoa; large bodies hit
harder, carry more hp and act less often.

## The ATP economy

Expression costs ATP; respiration supplies it. Both are real, and together they
are what makes depth a constraint rather than a label.

**`energyYield` must NOT multiply expression.** It used to, which meant every
gene expressed at 4% on the methanogenic floor -- including `mcrA`, the gene
that floor exists for. Expression is set by regulation (promoter strength,
position in the transcript, co-regulation); the terminal acceptor's midpoint
potential belongs on the ATP income. The whole depth gradient lives in
`atpGain`, where the same proteome earns 0.4x on the floor of what it earns at
the surface.

Under-supply browns expression out proportionally rather than switching it off,
which is what a cell does under energy limitation. `atpCost` is computed from
`rawExpression` so cost and brownout cannot chase each other.

`sat` (ATP sulfurylase) has a NEGATIVE generator rate. Sulfate must be
activated to APS at a cost of two ATP equivalents before anything can reduce
it, which is why sulfate reduction is energetically marginal and sulfate
reducers grow slowly.

Generator rates and `COST_PER_KB` were found by sweeping against a fixture:
every canonical respiration must pay for itself at its own depth, and every
generator-free hoard must drain -- harder the deeper it is carried. Those are
assertions in `spec`, so retuning that breaks the shape fails the build.

## The plasmid, biologically

Four layers, each a real thing:

1. **Transcription.** A promoter reads downstream until a terminator, a gap, or
   the next promoter. A gene outside any operon is carried but silent.
2. **Polarity.** Expression decays 0.82x per position from the promoter, so a
   long operon starves its tail.
3. **Clustering.** Same-pathway neighbours co-regulate (+18% each), which is
   what operons are *for*.
4. **Complexes.** A pathway only works when every step is present, in ONE
   operon, all expressing at the current depth. `mtrC`+`omcS` is contact plus
   nanowire electron transfer and grants reach 2. `dsrA`+`aprA` completes
   sulfate reduction and the exhaled H2S burns adjacent cells. `nifH`+`hydA` is
   nitrogenase with an uptake hydrogenase recycling the H2 it obligately
   evolves. `katG`+`sqr` covers peroxide and sulfide.

And the inverse: **HAZARDS** are half-built pathways. `narG` without `nosZ`
leaves nitrous oxide; `aprA` without `dsrA` leaves sulfite; `psbA` without
`katG` leaves photo-oxidative damage. Each costs hp per action. A partial
pathway is genuinely worse than none, which is true of real metabolism.

Loot goes to the **parts bin**, not onto the ring — acquiring a gene and
deciding where it goes are separate acts. `install`/`uninstall` conserve
parts: a displaced part returns to the bin rather than vanishing, and there is
a test asserting the total never changes.

## The pathway graph closes into real cycles

`EDGES` is derived from `MODULES`, so the graph cannot drift from the module
data. Because metabolites are shared, the modules are not eight parallel
chains — N2 leaves denitrification and re-enters at fixation, H2S leaves
sulfate reduction and re-enters at sulfur oxidation. `spec` walks the edge set
and asserts both cycles close; if a step is retargeted so a cycle breaks, that
fails.

Layout invariants are tested rather than eyeballed: no two nodes overlap, no
caption overlaps another caption or a metabolite box, no edge spans more than
420 units. `moduleBoxes()` relaxes captions apart because raw centroids collide
whenever two modules share a region.

Two electron pools, not one: nitrogenase draws from reduced ferredoxin and the
photosynthetic reaction centre feeds the quinone pool. Merging them was both
wrong and produced an edge across the whole map.

## Auto-assembly is deliberately not a free win

`Plasmid.assemble()` lays a module out as one operon in reaction order, but it
requires a spare promoter from the bin and a run of contiguous free slots, and
it fails with a reason rather than shuffling the ring. The arrangement puzzle --
promoter strength, polarity ordering, what you displace -- stays the player's.
Making it always succeed would turn the ring into decoration; there are tests
for each refusal.

## Guards

Cross-table invariants live in `spec` and exist to catch data drift rather than
any single wrong value:

- every gene is obtainable from some organism, or is a documented starter
- every complex and every KEGG module is assemblable from what actually drops
- every hazard is escapable — the gene that clears it must be findable
- no gene exceeds plasmid capacity; no module needs more slots than the ring has
- every microbe has a sprite and a pigment; ids are unique and self-consistent

Add a gene, organism, complex or module without wiring it up and one of these
fails, instead of the feature silently being unreachable.

`save.ts` enforces `SCHEMA`. An older save is discarded rather than
half-loaded — `version` was previously written and never read, which would have
fed a flat gene list into ring code during the plasmid rewrite.

## Nothing may throw out of a browser boundary

Every entry point the browser calls into -- frame, pointerdown/move/up, keydown,
resize -- is wrapped in `guard()`, which reports to a toast and returns a
fallback rather than propagating. The frame loop reschedules in a `finally`, so
one bad frame is a bad frame and not a dead game.

This exists because it already happened: a throw in `frame()` before the
`requestAnimationFrame` call left a permanently black screen with no console to
read on a phone. A silent failure on a mobile device is the worst outcome
available, so recovered errors are drawn.

Repeated messages collapse within three seconds, so a per-frame failure cannot
spam; the queue is capped at four.

## Performance, measured twice

Per-frame costs before and after a caching pass:

| | before | after |
|---|---|---|
| `paletteForPigment` x22 | 33.2 us | 0.1 us |
| mob loop (effect scan) | 27.1 us | 1.7 us |
| `drawHud` plasmid reads | 27.3 us | 3.8 us |
| `atpBalance` | 9.7 us | 0.2 us |

`paletteForPigment` re-parsed a hex string four times per mob per frame and was
the single largest cost in the draw path; the input set is twenty pigments, so
the cache never needs invalidating. The lunge scan was O(mobs x effects) and is
now indexed once per frame. `traceWalls` ran twice -- fill then clip -- and now
builds one `Path2D` used for both, which also makes the two identical by
construction rather than by hoping the calls match.

**The plasmid memo is the one with a stale-cache risk**, so its invalidation is
tested rather than trusted: a `rev` counter bumped by `touch()`, and a test
that enumerates every public mutator and asserts each one bumps it. Adding a
mutator without invalidating fails that test.

## Measured, and deliberately not optimised

The plasmid read path — `power`, `armour`, `regen`, `reach`, `aura` and an
operon count, everything the HUD touches — is 21.8 us per frame, 0.13% of the
budget. `traceWalls` over a viewport is 16.5 us. `complexes()` is 10 us. None
of it is worth caching, and caching it would add invalidation bugs.

The one real cost was `insets()`: `createElement` plus `getComputedStyle`
forces a style recalculation, and it ran four times a frame. It is cached now
and cleared on resize.

## Juice, and why the timing lives in a pure module

`fx.ts` holds easing, lunge offsets, shake decay and hitstop as pure functions,
because the failure mode for game feel is an effect that never expires or a
freeze that never lifts — things a test catches and an eyeball does not. The
suite asserts a lunge returns to exactly zero offset, shake decays to exactly
zero, the effect queue is bounded at 160, hitstop is capped at 120ms no matter
how many kills land in one frame, and particle jitter is deterministic so a
burst does not shimmer between frames.

Hitstop freezes `dt`, not the turn loop. Turn state has already resolved by the
time an effect is queued, so nothing can desync — the world just holds still.

One attack is: lunge out and back over 190ms peaking at 0.44 tiles, a white
flash on the target at +60ms, a damage number rising and fading over 620ms,
camera shake scaled to damage and capped, and 28ms of hitstop. A kill adds a
14-particle burst in the organism's own pigment, a bigger shake and 70ms of
stop. A ranged strike draws a jagged nanowire bolt instead of a lunge, and HGT
sends a green bolt from the corpse to you with the locus name floating up.

## Facing follows morphology

`Microbe.facing` is `rotate | flip | none`, and it is not a style choice.
Elongate cells -- rods, filaments, vibrios, spirilla -- align their long axis
with motion. Cocci and sarcinae have no long axis, so rotating them is
invisible. `thiothrix` is `none` because it is anchored by a holdfast: an
organism that cannot move should not turn. There are tests naming each case.

Sprites are authored pointing NORTH, so `drawBody` rotates by
`heading + PI/2`. Squash is applied AFTER rotation, along the body's own
forward axis, which is what makes a cell look like it is launching rather than
merely getting wider.

`turnToward` takes the short arc. Turning from 170 to -170 degrees is a 20
degree turn, not 340; the suite checks every pair of 64 x 64 angles.

## The loop

Descend the column, take what the layer gives you, arrange it so it expresses,
and use it to survive the layer below. Concretely:

1. Every stratum needs a respiration that works there. Without one, ATP runs
   out and hp bleeds until you find the gene.
2. Genes come off the floor -- from kills, from room caches, and at 25% by
   natural transformation from a lysing neighbour.
3. Having a gene is not carrying it. It has to sit downstream of a promoter,
   in the right operon, inside the plasmid's capacity.
4. Toughness IS the plasmid, so building it well is the only progression.
5. Every third floor is sealed until its elites are dead. That is the gate.
6. Floor 24 is the bottom. Clearing it ends the run.

Rooms exist so a level is a place rather than a corridor. A **port** is a
sampling port cut through the glass -- Winogradsky columns are built with them
-- and is stocked accordingly. A **mat** is a Beggiatoa/Thiothrix community at
the redox interface, so it only appears in D3-D7. An **enrichment** is a pocket
that has been growing undisturbed: sealed but for one way in, well guarded,
and worth crossing the level for.

Rooms are carved AFTER the disc mask and BEFORE the connectivity sweep, and
they are chained to each other and then to the cave. Linking each room to its
nearest floor tile instead attached some of them to pockets that the sweep then
pruned, taking the rooms with them.

Cave density was raised to 0.50-0.63 once rooms existed: the rooms and their
corridors are what keep a dense cave connected, and without them the disc was
an almost empty circle.

## The column has 24 floors and is round

`FLOORS_PER_STRATUM = 3`, so eight strata become twenty-four floors and each
biome is a place rather than a doorway. `Dungeon.floor` is the index;
`Dungeon.depth` is a GETTER returning the stratum, so every biological call
site kept working untouched. `level()` is keyed by floor -- it used to clamp to
MAX_DEPTH, which silently collapsed floors 9-24 onto floor 8.

Levels are masked to a disc, because a Winogradsky column is a graduated
cylinder and a rectangular cave never looked like the thing the game is set
inside. The grid is square (96x96) so the disc is large.

The last floor of every stratum is a boss floor: half the time one overgrown
individual, half the time a bloom of a single species -- which is what a column
actually produces when a layer's chemistry runs away with it.

## Day and night, and why bioluminescence is a surface trait

A column sits on a windowsill. At night oxygenic photosynthesis stops while
respiration does not, so the oxic zone thins and the chemocline rises -- real,
and measured. Light-dependent genes stop paying and the upper floors go dark,
which means you see least exactly where you were seeing most. Below the photic
zone nothing changes, because the deep column has no day.

`luxAB` is gated on O2 because luciferase IS an oxygenase. It grants +2 sight
and costs ATP to run, so it is a genuine trait in the top two strata and dead
weight everywhere below. That is the lesson, not a balance decision.

## Balance is asserted, not assumed

`spec` builds a capacity-respecting kit per depth and checks the curve: the
surface must survive twelve-plus hits, the floor fewer than eight, and no floor
may present something that takes more than thirty turns to kill. Toughness
comes from `Plasmid.vitality` -- expressed genes and complexes -- so building
the plasmid IS the character progression. It had none before: maxhp sat at 30
for all 24 floors while microbe damage went from 3 to 25.

Burden is capped below 1. At exactly 1 an over-capacity plasmid expressed
literally nothing, which is a silent cliff rather than a cost.

## Sight

The whole level used to be visible, which removed exploration, ambush and any
reason for the map to unfold. `fov.ts` is recursive shadowcasting with two
layers per level:

- **visible** -- lit now, recomputed on every step
- **seen** -- remembered. Terrain stays drawn once found; creatures and loot do
  NOT, because memory of a room is not knowledge of what is standing in it.

Sight radius follows the column's own light gradient, so the photic zone is
open and the methanogenic floor is claustrophobic. Vision is symmetric enough
to be fair -- there is a test asserting that if you can see a tile, something
there could see you.

Travel interrupts when something new comes into view, which is the single
thing that stops auto-travel walking you into a fight. The spotted set is
cleared as things leave sight, so re-entering a room alerts again.

## Loot, and why it is not automatic

Kills drop remains on the floor rather than teleporting a gene into the bin.
A single item is taken by stepping on it; more than one opens as a lysate
container. Substrates follow the chemistry of their layer -- nitrate in the
nitrogenous zone, ferric iron at D4, hydrogen and CO2 on the floor -- and
several are GATED: sulfide is worth nothing without `sqr`, hydrogen nothing
without `hydA`. Picking up a substrate you cannot use tells you which enzyme
you are missing, which is the game teaching itself.

Direct uptake still happens, at 25%: free DNA released by a lysing neighbour
is the classic substrate for natural transformation, so occasional
transformation on the spot is correct. The rest of the genome hits the floor.

`flavour.ts` owns every player-facing line. A log that says "Geobacter
destroyed." teaches nothing; "The Geobacter ruptures. Cytoplasm spills into the
pore water." says what a lysis is. Lines vary by damage, by weapon and by
outcome, and there is a test asserting they are not all identical.

## Found in the adversarial audit

Five defects, every one silent:

1. **The lineage was never saved.** `run` -- notebook, deepest depth, death
   count -- was written nowhere, so every sighting was discarded when the tab
   closed. It is in `SaveData` now and validated: unknown organism ids and
   duplicates dropped, depth clamped to the column. Schema 4.
2. **A failed A* was exhaustive.** `findPath` walked all 8800 tiles before
   giving up and `nextAction` did it eight times: 5.6 ms whenever a target sat
   behind a wall, a guaranteed dropped frame. There is a node budget now
   (`maxNodes`, default 4000) and pursuit tries two goals rather than eight,
   since all of them ring the same body and share its component.
   5577 us -> 828 us, with a test asserting the bound.
3. **A new slot inherited the previous culture's notebook**, because `run` was
   only ever initialised as a field default.
4. **Three overlays hand-rolled the same close button** -- three places to fix
   a layout bug and three to forget one. `chrome.ts` owns it.
5. **`entity.ts` was dead.** The tagged union was argued for, built, and never
   wired in; `Mob` was a parallel declaration free to drift from it. `Mob` is
   now `Microbe` from `entity.ts`, so the union is load-bearing and adding a
   field in one place cannot silently miss the other.

Every one is now a test that fails if it returns.

## Failure modes seen repeatedly

Worth knowing, because they recurred:

- **A test that cannot fail.** The original corner-cutting check ran on a fully
  open interior, counted diagonal steps, and called them corner cutting. There
  were no corners. It passed for years of nothing. When adding a test, first
  make it fail on purpose.
- **A check whose precondition is false.** "Escape cancels a walk" passed
  without ever verifying a walk had started. `--selftest` in the Lua version
  exists because of this; the TS suite asserts on returned state instead.
- **Lua/JS truthiness.** `0` is truthy in Lua; `false || null` collapses in JS.
  Both produced bugs that looked like logic errors and were type errors.
- **`JSON.parse` returns `any`.** It was piping unvalidated save data straight
  into game state. `save.ts` narrows `unknown` explicitly now — keep it that
  way; a corrupted localStorage entry should be rejected, not trusted.
- **Rendering is unverified.** There has never been a browser in the loop. All
  45 tests are logic; layout and paint have only been checked by rendering the
  same shape data offline. Treat any visual claim in code comments as a
  hypothesis.

---

## State

**Working:** 8 procedurally generated strata with stairs and level caching;
20 organisms spawning at their real depths; bump combat; HGT on kill; plasmid
with capacity, burden, oxygen lability and depth-gated expression; circular
plasmid map; sprites and wall motifs; Winogradsky column HUD; localStorage
save/resume; PWA install with offline play.

**Not built yet:**
- Gene *effects* beyond damage. `omcS` should be a ranged nanowire strike,
  `sqr` should gate survival in the sulfidic zones, `katG` should be required
  to survive D1. Right now every gene just adds to `playerAtk()`.
- A codex. `dsrA` and `mcrA` are a wall for anyone who isn't a microbiologist,
  and the biology is the actual pitch. `GENES[].desc` already holds the text.
- Sound. Nothing at all.
- Accessibility beyond redundant encoding: no screen reader support (canvas has
  no accessibility tree), no user-facing text scale control.
- The `settings.reduceMotion` and `uiScale` fields exist and are persisted but
  have no UI to change them.

**Stranded:** the original LÖVE version has six commits — the crash fix, the
spec suite, the hot-reload rig, the Winogradsky data in `biology.lua` — that
were never pushed and live only in a local clone on another machine. The
`Microgue.love` and Lua files at the repo root are the *old* pre-fix state.
Either recover those commits or treat the Lua tree as abandoned; right now it
is misleading.

---

## Next

In rough order of value:

1. Gene effects. The plasmid is the best system in the game and currently only
   changes a damage number.
2. Codex, reachable from the plasmid screen — tap a gene, read what it does and
   which organism it came from.
3. Tune wall motif density on a real screen. It was set by rendering mocks
   offline and is the most likely thing to be wrong.
4. Balance. Nothing has been tuned; hp, damage and spawn counts are first
   guesses.
