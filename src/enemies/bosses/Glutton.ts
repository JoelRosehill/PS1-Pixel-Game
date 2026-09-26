import * as THREE from 'three';
import type { CreatureLibrary } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { BossDef } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const PINK = 0xffb0c8;
const CRYSTAL = 0x9ad8ff;

export const GLUTTON: BossDef = {
  id: 'glutton', kind: 'beast', name: 'The Glutton Below', epithet: 'Who Ate the Prism Choir', chapter: 4,
  health: 2200, phases: [0.5], poise: 420, color: PINK,
};

/**
 * The Glutton Below (Chapter IV): a hairless cat the size of a house, fattened in the
 * Crystal Deep on the singers of the Prism Choir — the crystals still glitter in its
 * gut. Fast for its size: bites, paw swipes, a pounce that crosses the cavern, a rearing
 * stomp, and a spray of swallowed crystal. Below half health its young come to feed.
 */
export class Glutton extends CreatureBoss {
  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(GLUTTON, { creature: 'bingus', height: 7, radius: 2.8, bodyHeight: 5.6, color: PINK, walk: 4, run: 11, keep: 7,
      tint: 0xffe0e8 }, creatures, models);
    this.arenaRadius = 34;
    this.add(
      {
        id: 'bite', range: [0, 11], weight: 3, cooldown: 1, duration: 1.3, parryWindow: [0.5, 0.62],
        start: () => this.act('attack_bite', 0.55),
        tick: (t, dt, ctx) => {
          if (t < 0.45) { this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 3, dt); this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, 4); } else this.stop();
          if (this.at(t, 0.55, dt)) this.hitCone(9.5, 0.7, 32, ctx, 10, 0.5);
        },
      },
      {
        id: 'swipe', range: [0, 10], weight: 2.5, cooldown: 1.4, duration: 1.4,
        start: () => this.act(Math.random() < 0.5 ? 'attack_swipe' : 'attack_swipe_r', 0.55),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.55, dt)) this.hitCone(9, 1.5, 26, ctx, 12, 0.45); },
      },
      {
        id: 'pounce', range: [10, 60], weight: 3, cooldown: 3.5, duration: 2,
        start: ctx => {
          const p = ctx.player.controller.position;
          this.slam(ctx, new THREE.Vector3(p.x, ctx.colliders.heightAt(p.x, p.z), p.z), 5, 1.05, 36, 14);
          this.act('attack_pounce', 1.05);
        },
        tick: (t, dt, ctx) => {
          const p = ctx.player.controller.position;
          if (t > 0.45 && t < 1.05) { this.move(p.x - this.position.x, p.z - this.position.z, 26); this.accel = 24; } else this.stop();
          if (this.at(t, 1.05, dt)) this.landSlam(ctx);
        },
        end: () => { this.accel = 14; },
      },
      {
        id: 'stomp', range: [0, 12], weight: 2, cooldown: 4, duration: 1.9,
        start: ctx => { this.act('attack_stomp', 0.85); this.slam(ctx, this.point(4, ctx), 6, 0.85, 30, 26); },
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.85, dt)) this.landSlam(ctx); },
      },
      {
        id: 'crystals', range: [6, 40], weight: 2, cooldown: 5, duration: 2,
        start: () => this.act('roar', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2, dt);
          if (this.at(t, 0.8, dt) || this.at(t, 1.1, dt) || this.at(t, 1.4, dt)) this.volleyOrbs(ctx, 5, 0.2, 22, 16, 0.3, 'moon', 1.1);
        },
      },
      {
        id: 'litter', phases: [1], weight: 3, cooldown: 999, duration: 2.2,
        start: () => this.act('roar', 0.7),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.7, dt)) for (const a of [-1.3, 0, 1.3]) {
            const f = this.facing + a;
            ctx.spawn('gnawer', this.position.x - Math.sin(f) * 9, this.position.z - Math.cos(f) * 9);
          }
        },
      },
      {
        id: 'frenzy', phases: [1], range: [0, 14], weight: 2, cooldown: 6, duration: 3,
        start: () => this.act('attack_bite', 0.5),
        tick: (t, dt, ctx) => {
          const p = ctx.player.controller.position;
          this.turnToward(p.x, p.z, 4, dt);
          this.move(p.x - this.position.x, p.z - this.position.z, t < 2.4 ? 7 : 0);
          for (const at of [0.5, 1.2, 1.9, 2.6]) if (this.at(t, at, dt)) {
            this.act(at === 1.2 ? 'attack_swipe' : at === 1.9 ? 'attack_swipe_r' : 'attack_bite', 0.45);
            this.hitCone(8.5, 1.1, 22, ctx, 9, 0.4);
            ctx.effects.sparkBurst(this.point(5, ctx), this.tmp.set(0, 1, 0), CRYSTAL, 8, 5);
          }
        },
      },
    );
  }
}
