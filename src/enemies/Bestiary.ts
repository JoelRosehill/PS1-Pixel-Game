import type { CreatureId } from '../assets/Creatures';
import type { OrbKind } from './EnemyProjectiles';
import type { PerceptionSpec } from './Perception';

/**
 * The Bestiary (Job 14): every regular foe of the Long Road as data, animated by the
 * user's creature models (see tools/creatures). Tuned the Elden Ring way — ordinary foes
 * are fair but punish carelessness (a normal blow takes 12–25 % of starting Vigour),
 * read clearly (each attack has a wind-up you can learn), and have poise: light blows
 * don't interrupt a committed swing, heavy ones do.
 *
 * Difficulty climbs along the road: `CreatureEnemy` scales health and damage by the
 * chapter an encounter belongs to.
 */

export type FoeId = 'hollow' | 'stitched' | 'shadowknight' | 'sunkeeper' | 'umbral' | 'gnawer' | 'wasp' | 'steed' | 'wyrmling' |
  'pilgrim' | 'crystal-hollow' | 'ashen-knight';

/** How an attack connects. Angles are radians relative to facing (+ = its left). */
export type AttackShape =
  /** A blade or claw sweeping from `from` to `to` at `height`, `reach` long. */
  | { kind: 'arc'; from: number; to: number; reach: number; height: number; pitchFrom?: number; pitchTo?: number; width?: number }
  /** Everything within `radius` of a point `offset` ahead, the moment it lands (slams). */
  | { kind: 'circle'; offset: number; radius: number; shockwave?: number }
  /** The body drives forward at `speed`; contact within `reach` of the chest hits once. */
  | { kind: 'lunge'; speed: number; reach: number }
  /** Orbs from the mouth/grip at the player. */
  | { kind: 'projectile'; count: number; spread: number; speed: number; homing: number; orb: OrbKind; size: number }
  /** Telegraphed strikes falling on the player's position (and ahead of it). */
  | { kind: 'volley'; count: number; radius: number; delay: number; spread: number }
  /** A cone of fire or frost breathed for the whole active window. */
  | { kind: 'breath'; range: number; halfAngle: number; tick: number }
  /** Vanish and reappear at a distance (casters keeping range). */
  | { kind: 'blink'; distance: number };

export interface AttackSpec {
  id: string;
  /** Animation clip; stretched so its hit event lands at the end of `windup`. */
  clip: string;
  /** Distance band where the attack is chosen. */
  range: [number, number];
  weight: number;
  cooldown: number;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  knockback: number;
  /** Stagger the player suffers. */
  stagger: number;
  shape: AttackShape;
  /** Turn rate during the wind-up (rad/s): trackers are hard to side-step. */
  track?: number;
  /** Forward drive during the wind-up (m/s): steps into the swing. */
  step?: number;
  /** Chains into this attack with `chain` probability when the player is still close. */
  next?: string;
  chain?: number;
  /** Glows and a ground marker during the wind-up. */
  telegraph?: number;
  /** Ranged attacks take the ranged token pool. */
  ranged?: boolean;
  /** Hyper armour: light blows cannot interrupt this attack. */
  armour?: boolean;
}

export interface FoeSpec {
  id: FoeId;
  name: string;
  creature: CreatureId;
  height: number;
  radius: number;
  bodyHeight: number;
  tint?: number;
  emissive?: number;
  emissiveIntensity?: number;
  health: number;
  /** Poise: the stagger damage it absorbs before being broken. */
  poise: number;
  mass: number;
  walk: number;
  run: number;
  /** Seconds between attacks (lower = more aggressive). */
  aggression: number;
  /** Preferred fighting distance. */
  keep: number;
  perception: PerceptionSpec;
  attacks: AttackSpec[];
  /** Frontal blows while guarding deal this fraction (shield/sword guards). */
  guard?: number;
  /** Hovers this high above the ground. */
  fly?: number;
  /** Weapon model held in grip.R: library id, length in metres. */
  weapon?: { model: string; length: number };
  fxColor: number;
  /** Health and damage multipliers for elite variants. */
  elite?: boolean;
}

const A = (a: AttackSpec) => a;
const eyes = { sight: 28, fov: 1.1, hearing: 8, gain: 1.6, forget: 8 };

export const BESTIARY: Record<FoeId, FoeSpec> = {
  // --- Chapter I–II: the hollowed pale ones ------------------------------------------------
  hollow: {
    id: 'hollow', name: 'Pale Hollow', creature: 'pale', height: 2.05, radius: 0.45, bodyHeight: 2, health: 150, poise: 45, mass: 1,
    walk: 2.6, run: 6.2, aggression: 1.3, keep: 3, perception: eyes, fxColor: 0xffe0c8,
    attacks: [
      A({ id: 'slash', clip: 'attack_slash', range: [0, 3.2], weight: 3, cooldown: 0, windup: 0.5, active: 0.18, recovery: 0.55,
        damage: 14, knockback: 5, stagger: 0.3, shape: { kind: 'arc', from: 1.3, to: -1.3, reach: 2.6, height: 1.3 }, track: 5, step: 1.5,
        next: 'backslash', chain: 0.55 }),
      A({ id: 'backslash', clip: 'attack_backslash', range: [0, 3.2], weight: 1, cooldown: 0, windup: 0.36, active: 0.18, recovery: 0.7,
        damage: 14, knockback: 5, stagger: 0.3, shape: { kind: 'arc', from: -1.3, to: 1.3, reach: 2.6, height: 1.2 }, track: 4, step: 1.5 }),
      A({ id: 'leap', clip: 'attack_leap', range: [4, 9], weight: 2, cooldown: 4, windup: 0.75, active: 0.3, recovery: 0.9,
        damage: 20, knockback: 8, stagger: 0.5, shape: { kind: 'lunge', speed: 13, reach: 1.9 }, track: 3, telegraph: 0xffe0c8 }),
    ],
  },
  'crystal-hollow': {
    id: 'crystal-hollow', name: 'Crystal Hollow', creature: 'pale', height: 2.2, radius: 0.48, bodyHeight: 2.1, health: 230, poise: 70, mass: 1.3,
    tint: 0xb0e0ff, emissive: 0x5aa0ff, emissiveIntensity: 0.8, walk: 2.4, run: 5.6, aggression: 1.2, keep: 3, perception: eyes, fxColor: 0x9ad8ff,
    elite: true,
    attacks: [
      A({ id: 'slash', clip: 'attack_slash', range: [0, 3.3], weight: 3, cooldown: 0, windup: 0.55, active: 0.18, recovery: 0.55,
        damage: 18, knockback: 6, stagger: 0.35, shape: { kind: 'arc', from: 1.3, to: -1.3, reach: 2.8, height: 1.3 }, track: 5, step: 1.5,
        next: 'backslash', chain: 0.6 }),
      A({ id: 'backslash', clip: 'attack_backslash', range: [0, 3.3], weight: 1, cooldown: 0, windup: 0.4, active: 0.18, recovery: 0.7,
        damage: 18, knockback: 6, stagger: 0.35, shape: { kind: 'arc', from: -1.3, to: 1.3, reach: 2.8, height: 1.2 }, track: 4 }),
      A({ id: 'shards', clip: 'cast', range: [5, 16], weight: 2, cooldown: 5, windup: 0.8, active: 0.2, recovery: 0.8, damage: 14,
        knockback: 4, stagger: 0.2, ranged: true, telegraph: 0x9ad8ff,
        shape: { kind: 'projectile', count: 3, spread: 0.25, speed: 20, homing: 0.4, orb: 'moon', size: 0.8 } }),
    ],
  },
  pilgrim: {
    id: 'pilgrim', name: 'Lost Pilgrim', creature: 'wanderer', height: 1.9, radius: 0.42, bodyHeight: 1.9, health: 110, poise: 30, mass: 0.9,
    tint: 0x9a8c7a, walk: 2.2, run: 5.4, aggression: 1.6, keep: 3, perception: eyes, fxColor: 0xd8c8a0,
    weapon: { model: 'psx-sickle', length: 0.9 },
    attacks: [
      A({ id: 'hack', clip: 'attack_slash', range: [0, 2.8], weight: 3, cooldown: 0, windup: 0.55, active: 0.16, recovery: 0.6,
        damage: 12, knockback: 4, stagger: 0.25, shape: { kind: 'arc', from: 1.2, to: -1.2, reach: 2.2, height: 1.2 }, track: 5, step: 1,
        next: 'hack2', chain: 0.4 }),
      A({ id: 'hack2', clip: 'attack_backslash', range: [0, 2.8], weight: 0, cooldown: 0, windup: 0.4, active: 0.16, recovery: 0.8,
        damage: 12, knockback: 4, stagger: 0.25, shape: { kind: 'arc', from: -1.2, to: 1.2, reach: 2.2, height: 1.1 }, track: 4 }),
      A({ id: 'thrust', clip: 'attack_thrust', range: [2.5, 5], weight: 1, cooldown: 3, windup: 0.6, active: 0.25, recovery: 0.8,
        damage: 15, knockback: 5, stagger: 0.3, shape: { kind: 'lunge', speed: 9, reach: 1.7 }, track: 3 }),
    ],
  },

  // --- the brutes -------------------------------------------------------------------------
  stitched: {
    id: 'stitched', name: 'Stitched Brute', creature: 'nemesis', height: 2.5, radius: 0.6, bodyHeight: 2.5, health: 300, poise: 110, mass: 2.6,
    walk: 2, run: 4.6, aggression: 1.7, keep: 3.2, perception: { ...eyes, sight: 24 }, fxColor: 0xff8a5a,
    weapon: { model: 'ps1-style-machete', length: 1.3 },
    attacks: [
      A({ id: 'overhead', clip: 'attack_overhead', range: [0, 3.6], weight: 2, cooldown: 0, windup: 0.95, active: 0.16, recovery: 1.0,
        damage: 26, knockback: 9, stagger: 0.55, shape: { kind: 'circle', offset: 2.2, radius: 1.8, shockwave: 7 }, track: 3, armour: true,
        telegraph: 0xff8a5a }),
      A({ id: 'sweep', clip: 'attack_sweep', range: [0, 3.4], weight: 2, cooldown: 0, windup: 0.7, active: 0.22, recovery: 0.8,
        damage: 20, knockback: 8, stagger: 0.45, shape: { kind: 'arc', from: 1.6, to: -1.6, reach: 3, height: 0.7 }, track: 4, armour: true }),
      A({ id: 'charge', clip: 'run', range: [5, 12], weight: 1, cooldown: 6, windup: 0.8, active: 0.9, recovery: 1.2,
        damage: 24, knockback: 12, stagger: 0.6, shape: { kind: 'lunge', speed: 11, reach: 2 }, track: 2, armour: true, telegraph: 0xff8a5a }),
    ],
  },
  shadowknight: {
    id: 'shadowknight', name: 'Shadow Knight', creature: 'nemesis', height: 2.35, radius: 0.55, bodyHeight: 2.35, health: 240, poise: 100,
    mass: 2.2, tint: 0x6a6484, emissive: 0x8a4aff, emissiveIntensity: 0.9, walk: 2.4, run: 4.6, aggression: 1.4, keep: 3.4,
    perception: { ...eyes, sight: 30 }, guard: 0.2, fxColor: 0xb07cff,
    weapon: { model: 'ps1-medieval-long-sword', length: 1.9 },
    attacks: [
      A({ id: 'cleave', clip: 'attack_slash', range: [0, 3.4], weight: 3, cooldown: 0, windup: 0.6, active: 0.18, recovery: 0.6,
        damage: 18, knockback: 6, stagger: 0.35, shape: { kind: 'arc', from: 1.35, to: -1.35, reach: 3, height: 1.35 }, track: 5, step: 2,
        next: 'backhand', chain: 0.5 }),
      A({ id: 'backhand', clip: 'attack_backslash', range: [0, 3.4], weight: 0, cooldown: 0, windup: 0.4, active: 0.18, recovery: 0.8,
        damage: 16, knockback: 6, stagger: 0.3, shape: { kind: 'arc', from: -1.35, to: 1.35, reach: 3, height: 1.2 }, track: 4, step: 2 }),
      A({ id: 'doom', clip: 'attack_overhead', range: [0, 3.6], weight: 1.4, cooldown: 2, windup: 1.05, active: 0.14, recovery: 1.1,
        damage: 32, knockback: 9, stagger: 0.55, shape: { kind: 'arc', from: 0, to: 0, reach: 3.3, height: 2, pitchFrom: 1.2, pitchTo: -0.9 },
        track: 4, armour: true, telegraph: 0xb07cff }),
      A({ id: 'lunge', clip: 'attack_thrust', range: [4.5, 9], weight: 1.5, cooldown: 3, windup: 0.5, active: 0.34, recovery: 0.85,
        damage: 20, knockback: 7, stagger: 0.4, shape: { kind: 'lunge', speed: 13, reach: 2.4 }, track: 4 }),
      A({ id: 'combo', clip: 'attack_combo', range: [0, 3.2], weight: 1, cooldown: 5, windup: 0.44, active: 1.3, recovery: 0.8,
        damage: 15, knockback: 6, stagger: 0.3, shape: { kind: 'arc', from: 1.4, to: -1.4, reach: 3, height: 1.3 }, track: 3, armour: true }),
    ],
  },
  'ashen-knight': {
    id: 'ashen-knight', name: 'Ashen Knight', creature: 'nemesis', height: 2.5, radius: 0.58, bodyHeight: 2.5, health: 340, poise: 130,
    mass: 2.6, tint: 0x8a7a80, emissive: 0xff6a2a, emissiveIntensity: 0.8, walk: 2.4, run: 5, aggression: 1.2, keep: 3.4,
    perception: { ...eyes, sight: 32 }, guard: 0.15, fxColor: 0xff8a4a, elite: true,
    weapon: { model: 'ps1-ottoman-war-axe', length: 2 },
    attacks: [
      A({ id: 'cleave', clip: 'attack_slash', range: [0, 3.6], weight: 3, cooldown: 0, windup: 0.62, active: 0.18, recovery: 0.55,
        damage: 22, knockback: 7, stagger: 0.4, shape: { kind: 'arc', from: 1.4, to: -1.4, reach: 3.2, height: 1.3 }, track: 5, step: 2,
        next: 'backhand', chain: 0.6 }),
      A({ id: 'backhand', clip: 'attack_backslash', range: [0, 3.6], weight: 0, cooldown: 0, windup: 0.38, active: 0.18, recovery: 0.7,
        damage: 20, knockback: 7, stagger: 0.35, shape: { kind: 'arc', from: -1.4, to: 1.4, reach: 3.2, height: 1.2 }, track: 4, step: 2,
        next: 'doom', chain: 0.4 }),
      A({ id: 'doom', clip: 'attack_overhead', range: [0, 3.8], weight: 1.5, cooldown: 2, windup: 1.0, active: 0.16, recovery: 1.0,
        damage: 36, knockback: 10, stagger: 0.6, shape: { kind: 'circle', offset: 2.4, radius: 2, shockwave: 9 }, track: 4, armour: true,
        telegraph: 0xff8a4a }),
      A({ id: 'leap', clip: 'attack_leap', range: [5, 11], weight: 1, cooldown: 5, windup: 0.8, active: 0.35, recovery: 1.0,
        damage: 30, knockback: 10, stagger: 0.6, shape: { kind: 'lunge', speed: 15, reach: 2.4 }, track: 3, armour: true, telegraph: 0xff8a4a }),
    ],
  },

  // --- casters ------------------------------------------------------------------------------
  sunkeeper: {
    id: 'sunkeeper', name: 'Sunkeeper Adept', creature: 'wanderer', height: 2, radius: 0.42, bodyHeight: 2, health: 120, poise: 30, mass: 0.9,
    tint: 0xfff0d0, emissive: 0xffc060, emissiveIntensity: 0.6, walk: 2.4, run: 5, aggression: 1.4, keep: 12,
    perception: { ...eyes, sight: 36, fov: 1.4 }, fxColor: 0xffd36a,
    attacks: [
      A({ id: 'orbs', clip: 'cast', range: [4, 26], weight: 3, cooldown: 1.5, windup: 0.66, active: 0.2, recovery: 0.6, damage: 13,
        knockback: 4, stagger: 0.2, ranged: true, telegraph: 0xffd36a,
        shape: { kind: 'projectile', count: 3, spread: 0.18, speed: 17, homing: 1.1, orb: 'sun', size: 1 } }),
      A({ id: 'sunfall', clip: 'cast_sky', range: [6, 30], weight: 2, cooldown: 5, windup: 0.8, active: 0.3, recovery: 0.8, damage: 22,
        knockback: 6, stagger: 0.45, ranged: true, shape: { kind: 'volley', count: 4, radius: 2.6, delay: 1.1, spread: 4.5 } }),
      A({ id: 'blink', clip: 'dodge', range: [0, 5], weight: 3, cooldown: 3, windup: 0.25, active: 0.1, recovery: 0.3, damage: 0,
        knockback: 0, stagger: 0, shape: { kind: 'blink', distance: 10 } }),
      A({ id: 'staff', clip: 'attack_slash', range: [0, 2.6], weight: 1, cooldown: 1, windup: 0.5, active: 0.16, recovery: 0.7, damage: 10,
        knockback: 5, stagger: 0.3, shape: { kind: 'arc', from: 1.2, to: -1.2, reach: 2.2, height: 1.2 }, track: 5 }),
    ],
  },

  // --- the dark ------------------------------------------------------------------------------
  umbral: {
    id: 'umbral', name: 'Umbral Stalker', creature: 'demon', height: 2.4, radius: 0.55, bodyHeight: 2.3, health: 220, poise: 70, mass: 1.6,
    emissive: 0x7a3aff, emissiveIntensity: 1.2, walk: 3, run: 7.2, aggression: 1.0, keep: 2.8, perception: { ...eyes, sight: 32, hearing: 12 },
    fxColor: 0x9a5aff,
    attacks: [
      A({ id: 'rake', clip: 'attack_slash', range: [0, 3.1], weight: 3, cooldown: 0, windup: 0.42, active: 0.16, recovery: 0.4,
        damage: 15, knockback: 5, stagger: 0.3, shape: { kind: 'arc', from: 1.3, to: -1.3, reach: 2.7, height: 1.4 }, track: 6, step: 2.5,
        next: 'rake2', chain: 0.7 }),
      A({ id: 'rake2', clip: 'attack_backslash', range: [0, 3.1], weight: 0, cooldown: 0, windup: 0.3, active: 0.16, recovery: 0.45,
        damage: 15, knockback: 5, stagger: 0.3, shape: { kind: 'arc', from: -1.3, to: 1.3, reach: 2.7, height: 1.4 }, track: 5, step: 2.5,
        next: 'maul', chain: 0.45 }),
      A({ id: 'maul', clip: 'attack_overhead', range: [0, 3.4], weight: 1, cooldown: 2, windup: 0.7, active: 0.16, recovery: 0.9,
        damage: 26, knockback: 9, stagger: 0.55, shape: { kind: 'circle', offset: 1.9, radius: 1.8 }, track: 4, armour: true }),
      A({ id: 'pounce', clip: 'attack_leap', range: [4, 12], weight: 2, cooldown: 3.5, windup: 0.6, active: 0.35, recovery: 0.8,
        damage: 22, knockback: 8, stagger: 0.5, shape: { kind: 'lunge', speed: 17, reach: 2 }, track: 4, telegraph: 0x9a5aff }),
    ],
  },
  gnawer: {
    id: 'gnawer', name: 'Pale Gnawer', creature: 'bingus', height: 1.3, radius: 0.5, bodyHeight: 1.1, health: 90, poise: 25, mass: 0.8,
    tint: 0xf0d0d8, walk: 3, run: 7.8, aggression: 1.1, keep: 2.2, perception: { ...eyes, sight: 24, hearing: 14 }, fxColor: 0xffc0d0,
    attacks: [
      A({ id: 'bite', clip: 'attack_bite', range: [0, 2.4], weight: 3, cooldown: 0, windup: 0.45, active: 0.15, recovery: 0.55,
        damage: 12, knockback: 4, stagger: 0.25, shape: { kind: 'arc', from: 0.5, to: -0.5, reach: 1.9, height: 0.7 }, track: 6, step: 3 }),
      A({ id: 'swipe', clip: 'attack_swipe', range: [0, 2.4], weight: 2, cooldown: 0, windup: 0.45, active: 0.16, recovery: 0.6,
        damage: 11, knockback: 5, stagger: 0.25, shape: { kind: 'arc', from: 1.2, to: -1.2, reach: 1.9, height: 0.6 }, track: 5 }),
      A({ id: 'pounce', clip: 'attack_pounce', range: [3, 9], weight: 2, cooldown: 3, windup: 0.8, active: 0.35, recovery: 0.8,
        damage: 16, knockback: 7, stagger: 0.4, shape: { kind: 'lunge', speed: 14, reach: 1.6 }, track: 4, telegraph: 0xffc0d0 }),
    ],
  },
  wasp: {
    id: 'wasp', name: 'Gloom Wasp', creature: 'bee', height: 0.95, radius: 0.5, bodyHeight: 0.9, health: 70, poise: 20, mass: 0.5,
    tint: 0xc8a0ff, emissive: 0x9a40ff, emissiveIntensity: 0.5, walk: 4, run: 8, aggression: 1.4, keep: 6, fly: 2.6,
    perception: { ...eyes, sight: 30, fov: 2 }, fxColor: 0xe0a0ff,
    attacks: [
      A({ id: 'sting', clip: 'attack_sting', range: [0, 3], weight: 3, cooldown: 0, windup: 0.5, active: 0.2, recovery: 0.6,
        damage: 12, knockback: 4, stagger: 0.25, shape: { kind: 'lunge', speed: 10, reach: 1.4 }, track: 6 }),
      A({ id: 'dive', clip: 'attack_sting', range: [4, 12], weight: 2, cooldown: 3, windup: 0.6, active: 0.45, recovery: 0.6,
        damage: 16, knockback: 6, stagger: 0.35, shape: { kind: 'lunge', speed: 16, reach: 1.5 }, track: 4, telegraph: 0xe0a0ff }),
      A({ id: 'barbs', clip: 'roar', range: [5, 18], weight: 1, cooldown: 4, windup: 0.4, active: 0.2, recovery: 0.6, damage: 9, knockback: 2,
        stagger: 0.1, ranged: true, shape: { kind: 'projectile', count: 2, spread: 0.2, speed: 22, homing: 0.6, orb: 'moon', size: 0.55 } }),
    ],
  },
  steed: {
    id: 'steed', name: 'Nightmare Steed', creature: 'horse', height: 2.5, radius: 0.8, bodyHeight: 2, health: 280, poise: 90, mass: 3,
    tint: 0x5a4a50, emissive: 0xff2a3a, emissiveIntensity: 0.3, walk: 3, run: 10, aggression: 1.5, keep: 8,
    perception: { ...eyes, sight: 40, fov: 1.4 }, fxColor: 0xff3a4a,
    attacks: [
      A({ id: 'trample', clip: 'run', range: [5, 22], weight: 3, cooldown: 3, windup: 0.9, active: 1.1, recovery: 1.0, damage: 26,
        knockback: 14, stagger: 0.6, shape: { kind: 'lunge', speed: 18, reach: 2.2 }, track: 2.5, armour: true, telegraph: 0xff3a4a }),
      A({ id: 'rear', clip: 'attack_stomp', range: [0, 4], weight: 2, cooldown: 2, windup: 0.75, active: 0.16, recovery: 0.9, damage: 24,
        knockback: 10, stagger: 0.55, shape: { kind: 'circle', offset: 2, radius: 2.4, shockwave: 8 }, track: 3, armour: true,
        telegraph: 0xff3a4a }),
      A({ id: 'bite', clip: 'attack_bite', range: [0, 3.2], weight: 1, cooldown: 0, windup: 0.45, active: 0.15, recovery: 0.6, damage: 14,
        knockback: 5, stagger: 0.3, shape: { kind: 'arc', from: 0.5, to: -0.5, reach: 2.9, height: 1.7 }, track: 5 }),
    ],
  },
  wyrmling: {
    id: 'wyrmling', name: 'Ember Wyrmling', creature: 'dragon', height: 1.8, radius: 1.2, bodyHeight: 1.8, health: 260, poise: 80, mass: 2.5,
    tint: 0xffa080, walk: 3, run: 7, aggression: 1.4, keep: 9, perception: { ...eyes, sight: 40, fov: 1.6 }, fxColor: 0xff7a3a,
    attacks: [
      A({ id: 'spit', clip: 'breath', range: [5, 24], weight: 3, cooldown: 2.5, windup: 0.85, active: 0.3, recovery: 1.2, damage: 16,
        knockback: 5, stagger: 0.3, ranged: true, telegraph: 0xff7a3a,
        shape: { kind: 'projectile', count: 3, spread: 0.2, speed: 22, homing: 0.5, orb: 'fire', size: 1.3 } }),
      A({ id: 'breath', clip: 'breath', range: [0, 8], weight: 2, cooldown: 5, windup: 0.85, active: 1.5, recovery: 1.0, damage: 7,
        knockback: 2, stagger: 0.1, shape: { kind: 'breath', range: 8, halfAngle: 0.45, tick: 0.15 }, track: 1, armour: true }),
      A({ id: 'bite', clip: 'attack_bite', range: [0, 4], weight: 2, cooldown: 0, windup: 0.56, active: 0.16, recovery: 0.7, damage: 18,
        knockback: 7, stagger: 0.4, shape: { kind: 'arc', from: 0.4, to: -0.4, reach: 4.2, height: 0.9 }, track: 5 }),
      A({ id: 'tail', clip: 'attack_tail', range: [0, 5], weight: 1, cooldown: 3, windup: 0.72, active: 0.3, recovery: 0.9, damage: 20,
        knockback: 12, stagger: 0.5, shape: { kind: 'circle', offset: 0, radius: 4.5 }, armour: true, telegraph: 0xff7a3a }),
    ],
  },
};

/** Old encounter kinds from Jobs 5–7 map onto the Bestiary. */
export function foeFor(kind: string): FoeSpec {
  if (kind === 'knight') return BESTIARY.shadowknight;
  if (kind === 'wizard') return BESTIARY.sunkeeper;
  return BESTIARY[kind as FoeId] ?? BESTIARY.hollow;
}

/** Library models the Bestiary holds (preloaded with the creatures). */
export const FOE_WEAPONS = [...new Set(Object.values(BESTIARY).flatMap(f => f.weapon ? [f.weapon.model] : []))];
