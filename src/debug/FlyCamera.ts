import * as THREE from 'three';
import type { Input } from '../core/Input';

/**
 * Debug explorer camera for Job 1 (the real third-person camera arrives in Job 2).
 * Walk mode hugs the terrain at roughly third-person camera height; fly mode is free.
 */
export class FlyCamera {
  walk = true;
  eyeHeight = 2.6;
  speed = 9;
  private yaw = 0;
  private pitch = 0;
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly heightAt: (x: number, z: number) => number,
  ) {}

  setPose(position: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.position.copy(position);
    const d = lookAt.clone().sub(position).normalize();
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.apply();
  }

  /** Where the camera is looking at ground level (drives the shadow frustum). */
  focusPoint(out: THREE.Vector3): THREE.Vector3 {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out.copy(this.position).addScaledVector(fwd, 22).setY(this.heightAt(out.x, out.z));
  }

  update(dt: number): void {
    const inp = this.input;
    if (inp.locked) {
      this.yaw -= inp.mouseDX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - inp.mouseDY * 0.0022, -1.45, 1.45);
    }
    if (inp.pressed('KeyG')) this.walk = !this.walk;
    if (inp.wheel) this.speed = THREE.MathUtils.clamp(this.speed * (inp.wheel > 0 ? 0.8 : 1.25), 2, 400);

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, inp.axis('KeyS', 'KeyW'))
      .addScaledVector(right, inp.axis('KeyA', 'KeyD'));
    if (!this.walk) wish.y += inp.axis('KeyC', 'Space');
    if (wish.lengthSq() > 0) wish.normalize();
    const boost = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight') ? 4 : 1;
    const target = wish.multiplyScalar(this.speed * boost);
    this.velocity.lerp(target, 1 - Math.exp(-dt * 10));
    this.position.addScaledVector(this.velocity, dt);

    const ground = Math.max(this.heightAt(this.position.x, this.position.z), 0);
    if (this.walk) this.position.y = THREE.MathUtils.lerp(this.position.y, ground + this.eyeHeight, 1 - Math.exp(-dt * 12));
    else this.position.y = Math.max(this.position.y, ground + 0.5);
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
