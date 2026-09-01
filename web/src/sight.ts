// Perception: what the cell can see, and what is worth stopping for.
//
// Split from turn.ts when that hit the 900-line ceiling `spec` enforces. The
// boundary is real: turn.ts is what happens because time passed, and this is
// what the cell NOTICES -- which is a different question and the one that
// decides whether auto-explore keeps going.
//
// The rule both functions share: a THREAT is something that pursues, or
// something already close enough to strike. A drifting alga with no attack is
// neither, and halting for one made auto-explore useless on the first
// stratum, where five of the six organisms are exactly that.

import { computeFov, isVisible, sightRadius } from "./fov.js";
import { lightAt } from "./cycle.js";
import { distanceTo } from "./pursuit.js";
import type { Mob } from "./dungeon.js";
import type { Game } from "./main.js";

export function t_look(_g: Game): void {
    const s = _g.level.sight;
    // Bioluminescence is its own light source, and luciferase needs O2 -- so
    // the glow only helps in the oxic zone, which is where you least need it.
    const glow = _g.genome.expression("luxAB", _g.dungeon.depth) > 0 ? 2 : 0;
    const lit = lightAt(_g.level.stratum.light, _g.clock);
    computeFov(s, _g.level.grid, _g.player.x, _g.player.y,
               sightRadius(lit) + glow);

    // Keyed on the INSTANCE. Keying on species-plus-position re-fired every
    // time a microbe took a step, which is once per turn, for ever.
    const nowVisible = new Set<number>();
    const arrivals: Mob[] = [];
    for (const mob of _g.level.mobs) {
      if (!mob.alive || !isVisible(s, mob.x, mob.y)) continue;
      nowVisible.add(mob.uid);
      if (!_g.spotted.has(mob.uid)) arrivals.push(mob);
    }
    // Leaving sight is what re-arms the alert, so a thing pacing in and out of
    // a doorway does not shout on every step.
    for (const uid of [..._g.spotted]) if (!nowVisible.has(uid)) _g.spotted.delete(uid);
    for (const mob of arrivals) _g.spotted.add(mob.uid);

    // Only a THREAT stops you. The same rule as t_visibleHostile, and for the
    // same reason: the oxic column is mostly drifting algae with no attack,
    // and halting for each one made auto-explore useless on the first stratum.
    const reach = _g.genome.reach(_g.dungeon.depth);
    const threats = arrivals.filter((m) => m.atk > 0
      && (m.behaviour === "chase" || m.behaviour === "wire"
          || m.behaviour === "swarm" || distanceTo(_g.player, m) <= reach + 1));

    if (threats.length > 0 && (_g.walk || _g.exploring)) {
      // Total stop. Clearing only the walk left `exploring` set, so the next
      // tick immediately picked a new frontier and walked on past the thing
      // that had just appeared.
      _g.walk = null;
      _g.exploring = false;
      _g.strikeAfterTravel = null;
      const btn = _g.buttons.find((b) => b.id === "explore");
      if (btn) btn.active = false;
      _g.path = null;
      const names = [...new Set(threats.map((a) => a.name))];
      const what = names.length === 1
        ? `a ${names[0] ?? ""}`
        : `${String(threats.length)} things`;
      _g.note(`You stop. ${what.charAt(0).toUpperCase()}${what.slice(1)} comes into view.`);
      _g.toasts.push(`${what} in view.`, "warn", _g.now);
    }
  }

/**
 * A visible thing that can actually hurt you.
 *
 * This used to return ANY living mob in sight, despite the name -- so
 * auto-explore halted for a drifting Chlorella. The oxic column is five
 * drifters to one predator, so the first stratum was close to unplayable: it
 * stopped every few tiles, and said "comes into view" about a creature already
 * off the edge of the screen, because field of view reaches further than the
 * camera does.
 *
 * A threat is something that will CLOSE ON YOU, or something already within
 * reach. Not "something harmless": every organism in the game has an attack --
 * Chlorella's is 1, and it will use it if you swim into it. The distinction is
 * whether it comes to you, which is the only thing that makes stopping worth
 * it. The `atk` check is a guard for content that does not exist yet rather
 * than a filter on anything present.
 */
export function t_visibleHostile(_g: Game): Mob | null {
  const reach = _g.genome.reach(_g.dungeon.depth);
  for (const m of _g.level.mobs) {
    if (!m.alive || !isVisible(_g.level.sight, m.x, m.y)) continue;
    if (m.atk <= 0) continue;                    // cannot hurt you at all
    // Something that comes after you is worth stopping for wherever it is.
    if (m.behaviour === "chase" || m.behaviour === "wire"
        || m.behaviour === "swarm") return m;
    // Anything else only matters if it is already close enough to strike.
    if (distanceTo(_g.player, m) <= reach + 1) return m;
  }
  return null;
}