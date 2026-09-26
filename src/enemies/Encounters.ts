import type { Enemy } from './Enemy';

/** One enemy placed by an encounter wave. `y` defaults to the terrain height. */
export interface SpawnDef {
  /** A Bestiary id ('hollow', 'umbral', ...); 'knight'/'wizard' map to Shadow Knights/Sunkeepers. */
  kind: string;
  x: number;
  z: number;
  y?: number;
  /** Radians; defaults to facing the trigger centre. */
  facing?: number;
}

/**
 * Data for a fight: stepping into the trigger circle raises the first wave; each
 * cleared wave raises the next; clearing the last pays the reward. Dying or fleeing
 * far beyond the leash resets it so it can be attempted again.
 */
export interface EncounterDef {
  id: string;
  name: string;
  trigger: { x: number; z: number; radius: number };
  /** Extra distance beyond the trigger radius before an abandoned fight resets. */
  leash?: number;
  waves: SpawnDef[][];
  /** Vantage points Sunkeeper Wizards blink between: [x, y, z]. */
  perches?: [number, number, number][];
  reward?: { vigour: number; momentum: number };
  /** Chapter of the road: scales the foes' health and damage. */
  level?: number;
}

export type EncounterState = 'dormant' | 'active' | 'cleared';

export class Encounter {
  state: EncounterState = 'dormant';
  wave = 0;
  readonly enemies: Enemy[] = [];
  waveDelay = 0;
  awayTime = 0;
  pendingReset = false;
  timesCleared = 0;

  constructor(readonly def: EncounterDef) {}

  get living(): Enemy[] {
    return this.enemies.filter(e => e.alive && !e.removed);
  }
}
