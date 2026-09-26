import * as THREE from 'three';
import type { GameSystem } from '../core/Game';
import type { Input } from '../core/Input';
import type { CombatWorld } from '../combat/CombatWorld';
import type { TimeControl } from '../core/TimeControl';
import type { ColliderWorld } from '../physics/Colliders';
import type { Effects } from '../render/effects/Effects';
import { PlayerCombat } from './PlayerCombat';
import { PlayerController } from './PlayerController';
import { PlayerModel } from './PlayerModel';
import { FirstPersonCamera } from './FirstPersonCamera';
import { FirstPersonRig } from './FirstPersonRig';
import { SpellCasting } from '../spells/SpellCasting';

/**
 * Owns the character: controller (fixed 60 Hz), procedural model and first-person camera
 * (both interpolated for the render frame).
 */
export class Player implements GameSystem {
  readonly controller: PlayerController;
  readonly model = new PlayerModel();
  readonly camera: FirstPersonCamera;
  readonly view = new FirstPersonRig();
  readonly combat: PlayerCombat;
  readonly spells: SpellCasting;

  private readonly spawnPoint = new THREE.Vector3();
  private spawnFacing = 0;
  private readonly renderPos = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    input: Input,
    world: ColliderWorld,
    spawn: { position: THREE.Vector3; lookAt: THREE.Vector3 },
    private readonly deps: { combat: CombatWorld; effects: Effects; time: TimeControl },
  ) {
    this.controller = new PlayerController(input, world);
    this.camera = new FirstPersonCamera(camera, input);
    this.combat = new PlayerCombat(
      input,
      this.controller,
      this.model,
      this.camera,
      deps.combat,
      deps.effects,
      deps.time,
      () => this.respawn(),
    );
    deps.combat.register(this.combat);
    this.spells = new SpellCasting(this.combat, this.controller, this.model, this.camera, deps.combat, world, deps.effects, deps.time);
    this.combat.castSpell = () => this.spells.cast();
    this.combat.onReset = () => this.spells.reset();
    const dir = spawn.lookAt.clone().sub(spawn.position).setY(0).normalize();
    this.spawnFacing = Math.atan2(-dir.x, -dir.z);
    this.spawnPoint.copy(spawn.position).setY(world.heightAt(spawn.position.x, spawn.position.z));
    this.respawn();
  }

  respawn(): void {
    this.controller.teleport(this.spawnPoint.x, this.spawnPoint.y + 0.2, this.spawnPoint.z, this.spawnFacing);
    this.camera.setYaw(this.spawnFacing, -0.1);
  }

  get active(): boolean {
    return !this.controller.frozen;
  }

  set active(v: boolean) {
    this.controller.frozen = !v;
  }

  fixedUpdate(dt: number): void {
    if (this.controller.frozen) return;
    this.controller.cameraYaw = this.camera.movementYaw;
    this.controller.facing = this.camera.movementYaw;
    // Combat runs first: it sets facing, lunge velocity and movement damping.
    this.combat.fixedUpdate(dt);
    this.spells.fixedUpdate(dt);
    this.controller.fixedUpdate(dt);
    if (this.controller.events.slammed) {
      this.deps.effects.ring(this.controller.position, 0x8be8ff, 3, 0.4);
      this.deps.effects.sparkBurst(this.controller.position, new THREE.Vector3(0, 1, 0), 0x8be8ff, 12, 5);
      this.camera.addShake(0.3);
    }
    if (this.controller.position.y < -60) this.respawn();
  }

  update(dt: number, alpha = 1): void {
    if (this.controller.frozen) return;
    this.controller.interpolate(alpha, this.renderPos);
    this.camera.update(dt, this.controller, alpha);
    this.model.root.visible = this.camera.bodyVisible;
    this.model.update(dt, {
      state: this.controller.state,
      speed: this.controller.speed,
      velocity: this.controller.velocity,
      grounded: this.controller.grounded,
      facing: this.controller.facing,
      position: this.renderPos,
    });
    this.view.update(dt, this.model, this.combat, this.controller, this.camera.motionScale);
  }
}
