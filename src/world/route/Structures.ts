import * as THREE from 'three';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import { Random } from '../../core/Random';
import type { ColliderWorld } from '../../physics/Colliders';
import { buildBiomeLandmark, type Landmark } from '../biomes/BiomeLandmarks';
import type { LandmarkKind } from '../biomes/BiomeTypes';
import type { StructureSpec } from '../biomes/Journey';
import type { ReservedMap } from '../engine/PropStreamer';
import type { BiomeSite, WorldAtlas } from '../engine/WorldAtlas';
import type { WorldTerrain } from '../engine/WorldTerrain';
import type { WorldMaterials } from '../props/WorldMaterials';
import { MODEL_BOUNDS } from './ModelBounds';

/** One placed structure. */
export interface Placed {
  spec: StructureSpec;
  site: BiomeSite;
  x: number;
  z: number;
  /** Ground (plateau) height under it. */
  y: number;
  yaw: number;
  /** Footprint radius (m). */
  radius: number;
  name: string;
  object: THREE.Object3D | null;
  /** Collision boxes baked from the geometry (lazily), and whether they are registered. */
  boxes: [number, number, number, number, number, number][] | null;
  active: boolean;
}

/** Collision cell (m) when baking columns from a structure's geometry. */
const BAKE_CELL = 2.5;
/** Structures register their collision within this distance (with hysteresis). */
const COLLIDE_IN = 520;
const COLLIDE_OUT = 640;
/** Beyond this they are hidden (the fog has long since taken them). */
const VISIBLE = 2600;

/**
 * The supplied structures on the Long Road (Job 15). Each is placed beside the road at
 * its authored spot, on ground levelled to the average height of its footprint (so no
 * side floats), scaled to its intended size, and given collision: its bounds, or columns
 * sampled from its actual geometry for castles and ruins you can walk around and into.
 *
 * Placement (and the plateaus) happen at construction, before any ground is streamed;
 * the models themselves load asynchronously.
 */
export class Structures {
  readonly group = new THREE.Group();
  readonly placed: Placed[] = [];
  readonly landmarks: Landmark[] = [];
  readonly errors: string[] = [];
  private colliders: ColliderWorld | null = null;

  constructor(atlas: WorldAtlas, private readonly terrain: WorldTerrain, reserved: ReservedMap) {
    this.group.name = 'structures';
    for (const site of atlas.sites) {
      for (const spec of site.leg.structures) {
        const radius = footprint(spec);
        const s = site.s0 + spec.at * (site.s1 - site.s0);
        // Keep the plateau (and its blend) off the road.
        const blend = Math.min(45, 14 + radius * 0.2) + (spec.raise ?? 0) * 1.5;
        const clear = spec.hover ? 0 : radius + blend + 8;
        const lateral = Math.sign(spec.lateral || 1) * Math.max(Math.abs(spec.lateral), clear);
        const p = atlas.road.offset(s, lateral);
        const yaw = Math.atan2(-(p.x - atlas.road.pointAt(s).x), -(p.z - atlas.road.pointAt(s).z)) + Math.PI + (spec.yaw ?? 0);
        let y: number;
        const pad = spec.pad ?? radius;
        if (pad > 0 && !spec.hover) {
          const avg = terrain.averageHeight(p.x, p.z, Math.max(8, pad));
          y = terrain.addPlateau(p.x, p.z, pad, Math.max(1.4, avg) + (spec.raise ?? 0), blend);
        } else y = terrain.heightAt(p.x, p.z);
        if (!spec.hover) reserved.add(p.x, p.z, radius + 4);
        this.placed.push({
          spec, site, x: p.x, z: p.z, y, yaw, radius, name: spec.name ?? '',
          object: null, boxes: null, active: false,
        });
      }
    }
  }

  /**
   * Procedural pieces. Each is built at the origin on flat ground into a collider
   * recorder, then scaled up to its authored size and moved onto its plateau, with the
   * recorded collision replayed at the same scale — so the old landmark builders make
   * colossal temples and obelisk rings.
   */
  buildProcedural(m: WorldMaterials, colliders: ColliderWorld): void {
    this.colliders = colliders;
    for (const p of this.placed) {
      if (!p.spec.model.startsWith('proc:')) continue;
      const kind = p.spec.model.slice(5);
      if (kind === 'graveyard') continue; // built from the graveyard kit once it loads
      const recorder = new ColliderRecorder();
      const site = { ...p.site, id: `${p.site.id}:${kind}:${p.x.toFixed(0)}`, x: 0, z: 0, radius: 50,
        biome: { ...p.site.biome, landmark: { ...p.site.biome.landmark, kind: kind as LandmarkKind } } };
      const lm = buildBiomeLandmark(site, m, recorder as unknown as ColliderWorld, () => 0);
      const k = (p.spec.size ?? lm.clearance * 2) / (lm.clearance * 2);
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      // Landmarks centre themselves near (0, 0); the group turns and scales about it.
      const ox = lm.x, oz = lm.z;
      const inner = lm.group;
      inner.position.set(-ox, 0, -oz);
      const holder = new THREE.Group();
      holder.add(inner);
      holder.scale.setScalar(k);
      holder.rotation.y = p.yaw;
      holder.position.set(p.x, p.y, p.z);
      holder.name = `structure:${kind}`;
      holder.updateMatrixWorld(true);
      const world = (x: number, z: number): [number, number] => {
        const lx = (x - ox) * k, lz = (z - oz) * k;
        return [p.x + lx * c + lz * sn, p.z - lx * sn + lz * c];
      };
      for (const r of recorder.shapes) {
        const [wx, wz] = world(r.x, r.z);
        const wy = p.y + r.y * k;
        if (r.kind === 'box') colliders.addBox(wx, wy, wz, r.a * k, r.b * k, r.c * k, (r.rot ?? 0) + p.yaw, r.rx ?? 0, r.rz ?? 0);
        else if (r.kind === 'cyl') colliders.addCylinder(wx, wy, wz, r.a * k, r.b * k);
        else colliders.addSphere(wx, wy, wz, r.a * k);
      }
      const lights = lm.lights.map(l => {
        const [wx, wz] = world(l.x, l.z);
        return { ...l, x: wx, y: p.y + l.y * k, z: wz, distance: l.distance * k, intensity: l.intensity * Math.min(4, k) };
      });
      const placed: Landmark = { group: holder, x: p.x, z: p.z, clearance: lm.clearance * k, name: p.spec.name ?? lm.name, lights };
      p.name = placed.name;
      p.object = holder;
      this.landmarks.push(placed);
      this.group.add(holder);
    }
  }

  /** Loads and places the supplied models. */
  async load(library: ModelLibrary): Promise<void> {
    await Promise.all(this.placed.map(async p => {
      const spec = p.spec;
      if (spec.model === 'proc:graveyard') { await this.graveyard(p, library); return; }
      if (spec.model.startsWith('proc:')) return;
      try {
        const asset = await library.instantiate(spec.model, spec.height ? { height: spec.height } : { size: spec.size });
        let root: THREE.Object3D = asset.root;
        if (spec.parts) {
          // Keep only the named nodes (modular kits ship their loose pieces beside the build).
          const keep = new Set(spec.parts);
          const drop: THREE.Object3D[] = [];
          asset.content.traverse(o => { if (o instanceof THREE.Mesh && !keep.has(o.name) && !(o.parent && keep.has(o.parent.name))) drop.push(o); });
          for (const o of drop) o.removeFromParent();
          root = recentre(asset.root, spec.size ?? 50);
        }
        if (spec.planted !== undefined) root = plant(root, spec.size ?? 50, spec.planted);
        root.rotation.y = p.yaw;
        root.position.set(p.x, p.y - (spec.sink ?? 0) + (spec.hover ?? 0), p.z);
        if (spec.glow) glowUp(root, spec.glow);
        if (spec.doubleSided) root.traverse(o => {
          if (!(o instanceof THREE.Mesh)) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.side = THREE.DoubleSide;
        });
        root.name = `structure:${spec.model}`;
        root.updateMatrixWorld(true);
        p.object = root;
        this.group.add(root);
      } catch (error) {
        this.errors.push(`${spec.model}: ${error}`);
      }
    }));
  }

  /** A walled graveyard from the modular kit: fence pillars, a gate facing the road, rows of graves. */
  private async graveyard(p: Placed, library: ModelLibrary): Promise<void> {
    try {
      const kit = await library.instantiate('psx-graveyard-modular-ps1-style-free');
      const stone = await library.instantiate('ps1lowpoly-gravestone', { height: 1.6 });
      kit.content.updateMatrixWorld(true);
      const piece = (name: string, height: number): THREE.Object3D | null => {
        const original = kit.content.getObjectByName(name);
        if (!(original instanceof THREE.Mesh)) return null;
        const part = original.clone();
        part.matrix.copy(original.matrixWorld);
        part.matrix.decompose(part.position, part.quaternion, part.scale);
        part.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(part);
        const c = b.getCenter(new THREE.Vector3());
        part.position.sub(new THREE.Vector3(c.x, b.min.y, c.z));
        const w = new THREE.Group();
        w.add(part);
        w.scale.setScalar(height / Math.max(0.01, b.max.y - b.min.y));
        return w;
      };
      const rng = new Random(`graveyard:${p.site.id}:${p.x.toFixed(0)}`);
      const yard = new THREE.Group();
      yard.name = 'graveyard';
      const size = p.spec.size ?? 30;
      const hw = size / 2, hd = size * 0.35;
      const col = this.colliders!;
      const put = (o: THREE.Object3D | null, lx: number, lz: number, rot: number, r: number, h: number) => {
        if (!o) return;
        o.position.set(lx, 0, lz);
        o.rotation.y = rot;
        yard.add(o);
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        const wx = p.x + lx * c + lz * s, wz = p.z - lx * s + lz * c;
        col.addCylinder(wx, p.y + h / 2, wz, r, h);
      };
      // Fence of pillars; the gate faces the road (local −z points at it).
      for (let x = -hw; x <= hw + 0.01; x += 4) {
        for (const z of [-hd, hd]) {
          if (z === -hd && Math.abs(x) < 3) continue;
          put(piece('piller', 2.6), x, z, 0, 0.45, 2.6);
        }
      }
      for (let z = -hd + 4; z < hd; z += 4) for (const x of [-hw, hw]) put(piece('piller', 2.6), x, z, 0, 0.45, 2.6);
      put(piece('gate_piller', 4.2), -3, -hd, 0, 0.6, 4.2);
      put(piece('gate_piller', 4.2), 3, -hd, 0, 0.6, 4.2);
      // Rows of graves.
      const kinds = ['grave1', 'grave2', 'grave1.005', 'grave1.006', 'stone', 'stone', 'stone'];
      for (let z = -hd + 5; z < hd - 2; z += 4.2)
        for (let x = -hw + 3; x < hw - 2; x += 3.4) {
          if (Math.abs(x) < 2.5 || rng.next() < 0.2) continue;
          const k = kinds[rng.int(0, kinds.length - 1)];
          const o = k === 'stone' ? stone.root.clone() : piece(k, k === 'grave1.005' ? 1.8 : 1.4);
          put(o, x + rng.signed() * 0.4, z + rng.signed() * 0.4, Math.PI + rng.signed() * 0.15, 0.5, 1.4);
          if (o) o.rotation.z = rng.signed() * 0.08;
        }
      yard.position.set(p.x, p.y, p.z);
      yard.rotation.y = p.yaw;
      yard.updateMatrixWorld(true);
      p.object = yard;
      p.name = p.spec.name ?? '';
      this.group.add(yard);
      p.boxes = [];
    } catch (error) {
      this.errors.push(`graveyard: ${error}`);
    }
  }

  /** Registers collision near the viewer and hides structures far beyond the fog. */
  update(viewer: THREE.Vector3): void {
    const col = this.colliders;
    for (const p of this.placed) {
      if (!p.object) continue;
      const d = Math.hypot(p.x - viewer.x, p.z - viewer.z) - p.radius;
      p.object.visible = d < VISIBLE;
      if (!col || p.spec.model.startsWith('proc:')) continue;
      const mode = p.spec.collide ?? 'box';
      if (mode === 'none') continue;
      if (!p.active && d < COLLIDE_IN) {
        if (!p.boxes) p.boxes = mode === 'bake' ? bake(p.object, this.terrain.heightAt) : boundsBox(p.object);
        col.beginGroup(this.groupId(p));
        for (const [x, y, z, sx, sy, sz] of p.boxes) col.addBox(x, y, z, sx, sy, sz);
        col.endGroup();
        p.active = true;
      } else if (p.active && d > COLLIDE_OUT) {
        col.removeGroup(this.groupId(p));
        p.active = false;
      }
    }
  }

  /** Registers everything near `viewer` at once (start-up, teleports). */
  prewarm(viewer: THREE.Vector3): void {
    this.update(viewer);
  }

  private groupId(p: Placed): string {
    return `structure:${this.placed.indexOf(p)}`;
  }

  /** Number of structures with collision registered (tests). */
  get activeCount(): number {
    return this.placed.filter(p => p.active).length;
  }
}

/** Footprint radius (m) of a structure from its native bounds and target size. */
export function footprint(spec: StructureSpec): number {
  if (spec.planted !== undefined) return 10;
  if (spec.model.startsWith('proc:') || spec.parts) return (spec.size ?? 40) * 0.55;
  const b = MODEL_BOUNDS[spec.model];
  if (!b) return (spec.size ?? 20) * 0.6;
  const scale = spec.height ? spec.height / b[1] : (spec.size ?? Math.max(...b)) / Math.max(...b);
  return 0.5 * Math.hypot(b[0], b[2]) * scale;
}

/** Re-centres a filtered kit on the origin (base at y = 0) and scales it to `size`. */
function recentre(root: THREE.Object3D, size: number): THREE.Object3D {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  const dim = b.getSize(new THREE.Vector3());
  const c = b.getCenter(new THREE.Vector3());
  const k = size / Math.max(dim.x, dim.y, dim.z, 1e-6);
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(root);
  inner.scale.setScalar(k);
  inner.position.set(-c.x * k, -b.min.y * k, -c.z * k);
  outer.add(inner);
  return outer;
}

/**
 * Stands a weapon upright with its tip in the ground: the longest axis vertical, the end
 * farther from the vertex centroid (the thin blade, not the heavy hilt) pointing down,
 * a quarter of it buried, leaning by `tilt` radians.
 */
function plant(root: THREE.Object3D, size: number, tilt: number): THREE.Object3D {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  const dim = b.getSize(new THREE.Vector3());
  const axis = dim.x >= dim.y && dim.x >= dim.z ? 'x' : dim.y >= dim.z ? 'y' : 'z';
  const centre = b.getCenter(new THREE.Vector3());
  const centroid = new THREE.Vector3();
  let n = 0;
  const v = new THREE.Vector3();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); centroid.add(v); n++; }
  });
  centroid.divideScalar(Math.max(1, n));
  // Direction from the hilt toward the tip along the long axis.
  const tip = new THREE.Vector3();
  tip[axis] = centroid[axis] > centre[axis] ? -1 : 1;
  const holder = new THREE.Group();
  const pivot = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(root);
  inner.position.copy(centre).multiplyScalar(-1);
  pivot.add(inner);
  // Rotate the tip direction onto −Y.
  pivot.quaternion.setFromUnitVectors(tip, new THREE.Vector3(0, -1, 0));
  const k = size / Math.max(dim.x, dim.y, dim.z, 1e-6);
  pivot.scale.setScalar(k);
  const lean = new THREE.Group();
  lean.add(pivot);
  lean.rotation.z = tilt;
  // Centre sits at 1/4 of the length above the ground: a quarter is buried.
  pivot.position.y = size * 0.25;
  holder.add(lean);
  return holder;
}

function glowUp(root: THREE.Object3D, strength: number): void {
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map(m => {
      const c = (m as THREE.MeshToonMaterial).clone();
      if ('emissive' in c) {
        c.emissive = (c as THREE.MeshToonMaterial).color.clone();
        (c as THREE.MeshToonMaterial).emissiveIntensity = strength;
        if ((c as THREE.MeshToonMaterial).map) (c as THREE.MeshToonMaterial).emissiveMap = (c as THREE.MeshToonMaterial).map;
      }
      c.fog = false;
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
    o.castShadow = false;
  });
}

/** One axis-aligned box around the object. */
function boundsBox(object: THREE.Object3D): [number, number, number, number, number, number][] {
  object.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(object);
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  return [[c.x, c.y, c.z, s.x, s.y, s.z]];
}

/**
 * Collision from geometry: samples every triangle onto a 2.5 m grid, keeping the lowest
 * and highest point per column; columns that rise more than 0.7 m above the ground become
 * solid (from below the ground, or floating when the lowest point is overhead — arches,
 * roofs), merged into runs along x.
 */
export function bake(object: THREE.Object3D, heightAt: (x: number, z: number) => number): [number, number, number, number, number, number][] {
  object.updateMatrixWorld(true);
  const cols = new Map<number, [number, number, number, number]>(); // key → [ix, iz, min, max]
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  object.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const pos = o.geometry.getAttribute('position');
    const index = o.geometry.getIndex();
    const tris = index ? index.count / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      e1.subVectors(b, a); e2.subVectors(c, a);
      const n = Math.min(60, Math.max(1, Math.ceil(Math.max(e1.length(), e2.length(), b.distanceTo(c)) / (BAKE_CELL * 0.5))));
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          p.copy(a).addScaledVector(e1, i / n).addScaledVector(e2, j / n);
          const ix = Math.floor(p.x / BAKE_CELL), iz = Math.floor(p.z / BAKE_CELL);
          const key = ix * 100003 + iz;
          const col = cols.get(key);
          if (!col) cols.set(key, [ix, iz, p.y, p.y]);
          else { if (p.y < col[2]) col[2] = p.y; if (p.y > col[3]) col[3] = p.y; }
        }
    }
  });
  // Solid spans per column, quantised to 0.5 m for merging.
  const rows = new Map<number, [number, number, number][]>(); // iz → [ix, bottom, top]
  for (const [ix, iz, lo, hi] of cols.values()) {
    const g = heightAt((ix + 0.5) * BAKE_CELL, (iz + 0.5) * BAKE_CELL);
    if (hi - g < 0.7) continue;
    const bottom = lo - g > 2.6 ? Math.floor(lo * 2) / 2 : Math.floor((g - 1) * 2) / 2;
    const top = Math.ceil(hi * 2) / 2;
    let row = rows.get(iz);
    if (!row) rows.set(iz, (row = []));
    row.push([ix, bottom, top]);
  }
  const boxes: [number, number, number, number, number, number][] = [];
  for (const [iz, row] of rows) {
    row.sort((p1, p2) => p1[0] - p2[0]);
    let i = 0;
    while (i < row.length) {
      let j = i;
      while (j + 1 < row.length && row[j + 1][0] === row[j][0] + 1 && Math.abs(row[j + 1][1] - row[i][1]) < 0.6 && Math.abs(row[j + 1][2] - row[i][2]) < 0.6) j++;
      const x0 = row[i][0] * BAKE_CELL, x1 = (row[j][0] + 1) * BAKE_CELL;
      const bottom = Math.min(...row.slice(i, j + 1).map(r => r[1])), top = Math.max(...row.slice(i, j + 1).map(r => r[2]));
      boxes.push([(x0 + x1) / 2, (bottom + top) / 2, (iz + 0.5) * BAKE_CELL, x1 - x0, top - bottom, BAKE_CELL]);
      i = j + 1;
    }
  }
  return boxes;
}

interface Shape { kind: 'box' | 'cyl' | 'sph'; x: number; y: number; z: number; a: number; b: number; c: number; rot?: number; rx?: number; rz?: number }

/** Stands in for a ColliderWorld while a landmark is built, remembering its shapes. */
class ColliderRecorder {
  readonly shapes: Shape[] = [];
  addBox(x: number, y: number, z: number, w: number, h: number, d: number, rotY = 0, rotX = 0, rotZ = 0): void {
    this.shapes.push({ kind: 'box', x, y, z, a: w, b: h, c: d, rot: rotY, rx: rotX, rz: rotZ });
  }
  addCylinder(x: number, y: number, z: number, radius: number, height: number): void {
    this.shapes.push({ kind: 'cyl', x, y, z, a: radius, b: height, c: 0 });
  }
  addSphere(x: number, y: number, z: number, radius: number): void {
    this.shapes.push({ kind: 'sph', x, y, z, a: radius, b: 0, c: 0 });
  }
}
