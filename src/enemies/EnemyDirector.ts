import * as THREE from 'three';
import type { CombatWorld } from '../combat/CombatWorld';
import type { Damageable, HitInfo, HitResult } from '../combat/types';
import type { GameSystem } from '../core/Game';
import type { TimeControl } from '../core/TimeControl';
import type { ColliderWorld } from '../physics/Colliders';
import type { Player } from '../player/Player';
import type { Effects } from '../render/effects/Effects';
import type { AIContext } from './AIContext';
import { AttackTokens } from './AttackTokens';
import { Enemy, type EnemyKind } from './Enemy';
import { EnemyProjectiles } from './EnemyProjectiles';
import { Encounter, type EncounterDef } from './Encounters';
import { ShadowKnight } from './ShadowKnight';
import { SunkeeperWizard } from './SunkeeperWizard';
import { Telegraphs } from './Telegraphs';

const UP = new THREE.Vector3(0, 1, 0);

export interface SpawnOptions {
  y?: number;
  facing?: number;
  rise?: boolean;
  encounterId?: string;
  perches?: THREE.Vector3[];
  alert?: boolean;
}

/**
 * Owns every live enemy, the shared attack tokens, telegraphs and hostile projectiles,
 * and the encounters that raise enemies when the player arrives (Job 5).
 * A fixed-step `GameSystem`: book/wheel pause and hit-stop apply automatically.
 */
export class EnemyDirector implements GameSystem {
  readonly group = new THREE.Group();
  readonly enemies: Enemy[] = [];
  readonly encounters: Encounter[];
  readonly tokens = new AttackTokens();
  readonly telegraphs = new Telegraphs();
  readonly projectiles = new EnemyProjectiles();
  readonly ctx: AIContext;
  /** The enemy the player is fighting (target frame). */
  focus: Enemy | null = null;
  kills = 0;
  /** Title-card hook (encounter start / cleared). */
  onAnnounce: (title: string, subtitle: string) => void = () => {};
  /** Fired once when an encounter is cleared. */
  onCleared: (encounter: Encounter) => void = () => {};

  private readonly aim = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

  constructor(private readonly deps: {
    player: Player;
    colliders: ColliderWorld;
    combat: CombatWorld;
    effects: Effects;
    time: TimeControl;
    encounters?: EncounterDef[];
    blind: (seconds: number, strength: number) => void;
  }) {
    this.group.name = 'enemies';
    this.group.add(this.telegraphs.group, this.projectiles.group);
    this.encounters = (deps.encounters ?? []).map(d => new Encounter(d));
    this.ctx = {
      player: deps.player, colliders: deps.colliders, combat: deps.combat, effects: deps.effects, time: deps.time,
      tokens: this.tokens, telegraphs: this.telegraphs, projectiles: this.projectiles,
      blind: deps.blind, clock: 0, playerEye: new THREE.Vector3(),
    };
  }

  // --- spawning ------------------------------------------------------------

  spawn(kind: EnemyKind, x: number, z: number, opts: SpawnOptions = {}): Enemy {
    const enemy = kind === 'knight' ? new ShadowKnight() : new SunkeeperWizard();
    const y = opts.y ?? this.deps.colliders.heightAt(x, z);
    enemy.spawn(x, y, z, opts.facing ?? 0, opts.rise ?? true);
    enemy.tokens = this.tokens;
    enemy.encounterId = opts.encounterId ?? '';
    if (enemy instanceof SunkeeperWizard && opts.perches) enemy.perches = opts.perches;
    if (opts.alert) enemy.perception.alert(this.deps.player.controller.position);
    this.enemies.push(enemy);
    this.group.add(enemy.group);
    this.deps.combat.register(enemy);
    this.deps.colliders.addBody(enemy.collider);
    if (opts.rise ?? true) {
      this.deps.effects.ring(enemy.position.clone().setY(y + 0.1), kind === 'knight' ? 0x9a5aff : 0xffd36a, 2.4, 0.9);
      this.deps.effects.sparkBurst(enemy.position.clone().setY(y + 0.2), UP, kind === 'knight' ? 0xb07cff : 0xffe9a0, 18, 5);
    }
    return enemy;
  }

  remove(enemy: Enemy): void {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
    enemy.cancelAction();
    enemy.group.removeFromParent();
    this.deps.combat.unregister(enemy);
    this.deps.colliders.removeBody(enemy.collider);
    if (this.focus === enemy) this.focus = null;
  }

  /** Despawns everything and returns every encounter to dormant (tests, level change). */
  clear(): void {
    for (const e of [...this.enemies]) this.remove(e);
    for (const enc of this.encounters) { enc.state = 'dormant'; enc.wave = 0; enc.enemies.length = 0; enc.pendingReset = false; }
    this.tokens.clear();
    this.telegraphs.clear();
    this.projectiles.clear();
  }

  // --- simulation ----------------------------------------------------------

  fixedUpdate(dt: number): void {
    const ctx = this.ctx;
    const player = this.deps.player;
    ctx.clock += dt;
    const c = player.controller;
    ctx.playerEye.copy(c.position).addScaledVector(UP, c.capsuleHeight - 0.25);
    if (!player.active) return; // debug fly camera: the world holds still
    this.tokens.update(dt);
    this.updateEncounters(dt);

    for (const enemy of [...this.enemies]) {
      enemy.update(dt, ctx);
      if (enemy.takeDeath()) this.onDeath(enemy);
      if (enemy.removed) this.remove(enemy);
    }
    this.shareAlerts();
    this.projectiles.fixedUpdate(dt, ctx);
    this.telegraphs.fixedUpdate(dt);
    this.telegraphs.update(dt, ctx.clock);
  }

  /** An alerted enemy rouses its encounter companions. */
  private shareAlerts(): void {
    const p = this.deps.player.controller.position;
    for (const a of this.enemies) {
      if (!a.alive || !a.perception.alerted || !a.perception.canSee) continue;
      for (const b of this.enemies) {
        if (b === a || !b.alive || b.perception.alerted) continue;
        if (b.encounterId !== a.encounterId && b.position.distanceTo(a.position) > 18) continue;
        b.perception.alert(p);
      }
    }
  }

  private onDeath(enemy: Enemy): void {
    this.kills++;
    const chest = enemy.position.clone().addScaledVector(UP, enemy.bodyHeight * 0.6);
    const color = enemy.kind === 'knight' ? 0xb07cff : 0xffd36a;
    this.deps.effects.sparkBurst(chest, UP, color, 30, 7);
    this.deps.effects.ring(enemy.position.clone().setY(enemy.position.y + 0.1), color, 3, 0.6);
    this.deps.time.slowMotion(0.4, 0.25);
    // Felling a foe feeds the Momentum loop.
    this.deps.player.combat.momentum.add(enemy.kind === 'knight' ? 15 : 10);
  }

  private updateEncounters(dt: number): void {
    const player = this.deps.player;
    const p = player.controller.position;
    const alive = player.combat.alive;
    for (const enc of this.encounters) {
      const t = enc.def.trigger;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (enc.state === 'dormant') {
        if (alive && d < t.radius) this.activate(enc);
        continue;
      }
      if (enc.state !== 'active') continue;
      if (!alive) enc.pendingReset = true;
      if (enc.pendingReset) {
        if (alive) this.resetEncounter(enc);
        continue;
      }
      enc.awayTime = d > t.radius + (enc.def.leash ?? 30) ? enc.awayTime + dt : 0;
      if (enc.awayTime > 8) { this.resetEncounter(enc); continue; }
      if (enc.living.length > 0) { enc.waveDelay = 0; continue; }
      enc.waveDelay += dt;
      if (enc.waveDelay < 1.2) continue;
      enc.wave++;
      enc.waveDelay = 0;
      if (enc.wave < enc.def.waves.length) this.spawnWave(enc);
      else this.clearEncounter(enc);
    }
  }

  private activate(enc: Encounter): void {
    enc.state = 'active';
    enc.wave = 0;
    enc.waveDelay = 0;
    enc.awayTime = 0;
    this.spawnWave(enc);
    this.onAnnounce(enc.def.name.toUpperCase(), enc.def.waves.length > 1 ? `${enc.def.waves.length} waves` : 'They rise');
  }

  private spawnWave(enc: Encounter): void {
    const t = enc.def.trigger;
    const perches = (enc.def.perches ?? []).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    for (const s of enc.def.waves[enc.wave]) {
      const facing = s.facing ?? Math.atan2(-(t.x - s.x), -(t.z - s.z));
      const enemy = this.spawn(s.kind, s.x, s.z, { y: s.y, facing, encounterId: enc.def.id, perches, alert: true });
      enc.enemies.push(enemy);
    }
  }

  private resetEncounter(enc: Encounter): void {
    for (const e of enc.enemies) if (this.enemies.includes(e)) this.remove(e);
    enc.enemies.length = 0;
    enc.state = 'dormant';
    enc.wave = 0;
    enc.pendingReset = false;
    enc.awayTime = 0;
  }

  private clearEncounter(enc: Encounter): void {
    enc.state = 'cleared';
    enc.timesCleared++;
    enc.enemies.length = 0;
    const reward = enc.def.reward ?? { vigour: 35, momentum: 30 };
    const combat = this.deps.player.combat;
    combat.health = Math.min(100, combat.health + reward.vigour);
    combat.momentum.add(reward.momentum);
    this.onAnnounce('ENCOUNTER CLEARED', enc.def.name);
    this.onCleared(enc);
  }

  // --- presentation --------------------------------------------------------

  /** Combat callback: tracks the fought enemy and adds block / weak-point feedback. */
  onHit(target: Damageable, hit: HitInfo, result: HitResult): void {
    if (!(target instanceof Enemy) || hit.source !== 'player') return;
    this.focus = target;
    const fx = this.deps.effects;
    if (result.blocked) {
      fx.sparkBurst(hit.point, hit.direction.clone().negate().setY(0.4), 0xc8d8ff, 14, 7);
      fx.ring(hit.point, 0xc8d8ff, 0.9, 0.2, true);
    } else if (result.critical) {
      fx.number(hit.point.clone().addScaledVector(UP, 0.8), '!', 0xffe070, 1.5);
      fx.ring(hit.point, 0xffe070, 1.3, 0.3, true);
    }
  }

  /** Per render frame: pick the target-frame enemy (aimed-at, else last struck). */
  update(): void {
    const player = this.deps.player;
    player.camera.aimDirection(this.aim);
    const eye = this.ctx.playerEye;
    let best: Enemy | null = null;
    let bestAngle = 0.3;
    for (const e of this.enemies) {
      if (!e.alive || e.spawning || !e.perception.alerted) continue;
      this.to.copy(e.position).addScaledVector(UP, e.bodyHeight * 0.6).sub(eye);
      const dist = this.to.length();
      if (dist > 45) continue;
      const angle = Math.acos(THREE.MathUtils.clamp(this.to.divideScalar(dist).dot(this.aim), -1, 1));
      if (angle < bestAngle) { bestAngle = angle; best = e; }
    }
    if (best) this.focus = best;
    else if (this.focus && (!this.focus.alive || this.focus.sinceHit > 8)) this.focus = null;
  }

  faceCamera(quat: THREE.Quaternion): void {
    for (const e of this.enemies) e.faceCamera(quat);
  }
}
