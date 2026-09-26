import * as THREE from 'three';
import type { HitInfo } from '../combat/types';
import { box, cone, cylinder, merge, place } from '../world/geometry';
import type { AIContext } from './AIContext';
import { Enemy, type Received } from './Enemy';

/**
 * Sunkeeper Wizard (Pillar 5): an evasive caster of blinding light.
 *
 * It keeps 10–24 m away, prefers high perches, and blinks off whenever the player
 * closes in, so reaching it means slides, dashes and wall-jumps. Its three spells:
 * - **Sun Orb** — a slow homing orb. Dodge through it, or parry to throw it back.
 * - **Solar Lance** — marks the ground where the player stands; light falls a
 *   second later. Keep moving.
 * - **Blinding Flash** — the halo swells; anyone looking at it when it bursts is
 *   whited out. Look away, break line of sight, or hit it to interrupt.
 * Wizards are fragile: any solid hit during a cast interrupts it.
 */
export type WizardSpell = 'orb' | 'lance' | 'flash';

export const WIZARD_SPELLS: Record<WizardSpell, { windup: number; recovery: number }> = {
  orb: { windup: 0.6, recovery: 0.55 },
  lance: { windup: 0.5, recovery: 0.7 },
  flash: { windup: 0.95, recovery: 0.6 },
};

export const WIZARD_TUNING = {
  health: 95,
  preferMin: 10,
  preferMax: 24,
  blinkTrigger: 6.5,
  blinkCooldown: 3.8,
  flashCooldown: 7,
  orbSpeed: 15,
  orbDamage: 14,
  lanceRadius: 3.2,
  lanceDelay: 1.15,
  lanceDamage: 24,
  flashRange: 22,
  /** Aim cone (radians) in which the flash fully blinds. */
  flashCone: 0.7,
  flashSeconds: 1.8,
  interruptDamage: 8,
};

const UP = new THREE.Vector3(0, 1, 0);
const GOLD = 0xffd36a;

export class SunkeeperWizard extends Enemy {
  readonly kind = 'wizard' as const;
  readonly displayName = 'Sunkeeper Wizard';
  /** Preferred vantage points (set by the encounter). */
  perches: THREE.Vector3[] = [];
  spell: WizardSpell | null = null;
  blinks = 0;
  casts = 0;
  lastFlash: 'full' | 'partial' | 'avoided' | null = null;

  private castCooldown = 1.2 + Math.random();
  private blinkCooldown = 0;
  private flashCooldown = 3;
  private blinkTarget: THREE.Vector3 | null = null;
  private strafeSign = Math.random() < 0.5 ? -1 : 1;
  private readonly staff = new THREE.Group();
  private readonly halo: THREE.Mesh;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly orbMat: THREE.MeshBasicMaterial;
  private readonly aim = new THREE.Vector3();
  private readonly toWizard = new THREE.Vector3();

  constructor() {
    super(0.45, 2.1, WIZARD_TUNING.health, { sight: 38, fov: 1.25, hearing: 9, gain: 1.4, forget: 8 });
    this.spawnDuration = 1;
    this.mass = 0.8;
    this.staggerResist = 1.2;
    this.leash = 40;
    const robe = this.skin(0xe9dcb0);
    const trim = this.skin(0xc8973a);
    const hood = this.skin(0xf4ecd6);
    const face = this.skin(0x1a1024);
    const eyes = this.light(GOLD, 3);
    this.haloMat = this.light(GOLD, 2);
    this.orbMat = this.light(0xfff0b0, 2.5);
    const v = this.visual;
    this.mesh(v, place(cylinder(0.24, 0.66, 1.5, 8, 1), 0, 0.75, 0), robe);
    this.mesh(v, place(cylinder(0.67, 0.7, 0.12, 8, 1), 0, 0.06, 0), trim);
    this.mesh(v, place(box(0.5, 0.52, 0.34, 1), 0, 1.66, 0), robe);
    this.mesh(v, place(box(0.54, 0.1, 0.38, 1), 0, 1.44, 0), trim);
    this.mesh(v, place(cone(0.32, 0.62, 6, 1), 0, 2.2, 0), hood);
    this.mesh(v, place(box(0.26, 0.2, 0.06, 1), 0, 2.0, 0.19), face, false);
    for (const s of [-1, 1]) this.mesh(v, place(box(0.05, 0.04, 0.04, 1), s * 0.06, 2.02, 0.23), eyes, false);
    // Sun halo with rays behind the head.
    const haloParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.56, 0.045, 4, 24)];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      haloParts.push(place(box(0.06, 0.26, 0.03, 1), Math.cos(a) * 0.74, Math.sin(a) * 0.74, 0, 0, 0, a - Math.PI / 2));
    }
    this.halo = new THREE.Mesh(merge(haloParts), this.haloMat);
    this.halo.position.set(0, 2.1, -0.26);
    v.add(this.halo);
    // Staff arm.
    this.staff.position.set(0.38, 1.76, 0.05);
    this.mesh(this.staff, place(box(0.18, 0.5, 0.2, 1), 0, -0.22, 0), robe);
    this.mesh(this.staff, place(cylinder(0.035, 0.035, 2.3, 5, 1), 0.06, -0.2, 0.12), trim);
    this.mesh(this.staff, new THREE.Mesh(new THREE.OctahedronGeometry(0.16)).geometry.translate(0.06, 1.0, 0.12), this.orbMat, false);
    v.add(this.staff);
    this.mergeStatic(this.visual);
    this.mergeStatic(this.staff);
    this.group.name = 'sunkeeper-wizard';
  }

  /** Where orbs leave the staff. */
  staffTip(out: THREE.Vector3): THREE.Vector3 {
    this.forward(this.tmp2);
    return out.copy(this.position).addScaledVector(UP, 2.55).addScaledVector(this.tmp2, 0.35);
  }

  // --- brain ---------------------------------------------------------------

  protected think(dt: number, ctx: AIContext): void {
    this.castCooldown -= dt;
    this.blinkCooldown -= dt;
    this.flashCooldown -= dt;
    const pp = ctx.player.controller.position;
    const dist = this.distanceToPlayer(ctx);
    const alerted = this.perception.alerted && ctx.player.combat.alive;

    if (this.position.distanceTo(this.home) > this.leash && this.state !== 'return' && this.state !== 'blink') {
      this.cancelAction();
      this.setState('return');
    }

    switch (this.state) {
      case 'idle':
        this.stop();
        if (alerted) {
          this.setState('alert');
          ctx.effects.ring(this.eye(this.tmp), GOLD, 1.6, 0.4, true);
        }
        break;
      case 'alert':
        this.stop();
        this.turnToward(pp.x, pp.z, 6, dt);
        if (this.stateTime > 0.5) this.setState('duel');
        break;
      case 'duel': {
        if (!alerted) { this.setState('return'); break; }
        this.turnToward(pp.x, pp.z, 6, dt);
        if (dist < WIZARD_TUNING.blinkTrigger && this.blinkCooldown <= 0) { this.startBlink(ctx); break; }
        const dx = pp.x - this.position.x;
        const dz = pp.z - this.position.z;
        const inv = 1 / Math.max(dist, 1e-3);
        if (dist < WIZARD_TUNING.preferMin) this.move(-dx, -dz, 3.2);
        else if (dist > WIZARD_TUNING.preferMax || !this.perception.canSee) {
          const t = this.perception.canSee ? pp : this.perception.lastKnown;
          this.move(t.x - this.position.x, t.z - this.position.z, 3.6);
        } else this.move(-dz * inv * this.strafeSign, dx * inv * this.strafeSign, this.onPerch ? 0 : 1.2);
        if (this.castCooldown <= 0 && this.perception.canSee && dist < 34) this.chooseSpell(dist);
        break;
      }
      case 'cast': {
        const def = WIZARD_SPELLS[this.spell!];
        this.stop();
        this.turnToward(pp.x, pp.z, 8, dt);
        if (this.stateTime >= def.windup) this.release(ctx);
        break;
      }
      case 'recover': {
        this.stop();
        const def = this.spell ? WIZARD_SPELLS[this.spell] : WIZARD_SPELLS.orb;
        if (this.stateTime >= def.recovery) {
          const wasFlash = this.spell === 'flash';
          this.spell = null;
          this.cancelAction();
          this.castCooldown = 1.3 + Math.random() * 1.2;
          if (wasFlash && this.blinkCooldown <= 0 && Math.random() < 0.6) this.startBlink(ctx);
          else this.setState(alerted ? 'duel' : 'return');
        }
        break;
      }
      case 'blink': {
        // Vanish (0.25 s) → relocate → reappear (0.25 s).
        this.stop();
        if (this.blinkTarget && this.stateTime >= 0.25) {
          ctx.effects.ring(this.tmp.copy(this.position).addScaledVector(UP, 1), GOLD, 1.8, 0.35, true);
          this.position.copy(this.blinkTarget);
          this.velocity.set(0, 0, 0);
          this.blinkTarget = null;
          this.blinks++;
          ctx.effects.sparkBurst(this.tmp.copy(this.position).addScaledVector(UP, 1.2), UP, GOLD, 16, 5);
        }
        if (this.stateTime >= 0.5) this.setState(alerted ? 'duel' : 'return');
        break;
      }
      case 'return': {
        const h = this.home;
        if (alerted && this.position.distanceTo(h) < this.leash * 0.8) { this.setState('duel'); break; }
        const d = Math.hypot(h.x - this.position.x, h.z - this.position.z);
        if (d > 12 && this.blinkCooldown <= 0) {
          // Casters simply blink home.
          this.blinkTarget = h.clone();
          this.blinkCooldown = WIZARD_TUNING.blinkCooldown;
          this.setState('blink');
          break;
        }
        this.turnToward(h.x, h.z, 4, dt);
        this.move(h.x - this.position.x, h.z - this.position.z, 3.2);
        this.health = Math.min(this.maxHealth, this.health + dt * 20);
        if (d < 0.8) { this.stop(); this.perception.reset(); this.setState('idle'); }
        break;
      }
    }
  }

  private get onPerch(): boolean {
    return this.perches.some(p => Math.hypot(p.x - this.position.x, p.z - this.position.z) < 1.2);
  }

  private chooseSpell(dist: number): void {
    let spell: WizardSpell;
    if (dist < 15 && this.flashCooldown <= 0 && Math.random() < 0.55) spell = 'flash';
    else spell = Math.random() < 0.5 ? 'orb' : 'lance';
    if (!this.tokens || !this.tokens.request(this, 'ranged')) { this.castCooldown = 0.35; return; }
    this.spell = spell;
    this.setState('cast');
  }

  private release(ctx: AIContext): void {
    const spell = this.spell!;
    this.casts++;
    const pp = ctx.player.controller.position;
    if (spell === 'orb') {
      const tip = this.staffTip(new THREE.Vector3());
      const dir = this.tmp.subVectors(ctx.playerEye, tip).normalize();
      ctx.projectiles.fire(tip, dir, WIZARD_TUNING.orbSpeed, WIZARD_TUNING.orbDamage, this);
      ctx.effects.ring(tip, GOLD, 0.9, 0.25, true);
    } else if (spell === 'lance') {
      // Lead the target a little so standing still is never safe.
      const v = ctx.player.controller.velocity;
      const target = new THREE.Vector3(pp.x + v.x * 0.35, 0, pp.z + v.z * 0.35);
      target.y = Math.max(ctx.colliders.heightAt(target.x, target.z), pp.y - 0.2);
      ctx.telegraphs.schedule(target, WIZARD_TUNING.lanceRadius, WIZARD_TUNING.lanceDelay, GOLD, (point, radius) => {
        ctx.effects.sparkBurst(point, UP, 0xfff0b0, 24, 9);
        ctx.effects.ring(point, GOLD, radius * 1.4, 0.45);
        const p = ctx.player.controller.position;
        if (!ctx.player.combat.alive) return;
        if (Math.hypot(p.x - point.x, p.z - point.z) > radius || Math.abs(p.y - point.y) > 3.5) return;
        const out = new THREE.Vector3(p.x - point.x, 0, p.z - point.z);
        if (out.lengthSq() < 1e-4) out.set(0, 0, 1);
        ctx.combat.strike(ctx.player.combat, {
          damage: WIZARD_TUNING.lanceDamage, direction: out.normalize(), point: p.clone().addScaledVector(UP, 1),
          knockback: 8, stagger: 0.4, source: 'enemy', kind: 'enemy',
        });
      });
    } else {
      this.burstFlash(ctx);
      this.flashCooldown = WIZARD_TUNING.flashCooldown;
    }
    this.setState('recover');
  }

  /** Blinds whoever is looking at the halo when it bursts. */
  private burstFlash(ctx: AIContext): void {
    const eye = this.eye(new THREE.Vector3());
    ctx.effects.ring(eye, 0xffffff, 6, 0.5, true);
    ctx.effects.sparkBurst(eye, UP, 0xffffff, 30, 10);
    this.toWizard.subVectors(eye, ctx.playerEye);
    const dist = this.toWizard.length();
    this.lastFlash = 'avoided';
    if (dist > WIZARD_TUNING.flashRange || !ctx.player.combat.alive) return;
    const clear = ctx.colliders.sweepSphere(ctx.playerEye, eye, 0.05, Math.ceil(dist / 1.2) + 2, true) >= 1;
    if (!clear) return;
    ctx.player.camera.aimDirection(this.aim);
    const angle = Math.acos(THREE.MathUtils.clamp(this.aim.dot(this.toWizard.normalize()), -1, 1));
    if (angle < WIZARD_TUNING.flashCone) {
      this.lastFlash = 'full';
      ctx.blind(WIZARD_TUNING.flashSeconds, 1);
      ctx.combat.strike(ctx.player.combat, {
        damage: 6, direction: this.toWizard.clone().negate().setY(0).normalize(), point: ctx.playerEye.clone(),
        knockback: 0, stagger: 0.25, source: 'enemy', kind: 'enemy',
      });
    } else if (angle < WIZARD_TUNING.flashCone * 1.8) {
      this.lastFlash = 'partial';
      ctx.blind(WIZARD_TUNING.flashSeconds * 0.45, 0.55);
    }
  }

  private startBlink(ctx: AIContext): void {
    const target = this.findBlink(ctx);
    if (!target) { this.blinkCooldown = 1; return; }
    this.cancelAction();
    this.spell = null;
    this.blinkTarget = target;
    this.blinkCooldown = WIZARD_TUNING.blinkCooldown;
    this.setState('blink');
    ctx.effects.sparkBurst(this.tmp.copy(this.position).addScaledVector(UP, 1.2), UP, GOLD, 14, 4);
  }

  /** A perch or open ground 12–17 m away from the player, with line of sight to them. */
  findBlink(ctx: AIContext): THREE.Vector3 | null {
    const pp = ctx.player.controller.position;
    const col = ctx.colliders;
    const eye = new THREE.Vector3();
    const visible = (p: THREE.Vector3) => {
      eye.copy(p).addScaledVector(UP, 1.8);
      return col.sweepSphere(eye, ctx.playerEye, 0.08, Math.ceil(eye.distanceTo(ctx.playerEye) / 1.2) + 2, true) >= 1;
    };
    const perches = this.perches
      .filter(p => Math.hypot(p.x - pp.x, p.z - pp.z) > 9 && Math.hypot(p.x - this.position.x, p.z - this.position.z) > 1.5)
      .sort((a, b) => Math.hypot(b.x - pp.x, b.z - pp.z) - Math.hypot(a.x - pp.x, a.z - pp.z));
    for (const p of perches) if (visible(p)) return p.clone();
    const away = Math.atan2(this.position.x - pp.x, this.position.z - pp.z);
    const probe = new THREE.Vector3();
    for (let i = 0; i < 20; i++) {
      const a = away + (Math.random() - 0.5) * 3.2;
      const r = 12 + Math.random() * 5;
      const x = pp.x + Math.sin(a) * r;
      const z = pp.z + Math.cos(a) * r;
      const y = col.heightAt(x, z);
      if (y < 0.4) continue;
      const p = new THREE.Vector3(x, y, z);
      if (p.distanceTo(this.home) > this.leash * 0.9) continue;
      let blocked = false;
      for (const h of [0.5, 1.6]) {
        probe.set(x, y + h, z);
        if (col.overlaps(probe, this.bodyRadius + 0.1)) blocked = true;
      }
      if (!blocked && visible(p)) return p;
    }
    return null;
  }

  // --- defence -------------------------------------------------------------

  protected receive(hit: HitInfo): Received {
    if (hit.parry) return { damage: 0, stagger: 1 };
    // Casters are fragile: a solid blow breaks concentration.
    if (this.state === 'cast' && hit.damage >= WIZARD_TUNING.interruptDamage) {
      return { damage: hit.damage, stagger: Math.max(hit.stagger, 0.7) };
    }
    return { damage: hit.damage, stagger: hit.stagger };
  }

  protected onStagger(): void {
    super.onStagger();
    this.spell = null;
    this.blinkTarget = null;
  }

  protected recoverFromStagger(): void {
    // Shaken casters try to escape first.
    this.setState('duel');
    this.castCooldown = Math.max(this.castCooldown, 0.8);
  }

  // --- presentation --------------------------------------------------------

  protected animate(dt: number, ctx: AIContext): void {
    const t = ctx.clock;
    let scale = 1;
    if (this.state === 'blink') scale = this.stateTime < 0.25 ? 1 - this.stateTime / 0.25 : (this.stateTime - 0.25) / 0.25;
    const thin = Math.max(0.05, scale);
    this.visual.scale.set(thin, 1 + (1 - scale) * 1.5, thin);
    this.visual.position.y = 0.3 + Math.sin(t * 2.1 + this.home.x) * 0.12;
    let glowK = 2;
    let staffX = -0.1;
    if (this.state === 'cast' && this.spell) {
      const k = Math.min(1, this.stateTime / WIZARD_SPELLS[this.spell].windup);
      glowK = 2 + k * (this.spell === 'flash' ? 14 : 5);
      staffX = this.spell === 'lance' ? -2.4 * k : -1.2 * k;
      this.halo.scale.setScalar(1 + (this.spell === 'flash' ? k * 0.9 : k * 0.2));
    } else {
      this.halo.scale.setScalar(THREE.MathUtils.damp(this.halo.scale.x, 1, 6, dt));
    }
    if (this.state === 'staggered') staffX = 0.6;
    this.haloMat.color.setHex(GOLD).multiplyScalar(glowK);
    this.orbMat.color.setHex(0xfff0b0).multiplyScalar(glowK * 1.2);
    this.halo.rotation.z += dt * (this.state === 'cast' ? 4 : 0.6);
    this.staff.rotation.x = THREE.MathUtils.damp(this.staff.rotation.x, staffX, 12, dt);
  }
}
