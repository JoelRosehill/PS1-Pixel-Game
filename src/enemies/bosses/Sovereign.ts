import * as THREE from 'three';
import { box, cone, place } from '../../world/geometry';
import type { AIContext } from '../AIContext';
import { Boss, type BossDef } from './Boss';

const UP = new THREE.Vector3(0, 1, 0);
const MOON = 0xc8e8ff;

export const SOVEREIGN: BossDef = {
  id: 'sovereign', kind: 'sovereign', name: 'The Pale Sovereign', epithet: 'Who Kept the Moon', chapter: 8,
  health: 1500, phases: [0.6, 0.3], poise: 300,
};

/**
 * The Pale Sovereign (Job 8, the finale): a giant knight of moonlight at the Heart of
 * the Moon. Everything the knights and Sunkeepers taught comes back at scale — parry
 * its cleaves, reflect its moon blades, dodge its blink, read its lances. At the end it
 * calls the moon down on the whole arena; find the gaps.
 */
export class Sovereign extends Boss {
  private readonly armR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly crownMat: THREE.MeshBasicMaterial;
  private swingPitch = -0.3;
  private swingYaw = 0.2;
  private vanished = false;

  constructor() {
    super(SOVEREIGN, 1.8, 7.2);
    this.arenaRadius = 34;
    const plate = this.skin(0xd8d4e8);
    const dark = this.skin(0x2a2a4a);
    const cloth = this.skin(0x3a3a6a);
    const glowMat = this.light(MOON, 2.4);
    this.crownMat = this.light(0xfff0d8, 3);
    const v = this.visual;
    const S = 3;
    for (const s of [-1, 1]) this.mesh(v, place(box(0.3 * S, 1.0 * S, 0.34 * S, 1), s * 0.2 * S, 0.5 * S, 0), plate);
    this.mesh(v, place(box(0.84 * S, 0.9 * S, 0.52 * S, 1), 0, 1.5 * S, 0), plate);
    this.mesh(v, place(box(0.6 * S, 0.06 * S, 0.06 * S, 1), 0, 1.7 * S, 0.27 * S), glowMat, false);
    this.mesh(v, place(box(0.46 * S, 0.5 * S, 0.48 * S, 1), 0, 2.2 * S, 0.02 * S), dark);
    this.mesh(v, place(box(0.34 * S, 0.06 * S, 0.04 * S, 1), 0, 2.22 * S, 0.27 * S), glowMat, false);
    for (let i = 0; i < 5; i++) this.mesh(v, place(cone(0.05 * S, 0.3 * S, 4, 1), (i - 2) * 0.1 * S, 2.55 * S, 0), this.crownMat, false);
    this.mesh(v, place(box(0.9 * S, 1.6 * S, 0.06 * S, 1), 0, 1.3 * S, -0.3 * S, 0, -0.1), cloth);
    for (const s of [-1, 1]) this.mesh(v, place(box(0.4 * S, 0.24 * S, 0.46 * S, 1), s * 0.56 * S, 1.98 * S, 0), plate);
    this.armR.position.set(0.56 * S, 1.86 * S, 0);
    this.armR.rotation.order = 'YXZ';
    this.mesh(this.armR, place(box(0.22 * S, 0.7 * S, 0.24 * S, 1), 0, -0.33 * S, 0), plate);
    this.mesh(this.armR, place(box(0.14 * S, 1.9 * S, 0.05 * S, 1), 0, -1.6 * S, 0), plate);
    this.mesh(this.armR, place(box(0.04 * S, 1.8 * S, 0.06 * S, 1), 0, -1.6 * S, 0), glowMat, false);
    this.armL.position.set(-0.56 * S, 1.86 * S, 0);
    this.mesh(this.armL, place(box(0.22 * S, 0.7 * S, 0.24 * S, 1), 0, -0.33 * S, 0), plate);
    this.mesh(this.armL, place(new THREE.TorusGeometry(0.28 * S, 0.03 * S, 4, 16), 0, -0.8 * S, 0.1 * S), glowMat, false);
    v.add(this.armR, this.armL);
    for (const part of [v, this.armR, this.armL]) this.mergeStatic(part);
    this.group.name = 'boss:sovereign';
    this.buildMoves();
  }

  private buildMoves(): void {
    this.moves.push(
      {
        id: 'greatCleave', range: [0, 8.5], weight: 3, cooldown: 1.4, duration: 1.7, parryWindow: [0.7, 0.85],
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.55) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2.4, dt);
          this.swingPitch = -1.45;
          this.swingYaw = t < 0.7 ? 0.2 + t * 1.6 : THREE.MathUtils.lerp(1.3, -1.4, Math.min(1, (t - 0.7) / 0.15));
          if (t >= 0.7 && t - 1 / 60 < 0.7) this.hitCone(8.5, 1.3, 28, ctx, 10, 0.5);
        },
      },
      {
        id: 'moonDescent', range: [0, 9], weight: 2, cooldown: 4, duration: 2.6, parryWindow: [1.3, 1.45],
        start: ctx => ctx.telegraphs.circle(this.ahead(5, ctx), 3.5, 1.3, MOON),
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.9) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 1.6, dt);
          this.swingYaw = 0.1;
          this.swingPitch = t < 1.3 ? -0.3 - 2.6 * Math.min(1, t / 1.3) : -0.6;
          this.crownMat.color.setHex(0xfff0d8).multiplyScalar(3 + (t < 1.3 ? t * 6 : 0));
          if (t >= 1.3 && t - 1 / 60 < 1.3) {
            const at = this.ahead(5, ctx);
            this.hitCircle(at, 3.5, 40, ctx, 12, 0.7);
            const far = this.ahead(24, ctx);
            ctx.telegraphs.scheduleLane(at, far, 3, 0.35, MOON, (a, b, w) => {
              if (this.inLane(a, b, w, ctx)) this.hitCircle(ctx.player.controller.position, 0.1, 20, ctx, 6, 0.3, 'hazard');
            });
            ctx.effects.sparkBurst(at, UP, MOON, 30, 9);
            ctx.player.camera.addShake(0.7);
          }
        },
      },
      {
        id: 'moonBlades', range: [5, 60], weight: 2, cooldown: 3.5, duration: 1.6,
        tick: (t, dt, ctx) => {
          this.stop();
          this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 3, dt);
          this.swingPitch = -1.2; this.swingYaw = t < 0.7 ? 1.1 : -1.1;
          if (t >= 0.7 && t - 1 / 60 < 0.7) {
            const from = this.position.clone().addScaledVector(UP, 4.5);
            const base = ctx.playerEye.clone().sub(from).normalize();
            for (const off of [-0.5, -0.25, 0, 0.25, 0.5]) {
              const dir = base.clone().applyAxisAngle(UP, off);
              ctx.projectiles.fire(from.clone().addScaledVector(dir, 2), dir, 16, 16, this, 0.25, 'moon', 1.6);
            }
          }
        },
      },
      {
        id: 'blinkStrike', phases: [1, 2], weight: 2, cooldown: 6, duration: 2.3, parryWindow: [1.5, 1.62],
        tick: (t, dt, ctx) => {
          this.stop();
          if (t >= 0.3 && !this.vanished && t < 0.8) {
            this.vanished = true;
            ctx.effects.ring(this.position.clone().addScaledVector(UP, 3), MOON, 4, 0.4, true);
          }
          if (t >= 0.8 && this.vanished) {
            // Reappear behind the player.
            this.vanished = false;
            const p = ctx.player.controller.position;
            const yaw = ctx.player.camera.yaw;
            const bx = p.x + Math.sin(yaw) * 4.5, bz = p.z + Math.cos(yaw) * 4.5;
            this.position.set(bx, ctx.colliders.heightAt(bx, bz), bz);
            this.turnToward(p.x, p.z, 100, 1);
            ctx.effects.sparkBurst(this.position.clone().addScaledVector(UP, 3), UP, MOON, 24, 6);
          }
          if (t > 0.8 && t < 1.4) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 1.5, dt);
          this.swingPitch = -1.45;
          this.swingYaw = t < 1.5 ? 1.3 : THREE.MathUtils.lerp(1.3, -1.4, Math.min(1, (t - 1.5) / 0.15));
          if (t >= 1.5 && t - 1 / 60 < 1.5) this.hitCone(8, 1.3, 30, ctx, 10, 0.5);
        },
        end: () => { this.vanished = false; },
      },
      {
        id: 'lunarLances', phases: [1, 2], weight: 1.5, cooldown: 7, duration: 2.4,
        start: ctx => {
          const p = ctx.player.controller.position;
          for (let i = 0; i < 5; i++) {
            const a = (i / 4) * Math.PI * 2, r = i === 0 ? 0 : 6;
            const c = new THREE.Vector3(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r);
            c.y = ctx.colliders.heightAt(c.x, c.z);
            ctx.telegraphs.schedule(c, 3, 1.2 + i * 0.1, MOON, (pt, radius) => this.hitCircle(pt, radius, 24, ctx, 8, 0.4, 'hazard'));
          }
        },
        tick: () => { this.stop(); this.swingPitch = -2.6; this.swingYaw = 0; },
      },
      {
        id: 'moonfall', phases: [2], weight: 2.5, cooldown: 12, duration: 4.2,
        start: ctx => {
          // Fourteen falling moons across the arena; there are always gaps.
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (this.arenaRadius - 4);
            const c = new THREE.Vector3(this.arena.x + Math.sin(a) * r, 0, this.arena.z + Math.cos(a) * r);
            c.y = ctx.colliders.heightAt(c.x, c.z);
            ctx.telegraphs.schedule(c, 5, 2 + (i % 3) * 0.25, MOON, (pt, radius) => {
              this.hitCircle(pt, radius, 35, ctx, 10, 0.5, 'hazard');
              ctx.effects.sparkBurst(pt, UP, MOON, 12, 7);
            });
          }
        },
        tick: (t) => { this.stop(); this.swingPitch = -2.9; this.swingYaw = 0; this.crownMat.color.setHex(0xfff0d8).multiplyScalar(3 + Math.sin(t * 20) * 3 + 6); },
      },
    );
  }

  protected idle(dt: number, ctx: AIContext): void {
    this.stop();
    this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 1, dt);
    this.swingPitch = -0.2;
    this.swingYaw = 0.1;
  }

  protected roaring(): void {
    this.swingPitch = -2.8;
    this.crownMat.color.setHex(0xfff0d8).multiplyScalar(9);
  }

  protected locomotion(dt: number, ctx: AIContext): void {
    const p = ctx.player.controller.position;
    this.turnToward(p.x, p.z, 2.5, dt);
    this.swingPitch = -0.6;
    this.swingYaw = 0.3;
    if (this.distanceToPlayer(ctx) > 6) this.move(p.x - this.position.x, p.z - this.position.z, this.phase ? 4.6 : 3.6);
    else this.stop();
  }

  protected animate(dt: number): void {
    const k = 1 - Math.exp(-dt * 14);
    this.armR.rotation.x += (this.swingPitch - this.armR.rotation.x) * k;
    this.armR.rotation.y += (this.swingYaw - this.armR.rotation.y) * k;
    this.armL.rotation.x = THREE.MathUtils.damp(this.armL.rotation.x, this.state === 'staggered' ? 0.4 : -0.5, 6, dt);
    const hidden = this.vanished;
    this.visual.visible = !hidden;
    if (!this.current) this.crownMat.color.lerp(new THREE.Color(0xfff0d8).multiplyScalar(3), k);
    this.visual.rotation.x = this.state === 'staggered' ? 0.18 : 0;
  }
}
