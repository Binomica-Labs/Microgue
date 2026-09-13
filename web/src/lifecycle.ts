// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Entering a level and starting a run.
//
// Split from main.ts, which had been sitting one line under the 900-line
// ceiling for three versions. These two are the largest methods on Game and
// they are one concern: the transitions INTO somewhere -- a floor, or a fresh
// strain. Everything a run must forget from the last one, and everything a
// floor must set up on arrival, lives here.

import { clearBiofilm } from "./biofilm.js";
import type { Game } from "./main.js";
import type { Level } from "./dungeon.js";
import type { Point } from "./mapgen.js";
import { CLASSES, DEFAULT_CLASS, type ClassId } from "./classes.js";
import * as bio from "./biology.js";
import * as mg from "./mapgen.js";
import { WILD_TYPE, rollAllele } from "./allele.js";
import { Dungeon } from "./dungeon.js";
import { addDrop, rollPart, substratesAt } from "./items.js";
import type { Item } from "./items.js";
import { noStations } from "./lab_level.js";
import { readLab } from "./lab_save.js";
import { Plasmid } from "./plasmid.js";
import { capacityAt, describeStock, restockAmount } from "./production.js";
import { makeRng } from "./rng.js";
import { CONDITIONS, rollCondition } from "./conditions.js";
import { SYMBIONT_IDS } from "./symbiont.js";
import { ROOM_STYLE } from "./rooms.js";
import { newRun } from "./run.js";
import { ZOOM_MAX, ZOOM_MIN } from "./save.js";
import { NAME_POOL, listSlots, loadSlot } from "./saves.js";
import { cleanName, isBlank } from "./name_entry.js";

export function g_enter(_g: Game, level: Level, arrive: Point): void {
  // Biofilm does not follow you: it is territory on a specific floor, and
  // arriving somewhere new clears it.
  clearBiofilm(_g.biofilm);

  _g.level = level;
  // Half the strain formula (strain.ts); only t_win ever wrote it. On
  _g.run.deepest = Math.max(_g.run.deepest, level.floor);   // arrival.
  let p: Point | null = arrive;
  if (!level.grid.isFloor(p.x, p.y)) p = mg.findSpawn(level.grid, p.x, p.y);
  p ??= mg.carveSpawn(level.grid);
  _g.player.x = p.x; _g.player.y = p.y;
  _g.player.ax = p.x; _g.player.ay = p.y;
  _g.cursor = { x: p.x, y: p.y };
  _g.path = null; _g.walk = null;
  _g.zoom = Math.min(Math.max(_g.tileZoom() * _g.settings.zoom, ZOOM_MIN), ZOOM_MAX);
  _g.spotted.clear();
  _g.look();

  // Returning to a floor: whatever has settled since you left. A floor you
  // stripped is barren until the pump refills it, and the pump runs from the
  // top and stops at night.
  if (level.visited) {
    const present = _g.drops.reduce(
      (a, d) => a + d.items.filter((i) => i.kind === "substrate").length, 0);
    const raw = restockAmount(level.depth, present, _g.clock.turn - level.stockedAt,
                              _g.clock, level.stockedAt);
    // The condition scales how much settles: a bloom feeds you, an
    // oligotrophic column starves you.
    const gained = Math.round(raw * CONDITIONS[_g.run.condition].substrate);
    if (gained > 0) _g.scatter(level, gained);
    level.stockedAt = _g.clock.turn;
    _g.note(describeStock(level.depth, present + gained));
  }
  const s = level.stratum;
  if (!level.visited) {
    level.visited = true;
    _g.note(s.blurb);
    if (level.boss && level.bossName !== undefined) {
      _g.note(`Something has taken over this level: ${level.bossName}.`);
      _g.toasts.push(`Boss floor: ${level.bossName}`, "warn", _g.now);
    }
    // Rooms get real caches; the rest of the floor gets scatter.
    const lootRng = makeRng(_g.dungeon.seed ^ (level.floor * 6607));
    for (const room of level.rooms) {
      const style = ROOM_STYLE[room.kind];
      const pool = substratesAt(s.depth);
      for (let i = 0; i < style.loot; i++) {
        const t = room.tiles[lootRng.int(room.tiles.length)];
        if (!t) continue;
        const items: Item[] = [];
        const id = pool[lootRng.int(pool.length)];
        if (id) items.push({ kind: "substrate", id });
        // A regulatory part: the rare drop. A conditional promoter or a
        // tandem terminator changes what the plasmid can BE.
        if (lootRng.next() < (style.loot >= 3 ? 0.55 : 0.16)) {
          const part = rollPart(lootRng.next(), lootRng.next(), s.depth);
          if (part) items.push(part);
        }
        // A port or an enrichment is worth crossing the level for.
        if (style.loot >= 3 && lootRng.next() < 0.55) {
          // A RELICT holds a shallower layer, so its genes are the ones that
          // lived UP THERE -- the whole point of it. Everything else is
          // stocked from the stratum it is actually in.
          //
          // This is the only source of off-stratum genes in the game, and so
          // the only way to carry a surface metabolism down. Without it a
          // build tracks its depth and every deep run converges.
          const from = room.kind === "relict"
            ? 1 + lootRng.int(Math.max(s.depth - 1, 1))
            : s.depth;
          if (room.kind === "relict") room.from = from;
          const genes = bio.microbesAt(from).flatMap((p) => [...p.genes]);
          const g = genes[lootRng.int(Math.max(genes.length, 1))];
          if (g !== undefined && !_g.genome.has(g) && !_g.genome.inBin(g)) {
            // Rolled at the depth it CAME from: a surface organism buried deep
            // did not become a deep organism, and its alleles are what the
            // shallow column produced.
            items.push({ kind: "cassette", gene: g, allele: rollAllele(lootRng, from) });
          }
        }
        addDrop(_g.drops, t.x, t.y, items);
      }
    }

    // A symbiont: the rarest drop, and a CHOICE rather than a stat. At most one
    // per floor, only in a room worth crossing for, and richer columns roll it
    // more often. The pool is fixed, so which one you find is the luck.
    if (level.rooms.some((r) => ROOM_STYLE[r.kind].loot >= 3)) {
      const rich = CONDITIONS[_g.run.condition].lootRichness;
      if (lootRng.next() < 0.12 * rich) {
        const room = level.rooms.find((r) => ROOM_STYLE[r.kind].loot >= 3);
        const t = room?.tiles[lootRng.int(room.tiles.length)];
        if (t) {
          const sid = SYMBIONT_IDS[lootRng.int(SYMBIONT_IDS.length)];
          if (sid) addDrop(_g.drops, t.x, t.y, [{ kind: "symbiont", id: sid }]);
        }
      }
    }

    // Initial stock. Thereafter the floor refills from ABOVE, over time --
    // see production.ts and the restock on every later arrival below.
    _g.scatter(level, capacityAt(s.depth));
    level.stockedAt = _g.clock.turn;
  }
  // Descending should feel like passing through something.
  _g.fx.clear();
  _g.packets.length = 0;
  _g.clouds.length = 0;
  _g.drops.length = 0;
  _g.openDrop = null;
  _g.fx.add({ kind: "wipe", t0: _g.now, dur: 460, colour: s.wall, down: true });
  _g.save();
}

export function g_startRun(
  _g: Game, slot: number, cls: ClassId = DEFAULT_CLASS, name?: string,
): void {

  // A new strain inherits NOTHING about what the last one was doing.
  //
  // These are all field initialisers, which run once when the Game is
  // constructed -- not once per run. They are also transient, so a reload
  // does not clear them either. Die while auto-exploring, inoculate the
  // next culture, and it walked off on its own before the player had
  // touched anything.
  //
  // Reset here rather than at death: death is not the only way a run ends,
  // and this is the one place a run BEGINS.
  _g.intro = null;                 // the lab is behind you
  // Abilities are per-run: a cooldown, a laid enzyme or an armed shot
  // from the last strain is not this one's.
  _g.cooldowns.clear();
  _g.secretions = [];
  _g.surge = null;
  _g.aiming = null;
  _g.introStations = noStations();
  _g.exploring = false;
  _g.walk = null;
  _g.target = null;
  _g.strikeAfterTravel = null;
  _g.path = null;
  _g.offer = null;
  _g.openDrop = null;
  // Screens too. Inoculating from the lab left the lab OPEN over the new
  // run, and the map screen showed the old floor until it was reopened.
  _g.showMap = false;
  _g.showLab = false;
  _g.showNotes = false;
  _g.showPlasmid = false;
  const ex = _g.buttons.find((b) => b.id === "explore");
  if (ex) ex.active = false;

  _g.slot = slot;
  // The lab outlives every strain, so it is read here rather than from the
  // slot file: dying, or deleting a save, must not cost the meta-progression.
  _g.lab = readLab();
  _g.dead = false;
  _g.deathRecord = null;
  _g.lastAttacker = null;
  const existing = loadSlot(slot);
  const info = listSlots()[slot];
  // A name the player typed wins. A resumed run keeps the name it was saved
  // with. Only a fresh, unnamed strain draws from the prebaked pool.
  const typed = name !== undefined && !isBlank(name) ? cleanName(name) : null;
  _g.runName = typed ?? info?.name ?? NAME_POOL[slot % NAME_POOL.length] ?? "unnamed";

  if (existing) {
    _g.applySave(existing);
    _g.note(`Resumed ${_g.runName}.`);
  } else {
    const seed = (Date.now() & 0xffff) + slot;
    _g.dungeon = new Dungeon(96, 96, seed);
    _g.genome = new Plasmid();
    _g.run = newRun();          // a new culture has seen nothing
    // The column this time. Rolled from the seed so a given descent is
    // reproducible, and announced so the player knows what they are walking
    // into -- see conditions.ts.
    _g.run.condition = rollCondition(makeRng(seed ^ 0x5eed).next());
    const cond = CONDITIONS[_g.run.condition];
    if (cond.id !== "none") _g.note(`${cond.name}. ${cond.note}`);

    // Everything the lab has ordered is on the new strain from turn one.
    // This is what the previous strain died for.
    // The CLASS first: it decides the chromosome the lab's constructs then
    // land on. Applying it after the stock would let a class with fewer
    // sites push already-ordered genes off the ring.
    _g.strainClass = cls;
    const def = CLASSES[cls];
    _g.genome.integrated = Math.max(_g.lab.startSites + def.sites, 0);
    _g.genome.strain = _g.lab.startStrain;
    if (def.trait) _g.genome.acquire(def.trait);

    // Its opening operon, laid down as a WORKING unit -- promoter, genes,
    // terminator -- not dropped in the bin for the player to assemble. The
    // class is what you inoculated, so it should already be running.
    for (const g of def.genes) {
      _g.genome.stash({ kind: "gene", id: g, level: 1, mods: [],
                          allele: WILD_TYPE });
    }
    const built = _g.genome.assemble([...def.genes]);
    if (!built.ok) _g.trace.push(0, "note", `class operon: ${built.err}`);

    for (const g of _g.lab.stock) {
      _g.genome.stash({ kind: "gene", id: g, level: 1, mods: [],
                          allele: WILD_TYPE });
    }

    _g.player.hp = _g.player.maxhp;
    _g.player.atp = _g.player.atpMax;
    _g.player.status.length = 0;
    _g.enter(_g.dungeon.current(), _g.dungeon.current().up);
    _g.note(`${def.name} ${_g.runName} inoculated. ${def.blurb}`
      + (_g.lab.stock.length > 0
        ? ` ${String(_g.lab.stock.length)} synthesised construct`
          + `${_g.lab.stock.length === 1 ? "" : "s"} in the bin.`
        : ""));
  }
  _g.started = true;
  _g.showSplash = false;
  _g.save();
}
