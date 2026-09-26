import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { PlayerController } from './PlayerController';

/**
 * Eyes inside the capsule. Mouse aim is sampled once, before fixed-step combat.
 *
 * Job 12 adds body to the view: a stride bob (vertical, with a figure-eight sway and a
 * little roll), a spring-damped dip on landings scaled by fall speed, a lean into
 * strafes, a roll and FOV punch on dashes, and a slow breath when idle. Aim stays
 * exact: bob moves the eye, never the look direction beyond a fraction of a degree.
 * The "camera motion" setting (motionScale) scales all of it, and 0 turns it off.
 */
export class FirstPersonCamera {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  invertY = false;
  readonly bodyVisible = false;
  baseFov = 75;
  speedFov = 10;
  motionScale = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  /** Stride phase in radians (one footstep per π). */
  stride = 0;
  /** Current bob strength 0..1 (fades in with ground speed). */
  bobAmount = 0;
  private shake = 0;
  private shakeTime = 0;
  private eyeHeight = 1.55;
  private roll = 0;
  private lean = 0;
  private dip = 0;
  private dipVel = 0;
  private kick = 0;
  private fovPunch = 0;
  private breath = 0;
  private initialized = false;
  private seenLand = 0;
  private seenDash = 0;
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly input: Input) {}
  setYaw(yaw: number, pitch = this.pitch): void {
    this.yaw = yaw; this.pitch = THREE.MathUtils.clamp(pitch, -1.48, 1.48);
    this.initialized = false;
  }
  get movementYaw(): number { return this.yaw; }
  /** Recent mouse motion (for weapon sway in the hands rig). */
  lookDX = 0;
  lookDY = 0;
  readLook(): void {
    this.lookDX *= 0.6; this.lookDY *= 0.6;
    if (!this.input.locked || this.input.blocked) return;
    this.lookDX += this.input.mouseDX * 0.4; this.lookDY += this.input.mouseDY * 0.4;
    this.yaw -= this.input.mouseDX * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - this.input.mouseDY * this.sensitivity * (this.invertY ? -1 : 1), -1.48, 1.48);
  }
  aimDirection(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  addShake(amount: number): void { this.shake = Math.min(1, this.shake + amount); }
  /** A short upward kick of the view (heavy swings, taking a hit). */
  addKick(amount: number): void { this.kick = Math.min(0.08, this.kick + amount); }

  update(dt: number, player: PlayerController, alpha = 1): void {
    const m = this.motionScale;
    player.interpolate(alpha, this.camera.position);
    const targetEye = player.capsuleHeight - 0.25;
    if (!this.initialized || targetEye < this.eyeHeight) this.eyeHeight = targetEye;
    else this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, 18, dt);
    this.initialized = true;

    // Stride bob: speed-scaled, grounded only, eases out in the air and in slides.
    const walking = player.grounded && !player.sliding && player.state !== 'dash';
    const speedK = THREE.MathUtils.clamp(player.speed / 9, 0, 1.35);
    this.bobAmount = THREE.MathUtils.damp(this.bobAmount, walking ? speedK : 0, 9, dt);
    // One stride (two footsteps) per 2 × strideLength metres.
    this.stride += (player.speed / 2.1) * Math.PI * dt * (walking ? 1 : 0.3);
    const bobY = (Math.abs(Math.cos(this.stride)) - 0.64) * 0.075 * this.bobAmount;
    const bobX = Math.sin(this.stride) * 0.035 * this.bobAmount;

    // Landing dip: a spring pushed down in proportion to the fall.
    const landed = player.counts.land !== this.seenLand;
    this.seenLand = player.counts.land;
    if (landed && player.landingSpeed > 4) {
      this.dipVel -= Math.min(4.5, (player.landingSpeed - 3) * 0.16);
      this.kick += Math.min(0.03, player.landingSpeed * 0.0012);
    }
    // Sub-stepped spring: stable at any frame rate (a single large step diverges).
    const steps = Math.min(30, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.dipVel += (-this.dip * 170 - this.dipVel * 16) * h;
      this.dip += this.dipVel * h;
    }
    this.dip = THREE.MathUtils.clamp(this.dip, -0.4, 0.15);
    if (!Number.isFinite(this.dip)) { this.dip = 0; this.dipVel = 0; }

    this.breath += dt;
    const idleBreath = Math.sin(this.breath * 1.7) * 0.006 * (1 - Math.min(1, this.bobAmount));

    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.y += this.eyeHeight + (bobY + this.dip + idleBreath) * m;
    this.camera.position.addScaledVector(right, bobX * m);

    // Lean into strafes and wall runs; roll into dashes.
    const strafe = player.grounded || player.wallRunning ? player.moveInput.x : player.moveInput.x * 0.5;
    this.lean = THREE.MathUtils.damp(this.lean, -strafe * 0.022 * Math.min(1, player.speed / 6), 7, dt);
    const wallRoll = player.wallRunning ? player.wallSide * 0.06 : 0;
    const dashRoll = player.state === 'dash' ? -player.moveInput.x * 0.045 : 0;
    this.roll = THREE.MathUtils.damp(this.roll, (wallRoll + dashRoll + this.lean) * m, 10, dt);
    if (player.counts.dash !== this.seenDash) { this.seenDash = player.counts.dash; this.fovPunch = 7; }
    this.fovPunch = THREE.MathUtils.damp(this.fovPunch, 0, 6, dt);

    this.kick = THREE.MathUtils.damp(this.kick, 0, 9, dt);
    const bobRoll = Math.sin(this.stride) * 0.006 * this.bobAmount;
    this.camera.rotation.set(this.pitch + (this.kick + bobY * 0.04) * m, this.yaw, this.roll + bobRoll * m, 'YXZ');
    this.shakeTime += dt * 38;
    this.camera.rotation.z += Math.sin(this.shakeTime) * this.shake * 0.012 * m;
    this.camera.rotation.x += Math.sin(this.shakeTime * 0.77) * this.shake * 0.006 * m;
    this.shake = Math.max(0, this.shake - dt * 4);
    const channel = player.channelling ? -4 : 0;
    const fov = this.baseFov + (Math.min(1, Math.max(0, player.speed - 10) / 24) * this.speedFov + this.fovPunch + channel) * m;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 8, dt);
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
  }
}
