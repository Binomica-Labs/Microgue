// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The water: what it looks like right now.
//
// Four things the game KNEW but never SHOWED, all of them "what colour is the
// water here": the time of day, the run's condition, and what the player's
// own strain is doing to its surroundings. They were HUD text and stat
// multipliers. This turns them into one tint pass over the visible world,
// so a night is dark, an anoxic column is oppressive, and a phototroph
// carries its own daylight.
//
// Cheap: at most four full-window fills and one radial gradient per frame,
// all clipped to the fog window. Reduce-motion keeps the tints (they are
// information) but stills the pulse on the glow.

import type { Condition } from "./conditions.js";
import type { Phenotype } from "./phenotype.js";

export interface WaterTint {
  /** A full-window colour with alpha, or null for none. */
  fill: string | null;
}

/** The day cycle. Night pulls the water toward deep blue-black; dusk and
 *  dawn warm it. `light` is daylight() 0..1. */
export function dayTint(light: number, depth: number): string | null {
  if (!Number.isFinite(light)) return null;
  // The deep column barely sees the sun: the tint fades with depth.
  const reach = Math.max(0, 1 - depth / 6);
  if (reach <= 0) return null;
  const dark = (1 - light) * 0.42 * reach;      // night: up to 42% at the surface
  if (dark < 0.02) return null;
  return `rgba(4,8,22,${dark.toFixed(3)})`;
}

/** The run condition, as weather. Neutral returns null. */
export function conditionTint(c: Condition, now: number, still: boolean): string | null {
  const pulse = still ? 0 : Math.sin(now / 2600) * 0.02;
  switch (c.id) {
    case "bloom":            return `rgba(90,200,80,${(0.09 + pulse).toFixed(3)})`;
    case "coldSnap":         return `rgba(150,200,255,${(0.10 + pulse).toFixed(3)})`;
    case "sulfideUpwelling": return `rgba(220,190,60,${(0.09 + pulse).toFixed(3)})`;
    case "anoxic":           return `rgba(30,10,20,${(0.22 + pulse).toFixed(3)})`;
    case "ironRich":         return `rgba(200,80,40,${(0.10 + pulse).toFixed(3)})`;
    case "oligotrophic":     return `rgba(200,220,240,${(0.06 + pulse).toFixed(3)})`;
    case "none":             return null;
  }
}

/** The strain's own effect on the water around it: a radius, a colour, an
 *  alpha. Null for a strain that does nothing visible. */
export function strainAura(
  ph: Phenotype, now: number, still: boolean,
): { r: number; colour: string; alpha: number } | null {
  if (!Number.isFinite(now)) now = 0;
  const pulse = still ? 1 : 1 + Math.sin(now / 900) * 0.06;
  if (ph.light > 0.15) {
    // A phototroph: warm daylight, reaching farther the more it expresses.
    return { r: (2.2 + ph.light * 2.5) * pulse, colour: "255,240,180",
             alpha: 0.05 + ph.light * 0.12 };
  }
  if (ph.stain > 0.15) {
    // A sulfide venter: a yellow-green stain, tighter and dirtier.
    return { r: (1.6 + ph.stain * 1.6) * pulse, colour: "190,200,60",
             alpha: 0.06 + ph.stain * 0.10 };
  }
  return null;
}
