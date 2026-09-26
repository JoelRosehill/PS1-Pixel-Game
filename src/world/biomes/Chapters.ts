import type { ChapterDef } from '../engine/WorldAtlas';
import { CHAPTER_NAMES, JOURNEY } from './Journey';

/**
 * The eight chapters of the Long Road (Job 15), five biomes each in the order the road
 * passes through them. See `Journey.ts`.
 */
export const CHAPTERS: ChapterDef[] = CHAPTER_NAMES.map((name, i) => ({
  index: i + 1, name, biomes: JOURNEY.filter(l => l.chapter === i + 1).map(l => l.biome),
}));

export function roman(n: number): string {
  return ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
