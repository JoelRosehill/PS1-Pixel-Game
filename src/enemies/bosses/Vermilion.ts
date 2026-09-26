import * as THREE from 'three';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import { box, cone, place } from '../../world/geometry';
import type { AIContext } from '../AIContext';
import { Boss, type BossDef, type BossMove } from './Boss';

const UP = new THREE.Vector3(0, 1, 0);
const FIRE = 0xff5a2a;

export const VERMILION: BossDef = {
  id: 'vermilion', kind: 'dragon', name: 'Vermilion', epithet: 'Wyrm of the Red Hour', chapter: 5,
  health: 1200, phases: [0.6, 0.25], poise: 320,
};

/**
 * Vermilion, Wyrm of the Red Hour (Job 8, the dragon-kin). In the air it circles the
 * arena throwing fire; only spells and reflected fire can reach it. Parry one of its
 * fireballs back and it crashes to the ground, open to the sword. It lands on its own
 * after diving, then fights with bite, tail and wing. At a quarter health its wings
 * tear and it stays grounded, ringing the arena with fire novas.
 */
export class Vermilion extends Boss {
  airborne = true;
  /** Times a reflected fireball knocked it down (tests). */
  knockdowns = 0;
  private groundTimer = 0;
  private orbit = 0;
  private altitude = 18;
  private readonly standIn = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private readonly diveFrom = new THREE.Vector3();
  private readonly diveTo = new THREE.Vector3();
  private readonly laneA = new THREE.Vector3();
  private readonly laneB = new THREE.Vector3();

  constructor() {
    super(VERMILION, 4.5, 5.5);
    this.arenaRadius = 36;
    this.leash = 200;
    const scale = this.skin(0x7a1a1a);
    const belly = this.skin(0xc8783a);
    const eye = this.light(0xffd36a, 3);
    this.mesh(this.standIn, place(box(3.4, 3, 11, 1), 0, 3, 0), scale);
    this.mesh(this.standIn, place(box(2, 2, 4, 1), 0, 4.4, 6.6), scale);
    this.mesh(this.standIn, place(box(2.6, 0.6, 9, 1), 0, 1.6, 0), belly);
    for (const s of [-1, 1]) {
      this.mesh(this.standIn, place(box(12, 0.3, 6, 1), s * 7.5, 4.5, -1, 0, 0, s * 0.25), scale);
      this.mesh(this.standIn, place(cone(0.3, 2, 4, 1), s * 0.6, 5.8, 6, 0, -0.6, 0), belly);
      this.mesh(this.standIn, place(box(0.3, 0.2, 0.2, 1), s * 0.6, 4.7, 8.6), eye, false);
    }
    this.mesh(this.standIn, place(box(1.2, 1.2, 10, 1), 0, 2.4, -9), scale);
    this.visual.add(this.standIn);
    this.group.name = 'boss:vermilion';
    this.collider.active = false; // airborne at the start
    this.buildMoves();
  }

  loadModel(library: ModelLibrary): void {
    library.instantiate('red-dragon', { size: 30, grounded: false })
      .then(asset => {
        asset.root.rotation.y = Math.PI;
        asset.root.position.y = 3;
        this.attachModel(asset.root, this.standIn);
        if (asset.animations.length) {
          this.mixer = new THREE.AnimationMixer(asset.content);
          const clip = asset.animations.find(a => /angryFlightPose/i.test(a.name)) ?? asset.animations[0];
          this.mixer.clipAction(clip).play();
        }
      })
      .catch(() => { /* keep the stand-in */ });
  }

  /** A reflected fireball struck it: in the air, that brings it down. */
  knockDown(ctx: AIContext): void {
    if (!this.airborne || !this.alive) return;
    this.abortMove(ctx);
    this.land(ctx, 7);
    this.knockdowns++;
    this.stagger(3);
    this.exposed = 3;
    ctx.effects.sparkBurst(this.position.clone().addScaledVector(UP, 2), UP, FIRE, 40, 10);
    ctx.player.camera.addShake(0.9);
  }

  private land(ctx: AIContext, seconds: number): void {
    this.airborne = false;
    this.groundTimer = seconds;
    this.position.y = ctx.colliders.heightAt(this.position.x, this.position.z);
    this.velocity.set(0, 0, 0);
    this.collider.active = true;
  }

  private takeOff(): void {
    this.airborne = true;
    this.collider.active = false;
    this.orbit = Math.atan2(this.position.x - this.arena.x, this.position.z - this.arena.z);
  }

  private mouth(out: THREE.Vector3): THREE.Vector3 {
    this.forward(out);
    return out.multiplyScalar(7).add(this.position).addScaledVector(UP, this.airborne ? 1 : 4);
  }

  private buildMoves(): void {
    const air = (m: BossMove): BossMove => ({ ...m, when: ctx => this.airborne && (m.when?.(ctx) ?? true) });
    const ground = (m: BossMove): BossMove => ({ ...m, when: ctx => !this.airborne && (m.when?.(ctx) ?? true) });
    this.moves.push(
      air({
        id: 'fireVolley', weight: 3, cooldown: 2.4, duration: 1.7,
        tick: (t, _dt, ctx) => {
          for (const at of [0.5, 0.85, 1.2]) {
            if (t >= at && t - 1 / 60 < at) {
              const from = this.mouth(new THREE.Vector3());
              const dir = ctx.playerEye.clone().sub(from).normalize();
              ctx.projectiles.fire(from, dir, 17, 16, this, 0.7, 'fire', 2.2);
            }
          }
        },
      }),
      air({
        id: 'breathRun', weight: 2, cooldown: 7, duration: 3.2,
        start: ctx => {
          const p = ctx.player.controller.position;
          const a = Math.random() * Math.PI * 2;
          const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          this.laneA.copy(p).addScaledVector(d, -17);
          this.laneB.copy(p).addScaledVector(d, 17);
          this.laneA.y = ctx.colliders.heightAt(this.laneA.x, this.laneA.z);
          this.laneB.y = ctx.colliders.heightAt(this.laneB.x, this.laneB.z);
          ctx.telegraphs.scheduleLane(this.laneA, this.laneB, 7, 1.3, FIRE, (a0, b0, w) => {
            if (this.inLane(a0, b0, w, ctx)) this.hitCircle(ctx.player.controller.position, 0.1, 20, ctx, 5, 0.3, 'hazard');
            for (let k = 0; k <= 4; k++) {
              const c = a0.clone().lerp(b0, k / 4);
              c.y = ctx.colliders.heightAt(c.x, c.z);
              ctx.hazards.zone(c, 3.6, 3, 8, FIRE);
            }
          });
        },
        tick: (t, _dt, ctx) => {
          // Swoop along the lane as the fire falls.
          const k = THREE.MathUtils.clamp((t - 0.9) / 1.4, 0, 1);
          const target = this.laneA.clone().lerp(this.laneB, k).addScaledVector(UP, 10 + (1 - k) * 6);
          this.position.lerp(target, 0.12);
          this.facing = Math.atan2(-(this.laneB.x - this.laneA.x), -(this.laneB.z - this.laneA.z));
          if (k > 0 && k < 1 && Math.random() < 0.5) ctx.effects.sparkBurst(this.mouth(new THREE.Vector3()), new THREE.Vector3(0, -1, 0), FIRE, 4, 8);
        },
      }),
      air({
        id: 'dive', weight: 2, cooldown: 9, duration: 2.4,
        when: () => this.phase < 2,
        start: ctx => {
          this.diveFrom.copy(this.position);
          this.diveTo.copy(ctx.player.controller.position);
          this.diveTo.y = ctx.colliders.heightAt(this.diveTo.x, this.diveTo.z);
          ctx.telegraphs.circle(this.diveTo, 7, 1.3, FIRE);
        },
        tick: (t, _dt, ctx) => {
          const k = Math.min(1, t / 1.3);
          this.position.lerpVectors(this.diveFrom, this.diveTo, k * k);
          this.turnToward(this.diveTo.x, this.diveTo.z, 6, 1 / 60);
          if (t >= 1.3 && t - 1 / 60 < 1.3) {
            this.land(ctx, this.phase ? 5 : 7);
            this.hitCircle(this.diveTo, 7, 30, ctx, 12, 0.6);
            ctx.hazards.shockwave(this.diveTo, 16, 18, 16, FIRE, this);
            ctx.effects.sparkBurst(this.diveTo, UP, FIRE, 36, 10);
            ctx.player.camera.addShake(1);
          }
        },
      }),
      air({
        id: 'meteorRain', phases: [1, 2], weight: 2.5, cooldown: 9, duration: 3,
        start: ctx => {
          const p = ctx.player.controller.position;
          for (let i = 0; i < 7; i++) {
            const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 3 + Math.random() * 10;
            const c = new THREE.Vector3(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r);
            c.y = ctx.colliders.heightAt(c.x, c.z);
            ctx.telegraphs.schedule(c, 3.2, 0.9 + i * 0.18, FIRE, (pt, radius) => {
              this.hitCircle(pt, radius, 22, ctx, 8, 0.4, 'hazard');
              ctx.hazards.zone(pt, radius * 0.8, 2, 6, FIRE);
              ctx.effects.sparkBurst(pt, UP, FIRE, 16, 8);
            });
          }
        },
        tick: () => {},
      }),
      ground({
        id: 'bite', range: [0, 9], weight: 3, cooldown: 1.6, duration: 1.3, parryWindow: [0.55, 0.65],
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.4) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2.5, dt);
          if (t >= 0.55 && t - 1 / 60 < 0.55) this.hitCone(9, 0.8, 26, ctx, 10, 0.5);
        },
      }),
      ground({
        id: 'tailSweep', range: [0, 12], weight: 2, cooldown: 3, duration: 1.7,
        start: ctx => ctx.telegraphs.circle(this.position.clone().setY(ctx.colliders.heightAt(this.position.x, this.position.z)), 11, 0.8, FIRE),
        tick: (t, _dt, ctx) => {
          this.stop();
          if (t >= 0.8 && t - 1 / 60 < 0.8) {
            // A low sweep: jump over it.
            const p = ctx.player.controller.position;
            if (ctx.player.controller.grounded || p.y < ctx.colliders.heightAt(p.x, p.z) + 0.55) this.hitCircle(this.position, 11, 22, ctx, 12, 0.5);
            ctx.effects.ring(this.position.clone().addScaledVector(UP, 0.4), FIRE, 11, 0.4);
          }
          this.facing += (t > 0.6 && t < 1.2 ? 1 : 0) * (Math.PI * 2) / 0.6 / 60;
        },
      }),
      ground({
        id: 'wingGust', range: [0, 16], weight: 1, cooldown: 6, duration: 1.4,
        tick: (t, _dt, ctx) => {
          this.stop();
          if (t >= 0.9 && t - 1 / 60 < 0.9) {
            this.hitCircle(this.position, 16, 0, ctx, 18, 0.2, 'hazard');
            ctx.effects.ring(this.position.clone().addScaledVector(UP, 1), 0xffc890, 16, 0.5);
          }
        },
      }),
      ground({
        id: 'fireNova', phases: [2], weight: 2.5, cooldown: 5.5, duration: 1.9,
        tick: (t, _dt, ctx) => {
          this.stop();
          if (t >= 1 && t - 1 / 60 < 1) ctx.hazards.shockwave(this.position.clone().setY(ctx.colliders.heightAt(this.position.x, this.position.z)), 13, 30, 24, FIRE, this);
        },
      }),
      ground({
        id: 'breathCone', phases: [1, 2], range: [0, 20], weight: 2, cooldown: 5, duration: 2.3,
        start: ctx => {
          this.laneA.copy(this.position);
          this.ahead(20, ctx, this.laneB);
          this.laneA.y = ctx.colliders.heightAt(this.laneA.x, this.laneA.z);
          ctx.telegraphs.scheduleLane(this.laneA, this.laneB, 8, 1, FIRE, (a0, b0, w) => {
            if (this.inLane(a0, b0, w, ctx)) this.hitCircle(ctx.player.controller.position, 0.1, 24, ctx, 8, 0.4, 'hazard');
            for (let k = 1; k <= 3; k++) ctx.hazards.zone(a0.clone().lerp(b0, k / 3), 4, 2.5, 8, FIRE);
          });
        },
        tick: () => this.stop(),
      }),
    );
  }

  protected physics(dt: number, ctx: AIContext): void {
    if (!this.airborne) { super.physics(dt, ctx); return; }
    this.grounded = false;
  }

  protected think(dt: number, ctx: AIContext): void {
    super.think(dt, ctx);
    if (this.presenting || this.current || this.transition > 0) return;
    // Torn wings at the last phase; otherwise it takes off again after a while.
    if (this.phase >= 2 && this.airborne) { this.land(ctx, Infinity); this.stagger(1.5); }
    if (!this.airborne && this.phase < 2) {
      this.groundTimer -= dt;
      if (this.groundTimer <= 0) this.takeOff();
    }
  }

  protected idle(dt: number, ctx: AIContext): void {
    this.circle(dt * 0.4, ctx);
  }

  protected roaring(_dt: number, ctx: AIContext): void {
    if (this.transition > 1.75) ctx.effects.ring(this.position.clone(), FIRE, 20, 0.8, true);
  }

  protected locomotion(dt: number, ctx: AIContext): void {
    if (this.airborne) { this.circle(dt, ctx); return; }
    const p = ctx.player.controller.position;
    this.turnToward(p.x, p.z, 1.8, dt);
    if (this.distanceToPlayer(ctx) > 9) this.move(p.x - this.position.x, p.z - this.position.z, 5);
    else this.stop();
  }

  /** Circles the arena, banking, always glancing at the player. */
  private circle(dt: number, ctx: AIContext): void {
    this.orbit += dt * (this.phase ? 0.55 : 0.42);
    const r = 22;
    const ground = ctx.colliders.heightAt(this.arena.x, this.arena.z);
    const target = new THREE.Vector3(this.arena.x + Math.sin(this.orbit) * r, ground + this.altitude, this.arena.z + Math.cos(this.orbit) * r);
    this.position.lerp(target, Math.min(1, dt * 2));
    this.facing = Math.atan2(-Math.cos(this.orbit), Math.sin(this.orbit));
    this.stop();
  }

  resetFight(): void {
    super.resetFight();
    this.airborne = true;
    this.collider.active = false;
    this.groundTimer = 0;
    this.orbit = 0;
  }

  protected animate(dt: number): void {
    this.mixer?.update(dt);
    this.visual.rotation.z = this.airborne ? Math.sin(this.stateTime * 1.2) * 0.12 : 0;
    this.visual.rotation.x = this.state === 'staggered' ? 0.25 : 0;
  }
}
