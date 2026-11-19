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
  return random;
}

export const range = (rng, min, max) => min + rng() * (max - min);
export const pick = (rng, items) => items[Math.floor(rng() * items.length)];
export const chance = (rng, probability) => rng() < probability;
