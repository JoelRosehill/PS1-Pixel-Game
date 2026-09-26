import * as THREE from 'three';
import type { CombatWorld } from '../combat/CombatWorld';
import type { PlayerProjectiles, ShotSpec } from '../combat/PlayerProjectiles';
import type { Damageable } from '../combat/types';
import type { TimeControl } from '../core/TimeControl';
import type { ColliderWorld } from '../physics/Colliders';
import type { PlayerCombat } from '../player/PlayerCombat';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerModel } from '../player/PlayerModel';
import type { FirstPersonCamera } from '../player/FirstPersonCamera';
import type { Effects } from '../render/effects/Effects';
import type { SpellFx } from '../render/effects/SpellFx';
import { glow } from '../render/Materials';
import { SPELL_PAGES, SpellBook, type SpellId, type SpellPage } from './SpellBook';

const UP = new THREE.Vector3(0, 1, 0);

interface Maw { mesh: THREE.Object3D; pos: THREE.Vector3; life: number; page: SpellPage }
interface Moon { mesh: THREE.Mesh; angle: number; alive: boolean }
interface Wisp { mesh: THREE.Mesh; pos: THREE.Vector3; target: Damageable | null; strikes: number; cooldown: number; phase: number }
interface Fire { pos: THREE.Vector3; life: number; tick: number }
interface Delayed { at: number; run: () => void }

/** A thing in the world with a live position and an `active` flag (hostile orbs). */
export interface HostileOrb { mesh: THREE.Object3D; active: boolean; team: string }

/**
 * The book (Job 13): free Starbolts on right mouse and the twelve pages of the Codex on
 * E. Held pages (Comet Lance gathers, Prism Ray pours) read E's hold and release.
 * Persistent effects — the Void Maw, Moon Aegis, Wisp Choir, Phoenix fire, Eclipse —
 * live here and tick on the fixed clock, so menus pause them and death clears them.
 */
export class SpellCasting {
  readonly book = new SpellBook();
  readonly group = new THREE.Group();
  readonly cooldowns = new Map<SpellId, number>();
  message = '';
  messageTime = 0;
  castCount = 0;
  boltsFired = 0;
  /** Supplied by the game: live hostile projectiles (Moon Aegis swallows them). */
  hostileOrbs: () => HostileOrb[] = () => [];
  /** Spell kind of the last cast (audio). */
  lastKind = '';
  /** What E is doing right now: '' | 'gather' | 'pour'. */
  holding: '' | 'gather' | 'pour' = '';
  holdTime = 0;
  readonly maws: Maw[] = [];
  readonly moons: Moon[] = [];
  aegisTime = 0;
  readonly wisps: Wisp[] = [];
  private readonly fires: Fire[] = [];
  private readonly delayed: Delayed[] = [];
  private clock = 0;
  private globalCooldown = 0;
  private boltCooldown = 0;
  private boltSide = 1;
  private prismTick = 0;
  private readonly moonGeo = new THREE.SphereGeometry(0.22, 8, 6);
  private readonly wispGeo = new THREE.OctahedronGeometry(0.2);
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    private readonly combat: PlayerCombat,
    private readonly controller: PlayerController,
    private readonly model: PlayerModel,
    private readonly camera: FirstPersonCamera,
    private readonly world: CombatWorld,
    private readonly colliders: ColliderWorld,
    private readonly effects: Effects,
    private readonly time: TimeControl,
    private readonly shots: PlayerProjectiles,
    private readonly fx: SpellFx,
  ) {
    this.group.name = 'spell-effects';
  }

  notify(message: string): void { this.message = message; this.messageTime = 3.5; }

  collect(id: SpellId): boolean {
    if (!this.book.collect(id)) return false;
    this.model.book.setPages(this.book.count, this.book.tier);
    const page = this.pageById(id);
    this.notify(`Page found: ${page.name} · B to read`);
    return true;
  }

  /** Restores saved pages without the pickup fanfare. */
  restore(ids: string[], selected: string): void {
    this.book.restore(ids, selected);
    this.model.book.setPages(this.book.count, this.book.tier);
  }

  private pageById(id: SpellId): SpellPage {
    return SPELL_PAGES.find(p => p.id === id)!;
  }

  remaining(id: SpellId): number { return this.cooldowns.get(id) ?? 0; }

  reset(): void {
    for (const m of this.maws) m.mesh.removeFromParent();
    for (const m of this.moons) m.mesh.removeFromParent();
    for (const w of this.wisps) w.mesh.removeFromParent();
    this.maws.length = 0; this.moons.length = 0; this.wisps.length = 0; this.fires.length = 0; this.delayed.length = 0;
    this.cooldowns.clear(); this.globalCooldown = 0; this.aegisTime = 0;
    this.holding = ''; this.holdTime = 0;
    this.combat.wardTime = 0;
    this.shots.clear();
    this.fx.clear();
  }

  // --- aim --------------------------------------------------------------------

  /** Where spells leave the book (left hand, chest height). */
  origin(out: THREE.Vector3, side = -1): THREE.Vector3 {
    const yaw = this.camera.yaw;
    out.copy(this.controller.position).addScaledVector(UP, this.controller.capsuleHeight - 0.45);
    out.x += Math.cos(yaw) * 0.28 * side;
    out.z += -Math.sin(yaw) * 0.28 * side;
    return out;
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.controller.position).addScaledVector(UP, this.controller.capsuleHeight - 0.25);
  }

  aim(out: THREE.Vector3): THREE.Vector3 {
    return this.camera.aimDirection(out);
  }

  /** First solid point along the crosshair (terrain or colliders), up to `range`. */
  aimPoint(range: number, out: THREE.Vector3): THREE.Vector3 {
    const eye = this.eye(new THREE.Vector3());
    const dir = this.aim(new THREE.Vector3());
    const end = eye.clone().addScaledVector(dir, range);
    const f = this.colliders.sweepSphere(eye, end, 0.1, Math.ceil(range / 1.5), true);
    let hit = f;
    // March for the terrain (sweepSphere covers colliders; the ground is analytic).
    for (let t = 0.5; t <= range * f; t += 0.75) {
      const p = this.tmp.copy(eye).addScaledVector(dir, t);
      if (p.y < this.colliders.heightAt(p.x, p.z)) { hit = Math.min(hit, t / range); break; }
    }
    out.copy(eye).addScaledVector(dir, range * hit);
    out.y = Math.max(out.y, this.colliders.heightAt(out.x, out.z));
    return out;
  }

  /**
   * The foe nearest the crosshair: within `maxAngle` radians of yaw and a looser pitch
   * window (terrain rises and falls; ranged aim should forgive height, not direction).
   */
  aimTarget(range: number, maxAngle: number, maxPitch = 0.38): Damageable | null {
    const eye = this.eye(new THREE.Vector3());
    const yaw = this.camera.yaw, pitch = this.camera.pitch;
    let best: Damageable | null = null;
    let bestScore = Infinity;
    for (const t of this.world.sphere(eye, range, 'player', [])) {
      const to = this.tmp.copy(t.position).addScaledVector(UP, t.bodyHeight * 0.55).sub(eye);
      const flat = Math.hypot(to.x, to.z);
      if (flat < 0.5) continue;
      const dyaw = Math.abs(Math.atan2(Math.sin(Math.atan2(-to.x, -to.z) - yaw), Math.cos(Math.atan2(-to.x, -to.z) - yaw)));
      const dpitch = Math.abs(Math.atan2(to.y, flat) - pitch);
      const slack = Math.atan2(t.bodyRadius, flat);
      if (dyaw > maxAngle + slack || dpitch > maxPitch + slack) continue;
      const score = dyaw * 20 + dpitch * 6 + flat * 0.05;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  /** Beam end point: toward an assisted target if one is near the crosshair. */
  private beamEnd(range: number, out: THREE.Vector3, from: THREE.Vector3): THREE.Vector3 {
    const target = this.aimTarget(range, 0.12);
    if (!target) return this.aimPoint(range, out);
    const dir = this.tmp2.copy(target.position).addScaledVector(UP, target.bodyHeight * 0.55).sub(from).normalize();
    const end = out.copy(from).addScaledVector(dir, range);
    const f = this.colliders.sweepSphere(from, end, 0.1, Math.ceil(range / 1.5), true);
    return out.lerpVectors(from, end, f);
  }

  // --- input (from PlayerCombat) ----------------------------------------------------

  /** Right mouse held: the book fires Starbolts (free, 5 a second, lightly homing). */
  primary(held: boolean): void {
    if (!held || !this.combat.alive || this.controller.frozen || this.holding || this.boltCooldown > 0) return;
    this.boltCooldown = 0.2;
    this.boltSide = -this.boltSide;
    const from = this.origin(new THREE.Vector3(), -1);
    from.y += this.boltSide * 0.05;
    const target = this.aimTarget(60, 0.2);
    const dir = target
      ? this.tmp.copy(target.position).addScaledVector(UP, target.bodyHeight * 0.55).sub(from).normalize()
      : this.aimPoint(70, this.tmp2).sub(from).normalize();
    this.shots.spawn(from, dir, {
      kind: 'bolt', damage: 7, stagger: 0.05, knockback: 1, speed: 58, radius: 0.28, life: 1.3, color: 0xc9a0ff,
      visual: 'bolt', homing: target ? 2.2 : 0, target,
    });
    this.boltsFired++;
    this.model.book.cast(0xc9a0ff);
  }

  /** E: press casts (or starts gathering/pouring), hold sustains, release lets go. */
  spell(pressed: boolean, held: boolean, released: boolean): void {
    if (this.holding) {
      this.holdTime += 1 / 60;
      const page = this.book.current;
      const effect = page.effect;
      if (this.holding === 'gather' && effect.kind === 'lance') {
        if (this.holdTime > 0.08 && Math.floor(this.holdTime * 10) !== Math.floor((this.holdTime - 1 / 60) * 10)) {
          this.effects.sparkBurst(this.origin(this.tmp), this.aim(this.tmp2), page.color, 3, 2);
        }
        if (released || !held || this.holdTime > effect.charge * 2.2) this.fireLance(page, Math.min(1, this.holdTime / effect.charge));
      } else if (this.holding === 'pour' && effect.kind === 'prism') {
        if (!held || released || !this.combat.alive || this.combat.momentum.value <= 0) this.holding = '';
        else this.pourPrism(page, effect.dps, effect.drain, effect.range);
      }
      return;
    }
    if (pressed) this.cast();
  }

  cast(): boolean {
    const page = this.book.current, effect = page.effect;
    const fail = (message: string) => { this.notify(message); return false; };
    if (!this.combat.alive || this.controller.frozen) return false;
    if (this.combat.phase !== 'idle' && this.combat.phase !== 'recovery') return fail('Finish your strike first');
    if (this.globalCooldown > 0 || this.remaining(page.id) > 0) return fail(`${page.name} is recovering`);
    if (effect.kind === 'bloom' && this.combat.health >= this.combat.maxHealth && !this.world.sphere(this.controller.position, effect.radius, 'player', []).length) {
      return fail('Nothing to bleed and nothing to mend');
    }
    // Work out a safe blink before spending.
    const destination = this.controller.position.clone();
    if (effect.kind === 'blink') {
      const dir = this.aim(new THREE.Vector3());
      let fraction = 1;
      for (const h of [0.4, 0.9, 1.4]) {
        const from = destination.clone().addScaledVector(UP, h);
        fraction = Math.min(fraction, this.colliders.sweepSphere(from, from.clone().addScaledVector(dir, effect.distance), 0.38, 56));
      }
      if (fraction * effect.distance < 0.4) return fail('The path is blocked');
      destination.addScaledVector(dir, Math.max(0, fraction * effect.distance - 0.08));
      destination.y = Math.max(destination.y, this.colliders.heightAt(destination.x, destination.z));
    }
    if (!this.combat.momentum.spend(page.cost)) {
      return fail(`${page.name} needs ${this.combat.momentum.costOf(page.cost)} Momentum · hold Shift standing still to channel`);
    }
    this.castCount++;
    this.lastKind = effect.kind;
    this.globalCooldown = 0.25;
    this.cooldowns.set(page.id, page.cooldown);
    this.messageTime = 0;
    this.model.book.cast(page.color);
    const origin = this.origin(new THREE.Vector3());
    this.effects.ring(origin, page.color, 0.8, 0.3, true);
    const aim = this.aim(new THREE.Vector3());
    const flat = aim.clone().setY(0).normalize();

    switch (effect.kind) {
      case 'starfall': {
        const at = this.aimPoint(effect.range, new THREE.Vector3());
        for (let i = 0; i < effect.count; i++) {
          const a = (i / effect.count) * Math.PI * 2 + Math.random() * 0.6;
          const r = i === 0 ? 0 : 0.8 + Math.random() * 1.8;
          const land = at.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
          land.y = this.colliders.heightAt(land.x, land.z);
          const start = land.clone().add(new THREE.Vector3(-flat.x * 6 + (Math.random() - 0.5) * 4, 34, -flat.z * 6));
          this.shots.spawn(start, land.clone().sub(start), {
            kind: 'spell', damage: effect.damage, stagger: 0.5, knockback: 6, speed: 42, radius: 0.6, life: 2.5, color: page.color,
            visual: 'meteor', splash: effect.radius, splashDamage: effect.damage, delay: i * 0.12, solid: true,
          });
        }
        this.fx.flash(at.clone().addScaledVector(UP, 0.2), page.color, 1.2, 0.8);
        break;
      }
      case 'lance':
        this.holding = 'gather'; this.holdTime = 0;
        break;
      case 'prism':
        this.holding = 'pour'; this.holdTime = 0; this.prismTick = 0;
        break;
      case 'chain': {
        let from = origin.clone();
        let current = this.aimTarget(28, 0.35);
        const hit = new Set<Damageable>();
        if (!current) { this.fx.lightning(origin, this.aimPoint(20, new THREE.Vector3()), page.color, 0.25); break; }
        for (let i = 0; i < effect.jumps && current; i++) {
          hit.add(current);
          const point = current.position.clone().addScaledVector(UP, current.bodyHeight * 0.6);
          this.fx.lightning(from, point, page.color, 0.3 + i * 0.04);
          this.strike(current, page, effect.damage, effect.stagger, from, 3);
          from = point;
          let next: Damageable | null = null;
          let best = Infinity;
          for (const t of this.world.sphere(point, effect.range, 'player', [])) {
            if (hit.has(t)) continue;
            const d = t.position.distanceTo(point);
            if (d < best) { best = d; next = t; }
          }
          current = next;
        }
        this.time.hitStop(0.05);
        break;
      }
      case 'rupture': {
        const start = this.controller.position.clone().addScaledVector(flat, 1.5);
        const step = 1.1;
        const hit = new Set<Damageable>();
        for (let d = 0; d <= effect.length; d += step) {
          const p = start.clone().addScaledVector(flat, d);
          p.x += (Math.random() - 0.5) * 0.8; p.z += (Math.random() - 0.5) * 0.8;
          p.y = this.colliders.heightAt(p.x, p.z);
          const delay = d * 0.02;
          this.fx.spike(p, page.color, 1.6 + Math.random() * 1.6, 1.4, 0.55, delay);
          this.later(delay, () => {
            for (const t of this.world.sphere(p, 1.6, 'player', [])) {
              if (hit.has(t)) continue;
              hit.add(t);
              this.strike(t, page, effect.damage, 0.6, p, 2, effect.slow);
            }
          });
        }
        this.camera.addShake(0.3);
        break;
      }
      case 'maw': {
        const target = this.aimTarget(effect.range, 0.25);
        const to = target ? target.position.clone().addScaledVector(UP, 1) : this.aimPoint(effect.range, new THREE.Vector3());
        this.shots.spawn(origin, to.clone().sub(origin), {
          kind: 'spell', damage: 0, stagger: 0, knockback: 0, speed: 30, radius: 0.4, life: 1.2, color: page.color, visual: 'void',
          onImpact: (at) => this.openMaw(at, page),
        });
        break;
      }
      case 'phoenix': {
        this.controller.burst(flat, effect.distance / 0.3, 0.3);
        const hit = new Set<Damageable>();
        for (let i = 0; i <= 18; i++) {
          this.later(i * (0.3 / 18), () => {
            const p = this.controller.position.clone();
            this.effects.sparkBurst(p.clone().addScaledVector(UP, 0.8), UP, page.color, 3, 3);
            if (i % 3 === 0) this.fires.push({ pos: p.clone(), life: 3, tick: 0 });
            for (const t of this.world.sphere(p, 2, 'player', [])) {
              if (hit.has(t)) continue;
              hit.add(t);
              this.strike(t, page, effect.damage, 0.4, p, 4);
            }
          });
        }
        break;
      }
      case 'aegis': {
        for (const m of this.moons) m.mesh.removeFromParent();
        this.moons.length = 0;
        for (let i = 0; i < effect.moons; i++) {
          const mesh = new THREE.Mesh(this.moonGeo, glow(page.color, 1.8));
          this.group.add(mesh);
          this.moons.push({ mesh, angle: (i / effect.moons) * Math.PI * 2, alive: true });
        }
        this.aegisTime = effect.duration;
        break;
      }
      case 'bloom': {
        const at = this.controller.position.clone().addScaledVector(UP, 1);
        let count = 0;
        for (const t of this.world.sphere(at, effect.radius, 'player', [])) {
          this.strike(t, page, effect.damage, 0.6, at, 8);
          this.fx.lightning(at, t.position.clone().addScaledVector(UP, 1), page.color, 0.3, 0.2);
          count++;
        }
        const heal = effect.heal + count * effect.perHit;
        const before = this.combat.health;
        this.combat.health = Math.min(this.combat.maxHealth, this.combat.health + heal);
        this.effects.number(at.clone().addScaledVector(UP, 1.2), `+${Math.round(this.combat.health - before)}`, 0x9affb1, 1.3);
        this.fx.flash(at, page.color, effect.radius, 0.45);
        this.effects.ring(this.controller.position, page.color, effect.radius, 0.5);
        this.effects.sparkBurst(at, UP, page.color, 30, 9);
        break;
      }
      case 'wisps': {
        for (const w of this.wisps) w.mesh.removeFromParent();
        this.wisps.length = 0;
        for (let i = 0; i < effect.count; i++) {
          const mesh = new THREE.Mesh(this.wispGeo, glow(page.color, 2.2));
          this.group.add(mesh);
          this.wisps.push({ mesh, pos: origin.clone(), target: null, strikes: 3, cooldown: 0.3 + i * 0.15, phase: i * 1.7 });
        }
        this.later(effect.duration, () => { for (const w of this.wisps) w.mesh.removeFromParent(); this.wisps.length = 0; });
        break;
      }
      case 'eclipse': {
        this.time.slowMotion(0.25, 0.9);
        this.fx.flash(this.controller.position.clone().addScaledVector(UP, 2), 0x120818, effect.radius * 0.6, 0.9);
        this.later(0.35, () => {
          const at = this.controller.position.clone().addScaledVector(UP, 0.5);
          this.fx.flash(at, page.color, effect.radius, 0.6);
          this.effects.ring(this.controller.position, page.color, effect.radius, 0.7);
          this.effects.ring(this.controller.position, 0xffffff, effect.radius * 0.6, 0.5);
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const p = at.clone().add(new THREE.Vector3(Math.sin(a) * effect.radius * 0.7, 0, Math.cos(a) * effect.radius * 0.7));
            p.y = this.colliders.heightAt(p.x, p.z);
            this.fx.spike(p, page.color, 3 + Math.random() * 2, 1.2, 0.7, i * 0.01);
          }
          for (const t of this.world.sphere(at, effect.radius, 'player', [])) this.strike(t, page, effect.damage, 2, at, 14);
          this.camera.addShake(1);
          this.time.hitStop(0.12);
        });
        break;
      }
      case 'blink':
        this.effects.ring(origin, page.color, 1.7, 0.4, true);
        this.controller.position.copy(destination); this.controller.prevPosition.copy(destination);
        this.controller.grounded = false;
        this.effects.sparkBurst(destination.clone().addScaledVector(UP, 1), UP, page.color, 16, 5);
        break;
    }
    return true;
  }

  private fireLance(page: SpellPage, power: number): void {
    this.holding = '';
    const effect = page.effect;
    if (effect.kind !== 'lance') return;
    const from = this.origin(new THREE.Vector3());
    const to = this.beamEnd(effect.range, new THREE.Vector3(), from);
    const damage = effect.damage * (0.4 + 0.6 * power);
    this.fx.beam(from, to, page.color, 0.25 + power * 0.35, 0.45);
    this.fx.beam(from, to, 0xffffff, 0.08 + power * 0.1, 0.3);
    this.fx.flash(to, page.color, 1.5 + power * 2, 0.35);
    for (const t of this.world.sweep(from, to, 0.7 + power * 0.5, 'player', [])) this.strike(t, page, damage, 0.4 + power * 0.8, from, 6 + power * 8);
    this.camera.addShake(0.3 + power * 0.4);
    this.camera.addKick(0.02);
    this.castCount++;
    this.lastKind = 'lance';
  }

  private pourPrism(page: SpellPage, dps: number, drain: number, range: number): void {
    const dt = 1 / 60;
    this.combat.momentum.value = Math.max(0, this.combat.momentum.value - drain * dt);
    if (this.combat.momentum.value < 35) this.combat.momentum.resonance = false;
    const from = this.origin(new THREE.Vector3());
    const to = this.beamEnd(range, new THREE.Vector3(), from);
    const hue = (this.clock * 0.9) % 1;
    const color = new THREE.Color().setHSL(hue, 1, 0.6).getHex();
    this.fx.beam(from, to, color, 0.28, 0.06);
    this.fx.beam(from, to, 0xffffff, 0.09, 0.05);
    this.controller.moveScale = Math.min(this.controller.moveScale, 0.5);
    this.prismTick -= dt;
    if (this.prismTick <= 0) {
      this.prismTick = 0.1;
      for (const t of this.world.sweep(from, to, 0.6, 'player', [])) this.strike(t, page, dps * 0.1, 0.12, from, 0.5, 0, color);
      this.effects.sparkBurst(to, UP, color, 3, 3);
    }
  }

  private openMaw(at: THREE.Vector3, page: SpellPage): void {
    if (page.effect.kind !== 'maw') return;
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshBasicMaterial({ color: 0x050008 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.08, 4, 28), glow(page.color, 2));
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    const pos = at.clone();
    pos.y = Math.max(pos.y, this.colliders.heightAt(pos.x, pos.z) + 1.2);
    group.position.copy(pos);
    this.group.add(group);
    this.maws.push({ mesh: group, pos, life: page.effect.duration, page });
  }

  /** Moon Aegis: swallow a hostile orb that reaches a moon. Returns whether it did. */
  private absorbOrbs(): void {
    for (const orb of this.hostileOrbs()) {
      if (!orb.active || orb.team === 'player') continue;
      for (const m of this.moons) {
        if (!m.alive) continue;
        if (m.mesh.position.distanceTo(orb.mesh.position) < 0.9) {
          orb.active = false; orb.mesh.visible = false;
          m.alive = false; m.mesh.visible = false;
          this.effects.sparkBurst(m.mesh.position, UP, 0xfff0b0, 10, 4);
          break;
        }
      }
    }
  }

  /** Runs `run` after `seconds` of simulation time (paused with the world). */
  later(seconds: number, run: () => void): void {
    this.delayed.push({ at: this.clock + seconds, run });
  }

  private strike(target: Damageable, page: SpellPage, damage: number, stagger: number, origin: THREE.Vector3, knockback: number, slow = 0, color = page.color): void {
    this.shots.strike(target, { spec: { kind: 'spell', damage, stagger, knockback, speed: 0, radius: 0, life: 0, color, visual: 'orb', slow } as ShotSpec }, origin, damage);
  }

  fixedUpdate(dt: number): void {
    if (!this.combat.alive) { this.reset(); return; }
    this.clock += dt;
    this.globalCooldown = Math.max(0, this.globalCooldown - dt);
    this.boltCooldown = Math.max(0, this.boltCooldown - dt);
    for (const [id, time] of this.cooldowns) this.cooldowns.set(id, Math.max(0, time - dt));
    this.shots.fixedUpdate(dt, this.clock);

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      if (this.delayed[i].at <= this.clock) { const d = this.delayed[i]; this.delayed.splice(i, 1); d.run(); }
    }

    // Void Maw: drag everything in, then burst.
    for (let i = this.maws.length - 1; i >= 0; i--) {
      const m = this.maws[i];
      const effect = m.page.effect;
      if (effect.kind !== 'maw') continue;
      m.life -= dt;
      m.mesh.rotation.y += dt * 3;
      m.mesh.scale.setScalar(1 + Math.sin(this.clock * 12) * 0.08);
      for (const t of this.world.sphere(m.pos, effect.radius, 'player', [])) {
        const v = (t as unknown as { velocity?: THREE.Vector3 }).velocity;
        if (!v) continue;
        const to = this.tmp.copy(m.pos).sub(t.position).setY(0);
        const d = to.length();
        if (d > 0.6) v.addScaledVector(to.normalize(), Math.min(40, 90 / Math.max(1, d)) * dt);
      }
      if (Math.random() < 0.3) this.effects.sparkBurst(m.pos, UP, m.page.color, 2, 2);
      if (m.life <= 0) {
        this.fx.flash(m.pos, m.page.color, effect.radius, 0.5);
        this.effects.ring(m.pos, m.page.color, effect.radius, 0.5);
        for (const t of this.world.sphere(m.pos, effect.radius, 'player', [])) this.strike(t, m.page, effect.damage, 1, m.pos, 10);
        this.camera.addShake(0.4);
        m.mesh.removeFromParent();
        this.maws.splice(i, 1);
      }
    }

    // Moon Aegis: orbit, swallow orbs, bite foes that come close.
    if (this.aegisTime > 0) {
      this.aegisTime -= dt;
      const centre = this.tmp2.copy(this.controller.position).addScaledVector(UP, 1.1);
      for (const m of this.moons) {
        m.angle += dt * 2.4;
        m.mesh.position.set(centre.x + Math.sin(m.angle) * 1.5, centre.y + Math.sin(m.angle * 2) * 0.25, centre.z + Math.cos(m.angle) * 1.5);
        if (!m.alive) continue;
        for (const t of this.world.sphere(m.mesh.position, 1.1, 'player', [])) {
          this.strike(t, this.pageById('moon-aegis'), 18, 0.3, m.mesh.position, 4);
          m.alive = false; m.mesh.visible = false;
          break;
        }
      }
      this.absorbOrbs();
      if (this.aegisTime <= 0 || this.moons.every(m => !m.alive)) {
        for (const m of this.moons) m.mesh.removeFromParent();
        this.moons.length = 0; this.aegisTime = 0;
      }
    }

    // Wisp Choir: circle the player until a foe is near, then hunt it.
    for (const w of this.wisps) {
      w.cooldown -= dt;
      w.phase += dt * 3;
      if (w.target && !w.target.alive) w.target = null;
      if (!w.target && w.strikes > 0) w.target = this.nearestFoe(w.pos, 26);
      let goal: THREE.Vector3;
      if (w.target && w.strikes > 0 && w.cooldown <= 0) goal = this.tmp.copy(w.target.position).addScaledVector(UP, w.target.bodyHeight * 0.6);
      else goal = this.tmp.copy(this.controller.position).add(new THREE.Vector3(Math.sin(w.phase) * 1.8, 2 + Math.sin(w.phase * 1.3) * 0.4, Math.cos(w.phase) * 1.8));
      const to = goal.sub(w.pos);
      const d = to.length();
      w.pos.addScaledVector(to.normalize(), Math.min(d, (w.target ? 22 : 12) * dt));
      w.mesh.position.copy(w.pos);
      w.mesh.rotation.y += dt * 8;
      if (w.target && w.strikes > 0 && w.cooldown <= 0 && d < 0.9) {
        this.strike(w.target, this.pageById('wisp-choir'), 18, 0.25, w.pos, 2);
        w.strikes--; w.cooldown = 0.7; w.target = null;
        if (w.strikes <= 0) w.mesh.visible = false;
      }
    }

    // Phoenix fire trail.
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt; f.tick -= dt;
      if (Math.random() < 0.25) this.effects.sparkBurst(f.pos, UP, 0xff9a4a, 1, 2);
      if (f.tick <= 0) {
        f.tick = 0.5;
        for (const t of this.world.sphere(f.pos, 1.8, 'player', [])) this.strike(t, this.pageById('phoenix-flight'), 7, 0, f.pos, 0);
      }
      if (f.life <= 0) this.fires.splice(i, 1);
    }
  }

  private nearestFoe(from: THREE.Vector3, range: number): Damageable | null {
    let best: Damageable | null = null;
    let bd = Infinity;
    for (const t of this.world.sphere(from, range, 'player', [])) {
      const d = t.position.distanceTo(from);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
}
