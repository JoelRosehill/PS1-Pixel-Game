import * as THREE from 'three';
import type { CreatureLibrary } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { AIContext } from '../AIContext';
import type { BossDef } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const HALO_Y = 7.2;
const SUN = 0xffd36a;
const UP = new THREE.Vector3(0, 1, 0);

export const SOLENNE: BossDef = {
  id: 'solenne', kind: 'caster', name: 'Solenne', epithet: 'the Blind Sunkeeper', chapter: 3,
  health: 1700, phases: [0.6, 0.25], poise: 280, color: SUN,
};

/**
 * Solenne, the Blind Sunkeeper (Chapter III). The High Keeper who stared into the false
 * sun of the Temple until it took her eyes, seven metres tall under a burning halo (the
 * user's low-poly sun). A caster that punishes standing still: orb barrages, sunfall,
 * a blinding flash (turn away or dash), a sweeping solar beam, a staff slam when you
 * crowd her — and she blinks away. At a quarter health the False Dawn descends.
 */
export class Solenne extends CreatureBoss {
  private halo: THREE.Object3D | null = null;
  private beamAngle = 0;
  private beamTick = 0;

  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(SOLENNE, { creature: 'wanderer', height: 7, radius: 1.6, bodyHeight: 6.8, color: SUN, walk: 2.2, run: 5, keep: 14,
      tint: 0xfff4d8, emissive: 0xffc060, emissiveIntensity: 0.5 }, creatures, models);
    this.arenaRadius = 36;
    const sun = models?.instantiateSync('ps1-style-low-poly-sun', { size: 4.4, grounded: false });
    if (sun) {
      this.halo = sun.root;
      this.halo.position.set(0, HALO_Y, -3.2); // behind her head, so it reads as a halo
      this.visual.add(this.halo);
    }
    this.add(
      {
        id: 'orbs', range: [0, 60], weight: 3, cooldown: 1.6, duration: 1.6,
        start: () => this.act('cast', 0.62),
        tick: (t, dt, ctx) => {
          this.stop(); this.face(ctx, dt);
          if (this.at(t, 0.62, dt)) this.volleyOrbs(ctx, this.phase ? 7 : 5, 0.15, 17, 20, 1.0, 'sun', 1.5, 'head');
        },
      },
      {
        id: 'sunfall', range: [0, 60], weight: 2.5, cooldown: 4, duration: 2.2,
        start: () => this.act('cast_sky', 0.8),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.8, dt)) this.rain(ctx, this.phase ? 9 : 6, 3, 1.1, 6, 30, SUN); },
      },
      {
        id: 'flash', range: [0, 45], weight: 1.5, cooldown: 8, duration: 2.2,
        start: ctx => {
          this.act('cast_sky', 1.3);
          ctx.effects.ring(this.position.clone().addScaledVector(UP, 7), SUN, 4, 1.3, true);
        },
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 1.3 && Math.random() < 0.5) ctx.effects.sparkBurst(this.position.clone().addScaledVector(UP, 7.4), UP, SUN, 3, 5);
          if (this.at(t, 1.3, dt)) {
            // Looking at her when the halo flares blinds you; dashing through it is safe.
            const toBoss = this.position.clone().addScaledVector(UP, 7).sub(ctx.playerEye).normalize();
            const look = ctx.player.camera.aimDirection(new THREE.Vector3());
            const facing = look.dot(toBoss) > 0.3;
            if (facing && !ctx.player.controller.invulnerable) ctx.blind(2.6, 0.95);
            ctx.effects.ring(this.position.clone().setY(this.position.y + 0.3), SUN, 16, 0.5);
            this.hitCircle(this.position, 9, 14, ctx, 14, 0.4, 'hazard');
          }
        },
      },
      {
        id: 'beam', range: [6, 40], weight: 2, cooldown: 7, duration: 3.4,
        start: ctx => {
          this.hold('cast_loop', 3.4);
          const p = ctx.player.controller.position;
          this.beamAngle = Math.atan2(p.x - this.position.x, p.z - this.position.z) - 0.9;
          this.beamTick = 0;
          const to = this.position.clone().add(new THREE.Vector3(Math.sin(this.beamAngle) * 30, 0, Math.cos(this.beamAngle) * 30));
          ctx.telegraphs.lane(this.position, to, 2.4, 0.8, SUN);
        },
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.8) return;
          this.beamAngle += dt * (this.phase ? 0.8 : 0.6);
          this.facing = Math.atan2(-Math.sin(this.beamAngle), -Math.cos(this.beamAngle));
          const from = this.position.clone().addScaledVector(UP, 5);
          const to = this.position.clone().add(new THREE.Vector3(Math.sin(this.beamAngle) * 34, 0, Math.cos(this.beamAngle) * 34));
          to.y = ctx.colliders.heightAt(to.x, to.z);
          ctx.telegraphs.lane(this.position, to, 2.4, 0.1, SUN);
          ctx.effects.sparkBurst(to, UP, SUN, 2, 4);
          void from;
          this.beamTick -= dt;
          if (this.beamTick <= 0 && this.inLane(this.position, to, 2.4, ctx)) {
            this.beamTick = 0.25;
            this.hitCircle(ctx.player.controller.position, 0.1, 12, ctx, 4, 0.2, 'hazard');
          }
        },
      },
      {
        id: 'staff', range: [0, 7], weight: 3, cooldown: 1.5, duration: 1.9,
        start: ctx => { this.act('attack_overhead', 0.9); this.slam(ctx, this.point(3.6, ctx), 3.6, 0.9, 30, 14); },
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.9, dt)) this.landSlam(ctx); },
      },
      {
        id: 'blink', range: [0, 8], weight: 2.5, cooldown: 3, duration: 0.9,
        start: ctx => this.blinkAway(ctx),
        tick: () => this.stop(),
      },
      {
        id: 'dawn', phases: [2], weight: 5, cooldown: 12, duration: 4.2,
        start: ctx => {
          this.act('cast_sky', 3.4);
          // The False Dawn: the whole arena burns except a ring of shade around her.
          ctx.telegraphs.circle(this.position.clone().setY(ctx.colliders.heightAt(this.position.x, this.position.z)), this.arenaRadius - 2, 3.4, SUN);
          ctx.telegraphs.circle(this.position.clone().setY(ctx.colliders.heightAt(this.position.x, this.position.z)), 6, 3.4, 0x6aa0ff);
        },
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.halo) this.halo.position.y = HALO_Y + Math.min(1, t / 3.4) * 6;
          if (this.at(t, 3.4, dt)) {
            ctx.effects.ring(this.position.clone().setY(this.position.y + 0.5), SUN, this.arenaRadius, 0.9);
            const p = ctx.player.controller.position;
            const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
            if (d > 6.4) this.hitCircle(p, 0.1, 55, ctx, 10, 0.6, 'hazard');
            ctx.player.camera.addShake(1);
          }
        },
        end: () => { if (this.halo) this.halo.position.y = HALO_Y; },
      },
    );
  }

  private face(ctx: AIContext, dt: number): void {
    this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 3, dt);
  }

  private blinkAway(ctx: AIContext): void {
    const p = ctx.player.controller.position;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * (this.arenaRadius - 14);
      const x = this.arena.x + Math.sin(a) * r, z = this.arena.z + Math.cos(a) * r;
      if (Math.hypot(x - p.x, z - p.z) < 12) continue;
      ctx.effects.sparkBurst(this.position.clone().addScaledVector(UP, 3), UP, SUN, 24, 6);
      this.position.set(x, ctx.colliders.heightAt(x, z), z);
      ctx.effects.sparkBurst(this.position.clone().addScaledVector(UP, 3), UP, SUN, 24, 6);
      this.act('dodge');
      return;
    }
  }

  protected dress(dt: number): void {
    if (this.halo) this.halo.rotation.y += dt * 0.4;
  }
}
