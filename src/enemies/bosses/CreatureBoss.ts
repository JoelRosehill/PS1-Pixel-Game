import * as THREE from 'three';
import type { CreatureId, CreatureLibrary, CreatureModel, CreatureOptions } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { OrbKind } from '../EnemyProjectiles';
import type { AIContext } from '../AIContext';
import { Boss, type BossDef, type BossMove } from './Boss';

const UP = new THREE.Vector3(0, 1, 0);

/** Everything a boss is built from besides its move list. */
export interface BossBody {
  creature: CreatureId;
  height: number;
  radius: number;
  bodyHeight: number;
  tint?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** Colour of rings, telegraphs and sparks. */
  color: number;
  /** Walk / run speeds (m/s) between moves. */
  walk: number;
  run: number;
  /** Distance it likes to hold between moves. */
  keep: number;
}

/**
 * A boss made from a Creature Forge model (Job 14). Adds the model, clip playback that
 * lands each move's hit event on the frame its damage connects, locomotion clips,
 * flight (for the dragon and the Hive Queen) and a small vocabulary of move helpers so
 * boss files read like fight choreography.
 */
export abstract class CreatureBoss extends Boss {
  model: CreatureModel | null = null;
  readonly body: BossBody;
  /** Flying bosses hover `altitude` metres over the ground while `airborne`. */
  airborne = false;
  altitude = 0;
  protected orbit = 0;
  private readonly standIn: THREE.Mesh;
  private clipLock = 0;

  constructor(def: BossDef, body: BossBody, protected readonly creatures: CreatureLibrary | null, protected readonly models: ModelLibrary | null) {
    super(def, body.radius, body.bodyHeight);
    this.body = body;
    this.fxColor = body.color;
    this.deathDelay = 2.6;
    this.group.name = `boss:${def.id}`;
    this.standIn = new THREE.Mesh(new THREE.CapsuleGeometry(body.radius, Math.max(0.2, body.bodyHeight - body.radius * 2), 2, 8),
      this.skin(body.tint ?? 0x4a3a5a));
    this.standIn.position.y = body.bodyHeight / 2;
    this.visual.add(this.standIn);
    this.attach(this.makeModel(body.creature, body.height, body));
  }

  /** Creates a creature instance with this boss's dissolve (riders, halos use it too). */
  protected makeModel(id: CreatureId, height: number, look: Partial<CreatureOptions> = {}): CreatureModel | null {
    return this.creatures?.create(id, { height, tint: look.tint, emissive: look.emissive, emissiveIntensity: look.emissiveIntensity,
      dissolve: this.dissolve }) ?? null;
  }

  private attach(model: CreatureModel | null): void {
    if (!model) return;
    this.model = model;
    this.standIn.visible = false;
    this.visual.add(model.root);
    model.play('idle', { fade: 0 });
  }

  // --- clip helpers --------------------------------------------------------------------

  /** Plays `clip` so that its 'hit' event lands `hitAt` seconds from now. */
  protected act(clip: string, hitAt?: number, event = 'hit'): void {
    const m = this.model;
    if (!m?.has(clip)) return;
    const at = m.event(clip, event);
    const speed = hitAt && at > 0 ? at / hitAt : 1;
    m.play(clip, { fade: 0.12, restart: true, speed });
    this.clipLock = hitAt ? hitAt + (m.length(clip) - at) / Math.max(0.2, speed) : m.length(clip) / Math.max(0.2, speed);
  }

  /** Plays `clip` stretched to last `seconds` (charges, channels, loops). */
  protected hold(clip: string, seconds: number, speed = 1): void {
    this.model?.play(clip, { fade: 0.15, restart: false, speed });
    this.clipLock = seconds;
  }

  /** True once, on the step that crosses `at` seconds into the move. */
  protected at(t: number, at: number, dt: number): boolean {
    return t >= at && t - dt < at;
  }

  // --- attack helpers -----------------------------------------------------------------------

  /** Orbs from a socket (mouth/grip/head) toward the player. */
  protected volleyOrbs(ctx: AIContext, count: number, spread: number, speed: number, damage: number, homing = 0.8, orb: OrbKind = 'sun',
    size = 1.4, socket = 'mouth'): void {
    const from = this.model?.bone(socket) ? this.model.socket(socket, new THREE.Vector3()) : this.position.clone().addScaledVector(UP, this.bodyHeight * 0.8);
    const toward = ctx.playerEye.clone().sub(from).normalize();
    for (let i = 0; i < count; i++) {
      const d = toward.clone().applyAxisAngle(UP, (i - (count - 1) / 2) * spread);
      ctx.projectiles.fire(from, d, speed, damage, this, homing, orb, size);
    }
  }

  /** Telegraphed strikes falling around the player (and where they are heading). */
  protected rain(ctx: AIContext, count: number, radius: number, delay: number, spread: number, damage: number, color = this.body.color): void {
    const p = ctx.player.controller.position, v = ctx.player.controller.velocity;
    for (let i = 0; i < count; i++) {
      const lead = i === 0 ? 0 : 0.5;
      const pt = new THREE.Vector3(p.x + v.x * lead + (i ? (Math.random() - 0.5) * spread * 2 : 0), 0,
        p.z + v.z * lead + (i ? (Math.random() - 0.5) * spread * 2 : 0));
      pt.y = ctx.colliders.heightAt(pt.x, pt.z);
      ctx.telegraphs.schedule(pt, radius, delay + i * 0.12, color, (point, r) => {
        ctx.telegraphs.pillar(point, r, 22, color);
        ctx.effects.sparkBurst(point, UP, color, 10, 6);
        this.hitCircle(point, r, damage, ctx, 7, 0.45, 'hazard');
      });
    }
  }

  /** A charge along a telegraphed lane: `wind` seconds of tell, then `speed` m/s. */
  protected chargeLane(ctx: AIContext, length: number, width: number, wind: number): { from: THREE.Vector3; to: THREE.Vector3 } {
    const p = ctx.player.controller.position;
    const dir = new THREE.Vector3(p.x - this.position.x, 0, p.z - this.position.z).normalize();
    const from = this.position.clone();
    const to = from.clone().addScaledVector(dir, length);
    to.y = ctx.colliders.heightAt(to.x, to.z);
    this.facing = Math.atan2(-dir.x, -dir.z);
    ctx.telegraphs.lane(from, to, width, wind, this.body.color);
    return { from, to };
  }

  /** A slam: marks the ground now, lands after `delay` with an optional shockwave. */
  protected slam(ctx: AIContext, point: THREE.Vector3, radius: number, delay: number, damage: number, shockwave = 0): void {
    ctx.telegraphs.circle(point, radius, delay, this.body.color);
    this.slamAt = point.clone();
    this.slamRadius = radius;
    this.slamDamage = damage;
    this.slamShock = shockwave;
  }
  private slamAt: THREE.Vector3 | null = null;
  private slamRadius = 0;
  private slamDamage = 0;
  private slamShock = 0;

  /** Lands the pending slam (call on the step the blow connects). */
  protected landSlam(ctx: AIContext): void {
    const p = this.slamAt;
    if (!p) return;
    this.slamAt = null;
    this.hitCircle(p, this.slamRadius, this.slamDamage, ctx, 11, 0.6);
    ctx.effects.ring(p.clone().setY(p.y + 0.1), this.body.color, this.slamRadius * 1.3, 0.45);
    ctx.effects.sparkBurst(p, UP, this.body.color, 30, 9);
    ctx.player.camera.addShake(0.8);
    if (this.slamShock) ctx.hazards.shockwave(p.clone(), 13, this.slamShock, this.slamDamage * 0.45, this.body.color, this);
  }

  /** Ahead of the boss by `dist`, on the ground. */
  protected point(dist: number, ctx: AIContext): THREE.Vector3 {
    return this.ahead(dist, ctx);
  }

  // --- flight ----------------------------------------------------------------------------------

  protected physics(dt: number, ctx: AIContext): void {
    if (!this.airborne) { super.physics(dt, ctx); return; }
    // In the air the body flies to its target height; no gravity, no ground collision.
    const ground = ctx.colliders.heightAt(this.position.x, this.position.z);
    const k = 1 - Math.exp(-this.accel * dt);
    this.velocity.x += (this.moveWish.x * this.moveSpeed - this.velocity.x) * k;
    this.velocity.z += (this.moveWish.z * this.moveSpeed - this.velocity.z) * k;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    const want = ground + this.altitude;
    this.position.y += (want - this.position.y) * Math.min(1, dt * 2.2);
    this.velocity.y = 0;
    this.grounded = false;
  }

  /** Circles the arena at altitude, facing along the orbit (idle flight). */
  protected circleArena(dt: number, radius: number, speed: number): void {
    this.orbit += dt * speed;
    const tx = this.arena.x + Math.sin(this.orbit) * radius, tz = this.arena.z + Math.cos(this.orbit) * radius;
    this.move(tx - this.position.x, tz - this.position.z, Math.min(28, Math.hypot(tx - this.position.x, tz - this.position.z) * 2.5));
    this.facing = Math.atan2(-Math.cos(this.orbit), Math.sin(this.orbit));
  }

  // --- presentation ------------------------------------------------------------------------------

  protected idle(dt: number, ctx: AIContext): void {
    this.stop();
    this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 0.8, dt);
  }

  protected roaring(dt: number, ctx: AIContext): void {
    if (this.transition > 1.75 && this.model?.has('roar')) this.act('roar');
    if (this.transition > 1.7) ctx.effects.ring(this.position.clone().addScaledVector(UP, 0.5), this.body.color, 18, 0.9);
    void dt;
  }

  protected locomotion(dt: number, ctx: AIContext): void {
    const p = ctx.player.controller.position;
    this.turnToward(p.x, p.z, this.phase ? 2.4 : 1.8, dt);
    const d = this.distanceToPlayer(ctx);
    if (d > this.body.keep + 2) this.move(p.x - this.position.x, p.z - this.position.z, d > this.body.keep + 10 ? this.body.run : this.body.walk);
    else if (d < this.body.keep - 2) this.move(this.position.x - p.x, this.position.z - p.z, this.body.walk * 0.7);
    else this.stop();
  }

  protected onStagger(): void {
    super.onStagger();
    this.clipLock = 0;
    if (this.model?.has('stagger')) this.act('stagger');
  }

  protected onDeath(): void {
    super.onDeath();
    this.airborne = false;
    this.clipLock = 99;
    this.model?.play('death', { fade: 0.15, restart: true });
  }

  protected deathPose(dt: number, t: number): void {
    this.model?.update(dt);
    // A flier falls out of the sky.
    const ground = this.home.y;
    if (this.position.y > ground + 0.05) { this.velocity.y -= 30 * dt; this.position.y = Math.max(ground, this.position.y + this.velocity.y * dt); }
    if (t > 0) this.visual.position.y -= dt * 0.3;
  }

  resetFight(): void {
    super.resetFight();
    this.clipLock = 0;
    this.visual.position.y = 0;
    this.model?.play('idle', { fade: 0 });
  }

  /** Extra per-step presentation (riders, halos). */
  protected dress(_dt: number): void {}

  protected animate(dt: number): void {
    const m = this.model;
    this.dress(dt);
    if (!m) return;
    m.flash(this.hitFlash);
    this.clipLock -= dt;
    if (this.clipLock <= 0 && this.state !== 'staggered') {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.airborne) {
        // Dragons have flight clips; the bee's hovering walk/run cycles serve as its flight.
        if (m.has('fly')) m.play(speed > 8 || !m.has('hover') ? 'fly' : 'hover', { fade: 0.35 });
        else m.play(speed > 6 && m.has('run') ? 'run' : 'walk', { fade: 0.3 });
      }
      else if (speed > this.body.walk + 1 && m.has('run')) m.play('run', { fade: 0.25, speed: Math.min(1.6, speed / this.body.run) });
      else if (speed > 0.6) m.play('walk', { fade: 0.25, speed: Math.min(1.8, Math.max(0.6, speed / this.body.walk)) });
      else m.play('idle', { fade: 0.35 });
    }
    m.update(dt);
  }

  /** Registers moves (subclasses call from their constructor). */
  protected add(...moves: BossMove[]): void {
    this.moves.push(...moves);
  }
}
