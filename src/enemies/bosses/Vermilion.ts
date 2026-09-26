import * as THREE from 'three';
import type { CreatureLibrary } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { AIContext } from '../AIContext';
import type { BossDef, BossMove } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const FIRE = 0xff5a2a;
const UP = new THREE.Vector3(0, 1, 0);

export const VERMILION: BossDef = {
  id: 'vermilion', kind: 'dragon', name: 'Vermilion', epithet: 'the Red Calamity', chapter: 5,
  health: 2800, phases: [0.6, 0.3], poise: 440, color: FIRE,
};

/**
 * Vermilion, the Red Calamity (Chapter V): the red dragon, animated at last. It fights on
 * the ground — bites, claws, a tail sweep that clears the space behind it, a wing gust,
 * a sweeping breath — then takes off to circle the canyon, rain fireballs and dive along
 * a burning lane before landing in a shockwave. Ranged attacks are how you reach it in
 * the air; a reflected fireball (parry) brings it crashing down. At 30 % its wing tears
 * and it stays grounded, furious.
 */
export class Vermilion extends CreatureBoss {
  /** Times a reflected fireball brought it down. */
  knockdowns = 0;
  private groundTime = 0;
  private breathTick = 0;
  private diveFrom = new THREE.Vector3();
  private diveTo = new THREE.Vector3();

  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(VERMILION, { creature: 'dragon', height: 5, radius: 3.4, bodyHeight: 5, color: FIRE, walk: 4, run: 9, keep: 9 }, creatures, models);
    this.arenaRadius = 40;
    this.altitude = 16;
    const air = (m: BossMove): BossMove => ({ ...m, when: ctx => this.airborne && (m.when?.(ctx) ?? true) });
    const ground = (m: BossMove): BossMove => ({ ...m, when: ctx => !this.airborne && (m.when?.(ctx) ?? true) });
    this.add(
      ground({
        id: 'bite', range: [0, 13], weight: 3, cooldown: 1.2, duration: 1.5, parryWindow: [0.5, 0.64],
        start: () => this.act('attack_bite', 0.58),
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.4) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2.5, dt);
          if (this.at(t, 0.58, dt)) this.hitCone(13, 0.55, 36, ctx, 11, 0.55);
        },
      }),
      ground({
        id: 'claw', range: [0, 11], weight: 2, cooldown: 1.6, duration: 1.5,
        start: () => this.act('attack_claw', 0.62),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.62, dt)) this.hitCone(10, 1.2, 30, ctx, 12, 0.5); },
      }),
      ground({
        id: 'tail', range: [0, 14], weight: 2, cooldown: 3, duration: 1.8,
        when: ctx => Math.abs(this.angleToPlayer(ctx)) > 1.2 || Math.random() < 0.3,
        start: ctx => { this.act('attack_tail', 0.8); ctx.telegraphs.circle(this.position.clone(), 13, 0.8, FIRE); },
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) { this.hitCircle(this.position, 13, 30, ctx, 18, 0.6); ctx.player.camera.addShake(0.6); }
        },
      }),
      ground({
        id: 'buffet', range: [0, 16], weight: 1.5, cooldown: 5, duration: 1.9,
        start: () => this.act('attack_buffet', 0.85),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.85, dt)) {
            ctx.effects.ring(this.position.clone().setY(this.position.y + 1), 0xffd0a0, 16, 0.5);
            if (this.hitCone(16, 1.1, 10, ctx, 26, 0.3)) ctx.player.controller.addImpulse(0, 6, 0);
          }
        },
      }),
      ground({
        id: 'breath', range: [4, 26], weight: 2.5, cooldown: 5, duration: 3,
        start: () => { this.act('breath', 0.85); this.breathTick = 0; },
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.85) { this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2, dt); return; }
          if (t < 2.4) this.flame(ctx, dt, 22, 0.35);
        },
      }),
      ground({
        id: 'takeoff', phases: [0, 1], weight: 2, cooldown: 1, duration: 1.8,
        when: () => this.groundTime > 12,
        start: () => this.act('takeoff', 0.55),
        tick: (t, dt) => { this.stop(); if (this.at(t, 0.55, dt)) { this.airborne = true; this.collider.active = false; } },
      }),
      air({
        id: 'fireballs', range: [0, 80], weight: 3, cooldown: 2, duration: 2.6,
        start: () => this.act('breath_air', 0.7),
        tick: (t, dt, ctx) => {
          this.circleArena(dt * 0.5, 24, 0.4);
          this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 6, dt);
          for (const at of [0.7, 1.2, 1.7]) if (this.at(t, at, dt)) this.volleyOrbs(ctx, this.phase ? 3 : 2, 0.25, 26, 24, 0.5, 'fire', 2.2);
        },
      }),
      air({
        id: 'dive', range: [0, 80], weight: 2, cooldown: 4, duration: 3,
        start: ctx => {
          const p = ctx.player.controller.position;
          this.diveFrom.copy(this.position).setY(ctx.colliders.heightAt(this.position.x, this.position.z));
          const dir = new THREE.Vector3(p.x - this.position.x, 0, p.z - this.position.z).normalize();
          this.diveTo.copy(p).addScaledVector(dir, 14);
          this.diveTo.y = ctx.colliders.heightAt(this.diveTo.x, this.diveTo.z);
          ctx.telegraphs.lane(this.diveFrom, this.diveTo, 7, 1.1, FIRE);
          this.act('dive');
        },
        tick: (t, _dt, ctx) => {
          if (t < 1.1) { this.stop(); this.altitude = 18; return; }
          if (t < 2.2) {
            this.altitude = 3;
            this.move(this.diveTo.x - this.position.x, this.diveTo.z - this.position.z, 30);
            this.accel = 12;
            if (this.inLane(this.diveFrom, this.diveTo, 7, ctx) && Math.hypot(ctx.player.controller.position.x - this.position.x,
              ctx.player.controller.position.z - this.position.z) < 6) this.hitCircle(ctx.player.controller.position, 0.1, 34, ctx, 16, 0.6);
            if (Math.random() < 0.6) ctx.hazards.zone(this.position.clone().setY(ctx.colliders.heightAt(this.position.x, this.position.z)), 3.4, 3, 8, FIRE);
          } else { this.altitude = 16; this.stop(); }
        },
        end: () => { this.accel = 14; this.altitude = 16; },
      }),
      air({
        id: 'land', range: [0, 80], weight: 1.5, cooldown: 1, duration: 2,
        when: () => this.history.slice(-3).every(id => id !== 'land') && this.history.length > 2,
        start: ctx => {
          const p = ctx.player.controller.position;
          const at = new THREE.Vector3(p.x, ctx.colliders.heightAt(p.x, p.z), p.z);
          this.slam(ctx, at, 7, 1.3, 38, 26);
          this.act('land', 1.3);
        },
        tick: (t, dt, ctx) => {
          const p = ctx.player.controller.position;
          if (t < 1.3) { this.move(p.x - this.position.x, p.z - this.position.z, 14); this.altitude = Math.max(0, 16 * (1 - t / 1.3)); }
          if (this.at(t, 1.3, dt)) { this.airborne = false; this.collider.active = true; this.altitude = 0; this.groundTime = 0; this.landSlam(ctx); }
        },
        end: () => { this.airborne = false; this.collider.active = true; this.altitude = 16; this.groundTime = 0; },
      }),
      ground({
        id: 'inferno', phases: [2], range: [0, 60], weight: 3, cooldown: 7, duration: 3.2,
        start: () => this.act('roar', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) this.rain(ctx, 10, 3.2, 1.2, 9, 30, FIRE);
        },
      }),
    );
  }

  /** Breathes a cone of fire toward where it faces, sweeping a little after the player. */
  private flame(ctx: AIContext, dt: number, range: number, halfAngle: number): void {
    this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 0.7, dt);
    const mouth = this.model?.bone('mouth') ? this.model.socket('mouth', new THREE.Vector3()) : this.position.clone().addScaledVector(UP, 4);
    this.forward(this.tmp);
    ctx.effects.sparkBurst(mouth, this.tmp.clone().setY(-0.25), FIRE, 6, 20);
    this.breathTick -= dt;
    if (this.breathTick <= 0) {
      this.breathTick = 0.15;
      this.hitCone(range, halfAngle, 9, ctx, 3, 0.1);
      const ground = this.point(range * (0.4 + Math.random() * 0.5), ctx);
      if (Math.random() < 0.4) ctx.hazards.zone(ground, 2.6, 2.5, 6, FIRE);
    }
  }

  /** A reflected fireball struck it: in the air, that brings it down. */
  knockDown(ctx: AIContext): void {
    if (!this.airborne || !this.alive) return;
    this.knockdowns++;
    this.current = null;
    this.airborne = false;
    this.collider.active = true;
    this.groundTime = 0;
    this.exposed = 3.5;
    this.stagger(2.6);
    ctx.effects.ring(this.position.clone(), FIRE, 12, 0.7);
    ctx.player.camera.addShake(0.9);
  }

  protected think(dt: number, ctx: AIContext): void {
    super.think(dt, ctx);
    if (!this.airborne) this.groundTime += dt;
    // Torn wing: from the last phase it never flies again.
    if (this.phase >= 2 && this.airborne && !this.current) { this.airborne = false; this.collider.active = true; this.stagger(1.5); }
  }

  protected locomotion(dt: number, ctx: AIContext): void {
    if (this.airborne) { this.circleArena(dt, 24, this.phase ? 0.55 : 0.42); return; }
    super.locomotion(dt, ctx);
  }

  resetFight(): void {
    super.resetFight();
    this.airborne = false;
    this.collider.active = true;
    this.groundTime = 0;
    this.altitude = 16;
  }
}
