// The console handle.
//
// A phone has no devtools worth the name, so this is the only way to get the
// flight recorder or the world state off a device -- which is exactly what the
// recorder exists for, and what HANDOVER has claimed was available since the
// recorder shipped. It was not: nothing ever assigned the global.
//
// It is also what drives `npm run shots`, so the screenshots come from the
// REAL game rather than from a harness that reimplements half of it.

import { VERSION } from "./version.js";
import type { Game } from "./main.js";

export interface Console_ {
  trace(n?: number): string;
  state(): unknown;
  press(id: string): void;
  start(slot?: number): void;
  game: Game;
}

export function installConsole(game: Game): void {
  const api: Console_ = {
    trace: (n = 60) => game.trace.dump(n),
    state: () => ({
      version: VERSION, floor: game.dungeon.floor, turn: game.clock.turn,
      hp: game.player.hp, maxhp: game.player.maxhp,
      atp: Math.round(game.player.atp), atpMax: game.player.atpMax,
      strain: game.genome.strain, slots: game.genome.usableSlots,
      zoom: Math.round(game.zoom * 1000) / 1000,
      tilesAcross: Math.round(Math.min(innerWidth, innerHeight) / (32 * game.zoom)),
      deepest: game.run.deepest, catalogued: game.run.bestiary.length,
      dead: game.dead, won: game.won,
      toasts: game.toasts.all().map((t) => `${t.level}: ${t.text}`),
    }),
    press: (id) => { game.press(id); },
    start: (slot = 0) => { game.startRun(slot); },
    game,
  };
  (globalThis as unknown as { microgue: Console_ }).microgue = api;
}
