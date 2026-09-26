import * as THREE from 'three';
import type { CombatWorld } from '../combat/CombatWorld';
import type { PlayerProjectiles, ShotSpec } from '../combat/PlayerProjectiles';
import type { Damageable } from '../combat/types';
import type { ColliderWorld } from '../physics/Colliders';
import type { Effects } from '../render/effects/Effects';
import type { SpellFx } from '../render/effects/SpellFx';
import type { SpellCasting } from '../spells/SpellCasting';
import type { FirstPersonCamera } from './FirstPersonCamera';
import type { PlayerCombat } from './PlayerCombat';
import type { PlayerController } from './PlayerController';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The sword's reach (Job 13): what each swing throws when it turns active. The combo
 * finisher and the charged heavy loose crescents, a dash thrust fires a lance of light,
 * a slide sweep sends a wave along the ground, a plunge lands as a shockwave with a ring
 * of stone, and each Sword Art has its own ranged technique.
 */
export function swordEmitters(deps: {
  combat: PlayerCombat;
  controller: PlayerController;
  camera: FirstPersonCamera;
  shots: PlayerProjectiles;
  fx: SpellFx;
  effects: Effects;
  world: CombatWorld;
  colliders: ColliderWorld;
  spells: SpellCasting;
}): Record<string, (charge: number) => void> {
  const { controller, camera, shots, fx, effects, world, colliders, spells } = deps;
  const chest = () => controller.position.clone().addScaledVector(UP, 1.25);
  const aim = () => camera.aimDirection(new THREE.Vector3());
  const flat = () => aim().setY(0).normalize();
  const rotateY = (v: THREE.Vector3, a: number) => v.clone().applyAxisAngle(UP, a);

  const crescent = (dir: THREE.Vector3, o: Partial<ShotSpec> = {}, from = chest()) => shots.spawn(from, dir, {
    kind: 'wave', damage: 20, stagger: 0.4, knockback: 5, speed: 38, radius: 0.9, life: 0.55, color: 0xc9b0ff,
    visual: 'crescent', scale: 1.8, grow: 1.2, pierce: 3, ...o,
  });

  /** A line of stone/fire spears erupting along the ground, damaging once per target. */
  const spearLine = (length: number, damage: number, color: number, stagger: number, width = 1.6) => {
    const dir = flat();
    const start = controller.position.clone().addScaledVector(dir, 1.5);
    const hit = new Set<Damageable>();
    for (let d = 0; d <= length; d += 1.2) {
      const p = start.clone().addScaledVector(dir, d);
      p.y = colliders.heightAt(p.x, p.z);
      const delay = d * 0.018;
      fx.spike(p, color, 1.4 + Math.random() * 1.8, 1.0, 0.6, delay);
      spells.later(delay, () => {
        for (const t of world.sphere(p, width, 'player', [])) {
          if (hit.has(t)) continue;
          hit.add(t);
          shots.strike(t, { spec: { kind: 'wave', damage, stagger, knockback: 8, color, visual: 'shard' } as ShotSpec }, p, damage);
        }
      });
    }
  };

  return {
    // Combo finisher: one crescent straight ahead.
    finisher: () => { crescent(aim(), { damage: 16, life: 0.4, scale: 1.4, color: 0xb07cff }); },

    // Charged heavy: one vertical crescent from a half charge, three in a fan at full.
    charged: (charge: number) => {
      if (charge < 0.35) return;
      const dmg = 22 + 28 * charge;
      const roll = Math.PI / 2;
      if (charge >= 0.95) {
        for (const a of [-0.2, 0, 0.2]) crescent(rotateY(aim(), a), { damage: dmg, roll, scale: 2.4, life: 0.7, speed: 42, color: 0xff8ad8, pierce: 5 });
        effects.ring(chest(), 0xff8ad8, 2.5, 0.35, true);
        camera.addShake(0.4);
      } else crescent(aim(), { damage: dmg, roll, scale: 2, life: 0.6, speed: 40, color: 0xff8ad8, pierce: 4 });
    },

    // Dash thrust: a lance of light.
    lance: () => {
      shots.spawn(chest(), aim(), { kind: 'wave', damage: 18, stagger: 0.35, knockback: 4, speed: 64, radius: 0.35, life: 0.28,
        color: 0x7fffd4, visual: 'lance', pierce: 2 });
    },

    // Slide sweep: a low wave along the ground.
    groundWave: () => {
      const from = controller.position.clone().addScaledVector(UP, 0.45);
      crescent(flat(), { damage: 18, stagger: 0.7, life: 0.4, scale: 2.2, color: 0x9aff7a, speed: 30 }, from);
    },

    // Plunge landing: a ring of stone spears around the impact.
    shockwave: () => {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const p = controller.position.clone().add(new THREE.Vector3(Math.sin(a) * 3.4, 0, Math.cos(a) * 3.4));
        p.y = colliders.heightAt(p.x, p.z);
        fx.spike(p, 0xffb45a, 1.3, 0.8, 0.45, 0.02);
      }
    },

    'art-crescents': () => {
      for (const a of [-0.26, 0, 0.26]) crescent(rotateY(aim(), a), { damage: 30, scale: 2.6, grow: 1.6, life: 0.8, speed: 40, color: 0xc9b0ff, pierce: 6 });
      camera.addShake(0.35);
    },

    'art-skyfall': () => {
      spearLine(16, 34, 0xffd070, 1);
      fx.flash(controller.position.clone().addScaledVector(UP, 0.4), 0xffd070, 5, 0.35);
    },

    'art-tempest': () => {
      const base = aim().setY(0).normalize();
      for (let i = 0; i < 8; i++) crescent(rotateY(base, (i / 8) * Math.PI * 2), { damage: 24, scale: 2.2, life: 0.55, color: 0x9ad8ff, pierce: 4 });
      effects.ring(controller.position, 0x9ad8ff, 5, 0.4);
    },

    'art-phantom': () => {
      const yaw = camera.yaw;
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1;
        const from = chest().add(new THREE.Vector3(Math.cos(yaw) * side * (0.6 + i * 0.12), 0.9 + (i % 3) * 0.3, -Math.sin(yaw) * side * (0.6 + i * 0.12)));
        const target = spells.aimTarget(45, 0.35) ?? null;
        const dir = target ? target.position.clone().addScaledVector(UP, 1).sub(from) : aim();
        shots.spawn(from, dir, { kind: 'wave', damage: 18, stagger: 0.3, knockback: 3, speed: 46, radius: 0.35, life: 1.4, color: 0xa0c8ff,
          visual: 'shard', homing: 5, target, delay: 0.12 + i * 0.1 });
      }
    },

    'art-rend': () => {
      // The thrust lunges 10 m (lunge 36 m/s, 0.28 s); mark everyone passed, then burst them.
      const passed = new Set<Damageable>();
      const start = controller.position.clone();
      controller.burst(flat(), 36, 0.28);
      const track = () => { for (const t of world.sphere(controller.position, 2.4, 'player', [])) passed.add(t); };
      // Scheduled on the simulation clock, so pauses and hit-stop hold them too.
      for (let i = 0; i <= 12; i++) spells.later(i * 0.03, track);
      spells.later(0.52, () => {
        fx.beam(start.clone().addScaledVector(UP, 1), controller.position.clone().addScaledVector(UP, 1), 0xff3a5a, 0.2, 0.4);
        for (const t of passed) {
          const p = t.position.clone().addScaledVector(UP, t.bodyHeight * 0.6);
          fx.flash(p, 0xff3a5a, 2.2, 0.35);
          shots.strike(t, { spec: { kind: 'wave', damage: 48, stagger: 1, knockback: 6, color: 0xff3a5a, visual: 'orb' } as ShotSpec }, start, 48);
        }
      });
    },

    'art-sunder': () => {
      spearLine(20, 42, 0xffa45e, 1.2, 1.8);
      camera.addShake(0.5);
    },
  };
}
