import * as THREE from 'three';
import { Random } from '../../core/Random';
import type { ColliderWorld } from '../../physics/Colliders';
import { box, cone, cylinder, GeoBucket, place, tint } from '../geometry';
import type { WorldMaterials } from './WorldMaterials';

const TAU = Math.PI * 2;

/**
 * Mossy castle with violet conical roofs and lamp-lit belvederes
 * (ref: reference_img/4c3b…jpg). Built in local space with the gate facing +Z.
 * Returns the merged group plus local lantern positions for point lights.
 */
export function buildCastle(m: WorldMaterials, col?: ColliderWorld, seed = 'castle') {
  const rng = new Random(seed);
  const b = new GeoBucket();
  const stone = (geo: THREE.BufferGeometry, t = 0xffffff) => b.add(m.castle, tint(geo, t));

  // Keep
  stone(place(box(14, 17, 12), 0, 8.5, -3));
  b.add(m.trim, place(box(15, 0.8, 13), 0, 17.2, -3));
  b.add(m.roof, place(cone(10.4, 9, 4, 4), 0, 17.6 + 4.5, -3, Math.PI / 4));
  for (let x = -6; x <= 6; x += 2) stone(place(box(1, 1.2, 1), x, 18.2, 3.2));

  col?.addBox(0, 8.5, -3, 14, 17, 12);

  // Curtain walls + crenellations
  stone(place(box(18, 11, 2.6), 0, 5.5, 6.5), 0xf0f4f0);
  for (let x = -8; x <= 8; x += 2) stone(place(box(1.1, 1.3, 2.8), x, 11.65, 6.5));
  for (const sx of [-9, 9]) {
    stone(place(box(2.6, 10, 15), sx, 5, -1.5), 0xe8ece8);
    for (let z = -8; z <= 5; z += 2) stone(place(box(2.8, 1.2, 1.1), sx, 10.6, z));
  }
  stone(place(box(18, 10, 2.6), 0, 5, -9.5));
  col?.addBox(0, 5.5, 6.5, 18, 11, 2.6);
  col?.addBox(-9, 5, -1.5, 2.6, 10, 15);
  col?.addBox(9, 5, -1.5, 2.6, 10, 15);
  col?.addBox(0, 5, -9.5, 18, 10, 2.6);

  // Towers: [x, z, height]
  const towers: [number, number, number][] = [
    [-9, 6.5, 21],
    [9, 6.5, 23],
    [-9, -9.5, 27],
    [9, -9.5, 24],
  ];
  for (const [tx, tz, th] of towers) {
    const shade = rng.pick([0xffffff, 0xeef2ee, 0xe4ece6]);
    stone(place(cylinder(3.2, 3.5, th, 14), tx, th / 2, tz), shade);
    b.add(m.trim, place(cylinder(3.9, 3.9, 1.4, 14), tx, 0.7, tz));
    b.add(m.trim, place(cylinder(3.95, 3.95, 0.8, 14), tx, th + 0.4, tz));
    stone(place(cylinder(3.0, 3.0, 2.4, 14), tx, th + 2.0, tz), 0xd8e0d8);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      b.add(m.windowWarm, place(box(0.9, 1.5, 0.3), tx + Math.sin(a) * 3.02, th + 2.0, tz + Math.cos(a) * 3.02, a));
    }
    b.add(m.trim, place(cylinder(3.6, 3.6, 0.5, 14), tx, th + 3.45, tz));
    col?.addCylinder(tx, th / 2, tz, 3.5, th);
    col?.addCylinder(tx, th + 2.2, tz, 3.2, 4.4);
    b.add(m.roof, place(cone(4.4, 9, 14, 4), tx, th + 3.7 + 4.5, tz));
    b.add(m.trim, place(cone(0.28, 2.2, 6), tx, th + 3.7 + 9 + 1.1, tz));
    // Arrow slits facing outward
    const out = Math.atan2(tx, tz);
    for (let k = 0; k < 3; k++) {
      const y = 5 + k * 5.2;
      const a = out + (k - 1) * 0.5;
      const lit = rng.chance(0.55);
      b.add(lit ? m.windowWarm : m.windowDark, place(box(0.7, 1.6, 0.3), tx + Math.sin(a) * 3.3, y, tz + Math.cos(a) * 3.3, a));
    }
  }

  // Keep windows (some lit, some dark)
  for (const y of [7.5, 11, 14.5])
    for (const x of [-4.5, 0, 4.5]) {
      const lit = rng.chance(0.6);
      b.add(lit ? m.windowWarm : m.windowDark, place(box(1.1, 1.9, 0.3), x, y, 3.05));
      b.add(m.trim, place(box(1.5, 0.3, 0.5), x, y - 1.1, 3.1));
    }

  // Gate: arched door with jambs
  b.add(m.wood, place(box(3.4, 5.2, 0.4), 0, 2.6, 7.9));
  b.add(m.trim, place(box(4.6, 0.9, 0.9), 0, 5.6, 8.0));
  b.add(m.trim, place(box(0.7, 5.2, 0.9), -2.1, 2.6, 8.0));
  b.add(m.trim, place(box(0.7, 5.2, 0.9), 2.1, 2.6, 8.0));
  b.add(m.trim, place(box(1.6, 0.8, 0.95), 0, 6.3, 8.0));

  // Lanterns flanking the gate
  const lanterns = [new THREE.Vector3(-3.1, 4.2, 8.6), new THREE.Vector3(3.1, 4.2, 8.6)];
  for (const l of lanterns) {
    b.add(m.windowWarm, place(box(0.45, 0.7, 0.45), l.x, l.y, l.z));
    b.add(m.darkStone, place(box(0.6, 0.15, 0.6), l.x, l.y + 0.42, l.z));
    b.add(m.darkStone, place(box(0.12, 0.6, 0.12), l.x, l.y - 0.6, l.z - 0.2));
  }

  const group = b.build(new THREE.Group());
  group.name = 'castle';
  return { group, lanterns };
}
