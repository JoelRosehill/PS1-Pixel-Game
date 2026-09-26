import * as THREE from 'three';
import type { CombatWorld } from '../combat/CombatWorld';
import type { Damageable } from '../combat/types';
import type { TimeControl } from '../core/TimeControl';
import type { ColliderWorld } from '../physics/Colliders';
import type { PlayerCombat } from '../player/PlayerCombat';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerModel } from '../player/PlayerModel';
import type { FirstPersonCamera } from '../player/FirstPersonCamera';
import type { Effects } from '../render/effects/Effects';
import { glow } from '../render/Materials';
import { SpellBook, type SpellId, type SpellPage } from './SpellBook';

const UP = new THREE.Vector3(0, 1, 0);
interface Projectile { mesh: THREE.Mesh; direction: THREE.Vector3; life: number; page: SpellPage; }
interface Field { mesh: THREE.Mesh; life: number; pulse: number; pulsesLeft: number; page: SpellPage; }

export class SpellCasting {
  readonly book = new SpellBook();
  readonly group = new THREE.Group();
  readonly cooldowns = new Map<SpellId, number>();
  readonly projectiles: Projectile[] = [];
  readonly fields: Field[] = [];
  message = '';
  messageTime = 0;
  castCount = 0;
  private globalCooldown = 0;
  private readonly projectileGeo = new THREE.OctahedronGeometry(0.18);
  private readonly ringGeo = new THREE.TorusGeometry(1, 0.035, 4, 32);
  private readonly materials = new Map<number, THREE.MeshBasicMaterial>();
  private readonly ward: THREE.Mesh;
  constructor(
    private readonly combat: PlayerCombat,
    private readonly controller: PlayerController,
    private readonly model: PlayerModel,
    private readonly camera: FirstPersonCamera,
    private readonly world: CombatWorld,
    private readonly colliders: ColliderWorld,
    private readonly effects: Effects,
    private readonly time: TimeControl,
  ) {
    this.group.name = 'spell-effects';
    this.ward = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: 0xffd070, wireframe: true }));
    this.ward.visible = false; this.group.add(this.ward);
  }
  notify(message: string): void { this.message = message; this.messageTime = 3.5; }
  collect(id: SpellId): boolean {
    if (!this.book.collect(id)) return false;
    this.model.book.setPages(this.book.count, this.book.tier);
    this.notify(`Page found: ${this.book.current.id === id ? this.book.current.name : this.pageName(id)} · B to read`);
    return true;
  }
  /** Restores saved pages without the pickup fanfare. */
  restore(ids: string[], selected: string): void {
    this.book.restore(ids, selected);
    this.model.book.setPages(this.book.count, this.book.tier);
  }
  private pageName(id: SpellId): string { return id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); }
  remaining(id: SpellId): number { return this.cooldowns.get(id) ?? 0; }
  reset(): void {
    for (const p of this.projectiles) p.mesh.removeFromParent();
    for (const f of this.fields) f.mesh.removeFromParent();
    this.projectiles.length = 0; this.fields.length = 0;
    this.cooldowns.clear(); this.globalCooldown = 0;
    this.combat.wardTime = 0; this.ward.visible = false;
  }
  cast(): boolean {
    const page = this.book.current, effect = page.effect;
    const fail = (message: string) => { this.notify(message); return false; };
    if (!this.combat.alive || this.controller.frozen) return false;
    if (this.combat.phase !== 'idle' && this.combat.phase !== 'recovery') return fail('Finish your strike first');
    if (this.globalCooldown > 0 || this.remaining(page.id) > 0) return fail(`${page.name} is recovering`);
    if (effect.kind === 'heal' && this.combat.health >= 100) return fail('Vigour is already full');
    if (effect.kind === 'projectile' && this.projectiles.length >= 12) return fail('Too many spells in flight');
    if (effect.kind === 'field' && this.fields.length >= 3) return fail('Too many active wells');
    const origin = this.controller.position.clone().addScaledVector(UP, effect.kind === 'projectile' ? this.controller.capsuleHeight - 0.25 : 1);
    const yaw = this.camera.movementYaw;
    const direction = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    // Work out a safe path before spending; sample the full standing capsule.
    const destination = this.controller.position.clone();
    if (effect.kind === 'blink') {
      let fraction = 1;
      for (const h of [0.4, 0.9, 1.4]) {
        const from = destination.clone().addScaledVector(UP, h);
        fraction = Math.min(fraction, this.colliders.sweepSphere(from, from.clone().addScaledVector(direction, effect.distance), 0.38, 56));
      }
      if (fraction * effect.distance < 0.4) return fail('The path is blocked');
      destination.addScaledVector(direction, Math.max(0, fraction * effect.distance - 0.08));
    }
    if (!this.combat.momentum.spend(page.cost)) return fail(`Need ${this.combat.momentum.costOf(page.cost)} Momentum · hold Shift standing still to channel`);
    this.castCount++; this.globalCooldown = 0.22; this.cooldowns.set(page.id, page.cooldown);
    this.messageTime = 0;
    this.model.book.cast(page.color);
    this.effects.ring(origin, page.color, 0.8, 0.3, true);
    switch (effect.kind) {
      case 'burst':
        // Preserve Job 3's radial shockwave behavior; it ignores cover.
        this.area(origin, effect.radius, page, effect.damage, effect.stagger, 12, false);
        this.effects.ring(origin, page.color, effect.radius * 1.6, 0.55);
        this.effects.ring(origin, 0xff8ad8, effect.radius, 0.4);
        this.effects.sparkBurst(origin, UP, page.color, 26, 11);
        this.camera.addShake(0.5); this.time.hitStop(0.06);
        break;
      case 'projectile': {
        this.camera.aimDirection(direction);
        // Small aim forgiveness only when the target is already under the crosshair.
        const target = this.world.aimAssist(this.controller.position, yaw, 32, 0.14, 'player');
        if (target) {
          const toward = target.position.clone().addScaledVector(UP, target.bodyHeight * 0.55).sub(origin).normalize();
          if (direction.dot(toward) > Math.cos(0.14)) direction.copy(toward);
        }
        const mesh = new THREE.Mesh(this.projectileGeo, this.material(page.color));
        mesh.position.copy(origin); mesh.scale.set(effect.splash ? 1.5 : 0.8, 0.8, 2.7);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
        this.group.add(mesh); this.projectiles.push({ mesh, direction, life: 2.2, page });
        break;
      }
      case 'field': {
        const end = origin.clone().addScaledVector(direction, 6);
        const fraction = this.colliders.sweepSphere(origin, end, 0.2, 24, true);
        end.lerpVectors(origin, end, fraction);
        const ground = end.clone().setY(this.colliders.heightAt(end.x, end.z) + 0.25);
        // Stop on bridge decks and platforms instead of placing the well below them.
        const drop = this.colliders.sweepSphere(end, ground, 0.1, Math.min(256, Math.max(8, Math.ceil(end.distanceTo(ground) / 0.2))), true);
        end.lerp(ground, drop);
        const mesh = new THREE.Mesh(this.ringGeo, this.material(page.color));
        mesh.rotation.x = -Math.PI / 2; mesh.position.copy(end); mesh.scale.setScalar(effect.radius);
        this.group.add(mesh); this.fields.push({ mesh, life: effect.duration, pulse: 0, pulsesLeft: Math.ceil(effect.duration), page });
        break;
      }
      case 'blink':
        this.effects.ring(origin, page.color, 1.7, 0.4, true);
        this.controller.position.copy(destination); this.controller.prevPosition.copy(destination);
        this.controller.grounded = false;
        this.effects.sparkBurst(destination.clone().addScaledVector(UP, 1), UP, page.color, 16, 5);
        break;
      case 'launch':
        this.controller.addImpulse(0, Math.max(0, effect.speed - this.controller.velocity.y), 0);
        this.effects.ring(this.controller.position, page.color, 2.8, 0.45);
        this.effects.sparkBurst(origin, UP, page.color, 22, 7);
        break;
      case 'ward':
        this.combat.wardTime = effect.duration; this.combat.wardReduction = effect.reduction;
        break;
      case 'heal':
        this.combat.health = Math.min(100, this.combat.health + effect.amount);
        this.effects.number(origin.clone().addScaledVector(UP, 1), `+${effect.amount}`, page.color, 1.3);
        this.effects.sparkBurst(origin, UP, page.color, 20, 4);
        break;
    }
    return true;
  }
  private material(color: number): THREE.MeshBasicMaterial {
    let m = this.materials.get(color);
    if (!m) { m = glow(color, 1.8); this.materials.set(color, m); }
    return m;
  }
  private hit(target: Damageable, page: SpellPage, damage: number, stagger: number, origin: THREE.Vector3, knockback: number): void {
    const point = target.position.clone().addScaledVector(UP, target.bodyHeight * 0.55);
    const dir = point.clone().sub(origin).setY(0).normalize();
    const result = this.world.strike(target, { damage, direction: dir, point, knockback, stagger, source: 'player', kind: 'burst', attacker: this.combat });
    if (result.hit) {
      this.effects.sparkBurst(point, dir, page.color, 10, 6);
      this.effects.number(point.clone().addScaledVector(UP, 0.3), String(Math.round(result.damage ?? damage)), page.color, 1.1);
    }
  }
  private area(origin: THREE.Vector3, radius: number, page: SpellPage, damage: number, stagger: number, knockback: number, respectCover = true): void {
    for (const target of this.world.sphere(origin, radius, 'player', [])) {
      const point = target.position.clone().addScaledVector(UP, target.bodyHeight * 0.55);
      if (respectCover && this.colliders.sweepSphere(origin, point, 0.05, 20, true) < 1) continue;
      this.hit(target, page, damage, stagger, origin, knockback);
    }
  }
  fixedUpdate(dt: number): void {
    if (!this.combat.alive) { this.reset(); return; }
    this.globalCooldown = Math.max(0, this.globalCooldown - dt);
    for (const [id, time] of this.cooldowns) this.cooldowns.set(id, Math.max(0, time - dt));
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i], effect = p.page.effect;
      if (effect.kind !== 'projectile') continue;
      const from = p.mesh.position.clone(), to = from.clone().addScaledVector(p.direction, effect.speed * dt);
      const fraction = this.colliders.sweepSphere(from, to, 0.16, 8, true);
      to.lerpVectors(from, to, fraction);
      const targets = this.world.sweep(from, to, 0.18, 'player', []).sort((a, b) => a.position.distanceToSquared(from) - b.position.distanceToSquared(from));
      p.mesh.position.copy(to); p.life -= dt;
      if (targets.length || fraction < 1 || p.life <= 0) {
        if (targets.length) {
          const impact = targets[0].position.clone().addScaledVector(UP, targets[0].bodyHeight * 0.55);
          if (effect.splash) this.area(impact, effect.splash, p.page, effect.damage, effect.stagger, 5);
          else this.hit(targets[0], p.page, effect.damage, effect.stagger, from, 2);
          this.effects.ring(impact, p.page.color, effect.splash || 0.7, 0.35, !effect.splash);
        } else if (fraction < 1) this.effects.sparkBurst(to, UP, p.page.color, 8, 3);
        p.mesh.removeFromParent(); this.projectiles.splice(i, 1);
      }
    }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const field = this.fields[i], effect = field.page.effect;
      if (effect.kind !== 'field') continue;
      field.pulse -= dt;
      if (field.pulse <= 0 && field.pulsesLeft > 0) {
        field.pulse += 1;
        field.pulsesLeft--;
        const origin = field.mesh.position.clone().addScaledVector(UP, 0.8);
        this.area(origin, effect.radius, field.page, effect.damage, 0.22, -10);
        this.effects.ring(field.mesh.position, field.page.color, effect.radius, 0.7);
      }
      field.life -= dt;
      if (field.life <= 0) { field.mesh.removeFromParent(); this.fields.splice(i, 1); }
    }
    this.ward.visible = this.combat.wardTime > 0;
    this.ward.position.copy(this.controller.position).addScaledVector(UP, 0.9);
    this.ward.rotation.y += dt * 0.7;
  }
}
