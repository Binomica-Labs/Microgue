// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The daily column.
//
// Every run rolled its own seed, so no two players ever descended the same
// column and there was nothing to compare. A date-derived seed gives
// everyone the same column for a day: the same layout, the same condition,
// the same organisms in the same rooms. It costs one function and it is the
// cheapest replayability in the game.
//
// Deliberately NOT a leaderboard -- there is no server and no account. It is
// a shared object to talk about, and a reason to run today's column rather
// than a random one.

/** The day, as YYYYMMDD in UTC so everyone gets the same column at once. */
export function dayNumber(at: Date = new Date()): number {
  const t = at.getTime();
  if (!Number.isFinite(t)) return 20260101;
  return at.getUTCFullYear() * 10000 + (at.getUTCMonth() + 1) * 100
    + at.getUTCDate();
}

/**
 * The seed for a given day. Hashed rather than used raw: consecutive days
 * would otherwise give near-identical columns, since the generator's low
 * bits drive the early layout.
 */
export function dailySeed(day: number = dayNumber()): number {
  const d = Number.isFinite(day) ? Math.floor(day) : 20260101;
  let h = d >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  // A 16-bit mask was tried here, on a guess that the game's other seeds are
  // all small. It reintroduced the exact clustering the hash exists to
  // prevent -- four of 28 consecutive day-pairs landed within 1000 of each
  // other -- and did not fix the problem it was aimed at. A fix for an
  // unconfirmed cause is a guess, and this one cost a real property.
  return (h ^ (h >>> 16)) >>> 0;
}

/** A human label, for the menu and the report. */
export function dailyLabel(day: number = dayNumber()): string {
  const d = Number.isFinite(day) ? Math.floor(day) : 20260101;
  const y = Math.floor(d / 10000);
  const m = Math.floor((d % 10000) / 100);
  const dd = d % 100;
  const pad = (n: number): string => (n < 10 ? `0${String(n)}` : String(n));
  return `${String(y)}-${pad(m)}-${pad(dd)}`;
}
