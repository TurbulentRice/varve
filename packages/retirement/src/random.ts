/**
 * Seeded pseudo-randomness.
 *
 * `Math.random` cannot be seeded, which makes it unusable here for two reasons:
 * a simulation that returns different numbers every time it runs cannot be
 * tested, and a projection that shifts under the reader every time a component
 * re-renders reads as instability rather than uncertainty. Someone adjusting a
 * contribution slider needs the change they see to be *their* change.
 *
 * mulberry32: 32 bits of state, one multiply-xorshift round. Not
 * cryptographically secure and not trying to be — this seeds financial
 * simulations, not keys.
 */

export interface Rng {
  (): number;
}

/** A generator producing the same sequence for the same seed. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in `[0, bound)`. */
export function randomInt(rng: Rng, bound: number): number {
  return Math.floor(rng() * bound);
}

/**
 * Standard normal sample, via Box–Muller.
 *
 * Both values the transform produces are used, so no sample is thrown away.
 */
export function standardNormal(rng: Rng): () => number {
  let spare: number | null = null;

  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }

    // u must be non-zero: log(0) is -Infinity.
    let u = rng();
    while (u === 0) u = rng();
    const v = rng();

    const magnitude = Math.sqrt(-2 * Math.log(u));
    spare = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };
}
