import type * as THREE from 'three';
import type { CombatWorld } from '../combat/CombatWorld';
import type { TimeControl } from '../core/TimeControl';
import type { ColliderWorld } from '../physics/Colliders';
import type { Player } from '../player/Player';
import type { Effects } from '../render/effects/Effects';
import type { AttackTokens } from './AttackTokens';
import type { EnemyProjectiles } from './EnemyProjectiles';
import type { Hazards } from './Hazards';
import type { Telegraphs } from './Telegraphs';

/** Everything an enemy brain may read or act on during a fixed step. */
export interface AIContext {
  readonly player: Player;
  readonly colliders: ColliderWorld;
  readonly combat: CombatWorld;
  readonly effects: Effects;
  readonly time: TimeControl;
  readonly tokens: AttackTokens;
  readonly telegraphs: Telegraphs;
  readonly projectiles: EnemyProjectiles;
  readonly hazards: Hazards;
  /** Raises a regular enemy (bosses summon reinforcements). */
  spawn(kind: 'knight' | 'wizard', x: number, z: number): void;
  /** Whites out the player's view (Sunkeeper flash). `strength` 0..1. */
  blind(seconds: number, strength: number): void;
  /** Seconds of simulated time since the director started. */
  clock: number;
  /** Player eye position for this step (perception and aiming). */
  readonly playerEye: THREE.Vector3;
}
