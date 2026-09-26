import * as THREE from 'three';
import { glow, toon } from '../render/Materials';
import { box } from '../world/geometry';

/** Hinged, physical book: fixed geometry, thickness and ornaments driven by pages. */
export class SpellbookModel {
  readonly root = new THREE.Group();
  readonly left = new THREE.Group();
  readonly right = new THREE.Group();
  readonly leaves: THREE.Mesh[] = [];
  pageCount = 1;
  tier = 0;
  openness = 0;
  private castTime = 0;
  private elapsed = 0;
  private readonly light = glow(0x7fffd4, 2);
  constructor() {
    this.root.name = 'living-spellbook';
    const leather = toon({ color: 0x542c40 });
    const paper = toon({ color: 0xeee2b9 });
    const gold = toon({ color: 0xe4b961 });
    const ink = toon({ color: 0x453048 });
    const mesh = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(box(w, h, d, 1), mat);
      m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    for (const [hinge, side] of [[this.left, -1], [this.right, 1]] as const) {
      mesh(hinge, 0.28, 0.035, 0.4, side * 0.14, 0, 0, leather);
      const leaf = mesh(hinge, 0.245, 0.04, 0.36, side * 0.137, 0.035, 0, paper);
      this.leaves.push(leaf);
      for (let i = 0; i < 4; i++) mesh(leaf, 0.14 - i % 2 * 0.04, 0.003, 0.012, 0, 0.022, -0.105 + i * 0.06, ink);
      const trim = new THREE.Group(); hinge.add(trim);
      // Groups attached to the hinge keep ornaments moving with each cover.
      trim.name = 'brass-corners';
      for (const z of [-0.17, 0.17]) mesh(trim, 0.075, 0.012, 0.05, side * 0.245, -0.024, z, gold);
      const gilded = mesh(hinge, 0.045, 0.012, 0.28, side * 0.14, -0.025, 0, gold); gilded.name = 'gilding';
      const rune = mesh(hinge, 0.07, 0.014, 0.07, side * 0.14, -0.035, 0, this.light); rune.rotation.y = Math.PI / 4; rune.name = 'book-rune';
      this.root.add(hinge);
    }
    mesh(this.root, 0.05, 0.045, 0.41, 0, 0, 0, leather);
    this.setPages(1, 0);
    this.update(0);
  }
  setPages(count: number, tier: number): void {
    this.pageCount = count; this.tier = tier;
    for (const leaf of this.leaves) leaf.scale.y = 0.6 + count * 0.19;
    this.root.traverse(o => {
      if (o.name === 'brass-corners') o.visible = tier >= 1;
      if (o.name === 'gilding') o.visible = tier >= 2;
      if (o.name === 'book-rune') o.visible = tier >= 3;
    });
  }
  cast(color: number): void { this.castTime = 0.85; this.light.color.setHex(color); }
  update(dt: number): void {
    this.elapsed += dt;
    this.castTime = Math.max(0, this.castTime - dt);
    this.openness = THREE.MathUtils.damp(this.openness, this.castTime > 0 ? 1 : 0, 14, dt);
    this.pose(this.openness);
  }
  pose(open: number): void {
    this.left.rotation.z = -(1 - open) * 1.43;
    this.right.rotation.z = (1 - open) * 1.43;
    this.root.position.set(-0.34 - open * 0.15, -0.12 + open * 0.65 + Math.sin(this.elapsed * 4) * 0.025 * open, 0.08 + open * 0.4);
    // Tilt the written face back toward the caster and chase camera.
    this.root.rotation.set(-0.25 - open * 0.5, 0, (1 - open) * -0.13);
  }
}
