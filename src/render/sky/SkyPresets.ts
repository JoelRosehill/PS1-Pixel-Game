/**
 * Sky presets drive the whole mood of a biome: sky, fog, scene lighting and water tint.
 * Directions use azimuth (0° = -Z / north, 90° = +X / east) and elevation in degrees.
 * Colours are sRGB hex (converted to linear at load).
 */
export interface SkyPreset {
  id: string;
  name: string;
  zenith: number;
  midSky: number;
  horizon: number;
  ground: number;
  moon: {
    azimuth: number;
    elevation: number;
    radius: number;
    color: number;
    shadow: number;
    glowColor: number;
    glow: number;
  };
  sun: { azimuth: number; elevation: number; size: number; color: number; glow: number };
  nebula: { a: number; b: number; c: number; strength: number };
  stars: number;
  clouds: { color: number; lit: number; cover: number };
  /** Height fog: density at sea level, thinning by e every `falloff` metres of altitude. */
  fog: { density: number; start: number; max: number; falloff: number };
  /** Key light comes from the moon or the sun. */
  keyLight: { from: 'moon' | 'sun'; color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  water: { deep: number; shallow: number; glow: number; glowStrength: number };
  exposure: number;
}

export const SKY_PRESETS: SkyPreset[] = [
  {
    id: 'cosmic-violet',
    name: 'Cosmic Violet',
    zenith: 0x0a0622,
    midSky: 0x2c1156,
    horizon: 0x6a3288,
    ground: 0x160b24,
    moon: { azimuth: 4, elevation: 22, radius: 10, color: 0xff5468, shadow: 0x9a1834, glowColor: 0xff3a64, glow: 0.5 },
    sun: { azimuth: 0, elevation: -60, size: 0, color: 0x000000, glow: 0 },
    nebula: { a: 0x6a2ad8, b: 0xff4aa8, c: 0x3affa0, strength: 1.0 },
    stars: 1.0,
    clouds: { color: 0x3a1a6c, lit: 0xa060e0, cover: 0.42 },
    fog: { density: 0.0028, start: 20, max: 0.9, falloff: 55 },
    keyLight: { from: 'moon', color: 0xd8a8ff, intensity: 2.0 },
    hemi: { sky: 0x8a66d8, ground: 0x24382e, intensity: 1.35 },
    water: { deep: 0x0a4a58, shallow: 0x28d8c8, glow: 0x7ffff0, glowStrength: 1.2 },
    exposure: 1.2,
  },
  {
    id: 'blood-moon',
    name: 'Crimson Vigil',
    zenith: 0x10030a,
    midSky: 0x3c0818,
    horizon: 0x8e1c2c,
    ground: 0x1c0608,
    moon: { azimuth: 4, elevation: 19, radius: 11, color: 0xff3848, shadow: 0x7a0a1e, glowColor: 0xff2040, glow: 0.6 },
    sun: { azimuth: 0, elevation: -60, size: 0, color: 0x000000, glow: 0 },
    nebula: { a: 0x5a0a2c, b: 0xb0183c, c: 0xff7040, strength: 0.4 },
    stars: 0.55,
    clouds: { color: 0x2c0a16, lit: 0x8a1c2e, cover: 0.38 },
    fog: { density: 0.0032, start: 18, max: 0.9, falloff: 48 },
    keyLight: { from: 'moon', color: 0xff7080, intensity: 1.8 },
    hemi: { sky: 0x7a2c4c, ground: 0x1c0a10, intensity: 1.15 },
    water: { deep: 0x3a0612, shallow: 0xc0203a, glow: 0xff5a6a, glowStrength: 0.9 },
    exposure: 1.1,
  },
  {
    id: 'sunlit-wilderness',
    name: 'Sunlit Wilderness',
    zenith: 0x2e6cd0,
    midSky: 0x74aae6,
    horizon: 0xd4e6e2,
    ground: 0x587866,
    moon: { azimuth: -70, elevation: 34, radius: 3.5, color: 0xece6f4, shadow: 0xb8b0d0, glowColor: 0xffffff, glow: 0 },
    sun: { azimuth: 18, elevation: 24, size: 2.6, color: 0xfff0cc, glow: 0.9 },
    nebula: { a: 0, b: 0, c: 0, strength: 0 },
    stars: 0,
    clouds: { color: 0xb8cce8, lit: 0xffffff, cover: 0.46 },
    fog: { density: 0.0022, start: 30, max: 0.88, falloff: 80 },
    keyLight: { from: 'sun', color: 0xfff0d6, intensity: 2.9 },
    hemi: { sky: 0xa8d0ff, ground: 0x4a6a3a, intensity: 1.45 },
    water: { deep: 0x0c3c8c, shallow: 0x3a8ae8, glow: 0xaef0ff, glowStrength: 0.5 },
    exposure: 1.0,
  },
  {
    id: 'verdigris-mist',
    name: 'Verdigris Mist',
    zenith: 0x183a40,
    midSky: 0x487a78,
    horizon: 0x9cc4bc,
    ground: 0x2a4a48,
    moon: { azimuth: 26, elevation: 24, radius: 7, color: 0xe4f4ec, shadow: 0x90b0a8, glowColor: 0xc0ffe8, glow: 0.5 },
    sun: { azimuth: 0, elevation: -60, size: 0, color: 0x000000, glow: 0 },
    nebula: { a: 0x2a6a6a, b: 0x6ab0a0, c: 0xc0ffe0, strength: 0.15 },
    stars: 0.15,
    clouds: { color: 0x5a8a88, lit: 0xc4e4dc, cover: 0.6 },
    fog: { density: 0.009, start: 8, max: 0.95, falloff: 32 },
    keyLight: { from: 'moon', color: 0xc8f0e0, intensity: 1.3 },
    hemi: { sky: 0x9ad0c8, ground: 0x2a3a38, intensity: 1.35 },
    water: { deep: 0x0e3a3c, shallow: 0x4aa8a0, glow: 0xb0fff0, glowStrength: 0.7 },
    exposure: 1.0,
  },
  // --- Job 6 biome moods (not on the 1–4 debug keys) -------------------------
  {
    id: 'violet-marsh',
    name: 'Violet Marshes',
    zenith: 0x0c0626,
    midSky: 0x2a0f4a,
    horizon: 0x5a2a78,
    ground: 0x120a1c,
    moon: { azimuth: -30, elevation: 28, radius: 8, color: 0xe8c8ff, shadow: 0x7a58a8, glowColor: 0xb07cff, glow: 0.55 },
    sun: { azimuth: 0, elevation: -60, size: 0, color: 0x000000, glow: 0 },
    nebula: { a: 0x3a1a8c, b: 0x2affb0, c: 0xd05aff, strength: 1.1 },
    stars: 0.9,
    clouds: { color: 0x2a1450, lit: 0x7a4ab0, cover: 0.5 },
    fog: { density: 0.0055, start: 12, max: 0.92, falloff: 26 },
    keyLight: { from: 'moon', color: 0xc8a0ff, intensity: 1.6 },
    hemi: { sky: 0x7a5ad0, ground: 0x1a3a2e, intensity: 1.4 },
    water: { deep: 0x1a0a3a, shallow: 0x3a2a8a, glow: 0x5affc8, glowStrength: 1.6 },
    exposure: 1.2,
  },
  {
    id: 'sunkeeper-dusk',
    name: "Sunkeeper's Dusk",
    zenith: 0x1c2a6a,
    midSky: 0x7a4a9a,
    horizon: 0xffa878,
    ground: 0x5a3a4a,
    moon: { azimuth: 150, elevation: 40, radius: 4, color: 0xf4e8ff, shadow: 0xb0a0d0, glowColor: 0xffffff, glow: 0.1 },
    sun: { azimuth: 250, elevation: 9, size: 4.2, color: 0xffd08a, glow: 1.3 },
    nebula: { a: 0x6a3aa8, b: 0xff7aa8, c: 0xffd070, strength: 0.25 },
    stars: 0.25,
    clouds: { color: 0x8a5a8a, lit: 0xffc890, cover: 0.44 },
    fog: { density: 0.0026, start: 24, max: 0.86, falloff: 70 },
    keyLight: { from: 'sun', color: 0xffc890, intensity: 2.6 },
    hemi: { sky: 0xb08ad0, ground: 0x5a4a3a, intensity: 1.35 },
    water: { deep: 0x0a4a7a, shallow: 0x2ae0d0, glow: 0xff9ad8, glowStrength: 1.1 },
    exposure: 1.05,
  },
  {
    id: 'crystal-cavern',
    name: 'Crystal Caverns',
    zenith: 0x02040c,
    midSky: 0x081a2a,
    horizon: 0x1a4a5a,
    ground: 0x06121a,
    moon: { azimuth: 40, elevation: 60, radius: 3, color: 0xc8f4ff, shadow: 0x6a9ab0, glowColor: 0x8ae8ff, glow: 0.2 },
    sun: { azimuth: 0, elevation: -60, size: 0, color: 0x000000, glow: 0 },
    nebula: { a: 0x1a4a8a, b: 0xff5ad0, c: 0x5ae8ff, strength: 0.45 },
    stars: 0.35,
    clouds: { color: 0x0a2030, lit: 0x3a8aa0, cover: 0.3 },
    fog: { density: 0.0075, start: 10, max: 0.94, falloff: 40 },
    keyLight: { from: 'moon', color: 0x9ad8ff, intensity: 1.1 },
    hemi: { sky: 0x5ab8d8, ground: 0x3a1a4a, intensity: 1.5 },
    water: { deep: 0x0a2a3a, shallow: 0x8ae8ff, glow: 0xd8ffff, glowStrength: 1.3 },
    exposure: 1.25,
  },
  // --- Job 7 expansion chapters --------------------------------------------------
  {
    id: 'ashen-dusk',
    name: 'Ashen Dusk',
    zenith: 0x1a1216,
    midSky: 0x4a2a26,
    horizon: 0xb85a3a,
    ground: 0x2a1a1a,
    moon: { azimuth: 60, elevation: 30, radius: 5, color: 0xffc8a0, shadow: 0x8a5a4a, glowColor: 0xff8a5a, glow: 0.3 },
    sun: { azimuth: 200, elevation: 5, size: 5, color: 0xff6a3a, glow: 1.1 },
    nebula: { a: 0x4a1a1a, b: 0xb84a2a, c: 0xff8a3a, strength: 0.3 },
    stars: 0.15,
    clouds: { color: 0x3a2a2a, lit: 0xd87a4a, cover: 0.62 },
    fog: { density: 0.0048, start: 14, max: 0.93, falloff: 40 },
    keyLight: { from: 'sun', color: 0xff9a6a, intensity: 2.1 },
    hemi: { sky: 0x8a5a4a, ground: 0x2a1a1a, intensity: 1.2 },
    water: { deep: 0x2a0a0a, shallow: 0x8a3a1a, glow: 0xff8a3a, glowStrength: 1.2 },
    exposure: 1.1,
  },
  {
    id: 'aurora-night',
    name: 'Aurora Night',
    zenith: 0x040a1c,
    midSky: 0x0e2240,
    horizon: 0x2a5a78,
    ground: 0x0a1420,
    moon: { azimuth: -20, elevation: 35, radius: 6, color: 0xe8f4ff, shadow: 0x8aa0b8, glowColor: 0xc8e8ff, glow: 0.4 },
    sun: { azimuth: 0, elevation: -60, size: 0, color: 0x000000, glow: 0 },
    nebula: { a: 0x1aff9a, b: 0x7a4aff, c: 0x3ae8ff, strength: 1.3 },
    stars: 1.1,
    clouds: { color: 0x10203a, lit: 0x5a9ac8, cover: 0.3 },
    fog: { density: 0.0035, start: 18, max: 0.9, falloff: 50 },
    keyLight: { from: 'moon', color: 0xc8e8ff, intensity: 1.7 },
    hemi: { sky: 0x7aa8d8, ground: 0x2a3a4a, intensity: 1.45 },
    water: { deep: 0x0a1a2a, shallow: 0x6ab0d0, glow: 0xa8ffe8, glowStrength: 0.9 },
    exposure: 1.2,
  },
  {
    id: 'celestial-garden',
    name: 'Celestial Garden',
    zenith: 0x120a30,
    midSky: 0x3a2a6a,
    horizon: 0xc8a0c8,
    ground: 0x2a2040,
    moon: { azimuth: 10, elevation: 26, radius: 16, color: 0xfff4e8, shadow: 0xb8a8c8, glowColor: 0xfff0d8, glow: 0.6 },
    sun: { azimuth: 0, elevation: -60, size: 0, color: 0x000000, glow: 0 },
    nebula: { a: 0x5a3aa8, b: 0xffd36a, c: 0xff9ad8, strength: 0.9 },
    stars: 1.2,
    clouds: { color: 0x3a2a5a, lit: 0xffe0b0, cover: 0.35 },
    fog: { density: 0.0028, start: 22, max: 0.88, falloff: 60 },
    keyLight: { from: 'moon', color: 0xfff0d8, intensity: 2.2 },
    hemi: { sky: 0xb0a0e0, ground: 0x3a3050, intensity: 1.45 },
    water: { deep: 0x1a1a4a, shallow: 0x8a8ae8, glow: 0xfff0c0, glowStrength: 1.2 },
    exposure: 1.1,
  },
];

/** Presets bound to the 1–4 debug keys (the biome moods are reached by walking). */
export const DEBUG_PRESETS = SKY_PRESETS.slice(0, 4);

export function getSkyPreset(id: string): SkyPreset {
  return SKY_PRESETS.find((p) => p.id === id) ?? SKY_PRESETS[0];
}
