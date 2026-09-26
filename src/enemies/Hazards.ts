import * as THREE from 'three';
import type { Damageable } from '../combat/types';
import type { AIContext } from './AIContext';

/**
 * Boss-scale hazards (Job 8):
 * - **Shockwaves**: rings that race outward along the ground. They only hurt a player
 *   standing on the ground as the ring passes, so a well-timed jump clears them.
 * - **Burning zones**: lingering fire or moonlight that hurts while you stand in it.
 * Pooled visuals; damage goes through the combat world like every other blow.
 */
interface Wave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  center: THREE.Vector3;
  radius: number;
  speed: number;
  max: number;
  damage: number;
  hit: boolean;
  owner: Damageable | undefined;
  active: boolean;
}

interface Zone {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  center: THREE.Vector3;
  radius: number;
  life: number;
  duration: number;
  damage: number;
  tick: number;
  active: boolean;
}

export class Hazards {
  readonly group = new THREE.Group();
  readonly waves: Wave[] = [];
  readonly zones: Zone[] = [];
  /** Waves that caught the player (tests). */
  hitsTaken = 0;
  private readonly up = new THREE.Vector3(0, 1, 0);

  /** Hazards spawned so far (audio cues). */
  spawned = 0;

  constructor() {
    this.group.name = 'hazards';
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    const mat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const m = mat();
      const mesh = new THREE.Mesh(ringGeo, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.waves.push({ mesh, mat: m, center: new THREE.Vector3(), radius: 0, speed: 0, max: 0, damage: 0, hit: false, owner: undefined, active: false });
    }
    for (let i = 0; i < 16; i++) {
      const m = mat();
      const mesh = new THREE.Mesh(discGeo, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.zones.push({ mesh, mat: m, center: new THREE.Vector3(), radius: 0, life: 0, duration: 0, damage: 0, tick: 0, active: false });
    }
  }

  shockwave(center: THREE.Vector3, speed: number, max: number, damage: number, color: THREE.ColorRepresentation, owner?: Damageable): void {
    this.spawned++;
    const w = this.waves.find(x => !x.active);
    if (!w) return;
    Object.assign(w, { radius: 0.5, speed, max, damage, hit: false, owner, active: true });
    w.center.copy(center);
    w.mat.color.set(color);
    w.mesh.visible = true;
  }

  zone(center: THREE.Vector3, radius: number, duration: number, damage: number, color: THREE.ColorRepresentation): void {
    this.spawned++;
    const z = this.zones.find(x => !x.active);
    if (!z) return;
    Object.assign(z, { radius, life: duration, duration, damage, tick: 0, active: true });
    z.center.copy(center);
    z.mat.color.set(color);
    z.mesh.visible = true;
  }

  get activeWaves(): number {
    return this.waves.filter(w => w.active).length;
  }

  clear(): void {
    for (const w of this.waves) { w.active = false; w.mesh.visible = false; }
    for (const z of this.zones) { z.active = false; z.mesh.visible = false; }
  }

  fixedUpdate(dt: number, ctx: AIContext): void {
    const player = ctx.player;
    const p = player.controller.position;
    for (const w of this.waves) {
      if (!w.active) continue;
      const prev = w.radius;
      w.radius += w.speed * dt;
      const d = Math.hypot(p.x - w.center.x, p.z - w.center.z);
      // Caught if the front swept over the player while their feet were near the ground.
      const ground = ctx.colliders.heightAt(p.x, p.z);
      const airborne = !player.controller.grounded && p.y > ground + 0.55;
      if (!w.hit && d >= prev - 0.6 && d <= w.radius + 0.6 && !airborne && player.combat.alive) {
        w.hit = true;
        this.hitsTaken++;
        const dir = new THREE.Vector3(p.x - w.center.x, 0, p.z - w.center.z).normalize();
        ctx.combat.strike(player.combat, { damage: w.damage, direction: dir, point: p.clone().addScaledVector(this.up, 0.5), knockback: 7, stagger: 0.4, source: 'enemy', kind: 'hazard', attacker: w.owner });
      }
      const k = w.radius / w.max;
      w.mesh.position.set(w.center.x, w.center.y + 0.15, w.center.z);
      w.mesh.scale.set(w.radius, 1, w.radius);
      w.mat.opacity = Math.max(0, 1 - k) * 0.9;
      if (w.radius >= w.max) { w.active = false; w.mesh.visible = false; }
    }
    for (const z of this.zones) {
      if (!z.active) continue;
      z.life -= dt;
      z.tick -= dt;
      const d = Math.hypot(p.x - z.center.x, p.z - z.center.z);
      if (z.tick <= 0 && d < z.radius && Math.abs(p.y - z.center.y) < 3 && player.combat.alive) {
        z.tick = 0.5;
        ctx.combat.strike(player.combat, { damage: z.damage, direction: new THREE.Vector3(0, 0, 1), point: p.clone(), knockback: 0, stagger: 0, source: 'enemy', kind: 'hazard' });
      }
      z.mesh.position.set(z.center.x, z.center.y + 0.1, z.center.z);
      z.mesh.scale.setScalar(z.radius);
      z.mat.opacity = Math.min(1, z.life / 0.4) * (0.35 + 0.15 * Math.sin(z.life * 20));
      if (z.life <= 0) { z.active = false; z.mesh.visible = false; }
    }
  }
}
