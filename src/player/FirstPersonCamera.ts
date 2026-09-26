import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { PlayerController } from './PlayerController';

/** Eyes inside the capsule. Mouse aim is sampled once, before fixed-step combat. */
export class FirstPersonCamera {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  readonly bodyVisible = false;
  baseFov = 75;
  speedFov = 10;
  motionScale = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  private shake = 0;
  private shakeTime = 0;
  private eyeHeight = 1.55;
  private roll = 0;
  private initialized = false;
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly input: Input) {}
  setYaw(yaw: number, pitch = this.pitch): void {
    this.yaw = yaw; this.pitch = THREE.MathUtils.clamp(pitch, -1.48, 1.48);
    this.initialized = false;
  }
  get movementYaw(): number { return this.yaw; }
  readLook(): void {
    if (!this.input.locked || this.input.blocked) return;
    this.yaw -= this.input.mouseDX * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - this.input.mouseDY * this.sensitivity, -1.48, 1.48);
  }
  aimDirection(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  addShake(amount: number): void { this.shake = Math.min(1, this.shake + amount); }
  update(dt: number, player: PlayerController, alpha = 1): void {
    player.interpolate(alpha, this.camera.position);
    const targetEye = player.capsuleHeight - 0.25;
    if (!this.initialized || targetEye < this.eyeHeight) this.eyeHeight = targetEye;
    else this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, 18, dt);
    this.initialized = true;
    this.camera.position.y += this.eyeHeight;
    // No positional head-bob or aim smoothing: the crosshair remains trustworthy.
    const wallRoll = player.wallRunning ? player.wallSide * 0.045 : 0;
    this.roll = THREE.MathUtils.damp(this.roll, wallRoll * this.motionScale, 10, dt);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.shakeTime += dt * 38;
    this.camera.rotation.z += Math.sin(this.shakeTime) * this.shake * 0.012 * this.motionScale;
    this.shake = Math.max(0, this.shake - dt * 4);
    const fov = this.baseFov + Math.min(1, Math.max(0, player.speed - 10) / 24) * this.speedFov * this.motionScale;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 8, dt);
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
  }
}
