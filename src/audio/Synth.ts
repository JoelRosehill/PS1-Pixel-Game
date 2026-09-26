/**
 * Synth voices for the procedural score and sound effects (Job 10). Every voice is a
 * small graph of native WebAudio nodes scheduled at time `t` and stopped when it has
 * decayed, so nothing needs to be tracked afterwards. All voices work on any
 * BaseAudioContext, which lets tests render them offline.
 */

export type Ctx = BaseAudioContext;

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

/** Two seconds of white noise, shared per context. */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** A gain node with an attack / exponential-decay envelope. */
function envelope(ctx: Ctx, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function osc(ctx: Ctx, type: OscillatorType, freq: number, t: number, stop: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(stop);
  return o;
}

function noise(ctx: Ctx, t: number, stop: number, offset = Math.random() * 1.5): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  n.loop = true;
  n.start(t, offset);
  n.stop(stop);
  return n;
}

function panner(ctx: Ctx, pan: number, out: AudioNode): AudioNode {
  if (!pan || !('createStereoPanner' in ctx)) return out;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(out);
  return p;
}

// --- instruments --------------------------------------------------------------

/** Electric piano: two-operator FM with a decaying index and a soft tine. */
export function epiano(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, vel: number, pan = 0): void {
  const end = t + dur + 0.6;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(0.16 * vel, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.07 * vel, t + 0.5);
  amp.gain.setValueAtTime(0.07 * vel, t + dur);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  amp.connect(panner(ctx, pan, out));
  const carrier = osc(ctx, 'sine', freq, t, end);
  const mod = osc(ctx, 'sine', freq, t, end);
  const index = ctx.createGain();
  index.gain.setValueAtTime(freq * 1.6 * vel, t);
  index.gain.exponentialRampToValueAtTime(freq * 0.12, t + 0.9);
  mod.connect(index).connect(carrier.frequency);
  carrier.connect(amp);
  const tine = osc(ctx, 'sine', freq * 4.02, t, t + 0.25);
  const tg = envelope(ctx, t, 0.025 * vel, 0.002, 0.2);
  tine.connect(tg).connect(amp);
}

/** Kalimba / bell: a sine with short inharmonic partials. */
export function bell(ctx: Ctx, out: AudioNode, t: number, freq: number, vel: number, pan = 0, decay = 1.6): void {
  const dest = panner(ctx, pan, out);
  const partials: [number, number, number][] = [[1, 0.2, decay], [2.76, 0.06, decay * 0.35], [5.4, 0.025, decay * 0.15]];
  for (const [ratio, level, d] of partials) {
    const o = osc(ctx, 'sine', freq * ratio, t, t + d + 0.05);
    o.connect(envelope(ctx, t, level * vel, 0.003, d)).connect(dest);
  }
}

/** Round bass: triangle under a low-pass plus a sine sub. */
export function bass(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, vel: number): void {
  const end = t + dur + 0.12;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(0.3 * vel, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.18 * vel, t + dur);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  lp.Q.value = 0.7;
  osc(ctx, 'triangle', freq, t, end).connect(lp);
  const sub = osc(ctx, 'sine', freq / 2, t, end);
  const sg = ctx.createGain();
  sg.gain.value = 0.7;
  sub.connect(sg).connect(lp);
  lp.connect(amp).connect(out);
}

/** Slow pad: detuned saws through a low-pass with a gentle swell. */
export function pad(ctx: Ctx, out: AudioNode, t: number, freqs: number[], dur: number, vel: number, cutoff = 900): void {
  const end = t + dur + 2;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(0.05 * vel, t + Math.min(1.4, dur * 0.4));
  amp.gain.setValueAtTime(0.05 * vel, t + dur);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.connect(amp).connect(out);
  for (const f of freqs) {
    for (const detune of [-7, 7]) {
      const o = osc(ctx, 'sawtooth', f, t, end);
      o.detune.value = detune;
      o.connect(lp);
    }
  }
}

// --- drums ----------------------------------------------------------------------

export function kick(ctx: Ctx, out: AudioNode, t: number, vel: number): void {
  const o = osc(ctx, 'sine', 115, t, t + 0.4);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  o.connect(envelope(ctx, t, 0.55 * vel, 0.003, 0.34)).connect(out);
}

export function snare(ctx: Ctx, out: AudioNode, t: number, vel: number): void {
  const n = noise(ctx, t, t + 0.25);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 0.7;
  n.connect(bp).connect(envelope(ctx, t, 0.22 * vel, 0.002, 0.17)).connect(out);
  osc(ctx, 'triangle', 185, t, t + 0.12).connect(envelope(ctx, t, 0.16 * vel, 0.002, 0.08)).connect(out);
}

export function hat(ctx: Ctx, out: AudioNode, t: number, vel: number, open = false): void {
  const d = open ? 0.2 : 0.045;
  const n = noise(ctx, t, t + d + 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6800;
  n.connect(hp).connect(envelope(ctx, t, 0.09 * vel, 0.001, d)).connect(out);
}

// --- effect building blocks -------------------------------------------------------

/** Filtered noise whose band sweeps from `f0` to `f1` (whooshes, swings, dashes). */
export function sweep(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, dur: number, level: number, q = 1.2, pan = 0): void {
  const n = noise(ctx, t, t + dur + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp).connect(g).connect(panner(ctx, pan, out));
}

/** A pitched blip that glides from `f0` to `f1`. */
export function blip(ctx: Ctx, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, level: number): void {
  const o = osc(ctx, type, f0, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(envelope(ctx, t, level, 0.004, dur)).connect(out);
}

/** A low thump (impacts, landings). */
export function thump(ctx: Ctx, out: AudioNode, t: number, f0: number, level: number, dur = 0.18): void {
  const o = osc(ctx, 'sine', f0, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(Math.max(25, f0 * 0.35), t + dur);
  o.connect(envelope(ctx, t, level, 0.002, dur)).connect(out);
}

/** A short click of noise (contact transients). */
export function click(ctx: Ctx, out: AudioNode, t: number, freq: number, level: number, dur = 0.03): void {
  const n = noise(ctx, t, t + dur + 0.02);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = freq;
  n.connect(hp).connect(envelope(ctx, t, level, 0.001, dur)).connect(out);
}

/** Metallic ring: inharmonic partials (parries, clangs). */
export function metal(ctx: Ctx, out: AudioNode, t: number, base: number, level: number, decay = 0.7): void {
  for (const [ratio, l, d] of [[1, 1, 1], [1.47, 0.6, 0.8], [2.09, 0.45, 0.55], [2.76, 0.3, 0.4], [3.93, 0.2, 0.25]] as const) {
    osc(ctx, 'sine', base * ratio, t, t + decay * d + 0.05).connect(envelope(ctx, t, level * l * 0.3, 0.001, decay * d)).connect(out);
  }
}

/** A growl: distorted low saw under a closing low-pass (boss roars). */
export function growl(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, level: number): void {
  const end = t + dur + 0.1;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
  shaper.curve = curve;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600, t);
  lp.frequency.exponentialRampToValueAtTime(180, end);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(level, t + 0.15);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  for (const [ratio, detune] of [[1, 0], [1, 14], [0.5, -9]] as const) {
    const o = osc(ctx, 'sawtooth', freq * ratio, t, end);
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq * ratio * 1.2, t);
    o.frequency.exponentialRampToValueAtTime(freq * ratio * 0.8, end);
    o.connect(shaper);
  }
  shaper.connect(lp).connect(amp).connect(out);
  sweep(ctx, out, t, 900, 200, dur, level * 0.6, 0.6);
}

/** Vinyl crackle and hiss, as a loopable buffer. */
export function crackleBuffer(ctx: Ctx, seconds = 4): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 98765;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    lp += ((rand() * 2 - 1) - lp) * 0.2;
    data[i] = lp * 0.035;
  }
  const pops = Math.floor(seconds * 22);
  for (let k = 0; k < pops; k++) {
    const at = Math.floor(rand() * (data.length - 40));
    const amp = (0.15 + rand() * rand() * 0.85) * (rand() < 0.5 ? -1 : 1);
    for (let j = 0; j < 30; j++) data[at + j] += amp * Math.exp(-j / 4);
  }
  return buffer;
}
