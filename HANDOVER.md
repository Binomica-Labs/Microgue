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

1. **Bump `VERSION` in `web/src/sw.ts` whenever a bundled asset changes.** The
   service worker is cache-first. Forget this and the deploy succeeds, the
   Actions run goes green, and the app keeps serving the old bundle forever. It
   looks exactly like "my change did nothing."

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
    kegg.ts       KEGG modules: metabolite chains, EC numbers, completeness
    kegg_ui.ts    the module map -- greyed arrows for enzymes you lack
    buttons.ts    on-screen controls
    gesture.ts    pointer gesture classification, pure and tested
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

## Auto-assembly is deliberately not a free win

`Plasmid.assemble()` lays a module out as one operon in reaction order, but it
requires a spare promoter from the bin and a run of contiguous free slots, and
it fails with a reason rather than shuffling the ring. The arrangement puzzle --
promoter strength, polarity ordering, what you displace -- stays the player's.
Making it always succeed would turn the ring into decoration; there are tests
for each refusal.

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
