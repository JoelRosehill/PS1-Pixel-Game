import { hash2, hashString } from '../../core/Random';
import type { BiomeDef } from '../biomes/BiomeTypes';

/**
 * World layout (Job 6). The Threshold hub sits at the origin; eight chapters fan out
 * around it as 45° sectors (Chapter I due north, then clockwise), each holding five
 * biome sites. Sectors are divided by mountain ridges with a single pass between
 * consecutive chapters; the Chapter VIII → I ridge is sealed, and the hub's only exit
 * is its northern valley into Chapter I. Job 7 gates the passes.
 */
export const WORLD = {
  /** Hub terrain is untouched inside this radius and fully replaced beyond `hubOuter`. */
  hubInner: 380,
  hubOuter: 600,
  /** World-edge mountains rise between these radii. */
  edgeStart: 4100,
  edgeFull: 4750,
  /** Sector ridges begin beyond this radius (the hub rim takes over inside). */
  ridgeStart: 650,
  /** Blend half-width between neighbouring biomes (m). */
  blend: 38,
} as const;

export const SECTOR = Math.PI / 4;

export interface ChapterDef {
  /** 1-based chapter number. */
  index: number;
  name: string;
  /** Exactly five biomes; the first is the chapter's anchor archetype. */
  biomes: BiomeDef[];
}

export interface BiomeSite {
  id: string;
  biome: BiomeDef;
  /** 1-based chapter. */
  chapter: number;
  /** 0..4 within the chapter. */
  slot: number;
  x: number;
  z: number;
  /** Rough radius of the site's cell (half the distance to its nearest neighbour). */
  radius: number;
  seed: number;
}

export interface Pass {
  /** Chapters joined (1-based): `from` → `to`. */
  from: number;
  to: number;
  x: number;
  z: number;
  r: number;
  azimuth: number;
}

/** Relative placements of the five sites in a sector: [angle as fraction of the half-sector, radius]. */
const SLOTS: [number, number][] = [
  [0.05, 1050],
  [-0.55, 1800],
  [0.55, 1850],
  [0.1, 2700],
  [-0.2, 3550],
];

/** Radius of the pass on the boundary after chapter k (k = 1..7). */
const PASS_RADII = [1500, 2350, 2900, 1900, 2600, 2150, 3100];

/** Compass azimuth: 0 = north (−Z), π/2 = east (+X). */
export function azimuthOf(x: number, z: number): number {
  return Math.atan2(x, -z);
}

export class WorldAtlas {
  readonly sites: BiomeSite[] = [];
  readonly passes: Pass[] = [];
  private readonly scratchD = new Float64Array(64);

  constructor(readonly chapters: ChapterDef[]) {
    chapters.forEach((chapter, k) => {
      const center = k * SECTOR;
      chapter.biomes.forEach((biome, slot) => {
        const [frac, radius] = SLOTS[slot];
        const seed = hashString(`${chapter.index}:${slot}:${biome.id}`);
        const jitterA = (hash2(k, slot, 11) - 0.5) * 0.18;
        const jitterR = (hash2(k, slot, 23) - 0.5) * 260;
        const a = center + (frac + jitterA) * (SECTOR / 2);
        const r = radius + jitterR;
        this.sites.push({
          id: `c${chapter.index}-${slot}`, biome, chapter: chapter.index, slot,
          x: Math.sin(a) * r, z: -Math.cos(a) * r, radius: 0, seed,
        });
      });
    });
    for (const s of this.sites) {
      let nearest = Infinity;
      for (const o of this.sites) if (o !== s) nearest = Math.min(nearest, Math.hypot(o.x - s.x, o.z - s.z));
      s.radius = Math.min(nearest / 2, 900);
    }
    for (let k = 0; k < Math.min(7, chapters.length - 1); k++) {
      const az = k * SECTOR + SECTOR / 2;
      const r = PASS_RADII[k];
      this.passes.push({ from: k + 1, to: k + 2, azimuth: az, r, x: Math.sin(az) * r, z: -Math.cos(az) * r });
    }
  }

  /** 1-based chapter whose sector contains the point (0 inside the hub). */
  chapterAt(x: number, z: number): number {
    if (Math.hypot(x, z) < WORLD.hubOuter) return 0;
    const a = azimuthOf(x, z);
    const k = ((Math.round(a / SECTOR) % 8) + 8) % 8;
    return k + 1;
  }

  /**
   * Distance (m, along the arc) to the nearest sector boundary, and that boundary's
   * index b: boundary b lies between sector b and sector b+1 (b = 7 is the sealed VIII→I).
   */
  boundary(x: number, z: number): { distance: number; index: number } {
    const r = Math.hypot(x, z);
    const a = azimuthOf(x, z);
    const u = (a - SECTOR / 2) / SECTOR;
    const b = Math.round(u);
    const distance = Math.abs(u - b) * SECTOR * r;
    return { distance, index: ((b % 8) + 8) % 8 };
  }

  passFor(boundaryIndex: number): Pass | undefined {
    return boundaryIndex < 7 ? this.passes[boundaryIndex] : undefined;
  }

  /**
   * Soft Voronoi weights: up to `max` sites near (x, z) with weights summing to 1.
   * `width` is the blend half-width in metres. Returns how many entries were written.
   */
  weights(x: number, z: number, outSites: BiomeSite[], outW: number[], width: number = WORLD.blend, max = 3): number {
    const n = this.sites.length;
    const d = this.scratchD;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const s = this.sites[i];
      const dd = Math.hypot(s.x - x, s.z - z);
      d[i] = dd;
      if (dd < best) best = dd;
    }
    // Voronoi border lies where two distances are equal; weight falls off with the gap.
    // Keep the `max` closest candidates (insertion sort into the output arrays).
    let count = 0;
    const cutoff = width * 3.5;
    for (let i = 0; i < n; i++) {
      const gap = d[i] - best;
      if (gap > cutoff) continue;
      let j = Math.min(count, max - 1);
      if (count === max && gap >= outW[max - 1]) continue;
      while (j > 0 && outW[j - 1] > gap) {
        outW[j] = outW[j - 1];
        outSites[j] = outSites[j - 1];
        j--;
      }
      outW[j] = gap;
      outSites[j] = this.sites[i];
      if (count < max) count++;
    }
    let total = 0;
    const k = 1.5 / width;
    for (let i = 0; i < count; i++) { outW[i] = Math.exp(-outW[i] * k); total += outW[i]; }
    for (let i = 0; i < count; i++) outW[i] /= total;
    return count;
  }

  nearest(x: number, z: number): BiomeSite {
    let best = this.sites[0];
    let bd = Infinity;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
