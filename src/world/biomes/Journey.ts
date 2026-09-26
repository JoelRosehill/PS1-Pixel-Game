import { ARCHETYPES } from './Archetypes';
import { ATLAS, variant } from './Atlas';
import type { BiomeDef, FaunaSpec, PaletteSpec, PropKind, PropSpec, TerrainSpec } from './BiomeTypes';

/**
 * The Long Road (Job 15): the forty biomes in the order the journey passes through them,
 * from Hollowmere on the western rim to the Dawnspire at the centre of the world.
 * Each leg is a stretch of road through one biome: how long it is, how wide its valley
 * opens, which supplied structures stand in it (grounded on levelled plateaus), what
 * hunts there and whether the chapter's boss waits at its end.
 */

/** A supplied model (or a colossal procedural piece) placed beside the road. */
export interface StructureSpec {
  /** ModelLibrary id, or `proc:<kind>` for a procedural piece. */
  model: string;
  /** 0..1 along the leg. */
  at: number;
  /** Metres left of the road (negative: right). */
  lateral: number;
  /** Target longest dimension (m), or `height` for the height instead. */
  size?: number;
  height?: number;
  /** Rotation (rad) added to "facing the road". */
  yaw?: number;
  /** Metres pushed into the ground (dioramas with their own ground). */
  sink?: number;
  /** Raise the levelled plateau above the local ground (a crag or a mound). */
  raise?: number;
  /** Plateau radius override (m); 0 = do not level the ground. */
  pad?: number;
  /** Collision: box = bounds, bake = sampled from the geometry, none. */
  collide?: 'box' | 'bake' | 'none';
  /** Planted like a sword: longest axis upright, tip in the ground, tilted this much. */
  planted?: number;
  /** Hover this many metres above the ground (the Sunkeepers' sun). */
  hover?: number;
  /** Glow (emissive) strength. */
  glow?: number;
  /** Only these named nodes (modular kits). */
  parts?: string[];
  /** Draw both faces (enclosed environments whose walls face inward). */
  doubleSided?: boolean;
  /** Map label. */
  name?: string;
}

export interface Leg {
  biome: BiomeDef;
  /** 1-based chapter. */
  chapter: number;
  /** Road length through this biome (m). */
  length: number;
  /** Valley half-width around the road (m). */
  width: number;
  /** Enemy level (health +16 %, damage +10 % per level above 1). */
  level: number;
  /** One side of the valley falls to the sea instead of rising to mountains. */
  sea?: 'left' | 'right';
  structures: StructureSpec[];
  /** The chapter boss waits here: arena centre as a fraction of the leg. */
  arena?: number;
}

const BY_ID = new Map<string, BiomeDef>();
for (const b of [...Object.values(ARCHETYPES), ...ATLAS.flat()]) BY_ID.set(b.id, b);
const base = (id: string): BiomeDef => {
  const b = BY_ID.get(id);
  if (!b) throw new Error(`Unknown biome ${id}`);
  return b;
};

interface Remix {
  terrain?: Partial<TerrainSpec>;
  palette?: Partial<PaletteSpec>;
  props?: Partial<Record<PropKind, Partial<PropSpec> | null>>;
  addProps?: PropSpec[];
  fauna?: Partial<FaunaSpec>;
  motes?: Partial<BiomeDef['motes']>;
  sky?: string;
  mood?: string;
}

/** A biome of the journey: an atlas biome, renamed and remixed for its place on the road. */
function biome(from: string, id: string, name: string, foes: Record<string, number>, o: Remix = {}): BiomeDef {
  const b = base(from);
  return variant(b, id, name, {
    ...o,
    // Craters were centred on the old sites; along the road they only strand it on a causeway.
    terrain: { crater: undefined, ...o.terrain },
    mood: o.mood ?? b.mood,
    landmark: b.landmark,
    fauna: { camps: 2, size: [2, 3], waves: [1, 2], ...o.fauna, foes },
  });
}

const leg = (chapter: number, b: BiomeDef, length: number, width: number, structures: StructureSpec[] = [], extra: Partial<Leg> = {}): Leg =>
  ({ biome: b, chapter, length, width, level: chapter, structures, ...extra });

const ash: Partial<PaletteSpec> = { low: 0x4a4448, mid: 0x6a6064, high: 0x3a3438, rock: 0x2a2428, accent: 0xff6a2a, shore: 0x3a3032, peak: 0x8a8088 };

export const JOURNEY: Leg[] = [
  // ─── Chapter I · The Hollow Reach ── boss: Morrow the Gravewarden ─────────────────────
  leg(1, biome('tranquil-wilderness', 'hollowmere', 'Hollowmere', { hollow: 1 }, {
    sky: 'cosmic-violet', fauna: { camps: 1, size: [1, 2], waves: [1, 1] },
    terrain: { water: 0.2 },
    mood: 'Home. What is left of it.',
  }), 520, 240, [
    { model: 'a-forest-3-with-a-road-at-night-for-game', at: 0.55, lateral: 120, size: 90, sink: 0.4, collide: 'none', name: 'The Old Road' },
    { model: 'wood-log-pile-ps1-low-poly', at: 0.12, lateral: 16, size: 5, collide: 'box' },
    { model: 'wood-log-pile-ps1-low-poly', at: 0.15, lateral: -18, size: 4.4, yaw: 1.2, collide: 'box' },
    { model: 'wood-log-pile-ps1-low-poly', at: 0.3, lateral: 22, size: 4.8, yaw: 0.4, collide: 'box' },
  ]),
  leg(1, biome('tranquil-wilderness', 'whisperpine', 'Whisperpine Wood', { hollow: 2, gnawer: 1 }, {
    sky: 'cosmic-violet',
    props: { pine: { density: 0.7, scale: [12, 26] }, flowers: { density: 0.4 } },
    mood: 'The pines whisper your name. They knew your sister.',
  }), 560, 260, [
    { model: 'the-landscape-is-a-forest-in-the-mountains', at: 0.6, lateral: -150, size: 150, sink: 1.2, collide: 'bake', name: 'Greyfang Tor' },
  ]),
  leg(1, biome('mirrorlake-shallows', 'mirrorlake', 'Mirrorlake', { hollow: 2, pilgrim: 1 }, {
    sky: 'sunlit-wilderness',
  }), 540, 360, [
    { model: 'simple-rock-ps1-low-poly', at: 0.3, lateral: 40, size: 14, collide: 'box' },
    { model: 'simple-rock-ps1-low-poly', at: 0.34, lateral: 52, size: 9, yaw: 1, collide: 'box' },
  ]),
  leg(1, biome('glimmer-meadows', 'st-aldric', 'The Graveyard of St Aldric', { hollow: 2, pilgrim: 2, stitched: 1 }, {
    sky: 'violet-marsh',
    palette: { low: 0x3a4a3a, mid: 0x4a5a44, high: 0x3a4438, accent: 0x9aa8c8 },
    props: { flowers: { density: 0.5 }, leafTree: null },
    addProps: [{ kind: 'deadTree', density: 0.05, scale: [7, 13], slopeMax: 0.4, height: [0.8, 40], far: true, tint: [0x3a3440, 0x5a5060] }],
    motes: { color: 0xc8d0ff },
    mood: 'Here they buried the Emberwardens, and here they do not rest.',
  }), 520, 260, [
    { model: 'church-psx', at: 0.5, lateral: 48, height: 26, yaw: -Math.PI / 2, collide: 'bake', name: 'Chapel of St Aldric' },
    { model: 'proc:graveyard', at: 0.5, lateral: -30, size: 34, pad: 30 },
    { model: 'proc:graveyard', at: 0.72, lateral: 34, size: 26, pad: 24 },
  ]),
  leg(1, biome('highpine-ridge', 'highpine-gate', 'Highpine Gate', { hollow: 1, shadowknight: 1, stitched: 1 }, {
    sky: 'cosmic-violet', terrain: { ridgeAmp: 30 },
  }), 620, 280, [
    { model: 'free-modular-castle-kit', at: 0.3, lateral: -95, size: 150, parts: ['PreviewOnly'], collide: 'bake', name: 'The Highpine Wall' },
  ], { arena: 0.62 }),

  // ─── Chapter II · The Violet Fen ── boss: Gloomhorn, the Drowned Shadow ────────────────
  leg(2, biome('lantern-bog', 'lantern-bog', 'Lantern Bog', { umbral: 1, hollow: 2, wasp: 1 }), 480, 300),
  leg(2, biome('violet-marshes', 'violet-marshes', 'The Violet Marshes', { umbral: 2, hollow: 1, wasp: 1 }), 520, 340, [
    { model: 'proc:obelisks', at: 0.5, lateral: 70, size: 80 },
  ]),
  leg(2, biome('drowned-chapel-fen', 'drowned-chapel-fen', 'Drowned Chapel Fen', { umbral: 1, pilgrim: 2, hollow: 1 }), 480, 300, [
    { model: 'proc:graveyard', at: 0.4, lateral: 36, size: 30, pad: 26 },
  ]),
  leg(2, biome('wisp-hollows', 'wisp-hollows', 'Wisp Hollows', { wasp: 2, umbral: 1 }), 460, 280),
  leg(2, biome('mirefall-thicket', 'drowned-circle', 'The Drowned Circle', { umbral: 2, stitched: 1 }), 560, 300, [
    { model: 'proc:obelisks', at: 0.3, lateral: -60, size: 95, name: 'The Drowned Circle' },
  ], { arena: 0.58 }),

  // ─── Chapter III · The Sunkeepers' Coast ── boss: Solenne, the Blind Sunkeeper ──────────
  leg(3, biome('sunkeepers-terrace', 'sunkeepers-terrace', "Sunkeepers' Terrace", { sunkeeper: 2, pilgrim: 1 }), 520, 300, [
    { model: 'proc:temple', at: 0.5, lateral: -70, size: 110, name: 'Temple of the Low Sun' },
  ], { sea: 'left' }),
  leg(3, biome('gilded-cascades', 'gilded-cascades', 'Gilded Cascades', { sunkeeper: 2, shadowknight: 1 }), 500, 280, [], { sea: 'left' }),
  leg(3, biome('coral-colonnade', 'coral-colonnade', 'Coral Colonnade', { sunkeeper: 1, pilgrim: 1, shadowknight: 1 }), 480, 300, [
    { model: 'proc:ruins', at: 0.45, lateral: 40, size: 100, name: 'The Coral Sanctum' },
  ], { sea: 'left' }),
  leg(3, biome('heliotrope-gardens', 'heliotrope-gardens', 'Heliotrope Gardens', { sunkeeper: 2, wasp: 1 }), 500, 300, [], { sea: 'left' }),
  leg(3, biome('drowned-agora', 'temple-of-the-sun', 'Temple of the Sun', { sunkeeper: 2, shadowknight: 1 }, { terrain: { water: 0.4 } }), 560, 300, [
    { model: 'proc:temple', at: 0.3, lateral: -80, size: 150, name: 'The Temple of the Sun' },
    { model: 'ps1-style-low-poly-sun', at: 0.3, lateral: -115, size: 70, hover: 130, glow: 2.2, collide: 'none', pad: 0, name: 'The Kept Sun' },
  ], { sea: 'left', arena: 0.62 }),

  // ─── Chapter IV · The Crystal Deep ── boss: The Glutton Below ──────────────────────────
  leg(4, biome('rimefrost-galleries', 'rimefrost-galleries', 'Rimefrost Galleries', { 'crystal-hollow': 2, gnawer: 1 }), 480, 240),
  leg(4, biome('crystal-caverns', 'crystal-caverns', 'The Crystal Caverns', { 'crystal-hollow': 2, umbral: 1 }), 500, 260, [
    { model: 'proc:crystalHall', at: 0.5, lateral: 60, size: 110, name: 'The Singing Hall' },
  ]),
  leg(4, biome('rosequartz-vault', 'rosequartz-vault', 'Rosequartz Vault', { 'crystal-hollow': 1, gnawer: 2 }), 460, 240),
  leg(4, biome('geode-chasm', 'geode-chasm', 'Geode Chasm', { 'crystal-hollow': 2, umbral: 1 }, { terrain: { crater: undefined } }), 500, 260, [
    { model: 'proc:crystalHall', at: 0.4, lateral: -70, size: 130, name: 'The Geode Heart' },
  ]),
  leg(4, biome('frozen-echo', 'frozen-echo', 'The Frozen Echo', { 'crystal-hollow': 2, gnawer: 2 }), 540, 260, [], { arena: 0.6 }),

  // ─── Chapter V · The Bloodstone Wastes ── boss: Vermilion, the Red Calamity ─────────────
  leg(5, biome('bloodstone-and-shadow', 'bloodstone', 'Bloodstone and Shadow', { wyrmling: 1, umbral: 1, stitched: 1 }), 500, 300),
  leg(5, biome('carmine-canyons', 'carmine-canyons', 'Carmine Canyons', { wyrmling: 1, stitched: 2 }, { terrain: { canyons: undefined } }), 520, 300, [
    { model: 'ps1-style-creepy-forest-environment', at: 0.5, lateral: 90, size: 70, doubleSided: true, collide: 'bake', name: 'The Crimson Pavilion' },
  ]),
  leg(5, biome('spirefield-of-night', 'spirefield-of-night', 'Spirefield of Night', { umbral: 2, 'ashen-knight': 1 }), 500, 300),
  leg(5, biome('ossuary-flats', 'ossuary-flats', 'Ossuary Flats', { wyrmling: 1, 'ashen-knight': 1, stitched: 1 }), 480, 320),
  leg(5, biome('weeping-portals', 'red-keep', 'The Red Keep', { wyrmling: 2, 'ashen-knight': 1 }), 620, 340, [
    { model: 'castle-xiii', at: 0.35, lateral: -150, size: 220, raise: 18, collide: 'bake', name: 'The Red Keep' },
  ], { arena: 0.68 }),

  // ─── Chapter VI · The Knight's March ── boss: Sir Caddoc, the Last Charge ───────────────
  leg(6, biome('ashfall-barrens', 'ashfall-barrens', 'Ashfall Barrens', { 'ashen-knight': 1, shadowknight: 1 }), 500, 300),
  leg(6, biome('obsidian-steps', 'sword-graveyard', 'The Sword Graveyard', { 'ashen-knight': 2, steed: 1 }, {
    mood: 'Where the knights of the march laid down their swords. The swords did not lie down.',
    terrain: { terraces: undefined, amplitude: 6 },
  }), 560, 320, [
    { model: 'ps1-sword-b', at: 0.25, lateral: 60, size: 150, planted: 0.18, collide: 'box', name: 'The Oathblade' },
    { model: 'ps1-ottoman-war-axe', at: 0.45, lateral: -70, size: 100, planted: -0.3, collide: 'box' },
    { model: 'ps1-style-machete', at: 0.6, lateral: 50, size: 70, planted: 0.4, collide: 'box' },
    { model: 'ps1-medieval-long-sword', at: 0.7, lateral: -45, size: 80, planted: 0.1, collide: 'box' },
    { model: 'ps1-italian-broadsword', at: 0.82, lateral: 70, size: 60, planted: -0.25, collide: 'box' },
    { model: 'ps1-scimitar', at: 0.35, lateral: -120, size: 55, planted: 0.5, collide: 'box' },
    { model: 'psx-hema-practice-sword', at: 0.9, lateral: -60, size: 50, planted: -0.15, collide: 'box' },
  ]),
  leg(6, biome('cinder-marsh', 'cinder-marsh', 'Cinder Marsh', { 'ashen-knight': 1, umbral: 1, steed: 1 }), 480, 300),
  leg(6, biome('smoulder-wood', 'smoulder-wood', 'Smoulder Wood', { shadowknight: 1, steed: 1, 'ashen-knight': 1 }), 500, 280),
  leg(6, biome('tranquil-wilderness', 'caddocs-moat', "Caddoc's Moat", { shadowknight: 2, steed: 1 }, {
    sky: 'ashen-dusk', palette: { ...ash, low: 0x4a5448, mid: 0x5a6454 },
    props: { pine: { density: 0.2, tint: [0x3a4038, 0x5a6050] }, flowers: null, leafTree: null },
    mood: 'The last knight still keeps the last castle.',
  }), 640, 420, [
    { model: 'lowpoly-castle', at: 0.3, lateral: 200, size: 300, sink: 3, collide: 'bake', name: "Caddoc's Keep" },
  ], { arena: 0.7 }),

  // ─── Chapter VII · The Dreaming Wastes ── boss: The Hive Queen ────────────────────────
  leg(7, biome('snowbound-pines', 'snowbound-pines', 'Snowbound Pines', { gnawer: 2, pilgrim: 1 }), 480, 260),
  leg(7, biome('aurora-steppe', 'obsolete-sea', 'The Obsolete Sea', { wasp: 1, sunkeeper: 1, gnawer: 1 }, {
    mood: 'Old gods of glass and plastic, washed up on a sea of snow.',
  }), 560, 380, [
    { model: 'retro-lowpoly-crt-tv', at: 0.2, lateral: 70, size: 36, yaw: 0.6, collide: 'box', name: 'The Dead Eye' },
    { model: 'ps1-style-old-keyboard', at: 0.4, lateral: -60, size: 80, yaw: 0.3, collide: 'bake' },
    { model: 'ps1-style-old-mouse', at: 0.55, lateral: 80, size: 34, yaw: 2, collide: 'box' },
    { model: 'ps1-style-low-poly-cpu', at: 0.75, lateral: -80, size: 48, yaw: -0.4, collide: 'box', name: 'The Humming Tower' },
  ]),
  leg(7, biome('aurora-steppe', 'bards-rest', "Bard's Rest", { wasp: 1, pilgrim: 1, gnawer: 1 }, {
    palette: { low: 0x9a8a6a, mid: 0xc0a878, high: 0x8a7a5a, accent: 0xffd070 },
    props: { pine: { density: 0.1 }, grass: { tint: [0xd0b880, 0xf0dca0] } },
    motes: { color: 0xffd070, rise: 0.5, density: 1.4 },
    mood: 'A song so long the singer lay down inside it.',
  }), 500, 320, [
    { model: 'classical-guitar-ps1-low-poly', at: 0.5, lateral: -70, size: 110, yaw: 1.1, collide: 'bake', name: "The Bard's Rest" },
  ]),
  leg(7, biome('heliotrope-gardens', 'humming-orchard', 'The Humming Orchard', { wasp: 3, gnawer: 1 }, {
    sky: 'aurora-night',
    props: { leafTree: { density: 0.3, tint: [0xffc0e0, 0xfff0a0] }, flowers: { density: 6 } },
    mood: 'The bees here dream, and their dreams have stings.',
  }), 500, 300, [
    { model: 'the-landscape-is-a-forest-in-the-mountains', at: 0.6, lateral: 110, size: 130, sink: 1, collide: 'bake' },
  ]),
  leg(7, biome('choir-of-ice', 'the-hive', 'The Hive', { wasp: 3, pilgrim: 1 }, { terrain: { crater: undefined } }), 560, 300, [], { arena: 0.6 }),

  // ─── Chapter VIII · The Dawnspire ── boss: Maelor, the Pale Sovereign ─────────────────
  leg(8, biome('garden-of-the-last-sun', 'garden-of-the-last-sun', 'Garden of the Last Sun', { sunkeeper: 1, shadowknight: 1, umbral: 1 }), 500, 300),
  leg(8, biome('starfall-grove', 'starfall-grove', 'Starfall Grove', { shadowknight: 1, umbral: 1, wasp: 1 }), 480, 280),
  leg(8, biome('celestine-caverns', 'pale-cathedral', 'The Pale Cathedral', { 'ashen-knight': 1, shadowknight: 1, sunkeeper: 1 }, {
    terrain: { crater: undefined },
    mood: 'Queen Liriel was crowned here. Maelor keeps it white for her.',
  }), 540, 320, [
    { model: 'the-lost-relic', at: 0.5, lateral: 90, size: 120, collide: 'bake', name: 'The Pale Cathedral' },
  ]),
  leg(8, biome('moonpetal-marsh', 'chain-road', 'The Chain Road', { shadowknight: 2, steed: 1 }), 520, 220),
  leg(8, biome('heart-of-the-moon', 'dawnspire', 'The Dawnspire', { shadowknight: 1, 'ashen-knight': 1, sunkeeper: 1 }, {
    fauna: { camps: 1 },
  }), 420, 300, [], { arena: 0.6 }),
];

/** Chapter names, in order. */
export const CHAPTER_NAMES = [
  'The Hollow Reach', 'The Violet Fen', "The Sunkeepers' Coast", 'The Crystal Deep',
  'The Bloodstone Wastes', "The Knight's March", 'The Dreaming Wastes', 'The Dawnspire',
];
