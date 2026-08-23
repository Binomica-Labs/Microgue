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
import { STATUS, tick as tickStatus, type Status } from "./status.js";
import { NAME_POOL, SLOTS as SAVE_SLOTS, listSlots, loadSlot, migrateLegacy,
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
  dungeon = new Dungeon(110, 80, 7);
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
  closeBox = { x: 0, y: 0, w: 0, h: 0 };
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
    const s = level.stratum;
    if (!level.visited) { level.visited = true; this.note(s.blurb); }
    // Descending should feel like passing through something.
    this.fx.clear();
    this.fx.add({ kind: "wipe", t0: this.now, dur: 460, colour: s.wall, down: true });
    this.save();
  }

  descend(): void {
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
      if (Math.random() < 0.15) {
        this.note(`ATP exhausted — expression at ${(this.genome.supply * 100) | 0}%.`);
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
    if (m.hp <= 0) {
      m.alive = false;
      // Lysis: the cell bursts. Bigger shake, longer stop, scattered debris.
      this.fx.add({ kind: "burst", t0: this.now + 40, dur: 520, x: m.x, y: m.y,
                    colour: m.pigment, n: 14, seed: this.now + m.x * 31 + m.y });
      this.fx.shake(7, 260, this.now);
      this.fx.hitstop(70, this.now);
      this.note(`${m.name} destroyed.`);
      const pool = m.genes.filter((g) => !this.genome.has(g));
      if (!pool.length) { this.note(`Nothing new to take.`); }
      else {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick === undefined) return;
        const r = this.genome.stash({ kind: "gene", id: pick, optimised: false });
        if (r.ok) {
          // The loop's whole point deserves a moment: the locus travels.
          this.fx.add({ kind: "bolt", t0: this.now + 120, dur: 380, colour: "#a0ffd0",
                        seed: this.now, from: { x: m.x, y: m.y },
                        to: { x: this.player.x, y: this.player.y } });
          this.fx.add({ kind: "text", t0: this.now + 220, dur: 900, x: this.player.x,
                        y: this.player.y - 0.5, text: bio.GENES[pick].name,
                        colour: "#a0ffd0" });
        }
        this.note(r.ok ? `HGT: ${bio.GENES[pick].name} from ${m.name} \u2192 parts bin.`
                       : `${bio.GENES[pick].name} — ${r.err}`);
      }
    } else {
      const inc = Math.round(m.atk * 0.5 * this.genome.armour(this.dungeon.depth));
      this.player.hp = Math.max(this.player.hp - inc, 0);
      this.note(`${m.name}: ${Math.max(m.hp, 0)} hp left.`);
    }
    this.mobTurn();
    this.save();
  }

  mobTurn(): void {
    this.upkeep();

    const events = microbeTurn({
      grid: this.level.grid,
      mobs: this.level.mobs,
      player: this.player,
      rng: makeRng(this.turnSeed++),
      armour: this.genome.armour(this.dungeon.depth),
    });

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

    if (this.player.hp <= 0) {
      this.player.hp = this.player.maxhp;
      this.player.status.length = 0;
      this.note("Lysed. Reassembled at the last stair.");
      const u = this.level.up;
      this.player.x = u.x; this.player.y = u.y;
      this.player.ax = u.x; this.player.ay = u.y;
    }
    this.save();
  }

  step(x: number, y: number): boolean {
    const m = this.dungeon.mobAt(x, y);
    if (m) { this.attack(m); return false; }
    if (!this.level.grid.isFloor(x, y)) return false;
    this.player.x = x; this.player.y = y;
    this.mobTurn();
    return true;
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
    // Extracellular electron transfer lets you strike along a nanowire.
    const reach = this.genome.reach(this.dungeon.depth);
    if (m !== undefined && Math.abs(tx - this.player.x) <= reach
                        && Math.abs(ty - this.player.y) <= reach) {
      this.attack(m); return;
    }
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
      seed: this.dungeon.seed,
      px: this.player.x,
      py: this.player.y,
      hp: this.player.hp,
      atp: this.player.atp,
      ring: this.genome.slots.map((p) => (p === null ? null : { ...p })),
      bin: this.genome.bin.map((p) => ({ ...p })),
      settings: this.settings,
    };
    writeSave(SAVE_KEY, data);
    saveSlot(this.slot, this.runName, data, this.genome.carried().size);
  }

  /** Load a parsed save into live state. Shared by slot loading and boot. */
  applySave(s: SaveData): void {
    this.dungeon = new Dungeon(110, 80, s.seed);
    this.dungeon.depth = s.depth;
    this.genome = new Plasmid();
    s.ring.forEach((p, i) => { this.genome.put(i, p); });
    this.genome.bin.length = 0;
    for (const p of s.bin) this.genome.bin.push({ ...p });
    this.settings = s.settings;
    this.enter(this.dungeon.current(), { x: s.px, y: s.py });
    this.player.hp = s.hp;
    this.player.atp = s.atp;
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
      this.drawSplash(W, H);
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
      const f = Math.max(m.hp / m.maxhp, 0);
      const ml = lunges.get(m.id);
      const mx = ml?.x ?? 0, my = ml?.y ?? 0;
      // Size is real: Synechococcus is about 1 um, a Beggiatoa filament 200.
      const scale = SIZES[m.size].scale;
      const img = hc ? null : sprite(m.id, px * scale, paletteForPigment(m.pigment));
      if (img) {
        const v = travel(m.ax, m.ay, m.x, m.y);
        const sq = squashFor(v, 0.16);
        const bx = (m.ax + mx + 0.5) * px, by = (m.ay + my + 0.5) * px;
        for (const w of wake(m.heading, v, 2)) {
          drawBody(ctx, img, bx + w.dx * px, by + w.dy * px, px * scale,
                   m.facing, m.heading, sq, w.alpha * 0.7);
        }
        drawBody(ctx, img, bx, by, px * scale, m.facing, m.heading, sq);
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
        const bx = m.ax * px + px * 0.2;
        const by = m.ay * px + px * 0.87;
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
      const bx = (this.player.ax + lx + 0.5) * px;
      const by = (this.player.ay + ly + 0.5) * px;
      // Wake: a cell moving through fluid leaves one.
      for (const w of wake(this.player.heading, v)) {
        drawBody(ctx, me, bx + w.dx * px, by + w.dy * px, px * 0.92,
                 "rotate", this.player.heading, sq, w.alpha);
      }
      drawBody(ctx, me, bx, by, px * 0.92, "rotate", this.player.heading, sq);
    } else {
      ctx.fillStyle = "#0ff";
      ctx.fillRect((this.player.ax + lx) * px + px * 0.18,
                   (this.player.ay + ly) * px + px * 0.18, px * 0.64, px * 0.64);
    }

    ctx.strokeStyle = hc ? "#ff0" : (this.path ? "#ffffff" : "#777777");
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cursor.x * px, this.cursor.y * px, px, px);
    this.drawFx(px);
    ctx.restore();

    this.drawScreenFx(W, H);
    this.drawHud(W, H);
    this.drawToasts(W, H);
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
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
    ctx.fillText(`${s.name}  ${s.teap} ${s.e0 >= 0 ? "+" : ""}${s.e0}mV`,
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
    ctx.fillText(
      `${ops} operon${ops === 1 ? "" : "s"}   ${this.dungeon.aliveCount()} hostile`,
      barX + hpW * 2 + 18 * u, barTop + lh * 1.15 + gaugeH / 2);
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
      depth: this.dungeon.depth, dragFrom: this.dragFrom,
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
    const cs = Math.max(46 * u, 44);
    this.closeBox = { x: W - ins.right - cs - 12 * u, y: ins.top + 12 * u, w: cs, h: cs };
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1.5 * u, 1.5);
    ctx.beginPath();
    ctx.roundRect(this.closeBox.x, this.closeBox.y, cs, cs, cs * 0.28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `${cs * 0.42}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2715", this.closeBox.x + cs / 2, this.closeBox.y + cs / 2);
  }

  private inClose(x: number, y: number): boolean {
    const c = this.closeBox;
    return x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
  }

  pointerDown(x: number, y: number): void {
    if (this.showSplash || !this.started) {
      const i = this.slotBoxes.findIndex(
        (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (i >= 0) this.startRun(i);
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

  drawSplash(W: number, H: number): void {
    const { ctx } = this;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1);
    ctx.fillStyle = "#050d0a";
    ctx.fillRect(0, 0, W, H);

    // The column itself as the backdrop: eight bands, top to bottom.
    const bandH = H / bio.MAX_DEPTH;
    for (let i = 0; i < bio.MAX_DEPTH; i++) {
      const st = bio.STRATA[i];
      if (!st) continue;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = st.wall;
      ctx.fillRect(0, i * bandH, W, bandH);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${34 * u}px ui-monospace,monospace`;
    ctx.fillText("MICROGUE", W / 2, ins.top + 72 * u);
    ctx.fillStyle = "#9fd8b4";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillText("descend the Winogradsky column", W / 2, ins.top + 94 * u);
    ctx.fillStyle = "#6f8f7c";
    ctx.fillText("O2 · NO3- · Mn(IV) · Fe(III) · S0 · H2S · SO4 · CO2",
                 W / 2, ins.top + 112 * u);

    const slots = listSlots();
    const cardH = 62 * u;
    const gap = 10 * u;
    const top = ins.top + 148 * u;
    this.slotBoxes = [];
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const y = top + i * (cardH + gap);
      const x = ins.left + 20 * u;
      const w = W - ins.left - ins.right - 40 * u;
      this.slotBoxes.push({ x, y, w, h: cardH });
      const info = slots[i];

      ctx.fillStyle = info ? "rgba(20,34,26,0.9)" : "rgba(0,0,0,0.5)";
      ctx.strokeStyle = info ? "#5ec98a" : "rgba(255,255,255,0.18)";
      ctx.lineWidth = Math.max(1.5 * u, 1.5);
      ctx.beginPath();
      ctx.roundRect(x, y, w, cardH, 8 * u);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "left";
      if (info) {
        const st = bio.stratum(info.depth);
        ctx.fillStyle = "#ffffff";
        ctx.font = `${15 * u}px ui-monospace,monospace`;
        ctx.fillText(info.name, x + 14 * u, y + 26 * u);
        ctx.fillStyle = st.accent;
        ctx.font = `${10.5 * u}px ui-monospace,monospace`;
        ctx.fillText(`D${info.depth} ${st.name}  ·  ${info.genes} loci`,
                     x + 14 * u, y + 45 * u);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = `${13 * u}px ui-monospace,monospace`;
        ctx.fillText(`new culture  ${NAME_POOL[i % NAME_POOL.length] ?? ""}`,
                     x + 14 * u, y + 36 * u);
      }
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#6f8f7c";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText("tap a culture to begin  ·  long-press to discard",
                 W / 2, H - ins.bottom - 20 * u);
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
      this.dungeon = new Dungeon(110, 80, (Date.now() & 0xffff) + slot);
      this.genome = new Plasmid();
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

    const cs = Math.max(46 * u, 44);
    this.closeBox = { x: W - ins.right - cs - 12 * u, y: ins.top + 4 * u, w: cs, h: cs };
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1.5 * u, 1.5);
    ctx.beginPath();
    ctx.roundRect(this.closeBox.x, this.closeBox.y, cs, cs, cs * 0.28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `${cs * 0.42}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2715", this.closeBox.x + cs / 2, this.closeBox.y + cs / 2);
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
      case "map":
        this.showMap = !this.showMap;
        if (this.showMap) this.openPlasmid(false);
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
