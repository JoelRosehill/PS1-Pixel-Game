import type * as THREE from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { CombatEntity } from '../combat/types';
import type { EncounterDef } from '../enemies/Encounters';
import type { ColliderWorld } from '../physics/Colliders';

/** A playable space. Job 6 turns this into a streamed, biome-driven world. */
export interface Level {
  readonly name: string;
  readonly root: THREE.Object3D;
  readonly skyPreset: string;
  readonly spawn: { position: THREE.Vector3; lookAt: THREE.Vector3 };
  /** Static collision for the character controller. */
  readonly colliders: ColliderWorld;
  /** Fightable entities (Job 3+). */
  readonly enemies: CombatEntity[];
  readonly lostPage: THREE.Object3D;
  /** Enemy encounters (Job 5): trigger circles that raise Shadow Knights and Sunkeepers. */
  readonly encounters?: EncounterDef[];
  loadAssets?(library: ModelLibrary): Promise<string[]>;
  /** Streamed levels (Job 6): the camera position; `instant` builds everything now. */
  setViewer?(position: THREE.Vector3, instant?: boolean): void;
  /** When true, the level drives the sky from the biomes around the viewer. */
  readonly biomeDriven?: boolean;
  /** A hint about a nearby obstacle (closed chapter gates). */
  readonly gateHint?: string;
  /** Region title hook for streamed levels. */
  onRegion?: (title: string, subtitle: string) => void;
  heightAt(x: number, z: number): number;
  update(dt: number, elapsed: number): void;
}
