import * as THREE from 'three';
import { Noise2D } from '../../core/Noise';
import { hash2, Random } from '../../core/Random';
import type { ColliderWorld } from '../../physics/Colliders';
import type { PropKind, PropSpec } from '../biomes/BiomeTypes';
import type { PropLibrary } from './PropLibrary';
import { type BiomeSite, WORLD, type WorldAtlas } from './WorldAtlas';

/** Circles where nothing may be scattered (camps, landmarks, passes). Grid-bucketed. */
export class ReservedMap {
  private readonly cell = 64;
  private readonly buckets = new Map<number, [number, number, number][]>();

  add(x: number, z: number, r: number): void {
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) {
        const key = gx * 73856093 + gz * 19349663;
        let list = this.buckets.get(key);
        if (!list) this.buckets.set(key, (list = []));
        list.push([x, z, r]);
      }
  }

  blocked(x: number, z: number, pad = 0): boolean {
    const list = this.buckets.get(Math.floor(x / this.cell) * 73856093 + Math.floor(z / this.cell) * 19349663);
    if (!list) return false;
    for (const [cx, cz, r] of list) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + pad) ** 2) return true;
    return false;
  }
}

/** A prop placed by hand (camp dressing, landmark details) rather than scattered. */
export interface FixedProp {
  kind: PropKind;
  x: number;
  z: number;
  scale: number;
  rot: number;
  tint?: number;
  /** Vertical offset from the ground. */
  lift?: number;
}

type Tier = 'near' | 'mid' | 'far';

interface Instance { x: number; y: number; z: number; s: number; rot: number; tint: THREE.Color | null }

interface Cell {
  key: string;
  tier: Tier;
  cx: number;
  cz: number;
  group: THREE.Group;
  colliders: { kind: PropKind; inst: Instance }[];
  colliderGroup: string | null;
}

const TIERS: Record<Tier, { size: number; radius: number; density: number; seed: number }> = {
  near: { size: 64, radius: 96, density: 1, seed: 17 },
  mid: { size: 192, radius: 300, density: 1, seed: 29 },
  far: { size: 768, radius: 1500, density: 0.3, seed: 43 },
};

/** Prop colliders exist only within this distance (with hysteresis). */
const COLLIDE_IN = 210;
const COLLIDE_OUT = 290;

/**
 * Streams biome props around the viewer in three rings (Job 6):
 * - **near** (≤ 96 m, 64 m cells): grass, flowers, reeds — the crisp bands.
 * - **mid** (≤ 280 m, 192 m cells): trees, rocks, crystals, ruins; colliders within 210 m.
 * - **far** (280–1500 m, 768 m cells): a sparse subset of tall props, with simplified
 *   geometry, so forests and spires still read as silhouettes in the chunky far bands.
 * Scattering is deterministic per cell, weighted by the soft biome blend, so borders
 * interleave both biomes' vegetation. Mid and far hand off at exactly 280 m in the shader.
 */
export class PropStreamer {
  readonly group = new THREE.Group();
  private readonly cells = new Map<string, Cell>();
  private readonly fixedByCell = new Map<string, FixedProp[]>();
  private readonly clump = new Noise2D('prop-clumps');
  private readonly sites: BiomeSite[] = [];
  private readonly w: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  lastBuildMs = 0;

  constructor(
    private readonly library: PropLibrary,
    private readonly atlas: WorldAtlas,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly colliders: ColliderWorld,
    private readonly reserved: ReservedMap,
  ) {
    this.group.name = 'world-props';
  }

  /** Registers a hand-placed prop; it streams with the mid cell containing it. */
  addFixed(p: FixedProp): void {
    const size = TIERS.mid.size;
    const key = `mid:${Math.floor(p.x / size)}:${Math.floor(p.z / size)}`;
    let list = this.fixedByCell.get(key);
    if (!list) this.fixedByCell.set(key, (list = []));
    list.push(p);
  }

  get cellCount(): number {
    return this.cells.size;
  }

  /** Number of prop colliders currently registered (tests). */
  get colliderCells(): number {
    let n = 0;
    for (const c of this.cells.values()) if (c.colliderGroup) n++;
    return n;
  }

  update(viewer: THREE.Vector3, budgetMs = 3): void {
    const wanted: { tier: Tier; ix: number; iz: number; d: number; key: string }[] = [];
    const keep = new Set<string>();
    for (const tier of ['near', 'mid', 'far'] as Tier[]) {
      const { size, radius } = TIERS[tier];
      const reach = radius + size * 0.71;
      const i0 = Math.floor((viewer.x - reach) / size), i1 = Math.floor((viewer.x + reach) / size);
      const j0 = Math.floor((viewer.z - reach) / size), j1 = Math.floor((viewer.z + reach) / size);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const cx = (i + 0.5) * size, cz = (j + 0.5) * size;
          const d = Math.hypot(cx - viewer.x, cz - viewer.z);
          if (d > reach) continue;
          // The far ring never needs cells wholly inside the hand-off radius.
          if (tier === 'far' && d + size * 0.71 < 280) continue;
          const key = `${tier}:${i}:${j}`;
          keep.add(key);
          if (!this.cells.has(key)) wanted.push({ tier, ix: i, iz: j, d: tier === 'near' ? d * 0.25 : tier === 'mid' ? d : d * 2, key });
        }
    }
    for (const [key, cell] of this.cells) if (!keep.has(key)) this.dispose(cell);

    wanted.sort((a, b) => a.d - b.d);
    const start = performance.now();
    for (const w of wanted) {
      this.build(w.tier, w.ix, w.iz, w.key);
      if (performance.now() - start > budgetMs) break;
    }
    this.lastBuildMs = performance.now() - start;

    // Colliders only near the player.
    for (const cell of this.cells.values()) {
      if (cell.tier !== 'mid') continue;
      const d = Math.hypot(cell.cx - viewer.x, cell.cz - viewer.z);
      if (!cell.colliderGroup && d < COLLIDE_IN && cell.colliders.length) {
        cell.colliderGroup = `props:${cell.key}`;
        this.colliders.beginGroup(cell.colliderGroup);
        for (const { kind, inst } of cell.colliders) this.library.get(kind).collider?.(this.colliders, inst.x, inst.y, inst.z, inst.s);
        this.colliders.endGroup();
      } else if (cell.colliderGroup && d > COLLIDE_OUT) {
        this.colliders.removeGroup(cell.colliderGroup);
        cell.colliderGroup = null;
      }
    }
  }

  /** Builds everything needed around the viewer at once (start-up, teleports). */
  prewarm(viewer: THREE.Vector3): void {
    this.update(viewer, Infinity);
  }

  private dispose(cell: Cell): void {
    if (cell.colliderGroup) this.colliders.removeGroup(cell.colliderGroup);
    for (const child of cell.group.children) (child as THREE.InstancedMesh).dispose();
    cell.group.removeFromParent();
    this.cells.delete(cell.key);
  }

  private siteWeight(site: BiomeSite, x: number, z: number): number {
    const n = this.atlas.weights(x, z, this.sites, this.w);
    for (let i = 0; i < n; i++) if (this.sites[i] === site) return this.w[i];
    return 0;
  }

  private build(tier: Tier, ix: number, iz: number, key: string): void {
    const { size, density, seed } = TIERS[tier];
    const x0 = ix * size, z0 = iz * size;
    const rng = new Random(Math.floor(hash2(ix, iz, seed) * 2 ** 31));
    const cell: Cell = { key, tier, cx: x0 + size / 2, cz: z0 + size / 2, group: new THREE.Group(), colliders: [], colliderGroup: null };
    const byKind = new Map<PropKind, Instance[]>();
    const push = (kind: PropKind, inst: Instance) => {
      let list = byKind.get(kind);
      if (!list) byKind.set(kind, (list = []));
      list.push(inst);
      if (tier === 'mid' && this.library.get(kind).collider) cell.colliders.push({ kind, inst });
    };

    // Biomes present in this cell: sample the blend at the centre and corners.
    const present = new Set<BiomeSite>();
    for (const [sx, sz] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
      const n = this.atlas.weights(x0 + sx * size, z0 + sz * size, this.sites, this.w);
      for (let i = 0; i < n; i++) present.add(this.sites[i]);
    }
    const inHub = (x: number, z: number) => Math.hypot(x, z) < (WORLD.hubInner + WORLD.hubOuter) / 2 + 20;
    const cellInHub = Math.hypot(cell.cx, cell.cz) + size * 0.71 < (WORLD.hubInner + WORLD.hubOuter) / 2;

    if (!cellInHub) for (const site of present) {
      for (const spec of site.biome.props) {
        const model = this.library.get(spec.kind);
        if (tier === 'near' ? model.tier !== 'near' : model.tier !== 'mid') continue;
        if (tier === 'far' && !spec.far) continue;
        const expected = spec.density * (size * size) / 100 * density;
        const count = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const x = x0 + rng.next() * size;
          const z = z0 + rng.next() * size;
          const roll = rng.next();
          const s = rng.range(spec.scale[0], spec.scale[1]);
          const rot = rng.next() * Math.PI * 2;
          const tintK = rng.next();
          if (inHub(x, z)) continue;
          if (roll > this.siteWeight(site, x, z)) continue;
          if (!this.accept(spec, x, z)) continue;
          if (this.reserved.blocked(x, z, spec.kind === 'grass' || spec.kind === 'flowers' ? 0 : 2)) continue;
          const y = this.heightAt(x, z) - (spec.kind === 'pine' || spec.kind === 'leafTree' || spec.kind === 'deadTree' || spec.kind === 'redSpire' ? 0.3 : 0.05);
          const tint = spec.tint ? new THREE.Color(spec.tint[0]).lerp(new THREE.Color(spec.tint[1]), tintK) : null;
          push(spec.kind, { x, y, z, s, rot, tint });
        }
      }
    }
    if (tier === 'mid') for (const f of this.fixedByCell.get(key) ?? []) {
      push(f.kind, { x: f.x, y: this.heightAt(f.x, f.z) + (f.lift ?? 0), z: f.z, s: f.scale, rot: f.rot, tint: f.tint !== undefined ? new THREE.Color(f.tint) : null });
    }

    for (const [kind, list] of byKind) {
      const model = this.library.get(kind);
      for (const part of model.parts) {
        const material = tier === 'near' ? part.material : tier === 'mid' ? part.midMaterial : part.farMaterial;
        const geometry = tier === 'far' ? part.farGeometry ?? part.geometry : part.geometry;
        const mesh = new THREE.InstancedMesh(geometry, material, list.length);
        const pos = new THREE.Vector3();
        const scale = new THREE.Vector3();
        list.forEach((inst, i) => {
          this.q.setFromAxisAngle(this.up, inst.rot);
          mesh.setMatrixAt(i, this.m.compose(pos.set(inst.x, inst.y, inst.z), this.q, scale.setScalar(inst.s)));
          if (part.tinted) mesh.setColorAt(i, inst.tint ?? new THREE.Color(0xffffff));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = part.castShadow && tier !== 'far';
        mesh.receiveShadow = tier !== 'far';
        mesh.name = `${kind}@${key}`;
        cell.group.add(mesh);
      }
    }
    cell.group.name = key;
    this.group.add(cell.group);
    this.cells.set(key, cell);
  }

  private accept(spec: PropSpec, x: number, z: number): boolean {
    const h = this.heightAt(x, z);
    if (spec.height && (h < spec.height[0] || h > spec.height[1])) return false;
    if (spec.clump !== undefined && this.clump.get(x * 0.012, z * 0.012) < spec.clump) return false;
    if (spec.slopeMax !== undefined) {
      const e = 0.8;
      const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
      const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
      const slope = 1 - (2 * e) / Math.hypot(dx, 2 * e, dz);
      if (slope > spec.slopeMax) return false;
    }
    return true;
  }
}
