// A compact picture of every variable that matters, for the flight recorder.
//
// The events in the log say what HAPPENED. They do not say what the world
// looked like while it was happening, and most reported bugs are questions
// about state over time: "my ATP is draining", "the bar is not moving", "the
// damage came from nowhere". None of those could be answered from a list of
// events.
//
// One line, because a snapshot that wraps is a snapshot nobody reads.

import { SNAPSHOT_EVERY } from "./trace.js";
import type { Game } from "./main.js";

/** Everything, in about a hundred and twenty characters. */
export function snapshot(_g: Game): string {
  const p = _g.player;
  const gen = _g.genome;
  const d = _g.dungeon.depth;
  const bal = gen.atpBalance(d);
  const net = bal - _g.repairSpend;
  const st = p.status.map((s) => s.id).join("/") || "-";
  return [
    `F${String(_g.dungeon.floor)}/D${String(d)}`,
    `${String(_g.player.x)},${String(_g.player.y)}`,
    `hp ${String(Math.round(p.hp))}/${String(p.maxhp)}`,
    `atp ${String(Math.round(p.atp))}/${String(p.atpMax)}`,
    `net ${net >= 0 ? "+" : ""}${net.toFixed(1)}`,
    `pow ${gen.power(d).toFixed(1)}`,
    `kb ${gen.used().toFixed(1)}/${gen.capacityKb().toFixed(1)}`,
    `slots ${String(gen.usableSlots)}`,
    `L${String(gen.strain)}`,
    `${String(_g.run.killed)}k`,
    `bin ${String(gen.bin.length)}`,
    `mobs ${String(_g.level.mobs.filter((m) => m.alive).length)}`,
    st,
  ].join(" ");
}

/** Whether this turn is one to record. */
export function isSnapshotTurn(turn: number): boolean {
  return Number.isFinite(turn) && turn > 0 && turn % SNAPSHOT_EVERY === 0;
}
