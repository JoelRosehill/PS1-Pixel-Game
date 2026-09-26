import * as THREE from 'three';
import type { AIContext } from './AIContext';

export interface PerceptionSpec {
  /** Maximum sight distance (m). */
  sight: number;
  /** Half-angle of the view cone (radians). */
  fov: number;
  /** Within this radius the player is noticed from any direction. */
  hearing: number;
  /** Awareness gained per second at point-blank range. */
  gain: number;
  /** Seconds out of sight before an alerted enemy gives up. */
  forget: number;
}

/**
 * Sight with a view cone, a hearing radius and line-of-sight checks against static
 * geometry. Awareness fills faster the closer the player is, so sneaking past at the
 * edge of vision is possible, while walking up to a knight is not.
 * Line-of-sight sweeps are spread over time (every 0.2 s per enemy) to stay cheap.
 */
export class Perception {
  awareness = 0;
  alerted = false;
  canSee = false;
  readonly lastKnown = new THREE.Vector3();
  private recheck = Math.random() * 0.2;
  private unseen = 0;
  private readonly to = new THREE.Vector3();

  constructor(readonly spec: PerceptionSpec) {}

  reset(): void {
    this.awareness = 0;
    this.alerted = false;
    this.canSee = false;
    this.unseen = 0;
  }

  /** Something (damage, an ally's shout) revealed the player. */
  alert(at: THREE.Vector3): void {
    this.awareness = 1;
    this.alerted = true;
    this.unseen = 0;
    this.lastKnown.copy(at);
  }

  update(dt: number, eye: THREE.Vector3, facing: number, ctx: AIContext): void {
    const player = ctx.player;
    const available = player.combat.alive && player.active;
    this.recheck -= dt;
    if (!available) this.canSee = false;
    else if (this.recheck <= 0) {
      this.recheck = 0.2;
      this.canSee = this.test(eye, facing, ctx);
    }
    const dist = eye.distanceTo(ctx.playerEye);
    if (this.canSee) {
      this.lastKnown.copy(player.controller.position);
      this.unseen = 0;
      const closeness = THREE.MathUtils.clamp(1.4 - dist / this.spec.sight, 0.15, 1.4);
      this.awareness = Math.min(1, this.awareness + dt * this.spec.gain * closeness);
      if (this.awareness >= 1) this.alerted = true;
    } else {
      this.unseen += dt;
      if (!this.alerted) this.awareness = Math.max(0, this.awareness - dt * 0.35);
      else if (this.unseen > this.spec.forget || !available) {
        this.alerted = false;
        this.awareness = 0.5;
      }
    }
  }

  private test(eye: THREE.Vector3, facing: number, ctx: AIContext): boolean {
    this.to.subVectors(ctx.playerEye, eye);
    const dist = this.to.length();
    if (dist > this.spec.sight) return false;
    if (dist > this.spec.hearing) {
      const fx = -Math.sin(facing);
      const fz = -Math.cos(facing);
      const flat = Math.hypot(this.to.x, this.to.z);
      if (flat > 1e-3) {
        const cos = (this.to.x * fx + this.to.z * fz) / flat;
        if (cos < Math.cos(this.spec.fov) && !this.alerted) return false;
      }
    }
    const steps = Math.min(48, Math.max(4, Math.ceil(dist / 1.2)));
    return ctx.colliders.sweepSphere(eye, ctx.playerEye, 0.08, steps, true) >= 1;
  }
}
