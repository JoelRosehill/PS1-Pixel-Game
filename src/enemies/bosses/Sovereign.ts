import * as THREE from 'three';
import type { CreatureLibrary } from '../../assets/Creatures';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { AIContext } from '../AIContext';
import type { BossDef } from './Boss';
import { CreatureBoss } from './CreatureBoss';

const MOON = 0xc8e8ff;
const BLOOD = 0xff3a5a;
const UP = new THREE.Vector3(0, 1, 0);

export const SOVEREIGN: BossDef = {
  id: 'sovereign', kind: 'sovereign', name: 'Maelor', epithet: 'the Pale Sovereign', chapter: 8,
  health: 3600, phases: [0.66, 0.33], poise: 520, color: MOON,
};

/**
 * Maelor, the Pale Sovereign (Chapter VIII): the last Moon-king, who chained the moon to
 * the Dawnspire so that no dawn would take anything from him again. Four hundred years
 * of night have worn him to a pale thing nine metres tall with blades for arms. Three
 * phases: the duel (vast blade combos, a leaping cleave, moon pillars), the court
 * (Shadow Knights rise, chains lash across the summit, moonfall), and the eclipse (the
 * moon's light goes out — a ring of blades and a final desperate fury).
 */
export class Sovereign extends CreatureBoss {
  private crown: THREE.Mesh;

  constructor(creatures: CreatureLibrary | null, models: ModelLibrary | null) {
    super(SOVEREIGN, { creature: 'pale', height: 9.5, radius: 2.2, bodyHeight: 9.2, color: MOON, walk: 3.2, run: 9, keep: 7,
      tint: 0xe8f0ff, emissive: 0x9ad8ff, emissiveIntensity: 0.35 }, creatures, models);
    this.arenaRadius = 38;
    // A crown of moon-silver spikes (the pale model is bald).
    const crown = new THREE.Group();
    const spike = new THREE.ConeGeometry(0.16, 0.9, 4);
    const mat = this.light(MOON, 2.4);
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(spike, mat);
      const a = (i / 9) * Math.PI * 2;
      s.position.set(Math.sin(a) * 0.55, 0.35, Math.cos(a) * 0.55);
      s.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      crown.add(s);
    }
    this.crown = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 4, 18), mat);
    this.crown.rotation.x = Math.PI / 2;
    crown.add(this.crown);
    if (this.model) {
      crown.scale.setScalar(1 / this.model.scale * 1.6);
      crown.position.y = 0.1 / this.model.scale;
      this.model.attach('head', crown);
    }
    this.add(
      {
        id: 'sever', range: [0, 11], weight: 3, cooldown: 1, duration: 1.5, parryWindow: [0.58, 0.7],
        start: () => this.act('attack_slash', 0.62),
        tick: (t, dt, ctx) => {
          if (t < 0.5) { this.turnToward(ctx.player.controller.position.x, ctx.player.controller.position.z, 3, dt); this.forward(this.tmp); this.move(this.tmp.x, this.tmp.z, 3); } else this.stop();
          if (this.at(t, 0.62, dt)) this.hitCone(11, 1.35, 34, ctx, 11, 0.5);
        },
      },
      {
        id: 'returnblade', range: [0, 11], weight: 8, cooldown: 1.5, duration: 1.4,
        when: () => this.history.at(-1) === 'sever',
        start: () => this.act('attack_backslash', 0.4),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.4, dt)) this.hitCone(11, 1.4, 32, ctx, 11, 0.5); },
      },
      {
        id: 'descent', range: [8, 40], weight: 2.5, cooldown: 3.5, duration: 2.3,
        start: ctx => {
          const p = ctx.player.controller.position;
          this.slam(ctx, new THREE.Vector3(p.x, ctx.colliders.heightAt(p.x, p.z), p.z), 5.5, 1.1, 42, 24);
          this.act('attack_leap', 1.1);
        },
        tick: (t, dt, ctx) => {
          const p = ctx.player.controller.position;
          if (t > 0.45 && t < 1.1) { this.move(p.x - this.position.x, p.z - this.position.z, 24); this.accel = 24; } else this.stop();
          if (this.at(t, 1.1, dt)) this.landSlam(ctx);
        },
        end: () => { this.accel = 14; },
      },
      {
        id: 'pillars', range: [0, 60], weight: 2, cooldown: 4, duration: 2.2,
        start: () => this.act('cast_sky', 0.8),
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.8, dt)) this.rain(ctx, 5 + this.phase * 2, 3, 1.1, 7, 32, MOON); },
      },
      {
        id: 'sweep', range: [0, 12], weight: 2, cooldown: 3, duration: 1.8,
        start: ctx => { this.act('attack_sweep', 0.72); ctx.telegraphs.circle(this.position.clone(), 11, 0.72, MOON); },
        tick: (t, dt, ctx) => { this.stop(); if (this.at(t, 0.72, dt)) { this.hitCircle(this.position, 11, 30, ctx, 14, 0.55); ctx.player.camera.addShake(0.5); } },
      },
      {
        id: 'court', phases: [1, 2], weight: 3, cooldown: 30, duration: 2.2,
        start: () => this.act('roar', 0.8),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.8, dt)) for (const s of [-1, 1]) {
            const a = this.facing + s * 1.4;
            ctx.spawn('shadowknight', this.position.x - Math.sin(a) * 10, this.position.z - Math.cos(a) * 10);
          }
        },
      },
      {
        id: 'chains', phases: [1, 2], range: [4, 50], weight: 3, cooldown: 5, duration: 2.4,
        start: ctx => {
          this.act('cast', 0.7);
          const p = ctx.player.controller.position;
          const base = Math.atan2(p.x - this.position.x, p.z - this.position.z);
          const n = this.phase >= 2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.3;
            const from = this.position.clone();
            const to = from.clone().add(new THREE.Vector3(Math.sin(a) * 34, 0, Math.cos(a) * 34));
            to.y = ctx.colliders.heightAt(to.x, to.z);
            ctx.telegraphs.scheduleLane(from, to, 2.6, 1.1, MOON, (f, e, w) => {
              if (this.inLane(f, e, w, ctx)) this.hitCircle(ctx.player.controller.position, 0.1, 30, ctx, 8, 0.5, 'hazard');
              for (let k = 1; k <= 8; k++) {
                const pt = f.clone().lerp(e, k / 8);
                pt.y = ctx.colliders.heightAt(pt.x, pt.z);
                ctx.telegraphs.pillar(pt, 0.7, 3, MOON, 0.5);
              }
            });
          }
        },
        tick: () => this.stop(),
      },
      {
        id: 'bladering', phases: [2], range: [0, 60], weight: 3, cooldown: 5, duration: 2.2,
        start: () => this.act('roar', 0.9),
        tick: (t, dt, ctx) => {
          this.stop();
          if (this.at(t, 0.9, dt) || this.at(t, 1.4, dt)) {
            const from = this.position.clone().addScaledVector(UP, 3);
            for (let i = 0; i < 16; i++) {
              const a = (i / 16) * Math.PI * 2 + (t > 1.2 ? 0.2 : 0);
              ctx.projectiles.fire(from, new THREE.Vector3(Math.sin(a), -0.08, Math.cos(a)), 18, 24, this, 0, 'moon', 1.3);
            }
          }
        },
      },
      {
        id: 'fury', phases: [2], range: [0, 12], weight: 2.5, cooldown: 6, duration: 3.2,
        start: () => this.act('attack_combo', 0.45),
        tick: (t, dt, ctx) => {
          const p = ctx.player.controller.position;
          if (t < 2.2) { this.turnToward(p.x, p.z, 2.5, dt); this.move(p.x - this.position.x, p.z - this.position.z, 4); } else this.stop();
          for (const at of [0.45, 0.86, 1.38]) if (this.at(t, at, dt)) this.hitCone(10.5, 1.3, 30, ctx, 10, 0.5);
          if (this.at(t, 2.3, dt)) { this.act('attack_overhead', 0.5); this.slam(ctx, this.point(5, ctx), 5, 0.5, 44, 26); }
          if (this.at(t, 2.8, dt)) this.landSlam(ctx);
        },
      },
    );
  }

  protected onPhase(phase: number, ctx: AIContext): void {
    super.onPhase(phase, ctx);
    if (phase >= 2) {
      // The eclipse: the crown burns blood-red.
      (this.crown.material as THREE.MeshBasicMaterial).color.setHex(BLOOD).multiplyScalar(2.6);
      ctx.effects.ring(this.position.clone().addScaledVector(UP, 1), BLOOD, 30, 1);
    }
  }

  resetFight(): void {
    super.resetFight();
    (this.crown.material as THREE.MeshBasicMaterial).color.setHex(MOON).multiplyScalar(2.4);
  }
}
