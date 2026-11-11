// Ports chunk rng-DcyME7ug.js (lines 1-65).
// Index aliases: kt Rng, Tt seededRandom, Dt hashInts, Ot hash01, Et hashString.

/** Seeded generator. Returns floats in [0, 1). */
export function seededRandom(seed: number): () => number { // e (rng 1), Tt
  let s = seed >>> 0;
  return () => {
    s = (s + 1831565813) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash of integers to an unsigned 32-bit integer. */
export function hashInts(...values: number[]): number { // t (rng 13), Dt
  let h = 2166136261;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 1540483477);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** hashInts scaled to [0, 1). */
export function hash01(...values: number[]): number { // n (rng 19), Ot
  return hashInts(...values) / 4294967296;
}

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashString(str: string): number { // r (rng 22), Et
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng { // i (rng 27), kt
  f: () => number;
  constructor(seed: number) {
    this.f = seededRandom(seed);
  }
  next(): number {
    return this.f();
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.f();
  }
  /** Integer in [min, max], both ends included. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  chance(p: number): boolean {
    return this.f() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.f() * items.length)];
  }
  /** Index chosen with probability proportional to its weight. */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.f() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
  /** Approximate normal distribution (sum of four uniforms). */
  gauss(): number {
    return (this.f() + this.f() + this.f() + this.f() - 2) * 1.732;
  }
  /** Fisher-Yates shuffle in place. Returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
