// Seeded PRNG. The Lua version reached for love.math.random, which made
// generation unreproducible and coupled the logic to the engine. Injecting the
// RNG fixes both: same seed, same column, every time, on every platform.

export interface Rng {
  next(): number; // [0, 1)
  int(maxExclusive: number): number;
  pick<T>(xs: readonly T[]): T;
  fork(salt: number): Rng;
}

// mulberry32 -- 32 bits of state, ~5 lines, plenty for level generation.
export function makeRng(seed: number): Rng {
  let a = (seed >>> 0) || 1;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick<T>(xs: readonly T[]): T {
      const v = xs[Math.floor(next() * xs.length)];
      if (v === undefined) throw new Error("pick from empty array");
      return v;
    },
    fork: (salt) => makeRng((seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0),
  };
}
