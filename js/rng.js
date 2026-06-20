// rng.js — deterministic seeded randomness + small math/color helpers.
//
// The whole premise of Wordseed: the same word must ALWAYS grow the same
// plant. A normal Math.random() can't do that — it's different every call.
// So we hash the word into a number, then feed that number into a tiny,
// fast pseudo-random generator (PRNG) whose entire sequence is determined
// by that one seed. Same word -> same seed -> same sequence -> same plant.

// xmur3: string -> 32-bit hash. Stretches a word into well-mixed bits so
// that "ash" and "ashy" land far apart instead of next to each other.
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

// mulberry32: seed -> a function returning floats in [0,1). Fast, tiny,
// good enough distribution for visuals. This is the actual random tap.
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One call gives a fresh RNG bound to a word. `salt` lets us draw several
// INDEPENDENT but still-deterministic streams from the same word (e.g. one
// stream for the plant body, another for its poem) without them interfering.
export function seededRng(word, salt = '') {
  const key = (String(word).toLowerCase().trim() || 'seed') + salt;
  return mulberry32(xmur3(key)());
}

// ---- small numeric helpers used everywhere ----
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Pick helpers that consume the seeded stream, so picks stay deterministic.
export const rangeFrom = (rng) => (a, b) => a + (b - a) * rng();
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---- HSL color helpers (we author plants in HSL — easy to shift hue/light) ----
export const hslStr = (o) => `hsl(${o.h},${o.s}%,${o.l}%)`;
export const hsla = (o, a) => `hsla(${o.h},${o.s}%,${o.l}%,${a})`;
export const lerpHSL = (a, b, t) => ({
  h: a.h + (b.h - a.h) * t,
  s: a.s + (b.s - a.s) * t,
  l: a.l + (b.l - a.l) * t,
});
export const shiftHue = (o, d) => ({ h: ((o.h + d) % 360 + 360) % 360, s: o.s, l: o.l });
