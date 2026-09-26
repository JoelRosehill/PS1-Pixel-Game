import * as THREE from 'three';
import type { Damageable, HitInfo, HitKind } from '../combat/types';
import { box, place } from '../world/geometry';
import type { AIContext } from './AIContext';
import { Enemy, type Received } from './Enemy';

/**
 * Shadow Knight (Pillar 5): heavily armoured, methodical, glowing seams.
 *
 * It tests the parry and the heavy sword. While it circles, its tower shield turns
 * frontal blows into chip damage and drains *poise*; heavy strikes, plunges and
 * charged overheads break the guard. Every attack has a long, bright telegraph —
 * the slow Doom Descent is deliberate parry bait — and a parried knight reels open,
 * exposing it to bonus damage. The rune on its back is a weak point that ignores
 * the shield entirely.
 */
interface KnightAttack {
  id: string;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  reach: number;
  knockback: number;
  stagger: number;
  /** Forward speed while the blade is live. */
  lunge: number;
  arc: 'cleaveR' | 'cleaveL' | 'overhead' | 'thrust';
  next?: string;
  chain?: number;
}

export const KNIGHT_ATTACKS: Record<string, KnightAttack> = {
  cleave: { id: 'cleave', windup: 0.55, active: 0.18, recovery: 0.6, damage: 16, reach: 2.8, knockback: 6, stagger: 0.35, lunge: 3, arc: 'cleaveR', next: 'backhand', chain: 0.45 },
  backhand: { id: 'backhand', windup: 0.38, active: 0.18, recovery: 0.75, damage: 14, reach: 2.7, knockback: 6, stagger: 0.3, lunge: 2.5, arc: 'cleaveL' },
  doom: { id: 'doom', windup: 1.05, active: 0.14, recovery: 1.1, damage: 30, reach: 3.1, knockback: 9, stagger: 0.55, lunge: 2, arc: 'overhead' },
  lunge: { id: 'lunge', windup: 0.5, active: 0.34, recovery: 0.85, damage: 18, reach: 2.4, knockback: 7, stagger: 0.4, lunge: 13, arc: 'thrust' },
};

export const KNIGHT_TUNING = {
  health: 190,
  poise: 100,
  /** Frontal damage taken through the shield. */
  guardChip: 0.2,
  backstabMultiplier: 1.5,
  exposedMultiplier: 1.6,
  /** Knight reels this long after being parried; exposed for the same window. */
  parryStagger: 2.1,
  guardBreakStagger: 1.8,
  walk: 2.4,
  approach: 4.4,
};

/** Poise damage per blow: heavy tools break guards, light chains chip them. */
const POISE: Partial<Record<HitKind, number>> = {
  light: 17, spin: 26, thrust: 20, sweep: 24, heavy: 55, plunge: 60, riposte: 100, burst: 32, reflect: 45,
};
/** Blows that interrupt an attack in progress (light hits do not — it is armoured). */
const INTERRUPTS: HitKind[] = ['heavy', 'plunge', 'riposte'];

const UP = new THREE.Vector3(0, 1, 0);

export class ShadowKnight extends Enemy {
  readonly kind = 'knight' as const;
  readonly displayName = 'Shadow Knight';
  poise = KNIGHT_TUNING.poise;
  guarding = false;
  /** Seconds the knight remains open after a parry or guard break. */
  exposed = 0;
  attack: KnightAttack | null = null;
  swingsLanded = 0;

  private cooldown = 1 + Math.random();
  private strafeSign = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 0;
  private poiseRegenDelay = 0;
  private readonly struck = new Set<Damageable>();
  private readonly hilt = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly found: Damageable[] = [];
  private readonly armR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly seams: THREE.MeshBasicMaterial;
  private readonly core: THREE.MeshBasicMaterial;
  private stride = 0;
  private swing = 0;

  constructor() {
    super(0.55, 2.35, KNIGHT_TUNING.health, { sight: 30, fov: 1.05, hearing: 7, gain: 1.6, forget: 7 });
    this.spawnDuration = 1.4;
    this.mass = 2.2;
    this.staggerResist = 0.7;
    this.leash = 30;
    const steel = this.skin(0x23202e);
    const plate = this.skin(0x3b3650);
    const cloth = this.skin(0x3a0f2a);
    this.seams = this.light(0x9a5aff, 2.2);
    this.core = this.light(0xff3a8a, 3);
    const visor = this.light(0xff4a6a, 3.5);
    const v = this.visual;

    // Legs pivot at the hip so the walk cycle swings them.
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.2, 1.0, 0);
      this.mesh(leg, place(box(0.27, 0.62, 0.3, 1), 0, -0.3, 0), steel);
      this.mesh(leg, place(box(0.31, 0.44, 0.36, 1), 0, -0.78, 0.02), plate);
      v.add(leg);
      this.legs.push(leg);
    }
    // Torso, belt, chest plate and glowing seams.
    this.mesh(v, place(box(0.84, 0.36, 0.5, 1), 0, 1.12, 0), steel);
    this.mesh(v, place(box(0.8, 0.72, 0.52, 1), 0, 1.62, 0), plate);
    this.mesh(v, place(box(0.62, 0.05, 0.05, 1), 0, 1.78, 0.27), this.seams, false);
    this.mesh(v, place(box(0.05, 0.5, 0.05, 1), 0, 1.5, 0.27), this.seams, false);
    // Weak point: the rune set into its back.
    this.mesh(v, place(box(0.26, 0.34, 0.06, 1), 0, 1.6, -0.28), this.core, false);
    // Pauldrons, helm, visor, crest.
    for (const s of [-1, 1]) this.mesh(v, place(box(0.36, 0.22, 0.44, 1), s * 0.55, 1.98, 0, 0, 0, s * 0.2), plate);
    this.mesh(v, place(box(0.46, 0.5, 0.48, 1), 0, 2.2, 0.02), steel);
    this.mesh(v, place(box(0.34, 0.06, 0.04, 1), 0, 2.22, 0.27), visor, false);
    this.mesh(v, place(box(0.06, 0.24, 0.5, 1), 0, 2.52, 0), this.seams, false);
    // Tattered cape.
    this.mesh(v, place(box(0.74, 1.3, 0.05, 1), 0, 1.25, -0.3, 0, -0.12), cloth);

    // Sword arm (shoulder pivot). The greatsword continues the arm, so pitching
    // the arm raises the blade.
    this.armR.position.set(0.56, 1.86, 0);
    this.armR.rotation.order = 'YXZ';
    this.mesh(this.armR, place(box(0.22, 0.7, 0.24, 1), 0, -0.33, 0), steel);
    this.mesh(this.armR, place(box(0.4, 0.07, 0.12, 1), 0, -0.74, 0), plate);
    this.mesh(this.armR, place(box(0.12, 1.55, 0.05, 1), 0, -1.55, 0), plate);
    this.mesh(this.armR, place(box(0.03, 1.5, 0.06, 1), 0, -1.55, 0), this.seams, false);
    v.add(this.armR);
    // Shield arm.
    this.armL.position.set(-0.56, 1.86, 0);
    this.mesh(this.armL, place(box(0.22, 0.7, 0.24, 1), 0, -0.33, 0), steel);
    this.mesh(this.armL, place(box(0.1, 1.25, 0.82, 1), -0.14, -0.62, 0.12), plate);
    this.mesh(this.armL, place(box(0.04, 0.5, 0.08, 1), -0.2, -0.6, 0.12), this.seams, false);
    v.add(this.armL);
    for (const part of [this.visual, this.armR, this.armL, ...this.legs]) this.mergeStatic(part);
    this.group.name = 'shadow-knight';
  }

  // --- brain ---------------------------------------------------------------

  protected think(dt: number, ctx: AIContext): void {
    this.exposed = Math.max(0, this.exposed - dt);
    this.poiseRegenDelay -= dt;
    if (this.poiseRegenDelay <= 0) this.poise = Math.min(KNIGHT_TUNING.poise, this.poise + dt * 28);
    this.cooldown -= dt;
    const pp = ctx.player.controller.position;
    const dist = this.distanceToPlayer(ctx);
    const alerted = this.perception.alerted && ctx.player.combat.alive;
    this.guarding = false;

    if (this.position.distanceTo(this.home) > this.leash && this.state !== 'return') {
      this.cancelAction();
      this.setState('return');
    }

    switch (this.state) {
      case 'idle': {
        this.stop();
        if (alerted) {
          this.setState('alert');
          ctx.effects.number(this.eye(this.tmp).addScaledVector(UP, 0.6), '!', 0xb07cff, 1.4);
        } else if (this.perception.awareness > 0.2) {
          this.turnToward(this.perception.lastKnown.x, this.perception.lastKnown.z, 2, dt);
        }
        break;
      }
      case 'alert':
        this.stop();
        this.turnToward(pp.x, pp.z, 5, dt);
        if (this.stateTime > 0.7) this.setState('approach');
        break;
      case 'approach': {
        if (!alerted) { this.setState('return'); break; }
        const target = this.perception.canSee ? pp : this.perception.lastKnown;
        this.turnToward(target.x, target.z, 5, dt);
        this.move(target.x - this.position.x, target.z - this.position.z, KNIGHT_TUNING.approach);
        this.guarding = dist < 9;
        if (dist < 6.5) this.setState('circle');
        break;
      }
      case 'circle': {
        if (!alerted) { this.setState('return'); break; }
        this.turnToward(pp.x, pp.z, 6, dt);
        this.guarding = true;
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) { this.strafeTimer = 1.6 + Math.random() * 1.8; this.strafeSign *= -1; }
        const dx = pp.x - this.position.x;
        const dz = pp.z - this.position.z;
        const inv = 1 / Math.max(dist, 1e-3);
        // Hold a duelling distance, drifting sideways; step in once ready to strike.
        const ready = this.cooldown <= 0;
        const radial = ready ? (dist > 3.2 ? 1 : 0) : dist > 5 ? 1 : dist < 3.2 ? -0.8 : 0;
        this.move(dx * inv * radial + -dz * inv * this.strafeSign * 0.6, dz * inv * radial + dx * inv * this.strafeSign * 0.6, KNIGHT_TUNING.walk);
        if (dist > 10) { this.setState('approach'); break; }
        if (this.cooldown <= 0 && this.perception.canSee) this.chooseAttack(dist, ctx);
        break;
      }
      case 'windup': {
        const a = this.attack!;
        // Tracks the player early, commits late: the tell stays honest.
        const commit = this.stateTime / a.windup;
        this.turnToward(pp.x, pp.z, commit < 0.6 ? 5 : 0.9, dt);
        this.stop();
        if (a.arc === 'thrust') this.move(pp.x - this.position.x, pp.z - this.position.z, 0.8);
        if (this.stateTime >= a.windup) this.beginStrike(ctx);
        break;
      }
      case 'strike': {
        const a = this.attack!;
        this.forward(this.tmp);
        this.move(this.tmp.x, this.tmp.z, a.lunge);
        this.sweepBlade(Math.min(1, this.stateTime / a.active), ctx);
        if (this.stateTime >= a.active) this.setState('recover');
        break;
      }
      case 'recover': {
        this.stop();
        const a = this.attack;
        const recovery = a ? a.recovery : 0.35;
        if (a?.next && Math.random() < (a.chain ?? 0) && this.stateTime >= recovery * 0.35 && ctx.player.combat.alive && dist < 4) {
          this.attack = KNIGHT_ATTACKS[a.next];
          this.setState('windup');
          break;
        }
        if (this.stateTime >= recovery) {
          this.attack = null;
          this.cancelAction();
          this.cooldown = 1.1 + Math.random() * 1.2;
          this.setState(alerted ? 'circle' : 'return');
        }
        break;
      }
      case 'return': {
        const h = this.home;
        const d = Math.hypot(h.x - this.position.x, h.z - this.position.z);
        if (alerted && this.position.distanceTo(h) < this.leash * 0.8) { this.setState('approach'); break; }
        this.turnToward(h.x, h.z, 4, dt);
        this.move(h.x - this.position.x, h.z - this.position.z, KNIGHT_TUNING.approach);
        this.health = Math.min(this.maxHealth, this.health + dt * 25);
        if (d < 1) { this.stop(); this.perception.reset(); this.setState('idle'); }
        break;
      }
    }
  }

  private chooseAttack(dist: number, ctx: AIContext): void {
    let id: string | null = null;
    if (dist > 4.8 && dist < 9) id = Math.random() < 0.6 ? 'lunge' : null;
    else if (dist < 3.6) id = Math.random() < 0.35 ? 'doom' : 'cleave';
    if (!id) return;
    if (!this.tokens || !this.tokens.request(this, 'melee')) { this.cooldown = 0.3; return; }
    this.attack = KNIGHT_ATTACKS[id];
    this.setState('windup');
    ctx.effects.sparkBurst(this.tmp.copy(this.position).addScaledVector(UP, 2.3), UP, 0xb07cff, 6, 3);
  }

  private beginStrike(ctx: AIContext): void {
    this.struck.clear();
    this.setState('strike');
    this.bladeAt(this.attack!, 0);
    ctx.effects.sparkBurst(this.tip, this.dir, 0xb07cff, 5, 4);
  }

  /** Analytic blade pose (like the player's): never depends on the animated mesh. */
  private bladeAt(a: KnightAttack, t: number): void {
    let angle = 0;
    let pitch = -0.1;
    let height = 1.35;
    let reach = a.reach;
    switch (a.arc) {
      case 'cleaveR': angle = THREE.MathUtils.lerp(1.35, -1.35, t); break;
      case 'cleaveL': angle = THREE.MathUtils.lerp(-1.35, 1.35, t); height = 1.15; break;
      case 'overhead': pitch = THREE.MathUtils.lerp(1.2, -0.9, t); height = 1.8; break;
      case 'thrust': reach = THREE.MathUtils.lerp(1.2, a.reach, Math.min(1, t * 2)); height = 1.3; break;
    }
    const f = this.facing + angle;
    const cp = Math.cos(pitch);
    this.dir.set(-Math.sin(f) * cp, Math.sin(pitch), -Math.cos(f) * cp);
    this.hilt.copy(this.position).addScaledVector(UP, height).addScaledVector(this.dir, 0.4);
    this.tip.copy(this.hilt).addScaledVector(this.dir, reach);
  }

  private sweepBlade(t: number, ctx: AIContext): void {
    const a = this.attack!;
    for (let i = 0; i <= 2; i++) {
      this.bladeAt(a, Math.max(0, t - (2 - i) * 0.08));
      ctx.combat.sweep(this.hilt, this.tip, 0.45, 'enemy', this.found);
      for (const target of this.found) {
        if (this.struck.has(target)) continue;
        this.struck.add(target);
        this.forward(this.tmp2);
        const result = ctx.combat.strike(target, {
          damage: a.damage, direction: this.tmp2.clone(), point: this.tip.clone(), knockback: a.knockback,
          stagger: a.stagger, source: 'enemy', kind: 'enemy', attacker: this,
        });
        if (result.hit && !result.blocked) this.swingsLanded++;
      }
    }
    if (a.arc === 'overhead' && t >= 1 && !this.struck.has(this)) {
      this.struck.add(this);
      this.bladeAt(a, 1);
      ctx.effects.ring(this.tip.setY(this.position.y + 0.05), 0x9a5aff, 2.2, 0.35);
      ctx.effects.sparkBurst(this.tip, UP, 0xb07cff, 14, 6);
    }
  }

  // --- defence -------------------------------------------------------------

  protected receive(hit: HitInfo): Received {
    if (hit.parry) {
      // Parried: reel back, weapon wide, core exposed for the riposte.
      this.attack = null;
      this.exposed = KNIGHT_TUNING.parryStagger;
      return { damage: 0, stagger: KNIGHT_TUNING.parryStagger / this.staggerResist };
    }
    this.forward(this.tmp);
    // hit.direction travels from attacker to knight; aligned with our forward = from behind.
    const fromBehind = hit.direction.x * this.tmp.x + hit.direction.z * this.tmp.z > 0.35;
    let damage = hit.damage;
    let critical = false;
    if (fromBehind) { damage *= KNIGHT_TUNING.backstabMultiplier; critical = true; }
    if (this.exposed > 0) { damage *= KNIGHT_TUNING.exposedMultiplier; critical = true; }
    this.poiseRegenDelay = 2;
    this.poise -= POISE[hit.kind] ?? 20;
    if (this.poise <= 0) {
      this.poise = KNIGHT_TUNING.poise;
      this.exposed = KNIGHT_TUNING.guardBreakStagger;
      return { damage, stagger: KNIGHT_TUNING.guardBreakStagger / this.staggerResist, critical: true };
    }
    // Spells and reflected light pierce the shield (they still drain poise).
    const magic = hit.kind === 'burst' || hit.kind === 'reflect';
    if (this.guarding && !fromBehind && this.exposed <= 0 && !magic) {
      return { damage: damage * KNIGHT_TUNING.guardChip, stagger: 0, blocked: true };
    }
    const attacking = this.state === 'windup' || this.state === 'strike';
    const interrupts = INTERRUPTS.includes(hit.kind) || hit.stagger >= 1;
    const stagger = attacking && !interrupts ? 0 : hit.stagger;
    return { damage, stagger, critical };
  }

  protected onStagger(): void {
    super.onStagger();
    this.attack = null;
    this.guarding = false;
  }

  protected recoverFromStagger(): void {
    this.cooldown = 0.6;
    this.setState('recover');
  }

  // --- presentation --------------------------------------------------------

  protected animate(dt: number, ctx: AIContext): void {
    void ctx;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.stride += dt * speed * 2.4;
    const walk = Math.min(1, speed / 3);
    this.legs[0].rotation.x = Math.sin(this.stride) * 0.5 * walk;
    this.legs[1].rotation.x = -Math.sin(this.stride) * 0.5 * walk;

    // Arm pose targets per state.
    let pitch = -0.35;
    let yaw = 0.15;
    const a = this.attack;
    let glowBoost = 0;
    if (this.state === 'windup' && a) {
      const k = Math.min(1, this.stateTime / a.windup);
      glowBoost = k * (a.id === 'doom' ? 9 : 5);
      if (a.arc === 'overhead') { pitch = -0.35 - k * 2.5; yaw = 0.1; }
      else if (a.arc === 'thrust') { pitch = -1.3; yaw = 0.2; this.armR.position.z = -k * 0.4; }
      else { pitch = -1.4; yaw = (a.arc === 'cleaveR' ? 1 : -1) * (0.2 + k * 1.2); }
    } else if (this.state === 'strike' && a) {
      const k = Math.min(1, this.stateTime / a.active);
      glowBoost = 6;
      if (a.arc === 'overhead') pitch = THREE.MathUtils.lerp(-2.85, -0.6, k);
      else if (a.arc === 'thrust') { pitch = -1.55; this.armR.position.z = THREE.MathUtils.lerp(-0.4, 0.5, k); }
      else { pitch = -1.45; yaw = (a.arc === 'cleaveR' ? 1 : -1) * THREE.MathUtils.lerp(1.4, -1.4, k); }
    } else if (this.state === 'staggered') {
      pitch = 0.5; yaw = 0.6;
    } else if (this.guarding) {
      pitch = -0.9; yaw = 0.3;
    }
    if (this.state !== 'windup' && this.state !== 'strike') this.armR.position.z *= 0.8;
    const k = 1 - Math.exp(-dt * 16);
    this.swing += (yaw - this.swing) * k;
    this.armR.rotation.x += (pitch - this.armR.rotation.x) * k;
    this.armR.rotation.y = this.swing;
    const shield = this.guarding ? -1.25 : this.state === 'staggered' ? 0.3 : -0.2;
    this.armL.rotation.x += (shield - this.armL.rotation.x) * k;
    this.armL.rotation.y = this.guarding ? -0.5 : 0;

    // Seams brighten through the telegraph; the core pulses when exposed.
    this.seams.color.setHex(0x9a5aff).multiplyScalar(2.2 + glowBoost);
    const pulse = this.exposed > 0 ? 3 + Math.abs(Math.sin(this.exposed * 14)) * 6 : 3;
    this.core.color.setHex(this.exposed > 0 ? 0xffe070 : 0xff3a8a).multiplyScalar(pulse);
    this.visual.rotation.x = this.state === 'staggered' ? Math.sin(this.stateTime * 30) * 0.04 - 0.08 : 0;
  }
}
