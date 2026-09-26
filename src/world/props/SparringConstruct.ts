import * as THREE from 'three';
import type { CombatWorld } from '../../combat/CombatWorld';
import type { Damageable, HitInfo, HitResult } from '../../combat/types';
import type { Effects } from '../../render/effects/Effects';
import type { DynamicBody } from '../../physics/Colliders';
import { glow, toon } from '../../render/Materials';
import { box, cylinder, place } from '../geometry';

/**
 * Stone sparring construct: the Job 3 training partner and a first sketch of the
 * Shadow Knights (Job 5). It holds its ground, telegraphs a heavy overhead with
 * brightening seams, and can be parried, dodged, staggered and killed.
 */

type ConstructState = 'idle' | 'telegraph' | 'swing' | 'recover' | 'staggered' | 'dead';

export interface ConstructOptions {
  /** Passive constructs never swing — pure combo practice. */
  aggressive?: boolean;
  health?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export class SparringConstruct implements Damageable {
  readonly team = 'enemy' as const;
  readonly bodyRadius = 0.62;
  readonly bodyHeight = 2.3;
  readonly position = new THREE.Vector3();
  readonly group = new THREE.Group();
  /** Moving collision body; the level registers it with its ColliderWorld. */
  readonly collider: DynamicBody = { position: this.position, radius: 0.7, height: 2.3, active: true };

  alive = true;
  health: number;
  readonly maxHealth: number;
  state: ConstructState = 'idle';

  private readonly aggressive: boolean;
  private facing = 0;
  private timer = 0;
  private cooldown = 1.5;
  private flash = 0;
  private deathTimer = 0;
  private barTimer = 0;
  private readonly arm = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly seams: THREE.MeshBasicMaterial;
  private readonly stone: THREE.MeshToonMaterial;
  private readonly barFill: THREE.Mesh;
  private readonly bar = new THREE.Group();
  private readonly hitFrom = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor(x: number, y: number, z: number, opts: ConstructOptions = {}) {
    this.aggressive = opts.aggressive ?? true;
    this.maxHealth = opts.health ?? (this.aggressive ? 140 : 200);
    this.health = this.maxHealth;
    this.position.set(x, y, z);

    this.stone = toon({ color: 0x2f2a3c });
    const trim = toon({ color: 0x4a4358 });
    this.seams = glow(this.aggressive ? 0xff3048 : 0x6ad8ff, 2.2);

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    };

    // Legs and plinth
    add(this.body, place(cylinder(0.75, 0.9, 0.3, 10, 2), 0, 0.15, 0), trim);
    for (const s of [-1, 1]) add(this.body, place(box(0.3, 0.75, 0.32, 1), s * 0.26, 0.62, 0), this.stone);
    // Torso, seams and head
    add(this.body, place(box(0.92, 0.85, 0.55, 1), 0, 1.42, 0), this.stone);
    add(this.body, place(box(0.55, 0.09, 0.08, 1), 0, 1.6, 0.29), this.seams);
    add(this.body, place(box(0.09, 0.45, 0.08, 1), 0, 1.35, 0.29), this.seams);
    add(this.body, place(box(0.5, 0.42, 0.45, 1), 0, 2.03, 0), this.stone);
    add(this.body, place(box(0.34, 0.1, 0.06, 1), 0, 2.06, 0.24), this.seams);
    for (const s of [-1, 1]) add(this.body, place(box(0.22, 0.3, 0.3, 1), s * 0.6, 1.72, 0), trim);
    // Left arm hangs; right arm swings the maul
    add(this.body, place(box(0.26, 0.8, 0.26, 1), -0.62, 1.2, 0), this.stone);
    this.arm.position.set(0.62, 1.7, 0);
    add(this.arm, place(box(0.26, 0.75, 0.26, 1), 0, -0.36, 0), this.stone);
    add(this.arm, place(box(0.5, 0.42, 0.5, 1), 0, -0.82, 0.05), trim);
    add(this.arm, place(box(0.12, 0.12, 0.5, 1), 0, -0.82, 0.38), this.seams);
    this.body.add(this.arm);
    this.group.add(this.body);

    // Floating health bar (billboarded in update)
    const barBg = new THREE.Mesh(box(1.3, 0.14, 0.02, 1), new THREE.MeshBasicMaterial({ color: 0x18121f }));
    this.barFill = new THREE.Mesh(box(1.24, 0.09, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0xff4a6a }));
    this.barFill.position.z = 0.01;
    this.bar.add(barBg, this.barFill);
    this.bar.position.set(0, 2.75, 0);
    this.bar.visible = false;
    this.group.add(this.bar);

    this.group.position.copy(this.position);
    this.group.name = 'sparring-construct';
  }

  applyHit(hit: HitInfo): HitResult {
    if (!this.alive) return { hit: false };
    this.health -= hit.damage;
    this.flash = 1;
    this.barTimer = 4;
    this.hitFrom.copy(hit.direction);
    if (hit.stagger > 0 && this.state !== 'dead') {
      this.state = 'staggered';
      this.timer = hit.stagger;
    }
    // Shoved back a little, then it plants itself again.
    this.position.addScaledVector(hit.direction, Math.min(hit.knockback, 12) * 0.045);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.state = 'dead';
      this.deathTimer = 8;
      this.collider.active = false;
      this.timer = 0;
      return { hit: true, damage: hit.damage, killed: true };
    }
    return { hit: true, damage: hit.damage };
  }

  update(dt: number, playerPos: THREE.Vector3, world: CombatWorld, effects: Effects): void {
    this.flash = Math.max(0, this.flash - dt * 4);
    this.barTimer = Math.max(0, this.barTimer - dt);
    this.stone.color.setHex(0x2f2a3c).lerp(new THREE.Color(0xffffff), this.flash * 0.8);

    if (!this.alive) {
      this.deathTimer -= dt;
      // Collapse, then rebuild after a while so training never runs out.
      const fall = Math.min(1, (8 - this.deathTimer) * 1.6);
      this.body.rotation.z = fall * 1.55;
      this.body.position.y = -fall * 0.25;
      this.bar.visible = false;
      if (this.deathTimer <= 0) {
        this.alive = true;
        this.collider.active = true;
        this.health = this.maxHealth;
        this.state = 'idle';
        this.body.rotation.z = 0;
        this.body.position.y = 0;
        effects.ring(this.a.copy(this.position).addScaledVector(UP, 0.2), 0x6ad8ff, 2.2, 0.5);
      }
      this.group.position.copy(this.position);
      return;
    }

    // Always turn to face the player — it is a sparring partner, not a hunter.
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);
    let delta = want - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += delta * Math.min(1, dt * (this.state === 'idle' ? 4 : 1.2));

    this.timer -= dt;
    this.cooldown -= dt;
    let armX = -0.15;

    switch (this.state) {
      case 'idle':
        if (this.aggressive && dist < 3.6 && this.cooldown <= 0) {
          this.state = 'telegraph';
          this.timer = 0.75;
        }
        break;
      case 'telegraph': {
        // Seams brighten and the maul rises — the tell the player parries on.
        const k = 1 - Math.max(0, this.timer) / 0.75;
        armX = -0.15 - k * 2.6;
        this.seams.color.setHex(0xff3048).multiplyScalar(2.2 + k * 6);
        if (this.timer <= 0) {
          this.state = 'swing';
          this.timer = 0.18;
          this.swing(world, effects);
        }
        break;
      }
      case 'swing':
        armX = -2.75 + (1 - Math.max(0, this.timer) / 0.18) * 3.1;
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 1;
        }
        break;
      case 'recover':
        armX = 0.35 - (1 - Math.max(0, this.timer) / 1) * 0.5;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.cooldown = 0.8 + Math.random() * 0.8;
        }
        break;
      case 'staggered':
        armX = 0.5;
        this.body.rotation.x = Math.sin(this.timer * 40) * 0.06;
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.4;
          this.body.rotation.x = 0;
        }
        break;
      default:
        break;
    }

    if (this.state !== 'telegraph') {
      this.seams.color.setHex(this.aggressive ? 0xff3048 : 0x6ad8ff).multiplyScalar(2.2 + this.flash * 4);
    }
    this.arm.rotation.x = THREE.MathUtils.lerp(this.arm.rotation.x, armX, 1 - Math.exp(-dt * 18));
    this.body.rotation.y = this.facing + Math.PI;
    this.group.position.copy(this.position);

    const damaged = this.health < this.maxHealth;
    this.bar.visible = damaged && this.barTimer > 0;
    if (this.bar.visible) {
      const f = Math.max(0, this.health / this.maxHealth);
      this.barFill.scale.x = f;
      this.barFill.position.x = -(1 - f) * 0.62;
    }
  }

  /** One swing of the maul, resolved as a segment sweep in front of the construct. */
  private swing(world: CombatWorld, effects: Effects): void {
    const f = this.facing;
    this.a.copy(this.position).addScaledVector(UP, 1.7);
    this.b.copy(this.a).add(new THREE.Vector3(-Math.sin(f) * 2.6, -1.0, -Math.cos(f) * 2.6));
    effects.sparkBurst(this.b, new THREE.Vector3(-Math.sin(f), 0.3, -Math.cos(f)), 0xff3048, 8, 5);
    const found: Damageable[] = [];
    world.sweep(this.a, this.b, 0.75, 'enemy', found);
    for (const target of found) {
      world.strike(target, {
        damage: 12,
        direction: new THREE.Vector3(-Math.sin(f), 0, -Math.cos(f)),
        point: this.b.clone(),
        knockback: 7,
        stagger: 0.35,
        source: 'enemy',
        kind: 'enemy',
        attacker: this,
      });
    }
  }

  /** Billboards the health bar toward the camera. */
  faceCamera(quat: THREE.Quaternion): void {
    if (this.bar.visible) this.bar.quaternion.copy(quat);
  }
}
