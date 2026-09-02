// Turning ATP into hp, once a turn.
//
// Split from turn.ts when that hit the 900-line ceiling `spec` enforces.
// It is its own concern for a better reason than size, though: this is the
// ONLY place ATP is spent outside metabolism, and the balance figure on the
// plasmid screen does not include it. Keeping it in one named function is what
// makes "where is my ATP going" answerable at all.

import { profileFor, repairTurn } from "./repair.js";
import type { Game } from "./main.js";

/**
 * @param gain metabolic ATP made this turn, and `cost` what expression took.
 *   Passed in rather than recomputed so the logged sum is the SAME arithmetic
 *   the player's pool actually saw, not a second opinion about it.
 */
export function upkeepRepair(
  _g: Game, d: number, gain: number, cost: number,
): void {
  // scratch on the first floor followed you to the last.
  if (_g.player.hp < _g.player.maxhp) {
    const prof = profileFor((g) => _g.genome.expression(g, d) > 0);
    const r = repairTurn(prof, _g.player.hp, _g.player.maxhp,
                         _g.player.atp, _g.player.atpMax);
    if (r.hp > 0) {
      _g.repairDebt += r.hp;
      _g.player.atp = Math.max(_g.player.atp - r.atp, 0);
      // Recorded, because it is invisible otherwise. The HUD's balance is
      // metabolic gain minus expression cost; repair is spent on top of it
      // and is often the LARGER number. A cell showing +0.1 while healing
      // with a full chaperone suite is really running at about -1.0, and
      // nothing on screen said so.
      _g.repairSpend = r.atp;
      // Recorded when the pool is falling, and only then: the whole sum, so
      // the log answers "where is it going" in one line.
      const netNow = gain - cost - r.atp;
      if (netNow < 0) {
        _g.trace.push(_g.clock.turn, "atp",
          `${_g.player.atp.toFixed(0)} left; +${gain.toFixed(1)} gain `
          + `-${cost.toFixed(1)} expression -${r.atp.toFixed(1)} repair `
          + `= ${netNow.toFixed(1)}/turn`);
      }
      // Accumulate the fraction and apply whole points, so a slow cell
      // visibly recovers instead of rounding to nothing every turn.
      const whole = Math.floor(_g.repairDebt);
      if (whole > 0) {
        _g.repairDebt -= whole;
        _g.player.hp = Math.min(_g.player.hp + whole, _g.player.maxhp);
        _g.fx.add({ kind: "text", t0: _g.now, dur: 700, x: _g.player.x,
                    y: _g.player.y, text: `+${String(whole)}`, colour: "#7fe0a4" });
      }
    }
  }
}
