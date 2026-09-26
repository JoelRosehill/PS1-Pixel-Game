import * as THREE from 'three';
import { toon } from '../../render/Materials';
import { groundDetail } from '../../render/PixelTextures';

export type HeightFn = (x: number, z: number) => number;
export type ColorFn = (x: number, z: number, h: number, slope: number, out: THREE.Color) => void;

interface Tile {
  key: string;
  level: number;
  ix: number;
  iz: number;
  cx: number;
  cz: number;
  size: number;
  mesh: THREE.Mesh | null;
  used: number;
}

export interface TerrainStreamerOptions {
  /** Root tile edge (m). The world fits inside it. */
  rootSize: number;
  /** Levels below the root; leaf edge = rootSize / 2^levels. */
  levels: number;
  /** Grid cells per tile edge (constant at every level). */
  segments: number;
  /** A tile splits while the viewer is closer than `splitFactor × tile size`. */
  splitFactor: number;
  /** Metres per ground-texture repeat. */
  textureTile: number;
}

const DEFAULTS: TerrainStreamerOptions = { rootSize: 9216, levels: 8, segments: 32, splitFactor: 0.9, textureTile: 4 };

/**
 * Quadtree terrain with LOD matched to the Smart-Pixel bands (Job 6).
 *
 * Every tile has the same 32×32 grid, so vertex spacing doubles with each level.
 * A tile is used roughly between 0.5× and 1× its size away, so vertex spacing is
 * about distance / 30: 1.1 m leaves (36 m tiles) around the player, ~3 m at 100 m
 * (band 2, ×3 px), ~8 m at 240 m (band 3, ×5) and ~20 m at 650 m (bands 4–5,
 * ×8–12) — a few screen pixels between vertices in every band. A tile only
 * splits once all four children are built, and children only merge once the parent
 * is built, so there are never holes. Skirts hide cracks between levels.
 * Building is time-sliced by `update(viewer, budgetMs)`.
 */
export class TerrainStreamer {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshToonMaterial;
  readonly options: TerrainStreamerOptions;
  /** Tiles built so far (for stats and tests). */
  built = 0;
  lastBuildMs = 0;
  private readonly tiles = new Map<string, Tile>();
  private readonly displayed = new Set<string>();
  private readonly wanted = new Set<string>();
  private readonly viewer = new THREE.Vector3();
  private frame = 0;
  private readonly color = new THREE.Color();

  constructor(private readonly heightAt: HeightFn, private readonly colorAt: ColorFn, options: Partial<TerrainStreamerOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.group.name = 'terrain-tiles';
    this.material = toon({ map: groundDetail(), vertexColors: true });
    const root = this.tile(0, 0, 0);
    this.build(root);
    this.displayed.add(root.key);
  }

  get leafSize(): number {
    return this.options.rootSize / 2 ** this.options.levels;
  }

  /** Displayed tiles (for tests): level, centre and size. */
  get visibleTiles(): { level: number; cx: number; cz: number; size: number }[] {
    return [...this.displayed].map(k => this.tiles.get(k)!).map(t => ({ level: t.level, cx: t.cx, cz: t.cz, size: t.size }));
  }

  get pending(): number {
    return this.wanted.size;
  }

  private key(level: number, ix: number, iz: number): string {
    return `${level}:${ix}:${iz}`;
  }

  private tile(level: number, ix: number, iz: number): Tile {
    const key = this.key(level, ix, iz);
    let t = this.tiles.get(key);
    if (!t) {
      const size = this.options.rootSize / 2 ** level;
      const half = this.options.rootSize / 2;
      t = { key, level, ix, iz, size, cx: -half + (ix + 0.5) * size, cz: -half + (iz + 0.5) * size, mesh: null, used: 0 };
      this.tiles.set(key, t);
    }
    return t;
  }

  private wantsSplit(t: Tile): boolean {
    if (t.level >= this.options.levels) return false;
    const h = t.size / 2;
    const dx = Math.max(0, Math.abs(this.viewer.x - t.cx) - h);
    const dz = Math.max(0, Math.abs(this.viewer.z - t.cz) - h);
    const dy = Math.max(0, this.viewer.y - 40) * 0.5;
    return Math.hypot(dx, dz, dy) < t.size * this.options.splitFactor;
  }

  private children(t: Tile): Tile[] {
    const l = t.level + 1;
    return [
      this.tile(l, t.ix * 2, t.iz * 2), this.tile(l, t.ix * 2 + 1, t.iz * 2),
      this.tile(l, t.ix * 2, t.iz * 2 + 1), this.tile(l, t.ix * 2 + 1, t.iz * 2 + 1),
    ];
  }

  private parent(t: Tile): Tile | null {
    return t.level === 0 ? null : this.tile(t.level - 1, t.ix >> 1, t.iz >> 1);
  }

  /** Reconciles the displayed tree with the viewer and builds within `budgetMs`. */
  update(viewer: THREE.Vector3, budgetMs = 4): void {
    this.frame++;
    this.viewer.copy(viewer);
    this.wanted.clear();
    for (const key of [...this.displayed]) {
      if (!this.displayed.has(key)) continue;
      const t = this.tiles.get(key)!;
      t.used = this.frame;
      if (this.wantsSplit(t)) {
        const kids = this.children(t);
        if (kids.every(k => k.mesh)) {
          this.displayed.delete(key);
          for (const k of kids) this.displayed.add(k.key);
        } else for (const k of kids) if (!k.mesh) this.wanted.add(k.key);
        continue;
      }
      const p = this.parent(t);
      if (p && !this.wantsSplit(p)) {
        const siblings = this.children(p);
        if (!siblings.every(s => this.displayed.has(s.key))) continue;
        if (p.mesh) {
          for (const s of siblings) this.displayed.delete(s.key);
          this.displayed.add(p.key);
        } else this.wanted.add(p.key);
      }
    }

    // Build the most urgent requests first: fine tiles close to the viewer.
    const queue = [...this.wanted].map(k => this.tiles.get(k)!)
      .sort((a, b) => b.level - a.level || this.dist(a) - this.dist(b));
    const start = performance.now();
    for (const t of queue) {
      this.build(t);
      if (performance.now() - start > budgetMs) break;
    }
    this.lastBuildMs = performance.now() - start;

    for (const t of this.tiles.values()) {
      if (!t.mesh) continue;
      t.mesh.visible = this.displayed.has(t.key);
    }
    this.evict();
  }

  /**
   * Builds the final tile set around `viewer` directly (loading, teleports, tests):
   * no intermediate levels, and everything else is hidden.
   */
  prewarm(viewer: THREE.Vector3): void {
    this.viewer.copy(viewer);
    const leaves: Tile[] = [];
    const visit = (t: Tile) => {
      if (this.wantsSplit(t)) for (const c of this.children(t)) visit(c);
      else leaves.push(t);
    };
    visit(this.tile(0, 0, 0));
    for (const t of leaves) this.build(t);
    this.displayed.clear();
    for (const t of leaves) this.displayed.add(t.key);
    this.wanted.clear();
    for (const t of this.tiles.values()) if (t.mesh) t.mesh.visible = this.displayed.has(t.key);
  }

  private dist(t: Tile): number {
    return Math.hypot(this.viewer.x - t.cx, this.viewer.z - t.cz);
  }

  /** Keeps a bounded cache of hidden tiles for quick merges/splits when turning back. */
  private evict(): void {
    const hidden = [...this.tiles.values()].filter(t => t.mesh && !this.displayed.has(t.key) && !this.wanted.has(t.key));
    if (hidden.length <= 160) return;
    hidden.sort((a, b) => a.used - b.used);
    for (const t of hidden.slice(0, hidden.length - 160)) {
      t.mesh!.geometry.dispose();
      t.mesh!.removeFromParent();
      t.mesh = null;
      this.tiles.delete(t.key);
    }
  }

  private build(t: Tile): void {
    if (t.mesh) return;
    const N = this.options.segments;
    const step = t.size / N;
    const x0 = t.cx - t.size / 2;
    const z0 = t.cz - t.size / 2;
    // Heights with a one-sample border, so normals at the edges are exact.
    const W = N + 3;
    const hs = new Float32Array(W * W);
    for (let j = 0; j < W; j++)
      for (let i = 0; i < W; i++) hs[j * W + i] = this.heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);

    const vc = (N + 1) * (N + 1);
    const skirt = 4 * N;
    const total = vc + skirt;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const col = new Float32Array(total * 3);
    const tex = this.options.textureTile;
    let v = 0;
    for (let j = 0; j <= N; j++)
      for (let i = 0; i <= N; i++) {
        const x = x0 + i * step;
        const z = z0 + j * step;
        const h = hs[(j + 1) * W + (i + 1)];
        const nx = hs[(j + 1) * W + i] - hs[(j + 1) * W + i + 2];
        const nz = hs[j * W + i + 1] - hs[(j + 2) * W + i + 1];
        const len = Math.hypot(nx, 2 * step, nz);
        const ny = (2 * step) / len;
        pos[v * 3] = x - t.cx; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z - t.cz;
        nor[v * 3] = nx / len; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz / len;
        uv[v * 2] = x / tex; uv[v * 2 + 1] = z / tex;
        this.colorAt(x, z, h, 1 - ny, this.color);
        col[v * 3] = this.color.r; col[v * 3 + 1] = this.color.g; col[v * 3 + 2] = this.color.b;
        v++;
      }
    const idx: number[] = [];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i;
        const b = a + N + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    // Skirts: each edge vertex gets a twin hanging below it.
    const drop = Math.max(1.5, step * 3);
    const edge: number[] = [];
    for (let i = 0; i <= N; i++) edge.push(i);
    for (let j = 1; j <= N; j++) edge.push(j * (N + 1) + N);
    for (let i = N - 1; i >= 0; i--) edge.push(N * (N + 1) + i);
    for (let j = N - 1; j >= 1; j--) edge.push(j * (N + 1));
    const first = v;
    for (const e of edge) {
      pos[v * 3] = pos[e * 3]; pos[v * 3 + 1] = pos[e * 3 + 1] - drop; pos[v * 3 + 2] = pos[e * 3 + 2];
      nor.set(nor.subarray(e * 3, e * 3 + 3), v * 3);
      uv.set(uv.subarray(e * 2, e * 2 + 2), v * 2);
      col.set(col.subarray(e * 3, e * 3 + 3), v * 3);
      v++;
    }
    for (let k = 0; k < edge.length; k++) {
      const a = edge[k];
      const b = edge[(k + 1) % edge.length];
      const a2 = first + k;
      const b2 = first + ((k + 1) % edge.length);
      // Outward-facing only: a skirt is never seen from inside its own tile.
      idx.push(a, b, a2, b, b2, a2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(t.cx, 0, t.cz);
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.castShadow = t.level >= this.options.levels - 2;
    mesh.name = `tile-${t.key}`;
    mesh.visible = false;
    this.group.add(mesh);
    t.mesh = mesh;
    this.built++;
  }
}
