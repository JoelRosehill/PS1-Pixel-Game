import * as THREE from 'three';
import { Random } from '../../core/Random';
import type { ColliderWorld } from '../../physics/Colliders';
import { glow } from '../../render/Materials';
import type { BiomeSite } from '../engine/WorldAtlas';
import { box, cone, cylinder, GeoBucket, place } from '../geometry';
import { buildCitadel } from '../props/Landmarks';
import type { WorldMaterials } from '../props/WorldMaterials';

export interface Landmark {
  group: THREE.Group;
  /** Where it stands (world). */
  x: number;
  z: number;
  /** Keep props and camps this far away. */
  clearance: number;
  name: string;
  /** Light anchors; the world lends its small pool of point lights to the nearest. */
  lights: LightAnchor[];
}

export interface LightAnchor {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

type Height = (x: number, z: number) => number;

/**
 * Signature set pieces, one per biome site, visible from far away (Pillar 4:
 * Elden Ring-style landmarks that make distant places readable). Built once in
 * world space; each is merged into a handful of draw calls.
 */
export function buildBiomeLandmark(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height): Landmark {
  const rng = new Random(`landmark:${site.id}`);
  switch (site.biome.archetype) {
    case 'wilderness': return watchtower(site, m, col, heightAt, rng);
    case 'marsh': return obeliskRing(site, m, col, heightAt, rng);
    case 'terrace': return sunTemple(site, m, col, heightAt, rng);
    case 'caverns': return crystalHall(site, m, col, heightAt, rng);
    case 'bloodstone': return shadowCitadel(site, m, col, heightAt, rng);
  }
}

/** Finds dry, gentle ground near (x, z) by spiralling outward. */
export function findGround(x: number, z: number, heightAt: Height, minH = 1, maxSlope = 0.2, reach = 260): [number, number] {
  for (let r = 0; r <= reach; r += 12) {
    const steps = Math.max(1, Math.round(r / 10));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 + r * 0.1;
      const px = x + Math.sin(a) * r;
      const pz = z + Math.cos(a) * r;
      const h = heightAt(px, pz);
      if (h < minH) continue;
      const e = 4;
      const slope = Math.max(Math.abs(heightAt(px + e, pz) - h), Math.abs(heightAt(px, pz + e) - h)) / e;
      if (slope <= maxSlope) return [px, pz];
    }
  }
  return [x, z];
}

function watchtower(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 1.5);
  const y = heightAt(x, z) - 0.5;
  const b = new GeoBucket();
  const h = 20 + rng.next() * 8;
  b.add(m.castle, place(cylinder(3.2, 3.8, h, 10, 3), x, y + h / 2, z));
  b.add(m.trim, place(cylinder(4.2, 4.2, 1, 10, 3), x, y + h, z));
  b.add(m.roof, place(cone(4.8, 8, 10, 3), x, y + h + 4.5, z));
  for (let k = 0; k < 3; k++) b.add(m.windowWarm, place(box(0.8, 1.6, 0.4), x + Math.sin(k * 2.1) * 3.3, y + 6 + k * 5, z + Math.cos(k * 2.1) * 3.3, k * 2.1));
  col.addCylinder(x, y + h / 2, z, 3.8, h);
  // A ring of standing stones and a fallen log.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sx = x + Math.sin(a) * 11, sz = z + Math.cos(a) * 11;
    const sy = heightAt(sx, sz);
    b.add(m.rock, place(box(1.2, 3 + rng.next() * 2, 0.8, 2), sx, sy + 1.4, sz, a));
    col.addBox(sx, sy + 1.4, sz, 1.2, 4, 0.8, a);
  }
  const group = b.build(new THREE.Group());
  group.name = `watchtower:${site.id}`;
  return { group, x, z, clearance: 16, name: 'Wayward Watchtower', lights: [{ x, y: y + 8, z, color: 0xffa04a, intensity: 18, distance: 18 }] };
}

function obeliskRing(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, -0.4, 0.3);
  const b = new GeoBucket();
  const rune = glow(0xb07cff, 2.6);
  const cap = glow(0x5affc8, 2.2);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.next() * 0.2;
    const r = 13 + rng.next() * 3;
    const ox = x + Math.sin(a) * r, oz = z + Math.cos(a) * r;
    const oy = heightAt(ox, oz) - 1;
    const h = 10 + rng.next() * 7;
    const lean = rng.signed() * 0.12;
    b.add(m.darkStone, place(box(1.6, h, 1.6, 2), ox, oy + h / 2, oz, a, lean));
    b.add(m.darkStone, place(cone(1.2, 1.8, 4, 1), ox, oy + h + 0.8, oz, a + Math.PI / 4, lean));
    b.add(rune, place(box(0.3, h * 0.6, 1.66, 1), ox, oy + h * 0.5, oz, a, lean));
    col.addBox(ox, oy + h / 2, oz, 1.6, h, 1.6, a);
  }
  // The great mushroom at the centre.
  const y = heightAt(x, z);
  b.add(m.ash, place(cylinder(1.1, 1.6, 12, 8, 2), x, y + 6, z));
  b.add(cap, place(cone(8, 4.5, 12, 2), x, y + 13.5, z));
  col.addCylinder(x, y + 6, z, 1.6, 12);
  const group = b.build(new THREE.Group());
  group.name = `obelisks:${site.id}`;
  return { group, x, z, clearance: 20, name: 'The Drowned Circle', lights: [{ x, y: y + 10, z, color: 0x5affc8, intensity: 30, distance: 30 }] };
}

function sunTemple(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 1.5, 0.35);
  const y = heightAt(x, z);
  const b = new GeoBucket();
  const gold = glow(0xffd36a, 2.4);
  const rot = rng.next() * Math.PI;
  const top = y + 3;
  // Platform with a stair on the front face.
  b.add(m.marble, place(box(24, top - y + 3, 24, 3), x, y + (top - y - 3) / 2, z, rot));
  col.addBox(x, y + (top - y - 3) / 2, z, 24, top - y + 3, 24, rot);
  for (let s = 0; s < 4; s++) {
    const d = 12 + 0.8 + s * 0.8;
    const sx = x + Math.sin(rot) * d, sz = z + Math.cos(rot) * d;
    const sh = 3 - s * 0.75;
    b.add(m.marble, place(box(8, sh, 0.8, 2), sx, top - 3 + sh / 2 - 0.0, sz, rot));
    col.addBox(sx, top - 3 + sh / 2, sz, 8, sh, 0.8, rot);
  }
  // Colonnade.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const cx = x + Math.sin(a) * 9.5, cz = z + Math.cos(a) * 9.5;
    const broken = rng.chance(0.3);
    const h = broken ? 3 + rng.next() * 4 : 9;
    b.add(m.marble, place(cylinder(0.7, 0.8, h, 10, 2), cx, top + h / 2, cz));
    if (!broken) b.add(m.marble, place(box(1.9, 0.5, 1.9, 2), cx, top + h + 0.25, cz, a));
    col.addCylinder(cx, top + h / 2, cz, 0.8, h);
  }
  // Architrave fragments and the sun disc on its altar.
  b.add(m.marble, place(box(15, 0.8, 1.6, 2), x + Math.sin(rot + 0.6) * 9.5, top + 9.9, z + Math.cos(rot + 0.6) * 9.5, rot + 0.6 + Math.PI / 2));
  b.add(m.marble, place(box(2.4, 2, 2.4, 2), x, top + 1, z, rot));
  col.addBox(x, top + 1, z, 2.4, 2, 2.4, rot);
  const disc = new THREE.TorusGeometry(3, 0.35, 6, 32);
  b.add(gold, place(disc, x, top + 6, z, rot));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(gold, place(box(0.25, 1.4, 0.25, 1), x + Math.cos(a) * Math.cos(rot) * 4.2, top + 6 + Math.sin(a) * 4.2, z - Math.cos(a) * Math.sin(rot) * 4.2, rot, 0, a - Math.PI / 2));
  }
  const group = b.build(new THREE.Group());
  group.name = `sun-temple:${site.id}`;
  return { group, x, z, clearance: 22, name: 'Temple of the Low Sun', lights: [{ x, y: top + 6, z, color: 0xffd36a, intensity: 22, distance: 22 }] };
}

function crystalHall(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random): Landmark {
  const x = site.x, z = site.z;
  const y = heightAt(x, z);
  const b = new GeoBucket();
  const pink = glow(0xff7ae0, 1.9);
  const blue = glow(0x7ae0ff, 1.9);
  // Colossal crystals around the hall's heart.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.next() * 0.4;
    const r = i === 0 ? 0 : 14 + rng.next() * 10;
    const cx = x + Math.sin(a) * r, cz = z + Math.cos(a) * r;
    const cy = heightAt(cx, cz);
    const h = 18 + rng.next() * 22;
    const shard = new THREE.OctahedronGeometry(1, 0).scale(2.4, h / 2, 2.4);
    b.add(i % 2 ? pink : blue, place(shard, cx, cy + h * 0.4, cz, rng.next() * 3, rng.signed() * 0.25, rng.signed() * 0.25));
    col.addCylinder(cx, cy + h * 0.3, cz, 2.2, h * 0.6);
  }
  // The cavern roof: a broken rock shell over the basin with an open oculus.
  const R = site.radius * (site.biome.terrain.crater?.radius ?? 0.6);
  const roofY = (site.biome.terrain.crater?.floor ?? 6) + 36;
  const shell = new THREE.RingGeometry(R * 0.26, R * 1.1, 40, 4);
  const sp = shell.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const px = sp.getX(i), py = sp.getY(i);
    const d = Math.hypot(px, py) / R;
    sp.setZ(i, (Math.sin(px * 0.05) + Math.cos(py * 0.07)) * 3 - (d - 0.26) * 8);
  }
  shell.rotateX(Math.PI / 2);
  shell.computeVertexNormals();
  const rockBoth = m.rock.clone();
  rockBoth.side = THREE.DoubleSide;
  b.add(rockBoth, place(shell, x, roofY, z));
  // Stalactites hanging from the shell.
  for (let i = 0; i < 40; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = R * (0.32 + rng.next() * 0.7);
    const len = 6 + rng.next() * 16;
    b.add(i % 3 ? rockBoth : (i % 2 ? pink : blue), place(cone(1.2 + rng.next() * 1.5, len, 6, 2), x + Math.sin(a) * r, roofY - len / 2 - 1, z + Math.cos(a) * r, 0, Math.PI, 0));
  }
  const group = b.build(new THREE.Group(), { castShadow: true });
  group.name = `crystal-hall:${site.id}`;
  return {
    group, x, z, clearance: 34, name: 'The Singing Hall',
    lights: [
      { x: x + 8, y: y + 12, z, color: 0xff7ae0, intensity: 60, distance: 55 },
      { x: x - 8, y: y + 12, z, color: 0x7ae0ff, intensity: 60, distance: 55 },
    ],
  };
}

function shadowCitadel(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 10, 0.4);
  const y = heightAt(x, z);
  const citadel = buildCitadel(m, `citadel:${site.id}`);
  const s = 0.24 + rng.next() * 0.12;
  citadel.scale.setScalar(s);
  citadel.position.set(x, y - 6, z);
  citadel.rotation.y = rng.next() * Math.PI * 2;
  col.addCylinder(x, y + 20 * s, z, 55 * s, 120 * s + 40);
  // A dark portal ring on the approach.
  const b = new GeoBucket();
  const px = x + 60, pz = z + 20;
  const py = heightAt(px, pz);
  b.add(m.darkStone, place(new THREE.TorusGeometry(9, 1.3, 8, 28), px, py + 9, pz, 0.6));
  b.add(glow(0xff2a44, 3), place(new THREE.TorusGeometry(7.6, 0.25, 4, 36), px, py + 9, pz, 0.6));
  b.add(m.darkStone, place(box(4, 2, 4, 2), px, py + 0.5, pz, 0.6));
  col.addBox(px + Math.cos(0.6) * 8, py + 9, pz - Math.sin(0.6) * 8, 2.6, 18, 2.6);
  col.addBox(px - Math.cos(0.6) * 8, py + 9, pz + Math.sin(0.6) * 8, 2.6, 18, 2.6);
  const group = b.build(new THREE.Group());
  group.add(citadel);
  group.name = `shadow-citadel:${site.id}`;
  return { group, x, z, clearance: 70, name: 'Citadel of the Red Hour', lights: [{ x: px, y: py + 9, z: pz, color: 0xff2a44, intensity: 30, distance: 30 }] };
}
