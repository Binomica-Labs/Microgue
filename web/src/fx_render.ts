// Effect rendering: lunges, flashes, damage numbers, bursts, bolts, rings.
//
// Split out when render.ts crossed the 900-line ceiling `spec` enforces. It is
// self-contained -- it needs the effect queue and a tile size and nothing else
// about the game -- which is why it was the piece to move.

import { easeInQuad as easeInQuadLocal, easeOutCubic, easeOutQuad, jitter }
  from "./fx.js";
import { Effects } from "./fx.js";
import type { Game } from "./main.js";

export function r_drawFx(_g: Game, px: number): void {
    const { ctx } = _g;
    const now = _g.now;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const f of _g.fx.all()) {
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
          // Rise, punch, fade. The old version was small, short-lived and had
          // no outline, so a damage number over a pale wall was invisible --
          // which is the same as not having damage numbers at all.
          ctx.globalAlpha = 1 - easeInQuadLocal(t) ** 2;
          const pop = t < 0.16 ? 1 + (0.16 - t) * 2.6 : 1;
          const size = px * 0.42 * pop;
          const tx = (f.x + 0.5) * px;
          const ty = (f.y + 0.35 - easeOutCubic(t) * 1.35) * px;
          ctx.font = `bold ${size}px ui-monospace,monospace`;
          ctx.textAlign = "center";
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(size * 0.22, 2);
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.strokeText(f.text, tx, ty);
          ctx.fillStyle = f.colour;
          ctx.fillText(f.text, tx, ty);
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

/**
 * The mark on an elite.
 *
 * They were drawn identically to everything else, which made 5.5% of the
 * population -- with up to 3.4x the hp and triple the loot -- unreadable. You
 * could not tell what you were picking a fight with, or what was worth picking
 * one with.
 *
 * A halo rather than a recolour: the pigment is already saying what the
 * organism IS, and overwriting it to say something else would cost the more
 * useful signal. Phased by `uid` so a group does not pulse in unison.
 */
export function eliteHalo(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number, px: number, now: number, uid: number,
): void {
  const puls = 0.88 + Math.sin(now / 540 + uid) * 0.12;
  const r0 = px * 0.52 * puls;
  const gr = ctx.createRadialGradient(bx, by, px * 0.16, bx, by, r0);
  gr.addColorStop(0, "rgba(255,210,120,0.00)");
  gr.addColorStop(0.62, "rgba(255,196,96,0.30)");
  gr.addColorStop(1, "rgba(255,196,96,0)");
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(bx, by, r0, 0, Math.PI * 2);
  ctx.fill();
}
