import * as THREE from 'three';
import type { CreatureLibrary } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { BossDef } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const VIOLET = 0xb07cff;

export const GLOOMHORN: BossDef = {
  id: 'gloomhorn', kind: 'beast', name: 'Gloomhorn', epithet: 'the Drowned Shadow', chapter: 2,
  health: 2000, phases: [0.5], poise: 380, color: VIOLET,
};

/**
 * Gloomhorn, the Drowned Shadow (Chapter II): the shadow demon grown to nine metres in
 * the Coronation Pool, where the Moon-kings were crowned. It rakes in chains, rears to
 * slam (jump the shockwave), bounds across the arena, and below half health splits the
 * fen with spike lines and calls Umbral Stalkers out of the water.
 */
export class Gloomhorn extends CreatureBoss {
  private hitOnce = false;

  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(GLOOMHORN, { creature: 'demon', height: 9, radius: 2.6, bodyHeight: 8.4, color: VIOLET, walk: 3.4, run: 9, keep: 7,
      emissive: 0x7a3aff, emissiveIntensity: 1.4 }, creatures, models);
    this.arenaRadius = 34;
    this.add(
      {
        id: 'rake', range: [0, 10], weight: 3, cooldown: 1.2, duration: 1.3, parryWindow: [0.5, 0.62],
        start: () => this.act('attack_slash', 0.55),
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.4) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2.4, dt);
          if (this.at(t, 0.55, dt)) this.hitCone(9, 1.3, 26, ctx, 9, 0.45);
        },
      },
      {
        id: 'rake2', range: [0, 10], weight: 2, cooldown: 1.6, duration: 1.3,
        when: () => this.history.at(-1) === 'rake',
        start: () => this.act('attack_backslash', 0.4),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.4, dt)) this.hitCone(9, 1.3, 26, ctx, 9, 0.45); },
      },
      {
        id: 'slam', range: [0, 12], weight: 3, cooldown: 2.6, duration: 2.3,
        start: ctx => { this.act('attack_overhead', 1.05); this.slam(ctx, this.point(6, ctx), 5, 1.05, 36, 24); },
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 1.05, dt)) this.landSlam(ctx); },
      },
      {
        id: 'bound', range: [12, 60], weight: 2.5, cooldown: 4, duration: 2.2,
        start: ctx => {
          const p = ctx.player.controller.position;
          this.slam(ctx, new THREE.Vector3(p.x, ctx.colliders.heightAt(p.x, p.z), p.z), 5.5, 1.15, 34, 16);
          this.act('attack_leap', 1.15);
        },
        tick: (t, dt, ctx) => {
          const target = this.tmp.set(ctx.player.controller.position.x, 0, ctx.player.controller.position.z);
          if (t > 0.5 && t < 1.15) { this.move(target.x - this.position.x, target.z - this.position.z, 20); this.accel = 20; }
          else this.stop();
          if (this.at(t, 1.15, dt)) this.landSlam(ctx);
        },
        end: () => { this.accel = 14; },
      },
      {
        id: 'roar', range: [0, 14], weight: 1, cooldown: 9, duration: 2.1,
        start: () => this.act('roar', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) {
            ctx.effects.ring(this.position.clone().setY(this.position.y + 1), VIOLET, 12, 0.6);
            ctx.player.camera.addShake(0.6);
            this.hitCircle(this.position, 11, 8, ctx, 18, 0.5, 'hazard');
          }
        },
      },
      {
        id: 'maul', range: [0, 9], weight: 1.5, cooldown: 5, duration: 2.4,
        start: () => { this.act('attack_combo', 0.45); this.hitOnce = false; },
        tick: (t, dt, ctx) => {
          this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, t < 1.5 ? 2.5 : 0);
          if (t < 1) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 1.5, dt);
          for (const at of [0.45, 0.86, 1.38]) if (this.at(t, at, dt)) this.hitCone(8.5, 1.2, 22, ctx, 8, 0.4);
        },
      },
      {
        id: 'summon', phases: [1], weight: 3, cooldown: 999, duration: 2,
        start: () => this.act('cast_sky', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) for (const s of [-1, 1]) {
            const a = this.facing + s * 1.2;
            ctx.spawn('umbral', this.position.x - Math.sin(a) * 10, this.position.z - Math.cos(a) * 10);
          }
        },
      },
      {
        id: 'spikeLines', phases: [1], range: [3, 40], weight: 3.5, cooldown: 6, duration: 2.4,
        start: ctx => {
          this.act('cast', 0.7);
          const p = ctx.player.controller.position;
          const base = Math.atan2(p.x - this.position.x, p.z - this.position.z);
          for (const off of [-0.34, 0, 0.34]) {
            const a = base + off;
            const from = this.position.clone();
            const to = from.clone().add(new THREE.Vector3(Math.sin(a) * 28, 0, Math.cos(a) * 28));
            to.y = ctx.colliders.heightAt(to.x, to.z);
            ctx.telegraphs.scheduleLane(from, to, 3, 1.15, VIOLET, (f, e, w) => {
              if (this.inLane(f, e, w, ctx)) this.hitCircle(ctx.player.controller.position, 0.1, 28, ctx, 7, 0.45, 'hazard');
              for (let k = 1; k <= 7; k++) {
                const pt = f.clone().lerp(e, k / 7);
                pt.y = ctx.colliders.heightAt(pt.x, pt.z);
                ctx.telegraphs.pillar(pt, 0.9, 4 + k * 0.5, VIOLET, 0.6);
              }
            });
          }
        },
        tick: () => this.stop(),
      },
    );
    void this.hitOnce;
  }
}
