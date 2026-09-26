import * as THREE from 'three';
import { type CreatureLibrary, type CreatureModel, gripWeapon } from '../assets/Creatures';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { Damageable, HitInfo, HitKind } from '../combat/types';
import type { AIContext } from './AIContext';
import type { AttackSpec, FoeSpec } from './Bestiary';
import { Enemy, type Received } from './Enemy';

const UP = new THREE.Vector3(0, 1, 0);

/** Poise damage per blow (Elden Ring-style: heavy tools break stances, light ones chip). */
const POISE: Partial<Record<HitKind, number>> = {
  light: 12, spin: 20, thrust: 16, sweep: 18, heavy: 45, plunge: 50, riposte: 100, burst: 25, reflect: 40, wave: 14, bolt: 3, spell: 22,
};
const HEAVY: HitKind[] = ['heavy', 'plunge', 'riposte'];

/**
 * A Bestiary foe (Job 14): the user's animated creature model driven by a data spec.
 *
 * Brain: idle → alert (roar) → approach → circle at its preferred distance → pick an
 * attack by distance and weight (taking a token) → wind-up (tracking, then committing)
 * → strike (the shape connects) → recover (maybe chaining) → circle. Casters keep range
 * and blink away when crowded; fliers hover and dive.
 *
 * Body: poise breaks into a stagger; armoured attacks shrug off light blows; parries
 * expose it for bonus damage; guarding foes chip frontal damage; slows halve its tempo.
 * The model's clips are stretched so each attack's hit event lands exactly when the
 * shape connects.
 */
export class CreatureEnemy extends Enemy {
  readonly kind = 'foe' as const;
  readonly displayName: string;
  readonly spec: FoeSpec;
  model: CreatureModel | null = null;
  attack: AttackSpec | null = null;
  poise: number;
  exposed = 0;
  guarding = false;
  swingsLanded = 0;
  /** Damage multiplier from chapter scaling. */
  readonly power: number;

  private cooldown = 0.8 + Math.random();
  private readonly attackCooldowns = new Map<string, number>();
  private strafeSign = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 0;
  private poiseDelay = 0;
  private breathTick = 0;
  private readonly struck = new Set<Damageable>();
  private readonly hilt = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly found: Damageable[] = [];
  private landed = false;
  private weapon: THREE.Object3D | null = null;

  constructor(spec: FoeSpec, creatures: CreatureLibrary | null, models: ModelLibrary | null, level = 1) {
    const scale = 1 + 0.16 * Math.max(0, level - 1);
    super(spec.radius, spec.bodyHeight, Math.round(spec.health * scale), spec.perception);
    this.spec = spec;
    this.displayName = spec.name;
    this.power = 1 + 0.1 * Math.max(0, level - 1);
    this.poise = spec.poise;
    this.mass = spec.mass;
    this.leash = 36;
    this.spawnDuration = 1.1;
    this.fxColor = spec.fxColor;
    this.deathDelay = 1.2;
    this.group.name = `foe:${spec.id}`;
    this.model = creatures?.create(spec.creature, {
      height: spec.height, tint: spec.tint, emissive: spec.emissive, emissiveIntensity: spec.emissiveIntensity, dissolve: this.dissolve,
    }) ?? null;
    if (this.model) {
      this.visual.add(this.model.root);
      this.model.play('idle', { fade: 0 });
      if (spec.weapon && models) {
        const w = models.instantiateSync(spec.weapon.model, { size: spec.weapon.length, grounded: false });
        if (w) this.weapon = gripWeapon(this.model, w.root);
      }
    } else {
      // Stand-in until the creature loads (tests without models, failed downloads).
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(spec.radius, Math.max(0.1, spec.bodyHeight - spec.radius * 2), 2, 6),
        this.skin(spec.tint ?? 0x8a7a90));
      body.position.y = spec.bodyHeight / 2;
      this.visual.add(body);
    }
  }

  // --- brain ---------------------------------------------------------------

  protected think(dt: number, ctx: AIContext): void {
    const s = this.spec;
    const slow = this.slowTimer > 0 ? 0.55 : 1;
    this.exposed = Math.max(0, this.exposed - dt);
    this.poiseDelay -= dt;
    if (this.poiseDelay <= 0) this.poise = Math.min(s.poise, this.poise + dt * s.poise * 0.25);
    this.cooldown -= dt * slow;
    for (const [id, t] of this.attackCooldowns) this.attackCooldowns.set(id, t - dt);
    const pp = ctx.player.controller.position;
    const dist = this.distanceToPlayer(ctx);
    const alerted = this.perception.alerted && ctx.player.combat.alive;
    this.guarding = false;

    if (this.position.distanceTo(this.home) > this.leash && this.state !== 'return') {
      this.cancelAction();
      this.attack = null;
      this.setState('return');
    }

    switch (this.state) {
      case 'idle':
        this.stop();
        if (alerted) {
          this.setState('alert');
          ctx.effects.number(this.eye(this.tmp).addScaledVector(UP, 0.5), '!', s.fxColor, 1.4);
        } else if (this.perception.awareness > 0.2) {
          this.turnToward(this.perception.lastKnown.x, this.perception.lastKnown.z, 2, dt);
        }
        break;
      case 'alert':
        this.stop();
        this.turnToward(pp.x, pp.z, 5, dt);
        if (this.stateTime > 0.6) this.setState('approach');
        break;
      case 'approach': {
        if (!alerted) { this.setState('return'); break; }
        const target = this.perception.canSee ? pp : this.perception.lastKnown;
        this.turnToward(target.x, target.z, 6, dt);
        this.move(target.x - this.position.x, target.z - this.position.z, s.run);
        if (dist < Math.max(s.keep + 2.5, 6)) this.setState('circle');
        break;
      }
      case 'circle': {
        if (!alerted) { this.setState('return'); break; }
        this.turnToward(pp.x, pp.z, 6, dt);
        this.guarding = !!s.guard && dist < 7;
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) { this.strafeTimer = 1.4 + Math.random() * 1.8; this.strafeSign *= -1; }
        const dx = pp.x - this.position.x, dz = pp.z - this.position.z;
        const inv = 1 / Math.max(dist, 1e-3);
        const ready = this.cooldown <= 0;
        const want = ready ? Math.min(s.keep, this.readyRange()) : s.keep + 1.2;
        // Ready: close all the way into reach. Waiting: drift in a loose band around `keep`.
        const radial = dist > want + (ready ? 0 : 0.6) ? 1 : dist < want - 1.2 ? -0.8 : 0;
        this.move(dx * inv * radial - dz * inv * this.strafeSign * 0.6, dz * inv * radial + dx * inv * this.strafeSign * 0.6,
          radial > 0 && dist > want + 4 ? s.run : s.walk);
        if (dist > s.keep + 12) { this.setState('approach'); break; }
        if (ready && this.perception.canSee) this.chooseAttack(dist, ctx);
        break;
      }
      case 'windup': {
        const a = this.attack!;
        const commit = this.stateTime / a.windup;
        this.turnToward(pp.x, pp.z, commit < 0.7 ? (a.track ?? 4) : 0.6, dt);
        if (a.step) { this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, a.step * commit); } else this.stop();
        if (a.telegraph && Math.random() < 0.3) ctx.effects.sparkBurst(this.eye(this.tmp), UP, a.telegraph, 1, 2);
        if (this.stateTime >= a.windup) this.beginStrike(ctx);
        break;
      }
      case 'strike': {
        const a = this.attack!;
        this.strike(Math.min(1, this.stateTime / a.active), dt, ctx);
        if (this.stateTime >= a.active) { this.setState('recover'); this.stop(); }
        break;
      }
      case 'recover': {
        this.stop();
        const a = this.attack;
        const recovery = a ? a.recovery : 0.4;
        if (a?.next && Math.random() < (a.chain ?? 0) * dt * 12 && this.stateTime >= recovery * 0.3 && ctx.player.combat.alive && dist < 4.5) {
          this.startAttack(s.attacks.find(x => x.id === a.next)!, ctx);
          break;
        }
        if (this.stateTime >= recovery) {
          this.attack = null;
          this.cancelAction();
          this.cooldown = s.aggression * (0.7 + Math.random() * 0.8);
          this.setState(alerted ? 'circle' : 'return');
        }
        break;
      }
      case 'return': {
        const h = this.home;
        const d = Math.hypot(h.x - this.position.x, h.z - this.position.z);
        if (alerted && this.position.distanceTo(h) < this.leash * 0.8) { this.setState('approach'); break; }
        this.turnToward(h.x, h.z, 4, dt);
        this.move(h.x - this.position.x, h.z - this.position.z, s.run);
        this.health = Math.min(this.maxHealth, this.health + dt * this.maxHealth * 0.12);
        if (d < 1.2) { this.stop(); this.perception.reset(); this.setState('idle'); }
        break;
      }
    }
  }

  /** The longest reach among attacks off cooldown (how close to step in). */
  private readyRange(): number {
    let r = 0;
    for (const a of this.spec.attacks) if ((this.attackCooldowns.get(a.id) ?? 0) <= 0 && a.weight > 0) r = Math.max(r, a.range[1] * 0.8);
    return r || this.spec.keep;
  }

  private chooseAttack(dist: number, ctx: AIContext): void {
    const options = this.spec.attacks.filter(a => a.weight > 0 && dist >= a.range[0] && dist <= a.range[1] &&
      (this.attackCooldowns.get(a.id) ?? 0) <= 0);
    if (!options.length) return;
    let roll = Math.random() * options.reduce((sum, a) => sum + a.weight, 0);
    const pick = options.find(a => (roll -= a.weight) <= 0) ?? options[0];
    if (!this.tokens || !this.tokens.request(this, pick.ranged ? 'ranged' : 'melee')) { this.cooldown = 0.3; return; }
    this.startAttack(pick, ctx);
  }

  private startAttack(a: AttackSpec, ctx: AIContext): void {
    this.attack = a;
    this.attackCooldowns.set(a.id, a.cooldown);
    this.setState('windup');
    const m = this.model;
    if (m?.has(a.clip)) {
      // Stretch the clip so its hit event lands when the wind-up ends.
      const hit = m.event(a.clip);
      const speed = hit > 0 ? hit / a.windup : 1;
      m.play(a.clip, { fade: 0.12, restart: true, speed });
    }
    if (a.telegraph) {
      ctx.effects.sparkBurst(this.eye(this.tmp), UP, a.telegraph, 8, 3);
      if (a.shape.kind === 'circle') {
        this.forward(this.tmp).multiplyScalar(a.shape.offset).add(this.position);
        this.tmp.y = ctx.colliders.heightAt(this.tmp.x, this.tmp.z);
        ctx.telegraphs.circle(this.tmp, a.shape.radius, a.windup, a.telegraph);
      } else if (a.shape.kind === 'lunge') {
        this.forward(this.tmp2).multiplyScalar(a.shape.speed * a.active).add(this.position);
        ctx.telegraphs.lane(this.position, this.tmp2, 1.6, a.windup, a.telegraph);
      }
    }
  }

  private beginStrike(ctx: AIContext): void {
    const a = this.attack!;
    this.struck.clear();
    this.landed = false;
    this.breathTick = 0;
    this.setState('strike');
    const shape = a.shape;
    const dmg = a.damage * this.power;
    const pp = ctx.player.controller.position;
    if (shape.kind === 'projectile') {
      const from = this.model?.bone('mouth') ? this.model.socket('mouth', this.hilt) : this.eye(this.hilt);
      const toward = this.tmp.copy(ctx.playerEye).sub(from).normalize();
      for (let i = 0; i < shape.count; i++) {
        const spread = (i - (shape.count - 1) / 2) * shape.spread;
        const d = toward.clone().applyAxisAngle(UP, spread);
        ctx.projectiles.fire(from, d, shape.speed, dmg, this, shape.homing, shape.orb, shape.size);
      }
    } else if (shape.kind === 'volley') {
      const v = ctx.player.controller.velocity;
      for (let i = 0; i < shape.count; i++) {
        const lead = i === 0 ? 0 : 0.6;
        const p = new THREE.Vector3(pp.x + v.x * lead + (i ? (Math.random() - 0.5) * shape.spread * 2 : 0), 0,
          pp.z + v.z * lead + (i ? (Math.random() - 0.5) * shape.spread * 2 : 0));
        p.y = ctx.colliders.heightAt(p.x, p.z);
        ctx.telegraphs.schedule(p, shape.radius, shape.delay + i * 0.15, this.spec.fxColor, (point, radius) => {
          ctx.telegraphs.pillar(point, radius, 16, this.spec.fxColor);
          this.hitCircle(point, radius, dmg, a, ctx, 'hazard');
        });
      }
    } else if (shape.kind === 'blink') {
      this.blinkAway(shape.distance, ctx);
    }
  }

  /** Per step while the attack is live. `t` is 0..1 through the active window. */
  private strike(t: number, dt: number, ctx: AIContext): void {
    const a = this.attack!;
    const shape = a.shape;
    const dmg = a.damage * this.power;
    switch (shape.kind) {
      case 'arc': {
        for (let i = 0; i <= 2; i++) {
          this.bladeAt(shape, Math.max(0, t - (2 - i) * 0.08));
          ctx.combat.sweep(this.hilt, this.tip, shape.width ?? 0.5, 'enemy', this.found);
          for (const target of this.found) this.hit(target, a, dmg, ctx);
        }
        break;
      }
      case 'circle':
        if (!this.landed) {
          this.landed = true;
          this.forward(this.tmp).multiplyScalar(shape.offset).add(this.position);
          this.tmp.y = ctx.colliders.heightAt(this.tmp.x, this.tmp.z);
          ctx.effects.ring(this.tmp.clone().setY(this.tmp.y + 0.1), this.spec.fxColor, shape.radius * 1.2, 0.35);
          ctx.effects.sparkBurst(this.tmp, UP, this.spec.fxColor, 14, 6);
          ctx.player.camera.addShake(0.35);
          this.hitCircle(this.tmp, shape.radius, dmg, a, ctx);
          if (shape.shockwave) ctx.hazards.shockwave(this.tmp.clone(), 12, shape.shockwave, dmg * 0.5, this.spec.fxColor, this);
        }
        break;
      case 'lunge': {
        this.forward(this.tmp);
        this.move(this.tmp.x, this.tmp.z, shape.speed);
        this.velocity.x = this.tmp.x * shape.speed;
        this.velocity.z = this.tmp.z * shape.speed;
        const chest = this.tmp2.copy(this.position).addScaledVector(UP, this.bodyHeight * 0.55);
        ctx.combat.sphere(chest, shape.reach, 'enemy', this.found);
        for (const target of this.found) this.hit(target, a, dmg, ctx);
        break;
      }
      case 'breath': {
        this.breathTick -= dt;
        const from = this.model?.bone('mouth') ? this.model.socket('mouth', this.hilt) : this.eye(this.hilt);
        this.forward(this.dir);
        if (Math.random() < 0.8) ctx.effects.sparkBurst(from, this.dir.clone().setY(-0.15), this.spec.fxColor, 3, 12);
        if (this.breathTick <= 0) {
          this.breathTick = shape.tick;
          const p = ctx.player.controller.position;
          const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
          if (d <= shape.range && Math.abs(this.angleToPlayer(ctx)) <= shape.halfAngle && ctx.player.combat.alive) {
            this.struck.clear();
            this.hit(ctx.player.combat, a, dmg, ctx, 'hazard');
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private hit(target: Damageable, a: AttackSpec, damage: number, ctx: AIContext, kind: 'enemy' | 'hazard' = 'enemy'): void {
    if (this.struck.has(target)) return;
    this.struck.add(target);
    const dir = new THREE.Vector3(target.position.x - this.position.x, 0, target.position.z - this.position.z);
    if (dir.lengthSq() < 1e-4) this.forward(dir);
    const result = ctx.combat.strike(target, {
      damage, direction: dir.normalize(), point: target.position.clone().addScaledVector(UP, 1.1), knockback: a.knockback,
      stagger: a.stagger, source: 'enemy', kind, attacker: this,
    });
    if (result.hit && !result.blocked) this.swingsLanded++;
  }

  private hitCircle(center: THREE.Vector3, radius: number, damage: number, a: AttackSpec, ctx: AIContext, kind: 'enemy' | 'hazard' = 'enemy'): void {
    const p = ctx.player.controller.position;
    if (Math.hypot(p.x - center.x, p.z - center.z) > radius + 0.4 || Math.abs(p.y - center.y) > 3.5) return;
    this.hit(ctx.player.combat, a, damage, ctx, kind);
  }

  /** Analytic blade: never depends on the animated mesh (fair, frame-rate independent). */
  private bladeAt(shape: Extract<AttackSpec['shape'], { kind: 'arc' }>, t: number): void {
    const angle = THREE.MathUtils.lerp(shape.from, shape.to, t);
    const pitch = shape.pitchFrom !== undefined ? THREE.MathUtils.lerp(shape.pitchFrom, shape.pitchTo ?? 0, t) : -0.1;
    const f = this.facing + angle;
    const cp = Math.cos(pitch);
    this.dir.set(-Math.sin(f) * cp, Math.sin(pitch), -Math.cos(f) * cp);
    this.hilt.copy(this.position).addScaledVector(UP, shape.height).addScaledVector(this.dir, 0.35);
    this.tip.copy(this.hilt).addScaledVector(this.dir, shape.reach);
  }

  private blinkAway(distance: number, ctx: AIContext): void {
    const p = ctx.player.controller.position;
    const away = this.tmp.set(this.position.x - p.x, 0, this.position.z - p.z).normalize();
    for (let tries = 0; tries < 6; tries++) {
      const a = (Math.random() - 0.5) * 1.6;
      const d = away.clone().applyAxisAngle(UP, a);
      const x = this.position.x + d.x * distance, z = this.position.z + d.z * distance;
      const y = ctx.colliders.heightAt(x, z);
      if (y < 0.2 || Math.abs(y - this.position.y) > 6) continue;
      ctx.effects.sparkBurst(this.eye(this.tmp2), UP, this.spec.fxColor, 14, 5);
      ctx.effects.ring(this.position.clone().setY(this.position.y + 0.1), this.spec.fxColor, 1.8, 0.35);
      this.position.set(x, y, z);
      ctx.effects.sparkBurst(this.eye(this.tmp2), UP, this.spec.fxColor, 14, 5);
      return;
    }
  }

  // --- defence -------------------------------------------------------------

  protected receive(hit: HitInfo): Received {
    if (hit.parry) {
      // Parried: reel back, exposed for the riposte.
      this.attack = null;
      this.exposed = 2.0;
      this.model?.play('stagger', { fade: 0.08, restart: true });
      return { damage: 0, stagger: 2.0 };
    }
    this.forward(this.tmp);
    const fromBehind = hit.direction.x * this.tmp.x + hit.direction.z * this.tmp.z > 0.35;
    let damage = hit.damage;
    let critical = false;
    if (fromBehind) { damage *= 1.3; critical = true; }
    if (this.exposed > 0) { damage *= 1.6; critical = true; }
    this.poiseDelay = 2;
    this.poise -= (POISE[hit.kind] ?? 15) * (hit.stagger >= 1 ? 1.5 : 1);
    if (this.poise <= 0) {
      this.poise = this.spec.poise;
      this.exposed = 1.4;
      return { damage, stagger: 1.6, critical: true };
    }
    const magic = hit.kind === 'burst' || hit.kind === 'reflect' || hit.kind === 'spell' || hit.kind === 'bolt';
    if (this.guarding && !fromBehind && this.exposed <= 0 && !magic && this.spec.guard !== undefined) {
      return { damage: damage * this.spec.guard, stagger: 0, blocked: true };
    }
    const attacking = this.state === 'windup' || this.state === 'strike';
    const armoured = attacking && !!this.attack?.armour;
    const interrupts = HEAVY.includes(hit.kind) || hit.stagger >= 1;
    // Poise holds: light blows only flinch an idle foe; armoured swings need a heavy blow.
    const stagger = attacking ? (interrupts && !armoured ? hit.stagger : 0) : hit.stagger >= 0.3 ? Math.min(hit.stagger, 0.5) : 0;
    if (stagger === 0 && damage > 0) this.model?.play('hit', { fade: 0.05, restart: true });
    return { damage, stagger, critical };
  }

  protected onStagger(): void {
    super.onStagger();
    this.attack = null;
    this.guarding = false;
    this.model?.play(this.staggerTimer > 0.9 && this.model.has('stagger') ? 'stagger' : 'hit', { fade: 0.06, restart: true });
  }

  protected recoverFromStagger(): void {
    this.cooldown = 0.5;
    this.setState('recover');
  }

  protected onDeath(): void {
    super.onDeath();
    this.model?.play('death', { fade: 0.1, restart: true });
  }

  protected deathPose(dt: number, t: number): void {
    this.model?.update(dt);
    if (this.spec.fly) this.visual.position.y = Math.max(-this.spec.fly, this.visual.position.y - dt * 6);
    if (t > 0) this.visual.position.y -= dt * 0.2;
  }

  // --- physics and presentation ----------------------------------------------------------

  protected physics(dt: number, ctx: AIContext): void {
    super.physics(dt, ctx);
    if (this.spec.fly) {
      // Hover: the body keeps its collider on the ground; the model floats above it.
      const diving = this.state === 'strike' && this.attack?.shape.kind === 'lunge';
      const want = diving ? 0.8 : this.spec.fly + Math.sin(ctx.clock * 2 + this.home.x) * 0.3;
      this.visual.position.y += (want - this.visual.position.y) * (1 - Math.exp(-dt * (diving ? 8 : 3)));
    }
  }

  protected animate(dt: number, ctx: AIContext): void {
    void ctx;
    const m = this.model;
    if (!m) return;
    m.flash(this.hitFlash);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.state === 'windup' || this.state === 'strike' || this.state === 'recover') {
      // The attack clip runs through all three phases.
      if (this.state === 'recover' && this.attack && m.current === this.attack.clip && this.stateTime > this.attack.recovery * 0.6) {
        m.play('idle', { fade: 0.3 });
      }
    } else if (this.state === 'staggered') {
      // Stagger/hit clips play from onStagger.
    } else if (this.guarding && m.has('block') && speed < 1.5) {
      m.play('block', { fade: 0.25 });
    } else if (speed > this.spec.walk + 0.8) {
      m.play('run', { fade: 0.2, speed: speed / this.spec.run });
    } else if (speed > 0.5) {
      m.play('walk', { fade: 0.2, speed: Math.max(0.6, speed / this.spec.walk) });
    } else {
      m.play('idle', { fade: 0.3 });
    }
    m.update(dt * (this.slowTimer > 0 ? 0.55 : 1));
    void this.weapon;
  }
}
