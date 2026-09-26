import * as THREE from 'three';
import type { CombatWorld } from '../combat/CombatWorld';
import { CHANNEL, MOMENTUM_GAINS, Momentum } from '../combat/Momentum';
import type { Damageable, HitInfo, HitKind, HitResult } from '../combat/types';
import type { Input } from '../core/Input';
import type { TimeControl } from '../core/TimeControl';
import type { Effects } from '../render/effects/Effects';
import type { PlayerController } from './PlayerController';
import type { PlayerModel } from './PlayerModel';
import type { FirstPersonCamera } from './FirstPersonCamera';

/**
 * Spellblade combat (Pillar 2): a heavy melee loop that feeds the Momentum Pool.
 *
 * Attacks are contextual — dashing thrusts, sliding sweeps, airborne plunges — and every
 * swing can be cancelled into a dash or jump, so combat never interrupts the movement
 * flow from Job 2. Hit detection uses an analytic blade arc rather than the animated
 * mesh, so hitboxes stay identical regardless of framerate.
 */

export type AttackArc = 'slashR' | 'slashL' | 'spin' | 'overhead' | 'thrust' | 'sweep' | 'plunge';

export interface AttackDef {
  id: string;
  arc: AttackArc;
  kind: HitKind;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  knockback: number;
  stagger: number;
  /** Forward speed applied while the swing commits. */
  lunge: number;
  reach: number;
  radius: number;
  momentum: number;
  shake: number;
  hitStop: number;
  next?: string;
  trail: number;
}

const A = (d: AttackDef) => d;

export const ATTACKS: Record<string, AttackDef> = {
  light1: A({ id: 'light1', arc: 'slashR', kind: 'light', windup: 0.07, active: 0.1, recovery: 0.17, damage: 11,
    knockback: 4, stagger: 0.18, lunge: 5, reach: 2.3, radius: 0.5, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.22, hitStop: 0.05, next: 'light2', trail: 0x8ae8ff }),
  light2: A({ id: 'light2', arc: 'slashL', kind: 'light', windup: 0.06, active: 0.1, recovery: 0.18, damage: 13,
    knockback: 4.5, stagger: 0.2, lunge: 5, reach: 2.3, radius: 0.5, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.24, hitStop: 0.055, next: 'light3', trail: 0x8ae8ff }),
  light3: A({ id: 'light3', arc: 'spin', kind: 'spin', windup: 0.12, active: 0.18, recovery: 0.3, damage: 20,
    knockback: 8, stagger: 0.45, lunge: 2.5, reach: 2.2, radius: 0.55, momentum: MOMENTUM_GAINS.swordHit + 4,
    shake: 0.45, hitStop: 0.08, trail: 0xb07cff }),
  heavy: A({ id: 'heavy', arc: 'overhead', kind: 'heavy', windup: 0.3, active: 0.14, recovery: 0.4, damage: 26,
    knockback: 11, stagger: 0.85, lunge: 3.5, reach: 2.5, radius: 0.6, momentum: MOMENTUM_GAINS.heavyHit,
    shake: 0.6, hitStop: 0.11, trail: 0xff8ad8 }),
  thrust: A({ id: 'thrust', arc: 'thrust', kind: 'thrust', windup: 0.04, active: 0.11, recovery: 0.16, damage: 16,
    knockback: 5, stagger: 0.25, lunge: 0, reach: 2.7, radius: 0.45, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.3, hitStop: 0.06, trail: 0x7fffd4 }),
  sweep: A({ id: 'sweep', arc: 'sweep', kind: 'sweep', windup: 0.05, active: 0.13, recovery: 0.22, damage: 15,
    knockback: 6, stagger: 0.6, lunge: 0, reach: 2.2, radius: 0.5, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.3, hitStop: 0.06, trail: 0x9aff7a }),
  plunge: A({ id: 'plunge', arc: 'plunge', kind: 'plunge', windup: 0.1, active: 1.1, recovery: 0.3, damage: 24,
    knockback: 9, stagger: 0.7, lunge: 0, reach: 1.9, radius: 0.55, momentum: MOMENTUM_GAINS.heavyHit,
    shake: 0.5, hitStop: 0.09, trail: 0xffb45a }),
  riposte: A({ id: 'riposte', arc: 'thrust', kind: 'riposte', windup: 0.05, active: 0.12, recovery: 0.2, damage: 34,
    knockback: 10, stagger: 0.9, lunge: 7, reach: 2.8, radius: 0.55, momentum: MOMENTUM_GAINS.riposte,
    shake: 0.7, hitStop: 0.13, trail: 0xffd070 }),
};

export const COMBAT_TUNING = {
  maxHealth: 100,
  parryWindow: 0.18,
  guardReduction: 0.35,
  riposteWindow: 1.5,
  respawnDelay: 1.8,
  sheatheAfter: 5,
};

type Phase = 'idle' | 'windup' | 'active' | 'recovery' | 'charge' | 'staggered' | 'dead';

const UP = new THREE.Vector3(0, 1, 0);

export class PlayerCombat implements Damageable {
  readonly team = 'player' as const;
  readonly bodyRadius = 0.45;
  readonly bodyHeight = 1.8;
  readonly momentum = new Momentum();

  health = COMBAT_TUNING.maxHealth;
  alive = true;
  phase: Phase = 'idle';
  attack: AttackDef | null = null;
  /** 0..1 progress through the current phase, for animation. */
  phaseT = 0;
  charge = 0;
  guarding = false;
  castSpell: (() => boolean) | null = null;
  onReset: (() => void) | null = null;
  wardTime = 0;
  wardReduction = 0.5;
  /** Momentum gained by channelling this step (for effects and sound). */
  channelGain = 0;
  /** A hit while channelling locks the channel until Shift is released. */
  channelBroken = false;

  private timer = 0;
  private queued: string | null = null;
  private parryTimer = 0;
  private riposteTimer = 0;
  private respawnTimer = 0;
  private sheatheTimer = 0;
  private plungeLanded = false;
  private readonly hitList = new Set<Damageable>();
  private readonly hilt = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly prevHilt = new THREE.Vector3();
  private readonly prevTip = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly found: Damageable[] = [];

  constructor(
    private readonly input: Input,
    private readonly controller: PlayerController,
    private readonly model: PlayerModel,
    private readonly camera: FirstPersonCamera,
    private readonly world: CombatWorld,
    private readonly effects: Effects,
    private readonly time: TimeControl,
    private readonly respawn: () => void,
  ) {}

  get position(): THREE.Vector3 {
    return this.controller.position;
  }

  get busy(): boolean {
    return this.phase === 'windup' || this.phase === 'active';
  }

  get parrying(): boolean {
    return this.parryTimer > 0;
  }

  get riposteReady(): boolean {
    return this.riposteTimer > 0;
  }

  reset(): void {
    this.wardTime = 0;
    this.onReset?.();
    this.health = COMBAT_TUNING.maxHealth;
    this.alive = true;
    this.phase = 'idle';
    this.attack = null;
    this.momentum.reset();
    this.timer = 0;
    this.queued = null;
    this.hitList.clear();
  }

  fixedUpdate(dt: number): void {
    this.wardTime = Math.max(0, this.wardTime - dt);
    const shiftHeld = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (!shiftHeld) this.channelBroken = false;
    const channelling = this.alive && this.controller.channelling && !this.channelBroken && (this.phase === 'idle' || this.phase === 'recovery');
    this.channelGain = this.momentum.update(dt, channelling);
    if (channelling) this.controller.moveScale = 0;
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.riposteTimer = Math.max(0, this.riposteTimer - dt);
    this.sheatheTimer = Math.max(0, this.sheatheTimer - dt);
    this.model.setSwordDrawn(this.sheatheTimer > 0);

    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.reset();
        this.respawn();
      }
      return;
    }

    if (this.phase === 'staggered') {
      this.timer -= dt;
      this.controller.moveScale = 0.15;
      this.controller.attackLock = true;
      if (this.timer <= 0) this.endAttack();
      return;
    }

    this.readInput(dt);
    this.advance(dt);
  }

  // --- input ---------------------------------------------------------------

  private readInput(dt: number): void {
    const inp = this.input;
    if (this.controller.frozen) return;

    this.guarding = inp.isDown('KeyQ') && !this.busy;
    if (inp.pressed('KeyQ') && this.phase !== 'windup' && this.phase !== 'active') {
      this.parryTimer = COMBAT_TUNING.parryWindow;
      this.effects.ring(this.tmpA.copy(this.position).addScaledVector(UP, 1.1), 0x9ad8ff, 1.1, 0.25, true);
    }

    if (inp.takePressed('KeyE')) this.castSpell?.();

    // Heavy: hold right mouse to charge, release to swing.
    if (this.phase === 'charge') {
      this.charge = Math.min(1, this.charge + dt / 0.55);
      this.controller.moveScale = 0.35;
      this.controller.attackLock = false;
      if (!inp.mouseDown(2)) this.begin('heavy');
      return;
    }
    if (inp.mousePressed(2) && (this.phase === 'idle' || this.phase === 'recovery') && this.controller.grounded) {
      this.phase = 'charge';
      this.charge = 0;
      this.sheatheTimer = COMBAT_TUNING.sheatheAfter;
      return;
    }

    if (inp.mousePressed(0)) {
      if (this.phase === 'idle') this.begin(this.contextualAttack());
      else if (this.phase === 'recovery') this.queued = this.attack?.next ?? this.contextualAttack();
      else if (this.phase === 'windup' || this.phase === 'active') this.queued = this.attack?.next ?? null;
    }

    // Dash and jump cancel recovery — keeping the movement flow alive.
    if (this.phase === 'recovery' && (this.controller.events.dashed || this.controller.events.jumped)) this.endAttack();
  }

  private contextualAttack(): string {
    if (this.riposteTimer > 0) return 'riposte';
    if (this.controller.state === 'dash') return 'thrust';
    if (this.controller.sliding) return 'sweep';
    if (!this.controller.grounded) return 'plunge';
    return 'light1';
  }

  // --- attack lifecycle ----------------------------------------------------

  private begin(id: string): void {
    const def = ATTACKS[id];
    if (!def) return;
    this.attack = def;
    this.phase = 'windup';
    this.timer = def.windup;
    this.phaseT = 0;
    this.queued = null;
    this.hitList.clear();
    this.plungeLanded = false;
    this.sheatheTimer = COMBAT_TUNING.sheatheAfter;
    if (id === 'riposte') this.riposteTimer = 0;

    // First-person strikes follow aim; never turn the body away from the crosshair.
    this.controller.facing = this.camera.movementYaw;
    this.controller.attackLock = true;
  }

  private advance(dt: number): void {
    if (this.phase === 'idle') {
      this.controller.moveScale = 1;
      this.controller.attackLock = false;
      return;
    }
    const def = this.attack;
    if (!def) return;
    this.timer -= dt;

    if (this.phase === 'windup') {
      this.phaseT = 1 - Math.max(0, this.timer) / def.windup;
      this.controller.moveScale = 0.3;
      if (def.arc === 'overhead') this.controller.moveScale = 0.15;
      if (this.timer <= 0) {
        this.phase = 'active';
        this.timer = def.active;
        this.phaseT = 0;
        this.lunge(def);
        this.effects.beginTrail(def.trail);
        this.bladeAt(def, 0, this.prevHilt, this.prevTip);
        if (def.arc === 'plunge') this.controller.velocity.y = -26;
      }
    } else if (this.phase === 'active') {
      this.phaseT = 1 - Math.max(0, this.timer) / def.active;
      this.controller.moveScale = 0.1;
      this.sweepBlade(def);
      if (def.arc === 'plunge') {
        this.controller.velocity.y = Math.min(this.controller.velocity.y, -26);
        if (this.controller.grounded && !this.plungeLanded) {
          this.plungeLanded = true;
          this.plungeImpact(def);
          this.timer = 0;
        }
      }
      if (this.timer <= 0) {
        this.phase = 'recovery';
        this.timer = def.recovery;
        this.phaseT = 0;
        this.effects.endTrail();
      }
    } else if (this.phase === 'recovery') {
      this.phaseT = 1 - Math.max(0, this.timer) / def.recovery;
      this.controller.moveScale = 0.45;
      if (this.timer <= 0) {
        if (this.queued) this.begin(this.queued);
        else this.endAttack();
      }
    }

    this.model.setAttackPose(this.attack?.arc ?? null, this.phase, this.phaseT, this.charge);
  }

  private endAttack(): void {
    this.phase = 'idle';
    this.attack = null;
    this.charge = 0;
    this.queued = null;
    this.controller.moveScale = 1;
    this.controller.attackLock = false;
    this.effects.endTrail();
    this.model.setAttackPose(null, 'idle', 0, 0);
  }

  private lunge(def: AttackDef): void {
    if (def.lunge <= 0) return;
    const f = this.controller.facing;
    this.controller.velocity.x += -Math.sin(f) * def.lunge;
    this.controller.velocity.z += -Math.cos(f) * def.lunge;
  }

  // --- blade geometry and hit detection ------------------------------------

  /** Analytic blade pose for arc progress `t`. */
  private bladeAt(def: AttackDef, t: number, hilt: THREE.Vector3, tip: THREE.Vector3): void {
    const f = this.controller.facing;
    const pos = this.controller.position;
    let angle = 0;
    let height = 1.2;
    let pitch = 0;
    let reach = def.reach;
    const charged = def.arc === 'overhead' ? 1 + this.charge * 0.15 : 1;

    switch (def.arc) {
      case 'slashR':
        angle = THREE.MathUtils.lerp(1.35, -1.35, t);
        height = 1.3 - t * 0.25;
        pitch = -0.15;
        break;
      case 'slashL':
        angle = THREE.MathUtils.lerp(-1.45, 1.3, t);
        height = 1.0 + t * 0.2;
        pitch = -0.1;
        break;
      case 'spin':
        angle = t * Math.PI * 2;
        height = 1.1;
        break;
      case 'overhead':
        pitch = THREE.MathUtils.lerp(1.2, -0.85, t);
        height = 1.4;
        reach *= charged;
        break;
      case 'thrust':
        reach = THREE.MathUtils.lerp(1.1, def.reach, Math.min(1, t * 1.7));
        height = 1.2;
        break;
      case 'sweep':
        angle = THREE.MathUtils.lerp(1.3, -1.3, t);
        height = 0.38;
        break;
      case 'plunge':
        pitch = -1.25;
        height = 1.5;
        break;
    }

    pitch += this.camera.pitch;
    const cos = Math.cos(pitch);
    this.dir.set(-Math.sin(f + angle) * cos, Math.sin(pitch), -Math.cos(f + angle) * cos).normalize();
    hilt.copy(pos).addScaledVector(UP, height).addScaledVector(this.dir, 0.3);
    tip.copy(hilt).addScaledVector(this.dir, reach);
  }

  /** Steps the blade from its previous pose to the current one, damaging what it crosses. */
  private sweepBlade(def: AttackDef): void {
    const steps = 3;
    for (let i = 1; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(Math.max(0, this.phaseT - 1 / steps), this.phaseT, i / steps);
      this.bladeAt(def, t, this.hilt, this.tip);
      this.effects.pushTrail(this.hilt, this.tip);
      this.world.sweep(this.hilt, this.tip, def.radius, 'player', this.found);
      for (const target of this.found) {
        if (this.hitList.has(target)) continue;
        this.hitList.add(target);
        this.land(def, target);
      }
      this.prevHilt.copy(this.hilt);
      this.prevTip.copy(this.tip);
    }
  }

  private land(def: AttackDef, target: Damageable): void {
    const point = this.tmpA.copy(target.position).addScaledVector(UP, target.bodyHeight * 0.6);
    const dir = this.tmpB.subVectors(point, this.position).setY(0).normalize();
    const damage = def.damage * (def.arc === 'overhead' ? 1 + this.charge * 0.7 : 1);
    const result = this.world.strike(target, {
      damage,
      direction: dir.clone(),
      point: point.clone(),
      knockback: def.knockback,
      stagger: def.stagger,
      source: 'player',
      kind: def.kind,
      attacker: this,
    });
    if (!result.hit) return;

    this.momentum.add(def.momentum);
    this.time.hitStop(def.hitStop);
    this.camera.addShake(def.shake);
    this.effects.sparkBurst(point, dir, def.trail, 10 + Math.round(damage / 3), 6 + damage * 0.2);
    this.effects.number(
      this.tmpA.copy(point).addScaledVector(UP, 0.3),
      String(Math.round(result.damage ?? damage)),
      def.kind === 'riposte' ? 0xffd070 : 0xfff0c0,
      def.kind === 'light' ? 1 : 1.35,
    );
  }

  private plungeImpact(def: AttackDef): void {
    const centre = this.tmpA.copy(this.position);
    this.effects.ring(centre, def.trail, 3.6, 0.45);
    this.camera.addShake(def.shake);
    this.time.hitStop(def.hitStop);
    this.effects.sparkBurst(centre, UP, def.trail, 22, 9);
    this.world.sphere(centre, 3.2, 'player', this.found);
    for (const target of this.found) {
      if (this.hitList.has(target)) continue;
      this.hitList.add(target);
      this.land(def, target);
    }
  }

  // --- taking damage -------------------------------------------------------

  applyHit(hit: HitInfo): HitResult {
    if (!this.alive) return { hit: false };

    // Dash i-frames: a perfect dodge pays Momentum and a slow-motion beat.
    if (this.controller.invulnerable) {
      this.momentum.add(MOMENTUM_GAINS.perfectDodge);
      this.time.slowMotion(0.45, 0.18);
      this.effects.number(this.position.clone().addScaledVector(UP, 2.1), '+', 0x7fffd4, 1.2);
      return { hit: false, dodged: true };
    }

    const facingDot = -hit.direction.x * -Math.sin(this.controller.facing) + -hit.direction.z * -Math.cos(this.controller.facing);
    const fromFront = facingDot > -0.2 && hit.kind !== 'hazard';

    if (this.parryTimer > 0 && fromFront) {
      this.parryTimer = 0;
      this.riposteTimer = COMBAT_TUNING.riposteWindow;
      this.momentum.add(MOMENTUM_GAINS.parry);
      this.time.hitStop(0.12);
      this.camera.addShake(0.5);
      const centre = this.position.clone().addScaledVector(UP, 1.2);
      this.effects.ring(centre, 0xffd070, 2.4, 0.4, true);
      this.effects.sparkBurst(hit.point, hit.direction.clone().negate(), 0xffd070, 18, 9);
      this.effects.number(centre.clone().addScaledVector(UP, 0.7), '!', 0xffd070, 1.4);
      hit.attacker?.applyHit({
        damage: 0,
        direction: hit.direction.clone().negate(),
        point: hit.point,
        knockback: 5,
        stagger: 1.3,
        source: 'player',
        kind: 'riposte',
        parry: true,
      });
      return { hit: false, parried: true };
    }

    let damage = hit.damage * (this.wardTime > 0 ? 1 - this.wardReduction : 1);
    // Standing still to channel is the gamble: a hit breaks it and lands harder.
    if (this.momentum.channelTime > 0) {
      damage *= CHANNEL.exposed;
      this.momentum.channelTime = 0;
      this.channelBroken = true;
    }
    const blocked = this.guarding && fromFront;
    if (blocked) {
      damage *= COMBAT_TUNING.guardReduction;
      this.effects.sparkBurst(hit.point, hit.direction.clone().negate(), 0x9ad8ff, 8, 5);
    }

    this.health -= damage;
    this.controller.addImpulse(hit.direction.x * hit.knockback, 2.5, hit.direction.z * hit.knockback);
    this.camera.addShake(blocked ? 0.3 : 0.7);
    this.time.hitStop(blocked ? 0.04 : 0.07);
    this.effects.sparkBurst(hit.point, hit.direction, 0xff4a6a, 12, 6);
    this.effects.number(hit.point.clone().addScaledVector(UP, 0.4), String(Math.round(damage)), 0xff5a7a, 1.2);

    if (!blocked && hit.stagger > 0) {
      this.phase = 'staggered';
      this.timer = Math.min(hit.stagger, 0.55);
      this.attack = null;
      this.effects.endTrail();
      this.model.setAttackPose(null, 'idle', 0, 0);
    }

    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.phase = 'dead';
      this.respawnTimer = COMBAT_TUNING.respawnDelay;
      this.time.slowMotion(0.25, 0.9);
      this.camera.addShake(1);
      return { hit: true, damage, killed: true, blocked };
    }
    return { hit: true, damage, blocked };
  }
}
