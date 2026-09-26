import * as THREE from 'three';
import { Random } from '../../core/Random';
import { box, cone, cylinder, GeoBucket, place } from '../geometry';
import type { WorldMaterials } from './WorldMaterials';

/**
 * The Spire Citadel: a colossal gothic silhouette on a crag, meant to stand
 * against the blood moon (ref: reference_img/995f…png, a90b…png).
 */
export function buildCitadel(m: WorldMaterials, seed = 'citadel'): THREE.Group {
  const rng = new Random(seed);
  const b = new GeoBucket();
  const cragH = 120;
  b.add(m.rock, place(crag(70, 150, cragH, seed), 0, cragH / 2, 0));

  const top = cragH;
  // Central keep and great spire
  b.add(m.darkStone, place(box(56, 70, 44), 0, top + 35, 0));
  b.add(m.darkStone, place(cylinder(10, 13, 170, 8), 0, top + 85, -4));
  b.add(m.darkStone, place(cone(14, 80, 8), 0, top + 170 + 40, -4));
  b.add(m.darkStone, place(cone(1.5, 30, 4), 0, top + 250 + 15, -4));
  // Flanking spires
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng.signed() * 0.2;
    const d = 30 + rng.next() * 26;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d * 0.8;
    const r = 3 + rng.next() * 3.5;
    const h = 45 + rng.next() * 110;
    b.add(m.darkStone, place(cylinder(r, r * 1.15, h, 6), x, top + h / 2, z));
    b.add(m.darkStone, place(cone(r * 1.35, h * 0.42, 6), x, top + h + h * 0.21, z));
    // Glowing slit windows
    for (let k = 0; k < 3; k++)
      if (rng.chance(0.5)) {
        const wy = top + h * (0.35 + k * 0.2);
        b.add(m.windowRed, place(box(r * 0.5, 4, 0.8), x, wy, z + r * 1.05));
      }
  }
  // Buttresses leaning on the keep
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++)
      b.add(m.darkStone, place(box(6, 60, 8), sx * 36, top + 25, -14 + k * 14, 0, 0, sx * 0.25));
  // Great window rows on the keep and spire
  for (let k = 0; k < 6; k++) b.add(m.windowRed, place(box(3, 9, 1), -18 + k * 7.2, top + 40, 22.2));
  for (let k = 0; k < 5; k++) b.add(m.windowRed, place(box(2.4, 6, 1), 0, top + 60 + k * 22, 7.5));

  const group = b.build(new THREE.Group(), { castShadow: false, receiveShadow: false });
  group.name = 'citadel';
  return group;
}

/** A craggy rock mass: displaced cylinder. */
function crag(rTop: number, rBottom: number, h: number, seed: string): THREE.BufferGeometry {
  const rng = new Random(seed);
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 14, 6).toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    let k = cache.get(key);
    if (k === undefined) cache.set(key, (k = 0.78 + rng.next() * 0.4));
    const topRing = pos.getY(i) > h / 2 - 1e-3;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) + (topRing ? 0 : (k - 1) * h * 0.08), pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
