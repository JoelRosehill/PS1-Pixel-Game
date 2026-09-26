import type { Archetype, BiomeDef } from './BiomeTypes';

/**
 * The five required biome archetypes (Pillar 4), fully built in Job 6. Each anchors a
 * chapter; Job 7 derives the other biomes of the atlas from these as data variants.
 */
export const ARCHETYPES: Record<Archetype, BiomeDef> = {
  wilderness: {
    id: 'tranquil-wilderness',
    name: 'Tranquil Wilderness',
    archetype: 'wilderness',
    landmark: { kind: 'watchtower', color: 0xffa04a, name: 'Wayward Watchtower' },
    sky: 'sunlit-wilderness',
    mood: 'Pine and still water. Here the world still remembers peace.',
    terrain: {
      base: 5, amplitude: 9, frequency: 0.004, ridgeAmp: 20, ridgeFrequency: 0.0022,
      warp: 60, water: 0.34, waterScale: 0.0024,
    },
    palette: {
      low: 0x3f8a3a, mid: 0x78aa3c, high: 0x4f7a44, rock: 0x6a6474, shore: 0x7a7050,
      accent: 0xd8e070, peak: 0xd8d4ec,
    },
    props: [
      { kind: 'pine', density: 0.42, scale: [9, 21], slopeMax: 0.4, height: [0.8, 80], clump: -0.12, tint: [0x9ad0a8, 0xd8f0b0], far: true },
      { kind: 'leafTree', density: 0.05, scale: [6, 11], slopeMax: 0.35, height: [0.8, 40], clump: 0.1, tint: [0x7ac860, 0xc8e070] },
      { kind: 'grass', density: 28, scale: [0.35, 0.75], slopeMax: 0.45, height: [0.8, 60], clump: -0.3, tint: [0xa8d890, 0xe0f0b0] },
      { kind: 'flowers', density: 1.6, scale: [0.9, 1.6], slopeMax: 0.3, height: [0.8, 40], clump: 0.35 },
      { kind: 'shrub', density: 0.25, scale: [0.8, 1.6], slopeMax: 0.5, height: [0.6, 60], tint: [0x6aa860, 0xa8d070] },
      { kind: 'boulder', density: 0.035, scale: [0.8, 2.6], height: [-3, 90] },
    ],
    fauna: { campsPerKm2: 1.3, knight: 0.6, wizard: 0.4, size: [1, 3], waves: [1, 2] },
    motes: { color: 0xfff0a0, density: 1, rise: 0.15 },
  },

  marsh: {
    id: 'violet-marshes',
    name: 'Violet Marshes',
    archetype: 'marsh',
    landmark: { kind: 'obelisks', color: 0x5affc8, name: 'The Drowned Circle' },
    sky: 'violet-marsh',
    mood: 'The water glows where the dead once walked.',
    terrain: {
      base: 0.55, amplitude: 1.3, frequency: 0.012, ridgeAmp: 4, ridgeFrequency: 0.004,
      warp: 40, water: 0.52, waterScale: 0.011,
    },
    palette: {
      low: 0x2e2448, mid: 0x3c3a5e, high: 0x4a4a3a, rock: 0x3a3048, shore: 0x1e3a3a,
      accent: 0x5affc8, peak: 0x6a5a8a,
    },
    props: [
      { kind: 'reeds', density: 5, scale: [0.9, 1.8], slopeMax: 0.4, height: [-0.6, 2.5], clump: -0.2, tint: [0x4a6a5a, 0x8aa87a] },
      { kind: 'mushroom', density: 0.22, scale: [0.6, 2.8], slopeMax: 0.4, height: [0.1, 6], clump: 0.1, tint: [0x5affc8, 0xd05aff] },
      { kind: 'deadTree', density: 0.07, scale: [6, 14], slopeMax: 0.4, height: [-0.4, 8], clump: 0, tint: [0x3a3048, 0x5a4a6a], far: true },
      { kind: 'grass', density: 8, scale: [0.3, 0.6], slopeMax: 0.4, height: [0.2, 6], clump: -0.1, tint: [0x6a7a9a, 0x9aa8c8] },
      { kind: 'obelisk', density: 0.003, scale: [6, 12], slopeMax: 0.3, height: [-0.5, 6], far: true },
      { kind: 'shrub', density: 0.1, scale: [0.6, 1.2], slopeMax: 0.4, height: [0.2, 6], tint: [0x3a4a6a, 0x5a6a8a] },
    ],
    fauna: { campsPerKm2: 1.5, knight: 0.5, wizard: 0.5, size: [2, 3], waves: [1, 2] },
    motes: { color: 0x5affc8, density: 1.6, rise: 0.25 },
  },

  terrace: {
    id: 'sunkeepers-terrace',
    name: "Sunkeeper's Terrace",
    archetype: 'terrace',
    landmark: { kind: 'temple', color: 0xffd36a, name: 'Temple of the Low Sun' },
    sky: 'sunkeeper-dusk',
    mood: 'Marble steps descend into water the colour of dawn.',
    terrain: {
      base: 7, amplitude: 11, frequency: 0.0032, ridgeAmp: 10, ridgeFrequency: 0.003,
      warp: 30, water: 0.44, waterScale: 0.0032,
      terraces: { step: 2, sharpness: 0.72 },
    },
    palette: {
      low: 0x86b46a, mid: 0xa8c080, high: 0xe8dcc0, rock: 0xd8ccb8, shore: 0xf0e0b0,
      accent: 0xff9ad8, peak: 0xfff0d0,
    },
    props: [
      { kind: 'column', density: 0.025, scale: [3, 7], slopeMax: 0.2, height: [0.5, 40], clump: 0.2 },
      { kind: 'leafTree', density: 0.05, scale: [5, 9], slopeMax: 0.3, height: [0.8, 40], clump: 0.15, tint: [0xff9ad8, 0xffd0e8], far: true },
      { kind: 'grass', density: 12, scale: [0.3, 0.6], slopeMax: 0.3, height: [0.8, 40], clump: 0, tint: [0xb8e0a0, 0xe8f0c0] },
      { kind: 'flowers', density: 3, scale: [0.9, 1.5], slopeMax: 0.3, height: [0.8, 40], clump: 0.2 },
      { kind: 'shrub', density: 0.18, scale: [0.7, 1.3], slopeMax: 0.3, height: [0.6, 40], tint: [0x7ab070, 0xb8d890] },
      { kind: 'boulder', density: 0.015, scale: [0.8, 1.8], height: [-3, 40] },
    ],
    fauna: { campsPerKm2: 1.4, knight: 0.3, wizard: 0.7, size: [2, 3], waves: [1, 2] },
    motes: { color: 0xffd36a, density: 0.8, rise: 0.35 },
  },

  caverns: {
    id: 'crystal-caverns',
    name: 'Crystal Caverns',
    archetype: 'caverns',
    landmark: { kind: 'crystalHall', color: 0xff7ae0, name: 'The Singing Hall' },
    sky: 'crystal-cavern',
    mood: 'Beneath the stone, the cold sings in pink and blue.',
    terrain: {
      base: 40, amplitude: 12, frequency: 0.004, ridgeAmp: 42, ridgeFrequency: 0.003,
      warp: 50, water: 0, waterScale: 0.003,
      crater: { floor: 6, radius: 0.62, rim: 16 },
    },
    palette: {
      low: 0xbfe4f0, mid: 0x5a6a88, high: 0x3a3a58, rock: 0x2a2a44, shore: 0x9ad8e8,
      accent: 0xff7ae0, peak: 0xe8f4ff,
    },
    props: [
      { kind: 'crystal', density: 0.11, scale: [1.5, 6.5], slopeMax: 0.55, height: [2, 70], clump: -0.1, tint: [0xff7ae0, 0x7ae0ff], far: true },
      { kind: 'iceSpike', density: 0.16, scale: [2, 9], slopeMax: 0.5, height: [2, 80], clump: -0.2, tint: [0xa8d8f0, 0xe8f8ff] },
      { kind: 'boulder', density: 0.05, scale: [0.8, 2.6], height: [0, 90] },
      { kind: 'bones', density: 0.01, scale: [1, 1.6], slopeMax: 0.3, height: [2, 30] },
    ],
    fauna: { campsPerKm2: 1.3, knight: 0.6, wizard: 0.4, size: [2, 3], waves: [1, 2] },
    motes: { color: 0xd8f4ff, density: 1.3, rise: -0.45 },
  },

  bloodstone: {
    id: 'bloodstone-and-shadow',
    name: 'Bloodstone & Shadow',
    archetype: 'bloodstone',
    landmark: { kind: 'citadel', color: 0xff2a44, name: 'Citadel of the Red Hour' },
    sky: 'blood-moon',
    mood: 'Red canyons, black spires, and doors that should stay shut.',
    terrain: {
      base: 34, amplitude: 8, frequency: 0.003, ridgeAmp: 30, ridgeFrequency: 0.004,
      warp: 70, water: 0, waterScale: 0.003,
      canyons: { floor: 3, width: 0.13, frequency: 0.0026 },
    },
    palette: {
      low: 0x5a1a1a, mid: 0x8a2a24, high: 0x6a1a2a, rock: 0x4a1418, shore: 0x3a1010,
      accent: 0x1a0a10, strata: 0.35, peak: 0x2a0a14,
    },
    props: [
      { kind: 'redSpire', density: 0.018, scale: [10, 34], slopeMax: 0.5, height: [2, 90], clump: 0, tint: [0x7a2020, 0xa83a2a], far: true },
      { kind: 'deadTree', density: 0.035, scale: [5, 11], slopeMax: 0.4, height: [2, 70], tint: [0x1a0a10, 0x3a1a1a] },
      { kind: 'boulder', density: 0.05, scale: [0.8, 2.8], height: [0, 90] },
      { kind: 'bones', density: 0.02, scale: [1, 1.8], slopeMax: 0.3, height: [1, 60] },
      { kind: 'obelisk', density: 0.004, scale: [7, 14], slopeMax: 0.3, height: [2, 60], far: true },
    ],
    fauna: { campsPerKm2: 1.6, knight: 0.7, wizard: 0.3, size: [2, 3], waves: [1, 2] },
    motes: { color: 0xff6a3a, density: 1.2, rise: 0.8 },
  },
};
