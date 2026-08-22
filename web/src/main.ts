// Microgue -- browser shell. Canvas rendering, pointer + keyboard input,
// localStorage persistence. Everything above this file is engine-free logic.

import * as bio from "./biology.js";
import { Dungeon, type Level, type Mob } from "./dungeon.js";
import { Genome } from "./genome.js";
import * as mg from "./mapgen.js";
import type { Point } from "./mapgen.js";
import { findPath } from "./path.js";
import { DEFAULT_SETTINGS, readSave, writeSave, type Settings } from "./save.js";

const TILE = 32;
const SAVE_KEY = "microgue:v1";

class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dungeon = new Dungeon(110, 80, 7);
  genome = new Genome(12);
  level!: Level;
  player = { x: 0, y: 0, ax: 0, ay: 0, hp: 30, maxhp: 30, speed: 18 };
  cursor: Point = { x: 0, y: 0 };
  path: Point[] | null = null;
  walk: { nodes: Point[]; i: number } | null = null;
  zoom = 1;
  log: string[] = [];
  showPlasmid = false;
  settings: Settings = DEFAULT_SETTINGS;
  private last = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    if (!this.load()) this.enter(this.dungeon.current(), this.dungeon.current().up);
    this.resize();
    addEventListener("resize", () => { this.resize(); });
    this.bindInput();
    requestAnimationFrame((t) => { this.frame(t); });
  }

  // ---------------------------------------------------------------- state
  note(s: string): void { this.log.push(s); while (this.log.length > 5) this.log.shift(); }

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
    this.note(`D${String(s.depth)} ${s.name} — ${s.teap} ${s.e0 >= 0 ? "+" : ""}${String(s.e0)} mV`);
    if (!level.visited) { level.visited = true; this.note(s.blurb); }
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
  atk(): number {
    let a = 3;
    for (const s of this.genome.slots) {
      a += this.genome.expression(s.id, this.dungeon.depth) * s.tier * 0.9;
    }
    return a;
  }

  attack(m: Mob): void {
    m.hp -= this.atk();
    if (m.hp <= 0) {
      m.alive = false;
      this.note(`${m.name} destroyed.`);
      const pool = m.genes.filter((g) => !this.genome.has(g));
      if (!pool.length) { this.note(`Nothing new to take.`); }
      else {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick === undefined) return;
        const r = this.genome.insert(pick);
        this.note(r.ok ? `HGT: acquired ${bio.GENES[pick].name} from ${m.name}.`
                       : `${bio.GENES[pick].name} — ${r.err}`);
      }
    } else {
      this.player.hp -= m.atk * 0.5;
      this.note(`${m.name}: ${Math.max(m.hp, 0).toFixed(0)} hp left.`);
    }
    this.mobTurn();
    this.save();
  }

  mobTurn(): void {
    for (const m of this.level.mobs) {
      if (!m.alive) continue;
      const dx = this.player.x - m.x, dy = this.player.y - m.y;
      if (dx * dx + dy * dy > 64) continue;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) { this.player.hp -= m.atk * 0.35; continue; }
      const sx = Math.sign(dx), sy = Math.sign(dy);
      if (this.level.grid.isFloor(m.x + sx, m.y + sy) && !this.dungeon.mobAt(m.x + sx, m.y + sy)) {
        m.x += sx; m.y += sy;
      }
    }
    if (this.player.hp <= 0) {
      this.player.hp = this.player.maxhp;
      this.note("Lysed. Reassembled at the last stair.");
      this.player.x = this.level.up.x; this.player.y = this.level.up.y;
      this.player.ax = this.player.x; this.player.ay = this.player.y;
    }
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
    if (m !== undefined && Math.abs(tx - this.player.x) <= 1 && Math.abs(ty - this.player.y) <= 1) {
      this.attack(m); return;
    }
    this.cursor = { x: tx, y: ty };
    this.repath();
    if (this.path && this.path.length > 1) this.walk = { nodes: this.path, i: 0 };
  }

  private bindInput(): void {
    const toTile = (cx: number, cy: number): Point => {
      const r = this.canvas.getBoundingClientRect();
      const s = TILE * this.zoom;
      const px = (cx - r.left - r.width / 2) / s + this.player.ax + 0.5;
      const py = (cy - r.top - r.height / 2) / s + this.player.ay + 0.5;
      return { x: Math.floor(px), y: Math.floor(py) };
    };

    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.showPlasmid) { this.showPlasmid = false; return; }
      const t = toTile(e.clientX, e.clientY);
      this.tap(t.x, t.y);
    });

    addEventListener("keydown", (e) => {
      const k = e.key;
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
        w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
        y:[-1,-1], u:[1,-1], b:[-1,1], n:[1,1],
      };
      const dir = dirs[k];
      if (dir) {
        e.preventDefault();
        this.walk = null;
        const [dx, dy] = dir;
        const pinch = dx && dy
          && !this.level.grid.isFloor(this.player.x + dx, this.player.y)
          && !this.level.grid.isFloor(this.player.x, this.player.y + dy);
        if (!pinch) this.step(this.player.x + dx, this.player.y + dy);
        return;
      }
      if (k === "i" || k === "p") this.showPlasmid = !this.showPlasmid;
      else if (k === ">" || k === ".") this.descend();
      else if (k === "<" || k === ",") this.ascend();
      else if (k === "+" || k === "=") this.zoom = Math.min(this.zoom * 1.25, 8);
      else if (k === "-") this.zoom = Math.max(this.zoom / 1.25, 0.3);
      else if (k === "c") {
        this.settings = { ...this.settings, highContrast: !this.settings.highContrast };
        this.save();
      }
    });

    // Pinch-zoom, without the gesture fighting a tap.
    const pts = new Map<number, Point>();
    let d0 = 0;
    let z0 = 1;
    this.canvas.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Point, Point];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0) this.zoom = Math.min(Math.max(z0 * (d / d0), 0.3), 8);
      }
    });
    this.canvas.addEventListener("pointerdown", (e) => {
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
    writeSave(SAVE_KEY, {
      version: 1,
      depth: this.dungeon.depth,
      seed: this.dungeon.seed,
      px: this.player.x,
      py: this.player.y,
      hp: this.player.hp,
      genes: this.genome.slots.map((slot) => [slot.id, slot.optimised] as const),
      settings: this.settings,
    });
  }

  load(): boolean {
    const s = readSave(SAVE_KEY);
    if (s === null) return false;
    this.dungeon = new Dungeon(110, 80, s.seed);
    this.dungeon.depth = s.depth;
    this.genome = new Genome(12);
    for (const [id, optimised] of s.genes) {
      if (id === "ori") continue;
      if (this.genome.insert(id).ok && optimised) this.genome.optimise(id);
    }
    this.settings = s.settings;
    this.enter(this.dungeon.current(), { x: s.px, y: s.py });
    this.player.hp = s.hp;
    this.note("Resumed.");
    return true;
  }

  // ------------------------------------------------------------- render
  /** Notch / gesture-bar insets. Read from CSS env() via a probe element,
   *  since canvas has no access to them directly. */
  private insets(): { top: number; right: number; bottom: number; left: number } {
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
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(innerWidth * dpr, 1);
    this.canvas.height = Math.max(innerHeight * dpr, 1);
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = this.tileZoom();
  }

  frame(t: number): void {
    const dt = Math.min(Math.max((t - this.last) / 1000, 0), 1 / 15);
    this.last = t;

    // slide toward the logical tile; clamped so a hitch cannot overshoot
    const k = this.settings.reduceMotion ? 1 : Math.min(this.player.speed * dt, 1);
    this.player.ax += (this.player.x - this.player.ax) * k;
    this.player.ay += (this.player.y - this.player.ay) * k;
    const at = Math.abs(this.player.x - this.player.ax) < 0.02
            && Math.abs(this.player.y - this.player.ay) < 0.02;
    if (at) { this.player.ax = this.player.x; this.player.ay = this.player.y; }

    if (this.walk && at) {
      this.walk.i++;
      const n = this.walk.nodes[this.walk.i];
      if (!n || this.dungeon.mobAt(n.x, n.y) || !this.step(n.x, n.y)) this.walk = null;
    }

    this.draw();
    requestAnimationFrame((tt) => { this.frame(tt); });
  }

  draw(): void {
    const { ctx } = this;
    const W = innerWidth, H = innerHeight;
    const s = this.level.stratum;
    const hc = this.settings.highContrast;

    ctx.fillStyle = hc ? "#000" : s.floor;
    ctx.fillRect(0, 0, W, H);

    const px = TILE * this.zoom;
    ctx.save();
    ctx.translate(W / 2 - (this.player.ax + 0.5) * px, H / 2 - (this.player.ay + 0.5) * px);

    const x0 = Math.max(Math.floor((this.player.ax - W / px / 2) - 1), 0);
    const x1 = Math.min(Math.ceil((this.player.ax + W / px / 2) + 1), this.level.grid.w - 1);
    const y0 = Math.max(Math.floor((this.player.ay - H / px / 2) - 1), 0);
    const y1 = Math.min(Math.ceil((this.player.ay + H / px / 2) + 1), this.level.grid.h - 1);

    // Walls: filled, not outlined -- outlines are near-invisible in sunlight.
    // hatch is a redundant, non-colour depth cue, because hue alone excludes
    // ~8% of men and D1 and D6 are both green.
    ctx.fillStyle = hc ? "#fff" : s.wall;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!this.level.grid.isWall(x, y)) continue;
        // Round and overlap by a pixel. At fractional zoom (32 * 2.6 = 83.2)
        // adjacent rects antialias against each other and leave visible seams.
        const rx = Math.round(x * px);
        const ry = Math.round(y * px);
        ctx.fillRect(rx, ry, Math.round((x + 1) * px) - rx + 1, Math.round((y + 1) * px) - ry + 1);
        if (s.hatch && !hc) {
          // Inset ticks, not full-width rules. Drawn edge-to-edge, adjacent
          // tiles merged into continuous stripes and the wall read as lined
          // paper. Insetting keeps a gap at every tile border so the marks
          // stay per-tile texture, and countable: N ticks = deeper stratum.
          const w = Math.round(px * 0.34);
          const t = Math.max(Math.round(px * 0.035), 1);
          const x0 = rx + Math.round((px - w) / 2);
          ctx.globalAlpha = 0.32;
          ctx.fillStyle = s.floor;
          for (let i = 1; i <= s.hatch; i++) {
            ctx.fillRect(x0, ry + Math.round((i * px) / (s.hatch + 1)) - (t >> 1), w, t);
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = s.wall;
        }
      }
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

    for (const m of this.level.mobs) {
      if (!m.alive) continue;
      const f = Math.max(m.hp / m.maxhp, 0);
      ctx.fillStyle = hc ? "#fff" : "#e04a3a";
      ctx.fillRect(m.x * px + px * 0.15, m.y * px + px * 0.15, px * 0.7, px * 0.7);
      // health as a bar, not as colour saturation
      ctx.fillStyle = hc ? "#888" : "#2a0d0a";
      ctx.fillRect(m.x * px + px * 0.15, m.y * px + px * 0.78, px * 0.7, px * 0.1);
      ctx.fillStyle = hc ? "#fff" : "#ffd0a0";
      ctx.fillRect(m.x * px + px * 0.15, m.y * px + px * 0.78, px * 0.7 * f, px * 0.1);
      ctx.fillStyle = hc ? "#000" : "#1a0503";
      ctx.font = `bold ${px * 0.5}px ui-monospace,monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(m.glyph, m.x * px + px / 2, m.y * px + px * 0.45);
    }

    ctx.fillStyle = hc ? "#0ff" : "#ffffff";
    ctx.fillRect(this.player.ax * px + px * 0.18, this.player.ay * px + px * 0.18, px * 0.64, px * 0.64);

    ctx.strokeStyle = hc ? "#ff0" : (this.path ? "#ffffff" : "#777777");
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cursor.x * px, this.cursor.y * px, px, px);
    ctx.restore();

    this.drawHud(W, H);
    if (this.showPlasmid) this.drawPlasmid(W, H);
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

    // Two lines: identity, then vitals. One line did not fit a phone.
    const lineA = `D${this.dungeon.depth}/${bio.MAX_DEPTH}  ${s.name}  ${s.teap} ${s.e0 >= 0 ? "+" : ""}${s.e0}mV`;
    const lineB = `hp ${Math.max(this.player.hp, 0).toFixed(0)}/${this.player.maxhp}` +
      `   plasmid ${this.genome.used().toFixed(1)}/${this.genome.capacity}kb` +
      `   hostiles ${this.dungeon.aliveCount()}`;

    const size = Math.min(
      this.fitFont(lineA, maxW, 13 * u),
      this.fitFont(lineB, maxW, 13 * u),
    );
    ctx.font = `${size}px ui-monospace,monospace`;
    const lh = size * 1.35;
    const barH = lh * 2 + pad;
    const barTop = H - ins.bottom - barH;

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, barTop, W, barH + ins.bottom);
    ctx.fillStyle = s.accent;
    ctx.fillText(lineA, left, barTop + lh * 0.85);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(lineB, left, barTop + lh * 1.85);

    // Log above the bar, wrapped and clipped to the visible area.
    ctx.font = `${size}px ui-monospace,monospace`;
    const wrapped: string[] = [];
    for (const entry of this.log) wrapped.push(...this.wrap(entry, maxW));
    const shown = wrapped.slice(-5);
    for (let i = shown.length - 1; i >= 0; i--) {
      const line = shown[i];
      if (line === undefined) continue;
      ctx.globalAlpha = 1 - (shown.length - 1 - i) * 0.16;
      ctx.fillStyle = "#cfe8d4";
      ctx.fillText(line, left, barTop - (shown.length - i) * lh - pad * 0.5);
    }
    ctx.globalAlpha = 1;
  }

  drawPlasmid(W: number, H: number): void {
    const { ctx } = this;
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.27;
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#40474a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    ctx.font = `${12 * u}px ui-monospace,monospace`;
    for (const f of this.genome.report(this.dungeon.depth)) {
      const a0 = (f.start - 90) * Math.PI / 180, a1 = (f.stop - 90) * Math.PI / 180;
      const e = f.expression;
      ctx.strokeStyle = `rgba(${90 + 165 * e},${110 + 130 * e},120,${0.35 + 0.65 * e})`;
      ctx.lineWidth = 10 * u;
      ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
      const mid = (a0 + a1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * e})`;
      ctx.textAlign = Math.cos(mid) < 0 ? "right" : "left";
      ctx.textBaseline = "middle";
      // expression as a number too, not just brightness
      ctx.fillText(`${f.name}${f.optimised ? "*" : ""} ${(e * 100) | 0}%`,
        cx + Math.cos(mid) * (R + 16 * u), cy + Math.sin(mid) * (R + 16 * u));
    }
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = `${14 * u}px ui-monospace,monospace`;
    ctx.fillText(`PLASMID  ${this.genome.used().toFixed(1)}/${this.genome.capacity} kb` +
      `  burden ${(this.genome.burden() * 100) | 0}%`, cx, 30 * u);
    ctx.fillText(`expression at D${this.dungeon.depth} — tap to close`, cx, H - 40 * u);
  }
}

/** Register the service worker so the home-screen icon launches offline. */
function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch(() => undefined);   // file:// or an unsupported browser -- fine
  });
}

function boot(): void {
  const el = document.getElementById("game");
  if (!(el instanceof HTMLCanvasElement)) return;
  new Game(el);
  document.getElementById("boot")?.remove();
  registerServiceWorker();
}
boot();

export { Game };
