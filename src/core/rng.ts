// Seeded xorshift128 PRNG + integer hashes. All procedural placement goes through these so the
// same baked data always yields the same town (no Math.random in world generation or the sim).

export interface Rng {
  u32(): number;
  float(): number;
  range(a: number, b: number): number;
  pick<T>(arr: readonly T[]): T;
}

export function makeRng(seed: number): Rng {
  let x = seed | 0 || 0x9e3779b9;
  let y = 0x243f6a88 ^ seed;
  let z = 0xb7e15162 | 0;
  let w = (0xdeadbeef + seed) | 0;
  const u32 = () => {
    const t = x ^ (x << 11);
    x = y;
    y = z;
    z = w;
    w = (w ^ (w >>> 19) ^ t ^ (t >>> 8)) | 0;
    return w >>> 0;
  };
  for (let i = 0; i < 8; i++) u32();
  const float = () => u32() / 4294967296;
  return {
    u32,
    float,
    range: (a, b) => a + (b - a) * float(),
    pick: (arr) => arr[Math.floor(float() * arr.length) % arr.length],
  };
}

// 32-bit integer hash (lowbias32).
export function hash32(n: number): number {
  n = n >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return n >>> 0;
}
export const hash01 = (n: number) => hash32(n) / 4294967296;
export const hash2 = (a: number, b: number) => hash32(Math.imul(a | 0, 0x1f1f1f1f) ^ hash32(b | 0));
