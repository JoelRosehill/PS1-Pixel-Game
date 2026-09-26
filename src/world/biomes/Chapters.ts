import type { ChapterDef } from '../engine/WorldAtlas';
import { ARCHETYPES } from './Archetypes';
import type { BiomeDef } from './BiomeTypes';

const five = (b: BiomeDef): BiomeDef[] => [b, b, b, b, b];

/**
 * The eight chapters, clockwise from due north (Pillar 4: 8 chapters × 5 biomes).
 * Job 6 fills each chapter with its anchor archetype; Job 7 replaces these with the
 * full 40-biome atlas of data variants.
 */
export const CHAPTERS: ChapterDef[] = [
  { index: 1, name: 'The Tranquil Reach', biomes: five(ARCHETYPES.wilderness) },
  { index: 2, name: 'The Violet Fen', biomes: five(ARCHETYPES.marsh) },
  { index: 3, name: "The Sunkeepers' Coast", biomes: five(ARCHETYPES.terrace) },
  { index: 4, name: 'The Crystal Deep', biomes: five(ARCHETYPES.caverns) },
  { index: 5, name: 'The Bloodstone Wastes', biomes: five(ARCHETYPES.bloodstone) },
  { index: 6, name: 'The Ashen March', biomes: five(ARCHETYPES.bloodstone) },
  { index: 7, name: 'The Frozen Choir', biomes: five(ARCHETYPES.caverns) },
  { index: 8, name: 'The Last Garden', biomes: five(ARCHETYPES.terrace) },
];

export function roman(n: number): string {
  return ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
