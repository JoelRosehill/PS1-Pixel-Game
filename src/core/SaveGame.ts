import type { ProgressData } from './Progress';

/** Everything needed to resume a journey (Job 9). */
export interface SaveData {
  version: 1;
  savedAt: number;
  progress: ProgressData;
  pages: string[];
  selected: string;
  /** Shrine the player last rested at (respawn and load position). */
  shrine: string;
  playTime: number;
  deaths: number;
}

export const SAVE_KEY = 'chromatic-odyssey.save.v1';

/**
 * localStorage persistence. Storage may be unavailable (private windows, blocked site
 * data), so every access is guarded and the game plays on without saving.
 */
export class SaveGame {
  lastSaved = 0;
  lastError = '';

  constructor(readonly enabled: boolean) {}

  save(data: Omit<SaveData, 'version' | 'savedAt'>): boolean {
    if (!this.enabled) return false;
    try {
      const full: SaveData = { version: 1, savedAt: Date.now(), ...data };
      localStorage.setItem(SAVE_KEY, JSON.stringify(full));
      this.lastSaved = full.savedAt;
      return true;
    } catch (error) {
      this.lastError = String(error);
      return false;
    }
  }

  load(): SaveData | null {
    if (!this.enabled) return null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (data.version !== 1 || typeof data.progress !== 'object' || !Array.isArray(data.pages)) return null;
      return {
        version: 1,
        savedAt: Number(data.savedAt) || 0,
        progress: data.progress as ProgressData,
        pages: data.pages.filter((p): p is string => typeof p === 'string'),
        selected: typeof data.selected === 'string' ? data.selected : 'rune-burst',
        shrine: typeof data.shrine === 'string' ? data.shrine : 'hollowmere',
        playTime: Number(data.playTime) || 0,
        deaths: Number(data.deaths) || 0,
      };
    } catch (error) {
      this.lastError = String(error);
      return null;
    }
  }

  clear(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
  }
}
