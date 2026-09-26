import * as THREE from 'three';
import type { ColliderWorld } from '../../physics/Colliders';
import { box, GeoBucket, cylinder, place, tint } from '../geometry';
import type { WorldMaterials } from './WorldMaterials';

/**
 * "The Wayfarer's Trial" — ruins east of the plaza that exercise every movement verb:
 * a ramp to slide down, a tunnel too low to run through, a wall-jump shaft, stepped
 * platforms, and a dash gap guarding the collectible Windstep page.
 */
export interface ParkourCourse {
  group: THREE.Group;
  page: THREE.Object3D;
  update(t: number): void;
}

export function buildParkourCourse(
  m: WorldMaterials,
  col: ColliderWorld,
  centre: { x: number; z: number },
  baseY: number,
): ParkourCourse {
  const b = new GeoBucket();
  const group = new THREE.Group();
  group.name = 'parkour';

  /** Solid piece: mesh + collider. Local coords are relative to the course centre; y is above baseY. */
  const solid = (
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    mat: THREE.Material,
    rotZ = 0,
    shade = 0xffffff,
  ) => {
    const wx = centre.x + x;
    const wy = baseY + y;
    const wz = centre.z + z;
    const geo = place(box(w, h, d, 3), wx, wy, wz, 0, 0, rotZ);
    b.add(mat, mat === m.castle ? tint(geo, shade) : geo);
    col.addBox(wx, wy, wz, w, h, d, 0, 0, rotZ);
  };

  /** Platform whose top surface sits at `top` metres above the base. */
  const platform = (x: number, top: number, z: number, w: number, d: number, shade = 0xffffff) => {
    solid(x, top - 0.45, z, w, 0.9, d, m.castle, 0, shade);
    // Legs down to the ground so platforms read as ruins, not floating slabs.
    if (top > 1.6) {
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          solid(x + sx * (w / 2 - 0.7), (top - 0.9) / 2, z + sz * (d / 2 - 0.7), 0.8, top - 0.9, 0.8, m.castle, 0, 0xdde4dd);
    }
  };

  // --- entrance markers
  for (const sz of [-1, 1]) {
    const wx = centre.x - 30;
    const wz = centre.z + sz * 5;
    b.add(m.marble, place(cylinder(0.5, 0.58, 4.4, 12, 2), wx, baseY + 2.2, wz));
    b.add(m.marble, place(box(1.5, 0.4, 1.5, 2), wx, baseY + 0.2, wz));
    col.addCylinder(wx, baseY + 2.2, wz, 0.58, 4.4);
  }

  // --- slide tunnel: roof too low to run under (x -40 → -30)
  for (const sz of [-1, 1]) solid(-35, 0.9, sz * 3.4, 11, 1.8, 0.9, m.castle, 0, 0xe8eee8);
  solid(-35, 1.65, 0, 11.4, 0.7, 7.8, m.castle, 0, 0xd6ded6);
  for (let i = 0; i < 3; i++) solid(-40.5 + i * 5.5, 2.4, 0, 1.2, 0.8, 8.2, m.trim);

  // --- ramp down from the high platform into the tunnel
  const rampRise = 5.5;
  const rampRun = 14;
  const rampAngle = Math.atan2(rampRise, rampRun);
  solid(-19, rampRise / 2, 0, Math.hypot(rampRun, rampRise) + 0.6, 0.9, 6, m.cobble, rampAngle);
  for (const sz of [-1, 1]) solid(-19, rampRise / 2 + 0.7, sz * 3.2, Math.hypot(rampRun, rampRise), 0.5, 0.5, m.trim, rampAngle);
  platform(-8, rampRise, 0, 10, 7, 0xf0f4f0);

  // --- stepped platforms leading up to the ramp top
  platform(-6, 1.4, 10, 4.5, 4.5);
  platform(-1, 2.8, 8.5, 4.5, 4.5);
  platform(-4.5, 4.2, 4.5, 4.5, 4.5);

  // --- wall-jump shaft (walls 4 m apart) with a ledge on top
  for (const sz of [-1, 1]) solid(5, 5, sz * 2.5, 12, 10, 1, m.castle, 0, 0xe0e8e0);
  platform(11.5, 8, 0, 6, 6, 0xf0f4f0);
  b.add(m.trim, place(box(6.2, 0.4, 6.2, 2), centre.x + 11.5, baseY + 8.25, centre.z));

  // --- dash gap
  platform(18, 6, 0, 6, 6);
  platform(28.5, 6, 0, 6, 6);
  // one more wall to kick off toward the prize
  solid(32.5, 5.5, -4.5, 1, 11, 7, m.castle, 0, 0xd8e0d8);

  // --- reward ledge with the floating Lost Page
  platform(34, 9.5, 2, 7, 7, 0xfbfdfb);
  const crystalX = centre.x + 36;
  b.add(m.crystalBlue, place(cylinder(0.3, 0.36, 2.2, 6, 1), crystalX, baseY + 10.6, centre.z + 4));

  const page = new THREE.Group();
  const paper = new THREE.Mesh(box(0.62, 0.86, 0.03, 1), m.portalGlow);
  const sigil = new THREE.Mesh(box(0.3, 0.3, 0.05, 1), m.windowWarm);
  page.add(paper, sigil);
  page.position.set(centre.x + 34, baseY + 11.6, centre.z + 2);
  group.add(page);

  b.build(group);
  return {
    group,
    page,
    update(t: number) {
      page.rotation.y = t * 1.1;
      page.position.y = baseY + 11.6 + Math.sin(t * 1.6) * 0.22;
      sigil.rotation.z = -t * 2.2;
    },
  };
}
