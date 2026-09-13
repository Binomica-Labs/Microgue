// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Executing an ability.
//
// One entry point, `castAbility`, that checks ATP and cooldown, then does the
// kind-specific thing. Secretions become lingering tiles that hurt what
// crosses them (checked in the mob turn); bolts trace a line to the first
// mob; bursts hit a ring; surges set a timed self-effect. Every path returns
// a reason on refusal, because a silent no on a deliberate action is the
// worst UI.

import { ABILITY_BY_ID, ready, spend, type Ability } from "./abilities.js";
import { apply as applyStatus } from "./status.js";
import type { Game } from "./main.js";

/** A secreted enzyme on a tile. Damages a mob that stands on it each turn. */
export interface Secretion {
  x: number; y: number;
  dmg: number;
  /** Turn it disappears. */
  until: number;
  /** Which ability laid it, for colour. */
  by: string;
}

/** A timed self-effect from a surge. */
export interface Surge {
  /** Incoming-damage multiplier while active, x1 neutral. */
  armour: number;
  until: number;
}

export function castAbility(
  _g: Game, id: string, dx = 0, dy = 0,
): string | null {
  const a: Ability | undefined = ABILITY_BY_ID[id];
  if (!a) return "No such ability.";
  // A lost strain does not act. The aftermath screen is up; a cast underneath
  // it would lay tiles into a run that is over.
  if (_g.dead) return "The strain is lost.";
  const d = _g.dungeon.depth;
  const expr = _g.genome.expression(a.gene, d);
  if (expr <= 0) return `${a.name} needs ${a.gene} expressed here.`;
  if (!ready(_g.cooldowns, a.id, _g.clock.turn)) {
    const left = (_g.cooldowns.get(a.id) ?? 0) - _g.clock.turn;
    return `${a.name} recharging: ${String(left)} turn${left === 1 ? "" : "s"}.`;
  }
  if (_g.player.atp < a.cost) return `${a.name} costs ${String(a.cost)} ATP.`;

  const power = Math.max(Math.round(a.power * (0.5 + expr)), 1);
  const px = _g.player.x, py = _g.player.y;
  const t = _g.clock.turn;

  switch (a.kind) {
    case "secrete": {
      // A ring of tiles around you, on floor only.
      let laid = 0;
      for (let oy = -a.range; oy <= a.range; oy++) {
        for (let ox = -a.range; ox <= a.range; ox++) {
          if (ox === 0 && oy === 0) continue;
          const x = px + ox, y = py + oy;
          if (!_g.level.grid.isFloor(x, y)) continue;
          _g.secretions.push({ x, y, dmg: power, until: t + a.linger, by: a.id });
          laid++;
        }
      }
      if (laid === 0) return "Nowhere to lay it.";
      _g.note(`You secrete ${a.name}. ${String(laid)} tiles, ${String(a.linger)} turns.`);
      break;
    }
    case "bolt": {
      // A direction is required. Walk the line until something is hit.
      if (dx === 0 && dy === 0) return "Pick a direction to fire.";
      const sx = Math.sign(dx), sy = Math.sign(dy);
      let hit = false;
      for (let i = 1; i <= a.range; i++) {
        const x = px + sx * i, y = py + sy * i;
        if (!_g.level.grid.isFloor(x, y)) break;
        const m = _g.dungeon.mobAt(x, y, _g.level);
        if (m?.alive) {
          m.hp -= power;
          _g.fx.add({ kind: "flash", t0: _g.now, dur: 220, x: m.x, y: m.y, colour: "#ffe08a" });
          _g.note(`${a.name} hits the ${m.name} for ${String(power)}.`);
          if (m.hp <= 0) { m.alive = false; _g.run.killed += 1; _g.note(`The ${m.name} lyses.`); }
          hit = true;
          break;
        }
      }
      if (!hit) _g.note(`${a.name} finds nothing.`);
      break;
    }
    case "burst": {
      let hits = 0;
      for (const m of _g.level.mobs) {
        if (!m.alive) continue;
        if (Math.max(Math.abs(m.x - px), Math.abs(m.y - py)) > a.range) continue;
        m.hp -= power;
        _g.fx.add({ kind: "flash", t0: _g.now, dur: 220, x: m.x, y: m.y, colour: "#ffe08a" });
        if (a.id === "sulfide") applyStatus(m.status, "slowed", 3, 1);
        if (m.hp <= 0) { m.alive = false; _g.run.killed += 1; }
        hits++;
      }
      // Sulfide hurts you too, unless you route it: sqr.
      if (a.id === "sulfide" && _g.genome.expression("sqr", d) <= 0) {
        _g.player.hp -= Math.ceil(power / 2);
        _g.note(`Your own sulfide burns you for ${String(Math.ceil(power / 2))}.`);
      }
      _g.note(`${a.name}: ${String(hits)} hit.`);
      break;
    }
    case "surge": {
      if (a.id === "dash") {
        if (dx === 0 && dy === 0) return "Pick a direction to dash.";
        const sx = Math.sign(dx), sy = Math.sign(dy);
        let moved = 0;
        for (let i = 0; i < a.range; i++) {
          const x = _g.player.x + sx, y = _g.player.y + sy;
          if (!_g.level.grid.isFloor(x, y)) break;
          if (_g.dungeon.mobAt(x, y, _g.level)?.alive) break;
          _g.player.x = x; _g.player.y = y;
          moved++;
        }
        if (moved === 0) return "Nowhere to dash.";
        _g.note(`You dash ${String(moved)} tiles.`);
        _g.look();
      } else {
        _g.surge = { armour: a.power, until: t + a.linger };
        _g.note(`${a.name}: incoming damage halved for ${String(a.linger)} turns.`);
      }
      break;
    }
  }

  _g.player.atp -= a.cost;
  spend(_g.cooldowns, a, t);
  _g.trace.push(t, "attack", `cast ${a.id}`);
  return null;
}

/** Tick secretions: expire old ones, hurt mobs standing on them. Run once per
 *  turn from the mob-turn path, after the mobs have moved. */
export function tickSecretions(_g: Game): void {
  const t = _g.clock.turn;
  _g.secretions = _g.secretions.filter((s) => s.until > t);
  if (_g.secretions.length === 0) return;
  for (const m of _g.level.mobs) {
    if (!m.alive) continue;
    const s = _g.secretions.find((q) => q.x === m.x && q.y === m.y);
    if (!s) continue;
    m.hp -= s.dmg;
    _g.fx.add({ kind: "flash", t0: _g.now, dur: 220, x: m.x, y: m.y, colour: "#ffe08a" });
    if (m.hp <= 0) {
      m.alive = false;
      _g.run.killed += 1;
      _g.note(`The ${m.name} is digested in the ${ABILITY_BY_ID[s.by]?.name ?? "enzyme"}.`);
    }
  }
  if (_g.surge && _g.surge.until <= t) _g.surge = null;
}
