import * as THREE from 'three';
import type { HitInfo } from '../../combat/types';
import type { AIContext } from '../AIContext';
import { Enemy, type Received } from '../Enemy';

export type BossKind = 'beast' | 'dragon' | 'sovereign' | 'knight' | 'caster' | 'swarm';

export interface BossDef {
  id: string;
  kind: BossKind;
  name: string;
  epithet: string;
  chapter: number;
  health: number;
  /** Health fractions at which the next phase begins (descending), e.g. [0.6, 0.25]. */
  phases: number[];
  /** Posture: damage it can absorb before breaking into a long stun. */
  poise: number;
  /** Arena veil and effect colour. */
  color?: number;
  /** What the fight feels like, for the title card and the journal. */
  remembrance?: string;
}

/** One boss attack, run as a timed script. */
export interface BossMove {
  id: string;
  /** Phases (0-based) in which it may be chosen; all when omitted. */
  phases?: number[];
  /** Distance band to the player where it makes sense. */
  range?: [number, number];
  weight: number;
  cooldown: number;
  duration: number;
  /** A parry during this move's `parryWindow` (seconds into the move) staggers the boss. */
  parryWindow?: [number, number];
  when?: (ctx: AIContext) => boolean;
  start?: (ctx: AIContext) => void;
  tick: (t: number, dt: number, ctx: AIContext) => void;
  end?: (ctx: AIContext) => void;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Boss framework (Job 8). Bosses are enemies with phases, a weighted move scheduler,
 * posture instead of flinching, parry windows on specific moves, and an arena they
 * never leave. Subclasses supply the model and the move list.
 */
export abstract class Boss extends Enemy {
  readonly kind = 'boss' as const;
  readonly isBoss = true;
  phase = 0;
  current: BossMove | null = null;
  moveTime = 0;
  posture: number;
  exposed = 0;
  /** True during the cinematic intro: the boss only poses. */
  presenting = true;
  readonly arena = new THREE.Vector3();
  arenaRadius = 30;
  /** Every move started, in order (tests and tuning). */
  readonly history: string[] = [];
  protected rest = 1.4;
  protected transition = 0;
  protected readonly moves: BossMove[] = [];
  private readonly cooldowns = new Map<string, number>();
  private postureDelay = 0;

  constructor(readonly def: BossDef, radius: number, height: number) {
    super(radius, height, def.health, { sight: 90, fov: Math.PI, hearing: 90, gain: 10, forget: 60 });
    this.posture = def.poise;
    this.mass = 8;
    this.staggerResist = 1;
    this.showBar = false;
    this.spawnDuration = 0.01;
  }

  get displayName(): string { return this.def.name; }

  get healthFraction(): number {
    return this.health / this.maxHealth;
  }

  /** Called by the arena when the fight begins. */
  begin(ctx: AIContext): void {
    this.presenting = false;
    this.perception.alert(ctx.player.controller.position);
    this.rest = 0.8;
  }

  protected think(dt: number, ctx: AIContext): void {
    this.exposed = Math.max(0, this.exposed - dt);
    for (const [id, t] of this.cooldowns) this.cooldowns.set(id, t - dt);
    this.postureDelay -= dt;
    if (this.postureDelay <= 0) this.posture = Math.min(this.def.poise, this.posture + dt * this.def.poise * 0.08);
    if (this.presenting) { this.idle(dt, ctx); return; }

    // Phase changes interrupt everything with a roar (and a brief immunity).
    const next = this.def.phases.filter(t => this.healthFraction <= t).length;
    if (next > this.phase) {
      this.phase = next;
      this.abortMove(ctx);
      this.transition = 1.8;
      this.onPhase(this.phase, ctx);
    }
    if (this.transition > 0) {
      this.transition -= dt;
      this.stop();
      this.roaring(dt, ctx);
      return;
    }

    if (this.current) {
      this.moveTime += dt;
      this.current.tick(this.moveTime, dt, ctx);
      if (this.current && this.moveTime >= this.current.duration) this.finishMove(ctx);
      this.keepInArena();
      return;
    }
    this.rest -= dt;
    this.locomotion(dt, ctx);
    if (this.rest <= 0) this.pickMove(ctx);
    this.keepInArena();
  }

  private pickMove(ctx: AIContext): void {
    const d = this.distanceToPlayer(ctx);
    const options = this.moves.filter(m =>
      (!m.phases || m.phases.includes(this.phase)) &&
      (!m.range || (d >= m.range[0] && d <= m.range[1])) &&
      (this.cooldowns.get(m.id) ?? 0) <= 0 &&
      (!m.when || m.when(ctx)));
    if (!options.length) { this.rest = 0.2; return; }
    let roll = Math.random() * options.reduce((a, m) => a + m.weight, 0);
    const move = options.find(m => (roll -= m.weight) <= 0) ?? options[0];
    this.startMove(move, ctx);
  }

  /** Forces a specific move (tests, scripted openings). */
  startMove(move: BossMove | string, ctx: AIContext): void {
    const m = typeof move === 'string' ? this.moves.find(x => x.id === move)! : move;
    this.current = m;
    this.moveTime = 0;
    this.cooldowns.set(m.id, m.cooldown);
    this.history.push(m.id);
    m.start?.(ctx);
  }

  private finishMove(ctx: AIContext): void {
    this.current?.end?.(ctx);
    this.current = null;
    this.rest = this.restTime();
  }

  protected abortMove(ctx: AIContext): void {
    if (this.current) this.current.end?.(ctx);
    this.current = null;
    this.rest = 0.6;
  }

  protected restTime(): number {
    return [1.3, 0.95, 0.7][Math.min(2, this.phase)] + Math.random() * 0.5;
  }

  moveIds(): string[] {
    return this.moves.map(m => m.id);
  }

  private keepInArena(): void {
    const dx = this.position.x - this.arena.x, dz = this.position.z - this.arena.z;
    const d = Math.hypot(dx, dz);
    const max = this.arenaRadius - this.bodyRadius - 1;
    if (d > max) {
      this.position.x = this.arena.x + (dx / d) * max;
      this.position.z = this.arena.z + (dz / d) * max;
    }
  }

  protected receive(hit: HitInfo): Received {
    if (this.presenting) return { damage: 0, stagger: 0 };
    if (this.transition > 0) return { damage: hit.damage * 0.25, stagger: 0 };
    if (hit.parry) {
      const window = this.current?.parryWindow;
      if (window && this.moveTime >= window[0] - 0.25 && this.moveTime <= window[1] + 0.15) {
        this.exposed = 2.4;
        this.posture -= this.def.poise * 0.35;
        return { damage: 0, stagger: 2.2, critical: true };
      }
      return { damage: 0, stagger: 0 };
    }
    let damage = hit.damage;
    let critical = false;
    this.forward(this.tmp);
    const fromBehind = hit.direction.x * this.tmp.x + hit.direction.z * this.tmp.z > 0.35;
    if (fromBehind) { damage *= 1.3; critical = true; }
    if (this.exposed > 0) { damage *= 1.5; critical = true; }
    if (hit.kind === 'plunge' || hit.kind === 'reflect') { damage *= 1.25; critical = true; }
    // Posture: heavy tools and spells break it; a broken boss collapses for a while.
    const postureHit = { light: 1, spin: 1.4, thrust: 1.1, sweep: 1.2, heavy: 2.4, plunge: 2.6, riposte: 3, burst: 1.6, reflect: 2.5, wave: 1.2, bolt: 0.4, spell: 1.4 }[hit.kind as string] ?? 1;
    this.posture -= hit.damage * postureHit;
    this.postureDelay = 3;
    if (this.posture <= 0) {
      this.posture = this.def.poise;
      this.exposed = 3.5;
      return { damage, stagger: 3.2, critical: true };
    }
    return { damage, stagger: 0, critical };
  }

  protected onStagger(): void {
    super.onStagger();
    if (this.current) { this.current = null; this.rest = 0.5; }
  }

  protected recoverFromStagger(): void {
    this.setState('idle');
    this.rest = 0.6;
  }

  /** Resets for another attempt (player died or fled). */
  resetFight(): void {
    this.health = this.maxHealth;
    this.phase = 0;
    this.current = null;
    this.posture = this.def.poise;
    this.exposed = 0;
    this.presenting = true;
    this.transition = 0;
    this.position.copy(this.home);
    this.velocity.set(0, 0, 0);
    this.staggerTimer = 0;
    this.setState('idle');
  }

  /** Helper: a point `dist` ahead of the boss on the ground. */
  protected ahead(dist: number, ctx: AIContext, out = new THREE.Vector3()): THREE.Vector3 {
    this.forward(out);
    out.multiplyScalar(dist).add(this.position);
    out.y = ctx.colliders.heightAt(out.x, out.z);
    return out;
  }

  /** Helper: strikes the player inside a cone in front of the boss (sweeps, bites). */
  protected hitCone(radius: number, halfAngle: number, damage: number, ctx: AIContext, knockback = 9, stagger = 0.45): boolean {
    const p = ctx.player.controller.position;
    if (!ctx.player.combat.alive) return false;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    if (d > radius + 0.4 || Math.abs(this.angleToPlayer(ctx)) > halfAngle) return false;
    if (Math.abs(p.y - this.position.y) > 5) return false;
    this.forward(this.tmp2);
    const r = ctx.combat.strike(ctx.player.combat, {
      damage, direction: this.tmp2.clone(), point: p.clone().addScaledVector(UP, 1), knockback, stagger,
      source: 'enemy', kind: 'enemy', attacker: this,
    });
    return r.hit;
  }

  /** Helper: is the player within `width/2` of the segment a→b? */
  protected inLane(a: THREE.Vector3, b: THREE.Vector3, width: number, ctx: AIContext): boolean {
    const p = ctx.player.controller.position;
    const abx = b.x - a.x, abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
    return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)) <= width / 2 + 0.4 && Math.abs(p.y - a.y) < 4;
  }

  /** Swaps the stand-in body for a loaded model (kept on the visual group). */
  protected attachModel(model: THREE.Object3D, standIn: THREE.Object3D): void {
    standIn.visible = false;
    model.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; } });
    this.visual.add(model);
  }

  /** Helper: strikes the player if inside a circle (area attacks). */
  protected hitCircle(center: THREE.Vector3, radius: number, damage: number, ctx: AIContext, knockback = 8, stagger = 0.4, kind: 'enemy' | 'hazard' = 'enemy'): boolean {
    const p = ctx.player.controller.position;
    if (!ctx.player.combat.alive) return false;
    if (Math.hypot(p.x - center.x, p.z - center.z) > radius + 0.4 || Math.abs(p.y - center.y) > 4) return false;
    const dir = new THREE.Vector3(p.x - center.x, 0, p.z - center.z);
    if (dir.lengthSq() < 1e-4) this.forward(dir);
    const r = ctx.combat.strike(ctx.player.combat, {
      damage, direction: dir.normalize(), point: p.clone().addScaledVector(UP, 1), knockback, stagger,
      source: 'enemy', kind, attacker: this,
    });
    return r.hit;
  }

  protected abstract idle(dt: number, ctx: AIContext): void;
  protected abstract roaring(dt: number, ctx: AIContext): void;
  protected abstract locomotion(dt: number, ctx: AIContext): void;
  protected onPhase(_phase: number, ctx: AIContext): void {
    ctx.effects.ring(this.position.clone().addScaledVector(UP, 0.3), 0xffffff, 14, 0.8);
    ctx.time.hitStop(0.12);
    ctx.player.camera.addShake(0.8);
  }
}
