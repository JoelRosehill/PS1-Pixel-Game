import * as THREE from 'three';
import type { Damageable, Team } from '../combat/types';
import { glow } from '../render/Materials';
import type { AIContext } from './AIContext';

/**
 * Hostile projectiles (the Sunkeeper's orbs). They curve gently toward the player,
 * stop against stone and trees, pass through a perfect dodge, and a parry sends them
 * back at whoever threw them — an answer to ranged casters that rewards the same
 * timing the knights teach.
 */
/** Visual/damage flavour of a hostile orb. */
export type OrbKind = 'sun' | 'fire' | 'moon';

interface Orb {
  mesh: THREE.Mesh;
  kind: OrbKind;
  velocity: THREE.Vector3;
  life: number;
  team: Team;
  damage: number;
  homing: number;
  owner: Damageable | null;
  /** A dodged orb must not re-hit the same body on its way through. */
  ignore: Damageable | null;
  active: boolean;
}

const ORBS = 24;
const UP = new THREE.Vector3(0, 1, 0);

export class EnemyProjectiles {
  readonly group = new THREE.Group();
  readonly orbs: Orb[] = [];
  reflections = 0;
  private readonly materials: Record<OrbKind, THREE.MeshBasicMaterial>;
  /** Fired when a reflected orb strikes its caster (bosses react to this). */
  onReflectHit: ((target: Damageable) => void) | null = null;
  private readonly found: Damageable[] = [];
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly want = new THREE.Vector3();

  /** Orbs fired so far (audio cues). */
  fired = 0;

  constructor() {
    this.group.name = 'enemy-projectiles';
    const geo = new THREE.IcosahedronGeometry(0.28, 0);
    this.materials = { sun: glow(0xffd36a, 2.4), fire: glow(0xff5a2a, 2.8), moon: glow(0xc8e8ff, 2.6) };
    for (let i = 0; i < ORBS; i++) {
      const mesh = new THREE.Mesh(geo, this.materials.sun);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.orbs.push({ mesh, kind: 'sun', velocity: new THREE.Vector3(), life: 0, team: 'enemy', damage: 0, homing: 0, owner: null, ignore: null, active: false });
    }
  }

  get activeCount(): number {
    return this.orbs.filter(o => o.active).length;
  }

  fire(origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, owner: Damageable, homing = 1.1, kind: OrbKind = 'sun', size = 1): boolean {
    const orb = this.orbs.find(o => !o.active);
    if (!orb) return false;
    orb.kind = kind;
    orb.mesh.material = this.materials[kind];
    orb.active = true;
    orb.mesh.visible = true;
    orb.mesh.position.copy(origin);
    orb.velocity.copy(direction).normalize().multiplyScalar(speed);
    orb.life = 4;
    orb.team = 'enemy';
    orb.damage = damage;
    orb.homing = homing;
    orb.owner = owner;
    orb.ignore = null;
    orb.mesh.scale.setScalar(size);
    this.fired++;
    return true;
  }

  clear(): void {
    for (const o of this.orbs) { o.active = false; o.mesh.visible = false; }
  }

  fixedUpdate(dt: number, ctx: AIContext): void {
    for (const orb of this.orbs) {
      if (!orb.active) continue;
      orb.life -= dt;
      // Home toward the target's chest without ever turning sharply.
      const target = orb.team === 'enemy' ? ctx.playerEye : orb.owner?.alive ? this.want.copy(orb.owner.position).addScaledVector(UP, orb.owner.bodyHeight * 0.6) : null;
      if (target && orb.homing > 0) {
        const speed = orb.velocity.length();
        this.want.subVectors(target, orb.mesh.position).normalize().multiplyScalar(speed);
        orb.velocity.lerp(this.want, Math.min(1, orb.homing * dt)).setLength(speed);
      }
      this.from.copy(orb.mesh.position);
      this.to.copy(this.from).addScaledVector(orb.velocity, dt);
      const fraction = ctx.colliders.sweepSphere(this.from, this.to, 0.2, 4, true);
      this.to.lerpVectors(this.from, this.to, fraction);
      ctx.combat.sweep(this.from, this.to, 0.32 * orb.mesh.scale.x, orb.team, this.found);
      orb.mesh.position.copy(this.to);
      orb.mesh.rotation.x += dt * 9;
      orb.mesh.rotation.y += dt * 7;
      const victim = this.found.find(t => t !== orb.ignore);
      if (victim) {
        const direction = orb.velocity.clone().setY(0).normalize();
        const result = ctx.combat.strike(victim, {
          damage: orb.damage, direction, point: this.to.clone(), knockback: 4, stagger: 0.3,
          source: orb.team, kind: orb.team === 'player' ? 'reflect' : 'enemy', attacker: orb.owner ?? undefined,
        });
        if (result.parried) {
          // Sent back: faster, stronger, aimed at the caster.
          orb.team = 'player';
          orb.damage = orb.kind === 'fire' ? 60 : orb.kind === 'moon' ? 45 : 34;
          orb.homing = 4;
          orb.life = 3;
          orb.ignore = null;
          orb.velocity.negate().multiplyScalar(1.7);
          orb.mesh.scale.setScalar(1.4);
          this.reflections++;
          ctx.effects.ring(this.to, 0xffd070, 1.4, 0.3, true);
          continue;
        }
        if (result.dodged) { orb.ignore = victim; continue; }
        if (orb.team === 'player' && result.hit) this.onReflectHit?.(victim);
        this.burst(orb, ctx);
        continue;
      }
      if (fraction < 1 || orb.life <= 0) this.burst(orb, ctx);
    }
  }

  private burst(orb: Orb, ctx: AIContext): void {
    orb.active = false;
    orb.mesh.visible = false;
    ctx.effects.sparkBurst(orb.mesh.position, UP, orb.team === 'player' ? 0xffd070 : 0xffe9a0, 12, 5);
    ctx.effects.ring(orb.mesh.position, 0xffd36a, 1.1, 0.3);
  }
}
