import * as THREE from 'three';
import { Random } from '../../core/Random';
import type { ColliderWorld } from '../../physics/Colliders';
import { box, cone, cylinder, GeoBucket, merge, place, tint } from '../geometry';
import { boulderGeometry } from './Foliage';
import type { WorldMaterials } from './WorldMaterials';

/**
 * Ember Shrine: a sword planted in glowing embers — the future rest/respawn point
 * (ref: reference_img/995f…png). Owns a flickering light and rising ember sparks.
 */
export class EmberShrine {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly sparks: THREE.InstancedMesh;
  private readonly sparkSeeds: { phase: number; speed: number; radius: number; angle: number }[] = [];
  private readonly tmp = new THREE.Matrix4();

  constructor(m: WorldMaterials, seed = 'shrine') {
    const rng = new Random(seed);
    const b = new GeoBucket();
    // Ring of stones
    const stoneGeo = boulderGeometry('shrine-stone');
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng.signed() * 0.1;
      const s = 0.28 + rng.next() * 0.14;
      b.add(m.rock, place(stoneGeo.clone(), Math.cos(a) * 1.25, s * 0.45, Math.sin(a) * 1.25, rng.next() * 6, 0, 0, s));
    }
    // Ash mound + coals
    b.add(m.ash, place(cone(1.05, 0.38, 10, 1), 0, 0.19, 0));
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * 0.8;
      const hot = rng.chance(0.4);
      b.add(hot ? m.emberHot : m.ember, place(box(0.14, 0.1, 0.14), Math.cos(a) * r, 0.3 - r * 0.25, Math.sin(a) * r, rng.next() * 3));
    }
    // The planted sword, tilted slightly
    const sword = merge([
      place(box(0.07, 1.35, 0.2, 1), 0, 0.68, 0),
      place(box(0.64, 0.08, 0.13, 1), 0, 1.38, 0),
      place(cylinder(0.04, 0.045, 0.34, 6, 1), 0, 1.6, 0),
      place(new THREE.OctahedronGeometry(0.08, 0), 0, 1.8, 0),
    ]);
    b.add(m.steel, place(sword, 0.05, 0.05, 0, 0.4, 0.12, 0.08));
    b.build(this.group);

    this.light = new THREE.PointLight(0xff8a3a, 30, 18, 1.8);
    this.light.position.set(0, 1.1, 0);
    this.group.add(this.light);

    const sparkCount = 40;
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), m.emberHot, sparkCount);
    this.sparks.frustumCulled = false;
    for (let i = 0; i < sparkCount; i++)
      this.sparkSeeds.push({ phase: rng.next(), speed: 0.25 + rng.next() * 0.35, radius: rng.next() * 0.6, angle: rng.next() * 6.28 });
    this.group.add(this.sparks);
    this.group.name = 'ember-shrine';
  }

  update(t: number): void {
    const flicker = 0.78 + 0.12 * Math.sin(t * 13.1) + 0.08 * Math.sin(t * 23.7 + 1.3) + 0.06 * Math.sin(t * 5.3);
    this.light.intensity = 30 * flicker;
    this.sparkSeeds.forEach((s, i) => {
      const k = (t * s.speed + s.phase) % 1;
      const a = s.angle + t * 0.8 + k * 3;
      const r = s.radius * (1 - k * 0.5);
      const scale = 1 - k;
      this.tmp.makeScale(scale, scale, scale).setPosition(Math.cos(a) * r, 0.4 + k * 3.2, Math.sin(a) * r);
      this.sparks.setMatrixAt(i, this.tmp);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
  }
}

/** Broken classical columns (Sunkeeper ruins) — returns a merged group. */
export function buildColumnRing(
  m: WorldMaterials,
  radius: number,
  count: number,
  seed = 'columns',
  col?: ColliderWorld,
): THREE.Group {
  const rng = new Random(seed);
  const b = new GeoBucket();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const broken = rng.chance(0.5);
    const h = broken ? 1.4 + rng.next() * 2.4 : 5.2;
    b.add(m.marble, place(box(1.5, 0.4, 1.5, 2), x, 0.2, z, a));
    b.add(m.marble, place(cylinder(0.5, 0.58, h, 12, 2), x, 0.4 + h / 2, z));
    col?.addCylinder(x, 0.4 + h / 2, z, 0.62, h + 0.8);
    if (!broken) {
      b.add(m.marble, place(box(1.4, 0.35, 1.4, 2), x, 0.4 + h + 0.17, z, a));
      b.add(m.marble, place(cylinder(0.72, 0.55, 0.3, 12, 2), x, 0.4 + h - 0.05, z));
    } else {
      // Rubble at the foot of a broken column
      for (let k = 0; k < 3; k++)
        b.add(m.marble, place(box(0.4, 0.3, 0.35, 1), x + rng.signed() * 1.2, 0.15, z + rng.signed() * 1.2, rng.next() * 3));
    }
  }
  // One fallen column (fixed spot, off the spawn sightline)
  const fa = 3.75;
  b.add(m.marble, place(cylinder(0.5, 0.5, 4.6, 12, 2), Math.cos(fa) * (radius + 3), 0.5, Math.sin(fa) * (radius + 3), fa, 0, Math.PI / 2));
  const group = b.build(new THREE.Group());
  group.name = 'columns';
  return group;
}

/** Glowing crystal cluster with a coloured point light. */
export function buildCrystalCluster(material: THREE.Material, lightColor: number, seed: string): THREE.Group {
  const rng = new Random(seed);
  const geos: THREE.BufferGeometry[] = [];
  const n = 6 + rng.int(0, 4);
  for (let i = 0; i < n; i++) {
    const r = 0.18 + rng.next() * 0.3;
    const h = 0.8 + rng.next() * 2.4 * (i === 0 ? 1.6 : 1);
    const shard = merge([place(cylinder(r, r, h, 6, 1), 0, h / 2, 0), place(cone(r, r * 1.6, 6, 1), 0, h + r * 0.8, 0)]);
    const a = rng.next() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.3 + rng.next() * 0.9;
    geos.push(place(shard, Math.cos(a) * d, -0.1, Math.sin(a) * d, rng.next() * 3, rng.signed() * 0.45, rng.signed() * 0.45));
  }
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(merge(geos), material);
  mesh.castShadow = true;
  group.add(mesh);
  const light = new THREE.PointLight(lightColor, 14, 12, 1.8);
  light.position.set(0, 1.6, 0);
  group.add(light);
  group.name = 'crystals';
  return group;
}

/** Arched stone bridge along local -Z, deck starting at z=0. */
export function buildBridge(
  m: WorldMaterials,
  length: number,
  width: number,
  deckY: number,
  rise: number,
  col?: ColliderWorld,
): THREE.Group {
  const b = new GeoBucket();
  const segs = 12;
  const segLen = length / segs;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const tm = (t0 + t1) / 2;
    const y = deckY + Math.sin(Math.PI * tm) * rise;
    const slope = Math.atan2((Math.sin(Math.PI * t1) - Math.sin(Math.PI * t0)) * rise, segLen);
    const z = -tm * length;
    b.add(m.cobble, place(box(width, 0.5, segLen + 0.06, 2), 0, y, z, 0, slope));
    for (const sx of [-1, 1]) b.add(m.castle, tint(place(box(0.45, 0.9, segLen + 0.06, 2), sx * (width / 2 - 0.2), y + 0.65, z, 0, slope), 0xffffff));
    col?.addBox(0, y, z, width, 0.5, segLen + 0.06, 0, slope, 0);
    for (const sx of [-1, 1]) col?.addBox(sx * (width / 2 - 0.2), y + 0.65, z, 0.45, 0.9, segLen + 0.06, 0, slope, 0);
  }
  // Piers
  for (const t of [0.3, 0.7]) {
    const y = deckY + Math.sin(Math.PI * t) * rise;
    b.add(m.castle, tint(place(box(width + 0.4, y + 5, 2.4, 3), 0, (y - 5) / 2 - 0.2, -t * length), 0xe0e6e0));
  }
  const group = b.build(new THREE.Group());
  group.name = 'bridge';
  return group;
}

/** Drifting bioluminescent motes. */
export class Fireflies {
  readonly mesh: THREE.InstancedMesh;
  private readonly base: THREE.Vector3[] = [];
  private readonly phase: number[] = [];
  private readonly tmp = new THREE.Matrix4();

  constructor(points: THREE.Vector3[], seed = 'fireflies') {
    const rng = new Random(seed);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07, 0), mat, points.length);
    const palette = [0x7ffff0, 0x9aff7a, 0xff8ad8, 0xc8a0ff];
    const c = new THREE.Color();
    points.forEach((p, i) => {
      this.base.push(p.clone());
      this.phase.push(rng.next() * 100);
      c.set(rng.pick(palette)).multiplyScalar(3.5);
      this.mesh.setColorAt(i, c);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fireflies';
  }

  update(t: number): void {
    for (let i = 0; i < this.base.length; i++) {
      const p = this.base[i];
      const ph = this.phase[i];
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.1 + ph);
      this.tmp
        .makeScale(pulse, pulse, pulse)
        .setPosition(
          p.x + Math.sin(t * 0.31 + ph) * 1.6,
          p.y + Math.sin(t * 0.53 + ph * 1.7) * 0.6,
          p.z + Math.cos(t * 0.27 + ph * 0.6) * 1.6,
        );
      this.mesh.setMatrixAt(i, this.tmp);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Hooded wanderer: a static stand-in for the player (scale reference for the
 * crisp foreground band). Replaced by the real character in Job 2.
 */
export function buildWanderer(m: WorldMaterials): THREE.Group {
  const cloth = new THREE.MeshToonMaterial({ color: 0x3e2660 });
  const gold = new THREE.MeshToonMaterial({ color: 0xd0a040 });
  const runes = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6ad8ff).multiplyScalar(3) });
  const b = new GeoBucket();
  b.add(cloth, place(cone(0.52, 1.5, 10, 1), 0, 0.75, 0));
  b.add(cloth, place(cylinder(0.26, 0.44, 0.4, 10, 1), 0, 1.38, 0));
  b.add(gold, place(cylinder(0.45, 0.45, 0.07, 10, 1), 0, 1.2, 0));
  b.add(cloth, place(new THREE.SphereGeometry(0.21, 10, 8), 0, 1.66, 0.02, 0, 0, 0, new THREE.Vector3(1, 1.15, 1.1)));
  b.add(m.windowDark, place(box(0.22, 0.16, 0.05, 1), 0, 1.63, 0.21));
  // Greatsword slung across the back, runes glowing
  b.add(m.steel, place(box(0.09, 1.3, 0.03, 1), 0, 1.2, -0.3, 0, 0, 0.55));
  b.add(runes, place(box(0.03, 0.9, 0.035, 1), 0, 1.2, -0.3, 0, 0, 0.55));
  b.add(gold, place(box(0.36, 0.06, 0.06, 1), -0.33, 1.72, -0.3, 0, 0, 0.55));
  const group = b.build(new THREE.Group());
  group.name = 'wanderer';
  return group;
}
