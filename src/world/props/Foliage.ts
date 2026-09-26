import * as THREE from 'three';
import { Random } from '../../core/Random';
import { cone, cylinder, merge, place, scaleUV } from '../geometry';

export interface ScatterItem {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  color?: THREE.Color;
}

/**
 * Splits instances into spatial cells so every Smart-Pixel band can frustum-cull
 * them independently (one InstancedMesh per cell per geometry).
 */
export function instancedChunks(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  items: ScatterItem[],
  cellSize: number,
  opts: { castShadow?: boolean; receiveShadow?: boolean; name?: string } = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = opts.name ?? 'instances';
  const cells = new Map<string, ScatterItem[]>();
  for (const it of items) {
    const key = `${Math.floor(it.x / cellSize)},${Math.floor(it.z / cellSize)}`;
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(it);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const list of cells.values()) {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rotY);
      s.setScalar(it.scale);
      p.set(it.x, it.y, it.z);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      if (it.color) mesh.setColorAt(i, it.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = opts.castShadow ?? false;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    group.add(mesh);
  }
  return group;
}

/** Jagged cone: base ring alternates in/out for a spiky pixel silhouette. */
function jaggedCone(r: number, h: number, seg: number, rng: Random): THREE.BufferGeometry {
  const g = cone(r, h, seg, 0.06);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  // Per-ring-vertex offsets keyed by segment index so side and cap vertices stay welded.
  const jitter = Array.from({ length: seg + 1 }, () => [rng.signed() * 0.06, rng.next() * 0.03]);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (y < -h / 2 + 1e-4 && x * x + z * z > 1e-8) {
      const a = (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2);
      const s = Math.round((a / (Math.PI * 2)) * seg) % seg;
      const k = 1 + (s % 2 === 0 ? 0.18 : -0.12) + jitter[s][0];
      pos.setXYZ(i, x * k, y - jitter[s][1], z * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Unit-height pine (scale = height in metres). Returns trunk + foliage geometry. */
export function pineGeometry(seed = 'pine') {
  const rng = new Random(seed);
  const trunk = place(cylinder(0.016, 0.034, 0.62, 6, 0.08), 0, 0.31, 0);
  const tiers: THREE.BufferGeometry[] = [];
  const spec = [
    [0.24, 0.34, 0.33],
    [0.2, 0.3, 0.5],
    [0.15, 0.27, 0.66],
    [0.1, 0.23, 0.8],
    [0.055, 0.17, 0.93],
  ];
  for (const [r, h, y] of spec) tiers.push(place(jaggedCone(r, h, 10, rng), 0, y, 0, rng.next() * Math.PI));
  return { trunk, foliage: merge(tiers) };
}

/** Two crossed quads with up-facing normals (shades like the ground beneath). */
export function cardGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const g = merge([a, b]);
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** Low-poly boulder variants (flat-shaded icosahedra with noise). */
export function boulderGeometry(seed: string): THREE.BufferGeometry {
  const rng = new Random(seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) cache.set(key, (k = 0.75 + rng.next() * 0.45));
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.72, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  scaleUV(g, 2, 2);
  return g;
}
