import * as THREE from 'three';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import { box, cone, place } from '../../world/geometry';
import type { AIContext } from '../AIContext';
import { Boss, type BossDef } from './Boss';

const UP = new THREE.Vector3(0, 1, 0);
const VIOLET = 0xb07cff;

export const GLOOMHORN: BossDef = {
  id: 'gloomhorn', kind: 'beast', name: 'Gloomhorn', epithet: 'the Mire Colossus', chapter: 2,
  health: 900, phases: [0.5], poise: 260,
};

/**
 * Gloomhorn, the Mire Colossus (Job 8, the colossal beast). Slow, enormous, and
 * readable: it rears before it slams (jump the shockwave), drops its head before it
 * charges (step off the lane), and swipes with a tell you can parry. Below half health
 * it calls knights from the mire and splits the ground with spike lines.
 */
export class Gloomhorn extends Boss {
  private readonly standIn = new THREE.Group();
  private lean = 0;
  private laneFrom = new THREE.Vector3();
  private laneTo = new THREE.Vector3();
  private charged = false;
  private slamPoint = new THREE.Vector3();

  constructor() {
    super(GLOOMHORN, 3.2, 9);
    this.arenaRadius = 34;
    // Stand-in until the model streams in: a hunched horned bulk.
    const hide = this.skin(0x1c1628);
    const eye = this.light(VIOLET, 3.5);
    this.mesh(this.standIn, place(box(5, 5, 4, 1), 0, 4.5, 0), hide);
    this.mesh(this.standIn, place(box(3, 2.6, 3, 1), 0, 6.8, 2), hide);
    for (const s of [-1, 1]) {
      this.mesh(this.standIn, place(cone(0.6, 3.5, 5, 1), s * 1.4, 8.6, 2.2, 0, -0.4, s * 0.5), hide);
      this.mesh(this.standIn, place(box(1.4, 4.6, 1.4, 1), s * 3.2, 2.8, 0.8), hide);
      this.mesh(this.standIn, place(box(0.4, 0.3, 0.2, 1), s * 0.7, 7.1, 3.55), eye, false);
    }
    this.visual.add(this.standIn);
    this.group.name = 'boss:gloomhorn';
    this.buildMoves();
  }

  loadModel(library: ModelLibrary): void {
    library.instantiate('shadow-demon-creature-hitem3d-vs-supavoxel', { height: 10.5, omitPresentation: true })
      .then(asset => { asset.root.rotation.y = Math.PI; this.attachModel(asset.root, this.standIn); })
      .catch(() => { /* keep the stand-in */ });
  }

  private buildMoves(): void {
    this.moves.push(
      {
        id: 'slam', range: [0, 10], weight: 3, cooldown: 2.4, duration: 2.3,
        start: ctx => {
          this.ahead(5.5, ctx, this.slamPoint);
          ctx.telegraphs.circle(this.slamPoint, 5, 1.05, VIOLET);
        },
        tick: (t, _dt, ctx) => {
          this.stop();
          this.lean = t < 1.05 ? -0.35 * Math.min(1, t / 1.05) : 0.25;
          if (t >= 1.05 && t - 1 / 60 < 1.05) {
            this.hitCircle(this.slamPoint, 5, 34, ctx, 10, 0.6);
            ctx.hazards.shockwave(this.slamPoint, 14, 20, 18, VIOLET, this);
            ctx.effects.sparkBurst(this.slamPoint, UP, VIOLET, 30, 9);
            ctx.player.camera.addShake(0.8);
          }
        },
        end: () => { this.lean = 0; },
      },
      {
        id: 'swipe', range: [0, 7.5], weight: 3, cooldown: 1.6, duration: 1.6, parryWindow: [0.62, 0.72],
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.5) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 1.4, dt);
          this.lean = t < 0.62 ? -0.15 : 0.1;
          if (t >= 0.62 && t - 1 / 60 < 0.62) {
            this.hitCone(7.5, 1.25, 22, ctx, 9, 0.45);
            ctx.effects.sparkBurst(this.ahead(5, ctx), UP, VIOLET, 14, 6);
          }
        },
        end: () => { this.lean = 0; },
      },
      {
        id: 'charge', range: [10, 60], weight: 2, cooldown: 5, duration: 2.6,
        start: ctx => {
          const p = ctx.player.controller.position;
          this.laneFrom.copy(this.position);
          const dir = new THREE.Vector3(p.x - this.position.x, 0, p.z - this.position.z).normalize();
          this.laneTo.copy(this.position).addScaledVector(dir, 30);
          this.laneTo.y = ctx.colliders.heightAt(this.laneTo.x, this.laneTo.z);
          this.facing = Math.atan2(-dir.x, -dir.z);
          ctx.telegraphs.lane(this.laneFrom, this.laneTo, 6, 0.9, VIOLET);
          this.charged = false;
        },
        tick: (t, _dt, ctx) => {
          if (t < 0.9) { this.stop(); this.lean = 0.2; return; }
          if (t < 2.2) {
            this.forward(this.tmp2);
            this.move(this.tmp2.x, this.tmp2.z, 22);
            this.accel = 30;
            if (!this.charged && Math.hypot(ctx.player.controller.position.x - this.position.x, ctx.player.controller.position.z - this.position.z) < this.bodyRadius + 1.4) {
              this.hitCircle(this.position, this.bodyRadius + 1.4, 30, ctx, 14, 0.6);
              this.charged = true;
            }
          } else this.stop();
        },
        end: () => { this.accel = 14; this.lean = 0; this.stop(); },
      },
      {
        id: 'roar', range: [0, 14], weight: 1, cooldown: 9, duration: 1.7,
        tick: (t, _dt, ctx) => {
          this.stop();
          if (t >= 0.5 && t - 1 / 60 < 0.5) {
            ctx.effects.ring(this.position.clone().addScaledVector(UP, 1), VIOLET, 10, 0.6);
            ctx.player.camera.addShake(0.6);
            this.hitCircle(this.position, 9, 6, ctx, 16, 0.4, 'hazard');
          }
        },
      },
      {
        id: 'summon', phases: [1], weight: 2, cooldown: 999, duration: 1.8,
        tick: (t, _dt, ctx) => {
          this.stop();
          if (t >= 0.8 && t - 1 / 60 < 0.8) {
            for (const s of [-1, 1]) {
              const a = this.facing + s * 1.2;
              ctx.spawn('knight', this.position.x - Math.sin(a) * 9, this.position.z - Math.cos(a) * 9);
            }
          }
        },
      },
      {
        id: 'spikeLines', phases: [1], range: [3, 40], weight: 3.5, cooldown: 6, duration: 2.4,
        start: ctx => {
          const p = ctx.player.controller.position;
          const base = Math.atan2(p.x - this.position.x, p.z - this.position.z);
          for (const off of [-0.32, 0, 0.32]) {
            const a = base + off;
            const from = this.position.clone();
            const to = from.clone().add(new THREE.Vector3(Math.sin(a) * 26, 0, Math.cos(a) * 26));
            to.y = ctx.colliders.heightAt(to.x, to.z);
            ctx.telegraphs.scheduleLane(from, to, 3, 1.1, VIOLET, (f, e, w) => {
              if (this.inLane(f, e, w, ctx)) this.hitCircle(ctx.player.controller.position, 0.1, 24, ctx, 6, 0.4, 'hazard');
              for (let k = 1; k <= 6; k++) {
                const pt = f.clone().lerp(e, k / 6);
                pt.y = ctx.colliders.heightAt(pt.x, pt.z);
                ctx.telegraphs.pillar(pt, 0.8, 4 + k * 0.5, VIOLET, 0.6);
              }
            });
          }
        },
        tick: () => this.stop(),
      },
    );
  }

  protected idle(dt: number, ctx: AIContext): void {
    this.stop();
    this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 0.8, dt);
  }

  protected roaring(dt: number, ctx: AIContext): void {
    this.lean = Math.sin(this.stateTime * 30) * 0.05 - 0.2;
    if (this.transition > 1.7) ctx.effects.ring(this.position.clone().addScaledVector(UP, 0.5), VIOLET, 18, 0.9);
    void dt;
  }

  protected locomotion(dt: number, ctx: AIContext): void {
    const p = ctx.player.controller.position;
    this.turnToward(p.x, p.z, this.phase ? 2 : 1.5, dt);
    const d = this.distanceToPlayer(ctx);
    if (d > 7) this.move(p.x - this.position.x, p.z - this.position.z, this.phase ? 4.2 : 3.2);
    else this.stop();
  }

  protected animate(dt: number): void {
    this.visual.rotation.x = THREE.MathUtils.damp(this.visual.rotation.x, this.state === 'staggered' ? 0.3 : this.lean, 8, dt);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.visual.position.y = Math.abs(Math.sin(this.stateTime * speed * 0.5)) * Math.min(0.3, speed * 0.03);
  }
}
