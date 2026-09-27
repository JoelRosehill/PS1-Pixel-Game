import { bass, bell, type Ctx, epiano, hat, kick, midiToHz, pad, snare } from './Synth';

/**
 * The procedural chill-fi score (Job 10). A 16th-note scheduler walks a four-chord,
 * eight-bar loop per mood: FM electric-piano comping, a round bass, soft swung
 * boom-bap drums, a sparse kalimba melody and optional pads. Moods follow the chapter
 * the player is in; intensity (explore, combat, boss, rest…) changes the layers and
 * the groove. Changes land on the next bar so the music never stumbles.
 */

type Quality = 'maj7' | 'maj9' | 'min7' | 'min9' | 'dom7' | 'sus' | 'add9' | 'min6' | 'm7b5' | 'minMaj9';

const QUALITIES: Record<Quality, number[]> = {
  maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], min7: [0, 3, 7, 10], min9: [0, 3, 7, 10, 14],
  dom7: [0, 4, 7, 10], sus: [0, 5, 7, 10, 14], add9: [0, 4, 7, 14], min6: [0, 3, 7, 9],
  m7b5: [0, 3, 6, 10], minMaj9: [0, 3, 7, 11, 14],
};

const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR_PENT = [0, 2, 4, 7, 9];

export interface Mood {
  id: string;
  /** MIDI note of the mood's tonic in the keys register. */
  root: number;
  bpm: number;
  /** [semitones from root, quality] per chord; two bars each. */
  chords: [number, Quality][];
  melody: number[];
  /** Melody density, 0..1. */
  bells: number;
  pad: boolean;
  /** Low-pass colour of the music bus (Hz). */
  tone: number;
}

/** One mood per chapter (index 0 is unused since the hub was removed), plus the ending. */
export const MOODS: Mood[] = [
  { id: 'threshold', root: 50, bpm: 72, chords: [[0, 'min9'], [5, 'sus'], [-2, 'maj7'], [-5, 'min7']], melody: MINOR_PENT, bells: 0.5, pad: false, tone: 3200 },
  { id: 'reach', root: 53, bpm: 76, chords: [[0, 'maj9'], [4, 'min7'], [5, 'maj7'], [7, 'add9']], melody: MAJOR_PENT, bells: 0.6, pad: false, tone: 4200 },
  { id: 'fen', root: 57, bpm: 70, chords: [[0, 'min9'], [-4, 'maj7'], [-7, 'min9'], [-5, 'min7']], melody: MINOR_PENT, bells: 0.4, pad: true, tone: 2400 },
  { id: 'coast', root: 51, bpm: 78, chords: [[0, 'maj7'], [-3, 'min9'], [5, 'maj7'], [7, 'sus']], melody: MAJOR_PENT, bells: 0.55, pad: false, tone: 4600 },
  { id: 'deep', root: 54, bpm: 68, chords: [[0, 'min9'], [-4, 'maj7'], [-7, 'min9'], [-5, 'sus']], melody: MINOR_PENT, bells: 0.8, pad: true, tone: 3600 },
  { id: 'bloodstone', root: 48, bpm: 72, chords: [[0, 'min9'], [1, 'maj7'], [-4, 'maj7'], [-5, 'dom7']], melody: MINOR_PENT, bells: 0.35, pad: false, tone: 2600 },
  { id: 'ash', root: 58, bpm: 70, chords: [[0, 'min9'], [-4, 'maj7'], [-7, 'min9'], [-5, 'dom7']], melody: MINOR_PENT, bells: 0.4, pad: true, tone: 2200 },
  { id: 'choir', root: 52, bpm: 66, chords: [[0, 'min9'], [-4, 'maj7'], [5, 'min9'], [-5, 'min7']], melody: MINOR_PENT, bells: 0.5, pad: true, tone: 3000 },
  { id: 'garden', root: 50, bpm: 64, chords: [[0, 'minMaj9'], [-2, 'maj7'], [-7, 'min9'], [-5, 'dom7']], melody: MINOR_PENT, bells: 0.65, pad: true, tone: 2800 },
];

export const FINALE_MOOD: Mood = { id: 'dawn', root: 50, bpm: 70, chords: [[0, 'maj9'], [5, 'maj7'], [-3, 'min9'], [7, 'add9']], melody: MAJOR_PENT, bells: 0.7, pad: true, tone: 5200 };

export type Intensity = 'title' | 'explore' | 'combat' | 'boss' | 'rest' | 'finale';

interface Layers { keys: number; bass: number; drums: number; bells: number; tempo: number; swing: number }

const LAYERS: Record<Intensity, Layers> = {
  title: { keys: 0.85, bass: 0.55, drums: 0, bells: 0.5, tempo: 0.94, swing: 0.3 },
  explore: { keys: 1, bass: 1, drums: 0.55, bells: 1, tempo: 1, swing: 0.3 },
  combat: { keys: 0.75, bass: 1.1, drums: 1, bells: 0, tempo: 1.12, swing: 0.18 },
  boss: { keys: 0.7, bass: 1.2, drums: 1.1, bells: 0, tempo: 1.3, swing: 0 },
  rest: { keys: 0.8, bass: 0.5, drums: 0, bells: 0.7, tempo: 0.9, swing: 0.3 },
  finale: { keys: 1, bass: 0.9, drums: 0.4, bells: 1, tempo: 0.95, swing: 0.3 },
};

const STEPS_PER_CHORD = 32;

export class Music {
  mood: Mood = MOODS[0];
  intensity: Intensity = 'title';
  /** Notes scheduled so far (tests and the debug HUD). */
  notes = 0;
  steps = 0;
  private pendingMood: Mood | null = null;
  private pendingIntensity: Intensity | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private melodyIndex = 5;
  private seed = 20260926;
  private readonly buses: Record<'keys' | 'bass' | 'drums' | 'bells' | 'pad', GainNode>;
  readonly output: GainNode;

  constructor(private readonly ctx: Ctx, out: AudioNode) {
    this.output = ctx.createGain();
    this.output.connect(out);
    const make = () => { const g = ctx.createGain(); g.connect(this.output); return g; };
    this.buses = { keys: make(), bass: make(), drums: make(), bells: make(), pad: make() };
    this.applyLayers(0);
  }

  /** Requests a mood and intensity; they take effect on the next bar line. */
  set(mood: Mood, intensity: Intensity): void {
    if (mood !== this.mood || this.pendingMood) this.pendingMood = mood === this.mood ? null : mood;
    if (intensity !== this.intensity || this.pendingIntensity) this.pendingIntensity = intensity === this.intensity ? null : intensity;
  }

  /** Starts (or restarts) the clock at `time`. */
  start(time: number): void {
    this.nextTime = time + 0.05;
    this.step = 0;
    this.bar = 0;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private get layers(): Layers {
    return LAYERS[this.intensity];
  }

  private get stepSeconds(): number {
    return 60 / (this.mood.bpm * this.layers.tempo) / 4;
  }

  private applyLayers(time: number): void {
    const l = this.layers;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, time, 0.4);
    set(this.buses.keys, l.keys);
    set(this.buses.bass, l.bass);
    set(this.buses.drums, l.drums);
    set(this.buses.bells, l.bells * this.mood.bells);
    set(this.buses.pad, this.intensity === 'combat' ? 0.4 : 1);
  }

  /** Schedules every step that starts before `now + horizon`. */
  schedule(now: number, horizon = 0.3): void {
    if (this.nextTime < now - 1) this.nextTime = now + 0.05; // after a stall (hidden tab), don't catch up
    while (this.nextTime < now + horizon) {
      this.playStep(this.nextTime);
      this.nextTime += this.stepSeconds;
      this.step++;
      this.steps++;
      if (this.step % 16 === 0) {
        this.bar++;
        if (this.pendingMood || this.pendingIntensity) {
          const moodChanged = !!this.pendingMood;
          if (this.pendingMood) this.mood = this.pendingMood;
          if (this.pendingIntensity) this.intensity = this.pendingIntensity;
          this.pendingMood = this.pendingIntensity = null;
          // A new mood starts from its first chord.
          if (moodChanged) { this.step = 0; this.bar = 0; }
          this.applyLayers(this.nextTime);
        }
      }
    }
  }

  private chordAt(step: number): { root: number; notes: number[] } {
    const [offset, quality] = this.mood.chords[Math.floor(step / STEPS_PER_CHORD) % this.mood.chords.length];
    const root = this.mood.root + offset;
    return { root, notes: QUALITIES[quality].map(i => root + i) };
  }

  private playStep(t: number): void {
    const ctx = this.ctx;
    const s = this.step % STEPS_PER_CHORD;
    const inBar = s % 16;
    const l = this.layers;
    const dt = this.stepSeconds;
    const swing = inBar % 4 === 2 ? dt * l.swing : 0;
    const time = t + swing + (this.rand() - 0.5) * 0.008;
    const chord = this.chordAt(this.step);
    const next = this.chordAt(this.step + STEPS_PER_CHORD);
    const hz = midiToHz;
    const note = () => { this.notes++; };

    // Keys: a strum on the chord change, a lighter re-voicing in bar two, loose comping.
    if (s === 0 || s === 16) {
      const voices = s === 0 ? chord.notes : chord.notes.slice(1);
      voices.forEach((m, i) => { epiano(ctx, this.buses.keys, time + i * 0.014, hz(m), dt * (s === 0 ? 14 : 12), (s === 0 ? 0.8 : 0.55) * (0.9 + this.rand() * 0.2), (i / voices.length - 0.5) * 0.5); note(); });
    } else if ((s === 6 || s === 22 || s === 27) && this.rand() < 0.35) {
      chord.notes.slice(1, 4).forEach((m, i) => { epiano(ctx, this.buses.keys, time + i * 0.01, hz(m + 12), dt * 1.5, 0.35, 0.2); note(); });
    }

    // Pads: moods with air, the boss drone and the dawn.
    if (s === 0 && (this.mood.pad || this.intensity === 'boss' || this.intensity === 'finale')) {
      const low = this.intensity === 'boss';
      pad(ctx, this.buses.pad, time, low ? [hz(chord.root - 24), hz(chord.root - 12)] : chord.notes.slice(0, 3).map(m => hz(m)), dt * STEPS_PER_CHORD, low ? 1.4 : 0.9, low ? 380 : 900);
      note();
    }

    // Bass.
    const bassRoot = chord.root - 24;
    if (this.intensity === 'boss' || this.intensity === 'combat') {
      if (inBar % 2 === 0) { bass(ctx, this.buses.bass, time, hz(inBar % 8 === 6 ? bassRoot + 12 : bassRoot), dt * 1.6, 0.8); note(); }
    } else {
      const approach = next.root - 24 + (next.root > chord.root ? -1 : 1);
      const hit: [number, number] | null = inBar === 0 ? [bassRoot, 5] : inBar === 6 ? [bassRoot, 2] : inBar === 10 ? [bassRoot + 7, 3] : s === 30 ? [approach, 2] : null;
      if (hit) { bass(ctx, this.buses.bass, time, hz(hit[0]), dt * hit[1], 0.85); note(); }
    }

    // Drums (a silent layer still costs nothing to skip).
    if (l.drums > 0) {
      const boss = this.intensity === 'boss', combat = this.intensity === 'combat';
      if (boss ? inBar % 4 === 0 : inBar === 0 || inBar === 10 || (inBar === 7 && this.rand() < 0.5) || (combat && inBar === 14)) { kick(ctx, this.buses.drums, time, inBar === 7 ? 0.55 : 0.9); note(); }
      if (inBar === 4 || inBar === 12) { snare(ctx, this.buses.drums, time + (boss ? 0 : 0.012), 0.8); note(); }
      if (boss || combat ? true : inBar % 2 === 0) {
        const open = !boss && s === 30 && this.rand() < 0.5;
        hat(ctx, this.buses.drums, time, (inBar % 4 === 0 ? 0.75 : inBar % 2 === 0 ? 0.5 : 0.3) * (0.85 + this.rand() * 0.3), open);
        note();
      }
    }

    // Melody: call-and-response phrases in the second half of every four bars.
    if (l.bells > 0 && this.mood.bells > 0 && inBar % 2 === 0 && this.bar % 4 >= 2) {
      const p = this.mood.bells * (inBar % 4 === 0 ? 0.55 : 0.32);
      if (this.rand() < p) {
        const scale = this.mood.melody;
        this.melodyIndex = Math.max(0, Math.min(scale.length * 2 - 1, this.melodyIndex + Math.round((this.rand() - 0.5) * 3.2)));
        const m = this.mood.root + 12 + scale[this.melodyIndex % scale.length] + 12 * Math.floor(this.melodyIndex / scale.length);
        bell(ctx, this.buses.bells, time, hz(m), 0.7 + this.rand() * 0.3, (this.rand() - 0.5) * 0.6);
        note();
      }
    }
  }
}
