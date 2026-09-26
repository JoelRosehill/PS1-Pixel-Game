import * as THREE from 'three';
import type { ColliderWorld } from '../../physics/Colliders';
import { glow } from '../../render/Materials';
import { box, cylinder, GeoBucket, place } from '../geometry';
import type { WorldMaterials } from './WorldMaterials';

export interface SunkeeperRuin {
  group: THREE.Group;
  /** Pillar tops the Sunkeeper Wizards blink between: [x, y, z]. */
  perches: [number, number, number][];
}

/**
 * "Sunkeeper Watch": a ring of tall marble pillars around a sun altar (Pillar 5 set
 * piece). Each pillar has broken steps on its inner face — 1.5 m, 3.1 m, then the
 * 4.9 m top — reachable with held jumps, faster with wall-kicks or Updraft. Two low
 * walls give cover from the wizards' flash and orbs. Built in world space.
 */
export function buildSunkeeperRuin(
  m: WorldMaterials,
  col: ColliderWorld,
  cx: number,
  cz: number,
  heightAt: (x: number, z: number) => number,
): SunkeeperRuin {
  const b = new GeoBucket();
  const gold = glow(0xffd36a, 2.2);
  const perches: [number, number, number][] = [];
  const floorY = heightAt(cx, cz) + 0.1;
  const solid = (x: number, y: number, z: number, w: number, h: number, d: number, rot = 0, mat: THREE.Material = m.marble) => {
    b.add(mat, place(box(w, h, d, 2), x, y, z, rot));
    col.addBox(x, y, z, w, h, d, rot);
  };

  // Sun altar: a round dais with a gilded ring standing on edge.
  b.add(m.marble, place(cylinder(4.2, 4.5, 0.5, 20, 2), cx, floorY, cz));
  col.addCylinder(cx, floorY, cz, 4.4, 0.5);
  b.add(m.marble, place(box(1.2, 1.1, 1.2, 1), cx, floorY + 0.8, cz));
  col.addBox(cx, floorY + 0.8, cz, 1.2, 1.1, 1.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 6, 28), gold);
  ring.position.set(cx, floorY + 3.1, cz);
  ring.name = 'sun-ring';

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = cx + Math.cos(a) * 10;
    const z = cz + Math.sin(a) * 10;
    const ground = Math.min(heightAt(x, z), heightAt(x - 1, z), heightAt(x + 1, z), heightAt(x, z - 1), heightAt(x, z + 1)) - 0.3;
    const top = ground + 0.3 + 4.9;
    const rot = -a;
    solid(x, (ground + top) / 2, z, 2.4, top - ground, 2.4, rot);
    b.add(gold, place(box(2.5, 0.12, 2.5, 1), x, top - 0.35, z, rot));
    b.add(m.marble, place(box(2.9, 0.3, 2.9, 2), x, top + 0.05, z, rot));
    col.addBox(x, top + 0.05, z, 2.9, 0.3, 2.9, rot);
    // Broken stair on the inner face, stepping down toward the altar.
    const ix = -Math.cos(a);
    const iz = -Math.sin(a);
    for (const [dist, h] of [[2.1, 3.1], [3.5, 1.5]] as const) {
      const sx = x + ix * dist;
      const sz = z + iz * dist;
      const g = heightAt(sx, sz) - 0.3;
      const stepTop = ground + 0.3 + h;
      solid(sx, (g + stepTop) / 2, sz, 1.4, stepTop - g, 1.4, rot);
    }
    perches.push([x, top + 0.2, z]);
  }

  // Two broken walls: cover to break line of sight.
  for (const [ox, oz, rot] of [[-5.5, 4, 0.4], [5, -5, -0.9]] as const) {
    const x = cx + ox;
    const z = cz + oz;
    const g = heightAt(x, z);
    solid(x, g + 0.6, z, 4.2, 1.8, 0.7, rot);
  }

  // Scattered rubble and fallen drums (visual only).
  for (const [ox, oz, r] of [[7, 6, 0.3], [-8, -4, 1.2], [3, 9, 2.1], [-3, -9, 0.7]] as const) {
    const x = cx + ox;
    const z = cz + oz;
    b.add(m.marble, place(cylinder(0.55, 0.55, 1.6, 10, 2), x, heightAt(x, z) + 0.45, z, r, 0, Math.PI / 2));
  }

  const group = b.build(new THREE.Group());
  group.add(ring);
  group.name = 'sunkeeper-ruin';
  return { group, perches };
}
