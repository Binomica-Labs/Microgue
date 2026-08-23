// Day and night.
//
// A Winogradsky column sits on a windowsill. Its phototrophs run on a diel
// cycle, and when the light goes the oxygen goes with it -- oxygenic
// photosynthesis stops while respiration does not, so the oxic zone thins and
// the chemocline RISES overnight. This is a real, measured phenomenon; the
// Beggiatoa mat migrates up and down with it.
//
// Two consequences here, both direct:
//   * light-dependent genes stop paying at night
//   * the upper layers go dark, so you see less exactly where you saw most

export const TURNS_PER_DAY = 220;

export interface Clock { turn: number; }

export const newClock = (): Clock => ({ turn: 0 });

/** Position in the cycle, 0 at dawn through 1. */
export const phaseOf = (c: Clock): number => {
  const t = Number.isFinite(c.turn) ? c.turn : 0;
  return ((t % TURNS_PER_DAY) + TURNS_PER_DAY) % TURNS_PER_DAY / TURNS_PER_DAY;
};

/** Incident light, 0 at night to 1 at midday. A smooth day with a flat night
 *  rather than a sine, because a column indoors gets a window's worth of light
 *  and then nothing. */
export function daylight(c: Clock): number {
  const p = phaseOf(c);
  if (p < 0.08 || p > 0.72) return 0;                 // night
  const t = (p - 0.08) / (0.72 - 0.08);
  return Math.sin(t * Math.PI);
}

export const isNight = (c: Clock): boolean => daylight(c) <= 0.02;

export function timeName(c: Clock): string {
  const p = phaseOf(c);
  if (p < 0.08) return "before dawn";
  if (p < 0.24) return "morning";
  if (p < 0.44) return "midday";
  if (p < 0.62) return "afternoon";
  if (p < 0.72) return "dusk";
  return "night";
}

/**
 * Light actually reaching a stratum. The column's own attenuation, times
 * whatever the window is giving. Below the photic zone this is already zero,
 * so night changes nothing down there -- which is the point: the deep column
 * has no day.
 */
export const lightAt = (baseLight: number, c: Clock): number =>
  baseLight * daylight(c);

/** How far the chemocline shifts. Oxygen production stops at night while
 *  consumption does not, so the oxic/anoxic boundary rises. */
export const chemoclineShift = (c: Clock): number => (isNight(c) ? -1 : 0);
