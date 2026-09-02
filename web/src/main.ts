// Microgue -- browser shell. Canvas rendering, pointer + keyboard input,
// localStorage persistence. Everything above this file is engine-free logic.

import { CLASSES, DEFAULT_CLASS, type ClassId } from "./classes.js";
import type { ClassRow } from "./class_ui.js";
import { SAVE_KEY, p_applySave, p_save } from "./persist.js";
import { Trace } from "./trace.js";
import { distanceTo } from "./pursuit.js";
import { r_draw, r_drawEmergency, r_drawFx, r_drawHud, r_drawMapScreen,
         r_drawPlasmid, r_drawScreenFx, r_drawToasts } from "./render.js";
import { i_bindInput, i_bindPinch, i_inClose, i_onKey, i_pointerDown,
         i_pointerMove, i_pointerUp, i_press } from "./input.js";
import { t_ascend, t_attack, t_audit, t_descend, t_describeTile, t_die,
         t_look, t_visibleHostile, t_mobTurn, t_onTile, t_repath, t_research, t_step, t_step_,
         t_take, t_takeTurn, t_upkeep, t_win, t_world, t_catabolise,
         t_expand, t_acquire, t_explore, t_eatOffered, t_declineOffered }
  from "./turn.js";
import * as bio from "./biology.js";
import { Dungeon, type Level, type Mob } from "./dungeon.js";
import { ATP_MAX, Plasmid } from "./plasmid.js";
import { type BinGeom, type RingGeom } from "./plasmid_ui.js";
import { makeButtons, type Button } from "./buttons.js";
import { type Gesture } from "./gesture.js";
import { moduleBoxes,
         toWorld, type ModuleBox, type View }
  from "./kegg_ui.js";
import * as mg from "./mapgen.js";
import type { Point } from "./mapgen.js";
import { Effects } from "./fx.js";
import { 
         type Cloud, type Packet } from "./projectile.js";
import { type Box } from "./chrome.js";
import { 
         type ResearchRow } from "./screens.js";
import { installUpdater } from "./sw_client.js";
import { BUILD, VERSION } from "./version.js";
import { installConsole } from "./debug.js";
import { x_export } from "./export.js";
import { type ModifierId } from "./parts.js";
import type { Part } from "./plasmid.js";
import { addDrop, 
         rollPart, substratesAt, type Drop, type Item } from "./items.js";
import { newClock, type Clock } from "./cycle.js";
import { ROOM_STYLE, type Room } from "./rooms.js";
import { type WorldView } from "./invariants.js";
import { installGlobalHandlers, on } from "./safety.js";
import { capacityAt, describeStock, restockAmount } from "./production.js";
import { WILD_TYPE,rollAllele } from "./allele.js";
import type { TraitId } from "./chromosome.js";
import type { MiniBox } from "./minimap.js";
import { newLab, type Lab, type RunRecord } from "./lab.js";
import { readLab, writeLab } from "./lab_save.js";
import { buy, type Offer } from "./lab.js";
import type { ShopRow } from "./screens.js";
import { newRun, type RunState } from "./run.js";
import type { Status } from "./status.js";
import { NAME_POOL, listSlots, loadSlot, migrateLegacy } from "./saves.js";
import { makeRng } from "./rng.js";
import { Toasts } from "./toast.js";
import { DEFAULT_SETTINGS, ZOOM_MAX, ZOOM_MIN, ZOOM_PREF_MAX, ZOOM_PREF_MIN, readSave, type SaveData, type Settings } from "./save.js";


/** Tiles across the SHORT viewport axis at the default zoom. Sight radius
 *  reaches 11, so the lit disc is 23 across; this fits it on every device. */
export const TILES_ACROSS = 26;

/** World tile size in CSS pixels before zoom. */
const TILE = 32;

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
  ring: RingGeom = { cx: 0, cy: 0, rInner: 0, rOuter: 0, rot: 0, used: 16 };
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
  /** Set while two fingers are down and until they are all lifted, so the
   *  release at the end of a pinch is never read as a tap. */
  pinching = false;
  dragXY: { x: number; y: number } | null = null;
  selected: number | null = null;
  spinFrom: number | null = null;
  spinStart: number | null = null;
  barH = 0;
  logH = 0;
  settings: Settings = DEFAULT_SETTINGS;
  /** @internal: public only because the turn engine lives in turn.ts */
  last = 0;
  fx = new Effects();
  turnSeed = 1;
  /** The microbe being chased, if any. Cleared when it dies or is lost. */
  target: Mob | null = null;
  /** Mirrors settings.autoAttack; see save.ts. Kept as a field because the
   *  turn loop reads it every frame. */
  autoAttack = false;
  /** @internal: public only because the turn engine lives in turn.ts */
  autoAt = 0;
  run: RunState = newRun();
  showNotes = false;
  /** @internal: public because input routing lives in input.ts */
  exporting = false;
  drops: Drop[] = [];
  /** @internal: public only because the turn engine lives in turn.ts */
  spotted = new Set<number>();
  /** @internal: public only because the turn engine lives in turn.ts */
  inRoom: Room | null = null;
  /** Modifiers held but not yet attached to a gene. */
  mods: ModifierId[] = [];
  won = false;
  /** Set once storage has refused a write, so it is said once. */
  storageWarned = false;
  /** What was inoculated. Chosen once, before the culture goes in, and
   *  never again -- see classes.ts. */
  strainClass: ClassId = DEFAULT_CLASS;
  /** Slot awaiting a class choice, or null. An EMPTY slot goes here
   *  first; an occupied one resumes and never does. */
  pickingClassFor: number | null = null;
  classRows: ClassRow[] = [];
  /** A cassette that would not fit on a full stack, awaiting a choice. */
  offer: { part: Part; at: { x: number; y: number } } | null = null;
  offerBoxes: { eat: Box; leave: Box } | null = null;
  /** Where the minimap was drawn, for hit-testing. Null when there is
   *  no room for a readable one. */
  miniBox: MiniBox | null = null;
  /** Set when the strain dies. A dead strain does not act. */
  dead = false;
  deathRecord: RunRecord | null = null;
  /** Clock time the strain lysed, for the death sequence. */
  deathAt = 0;
  showLab = false;
  shopRows: ShopRow[] = [];
  /** First visible row of the order form, and how far it can go. */
  shopScroll = 0;
  shopMaxScroll = 0;
  /** Where a scroll drag began, and the scroll it started from. */
  shopFrom: { x: number; y: number } | null = null;
  shopAnchor = 0;
  shopMoved = 0;
  /** Auto-explore: keeps walking to the frontier until something interrupts. */
  exploring = false;
  /** Travel that ends in one blow, then stops. Set by tapping an enemy. */
  strikeAfterTravel: Mob | null = null;
  /** Whatever last hurt the player, for the ledger. */
  lastAttacker: string | null = null;
  /** Fractional hit points repaired but not yet applied. */
  repairDebt = 0;
  /** ATP spent on repair last turn. Not part of , which is
   *  metabolism only -- see turn.ts. */
  repairSpend = 0;
  /** Flight recorder. Always on; see trace.ts. */
  readonly trace = new Trace();
  /** Re-paths spent chasing one quarry, so a chase cannot run for ever. */
  chaseLegs = 0;
  /** Scroll position of the parts list, and its rows for hit-testing. */
  binScroll = 0;
  binMaxScroll = 0;
  binRows: { box: Box; index: number }[] = [];
  binFrom: { x: number; y: number } | null = null;
  binAnchor = 0;
  /** Persists across every strain. Saved separately from the run. */
  lab: Lab = newLab();
  showResearch = false;
  /** @internal: public because input routing lives in input.ts */
  researchRows: ResearchRow[] = [];
  /** @internal: public only because the turn engine lives in turn.ts */
  researchPick: bio.GeneId | null = null;
  /** A part being inspected. Null when no card is open. */
  /** @internal: public because input routing lives in input.ts */
  card: Part | null = null;
  /** Bin index of the part on the card, and its eat target, if any. */
  cardIndex = -1;
  /** Action targets on the open card, and whether it is asking. */
  cardBoxes: { eat: Box | null; install: Box | null;
               confirm: Box | null; cancel: Box | null } =
    { eat: null, install: null, confirm: null, cancel: null };
  cardConfirm = false;
  clock: Clock = newClock();
  openDrop: Drop | null = null;
  dropBoxes: Box[] = [];
  packets: Packet[] = [];
  clouds: Cloud[] = [];
  started = false;
  toasts = new Toasts();

  /** Every browser entry point routes failures here rather than throwing. */
  /** @internal: public because input routing lives in input.ts */
  report = (msg: string): void => { this.toasts.push(msg, "error", this.now); };
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
    this.lab = readLab();
    try {
      if (localStorage.getItem("microgue:updated") === "1") {
        localStorage.removeItem("microgue:updated");
        this.toasts.push(`Updated to ${VERSION} (${BUILD}).`, "info", 0);
      }
    } catch { /* private browsing */ }
    this.resize();
    on(globalThis, "resize", () => { this.resize(); }, "resize", this.report);
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
    // Half the strain formula (strain.ts); only t_win ever wrote it. On
    this.run.deepest = Math.max(this.run.deepest, level.floor);   // arrival.
    let p: Point | null = arrive;
    if (!level.grid.isFloor(p.x, p.y)) p = mg.findSpawn(level.grid, p.x, p.y);
    p ??= mg.carveSpawn(level.grid);
    this.player.x = p.x; this.player.y = p.y;
    this.player.ax = p.x; this.player.ay = p.y;
    this.cursor = { x: p.x, y: p.y };
    this.path = null; this.walk = null;
    this.zoom = Math.min(Math.max(this.tileZoom() * this.settings.zoom, ZOOM_MIN), ZOOM_MAX);
    this.spotted.clear();
    this.look();

    // Returning to a floor: whatever has settled since you left. A floor you
    // stripped is barren until the pump refills it, and the pump runs from the
    // top and stops at night.
    if (level.visited) {
      const present = this.drops.reduce(
        (a, d) => a + d.items.filter((i) => i.kind === "substrate").length, 0);
      const gained = restockAmount(level.depth, present, this.clock.turn - level.stockedAt,
                                   this.clock, level.stockedAt);
      if (gained > 0) this.scatter(level, gained);
      level.stockedAt = this.clock.turn;
      this.note(describeStock(level.depth, present + gained));
    }
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
            if (g !== undefined && !this.genome.has(g) && !this.genome.inBin(g)) {
              // Rolled at the depth it CAME from: a surface organism buried deep
              // did not become a deep organism, and its alleles are what the
              // shallow column produced.
              items.push({ kind: "cassette", gene: g, allele: rollAllele(lootRng, from) });
            }
          }
          addDrop(this.drops, t.x, t.y, items);
        }
      }

      // Initial stock. Thereafter the floor refills from ABOVE, over time --
      // see production.ts and the restock on every later arrival below.
      this.scatter(level, capacityAt(s.depth));
      level.stockedAt = this.clock.turn;
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

  descend(): void { t_descend(this); }

  ascend(): void { t_ascend(this); }


  // ------------------------------------------------------------- combat
  atk(): number { return 3 + this.genome.power(this.dungeon.depth) * 0.9; }

  /** Per-action upkeep: toxic intermediates bite, complexes repair, and a
   *  sulfide aura burns anything adjacent. */
  upkeep(): void { t_upkeep(this); }


  attack(m: Mob): void { t_attack(this, m); }


  /** The world as the invariants see it. */
  world(): WorldView { return t_world(this); }


  /**
   * Check the sacred invariants and surface any violation.
   *
   * These failures are otherwise silent -- a body inside rock is invisible and
   * unhittable, a lost origin makes every expression zero. Saying so is far
   * better than letting the game quietly stop making sense.
   */
  audit(): void { t_audit(this); }


  mobTurn(): void { t_mobTurn(this); }


  step(x: number, y: number): boolean { return t_step(this, x, y); }


  /** Take one item. Substrates are metabolised on the spot; cassettes go to
   *  the bin. Returns false if the bin had no room. */
  take(it: Item): boolean { return t_take(this, it); }


  /** What is on a tile, in words. */
  describeTile(x: number, y: number): void { t_describeTile(this, x, y); }


  /** Scatter `n` substrate drops appropriate to this level. */
  scatter(level: Level, n: number): void {
    const pool = substratesAt(level.depth);
    const rng = makeRng(this.dungeon.seed ^ (level.floor * 7919) ^ this.clock.turn);
    for (let i = 0; i < n * 4 && n > 0; i++) {
      const x = rng.int(level.grid.w), y = rng.int(level.grid.h);
      if (!level.grid.isFloor(x, y)) continue;
      const id = pool[rng.int(pool.length)];
      if (!id) continue;
      addDrop(this.drops, x, y, [{ kind: "substrate", id }]);
      if (--n <= 0) break;
    }
  }

  /** Light the level from where the player stands, and interrupt travel if
   *  something new has come into view. DCSS does this and it is the single
   *  thing that stops auto-travel walking you into a fight. */
  look(): void { t_look(this); }

  /** A visible thing that can actually hurt you; see sight.ts. */
  visibleHostile(): Mob | null { return t_visibleHostile(this); }


  /** Called after the player lands on a tile. */
  onTile(x: number, y: number): void { t_onTile(this, x, y); }


  /** One turn of chasing. Returns true if anything happened. */
  takeTurn(): boolean { return t_takeTurn(this); }


  /** Spend on directed evolution, or attach a held modifier. */
  research(row: ResearchRow): void { t_research(this, row); }


  /** The bottom of the column, with the last thing on it dead. */
  win(): void { t_win(this); }

  /** Eat a cassette from the bin: DNA is food as well as information. */
  catabolise(i: number): void { t_catabolise(this, i); }

  /** Eat, or leave, a copy that would not fit on a full stack. */
  eatOffered(): void { t_eatOffered(this); }
  declineOffered(): void { t_declineOffered(this); }

  /**
   * Put a part from the bin onto the first free ring position.
   *
   * A button rather than a drag: the ring sits ABOVE the list, so dragging to
   * it is a vertical gesture, and vertical gestures scroll. Drag-to-install
   * was impossible in the only direction the ring is in.
   */
  installFromBin(i: number): void {
    const part = this.genome.bin[i];
    if (!part) return;
    const free = this.genome.slots.findIndex(
      (s, k) => s === null && this.genome.usable(k));
    if (free < 0) { this.toasts.push("No free position on the plasmid.", "warn", this.now); return; }
    const r = this.genome.install(i, free);
    if (!r.ok) { this.toasts.push(r.err, "warn", this.now); return; }
    this.selected = free;
    this.trace.push(this.clock.turn, "input",
                    `install ${part.kind} at slot ${String(free)}`);
    this.save();
  }

  /** Integrate another cassette site into the chromosome. */
  expand(): void { t_expand(this); }

  /** Acquire a piece of architecture, once. */
  acquire(id: TraitId): void { t_acquire(this, id); }

  /** Walk to the frontier until something interrupts. */
  explore(): void { t_explore(this); }

  /** Order a construct with banked credit. */
  order(offer: Offer): void {
    const r = buy(this.lab, offer);
    if (!r.ok) { this.toasts.push(r.err, "warn", this.now); return; }
    writeLab(this.lab);
    this.toasts.push(`Ordered ${offer.name}. ${String(this.lab.credit)} credit left.`,
                     "info", this.now);
  }

  /** Every gene the lab has ever seen, which is what it may order. */
  known(): bio.GeneId[] {
    const out = new Set<bio.GeneId>(this.lab.stock);
    for (const id of this.run.library) out.add(id);
    for (const m of bio.MICROBES) {
      if (this.run.bestiary.includes(m.id)) for (const g of m.genes) out.add(g);
    }
    return [...out];
  }


  /** The run ends. The lineage keeps the loci it has had longest and starts
   *  again at the surface -- "resynthesized with some of the genes you
   *  acquired in the previous run". */
  die(): void { t_die(this); }


  stairs(): boolean {
    const { x, y } = this.player;
    const d = this.level.down;
    if (x === d?.x && y === d.y) { this.descend(); return true; }
    if (this.level.depth > 1 && x === this.level.up.x && y === this.level.up.y) { this.ascend(); return true; }
    return false;
  }

  // -------------------------------------------------------------- input
  repath(): void { t_repath(this); }


  tap(tx: number, ty: number): void {
    this.trace.push(this.clock.turn, "input", `tap ${String(tx)},${String(ty)}`);
    if (tx === this.player.x && ty === this.player.y) { if (this.stairs()) return; }
    const m = this.dungeon.mobAt(tx, ty);
    if (m !== undefined) {
      // Tapping a microbe means "go kill that": approach it and land ONE blow.
      // This used to call takeTurn() directly, which is a single step -- so
      // tapping something four tiles away moved one square and stopped, and
      // you had to tap four more times to reach it.
      this.target = m;
      this.exploring = false;
      this.walk = null;

      // Only strike if it is genuinely IN REACH. `takeTurn` returns true after
      // taking a single pursuit STEP too, so calling it first is exactly the
      // one-square-per-tap behaviour -- it consumed the input and the walk was
      // never built.
      const reach = this.genome.reach(this.dungeon.depth);
      if (distanceTo(this.player, m) <= reach) {
        this.attack(m);
        return;
      }

      // Out of reach: walk to it. The last node is the creature's own tile,
      // and the walk tick spends that step as the strike.
      this.cursor = { x: tx, y: ty };
      this.repath();
      if (this.path && this.path.length > 1) {
        this.strikeAfterTravel = m;
        this.chaseLegs = 0;
        this.walk = { nodes: this.path, i: 0 };
      } else {
        this.note("No way through to it.");
      }
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

  bindInput(): void { i_bindInput(this); }


  onKey(e: KeyboardEvent): void { i_onKey(this, e); }


  bindPinch(): void { i_bindPinch(this); }


  // ------------------------------------------------------------ persist
  save(): void { p_save(this); }


  /** Load a parsed save into live state. Shared by slot loading and boot. */
  applySave(s: SaveData): void { p_applySave(this, s); }


  load(): boolean {
    migrateLegacy();
    this.lab = readLab();
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
  /** @internal: public because rendering lives in render.ts */
  insets(): { top: number; right: number; bottom: number; left: number } {
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
  /** @internal: public because rendering lives in render.ts */
  fitFont(text: string, maxWidth: number, ideal: number): number {
    const { ctx } = this;
    let size = ideal;
    for (; size > 8; size -= 0.5) {
      ctx.font = `${size}px ui-monospace,monospace`;
      if (ctx.measureText(text).width <= maxWidth) break;
    }
    return size;
  }

  /** Word-wrap for the message log, which ran off the right edge. */
  /** @internal: public because rendering lives in render.ts */
  wrap(text: string, maxWidth: number): string[] {
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

  /**
   * The default zoom, and it is the SAME on every platform.
   *
   * This used to show 13 tiles across the short axis on a coarse pointer and
   * 30 on a fine one -- 2.3x per axis, about five times the area. That is not
   * an ergonomic difference, it is an information advantage: more of the level
   * on screen, more creatures visible, more targets you can reach out and tap.
   * A phone player could not even see their own field of view, since sight
   * radius runs to 11 and the lit disc is 23 tiles across against a 13-tile
   * viewport.
   *
   * So the short axis fits the whole lit disc with a margin, whatever the
   * device. Normalising on the SHORT axis also keeps the total visible area
   * close across aspect ratios -- a tall phone sees further vertically, a wide
   * desktop further horizontally, and the two come out within about 10%.
   *
   * Ergonomics is handled where it belongs: buttons have their own 44px floor,
   * and the zoom controls are there for anyone who wants a closer look.
   */
  /** Change zoom AND remember it. The default is recomputed per viewport, so
   *  the preference is stored as a multiple of it -- otherwise zooming in on a
   *  phone would come back as a different framing on a desktop. */
  setZoom(z: number): void {
    const next = Math.min(Math.max(z, ZOOM_MIN), ZOOM_MAX);
    this.zoom = next;
    const base = this.tileZoom();
    this.settings = { ...this.settings,
                      zoom: Math.min(Math.max(base > 0 ? next / base : 1,
                                              ZOOM_PREF_MIN), ZOOM_PREF_MAX) };
  }

  tileZoom(): number {
    const short = Math.min(innerWidth, innerHeight);
    return Math.max(short / (TILES_ACROSS * TILE), 0.3);
  }

  resize(): void {
    this.insetCache = null;
    // A map view framed for portrait is wrong in landscape, so drop it and
    // let the next open reframe against the real viewport.
    this.view = null;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(innerWidth * dpr, 1);
    this.canvas.height = Math.max(innerHeight * dpr, 1);
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = Math.min(Math.max(this.tileZoom() * this.settings.zoom, ZOOM_MIN), ZOOM_MAX);
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

  step_(t: number): void { t_step_(this, t); }


  draw(): void { r_draw(this); }


  /** World-space effects, drawn inside the camera transform. */
  drawFx(px: number): void { r_drawFx(this, px); }


  /** Screen-space effects: the level-transition wipe. */
  drawScreenFx(W: number, H: number): void { r_drawScreenFx(this, W, H); }


  drawHud(W: number, H: number): void { r_drawHud(this, W, H); }


  drawPlasmid(W: number, H: number): void { r_drawPlasmid(this, W, H); }


  inClose(x: number, y: number): boolean { return i_inClose(this, x, y); }


  pointerDown(x: number, y: number): void { i_pointerDown(this, x, y); }


  pointerMove(x: number, y: number): void { i_pointerMove(this, x, y); }


  pointerUp(x: number, y: number): void { i_pointerUp(this, x, y); }


  /** Minimal renderer for when draw() itself has failed. Touches only the
   *  context and the message, so it cannot fail for the same reason. */
  drawEmergency(msg: string): void { r_drawEmergency(this, msg); }


  /** Toasts, drawn above everything. A silent failure on a phone with no
   *  console is the worst outcome there is. */
  drawToasts(W: number, H: number): void { r_drawToasts(this, W, H); }



  startRun(slot: number, cls: ClassId = DEFAULT_CLASS): void {
    this.slot = slot;
    // The lab outlives every strain, so it is read here rather than from the
    // slot file: dying, or deleting a save, must not cost the meta-progression.
    this.lab = readLab();
    this.dead = false;
    this.deathRecord = null;
    this.lastAttacker = null;
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

      // Everything the lab has ordered is on the new strain from turn one.
      // This is what the previous strain died for.
      // The CLASS first: it decides the chromosome the lab's constructs then
      // land on. Applying it after the stock would let a class with fewer
      // sites push already-ordered genes off the ring.
      this.strainClass = cls;
      const def = CLASSES[cls];
      this.genome.integrated = Math.max(this.lab.startSites + def.sites, 0);
      this.genome.strain = this.lab.startStrain;
      if (def.trait) this.genome.acquire(def.trait);

      // Its opening operon, laid down as a WORKING unit -- promoter, genes,
      // terminator -- not dropped in the bin for the player to assemble. The
      // class is what you inoculated, so it should already be running.
      for (const g of def.genes) {
        this.genome.stash({ kind: "gene", id: g, level: 1, mods: [],
                            allele: WILD_TYPE });
      }
      const built = this.genome.assemble([...def.genes]);
      if (!built.ok) this.trace.push(0, "note", `class operon: ${built.err}`);

      for (const g of this.lab.stock) {
        this.genome.stash({ kind: "gene", id: g, level: 1, mods: [],
                            allele: WILD_TYPE });
      }

      this.player.hp = this.player.maxhp;
      this.player.atp = this.player.atpMax;
      this.player.status.length = 0;
      this.enter(this.dungeon.current(), this.dungeon.current().up);
      this.note(`${def.name} ${this.runName} inoculated. ${def.blurb}`
        + (this.lab.stock.length > 0
          ? ` ${String(this.lab.stock.length)} synthesised construct`
            + `${this.lab.stock.length === 1 ? "" : "s"} in the bin.`
          : ""));
    }
    this.started = true;
    this.showSplash = false;
    this.save();
  }

  /** The field notebook. "Recording the bugs you find along the way." */

  /** Copy the plasmid to the clipboard as FASTA, with real sequences.
   *  The work is in export.ts -- fetching, formatting and the clipboard are a
   *  feature, not lifecycle, and main.ts is only allowed to hold lifecycle. */
  exportPlasmid(): void { x_export(this); }


  /** A lysate opened: its contents as slots, like any RPG container. */

  drawMapScreen(W: number, H: number): void { r_drawMapScreen(this, W, H); }


  /** Graph-space point for a screen point, accounting for the header offset. */
  /** @internal: public because input routing lives in input.ts */
  mapPoint(x: number, y: number): { x: number; y: number } {
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

  press(id: string): void { i_press(this, id); }

}

function boot(): void {
  const el = document.getElementById("game");
  if (!(el instanceof HTMLCanvasElement)) return;
  const game = new Game(el);
  document.getElementById("boot")?.remove();
  // Registration used to happen once on `load` with default cache handling,
  // which left an installed app one or two versions behind. See sw_client.ts.
  installGlobalHandlers((msg) => { game.toasts.push(msg, "error", performance.now()); });

  installUpdater({
    onUpdating: () => {
      // The game saves continuously, so reloading loses nothing.
      try { localStorage.setItem("microgue:updated", "1"); } catch { /* ignore */ }
    },
  });

  installConsole(game);
}
boot();

export { Game };
