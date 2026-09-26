import * as THREE from 'three';
import { glow, toon } from '../render/Materials';
import { box } from '../world/geometry';
import type { AttackArc } from './PlayerCombat';
import type { PlayerState } from './PlayerController';
import { SpellbookModel } from './SpellbookModel';

/**
 * Blocky spellblade, built from boxes and animated procedurally — no rigs or clips.
 * Chunky proportions read well in the crisp near band, and the renderer's silhouette
 * outline does a lot of the work. Job 3 hangs attack animations off `armR`/`sword`.
 */

interface Limb {
  group: THREE.Group;
  /** Current and target rotation, blended per frame. */
  x: number;
  z: number;
}

export interface PoseContext {
  state: PlayerState;
  speed: number;
  velocity: THREE.Vector3;
  grounded: boolean;
  facing: number;
  position: THREE.Vector3;
}

const lerp = THREE.MathUtils.lerp;

export class PlayerModel {
  readonly root = new THREE.Group();
  readonly book = new SpellbookModel();
  weaponVersion = 0;
  cloneSword(): THREE.Object3D { return this.sword.clone(true); }
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly cloak = new THREE.Group();
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly legL: Limb;
  private readonly legR: Limb;
  private readonly sword = new THREE.Group();
  private readonly swordBack = new THREE.Group();
  private readonly swordHand = new THREE.Group();
  private swordInHand = false;

  private phase = 0;
  private attackArc: AttackArc | null = null;
  private attackPhase: 'idle' | 'windup' | 'active' | 'recovery' | 'charge' | 'staggered' | 'dead' = 'idle';
  private attackT = 0;
  private attackCharge = 0;
  private swordDrawn = false;
  private swordBlend = 0;
  private spin = 0;
  private bodyLean = 0;
  private bodyRoll = 0;
  private crouch = 0;
  private lastYaw = 0;

  constructor() {
    const cloth = toon({ color: 0x3e2660 });
    const clothDark = toon({ color: 0x2a1944 });
    const steel = toon({ color: 0x77808f });
    const steelDark = toon({ color: 0x4a5260 });
    const gold = toon({ color: 0xd0a040 });
    const leather = toon({ color: 0x4a3226 });
    const runes = glow(0x6ad8ff, 2.6);
    const shadow = toon({ color: 0x140f1e });

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Torso pivots at the hips so the whole upper body can lean.
    this.torso.position.set(0, 0.92, 0);
    add(this.torso, box(0.36, 0.2, 0.26, 1).translate(0, 0.02, 0), leather);
    add(this.torso, box(0.42, 0.4, 0.26, 1).translate(0, 0.32, 0), cloth);
    add(this.torso, box(0.44, 0.1, 0.28, 1).translate(0, 0.14, 0), gold);
    // Chest plate and shoulder pads
    add(this.torso, box(0.3, 0.26, 0.1, 1).translate(0, 0.36, 0.11), steel);
    for (const s of [-1, 1]) add(this.torso, box(0.16, 0.14, 0.24, 1).translate(s * 0.26, 0.48, 0), steel);

    this.head.position.set(0, 0.62, 0);
    add(this.head, box(0.24, 0.24, 0.24, 1), clothDark);
    add(this.head, box(0.26, 0.1, 0.26, 1).translate(0, 0.13, 0), cloth); // hood crown
    add(this.head, box(0.2, 0.12, 0.04, 1).translate(0, -0.02, 0.12), shadow); // shadowed face
    add(this.head, box(0.07, 0.03, 0.03, 1).translate(-0.05, 0.0, 0.14), runes); // eye glints
    add(this.head, box(0.07, 0.03, 0.03, 1).translate(0.05, 0.0, 0.14), runes);
    this.torso.add(this.head);

    // Cloak hangs from the shoulders and swings with movement.
    this.cloak.position.set(0, 0.5, -0.14);
    add(this.cloak, box(0.44, 0.5, 0.06, 1).translate(0, -0.25, 0), cloth);
    add(this.cloak, box(0.34, 0.34, 0.05, 1).translate(0, -0.66, -0.02), clothDark);
    this.torso.add(this.cloak);

    const makeArm = (side: number): Limb => {
      const group = new THREE.Group();
      group.position.set(side * 0.29, 0.46, 0);
      add(group, box(0.13, 0.26, 0.15, 1).translate(0, -0.13, 0), cloth);
      add(group, box(0.14, 0.22, 0.16, 1).translate(0, -0.36, 0), steelDark);
      add(group, box(0.12, 0.1, 0.14, 1).translate(0, -0.5, 0), leather);
      this.torso.add(group);
      return { group, x: 0, z: 0 };
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);

    const makeLeg = (side: number): Limb => {
      const group = new THREE.Group();
      group.position.set(side * 0.12, 0.9, 0);
      add(group, box(0.16, 0.44, 0.18, 1).translate(0, -0.22, 0), clothDark);
      add(group, box(0.15, 0.3, 0.17, 1).translate(0, -0.58, 0), leather);
      add(group, box(0.18, 0.12, 0.26, 1).translate(0, -0.78, 0.03), steelDark);
      this.body.add(group);
      return { group, x: 0, z: 0 };
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    // Longsword (until the supplied model loads): grip at the origin, blade along +Y.
    add(this.sword, box(0.08, 1.0, 0.03, 1).translate(0, 0.5, 0), steel);
    add(this.sword, box(0.02, 0.78, 0.035, 1).translate(0, 0.46, 0), steelDark);
    add(this.sword, box(0.3, 0.06, 0.07, 1), gold);
    add(this.sword, box(0.05, 0.22, 0.05, 1).translate(0, -0.15, 0), leather);
    // Two anchors: slung across the back, or gripped in the right fist. The sword swaps
    // between them mid-draw, hidden by the arm's reach-back motion.
    this.swordBack.position.set(-0.05, 0.42, -0.19);
    this.swordBack.rotation.set(0, 0, 0.6);
    this.torso.add(this.swordBack);
    this.swordHand.position.set(0, -0.5, 0.02);
    this.swordHand.rotation.set(1.5, 0, 0);
    this.armR.group.add(this.swordHand);
    this.swordBack.add(this.sword);

    this.body.add(this.torso);
    this.torso.add(this.book.root);
    this.root.add(this.body);
    this.root.name = 'player';
  }

  /** Blade length (m) from the grip to the tip, for effects along the blade. */
  swordLength = 1.02;

  /**
   * Replaces the visual weapon without changing analytic combat hitboxes. Imported
   * weapons have different authoring axes: the longest axis becomes the blade (+Y), and
   * the tip is the end farther from the vertex centroid (the hilt carries the mass of
   * guard, grip and pommel). The grip sits at the origin, a little above the pommel.
   */
  setSwordModel(model: THREE.Group): void {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    const centroid = new THREE.Vector3();
    let n = 0;
    const v = new THREE.Vector3();
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); centroid.add(v); n++; }
    });
    centroid.divideScalar(Math.max(1, n));
    const tipDir = new THREE.Vector3();
    tipDir[axis] = centroid[axis] > centre[axis] ? -1 : 1;
    const holder = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(model);
    inner.position.copy(centre).multiplyScalar(-1);
    holder.add(inner);
    holder.quaternion.setFromUnitVectors(tipDir, new THREE.Vector3(0, 1, 0));
    const length = size[axis];
    // The pommel end sits 12 % of the length below the grip.
    holder.position.y = length / 2 - length * 0.12;
    this.swordLength = length * 0.88;
    for (const child of [...this.sword.children]) {
      this.sword.remove(child);
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    this.sword.add(holder);
    this.weaponVersion++;
  }

  /** Combat tells the model which swing is playing; poses blend fast so hits read. */
  setAttackPose(arc: AttackArc | null, phase: PlayerModel['attackPhase'], t: number, charge: number): void {
    this.attackArc = arc;
    this.attackPhase = phase;
    this.attackT = t;
    this.attackCharge = charge;
  }

  /** The greatsword rides on the back out of combat and in the hand during it. */
  setSwordDrawn(drawn: boolean): void {
    this.swordDrawn = drawn;
  }

  /** Overrides the movement pose while a swing is playing. Returns true if it took over. */
  private applyAttackPose(dt: number): boolean {
    const arc = this.attackArc;
    if (!arc) {
      this.spin = lerp(this.spin, 0, 1 - Math.exp(-dt * 12));
      return false;
    }
    const t = this.attackT;
    const windup = this.attackPhase === 'windup';
    const active = this.attackPhase === 'active';
    // Windup winds back, active snaps through, recovery settles.
    const swing = windup ? -0.35 - t * 0.5 : active ? -0.85 + t * 2.4 : 1.2 - t * 1.1;
    let armXR = 0;
    let armXL = 0;
    let armZR = 0;
    let armZL = 0;
    let twist = 0;
    let lean = 0;
    let crouch = 0;

    switch (arc) {
      case 'slashR':
        armXR = -1.5 + swing * 0.5;
        armZR = -1.1 + swing * 1.4;
        armXL = -0.4;
        twist = -0.5 + swing * 0.8;
        lean = -0.12 - (active ? t * 0.12 : 0);
        break;
      case 'slashL':
        armXR = -1.3 + swing * 0.4;
        armZR = 1.2 - swing * 1.5;
        armXL = -0.3;
        twist = 0.5 - swing * 0.8;
        lean = -0.12;
        break;
      case 'spin':
        armXR = -1.3;
        armZR = 1.35;
        armXL = -1.1;
        armZL = -1.2;
        this.spin = active ? t * Math.PI * 2 : windup ? -0.5 * t : this.spin;
        lean = -0.1;
        break;
      case 'overhead': {
        const raise = windup ? -2.9 - this.attackCharge * 0.35 : active ? -2.9 + t * 3.6 : 0.6 - t * 0.5;
        armXR = raise;
        armXL = raise * 0.85;
        lean = windup ? 0.18 : -0.45 + (active ? -t * 0.1 : 0.3 * t);
        crouch = active ? 0.2 * t : 0.05;
        break;
      }
      case 'thrust':
        armXR = windup ? -0.7 : -1.75;
        armZR = 0.15;
        armXL = -0.5;
        twist = windup ? 0.5 : -0.35;
        lean = -0.3;
        break;
      case 'sweep':
        crouch = 0.55;
        armXR = -0.5 + swing * 0.6;
        armZR = -0.9 + swing * 1.5;
        lean = -0.45;
        break;
      case 'plunge':
        armXR = -3.0 + (active ? 0.9 : 0);
        armXL = -2.7;
        lean = active ? 0.35 : -0.25;
        crouch = 0.15;
        break;
    }

    const k = 1 - Math.exp(-dt * 34);
    this.bodyLean = lerp(this.bodyLean, lean, k);
    this.crouch = lerp(this.crouch, crouch, k);
    this.body.position.y = -this.crouch * 0.72;
    this.body.rotation.set(this.bodyLean * 0.4, this.spin, 0);
    this.torso.rotation.set(this.bodyLean, twist, 0);
    this.head.rotation.set(-this.bodyLean * 0.5, -twist * 0.5, 0);
    blendLimb(this.armR, armXR, armZR, k);
    blendLimb(this.armL, armXL, armZL, k);
    blendLimb(this.legL, -0.25, 0, k * 0.5);
    blendLimb(this.legR, 0.3, 0, k * 0.5);
    this.cloak.rotation.x = lerp(this.cloak.rotation.x, 0.5 + this.crouch, k);
    return true;
  }

  /** Moves the sword between its back sheath and the right fist. */
  private updateSword(dt: number): void {
    this.swordBlend = lerp(this.swordBlend, this.swordDrawn ? 1 : 0, 1 - Math.exp(-dt * 16));
    const inHand = this.swordBlend > 0.5;
    if (inHand !== this.swordInHand) {
      this.swordInHand = inHand;
      (inHand ? this.swordHand : this.swordBack).add(this.sword);
    }
  }

  /** Drives the whole pose from movement state — no animation clips. */
  update(dt: number, ctx: PoseContext): void {
    const speed = ctx.speed;
    this.root.position.copy(ctx.position);
    // The model is authored looking down +Z; facing 0 means -Z.
    this.root.rotation.y = ctx.facing + Math.PI;
    this.updateSword(dt);
    this.book.update(dt);
    if (this.applyAttackPose(dt)) return;

    // Stride rate scales with speed, so runs and sprints share one cycle.
    const stride = ctx.grounded && speed > 0.6 ? speed * 1.15 : 0;
    this.phase += stride * dt;

    const turn = THREE.MathUtils.clamp(shortestAngle(ctx.facing - this.lastYaw) / Math.max(dt, 1e-3), -6, 6);
    this.lastYaw = ctx.facing;

    let targetLean = 0;
    let targetRoll = 0;
    let targetCrouch = 0;
    let armXL = 0;
    let armXR = 0;
    let armZL = 0.08;
    let armZR = 0.08;
    let legXL = 0;
    let legXR = 0;
    let bob = 0;

    switch (ctx.state) {
      case 'run':
      case 'idle': {
        const swing = Math.min(speed / 9, 1.35);
        legXL = Math.sin(this.phase) * 0.85 * swing;
        legXR = Math.sin(this.phase + Math.PI) * 0.85 * swing;
        armXL = Math.sin(this.phase + Math.PI) * 0.7 * swing;
        armXR = Math.sin(this.phase) * 0.7 * swing;
        bob = Math.abs(Math.sin(this.phase)) * 0.05 * swing;
        targetLean = -Math.min(speed / 26, 0.34);
        targetRoll = -turn * 0.04;
        if (speed < 0.6) {
          // Idle: slow breathing and a slight weight shift.
          const t = performance.now() * 0.001;
          bob = Math.sin(t * 1.6) * 0.012;
          armXL = Math.sin(t * 1.6) * 0.05;
          armXR = -Math.sin(t * 1.6) * 0.05;
          targetLean = 0.02;
        }
        break;
      }
      case 'air': {
        const rising = ctx.velocity.y > 0;
        legXL = rising ? -0.5 : 0.35;
        legXR = rising ? 0.3 : -0.15;
        armXL = rising ? -1.5 : -2.2;
        armXR = rising ? -1.2 : -2.0;
        armZL = 0.4;
        armZR = 0.4;
        targetLean = rising ? -0.12 : 0.1;
        targetCrouch = rising ? 0.06 : 0;
        break;
      }
      case 'wall': {
        legXL = -0.6;
        legXR = 0.25;
        armXL = -2.4;
        armXR = -0.6;
        armZL = 0.9;
        targetRoll = 0.25;
        targetLean = -0.1;
        break;
      }
      case 'slide': {
        targetCrouch = 0.62;
        targetLean = -0.5;
        legXL = -1.25;
        legXR = -0.35;
        armXL = -0.9;
        armXR = 0.7;
        armZR = 0.5;
        break;
      }
      case 'dash': {
        targetCrouch = 0.18;
        targetLean = -0.7;
        armXL = -2.6;
        armXR = -2.6;
        legXL = 0.5;
        legXR = -0.5;
        break;
      }
      case 'swim': {
        const t = performance.now() * 0.001;
        targetCrouch = 0.35;
        targetLean = -1.0;
        legXL = Math.sin(t * 3) * 0.4;
        legXR = Math.sin(t * 3 + Math.PI) * 0.4;
        armXL = -1.9 + Math.sin(t * 3) * 0.5;
        armXR = -1.9 + Math.sin(t * 3 + Math.PI) * 0.5;
        break;
      }
    }

    const k = 1 - Math.exp(-dt * 16);
    this.bodyLean = lerp(this.bodyLean, targetLean, k);
    this.bodyRoll = lerp(this.bodyRoll, targetRoll, k);
    this.crouch = lerp(this.crouch, targetCrouch, k);

    this.body.position.y = bob - this.crouch * 0.72;
    this.body.rotation.set(this.bodyLean * 0.35, 0, this.bodyRoll);
    this.torso.rotation.set(this.bodyLean, 0, this.bodyRoll * 0.5);
    this.head.rotation.x = -this.bodyLean * 0.7;
    this.cloak.rotation.x = lerp(this.cloak.rotation.x, 0.25 + Math.min(speed / 14, 1.1) + this.crouch * 0.6, k);
    this.cloak.rotation.z = lerp(this.cloak.rotation.z, -turn * 0.06, k);

    blendLimb(this.armL, armXL, armZL, k);
    blendLimb(this.armR, armXR, armZR, k);
    blendLimb(this.legL, legXL, 0, k);
    blendLimb(this.legR, legXR, 0, k);
  }
}

function blendLimb(limb: Limb, x: number, z: number, k: number): void {
  limb.x = lerp(limb.x, x, k);
  limb.z = lerp(limb.z, z, k);
  limb.group.rotation.set(limb.x, 0, limb.z);
}

function shortestAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
