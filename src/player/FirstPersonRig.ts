import * as THREE from 'three';
import { toon } from '../render/Materials';
import type { PlayerCombat } from './PlayerCombat';
import type { PlayerController } from './PlayerController';
import type { PlayerModel } from './PlayerModel';
import { SpellbookModel } from './SpellbookModel';

/** Separate near-field scene: hands never clip into walls or obscure the horizon. */
export class FirstPersonRig {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.025, 5);
  readonly swordHand = new THREE.Group();
  readonly bookHand = new THREE.Group();
  readonly book = new SpellbookModel();
  private readonly weapon = new THREE.Group();
  private version = -1;
  private stride = 0;
  private swingX = 0;
  private swingZ = 0;
  private swingDepth = 0;
  constructor() {
    this.scene.name = 'first-person-hands';
    this.scene.add(new THREE.HemisphereLight(0xe1dfff, 0x39274f, 2.4));
    const key = new THREE.DirectionalLight(0xffecd0, 2.7); key.position.set(-2, 3, 2); this.scene.add(key);
    this.scene.add(this.swordHand, this.bookHand);
    const steel = toon({ color: 0x788397 }), cloth = toon({ color: 0x492760 }), leather = toon({ color: 0x574052 });
    for (const hand of [this.swordHand, this.bookHand]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.17), cloth);
      arm.position.set(0, -0.19, 0.09); arm.rotation.x = -0.45;
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.18), leather);
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.19), steel); cuff.position.y = -0.11;
      hand.add(arm, glove, cuff);
    }
    this.weapon.scale.setScalar(0.63);
    this.swordHand.add(this.weapon);
    this.bookHand.add(this.book.root);
    this.book.root.scale.setScalar(0.95);
  }
  update(dt: number, model: PlayerModel, combat: PlayerCombat, controller: PlayerController, motion: number): void {
    if (this.version !== model.weaponVersion) {
      this.weapon.clear();
      const visual = model.cloneSword();
      visual.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
      this.weapon.add(visual); this.version = model.weaponVersion;
    }
    if (this.book.pageCount !== model.book.pageCount) this.book.setPages(model.book.pageCount, model.book.tier);
    this.stride += dt * Math.min(controller.speed, 18);
    const bob = Math.sin(this.stride) * 0.008 * motion * Math.min(1, controller.speed / 9);
    const c = combat, arc = c.attack?.arc;
    const wind = c.phase === 'windup', active = c.phase === 'active', t = c.phaseT;
    let x = 0, z = -0.18, depth = 0;
    if (wind || active || c.phase === 'recovery') {
      const phase = wind ? -0.4 * t : active ? -0.4 + t * 1.4 : 1 - t;
      if (arc === 'overhead' || arc === 'plunge') { x = wind ? -1.0 * t : active ? -1 + t * 2.1 : 1.1 * (1 - t); z = -0.18; }
      else if (arc === 'thrust') { depth = active ? -0.36 : wind ? 0.06 : -0.36 * (1 - t); x = -0.65; }
      else { z = -0.18 + phase * (arc === 'slashL' ? -1.6 : 1.6); x = phase * 0.5; }
    } else if (c.phase === 'charge') { x = -0.85 - c.charge * 0.3; z = -0.4; }
    if (c.guarding) { z = 1.0; x = -0.2; }
    this.swingX = THREE.MathUtils.damp(this.swingX, x, 32, dt);
    this.swingZ = THREE.MathUtils.damp(this.swingZ, z, 32, dt);
    this.swingDepth = THREE.MathUtils.damp(this.swingDepth, depth, 32, dt);
    const crouch = controller.sliding ? -0.04 : 0;
    this.swordHand.position.set(0.38 - Math.max(0, this.swingZ) * 0.17, -0.35 + bob + crouch, -0.65 + this.swingDepth);
    this.swordHand.rotation.set(this.swingX + 0.08, -0.12, this.swingZ);
    const open = model.book.openness;
    this.book.pose(open);
    this.book.root.position.set(0, 0.07, -0.06);
    this.book.root.rotation.set(0.45 + open * 0.45, 0.1, 0.08);
    this.bookHand.position.set(-0.4, -0.46 + open * 0.16 - bob, -0.68);
    this.bookHand.rotation.set(0, 0, -0.08);
    this.scene.visible = combat.alive;
  }
}
