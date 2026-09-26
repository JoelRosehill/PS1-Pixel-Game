import { ARCHETYPES } from './Archetypes';
import type { BiomeDef, FaunaSpec, LandmarkSpec, PaletteSpec, PropKind, PropSpec, TerrainSpec } from './BiomeTypes';

/**
 * The 40-biome atlas (Job 7): eight chapters of five biomes. Every biome is a data
 * variant of one of the five archetypes — different ground, colours, vegetation,
 * fauna, motes, sky and landmark — so the engine needs no per-biome code.
 */
interface Overrides {
  terrain?: Partial<TerrainSpec>;
  palette?: Partial<PaletteSpec>;
  /** Per-kind prop changes; `null` removes a kind. */
  props?: Partial<Record<PropKind, Partial<PropSpec> | null>>;
  /** Props added on top. */
  addProps?: PropSpec[];
  fauna?: Partial<FaunaSpec>;
  motes?: Partial<BiomeDef['motes']>;
  sky?: string;
  mood: string;
  landmark: LandmarkSpec;
}

export function variant(base: BiomeDef, id: string, name: string, o: Overrides): BiomeDef {
  const props: PropSpec[] = [];
  for (const p of base.props) {
    const change = o.props?.[p.kind];
    if (change === null) continue;
    props.push({ ...p, ...(change ?? {}) });
  }
  props.push(...(o.addProps ?? []));
  return {
    ...base,
    id, name,
    sky: o.sky ?? base.sky,
    mood: o.mood,
    landmark: o.landmark,
    terrain: { ...base.terrain, ...o.terrain },
    palette: { ...base.palette, ...o.palette },
    props,
    fauna: { ...base.fauna, ...o.fauna },
    motes: { ...base.motes, ...o.motes },
  };
}

const W = ARCHETYPES.wilderness;
const M = ARCHETYPES.marsh;
const T = ARCHETYPES.terrace;
const C = ARCHETYPES.caverns;
const B = ARCHETYPES.bloodstone;

// --- Chapter I · The Tranquil Reach ---------------------------------------------
const chapter1: BiomeDef[] = [
  W,
  variant(W, 'mirrorlake-shallows', 'Mirrorlake Shallows', {
    terrain: { water: 0.55, waterScale: 0.004, amplitude: 5, ridgeAmp: 8 },
    props: { pine: { density: 0.18 }, leafTree: { density: 0.08 } },
    addProps: [{ kind: 'reeds', density: 3, scale: [0.9, 1.6], slopeMax: 0.4, height: [-0.6, 2], tint: [0x6a8a5a, 0x9ab87a] }],
    mood: 'Every lake is a second sky.',
    landmark: { kind: 'arch', color: 0x9ad8ff, name: 'The Mirror Arch' },
  }),
  variant(W, 'emberleaf-grove', 'Emberleaf Grove', {
    palette: { low: 0x7a8a3a, mid: 0xb08a3a, high: 0x7a5a2a, accent: 0xff8a3a },
    props: {
      pine: { density: 0.06 }, leafTree: { density: 0.32, far: true, tint: [0xff7a2a, 0xffc85a] },
      grass: { tint: [0xd8b060, 0xf0d890] }, shrub: { tint: [0xc86a2a, 0xe8a04a] },
    },
    motes: { color: 0xffb05a },
    mood: 'The leaves burn without smoke, and never fall.',
    landmark: { kind: 'greatTree', color: 0xff8a3a, name: 'The Autumn Elder' },
  }),
  variant(W, 'highpine-ridge', 'Highpine Ridge', {
    terrain: { base: 16, ridgeAmp: 62, amplitude: 12, water: 0.12 },
    palette: { high: 0x5a6a5a, peak: 0xe8ecf4 },
    props: { pine: { density: 0.3, scale: [12, 26], tint: [0x7ab0a8, 0xb8d8c8] }, boulder: { density: 0.08 }, flowers: null },
    fauna: { knight: 0.75, wizard: 0.25 },
    mood: 'Old walls still hold the high passes.',
    landmark: { kind: 'ruins', color: 0xffa04a, name: 'Highpine Keep' },
  }),
  variant(W, 'glimmer-meadows', 'Glimmer Meadows', {
    terrain: { amplitude: 4, ridgeAmp: 6, water: 0.15 },
    props: { pine: { density: 0.03 }, leafTree: { density: 0.02 }, flowers: { density: 8 }, grass: { density: 34 }, shrub: { density: 0.4 } },
    motes: { density: 1.6 },
    fauna: { wizard: 0.6, knight: 0.4 },
    mood: 'Fireflies write old names in the grass.',
    landmark: { kind: 'portal', color: 0x9aff7a, name: 'The Meadow Door' },
  }),
];

// --- Chapter II · The Violet Fen -------------------------------------------------
const chapter2: BiomeDef[] = [
  M,
  variant(M, 'lantern-bog', 'Lantern Bog', {
    terrain: { water: 0.6 },
    props: { mushroom: { density: 0.6, scale: [0.8, 4], tint: [0x9aff5a, 0xffd36a] } },
    motes: { color: 0xd0ff7a },
    mood: 'A thousand small lights, and none of them warm.',
    landmark: { kind: 'greatTree', color: 0x5affc8, name: 'The Lantern Mother' },
  }),
  variant(M, 'drowned-chapel-fen', 'Drowned Chapel Fen', {
    terrain: { water: 0.66 },
    props: { deadTree: { density: 0.12 }, obelisk: { density: 0.006 } },
    addProps: [{ kind: 'bones', density: 0.02, scale: [1, 1.6], slopeMax: 0.3, height: [0, 4] }],
    fauna: { knight: 0.7, wizard: 0.3 },
    mood: 'The bells still ring under the water.',
    landmark: { kind: 'ruins', color: 0xb07cff, name: 'The Drowned Chapel' },
  }),
  variant(M, 'wisp-hollows', 'Wisp Hollows', {
    palette: { accent: 0xff7ae0, low: 0x3a2448 },
    props: { reeds: { density: 7 } },
    motes: { color: 0xff7ae0, density: 2 },
    mood: 'Follow a light here and it follows you home.',
    landmark: { kind: 'portal', color: 0xff7ae0, name: 'The Wisp Gate' },
  }),
  variant(M, 'mirefall-thicket', 'Mirefall Thicket', {
    terrain: { water: 0.4, amplitude: 2 },
    palette: { low: 0x221a30, mid: 0x2e2a40 },
    props: { deadTree: { density: 0.25 }, shrub: { density: 0.3 } },
    mood: 'Something enormous lay down here to die.',
    landmark: { kind: 'bones', color: 0x5affc8, name: 'The Sunken Colossus' },
  }),
];

// --- Chapter III · The Sunkeepers' Coast ---------------------------------------
const chapter3: BiomeDef[] = [
  T,
  variant(T, 'gilded-cascades', 'Gilded Cascades', {
    terrain: { amplitude: 18, water: 0.5, terraces: { step: 2, sharpness: 0.8 } },
    palette: { accent: 0xffd36a, high: 0xf0e0b0 },
    motes: { density: 1.3 },
    fauna: { wizard: 0.8, knight: 0.2 },
    mood: 'Water falls from step to golden step, forever.',
    landmark: { kind: 'arch', color: 0xffd36a, name: 'The Sun Aqueduct' },
  }),
  variant(T, 'coral-colonnade', 'Coral Colonnade', {
    palette: { low: 0xd89a8a, mid: 0xe8b0a0, accent: 0xff7a9a },
    terrain: { water: 0.5 },
    props: { column: { density: 0.06 } },
    mood: 'Pink stone, pink water, pink light. Only the shadows are honest.',
    landmark: { kind: 'temple', color: 0xff9ad8, name: 'The Coral Sanctum' },
  }),
  variant(T, 'heliotrope-gardens', 'Heliotrope Gardens', {
    props: { flowers: { density: 7 }, leafTree: { density: 0.1, tint: [0xb07aff, 0xff9ad8] }, shrub: { density: 0.35, tint: [0x8a70c0, 0xc8a0e0] } },
    fauna: { wizard: 0.8, knight: 0.2 },
    mood: 'Every flower here turns to face the setting sun.',
    landmark: { kind: 'greatTree', color: 0xd08aff, name: 'The Heliotrope' },
  }),
  variant(T, 'drowned-agora', 'The Drowned Agora', {
    terrain: { base: 3, water: 0.66 },
    props: { column: { density: 0.04, height: [-1.5, 20] } },
    mood: 'They held their councils here until the sea joined in.',
    landmark: { kind: 'ruins', color: 0xffd36a, name: 'The Agora of Tides' },
  }),
];

// --- Chapter IV · The Crystal Deep -----------------------------------------------
const chapter4: BiomeDef[] = [
  C,
  variant(C, 'rimefrost-galleries', 'Rimefrost Galleries', {
    palette: { low: 0xd8f0ff, accent: 0x7ae0ff },
    props: { iceSpike: { density: 0.35 }, crystal: { density: 0.05, tint: [0x7ae0ff, 0xc8f4ff] } },
    mood: 'The frost here grows like coral, and listens.',
    landmark: { kind: 'crystalHall', color: 0x7ae0ff, name: 'The Rime Gallery' },
  }),
  variant(C, 'rosequartz-vault', 'Rosequartz Vault', {
    palette: { low: 0xf0c8e0, accent: 0xff7ae0, mid: 0x7a5a88 },
    props: { crystal: { density: 0.2, tint: [0xff7ae0, 0xffc0f0] } },
    motes: { color: 0xffc0f0 },
    mood: 'A heart of rose quartz beats somewhere below.',
    landmark: { kind: 'crystalHall', color: 0xff9ae0, name: 'The Rose Vault' },
  }),
  variant(C, 'geode-chasm', 'Geode Chasm', {
    terrain: { crater: { floor: 2, radius: 0.72, rim: 24 } },
    props: { crystal: { density: 0.16, tint: [0xa87aff, 0x7affc8] } },
    mood: 'The world is hollow here, and full of teeth.',
    landmark: { kind: 'crystalHall', color: 0xa87aff, name: 'The Geode Heart' },
  }),
  variant(C, 'frozen-echo', 'The Frozen Echo', {
    terrain: { base: 30, amplitude: 18, ridgeAmp: 30, crater: undefined },
    palette: { low: 0xe0ecf8, mid: 0xb8c8d8, high: 0x8898b0 },
    props: { crystal: { density: 0.03 }, iceSpike: { density: 0.1 }, bones: { density: 0.03 } },
    fauna: { knight: 0.8, wizard: 0.2 },
    mood: 'Shout, and the mountain answers in a stranger’s voice.',
    landmark: { kind: 'bones', color: 0xa8e8ff, name: 'The Frozen Colossus' },
  }),
];

// --- Chapter V · The Bloodstone Wastes -------------------------------------------
const chapter5: BiomeDef[] = [
  B,
  variant(B, 'carmine-canyons', 'Carmine Canyons', {
    terrain: { canyons: { floor: 2, width: 0.2, frequency: 0.0022 }, ridgeAmp: 20 },
    palette: { low: 0x6a1a1a, mid: 0x9a2a1a, strata: 0.5 },
    props: { redSpire: { density: 0.03 } },
    mood: 'The canyons were carved by something that bled.',
    landmark: { kind: 'arch', color: 0xff3a3a, name: 'The Carmine Arch' },
  }),
  variant(B, 'spirefield-of-night', 'Spirefield of Night', {
    props: { redSpire: { density: 0.06, scale: [14, 44] } },
    terrain: { ridgeAmp: 40 },
    palette: { mid: 0x5a1a24, high: 0x3a0a18 },
    fauna: { knight: 0.8, wizard: 0.2 },
    mood: 'A forest of stone knives, pointing at the moon.',
    landmark: { kind: 'citadel', color: 0xff2a44, name: 'The Needle Keep' },
  }),
  variant(B, 'ossuary-flats', 'Ossuary Flats', {
    terrain: { base: 20, amplitude: 4, canyons: undefined, ridgeAmp: 12 },
    props: { bones: { density: 0.08 }, redSpire: { density: 0.006 } },
    fauna: { knight: 0.8, wizard: 0.2, size: [2, 4] },
    mood: 'Here the dead outnumber the stones.',
    landmark: { kind: 'bones', color: 0xff2a44, name: 'The Great Ossuary' },
  }),
  variant(B, 'weeping-portals', 'The Weeping Portals', {
    props: { obelisk: { density: 0.012 } },
    fauna: { wizard: 0.5, knight: 0.5 },
    mood: 'The doors weep red when the moon is full.',
    landmark: { kind: 'portal', color: 0xff2a44, name: 'The Weeping Door' },
  }),
];

// --- Chapter VI · The Ashen March (expansion) --------------------------------------
const ash: Partial<PaletteSpec> = { low: 0x4a4448, mid: 0x6a6064, high: 0x3a3438, rock: 0x2a2428, accent: 0xff6a2a, shore: 0x3a3032, peak: 0x8a8088 };
const chapter6: BiomeDef[] = [
  variant(B, 'ashfall-barrens', 'Ashfall Barrens', {
    sky: 'ashen-dusk', palette: { ...ash, strata: 0.2 },
    props: { redSpire: { tint: [0x3a3438, 0x5a5054] } },
    motes: { color: 0xff8a4a, density: 1.4 },
    mood: 'It has been snowing ash since the last king burned.',
    landmark: { kind: 'ruins', color: 0xff6a2a, name: 'The Cinder Throne' },
  }),
  variant(M, 'cinder-marsh', 'Cinder Marsh', {
    sky: 'ashen-dusk', palette: ash,
    props: { mushroom: { tint: [0xff6a2a, 0xffb05a] }, reeds: { tint: [0x4a4040, 0x6a5a50] }, deadTree: { tint: [0x1a1418, 0x3a3034] } },
    motes: { color: 0xff6a2a },
    mood: 'The water is warm, and it should not be.',
    landmark: { kind: 'obelisks', color: 0xff6a2a, name: 'The Ember Circle' },
  }),
  variant(T, 'obsidian-steps', 'Obsidian Steps', {
    sky: 'ashen-dusk', palette: { low: 0x2a2430, mid: 0x3a3440, high: 0x1a1420, rock: 0x14101a, shore: 0x4a4048, accent: 0xff6a2a },
    props: { leafTree: null, flowers: null, grass: { tint: [0x4a4a3a, 0x6a6048] } },
    motes: { color: 0xff8a4a },
    mood: 'Glass stairs, cooled from a burning sea.',
    landmark: { kind: 'temple', color: 0xff6a2a, name: 'The Obsidian Altar' },
  }),
  variant(W, 'smoulder-wood', 'Smoulder Wood', {
    sky: 'ashen-dusk', palette: ash,
    props: { pine: { tint: [0x2a2828, 0x4a3a30] }, leafTree: null, flowers: null, grass: { density: 8, tint: [0x5a5040, 0x7a6a50] } },
    motes: { color: 0xff6a2a, rise: 0.8 },
    fauna: { knight: 0.7, wizard: 0.3 },
    mood: 'The trees still glow at night, from the inside.',
    landmark: { kind: 'greatTree', color: 0xff5a1a, name: 'The Burning Elder' },
  }),
  variant(C, 'emberdeep', 'Emberdeep', {
    sky: 'ashen-dusk', palette: { low: 0x3a2a2a, mid: 0x4a3a3a, accent: 0xff5a2a, peak: 0x6a5050 },
    props: { crystal: { tint: [0xff5a2a, 0xffb05a] }, iceSpike: { tint: [0x5a4040, 0x8a6050] } },
    motes: { color: 0xff6a2a, rise: 0.6 },
    mood: 'The deep stones are still cooling.',
    landmark: { kind: 'crystalHall', color: 0xff5a2a, name: 'The Ember Hall' },
  }),
];

// --- Chapter VII · The Frozen Choir (expansion) -------------------------------------
const snow: Partial<PaletteSpec> = { low: 0xd8e4f0, mid: 0xc8d8e8, high: 0xe8f0ff, rock: 0x8898b0, shore: 0xa8c8d8, accent: 0x7affc8, peak: 0xffffff };
const chapter7: BiomeDef[] = [
  variant(C, 'choir-of-ice', 'The Choir of Ice', {
    sky: 'aurora-night',
    palette: { low: 0xc8e8ff, mid: 0x6a88a8, accent: 0x7affc8 },
    props: { crystal: { tint: [0x7affc8, 0x9ad8ff] } },
    motes: { color: 0xe8f4ff, density: 1.8, rise: -0.5 },
    mood: 'The ice sings when the wind is right. It is always right.',
    landmark: { kind: 'crystalHall', color: 0x7ae0ff, name: 'The Choir Hall' },
  }),
  variant(W, 'snowbound-pines', 'Snowbound Pines', {
    sky: 'aurora-night', palette: snow,
    props: { pine: { tint: [0x8ab0b8, 0xd8e8f0] }, leafTree: null, flowers: null, grass: { density: 6, tint: [0xc8d8e0, 0xe8f0f8] } },
    motes: { color: 0xe8f4ff, rise: -0.5, density: 1.4 },
    fauna: { knight: 0.7, wizard: 0.3 },
    mood: 'Snow on the pines, and footprints that end.',
    landmark: { kind: 'watchtower', color: 0xffa04a, name: 'The Last Lamp' },
  }),
  variant(M, 'frostmere', 'Frostmere', {
    sky: 'aurora-night', palette: { ...snow, low: 0x9ab0c8 },
    props: { reeds: { tint: [0xa8b8c8, 0xd8e0e8] }, mushroom: { tint: [0x7ae0ff, 0xc8f4ff] }, deadTree: { tint: [0x6a7888, 0x9aa8b8] } },
    motes: { color: 0xc8f4ff, rise: -0.3 },
    mood: 'The mere froze mid-wave, and kept its drowned.',
    landmark: { kind: 'obelisks', color: 0x8ae8ff, name: 'The Frozen Circle' },
  }),
  variant(T, 'glacier-terraces', 'Glacier Terraces', {
    sky: 'aurora-night', palette: { ...snow, mid: 0xb8d0e0 },
    props: { leafTree: { tint: [0xa8d8f0, 0xe0f4ff] }, flowers: null },
    motes: { color: 0xe8f4ff, rise: -0.4 },
    mood: 'The Sunkeepers built here too, before the sun forgot them.',
    landmark: { kind: 'temple', color: 0x8ae8ff, name: 'The Frost Temple' },
  }),
  variant(W, 'aurora-steppe', 'Aurora Steppe', {
    sky: 'aurora-night', terrain: { amplitude: 3, ridgeAmp: 8, water: 0.1 },
    palette: { ...snow, low: 0xa8b8a8, mid: 0xc8d0c0 },
    props: { pine: { density: 0.04 }, leafTree: null, grass: { density: 18, tint: [0xa8b8a0, 0xd0d8c8] }, flowers: null },
    motes: { color: 0x7affc8, rise: 0.2 },
    mood: 'Under the aurora, even the wolves stop to look up.',
    landmark: { kind: 'bones', color: 0x7affc8, name: 'The Sky-Whale' },
  }),
];

// --- Chapter VIII · The Last Garden (expansion) --------------------------------------
const chapter8: BiomeDef[] = [
  variant(T, 'garden-of-the-last-sun', 'Garden of the Last Sun', {
    sky: 'celestial-garden',
    props: { flowers: { density: 8 }, leafTree: { density: 0.12, tint: [0xffe8a0, 0xffc0e0] } },
    motes: { color: 0xffe8a0, density: 1.4 },
    fauna: { wizard: 0.6, knight: 0.4, size: [2, 4] },
    mood: 'The last garden, kept by the last gardener.',
    landmark: { kind: 'temple', color: 0xffe8a0, name: 'The Last Temple' },
  }),
  variant(W, 'starfall-grove', 'Starfall Grove', {
    sky: 'celestial-garden',
    palette: { low: 0x4a5a8a, mid: 0x6a7ab0, high: 0x3a4a7a, accent: 0xffe8a0 },
    props: { pine: { density: 0.12, tint: [0x7a8ac8, 0xa8b8f0] }, leafTree: { density: 0.18, tint: [0x9a7aff, 0xd8b0ff] } },
    motes: { color: 0xffe8a0, density: 1.6 },
    mood: 'Stars fell here, and grew roots.',
    landmark: { kind: 'greatTree', color: 0xd8b0ff, name: 'The Star-Rooted' },
  }),
  variant(M, 'moonpetal-marsh', 'Moonpetal Marsh', {
    sky: 'celestial-garden',
    palette: { low: 0x3a3a6a, mid: 0x5a5a8a, accent: 0xfff0c0 },
    props: { mushroom: { tint: [0xfff0c0, 0xffffff] } },
    motes: { color: 0xfff0c0 },
    mood: 'The petals open only for the moon.',
    landmark: { kind: 'portal', color: 0xfff0c0, name: 'The Moon Door' },
  }),
  variant(C, 'celestine-caverns', 'Celestine Caverns', {
    sky: 'celestial-garden',
    palette: { low: 0xe8e0c0, accent: 0xffd36a },
    props: { crystal: { tint: [0xffd36a, 0xffffff] } },
    motes: { color: 0xffe8a0, rise: 0.3 },
    mood: 'Gold grows in the dark, where no one can spend it.',
    landmark: { kind: 'crystalHall', color: 0xffd36a, name: 'The Celestine Hall' },
  }),
  variant(B, 'heart-of-the-moon', 'The Heart of the Moon', {
    sky: 'celestial-garden',
    palette: { low: 0x8a8898, mid: 0xb8b4c8, high: 0x6a6878, rock: 0x4a4858, accent: 0xfff0f0, shore: 0x5a5868, peak: 0xffffff, strata: 0.15 },
    props: { redSpire: { tint: [0xc8c4d8, 0xf0ecff] }, deadTree: { tint: [0x8a8898, 0xb8b4c8] } },
    motes: { color: 0xfff0f0, rise: 0.4 },
    fauna: { knight: 0.6, wizard: 0.4, size: [2, 4], waves: [2, 3] },
    mood: 'The moon came down to rest here, and never left.',
    landmark: { kind: 'citadel', color: 0xfff0f0, name: 'The Pale Citadel' },
  }),
];

export const ATLAS: BiomeDef[][] = [chapter1, chapter2, chapter3, chapter4, chapter5, chapter6, chapter7, chapter8];
