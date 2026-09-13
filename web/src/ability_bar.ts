// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The ability bar: what you can DO right now, drawn along the bottom edge
// above the HUD.
//
// One slot per granted ability. Each shows its glyph, its ATP cost, and a
// cooldown sweep when it is recharging. Tapping a ready slot casts it; a
// directional one (bolt, dash) arms it instead, and the next tap on the map
// picks the direction. The bar only appears when there is something on it --
// an empty bar is a promise the build has not kept yet.

import { grantedAbilities, ready, type Ability } from "./abilities.js";
import type { Box } from "./chrome.js";
import type { Game } from "./main.js";

export interface AbilitySlot { readonly box: Box; readonly ability: Ability }

export function drawAbilityBar(
  _g: Game, W: number, barTop: number, u: number,
): AbilitySlot[] {
  const ctx = _g.ctx;
  const d = _g.dungeon.depth;
  const list = grantedAbilities((g) => _g.genome.expression(g, d));
  if (list.length === 0) return [];

  const size = 40 * u, gap = 8 * u;
  const total = list.length * size + (list.length - 1) * gap;
  const left = Math.max((W - total) / 2, _g.insets().left + 8 * u);
  const y = barTop - size - 10 * u;
  const slots: AbilitySlot[] = [];
  const t = _g.clock.turn;

  list.forEach((a, i) => {
    const box: Box = { x: left + i * (size + gap), y, w: size, h: size };
    slots.push({ box, ability: a });
    const isReady = ready(_g.cooldowns, a.id, t);
    const afford = _g.player.atp >= a.cost;
    const armed = _g.aiming === a.id;
    const usable = isReady && afford;

    ctx.fillStyle = armed ? "rgba(207,224,74,0.28)"
      : usable ? "rgba(16,22,18,0.92)" : "rgba(8,12,10,0.85)";
    ctx.strokeStyle = armed ? "#cfe04a"
      : usable ? "rgba(207,224,74,0.7)" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = Math.max(1.4 * u, 1.2);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7 * u);
    ctx.fill();
    ctx.stroke();

    // Cooldown sweep: a dark wedge over the slot, shrinking as it recharges.
    if (!isReady) {
      const until = _g.cooldowns.get(a.id) ?? t;
      const frac = Math.min(Math.max((until - t) / a.cooldown, 0), 1);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.moveTo(box.x + box.w / 2, box.y + box.h / 2);
      ctx.arc(box.x + box.w / 2, box.y + box.h / 2, box.w * 0.7,
              -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.closePath();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, 7 * u);
      ctx.clip();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = usable ? "#ffffff" : "#6f8f7c";
    ctx.font = `${17 * u}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(a.glyph, box.x + box.w / 2, box.y + box.h / 2 - 3 * u);
    ctx.fillStyle = afford ? "#4a9fd8" : "#c86a3a";
    ctx.font = `${7.5 * u}px ui-monospace,monospace`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(a.cost), box.x + box.w / 2, box.y + box.h - 5 * u);
  });

  // When armed, say so. A silent armed state is a tap that does something
  // surprising.
  if (_g.aiming !== null) {
    const a = list.find((x) => x.id === _g.aiming);
    if (a) {
      ctx.fillStyle = "#cfe04a";
      ctx.font = `${9.5 * u}px ui-monospace,monospace`;
      ctx.textAlign = "center";
      ctx.fillText(`${a.name}: tap a direction`, W / 2, y - 6 * u);
    }
  }
  return slots;
}
