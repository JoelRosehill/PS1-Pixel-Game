import * as THREE from 'three';
import { createSkyUniforms, type SkyUniforms } from './sky/SkyShader';
import { getSkyPreset, type SkyPreset } from './sky/SkyPresets';

const DEG = Math.PI / 180;

function dirFromAngles(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()) {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

const COLOR_KEYS = [
  'zenith', 'midSky', 'horizon', 'ground', 'moonColor', 'moonShadow', 'moonGlowColor', 'sunColor',
  'nebA', 'nebB', 'nebC', 'cloudColor', 'cloudLit', 'keyColor', 'hemiSky', 'hemiGround',
  'waterDeep', 'waterShallow', 'waterGlow',
] as const;
const NUM_KEYS = [
  'moonRadius', 'moonGlow', 'sunSize', 'sunGlow', 'nebStrength', 'stars', 'cloudCover',
  'fogDensity', 'fogStart', 'fogMax', 'fogFalloff', 'keyIntensity', 'hemiIntensity', 'waterGlowStrength', 'exposure',
] as const;
const VEC_KEYS = ['moonDir', 'sunDir', 'keyDir'] as const;

type AtmosphereState = {
  colors: Record<(typeof COLOR_KEYS)[number], THREE.Color>;
  nums: Record<(typeof NUM_KEYS)[number], number>;
  vecs: Record<(typeof VEC_KEYS)[number], THREE.Vector3>;
};

function resolve(p: SkyPreset): AtmosphereState {
  const c = (hex: number) => new THREE.Color(hex);
  const moonDir = dirFromAngles(p.moon.azimuth, p.moon.elevation);
  const sunDir = dirFromAngles(p.sun.azimuth, p.sun.elevation);
  return {
    colors: {
      zenith: c(p.zenith), midSky: c(p.midSky), horizon: c(p.horizon), ground: c(p.ground),
      moonColor: c(p.moon.color), moonShadow: c(p.moon.shadow), moonGlowColor: c(p.moon.glowColor),
      sunColor: c(p.sun.color), nebA: c(p.nebula.a), nebB: c(p.nebula.b), nebC: c(p.nebula.c),
      cloudColor: c(p.clouds.color), cloudLit: c(p.clouds.lit), keyColor: c(p.keyLight.color),
      hemiSky: c(p.hemi.sky), hemiGround: c(p.hemi.ground),
      waterDeep: c(p.water.deep), waterShallow: c(p.water.shallow), waterGlow: c(p.water.glow),
    },
    nums: {
      moonRadius: p.moon.radius * DEG, moonGlow: p.moon.glow, sunSize: p.sun.size * DEG, sunGlow: p.sun.glow,
      nebStrength: p.nebula.strength, stars: p.stars, cloudCover: p.clouds.cover,
      fogDensity: p.fog.density, fogStart: p.fog.start, fogMax: p.fog.max, fogFalloff: p.fog.falloff,
      keyIntensity: p.keyLight.intensity, hemiIntensity: p.hemi.intensity,
      waterGlowStrength: p.water.glowStrength, exposure: p.exposure,
    },
    vecs: {
      moonDir,
      sunDir,
      keyDir: (p.keyLight.from === 'sun' ? sunDir : moonDir).clone(),
    },
  };
}

function cloneState(s: AtmosphereState): AtmosphereState {
  const out = resolve(getSkyPreset(''));
  for (const k of COLOR_KEYS) out.colors[k].copy(s.colors[k]);
  for (const k of NUM_KEYS) out.nums[k] = s.nums[k];
  for (const k of VEC_KEYS) out.vecs[k].copy(s.vecs[k]);
  return out;
}

/**
 * Runtime owner of the sky/fog/lighting mood. Presets blend smoothly so biome
 * transitions (Job 6) can crossfade skies.
 */
export class Atmosphere {
  readonly sky: SkyUniforms = createSkyUniforms();
  readonly water = {
    uWaterDeep: { value: new THREE.Color() },
    uWaterShallow: { value: new THREE.Color() },
    uWaterGlow: { value: new THREE.Color() },
    uWaterGlowStrength: { value: 1 },
  };
  readonly fog = { density: 0.002, start: 30, max: 0.9, falloff: 50 };
  exposure = 1;

  readonly keyLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly group = new THREE.Group();

  presetId = '';
  /**
   * When true, `setWeights` (the world's biome blend at the viewer) drives the mood.
   * Any explicit `setPreset` (debug keys, URL `preset=`) turns it off.
   */
  biomeDriven = false;
  private readonly resolved = new Map<string, AtmosphereState>();
  private target: AtmosphereState | null = null;
  private from!: AtmosphereState;
  private to!: AtmosphereState;
  private current!: AtmosphereState;
  private blendT = 1;
  private blendDuration = 1;

  private readonly focus = new THREE.Vector3();
  private readonly shadowExtent = 55;

  constructor(initialPreset: string) {
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1);
    this.keyLight.castShadow = true;
    const sh = this.keyLight.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.left = -this.shadowExtent;
    sh.camera.right = this.shadowExtent;
    sh.camera.top = this.shadowExtent;
    sh.camera.bottom = -this.shadowExtent;
    sh.camera.near = 1;
    sh.camera.far = 420;
    sh.bias = -0.0006;
    sh.normalBias = 0.04;
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.group.add(this.keyLight, this.keyLight.target, this.hemiLight);

    const s = resolve(getSkyPreset(initialPreset));
    this.presetId = getSkyPreset(initialPreset).id;
    this.from = s;
    this.to = s;
    this.current = cloneState(s);
    this.apply(this.current);
  }

  setPreset(id: string, blendSeconds = 1.5): void {
    this.biomeDriven = false;
    this.target = null;
    const preset = getSkyPreset(id);
    this.presetId = preset.id;
    this.from = cloneState(this.current);
    this.to = resolve(preset);
    this.blendDuration = Math.max(0.0001, blendSeconds);
    this.blendT = blendSeconds <= 0 ? 1 : 0;
    if (this.blendT >= 1) {
      this.current = cloneState(this.to);
      this.apply(this.current);
    }
  }

  /**
   * Biome-driven mood: a weighted mix of presets (weights need not sum to 1). The live
   * state eases toward it, so walking across a border crossfades sky, fog and light.
   * Pass `instant` to snap (teleports, level start).
   */
  setWeights(weights: ReadonlyMap<string, number>, instant = false): void {
    if (!this.biomeDriven) return;
    let total = 0;
    for (const w of weights.values()) total += w;
    if (total <= 0) return;
    const t = this.target ?? (this.target = cloneState(this.current));
    for (const k of COLOR_KEYS) t.colors[k].setRGB(0, 0, 0);
    for (const k of NUM_KEYS) t.nums[k] = 0;
    for (const k of VEC_KEYS) t.vecs[k].set(0, 0, 0);
    let dominant = '';
    let best = 0;
    for (const [id, w] of weights) {
      if (w <= 0) continue;
      let s = this.resolved.get(id);
      if (!s) { s = resolve(getSkyPreset(id)); this.resolved.set(id, s); }
      const k = w / total;
      for (const key of COLOR_KEYS) t.colors[key].r += s.colors[key].r * k, t.colors[key].g += s.colors[key].g * k, t.colors[key].b += s.colors[key].b * k;
      for (const key of NUM_KEYS) t.nums[key] += s.nums[key] * k;
      for (const key of VEC_KEYS) t.vecs[key].addScaledVector(s.vecs[key], k);
      if (w > best) { best = w; dominant = id; }
    }
    for (const k of VEC_KEYS) if (t.vecs[k].lengthSq() < 1e-6) t.vecs[k].set(0, 1, 0); else t.vecs[k].normalize();
    this.presetId = dominant;
    this.blendT = 1;
    if (instant) {
      this.current = cloneState(t);
      this.apply(this.current);
    }
  }

  /** Keeps the shadow frustum centred on what the camera looks at. */
  setFocus(p: THREE.Vector3): void {
    this.focus.copy(p);
  }

  update(dt: number, elapsed: number): void {
    this.sky.uTime.value = elapsed;
    if (this.biomeDriven && this.target) {
      // Ease toward the biome mix (about a second to settle).
      const k = 1 - Math.exp(-dt * 2.5);
      const a = this.target;
      const c = this.current;
      for (const key of COLOR_KEYS) c.colors[key].lerp(a.colors[key], k);
      for (const key of NUM_KEYS) c.nums[key] += (a.nums[key] - c.nums[key]) * k;
      for (const key of VEC_KEYS) c.vecs[key].lerp(a.vecs[key], k).normalize();
      this.apply(c);
    } else if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDuration);
      const t = this.blendT * this.blendT * (3 - 2 * this.blendT);
      const a = this.from;
      const b = this.to;
      const c = this.current;
      for (const k of COLOR_KEYS) c.colors[k].lerpColors(a.colors[k], b.colors[k], t);
      for (const k of NUM_KEYS) c.nums[k] = a.nums[k] + (b.nums[k] - a.nums[k]) * t;
      for (const k of VEC_KEYS) c.vecs[k].lerpVectors(a.vecs[k], b.vecs[k], t).normalize();
      this.apply(c);
    }
    this.placeKeyLight();
  }

  private placeKeyLight(): void {
    const dir = this.current.vecs.keyDir;
    // Keep the light above the horizon so low moons still cast usable shadows.
    const d = new THREE.Vector3(dir.x, Math.max(dir.y, 0.35), dir.z).normalize();
    // Snap the focus to shadow-map texels in light space to stop shadow swimming.
    const texel = (this.shadowExtent * 2) / this.keyLight.shadow.mapSize.x;
    const up = Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, d).normalize();
    const lup = new THREE.Vector3().crossVectors(d, right);
    const fr = Math.round(this.focus.dot(right) / texel) * texel;
    const fu = Math.round(this.focus.dot(lup) / texel) * texel;
    const fd = this.focus.dot(d);
    const snapped = right.multiplyScalar(fr).add(lup.multiplyScalar(fu)).addScaledVector(d, fd);
    this.keyLight.target.position.copy(snapped);
    this.keyLight.position.copy(snapped).addScaledVector(d, 200);
  }

  private apply(s: AtmosphereState): void {
    const u = this.sky;
    const c = s.colors;
    const n = s.nums;
    u.uZenith.value.copy(c.zenith);
    u.uMidSky.value.copy(c.midSky);
    u.uHorizon.value.copy(c.horizon);
    u.uGround.value.copy(c.ground);
    u.uMoonDir.value.copy(s.vecs.moonDir);
    u.uMoonRadius.value = n.moonRadius;
    u.uMoonColor.value.copy(c.moonColor);
    u.uMoonShadow.value.copy(c.moonShadow);
    u.uMoonGlowColor.value.copy(c.moonGlowColor);
    u.uMoonGlow.value = n.moonGlow;
    u.uSunDir.value.copy(s.vecs.sunDir);
    u.uSunColor.value.copy(c.sunColor);
    u.uSunSize.value = n.sunSize;
    u.uSunGlow.value = n.sunGlow;
    u.uNebulaA.value.copy(c.nebA);
    u.uNebulaB.value.copy(c.nebB);
    u.uNebulaC.value.copy(c.nebC);
    u.uNebulaStrength.value = n.nebStrength;
    u.uStarBrightness.value = n.stars;
    u.uCloudColor.value.copy(c.cloudColor);
    u.uCloudLit.value.copy(c.cloudLit);
    u.uCloudCover.value = n.cloudCover;

    this.fog.density = n.fogDensity;
    this.fog.start = n.fogStart;
    this.fog.max = n.fogMax;
    this.fog.falloff = n.fogFalloff;
    this.exposure = n.exposure;

    this.keyLight.color.copy(c.keyColor);
    this.keyLight.intensity = n.keyIntensity;
    this.hemiLight.color.copy(c.hemiSky);
    this.hemiLight.groundColor.copy(c.hemiGround);
    this.hemiLight.intensity = n.hemiIntensity;

    this.water.uWaterDeep.value.copy(c.waterDeep);
    this.water.uWaterShallow.value.copy(c.waterShallow);
    this.water.uWaterGlow.value.copy(c.waterGlow);
    this.water.uWaterGlowStrength.value = n.waterGlowStrength;
  }
}
