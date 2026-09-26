import * as THREE from 'three';
import { type CreatureLibrary, type CreatureModel, gripWeapon } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { AIContext } from '../AIContext';
import type { BossDef, BossMove } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const ASH = 0xff8a4a;
const UP = new THREE.Vector3(0, 1, 0);

export const CADDOC: BossDef = {
  id: 'caddoc', kind: 'knight', name: 'Sir Caddoc', epithet: 'the Last Charge', chapter: 6,
  health: 2400, phases: [0.5], poise: 400, color: ASH,
};

/**
 * Sir Caddoc, the Last Charge (Chapter VI): the Sovereign's champion, who has ridden the
 * same charge down the Tourney Fields for four hundred years. Mounted, he rides lanes
 * across the arena, rears his Nightmare into shockwaves and lances past you. At half
 * health the horse falls and he fights on foot: a knight's combos, a leaping cleave, and
 * crescents of ash thrown from the blade — the very technique he once taught.
 */
export class Caddoc extends CreatureBoss {
  mounted = true;
  private rider: CreatureModel | null = null;
  private readonly riderSeat = new THREE.Group();
  private horseModel: CreatureModel | null = null;
  private knightModel: CreatureModel | null = null;
  private rammed = false;

  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(CADDOC, { creature: 'horse', height: 3.4, radius: 1.6, bodyHeight: 3.2, color: ASH, walk: 4, run: 14, keep: 14,
      tint: 0x5a4a50, emissive: 0xff5a2a, emissiveIntensity: 0.35 }, creatures, models);
    this.arenaRadius = 42;
    this.horseModel = this.model;
    // The knight rides in the saddle, then fights on foot in phase two.
    this.knightModel = this.makeModel('nemesis', 3.1, { tint: 0x8a7a80, emissive: 0xff6a2a, emissiveIntensity: 0.8 });
    if (this.knightModel) {
      const sword = models?.instantiateSync('ps1-medieval-long-sword', { size: 3, grounded: false });
      if (sword) gripWeapon(this.knightModel, sword.root);
      this.rider = this.knightModel;
      this.riderSeat.add(this.knightModel.root);
      this.knightModel.play('kneel', { fade: 0 });
      this.horseModel?.attach('saddle', this.riderSeat);
      this.riderSeat.scale.setScalar(1 / (this.horseModel?.scale ?? 1));
      this.riderSeat.position.y = -0.9;
    }
    const mounted = (m: BossMove): BossMove => ({ ...m, when: ctx => this.mounted && (m.when?.(ctx) ?? true) });
    const foot = (m: BossMove): BossMove => ({ ...m, when: ctx => !this.mounted && (m.when?.(ctx) ?? true) });
    this.add(
      mounted({
        id: 'charge', range: [8, 90], weight: 4, cooldown: 2.5, duration: 3,
        start: ctx => { this.chargeLane(ctx, 46, 5, 1.1); this.rammed = false; this.hold('run', 3, 1.3); this.riderPose('attack_thrust'); },
        tick: (t, _dt, ctx) => {
          if (t < 1.1) { this.stop(); return; }
          if (t < 2.6) {
            this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, 26); this.accel = 20;
            const p = ctx.player.controller.position;
            if (!this.rammed && Math.hypot(p.x - this.position.x, p.z - this.position.z) < 3.4) this.rammed = this.hitCircle(this.position, 3.4, 36, ctx, 20, 0.7);
          } else this.stop();
        },
        end: () => { this.accel = 14; this.stop(); this.riderPose('idle'); },
      }),
      mounted({
        id: 'rear', range: [0, 12], weight: 2.5, cooldown: 3, duration: 2,
        start: ctx => { this.act('attack_stomp', 0.8); this.slam(ctx, this.point(3, ctx), 5, 0.8, 32, 24); this.riderPose('roar'); },
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.8, dt)) this.landSlam(ctx); },
        end: () => this.riderPose('idle'),
      }),
      mounted({
        id: 'lance', range: [0, 9], weight: 3, cooldown: 1.4, duration: 1.4, parryWindow: [0.55, 0.66],
        start: () => { this.riderPose('attack_slash', 0.6); },
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.45) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 3, dt);
          if (this.at(t, 0.6, dt)) this.hitCone(7.5, 1.4, 30, ctx, 10, 0.5);
        },
        end: () => this.riderPose('idle'),
      }),
      mounted({
        id: 'ash', range: [10, 60], weight: 2, cooldown: 4, duration: 1.8,
        start: () => this.riderPose('cast', 0.7),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.7, dt)) this.crescents(ctx, 3); },
        end: () => this.riderPose('idle'),
      }),
      foot({
        id: 'cleave', range: [0, 6], weight: 3, cooldown: 1, duration: 1.5, parryWindow: [0.62, 0.74],
        start: () => this.act('attack_slash', 0.65),
        tick: (t, dt, ctx) => {
          if (t < 0.5) { this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 3, dt); this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, 3); } else this.stop();
          if (this.at(t, 0.65, dt)) this.hitCone(5.5, 1.3, 30, ctx, 9, 0.5);
        },
      }),
      foot({
        id: 'combo', range: [0, 6], weight: 2.5, cooldown: 3, duration: 2.4,
        start: () => this.act('attack_combo', 0.45),
        tick: (t, dt, ctx) => {
          this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, t < 1.5 ? 2.5 : 0);
          if (t < 1.2) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2, dt);
          for (const at of [0.45, 0.86, 1.38]) if (this.at(t, at, dt)) this.hitCone(5.4, 1.3, 24, ctx, 8, 0.45);
        },
      }),
      foot({
        id: 'leap', range: [6, 30], weight: 2, cooldown: 4, duration: 2.2,
        start: ctx => {
          const p = ctx.player.controller.position;
          this.slam(ctx, new THREE.Vector3(p.x, ctx.colliders.heightAt(p.x, p.z), p.z), 4, 1.05, 38, 18);
          this.act('attack_leap', 1.05);
        },
        tick: (t, dt, ctx) => {
          const p = ctx.player.controller.position;
          if (t > 0.45 && t < 1.05) { this.move(p.x - this.position.x, p.z - this.position.z, 20); this.accel = 24; } else this.stop();
          if (this.at(t, 1.05, dt)) this.landSlam(ctx);
        },
        end: () => { this.accel = 14; },
      }),
      foot({
        id: 'waves', range: [5, 60], weight: 2.5, cooldown: 3.5, duration: 1.9,
        start: () => this.act('attack_backslash', 0.5),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.5, dt)) this.crescents(ctx, 5); },
      }),
    );
  }

  /** Crescents of ash thrown from the blade: a fan of fast orbs along the ground. */
  private crescents(ctx: AIContext, count: number): void {
    const from = this.position.clone().addScaledVector(UP, this.mounted ? 3.4 : 1.8);
    const toward = ctx.playerEye.clone().sub(from).setY(0).normalize();
    for (let i = 0; i < count; i++) {
      const d = toward.clone().applyAxisAngle(UP, (i - (count - 1) / 2) * 0.16);
      ctx.projectiles.fire(from, d, 28, 22, this, 0.2, 'fire', 1.6);
    }
  }

  /** The rider's upper-body clip while mounted (kneel keeps his legs astride). */
  private riderPose(clip: string, hitAt?: number): void {
    const r = this.rider;
    if (!r || !this.mounted) return;
    if (clip === 'idle') { r.play('kneel', { fade: 0.3 }); return; }
    const at = r.event(clip);
    r.play(clip, { fade: 0.1, restart: true, speed: hitAt && at > 0 ? at / hitAt : 1 });
  }

  protected onPhase(phase: number, ctx: AIContext): void {
    super.onPhase(phase, ctx);
    if (phase >= 1 && this.mounted) this.dismount(ctx);
  }

  /** The Nightmare falls; Sir Caddoc stands and fights on foot. */
  private dismount(ctx: AIContext): void {
    this.mounted = false;
    ctx.effects.sparkBurst(this.position.clone().addScaledVector(UP, 2), UP, ASH, 40, 8);
    ctx.effects.ring(this.position.clone(), ASH, 10, 0.6);
    const horse = this.horseModel, knight = this.knightModel;
    if (horse && knight) {
      horse.root.visible = false;
      this.riderSeat.remove(knight.root);
      this.visual.add(knight.root);
      knight.root.scale.setScalar(1);
      this.model = knight;
      this.rider = null;
      knight.play('roar', { fade: 0.1, restart: true });
    }
    this.body.walk = 2.6; this.body.run = 7; this.body.keep = 4;
  }

  resetFight(): void {
    super.resetFight();
    if (!this.mounted && this.horseModel && this.knightModel) {
      this.visual.remove(this.knightModel.root);
      this.riderSeat.add(this.knightModel.root);
      this.horseModel.root.visible = true;
      this.model = this.horseModel;
      this.rider = this.knightModel;
      this.knightModel.play('kneel', { fade: 0 });
    }
    this.mounted = true;
    this.body.walk = 4; this.body.run = 14; this.body.keep = 14;
  }

  protected dress(dt: number): void {
    if (this.rider && this.mounted) this.rider.update(dt);
  }
}
