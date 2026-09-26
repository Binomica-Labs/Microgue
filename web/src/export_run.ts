// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Composing the run's card and handing it over.

import { CARD_SIZE, cardName, drawCard } from "./export_card.js";
import { exportCanvas } from "./export_save.js";
import { MAX_FLOOR } from "./dungeon.js";
import type { GeneId } from "./biology.js";
import type { Game } from "./main.js";

export function g_saveBuild(_g: Game): void {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) { _g.toasts.push("Cannot draw the card here.", "warn", _g.now); return; }

  const installed = new Map<GeneId, number>();
  for (const p of _g.genome.slots) {
    if (p?.kind === "gene" && p.id !== "ori") installed.set(p.id, p.level);
  }
  const held = new Set<GeneId>();
  for (const p of _g.genome.bin) {
    if (p.kind === "gene" && p.id !== "ori") held.add(p.id);
  }

  drawCard(ctx, {
    strain: _g.runName,
    generation: _g.lab.generation,
    floor: _g.dungeon.floor,
    maxFloor: MAX_FLOOR,
    turns: _g.clock.turn,
    lysed: _g.run.killed,
    installed, held,
    // The epitaph is a list of lines; the card has room for one. The LAST
    // is how it ended, which is the line worth keeping.
    epitaph: _g.deathRecord?.epitaph.at(-1) ?? "",
    won: _g.dungeon.floor >= MAX_FLOOR && !_g.dead,
  });

  _g.toasts.push("Saving the build\u2026", "info", _g.now);
  void exportCanvas(canvas, cardName(_g.runName, _g.dungeon.floor),
                    `${_g.runName} \u2014 Microgue`)
    .then((r) => {
      // Cancelled is a DECISION, not a failure. Telling a player their
      // share failed when they closed the sheet themselves is a lie the
      // game has no reason to tell.
      if (r === "failed") {
        _g.toasts.push("Could not save the picture.", "warn", _g.now);
      } else if (r === "downloaded") {
        _g.toasts.push("Saved to your downloads.", "info", _g.now);
      }
    })
    .catch(() => {
      _g.toasts.push("Could not save the picture.", "warn", _g.now);
    });
}
