// mulberry32: deterministic procedural layout for seeds and screenshot URLs.
export function createRng(seed = 1) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  random.range = (min, max) => min + random() * (max - min);
  random.pick = (items) => items[Math.floor(random() * items.length)];
  random.chance = (probability) => random() < probability;
  random.state = () => state;
  return random;
}

export const range = (rng, min, max) => min + rng() * (max - min);
export const pick = (rng, items) => items[Math.floor(rng() * items.length)];
export const chance = (rng, probability) => rng() < probability;

/** Stable string hashing keeps named shot variants reproducible across reloads. */
export function hashSeed(value) {
  const source = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Convert URL seed text into the same unsigned seed in every browser. */
export function parseSeed(value, fallback = 613) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback >>> 0;
  return parsed >>> 0;
}

export function seededFloat(seed, index) {
  const random = createRng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  return random();
}
