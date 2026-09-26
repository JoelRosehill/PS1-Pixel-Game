import type { CreatureLibrary } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { BossDef } from './Boss';
import { CADDOC, Caddoc } from './Caddoc';
import type { CreatureBoss } from './CreatureBoss';
import { GLOOMHORN, Gloomhorn } from './Gloomhorn';
import { GLUTTON, Glutton } from './Glutton';
import { HIVE_QUEEN, HiveQueen } from './HiveQueen';
import { MORROW, Morrow } from './Morrow';
import { SOLENNE, Solenne } from './Solenne';
import { SOVEREIGN, Sovereign } from './Sovereign';
import { VERMILION, Vermilion } from './Vermilion';

/** The eight great foes of the Long Road, one per chapter, in order (Job 14). */
export const BOSSES: BossDef[] = [MORROW, GLOOMHORN, SOLENNE, GLUTTON, VERMILION, CADDOC, HIVE_QUEEN, SOVEREIGN];

type Factory = new (creatures: CreatureLibrary | null, models: ModelLibrary | null) => CreatureBoss;
const FACTORIES: Record<string, Factory> = {
  morrow: Morrow, gloomhorn: Gloomhorn, solenne: Solenne, glutton: Glutton, vermilion: Vermilion, caddoc: Caddoc,
  hivequeen: HiveQueen, sovereign: Sovereign,
};

export function createBoss(def: BossDef, creatures: CreatureLibrary | null, models: ModelLibrary | null): CreatureBoss {
  const F = FACTORIES[def.id];
  if (!F) throw new Error(`No boss named ${def.id}`);
  return new F(creatures, models);
}

/** Library models the bosses hold (weapons, the sun halo). */
export const BOSS_PROPS = ['ps1-ottoman-war-axe', 'ps1-medieval-long-sword', 'ps1-style-low-poly-sun'];
