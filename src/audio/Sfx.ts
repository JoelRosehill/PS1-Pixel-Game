import { bell, blip, click, type Ctx, growl, metal, midiToHz, pad, sweep, thump } from './Synth';

/** Options some effects take: 0..1 strength and a stereo position. */
export interface SfxOptions {
  strength?: number;
  pan?: number;
  /** Variant (e.g. the spell effect kind). */
  kind?: string;
}

type Effect = (ctx: Ctx, out: AudioNode, t: number, o: Required<SfxOptions>) => void;

const chime = (ctx: Ctx, out: AudioNode, t: number, notes: number[], gap: number, vel: number, decay = 1.2) =>
  notes.forEach((m, i) => bell(ctx, out, t + i * gap, midiToHz(m), vel, (i / notes.length - 0.5) * 0.6, decay));

/**
 * The game's sound effects, all synthesised (Job 10). Kept short and soft so they sit
 * inside the lo-fi mix; strength scales loudness and brightness where it matters.
 */
export const SFX: Record<string, Effect> = {
  // --- the sword -------------------------------------------------------------------
  swing: (c, out, t, o) => sweep(c, out, t, 700, 2600, 0.13, 0.18 * o.strength, 1.4, o.pan),
  heavy: (c, out, t, o) => { sweep(c, out, t, 380, 1500, 0.26, 0.26 * o.strength, 1.1, o.pan); thump(c, out, t, 90, 0.1); },
  hit: (c, out, t, o) => { thump(c, out, t, 150, 0.32 * o.strength); click(c, out, t, 2200, 0.12 * o.strength); },
  crit: (c, out, t, o) => { thump(c, out, t, 120, 0.4 * o.strength, 0.24); click(c, out, t, 1800, 0.16); bell(c, out, t + 0.01, 1760, 0.5, o.pan, 0.5); },
  parry: (c, out, t) => { metal(c, out, t, 1180, 0.55, 0.9); click(c, out, t, 3000, 0.25, 0.05); },
  block: (c, out, t) => { metal(c, out, t, 420, 0.35, 0.25); thump(c, out, t, 110, 0.2); },
  hurt: (c, out, t, o) => { thump(c, out, t, 95, 0.4 * o.strength, 0.22); blip(c, out, t, 'square', 220, 110, 0.12, 0.035); },
  dodge: (c, out, t) => { chime(c, out, t, [88, 95], 0.05, 0.35, 0.5); sweep(c, out, t, 3000, 900, 0.2, 0.12); },
  death: (c, out, t) => { pad(c, out, t, [midiToHz(45), midiToHz(52), midiToHz(56)], 1.4, 1.6, 500); blip(c, out, t, 'sine', 330, 80, 1.6, 0.12); },

  // --- movement ----------------------------------------------------------------------
  jump: (c, out, t) => blip(c, out, t, 'sine', 260, 420, 0.07, 0.05),
  land: (c, out, t, o) => { thump(c, out, t, 120, 0.18 * o.strength, 0.12); click(c, out, t, 900, 0.05 * o.strength); },
  dash: (c, out, t, o) => sweep(c, out, t, 3200, 600, 0.2, 0.2, 1, o.pan),
  slide: (c, out, t) => sweep(c, out, t, 900, 400, 0.35, 0.1, 0.6),
  walljump: (c, out, t) => { sweep(c, out, t, 1400, 3200, 0.14, 0.14); thump(c, out, t, 180, 0.1); },
  slam: (c, out, t) => { thump(c, out, t, 90, 0.55, 0.4); sweep(c, out, t, 600, 120, 0.4, 0.2, 0.7); },
  step: (c, out, t, o) => { thump(c, out, t, 70 + o.strength * 30, 0.07 * o.strength, 0.07); click(c, out, t, 500 + o.strength * 300, 0.02 * o.strength, 0.03); },
  channel: (c, out, t, o) => { blip(c, out, t, 'sine', 180 + o.strength * 260, 200 + o.strength * 300, 0.3, 0.03); chime(c, out, t, [74 + Math.round(o.strength * 12)], 0, 0.12, 0.4); },
  channelFull: (c, out, t) => { chime(c, out, t, [74, 81, 86, 93], 0.05, 0.35, 1.2); sweep(c, out, t, 400, 3200, 0.5, 0.16); },
  rebound: (c, out, t) => { chime(c, out, t, [79, 86, 91], 0.04, 0.3, 0.6); sweep(c, out, t, 800, 3000, 0.25, 0.14); },

  // --- spells ------------------------------------------------------------------------
  cast: (c, out, t, o) => {
    switch (o.kind) {
      case 'burst': thump(c, out, t, 70, 0.5, 0.45); sweep(c, out, t, 300, 3000, 0.4, 0.18); chime(c, out, t, [74, 81], 0.03, 0.3); break;
      case 'frost': chime(c, out, t, [96, 100, 103], 0.025, 0.3, 0.5); sweep(c, out, t, 5000, 2500, 0.18, 0.12); break;
      case 'projectile': sweep(c, out, t, 500, 2400, 0.22, 0.2); blip(c, out, t, 'sawtooth', 220, 90, 0.25, 0.05); break;
      case 'field': blip(c, out, t, 'sawtooth', 420, 110, 0.7, 0.06); blip(c, out, t, 'sawtooth', 424, 113, 0.7, 0.05); sweep(c, out, t, 400, 150, 0.7, 0.12, 2); break;
      case 'blink': sweep(c, out, t, 4000, 400, 0.18, 0.22); chime(c, out, t + 0.12, [91], 0, 0.3, 0.4); break;
      case 'launch': sweep(c, out, t, 300, 2600, 0.45, 0.22, 0.8); break;
      case 'ward': pad(c, out, t, [midiToHz(62), midiToHz(69), midiToHz(74)], 0.6, 1.4, 1400); chime(c, out, t, [74, 78, 81], 0.05, 0.3); break;
      case 'heal': chime(c, out, t, [67, 71, 74, 79, 83], 0.06, 0.4, 1.4); break;
      case 'starfall': sweep(c, out, t, 3200, 500, 0.9, 0.16, 1.2); chime(c, out, t, [88, 84, 81, 76, 72], 0.1, 0.3, 0.9); break;
      case 'lance': sweep(c, out, t, 400, 5000, 0.3, 0.28, 0.9); thump(c, out, t, 90, 0.35, 0.3); chime(c, out, t, [93, 98], 0.02, 0.3, 0.6); break;
      case 'chain': click(c, out, t, 4000, 0.25, 0.08); sweep(c, out, t, 6000, 800, 0.35, 0.22, 3); click(c, out, t + 0.07, 3000, 0.2, 0.05); break;
      case 'rupture': chime(c, out, t, [96, 100, 103], 0.025, 0.3, 0.5); thump(c, out, t, 80, 0.35, 0.5); sweep(c, out, t, 5000, 2500, 0.3, 0.14); break;
      case 'maw': blip(c, out, t, 'sawtooth', 220, 55, 1.2, 0.08); sweep(c, out, t, 1200, 90, 1.2, 0.2, 2); break;
      case 'phoenix': sweep(c, out, t, 300, 3000, 0.4, 0.26, 0.8); thump(c, out, t, 120, 0.3, 0.3); break;
      case 'aegis': pad(c, out, t, [midiToHz(62), midiToHz(69), midiToHz(74)], 0.6, 1.4, 1400); chime(c, out, t, [74, 78, 81, 86], 0.05, 0.3); break;
      case 'bloom': thump(c, out, t, 70, 0.5, 0.45); pad(c, out, t, [midiToHz(49), midiToHz(56)], 0.5, 0.9, 700); chime(c, out, t, [67, 71, 74, 79], 0.06, 0.35, 1.2); break;
      case 'prism': chime(c, out, t, [79, 83, 86, 91, 95], 0.03, 0.3, 0.8); sweep(c, out, t, 800, 4000, 0.4, 0.2); break;
      case 'wisps': chime(c, out, t, [84, 88, 91, 96], 0.08, 0.35, 1.4); break;
      case 'eclipse': thump(c, out, t, 45, 0.8, 1.4); pad(c, out, t, [midiToHz(38), midiToHz(45), midiToHz(50)], 1.6, 1.8, 600); sweep(c, out, t + 0.3, 200, 5000, 0.8, 0.3); break;
      default: sweep(c, out, t, 600, 2000, 0.25, 0.18);
    }
  },
  bolt: (c, out, t, o) => { blip(c, out, t, 'triangle', 900 + o.strength * 300, 1600, 0.06, 0.035); click(c, out, t, 5000, 0.02); },
  wave: (c, out, t, o) => { sweep(c, out, t, 900, 4200, 0.28, 0.22 * o.strength, 1.6, o.pan); chime(c, out, t, [88], 0, 0.15, 0.3); },
  art: (c, out, t) => { sweep(c, out, t, 300, 3600, 0.35, 0.26, 1.1); thump(c, out, t, 100, 0.3, 0.3); chime(c, out, t + 0.05, [74, 81, 86], 0.04, 0.3, 0.8); },
  flask: (c, out, t) => { blip(c, out, t, 'sine', 300, 500, 0.4, 0.05); chime(c, out, t + 0.5, [72, 76, 79], 0.08, 0.35, 1.2); },
  fizzle: (c, out, t) => blip(c, out, t, 'square', 180, 120, 0.12, 0.03),
  resonance: (c, out, t) => chime(c, out, t, [76, 83, 88, 95], 0.05, 0.35, 1),

  // --- enemies -----------------------------------------------------------------------
  telegraph: (c, out, t) => { blip(c, out, t, 'sine', 1320, 1320, 0.05, 0.05); blip(c, out, t + 0.08, 'sine', 1760, 1760, 0.05, 0.04); },
  enemyShot: (c, out, t) => { sweep(c, out, t, 1600, 500, 0.3, 0.12, 2); blip(c, out, t, 'triangle', 660, 330, 0.25, 0.04); },
  shockwave: (c, out, t) => { thump(c, out, t, 60, 0.5, 0.6); sweep(c, out, t, 400, 90, 0.8, 0.22, 0.6); },
  enemyDeath: (c, out, t) => { sweep(c, out, t, 2400, 300, 0.6, 0.12, 0.8); chime(c, out, t + 0.1, [84, 79, 76], 0.07, 0.2, 0.7); },
  bossRoar: (c, out, t) => growl(c, out, t, 62, 1.8, 0.45),
  bossDefeat: (c, out, t) => { thump(c, out, t, 55, 0.6, 1); pad(c, out, t, [midiToHz(50), midiToHz(57), midiToHz(62), midiToHz(66)], 2.4, 2, 1800); chime(c, out, t + 0.4, [74, 78, 81, 86, 90], 0.12, 0.45, 2); },

  // --- the world ---------------------------------------------------------------------
  pickup: (c, out, t) => chime(c, out, t, [72, 76, 79, 84, 88], 0.07, 0.45, 1.6),
  kindle: (c, out, t) => { sweep(c, out, t, 200, 1800, 0.9, 0.2, 0.7); pad(c, out, t, [midiToHz(50), midiToHz(57), midiToHz(66)], 1.2, 1.6, 1200); chime(c, out, t + 0.5, [74, 81], 0.1, 0.35, 1.5); },
  rest: (c, out, t) => { pad(c, out, t, [midiToHz(50), midiToHz(57), midiToHz(64)], 1, 1.2, 900); chime(c, out, t + 0.2, [69, 74], 0.12, 0.25, 1.4); },
  travel: (c, out, t) => { sweep(c, out, t, 200, 4000, 0.8, 0.22, 0.6); chime(c, out, t + 0.6, [74, 81, 86], 0.08, 0.3, 1.2); },
  announce: (c, out, t) => { thump(c, out, t, 110, 0.18, 0.8); bell(c, out, t, midiToHz(57), 0.5, 0, 2.4); bell(c, out, t + 0.02, midiToHz(64), 0.3, 0, 2); },
  lore: (c, out, t) => { sweep(c, out, t, 2400, 1200, 0.3, 0.06, 0.8); chime(c, out, t + 0.05, [81], 0, 0.2, 1); },
  gate: (c, out, t) => { thump(c, out, t, 50, 0.4, 1.4); pad(c, out, t, [midiToHz(38), midiToHz(45)], 2, 1.4, 500); },

  // --- interface ----------------------------------------------------------------------
  uiOpen: (c, out, t) => { blip(c, out, t, 'triangle', 520, 780, 0.08, 0.05); click(c, out, t, 3000, 0.02); },
  uiClose: (c, out, t) => blip(c, out, t, 'triangle', 700, 440, 0.08, 0.04),
  uiSelect: (c, out, t) => blip(c, out, t, 'triangle', 880, 990, 0.04, 0.04),
};

export type SfxName = keyof typeof SFX;
