/** Rebindable actions and their default keys (`KeyboardEvent.code`). */
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', key: 'KeyW' },
  { id: 'back', label: 'Move back', key: 'KeyS' },
  { id: 'left', label: 'Strafe left', key: 'KeyA' },
  { id: 'right', label: 'Strafe right', key: 'KeyD' },
  { id: 'jump', label: 'Jump · wall kick', key: 'Space' },
  { id: 'dash', label: 'Dash · hold still to channel', key: 'ShiftLeft' },
  { id: 'slide', label: 'Slide · slam', key: 'ControlLeft' },
  { id: 'parry', label: 'Parry · guard', key: 'KeyQ' },
  { id: 'cast', label: 'Cast spell', key: 'KeyE' },
  { id: 'use', label: 'Use · bind · rest · read', key: 'KeyF' },
  { id: 'book', label: 'Spellbook', key: 'KeyB' },
  { id: 'wheel', label: 'Spell wheel (hold)', key: 'Tab' },
  { id: 'map', label: 'World map', key: 'KeyM' },
  { id: 'journal', label: 'Journal', key: 'KeyJ' },
  { id: 'respawn', label: 'Return to shrine', key: 'KeyR' },
] as const;

export type ActionId = (typeof ACTIONS)[number]['id'];

export interface SettingsData {
  version: 1;
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  /** Vertical resolution in base pixels (pixel size). */
  pixelLines: number;
  /** Smart-Pixel depth bands (4 fast · 6 default · 8 finest). */
  bands: 4 | 6 | 8;
  /** Pixel bloom strength, 0 = off. */
  bloom: number;
  outline: boolean;
  /** Mouse sensitivity multiplier. */
  sensitivity: number;
  invertY: boolean;
  fov: number;
  /** FOV kick, wall-run roll and screen shake. */
  motion: boolean;
  /** Movement hints under the speedometer. */
  hints: boolean;
  compass: boolean;
  debugHud: boolean;
  keys: Record<ActionId, string>;
}

export const PIXEL_LINES = [270, 360, 450, 540, 720];
export const SETTINGS_KEY = 'chromatic-odyssey.settings.v1';

export function defaultSettings(): SettingsData {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    version: 1, master: 0.8, music: 0.7, sfx: 0.85, ambience: 0.6,
    pixelLines: 540, bands: 6, bloom: 0.6, outline: true,
    sensitivity: 1, invertY: false, fov: 75, motion: !reduced, hints: true, compass: true, debugHud: false,
    keys: Object.fromEntries(ACTIONS.map(a => [a.id, a.key])) as Record<ActionId, string>,
  };
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Validates stored settings field by field, keeping defaults for anything odd. */
export function sanitize(raw: Partial<SettingsData> | null | undefined): SettingsData {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const keys = { ...d.keys };
  if (raw.keys && typeof raw.keys === 'object')
    for (const a of ACTIONS) { const k = (raw.keys as Record<string, unknown>)[a.id]; if (typeof k === 'string' && /^[A-Za-z0-9]+$/.test(k)) keys[a.id] = k; }
  return {
    version: 1,
    master: clamp(raw.master, 0, 1, d.master), music: clamp(raw.music, 0, 1, d.music),
    sfx: clamp(raw.sfx, 0, 1, d.sfx), ambience: clamp(raw.ambience, 0, 1, d.ambience),
    pixelLines: PIXEL_LINES.includes(raw.pixelLines as number) ? raw.pixelLines! : d.pixelLines,
    bands: raw.bands === 4 || raw.bands === 8 ? raw.bands : 6,
    bloom: clamp(raw.bloom, 0, 1, d.bloom), outline: bool(raw.outline, d.outline),
    sensitivity: clamp(raw.sensitivity, 0.25, 3, 1), invertY: bool(raw.invertY, false), fov: clamp(raw.fov, 60, 100, 75),
    motion: bool(raw.motion, d.motion), hints: bool(raw.hints, true), compass: bool(raw.compass, true), debugHud: bool(raw.debugHud, false),
    keys,
  };
}

/** Player preferences in localStorage (separate from the journey save). */
export class Settings {
  data: SettingsData;
  constructor(private readonly persist: boolean) {
    this.data = defaultSettings();
    if (!persist) return;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.data = sanitize(JSON.parse(raw));
    } catch { /* storage unavailable or corrupt: defaults */ }
  }

  save(): void {
    if (!this.persist) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  reset(): void {
    this.data = defaultSettings();
  }
}

/** A readable name for a key code. */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', Backquote: '`',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return names[code] ?? code;
}
