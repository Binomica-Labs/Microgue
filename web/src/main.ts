// Microgue -- browser shell. Canvas rendering, pointer + keyboard input,
// localStorage persistence. Everything above this file is engine-free logic.

import * as bio from "./biology.js";
import { Dungeon, type Level, type Mob } from "./dungeon.js";
import { ATP_MAX, BIN_CAP, Plasmid } from "./plasmid.js";
import { binAt, drawBin, drawRing, describe as describeSlot, slotAt,
         type BinGeom, type RingGeom } from "./plasmid_ui.js";
import { buttonAt, drawButtons, layoutButtons, makeButtons, type Button } from "./buttons.js";
import { classifyDown, classifyKey, type Gesture } from "./gesture.js";
import { clampView, drawGraph, fitView, moduleBoxes, moduleLabelAt, toWorld,
         type ModuleBox, type View } from "./kegg_ui.js";
import * as mg from "./mapgen.js";
import type { Point } from "./mapgen.js";
import { findPath } from "./path.js";
import { drawBar, drawColumn, type HudLayout } from "./hud.js";
import { drawBody, paintWallMotif, paletteForPigment, playerSprite, sprite }
  from "./paint.js";
import { traceWalls } from "./walls.js";
import { Effects, easeInQuad as easeInQuadLocal, easeOutCubic, easeOutQuad,
         jitter, lungeOffset } from "./fx.js";
import { headingOf, squashFor, travel, turnToward, wake } from "./motion.js";
import { microbeTurn } from "./combat.js";
import { SIZES } from "./behaviour.js";
import { boundsOf, centreOf, stretchOf } from "./footprint.js";
import { nextAction, type Action } from "./pursuit.js";
import { cloudAlpha, cloudTiles, stepClouds, stepPackets,
         type Cloud, type Packet } from "./projectile.js";
import { WEAPONS } from "./weapons.js";
import { drawClose, inBox as inBoxOf, type Box } from "./chrome.js";
import { drawNotes, drawSplash } from "./screens.js";
import { SUBSTRATES, addDrop, dropAt, itemColour, itemName, itemNote, removeDrop,
         substratesAt, yieldOf, type Drop, type Item } from "./items.js";
import * as say from "./flavour.js";
import { computeFov, isSeen, isVisible, sightRadius } from "./fov.js";
import { isNight, lightAt, newClock, timeName, type Clock } from "./cycle.js";
import { MAX_FLOOR } from "./dungeon.js";
import { ROOM_STYLE, roomAt, type Room } from "./rooms.js";
import { exportAnnotation, newRun, recordLocus, recordSighting,
         resynthesise, type RunState } from "./run.js";
import { SOURCES, cached, fetchAll } from "./ncbi.js";
import { STATUS, apply as applyStatus, tick as tickStatus, type Status }
  from "./status.js";
import { NAME_POOL, listSlots, loadSlot, migrateLegacy,
         saveSlot } from "./saves.js";
import { makeRng } from "./rng.js";
import { TOAST_COLOUR, TOAST_EDGE, Toasts, guard } from "./toast.js";
import { DEFAULT_SETTINGS, SCHEMA, readSave, writeSave,
         type SaveData, type Settings } from "./save.js";

const TILE = 32;
const SAVE_KEY = "microgue:v1";

class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dungeon = new Dungeon(96, 96, 7);
  genome = new Plasmid();
  level!: Level;
  player = { x: 0, y: 0, ax: 0, ay: 0, hp: 30, maxhp: 30, speed: 18,
             heading: -Math.PI / 2 as number | null,
             atp: ATP_MAX, atpMax: ATP_MAX,
             status: [] as Status[] };
  cursor: Point = { x: 0, y: 0 };
  path: Point[] | null = null;
  walk: { nodes: Point[]; i: number } | null = null;
  zoom = 1;
  log: { text: string; t: number }[] = [];
  showPlasmid = false;
  buttons: Button[] = makeButtons();
  ring: RingGeom = { cx: 0, cy: 0, rInner: 0, rOuter: 0, rot: 0 };
  // A pointer gesture is classified once on down and acted on once on up.
  // Deciding per-event is what let a button press open the plasmid on down and
  // a stray dismiss check close it again on up, in the same tap.
  gesture: Gesture = "none";
  gestureBtn: Button | null = null;
  closeBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  dragFrom: number | null = null;
  dragBin: number | null = null;
  bin: BinGeom = { x: 0, y: 0, cell: 0, gap: 0, cols: 6 };
  showMap = false;
  showSplash = true;
  slotBoxes: { x: number; y: number; w: number; h: number }[] = [];
  view: View | null = null;
  boxes: ModuleBox[] = moduleBoxes();
  panFrom: { x: number; y: number } | null = null;
  panMoved = 0;
  dragXY: { x: number; y: number } | null = null;
  selected: number | null = null;
  spinFrom: number | null = null;
  spinStart: number | null = null;
  barH = 0;
  logH = 0;
  settings: Settings = DEFAULT_SETTINGS;
  private last = 0;
  fx = new Effects();
  turnSeed = 1;
  /** The microbe being chased, if any. Cleared when it dies or is lost. */
  target: Mob | null = null;
  autoAttack = false;
  private autoAt = 0;
  run: RunState = newRun();
  showNotes = false;
  private exporting = false;
  drops: Drop[] = [];
  private spotted = new Set<number>();
  private inRoom: Room | null = null;
  won = false;
  clock: Clock = newClock();
  openDrop: Drop | null = null;
  dropBoxes: Box[] = [];
  packets: Packet[] = [];
  clouds: Cloud[] = [];
  started = false;
  toasts = new Toasts();

  /** Every browser entry point routes failures here rather than throwing. */
  private report = (msg: string): void => { this.toasts.push(msg, "error", this.now); };
  slot = 0;
  runName = "SP162";
  now = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    // The splash decides what to load, so boot does not.
    migrateLegacy();
    this.resize();
    addEventListener("resize", () => {
      guard("resize", () => { this.resize(); }, undefined, this.report);
    });
    this.bindInput();
    requestAnimationFrame((t) => { this.frame(t); });
  }

  // ---------------------------------------------------------------- state
  /** Messages expire. Boot lines -- the stratum banner, the blurb, "Resumed."
   *  -- were eating four of five slots and crowding out actual play. */
  note(s: string): void {
    this.log.push({ text: s, t: performance.now() });
    while (this.log.length > 8) this.log.shift();
  }

  enter(level: Level, arrive: Point): void {
    this.level = level;
    let p: Point | null = arrive;
    if (!level.grid.isFloor(p.x, p.y)) p = mg.findSpawn(level.grid, p.x, p.y);
    p ??= mg.carveSpawn(level.grid);
    this.player.x = p.x; this.player.y = p.y;
    this.player.ax = p.x; this.player.ay = p.y;
    this.cursor = { x: p.x, y: p.y };
    this.path = null; this.walk = null;
    this.zoom = this.tileZoom();
    this.spotted.clear();
    this.look();
    const s = level.stratum;
    if (!level.visited) {
      level.visited = true;
      this.note(s.blurb);
      if (level.boss && level.bossName !== undefined) {
        this.note(`Something has taken over this level: ${level.bossName}.`);
        this.toasts.push(`Boss floor: ${level.bossName}`, "warn", this.now);
      }
      // Rooms get real caches; the rest of the floor gets scatter.
      const lootRng = makeRng(this.dungeon.seed ^ (level.floor * 6607));
      for (const room of level.rooms) {
        const style = ROOM_STYLE[room.kind];
        const pool = substratesAt(s.depth);
        for (let i = 0; i < style.loot; i++) {
          const t = room.tiles[lootRng.int(room.tiles.length)];
          if (!t) continue;
          const items: Item[] = [];
          const id = pool[lootRng.int(pool.length)];
          if (id) items.push({ kind: "substrate", id });
          // A port or an enrichment is worth crossing the level for.
          if (style.loot >= 3 && lootRng.next() < 0.55) {
            const genes = bio.microbesAt(s.depth).flatMap((p) => [...p.genes]);
            const g = genes[lootRng.int(Math.max(genes.length, 1))];
            if (g !== undefined && !this.genome.has(g) && !this.genome.inBin(g)) {
              items.push({ kind: "cassette", gene: g });
            }
          }
          addDrop(this.drops, t.x, t.y, items);
        }
      }

      // Litter the floor with what this layer actually holds.
      const pool = substratesAt(s.depth);
      const rng = makeRng(this.dungeon.seed ^ (s.depth * 7919));
      for (let i = 0; i < 14; i++) {
        const x = rng.int(level.grid.w), y = rng.int(level.grid.h);
        if (!level.grid.isFloor(x, y)) continue;
        const id = pool[rng.int(pool.length)];
        if (id) addDrop(this.drops, x, y, [{ kind: "substrate", id }]);
      }
    }
    // Descending should feel like passing through something.
    this.fx.clear();
    this.packets.length = 0;
    this.clouds.length = 0;
    this.drops.length = 0;
    this.openDrop = null;
    this.fx.add({ kind: "wipe", t0: this.now, dur: 460, colour: s.wall, down: true });
    this.save();
  }

  descend(): void {
    if (!Dungeon.isCleared(this.level)) {
      this.note("The way down is choked. Something here has to die first.");
      this.toasts.push("Clear the floor before descending.", "warn", this.now);
      return;
    }
    const r = this.dungeon.descend();
    if ("err" in r) { this.note(r.err); return; }
    this.enter(r.level, r.arrive);
  }
  ascend(): void {
    const r = this.dungeon.ascend();
    if ("err" in r) { this.note(r.err); return; }
    this.enter(r.level, r.arrive);
  }

  // ------------------------------------------------------------- combat
  atk(): number { return 3 + this.genome.power(this.dungeon.depth) * 0.9; }

  /** Per-action upkeep: toxic intermediates bite, complexes repair, and a
   *  sulfide aura burns anything adjacent. */
  private upkeep(): void {
    const d = this.dungeon.depth;

    // Toughness tracks the genome, so building a good plasmid is the whole of
    // character progression. Growth heals; shrinking does not kill.
    const vit = this.genome.vitality(d);
    if (vit !== this.player.maxhp) {
      const gain = vit - this.player.maxhp;
      this.player.maxhp = vit;
      if (gain > 0) this.player.hp = Math.min(this.player.hp + gain, vit);
      this.player.hp = Math.max(Math.min(this.player.hp, vit), 1);
    }

    // Energy first: everything below depends on what the pool can supply.
    const gain = this.genome.atpGain(d);
    const cost = this.genome.atpCost(d);
    this.player.atp = Math.min(this.player.atp + gain, this.player.atpMax);
    if (cost <= this.player.atp) {
      this.player.atp -= cost;
      this.genome.supply = 1;
    } else {
      // Brownout: you cannot power the proteome you are carrying.
      this.genome.supply = this.player.atp / Math.max(cost, 0.001);
      this.player.atp = 0;

      // "Each layer poses an environmental risk due to lack of means to keep
      // ATP pumps going so lifebar slowly drops until metab genes found."
      // Without a respiration that works at this depth you cannot hold the
      // membrane potential, and you bleed until you find one.
      const shortfall = cost - gain;
      if (shortfall > 0) {
        const bleed = Math.max(Math.round(shortfall * 0.5), 1);
        this.player.hp = Math.max(this.player.hp - bleed, 0);
        applyStatus(this.player.status, "starved", 2, 1);
        this.fx.add({ kind: "text", t0: this.now, dur: 700, x: this.player.x,
                      y: this.player.y, text: `-${bleed}`, colour: "#7fc4e8" });
        if (Math.random() < 0.2) {
          const s = bio.stratum(d);
          this.note(say.starveLine(s.donor, s.teap));
        }
      }
    }
    const tox = this.genome.toxicity(d);
    if (tox > 0) {
      this.player.hp = Math.max(this.player.hp - tox, 0);
      const h = this.genome.hazards(d)[0];
      if (h && Math.random() < 0.2) this.note(`${h.name} — ${tox} damage.`);
    }
    const regen = this.genome.regen(d);
    if (regen > 0 && this.player.hp < this.player.maxhp) {
      this.player.hp = Math.min(this.player.hp + regen, this.player.maxhp);
      this.fx.add({ kind: "text", t0: this.now, dur: 700, x: this.player.x,
                    y: this.player.y, text: `+${regen}`, colour: "#7fe0a4" });
    }
    if (tox > 0) {
      this.fx.add({ kind: "text", t0: this.now, dur: 700, x: this.player.x,
                    y: this.player.y, text: `-${tox}`, colour: "#ff9a5a" });
    }
    const aura = this.genome.aura(d);
    if (aura > 0) {
      this.fx.add({ kind: "ring", t0: this.now, dur: 420, x: this.player.x,
                    y: this.player.y, colour: "#c8b0ff", r: 1.6 });
      for (const m of this.level.mobs) {
        if (!m.alive) continue;
        if (Math.abs(m.x - this.player.x) <= 1 && Math.abs(m.y - this.player.y) <= 1) {
          m.hp = Math.max(m.hp - aura, 0);
          if (m.hp <= 0) { m.alive = false; this.note(`${m.name} dissolved by H2S.`); }
        }
      }
    }
  }

  attack(m: Mob): void {
    const dmg = Math.max(Math.round(this.atk()), 1);
    const ranged = Math.abs(m.x - this.player.x) > 1 || Math.abs(m.y - this.player.y) > 1;
    const now = this.now;

    if (ranged) {
      // Nanowire strike. The bolt IS the feedback; there is nothing else.
      this.fx.add({ kind: "bolt", t0: now, dur: 220, colour: "#8fe6ff", seed: now,
                    from: { x: this.player.x, y: this.player.y }, to: { x: m.x, y: m.y } });
    } else {
      this.fx.add({ kind: "lunge", t0: now, dur: 190, who: "player",
                    from: { x: this.player.x, y: this.player.y }, to: { x: m.x, y: m.y } });
    }
    this.fx.add({ kind: "flash", t0: now + 60, dur: 130, x: m.x, y: m.y, colour: "#ffffff" });
    this.fx.add({ kind: "text", t0: now + 60, dur: 620, x: m.x, y: m.y,
                  text: String(dmg), colour: "#ffe0a0" });
    this.fx.shake(Math.min(2 + dmg * 0.35, 7), 190, now);
    this.fx.hitstop(28, now);

    m.hp = Math.max(m.hp - dmg, 0);
    if (m.hp > 0) this.note(say.hitLine(m.name, dmg, false, this.turnSeed + dmg));
    if (m.hp <= 0) {
      m.alive = false;
      if (m.elite && Dungeon.isCleared(this.level)) {
        this.note("The floor goes quiet. The way down is clear.");
        this.toasts.push("Floor cleared.", "info", this.now);
        if (this.dungeon.floor >= MAX_FLOOR) this.win();
      }
      if (recordSighting(this.run, m.id)) {
        this.note(`You record the ${m.name} in your notebook.`);
      }

      // Remains fall where the cell died. Nothing is picked up for free.
      const loot: Item[] = [];
      const rng = makeRng(this.turnSeed + m.x * 31 + m.y);
      const pool = m.genes.filter(
        (g) => !this.genome.has(g) && !this.genome.inBin(g));
      const gene = pool[rng.int(Math.max(pool.length, 1))];
      if (gene !== undefined && rng.next() < 0.8) loot.push({ kind: "cassette", gene });
      const subs = substratesAt(this.dungeon.depth);
      const n = 1 + rng.int(2);
      for (let i = 0; i < n; i++) {
        const id = subs[rng.int(subs.length)];
        if (id) loot.push({ kind: "substrate", id });
      }
      addDrop(this.drops, m.x, m.y, loot);
      if (loot.length > 1) this.note(say.lysateLine(loot.length, m.name));
      // Lysis: the cell bursts. Bigger shake, longer stop, scattered debris.
      this.fx.add({ kind: "burst", t0: this.now + 40, dur: 520, x: m.x, y: m.y,
                    colour: m.pigment, n: 14, seed: this.now + m.x * 31 + m.y });
      this.fx.shake(7, 260, this.now);
      this.fx.hitstop(70, this.now);
      this.note(say.hitLine(m.name, 0, true, this.turnSeed + m.x));

      // Natural transformation: free DNA released by a lysing neighbour is the
      // classic substrate for it, so an occasional direct uptake is right --
      // but most of the genome ends up on the floor to be collected.
      const free = m.genes.filter((g) => !this.genome.has(g) && !this.genome.inBin(g));
      const direct = free[rng.int(Math.max(free.length, 1))];
      if (direct !== undefined && rng.next() < 0.25
          && this.genome.stash({ kind: "gene", id: direct, optimised: false }).ok) {
        recordLocus(this.run, direct);
        this.note(say.hgtLine(direct, m.name));
        this.fx.add({ kind: "bolt", t0: this.now + 120, dur: 380, colour: "#a0ffd0",
                      seed: this.now, from: { x: m.x, y: m.y },
                      to: { x: this.player.x, y: this.player.y } });
      }
    }
    this.mobTurn();
    this.save();
  }

  mobTurn(): void {
    const wasNight = isNight(this.clock);
    this.clock.turn++;
    if (isNight(this.clock) !== wasNight) {
      // Oxygenic photosynthesis stops but respiration does not, so the oxic
      // zone thins overnight and the chemocline rises. Real, and measured.
      this.note(isNight(this.clock)
        ? "The light fails. Photosynthesis stops; the oxic zone begins to thin."
        : "Light returns to the column. The phototrophs stir.");
    }
    this.upkeep();

    const events = microbeTurn({
      grid: this.level.grid,
      mobs: this.level.mobs,
      player: this.player,
      rng: makeRng(this.turnSeed++),
      armour: this.genome.armour(this.dungeon.depth),
      packets: this.packets,
      clouds: this.clouds,
    });

    // Particles fly and gradients decay after the microbes have acted, so a
    // shot fired this turn does not also land this turn.
    const arm = this.genome.armour(this.dungeon.depth);
    for (const h of stepPackets(this.packets, this.level.grid, this.player,
                                (x, y) => this.dungeon.mobAt(x, y) !== undefined)) {
      const dmg = Math.max(Math.round(h.dmg * arm), 1);
      this.player.hp = Math.max(this.player.hp - dmg, 0);
      if (h.inflicts) applyStatus(this.player.status, h.inflicts, 5, 1);
      this.fx.add({ kind: "burst", t0: this.now, dur: 380, x: this.player.x,
                    y: this.player.y, colour: "#c8a0ff", n: 8, seed: this.now });
      this.fx.shake(3, 200, this.now);
    }
    for (const h of stepClouds(this.clouds, this.player)) {
      const dmg = Math.max(Math.round(h.dmg * arm), 1);
      this.player.hp = Math.max(this.player.hp - dmg, 0);
      if (h.inflicts) applyStatus(this.player.status, h.inflicts, 3, 1);
    }

    for (const e of events) {
      if (e.kind === "strike") {
        this.fx.add({ kind: "lunge", t0: this.now, dur: 210, who: e.mob.id,
                      from: { x: e.mob.x, y: e.mob.y },
                      to: { x: this.player.x, y: this.player.y } });
        this.fx.add({ kind: "flash", t0: this.now + 70, dur: 140,
                      x: this.player.x, y: this.player.y, colour: "#ff6a5a" });
        this.fx.add({ kind: "text", t0: this.now + 70, dur: 560, x: this.player.x,
                      y: this.player.y, text: `-${e.dmg ?? 0}`, colour: "#ff8a7a" });
        this.fx.shake(2.5, 180, this.now);
        this.note(say.incomingLine(e.mob.name, e.mob.weapon, e.dmg ?? 0,
                                   this.turnSeed + e.mob.y));
      } else if (e.kind === "charge") {
        // The wind-up is the warning. Ring the microbe that is about to fire.
        this.fx.add({ kind: "ring", t0: this.now, dur: 400, x: e.mob.x, y: e.mob.y,
                      colour: "#ffd166", r: 1.1 });
        this.note(say.chargeLine(e.mob.name, e.mob.weapon));
      } else if (e.kind === "fire") {
        const w = WEAPONS[e.mob.weapon];
        if (w.kind === "bolt" || w.kind === "spear") {
          this.fx.add({ kind: "bolt", t0: this.now, dur: 240,
                        colour: w.kind === "spear" ? "#ffd0a0" : "#8fe6ff",
                        seed: this.now, from: { x: e.mob.x, y: e.mob.y },
                        to: e.at ?? { x: this.player.x, y: this.player.y } });
          this.fx.shake(w.kind === "spear" ? 5 : 3, 200, this.now);
        }
        this.note(say.incomingLine(e.mob.name, e.mob.weapon, e.dmg ?? 0,
                                  this.turnSeed + e.mob.x));
      } else if (e.kind === "status" && e.status) {
        this.note(`${e.mob.name}: ${STATUS[e.status].name}.`);
        this.fx.add({ kind: "ring", t0: this.now, dur: 420, x: this.player.x,
                      y: this.player.y, colour: "#c8a0ff", r: 1.2 });
      }
    }

    // The player's own afflictions resolve here too.
    const selfDmg = tickStatus(this.player.status);
    if (selfDmg > 0) {
      this.player.hp = Math.max(this.player.hp - selfDmg, 0);
      this.fx.add({ kind: "text", t0: this.now, dur: 700, x: this.player.x,
                    y: this.player.y, text: `-${selfDmg}`, colour: "#c8a0ff" });
    }

    if (this.player.hp <= 0) this.die();
    this.save();
  }

  step(x: number, y: number): boolean {
    const m = this.dungeon.mobAt(x, y);
    if (m) { this.attack(m); return false; }
    if (!this.level.grid.isFloor(x, y)) return false;
    this.player.x = x; this.player.y = y;
    this.look();
    this.onTile(x, y);
    this.mobTurn();
    return true;
  }

  /** Take one item. Substrates are metabolised on the spot; cassettes go to
   *  the bin. Returns false if the bin had no room. */
  private take(it: Item): boolean {
    if (it.kind === "cassette") {
      const r = this.genome.stash({ kind: "gene", id: it.gene, optimised: false });
      if (!r.ok) { this.toasts.push(r.err, "warn", this.now); return false; }
      recordLocus(this.run, it.gene);
      this.note(say.pickupLine(it, 0, null));
      return true;
    }
    const { atp, blocked } = yieldOf(it.id, (g) => this.genome.has(g));
    this.player.atp = Math.min(this.player.atp + atp, this.player.atpMax);
    this.note(say.pickupLine(it, atp, blocked));
    if (atp > 0) {
      this.fx.add({ kind: "text", t0: this.now, dur: 700, x: this.player.x,
                    y: this.player.y, text: `+${String(atp)}`, colour: "#7fc4e8" });
    }
    return true;
  }

  /** What is on a tile, in words. */
  private describeTile(x: number, y: number): void {
    const s = this.level.sight;
    if (!isSeen(s, x, y)) { this.note("You have not been there."); return; }
    if (!isVisible(s, x, y)) { this.note("You remember the ground there."); return; }

    const parts: string[] = [];
    const mob = this.dungeon.mobAt(x, y);
    if (mob) parts.push(`A ${mob.name}. ${mob.note}`);
    const d = dropAt(this.drops, x, y);
    if (d) {
      parts.push(d.items.length === 1 && d.items[0]
        ? `${itemName(d.items[0])} lies here.`
        : `A lysate of ${String(d.items.length)} things lies here.`);
    }
    if (this.level.down?.x === x && this.level.down.y === y) {
      parts.push("A way down into the next layer.");
    }
    if (x === this.level.up.x && y === this.level.up.y) parts.push("A way back up.");
    if (parts.length > 0) this.note(parts.join(" "));
  }

  /** Light the level from where the player stands, and interrupt travel if
   *  something new has come into view. DCSS does this and it is the single
   *  thing that stops auto-travel walking you into a fight. */
  private look(): void {
    const s = this.level.sight;
    // Bioluminescence is its own light source, and luciferase needs O2 -- so
    // the glow only helps in the oxic zone, which is where you least need it.
    const glow = this.genome.expression("luxAB", this.dungeon.depth) > 0 ? 2 : 0;
    const lit = lightAt(this.level.stratum.light, this.clock);
    computeFov(s, this.level.grid, this.player.x, this.player.y,
               sightRadius(lit) + glow);

    // Keyed on the INSTANCE. Keying on species-plus-position re-fired every
    // time a microbe took a step, which is once per turn, for ever.
    const nowVisible = new Set<number>();
    const arrivals: Mob[] = [];
    for (const mob of this.level.mobs) {
      if (!mob.alive || !isVisible(s, mob.x, mob.y)) continue;
      nowVisible.add(mob.uid);
      if (!this.spotted.has(mob.uid)) arrivals.push(mob);
    }
    // Leaving sight is what re-arms the alert, so a thing pacing in and out of
    // a doorway does not shout on every step.
    for (const uid of [...this.spotted]) if (!nowVisible.has(uid)) this.spotted.delete(uid);
    for (const mob of arrivals) this.spotted.add(mob.uid);

    if (arrivals.length > 0 && this.walk) {
      this.walk = null;
      this.path = null;
      const names = [...new Set(arrivals.map((a) => a.name))];
      const what = names.length === 1
        ? `a ${names[0] ?? ""}`
        : `${String(arrivals.length)} things`;
      this.note(`You stop. ${what.charAt(0).toUpperCase()}${what.slice(1)} comes into view.`);
      this.toasts.push(`${what} in view.`, "warn", this.now);
    }
  }

  /** Called after the player lands on a tile. */
  private onTile(x: number, y: number): void {
    const room = roomAt(this.level.rooms, x, y);
    if (room && room !== this.inRoom) {
      this.inRoom = room;
      this.note(`${ROOM_STYLE[room.kind].name}. ${ROOM_STYLE[room.kind].note}`);
    } else if (!room) {
      this.inRoom = null;
    }
    const d = dropAt(this.drops, x, y);
    if (!d) return;
    if (d.items.length === 1) {
      const it = d.items[0];
      if (it && this.take(it)) removeDrop(this.drops, d);
      return;
    }
    // More than one: open it rather than swallowing it blind.
    this.openDrop = d;
    this.walk = null;
  }

  /** One turn of chasing. Returns true if anything happened. */
  takeTurn(): boolean {
    const act: Action = nextAction(
      { x: this.player.x, y: this.player.y }, this.level.mobs, this.level.grid,
      this.target, this.autoAttack,
      { reach: this.genome.reach(this.dungeon.depth), maxRange: 24 });

    switch (act.kind) {
      case "attack":
        this.target = act.target;
        this.attack(act.target);
        return true;
      case "step":
        this.target = act.target;
        this.step(act.to.x, act.to.y);
        return true;
      case "idle":
        this.target = null;
        return false;
    }
  }

  /** The bottom of the column, with the last thing on it dead. */
  win(): void {
    if (this.won) return;
    this.won = true;
    this.run.deepest = MAX_FLOOR;
    this.toasts.push("You have reached the bottom of the column.", "info", this.now);
    this.note("Nothing below but carbonate and the glass. The column is yours.");
    this.save();
  }

  /** The run ends. The lineage keeps the loci it has had longest and starts
   *  again at the surface -- "resynthesized with some of the genes you
   *  acquired in the previous run". */
  die(): void {
    const carried = [...this.genome.carried()];
    const kept = resynthesise(carried);
    this.run.deaths += 1;
    this.run.deepest = Math.max(this.run.deepest, this.dungeon.depth);

    this.toasts.push(
      `Lysed at D${this.dungeon.depth}. ${kept.length}/${carried.length - 1} loci ` +
      `survived resynthesis.`, "warn", this.now);

    this.dungeon = new Dungeon(96, 96, (Date.now() & 0xffff) ^ this.run.deaths);
    this.genome = new Plasmid();
    for (const g of kept) this.genome.stash({ kind: "gene", id: g, optimised: false });
    this.player.hp = this.player.maxhp;
    this.player.atp = this.player.atpMax;
    this.player.status.length = 0;
    this.target = null;
    this.autoAttack = false;
    this.packets.length = 0;
    this.clouds.length = 0;
    this.drops.length = 0;
    this.enter(this.dungeon.current(), this.dungeon.current().up);
    this.note(`Resynthesised. Deepest so far: D${this.run.deepest}.`);
    this.save();
  }

  stairs(): boolean {
    const { x, y } = this.player;
    const d = this.level.down;
    if (x === d?.x && y === d.y) { this.descend(); return true; }
    if (this.level.depth > 1 && x === this.level.up.x && y === this.level.up.y) { this.ascend(); return true; }
    return false;
  }

  // -------------------------------------------------------------- input
  repath(): void {
    this.path = findPath(this.level.grid, { x: this.player.x, y: this.player.y },
                         this.cursor, { diagonal: this.settings.diagonal });
  }

  tap(tx: number, ty: number): void {
    if (tx === this.player.x && ty === this.player.y) { if (this.stairs()) return; }
    const m = this.dungeon.mobAt(tx, ty);
    if (m !== undefined) {
      // Tapping a microbe means "go kill that". In range it is a strike; out
      // of range it becomes a pursuit that re-paths as the target moves.
      this.target = m;
      this.walk = null;
      if (this.takeTurn()) return;
      return;
    }
    // Examine before travelling: say what is there, the way a roguelike does.
    this.describeTile(tx, ty);
    this.target = null;
    this.cursor = { x: tx, y: ty };
    this.repath();
    if (this.path && this.path.length > 1) this.walk = { nodes: this.path, i: 0 };
  }

  /** Screen point -> tile. Lives on the class because pointerDown needs it. */
  toTile(cx: number, cy: number): Point {
    const r = this.canvas.getBoundingClientRect();
    const s = TILE * this.zoom;
    return {
      x: Math.floor((cx - r.left - r.width / 2) / s + this.player.ax + 0.5),
      y: Math.floor((cy - r.top - r.height / 2) / s + this.player.ay + 0.5),
    };
  }

  private bindInput(): void {
    this.bindPinch();
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      guard("pointer", () => { this.pointerDown(e.clientX, e.clientY); }, undefined, this.report);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      guard("pointer", () => { this.pointerMove(e.clientX, e.clientY); }, undefined, this.report);
    });
    const release = (e: PointerEvent): void => {
      guard("pointer", () => { this.pointerUp(e.clientX, e.clientY); }, undefined, this.report);
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);

    addEventListener("keydown", (e) => {
      if (this.showSplash || !this.started) return;
      guard("key", () => { this.onKey(e); }, undefined, this.report);
    });
  }

  private onKey(e: KeyboardEvent): void {
    {
      const act = classifyKey(e.key, this.showPlasmid);
      if (act.kind === "none") return;
      e.preventDefault();
      switch (act.kind) {
        case "move": {
          this.walk = null;
          const pinched = act.dx !== 0 && act.dy !== 0
            && !this.level.grid.isFloor(this.player.x + act.dx, this.player.y)
            && !this.level.grid.isFloor(this.player.x, this.player.y + act.dy);
          if (!pinched) this.step(this.player.x + act.dx, this.player.y + act.dy);
          break;
        }
        case "zoom":
          this.zoom = Math.min(Math.max(this.zoom * act.factor, 0.3), 8);
          break;
        case "togglePlasmid": this.openPlasmid(true); break;
        case "closePlasmid": this.openPlasmid(false); break;
        case "toggleHud": break;      // the HUD is always on now
        case "toggleContrast":
          this.settings = { ...this.settings, highContrast: !this.settings.highContrast };
          this.save();
          break;
        case "fullscreen": break;
        case "descend": this.descend(); break;
        case "ascend": this.ascend(); break;
        case "quit": break;
      }
    }
  }

  private bindPinch(): void {
    // Pinch-zoom, without the gesture fighting a tap.
    const pts = new Map<number, Point>();
    let d0 = 0;
    let z0 = 1;
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.showPlasmid) return;         // the ring owns the pointer here
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Point, Point];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0) this.zoom = Math.min(Math.max(z0 * (d / d0), 0.3), 8);
      }
    });
    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.showPlasmid) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Point, Point];
        d0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = this.zoom; this.walk = null;
      }
    });
    const drop = (e: PointerEvent): void => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
    this.canvas.addEventListener("pointerup", drop);
    this.canvas.addEventListener("pointercancel", drop);
  }

  // ------------------------------------------------------------ persist
  save(): void {
    if (this.showSplash || !this.started) return;
    const data = {
      version: SCHEMA,
      depth: this.dungeon.depth,
      floor: this.dungeon.floor,
      seed: this.dungeon.seed,
      px: this.player.x,
      py: this.player.y,
      hp: this.player.hp,
      atp: this.player.atp,
      ring: this.genome.slots.map((p) => (p === null ? null : { ...p })),
      bin: this.genome.bin.map((p) => ({ ...p })),
      run: { deepest: this.run.deepest, deaths: this.run.deaths,
             bestiary: [...this.run.bestiary], library: [...this.run.library] },
      settings: this.settings,
    };
    writeSave(SAVE_KEY, data);
    saveSlot(this.slot, this.runName, data, this.genome.carried().size);
  }

  /** Load a parsed save into live state. Shared by slot loading and boot. */
  applySave(s: SaveData): void {
    this.dungeon = new Dungeon(96, 96, s.seed);
    this.dungeon.floor = s.floor;
    this.genome = new Plasmid();
    s.ring.forEach((p, i) => { this.genome.put(i, p); });
    this.genome.bin.length = 0;
    for (const p of s.bin) this.genome.bin.push({ ...p });
    this.settings = s.settings;
    this.enter(this.dungeon.current(), { x: s.px, y: s.py });
    this.player.hp = s.hp;
    this.player.atp = s.atp;
    this.run = {
      deepest: s.run.deepest, deaths: s.run.deaths,
      bestiary: [...s.run.bestiary], library: [...s.run.library],
    };
  }

  load(): boolean {
    migrateLegacy();
    const s = readSave(SAVE_KEY);
    if (s === null) return false;
    this.applySave(s);
    return true;
  }

  // ------------------------------------------------------------- render
  /** Notch / gesture-bar insets. Read from CSS env() via a probe element,
   *  since canvas has no access to them directly. */
  private insetCache: { top: number; right: number; bottom: number; left: number } | null = null;

  /** Notch / gesture-bar insets. Cached: this touches the DOM, and the first
   *  version ran it on every frame. */
  private insets(): { top: number; right: number; bottom: number; left: number } {
    if (this.insetCache) return this.insetCache;
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;" +
      "top:env(safe-area-inset-top);right:env(safe-area-inset-right);" +
      "bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left)";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v: string): number => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const out = { top: px(cs.top), right: px(cs.right), bottom: px(cs.bottom), left: px(cs.left) };
    probe.remove();
    this.insetCache = out;
    return out;
  }

  /** Largest font size at which `text` fits `maxWidth`, down to a floor. */
  private fitFont(text: string, maxWidth: number, ideal: number): number {
    const { ctx } = this;
    let size = ideal;
    for (; size > 8; size -= 0.5) {
      ctx.font = `${size}px ui-monospace,monospace`;
      if (ctx.measureText(text).width <= maxWidth) break;
    }
    return size;
  }

  /** Word-wrap for the message log, which ran off the right edge. */
  private wrap(text: string, maxWidth: number): string[] {
    const { ctx } = this;
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line === "" ? word : `${line} ${word}`;
      if (ctx.measureText(test).width > maxWidth && line !== "") {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line !== "") lines.push(line);
    return lines;
  }

  tileZoom(): number {
    const short = Math.min(innerWidth, innerHeight);
    const coarse = matchMedia("(pointer: coarse)").matches;
    return Math.max(short / ((coarse ? 13 : 30) * TILE), 0.3);
  }

  resize(): void {
    this.insetCache = null;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(innerWidth * dpr, 1);
    this.canvas.height = Math.max(innerHeight * dpr, 1);
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = this.tileZoom();
  }

  frame(t: number): void {
    // The next frame is scheduled in `finally`, so a single bad frame can no
    // longer kill the loop permanently. Before this, one exception meant a
    // black screen with no way back short of a reload.
    try {
      this.step_(t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.toasts.push(`frame: ${msg}`, "error", t);
      // Draw the failure with a path that shares nothing with draw(). If draw()
      // is what threw, its own toast renderer is unreachable.
      this.drawEmergency(msg);
    } finally {
      requestAnimationFrame((tt) => { this.frame(tt); });
    }
  }

  private step_(t: number): void {
    this.now = t;
    let dt = Math.min(Math.max((t - this.last) / 1000, 0), 1 / 15);
    this.last = t;

    // No world exists until a slot is chosen, so nothing below may run.
    if (this.showSplash || !this.started) {
      this.draw();
      return;
    }
    // Hitstop freezes the animation clock only. Turn state already resolved,
    // so nothing desyncs -- the world just holds still for a beat.
    if (this.fx.frozen(t)) dt = 0;
    this.fx.prune(t);
    this.toasts.prune(t);

    // slide toward the logical tile; clamped so a hitch cannot overshoot
    const k = this.settings.reduceMotion ? 1 : Math.min(this.player.speed * dt, 1);
    this.player.ax += (this.player.x - this.player.ax) * k;
    this.player.ay += (this.player.y - this.player.ay) * k;
    // Face the way you are actually travelling, easing round the short way.
    const TURN = 14;                              // radians per second
    const ph = headingOf(this.player.x - this.player.ax, this.player.y - this.player.ay);
    if (ph !== null) {
      this.player.heading = this.player.heading === null
        ? ph : turnToward(this.player.heading, ph, TURN * dt);
    }
    for (const m of this.level.mobs) {
      if (!m.alive) continue;
      const mk = Math.min(11 * dt, 1);        // microbes glide a touch slower
      m.ax += (m.x - m.ax) * mk;
      m.ay += (m.y - m.ay) * mk;
      if (Math.abs(m.x - m.ax) < 0.02) m.ax = m.x;
      if (Math.abs(m.y - m.ay) < 0.02) m.ay = m.y;
      const mh = headingOf(m.x - m.ax, m.y - m.ay);
      if (mh !== null) {
        m.heading = m.heading === null ? mh : turnToward(m.heading, mh, TURN * dt);
      }
    }

    const at = Math.abs(this.player.x - this.player.ax) < 0.02
            && Math.abs(this.player.y - this.player.ay) < 0.02;
    if (at) { this.player.ax = this.player.x; this.player.ay = this.player.y; }

    // Auto-attack and pursuit both act on a timer so the fight is watchable
    // rather than resolving instantly.
    const busy = this.showPlasmid || this.showMap;
    if (!busy && at && (this.autoAttack || this.target) && t - this.autoAt > 230) {
      this.autoAt = t;
      if (!this.takeTurn() && this.autoAttack) {
        // nothing in range: stop rather than spinning
        this.autoAttack = false;
        const btn = this.buttons.find((b) => b.id === "auto");
        if (btn) btn.active = false;
        this.note("No targets in range. Auto-attack off.");
      }
    }

    // Belt and braces: openPlasmid() clears the walk, but the loop refuses to
    // advance one while the screen is up regardless.
    if (this.walk && at && !this.showPlasmid) {
      this.walk.i++;
      const n = this.walk.nodes[this.walk.i];
      if (!n || this.dungeon.mobAt(n.x, n.y) || !this.step(n.x, n.y)) this.walk = null;
    }

    this.draw();
  }

  draw(): void {
    const { ctx } = this;
    const W = innerWidth, H = innerHeight;

    // Before any world state is touched. This guard used to sit below
    // `this.level.stratum`, so with no run started draw() threw on its fourth
    // line -- and because the toast renderer lives at the bottom of this same
    // function, the error it queued was never drawn either. Black screen, no
    // diagnostic, which is precisely the failure this was meant to prevent.
    if (this.showSplash || !this.started) {
      this.closeBox = drawSplash(ctx, W, H, this.insets(),
        Math.max(Math.min(W, H) / 420, 1), this.slotBoxes, NAME_POOL);
      this.drawToasts(W, H);
      return;
    }

    const s = this.level.stratum;
    const hc = this.settings.highContrast;

    ctx.fillStyle = hc ? "#000" : s.floor;
    ctx.fillRect(0, 0, W, H);

    const px = TILE * this.zoom;
    ctx.save();
    const sh = this.fx.shakeOffset(this.now);
    ctx.translate(W / 2 - (this.player.ax + 0.5) * px + sh.x,
                  H / 2 - (this.player.ay + 0.5) * px + sh.y);

    const x0 = Math.max(Math.floor((this.player.ax - W / px / 2) - 1), 0);
    const x1 = Math.min(Math.ceil((this.player.ax + W / px / 2) + 1), this.level.grid.w - 1);
    const y0 = Math.max(Math.floor((this.player.ay - H / px / 2) - 1), 0);
    const y1 = Math.min(Math.ceil((this.player.ay + H / px / 2) + 1), this.level.grid.h - 1);

    // Walls as one traced contour, not a grid of squares. Corners round where
    // they are exposed and fillet where three tiles meet, so the region reads
    // as organic rather than tiled. All tiles go into a single path and fill
    // together under nonzero winding, so shared edges leave no seam.
    // One Path2D, used for both the fill and the motif clip. Tracing twice a
    // frame cost 29 us; this halves it and the geometry is identical by
    // construction rather than by hoping the two calls match.
    const wallPath = new Path2D();
    traceWalls(wallPath, this.level.grid, x0, y0, x1, y1, hc ? 0 : 0.5);
    const sight = this.level.sight;

    ctx.fillStyle = hc ? "#ffffff" : s.wall;
    ctx.save();
    ctx.scale(px, px);
    ctx.fill(wallPath);
    ctx.restore();

    if (!hc && px >= 40) {
      ctx.save();
      ctx.scale(px, px);
      ctx.clip(wallPath);
      ctx.scale(1 / px, 1 / px);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!this.level.grid.isWall(x, y)) continue;
          paintWallMotif(ctx, s.depth, x, y, Math.round(x * px), Math.round(y * px), px, s.floor);
        }
      }
      ctx.restore();
    }

    if (this.path) {
      // Trim the stretch already walked, so the trail shows where you are
      // going rather than where you have been.
      const at = this.path.findIndex((p) => p.x === this.player.x && p.y === this.player.y);
      const ahead = at >= 0 ? this.path.slice(at + 1) : this.path;
      ctx.fillStyle = hc ? "#ff0" : s.accent;
      ctx.globalAlpha = 0.5;
      for (const p of ahead) {
        ctx.fillRect(p.x * px + px * 0.38, p.y * px + px * 0.38, px * 0.24, px * 0.24);
      }
      ctx.globalAlpha = 1;
    }

    const stair = (p: Point, down: boolean) => {
      ctx.strokeStyle = hc ? "#fff" : "#ffe9a0";
      ctx.lineWidth = Math.max(px * 0.08, 2);
      ctx.strokeRect(p.x * px + px * 0.12, p.y * px + px * 0.12, px * 0.76, px * 0.76);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `bold ${px * 0.5}px ui-monospace,monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(down ? "\u25BC" : "\u25B2", p.x * px + px / 2, p.y * px + px / 2);
    };
    if (this.level.down) stair(this.level.down, true);
    if (this.level.depth > 1) stair(this.level.up, false);

    // Lunges indexed once per frame. Scanning the whole effect queue inside
    // the mob loop was O(mobs x effects) -- 27 us a frame at 14 mobs.
    const lunges = new Map<string, { x: number; y: number }>();
    for (const f of this.fx.all()) {
      if (f.kind !== "lunge") continue;
      const o = lungeOffset(f, this.now);
      const cur = lunges.get(f.who);
      if (cur) { cur.x += o.x; cur.y += o.y; } else { lunges.set(f.who, { x: o.x, y: o.y }); }
    }

    for (const m of this.level.mobs) {
      if (!m.alive) continue;
      // A remembered room is not knowledge of what is standing in it now.
      if (!isVisible(sight, m.x, m.y)) continue;
      const f = Math.max(m.hp / m.maxhp, 0);
      const ml = lunges.get(m.id);
      const mx = ml?.x ?? 0, my = ml?.y ?? 0;
      // Size is real: Synechococcus is about 1 um, a Beggiatoa filament 200.
      // A multi-tile body is drawn across its whole footprint and stretched
      // along its own axis, so a filament reads as one long organism rather
      // than a large blob on a single square.
      const fp = SIZES[m.size].footprint;
      const scale = SIZES[m.size].scale;
      const spread = fp === "block2" ? 2 : 1;
      const c = centreOf(fp, m.ax, m.ay, m.heading);
      const img = hc ? null : sprite(m.id, px * scale * spread,
                                     paletteForPigment(m.pigment));
      if (img) {
        const v = travel(m.ax, m.ay, m.x, m.y);
        const sq = squashFor(v, 0.16);
        const bx = (c.x + mx + 0.5) * px, by = (c.y + my + 0.5) * px;
        for (const w of wake(m.heading, v, 2)) {
          drawBody(ctx, img, bx + w.dx * px, by + w.dy * px, px * scale * spread,
                   m.facing, m.heading, sq, w.alpha * 0.7, "east", stretchOf(fp));
        }
        drawBody(ctx, img, bx, by, px * scale * spread, m.facing, m.heading, sq,
                 1, "east", stretchOf(fp));
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(m.x * px + px * 0.15, m.y * px + px * 0.15, px * 0.7, px * 0.7);
        ctx.fillStyle = "#000000";
        ctx.font = `bold ${px * 0.5}px ui-monospace,monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(m.glyph, m.x * px + px / 2, m.y * px + px * 0.4);
      }
      // Only once damaged, so a fresh level is not wallpapered in gauges.
      if (f < 1) {
        const bx = c.x * px + px * 0.2;
        const by = c.y * px + px * 0.87;
        const bw = px * 0.6;
        const bh = Math.max(px * 0.08, 3);
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "#ffd08a";
        ctx.fillRect(bx, by, bw * f, bh);
      }
    }

    const pl = lunges.get("player");
    const lx = pl?.x ?? 0, ly = pl?.y ?? 0;
    const me = hc ? null : playerSprite(px * 0.92);
    if (me) {
      const v = travel(this.player.ax, this.player.ay, this.player.x, this.player.y);
      const sq = squashFor(v);
      // The beat runs always, and faster when swimming. A still flagellum is
      // just a wire; the motion is what makes it read as one.
      const flag = {
        phase: this.now / (this.settings.reduceMotion ? 1e9 : 130 - v * 60),
        colour: "#8fe6ff", len: 0.52, amp: 0.15,
      };
      const bx = (this.player.ax + lx + 0.5) * px;
      const by = (this.player.ay + ly + 0.5) * px;
      // Wake: a cell moving through fluid leaves one.
      for (const w of wake(this.player.heading, v)) {
        drawBody(ctx, me, bx + w.dx * px, by + w.dy * px, px * 0.92,
                 "rotate", this.player.heading, sq, w.alpha, "east", 1, null);
      }
      drawBody(ctx, me, bx, by, px * 0.92, "rotate", this.player.heading, sq,
               1, "east", 1, flag);
    } else {
      ctx.fillStyle = "#0ff";
      ctx.fillRect((this.player.ax + lx) * px + px * 0.18,
                   (this.player.ay + ly) * px + px * 0.18, px * 0.64, px * 0.64);
    }

    // The highlight covers the whole body. Boxing one tile of a three-tile
    // filament reads as though you are aiming at a fragment of it.
    const t = this.target;
    if (t?.alive === true) {
      const tb = boundsOf(SIZES[t.size].footprint, t.x, t.y, t.heading);
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(tb.minX * px, tb.minY * px,
                     (tb.maxX - tb.minX + 1) * px, (tb.maxY - tb.minY + 1) * px);
    }
    const under = this.dungeon.mobAt(this.cursor.x, this.cursor.y);
    // Red means "this is what I am going to kill". Orange is merely hovered.
    const isTarget = under !== undefined && under === this.target;
    ctx.strokeStyle = hc ? "#ff0"
      : isTarget ? "#ff3b30" : under ? "#ff9a7a" : this.path ? "#ffffff" : "#777777";
    ctx.lineWidth = isTarget ? 3.5 : 2;
    if (under) {
      const b = boundsOf(SIZES[under.size].footprint, under.x, under.y, under.heading);
      ctx.strokeRect(b.minX * px, b.minY * px,
                     (b.maxX - b.minX + 1) * px, (b.maxY - b.minY + 1) * px);
      if (isTarget) {
        ctx.fillStyle = "rgba(255,59,48,0.14)";
        ctx.fillRect(b.minX * px, b.minY * px,
                     (b.maxX - b.minX + 1) * px, (b.maxY - b.minY + 1) * px);
      }
    } else {
      ctx.strokeRect(this.cursor.x * px, this.cursor.y * px, px, px);
    }
    // Gradients under everything, particles over it.
    for (const c of this.clouds) {
      ctx.globalAlpha = cloudAlpha(c, WEAPONS.cloud.persist) * 0.28;
      ctx.fillStyle = c.colour;
      for (const t of cloudTiles(c.cx, c.cy, c.radius)) {
        ctx.fillRect(t.x * px, t.y * px, px, px);
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.packets) {
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc((p.x + 0.5) * px, (p.y + 0.5) * px, px * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc((p.x + 0.5 - p.dx * 0.4) * px, (p.y + 0.5 - p.dy * 0.4) * px,
              px * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Rooms get a faint floor wash so a chamber reads as a place, but only
    // where you have actually been.
    for (const room of this.level.rooms) {
      ctx.fillStyle = room.kind === "port" ? "rgba(120,200,255,0.07)"
        : room.kind === "enrichment" ? "rgba(255,200,120,0.08)"
        : room.kind === "mat" ? "rgba(220,190,90,0.07)"
        : "rgba(255,255,255,0.035)";
      for (const t of room.tiles) {
        if (!isSeen(sight, t.x, t.y)) continue;
        ctx.fillRect(t.x * px, t.y * px, px + 1, px + 1);
      }
    }

    // Loot on the floor: a lozenge per tile, marked when it is a pile.
    for (const d of this.drops) {
      const it = d.items[0];
      if (!it) continue;
      if (!isVisible(sight, d.x, d.y)) continue;      // loot is not remembered
      const cx = (d.x + 0.5) * px, cy = (d.y + 0.5) * px;
      ctx.fillStyle = itemColour(it);
      ctx.beginPath();
      ctx.ellipse(cx, cy, px * 0.2, px * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = Math.max(px * 0.02, 1);
      ctx.stroke();
      if (d.items.length > 1) {
        ctx.fillStyle = "#0f1512";
        ctx.font = `bold ${px * 0.22}px ui-monospace,monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d.items.length), cx, cy);
      }
    }
    // The fog. Unseen is black, remembered is dimmed, lit is untouched.
    if (!hc) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (isVisible(sight, x, y)) continue;
          ctx.fillStyle = isSeen(sight, x, y) ? "rgba(2,4,4,0.62)" : "#020404";
          ctx.fillRect(x * px, y * px, px + 1, px + 1);
        }
      }
    }
    this.drawFx(px);
    ctx.restore();

    this.drawScreenFx(W, H);
    this.drawHud(W, H);
    if (this.openDrop) this.drawContainer(W, H);
    this.drawToasts(W, H);
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    if (this.showNotes) {
      this.closeBox = drawNotes(ctx, W, H, this.insets(),
        Math.max(Math.min(W, H) / 420, 1), this.run,
        (t, w) => this.wrap(t, w));
      this.drawToasts(W, H);
      return;
    }
    if (this.showMap) {
      this.drawMapScreen(W, H);
    } else if (this.showPlasmid) {
      this.drawPlasmid(W, H);
    } else {
      layoutButtons(this.buttons, W, H, this.insets(), u, this.barH + this.logH);
      drawButtons(ctx, this.buttons, u);
    }
  }

  /** World-space effects, drawn inside the camera transform. */
  drawFx(px: number): void {
    const { ctx } = this;
    const now = this.now;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const f of this.fx.all()) {
      const t = Effects.t(f, now);
      if (now < f.t0) continue;

      switch (f.kind) {
        case "flash": {
          ctx.globalAlpha = (1 - t) * 0.85;
          ctx.fillStyle = f.colour;
          ctx.fillRect(f.x * px + px * 0.06, f.y * px + px * 0.06, px * 0.88, px * 0.88);
          break;
        }
        case "text": {
          // rise and fade
          ctx.globalAlpha = 1 - easeInQuadLocal(t);
          ctx.fillStyle = f.colour;
          ctx.font = `bold ${px * 0.34}px ui-monospace,monospace`;
          ctx.fillText(f.text, (f.x + 0.5) * px, (f.y + 0.4 - t * 0.8) * px);
          break;
        }
        case "burst": {
          const e = easeOutCubic(t);
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = f.colour;
          for (let i = 0; i < f.n; i++) {
            const j = jitter(f.seed, i);
            const d = (0.25 + Math.abs(j.x) * 0.7) * e;
            const r = px * 0.055 * (1 - t * 0.6);
            ctx.beginPath();
            ctx.arc((f.x + 0.5 + j.x * d) * px, (f.y + 0.5 + j.y * d) * px, r, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case "bolt": {
          // A jagged discharge that draws in, then fades.
          const grow = easeOutQuad(Math.min(t * 2.2, 1));
          ctx.globalAlpha = 1 - easeInQuadLocal(t);
          ctx.strokeStyle = f.colour;
          ctx.lineWidth = Math.max(px * 0.055, 2);
          ctx.lineCap = "round";
          ctx.beginPath();
          const segs = 7;
          for (let i = 0; i <= segs; i++) {
            const k = (i / segs) * grow;
            const j = jitter(f.seed, i);
            const bx = (f.from.x + (f.to.x - f.from.x) * k + 0.5 + j.x * 0.13) * px;
            const by = (f.from.y + (f.to.y - f.from.y) * k + 0.5 + j.y * 0.13) * px;
            if (i === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
          }
          ctx.stroke();
          break;
        }
        case "ring": {
          const e = easeOutCubic(t);
          ctx.globalAlpha = (1 - t) * 0.6;
          ctx.strokeStyle = f.colour;
          ctx.lineWidth = Math.max(px * 0.05, 2);
          ctx.beginPath();
          ctx.arc((f.x + 0.5) * px, (f.y + 0.5) * px, f.r * px * e, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "lunge": case "wipe": break;    // handled elsewhere
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Screen-space effects: the level-transition wipe. */
  drawScreenFx(W: number, H: number): void {
    const { ctx } = this;
    for (const f of this.fx.all()) {
      if (f.kind !== "wipe") continue;
      const t = Effects.t(f, this.now);
      ctx.globalAlpha = 1 - easeOutQuad(t);
      ctx.fillStyle = f.colour;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  drawHud(W: number, H: number): void {
    const { ctx } = this;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    const pad = 8 * u;
    const left = ins.left + pad;
    const maxW = W - ins.left - ins.right - pad * 2;
    const s = this.level.stratum;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const L: HudLayout = {
      u, left: ins.left, right: ins.right, top: ins.top, bottom: ins.bottom,
      w: W, h: H, reserve: this.barH,
    };

    // The column gauge: eight bands in their stratum colours, your depth
    // marked. The game's structure, drawn literally.
    const gaugeW = drawColumn(ctx, L, this.dungeon.depth);
    // A sealed floor must say so, or the blocked stair reads as a bug.
    const sealed = !Dungeon.isCleared(this.level);
    const upBtn = this.buttons.find((b) => b.id === "up");
    const downBtn = this.buttons.find((b) => b.id === "down");
    if (upBtn) upBtn.enabled = this.dungeon.depth > 1;
    if (downBtn) downBtn.enabled = this.level.down !== null;
    const pl = this.buttons.find((b) => b.id === "plasmid");
    if (pl) pl.active = this.showPlasmid;

    const barX = left + gaugeW;
    const barW = Math.min(W - barX - ins.right - pad, 260 * u);
    const size = Math.min(this.fitFont(s.name, barW - 12, 13 * u), 13 * u);
    ctx.font = `${size}px ui-monospace,monospace`;
    const lh = size * 1.35;
    const barH = lh * 2.6 + pad;
    const barTop = H - ins.bottom - barH;
    this.barH = barH;

    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, barTop, W, barH + ins.bottom);

    ctx.fillStyle = s.accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`F${this.dungeon.floor}/${MAX_FLOOR}${sealed ? " \u26D4" : ""} ${s.name}  ${s.teap} ${s.e0 >= 0 ? "+" : ""}${s.e0}mV  ${timeName(this.clock)}`,
                 barX, barTop + lh * 0.9);

    // One row: hp gauge, then plain readouts. A miniature plasmid ring used to
    // sit here and read as an unexplained circle, so it is gone -- the real
    // ring is one tap away and legible.
    const gaugeH = Math.max(lh * 0.8, 12);
    const hpW = Math.min(barW * 0.44, 150 * u);
    drawBar(ctx, barX, barTop + lh * 1.15, hpW, gaugeH,
            this.player.hp / this.player.maxhp, "#4fbf6a",
            `hp ${Math.max(this.player.hp, 0)}/${this.player.maxhp}`,
            `${size * 0.86}px ui-monospace,monospace`);

    const bal = this.genome.atpBalance(this.dungeon.depth);
    drawBar(ctx, barX + hpW + 8 * u, barTop + lh * 1.15, hpW, gaugeH,
            this.player.atp / this.player.atpMax,
            bal >= 0 ? "#4a9fd8" : "#c86a3a",
            `atp ${Math.round(this.player.atp)}  ${bal >= 0 ? "+" : ""}${bal.toFixed(1)}`,
            `${size * 0.86}px ui-monospace,monospace`);

    const ops = this.genome.operons().filter((op) => op.genes.length > 0).length;
    ctx.font = `${size * 0.86}px ui-monospace,monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    // Shortened and measured: the long form clipped off the right edge.
    const tailX = barX + hpW * 2 + 18 * u;
    const room = W - ins.right - 6 * u - tailX;
    const long = `${ops} operon${ops === 1 ? "" : "s"}   ${this.dungeon.aliveCount()} hostile`;
    const short = `${ops}op  ${this.dungeon.aliveCount()}hp`;
    ctx.fillText(ctx.measureText(long).width <= room ? long : short,
                 tailX, barTop + lh * 1.15 + gaugeH / 2);
    ctx.textBaseline = "alphabetic";

    const LIFE = 9000;
    const FADE = 2000;
    const now = performance.now();
    const wrapped: { line: string; alpha: number }[] = [];
    for (const entry of this.log) {
      const age = now - entry.t;
      if (age > LIFE) continue;
      const alpha = age > LIFE - FADE ? (LIFE - age) / FADE : 1;
      for (const line of this.wrap(entry.text, maxW)) wrapped.push({ line, alpha });
    }
    const shown = wrapped.slice(-4);
    // +lh: text is positioned by baseline, so the top line's ascender sits
    // ABOVE its y. Sizing the panel to shown.length*lh left it exposed.
    const logH = shown.length > 0 ? (shown.length + 0.4) * lh + pad * 0.5 : 0;
    this.logH = logH;

    if (logH > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, barTop - logH, W, logH);
    }
    ctx.font = `${size}px ui-monospace,monospace`;

    for (let i = shown.length - 1; i >= 0; i--) {
      const row = shown[i];
      if (row === undefined) continue;
      ctx.globalAlpha = row.alpha;
      ctx.fillStyle = "#cfe8d4";
      ctx.fillText(row.line, barX, barTop - (shown.length - i) * lh - pad * 0.25);
    }
    ctx.globalAlpha = 1;
  }

  drawPlasmid(W: number, H: number): void {
    const { ctx } = this;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    ctx.fillStyle = "rgba(0,0,0,0.93)";
    ctx.fillRect(0, 0, W, H);

    const avail = Math.min(W - ins.left - ins.right, H * 0.46);
    this.ring = {
      cx: W / 2,
      cy: ins.top + avail * 0.55 + 20 * u,
      rOuter: avail * 0.42,
      rInner: avail * 0.42 - Math.max(avail * 0.11, 30 * u),
      rot: this.ring.rot,
    };

    drawRing(ctx, this.ring, this.genome, {
      depth: this.dungeon.depth,
      dragFrom: this.dragFrom,
      dragXY: this.dragXY, selected: this.selected, u,
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${15 * u}px ui-monospace,monospace`;
    ctx.fillText(`${this.genome.used().toFixed(1)}/${this.genome.capacityKb()} kb`,
                 this.ring.cx, this.ring.cy - 9 * u);
    const d = this.dungeon.depth;
    const bal = this.genome.atpBalance(d);
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillStyle = bal >= 0 ? "#7fc4e8" : "#e08a5a";
    ctx.fillText(
      `ATP ${Math.round(this.player.atp)}/${this.player.atpMax}   ` +
      `${bal >= 0 ? "+" : ""}${bal.toFixed(1)}/action`,
      this.ring.cx, this.ring.cy + 10 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.fillText(
      `power ${this.genome.power(d).toFixed(1)}` +
      (this.genome.burden() > 0 ? `   burden ${(this.genome.burden() * 100) | 0}%` : "") +
      (this.genome.supply < 0.99 ? `   brownout ${(this.genome.supply * 100) | 0}%` : ""),
      this.ring.cx, this.ring.cy + 27 * u);

    // Parts bin: everything you hold but have not installed.
    const cell = Math.max(Math.min((W - ins.left - ins.right - 7 * 8 * u) / 6, 62 * u), 44);
    const gap = 8 * u;
    this.bin = {
      x: ins.left + gap, y: this.ring.cy + this.ring.rOuter + 16 * u,
      cell, gap, cols: 6,
    };
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`PARTS BIN  ${this.genome.bin.length}/${BIN_CAP}`,
                 this.bin.x, this.bin.y - 6 * u);
    drawBin(ctx, this.bin, this.genome.bin, u, this.dragBin);
    const binRows = Math.floor(this.genome.bin.length / 6) + 1;

    // Active complexes and hazards, which is the payoff for arranging well.
    let cy = this.bin.y + binRows * (cell + gap) + 14 * u;
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    for (const c of this.genome.complexes(this.dungeon.depth)) {
      ctx.fillStyle = "#7fe0a4";
      ctx.fillText(`\u2713 ${c.name}`, this.bin.x, cy);
      cy += 15 * u;
    }
    for (const h of this.genome.hazards(this.dungeon.depth)) {
      ctx.fillStyle = "#ff9a5a";
      ctx.fillText(`\u26A0 ${h.name}  -${h.dmg}/turn`, this.bin.x, cy);
      cy += 15 * u;
    }

    // Detail panel for the tapped slot.
    const py = cy + 8 * u;
    const lines = this.selected === null
      ? ["promoter → gene → terminator switches an operon on",
         "drag bin → slot to install, slot → bin to remove",
         "drag outside the ring to spin it",
         "expression costs ATP; respiration pays less the deeper you go"]
      : describeSlot(this.genome, this.selected, this.dungeon.depth);
    ctx.textAlign = "left";
    ctx.font = `${11.5 * u}px ui-monospace,monospace`;
    // A running row counter, not the entry index: wrapping produces several
    // lines per entry and they were all being drawn at the same y.
    let row = 0;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? "#ffffff" : "#9fb8a8";
      for (const w of this.wrap(line, W - (ins.left + ins.right + 32 * u))) {
        ctx.fillText(w, ins.left + gap, py + row * 17 * u);
        row++;
      }
    });

    // A real close target. "Tap outside" was ambiguous, and it was what let a
    // button press dismiss the screen in the same gesture that opened it.
    this.closeBox = drawClose(ctx, W, ins, u);
  }

  private inClose(x: number, y: number): boolean {
    return inBoxOf(this.closeBox, x, y);
  }

  pointerDown(x: number, y: number): void {
    if (this.openDrop) {
      const i = this.dropBoxes.findIndex((b) => inBoxOf(b, x, y));
      if (i >= 0) {
        const d = this.openDrop;
        const it = d.items[i];
        if (it && this.take(it)) {
          d.items.splice(i, 1);
          if (d.items.length === 0) { removeDrop(this.drops, d); this.openDrop = null; }
        }
      } else {
        this.openDrop = null;
      }
      this.gesture = "none";
      return;
    }
    if (this.showSplash || !this.started) {
      const i = this.slotBoxes.findIndex(
        (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (i >= 0) this.startRun(i);
      this.gesture = "none";
      return;
    }
    if (this.showNotes) {
      if (this.inClose(x, y)) { this.showNotes = false; }
      else { this.exportPlasmid(); }
      this.gesture = "none";
      return;
    }
    if (this.showMap) {
      if (this.inClose(x, y)) { this.gesture = "dismiss"; return; }
      this.gesture = "spin";                 // reused as "pan" here
      this.panFrom = { x, y };
      this.panMoved = 0;
      return;
    }
    // Bin cells are checked first: they sit outside the ring, which would
    // otherwise classify as a spin.
    if (this.showPlasmid) {
      const b = binAt(this.bin, this.genome.bin.length, x, y);
      if (b !== null) {
        this.gesture = "slot";
        this.dragBin = b;
        this.dragXY = { x, y };
        this.selected = null;
        return;
      }
    }
    const slot = this.showPlasmid ? slotAt(this.ring, x, y) : null;
    const btn = this.showPlasmid ? null : buttonAt(this.buttons, x, y);
    this.gesture = classifyDown({
      plasmidOpen: this.showPlasmid,
      closeBox: this.closeBox,
      slot,
      distFromRing: Math.hypot(x - this.ring.cx, y - this.ring.cy),
      rOuter: this.ring.rOuter,
      onButton: btn !== null,
    }, x, y);

    switch (this.gesture) {
      case "button":
        this.gestureBtn = btn;
        if (btn) btn.active = true;
        break;
      case "slot":
        if (slot !== null) {
          this.selected = slot;
          if (this.genome.at(slot) !== null) { this.dragFrom = slot; this.dragXY = { x, y }; }
        }
        break;
      case "spin":
        this.spinFrom = Math.atan2(y - this.ring.cy, x - this.ring.cx);
        break;
      case "world": {
        const t = this.toTile(x, y);
        this.tap(t.x, t.y);
        break;
      }
      case "dismiss": case "none": break;
    }
  }

  pointerMove(x: number, y: number): void {
    if (!this.started) return;
    if (this.showMap && this.panFrom && this.view) {
      const dx = x - this.panFrom.x, dy = y - this.panFrom.y;
      this.panMoved += Math.abs(dx) + Math.abs(dy);
      this.view = clampView({
        ...this.view,
        x: this.view.x - dx / this.view.scale,
        y: this.view.y - dy / this.view.scale,
      }, innerWidth, innerHeight);
      this.panFrom = { x, y };
      return;
    }
    if (this.gesture === "slot" && (this.dragFrom !== null || this.dragBin !== null)) {
      this.dragXY = { x, y };
    } else if (this.gesture === "spin" && this.spinFrom !== null) {
      if (this.showMap) {
        // handled in the pan branch below
      } else {
        const a = Math.atan2(y - this.ring.cy, x - this.ring.cx);
        this.ring.rot += a - this.spinFrom;
        this.spinFrom = a;
      }
    }
  }

  pointerUp(x: number, y: number): void {
    if (!this.started) { this.gesture = "none"; return; }
    switch (this.gesture) {
      case "button": {
        const b = this.gestureBtn;
        if (b) { b.active = false; if (buttonAt(this.buttons, x, y) === b) this.press(b.id); }
        break;
      }
      case "slot": {
        const target = slotAt(this.ring, x, y);
        if (this.dragBin !== null) {
          if (target !== null) {                       // bin -> ring
            const r = this.genome.install(this.dragBin, target);
            if (r.ok) { this.selected = target; this.save(); } else this.note(r.err);
          } else if (y > this.bin.y + this.bin.cell * 2.4) {
            // Dragged below the bin: thrown away. The bin is finite, and a
            // cassette you will never express is just burden.
            const part = this.genome.bin[this.dragBin];
            if (part) {
              this.genome.bin.splice(this.dragBin, 1);
              const what = part.kind === "gene" ? bio.GENES[part.id].name : part.kind;
              this.toasts.push(`Discarded ${what}.`, "info", this.now);
              this.save();
            }
          }
        } else if (this.dragFrom !== null) {
          if (binAt(this.bin, this.genome.bin.length + 1, x, y) !== null) {
            const r = this.genome.uninstall(this.dragFrom);   // ring -> bin
            if (r.ok) { this.selected = null; this.save(); } else this.note(r.err);
          } else if (target !== null && target !== this.dragFrom) {
            this.genome.swap(this.dragFrom, target);
            this.selected = target;
            this.save();
          }
        }
        break;
      }
      case "dismiss":
        if (this.inClose(x, y)) {
          if (this.showMap) this.showMap = false;
          else this.openPlasmid(false);
        }
        break;
      case "spin":
        // A tap on a module caption builds it -- but only if the pointer barely
        // moved, so a pan across a caption is never mistaken for a tap.
        if (this.showMap && this.view && this.panMoved < 10) {
          const p = this.mapPoint(x, y);
          const m = moduleLabelAt({ ...this.view, x: 0, y: 0, scale: this.view.scale },
                                  p.x * this.view.scale, p.y * this.view.scale, this.boxes);
          if (m) {
            const r = this.genome.assemble(m.steps.map((st) => st.gene));
            this.note(r.ok ? `Assembled ${m.id} ${m.name}.` : `${m.id}: ${r.err}`);
            if (r.ok) { this.showMap = false; this.save(); }
          }
        }
        break;
      case "none": case "world": break;
    }
    this.gesture = "none";
    this.gestureBtn = null;
    this.dragFrom = null;
    this.dragBin = null;
    this.dragXY = null;
    this.spinFrom = null;
    this.spinStart = null;
    this.panFrom = null;
  }

  /** Minimal renderer for when draw() itself has failed. Touches only the
   *  context and the message, so it cannot fail for the same reason. */
  drawEmergency(msg: string): void {
    try {
      const { ctx } = this;
      const W = innerWidth, H = innerHeight;
      const u = Math.max(Math.min(W, H) / 420, 1);
      ctx.setTransform(Math.min(devicePixelRatio || 1, 2), 0, 0,
                       Math.min(devicePixelRatio || 1, 2), 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#140606";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ff8a7a";
      ctx.font = `${13 * u}px ui-monospace,monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Microgue hit an error and recovered:", 14 * u, 60 * u);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${11 * u}px ui-monospace,monospace`;
      let y = 84 * u;
      for (const line of msg.match(/.{1,46}/g)?.slice(0, 8) ?? []) {
        ctx.fillText(line, 14 * u, y);
        y += 15 * u;
      }
      ctx.fillStyle = "#9fb8a8";
      ctx.fillText("reload to restart", 14 * u, y + 12 * u);
    } catch { /* nothing left to try */ }
  }

  /** Toasts, drawn above everything. A silent failure on a phone with no
   *  console is the worst outcome there is. */
  drawToasts(W: number, H: number): void {
    const { ctx } = this;
    const items = this.toasts.all();
    if (items.length === 0) return;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1);
    const pad = 10 * u;
    let y = ins.top + pad;

    ctx.save();
    ctx.font = `${11.5 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const t of items) {
      const lines = this.wrap(t.text, W - ins.left - ins.right - pad * 4);
      const h = Math.max(lines.length * 15 * u + 14 * u, 34 * u);
      ctx.globalAlpha = Toasts.alpha(t, this.now);
      ctx.fillStyle = TOAST_COLOUR[t.level];
      ctx.strokeStyle = TOAST_EDGE[t.level];
      ctx.lineWidth = Math.max(1.4 * u, 1.2);
      ctx.beginPath();
      ctx.roundRect(ins.left + pad, y, W - ins.left - ins.right - pad * 2, h, 7 * u);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      lines.forEach((line, i) => {
        ctx.fillText(line, ins.left + pad * 2, y + 17 * u + i * 15 * u);
      });
      y += h + 6 * u;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }


  startRun(slot: number): void {
    this.slot = slot;
    const existing = loadSlot(slot);
    const info = listSlots()[slot];
    this.runName = info?.name ?? NAME_POOL[slot % NAME_POOL.length] ?? "unnamed";

    if (existing) {
      this.applySave(existing);
      this.note(`Resumed ${this.runName}.`);
    } else {
      this.dungeon = new Dungeon(96, 96, (Date.now() & 0xffff) + slot);
      this.genome = new Plasmid();
      this.run = newRun();          // a new culture has seen nothing
      this.player.hp = this.player.maxhp;
      this.player.atp = this.player.atpMax;
      this.player.status.length = 0;
      this.enter(this.dungeon.current(), this.dungeon.current().up);
      this.note(`Culture ${this.runName} inoculated.`);
    }
    this.started = true;
    this.showSplash = false;
    this.save();
  }

  /** The field notebook. "Recording the bugs you find along the way." */

  /** Copy the plasmid to the clipboard as FASTA, with real sequences.
   *
   *  Fetches anything not already cached. A locus that cannot be retrieved is
   *  emitted with its Entrez query rather than with invented bases. */
  exportPlasmid(): void {
    if (this.exporting) return;
    const genes = this.genome.slots
      .flatMap((p) => (p?.kind === "gene" && SOURCES[p.id] ? [p.id] : []));
    const missing = genes.filter((g) => cached(g) === null);

    if (missing.length === 0) { this.emitExport(); return; }

    this.exporting = true;
    this.toasts.push(
      `Fetching ${String(missing.length)} sequence${missing.length === 1 ? "" : "s"} from NCBI…`,
      "info", this.now);
    void fetchAll(missing, undefined, (p) => {
      if (!p.ok) {
        this.toasts.push(`${p.gene}: no record returned.`, "warn", this.now);
      }
    }).then((got) => {
      this.exporting = false;
      if (got.size === 0 && missing.length > 0) {
        this.toasts.push(
          "NCBI unreachable. Exporting queries instead of sequences.", "warn", this.now);
      }
      this.emitExport();
    }).catch(() => {
      this.exporting = false;
      this.toasts.push("Sequence fetch failed. Exporting queries instead.", "warn", this.now);
      this.emitExport();
    });
  }

  private emitExport(): void {
    const seqs = new Map(this.genome.slots
      .flatMap((p) => {
        if (p?.kind !== "gene") return [];
        const rec = cached(p.id);
        return rec ? [[p.id, rec] as const] : [];
      }));
    const text = exportAnnotation(this.runName, this.dungeon.depth,
                                  this.genome.slots, seqs);
    const withSeq = seqs.size;
    // The type says clipboard always exists; on http:// and older browsers it
    // does not, so the check is real even though TypeScript disbelieves it.
    const nav: { clipboard?: { writeText(s: string): Promise<void> } } = navigator;
    if (nav.clipboard !== undefined) {
      void nav.clipboard.writeText(text)
        .then(() => {
          this.toasts.push(
            `Plasmid copied. ${String(withSeq)} sequence${withSeq === 1 ? "" : "s"} included.`,
            "info", this.now);
        })
        .catch(() => { this.toasts.push("Clipboard refused. Nothing copied.", "warn", this.now); });
    } else {
      this.toasts.push("No clipboard available on this browser.", "warn", this.now);
    }
  }

  /** A lysate opened: its contents as slots, like any RPG container. */
  drawContainer(W: number, H: number): void {
    const { ctx } = this;
    const d = this.openDrop;
    if (!d) return;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1);

    ctx.fillStyle = "rgba(4,7,6,0.86)";
    ctx.fillRect(0, 0, W, H);

    const cols = 4;
    const cell = Math.max(Math.min((W - ins.left - ins.right - 60 * u) / cols, 74 * u), 52);
    const gap = 10 * u;
    const rows = Math.ceil(d.items.length / cols);
    const panelW = cols * cell + (cols - 1) * gap + 28 * u;
    const panelH = rows * (cell + gap) + 96 * u;
    const px0 = (W - panelW) / 2;
    const py0 = (H - panelH) / 2;

    ctx.fillStyle = "rgba(14,22,18,0.97)";
    ctx.strokeStyle = "#5ec98a";
    ctx.lineWidth = Math.max(1.6 * u, 1.5);
    ctx.beginPath();
    ctx.roundRect(px0, py0, panelW, panelH, 10 * u);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${13 * u}px ui-monospace,monospace`;
    ctx.fillText("LYSATE", px0 + 14 * u, py0 + 26 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText("tap to take · tap outside to leave it", px0 + 14 * u, py0 + 42 * u);

    this.dropBoxes = [];
    d.items.forEach((it, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const bx = px0 + 14 * u + c * (cell + gap);
      const by = py0 + 58 * u + r * (cell + gap);
      this.dropBoxes.push({ x: bx, y: by, w: cell, h: cell });

      ctx.fillStyle = itemColour(it);
      ctx.beginPath();
      ctx.roundRect(bx, by, cell, cell, cell * 0.2);
      ctx.fill();
      ctx.fillStyle = "#0f1512";
      ctx.font = `${Math.max(cell * 0.19, 9)}px ui-monospace,monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(itemName(it), bx + cell / 2, by + cell / 2 - cell * 0.06);
      ctx.font = `${Math.max(cell * 0.14, 7)}px ui-monospace,monospace`;
      ctx.fillText(it.kind === "cassette" ? "cassette" : SUBSTRATES[it.id].formula,
                   bx + cell / 2, by + cell / 2 + cell * 0.16);
    });

    const first = d.items[0];
    if (first) {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#8fa89a";
      ctx.font = `${9.5 * u}px ui-monospace,monospace`;
      const y = py0 + panelH - 22 * u;
      this.wrap(itemNote(first), panelW - 28 * u).slice(0, 2)
        .forEach((l, i) => { ctx.fillText(l, px0 + 14 * u, y + i * 12 * u); });
    }
  }

  drawMapScreen(W: number, H: number): void {
    const { ctx } = this;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    ctx.fillStyle = "rgba(4,7,6,0.97)";
    ctx.fillRect(0, 0, W, H);

    this.view ??= fitView(W, H - ins.top - ins.bottom - 60 * u);
    this.view = clampView(this.view, W, H);

    ctx.save();
    ctx.translate(0, ins.top + 52 * u);
    drawGraph(ctx, this.view, this.genome, u, this.boxes);
    ctx.restore();

    // header sits above the graph, opaque, so panning never runs under it
    ctx.fillStyle = "rgba(4,7,6,0.95)";
    ctx.fillRect(0, 0, W, ins.top + 50 * u);
    ctx.fillStyle = "#ffffff";
    ctx.font = `${14 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("PATHWAY MAP", ins.left + 14 * u, ins.top + 24 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText("drag to pan · pinch to zoom · tap a complete module to build it",
                 ins.left + 14 * u, ins.top + 40 * u);

    this.closeBox = drawClose(ctx, W, ins, u);
  }

  /** Graph-space point for a screen point, accounting for the header offset. */
  private mapPoint(x: number, y: number): { x: number; y: number } {
    const ins = this.insets();
    const u = Math.max(Math.min(innerWidth, innerHeight) / 420, 1) * this.settings.uiScale;
    const v = this.view;
    if (!v) return { x: 0, y: 0 };
    return toWorld(v, x, y - (ins.top + 52 * u));
  }

  /** Single entry point, so nothing can open the screen without also parking
   *  the world. An in-flight walk used to keep stepping underneath it. */
  openPlasmid(open: boolean): void {
    this.showPlasmid = open;
    this.selected = null;
    this.dragFrom = null;
    this.dragXY = null;
    this.spinFrom = null;
    if (open) {
      this.walk = null;                     // stop mid-path movement
      this.path = null;
    }
  }

  press(id: string): void {
    switch (id) {
      case "plasmid": this.openPlasmid(!this.showPlasmid); this.showMap = false; break;
      case "auto": {
        this.autoAttack = !this.autoAttack;
        const btn = this.buttons.find((b) => b.id === "auto");
        if (btn) btn.active = this.autoAttack;
        if (this.autoAttack) { this.walk = null; this.note("Auto-attack engaged."); }
        else { this.target = null; this.note("Auto-attack off."); }
        break;
      }
      case "map":
        this.showMap = !this.showMap;
        if (this.showMap) { this.openPlasmid(false); this.showNotes = false; }
        break;
      case "wait":
        // Passing a turn is a real move in a turn-based game: regeneration,
        // ATP and every microbe all advance.
        this.note("You hold position.");
        this.mobTurn();
        this.look();
        break;
      case "notes":
        this.showNotes = !this.showNotes;
        if (this.showNotes) { this.openPlasmid(false); this.showMap = false; }
        break;
      case "down": this.descend(); break;
      case "up": this.ascend(); break;
      case "zoomIn": this.zoom = Math.min(this.zoom * 1.25, 8); break;
      case "zoomOut": this.zoom = Math.max(this.zoom / 1.25, 0.3); break;
      case "contrast":
        this.settings = { ...this.settings, highContrast: !this.settings.highContrast };
        this.save();
        break;
      default: break;
    }
  }
}

function boot(): void {
  const el = document.getElementById("game");
  if (!(el instanceof HTMLCanvasElement)) return;
  new Game(el);
  document.getElementById("boot")?.remove();
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => {
      void navigator.serviceWorker.register("./sw.js", { scope: "./" })
        .catch(() => undefined);
    });
  }
}
boot();

export { Game };
