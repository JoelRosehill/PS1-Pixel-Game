import type { ChapterDef } from '../engine/WorldAtlas';
import { ATLAS } from './Atlas';

/**
 * The eight chapters, clockwise from due north (Pillar 4: 8 chapters × 5 biomes).
 * Chapters I–V are anchored by the five required archetypes; VI–VIII are expansions
 * that remix them (ash, frost, and the celestial finale). See `Atlas.ts`.
 */
const NAMES = [
  'The Tranquil Reach', 'The Violet Fen', "The Sunkeepers' Coast", 'The Crystal Deep',
  'The Bloodstone Wastes', 'The Ashen March', 'The Frozen Choir', 'The Last Garden',
];

export const CHAPTERS: ChapterDef[] = NAMES.map((name, i) => ({ index: i + 1, name, biomes: ATLAS[i] }));

export function roman(n: number): string {
  return ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
