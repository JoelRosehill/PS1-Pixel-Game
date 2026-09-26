import * as THREE from 'three';
import type { Damageable, HitInfo, HitKind, HitResult } from '../combat/types';
import type { Contact, DynamicBody } from '../physics/Colliders';
import { dissolvable, glow, toon } from '../render/Materials';
import { merge } from '../world/geometry';
import type { AIContext } from './AIContext';
import type { AttackTokens } from './AttackTokens';
import { Perception, type PerceptionSpec } from './Perception';

export type EnemyKind = 'knight' | 'wizard' | 'boss';

/** What a subclass decides about an incoming blow before health changes. */
export interface Received {
  damage: number;
  stagger: number;
  blocked?: boolean;
  critical?: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = 30;

/**
 * Shared enemy body and lifecycle (Job 5). Subclasses supply a model, a `think` state
 * machine and `receive` rules; this class owns movement physics, hits, stagger,
 * knockback, leashing, the floating health bar, spawn rise and the death dissolve.
 *
 * Everything runs on the fixed 60 Hz clock, so menus pause enemies and hit-stop
 * freezes them with the rest of the world.
 */
export abstract class Enemy implements Damageable {
  readonly team = 'enemy' as const;
  abstract readonly kind: EnemyKind;
  abstract readonly displayName: string;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  readonly group = new THREE.Group();
  /** Rotated to `facing`; subclasses build their model inside it. */
  readonly visual = new THREE.Group();
  readonly collider: DynamicBody;
  readonly perception: Perception;
  readonly dissolve = { value: 0 };

  alive = true;
  health: number;
  readonly maxHealth: number;
  facing = 0;
  state = 'idle';
  stateTime = 0;
  staggerTimer = 0;
  grounded = false;
  /** Enemies return home and heal when dragged further than this. */
  leash = 32;
  /** Set when fully dissolved; the director then removes it. */
  removed = false;
  /** Encounter this enemy belongs to (for group alerts). */
  encounterId = '';
  lastHitBy: HitKind | null = null;
  /** Seconds since the player last damaged this enemy. */
  sinceHit = 99;
  /** Shared attack-token pool, assigned by the director. */
  tokens: AttackTokens | null = null;

  protected readonly moveWish = new THREE.Vector3();
  protected moveSpeed = 0;
  protected accel = 14;
  protected mass = 1;
  protected staggerResist = 1;
  protected spawnTimer = 0;
  protected spawnDuration = 1.2;
  protected deathTime = 0;
  private pendingAlert = false;
  private justDied = false;
  private hitFlash = 0;
  private barTimer = 0;
  private readonly flashMaterials: THREE.MeshToonMaterial[] = [];
  protected readonly bar = new THREE.Group();
  /** Bosses show their health on the big HUD bar instead. */
  protected showBar = true;
  private readonly barFill: THREE.Mesh;
  private readonly contacts: Contact[] = [];
  private readonly sphere = new THREE.Vector3();
  private readonly before = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  protected readonly tmp = new THREE.Vector3();
  protected readonly tmp2 = new THREE.Vector3();

  constructor(
    readonly bodyRadius: number,
    readonly bodyHeight: number,
    maxHealth: number,
    perception: PerceptionSpec,
  ) {
    this.maxHealth = this.health = maxHealth;
    this.perception = new Perception(perception);
    this.collider = { position: this.position, radius: bodyRadius, height: bodyHeight, active: true };
    this.group.add(this.visual);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.14), new THREE.MeshBasicMaterial({ color: 0x18121f, depthWrite: false }));
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.08), new THREE.MeshBasicMaterial({ color: 0xff4a6a, depthWrite: false }));
    this.barFill.position.z = 0.005;
    this.bar.add(back, this.barFill);
    this.bar.position.y = bodyHeight + 0.45;
    this.bar.visible = false;
    this.bar.renderOrder = 5;
    this.group.add(this.bar);
  }

  // --- model helpers -------------------------------------------------------

  /** Toon material that flashes on hit and dissolves on death. */
  protected skin(color: number, params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
    const m = dissolvable(toon({ color, ...params }), this.dissolve);
    this.flashMaterials.push(m);
    return m;
  }

  /** Glowing material that dissolves on death. */
  protected light(color: number, intensity = 2): THREE.MeshBasicMaterial {
    return dissolvable(glow(color, intensity), this.dissolve);
  }

  protected mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }

  /**
   * Merges the direct, childless mesh children of `parent` into one mesh per material.
   * Enemies are drawn once per depth band, so this matters more than it looks.
   */
  protected mergeStatic(parent: THREE.Object3D): void {
    const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
    for (const child of [...parent.children]) {
      if (!(child instanceof THREE.Mesh) || child.children.length || Array.isArray(child.material)) continue;
      child.updateMatrix();
      const entry = buckets.get(child.material) ?? { geos: [], shadow: child.castShadow };
      entry.geos.push(child.geometry.clone().applyMatrix4(child.matrix));
      buckets.set(child.material, entry);
      parent.remove(child);
      child.geometry.dispose();
    }
    for (const [material, { geos, shadow }] of buckets) this.mesh(parent, merge(geos), material, shadow);
  }

  // --- geometry queries ----------------------------------------------------

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.position).addScaledVector(UP, this.bodyHeight * 0.85);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
  }

  distanceToPlayer(ctx: AIContext): number {
    const p = ctx.player.controller.position;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  /** Signed yaw from the current facing to the player (radians). */
  angleToPlayer(ctx: AIContext): number {
    const p = ctx.player.controller.position;
    const want = Math.atan2(-(p.x - this.position.x), -(p.z - this.position.z));
    return wrap(want - this.facing);
  }

  turnToward(x: number, z: number, rate: number, dt: number): void {
    const want = Math.atan2(-(x - this.position.x), -(z - this.position.z));
    const delta = wrap(want - this.facing);
    this.facing = wrap(this.facing + THREE.MathUtils.clamp(delta, -rate * dt, rate * dt));
  }

  /** Desired horizontal velocity for this step (direction need not be normalised). */
  protected move(dirX: number, dirZ: number, speed: number): void {
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-5 || speed <= 0) { this.moveWish.set(0, 0, 0); this.moveSpeed = 0; return; }
    this.moveWish.set(dirX / len, 0, dirZ / len);
    this.moveSpeed = speed;
  }

  protected stop(): void {
    this.move(0, 0, 0);
  }

  protected setState(state: string): void {
    this.state = state;
    this.stateTime = 0;
  }

  // --- lifecycle -----------------------------------------------------------

  /** Places the enemy and plays the rise-from-the-ground spawn. */
  spawn(x: number, y: number, z: number, facing: number, rise = true): void {
    this.position.set(x, y, z);
    this.home.copy(this.position);
    this.facing = facing;
    this.spawnTimer = rise ? this.spawnDuration : 0;
    this.group.position.copy(this.position);
    this.visual.rotation.y = facing + Math.PI;
    this.visual.position.y = rise ? -this.bodyHeight : 0;
  }

  get spawning(): boolean {
    return this.spawnTimer > 0;
  }

  /** Consumed by the director to play death effects once. */
  takeDeath(): boolean {
    const d = this.justDied;
    this.justDied = false;
    return d;
  }

  applyHit(hit: HitInfo): HitResult {
    if (!this.alive || this.spawnTimer > 0) return { hit: false };
    const r = this.receive(hit);
    this.lastHitBy = hit.kind;
    if (hit.source === 'player') { this.pendingAlert = true; this.sinceHit = 0; }
    if (r.damage <= 0 && !hit.parry) return { hit: true, damage: 0, blocked: r.blocked };
    this.health -= r.damage;
    this.hitFlash = r.damage > 0 ? 1 : this.hitFlash;
    this.barTimer = 5;
    const push = hit.knockback * (r.blocked ? 0.25 : 0.55) / this.mass;
    this.velocity.addScaledVector(hit.direction, push);
    if (r.stagger > 0) this.stagger(r.stagger * this.staggerResist);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.justDied = true;
      this.collider.active = false;
      this.deathTime = 0;
      this.onDeath();
      return { hit: true, damage: r.damage, killed: true, blocked: r.blocked, critical: r.critical };
    }
    return { hit: true, damage: r.damage, blocked: r.blocked, critical: r.critical };
  }

  stagger(seconds: number): void {
    if (!this.alive) return;
    this.staggerTimer = Math.max(this.staggerTimer, seconds);
    this.onStagger();
    this.setState('staggered');
  }

  /** Called by the director on every fixed step. */
  update(dt: number, ctx: AIContext): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.barTimer = Math.max(0, this.barTimer - dt);
    this.sinceHit += dt;
    for (const m of this.flashMaterials) m.emissive.setScalar(this.hitFlash * 0.9);

    if (!this.alive) {
      this.deathTime += dt;
      this.dissolve.value = Math.min(1, this.deathTime / 1.5);
      this.visual.position.y = -this.deathTime * 0.25;
      this.visual.rotation.z = Math.min(0.5, this.deathTime * 0.6);
      this.bar.visible = false;
      if (this.deathTime > 1.7) this.removed = true;
      this.group.position.copy(this.position);
      return;
    }

    if (this.spawnTimer > 0) {
      this.spawnTimer = Math.max(0, this.spawnTimer - dt);
      const k = 1 - this.spawnTimer / this.spawnDuration;
      this.visual.position.y = -(1 - k * k * (3 - 2 * k)) * this.bodyHeight;
      if (this.spawnTimer <= 0) this.visual.position.y = 0;
      this.group.position.copy(this.position);
      return;
    }

    this.eye(this.tmp);
    this.perception.update(dt, this.tmp, this.facing, ctx);
    if (this.pendingAlert) {
      this.pendingAlert = false;
      this.perception.alert(ctx.player.controller.position);
    }

    this.stateTime += dt;
    if (this.state === 'staggered') {
      this.staggerTimer -= dt;
      this.stop();
      if (this.staggerTimer <= 0) this.recoverFromStagger();
    } else {
      this.think(dt, ctx);
    }
    this.physics(dt, ctx);
    this.animate(dt, ctx);

    this.visual.rotation.y = this.facing + Math.PI;
    this.group.position.copy(this.position);
    const damaged = this.health < this.maxHealth;
    this.bar.visible = this.showBar && damaged && (this.barTimer > 0 || this.perception.alerted);
    if (this.bar.visible) {
      const f = this.health / this.maxHealth;
      this.barFill.scale.x = Math.max(0.001, f);
      this.barFill.position.x = -(1 - f) * 0.62;
    }
  }

  /** Billboards the health bar toward the camera. */
  faceCamera(quat: THREE.Quaternion): void {
    if (this.bar.visible) this.bar.quaternion.copy(quat);
  }

  /** Back to the spawn point with full health (the player escaped the leash). */
  resetHome(): void {
    this.position.copy(this.home);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.staggerTimer = 0;
    this.perception.reset();
    this.cancelAction();
    this.setState('idle');
  }

  // --- physics -------------------------------------------------------------

  protected physics(dt: number, ctx: AIContext): void {
    const col = ctx.colliders;
    // Steer horizontal velocity toward the wish; knockback decays through the same blend.
    const k = 1 - Math.exp(-this.accel * dt);
    this.velocity.x += (this.moveWish.x * this.moveSpeed - this.velocity.x) * k;
    this.velocity.z += (this.moveWish.z * this.moveSpeed - this.velocity.z) * k;
    this.velocity.y -= GRAVITY * dt;

    this.prev.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);
    this.contacts.length = 0;
    const r = this.bodyRadius;
    for (let pass = 0; pass < 2; pass++) {
      for (const y of [r, Math.max(r, this.bodyHeight - r)]) {
        this.sphere.set(this.position.x, this.position.y + y, this.position.z);
        this.before.copy(this.sphere);
        col.resolveSphere(this.sphere, r, this.contacts, this.collider);
        this.position.add(this.sphere.sub(this.before));
      }
    }
    let supported = false;
    for (const c of this.contacts) {
      if (c.normal.y > 0.6) supported = true;
      const into = this.velocity.dot(c.normal);
      if (into < 0) this.velocity.addScaledVector(c.normal, -into);
    }
    const ground = col.heightAt(this.position.x, this.position.z);
    this.grounded = supported;
    if (this.position.y <= ground + 0.02) {
      this.position.y = ground;
      this.grounded = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    // Knights do not wade into the canal or the lake: water is treated as a wall.
    if (!supported && ground < 0.15 && this.position.y < 0.3) {
      this.position.x = this.prev.x;
      this.position.z = this.prev.z;
      this.position.y = Math.max(this.prev.y, col.heightAt(this.prev.x, this.prev.z));
      this.velocity.x = this.velocity.z = 0;
    }
    if (this.position.y < -30) this.resetHome();
  }

  // --- subclass hooks ------------------------------------------------------

  protected abstract think(dt: number, ctx: AIContext): void;
  protected abstract animate(dt: number, ctx: AIContext): void;
  /** Guard, weak points and armour: turns a raw hit into damage and stagger. */
  protected receive(hit: HitInfo): Received {
    return { damage: hit.damage, stagger: hit.stagger };
  }
  /** Interrupts the current action; the base releases the attack token. */
  protected onStagger(): void {
    this.cancelAction();
  }
  protected onDeath(): void {
    this.cancelAction();
  }
  protected recoverFromStagger(): void {
    this.setState('recover');
  }
  /** Abandons any attack in progress and gives its token back. */
  cancelAction(): void {
    this.tokens?.release(this);
  }
}

export function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
