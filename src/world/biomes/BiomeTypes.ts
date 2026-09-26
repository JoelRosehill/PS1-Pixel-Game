/**
 * Biome definitions (Job 6). A biome is data: how its ground is shaped and coloured,
 * which props grow on it, what hunts there, which sky hangs over it and what it
 * feels like. The world engine blends neighbouring biomes smoothly at their borders.
 */
export type Archetype = 'wilderness' | 'marsh' | 'terrace' | 'caverns' | 'bloodstone';

export interface TerrainSpec {
  /** Mean ground elevation (m). Sea level is 0. */
  base: number;
  /** Rolling-hill amplitude (m) and frequency (cycles per metre). */
  amplitude: number;
  frequency: number;
  /** Extra mountain height from ridged noise (m), and its frequency. */
  ridgeAmp: number;
  ridgeFrequency: number;
  /** Domain warp (m): bends everything into less grid-like shapes. */
  warp: number;
  /** Lakes and pools: 0 = none, 1 = mostly water. `waterScale` is their frequency. */
  water: number;
  waterScale: number;
  /** Quantised plateaus: step height (m) and edge sharpness 0..1. */
  terraces?: { step: number; sharpness: number };
  /** A basin around the site centre (caverns): floor elevation and radius fraction of the cell. */
  crater?: { floor: number; radius: number; rim: number };
  /** Carved channels (canyons): depth below local ground, width 0..1, frequency. */
  canyons?: { floor: number; width: number; frequency: number };
}

export interface PaletteSpec {
  /** Ground colours by elevation band. */
  low: number;
  mid: number;
  high: number;
  /** Steep slopes. */
  rock: number;
  /** Near the waterline. */
  shore: number;
  /** Noise-driven patches (moss, flowers, frost, ash). */
  accent: number;
  /** Horizontal strata banding on cliffs (bloodstone), 0 = off. */
  strata?: number;
  /** Colour of the highest ground (snow, frost, gold dust). */
  peak?: number;
}

export type PropKind =
  | 'pine' | 'leafTree' | 'deadTree' | 'grass' | 'flowers' | 'reeds' | 'mushroom' | 'boulder'
  | 'crystal' | 'iceSpike' | 'column' | 'redSpire' | 'obelisk' | 'shrub' | 'bones';

export interface PropSpec {
  kind: PropKind;
  /** Instances per 100 m² where the biome fully applies. */
  density: number;
  /** Uniform scale range (for trees: height in metres). */
  scale: [number, number];
  /** Maximum slope (0 flat .. 1 vertical). */
  slopeMax?: number;
  /** Allowed ground elevation range (m). */
  height?: [number, number];
  /** Noise threshold −1..1: higher means sparser, clumped groves. */
  clump?: number;
  /** Instance colour tint range (lerped). */
  tint?: [number, number];
  /** Also drawn sparsely at long range (forests and spires read from afar). */
  far?: boolean;
}

export interface FaunaSpec {
  /** Enemy camps per km² of the biome's cell. */
  campsPerKm2: number;
  /** Relative share of each enemy kind. */
  knight: number;
  wizard: number;
  /** Enemies per wave and number of waves. */
  size: [number, number];
  waves: [number, number];
}

export type LandmarkKind =
  | 'watchtower' | 'obelisks' | 'temple' | 'crystalHall' | 'citadel'
  | 'portal' | 'ruins' | 'bones' | 'arch' | 'greatTree';

/** Which set piece stands at the heart of a biome site, and its accent colour. */
export interface LandmarkSpec {
  kind: LandmarkKind;
  color?: number;
  /** Display name on the map. */
  name?: string;
}

export interface BiomeDef {
  id: string;
  name: string;
  archetype: Archetype;
  /** Sky preset id (see SkyPresets). */
  sky: string;
  terrain: TerrainSpec;
  palette: PaletteSpec;
  props: PropSpec[];
  fauna: FaunaSpec;
  /** Ambient motes (fireflies, spores, embers, snow). */
  motes: { color: number; density: number; rise: number };
  /** One line of mood, shown under the region title. */
  mood: string;
  landmark: LandmarkSpec;
}
