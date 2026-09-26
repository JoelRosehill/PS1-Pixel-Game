import * as THREE from 'three';
import type { CreatureLibrary } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { AIContext } from '../AIContext';
import type { BossDef } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const HONEY = 0xffc040;
const VENOM = 0xa0ff60;

export const HIVE_QUEEN: BossDef = {
  id: 'hivequeen', kind: 'swarm', name: 'The Hive Queen', epithet: 'Mother of the Humming Dark', chapter: 7,
  health: 2000, phases: [0.5], poise: 320, color: HONEY,
};

/**
 * The Hive Queen (Chapter VII): a bee eight metres long who hangs in the air of her wax
 * cathedral and never touches the floor. Barbs in volleys, stinger dives along lanes,
 * clouds of venom pollen that linger, a droning shockwave, and her daughters. Ranged
 * attacks are the answer; a parried barb staggers her into the ground for a while.
 */
export class HiveQueen extends CreatureBoss {
  private grounded2 = 0;
  private diveTo = new THREE.Vector3();
  private diveFrom = new THREE.Vector3();

  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(HIVE_QUEEN, { creature: 'bee', height: 3.2, radius: 2.6, bodyHeight: 3.2, color: HONEY, walk: 5, run: 12, keep: 12,
      tint: 0xffe8a0, emissive: 0xff9a20, emissiveIntensity: 0.25 }, creatures, models);
    this.arenaRadius = 36;
    this.airborne = true;
    this.altitude = 7;
    this.add(
      {
        id: 'barbs', range: [0, 80], weight: 3, cooldown: 1.8, duration: 1.8,
        start: () => this.act('roar', 0.5),
        tick: (t, dt, ctx) => {
          this.face(ctx, dt);
          for (const at of [0.5, 0.9, 1.3]) if (this.at(t, at, dt)) this.volleyOrbs(ctx, this.phase ? 5 : 3, 0.18, 24, 16, 0.7, 'moon', 1, 'stinger');
        },
      },
      {
        id: 'dive', range: [0, 80], weight: 2.5, cooldown: 3.5, duration: 2.6,
        start: ctx => {
          const p = ctx.player.controller.position;
          this.diveFrom.copy(this.position).setY(ctx.colliders.heightAt(this.position.x, this.position.z));
          const dir = new THREE.Vector3(p.x - this.position.x, 0, p.z - this.position.z).normalize();
          this.diveTo.copy(p).addScaledVector(dir, 10);
          this.diveTo.y = ctx.colliders.heightAt(this.diveTo.x, this.diveTo.z);
          this.facing = Math.atan2(-dir.x, -dir.z);
          ctx.telegraphs.lane(this.diveFrom, this.diveTo, 5, 0.9, HONEY);
          this.act('attack_sting', 1.1);
        },
        tick: (t, _dt, ctx) => {
          if (t < 0.9) { this.stop(); return; }
          if (t < 1.8) {
            this.altitude = 1.5;
            this.move(this.diveTo.x - this.position.x, this.diveTo.z - this.position.z, 26); this.accel = 14;
            const p = ctx.player.controller.position;
            if (Math.hypot(p.x - this.position.x, p.z - this.position.z) < 3.6) this.hitCircle(p, 0.1, 30, ctx, 12, 0.55);
          } else { this.altitude = 7; this.stop(); }
        },
        end: () => { this.altitude = 7; this.accel = 14; },
      },
      {
        id: 'pollen', range: [0, 60], weight: 2, cooldown: 6, duration: 2,
        start: () => this.act('roar', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) {
            const p = ctx.player.controller.position;
            for (let i = 0; i < (this.phase ? 6 : 4); i++) {
              const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 4 + Math.random() * 6;
              const pt = new THREE.Vector3(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r);
              pt.y = ctx.colliders.heightAt(pt.x, pt.z);
              ctx.hazards.zone(pt, 3.2, 6, 7, VENOM);
            }
          }
        },
      },
      {
        id: 'drone', range: [0, 16], weight: 1.5, cooldown: 5, duration: 1.8,
        start: () => this.act('roar', 0.9),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.9, dt)) {
            const ground = this.position.clone().setY(ctx.colliders.heightAt(this.position.x, this.position.z));
            ctx.hazards.shockwave(ground, 12, 22, 18, HONEY, this);
            ctx.player.camera.addShake(0.5);
          }
        },
      },
      {
        id: 'daughters', weight: 2, cooldown: 14, duration: 1.8,
        when: ctx => ctx.combat.sphere(this.position, 40, 'player', []).length < 4,
        start: () => this.act('roar', 0.7),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.7, dt)) for (let i = 0; i < (this.phase ? 4 : 2); i++) {
            const a = this.facing + (i - 1.5) * 0.9;
            ctx.spawn('wasp', this.position.x - Math.sin(a) * 6, this.position.z - Math.cos(a) * 6);
          }
        },
      },
    );
  }

  private face(ctx: AIContext, dt: number): void {
    this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 4, dt);
  }

  /** A parried barb or a posture break grounds her: stunned and in reach of the sword. */
  protected onStagger(): void {
    super.onStagger();
    if (this.staggerTimer > 1.5) { this.airborne = false; this.grounded2 = 5; }
  }

  protected think(dt: number, ctx: AIContext): void {
    super.think(dt, ctx);
    if (this.grounded2 > 0) {
      this.grounded2 -= dt;
      if (this.grounded2 <= 0) this.airborne = true;
    }
  }

  protected locomotion(dt: number, ctx: AIContext): void {
    if (!this.airborne) { this.stop(); return; }
    this.circleArena(dt, 16, this.phase ? 0.6 : 0.45);
    this.face(ctx, dt);
  }

  resetFight(): void {
    super.resetFight();
    this.airborne = true;
    this.altitude = 7;
    this.grounded2 = 0;
  }
}
