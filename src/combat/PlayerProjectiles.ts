import * as THREE from 'three';
import type { ColliderWorld } from '../physics/Colliders';
import type { Effects } from '../render/effects/Effects';
import type { SpellFx } from '../render/effects/SpellFx';
import { glow } from '../render/Materials';
import type { CombatWorld } from './CombatWorld';
import type { Damageable, HitKind, HitResult } from './types';

/**
 * Everything the player throws (Job 13): sword crescents, Starbolts, lances, meteors,
 * wisps, void orbs. One pooled system so the ranged arsenal shares hit detection,
 * piercing, homing, splash, wall collision and hit feedback.
 */

export type ShotVisual = 'crescent' | 'bolt' | 'lance' | 'orb' | 'wisp' | 'meteor' | 'shard' | 'void';

export interface ShotSpec {
  kind: HitKind;
  damage: number;
  stagger: number;
  knockback: number;
  speed: number;
  /** Hit radius around the flight path (crescents also sweep their width). */
  radius: number;
  life: number;
  color: number;
  visual: ShotVisual;
  /** Visual scale (crescent width in metres). */
  scale?: number;
  /** Growth of the scale per second (waves widen as they fly). */
  grow?: number;
  /** Targets it passes through before stopping (0 = stops at the first). */
  pierce?: number;
  /** Turn rate toward `target` in rad/s. */
  homing?: number;
  target?: Damageable | null;
  /** m/s² downward (meteors). */
  gravity?: number;
  /** Explodes on impact: radius and damage of the blast. */
  splash?: number;
  splashDamage?: number;
  /** Frost slow applied on hit (seconds). */
  slow?: number;
  /** Roll of a crescent around its flight axis (0 = horizontal, π/2 = vertical). */
  roll?: number;
  /** Walls stop it (default true). */
  solid?: boolean;
  /** Called on impact (target or ground/wall) with the impact point. */
  onImpact?: (point: THREE.Vector3) => void;
  /** Delay before it starts moving (meteors, phantom blades hovering). */
  delay?: number;
}

interface Shot {
  spec: ShotSpec;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  scale: number;
  hits: Set<Damageable>;
  delay: number;
  visual: ShotVisual;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

function crescentGeometry(): THREE.BufferGeometry {
  // A flat crescent in the XZ plane, convex side toward -Z (the flight direction),
  // 1 m wide, thickest in the middle.
  const segs = 16;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = (t - 0.5) * Math.PI * 0.8;
    const thick = Math.sin(t * Math.PI) * 0.24 + 0.015;
    const r = 0.62;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r + 0.45;
    const xi = Math.sin(a) * (r - thick), zi = -Math.cos(a) * (r - thick) + 0.45 + thick * 0.4;
    pos.push(x, 0, z, xi, 0, zi);
    if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class PlayerProjectiles {
  readonly group = new THREE.Group();
  readonly shots: Shot[] = [];
  /** Total hits landed (tests, audio). */
  hits = 0;
  fired = 0;
  onHit: (target: Damageable, result: HitResult, kind: HitKind) => void = () => {};
  private readonly geos: Record<ShotVisual, THREE.BufferGeometry>;
  private readonly materials = new Map<string, THREE.Material>();
  private readonly found: Damageable[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(
    private readonly world: CombatWorld,
    private readonly colliders: ColliderWorld,
    private readonly effects: Effects,
    private readonly fx: SpellFx,
  ) {
    this.group.name = 'player-projectiles';
    this.geos = {
      crescent: crescentGeometry(),
      bolt: new THREE.OctahedronGeometry(0.2).scale(0.9, 0.9, 2.4),
      lance: new THREE.BoxGeometry(0.1, 0.1, 2.4),
      orb: new THREE.IcosahedronGeometry(0.35, 0),
      wisp: new THREE.OctahedronGeometry(0.2),
      meteor: new THREE.IcosahedronGeometry(0.7, 0),
      shard: new THREE.ConeGeometry(0.16, 0.9, 4).rotateX(-Math.PI / 2),
      void: new THREE.IcosahedronGeometry(0.55, 1),
    };
  }

  private material(color: number, visual: ShotVisual): THREE.Material {
    const key = `${color}:${visual}`;
    let m = this.materials.get(key);
    if (!m) {
      if (visual === 'void') m = new THREE.MeshBasicMaterial({ color: 0x07020c });
      else {
        const g = glow(color, visual === 'crescent' ? 2.4 : 2);
        g.side = THREE.DoubleSide;
        m = g;
      }
      this.materials.set(key, m);
    }
    return m;
  }

  spawn(origin: THREE.Vector3, direction: THREE.Vector3, spec: ShotSpec): Shot {
    const mesh = new THREE.Mesh(this.geos[spec.visual], this.material(spec.color, spec.visual));
    mesh.frustumCulled = false;
    if (spec.visual === 'void') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 4, 20), this.material(spec.color, 'orb'));
      mesh.add(halo);
    }
    const dir = direction.clone().normalize();
    const shot: Shot = {
      spec, mesh, pos: origin.clone(), dir, vel: dir.clone().multiplyScalar(spec.speed), life: spec.life,
      scale: spec.scale ?? 1, hits: new Set(), delay: spec.delay ?? 0, visual: spec.visual,
    };
    this.orient(shot);
    this.group.add(mesh);
    this.shots.push(shot);
    this.fired++;
    return shot;
  }

  private orient(s: Shot): void {
    s.mesh.position.copy(s.pos);
    const d = s.vel.lengthSq() > 1e-6 ? this.a.copy(s.vel).normalize() : s.dir;
    s.mesh.quaternion.setFromUnitVectors(FORWARD, d);
    // Flat crescents tilt a little so they read from behind (a level blade is edge-on).
    const roll = s.spec.roll ?? (s.visual === 'crescent' ? 0.32 : 0);
    if (roll) s.mesh.rotateZ(roll);
    s.mesh.scale.setScalar(s.scale);
  }

  clear(): void {
    for (const s of this.shots) s.mesh.removeFromParent();
    this.shots.length = 0;
  }

  fixedUpdate(dt: number, elapsed: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const spec = s.spec;
      if (s.delay > 0) {
        s.delay -= dt;
        s.mesh.rotation.z += dt * 6;
        continue;
      }
      s.life -= dt;
      // Homing: turn the velocity toward the target's chest.
      if (spec.homing && spec.target?.alive) {
        const want = this.b.copy(spec.target.position).addScaledVector(UP, spec.target.bodyHeight * 0.6).sub(s.pos).normalize();
        const cur = this.c.copy(s.vel).normalize();
        const angle = cur.angleTo(want);
        if (angle > 1e-4) cur.lerp(want, Math.min(1, spec.homing * dt / angle)).normalize();
        s.vel.copy(cur).multiplyScalar(spec.speed);
      }
      if (spec.gravity) s.vel.y -= spec.gravity * dt;
      const from = this.a.copy(s.pos);
      const to = this.b.copy(s.pos).addScaledVector(s.vel, dt);
      let stop = false;
      let impact: THREE.Vector3 | null = null;
      // Walls and the ground.
      if (spec.solid !== false) {
        const f = this.colliders.sweepSphere(from, to, Math.min(0.2, spec.radius), 6, true);
        if (f < 1) { to.lerpVectors(from, to, f); stop = true; impact = to.clone(); }
      }
      const ground = this.colliders.heightAt(to.x, to.z);
      if (to.y < ground + 0.05) { to.y = ground + 0.05; stop = true; impact = to.clone(); }
      // Targets: a crescent sweeps three parallel lines across its width.
      const lanes = s.visual === 'crescent' ? [-0.42, 0, 0.42] : [0];
      this.side.set(-s.vel.z, 0, s.vel.x).normalize();
      if (spec.roll) this.side.applyAxisAngle(this.c.copy(s.vel).normalize(), spec.roll);
      const radius = s.visual === 'crescent' ? spec.radius * s.scale * 0.5 : spec.radius;
      for (const lane of lanes) {
        const off = lane * s.scale;
        const la = this.c.copy(from).addScaledVector(this.side, off);
        const lb = to.clone().addScaledVector(this.side, off);
        this.world.sweep(la, lb, radius, 'player', this.found);
        for (const t of this.found) {
          if (s.hits.has(t)) continue;
          s.hits.add(t);
          this.strike(t, s, s.pos);
          if (s.hits.size > (spec.pierce ?? 0)) { stop = true; impact = impact ?? t.position.clone().addScaledVector(UP, t.bodyHeight * 0.55); }
        }
        if (stop && s.hits.size > (spec.pierce ?? 0)) break;
      }
      s.pos.copy(to);
      s.scale += (spec.grow ?? 0) * dt;
      this.orient(s);
      if (s.visual === 'wisp' || s.visual === 'orb') s.mesh.rotation.z = elapsed * 5;
      // Glittering wake for fast shots.
      if ((s.visual === 'bolt' || s.visual === 'meteor' || s.visual === 'lance' || s.visual === 'crescent') && Math.random() < 0.5) {
        this.effects.sparkBurst(s.pos, this.c.copy(s.vel).normalize().negate(), spec.color, 1, 1.5);
      }
      if (stop || s.life <= 0) {
        const at = impact ?? s.pos;
        if (spec.splash) this.blast(at, spec, s);
        else if (stop) this.effects.sparkBurst(at, UP, spec.color, 8, 4);
        spec.onImpact?.(at);
        s.mesh.removeFromParent();
        this.shots.splice(i, 1);
      }
    }
  }

  private blast(at: THREE.Vector3, spec: ShotSpec, s: Shot): void {
    const r = spec.splash!;
    this.fx.flash(at, spec.color, r, 0.4);
    this.effects.ring(at, spec.color, r * 1.2, 0.45);
    this.effects.sparkBurst(at, UP, spec.color, 16, 8);
    for (const t of this.world.sphere(at, r, 'player', [])) {
      if (s.hits.has(t) && !spec.splashDamage) continue;
      this.strike(t, s, at, spec.splashDamage ?? spec.damage);
    }
  }

  /** Deals a shot's damage with standard hit feedback. */
  strike(target: Damageable, s: Shot | { spec: ShotSpec }, from: THREE.Vector3, damage = s.spec.damage): HitResult {
    const spec = s.spec;
    const point = target.position.clone().addScaledVector(UP, target.bodyHeight * 0.55);
    const direction = point.clone().sub(from).setY(0);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, -1);
    direction.normalize();
    const result = this.world.strike(target, {
      damage, direction, point, knockback: spec.knockback, stagger: spec.stagger, source: 'player', kind: spec.kind, slow: spec.slow,
    });
    if (result.hit) {
      this.hits++;
      this.effects.sparkBurst(point, direction, spec.color, 8, 5);
      this.effects.number(point.clone().addScaledVector(UP, 0.35), String(Math.round(result.damage ?? damage)), spec.color, spec.kind === 'bolt' ? 0.8 : 1.1);
      this.onHit(target, result, spec.kind);
    }
    return result;
  }
}
