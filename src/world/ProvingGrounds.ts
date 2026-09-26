import * as THREE from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import { clamp, lerp, Noise2D, smoothstep } from '../core/Noise';
import { Random } from '../core/Random';
import { ColliderWorld } from '../physics/Colliders';
import type { Atmosphere } from '../render/Atmosphere';
import { box, GeoBucket, place, scaleUV, tint } from './geometry';
import type { Level } from './Level';
import { buildCastle } from './props/Castle';
import {
  buildBridge,
  buildColumnRing,
  buildCrystalCluster,
  buildWanderer,
  EmberShrine,
  Fireflies,
} from './props/Details';
import { boulderGeometry, cardGeometry, instancedChunks, pineGeometry, type ScatterItem } from './props/Foliage';
import { buildCitadel, buildMistGate, buildMountainRing } from './props/Landmarks';
import { buildParkourCourse, type ParkourCourse } from './props/ParkourCourse';
import { SparringConstruct } from './props/SparringConstruct';
import { HeroAssets } from './props/HeroAssets';
import { createWorldMaterials } from './props/WorldMaterials';
import { buildTerrain } from './Terrain';
import { buildWater } from './Water';
import { PAGE_SITES } from '../spells/PagePickups';

const PLAZA_Y = 2.0;
const PLAZA_R = 14;
const CASTLE = { x: -12, z: -54, y: 2.4 };
const BRIDGE = { x: -12, z0: -16, z1: -40 };
const LAKE = { x: 100, z: -60 };
const CITADEL = { x: 54, y: 14, z: -760 };
/** Azimuth of the citadel from the plaza; a valley and a tree-free sightline follow it. */
const CITADEL_AZ = Math.atan2(CITADEL.x, -CITADEL.z);
const MIST_GATE = { x: 112, z: -84 };
const QUAY = { x0: -48, x1: 28, offset: 6.1 };
const COURSE = { x: 64, z: 10 };

const canalZ = (x: number) => -26 + 2.5 * Math.sin(x * 0.025);

/**
 * JOB 1 — "The Threshold": a hand-composed diorama that exercises every
 * Smart-Pixel band at once. Crisp foreground plaza with an ember shrine, a mid-ground
 * moat castle, a pine lake with a portal ring, and a far spire citadel under the moon.
 */
export class ProvingGrounds implements Level {
  readonly name = 'The Threshold (Proving Grounds)';
  readonly root = new THREE.Group();
  readonly skyPreset = 'cosmic-violet';
  readonly spawn = {
    position: new THREE.Vector3(6, PLAZA_Y, 11),
    lookAt: new THREE.Vector3(4, 8, -60),
  };
  readonly colliders: ColliderWorld;
  readonly enemies: SparringConstruct[] = [];
  readonly heroAssets = new HeroAssets();

  private readonly noise = new Noise2D('threshold');
  private readonly shrine: EmberShrine;
  private readonly fireflies: Fireflies;
  private readonly course: ParkourCourse;
  get lostPage(): THREE.Object3D { return this.course.page; }

  constructor(atmosphere: Atmosphere) {
    const m = createWorldMaterials();
    const rng = new Random('threshold-scatter');
    const col = (this.colliders = new ColliderWorld((x, z) => this.heightAt(x, z)));

    // --- ground and water
    this.root.add(
      buildTerrain({
        halfSize: 720,
        segments: 312,
        chunks: 8,
        centerSpacing: 0.9,
        heightAt: (x, z) => this.heightAt(x, z),
        colorAt: (x, z, h, slope, out) => this.colorAt(x, z, h, slope, out),
      }),
    );
    this.root.add(buildWater(atmosphere, 1500, 0));
    this.root.add(buildMountainRing({ inner: 620, outer: 2600, valleyAzimuth: 0.07, seed: 'ring' }));

    // --- plaza, quay and bridge
    const built = new GeoBucket();
    const plaza = new THREE.CircleGeometry(PLAZA_R, 56).rotateX(-Math.PI / 2);
    scaleUV(plaza, (PLAZA_R * 2) / 4, (PLAZA_R * 2) / 4);
    built.add(m.cobble, place(plaza, 0, PLAZA_Y + 0.03, 0));
    built.add(m.cobble, place(box(4, 0.1, 10, 4), BRIDGE.x, PLAZA_Y + 0.03, -11));
    for (let x = QUAY.x0; x < QUAY.x1; x += 2) {
      const za = canalZ(x);
      const zb = canalZ(x + 2);
      const ang = Math.atan2(-(zb - za), 2);
      const len = Math.hypot(2, zb - za) + 0.05;
      const zm = (za + zb) / 2;
      for (const side of [1, -1]) {
        const top = side > 0 ? PLAZA_Y : CASTLE.y;
        const wz = zm + side * QUAY.offset;
        built.add(m.castle, tint(place(box(len, top + 3.3, 1.2, 3), x + 1, (top - 3) / 2, wz, ang), 0xf2f6f2));
        col.addBox(x + 1, (top - 3) / 2, wz, len, top + 3.3, 1.2, ang);
        built.add(m.trim, place(box(len, 0.35, 1.5, 2), x + 1, top + 0.17, wz, ang));
        built.add(m.cobble, place(box(len, 0.1, 3.2, 4), x + 1, top + 0.03, wz + side * 2.3, ang));
      }
    }
    built.build(this.root);

    col.push(new THREE.Vector3(BRIDGE.x, 0, BRIDGE.z0));
    const bridge = buildBridge(m, BRIDGE.z0 - BRIDGE.z1, 4.2, PLAZA_Y + 0.1, 1.1, col);
    col.pop();
    bridge.position.set(BRIDGE.x, 0, BRIDGE.z0);
    this.root.add(bridge);

    // --- castle
    col.push(new THREE.Vector3(CASTLE.x, CASTLE.y, CASTLE.z));
    const castle = buildCastle(m, col);
    col.pop();
    castle.group.position.set(CASTLE.x, CASTLE.y, CASTLE.z);
    this.root.add(castle.group);
    const lanternLight = new THREE.PointLight(0xffa04a, 22, 16, 1.8);
    lanternLight.position.set(CASTLE.x, CASTLE.y + 4.4, CASTLE.z + 9.4);
    this.root.add(lanternLight);

    // --- plaza set dressing
    this.shrine = new EmberShrine(m);
    this.shrine.group.position.set(0, PLAZA_Y + 0.03, 0);
    this.root.add(this.shrine.group);
    col.push(new THREE.Vector3(0, PLAZA_Y, 0));
    const columns = buildColumnRing(m, 11.5, 9, 'columns', col);
    col.pop();
    columns.position.set(0, PLAZA_Y, 0);
    this.root.add(columns);
    col.addCylinder(0, PLAZA_Y + 0.4, 0, 1.45, 0.9); // ember shrine
    const wanderer = buildWanderer(m);
    wanderer.position.set(3.2, PLAZA_Y + 0.03, 6.5);
    wanderer.rotation.y = Math.PI + 0.35;
    this.root.add(wanderer);

    const pink = buildCrystalCluster(m.crystalPink, 0xff5ad0, 'crystal-a');
    pink.position.set(-15.5, PLAZA_Y, -2);
    const blue = buildCrystalCluster(m.crystalBlue, 0x5ab8ff, 'crystal-b');
    blue.position.set(6, CASTLE.y, -39);
    blue.scale.setScalar(1.3);
    this.root.add(pink, blue);
    col.addCylinder(3.2, PLAZA_Y + 0.9, 6.5, 0.45, 1.8); // the other wanderer
    col.addCylinder(-15.5, PLAZA_Y + 1.2, -2, 1.1, 2.6);
    col.addCylinder(6, CASTLE.y + 1.6, -39, 1.4, 3.4);

    // --- landmarks
    const citadel = buildCitadel(m);
    citadel.position.set(CITADEL.x, CITADEL.y, CITADEL.z);
    citadel.rotation.y = Math.atan2(-CITADEL.x, -CITADEL.z);
    citadel.scale.setScalar(1.15);
    this.root.add(citadel);
    const gate = buildMistGate(m);
    gate.position.set(MIST_GATE.x, -3, MIST_GATE.z);
    gate.rotation.y = Math.atan2(-MIST_GATE.x, -MIST_GATE.z);
    this.root.add(gate);

    // --- training yard (Job 3): two passive dummies and two sparring constructs
    // South-east of the plaza, clear of the trial course and the lake trail.
    const yard: [number, number, boolean][] = [
      [14, 31, false],
      [23, 35, false],
      [19, 26, true],
      [28, 30, true],
    ];
    for (const [ex, ez, aggressive] of yard) {
      const construct = new SparringConstruct(ex, this.heightAt(ex, ez), ez, { aggressive });
      this.enemies.push(construct);
      this.root.add(construct.group);
      col.addCylinder(ex, this.heightAt(ex, ez) + 1.15, ez, 0.7, 2.3, true);
    }

    // --- movement trial course (Job 2)
    let baseY = -Infinity;
    for (let x = -42; x <= 40; x += 5)
      for (let z = -10; z <= 14; z += 5) baseY = Math.max(baseY, this.heightAt(COURSE.x + x, COURSE.z + z));
    this.course = buildParkourCourse(m, col, COURSE, baseY + 0.05);
    this.root.add(this.course.group);

    // --- vegetation
    this.scatterVegetation(m, rng);

    // --- fireflies over the water edges
    const motes: THREE.Vector3[] = [];
    for (let i = 0; i < 280; i++) {
      const onCanal = rng.chance(0.55);
      const x = onCanal ? rng.range(-90, 70) : LAKE.x + rng.signed() * 70;
      const z = onCanal ? canalZ(x) + rng.signed() * 9 : LAKE.z + rng.signed() * 55;
      const h = Math.max(this.heightAt(x, z), 0);
      motes.push(new THREE.Vector3(x, h + rng.range(0.6, 3.5), z));
    }
    this.fireflies = new Fireflies(motes);
    this.root.add(this.fireflies.mesh);
  }

  heightAt(x: number, z: number): number {
    const n = this.noise;
    const r = Math.hypot(x, z);
    let h = 2.3 + n.fbm(x * 0.011, z * 0.011, 4) * 3.2 + n.fbm(x * 0.05 + 7, z * 0.05 - 3, 2) * 0.6;
    const hill = smoothstep(80, 330, r);
    const valley = 1 - 0.8 * Math.exp(-Math.pow(this.azimuthOffset(x, z) / 0.22, 2));
    h += hill * (12 + n.ridged(x * 0.005 + 3, z * 0.005 + 9, 4) * 62) * valley;

    // Castle island and plaza terraces
    h = lerp(h, CASTLE.y, 1 - smoothstep(17, 27, Math.hypot(x - CASTLE.x, z - CASTLE.z)));
    h = lerp(h, PLAZA_Y, 1 - smoothstep(PLAZA_R, PLAZA_R + 7, r));

    // Canal: stone quays in the centre, natural banks further out
    const cz = canalZ(x);
    const dc = Math.abs(z - cz);
    const quay = 1 - smoothstep(38, 48, Math.abs(x + 10));
    h = lerp(h, z > cz ? PLAZA_Y : CASTLE.y, (1 - smoothstep(14, 22, dc)) * quay);
    const soft = 1 - smoothstep(5 + hill * 18, 9 + hill * 70, dc);
    const hard = 1 - smoothstep(5.7, 6.2, dc);
    const canal = lerp(soft, hard, quay) * (1 - smoothstep(95, 125, x));
    h = lerp(h, -2.6, canal);

    // Pine lake
    const dl = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.25) + n.get(x * 0.02, z * 0.02) * 12;
    h = lerp(h, -4.5, 1 - smoothstep(48, 76, dl));
    return h;
  }

  private colorAt(x: number, z: number, h: number, slope: number, out: THREE.Color): void {
    const n = this.noise.get(x * 0.035, z * 0.035) * 0.5 + 0.5;
    const n2 = this.noise.get(x * 0.2 + 3, z * 0.2 - 8) * 0.5 + 0.5;
    const c = new THREE.Color();
    if (h < -0.5) {
      out.set(0x1c3c40);
      return;
    }
    if (h < 0.8) {
      out.set(0x6e6c52).lerp(c.set(0x3e6446), smoothstep(0.1, 0.8, h));
      return;
    }
    // Lush, saturated meadow greens
    out.set(0x3f8a3a).lerp(c.set(0x78aa3c), smoothstep(0.55, 0.85, n));
    out.lerp(c.set(0x2c6e52), smoothstep(0.5, 0.15, n) * 0.8);
    out.multiplyScalar(0.92 + n2 * 0.16);
    // Worn dirt trail from the plaza toward the lake
    if (this.trailDistance(x, z) < 1.8) out.lerp(c.set(0x7a6448), 0.85);
    // Rock on steep slopes and high ground, then pale lavender snow
    out.lerp(c.set(0x6a6474), clamp(smoothstep(0.35, 0.6, slope) + smoothstep(55, 80, h), 0, 1));
    out.lerp(c.set(0xd8d4ec), smoothstep(90, 110, h));
  }

  private trailDistance(x: number, z: number): number {
    const pts = [
      [PLAZA_R - 1, 3], [26, 7], [40, 4], [52, -4], [58, -12],
    ];
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best + this.noise.get(x * 0.3, z * 0.3) * 0.6;
  }

  /** Angular distance (radians) of a point from the plaza→citadel sightline. */
  private azimuthOffset(x: number, z: number): number {
    const d = Math.atan2(x, -z) - CITADEL_AZ;
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  }

  private slopeAt(x: number, z: number): number {
    const e = 1;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return 1 - 2 * e / Math.hypot(dx, 2 * e, dz);
  }

  /** Keeps props off the plaza, bridge, castle island and water. */
  private isOpenGround(x: number, z: number, clearance: number): boolean {
    if (PAGE_SITES.some(p => Math.hypot(x - p.x, z - p.z) < 3 + clearance)) return false;
    if (x > -88 - clearance && x < -35 + clearance && z > 9 - clearance && z < 44 + clearance) return false;
    if (Math.hypot(x, z) < PLAZA_R + clearance) return false;
    if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 22 + clearance) return false;
    if (Math.abs(x - BRIDGE.x) < 3 + clearance && z < 0 && z > BRIDGE.z1 - 4) return false;
    if (x > QUAY.x0 - 2 && x < QUAY.x1 + 2 && Math.abs(z - canalZ(x)) < QUAY.offset + 5 + clearance) return false;
    if (this.trailDistance(x, z) < 2 + clearance * 0.5) return false;
    if (x > COURSE.x - 48 && x < COURSE.x + 44 && z > COURSE.z - 14 && z < COURSE.z + 18) return false;
    if (x > 6 && x < 36 && z > 20 && z < 42) return false; // training yard
    return true;
  }

  private scatterVegetation(m: ReturnType<typeof createWorldMaterials>, rng: Random): void {
    // Pines: clumped forests, denser away from the centre
    const pines: ScatterItem[] = [];
    const trunks: ScatterItem[] = [];
    const tintA = new THREE.Color(0x9ad0a8);
    const tintB = new THREE.Color(0xd8f0b0);
    for (let i = 0; i < 14000 && pines.length < 2800; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 24 + Math.pow(rng.next(), 0.7) * 470;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = this.heightAt(x, z);
      if (h < 1.0 || h > 85) continue;
      if (!this.isOpenGround(x, z, 3)) continue;
      const forest = this.noise.fbm(x * 0.009 + 40, z * 0.009 - 12, 3);
      if (forest < -0.05 + (1 - smoothstep(30, 140, r)) * 0.25) continue;
      if (this.slopeAt(x, z) > 0.4) continue;
      // Keep the sightline to the citadel open (Elden Ring-style landmark framing).
      if (z < 0 && rng.next() < Math.exp(-Math.pow(this.azimuthOffset(x, z) / 0.1, 2))) continue;
      const height = rng.range(9, 21) * (r < 60 ? 1.15 : 1);
      const item: ScatterItem = {
        x, y: h - 0.3, z, scale: height, rotY: rng.next() * Math.PI * 2,
        color: tintA.clone().lerp(tintB, rng.next()).multiplyScalar(0.95 + rng.next() * 0.2),
      };
      pines.push(item);
      trunks.push({ ...item, color: undefined });
      this.colliders.addCylinder(x, h + height * 0.3, z, 0.04 * height, height * 0.62);
    }
    const pine = pineGeometry();
    this.root.add(instancedChunks(pine.foliage, m.needles, pines, 70, { castShadow: true, name: 'pines' }));
    this.root.add(instancedChunks(pine.trunk, m.bark, trunks, 70, { castShadow: true, name: 'trunks' }));

    // Grass tufts and flower shrubs near the plaza (foreground richness)
    const card = cardGeometry();
    const grass: ScatterItem[] = [];
    const flowers: ScatterItem[] = [];
    const gTint = new THREE.Color();
    for (let i = 0; i < 26000 && grass.length < 9000; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = PLAZA_R + 0.5 + Math.pow(rng.next(), 0.8) * 80;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!this.isOpenGround(x, z, -0.5)) continue;
      const h = this.heightAt(x, z);
      if (h < 0.9) continue;
      const clump = this.noise.get(x * 0.12, z * 0.12);
      if (clump < -0.25) continue;
      gTint.setHSL(0.26 + rng.signed() * 0.05, 0.5, 0.72 + rng.next() * 0.18);
      grass.push({ x, y: h - 0.05, z, scale: rng.range(0.35, 0.75), rotY: rng.next() * Math.PI, color: gTint.clone() });
      if (clump > 0.45 && rng.chance(0.08)) flowers.push({ x, y: h - 0.05, z, scale: rng.range(0.9, 1.6), rotY: rng.next() * Math.PI });
    }
    this.root.add(instancedChunks(card, m.grass, grass, 24, { name: 'grass' }));
    this.root.add(instancedChunks(card, m.flowers, flowers, 24, { name: 'flowers' }));

    // Boulders: some on land, some breaking the lake surface
    const rocks: ScatterItem[] = [];
    for (let i = 0; i < 3000 && rocks.length < 110; i++) {
      const inLake = rng.chance(0.3);
      const x = inLake ? LAKE.x + rng.signed() * 60 : rng.range(-260, 260);
      const z = inLake ? LAKE.z + rng.signed() * 45 : rng.range(-260, 200);
      const h = this.heightAt(x, z);
      if (inLake ? h > 0.5 || h < -3.2 : h < 0.8) continue;
      if (!this.isOpenGround(x, z, 1)) continue;
      const scale = rng.range(0.8, inLake ? 3.2 : 2.4);
      rocks.push({ x, y: h + 0.2, z, scale, rotY: rng.next() * 6.28 });
      if (scale > 1.1) this.colliders.addSphere(x, h + 0.2 + scale * 0.42, z, scale * 0.76);
    }
    const boulderGroup = new THREE.Group();
    for (let v = 0; v < 3; v++) {
      const subset = rocks.filter((_, i) => i % 3 === v);
      boulderGroup.add(instancedChunks(boulderGeometry(`boulder-${v}`), m.rock, subset, 90, { castShadow: true }));
    }
    this.root.add(boulderGroup);
  }

  async loadAssets(library: ModelLibrary): Promise<string[]> {
    this.root.add(this.heroAssets.group);
    await this.heroAssets.load(library, this.colliders, (x, z) => this.heightAt(x, z));
    return this.heroAssets.errors;
  }

  update(dt: number, elapsed: number): void {
    this.heroAssets.update(dt);
    this.shrine.update(elapsed);
    this.fireflies.update(elapsed);
    this.course.update(elapsed);
  }
}
