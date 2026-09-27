import { hashString } from '../../core/Random';
import type { BiomeDef } from '../biomes/BiomeTypes';
import type { Leg } from '../biomes/Journey';
import { Road, type RoadHit, ROAD } from '../route/Road';

/**
 * World layout (Job 15, "The Long Road"). The world is one journey: a road that spirals
 * inward from Hollowmere on the western rim to the Dawnspire at the centre, through forty
 * biomes in a fixed order. Each biome owns a stretch of the road and the valley around it;
 * colossal mountains rise between the turns of the spiral. Chapters meet at narrow gorges
 * held shut by a veil of mist until the chapter's boss is dead.
 *
 * Everything is positioned by arc length along the road (`s`), so the layout is authored
 * data (`Journey.ts`), not scattered Voronoi cells.
 */
export const WORLD = {
  /** Blend half-width between neighbouring biomes, along the road (m). */
  blend: 70,
  /** Mountains rise from the valley edge over this distance (m). */
  wallRise: 360,
  /** Half-width of the gorge at a chapter gate (m). */
  gorge: 62,
  /** Invisible walls stand this far beyond the valley edge. */
  wallOffset: 110,
  /** The Dawnspire's plaza (radius, m) at the centre of the world. */
  plaza: 470,
  /** Half-extent of the playable world (m). */
  extent: ROAD.extent,
} as const;

export interface ChapterDef {
  /** 1-based chapter number. */
  index: number;
  name: string;
  /** Exactly five biomes, in road order. */
  biomes: BiomeDef[];
}

export interface BiomeSite {
  id: string;
  biome: BiomeDef;
  /** 1-based chapter. */
  chapter: number;
  /** 0..4 within the chapter. */
  slot: number;
  /** 0..39 along the road. */
  index: number;
  /** The site's centre on the road. */
  x: number;
  z: number;
  /** Rough radius of the site (half its road length, capped by its valley). */
  radius: number;
  seed: number;
  /** Road span [s0, s1] (m). */
  s0: number;
  s1: number;
  leg: Leg;
}

/** Where two chapters meet: a gorge on the road with a veil of mist. */
export interface ChapterGate {
  from: number;
  to: number;
  /** Arc length of the veil. */
  s: number;
  x: number;
  z: number;
  /** Direction of travel there. */
  tx: number;
  tz: number;
  /** Half-width of the gorge. */
  width: number;
}

export class WorldAtlas {
  readonly road: Road;
  readonly sites: BiomeSite[] = [];
  readonly gates: ChapterGate[] = [];
  /** Where the journey begins (a little way into Hollowmere, facing along the road). */
  readonly start: { x: number; z: number; yaw: number };
  private readonly hit: RoadHit = { s: 0, d: 0, side: 1, x: 0, z: 0, tx: 1, tz: 0 };
  private hx = NaN;
  private hz = NaN;
  /** Road height profile (m) per road sample. */
  private readonly profile: Float64Array;

  constructor(readonly chapters: ChapterDef[], legs: Leg[]) {
    const total = legs.reduce((a, l) => a + l.length, 0);
    // The approach to the plaza adds about (inner − plaza) metres beyond the spiral.
    const spiral = Math.max(1000, total - (ROAD.inner - ROAD.plaza));
    this.road = new Road(spiral, s => 95 * Math.sin(s / 610 + 0.7) + 55 * Math.sin(s / 237 + 2.1) + 25 * Math.sin(s / 97));
    const scale = this.road.length / total;
    let s = 0;
    const slots = new Map<number, number>();
    legs.forEach((leg, index) => {
      const slot = slots.get(leg.chapter) ?? 0;
      slots.set(leg.chapter, slot + 1);
      const s0 = s, s1 = s + leg.length * scale;
      s = s1;
      const mid = this.road.pointAt((s0 + s1) / 2);
      this.sites.push({
        id: `c${leg.chapter}-${slot}`, biome: leg.biome, chapter: leg.chapter, slot, index,
        x: mid.x, z: mid.z, radius: Math.min((s1 - s0) / 2, leg.width), seed: hashString(`${leg.chapter}:${slot}:${leg.biome.id}`),
        s0, s1, leg,
      });
    });
    for (let i = 1; i < this.sites.length; i++) {
      const a = this.sites[i - 1], b = this.sites[i];
      if (a.chapter === b.chapter) continue;
      const p = this.road.pointAt(b.s0);
      this.gates.push({ from: a.chapter, to: b.chapter, s: b.s0, x: p.x, z: p.z, tx: p.tx, tz: p.tz, width: WORLD.gorge });
    }
    const p0 = this.road.pointAt(40);
    this.start = { x: p0.x, z: p0.z, yaw: Math.atan2(-p0.tx, -p0.tz) };
    this.profile = new Float64Array(this.road.count);
  }

  /**
   * Fixes the road's height profile from the biome base heights (smoothed so the road
   * climbs and descends in long ramps). The terrain calls this once it can sample bases.
   */
  buildProfile(baseAt: (s: number) => number): void {
    const n = this.road.count;
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = Math.max(1.6, baseAt(i * ROAD.step));
    const tmp = new Float64Array(n);
    let src: Float64Array = raw;
    for (const radius of [18, 12]) {
      for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let k = -radius; k <= radius; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); sum += src[j]; c++; }
        tmp[i] = sum / c;
      }
      this.profile.set(tmp);
      src = this.profile;
    }
  }

  /** Height of the road bed at arc length `s`. */
  roadHeight(s: number): number {
    const f = Math.max(0, Math.min(this.road.count - 1.0001, s / ROAD.step));
    const i = Math.floor(f);
    return this.profile[i] + (this.profile[i + 1] - this.profile[i]) * (f - i);
  }

  /** Closest road point to (x, z), cached for repeated queries at the same point. */
  near(x: number, z: number): RoadHit {
    if (x !== this.hx || z !== this.hz) {
      this.road.nearest(x, z, this.hit);
      this.hx = x; this.hz = z;
    }
    return this.hit;
  }

  /** The site whose stretch of road contains arc length `s`. */
  siteAtS(s: number): BiomeSite {
    let lo = 0, hi = this.sites.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.sites[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return this.sites[lo];
  }

  /** 1-based chapter at (x, z). */
  chapterAt(x: number, z: number): number {
    return this.siteAtS(this.near(x, z).s).chapter;
  }

  nearest(x: number, z: number): BiomeSite {
    return this.siteAtS(this.near(x, z).s);
  }

  /**
   * Biome weights along the road at arc length `s`: up to two neighbouring sites, blended
   * over `width` metres either side of their border. Returns how many entries were written.
   */
  weightsAtS(s: number, outSites: BiomeSite[], outW: number[], width: number = WORLD.blend): number {
    const site = this.siteAtS(s);
    const i = site.index;
    outSites[0] = site;
    outW[0] = 1;
    let count = 1;
    const prev = this.sites[i - 1], next = this.sites[i + 1];
    if (prev && s - site.s0 < width) {
      const t = 0.5 + 0.5 * ((s - site.s0) / width);
      const k = t * t * (3 - 2 * t);
      outW[0] = k; outSites[1] = prev; outW[1] = 1 - k; count = 2;
    } else if (next && site.s1 - s < width) {
      const t = 0.5 + 0.5 * ((site.s1 - s) / width);
      const k = t * t * (3 - 2 * t);
      outW[0] = k; outSites[1] = next; outW[1] = 1 - k; count = 2;
    }
    return count;
  }

  /** Biome weights at a point (by its nearest road position). */
  weights(x: number, z: number, outSites: BiomeSite[], outW: number[], width: number = WORLD.blend): number {
    return this.weightsAtS(this.near(x, z).s, outSites, outW, width);
  }

  /** Valley half-width at arc length `s`, narrowing into gorges at chapter gates. */
  widthAt(s: number): number {
    const site = this.siteAtS(s);
    let w = site.leg.width;
    const i = site.index;
    const B = 160;
    const prev = this.sites[i - 1], next = this.sites[i + 1];
    if (prev && s - site.s0 < B) w = lerpW(prev.leg.width, w, 0.5 + 0.5 * (s - site.s0) / B);
    else if (next && site.s1 - s < B) w = lerpW(next.leg.width, w, 0.5 + 0.5 * (site.s1 - s) / B);
    for (const g of this.gates) {
      const d = Math.abs(s - g.s);
      if (d < 260) w += (g.width - w) * (1 - smooth(90, 260, d));
    }
    return w;
  }

  /** Share of the sea on one side of the valley at `s` (0 = mountains). */
  seaAt(s: number, side: number): number {
    const want = side > 0 ? 'left' : 'right';
    const sites: BiomeSite[] = [];
    const w: number[] = [];
    const n = this.weightsAtS(s, sites, w, 200);
    let k = 0;
    for (let i = 0; i < n; i++) if (sites[i].leg.sea === want) k += w[i];
    return k;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerpW(a: number, b: number, t: number): number {
  const k = smooth(0, 1, t);
  return a + (b - a) * k;
}
