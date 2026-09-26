import * as THREE from 'three';
import { Random } from '../../core/Random';
import type { ColliderWorld } from '../../physics/Colliders';
import { glow, toon } from '../../render/Materials';
import type { BiomeSite } from '../engine/WorldAtlas';
import { box, cone, cylinder, GeoBucket, place, tint } from '../geometry';
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
  const spec = site.biome.landmark;
  const color = spec.color ?? 0xffd36a;
  const lm = (() => {
    switch (spec.kind) {
      case 'watchtower': return watchtower(site, m, col, heightAt, rng, color);
      case 'obelisks': return obeliskRing(site, m, col, heightAt, rng, color);
      case 'temple': return sunTemple(site, m, col, heightAt, rng, color);
      case 'crystalHall': return crystalHall(site, m, col, heightAt, rng, color);
      case 'citadel': return shadowCitadel(site, m, col, heightAt, rng, color);
      case 'portal': return portal(site, m, col, heightAt, rng, color);
      case 'ruins': return ruinedKeep(site, m, col, heightAt, rng, color);
      case 'bones': return colossalBones(site, col, heightAt, rng, color);
      case 'arch': return stoneArch(site, m, col, heightAt, rng, color);
      case 'greatTree': return greatTree(site, m, col, heightAt, rng, color);
    }
  })();
  if (spec.name) lm.name = spec.name;
  return lm;
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

function watchtower(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 1.5);
  const y = heightAt(x, z) - 0.5;
  const b = new GeoBucket();
  const h = 20 + rng.next() * 8;
  b.add(m.castle, tint(place(cylinder(3.2, 3.8, h, 10, 3), x, y + h / 2, z), 0xe8ece8));
  b.add(m.trim, place(cylinder(4.2, 4.2, 1, 10, 3), x, y + h, z));
  b.add(m.roof, place(cone(4.8, 8, 10, 3), x, y + h + 4.5, z));
  const windows = glow(color, 2.6);
  for (let k = 0; k < 3; k++) b.add(windows, place(box(0.8, 1.6, 0.4), x + Math.sin(k * 2.1) * 3.3, y + 6 + k * 5, z + Math.cos(k * 2.1) * 3.3, k * 2.1));
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
  return { group, x, z, clearance: 16, name: 'Wayward Watchtower', lights: [{ x, y: y + 8, z, color, intensity: 18, distance: 18 }] };
}

function obeliskRing(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, -0.4, 0.3);
  const b = new GeoBucket();
  const rune = glow(color, 2.6);
  const cap = glow(color, 2.2);
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
  return { group, x, z, clearance: 20, name: 'The Drowned Circle', lights: [{ x, y: y + 10, z, color, intensity: 30, distance: 30 }] };
}

function sunTemple(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 1.5, 0.35);
  const y = heightAt(x, z);
  const b = new GeoBucket();
  const gold = glow(color, 2.4);
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
  return { group, x, z, clearance: 22, name: 'Temple of the Low Sun', lights: [{ x, y: top + 6, z, color, intensity: 22, distance: 22 }] };
}

function crystalHall(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const x = site.x, z = site.z;
  const y = heightAt(x, z);
  const b = new GeoBucket();
  // The accent colour and its opposite hue, so every hall has two-tone light.
  const second = new THREE.Color(color).offsetHSL(0.5, 0, 0).getHex();
  const pink = glow(color, 1.9);
  const blue = glow(second, 1.9);
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
      { x: x + 8, y: y + 12, z, color, intensity: 60, distance: 55 },
      { x: x - 8, y: y + 12, z, color: second, intensity: 60, distance: 55 },
    ],
  };
}

function shadowCitadel(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
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
  b.add(glow(color, 3), place(new THREE.TorusGeometry(7.6, 0.25, 4, 36), px, py + 9, pz, 0.6));
  b.add(m.darkStone, place(box(4, 2, 4, 2), px, py + 0.5, pz, 0.6));
  col.addBox(px + Math.cos(0.6) * 8, py + 9, pz - Math.sin(0.6) * 8, 2.6, 18, 2.6);
  col.addBox(px - Math.cos(0.6) * 8, py + 9, pz + Math.sin(0.6) * 8, 2.6, 18, 2.6);
  const group = b.build(new THREE.Group());
  group.add(citadel);
  group.name = `shadow-citadel:${site.id}`;
  return { group, x, z, clearance: 70, name: 'Citadel of the Red Hour', lights: [{ x: px, y: py + 9, z: pz, color, intensity: 30, distance: 30 }] };
}

// --- Job 7 landmark kinds ------------------------------------------------------------

/** A free-standing gothic portal ring with a glowing veil. */
function portal(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 1, 0.25);
  const y = heightAt(x, z);
  const rot = rng.next() * Math.PI;
  const R = 9 + rng.next() * 5;
  const b = new GeoBucket();
  const veil = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  b.add(m.darkStone, place(new THREE.TorusGeometry(R, 1.5, 8, 32), x, y + R + 1.5, z, rot));
  b.add(glow(color, 2.6), place(new THREE.TorusGeometry(R - 1.3, 0.3, 4, 40), x, y + R + 1.5, z, rot));
  b.add(veil, place(new THREE.CircleGeometry(R - 1.4, 32), x, y + R + 1.5, z, rot));
  // Plinth, stairs and finials.
  b.add(m.darkStone, place(box(R * 2.4, 1.2, 6, 2), x, y + 0.2, z, rot));
  col.addBox(x, y + 0.2, z, R * 2.4, 1.2, 6, rot);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    const fx = x + Math.cos(rot) * Math.cos(a) * (R + 2.5);
    const fz = z - Math.sin(rot) * Math.cos(a) * (R + 2.5);
    b.add(m.darkStone, place(cone(1, 4.5, 5, 1), fx, y + R + 1.5 + Math.sin(a) * (R + 2.5), fz, rot, 0, a - Math.PI / 2));
  }
  for (const side of [-1, 1]) {
    const px = x + Math.cos(rot) * side * (R + 1), pz = z - Math.sin(rot) * side * (R + 1);
    col.addBox(px, y + R, pz, 2.4, R * 2, 3, rot);
  }
  const group = b.build(new THREE.Group());
  group.name = `portal:${site.id}`;
  return { group, x, z, clearance: R + 10, name: 'The Old Door', lights: [{ x, y: y + R, z, color, intensity: 30, distance: 34 }] };
}

/** A ruined keep: broken curtain walls, tower stumps and burning braziers. */
function ruinedKeep(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 1, 0.3);
  const y = heightAt(x, z);
  const rot = rng.next() * Math.PI;
  const half = 14 + rng.next() * 6;
  const b = new GeoBucket();
  const local = (lx: number, lz: number): [number, number] => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
  // Curtain walls: segments of varying height with gaps.
  for (let side = 0; side < 4; side++) {
    for (let k = -3; k <= 3; k++) {
      if (rng.chance(0.22) || (side === 0 && Math.abs(k) <= 0)) continue;
      const along = k * (half * 2 / 7);
      const [lx, lz] = side === 0 ? [along, half] : side === 1 ? [half, along] : side === 2 ? [along, -half] : [-half, along];
      const [wx, wz] = local(lx, lz);
      const wy = heightAt(wx, wz) - 1;
      const h = 3 + rng.next() * 8;
      const wrot = rot + (side % 2 ? Math.PI / 2 : 0);
      b.add(m.castle, tint(place(box(half * 2 / 7 + 0.1, h, 1.8, 3), wx, wy + h / 2, wz, wrot), 0xe8ece8));
      col.addBox(wx, wy + h / 2, wz, half * 2 / 7 + 0.1, h, 1.8, wrot);
    }
  }
  // Tower stumps at the corners.
  const fire = glow(color, 3);
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    if (rng.chance(0.25)) continue;
    const [tx, tz] = local(cx * half, cz * half);
    const ty = heightAt(tx, tz) - 1;
    const h = 8 + rng.next() * 16;
    b.add(m.castle, tint(place(cylinder(3.2, 3.6, h, 8, 3), tx, ty + h / 2, tz), 0xe8ece8));
    for (let t = 0; t < 4; t++) b.add(m.castle, tint(place(box(1.2, 1.4 + rng.next() * 1.4, 1.2, 1), tx + Math.sin(t * 1.57) * 2.6, ty + h + 0.6, tz + Math.cos(t * 1.57) * 2.6), 0xe8ece8));
    b.add(fire, place(box(1, 1, 1, 1), tx, ty + h + 0.4, tz));
    col.addCylinder(tx, ty + h / 2, tz, 3.6, h);
  }
  // Braziers at the gate.
  for (const side of [-1, 1]) {
    const [bx, bz] = local(side * 4, half + 3);
    const by = heightAt(bx, bz);
    b.add(m.darkStone, place(cylinder(0.5, 0.7, 1.4, 6, 1), bx, by + 0.7, bz));
    b.add(fire, place(cone(0.6, 1.2, 6, 1), bx, by + 2, bz));
  }
  const group = b.build(new THREE.Group());
  group.name = `ruins:${site.id}`;
  const [gx, gz] = local(0, half + 3);
  return { group, x, z, clearance: half + 12, name: 'The Broken Keep', lights: [{ x: gx, y: y + 3, z: gz, color, intensity: 20, distance: 20 }] };
}

/** The skeleton of something colossal: spine, ribs, and a horned skull with lit sockets. */
function colossalBones(site: BiomeSite, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 0.5, 0.3);
  const rot = rng.next() * Math.PI * 2;
  const bone = toon({ color: 0xe8e0d0 });
  const b = new GeoBucket();
  const length = 50 + rng.next() * 25;
  const curve = (t: number): [number, number, number] => {
    const lx = Math.sin(t * 2.2) * 6;
    const lz = (t - 0.5) * length;
    const wx = x + lx * Math.cos(rot) + lz * Math.sin(rot);
    const wz = z - lx * Math.sin(rot) + lz * Math.cos(rot);
    return [wx, heightAt(wx, wz), wz];
  };
  // Spine and ribs.
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const [vx, vy, vz] = curve(t);
    const s = 1.4 + Math.sin(t * Math.PI) * 1.6;
    b.add(bone, place(box(s * 1.6, s * 1.2, s * 1.4, 1), vx, vy + s * 0.4, vz, rot + t * 0.4));
    if (i % 3 === 0) col.addSphere(vx, vy + s * 0.4, vz, s * 0.9);
    if (i > 2 && i < 12) {
      const ribR = 5 + Math.sin(t * Math.PI) * 5;
      const rib = new THREE.TorusGeometry(ribR, 0.45, 5, 12, Math.PI * 0.8);
      b.add(bone, place(rib, vx, vy + 0.2, vz, rot + Math.PI / 2 + t * 0.4, 0, Math.PI * 0.1));
      for (const side of [-1, 1]) col.addCylinder(vx + Math.cos(rot) * side * ribR, vy + ribR * 0.5, vz - Math.sin(rot) * side * ribR, 0.7, ribR);
    }
  }
  // Skull at the head end, horns, and glowing eye sockets.
  const [hx, hy, hz] = curve(1.05);
  b.add(bone, place(box(7, 5.5, 9, 1), hx, hy + 2.6, hz, rot));
  b.add(bone, place(box(5.5, 1.6, 7, 1), hx + Math.sin(rot) * 2, hy + 0.5, hz + Math.cos(rot) * 2, rot, 0.25));
  for (const side of [-1, 1]) {
    b.add(bone, place(cone(1.1, 9, 6, 1), hx + Math.cos(rot) * side * 3, hy + 8, hz - Math.sin(rot) * side * 3, rot, -0.4, side * 0.5));
    b.add(glow(color, 3), place(box(1.2, 1, 0.6, 1), hx + Math.cos(rot) * side * 1.8 + Math.sin(rot) * 4.5, hy + 3.4, hz - Math.sin(rot) * side * 1.8 + Math.cos(rot) * 4.5, rot));
  }
  col.addBox(hx, hy + 2.6, hz, 7, 5.5, 9, rot);
  const group = b.build(new THREE.Group());
  group.name = `bones:${site.id}`;
  return { group, x, z, clearance: length / 2 + 12, name: 'The Colossal Remains', lights: [{ x: hx, y: hy + 4, z: hz, color, intensity: 18, distance: 22 }] };
}

/** A great stone arch, or a run of aqueduct arches carrying a glowing channel. */
function stoneArch(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, -1, 0.35);
  const rot = rng.next() * Math.PI;
  const spans = 1 + Math.floor(rng.next() * 3);
  const R = 10 + rng.next() * 5;
  const b = new GeoBucket();
  const stone = m.marble;
  const top = Math.max(heightAt(x, z), 0) + R * 1.6;
  for (let i = 0; i < spans; i++) {
    const off = (i - (spans - 1) / 2) * R * 2.4;
    const ax = x + Math.cos(rot) * off, az = z - Math.sin(rot) * off;
    // Legs reach down to the ground (or the water) wherever it is.
    for (const side of [-1, 1]) {
      const lx = ax + Math.cos(rot) * side * R, lz = az - Math.sin(rot) * side * R;
      const ground = Math.min(heightAt(lx, lz), 0) - 2;
      const h = top - R * 0.6 - ground;
      b.add(stone, place(box(3.4, h, 4.2, 2), lx, ground + h / 2, lz, rot));
      col.addBox(lx, ground + h / 2, lz, 3.4, h, 4.2, rot);
    }
    b.add(stone, place(new THREE.TorusGeometry(R, 1.7, 6, 24, Math.PI), ax, top - R * 0.6, az, rot));
  }
  // Deck and the glowing channel running along it.
  const deckLen = spans * R * 2.4 + 4;
  b.add(stone, place(box(deckLen, 1.6, 4.6, 2), x, top + 1.2, z, rot));
  b.add(glow(color, 2.2), place(box(deckLen, 0.2, 1.4, 1), x, top + 2.05, z, rot));
  const group = b.build(new THREE.Group());
  group.name = `arch:${site.id}`;
  return { group, x, z, clearance: deckLen / 2 + 10, name: 'The Old Arch', lights: [{ x, y: top, z, color, intensity: 16, distance: 24 }] };
}

/** An ancient tree the size of a tower, hung with glowing fruit. */
function greatTree(site: BiomeSite, m: WorldMaterials, col: ColliderWorld, heightAt: Height, rng: Random, color: number): Landmark {
  const [x, z] = findGround(site.x, site.z, heightAt, 1, 0.3);
  const y = heightAt(x, z) - 0.5;
  const b = new GeoBucket();
  const h = 30 + rng.next() * 14;
  const canopy = toon({ color: new THREE.Color(color).lerp(new THREE.Color(0x3a5a2a), 0.35).getHex() });
  // Twisting trunk in four segments.
  let cx = x, cz = z;
  for (let i = 0; i < 4; i++) {
    const r0 = 5 - i * 0.9;
    const seg = h / 4;
    const nx = cx + rng.signed() * 2, nz = cz + rng.signed() * 2;
    b.add(m.bark, place(cylinder(r0 - 0.9, r0, seg + 1, 9, 2), (cx + nx) / 2, y + seg * (i + 0.5), (cz + nz) / 2, i * 0.6));
    cx = nx; cz = nz;
  }
  col.addCylinder(x, y + h * 0.25, z, 5, h * 0.5);
  // Roots.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.next() * 0.4;
    b.add(m.bark, place(box(1.8, 1.4, 9, 1), x + Math.sin(a) * 6, y + 0.4, z + Math.cos(a) * 6, a, 0.18));
  }
  // Canopy of great blobs, and glowing fruit.
  const fruit = glow(color, 2.8);
  // A wide, layered crown: many small clumps in a flattened dome, plus hanging boughs.
  for (let i = 0; i < 22; i++) {
    const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * 17;
    const by = y + h - 3 + (1 - r / 17) * 9 + rng.next() * 3;
    const blob = new THREE.IcosahedronGeometry(3.5 + rng.next() * 3, 0).scale(1, 0.7, 1);
    b.add(canopy, place(blob, cx + Math.sin(a) * r, by, cz + Math.cos(a) * r, rng.next() * 3));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.next() * 0.5;
    b.add(m.bark, place(box(1.2, 1.2, 14, 1), cx + Math.sin(a) * 6, y + h - 5, cz + Math.cos(a) * 6, a, -0.35));
  }
  for (let i = 0; i < 24; i++) {
    const a = rng.next() * Math.PI * 2, r = 4 + rng.next() * 14;
    b.add(fruit, place(new THREE.OctahedronGeometry(0.7, 0), cx + Math.sin(a) * r, y + h - 6 + rng.next() * 6, cz + Math.cos(a) * r));
  }
  const group = b.build(new THREE.Group());
  group.name = `great-tree:${site.id}`;
  return { group, x, z, clearance: 24, name: 'The Elder Tree', lights: [{ x: cx, y: y + h - 4, z: cz, color, intensity: 30, distance: 40 }] };
}
