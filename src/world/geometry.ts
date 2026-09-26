import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Scales UVs so that one texture repeat spans `tile` world metres. */
export function scaleUV(geo: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/** Box with world-scaled UVs on every face. */
export function box(w: number, h: number, d: number, tile = 4): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const faceSize: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * faceSize[f][0]) / tile, (uv.getY(i) * faceSize[f][1]) / tile);
    }
  return g;
}

export function cylinder(rTop: number, rBottom: number, h: number, seg = 12, tile = 4, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
  return scaleUV(g, (Math.PI * 2 * Math.max(rTop, rBottom)) / tile, h / tile);
}

export function cone(r: number, h: number, seg = 12, tile = 4) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  return scaleUV(g, (Math.PI * 2 * r) / tile, Math.hypot(r, h) / tile);
}

/** Bakes a transform into the geometry. */
export function place(
  geo: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotY = 0,
  rotX = 0,
  rotZ = 0,
  scale: number | THREE.Vector3 = 1,
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')),
    typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale,
  );
  return geo.applyMatrix4(m);
}

/** Paints a flat vertex colour so differently-tinted parts can share one draw call. */
export function tint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Merges geometries, normalising indexed/non-indexed and attribute sets first. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  const anyNonIndexed = geos.some((g) => !g.index);
  const withColor = geos.some((g) => g.getAttribute('color'));
  const prepared = geos.map((g) => {
    let out = anyNonIndexed && g.index ? g.toNonIndexed() : g;
    if (withColor && !out.getAttribute('color')) out = tint(out, 0xffffff);
    for (const name of Object.keys(out.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) out.deleteAttribute(name);
    }
    return out;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('mergeGeometries failed: attribute mismatch');
  return merged;
}

export class GeoBucket {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geo: THREE.BufferGeometry): void {
    let list = this.buckets.get(material);
    if (!list) this.buckets.set(material, (list = []));
    list.push(geo);
  }

  /** One merged mesh per material. */
  build(group: THREE.Group, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.Group {
    for (const [mat, list] of this.buckets) {
      const mesh = new THREE.Mesh(merge(list), mat);
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}
