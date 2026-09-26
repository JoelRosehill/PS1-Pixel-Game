import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Contact, ColliderWorld } from '../physics/Colliders';

/**
 * High-velocity kinematic character controller (Pillar 2).
 *
 * Momentum is the point: acceleration is Quake-style, so strafing keeps speed gained
 * from slides and dashes instead of clamping it. Slides accelerate downhill, wall-jumps
 * convert vertical falls into horizontal speed, and dashes cost charges that refill
 * over time. Gravity is heavy so jumps read as snappy rather than floaty.
 */

export interface PlayerTuning {
  [key: string]: number;
}

export const PLAYER_TUNING = {
  radius: 0.36,
  standHeight: 1.8,
  slideHeight: 0.95,
  eyeHeight: 1.55,

  runSpeed: 9,
  groundAccel: 75,
  airAccel: 34,
  groundFriction: 11,
  maxSpeed: 42,
  airSteer: 3.2,
  landingGrace: 0.12,

  gravity: 30,
  fallMultiplier: 1.3,
  lowJumpMultiplier: 1.85,
  jumpSpeed: 11.4,
  coyoteTime: 0.12,
  jumpBuffer: 0.13,
  stepHeight: 0.45,
  /** cos of the steepest walkable slope (~56°). */
  slopeLimit: 0.55,

  slideEnterSpeed: 3.5,
  slideBoost: 11.5,
  slideFriction: 0.6,
  slideSteer: 9,
  slideSlopeAccel: 1.75,
  slideMinSpeed: 3.2,
  slideJumpBoost: 5,
  dashJumpBoost: 4,

  dashSpeed: 25,
  dashTime: 0.18,
  /** Two charges that refill one at a time: dashes are an answer, not a way to travel. */
  dashCharges: 2,
  dashRecharge: 1.45,
  dashCooldown: 0.32,
  /** Invulnerable for the first part of a dash only (perfect-dodge window). */
  dashIFrames: 0.13,
  /** Dashes allowed per airtime (refreshed on landing and wall kicks). */
  airDashes: 1,
  /** Standing still closer than this counts as still for channelling Momentum. */
  channelMaxSpeed: 2.5,
  /** Distance between footsteps at run speed. */
  strideLength: 2.1,

  wallSlideSpeed: 4,
  wallStick: 0.25,
  wallJumpOut: 8.5,
  wallJumpUp: 10.6,
  wallJumpLock: 0.15,
  wallRunSpeed: 14,
  wallRunDuration: 2.2,
  wallRunGravity: 0.14,
  slamSpeed: 38,
  reboundSpeed: 18,
  reboundWindow: 0.18,

  waterLevel: 0,
  swimSpeed: 4.2,
  swimBuoyancy: 14,
};

export type PlayerState = 'idle' | 'run' | 'air' | 'slide' | 'dash' | 'wall' | 'wallrun' | 'slam' | 'swim';

const UP = new THREE.Vector3(0, 1, 0);

export class PlayerController {
  readonly position = new THREE.Vector3();
  /** Position at the start of the current fixed step (for render interpolation). */
  readonly prevPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** Direction the body faces (radians, 0 = -Z). */
  facing = 0;
  state: PlayerState = 'idle';
  grounded = false;
  readonly groundNormal = new THREE.Vector3(0, 1, 0);
  sliding = false;
  swimming = false;
  dashCharges: number;
  invulnerable = false;
  wallRunning = false;
  wallSide = 0;
  wallRunRemaining = PLAYER_TUNING.wallRunDuration;
  slamming = false;
  reboundRemaining = 0;
  lastTechnique = '';
  techniqueTime = 0;
  /** Set for one fixed step when a movement action fires (hooks for VFX/audio). */
  events = { jumped: false, walljumped: false, dashed: false, slid: false, landed: false, slammed: false, rebounded: false, step: false };
  /** Holding Shift while standing still: channelling Momentum (Job 12). */
  channelling = false;
  /** Downward speed at the last landing (m/s), for the camera dip and sounds. */
  landingSpeed = 0;
  /** Running counts of landings, dashes and footsteps: render-rate consumers compare
   * these instead of reading per-step event flags they could miss or see twice. */
  readonly counts = { land: 0, dash: 0, step: 0 };
  /** Camera-relative input this step (x = strafe right, y = forward), for view tilt. */
  readonly moveInput = new THREE.Vector2();

  private height: number = PLAYER_TUNING.standHeight;
  private coyote = 0;
  private buffer = 0;
  private dashTimer = 0;
  private dashCooldown = 0;
  private readonly dashDir = new THREE.Vector3();
  private rechargeTimer = 0;
  private wallTimer = 0;
  private wallLock = 0;
  private readonly wallNormal = new THREE.Vector3();
  private onWall = false;
  private jumpHeld = false;
  private slideLock = 0;
  private dashVelocity = 0;
  private landingGrace = 0;
  private wallKickRefunded = false;
  private airTime = 0;
  private airDashesLeft = 1;
  private strideDistance = 0;
  private readonly runNormal = new THREE.Vector3();

  private readonly contacts: Contact[] = [];
  private readonly savedContacts: Contact[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly sphere = new THREE.Vector3();

  /** Scales input acceleration — combat slows movement during swings. */
  moveScale = 1;
  /** When set, combat owns the facing angle (attacks snap toward targets). */
  attackLock = false;
  /** Camera yaw, injected each step so movement is camera-relative. */
  cameraYaw = 0;
  /** Disables input handling (used by the debug fly camera). */
  frozen = false;

  constructor(
    private readonly input: Input,
    private readonly world: ColliderWorld,
    private readonly tuning = PLAYER_TUNING,
  ) {
    this.dashCharges = tuning.dashCharges;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get capsuleHeight(): number {
    return this.height;
  }

  teleport(x: number, y: number, z: number, facing = 0): void {
    this.position.set(x, y, z);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.grounded = false;
    this.sliding = false; this.swimming = false; this.slamming = false; this.wallRunning = false;
    this.height = this.tuning.standHeight; this.dashTimer = 0; this.invulnerable = false;
    this.wallTimer = 0; this.wallLock = 0; this.onWall = false; this.buffer = 0; this.coyote = 0;
    this.reboundRemaining = 0; this.landingGrace = 0; this.airTime = 0;
    this.wallRunRemaining = this.tuning.wallRunDuration; this.wallKickRefunded = false;
    this.runNormal.set(0, 0, 0); this.techniqueTime = 0; this.lastTechnique = '';
  }

  /** Knockback and other external forces. */
  addImpulse(x: number, y: number, z: number): void {
    this.velocity.x += x;
    this.velocity.y += y;
    this.velocity.z += z;
    if (y > 0) this.grounded = false;
  }

  /** Blends the last two fixed steps into `out` for rendering. */
  interpolate(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prevPosition, this.position, THREE.MathUtils.clamp(alpha, 0, 1));
  }

  fixedUpdate(dt: number): void {
    this.prevPosition.copy(this.position);
    for (const k of Object.keys(this.events) as (keyof typeof this.events)[]) this.events[k] = false;
    const t = this.tuning;

    this.readWish();
    this.timers(dt);
    this.updateSwimming();
    if (!this.grounded && !this.swimming && this.airTime > 0.12 && !this.frozen &&
      (this.input.takePressed('ControlLeft') || this.input.takePressed('ControlRight') || this.input.takePressed('KeyC'))) {
      this.slamming = true; this.wallRunning = false; this.dashTimer = 0; this.invulnerable = false;
      this.velocity.y = -t.slamSpeed; this.technique('GRAVITY SLAM');
    }

    if (this.swimming) this.swim(dt);
    else {
      this.updateSlide(dt);
      if (this.dashTimer > 0) this.dash(dt);
      else if (this.grounded) this.groundMove(dt);
      else this.airMove(dt);
      this.applyGravity(dt);
      this.tryJump();
    }

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontal > t.maxSpeed) {
      const k = t.maxSpeed / horizontal;
      this.velocity.x *= k;
      this.velocity.z *= k;
    }

    const fallSpeed = -this.velocity.y;
    this.integrate(dt);
    if (this.events.landed) { this.landingSpeed = Math.max(0, fallSpeed); this.counts.land++; }
    if (this.events.dashed) this.counts.dash++;
    if (this.grounded && !this.sliding && this.dashTimer <= 0 && this.speed > 1.5) {
      this.strideDistance += this.speed * dt;
      if (this.strideDistance >= t.strideLength) { this.strideDistance -= t.strideLength; this.events.step = true; this.counts.step++; }
    } else if (!this.grounded) this.strideDistance = t.strideLength * 0.7;
    this.updateFacing(dt);
    this.updateState();
  }

  // --- input ---------------------------------------------------------------

  private readWish(): void {
    this.wish.set(0, 0, 0);
    if (this.frozen) return;
    const inp = this.input;
    const f = inp.axis('KeyS', 'KeyW');
    const r = inp.axis('KeyA', 'KeyD');
    if (f === 0 && r === 0) return;
    const sin = Math.sin(this.cameraYaw);
    const cos = Math.cos(this.cameraYaw);
    // Camera-relative: forward is -Z rotated by yaw.
    this.wish.set(-sin * f + cos * r, 0, -cos * f - sin * r).normalize();
  }

  private timers(dt: number): void {
    const t = this.tuning;
    const inp = this.input;
    const jumpDown = !this.frozen && inp.isDown('Space');
    if (!this.frozen && inp.pressed('Space')) this.buffer = t.jumpBuffer;
    this.jumpHeld = jumpDown;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? t.coyoteTime : Math.max(0, this.coyote - dt);
    this.wallTimer = Math.max(0, this.wallTimer - dt);
    this.wallLock = Math.max(0, this.wallLock - dt);
    this.slideLock = Math.max(0, this.slideLock - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.landingGrace = Math.max(0, this.landingGrace - dt);
    this.reboundRemaining = Math.max(0, this.reboundRemaining - dt);
    this.techniqueTime = Math.max(0, this.techniqueTime - dt);
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.grounded) this.airDashesLeft = t.airDashes;
    this.moveInput.set(this.frozen ? 0 : inp.axis('KeyA', 'KeyD'), this.frozen ? 0 : inp.axis('KeyS', 'KeyW'));
    this.invulnerable = this.dashTimer > t.dashTime - t.dashIFrames;

    if (this.dashCharges < t.dashCharges) {
      this.rechargeTimer += dt;
      if (this.rechargeTimer >= t.dashRecharge) {
        this.rechargeTimer = 0;
        this.dashCharges++;
      }
    } else this.rechargeTimer = 0;

    // Shift standing still channels Momentum; Shift while moving (or in the air) dashes.
    const shiftDown = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const still = this.wish.lengthSq() === 0;
    this.channelling = !this.frozen && shiftDown && still && this.grounded && !this.swimming && !this.sliding &&
      this.dashTimer <= 0 && this.speed < t.channelMaxSpeed;
    const shiftPressed = inp.pressed('ShiftLeft') || inp.pressed('ShiftRight');
    const wantsDash = (shiftPressed && (!still || !this.grounded)) || inp.mousePressed(1);
    if (!this.frozen && !this.swimming && this.dashTimer <= 0 && this.dashCooldown <= 0 && this.dashCharges > 0 && wantsDash &&
      (this.grounded || this.airDashesLeft > 0)) {
      if (!this.grounded) this.airDashesLeft--;
      this.startDash();
    }
  }

  // --- movement modes ------------------------------------------------------

  private groundMove(dt: number): void {
    const t = this.tuning;
    if (this.sliding) {
      // Low friction, gravity pulls along the slope: downhill is the ground normal's
      // horizontal component.
      this.friction(dt, t.slideFriction);
      this.velocity.x += this.groundNormal.x * t.gravity * t.slideSlopeAccel * dt;
      this.velocity.z += this.groundNormal.z * t.gravity * t.slideSlopeAccel * dt;
      if (this.wish.lengthSq() > 0) this.accelerate(this.wish, t.runSpeed, t.slideSteer, dt);
      return;
    }
    if (this.wish.lengthSq() === 0) this.friction(dt, t.groundFriction);
    else {
      // A short landing window lets buffered hops carry earned speed onward.
      if (this.landingGrace <= 0 && this.buffer <= 0) this.friction(dt, t.groundFriction * 0.35);
      this.accelerate(this.wish, t.runSpeed * this.moveScale, t.groundAccel, dt);
    }
  }

  private airMove(dt: number): void {
    const t = this.tuning;
    this.wallRunning = false;
    if (this.wallLock <= 0 && !this.slamming) {
      this.probeWall();
      this.updateWallSlide(dt);
      const along = this.wish.clone().addScaledVector(this.wallNormal, -this.wish.dot(this.wallNormal)).setY(0);
      if (this.onWall && this.input.isDown('KeyW') && this.speed > 7 && along.lengthSq() > 0.3 && Math.abs(this.wish.dot(this.wallNormal)) < 0.8) {
        if (this.runNormal.dot(this.wallNormal) < 0.5) {
          this.wallRunRemaining = t.wallRunDuration; this.runNormal.copy(this.wallNormal);
        }
        if (this.wallRunRemaining > 0) {
          this.wallRunning = true; this.wallRunRemaining = Math.max(0, this.wallRunRemaining - dt);
          this.wallTimer = t.wallStick;
          this.wallSide = Math.sign(this.wallNormal.x * Math.cos(this.cameraYaw) - this.wallNormal.z * Math.sin(this.cameraYaw));
          along.normalize(); this.accelerate(along, Math.max(t.wallRunSpeed, this.speed), 10, dt);
          this.velocity.addScaledVector(this.wallNormal, -3 * dt);
          this.velocity.y = Math.max(this.velocity.y, -1.5);
        }
      }
    }
    if (!this.wallRunning && this.wish.lengthSq() > 0 && this.speed > t.runSpeed) {
      const speed = this.speed;
      this.tmp.set(this.velocity.x / speed, 0, this.velocity.z / speed);
      const alignment = Math.max(0, this.tmp.dot(this.wish));
      this.tmp.lerp(this.wish, Math.min(1, t.airSteer * alignment * dt)).normalize();
      this.velocity.x = this.tmp.x * speed; this.velocity.z = this.tmp.z * speed;
    }
    if (this.wish.lengthSq() > 0) this.accelerate(this.wish, t.runSpeed * this.moveScale, t.airAccel, dt);
  }

  private dash(dt: number): void {
    this.velocity.x = this.dashDir.x * this.dashVelocity;
    this.velocity.z = this.dashDir.z * this.dashVelocity;
    this.velocity.y = Math.max(this.velocity.y, -1) * 0.2;
    void dt;
  }

  private swim(dt: number): void {
    const t = this.tuning;
    const surface = t.waterLevel - 0.55;
    const submersion = THREE.MathUtils.clamp(surface - this.position.y, 0, 2);
    this.velocity.y += (t.swimBuoyancy * submersion - t.gravity * 0.55) * dt;
    this.velocity.y *= 1 - Math.min(1, 3 * dt);
    if (this.wish.lengthSq() > 0) this.accelerate(this.wish, t.swimSpeed, 18, dt);
    this.friction(dt, 4);
    if (this.jumpHeld) this.velocity.y += 9 * dt;
  }

  private applyGravity(dt: number): void {
    const t = this.tuning;
    if (this.grounded && this.velocity.y <= 0) {
      this.velocity.y = -2; // keep the capsule pressed into slopes
      return;
    }
    if (this.slamming) { this.velocity.y = -t.slamSpeed; return; }
    let g = t.gravity * (this.wallRunning ? t.wallRunGravity : 1);
    if (this.velocity.y < 0) g *= t.fallMultiplier;
    else if (!this.jumpHeld) g *= t.lowJumpMultiplier;
    this.velocity.y -= g * dt;
    if (this.onWall && this.velocity.y < -t.wallSlideSpeed) this.velocity.y = -t.wallSlideSpeed;
  }

  // --- actions -------------------------------------------------------------

  private tryJump(): void {
    const t = this.tuning;
    if (this.buffer <= 0) return;
    if (this.grounded || this.coyote > 0) {
      if (this.sliding && !this.canStand()) return;
      const wasSliding = this.sliding;
      const wasDashing = this.dashTimer > 0;
      const rebound = this.reboundRemaining > 0;
      this.endSlide(true);
      this.velocity.y = rebound ? t.reboundSpeed : t.jumpSpeed;
      if (wasDashing) { this.dashTimer = 0; this.invulnerable = false; }
      if (wasSliding || wasDashing || rebound) {
        // Slide-jump keeps (and slightly boosts) horizontal momentum.
        const s = this.speed;
        if (s > 0.1) {
          const k = Math.min(t.maxSpeed, s + (wasSliding ? t.slideJumpBoost : t.dashJumpBoost)) / s;
          this.velocity.x *= k;
          this.velocity.z *= k;
        }
      }
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.events.jumped = true;
      if (rebound) { this.events.rebounded = true; this.reboundRemaining = 0; this.technique('SLAM REBOUND'); }
      else if (wasDashing) this.technique('DASH JUMP');
      else if (wasSliding) this.technique('SLIDE LAUNCH');
    } else if (this.wallTimer > 0) {
      const n = this.wallNormal;
      const into = this.velocity.dot(n);
      this.velocity.addScaledVector(n, -into);
      this.velocity.x = n.x * t.wallJumpOut + this.velocity.x * 0.92;
      this.velocity.z = n.z * t.wallJumpOut + this.velocity.z * 0.92;
      this.velocity.y = t.wallJumpUp;
      this.wallTimer = 0;
      this.onWall = false;
      this.wallRunning = false;
      this.wallLock = t.wallJumpLock;
      this.buffer = 0;
      this.facing = Math.atan2(-n.x, -n.z);
      this.events.walljumped = true;
      this.airDashesLeft = t.airDashes;
      if (!this.wallKickRefunded && this.dashCharges < t.dashCharges) {
        this.dashCharges++; this.wallKickRefunded = true;
        this.technique('WALL KICK · DASH REFILLED');
      } else this.technique('WALL KICK');
    }
  }

  private startDash(): void {
    const t = this.tuning;
    this.dashDir.copy(this.wish);
    if (this.dashDir.lengthSq() === 0) this.dashDir.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    this.dashDir.y = 0;
    this.dashDir.normalize();
    this.dashVelocity = Math.min(t.maxSpeed, Math.max(t.dashSpeed, this.speed));
    this.slamming = false; this.wallRunning = false;
    this.dashTimer = t.dashTime;
    this.dashCooldown = t.dashCooldown;
    this.dashCharges--;
    this.endSlide(true);
    this.facing = Math.atan2(-this.dashDir.x, -this.dashDir.z);
    this.events.dashed = true;
  }

  private updateSlide(dt: number): void {
    void dt;
    const t = this.tuning;
    const held = !this.frozen && (this.input.isDown('ControlLeft') || this.input.isDown('KeyC'));
    if (!this.sliding) {
      if (held && this.grounded && this.slideLock <= 0 && this.dashTimer <= 0 && this.speed > t.slideEnterSpeed) {
        this.sliding = true;
        this.height = t.slideHeight;
        const s = this.speed;
        const boost = Math.max(s, t.slideBoost);
        if (s > 0.1) {
          this.velocity.x *= boost / s;
          this.velocity.z *= boost / s;
        }
        this.events.slid = true;
      }
      return;
    }
    // Leaving a slide needs head clearance.
    const downhill = this.groundNormal.x * this.velocity.x + this.groundNormal.z * this.velocity.z > 0.4;
    const wantsUp = !held || (this.speed < t.slideMinSpeed && !downhill);
    if (wantsUp && this.canStand()) this.endSlide(false);
  }

  private endSlide(force: boolean): void {
    if (!this.sliding) return;
    if (!this.canStand()) return;
    void force;
    this.sliding = false;
    this.height = this.tuning.standHeight;
    this.slideLock = 0.12;
  }

  private canStand(): boolean {
    const t = this.tuning;
    const r = t.radius;
    for (let y = t.slideHeight; y <= t.standHeight - r + 1e-3; y += r) {
      this.sphere.set(this.position.x, this.position.y + Math.min(y, t.standHeight - r), this.position.z);
      if (this.world.overlaps(this.sphere, r * 0.95)) return false;
    }
    return true;
  }

  private updateWallSlide(dt: number): void {
    void dt;
    if (!this.onWall) return;
    // Only cling while pushing toward the wall.
    if (this.wish.lengthSq() > 0 && this.wish.dot(this.wallNormal) < -0.2) this.wallTimer = this.tuning.wallStick;
  }

  private technique(label: string): void { this.lastTechnique = label; this.techniqueTime = 1.2; }

  private probeWall(): void {
    this.tmp.copy(this.position).y += this.height * 0.55;
    const hit = this.world.deepestContact(this.tmp, this.tuning.radius + 0.2);
    if (hit && Math.abs(hit.normal.y) < 0.3) {
      this.onWall = true; this.wallNormal.copy(hit.normal); this.wallTimer = this.tuning.wallStick;
    }
  }

  // --- integration ---------------------------------------------------------

  private accelerate(dir: THREE.Vector3, wishSpeed: number, accel: number, dt: number): void {
    const current = this.velocity.x * dir.x + this.velocity.z * dir.z;
    const add = wishSpeed - current;
    if (add <= 0) return;
    const amount = Math.min(accel * dt * wishSpeed, add);
    this.velocity.x += dir.x * amount;
    this.velocity.z += dir.z * amount;
  }

  private friction(dt: number, coefficient: number): void {
    const speed = this.speed;
    if (speed < 0.01) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }
    const drop = Math.max(speed, 4) * coefficient * dt;
    const k = Math.max(speed - drop, 0) / speed;
    this.velocity.x *= k;
    this.velocity.z *= k;
  }

  private integrate(dt: number): void {
    // Fast chains and downward slams still resolve thin walls and low ceilings.
    const steps = Math.max(1, Math.min(12, Math.ceil(this.velocity.length() * dt / (this.tuning.radius * 0.6))));
    for (let i = 0; i < steps; i++) this.integrateStep(dt / steps);
  }

  private integrateStep(dt: number): void {
    const wasGrounded = this.grounded;
    this.position.addScaledVector(this.velocity, dt);
    this.contacts.length = 0;
    this.resolve();

    // Step up small ledges instead of stopping dead against them.
    const blocked = this.contacts.some((c) => Math.abs(c.normal.y) < 0.5);
    if (blocked && (wasGrounded || this.grounded) && this.speed > 0.5) this.tryStep(dt);

    this.classifyContacts();
    if (!this.grounded && wasGrounded && this.velocity.y <= 0.5 && this.dashTimer <= 0) this.snapDown();

    for (const c of this.contacts) {
      const into = this.velocity.dot(c.normal);
      if (into < 0) this.velocity.addScaledVector(c.normal, -into);
    }
    if (this.grounded && !wasGrounded) {
      this.events.landed = true;
      this.landingGrace = this.tuning.landingGrace;
      this.wallRunRemaining = this.tuning.wallRunDuration; this.runNormal.set(0, 0, 0);
      this.wallKickRefunded = false; this.wallRunning = false;
      if (this.slamming) {
        this.slamming = false; this.events.slammed = true;
        this.reboundRemaining = this.tuning.reboundWindow;
        this.technique('SPACE · REBOUND');
      }
    }
  }

  /** Pushes the capsule (a stack of spheres) out of world geometry and the terrain. */
  private resolve(): void {
    const t = this.tuning;
    const r = t.radius;
    const top = Math.max(this.height - r, r);
    const count = Math.max(2, Math.ceil((top - r) / (r * 1.4)) + 1);
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < count; i++) {
        const y = r + ((top - r) * i) / (count - 1);
        this.sphere.set(this.position.x, this.position.y + y, this.position.z);
        this.tmp.copy(this.sphere);
        this.world.resolveSphere(this.sphere, r, this.contacts);
        this.tmp2.subVectors(this.sphere, this.tmp);
        if (this.tmp2.lengthSq() > 1e-8) {
          this.position.add(this.tmp2);
          moved = true;
        }
      }
      if (!moved) break;
    }
    const h = this.world.heightAt(this.position.x, this.position.z);
    if (this.position.y < h) {
      this.position.y = h;
      const normal = this.world.terrainNormal(this.position.x, this.position.z, new THREE.Vector3());
      this.contacts.push({ normal, depth: 0 });
    }
  }

  private tryStep(dt: number): void {
    const t = this.tuning;
    const saveY = this.position.y;
    const saveX = this.position.x;
    const saveZ = this.position.z;
    this.savedContacts.length = 0;
    for (const c of this.contacts) this.savedContacts.push(c);
    this.position.y += t.stepHeight;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.contacts.length = 0;
    this.resolve();
    const stillBlocked = this.contacts.some((c) => Math.abs(c.normal.y) < 0.5);
    if (stillBlocked) {
      this.position.set(saveX, saveY, saveZ);
      // Restore by copy: setting .length could grow the array with holes.
      this.contacts.length = 0;
      for (const c of this.savedContacts) this.contacts.push(c);
    } else {
      this.snapDown(t.stepHeight + 0.05);
    }
  }

  private classifyContacts(): void {
    const t = this.tuning;
    this.grounded = false;
    this.onWall = false;
    let bestGround = t.slopeLimit;
    for (const c of this.contacts) {
      if (c.normal.y > bestGround) {
        bestGround = c.normal.y;
        this.groundNormal.copy(c.normal);
        this.grounded = true;
      } else if (Math.abs(c.normal.y) < 0.4) {
        this.onWall = true;
        this.wallNormal.copy(c.normal);
        if (!this.grounded) this.wallTimer = t.wallStick;
      }
    }
    if (this.grounded) {
      this.wallTimer = 0;
      this.onWall = false;
      this.dashCooldown = Math.min(this.dashCooldown, 0.05);
    }
  }

  /** Keeps the capsule attached to the ground when running down slopes and steps. */
  private snapDown(maxDrop = 0.4): void {
    const t = this.tuning;
    const h = this.world.heightAt(this.position.x, this.position.z);
    if (this.position.y - h <= maxDrop && this.position.y >= h - 0.01) {
      this.position.y = h;
      this.world.terrainNormal(this.position.x, this.position.z, this.groundNormal);
      if (this.groundNormal.y > t.slopeLimit) this.grounded = true;
      return;
    }
    for (let drop = 0.06; drop <= maxDrop; drop += 0.06) {
      this.sphere.set(this.position.x, this.position.y - drop + t.radius, this.position.z);
      const hit = this.world.deepestContact(this.sphere, t.radius);
      if (hit) {
        this.position.y -= drop - 0.02;
        // Keep the true surface normal: ramps must still push a slide downhill.
        if (hit.normal.y > t.slopeLimit) {
          this.groundNormal.copy(hit.normal);
          this.grounded = true;
        }
        return;
      }
    }
  }

  private updateSwimming(): void {
    const t = this.tuning;
    const deep = this.position.y < t.waterLevel - 1.0;
    if (deep && !this.swimming) {
      this.swimming = true;
      this.slamming = false; this.wallRunning = false;
      this.endSlide(true);
    } else if (!deep && this.swimming && this.position.y > t.waterLevel - 0.85) {
      this.swimming = false;
    }
  }

  private updateFacing(dt: number): void {
    void dt;
    this.facing = this.cameraYaw;
  }

  private updateState(): void {
    if (this.swimming) this.state = 'swim';
    else if (this.slamming) this.state = 'slam';
    else if (this.dashTimer > 0) this.state = 'dash';
    else if (this.wallRunning && !this.grounded) this.state = 'wallrun';
    else if (this.sliding) this.state = 'slide';
    else if (!this.grounded) this.state = this.onWall || this.wallTimer > 0 ? 'wall' : 'air';
    else this.state = this.speed > 0.8 ? 'run' : 'idle';
  }

  /** Eye/pivot point for the camera, interpolated for the render frame. */
  pivot(out: THREE.Vector3, alpha = 1): THREE.Vector3 {
    const h = this.sliding ? this.tuning.slideHeight : this.tuning.eyeHeight;
    return this.interpolate(alpha, out).addScaledVector(UP, h);
  }
}
