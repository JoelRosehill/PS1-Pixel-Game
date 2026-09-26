import type * as THREE from 'three';
import type { Effects } from '../render/effects/Effects';
import type { CombatWorld } from './CombatWorld';

export type Team = 'player' | 'enemy';

/** 'hazard': ground effects (shockwaves, fire, falling light) — dodge or jump, never parry or block. */
/** 'wave': ranged sword arts (crescents); 'bolt': Starbolts; 'spell': spell damage. */
export type HitKind = 'light' | 'heavy' | 'spin' | 'plunge' | 'thrust' | 'sweep' | 'burst' | 'riposte' | 'enemy' | 'reflect' | 'hazard' |
  'wave' | 'bolt' | 'spell';

export interface HitInfo {
  damage: number;
  /** Unit direction the blow travels (horizontal). */
  direction: THREE.Vector3;
  /** World point of impact, for VFX. */
  point: THREE.Vector3;
  knockback: number;
  /** Seconds of stagger inflicted. */
  stagger: number;
  source: Team;
  kind: HitKind;
  /** Who swung, so a parry can stagger them back. */
  attacker?: Damageable;
  /** This blow is the recoil of a successful parry (enemies open up for a riposte). */
  parry?: boolean;
  /** Seconds the target is slowed (frost). */
  slow?: number;
}

export interface HitResult {
  hit: boolean;
  damage?: number;
  killed?: boolean;
  /** The defender parried this blow (perfect block). */
  parried?: boolean;
  /** The defender guarded (reduced damage). */
  blocked?: boolean;
  /** The defender was invulnerable — a dodge, not a hit. */
  dodged?: boolean;
  /** Struck a weak point or an exposed (parried / guard-broken) enemy. */
  critical?: boolean;
}

/** A damageable thing that also ticks and draws itself. */
export interface CombatEntity extends Damageable {
  readonly group: THREE.Object3D;
  update(dt: number, playerPos: THREE.Vector3, world: CombatWorld, effects: Effects): void;
  faceCamera(quat: THREE.Quaternion): void;
}

/** Anything that can be struck. Bodies are vertical capsules. */
export interface Damageable {
  readonly team: Team;
  /** Feet position. */
  readonly position: THREE.Vector3;
  readonly bodyRadius: number;
  readonly bodyHeight: number;
  alive: boolean;
  applyHit(hit: HitInfo): HitResult;
}
