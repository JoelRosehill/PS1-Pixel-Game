import * as THREE from 'three';
import { lerp, Noise2D, smoothstep } from '../../core/Noise';
import type { BiomeDef } from '../biomes/BiomeTypes';
import { azimuthOf, type BiomeSite, type Pass, SECTOR, WORLD, type WorldAtlas } from './WorldAtlas';

/** The hand-made hub (The Threshold) supplies its own ground inside `WORLD.hubInner`. */
export interface HubTerrain {
  baseHeight(x: number, z: number): number;
  colorAt(x: number, z: number, h: number, slope: number, out: THREE.Color): void;
}

/** Keeps the spawn → citadel sightline open as it leaves the hub (see ProvingGrounds). */
const CITADEL_AZ = Math.atan2(54, 760);

/**
 * The world's ground as pure functions of (x, z): per-biome shape and colour from
 * `BiomeDef.terrain`/`palette`, blended across soft Voronoi borders, with sector
 * ridges, carved passes, the hub in the middle and mountains at the world's edge.
 * Being analytic, it serves rendering, collision and AI with no baked data.
 */
export class WorldTerrain {
  private readonly noises = new Map<number, Noise2D>();
  private readonly global = new Noise2D('world');
  private readonly sites: BiomeSite[] = [];
  private readonly w: number[] = [];
  private readonly colorSites: BiomeSite[] = [];
  private readonly colorW: number[] = [];
  private readonly tmp = new THREE.Color();
  /** Ground height on each side of every pass, for its smooth ramp (lazily cached). */
  private readonly passEnds = new Map<Pass, [number, number]>();
  private readonly acc = new THREE.Color();
  private readonly sample = new THREE.Color();
  private readonly paint = new THREE.Color();

  constructor(readonly atlas: WorldAtlas, private readonly hub: HubTerrain) {}

  private noise(site: BiomeSite): Noise2D {
    let n = this.noises.get(site.seed);
    if (!n) { n = new Noise2D(site.seed); this.noises.set(site.seed, n); }
    return n;
  }

  /** Weight of the hand-made hub at a radius (1 inside, 0 beyond `hubOuter`). */
  hubWeight(x: number, z: number): number {
    return 1 - smoothstep(WORLD.hubInner, WORLD.hubOuter, Math.hypot(x, z));
  }

  heightAt = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    if (r <= WORLD.hubInner) return this.hub.baseHeight(x, z);
    const world = this.worldHeight(x, z, r);
    const hubW = 1 - smoothstep(WORLD.hubInner, WORLD.hubOuter, r);
    const h = hubW > 0 ? lerp(world, this.hub.baseHeight(x, z), hubW) : world;
    return h + this.rampart(x, z, r);
  };

  /**
   * Mountains ringing the hub (450–760 m), broken only by the northern valley toward
   * the Spire Citadel — the hub's single way out, matching its enclosing wall.
   */
  private rampart(x: number, z: number, r: number): number {
    const ring = smoothstep(450, 540, r) * (1 - smoothstep(640, 780, r));
    if (ring <= 0) return 0;
    const az = azimuthOf(x, z);
    const off = Math.abs(Math.atan2(Math.sin(az - CITADEL_AZ), Math.cos(az - CITADEL_AZ)));
    const open = Math.exp(-((off / 0.085) ** 2));
    return ring * (1 - open) * (55 + this.global.ridged(x * 0.008, z * 0.008, 4) * 75);
  }

  /** Blended biome ground only (no ridges, passes or edge). */
  private blendedHeight(x: number, z: number): number {
    const count = this.atlas.weights(x, z, this.sites, this.w);
    let h = 0;
    for (let i = 0; i < count; i++) h += this.w[i] * this.biomeHeight(this.sites[i], x, z);
    return h;
  }

  private worldHeight(x: number, z: number, r: number): number {
    let h = this.blendedHeight(x, z);

    // Sector ridges with a carved pass (sealed between Chapter VIII and Chapter I).
    const { distance, index } = this.atlas.boundary(x, z);
    const pass = this.atlas.passFor(index);
    const carve = pass ? Math.exp(-(((r - pass.r) / 60) ** 2)) : 0;
    const ridgeK = (1 - smoothstep(20, 130, distance)) * smoothstep(WORLD.ridgeStart, WORLD.ridgeStart + 260, r);
    if (ridgeK > 0) {
      // Jagged crests, not smooth walls.
      const ridgeH = 55 + this.global.ridged(x * 0.006, z * 0.006, 4) * 70 + this.global.fbm(x * 0.03, z * 0.03, 2) * 6;
      h += ridgeK * (1 - carve * 0.97) * ridgeH;
    }
    // The pass itself is a smooth ramp between the ground on either side, so it is
    // always walkable whatever cliffs the neighbouring biomes have.
    if (pass && carve > 1e-3) {
      const az = azimuthOf(x, z);
      const bAz = index * SECTOR + SECTOR / 2;
      const t = Math.atan2(Math.sin(az - bAz), Math.cos(az - bAz)) * r;
      const corridor = carve * (1 - smoothstep(150, 200, Math.abs(t)));
      if (corridor > 0) {
        const [left, right] = this.passEndsFor(pass);
        h = lerp(h, lerp(left, right, smoothstep(-200, 200, t)), corridor);
      }
    }

    // Keep the hub's northern valley open toward the citadel for a while.
    const az = azimuthOf(x, z);
    const off = Math.abs(Math.atan2(Math.sin(az - CITADEL_AZ), Math.cos(az - CITADEL_AZ)));
    const valley = Math.exp(-((off / 0.06) ** 2)) * (1 - smoothstep(900, 1350, r));
    if (valley > 0) h = lerp(h, Math.min(h, 7), valley * 0.85);

    // World's edge: a ring of great mountains.
    const edge = smoothstep(WORLD.edgeStart, WORLD.edgeFull, r);
    if (edge > 0) h += edge * (240 + this.global.ridged(x * 0.0016, z * 0.0016, 4) * 380);
    return h;
  }

  private passEndsFor(pass: Pass): [number, number] {
    let ends = this.passEnds.get(pass);
    if (!ends) {
      const sample = (t: number) => {
        const a = pass.azimuth + t / pass.r;
        return Math.max(1, this.blendedHeight(Math.sin(a) * pass.r, -Math.cos(a) * pass.r));
      };
      ends = [sample(-200), sample(200)];
      this.passEnds.set(pass, ends);
    }
    return ends;
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
      // Flat steps with sharp risers.
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
        const depth = -0.5 - smoothstep(threshold + 0.1, threshold + 0.45, lake) * 3;
        h = lerp(h, Math.min(h, depth), k);
      }
    }
    return h;
  }

  /** Ground colour (vertex colour of terrain tiles). */
  colorAt = (x: number, z: number, h: number, slope: number, out: THREE.Color): void => {
    const r = Math.hypot(x, z);
    const hubW = 1 - smoothstep(WORLD.hubInner, WORLD.hubOuter, r);
    if (hubW >= 1) { this.hub.colorAt(x, z, h, slope, out); return; }
    const count = this.atlas.weights(x, z, this.colorSites, this.colorW);
    this.acc.setRGB(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.biomeColor(this.colorSites[i], x, z, h, slope, this.sample);
      this.acc.r += this.sample.r * this.colorW[i];
      this.acc.g += this.sample.g * this.colorW[i];
      this.acc.b += this.sample.b * this.colorW[i];
    }
    // Ridges and world-edge mountains read as bare rock and snow.
    const edge = smoothstep(WORLD.edgeStart, WORLD.edgeFull, r);
    if (edge > 0) this.acc.lerp(this.tmp.set(0x6a6474), edge * 0.6).lerp(this.tmp.set(0xd8d4ec), smoothstep(160, 260, h) * edge);
    out.copy(this.acc);
    if (hubW > 0) {
      this.hub.colorAt(x, z, h, slope, this.tmp);
      out.lerp(this.tmp, hubW);
    }
  };

  private biomeColor(site: BiomeSite, x: number, z: number, h: number, slope: number, out: THREE.Color): void {
    const p = site.biome.palette;
    const t = site.biome.terrain;
    const n = this.noise(site);
    const n1 = n.get(x * 0.035, z * 0.035) * 0.5 + 0.5;
    const n2 = n.get(x * 0.21 + 3, z * 0.21 - 8) * 0.5 + 0.5;
    const rel = (h - t.base) / Math.max(4, t.amplitude + t.ridgeAmp * 0.5);
    out.set(p.low).lerp(this.paint.set(p.mid), smoothstep(-0.3, 0.35, rel + (n1 - 0.5) * 0.4));
    out.lerp(this.paint.set(p.high), smoothstep(0.35, 0.9, rel));
    out.multiplyScalar(0.9 + n2 * 0.18);
    if (n1 > 0.72) out.lerp(this.paint.set(p.accent), smoothstep(0.72, 0.9, n1) * 0.55);
    // Waterline and shallows.
    out.lerp(this.paint.set(p.shore), 1 - smoothstep(0.2, 1.4, h));
    // Steep ground is rock (with strata bands where the palette asks for them).
    const rock = smoothstep(0.32, 0.58, slope);
    if (rock > 0) {
      this.paint.set(p.rock);
      if (p.strata) this.paint.multiplyScalar(1 + Math.sin(h * 0.9) * p.strata);
      out.lerp(this.paint, rock);
    }
    if (p.peak !== undefined) out.lerp(this.paint.set(p.peak), smoothstep(t.base + t.amplitude + t.ridgeAmp * 0.55, t.base + t.amplitude + t.ridgeAmp * 0.9, h));
    if (t.crater) {
      // The cavern floor is ice.
      const d = Math.hypot(x - site.x, z - site.z);
      const R = site.radius * t.crater.radius;
      out.lerp(this.paint.set(p.low), (1 - smoothstep(R * 0.6, R * 0.8, d)) * 0.8);
    }
  }

  /**
   * Biome mix around (x, z) with a wide blend for sky and mood, as preset → weight,
   * plus the dominant site. The hub counts as its own preset.
   */
  moodAt(x: number, z: number, hubPreset: string, out: Map<string, number>): BiomeSite | null {
    out.clear();
    const hubW = 1 - smoothstep(WORLD.hubInner - 60, WORLD.hubOuter + 60, Math.hypot(x, z));
    if (hubW > 0) out.set(hubPreset, hubW);
    if (hubW >= 1) return null;
    const count = this.atlas.weights(x, z, this.colorSites, this.colorW, 140, 3);
    for (let i = 0; i < count; i++) {
      const id = this.colorSites[i].biome.sky;
      out.set(id, (out.get(id) ?? 0) + this.colorW[i] * (1 - hubW));
    }
    return this.colorSites[0];
  }

  biomeAt(x: number, z: number): BiomeDef | null {
    if (this.hubWeight(x, z) > 0.5) return null;
    return this.atlas.nearest(x, z).biome;
  }
}
