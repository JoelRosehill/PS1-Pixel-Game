import * as THREE from 'three';
import { toon } from '../render/Materials';
import type { AttackArc, PlayerCombat } from './PlayerCombat';
import type { PlayerController } from './PlayerController';
import type { PlayerModel } from './PlayerModel';
import type { FirstPersonCamera } from './FirstPersonCamera';
import { SpellbookModel } from './SpellbookModel';

/**
 * Where the blade points and how far the arm reaches. The hand moves around a shoulder
 * pivot in the direction the blade points, so interpolating a pose sweeps the sword along
 * a real arc across the view instead of tilting it in place.
 */
interface Pose { yaw: number; pitch: number; roll: number; reach: number }

const pose = (yaw: number, pitch: number, roll = 0, reach = 0): Pose => ({ yaw, pitch, roll, reach });

/** Held at rest: blade up and angled across the body, ready. */
const GUARD = pose(0.32, 0.95, 0.15);
/** Charging a heavy: raised behind the head. */
const RAISED = pose(0.12, 2.05, 0.2, -0.05);
/** Parry / guard: the flat across the body. */
const BLOCK = pose(1.05, 0.45, 1.45, 0.05);

/** Per swing: the cocked pose (end of the wind-up) and where the strike carries through. */
const SWINGS: Record<AttackArc, { cocked: Pose; through: Pose }> = {
  slashR: { cocked: pose(-1.35, 0.4, -0.2), through: pose(1.3, 0.0, 0.2, 0.05) },
  slashL: { cocked: pose(1.25, 0.5, 0.25), through: pose(-1.35, 0.0, -0.2, 0.05) },
  spin: { cocked: pose(-1.7, 0.3, -0.3), through: pose(1.75, 0.05, 0.3, 0.1) },
  overhead: { cocked: RAISED, through: pose(0.05, -0.95, 0, 0.12) },
  thrust: { cocked: pose(0.18, 0.08, 0, -0.16), through: pose(0.02, 0.02, 0, 0.34) },
  sweep: { cocked: pose(-1.3, -0.35, -0.3), through: pose(1.35, -0.6, 0.3, 0.05) },
  plunge: { cocked: pose(0.1, 1.9, 0), through: pose(0, -1.45, 0, 0.1) },
};

const SHOULDER = new THREE.Vector3(0.32, -0.42, -0.36);
const TRAIL = 22;

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  out.pitch = a.pitch + (b.pitch - a.pitch) * t;
  out.roll = a.roll + (b.roll - a.roll) * t;
  out.reach = a.reach + (b.reach - a.reach) * t;
  return out;
}

/**
 * Separate near-field scene: hands never clip into walls or obscure the horizon.
 * The sword is the supplied longsword (the Oathblade's small twin), swung through keyed
 * arcs, with a ribbon traced by the blade itself during each strike.
 */
export class FirstPersonRig {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.025, 5);
  readonly swordHand = new THREE.Group();
  readonly bookHand = new THREE.Group();
  readonly book = new SpellbookModel();
  private readonly roll = new THREE.Group();
  private readonly forearm: THREE.Mesh;
  private readonly elbow = new THREE.Vector3(0.5, -0.95, 0.05);
  private readonly weapon = new THREE.Group();
  private readonly tip = new THREE.Object3D();
  private readonly base = new THREE.Object3D();
  private version = -1;
  private stride = 0;
  private swayX = 0;
  private swayY = 0;
  private channel = 0;
  private drink = 0;
  private readonly tmpDrink = new THREE.Vector3();
  /** The pose shown (blended toward the target between swings). */
  private readonly shown: Pose = { ...GUARD };
  private readonly target: Pose = { ...GUARD };
  private readonly swingPose: Pose = { ...GUARD };
  /** The attack being swung, and the pose the hand was in when it began. */
  private swingAttack: unknown = null;
  private readonly startPose: Pose = { ...GUARD };
  // Slash ribbon: blade base and tip positions, newest last.
  private readonly ribbon: THREE.Mesh;
  private readonly ribbonPos = new Float32Array(TRAIL * 2 * 3);
  private readonly ribbonCol = new Float32Array(TRAIL * 2 * 3);
  private readonly samples: { base: THREE.Vector3; tip: THREE.Vector3; age: number }[] = [];
  private readonly ribbonColor = new THREE.Color();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor() {
    this.scene.name = 'first-person-hands';
    this.scene.add(new THREE.HemisphereLight(0xe1dfff, 0x39274f, 2.4));
    const key = new THREE.DirectionalLight(0xffecd0, 2.7); key.position.set(-2, 3, 2); this.scene.add(key);
    this.scene.add(this.swordHand, this.bookHand);
    const steel = toon({ color: 0x788397 }), cloth = toon({ color: 0x492760 }), leather = toon({ color: 0x574052 });
    // The sword hand is a gauntlet around the grip; its forearm is a separate piece that
    // always runs from the wrist back to an elbow below the view, whatever the swing.
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.12), leather);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.14), steel); cuff.position.y = -0.09;
    this.swordHand.add(glove, cuff);
    this.forearm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 1).translate(0, 0, -0.5), cloth);
    this.scene.add(this.forearm);
    {
      const bookGlove = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.18), leather);
      const bookCuff = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.19), steel); bookCuff.position.y = -0.11;
      const bookArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.17), cloth);
      bookArm.position.set(0, -0.19, 0.09); bookArm.rotation.x = -0.45;
      this.bookHand.add(bookArm, bookGlove, bookCuff);
    }
    this.weapon.scale.setScalar(0.62);
    this.roll.add(this.weapon);
    this.swordHand.add(this.roll);
    this.bookHand.add(this.book.root);
    this.book.root.scale.setScalar(0.95);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.ribbonPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.ribbonCol, 3));
    const index: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) { const k = i * 2; index.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
    geo.setIndex(index);
    this.ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 2;
    this.ribbon.visible = false;
    this.scene.add(this.ribbon);
  }

  update(dt: number, model: PlayerModel, combat: PlayerCombat, controller: PlayerController, motion: number, view?: FirstPersonCamera): void {
    if (this.version !== model.weaponVersion) {
      this.weapon.clear();
      const visual = model.cloneSword();
      // Up close the steel needs more light than the world's toon ramp gives it.
      visual.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = false; o.receiveShadow = false;
        const lift = (m: THREE.Material) => { const c = m.clone() as THREE.MeshToonMaterial; c.color?.multiplyScalar(1.35); return c; };
        o.material = Array.isArray(o.material) ? o.material.map(lift) : lift(o.material);
      });
      this.weapon.add(visual);
      // Markers along the blade for the ribbon.
      const length = model.swordLength;
      this.tip.position.set(0, length * 0.98, 0);
      this.base.position.set(0, length * 0.3, 0);
      visual.add(this.tip, this.base);
      this.version = model.weaponVersion;
    }
    if (this.book.pageCount !== model.book.pageCount) this.book.setPages(model.book.pageCount, model.book.tier);
    // Hands follow the camera's stride: a figure-eight that lags the head a little, plus
    // sway against mouse motion so the weapon feels held rather than glued to the lens.
    this.stride = view ? view.stride : this.stride + dt * Math.min(controller.speed, 18);
    const amount = (view ? view.bobAmount : Math.min(1, controller.speed / 9)) * motion;
    const bob = (Math.abs(Math.cos(this.stride - 0.3)) - 0.6) * 0.03 * amount;
    const bobSide = Math.sin(this.stride - 0.3) * 0.022 * amount;
    this.swayX = THREE.MathUtils.damp(this.swayX, THREE.MathUtils.clamp(-(view?.lookDX ?? 0) * 0.0016, -0.06, 0.06) * motion, 10, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, THREE.MathUtils.clamp((view?.lookDY ?? 0) * 0.0016, -0.05, 0.05) * motion, 10, dt);
    this.channel = THREE.MathUtils.damp(this.channel, controller.channelling && !combat.channelBroken ? 1 : 0, 8, dt);

    // --- the swing ---------------------------------------------------------------------
    const c = combat, arc = c.attack?.arc, t = Math.min(1, Math.max(0, c.phaseT));
    const swinging = !!arc && (c.phase === 'windup' || c.phase === 'active' || c.phase === 'recovery');
    if (swinging && c.attack !== this.swingAttack) {
      // A new swing flows on from wherever the last one left the hand.
      this.swingAttack = c.attack;
      Object.assign(this.startPose, this.shown);
    }
    if (swinging) {
      const s = SWINGS[arc];
      // Wind-up eases into the cocked pose; the strike accelerates through the middle
      // and carries past the target; recovery drifts back to guard.
      if (c.phase === 'windup') lerpPose(this.startPose, s.cocked, 1 - (1 - t) * (1 - t), this.swingPose);
      else if (c.phase === 'active') lerpPose(s.cocked, s.through, ease(t), this.swingPose);
      else lerpPose(s.through, GUARD, ease(t), this.swingPose);
      Object.assign(this.shown, this.swingPose);
    } else {
      this.swingAttack = null;
      const running = Math.min(1, controller.speed / 9);
      if (c.phase === 'charge') {
        Object.assign(this.target, RAISED);
        this.target.roll += Math.sin(performance.now() * 0.05) * 0.03 * c.charge;
      } else if (c.guarding) Object.assign(this.target, BLOCK);
      else lerpPose(GUARD, pose(0.4, 0.6, 0.25), running * 0.6, this.target);
      const k = 1 - Math.exp(-dt * 14);
      lerpPose(this.shown, this.target, k, this.shown);
    }

    // Channelling lowers the sword a little and turns attention to the book.
    const ch = this.channel;
    const p = this.shown;
    const cp = Math.cos(p.pitch);
    const dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp;
    const crouch = controller.sliding ? -0.04 : 0;
    this.swordHand.position.set(
      SHOULDER.x + dx * 0.42 + bobSide + this.swayX + ch * 0.06,
      SHOULDER.y + dy * 0.3 + bob + crouch + this.swayY - ch * 0.1,
      SHOULDER.z + dz * 0.3 - p.reach,
    );
    this.swordHand.rotation.set(p.pitch - Math.PI / 2 - ch * 0.35, p.yaw, bobSide * 2, 'YXZ');
    this.roll.rotation.y = p.roll;
    // Forearm: from the wrist to the elbow off the bottom-right of the view.
    const wrist = this.swordHand.position;
    this.forearm.position.copy(wrist);
    this.forearm.scale.set(1, 1, Math.max(0.1, wrist.distanceTo(this.elbow)));
    this.forearm.lookAt(this.a.copy(wrist).multiplyScalar(2).sub(this.elbow));
    this.updateRibbon(dt, c.phase === 'active' && !!arc, c.attack?.trail);

    // Channelling: the book rises to the chest, open, and trembles with gathered power.
    const open = Math.max(model.book.openness, ch);
    const tremble = ch * Math.sin(performance.now() * 0.045) * 0.004;
    this.book.pose(open);
    this.book.root.position.set(0, 0.07, -0.06);
    this.book.root.rotation.set(0.45 + open * 0.45 - ch * 0.25, 0.1, 0.08);
    this.bookHand.position.set(-0.4 + ch * 0.22 + bobSide * 0.8 + this.swayX, -0.46 + open * 0.16 - bob + ch * 0.1 + this.swayY + tremble, -0.68 + ch * 0.08);
    this.bookHand.rotation.set(0, ch * 0.3, -0.08 - ch * 0.1);
    // Ember Flask: the off hand tips a glowing flask toward the mouth.
    this.drink = THREE.MathUtils.damp(this.drink, combat.drinking > 0 ? 1 : 0, 14, dt);
    if (this.drink > 0.01) {
      const k = this.drink;
      this.bookHand.position.lerp(this.tmpDrink.set(-0.12, -0.16, -0.42), k);
      this.bookHand.rotation.x += k * 0.9;
      this.bookHand.rotation.z += k * 0.5;
    }
    this.scene.visible = combat.alive;
  }

  /** The ribbon: while a strike is active, the blade's path from base to tip glows. */
  private updateRibbon(dt: number, active: boolean, color: number | undefined): void {
    for (const s of this.samples) s.age += dt;
    if (active) {
      this.scene.updateMatrixWorld(true);
      this.samples.push({ base: this.base.getWorldPosition(new THREE.Vector3()), tip: this.tip.getWorldPosition(new THREE.Vector3()), age: 0 });
      if (this.samples.length > TRAIL) this.samples.shift();
      if (color !== undefined) this.ribbonColor.set(color);
    }
    while (this.samples.length && this.samples[0].age > 0.16) this.samples.shift();
    const n = this.samples.length;
    this.ribbon.visible = n >= 2;
    if (n < 2) return;
    for (let i = 0; i < TRAIL; i++) {
      const s = this.samples[Math.min(i, n - 1)];
      const fresh = i < n ? Math.max(0, 1 - s.age / 0.16) * (i / (n - 1)) : 0;
      // Widen toward the tip; the base end fades into the hand.
      this.a.copy(s.base).lerp(s.tip, 0.25);
      this.b.copy(s.tip);
      this.ribbonPos.set([this.a.x, this.a.y, this.a.z], i * 6);
      this.ribbonPos.set([this.b.x, this.b.y, this.b.z], i * 6 + 3);
      const col = this.ribbonColor;
      const k = fresh * fresh * 0.9;
      this.ribbonCol.set([col.r * k * 0.15, col.g * k * 0.15, col.b * k * 0.15], i * 6);
      this.ribbonCol.set([col.r * k, col.g * k, col.b * k], i * 6 + 3);
    }
    (this.ribbon.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.ribbon.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
