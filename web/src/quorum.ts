// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Quorum sensing: the floor notices you.
//
// Measured before writing any of this: a player standing still on F1, F8 or
// F24 took ZERO damage over three hundred turns. The column was a shooting
// gallery you picked fights in on your own terms. Sense ranges are 3-10
// tiles and mobs lose interest after ten fruitless turns (v1.41), so
// nothing ever came looking.
//
// The fix is not bigger numbers. It is CONSEQUENCE. Bacteria coordinate by
// broadcasting autoinducer and counting what comes back; above a threshold
// the population switches behaviour together. So: lysing a cell releases
// its contents, killing raises the signal, and a floor that has been fought
// on turns from indifferent to actively hunting.
//
//   calm      (< 0.25)  as now: short senses, mobs lose interest
//   roused    (< 0.55)  senses widen, disengagement slows
//   alarmed   (< 0.80)  the floor hunts; mobs no longer give up
//   swarming  (>= 0.80) senses double, and everything converges
//
// This makes a big fight a DECISION rather than free loot: clear a room and
// the rest of the floor comes to find out why.
//
// The real thing: quorum sensing was found in Vibrio fischeri, the squid
// symbiont already in this game as luxAB. Nealson and Hastings noticed in
// 1970 that a culture does not glow until it is dense -- each cell leaks a
// small autoinducer, every cell counts what comes back, and above a
// threshold the whole population switches on together. It is not a signal
// one cell sends. It is a population measuring itself.
//
// That is why the thresholds here are population-wide and why the signal
// DECAYS: an autoinducer that latched would be a switch, and the real thing
// is a running measurement that falls when the cells making it are gone.

/** How much one kill adds. */
export const KILL_SIGNAL = 0.085;

/** How much an ability cast adds -- chemistry is loud. */
export const CAST_SIGNAL = 0.03;

/** Fraction that decays each turn. Signal disperses; it does not latch. */
export const DECAY = 0.006;

export type Alarm = "calm" | "roused" | "alarmed" | "swarming";

export function levelOf(signal: number): Alarm {
  const s = Number.isFinite(signal) ? Math.min(Math.max(signal, 0), 1) : 0;
  return s >= 0.8 ? "swarming" : s >= 0.55 ? "alarmed"
    : s >= 0.25 ? "roused" : "calm";
}

/** Multiplier on every mob's sense range. */
export function senseScale(signal: number): number {
  switch (levelOf(signal)) {
    case "swarming": return 2.2;
    case "alarmed":  return 1.7;
    case "roused":   return 1.3;
    case "calm":     return 1;
  }
}

/**
 * Turns of fruitless pursuit before a mob gives up, scaled by alarm.
 *
 * At `alarmed` and above it returns Infinity: the floor does not lose
 * interest. That is the whole point -- disengagement was what made standing
 * still safe, so the stakes of a fight are that it stops being available.
 */
export function chaseLimit(signal: number, base: number): number {
  switch (levelOf(signal)) {
    case "swarming":
    case "alarmed":  return Infinity;
    case "roused":   return base * 2.5;
    case "calm":     return base;
  }
}

/** Damage multiplier: a roused population commits harder. */
export function biteScale(signal: number): number {
  switch (levelOf(signal)) {
    case "swarming": return 1.35;
    case "alarmed":  return 1.2;
    case "roused":   return 1.08;
    case "calm":     return 1;
  }
}

/**
 * What fraction of the floor follows the gradient toward the player.
 *
 * Not all of it, and this is the whole difficulty curve. Sending EVERY mob
 * at once measured at 2740 damage over three hundred turns -- death in
 * about five -- which is not tension, it is a cliff. A fraction that climbs
 * with the signal gives a ramp: a few things find you, then more, and the
 * decision of whether to keep fighting stays live the entire time.
 */
export function huntFraction(signal: number): number {
  switch (levelOf(signal)) {
    case "swarming": return 0.5;
    case "alarmed":  return 0.22;
    case "roused":   return 0.08;
    case "calm":     return 0;
  }
}

/**
 * Does THIS mob follow the gradient? Keyed on its uid so the same cells
 * respond turn after turn -- a floor where a different random half converges
 * each turn reads as noise rather than as a pack closing in.
 */
export function hunts(signal: number, uid: number): boolean {
  const f = huntFraction(signal);
  if (f <= 0) return false;
  const u = Number.isFinite(uid) ? Math.abs(Math.trunc(uid)) : 0;
  // A cheap stable hash of the uid into [0,1).
  const h = ((u * 2654435761) % 4294967296) / 4294967296;
  return h < f;
}

export function decay(signal: number): number {
  const s = Number.isFinite(signal) ? Math.min(Math.max(signal, 0), 1) : 0;
  return Math.max(s - DECAY, 0);
}

export function raise(signal: number, by: number): number {
  const s = Number.isFinite(signal) ? signal : 0;
  const b = Number.isFinite(by) ? by : 0;
  return Math.min(Math.max(s + b, 0), 1);
}

/** What the player is told when the floor crosses a threshold. */
export function crossingLine(from: Alarm, to: Alarm): string | null {
  if (from === to) return null;
  switch (to) {
    // These are the teaching surface. A player who reads all four has been
    // told what an autoinducer is, that it is counted rather than sent, and
    // that the threshold is a population measuring itself.
    case "roused":
      return "Autoinducer in the water -- leaked from what you killed. "
        + "Things are turning your way.";
    case "alarmed":
      return "The count is climbing. Every cell here is measuring how many "
        + "of itself there are, and the answer is rising.";
    case "swarming":
      return "Quorum reached. The whole population switches together -- "
        + "this is how a culture decides to glow, or to swarm.";
    case "calm":
      return "The autoinducer disperses faster than it is made. "
        + "The floor stops counting you.";
  }
}
