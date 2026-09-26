import * as THREE from 'three';
import type { Damageable, HitInfo, HitResult, Team } from './types';

/**
 * Registry of everything that can be hit, plus the swept-blade queries attacks use.
 * All damage flows through `strike` so one place drives VFX, HUD and Momentum.
 */
export class CombatWorld {
  readonly targets = new Set<Damageable>();
  /** Fired for every resolved blow (hit, dodge, parry or block). */
  onHit: ((target: Damageable, hit: HitInfo, result: HitResult) => void) | null = null;

  private readonly closest = new THREE.Vector3();
  private readonly seg = new THREE.Vector3();
  private readonly toPoint = new THREE.Vector3();

  register(t: Damageable): void {
    this.targets.add(t);
  }

  unregister(t: Damageable): void {
    this.targets.delete(t);
  }

  /** Applies a hit and notifies listeners. */
  strike(target: Damageable, hit: HitInfo): HitResult {
    const result = target.applyHit(hit);
    this.onHit?.(target, hit, result);
    return result;
  }

  /** Shortest distance between a segment and a target's capsule axis. */
  private distanceToBody(target: Damageable, a: THREE.Vector3, b: THREE.Vector3): number {
    // Capsule axis of the body
    const bottom = target.position.y + target.bodyRadius;
    const top = target.position.y + Math.max(target.bodyHeight - target.bodyRadius, target.bodyRadius);
    let best = Infinity;
    // Sample the body axis: cheap, and bodies are short.
    for (let i = 0; i <= 3; i++) {
      const y = bottom + ((top - bottom) * i) / 3;
      this.toPoint.set(target.position.x, y, target.position.z);
      this.seg.subVectors(b, a);
      const len2 = this.seg.lengthSq();
      const t = len2 > 1e-6 ? THREE.MathUtils.clamp(this.toPoint.clone().sub(a).dot(this.seg) / len2, 0, 1) : 0;
      this.closest.copy(a).addScaledVector(this.seg, t);
      best = Math.min(best, this.closest.distanceTo(this.toPoint));
    }
    return best;
  }

  /** Living enemies of `attacker` whose body is within `radius` of the blade segment. */
  sweep(a: THREE.Vector3, b: THREE.Vector3, radius: number, attacker: Team, out: Damageable[]): Damageable[] {
    out.length = 0;
    for (const t of this.targets) {
      if (!t.alive || t.team === attacker) continue;
      if (this.distanceToBody(t, a, b) <= radius + t.bodyRadius) out.push(t);
    }
    return out;
  }

  /** Living enemies of `attacker` within a sphere (radial bursts). */
  sphere(centre: THREE.Vector3, radius: number, attacker: Team, out: Damageable[]): Damageable[] {
    return this.sweep(centre, centre, radius, attacker, out);
  }

  /** Best melee target in front of `from` — used to snap attacks toward enemies. */
  aimAssist(from: THREE.Vector3, facing: number, range: number, maxAngle: number, team: Team): Damageable | null {
    let best: Damageable | null = null;
    let bestScore = Infinity;
    const fx = -Math.sin(facing);
    const fz = -Math.cos(facing);
    for (const t of this.targets) {
      if (!t.alive || t.team === team) continue;
      const dx = t.position.x - from.x;
      const dz = t.position.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + t.bodyRadius || dist < 1e-3) continue;
      const cos = (dx * fx + dz * fz) / dist;
      const angle = Math.acos(THREE.MathUtils.clamp(cos, -1, 1));
      if (angle > maxAngle) continue;
      const score = dist + angle * 3;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }
}
