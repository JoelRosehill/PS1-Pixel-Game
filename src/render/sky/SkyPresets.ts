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
];

export function getSkyPreset(id: string): SkyPreset {
  return SKY_PRESETS.find((p) => p.id === id) ?? SKY_PRESETS[0];
}
