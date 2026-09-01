# v1.2.0 — relict pockets, and walls with mass

## The wall motif cost the entire frame budget

Fixing the `px >= 40` gate in v1.2.0 made the stratum texture draw for the
first time -- and it cost about FIVE THOUSAND canvas operations a frame: an
`arc` and a `fill` per mark, per wall tile, per frame, over roughly 620 visible
wall tiles. It had been free only because it never ran. That is the whole
budget on a phone, and it is why the game went from smooth to unplayable in one
version.

It is rasterised once into a 4x4-tile block and used as a fill PATTERN now. One
`fill` for the entire wall area. The block cannot be a single tile: the motif is
hashed per tile precisely so texture never repeats, and a 1x1 pattern would undo
that. Cached per stratum and per tile size, with the size quantised so a pinch
does not rebuild it every frame.

**`seenCount` was a 9216-byte scan per frame.** The minimap keys its terrain
cache on how much has been uncovered, and computed it by walking the array --
sixty times a second, to discover almost always that nothing had changed. It is
maintained incrementally in `fov.ts` now, where `seen` is written: 0.10 ms a
frame down to 0.08 microseconds.

`spec` bounds both: under 200 arcs per frame, and at most one canvas allocated
across thirty still frames. Verified by restoring the per-tile loop.

The general lesson: making something DRAW that never drew is not a cosmetic
change, it is a new per-frame cost, and it deserves the same measurement as any
new feature. The gate was hiding the cost, not just the texture.

## A relict that cannot be sealed is not a relict

Off-stratum genes are the one reward that must be bought by expressing
something. Two paths left a relict unsealed -- a stair landing inside it, and
sealing it cutting the route to the exit -- and both handed those genes to
anyone who walked past. Either case DEMOTES the pocket to a plain chamber now.
Measured across 480 floors: 4 unsealed before, 0 after, and still a route to
every exit.

The existing guard was working, incidentally. It correctly refused to seal a
pocket containing a stair; what was missing was doing anything about the
consequence.

## Stop scanning source. Import the module.

Three separate ad-hoc regexes over `biology.ts` got the gene list wrong in one
session. One required exactly one space after the colon and silently missed the
three ALIGNED entries -- `sqr`, `sat`, `ori` -- reporting 66 genes where there
are 69. On the strength of that I removed `bchY` from the phenotype pigments
believing it did not exist.

It does not exist, as it happens, so the change was right. That is worse, not
better: a bad method that returns the right answer teaches you to keep using
it.

`spec` now imports GENES and BARRIERS and checks every gene named by a barrier
or an organism is real, and that every barrier has a key reachable at or above
the depth it appears -- a seal whose only key lives deeper is a wall, not a
gate. Verified by planting a fake gene id: two failures.

## The relict pocket

Loot was `microbesAt(depth)` -- strictly stratum-locked. So a build tracked its
depth, and every deep run converged on the same deep genes. There was no way to
carry a surface metabolism down, which is the single biggest limit on build
variety.

A RELICT is a slumped horizon. Sediment on a slope fails and carries a whole
upper-column community downward, burying it metres below where it lived,
instantly and in the wrong chemistry. The cells die. The DNA does not:
extracellular DNA adsorbs to clay minerals and persists in sediment for a very
long time, and that sedimentary pool is a real reservoir for horizontal gene
transfer.

So a relict holds the genes of organisms that never lived there, from a
stratum ABOVE, and it is the only source of off-stratum genes in the game.
Measured: 0.88 per floor from depth 3 down, 209 of 210 sealed behind a
gene-gated barrier, and 62 genes reachable at depth only this way.

Small on purpose -- a pocket, not a chamber. Room-sized read as "a room you
cannot enter" rather than "something buried". Alleles are rolled at the depth
it CAME from: a surface organism buried deep did not become a deep organism.

## Walls: a second `px >= 40` gate

The motif fix in v1.1.0 was still dead. There were TWO gates -- one inside
`paintWallMotif` and another around the clipped block that calls it -- and only
the first was found. A tile is about 15px at the default zoom (the view sits at
0.47), so a threshold of 40 was nearly three times what the game ever shows.

Walls also had no depth: one flat fill reads as a cut-out however good the
outline is, because nothing says which side is solid. There is a clipped
vertical gradient now -- light on the upper face, dark below, which is how
settled sediment actually catches light -- and a lit lip along the boundary.
One gradient per frame, no per-tile work, skipped entirely in high contrast
where flat is the point.

`spec` asserts a gradient reaches the frame at the DEFAULT zoom, which is the
assertion that would have caught both gates.

# v1.1.0 — minimap, and walls you can actually see

## The stacking work left its old invariant behind

`no gene is carried twice` fired as a red error toast in ordinary play. It
enforced exactly the rule stacking REMOVED -- one installed plus spares in the
bin is now the point, and two rows at different rarities are two different
things. Replaced with what still holds: no stack over MAX_STACK, and no gene
installed twice on the ring (two copies would be double-counted by every
dosage figure).

The lesson is the shape, not the specifics: removing a RULE means finding the
invariant that encoded it. The meta-test that every invariant needs a breaker
caught the rename immediately, which is the only reason the replacement got a
breaker of its own.

## A pack moved as one body

`toward()` was deterministic, so every chaser at the same bearing picked the
same step. Four in a row moved identically on 52 turns out of 60 -- which
reads as one creature drawn several times.

The fix is what actually happens: chemotaxis is run-and-tumble. A cell cannot
steer; it swims straight and randomly re-orients, suppressing the tumble while
conditions improve. Right way on average, never in a straight line, and two
cells side by side take different paths. Measured: 52/60 down to 25/60, and a
chaser seven tiles away still reaches the player 27 times in 30.

**Three failed measurements before one worked, all the same mistake.** The
first probe required all six mobs to move identically when they were at
different bearings. The second shuffled the three candidate steps -- useless,
because for a cell directly left of the player two of them are the SAME step
and the third is a no-op. The third placed the mobs 10 tiles out when
`senseRange("chase")` is 9, so they never moved at all and "all moved
identically" was trivially true of standing still: 60/60 with the fix and
60/60 without it, proving nothing twice.

A probe that reports no difference is not evidence the fix failed. It is
evidence the probe is not measuring the thing.

## The wall motif never drew

`paintWallMotif` opened with `if (px < 40) return;`. A tile is 32px at the
default zoom, so the motif was skipped for everyone playing normally and the
walls were a flat colour -- you had to deliberately zoom past 1.25x to see any
of the eight strata's textures.

The original worry was sound: small marks merge into stripes. The answer is
FEWER, BIGGER marks, not none. It scales now -- mark count drops and each mark
grows as the tile shrinks, alpha lifts because a faint mark on a small tile
reads as nothing, and the framboids draw one cluster of five instead of two of
seven. Floor at 10px, below which there genuinely is no room.

Worth recording: the wall TOPOLOGY was already clean. No isolated tiles, no
stubs, no one-tile holes, no diagonal-only pinches, measured on a real floor.
The walls did not need filling in; they needed to be visible.

## The minimap

`minimap.ts`. Square, top right, LEFT of the button column -- that column owns
the right edge, and a decoration drawn over a control is worse than no
decoration.

The first version also refused to extend below where the buttons START, which
on most phones is 56px down, so it produced a 140x56 letterbox. The constraint
is horizontal only: the buttons own the right EDGE, not the right half. Square
96px to 273px across every viewport tested, and it declines to draw at all
below 56px rather than showing a sliver.

It frames the EXPLORED bounds, not the whole grid -- a floor is mostly
untouched rock, and fitting all 96x96 leaves the player as a speck.

**A floor is 9216 tiles, so the terrain is rasterised once and blitted.** Keyed
on the count of seen tiles, which rises monotonically within a floor and so
changes exactly when there is something new to draw. `spec` asserts sixty still
frames allocate at most one canvas.

Only VISIBLE hostiles are marked. A minimap showing every creature on the floor
is a cheat sheet, not a map.

# v1.0.0

74 modules, 15500 lines of source against 11100 lines of test, 882 tests, 78 kB
gzipped. Two clean-checkout verifies.

## The self-update must run before anything that can refuse

The gitlink guard refused, so the script never replaced itself, so the
CORRECTED script -- extracted into the tree on that very run -- could not
install. The only way out was knowing to copy it by hand. A script that gates
its own replacement behind its own checks cannot be repaired by the mechanism
that delivers repairs.

Moving it ahead of the gitlink checks was NOT enough: the pull runs before
those, and a pull that cannot fast-forward blocks just as hard. It now sits
immediately after the archive is opened, ahead of everything.

Verified by installing a refusing version and confirming the newer script still
lands.

Two mistakes worth recording from doing it:

* The first attempt moved the COMMENT and left the code behind, and duplicated
  the prose while it was at it. `bash -n` passed, because a comment in the
  wrong place is still valid shell.
* Before that, the scratch harness cut the script at the literal `git add -A`,
  which now also appears inside a guard's own message -- so two of three cases
  were silently untested and appeared to pass. Anchor such cuts to the start
  of a line.

## A guard you cannot get past is worse than the bug

The gitlink guard refused on the mere PRESENCE of a nested `.git`. So once the
damage was done it blocked the very sync that would have delivered the fix --
and the tracked gitlink stayed on the remote, still breaking CI, with no way to
push a correction.

Three states, three answers:

* **Tracked as a gitlink** -- broken right now. Names the exact
  `git rm --cached <path>`, because deleting the directory does NOT clear it.
* **Present and NOT ignored** -- would become case 1 on this very run. Refuses,
  and says to add it to .gitignore.
* **Present and ignored** -- fine. Exits 0, because `git add -A` will not touch
  it and blocking here is what created the deadlock.

A test-harness note worth remembering: the scratch extraction cut the script at
the literal `git add -A`, which now also appears inside one of the guard's own
messages -- so two of the three cases were silently untested and appeared to
pass. Anchor such cuts to the start of a line.

## Shrinking the chromosome stranded parts

Found by fuzzing 16000 random operations with the stacking and phenotype
invariants asserted after every one. Setting `integrated` DOWN left whatever
sat on the positions that went away: still in the array, still counted by
`used()`, unreachable by any operation. A part that exists and cannot be
touched is worse than one that is gone. `rescueStranded` moves them to the bin
and relocates the origin, which is not optional.

**A clamp I added and then removed.** My first fix also clamped the setter --
which made the "chromosome is no larger than it has been grown to" invariant
unreachable, and the test that proves every invariant is BREAKABLE caught it.
`slotsFor` already clamps and `usableSlots` bounds again; a third clamp only
disabled a check. An invariant that cannot be broken is one nobody is checking.

**And a compaction I backed out.** Duplicate partial stacks can coexist when
parts arrive by being displaced rather than stashed. It is cosmetic, the fix
was half-wired through one of three paths, and the eve of a release is the
wrong time for an invasive change to the one list the player reads constantly.
Recorded here instead: `compact(bin)` belongs in stack.ts, called from every
path that pushes directly.

## bin.ts

`plasmid.ts` crossed the ceiling again, so `stash`, `takeOne`, `install` and
`uninstall` moved out. The boundary is real: plasmid.ts owns the RING -- what a
position is, how it wraps, what may occupy it -- and bin.ts owns a list with
stacking rules and no geometry at all.

# Microgue — handover

A turn-based roguelike descending the redox tower of a Winogradsky column. You
play an engineered microbial nanobot; you fight real microorganisms and take
their genes by horizontal transfer into a plasmid with finite capacity.

Live: `https://binomica-labs.github.io/Microgue/`
Repo: `Binomica-Labs/Microgue` — the playable game is in `web/`.

---

## v1.0

73 modules, 878 tests, 66 genes across 24 strata, 78 kB gzipped.

What 1.0 means here: every screen renders correctly on every form factor from a
320x640 android to an ultrawide, every mutation is atomic, every failed save is
reported, the whole descent generates and draws without an error, and the
things that have bitten repeatedly -- stale memos, forgotten save fields,
layout that only works in portrait -- are guarded by tests that were each
verified by reintroducing their bug.

What it does NOT mean: the game is balanced. That is playtesting, not
engineering, and it is the next thing.

### The bug this pass found

`phenotypeOf` cached ONE entry in a module-level slot keyed on `revision()`.
That counts mutations on a single plasmid and is not unique across instances:
two plasmids built with the same number of operations both read revision 5, so
the second got the first one's cached appearance and a purple cell rendered
green.

A `WeakMap` keyed on the plasmid itself fixes it -- object identity is the only
key that cannot collide -- and lets a discarded plasmid be collected. `spec`
covers both the collision and interleaved reads, because a single-slot cache
also returns the right answer by accident when you alternate between two.

**The rule: a cache keyed on a counter is only correct if the counter is unique
across every instance that shares the cache.** A per-object counter in a
module-level map is not.

### The descent test

Every floor generated, entered, played for forty turns and drawn on five
screens. It found nothing, but it is the only test that exercises the deepest
strata at all -- nothing else ever goes there.

Worth knowing: it dies at F24 to a lytic phage, which kills outright regardless
of hp. That is the code WORKING, so the test replaces the strain and continues
rather than asserting survival.

## The cell looks like what it expresses

The avatar was a fixed white capsule for the whole game. You spend a run
assembling pigments, appendages and luciferase and none of it showed -- a
photoferrotroph and a methanogen looked identical, which threw away the one
place a build can be read at a glance without opening a screen.

`phenotype.ts` derives the appearance from the plasmid. Every trait is
something the gene actually does to a real cell: bacteriochlorophyll IS purple,
sulfur oxidisers DO carry refractile globules, luciferase emits around 490 nm.

* **EXPRESSION, not presence.** A gene on the ring with no promoter upstream
  makes no protein and changes nothing. Breaking that would make the avatar lie
  about the build.
* **Pigment is a weighted argmax, not a blend.** Averaging two strong pigments
  gave a muddy grey that read as a bug. Pigment saturates; the cell is whichever
  it makes more of.
* **Luciferase is an OXYGENASE**, so a cell carrying luxAB into the anoxic
  strata genuinely goes dark. That falls out of the expression model rather
  than being special-cased.
* Pili are drawn short, stiff and around the pole -- they are grappling hooks,
  not oars, and drawing them as a second flagellum misrepresents pilA.

`sprite()` takes an `artId` so one drawing can be cached under many palettes,
and `Phenotype.key` is QUANTISED: without that, a drifting supply during a
brownout rasterised a new sprite sixty times a second. Memoised on revision,
depth and supply, which took it from 10us a frame to 0.4us. `spec` asserts the
key is stable under a drifting supply, because that is the failure that would
never show up as a wrong pixel -- only as a dropped frame.

## An embedded git repo breaks CI, silently

`git add -A` turned a tooling checkout inside the tree into a mode-160000
GITLINK: a submodule pointer with no `.gitmodules`, aimed at a commit that
exists only on the machine that made it. The push succeeded. CI then failed
with `The process '/usr/bin/git' failed with exit code 128`, which says nothing
about the cause, and the deploy went green anyway because the failure was an
annotation rather than a step.

`sync.sh` refuses to commit when it finds a `.git` below the top level, listing
what it found. `.gitignore` covers the known one. Removing an existing gitlink
is `git rm --cached <path>` -- deleting the directory does NOT do it.

## GitHub Actions: bump only what is verified

The Node 20 deprecation warning is real -- Node 20 is removed from the runners
in September 2026 -- so `checkout` and `setup-node` are on v5, both confirmed
to run on node24.

The three Pages actions are deliberately NOT bumped. `upload-pages-artifact`
has no published v4, and its v3 internally pins `actions/upload-artifact@v4.6.2`
-- which is where the remaining warning comes from. That pin is inside GitHub's
action, not this workflow, so it stays until they ship a fix
(actions/upload-pages-artifact#138). Bumping to a tag that does not exist would
turn a cosmetic warning into a broken deploy, which is a bad trade.

## The layout tests were checking a screen they never saw

The scaling stub IGNORED anything drawn inside a `save()`, because the world is
drawn under a camera transform in tile coordinates and those readings are
meaningless in screen space. But the plasmid screen's own readout is also drawn
inside a save -- so the suite was recording nine texts of world HUD, checking
those, and passing on a landscape layout that was visibly broken.

The stub TRACKS translate and scale now, so every recording is in screen
coordinates and nothing has to be excluded. Nine texts became thirty-one.
Rotated text is flagged rather than dropped (ring labels are rotated by
design), and the nesting depth is recorded so the bounds checks can still tell
screen FURNITURE from world drawing, which really is camera-clipped.

**The bug it was missing:** the ring's centre readout was sized `15 * u` --
scaled by the smaller screen dimension -- while the ring hole is sized from
`H * 0.46`. On a wide, short screen the hole shrinks and the text does not, so
the readout was drawn straight across the plasmid. It is fitted to the hole
now.

**And the guard needed the WORST case, not the opening one.** A fresh strain
reads "0.7/9.0 kb", which fits anywhere. The readout that actually overflowed
was a grown chromosome carrying burden and a brownout. Driving the default
state is how a test passes on a screen it is visibly wrong about. With the
worst case driven, removing the fix fails twelve assertions.

## Persistence is checked, not remembered

Adding a system means four coordinated edits: a field on `Game`, a delegate, a
line in the save writer, a line in `applySave`. The last has been forgotten
three times, and each time the symptom was an inventory or a setting that
silently reset.

`spec` now enumerates every field on `Game` and requires each to either
round-trip or appear in a `TRANSIENT` map with a reason. A new field fails the
suite until someone makes the decision explicitly.

It found one immediately: **`autoAttack` was a bare field, so toggling it and
reloading silently turned it back off.** It lives in `settings` now, which is
where every other player toggle already was.

## Duplicate genes stack

A second copy of a gene you already carried was REFUSED outright, so a better
roll of something you owned was simply unpickupable. Now it stacks, to
`MAX_STACK` (3).

Two copies stack only if they are the same gene AND the same rarity. That is
not a technicality: rarity describes the COPY -- its rolled kinetics and its
affixes -- so a rare mtrC and a common one are different objects that share a
name, and merging them would quietly average away the thing you went looking
for.

* `install` takes ONE copy off the stack. Splicing the row out put three copies
  on one position and lost two.
* `betterOf` keeps the more worked copy when two merge -- an evolved, modified
  gene is never replaced by a fresh one, because that work is not recoverable.
* Catabolising eats the WHOLE stack for proportional yield. Eating one of three
  would need three taps for one decision, and the confirm already asks.
* The origin never stacks: there is exactly one, and a stack would imply a
  spare.
* Save clamps `count` to MAX_STACK and OMITS it when it is one, so an unstacked
  gene round-trips to exactly what it was.

**A full stack is a CHOICE, not a refusal.** The copy on the floor is still
DNA, so the prompt offers catabolise-or-leave. A full BIN is still a plain
refusal -- "you have enough of this" and "there is no room" are different
answers and `spec` asserts they stay different.

## The operon is read off the map, not assumed

Checked rather than trusted: 7500 random mutations -- install, swap, rotate,
remove, uninstall, depth changes -- comparing the memoised `operons()` against
a from-scratch recomputation off the same ring. Zero disagreements. It is
genuinely a condensate.

The memo depends on the ring, the chromosome size, the depth AND the inducers,
which is why a conditional promoter re-reading the stratum is its own test: a
memo keyed only on the ring would be wrong for PfnrS, whose output is not a
property of the ring at all.

## The `this` guard has to strip strings too

The extraction guard flagged `"Catabolise this one, or leave it"` -- a
player-facing string. It already stripped comments after a doc-comment false
positive; it strips string literals now as well. Every false positive teaches
you to ignore the test, which costs more than the test is worth. Verified it
still catches a real `const { ctx } = this`.

## Atomicity: three mechanisms, not one

**Validate before you touch.** `expand`, `acquire` and `buy` already do this.
It is the right pattern wherever the last failure point is knowable in advance.

**Transact where it is not.** `Plasmid.transact` snapshots the ring and the
bin, runs the edit, and restores both if it returns a failure OR throws -- the
throw is re-raised, because rolling back is not the same as pretending nothing
went wrong, and swallowing it turns a crash into silent corruption. `assemble`
runs inside one: it splices parts OUT of the bin and then places them.

A shallow copy of each array is enough. Parts are replaced wholesale, never
mutated in place; a deep copy would be slower and would HIDE a real bug if that
ever stopped being true.

**Roll back a partial write.** `saveSlot` writes TWO keys. An index without its
save shows a slot that will not load; a save without its index is invisible on
the splash. The whole chain returned void and swallowed the exception, so on a
full quota or in private browsing EVERY save failed, nothing said so, and the
run vanished when the tab closed. It reports now, rolls the save back if the
index refuses, guards even the READ (`getItem` throws in some private-browsing
modes), and the game warns ONCE and keeps playing.

**A claim I got wrong, recorded so it is not repeated.** I said the tail
terminator in `assemble` was being destroyed by a `put` that refuses an
unusable position. It is not: `norm` wraps at `usableSlots`, so a normalised
index is ALWAYS usable -- 2720 combinations checked, none unusable. The guard I
added was dead code and has been removed; a guard for a case that cannot arise
reads as evidence that it can. The test stayed, reframed as what it actually
is: a CONSERVATION check that assemble never drops a part, which is the
property that would break first if the wrap rule were loosened again.

Every guard here was verified by reintroducing its bug and watching the test
fail. Two of the five did NOT fail on the first attempt, which is exactly why
that step is not optional.

## sync.sh pulls BEFORE it extracts

The repo reached v0.92 with three modules a tarball had never heard of, while
a tarball built from an older base sat in Downloads. Extracting it would have
reverted that work -- and because `cp -r` does not delete, the newer modules
would have SURVIVED, leaving two versions mixed together in a tree that might
not even compile.

Four guards, all verified against a scratch repo with a real remote:

* **Pull first**, before the extract, not after. A `--ff-only` pull that fails
  means local and remote have both moved; it prints BOTH lists of commits and
  exits 1 without touching anything. Git's own diverged-branch hint is six
  lines about merge strategies and buries the instruction that matters, so it
  is swallowed.
* **Refuse a version regression.** If the archive's version is lower than the
  repo's, extracting it reverts pushed work. `FORCE=1` overrides, because
  sometimes you do mean it.
* **Warn about orphans.** Files the repo has and the archive does not are
  listed and LEFT IN PLACE -- deleting someone else's work automatically is how
  this goes badly wrong in the other direction.
* Exit codes are real: 1 on divergence, 1 on regression.

## Read this first

Nine things a reasonable-looking change will break. Each of these was arrived
at the hard way; none are arbitrary.

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
    -- engine-free core: no DOM reference anywhere in these ------------------
    rng.ts          seeded mulberry32; generation is reproducible
    biology.ts      8 strata, 20 organisms, 69 loci, pigments   <- the design doc
    metabolism.ts   per-gene ATP generation, substrate needs, O2 lability
    mapgen.ts       Grid class, CA caves, region sealing, spawn placement
    path.ts         A* with a binary heap (~90 lines, replaced jumper's ~1400)
    dungeon.ts      24 floors, level caching, mob and boss placement
    rooms.ts        chambers carved into the cave: ports, mats, blooms, vaults
    barrier.ts      material you digest through, opened by an expressed enzyme
    fov.ts          recursive shadowcasting, plus remembered terrain
    cycle.ts        the diel cycle: daylight, night, chemocline shift
    production.ts   the biological pump: floors refill from ABOVE, over time

    -- the plasmid ----------------------------------------------------------
    transcription.ts  the ring model: promoters, attenuating terminators, flow
    parts.ts          the catalogue: promoters, terminators, modifiers, rarity
    plasmid.ts        arrangement and economics: operons, synergy, complexes
    chromosome.ts     one growing replicon: cassette sites, traits, ATP ceiling
    allele.ts         the loot roll: kcat, Km, stability, affixes
    strain.ts         strain level from the notebook AND the deepest floor
    kegg.ts           KEGG modules + the metabolite graph they derive into

    -- the run --------------------------------------------------------------
    entity.ts       the tagged union -- add a kind and switches stop compiling
    behaviour.ts    motility patterns and size classes
    speed.ts        an energy budget, so fractional speed carries across turns
    footprint.ts    multi-tile bodies: filaments lie along their own axis
    weapons.ts      the four ranged mechanisms, line of sight, cloud discs
    projectile.ts   travelling particles and lingering gradients
    pursuit.ts      chase-to-kill, re-pathed every turn
    explore.ts      auto-explore: pick a FRONTIER, not an unknown tile
    combat.ts       the microbe turn, extracted and testable without a canvas
    status.ts       status effects: one list per entity, one loop
    repair.ts       healing is a conversion: spend ATP, recover hp
    items.ts        floor loot: gene cassettes and metabolisable substrates
    lysis.ts        the death sequence, as pure timing maths
    run.ts          the notebook and the FASTA export
    lab.ts          what outlives the strain: credit, ledger, standing order
    progress.ts     death, catabolism, expansion, the research bench
    invariants.ts   31 properties that must never be false
    trace.ts        the flight recorder: last 400 events, always on

    -- persistence ----------------------------------------------------------
    save.ts         localStorage with a real runtime validator (SCHEMA 11)
    saves.ts        named characters in numbered slots
    lab_save.ts     the lab, in its OWN key -- deleting a slot must not cost it

    -- presentation ---------------------------------------------------------
    shapes.ts       organism morphologies as shape data in unit space
    pixels.ts       16x16 pixel art as role grids -- EDIT THIS for sprite work
    paint.ts        shape painter, sprite cache, per-stratum wall motifs
    walls.ts        organic wall contouring (corner classification + tracing)
    motion.ts       facing, short-arc turning, squash, wake -- all pure
    fx.ts           easing, lunge, shake decay, hitstop -- all pure
    fx_render.ts    what those effects actually draw
    hud.ts          Winogradsky column gauge, bars, plasmid ring
    buttons.ts      on-screen controls, wrapping to fit the viewport
    chrome.ts       shared screen furniture: close button, header, wrap
    screens.ts      splash, notebook, lab, bench -- free functions
    plasmid_ui.ts   ring rendering + polar hit-testing for drag and spin
    kegg_ui.ts      pannable node graph, caption relaxation, transforms
    flavour.ts      all player-facing combat and pickup text

    -- the browser boundary -------------------------------------------------
    main.ts         canvas, state, lifecycle, save/load  <- the only DOM file
    render.ts       the world, the HUD, and the screens needing game state
    turn.ts         everything that happens because time passed
    input.ts        pointers, gestures, keys, buttons
    safety.ts       on() -- the ONLY way to register a listener
    toast.ts        transient notices + guard(), the error boundary
    gesture.ts      pointer gesture classification, pure and tested
    ncbi.ts         real sequences: Entrez queries, caching, throttling
    sw.ts           service worker (own tsconfig: WebWorker lib)
    sw_client.ts    keeping an installed PWA actually up to date
    version.ts      build identity, injected at compile time

  test/             11 files, 800 assertions
    logic.test.ts     the bulk: biology, plasmid, generation, saves
    soak.test.ts      the REAL Game over thousands of frames
    invariant.test.ts every invariant, plus a breaker for each
    audit.test.ts     NaN/Infinity fuzzing of every pure surface
    scaling.test.ts   every screen at eleven real viewports
    golden.test.ts    a hashed canvas-call trace of a fixed scenario
    render.test.ts    the real render path, without a browser
    safety.test.ts    listener discipline and the module-size ceiling
    update.test.ts    the service-worker update path
    sync.test.ts      sync.sh, against a stub gh
    boot.test.ts      the bundle is inert without a canvas
  public/               build output + icons + manifest
.github/workflows/pages.yml     push -> verify -> build -> deploy
sync.sh              one-command update from a downloaded tarball
```

`biology.ts` is where the game design actually lives. Strata, organisms, genes,
and their constraints are all data; changing the game usually means changing
that table, not the code.

**Engine-free core.** Everything in the first block above contains zero DOM
references. That is what made the port from Lua cheap, and it is worth
preserving -- keep `main.ts`, `render.ts` and `paint.ts`/`hud.ts` as the only
files that touch a canvas.

**No module may exceed 900 lines**, asserted in `test/safety.test.ts`. That
ceiling is load-bearing: `main.ts` reached 2272 and was where every save and
state bug in this project hid. When a file crosses it, split by CONCERN --
`metabolism.ts` came out of `plasmid.ts` that way, taking the per-gene tables
and leaving the arrangement logic behind.

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
build needs no install on any platform, which was the actual goal — "playable
on any device" meant a URL, not more native targets.

**No framework, no renderer library.** Canvas 2D with a hand-rolled A*. At
these grid sizes a rendering library would be pure weight. If sprite counts
ever reach thousands, PixiJS is the drop-in.

**Re-examined at v0.84: TypeScript stays, and the measurements say why.** The
question was whether a faster language would serve the three goals better —
easy to share, runs on a potato, decent 2D. Measured on the logic path, which
is the only thing a language change touches:

    level generation (once per floor)      11.31 ms
    findPath across the floor               0.357 ms
    nextExplore (per auto-explore tick)     0.138 ms
    microbeTurn, whole level, 78 mobs       0.027 ms
    plasmid full read (the HUD path)        0.018 ms
    computeFov                              0.005 ms

**The entire per-turn simulation is about 0.05 ms — 0.3% of a 60 fps frame.**
A language ten times faster hands back 0.27% of a frame. There is nothing
there to win, and the reason is structural rather than lucky: this is a
turn-based game on a 96x96 grid with at most 22 sprites on screen. It cannot
become CPU-bound at its design scale.

What actually costs on a weak device is startup and fill rate, and both get
WORSE with the usual alternatives. The bundle is **76 kB gzipped** (the 14 kB
figure this document used to quote is long stale — check it, do not trust it).
Rust/macroquad or Zig to WASM lands at several hundred kB to a few MB before
it draws anything, Go's runtime alone is over a megabyte, and a Godot web
export is tens of MB with a startup pause a phone genuinely notices. Canvas 2D
rasterising is the browser's work, identical whatever emitted the calls. WASM
also would not obviously win the compute even if compute mattered: V8 already
packs small-int arrays, which is exactly why `Grid`'s `Uint8Array` benchmarked
as no faster than `Tile[][]` and was kept for type safety instead.

The one number above worth attacking is level generation, and it is
algorithmic — 11 ms of cellular automaton and region sealing, once per floor,
in a language that is not the reason it costs that. `nextExplore` was the same
story: 0.74 ms per tick, made 5x cheaper by scanning once instead of six times
rather than by changing language.

The honest case for leaving TypeScript is not speed, it is reach — a native
target for Steam or a console. That directly contradicts "playable on any
device means a URL", so it is a different product decision, not an
optimisation. If it is ever taken, the engine-free core is the asset: those
modules have no DOM reference and port cheaply, which is the property that
made the move off Lua cheap in the first place. Keep it that way.

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

## The part catalogue, and why not an ECS

`parts.ts` is a registry of DATA with declared effects: seven promoters, four
terminators, six gene modifiers, evolution levels, rarity tiers. `parts.ts`
knows nothing about the plasmid; `transcription.ts` reads the catalogue and
knows nothing about any specific part; `plasmid.ts` owns arrangement and
economics and no longer owns the model. Adding a promoter is a table entry.

**An ECS is the wrong tool here.** ECS pays off when many entity KINDS need
orthogonal behaviours composed at runtime and iterated in bulk. What this needs
is composition WITHIN a part -- a gene carrying modifiers, a promoter carrying
an activation rule -- which is a socket system, not an entity system. A
registry of declared effects gives the same extensibility while KEEPING static
exhaustiveness, which an ECS explicitly gives up. That exhaustiveness is what
listed every construction site during this migration.

### Terminators attenuate, they do not stop

The important model change. Real terminators are 60-98% efficient and the rest
reads THROUGH. So `transcribe()` carries a flow that decays with polarity and
is multiplied by each terminator's readthrough, and a gene can be driven by
more than one promoter. That makes the choice of terminator a real decision --
a leaky hairpin is cheap and bleeds signal into the next operon, a tandem
rrnB T1T2 costs twice the space and seals it.

`rawExpression` must use the transcript's `flow` and NOT recompute polarity.
Doing both silently discarded the entire attenuation model, and the only sign
was one test expecting zero and getting 1.2.

### Promoters have modes

Constitutive (Anderson series) ignore the chemistry. Conditional ones read it:
`PfnrS` fires only once oxygen is gone, because FNR carries a [4Fe-4S] cluster
that O2 destroys -- that IS the promoter. `PsoxS` is the mirror. `Plac` is dead
weight until you are carrying sugar. `Plasmid.depth` and `.inducers` are set
each turn in `upkeep`; without them every promoter silently behaves as
constitutive.

### Saves migrate, they are not discarded

Schema 6. `strength: "strong"` becomes `id: "j23119"`, `optimised: true`
becomes the `codon` modifier. A hand-edited save is clamped to what play
allows: level to MAX_LEVEL, modifiers to what the level permits.

## The ledger has to tell the truth

Five code paths reduced the player's hp and exactly ONE recorded what did it,
so hazards, status effects, toxic intermediates and genuine mob kills were all
filed as "starvation". A run history that lies about cause of death is worse
than having none. Everything now goes through `hurt(game, amount, cause)`, so a
new damage path cannot forget.

And the AUDIT ran on a dead strain, reporting `hp 0/20` as an invariant
violation -- which appeared as a red error toast over the obituary, the first
thing a player sees when they die. A lost strain legitimately sits at zero:
`WorldView` carries `dead` now and the invariant is scoped to a living player.

The death screen also reserves room for whatever toasts are up, so the
obituary is never hidden behind the message announcing it.

## Soak tests must pin the clock

A run seeds its dungeon from `Date.now()`, so without stubbing it every soak
gets a DIFFERENT level -- and anything depending on level shape (how long
exploring takes, whether a mob is reachable) passes or fails by luck. That is
what made `verify:clean` fail once in three while a plain run passed four times
in a row. `setupEnv` pins Date, as the golden harness already did.

The suite now runs in about 36 seconds, dominated by level-generation sweeps
across many seeds. Those are the tests that have caught the most real bugs, so
the coverage stays and the time is the price.

## Tapping a creature crosses the gap

`tap()` called `takeTurn()` directly, which is a SINGLE step -- so tapping
something four tiles away moved one square and stopped. Now: strike if it is
genuinely in reach, otherwise path to it and travel.

Two things this needed that were not obvious:

* **Reach is checked before AND after each step.** Checking only before meant
  arriving adjacent on the final node and then giving up, because the next tick
  had no node left and a re-path from where you already stood returns a
  length-1 path.
* **The quarry MOVES while you cross the room**, so the path runs out where it
  no longer is. It re-paths, capped at six legs, then says so.

Worth knowing: a bare plasmid has 0 power. `attack` floors damage at 1, so a
new strain can still fight, barely -- but it will not kill much until it
expresses something.

## Scrolling the parts list destroyed loot

Pressing a row sets `dragBin` immediately, so the scroll branch -- which
required it to be null -- could never run. Worse, releasing that "scroll"
outside a slot fell into the DISCARD path, so trying to scroll threw parts
away. Two fixes:

* A drag whose movement is mostly VERTICAL scrolls and cancels the pending
  install. Mostly horizontal still carries the part out to the ring.
* Discard is measured from the last DRAWN row rather than a fixed multiple of
  the old tile size. The list scrolls and is taller than the grid was, so the
  old threshold sat inside the list itself.

**The close target is now checked FIRST on the plasmid screen.** An open item
card is modal and swallowed the tap, so closing took two presses and looked
broken. It is worth stating as a rule: a screen's close target should win over
everything on that screen, including anything modal within it.

## The parts bin is a list, not a grid

Six four-character tiles worked when every label was four characters. Allele
names run to "psychrophilic mtrC of high copy" and a tile rendered half of
"rrnB T1". Rows now carry the full name, the rarity, the size in kb and what
the part does, scrolled by drag, with hit-testing against the DRAWN rows rather
than a grid formula -- once it scrolls, screen position no longer follows from
index.

## Healing is repair, and repair costs ATP

Only TWO of nine complexes granted regeneration and a starting plasmid had
none, so a scratch on the first floor followed you to the last. That was an
omission, not a difficulty choice.

A cell does not heal, it repairs, and repair is expensive -- and that is not a
metaphor. Every repair enzyme in this game is literally an ATPase: GroEL
hydrolyses ATP on every folding cycle, DnaK binds and releases substrate
ATP-dependently, RecA drives strand exchange by hydrolysis, UvrA pays to reset
after recognising damage. So healing is a CONVERSION: spend ATP, recover hp, at
a rate and efficiency set by what you express.

    expressing            hp/turn  ATP/hp   close a 15hp gap
    nothing               0.14     3.40     108 turns, 51 ATP
    groL                  0.36     2.45      42 turns, 37 ATP
    groL + dnaK           0.52     1.96      29 turns, 29 ATP
    full repair suite     0.92     1.34      17 turns, 20 ATP

This is what makes `wait` a real command: holding position after a fight is the
rest action, and it spends the energy budget you were going to need deeper
down while the clock runs.

**It never spends the last 20% of the ATP.** Running the pumps dry to close a
scratch is how you die to the next thing, and letting that happen by accident
punishes the wrong mistake.

Regeneration complexes are free healing ON TOP, which is what keeps them worth
building around.

## The death sequence was never visible

`r_drawLysis` paints the world by calling `r_draw`, and `r_draw`'s death branch
was guarded only on the INNER condition -- so the call fell straight through to
the lab screen. The shop appeared instantly underneath and the lysis was drawn
over a shop. `!drawingLysis` is on the OUTER condition now, and `spec` checks
the ledger is absent during the still beat and present by the end.

## Speed

`speed.ts`. Bacteria do not all move at one rate and the differences are
enormous: a flagellated chaser acts 11 times per 10 turns, a gliding Beggiatoa
3, a stalked Thiothrix never. Implemented as an energy budget rather than a
"moves twice" flag, so fractional speed carries across turns -- 0.6 gives an
action every OTHER turn rather than none -- and the bank is capped so a
creature that could not move for a hundred turns does not then take a hundred
steps.

The player's speed comes from what is EXPRESSED: `flhD` for the flagellar
regulon, `cheA` to steer rather than tumble, `pilA` for the last stretch.
Motility is among the most expensive things a cell builds, which is why so many
give it up -- so it is something you choose to carry.

## Damage numbers

They existed, at 0.34 tiles with no outline and a 620ms fade, which over a pale
wall is the same as not having them. Larger, outlined, with a scale punch on
appearance, rising further and lasting longer.

## Auto-explore and travel-to-strike

Both are ONE input that spends many turns, and both stop the moment anything
happens. `explore.ts` holds the pure part: pick where to go.

**Target the FRONTIER, not the unknown.** You cannot path into the dark -- as
far as the pathfinder knows it might be solid. The frontier is seen floor
adjacent to unseen, and walking there is what reveals it. `nextExplore` tries
progressively further frontiers because the nearest is sometimes behind a wall,
and giving up on the first failed path would stop exploring beside an open
doorway.

**The interrupt has to be total.** `look()` clears `walk` when something comes
into view, and it must clear `exploring` too -- otherwise the next tick picks a
new frontier and walks straight past the thing that just appeared.

Tapping a creature sets `strikeAfterTravel`: the walk spends its last step ON
the target, lands one blow, and stops. One input, one approach, one strike, and
you decide what happens next.

## Fog seams: ONE fill, not many

`spec` also bounds the COST: a path is only cheap if what goes into it is, and
a 96x96 floor is 9216 tiles. Run-length encoding keeps a worst-case frame --
fully remembered, so visible and dim interleave along every row -- under 400
rects.



Three attempts. The seams are two passes of a semi-transparent black
compositing over each other -- 62% twice reads as 86% -- and every version that
kept drawing per-tile or per-run rects kept seaming:

1. Per-tile `fillRect` padded by +1. Overlapped by construction.
2. Per-row runs with `Math.round`ed edges. Looked right and was not: the fog is
   drawn inside a FRACTIONAL camera translate, so rounding in TILE space is
   undone by the transform before anything reaches a pixel.
3. One `Path2D` per shade, filled once. A single fill composites once per pixel
   however much its subpaths overlap, and it does not care what transform is
   active. The rects are deliberately padded OUTWARD by half a pixel so
   adjacent runs overlap -- which is now free, and closes the sub-pixel gaps a
   fractional transform would otherwise leave.

Only the third can be correct in principle rather than by arithmetic luck.

**The golden had to learn about paths.** Moving the fog onto `Path2D` took the
entire fog layer out of the trace, because the stub swallowed its calls -- a
coverage hole that looks exactly like a passing test. The stub records now, and
a 2% change to the fog shade fails the golden.

## Fog had grid lines

Per-tile rects padded by +1 overlapped their neighbours, and two passes of a
62% black composite to 86% -- a visible dark grid across every remembered area.
Drawn as pixel-rounded horizontal RUNS now, and darkened to 82%.

## The button column shrinks to fit

Thirteen buttons no longer fit a 720x1600 screen at the preferred size, and the
layout pinned to the top and ran into the log. It now shrinks gap first, then
size, with 44px as the floor -- below that it stops being a touch target. The
layout test caught this the moment the explore button was added.

## The ring closes at the replicon, not at the array

Reported twice from play: "a part sits at position 16, past the 16 the
replicon provides". `rotate` was one cause; the root cause was deeper.

`norm()` wrapped modulo the ARRAY (24, sized for the largest replicon) while
the ring is however much of it this replicon owns. A plasmid is a circle and it
closes at `usableSlots`. So `assemble` could pick a start near the end, wrap
past 15, and lay an operon down where nothing could reach it -- and
transcription never actually wrapped at all, which was silently wrong.

Three distinctions now, and they matter:

* `norm()` wraps modulo the USABLE slots. For walking ring neighbours.
* `exact()` does NOT wrap. For a caller-supplied index -- applying `norm` to
  one silently maps 20 onto 4, so loading a save whose array runs to 23 would
  have overwritten the first eight positions.
* `put` REFUSES a position the replicon does not have, and `vacate` is the one
  operation that may clear one: subcloning to a smaller backbone exists to
  empty the positions that just stopped existing, and `put` refusing them left
  it unable to unstrand what it had stranded.

`free()` counts usable positions only. It counted the whole array, reporting
free space nothing could be put in.

**Targeted tests missed this twice.** `spec` now fuzzes every public mutator in
random order across 400 sequences on every replicon and reports WHICH operation
stranded a part. That is what found it; a bounds check was never the problem, a
wrap was.

## Spinning the ring stranded parts

Reported from play: "a part sits at position 16, past the 16 the replicon
provides". `rotate` permuted all 24 ARRAY positions while the replicon owned
16, so dragging the ring -- the most ordinary thing anyone does on that screen
-- pushed parts where nothing could reach them. Rotation is modulo
`usableSlots` now, and `swap` refuses a position the replicon does not have.

The invariant caught this in the field, which is what it is for. Worth noting
what it cost to have it: the error toast is ugly and covered the log, but the
alternative was a part silently vanishing from a plasmid.

Two more from the same screenshots: the lysate tile printed allele names like
"psbA of fast folding" straight across its neighbours -- labels are FITTED to
the tile now, by measurement -- and the strike and auto-attack buttons had the
SAME crossed-swords glyph sitting next to each other.

## Footguns found by hardening

**Credit spent on constructs that never arrived.** The lab could stock 60 genes;
the bin holds 18 and the starting vector already uses 7. Ordering more than 11
silently dropped the surplus at inoculation -- 29 of 40 lost, with nothing
anywhere saying so. That is the worst shape a bug can take. `STOCK_CAP` is
derived from `BIN_CAP - STARTING_PARTS`, a full manifest reads as unbuyable
rather than affordable, and `spec` asserts `STARTING_PARTS` matches what the
vector actually puts in the bin -- if those two drift the bug comes straight
back.

**Most of the order form was unreachable.** With 69 genes it runs to 72 rows
and about 15 fit; it truncated with "more available than fits" and there was no
scrolling, so most of what a run earned credit for could not be bought. It
scrolls by drag now, with a scrollbar, and a test walks the whole list
asserting every offer is reachable.

Two smaller ones: `Math.round(NaN)` survives `min`/`max` and produced
`slice(NaN, NaN)`, rendering an empty form -- the finiteness guard has to come
FIRST, which is the third time that exact shape has appeared. And a parameter
named `scroll` silently resolved to the global function of that name.

## What the refactor damaged, audited properly

Beyond the twelve comments already found, a thorough pass turned up one more
(`"_g is what I am going to kill"`) and confirmed the rest is sound:

* All 57 methods that existed pre-refactor are still present.
* No duplicated exports from a bad splice, no orphaned functions, no delegate
  calling a target that does not exist.
* No `_g` leaks into any user-visible string.

Performance post-refactor, at 75 mobs on a real floor: expression 2.9us,
atpBalance 0.2us, operons 0.0us (memoised), the full 31-invariant audit 37us
per TURN, microbeTurn 31us, FOV 10us, level generation 20ms per floor. No
regression. The audit is dominated by the body-iteration invariants, which is
inherent at that mob count and still a rounding error against a 16ms frame.

## One press, one turn

A tapped target used to keep pursuing turn after turn with no further input,
which is the opposite of how a turn-based roguelike should feel. Only AUTO
attack ticks on its own now. The primary way to fight is the strike button, and
pressing it repeatedly IS the texture of the combat -- Crawl makes you press
the key each time for exactly that reason.

## No second experience track

The question was whether to add an XP bar. There already is one: strain level,
from cataloguing and depth. A second bar filling from kills would COMPETE with
the notebook rather than reinforce it, and would reward the one activity the
column is least about. What was missing was visibility, not a mechanic --
`levelProgress` exposes the same measure the level comes from, drawn as a thin
line under the hp and ATP gauges.

Ring positions are now earned every OTHER level rather than every third, so the
plasmid visibly grows as the lineage learns.

## Permadeath was not permanent

`die()` deleted the slot and `mobTurn` called `save()` on the VERY NEXT LINE,
writing it straight back. `save()` refuses when `dead` now.

And only `step` and `takeTurn` were guarded against a dead strain, so one could
still descend the column after its run was already in the ledger. Every
mutating entry point is guarded: descend, ascend, attack, mobTurn, catabolise,
subclone, research, onTile.

## Lysis

A cell does not stop, it lyses. `lysis.ts` is pure timing maths -- four beats
over 1.9s: still, rupture, wash, done -- so the sequence is testable without a
canvas. The ledger fades in UNDER the wash rather than after it, because
waiting for a full fade to black and only then showing the result makes the
pause feel like a hang.

`r_drawLysis` draws the ordinary world by calling `r_draw`, whose death branch
calls back into `r_drawLysis`. That is infinite recursion, and the frame guard
caught it as a stack overflow -- the error boundary working, but not a fix.
`drawingLysis` breaks the cycle and is cleared in a `finally`.

## The audit must know the run has ended

A lost strain sits at hp 0, which is CORRECT -- and the invariant reported it
as a violation, so an error toast covered the obituary on every single death.
`WorldView` carries `dead` now, the hp invariant is exempt when it is set, and
`t_audit` returns early: there is nothing to hold about a world nobody is
playing any more.

Two presentation bugs from the same screenshot: the shop truncated notes at a
fixed 46 characters, ending "from turn one" as "from tu", which reads as a
crash rather than an ellipsis -- it MEASURES now; and the lab header sat under
the toast strip.

Worth knowing for tests: setting `hp = 0` and waiting does NOT kill the player.
`upkeep` runs regeneration before the death check, so the strain heals off
zero. In real play the check fires immediately after the damage that caused
it, which is the right order. Call `die()` directly instead.

## Permadeath and the lab

A run is one strain sent down the column. When it dies it DIES -- no more
resynthesising in place and carrying on, which made death a setback rather than
an ending. What survives is what a lab actually keeps: the sequence data, the
notebook, and the standing order with the synthesis company.

That framing is not decoration. Modern molecular biology is largely "order the
construct" -- nobody isolates a gene from an organism any more. So SYNTHESIS
CREDIT earned by one strain buys constructs for the next, and the
meta-progression is the laboratory getting better funded rather than the
microbe getting mysteriously stronger.

Measured curve:

    died on F2, nothing recorded        22
    died on F6, 4 organisms            134
    died on F12, 10 organisms          318
    died on F21, 17 organisms          566
    reached the bottom                1088

    psbA 72   mtrC 148   mcrA 207   pUC19 285   BAC 505   strain L2 140

Depth dominates because depth is the game, but it cannot be the ONLY term or
the optimal play is to dive blindly past everything -- so cataloguing, clearing
strata and the quality of the alleles recovered all pay. `spec` asserts each of
those contributes.

**The lab is saved SEPARATELY from the run**, in its own key. A run save belongs
to a slot and dies with the strain; putting the lab there would mean deleting a
save, or dying, took the whole meta-progression with it. There is a test that
deletes every slot and checks the credit survived.

The ledger records every attempt -- how deep, how long, what killed it -- and
the deepest floor ever reached is on the splash screen, which is the first
thing you see every time. Crawl keeps morgue files for the same reason: the
record of the attempts IS the long game.

## Built is not wired

Three systems shipped at v0.59 with none of them connected to the loop:
`genome.strain` was never assigned, `strainLevel()` was never called, and there
was no way to change replicon at all -- so the entire build space was inert and
every plasmid was pBR322 for ever. The tests passed because they exercised the
modules directly.

The lesson is the test shape, not the wiring: `test/soak.test.ts` now has a
"reachable from play" block that goes through the real `Game` for each new
system. A module test proves the maths; only a Game test proves the feature
exists.

Two related things that fell out of the same pass:

* `assemble` did not respect `usableSlots`, so it would lay an operon down past
  the replicon's last position where nothing could reach it. `add` and
  `install` already refused those.
* The v0.55 refactor's mechanical `this.` -> `_g.` rename had rewritten twelve
  COMMENTS into nonsense ("promoters read _g"). Repaired.

## Strain level

Not experience points. A strain advances by CATALOGUING: breadth in the
notebook and depth in the column, both required. It buys replicon access and
headroom, never raw power -- `spec` asserts expression is untouched by level.
The notebook was a score; it is the progression now.

## Terminators cost ATP

Transcription that runs past the last gene of an operon is polymerase and
nucleotide spent on nothing. A bare hairpin wastes 0.62 ATP a turn for ever; a
tandem rrnB T1T2 wastes 0.02; no terminator at all wastes 1.48. That is what
makes the choice matter every turn rather than only when something sits
downstream.

The starting vector now ships WITH a terminator, because a real vector has one
and opening the game bleeding ATP into empty DNA teaches the wrong lesson.
Baseline fermentation rose from 1.2 to 1.6: the "never dead on arrival"
invariant was passing with a margin of 0.005, which is not a margin.

## The manifest tracks the chromosome, not the bin

The lab sold eleven constructs to a strain whose chromosome has five free ring
positions. `STOCK_CAP` was derived from `BIN_CAP`, and the bin is about
CARRYING while the chromosome is about USING -- so credit went on genes that
would sit unused for most of a run.

`stockCap(startSites)` derives from the chromosome the lab has paid for, plus
two spare because swapping one out for a better roll is normal play, still
bounded by the bin. Buying sites now lets you carry more constructs, which ties
the two purchases together instead of leaving them independent.

**This broke three tests, correctly.** They bought every offer in one pass and
then asserted the manifest was full -- but buying a SITE raises the cap, so
more genes become orderable than that pass had seen. They buy to a FIXED POINT
now, looping until a whole pass changes nothing.

## The growth curve has to fit inside the energy budget

Eighty percent of the chromosome system shipped unreachable. Expansion rose at
1.42 per step, so the eighth site cost 744 ATP against a ceiling of 100 --
thirteen of sixteen expansions and EVERY trait could never be bought. The
system worked perfectly and no player could ever have seen most of it.

Two changes, and they belong together:

* Expansion rises at 1.16 per step: 35 ATP for the first site, 324 for the
  last.
* `atpCeiling` scales with the cell -- `100 + (strain-1)*22 + sites*6`, so a
  developed strain holds 344. A bigger, better-adapted cell stores more energy;
  the pool scales with biomass. That is what makes a rising cost curve payable
  rather than theoretical.

Traits cost 130 / 190 / 260, which `spec` asserts are ALL reachable by a
developed strain and NONE affordable at the start. There are tests that every
expansion is payable at maximum ceiling, and that the last one still costs more
than 60% of a full pool -- reachable is not the same as cheap.

The lesson generalises: whenever a cost curve is added, assert it against the
budget that pays it. A cost nobody can pay is the same as a feature that does
not exist.

## One chromosome that grows

The replicon menu is gone. Choosing between five backbones was a fork in the
road, not a thing that grew, and it never aligned with what the game is.

`chromosome.ts`. One circular replicon, eight cassette sites to start, grown by
integrating more. That is not a metaphor: an INTEGRON is a site that captures
gene cassettes one after another, each with its own promoter, and the array
grows as more are taken. Expansion is paid in ATP because replicating and
maintaining more DNA is what it actually costs a cell.

    sites   slots  capacity  next costs
      0       8      9.0 kb      45
      4      12     14.4 kb     183
      8      16     19.8 kb     744
     12      20     25.2 kb    3025

Full expansion is 29000 ATP, far beyond one run -- you grow a few sites per
strain, and the LAB buys a higher starting point with credit.

What survived from the replicon design is the part worth keeping: the
signatures are TRAITS now, bought once each with ATP and kept for the run.
`par locus` (no hazards), `relaxed copy control` (copy number tracks your ATP),
`oriT and relaxase` (half its loci reach the next strain). Architecture you
invest in, on one molecule, rather than a menu of alternatives.

`replicon.ts` is deleted; the dosage compression moved into `chromosome.ts`
because copy number still matters once relaxed control is on the table.

**A note on the test migration.** Base slots went 16 -> 8, so every fixture
that laid an operon at slots 4-9 ran off the end. Growing them all to maximum
was wrong: it inflates CAPACITY too, which silently removed the burden that
two of those tests exist to measure. `withOperon` grows only as far as its
operon needs, and the capacity tests are explicitly NOT grown.

## The ring had THREE angle computations

Reported as "the plasmid inventory is broken": the ring rendered as a
quarter-circle. Eight wedges were drawn at one-twenty-FOURTH spacing, because
two of the three places that compute an angle still divided by `SLOTS` while
the loop ran `used` times. There is one `angleOf` now and everything uses it.

**The existing round-trip test could not have caught this.** `slotAt` and
`slotCentre` agreed with each other; the DRAWING disagreed with both. A test
that checks two functions are mutually consistent says nothing about a third.

Two guards, and the second took a correction worth recording:

* `spec` asserts consecutive slot centres are exactly one step apart and that
  the positions span the whole circle at sizes 8, 12, 16, 20 and 24.
* The scaling suite records `arc()` calls and measures what is actually DRAWN.
  My first version summed the wedge sweeps -- which still reads 360 when eight
  wedges overlap inside a quarter-circle, so it passed against the real bug.
  It measures their DISTRIBUTION now: the largest gap between wedge starts.

## The ring is the replicon's, not the array's

Reported as "I cannot move a promoter once it is installed". The ring drew all
24 ARRAY positions while pBR322 owns 16, so eight phantom wedges sat on screen.
Tapping one selected an "empty slot" that could never hold anything, and since
they are interleaved with the real ones, moving a part felt like it silently
did nothing.

`RingGeom.used` carries the count now, and `slotAt`, `slotCentre` and the draw
loop all divide by it. `spec` checks every drawn wedge round-trips to its own
index at ring sizes 10, 12, 14, 16, 22 and 24, and that every wedge on screen
is a position the plasmid actually has.

This is the fourth bug from the same root -- the array is sized for the largest
replicon and the ring is a fraction of it. The others were `rotate`, `norm`,
and `assemble`. Anything that divides a circle into slots must divide by
`usableSlots`.

## Install is a button, not a drag

The ring sits ABOVE the parts list, so dragging a row to it is a VERTICAL
gesture -- and vertical gestures scroll the list. Drag-to-install was
impossible in the only direction the ring is in, which is a good example of two
correct decisions producing a broken result.

The item card carries the actions now: `install on the plasmid` puts the part
in the first free position, and `catabolise` asks first.

**The confirm reuses the same two button slots and the same card height, with
"keep it" in the BOTTOM slot the eat button occupied.** Growing the card for a
confirmation shifted everything and put the destructive option exactly where
the finger had just tapped -- so a double tap destroyed a part. A second tap in
the same place is now always the safe answer, and `spec` asserts it.

The warning text goes in the body BEFORE the height is measured. Pushed
afterwards it drew past the measured bottom and over the buttons.

## The flight recorder

`trace.ts` keeps the last 400 events in a ring buffer -- inputs, moves,
attacks, damage with its cause, floor changes, death. Always on: the cost is
one small object per event against a turn that already runs pathfinding and a
31-invariant audit, and a recorder you have to switch on is never on when you
need it.

    T    0  input   press explore
    T    0  move    to 34,5 from 35,4
    T    1  move    to 33,5 from 34,5
    T    2  input   press strike

Read it three ways: `microgue.trace()` and `microgue.state()` from a device
console (there is no other way to get state off a phone); the last four events
are printed on the death screen; and eight are stored in the ledger entry, so
an old death can still be explained.

The ring must come back IN ORDER across the wrap -- a recorder that reports the
effect before the cause is worse than none -- and `spec` asserts it.

## "Killed by an affliction"

`tickStatus` removes what has expired, and the cause was read AFTER ticking --
so a status that killed you on its last turn was already gone by the time it
was named, and every such death reported "an affliction". The cause is captured
before the tick now.

## Layout across form factors

`test/scaling.test.ts` renders every screen at eleven real viewports -- from a
320x640 android to a 2560x1080 ultrawide, including landscape phones and
tablets -- with a real notch and home indicator. It records where things are
DRAWN and checks they are on screen, inside their container and clear of the
reserved areas. It found two things by hand-testing could not:

**The button column overflowed on small phones, landscape phones AND tablets.**
Sizing shrank by one pixel per pass with a cap of 24 passes: fine on a phone,
useless on an iPad where 46*u starts at 112px. And on a landscape phone
fourteen buttons at the 44px minimum need 616px against about 250 of room, so
no single column fits at any size that is still tappable. It now solves for the
size directly and WRAPS to more columns -- two on a phone, four in landscape,
one on a tablet. 44px is the floor throughout: below that it stops being a
touch target.

**The plasmid screen's footer ran off the bottom** on desktop, landscape and
small phones -- 1114px of content on a 1080px display. The screen stacks
vertically while `u` scales off the SMALLER dimension. The footer now shrinks
to the room left below it and draws nothing past the edge.

One note for the test itself: the world is drawn inside a camera transform in
TILE coordinates, so a bounds check has to ignore anything drawn while a
transform is active. Otherwise the stair marker at tile (46,70) reads as being
1489px off-screen.

## Grinding deaths out-earned playing

Three hundred instant deaths on the first floor earned 2700 credit -- more per
SECOND than descending -- so the optimal strategy was to kill yourself
repeatedly. Ground already covered now pays a fifth of the full rate: full for
floors deeper than any strain has reached, `REPEAT` for retreading. Measured
now at roughly break-even per minute rather than dominant, which is right --
you do learn something from a failure, just not what you learned the first
time.

## Rarity describes the COPY, not the gene

Reported from play: a wild-type psaA at +0% on every stat, displayed as RARE.
It was rare because psaA is tier 4 -- the colour described the GENE, and
promised something that particular copy did not have. That makes the whole
ladder decoration.

Fixed by inverting the generator. The RARITY is rolled first and the stats are
then generated to justify it, which is what Diablo actually does: the item's
class is chosen, then affixes are drawn to fill it. Deriving rarity from the
numbers afterwards can only ever produce labels that sometimes lie.

    common      psaA -- stability +5%
    uncommon    psaA -- kcat +7%, Km +20% affinity, stability +14%
    rare        halotolerant psaA -- Km +29% affinity, stability +33%
    epic        chimeric psaA of broad specificity -- kcat +29%
    legendary   psychrophilic psaA of high copy -- kcat +77% turnover

Guarantees, asserted by `spec`: rare and epic ALWAYS carry at least one affix,
legendary always carries two, and mean quality rises strictly with tier -- so
a legendary mtrC genuinely out-performs a common mtrC at the same job. That is
the answer to "what is the win".

**Km is inverted and the bias has to push it DOWN.** A good roll is a LOW Km.
Rolling it like the others made every high-tier allele worse at the one stat
that matters most when the substrate has nearly run out.

A stored allele keeps its claimed tier but `alleleRarity` CLAMPS it to what the
numbers justify, so a hand-edited save cannot mint a colour it has not earned.

The readout shows only what DIFFERS. Three lines of "+0%" told you nothing and
made an unremarkable copy look like it had statistics.

## Alleles: the loot roll

Two copies of the same gene are not the same enzyme. Homologues differ in
turnover, in affinity and in how long they survive; that is ordinary sequence
variation, and it is why directed evolution works. So a cassette is a BASE (the
gene) plus a rolled ALLELE, and hunting a better roll of a gene you already
carry is screening a library -- which is what a microbiologist does.

The rolled parameters are the ones an enzymologist measures:

    kcat       turnover. Raw output.
    km         affinity. LOW is good, and a low-Km enzyme still works when the
               substrate has nearly run out -- so it is weighted by SCARCITY,
               which makes affinity the deep-column stat.
    stability  resists denaturation.

Affixes are real provenance with real trades: thermostable enzymes are slower,
psychrophilic ones fragile, chimeras fold badly, resurrected ancestors are
stable and promiscuous and worse at any one reaction. `spec` asserts every
affix has both an upside and a downside -- it caught FOUR that were pure wins.

**Tuning notes, because the first two attempts were wrong.** `1/km` is
asymmetric: 0.55 reads as 1.8 while 1.45 reads as 0.69, so using it raw made
every roll look good and nothing came out common. And an affix chance of
`0.16 + d*0.045` filled both slots a quarter of the time at depth, making a
third of deep drops top-tier. Measured now: 95.7% of surface psbA finds are
common; a legendary mtrC is 3.2% at D8.

## DNA is food

`t_catabolise` eats a cassette for hp and ATP. Extracellular DNA is a genuine
nutrient -- competent bacteria take it up for phosphate, nitrogen and carbon as
readily as for the information, and in sediments eDNA is a real part of the
phosphorus budget. Yield scales with kb and with the roll, so eating a good
allele costs you the good allele.

It is also the sink the hunt needs: a junk roll of a gene you already carry is
worth something, so screening a hundred cassettes is not a hundred wasted
pickups. The eat target is its OWN box on the item card, because catabolising
is destructive and must not be the same tap that dismisses the card.

## The column feeds from the top

`production.ts`. A Winogradsky column is fed by phototrophs in the photic zone;
that biomass sinks and everything below lives on what falls. Nothing down there
makes its own food. So:

* A floor you strip does NOT refill on its own. It refills from ABOVE, over
  time, and `Level.stockedAt` records when it was last topped up.
* Production stops at night, because photosynthesis does. Never quite to zero,
  or camping through a night would deadlock.
* Capacity and rate both fall with depth. Measured: a full day away refills
  the surface to about 60% and the floor to under 20%.

**Daylight is sampled ACROSS the interval, not at its endpoints.** Endpoint
sampling made 600 turns away return LESS than 300, because both ends happened
to land at night. Non-monotonic regeneration is indefensible, and it was
invisible until the numbers were printed -- the code looked right and the
comment claimed it was "within a few percent", which was simply untested. There
is a test asserting more time never yields less, and another asserting the
result does not depend on where in the day the span begins.

That is the tension the column was missing. Descend now with what you have, or
spend turns climbing to harvest and fund the next tier of directed evolution --
while the clock runs, the microbes act and ATP drains. Climbing to the surface
pays for itself within about a day; the floor never restocks meaningfully.

`stockedAt` is SAVED, per floor, because a stripped floor that refills itself
on reload would make the whole mechanic free to bypass.

## The golden render trace

573 tests proved the refactor did not CRASH. They could not prove it did not
CHANGE anything -- a moved line drawing at the wrong coordinate passes every
assertion in the suite. So the same tracer was run against the pre-refactor
tree and the post-refactor tree: **42220 canvas calls, identical, in order,
with arguments**. That is the evidence the split was behaviour-preserving.

`test/golden.test.ts` keeps an in-suite anchor of the same scenario. Two things
about it are worth knowing:

* **It only guards what its scenario exercises.** Injecting a one-pixel shift
  into BARRIER rendering did not fail it, because floor 1 in the traced run has
  no barriers in view; shifting HUD text by one pixel did. It anchors the
  world, the HUD and the four screens. Widen `play()` before trusting it
  further, and there is a test asserting each screen is actually reached.
* **The hash is recorded in the file, not read from an env var.** An earlier
  draft took the expectation from `process.env.GOLDEN`, which nobody sets --
  it asserted nothing while looking rigorous.

Getting the harness right took three tries, and each failure was instructive:
`Object.assign` cannot replace `navigator` (getter-only); `Date.now` must be
pinned or each run seeds a different dungeon; and storage must be cleared per
run or the second play LOADS the first one's save.

## The split

`main.ts` was 2272 lines and was where every save and state bug in this project
hid. It is now 702, and holds STATE and LIFECYCLE only:

    main.ts    702  fields, constructor, frame, resize, save/load, enter, boot
    render.ts  766  the world, the HUD, and the two screens needing game state
    turn.ts    630  everything that happens because time passed
    input.ts   370  pointers, gestures, keys, buttons

The transform was mechanical on purpose. Bodies moved out as functions taking
the Game; `main.ts` kept a ONE-LINE DELEGATE for each, so no call site and no
test had to change. 569 tests passed at every stage, which is what made a
refactor this size verifiable rather than hopeful.

Four things went wrong and are worth remembering:

1. **The brace walker treated an apostrophe in a `//` comment as a string
   delimiter.** "the plasmid's" opened a string that ran to the next quote and
   swallowed real braces, so methods closed dozens of lines early and the
   splice silently corrupted the file. Any tool that walks this source must
   skip comments.
2. **The parameter could not be `g`.** Several bodies declare a local `g` for a
   gene or a grid, and a mechanical `this.` -> `g.` rename then pointed at the
   wrong one. It is `_g`.
3. **The rename replaced `this.` but not bare `this`.** `const { ctx } = this`
   survived in eighteen places -- a runtime error the moment those functions
   ran, invisible to a regex looking for a dot. `spec` asserts no extracted
   module binds `this`.
4. **Pruning imports with a regex mangled aliased ones**, turning
   `apply as applyStatus` into `apply as`. Prune by whole statement or by
   exact binding, never by pattern.

`Game` is imported as a TYPE ONLY in all three modules, so there is no runtime
cycle; `spec` asserts that, and that no module exceeds 900 lines.

## The save has been forgotten twice. Check it every time.

Adding state to `Game` and not adding it to the save is now a THREE-time
pattern: the run notebook at v31, and held modifiers plus the clock plus the
win flag at v54. Held modifiers were the worst version -- they are the rare
drops, so a reload silently destroyed the scarcest thing in the game.

**The save snapshot also aliased the live plasmid.** `{ ...part }` copies a
gene's `mods` ARRAY BY REFERENCE, so the stored copy kept changing along with
the plasmid after it was written. `clonePart` is deep now, and
`test/soak.test.ts` saves, mutates the live plasmid, reloads and asserts the
stored copy did not follow.

Whenever a field is added to `Game`, ask three things: does it go in
`SaveData`, does the writer DEEP copy it, and does `applySave` read it back.

## Soak tests assert crashes, not outcomes

`survives two thousand frames` and `cycling every screen` both used to assert
ZERO toasts. Death after two thousand turns is a legitimate outcome, and at
current mob density standing still for a hundred turns can kill you -- so both
began failing intermittently on something unrelated to what they check. They
assert no ERROR toasts now, and the screen test no longer passes turns at all,
because it is about screens.

The distinction is worth keeping: a soak test proves the machinery does not
break, not that the player wins.

## Rarity, and the item card

The classic five: grey / green / blue / purple / orange, common through
legendary. Conventional rather than decorative -- the whole point is that
nobody has to be told what blue means. `spec` asserts all five colours are
distinct, that weight falls strictly with tier, and that every tier holds
parts, so no rarity is decoration.

A GENE takes its rarity from its tier, which already encodes depth and power,
so the two ladders cannot disagree. In the bin the body is the PATHWAY colour
(what it does) and the outline is the RARITY colour (how hard it was to find):
two axes, two channels, neither read off the other. Epic and legendary also
get a corner pip, which survives a colourblind eye.

Tapping a bin part opens an item card: mechanics, current expression, level
and modifiers, then its DISCOVERY. Every one of those lines is real -- nxrA
names Winogradsky, whose column this is; dsrA and nifH name Beijerinck; mtrC
names Lake Oneida; pufM the 1985 reaction-centre structure. An invented
citation would undercut the only thing the game is actually for. `spec`
asserts all 29 exist, are distinct, and are not a restatement of `desc`.

## Rare parts and directed evolution

Rarity lives ON the part, so a loot table is a FILTER rather than a second
list that can drift. `rollPart` rolls a tier and falls DOWN the ladder if that
tier is empty, so adding a rarity with no members can never yield nothing.
Measured distribution: singular runs 1.6% at the surface and 2.3% on the
floor, rare 7.2% to 11.2%. Every elite drops one outright.

The rarity ladder must match the power ladder, and `spec` asserts it: a
singular part that is worse than a common one makes rarity a lie.

`drawResearch` is where ATP becomes a DECISION. Everywhere else it is spent
passively on upkeep; here you choose between banking it for a deeper stratum
and converting it into a permanently better enzyme. Cost rises steeply with
level so "always evolve" is never right, and modifier slots open with level
(1 / 2 / 3) so evolution and modification pull on each other.

Modifiers are held in `Game.mods`, not stashed on the ring: they attach to a
gene rather than being transcribed.

## Sacred invariants

`src/invariants.ts` holds 31 properties that must NEVER be false, and
`INVARIANT_COUNT` is derived from the table so it cannot drift. Not balance
preferences -- things that mean the game is broken, and that fail SILENTLY: a
body inside rock is invisible and unhittable, a lost origin makes every
expression zero, a NaN coordinate simply stops being drawn.

They run after every turn, every death and every descent, and a violation
surfaces as an error toast naming which one broke and how.

**Rules for adding one.** It must be cheap, because it runs every turn. It must
be a MUST and not a SHOULD -- "openness is around 40%" is a balance target and
belongs in a balance test; "every body stands on floor" is an invariant. And it
must name what broke specifically enough to act on.

**Coverage is proven by execution.** `test/invariant.test.ts` holds a BREAKERS
table: one function per invariant that deliberately violates it. The suite
asserts every invariant has a breaker, every breaker names a live invariant,
and each breaker trips the one it claims. An earlier version matched words in
the test file and gave false coverage for eleven of them. An invariant nobody
has seen fail may be checking nothing at all.

Adding an invariant without a breaker fails the build.

## What the invariants caught immediately

Adding them found three real defects within minutes, all silent:

1. **The final boss stood on the arrival tile.** Floor 24 has no way down, so
   `placeBoss` anchors around the way UP -- and you would materialise inside
   it. No body may occupy a stair now, enforced by `canPlace` and by an
   invariant.
2. **Boss floors could have no boss.** Excluding stairs and raising mob density
   together made the tight local search around the stairs fail outright, and a
   boss floor with no elite is a gate `isCleared` waves you straight through.
   Placement widens, then falls back to anywhere on the floor, then evicts an
   ordinary body; a bloom that places nothing falls back to a single overgrown
   individual. Verified across 320 boss floors.
3. **A barrier with a non-finite work count could never be opened by
   anything**, because NaN never reaches the threshold.

And one where the invariant itself was wrong: `player state is finite` called
`Number.isFinite` on the status ARRAY, so it reported itself. The soak test
surfaced that on the first run.

## Atomicity

Every mutator that returns a `Result` validates completely before it commits.
A partial mutation is worse than a refusal: the part is gone and nothing said
so. `test/invariant.test.ts` forces all thirteen failure paths and compares the
whole plasmid before and after, and separately asserts a SUCCESSFUL mutation is
never a no-op.

## Never assert on a generated artefact

Twice a test read a file that the same command produces -- `public/microgue.js`
and `public/BUILD` -- and both times it passed locally, where the file was
fresh, and failed in CI, where it was stale or absent. `npm run build` runs the
tests BEFORE bundling, and the bundles are not committed, so from inside the
suite those files are never trustworthy.

The generated files are gitignored now, and `spec` asserts that no test reads
anything under `public/`. The artefact check lives in `build.mjs`, which runs
after compiling and fails the build if a constant is missing from a bundle --
which is the right place and the right time.

`npm run verify:clean` deletes the generated files and rebuilds, reproducing a
fresh checkout. Run it before shipping anything that touches the build.

## Version and build identity

`package.json` holds the version. `build.mjs` derives `__VERSION__` from it and
`__BUILD__` from a hash of every SOURCE file plus the static assets, and injects
both into the game bundle and the worker. The tarball name is derived from the
same field, so the file you download, the string on the splash screen and the
`public/BUILD` file on the server cannot disagree.

Hashing the INPUTS matters: hashing the output needed a second compile pass to
inject the resulting hash, which left the worker cache named after a bundle
that no longer existed on disk. Hashing inputs means the id is known before
compiling and both bundles are emitted once.

The build FAILS if either constant does not reach either bundle -- which it did
immediately the first time, because `version.ts` was not yet imported and
esbuild tree-shook the constants away. The fallback string is `unbuilt`, not a
plausible version, so a define that goes missing looks obviously wrong on
screen rather than like an old build.

Shown on the splash screen (`v0.45 · 7c0c03b`), in the notebook header, and in
the toast after a service worker update.

## sync.sh: an unwatched deploy must not read as a green one

Reported: "I did not see the usual job watcher". The script polled for the run
for 20 seconds, gave up SILENTLY, and then printed the same
"done. the app updates itself on next resume." it prints after a green deploy.
The push had worked and the deploy was simply unverified, but nothing said so.

Three changes:

* Poll for 90s, not 20, with the wait visible. A Pages workflow uses a
  concurrency group, so a new run may not register until the previous one lets
  go -- twenty seconds is short when a deploy is already in flight.
* Fall back to the newest run on the branch, and CHECK ITS SHA. If it belongs
  to a different push it says so and refuses to watch it, because watching the
  wrong run is worse than watching none.
* Exit 2 and say "the deploy is UNVERIFIED" when nothing was watched. The old
  message was indistinguishable from success.

The fallback resolves the id and the SHA in ONE `gh` call. Two calls can land
either side of a new run appearing, and then the id and the SHA describe
different runs -- exactly the mistake the fallback exists to avoid.

All four paths were exercised against a stub `gh`: immediate, late, wrong-run,
and red.

## sync.sh

One command: `~/sync.sh "message"`. It finds the newest tarball in Downloads by
mtime, mirrors the whole tree into the repo, commits, pushes, and watches the
run this push started.

Three details are load-bearing.

The run id is resolved from the commit SHA rather than letting `gh run watch`
open its picker -- the picker needs a keystroke and can list a run from an
earlier push.

**The self-update runs BEFORE the watch**, because the watch exits non-zero on
a red deploy; if the update ran after it, a broken sync.sh could never replace
itself, which is the exact trap that broke CI twice.

**The push status is checked and unpushed commits are detected.** `git push -q`
followed by an unconditional "pushed" message hid a failed push completely, and
because the up-to-date guard only looked at `git status --porcelain` -- the
working TREE -- a stranded commit then looked identical to being in sync. It
sat on the phone with no deploy and nothing saying so. The guard now also runs
`git log @{u}..HEAD`, and a failed push exits non-zero telling you to retry.

**The self-update is skipped when running from a source tree.** Exercising the
script against a scratch repo copied the packaged sync.sh back over the one
being edited, silently reverting work in progress. It presents as edits that
"did not apply".

**The self-update is an atomic `mv`, never a `cp` over the file in place.**
bash reads a script incrementally by byte offset, so overwriting the file it is
currently executing makes it resume mid-line in the new contents and run
fragments of comments as commands. This was harmless while the update was the
last thing in the script and broke the moment it moved earlier. `bash -n`
passes on the broken version, so `test/sync.test.ts` runs real scripts: one
that copies over itself and is asserted to fail, and one that renames and is
asserted to finish.

## Why an installed app used to run a version behind

`skipWaiting` and `clients.claim` in the worker are necessary and NOT
sufficient. Three client-side failures stacked, and each cold start advanced
the process by one -- which is why closing and reopening two or three times
eventually worked:

1. **GitHub Pages serves sw.js with a Cache-Control max-age**, and the browser
   fetches sw.js THROUGH the HTTP cache when checking for an update. The check
   could be answered from a stale copy. `updateViaCache: "none"` forces the
   network.
2. **Registration ran once, on `load`.** A phone suspends a PWA rather than
   closing it, so `load` never fires again and the app never asks. It checks on
   `visibilitychange` now, on focus, and on a timer.
3. **A new worker taking control does not change the running page**, which is
   still executing the JavaScript it parsed at startup. The cache is new; the
   game is old. `controllerchange` reloads it.

The reload is guarded twice: it never fires on the FIRST install (that
controllerchange is the initial claim, not an update) and never more than once
per page life. Both are asserted in `test/update.test.ts`. Saving is
continuous, so the reload costs nothing.

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
acquired in the previous run."** This one was built, shipped, and then
deliberately overruled -- see "Permadeath and the lab". Resynthesising in place
made death a setback rather than an ending, and the ending is what gives a run
its shape. What carries forward now is what a LAB keeps: synthesis credit, the
notebook, the ledger. The clause survives in two narrower forms: the
`mobilisable` trait really does pass half a plasmid's loci to the next strain,
and the standing order really does put the previous strain's genes in the next
one's bin. `resynthesise()` and `CARRYOVER` were removed at v0.84 -- no caller
for a long time, and four tests keeping them warm.

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

Guarding call sites one at a time DOES NOT WORK. I wrapped the three gesture
listeners and missed the four pinch ones sitting immediately below them, and
nothing complained for several versions. So:

* `safety.ts` owns `on()`, and `spec` fails the build if a raw
  `addEventListener` appears anywhere outside `safety.ts`, `sw.ts` and
  `sw_client.ts`. All ten listeners in `main.ts` go through it.
* `installGlobalHandlers()` catches `error` and `unhandledrejection` at boot,
  because a throw from a timer or a dropped promise passes through no wrapper
  at all -- and on a phone the alternative is a console nobody can read.
* The worker guards its own three handlers. A throw in `install` means the new
  worker never activates and the app is stuck on an old build; a throw in
  `fetch` turns every request into a network error.
* Every `sw_client` callback is wrapped in `swallow`: an update check is not
  worth a crash.

**The guard itself was broken when first written.** Its pattern only matched
`addEventListener` at line start or after a dot, so a call nested inside an
expression passed straight through. I only found that by deliberately
reintroducing a raw listener and watching the test stay green. Any guard of
this kind must be tested by breaking the thing it guards.



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

## The pathway map

It opens framed on what you have UNLOCKED, not on the whole diagram. Fitting
everything put your own metabolism in a corner of a mostly dark chart at 0.84x;
`litBounds` finds the edges you carry and `frame` centres them at up to 1.6x,
leaving the rest to be found by panning. The view is reset each time the map is
opened, so it reframes as the genome grows.

**Every view transform sanitises non-finite input.** One NaN reaching a `View`
makes every later transform NaN and the map goes blank with nothing logged --
a zero starting pinch distance or a lost pointer was enough. `zoomAbout`
sanitises the INCOMING view too, because falling back to `v.x` is no use when
`v.x` is the thing that is already broken.

**A pinch is never a tap.** A pinch clears `panFrom`, so `panMoved` stayed near
zero and lifting a finger over a module caption BUILT that module -- inspecting
a pathway by pinching it silently assembled it. `pinching` stays set until
every finger is up. Three or more simultaneous pointers clear the map, so a
missed pointerup cannot leave an entry that pairs with the next single touch.

**The map view is dropped on resize**, since a view framed for portrait is
wrong in landscape.

**A pinch has to act on whatever is on screen.** The handler only checked
`showPlasmid`, so pinching the map silently zoomed the WORLD behind it -- the
map never moved and the gesture read as broken. `owner()` now decides which
view the gesture belongs to, and the map zooms about the midpoint between the
fingers so what you are pinching stays under them.

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

## Sprite cache is zoom-independent

Pixel art is cached at its AUTHORED size and scaled on draw. Keying the cache
on the on-screen size meant a single pinch rasterised a fresh canvas at every
intermediate size: 198 canvases for one organism across a hundred-step
gesture, 784 with four in view, and then the cache blew its cap and
full-flushed itself repeatedly mid-gesture. Now 0.

Two consequences to preserve: the separation halo is drawn per-frame in
`drawBody` rather than baked into the sprite, because a halo baked at 16px and
stretched is a blur; and vector fallbacks quantise their size to powers of two
rather than caching one entry per pixel of zoom. Eviction drops the oldest
entry instead of clearing everything, since a full flush mid-pinch throws away
sprites about to be needed again.

## Barriers

Material you digest through, not doors you unlock. Each is something that
genuinely accumulates in a column and each is opened by an enzyme that
genuinely degrades it: biofilm matrix by dispersin B, cellulose rafts by an
endoglucanase, chitin drift by chitinase, ferric crust by reducing the Fe(III),
sulfur and carbonate crusts by oxidising or acidifying them.

Two rules make them work, and both are asserted:

- **A barrier must be openable by a gene found at or above its depth.** Three
  of them initially were not -- biofilm needed `dspB` from D4 while appearing
  at D1 -- which is not a gate, it is a wall.
- **A barrier NEVER blocks the way down.** They seal ports and enrichments,
  the caches worth crossing a level for. `sealRooms` verifies the exit is
  still reachable with every barrier treated as solid and unseals the room if
  not, with a final sweep that drops them all rather than ship a floor you
  cannot leave.

Expressing the enzyme is what opens a barrier; carrying it is not. So the
answer is always "arrange your plasmid", never "find the key".

## Density, not size

At 167 open tiles per microbe the column read as empty, and making levels
LARGER would only have spread the same content thinner. Mob counts scale with
the floor area that actually exists, targeting about 50 tiles per microbe, and
rooms went from ~4 to ~6 per floor.

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

## Found in the deep adversarial audit

Fuzzing every pure surface with NaN, +-Infinity and 1e308 produced **62
non-finite results**. None were reachable from normal play, but they share one
failure mode: a NaN becomes a coordinate or a scale, the thing silently stops
being drawn, and nothing is logged. Guarded at source in `motion`, `footprint`,
`fov`, `cycle`, `fx` and `plasmid`. `test/audit.test.ts` re-runs the whole fuzz
on every build.

**`Plasmid.supply` was the dangerous one.** It is public, assigned from an ATP
division every turn, and read by expression, power, vitality and all of combat.
One bad frame would have poisoned the entire run. Clamped on read.

**The origin could be lost, which is a silent soft-lock.** Without `ori` every
expression is zero and the cell is dead -- and the origin is in no loot table,
so nothing brings it back. `remove` and `uninstall` refused to excise it but
`put` is public, and `applySave` writes the whole ring through `put`, so a save
lacking an origin loaded a permanently dead plasmid. `touch()` now restores it:
the invariant matters more than the individual write.

**Bodies overlapped at spawn.** Three places asked "can a body stand here" and
two checked only the ANCHOR tile, so a filament whose anchor was free still
overlapped a neighbour through its other two tiles. One `canPlace` helper now
serves all three -- which is the only way the answer stays the same.

`test/soak.test.ts` runs the real Game for 2000 frames, descends all 24 floors,
and cycles every screen a hundred times, asserting nothing unbounded
accumulates and the player never reaches an impossible state.

## Found in the earlier audit

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
- **A guard that enumerates by hand.** The memo-invalidation test opens
  "Enumerate them" and is a literal list of ten methods. It could not fail for
  an eleventh, and covered no FIELDS at all -- which is where the stale reads
  actually came from. If a guard's job is coverage, derive its list or assert
  its completeness; a list maintained by remembering is not a guard.
- **A failure-path test that takes the cheap route to "no".** The atomicity
  suite had an "assemble with no spare promoter" case whose fixture removed
  every promoter, which trips an early return before any mutation. The real
  bug was in the branch where a promoter EXISTS. Reach the failure the way a
  player does.
- **A test that manufactures the state the game should have produced.**
  "strain advances as the lineage catalogues and descends" sets
  `run.deepest = 20` by hand. It proved the formula and hid the fact that
  nothing in the game ever wrote that field. This is "Built is not wired" one
  level in: the feature was reachable, but one of its INPUTS was not.
- **A unit that lives only in the reader's head.** `run.deepest` was a floor
  in `strain.ts` and `invariants.ts`, a stratum in `save.ts`, and printed with
  a "D" prefix in `screens.ts`. Nothing disagreed loudly; it just quietly
  clamped 20 to 8 on load. Name the unit in the type or in the field.
- **Rendering is unverified.** There has never been a browser in the loop. All
  45 tests are logic; layout and paint have only been checked by rendering the
  same shape data offline. Treat any visual claim in code comments as a
  hypothesis.

---

## State

At v0.84. 64 modules, ~14000 lines of TypeScript, 800 assertions across 11 test
files, and a full `npm run verify` in about 40 seconds.

**Content:** 8 strata over 24 floors, 20 organisms, 69 loci, 9 complexes,
3 hazards, 9 KEGG modules, 31 invariants.

**Working, and reachable from play** -- the distinction matters here, because
three systems once shipped fully built and fully unreachable:

* Procedural generation: disc-masked CA caves, rooms, barriers, boss floors,
  level caching, everything asserted connected across many seeds.
* The plasmid: operons, transcriptional polarity, attenuating terminators,
  clustering synergy, complexes, hazards, burden, gene dosage.
* The chromosome: one growing replicon, cassette sites bought with ATP,
  three traits, an ATP ceiling that scales with the cell.
* Combat: four ranged mechanisms, wind-ups, multi-tile bodies, per-organism
  speed as an energy budget, status effects.
* Loot: allele rolls with real affix trade-offs, rarity that describes the
  COPY, catabolism as a sink, gated substrates.
* The column as a resource: primary production from the top, the diel cycle,
  floors that refill from above rather than on their own.
* Permadeath and the lab: credit, ledger, standing order, the deepest floor
  ever reached on the splash screen.
* Auto-explore, travel-to-strike, the flight recorder, the pathway map.
* PWA install, offline play, an update path that actually updates.
* An item card that IS the codex the old "Next" list asked for: what a gene
  does, what it is expressing at right now, its modifiers and level, the
  complexes and hazards it participates in, and its real discovery history.

**Genuinely not built:**

* **Sound.** Nothing at all. Still the largest single gap.
* **A settings screen.** `settings.reduceMotion` and `settings.uiScale` are
  read by the renderer and persisted correctly, and there is no UI anywhere
  that can change either. They are reachable only by hand-editing the save.
* **Accessibility beyond redundant encoding.** A canvas has no accessibility
  tree, so there is no screen-reader support and no text-scale control.
* **An organism attribution on the item card.** The card names the discovery
  but not which organism in THIS column drops the gene; that mapping exists
  only in the notebook, in the other direction.

**Not a gap, but worth knowing:** rendering has never had a browser in the
loop. `golden.test.ts` hashes 77575 canvas calls for a fixed scenario and
`scaling.test.ts` checks every screen at eleven viewports, but both assert on
RECORDED CALLS, not on pixels. Treat any visual claim as a hypothesis.

**Stranded:** the original LÖVE version has six commits -- the crash fix, the
spec suite, the hot-reload rig, the Winogradsky data in `biology.lua` -- that
were never pushed and live only in a local clone on another machine. The
`Microgue.love`, `main.lua`, `map.lua`, `mapGen.lua`, `testLevel.lua`,
`gamera.lua`, `ConcordTest.lua`, `gridm_Demo.lua` files and the `concord/`
and `jumper/` directories at the repo ROOT are that *old, pre-fix* tree. They
are dead weight in the working directory and actively misleading -- `jumper`
in particular is the ~1400-line pathfinder `path.ts` replaced. Either recover
those six commits or delete the Lua tree.

---

## What an adversarial audit found, and what it says about the tests

A full pass over the tree at v0.84, with every finding reproduced by execution
before it was believed. The suite was green throughout: **800 passing tests did
not catch any of these.** That is the useful part -- each one names a shape of
test that was missing, not just a line that was wrong.

**A refusal had already destroyed the parts.** `assemble` found the spare
promoter's bin index, then pulled the module's genes out of the bin -- and
every gene sitting below the promoter shifted that index down by one. Off the
end it returned "no spare promoter in the bin", which was false, *after*
binning four genes. Measured: 8 parts in, 4 parts out, on a path reporting a
refusal. The atomicity suite forces thirteen failure paths and compares the
whole plasmid before and after, and it has an "assemble with no spare
promoter" case -- but its fixture strips EVERY promoter first, so `pi` is -1
and the early return fires before any mutation. The bug lived in the branch
the test could not reach. *A failure-path test must reach the failure the way
a player does, not the cheapest way to make the function say no.*

**Four public fields fed a memo that keyed only on ring mutations.**
`integrated`, `strain`, `traits`, `depth` and `inducers` all change what
`operons()` and the ATP figures should return, and none of them bumped `rev`.
Measured: after integrating eight sites, acquiring `relaxed copy control` and
reaching L8, `atpCost` still read **0.19 where the truth was 0.77** -- a
four-fold understatement that corrected itself only when the player next
happened to move a part on the ring. The comment above the invalidation test
says "Enumerate them"; it is a hand-written list of ten METHODS. *A guard that
enumerates by hand is a guard with a hole, and this one had no coverage of
fields at all.*

**Half the progression formula was never fed.** `strainLevel` takes cataloguing
AND depth, and nothing in the game ever wrote `run.deepest` -- only `t_win`
did. So the depth term was zero for every real run, the maximum reachable
strain was **L5 of 8**, and `bonusSlots(8)` and `bonusCapacityKb(8)` could not
happen. The golden trace had been recording `fillRect(42,783.59,0,2)` -- the
strain progress bar, at width ZERO, on every frame of every run since it was
added -- and the hash matched, because it had always been zero. The existing
"strain advances as the lineage catalogues and descends" test sets
`g.run.deepest = 20` by hand. *A test that manufactures the state the game
should have produced proves the formula, never the wiring* -- which is the
same lesson as "Built is not wired", one level further in.

**Credit bought a strain level that lasted one turn.** `startRun` set
`genome.strain` from `lab.startStrain`; `upkeep` then recomputed it from an
empty notebook and silently overwrote it -- L8 to L1, three ring positions
gone, no message, because the toast only fires when the level goes UP. The lab
sells that offer up to L8 at an escalating price. Same shape as "credit spent
on constructs that never arrived", which has its own section above.

**The save destroyed the resource the growth curve is paid in.** `parseSave`
clamped `atp` to a flat 100 while `atpCeiling` reaches 350, so a developed
strain lost up to 250 ATP on every reload -- against expansions costing up to
324 and traits at 130/190/260. The "atp is within its pool" invariant passes
happily, because 100 <= 350.

**`run.deepest` meant different things in four files.** `strain.ts` normalises
it by MAX_FLOOR and `invariants.ts` bounds it by MAX_DEPTH*3 -- a FLOOR. But
`parseSave` clamped it to MAX_DEPTH, a STRATUM, so a floor-20 lineage loaded
back as 8; and the notebook printed it as "deepest D20", a stratum label on a
floor value, when only D1-D8 exist. A unit that is only in the reader's head
disagrees with itself eventually.

**Smaller, all silent:** the leak walk in `wastedTranscription` iterated to
SLOTS while `norm` wraps at `usableSlots`, so an 8-slot ring was walked three
times and every terminator's readthrough applied three times -- the fifth bug
from "the array is sized for the largest replicon". `ensureOrigin` overwrote a
regulatory part to put the origin back, the one path that broke the
conservation guarantee `install`/`uninstall` are tested for. `add` checked the
ring but not the bin, so a gene could sit in both. `parseInfo` had no
finiteness guard, so a corrupt index rendered "deepest D NaN" -- the fourth
appearance of that exact shape. `migrateLegacy` deleted the legacy save before
checking it had parsed. The toast collapse keyed on "the last message pushed",
so two failures alternating each frame never collapsed at all. The NCBI
sequence cache was `JSON.parse` cast straight to its type, the same hole
`save.ts` exists to close. `httpFetcher` had no timeout, and `exporting` is
only cleared when the promise settles -- one hung socket disabled the export
button for the rest of the session.

**Dead code, with tests keeping it warm.** `replicon.ts` (172 lines) was
documented above as deleted and was not; `genome.ts` (130 lines) was the
pre-plasmid model, imported by nothing, and re-declared `O2_LABILE` and
`BURDEN_KNEE` that `plasmid.ts` also defines -- so "update the O2-labile list"
had two plausible places to do it and one of them did nothing. `resynthesise`
and `CARRYOVER` had four tests and no caller, while `soak.test.ts` asserted
the opposite behaviour. All removed.

Every one of these is now a test that fails without the fix. Each was checked
by running the new test against the old tree first, because the alternative is
a test that cannot fail -- which this codebase has shipped before.

## There is a browser in the loop now

`npm run shots`. Headless Chrome renders the shipped bundle at four real
viewports with real device pixel ratios, drives it through six scenes, and
writes PNGs alongside the game state each was taken in. It exits non-zero if
any scene raised an error toast.

Zero dependencies, deliberately. Node 22 has `WebSocket` and `fetch` built in,
so `tools/shoot.mjs` speaks CDP straight to Chrome rather than pulling in
Playwright and a few hundred megabytes of browsers to take a screenshot. It
serves `public/` itself, launches Chrome with a throwaway profile, and cleans
both up. It drives the game through the `microgue` console handle, so what it
photographs is the real game and not a harness reimplementing half of it.

**Ten minutes after it existed it found four bugs**, all of them live in
whatever is currently deployed, all of them past a green suite:

* The status line was never measured. "before dawn" rendered as "before da"
  on every phone.
* The log was wrapped at `0.86 * size` and drawn at `size` -- the operon
  readout above it sets that font and the wrap ran before the log set its own
  back. A 16% underestimate on every wrapped line.
* The log was also wrapped from the LEFT EDGE while it is drawn at `barX`,
  indented past the Winogradsky gauge. Too generous by exactly that gauge.
* `drawHeader`, shared by the notebook, the bench and the lab, drew its
  subtitle unbounded. "0 ATP · 0 modifiers held · strain L1 · 0 bonus slots ·
  +0.0 kb headroom" is 62 characters.

**Why the layout suite missed all of them.** `scaling.test.ts` filtered on
`x.x > W + 4` -- where a string STARTS. Every one of these is left-aligned and
starts comfortably inside the frame. It measures the EXTENT now, and caught
all four plus two more on the first run. The lesson is the familiar one in
this document: the assertion has to be the thing you mean, and "is it on
screen" is not "does it fit".

Use it after anything that touches layout, text or sprites. It is not a
substitute for the golden -- the golden catches a one-pixel move that a
screenshot never would -- it catches the class the golden cannot, which is
everything the trace records faithfully and wrongly.

## Sprites: what a serious attempt found

The art was seeded by rasterising `shapes.ts` and that pass **threw the roles
away**. 79% of every visible pixel in the roster is one flat body colour;
seven sprites carry no shading pixel at all. The morphologies themselves are
good -- Nitzschia's raphe and striae, Thiobacillus's deposited S0, Beggiatoa's
granules are all there as `dark` and `hi` shapes that never reached the grids.

**A sprite that rotates cannot carry directional light.** `facing: "rotate"`
does `ctx.rotate(heading)` on the whole image, so a baked highlight points
wherever the cell happens to be swimming. That is not a detail, it is the
explanation for the whole problem:

    facing: none     5 sprites   34.0% mean detail
    facing: rotate  15 sprites    4.9% mean detail

The five that never rotate are the five that look good, because whoever drew
them could compose freely. The other fifteen were left flat. Rotating sprites
need rim definition and interior ANATOMY -- granules, septa, inclusions --
which is rotation-invariant and also the more diagnostic choice.

**Only four were re-rasterised, and that is the honest result.** Thin
morphologies -- the spiral, the vibrio's curve, Geobacter's pili -- cannot be
quantised to a 16px grid with four hard colours without breaking up. Seven
passes at threshold, rim rule and zoom fit: overall detail went from 20.7% to
52.5% **and the art got worse**, because the metric was counting rim while the
pigment was being eaten. That is worth stating plainly, because it is the
strongest argument in this document against a certain kind of confidence:
**there is no metric for whether a sprite looks right.** You have to render it
and look at it, which is what `npm run shots` is for. The remaining seventeen
need a hand, not a better algorithm.

**16 vs 24 was settled by measurement, not preference.** A tile is 24.6-63 CSS
px, so at 2x DPR a medium organism is drawn into 45-116 device pixels and 16px
art is magnified 2.8-7.3x. There is room for 24. But rendered side by side at
true device size, 16-shaded and 24-shaded are nearly indistinguishable; the
gain shows in the editing grid, not on the screen. Shading is worth roughly
three times what resolution is. Stay at 16.

## Next

The old list here was written around v0.45 and never revised: items 1 and 2 --
gene effects and a codex -- both shipped, in `weapons.ts`/`barrier.ts`/the
complex effects and in the item card respectively. What is actually left, in
rough order of value:

1. **Sound.** The only whole system still missing. A turn-based game gets
   disproportionate weight from one good hit sound and one ambient bed, and
   the column has an obvious palette: bubbles, sediment, the electrical tick
   of a nanowire discharge. Keep it in a pure module with the timing testable,
   the way `fx.ts` is, and gate it on `settings`.

2. **A settings screen.** `reduceMotion` and `uiScale` are read everywhere,
   persisted correctly, validated on load -- and unreachable. This is the
   cheapest real win on the list, and `reduceMotion` is an accessibility
   feature that currently exists only for people who edit localStorage.

3. **Re-run the audit shapes above against the rest of the tree.** Every
   finding came from four questions, and only the plasmid and the save path
   have been swept with them properly: *who mutates this without going through
   the guard; is this index still valid after that splice; does the test reach
   the failure the way a player does; and does this number mean the same thing
   in every file that reads it.*

4. **Put a browser in the loop, once.** The golden hashes canvas calls and the
   scaling suite checks bounds; neither has ever looked at a pixel. One
   Playwright run producing screenshots at three viewports would confirm or
   kill several standing hypotheses at once -- wall motif density above all,
   which was tuned against offline mocks and is the most likely thing to be
   visually wrong.

5. **Balance, now that the progression actually runs.** Strain level was
   capped at L5 of 8 and a lab-bought strain was wiped on turn one, so every
   number tuned against observed play was tuned against a broken curve. The
   assertions in `spec` bound the shape; the feel is untested.

6. **Delete or recover the Lua tree at the repo root.** It is the old,
   pre-fix state, it is not what runs, and `jumper/` is the pathfinder
   `path.ts` replaced. Right now it is the first thing anyone opening the repo
   sees.
