import * as THREE from 'three';
import { Random } from '../../core/Random';
import { box, cone, cylinder, GeoBucket, merge, place } from '../geometry';
import { boulderGeometry } from './Foliage';
import type { WorldMaterials } from './WorldMaterials';

/**
 * Ember Shrine: a sword planted in glowing embers — the future rest/respawn point
 * (ref: reference_img/995f…png). Owns a flickering light and rising ember sparks.
 */
export class EmberShrine {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight | null;
  /** Lit embers and sparks; hidden while the shrine is unkindled. */
  kindled = true;
  private readonly embers: THREE.Object3D[] = [];
  private readonly sparks: THREE.InstancedMesh;
  private readonly sparkSeeds: { phase: number; speed: number; radius: number; angle: number }[] = [];
  private readonly tmp = new THREE.Matrix4();

  /** `withLight: false` for world shrines: they borrow the world's light pool instead. */
  constructor(m: WorldMaterials, seed = 'shrine', withLight = true) {
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
    for (const child of this.group.children) {
      if (child instanceof THREE.Mesh && (child.material === m.ember || child.material === m.emberHot)) this.embers.push(child);
    }

    this.light = withLight ? new THREE.PointLight(0xff8a3a, 30, 18, 1.8) : null;
    if (this.light) {
      this.light.position.set(0, 1.1, 0);
      this.group.add(this.light);
    }

    const sparkCount = 40;
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), m.emberHot, sparkCount);
    this.sparks.frustumCulled = false;
    for (let i = 0; i < sparkCount; i++)
      this.sparkSeeds.push({ phase: rng.next(), speed: 0.25 + rng.next() * 0.35, radius: rng.next() * 0.6, angle: rng.next() * 6.28 });
    this.group.add(this.sparks);
    this.embers.push(this.sparks);
    this.group.name = 'ember-shrine';
  }

  setKindled(on: boolean): void {
    this.kindled = on;
    for (const e of this.embers) e.visible = on;
    if (this.light) this.light.visible = on;
  }

  update(t: number): void {
    if (!this.kindled) return;
    const flicker = 0.78 + 0.12 * Math.sin(t * 13.1) + 0.08 * Math.sin(t * 23.7 + 1.3) + 0.06 * Math.sin(t * 5.3);
    if (this.light) this.light.intensity = 30 * flicker;
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
