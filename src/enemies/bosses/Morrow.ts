import { type CreatureLibrary, gripWeapon } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { BossDef } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const BONE = 0xd8c8ff;

export const MORROW: BossDef = {
  id: 'morrow', kind: 'knight', name: 'Morrow', epithet: 'the Gravewarden', chapter: 1,
  health: 1500, phases: [0.55], poise: 320, color: BONE,
};

/**
 * Morrow, the Gravewarden (Chapter I). The first great foe: a stitched giant with a
 * war axe who has buried every pilgrim who tried the Highpine Gate. Honest but heavy —
 * long tells, huge reach, a combo that punishes panic rolls — and, below half health,
 * he tolls for the dead: ghost pillars rain around you and pilgrims crawl from the graves.
 */
export class Morrow extends CreatureBoss {
  private rammed = false;

  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(MORROW, { creature: 'nemesis', height: 5.6, radius: 1.4, bodyHeight: 5.4, color: BONE, walk: 2.4, run: 6, keep: 5,
      tint: 0xb8b0c8 }, creatures, models);
    this.arenaRadius = 32;
    if (this.model && models) {
      const axe = models.instantiateSync('ps1-ottoman-war-axe', { size: 4.2, grounded: false });
      if (axe) gripWeapon(this.model, axe.root);
    }
    this.add(
      {
        id: 'cleave', range: [0, 8], weight: 3, cooldown: 1.2, duration: 1.7, parryWindow: [0.72, 0.84],
        start: () => this.act('attack_slash', 0.75),
        tick: (t, dt, ctx) => {
          this.stop();
          if (t < 0.55) this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 2.2, dt);
          if (this.at(t, 0.75, dt)) this.hitCone(7.6, 1.35, 30, ctx, 10, 0.5);
        },
      },
      {
        id: 'backhand', range: [0, 8], weight: 2, cooldown: 2, duration: 1.5,
        when: () => this.history.at(-1) === 'cleave',
        start: () => this.act('attack_backslash', 0.45),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.45, dt)) this.hitCone(7.4, 1.4, 26, ctx, 10, 0.45); },
      },
      {
        id: 'graveslam', range: [0, 10], weight: 2.5, cooldown: 3, duration: 2.3,
        start: ctx => { this.act('attack_overhead', 1.1); this.slam(ctx, this.point(4.8, ctx), 4.2, 1.1, 38, 22); },
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 1.1, dt)) this.landSlam(ctx); },
      },
      {
        id: 'reaper', range: [0, 7], weight: 1.4, cooldown: 6, duration: 2.6,
        start: () => this.act('attack_combo', 0.5),
        tick: (t, dt, ctx) => {
          const p = ctx.player.controller.position;
          if (t < 1.2) this.turnToward(p.x, p.z, 1.6, dt);
          this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, t < 1.6 ? 1.8 : 0);
          if (this.at(t, 0.5, dt)) this.hitCone(7.2, 1.3, 22, ctx, 7, 0.4);
          if (this.at(t, 1.0, dt)) this.hitCone(7.2, 1.3, 22, ctx, 7, 0.4);
          if (this.at(t, 1.55, dt)) { this.hitCone(7.8, 0.7, 34, ctx, 12, 0.6); ctx.player.camera.addShake(0.5); }
        },
      },
      {
        id: 'ram', range: [11, 60], weight: 2, cooldown: 5, duration: 2.4,
        start: ctx => { this.chargeLane(ctx, 30, 5, 0.85); this.rammed = false; this.hold('run', 2.4, 1.2); },
        tick: (t, _dt, ctx) => {
          if (t < 0.85) { this.stop(); return; }
          if (t < 2.0) {
            this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, 17); this.accel = 30;
            const p = ctx.player.controller.position;
            if (!this.rammed && Math.hypot(p.x - this.position.x, p.z - this.position.z) < this.bodyRadius + 1.6) {
              this.rammed = this.hitCircle(this.position, this.bodyRadius + 1.6, 32, ctx, 16, 0.6);
            }
          } else this.stop();
        },
        end: () => { this.accel = 14; this.stop(); },
      },
      {
        id: 'axethrow', range: [8, 40], weight: 1.5, cooldown: 4.5, duration: 1.8,
        start: () => this.act('cast', 0.7),
        tick: (t, dt, ctx) => {
          this.stop();
          this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 3, dt);
          if (this.at(t, 0.7, dt)) this.volleyOrbs(ctx, 3, 0.16, 20, 18, 0.9, 'moon', 1.6, 'grip.R');
        },
      },
      {
        id: 'toll', phases: [1], range: [0, 45], weight: 2.5, cooldown: 7, duration: 2.6,
        start: () => this.act('cast_sky', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) this.rain(ctx, 7, 3, 1.1, 7, 26);
        },
      },
      {
        id: 'raise', phases: [1], weight: 3, cooldown: 999, duration: 2.2,
        start: () => this.act('roar', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) for (const s of [-1, 1]) {
            const a = this.facing + s * 1.3;
            ctx.spawn('pilgrim', this.position.x - Math.sin(a) * 8, this.position.z - Math.cos(a) * 8);
          }
        },
      },
    );
  }
}
