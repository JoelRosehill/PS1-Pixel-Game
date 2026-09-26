import * as THREE from 'three';
import { lerp, Noise2D, smoothstep } from '../../core/Noise';
import type { BiomeDef } from '../biomes/BiomeTypes';
import { type BiomeSite, WORLD, type WorldAtlas } from './WorldAtlas';

/** Levelled ground: a structure's footprint or an arena. */
interface Plateau { x: number; z: number; r: number; h: number; blend: number }

const PLATEAU_CELL = 256;

/**
 * The world's ground as pure functions of (x, z) (Job 15). Around the road, each biome's
 * own relief (hills, lakes, terraces, canyons) sits on the road's smooth height profile;
 * the road bed itself is levelled; beyond the valley edge the ground climbs into colossal
 * ridged mountains (hundreds of metres) that separate the turns of the spiral — or, on the
 * Sunkeepers' Coast, falls away into the sea. Structures and arenas stand on levelled
 * plateaus so nothing floats. Analytic, so rendering, collision and AI share it.
 */
export class WorldTerrain {
  private readonly noises = new Map<number, Noise2D>();
  private readonly mountains = new Noise2D('mountains');
  private readonly sites: BiomeSite[] = [];
  private readonly w: number[] = [];
  private readonly colorSites: BiomeSite[] = [];
  private readonly colorW: number[] = [];
  private readonly tmp = new THREE.Color();
  private readonly plateauCells = new Map<number, Plateau[]>();
  private readonly acc = new THREE.Color();
  private readonly sample = new THREE.Color();
  private readonly paint = new THREE.Color();

  constructor(readonly atlas: WorldAtlas) {
    // The road climbs through each biome at its base height.
    atlas.buildProfile(s => {
      const n = atlas.weightsAtS(s, this.sites, this.w, 220);
      let h = 0;
      for (let i = 0; i < n; i++) h += this.w[i] * this.sites[i].biome.terrain.base;
      return h;
    });
  }

  private noise(site: BiomeSite): Noise2D {
    let n = this.noises.get(site.seed);
    if (!n) { n = new Noise2D(site.seed); this.noises.set(site.seed, n); }
    return n;
  }

  /** The great mountains between the turns of the road (absolute height, m). */
  mountainHeight(x: number, z: number): number {
    const m = this.mountains;
    // Broad massifs (fbm) carrying sharp ridges and peaks (ridged), then rock detail.
    const massif = m.fbm(x * 0.0007 + 3, z * 0.0007 - 8, 3) * 0.5 + 0.5;
    const r = m.ridged(x * 0.0019, z * 0.0019, 4);
    return 170 + massif * 260 + r * r * 300 + m.fbm(x * 0.008 + 9, z * 0.008 - 4, 3) * 26;
  }

  /** Ground before plateaus. */
  private natural(x: number, z: number): number {
    const a = this.atlas;
    const hit = a.near(x, z);
    const s = hit.s, d = hit.d;
    const W = a.widthAt(s);
    const road = a.roadHeight(s);

    // Biome relief on the road's profile, levelled toward the road bed.
    let relief = 0;
    const count = a.weightsAtS(s, this.sites, this.w);
    for (let i = 0; i < count; i++) {
      const site = this.sites[i];
      relief += this.w[i] * (this.biomeHeight(site, x, z) - site.biome.terrain.base);
    }
    // Relief grows with distance from the road: a levelled bed, then the biome's shape.
    let h = road + relief * smoothstep(5, 26, d);
    // The valley floor rises a little toward its edges (foothills).
    h += smoothstep(W * 0.45, W, d) * 14 * (0.6 + this.mountains.get(x * 0.01, z * 0.01) * 0.4);

    const sea = hit.d > 1 ? a.seaAt(s, hit.side) : 0;
    const M = this.mountainHeight(x, z);
    const wall = smoothstep(W * 0.92, W + WORLD.wallRise, d);
    if (sea < 1) h = lerp(h, Math.max(h, M), wall * (1 - sea));
    if (sea > 0) {
      // Beaches, then open water, then sea cliffs where the next turn's mountains begin.
      const shore = lerp(h, -16, smoothstep(W * 0.55, W + 140, d));
      const cliffs = lerp(shore, M, smoothstep(W + 650, W + 950, d));
      h = lerp(h, cliffs, sea);
    }
    // The start and the end of the road are closed valleys (the mountains close around).
    // The Dawnspire's plaza at the centre of the world.
    const rc = Math.hypot(x, z);
    if (rc < WORLD.plaza + 120) h = lerp(h, a.roadHeight(a.road.length), 1 - smoothstep(WORLD.plaza, WORLD.plaza + 120, rc));
    return h;
  }

  heightAt = (x: number, z: number): number => {
    let h = this.natural(x, z);
    const list = this.plateauCells.get(this.cellKey(x, z));
    if (list) for (const p of list) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + p.blend) h = lerp(h, p.h, 1 - smoothstep(p.r, p.r + p.blend, d));
    }
    return h;
  };

  private cellKey(x: number, z: number): number {
    return Math.floor(x / PLATEAU_CELL) * 73856093 + Math.floor(z / PLATEAU_CELL) * 19349663;
  }

  /**
   * Levels a circle to `height` with a soft `blend` (structures, arenas). Returns the
   * height used. Must be called before the ground around it is sampled for rendering.
   */
  addPlateau(x: number, z: number, radius: number, height: number, blend = 30): number {
    const p: Plateau = { x, z, r: radius, h: height, blend };
    const reach = radius + blend;
    for (let gz = Math.floor((z - reach) / PLATEAU_CELL); gz <= Math.floor((z + reach) / PLATEAU_CELL); gz++)
      for (let gx = Math.floor((x - reach) / PLATEAU_CELL); gx <= Math.floor((x + reach) / PLATEAU_CELL); gx++) {
        const key = gx * 73856093 + gz * 19349663;
        let list = this.plateauCells.get(key);
        if (!list) this.plateauCells.set(key, (list = []));
        list.push(p);
      }
    return height;
  }

  /** Average ground height over a disc (for choosing a plateau level). */
  averageHeight(x: number, z: number, radius: number): number {
    let sum = this.heightAt(x, z), n = 1;
    for (const f of [0.4, 0.8]) for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      sum += this.heightAt(x + Math.sin(a) * radius * f, z + Math.cos(a) * radius * f); n++;
    }
    return sum / n;
  }

  /** Shape of a single biome at (x, z), before blending. */
  biomeHeight(site: BiomeSite, x: number, z: number): number {
    const t = site.biome.terrain;
    const n = this.noise(site);
    const wx = x + n.fbm(x * 0.0017 + 11, z * 0.0017 - 7, 2) * t.warp;
    const wz = z + n.fbm(x * 0.0017 - 3, z * 0.0017 + 5, 2) * t.warp;
    let h = t.base + n.fbm(wx * t.frequency, wz * t.frequency, 4) * t.amplitude;
    const ridge = n.ridged(wx * t.ridgeFrequency + 50, wz * t.ridgeFrequency - 20, 4);
    h += ridge * ridge * t.ridgeAmp;

    if (t.terraces) {
      const s = t.terraces.step;
      const q = Math.floor(h / s);
      const f = h / s - q;
      h = (q + smoothstep(t.terraces.sharpness, 1, f)) * s;
    }
    if (t.crater) {
      const d = Math.hypot(x - site.x, z - site.z);
      const R = site.radius * t.crater.radius;
      const inside = 1 - smoothstep(R * 0.7, R, d);
      const floor = t.crater.floor + n.fbm(x * 0.02, z * 0.02, 2) * 1.5;
      h = lerp(h, floor, inside);
      h += t.crater.rim * Math.exp(-(((d - R * 1.05) / (R * 0.14)) ** 2));
    }
    if (t.canyons) {
      const f = t.canyons.frequency;
      const c = Math.abs(n.fbm(wx * f + 300, wz * f - 100, 3));
      const k = 1 - smoothstep(t.canyons.width * 0.45, t.canyons.width, c);
      const floor = t.canyons.floor + n.get(x * 0.03, z * 0.03) * 1.2;
      h = lerp(h, floor, k);
    }
    if (t.water > 0) {
      const lake = n.fbm(x * t.waterScale + 100, z * t.waterScale - 40, 3);
      const threshold = 1 - t.water * 1.7;
      const k = smoothstep(threshold, threshold + 0.14, lake);
      if (k > 0) {
        // Lakes reach below the sea-level water plane (the road profile ≈ the base, so the
        // relief keeps them there).
        const depth = -0.5 - smoothstep(threshold + 0.1, threshold + 0.45, lake) * 3;
        h = lerp(h, Math.min(h, depth), k);
      }
    }
    return h;
  }

  /** Ground colour (vertex colour of terrain tiles). */
  colorAt = (x: number, z: number, h: number, slope: number, out: THREE.Color): void => {
    const a = this.atlas;
    const hit = a.near(x, z);
    const count = a.weightsAtS(hit.s, this.colorSites, this.colorW);
    this.acc.setRGB(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.biomeColor(this.colorSites[i], x, z, h, slope, this.sample);
      this.acc.r += this.sample.r * this.colorW[i];
      this.acc.g += this.sample.g * this.colorW[i];
      this.acc.b += this.sample.b * this.colorW[i];
    }
    out.copy(this.acc);
    // The road: packed earth with a paler crown, worn at the edges.
    const edge = 3.2 + this.mountains.get(x * 0.4, z * 0.4) * 0.6;
    if (hit.d < edge + 1.2) {
      const site = this.colorSites[0];
      this.paint.set(site.biome.palette.shore).lerp(this.tmp.set(0x8a7458), 0.55);
      if (hit.d < 1.1) this.paint.multiplyScalar(1.12);
      out.lerp(this.paint, 1 - smoothstep(edge, edge + 1.2, hit.d));
    }
    // Mountains: bare rock with snow on the heights.
    const W = a.widthAt(hit.s);
    const mountain = smoothstep(W, W + WORLD.wallRise * 0.7, hit.d);
    if (mountain > 0) {
      const rock = this.tmp.set(this.colorSites[0].biome.palette.rock).lerp(this.paint.set(0x6a6474), 0.4);
      out.lerp(rock, mountain * Math.max(0.55, smoothstep(0.2, 0.45, slope)));
      out.lerp(this.paint.set(0xe4e0f0), smoothstep(330, 420, h + this.mountains.get(x * 0.02, z * 0.02) * 30) * mountain);
    }
    if (h < -2) out.lerp(this.paint.set(0x1c3c40), smoothstep(-2, -8, h));
  };

  private biomeColor(site: BiomeSite, x: number, z: number, h: number, slope: number, out: THREE.Color): void {
    const p = site.biome.palette;
    const t = site.biome.terrain;
    const n = this.noise(site);
    const n1 = n.get(x * 0.035, z * 0.035) * 0.5 + 0.5;
    const n2 = n.get(x * 0.21 + 3, z * 0.21 - 8) * 0.5 + 0.5;
    const rel = (h - this.atlas.roadHeight(this.atlas.near(x, z).s)) / Math.max(4, t.amplitude + t.ridgeAmp * 0.5);
    out.set(p.low).lerp(this.paint.set(p.mid), smoothstep(-0.3, 0.35, rel + (n1 - 0.5) * 0.4));
    out.lerp(this.paint.set(p.high), smoothstep(0.35, 0.9, rel));
    out.multiplyScalar(0.9 + n2 * 0.18);
    if (n1 > 0.72) out.lerp(this.paint.set(p.accent), smoothstep(0.72, 0.9, n1) * 0.55);
    // Waterline and shallows.
    out.lerp(this.paint.set(p.shore), 1 - smoothstep(0.2, 1.4, h));
    const road = this.atlas.roadHeight(this.atlas.near(x, z).s);
    const rock = smoothstep(0.32, 0.58, slope);
    if (rock > 0) {
      this.paint.set(p.rock);
      if (p.strata) this.paint.multiplyScalar(1 + Math.sin(h * 0.9) * p.strata);
      out.lerp(this.paint, rock);
    }
    if (p.peak !== undefined) out.lerp(this.paint.set(p.peak), smoothstep(road + t.amplitude + t.ridgeAmp * 0.55, road + t.amplitude + t.ridgeAmp * 0.9, h));
    if (t.crater) {
      const d = Math.hypot(x - site.x, z - site.z);
      const R = site.radius * t.crater.radius;
      out.lerp(this.paint.set(p.low), (1 - smoothstep(R * 0.6, R * 0.8, d)) * 0.8);
    }
  }

  /**
   * Biome mix around (x, z) with a wide blend for sky and mood, as preset → weight,
   * plus the dominant site.
   */
  moodAt(x: number, z: number, out: Map<string, number>): BiomeSite {
    out.clear();
    const count = this.atlas.weights(x, z, this.colorSites, this.colorW, 160);
    for (let i = 0; i < count; i++) {
      const id = this.colorSites[i].biome.sky;
      out.set(id, (out.get(id) ?? 0) + this.colorW[i]);
    }
    return this.colorSites[0];
  }

  biomeAt(x: number, z: number): BiomeDef {
    return this.atlas.nearest(x, z).biome;
  }
}
