import { FINALE_MOOD, type Intensity, MOODS, Music } from './Music';
import { SFX, type SfxOptions } from './Sfx';
import { crackleBuffer, noiseBuffer } from './Synth';

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export interface AudioState {
  /** Chapter index (1–8) or 'finale'. */
  mood: number | 'finale';
  intensity: Intensity;
  /** A pausing menu is open (the score sinks under a low-pass). */
  menu: boolean;
  /** 0..1 wind/air (player speed, altitude). */
  wind: number;
}

/**
 * The game's audio (Job 10): one AudioContext, created on the first user gesture, with
 * music, effects and ambience buses into a gentle compressor. The music bus runs through
 * a tone filter and a slow pitch wobble (tape flutter); ambience is vinyl crackle plus a
 * wind bed that rises with speed. Effect requests are counted even while audio is off,
 * so tests can check the hooks without sound.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  music: Music | null = null;
  readonly volumes: AudioVolumes = { master: 0.8, music: 0.7, sfx: 0.85, ambience: 0.6 };
  /** Effect requests by name (whether or not they were audible). */
  readonly counts: Record<string, number> = {};
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private readonly lastPlayed = new Map<string, number>();

  constructor(readonly enabled: boolean) {}

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Creates or resumes the context. Call from a user gesture. */
  start(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private build(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);

    // Music: tone filter → tape wobble → level.
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.master);
    const wobble = ctx.createDelay(0.05);
    wobble.delayTime.value = 0.008;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.42;
    const depth = ctx.createGain();
    depth.gain.value = 0.0011;
    lfo.connect(depth).connect(wobble.delayTime);
    lfo.start();
    wobble.connect(this.musicGain);
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 3200;
    this.tone.Q.value = 0.5;
    this.tone.connect(wobble);
    this.music = new Music(ctx, this.tone);
    this.music.start(ctx.currentTime);

    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);

    // Ambience: crackle + wind.
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.connect(this.master);
    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuffer(ctx);
    crackle.loop = true;
    const crackleLp = ctx.createBiquadFilter();
    crackleLp.type = 'lowpass';
    crackleLp.frequency.value = 5200;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.5;
    crackle.connect(crackleLp).connect(crackleGain).connect(this.ambienceGain);
    crackle.start();
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx);
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 380;
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.02;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.ambienceGain);
    wind.start();
    this.applyVolumes();
  }

  setVolumes(v: Partial<AudioVolumes>): void {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this.volumes;
    // Perceptual (squared) curves so the sliders feel even.
    this.master!.gain.setTargetAtTime(v.master * v.master, ctx.currentTime, 0.05);
    this.musicGain!.gain.setTargetAtTime(v.music * v.music * 0.9, ctx.currentTime, 0.05);
    this.sfxGain!.gain.setTargetAtTime(v.sfx * v.sfx, ctx.currentTime, 0.05);
    this.ambienceGain!.gain.setTargetAtTime(v.ambience * v.ambience * 0.8, ctx.currentTime, 0.05);
  }

  /** Plays a named effect now. Rapid repeats of one effect are thinned. */
  play(name: string, options: SfxOptions = {}): void {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.sfxGain) return;
    const effect = SFX[name];
    if (!effect) return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.035) return;
    this.lastPlayed.set(name, now);
    effect(ctx, this.sfxGain, now + 0.005, { strength: options.strength ?? 1, pan: options.pan ?? 0, kind: options.kind ?? '' });
  }

  /** Per-frame: score state, ducking and the wind bed. */
  update(state: AudioState): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.music) return;
    const mood = state.mood === 'finale' ? FINALE_MOOD : MOODS[Math.max(0, Math.min(MOODS.length - 1, state.mood))];
    this.music.set(mood, state.intensity);
    this.music.schedule(ctx.currentTime);
    const now = ctx.currentTime;
    this.tone!.frequency.setTargetAtTime(state.menu ? 650 : this.music.mood.tone, now, 0.25);
    this.windGain!.gain.setTargetAtTime(0.015 + state.wind * 0.12, now, 0.3);
    this.windFilter!.frequency.setTargetAtTime(300 + state.wind * 900, now, 0.3);
  }
}
