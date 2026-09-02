// Persistence.
//
// Writing the run to a slot and reading it back. Split from main.ts when that
// crossed the 900-line ceiling `spec` enforces.
//
// The rule this file exists to keep: whenever a field is added to `Game`, ask
// whether it belongs in `SaveData`, whether the writer DEEP copies it, and
// whether `applySave` reads it back. That has been forgotten three times, and
// each time the symptom was a setting or an inventory that silently reset.

import { SCHEMA, writeSave, type SaveData } from "./save.js";

/** The pre-slot save key. Still written so a build from before slots
 *  existed can be recovered by `migrateLegacy`. */
export const SAVE_KEY = "microgue:v1";
import { saveSlot } from "./saves.js";
import { strainLevel } from "./strain.js";
import { Dungeon } from "./dungeon.js";
import { Plasmid, type Part } from "./plasmid.js";
import type { Game } from "./main.js";

/** A part copied so nothing shares an array with the original. */
function clonePart(p: Part | null): Part | null {
  if (p === null) return null;
  return p.kind === "gene" ? { ...p, mods: [...p.mods] } : { ...p };
}

export function p_save(_g: Game): void {
    if (_g.showSplash || !_g.started) return;
    // A dead strain must never be written back. `die()` deletes the slot and
    // `mobTurn` called save() on the very next line, recreating it -- so
    // permadeath was not permanent at all.
    if (_g.dead) return;
    const data = {
      version: SCHEMA,
      depth: _g.dungeon.depth,
      floor: _g.dungeon.floor,
      seed: _g.dungeon.seed,
      px: _g.player.x,
      py: _g.player.y,
      hp: _g.player.hp,
      atp: _g.player.atp,
      // Deep. `{ ...p }` copies a gene's `mods` array BY REFERENCE, so the
      // snapshot kept mutating along with the live plasmid after it was taken.
      ring: _g.genome.slots.map(clonePart),
      bin: _g.genome.bin.flatMap((p) => {
        const c = clonePart(p);
        return c === null ? [] : [c];
      }),
      heldMods: [..._g.mods],
      turn: _g.clock.turn,
      integrated: _g.genome.integrated,
      traits: [..._g.genome.traits],
      stocked: _g.dungeon.visitedLevels()
        .map((l): [number, number] => [l.floor, l.stockedAt]),
      won: _g.won,
      run: { deepest: _g.run.deepest, deaths: _g.run.deaths, killed: _g.run.killed,
             bestiary: [..._g.run.bestiary], library: [..._g.run.library] },
      settings: _g.settings,
    };
    writeSave(SAVE_KEY, data);
    // Say so ONCE if the write fails. Every turn would be unusable noise, and
    // saying nothing at all is how a whole run disappears on tab close. The
    // game keeps running either way: refusing to play is not an improvement
    // on refusing to save.
    if (saveSlot(_g.slot, _g.runName, data, _g.genome.carried().size)) {
      _g.storageWarned = false;
    } else if (!_g.storageWarned) {
      _g.storageWarned = true;
      _g.toasts.push("Cannot save — storage is full or blocked.", "error", _g.now);
      _g.note("The lab cannot write to disk. Progress this run will be lost "
        + "when the page closes. Free some space, or leave private browsing.");
      _g.trace.push(_g.clock.turn, "note", "save failed: storage");
    }
  }

export function p_applySave(_g: Game, s: SaveData): void {
    _g.dungeon = new Dungeon(96, 96, s.seed);
    _g.dungeon.floor = s.floor;
    _g.genome = new Plasmid();
    // The chromosome's SIZE first. `put` refuses positions it does not have,
    // and the saved array runs to the maximum -- so writing the ring before
    // knowing how far the chromosome was grown drops everything past the
    // base eight positions.

    _g.genome.integrated = s.integrated;
    _g.genome.setTraits(s.traits);
    // Same floor as `upkeep`: the lab's purchased start is a minimum, not a
    // starting value, or reloading a save undid what credit had bought.
    _g.genome.strain = Math.max(
      strainLevel({ catalogued: s.run.bestiary.length, deepest: s.run.deepest,
                    killed: s.run.killed }),
      _g.lab.startStrain);
    s.ring.forEach((p, i) => { _g.genome.put(i, p); });
    _g.genome.bin.length = 0;
    for (const p of s.bin) _g.genome.bin.push({ ...p });
    _g.settings = s.settings;
    _g.autoAttack = s.settings.autoAttack;
    _g.enter(_g.dungeon.current(), { x: s.px, y: s.py });
    _g.player.hp = s.hp;
    _g.player.atp = s.atp;
    _g.mods = [...s.heldMods];
    _g.clock.turn = s.turn;
    for (const [floor, at] of s.stocked) _g.dungeon.level(floor).stockedAt = at;
    _g.won = s.won;
    _g.run = {
      deepest: s.run.deepest, deaths: s.run.deaths, killed: s.run.killed,
      bestiary: [...s.run.bestiary], library: [...s.run.library],
    };
  }
