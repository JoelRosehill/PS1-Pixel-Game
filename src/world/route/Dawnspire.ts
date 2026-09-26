import * as THREE from 'three';
import type { ColliderWorld } from '../../physics/Colliders';
import { glow, toon } from '../../render/Materials';
import { box, cone, cylinder, GeoBucket, place } from '../geometry';

/** Where the chained moon hangs, straight above the spire. */
export const MOON_ANCHOR = new THREE.Vector3(0, 3400, 0);

const TIERS: [number, number, number][] = [
  // [radius at the base of the tier, height, radius at its top]
  [150, 140, 128],
  [112, 260, 96],
  [84, 320, 70],
  [60, 300, 46],
  [40, 260, 26],
];

/**
 * The Dawnspire (Job 15): the tower at the centre of the world where the road ends,
 * about 1.4 km of stone rising in tapering tiers, and the Chain — a line of colossal
 * glowing links from its crown up to the moon, which Maelor bound there. Both ignore the
 * fog so they stand over every horizon as the journey's lodestar.
 */
export class Dawnspire {
  readonly group = new THREE.Group();
  readonly top: number;
  private readonly chain: THREE.InstancedMesh;
  private readonly chainMat: THREE.MeshBasicMaterial;
  private broken = false;

  constructor(ground: number, colliders: ColliderWorld) {
    this.group.name = 'dawnspire';
    const stone = toon({ color: 0x3a3448 });
    stone.fog = false;
    const trim = toon({ color: 0x8a82a8 });
    trim.fog = false;
    const light = glow(0xfff0d0, 2.2);
    light.fog = false;
    const b = new GeoBucket();
    let y = ground - 6;
    TIERS.forEach(([r0, h, r1], i) => {
      b.add(stone, place(cylinder(r1, r0, h, 12, 4), 0, y + h / 2, 0, i * 0.2));
      // A balcony ring and buttresses at every tier.
      b.add(trim, place(cylinder(r1 + 8, r1 + 8, 6, 12, 1), 0, y + h + 3, 0, i * 0.2));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + i * 0.2;
        const bx = Math.sin(a) * (r0 + 4), bz = Math.cos(a) * (r0 + 4);
        b.add(stone, place(box(10, h * 0.7, 16, 3), bx, y + h * 0.35, bz, a));
        // Lit windows climbing each face.
        for (let w = 0; w < 4; w++) {
          const wy = y + h * (0.2 + w * 0.2);
          const rr = r0 + (r1 - r0) * ((wy - y) / h) + 0.6;
          b.add(light, place(box(4, 10, 1, 1), Math.sin(a + 0.4) * rr, wy, Math.cos(a + 0.4) * rr, a + 0.4));
        }
      }
      colliders.addCylinder(0, y + h / 2, 0, (r0 + r1) / 2 + 4, h);
      y += h + 6;
    });
    // The crown: a ring of spikes around the anchor of the chain.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      b.add(trim, place(cone(3, 60, 4, 1), Math.sin(a) * 22, y + 26, Math.cos(a) * 22, a, Math.sin(a) * 0.25, Math.cos(a) * 0.25));
    }
    b.add(light, place(cylinder(14, 14, 8, 12, 1), 0, y + 4, 0));
    b.build(this.group);
    this.top = y;

    // The Chain: links alternate orientation, rising to the moon.
    const linkGeo = new THREE.TorusGeometry(14, 3.2, 5, 10).scale(1, 1.9, 1);
    this.chainMat = glow(0xd8d0ff, 1.8);
    this.chainMat.fog = false;
    const span = MOON_ANCHOR.y - 200 - this.top;
    const pitch = 42;
    const count = Math.floor(span / pitch);
    this.chain = new THREE.InstancedMesh(linkGeo, this.chainMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i % 2 ? Math.PI / 2 : 0);
      // Links far up are bigger, so the chain still reads against the moon.
      const k = 1 + (i / count) * 2.2;
      s.setScalar(k);
      const u = i / count;
      m.compose(new THREE.Vector3(0, this.top + 20 + span * (u + 0.55 * u * u) / 1.55, 0), q, s);
      this.chain.setMatrixAt(i, m);
    }
    this.chain.frustumCulled = false;
    this.chain.name = 'the-chain';
    this.group.add(this.chain);
  }

  /** After the last boss: the chain breaks and the moon goes home. */
  breakChain(): void {
    if (this.broken) return;
    this.broken = true;
    this.chain.visible = false;
  }

  get chainBroken(): boolean {
    return this.broken;
  }

  /** The chain sways a little, as if the moon pulled at it. */
  update(elapsed: number): void {
    this.chain.rotation.z = Math.sin(elapsed * 0.05) * 0.004;
  }
}
