import * as THREE from 'three';
import type { CombatWorld } from '../combat/CombatWorld';
import { CHANNEL, MOMENTUM_GAINS, Momentum } from '../combat/Momentum';
import type { Damageable, HitInfo, HitKind, HitResult } from '../combat/types';
import type { Input } from '../core/Input';
import type { TimeControl } from '../core/TimeControl';
import type { Effects } from '../render/effects/Effects';
import type { PlayerController } from './PlayerController';
import type { PlayerModel } from './PlayerModel';
import type { FirstPersonCamera } from './FirstPersonCamera';

/**
 * Spellblade combat (Pillar 2), remade in Job 13.
 *
 * The sword owns short range — a fast three-hit combo, a charged heavy, parries and
 * ripostes — but almost every swing can also reach: the combo finisher throws a
 * crescent, holding the attack charges a heavy that looses one (or, fully charged,
 * three) great crescents, a dash thrust fires a lance of light, a slide sweep sends a
 * wave along the ground and a plunge lands as a shockwave. Sword Arts (R) spend
 * Momentum on bigger ranged techniques. The book fires free Starbolts on right mouse
 * and casts pages on E (see SpellCasting); Ember Flasks (G) heal.
 *
 * Every swing can be cancelled into a dash or jump, so combat never interrupts the
 * movement flow. Hit detection uses an analytic blade arc, not the animated mesh.
 */

export type AttackArc = 'slashR' | 'slashL' | 'spin' | 'overhead' | 'thrust' | 'sweep' | 'plunge';

export interface AttackDef {
  id: string;
  arc: AttackArc;
  kind: HitKind;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  knockback: number;
  stagger: number;
  /** Forward speed applied while the swing commits. */
  lunge: number;
  reach: number;
  radius: number;
  momentum: number;
  shake: number;
  hitStop: number;
  next?: string;
  trail: number;
  /** Ranged follow-through fired when the swing turns active (see `emitters`). */
  emit?: string;
  /** Upward launch at the start of the windup (Skyfall). */
  leap?: number;
  /** Invulnerable while active (Bloodmoon Rend). */
  iframes?: boolean;
}

const A = (d: AttackDef) => d;

export const ATTACKS: Record<string, AttackDef> = {
  light1: A({ id: 'light1', arc: 'slashR', kind: 'light', windup: 0.07, active: 0.1, recovery: 0.17, damage: 14,
    knockback: 4, stagger: 0.2, lunge: 5, reach: 2.4, radius: 0.5, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.22, hitStop: 0.05, next: 'light2', trail: 0x8ae8ff }),
  light2: A({ id: 'light2', arc: 'slashL', kind: 'light', windup: 0.06, active: 0.1, recovery: 0.18, damage: 16,
    knockback: 4.5, stagger: 0.22, lunge: 5, reach: 2.4, radius: 0.5, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.24, hitStop: 0.055, next: 'light3', trail: 0x8ae8ff }),
  light3: A({ id: 'light3', arc: 'spin', kind: 'spin', windup: 0.12, active: 0.18, recovery: 0.3, damage: 24,
    knockback: 8, stagger: 0.5, lunge: 2.5, reach: 2.3, radius: 0.55, momentum: MOMENTUM_GAINS.swordHit + 3,
    shake: 0.45, hitStop: 0.08, trail: 0xb07cff, emit: 'finisher' }),
  heavy: A({ id: 'heavy', arc: 'overhead', kind: 'heavy', windup: 0.24, active: 0.14, recovery: 0.4, damage: 30,
    knockback: 11, stagger: 0.9, lunge: 3.5, reach: 2.6, radius: 0.6, momentum: MOMENTUM_GAINS.heavyHit,
    shake: 0.6, hitStop: 0.11, trail: 0xff8ad8, emit: 'charged' }),
  thrust: A({ id: 'thrust', arc: 'thrust', kind: 'thrust', windup: 0.04, active: 0.11, recovery: 0.16, damage: 18,
    knockback: 5, stagger: 0.3, lunge: 0, reach: 2.8, radius: 0.45, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.3, hitStop: 0.06, trail: 0x7fffd4, emit: 'lance' }),
  sweep: A({ id: 'sweep', arc: 'sweep', kind: 'sweep', windup: 0.05, active: 0.13, recovery: 0.22, damage: 17,
    knockback: 6, stagger: 0.6, lunge: 0, reach: 2.3, radius: 0.5, momentum: MOMENTUM_GAINS.swordHit,
    shake: 0.3, hitStop: 0.06, trail: 0x9aff7a, emit: 'groundWave' }),
  plunge: A({ id: 'plunge', arc: 'plunge', kind: 'plunge', windup: 0.1, active: 1.1, recovery: 0.3, damage: 28,
    knockback: 9, stagger: 0.8, lunge: 0, reach: 1.9, radius: 0.55, momentum: MOMENTUM_GAINS.heavyHit,
    shake: 0.5, hitStop: 0.09, trail: 0xffb45a, emit: 'shockwave' }),
  riposte: A({ id: 'riposte', arc: 'thrust', kind: 'riposte', windup: 0.05, active: 0.12, recovery: 0.2, damage: 48,
    knockback: 10, stagger: 1, lunge: 7, reach: 2.9, radius: 0.55, momentum: MOMENTUM_GAINS.riposte,
    shake: 0.7, hitStop: 0.13, trail: 0xffd070 }),

  // --- Sword Arts (R): Momentum-costed techniques ------------------------------------------------
  'art-crescents': A({ id: 'art-crescents', arc: 'slashR', kind: 'heavy', windup: 0.14, active: 0.12, recovery: 0.3, damage: 22,
    knockback: 6, stagger: 0.5, lunge: 2, reach: 2.5, radius: 0.6, momentum: 0, shake: 0.4, hitStop: 0.06,
    trail: 0xc9b0ff, emit: 'art-crescents' }),
  'art-skyfall': A({ id: 'art-skyfall', arc: 'plunge', kind: 'plunge', windup: 0.32, active: 1.6, recovery: 0.35, damage: 36,
    knockback: 12, stagger: 1.1, lunge: 9, reach: 2, radius: 0.6, momentum: 0, shake: 0.8, hitStop: 0.1,
    trail: 0xffd070, emit: 'art-skyfall', leap: 13 }),
  'art-tempest': A({ id: 'art-tempest', arc: 'spin', kind: 'spin', windup: 0.12, active: 0.3, recovery: 0.32, damage: 26,
    knockback: 9, stagger: 0.7, lunge: 0, reach: 3, radius: 0.7, momentum: 0, shake: 0.55, hitStop: 0.07,
    trail: 0x9ad8ff, emit: 'art-tempest' }),
  'art-phantom': A({ id: 'art-phantom', arc: 'thrust', kind: 'thrust', windup: 0.1, active: 0.12, recovery: 0.25, damage: 16,
    knockback: 4, stagger: 0.3, lunge: 0, reach: 2.6, radius: 0.5, momentum: 0, shake: 0.3, hitStop: 0.04,
    trail: 0xa0c8ff, emit: 'art-phantom' }),
  'art-rend': A({ id: 'art-rend', arc: 'thrust', kind: 'thrust', windup: 0.08, active: 0.28, recovery: 0.3, damage: 30,
    knockback: 6, stagger: 0.6, lunge: 0, reach: 2.8, radius: 0.8, momentum: 0, shake: 0.5, hitStop: 0.05,
    trail: 0xff3a5a, emit: 'art-rend', iframes: true }),
  'art-sunder': A({ id: 'art-sunder', arc: 'overhead', kind: 'heavy', windup: 0.3, active: 0.14, recovery: 0.45, damage: 40,
    knockback: 12, stagger: 1.2, lunge: 3, reach: 2.7, radius: 0.65, momentum: 0, shake: 0.8, hitStop: 0.12,
    trail: 0xffa45e, emit: 'art-sunder' }),
};

export interface SwordArt {
  id: string;
  name: string;
  glyph: string;
  color: number;
  cost: number;
  cooldown: number;
  description: string;
}

/** The Sword Arts, in unlock order (R uses the equipped one, X cycles). */
export const SWORD_ARTS: readonly SwordArt[] = [
  { id: 'art-crescents', name: 'Moonlit Crescents', glyph: '☽', color: 0xc9b0ff, cost: 20, cooldown: 1.4,
    description: 'A wide slash that looses three great crescents in a fan (30 m, 30 damage each, piercing).' },
  { id: 'art-skyfall', name: 'Skyfall', glyph: '⇓', color: 0xffd070, cost: 25, cooldown: 2.2,
    description: 'Leap forward and drive the blade into the earth: a 6 m shockwave and a line of stone spears 16 m ahead.' },
  { id: 'art-tempest', name: 'Tempest Cross', glyph: '✢', color: 0x9ad8ff, cost: 30, cooldown: 2.5,
    description: 'Spin and throw eight crescents out in every direction.' },
  { id: 'art-phantom', name: 'Phantom Blades', glyph: '⚔', color: 0xa0c8ff, cost: 30, cooldown: 3,
    description: 'Six spectral swords gather behind you and hunt your targets one after another.' },
  { id: 'art-rend', name: 'Bloodmoon Rend', glyph: '⟿', color: 0xff3a5a, cost: 35, cooldown: 3,
    description: 'Dash 10 m straight through your foes, untouchable; a heartbeat later every one you passed bursts.' },
  { id: 'art-sunder', name: 'Sunder', glyph: '⟰', color: 0xffa45e, cost: 25, cooldown: 2.4,
    description: 'An overhead cleave that tears a 20 m line of fire and stone through the ground.' },
];

export const COMBAT_TUNING = {
  maxHealth: 100,
  parryWindow: 0.18,
  guardReduction: 0.35,
  riposteWindow: 1.5,
  respawnDelay: 1.8,
  sheatheAfter: 5,
  /** Holding the attack past this after a swing starts a charge (seconds). */
  holdToCharge: 0.28,
  /** Seconds to a full charge. */
  chargeTime: 0.8,
  flasks: 3,
  flaskHeal: 45,
  /** Drinking roots you this long before the heal lands. */
  flaskTime: 0.75,
};

type Phase = 'idle' | 'windup' | 'active' | 'recovery' | 'charge' | 'staggered' | 'dead';

const UP = new THREE.Vector3(0, 1, 0);

export class PlayerCombat implements Damageable {
  readonly team = 'player' as const;
  readonly bodyRadius = 0.45;
  readonly bodyHeight = 1.8;
  readonly momentum = new Momentum();

  health = COMBAT_TUNING.maxHealth;
  maxHealth = COMBAT_TUNING.maxHealth;
  alive = true;
  phase: Phase = 'idle';
  attack: AttackDef | null = null;
  /** 0..1 progress through the current phase, for animation. */
  phaseT = 0;
  charge = 0;
  guarding = false;
  onReset: (() => void) | null = null;
  /** Spell input each fixed step: E pressed / held / released (see SpellCasting). */
  spellInput: ((pressed: boolean, held: boolean, released: boolean) => void) | null = null;
  /** Right mouse: the book's free Starbolts. */
  primaryInput: ((held: boolean) => void) | null = null;
  /** Ranged follow-throughs by name ('finisher', 'charged', 'art-sunder', ...). */
  emitters: Record<string, (charge: number) => void> = {};
  wardTime = 0;
  wardReduction = 0.5;
  /** Momentum gained by channelling this step (for effects and sound). */
  channelGain = 0;
  /** A hit while channelling locks the channel until Shift is released. */
  channelBroken = false;

  // Sword Arts and flasks.
  readonly artsUnlocked = new Set<string>(['art-crescents', 'art-skyfall']);
  art = 'art-crescents';
  readonly artCooldowns = new Map<string, number>();
  artMessage = '';
  artMessageTime = 0;
  artsUsed = 0;
  flasks = COMBAT_TUNING.flasks;
  maxFlasks = COMBAT_TUNING.flasks;
  drinking = 0;
  flasksDrunk = 0;

  private timer = 0;
  private queued: string | null = null;
  private parryTimer = 0;
  private riposteTimer = 0;
  private respawnTimer = 0;
  private sheatheTimer = 0;
  private plungeLanded = false;
  private holdTime = 0;
  private releasedCharge = 0;
  private readonly hitList = new Set<Damageable>();
  private readonly hilt = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly prevHilt = new THREE.Vector3();
  private readonly prevTip = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly found: Damageable[] = [];

  constructor(
    private readonly input: Input,
    private readonly controller: PlayerController,
    private readonly model: PlayerModel,
    private readonly camera: FirstPersonCamera,
    private readonly world: CombatWorld,
    private readonly effects: Effects,
    private readonly time: TimeControl,
    private readonly respawn: () => void,
  ) {}

  get position(): THREE.Vector3 {
    return this.controller.position;
  }

  get busy(): boolean {
    return this.phase === 'windup' || this.phase === 'active';
  }

  get parrying(): boolean {
    return this.parryTimer > 0;
  }

  get riposteReady(): boolean {
    return this.riposteTimer > 0;
  }

  get currentArt(): SwordArt {
    return SWORD_ARTS.find(a => a.id === this.art)!;
  }

  artRemaining(id = this.art): number {
    return this.artCooldowns.get(id) ?? 0;
  }

  reset(): void {
    this.wardTime = 0;
    this.onReset?.();
    this.health = this.maxHealth;
    this.alive = true;
    this.phase = 'idle';
    this.attack = null;
    this.momentum.reset();
    this.timer = 0;
    this.queued = null;
    this.hitList.clear();
    this.artCooldowns.clear();
    this.flasks = this.maxFlasks;
    this.drinking = 0;
    this.holdTime = 0;
  }

  /**
   * What the great foes left behind (Job 16): Sword Arts, vigour and Ember Flasks from
   * every remembrance held. Idempotent; call after a boss falls or a save loads.
   */
  applyRemembrances(gifts: { art?: string; vigour?: number; flask?: number }[]): void {
    let vigour = 0, flasks = 0;
    for (const g of gifts) {
      if (g.art) this.artsUnlocked.add(g.art);
      vigour += g.vigour ?? 0;
      flasks += g.flask ?? 0;
    }
    const grewBy = COMBAT_TUNING.maxHealth + vigour - this.maxHealth;
    this.maxHealth = COMBAT_TUNING.maxHealth + vigour;
    this.maxFlasks = COMBAT_TUNING.flasks + flasks;
    if (grewBy > 0) this.health = Math.min(this.maxHealth, this.health + grewBy);
    this.flasks = Math.min(this.flasks, this.maxFlasks);
  }

  /** Rest at a shrine: full health, flasks and Momentum without the death reset. */
  restore(): void {
    this.health = this.maxHealth;
    this.flasks = this.maxFlasks;
    this.momentum.reset();
  }

  fixedUpdate(dt: number): void {
    this.wardTime = Math.max(0, this.wardTime - dt);
    this.artMessageTime = Math.max(0, this.artMessageTime - dt);
    for (const [id, t] of this.artCooldowns) this.artCooldowns.set(id, Math.max(0, t - dt));
    const shiftHeld = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (!shiftHeld) this.channelBroken = false;
    const channelling = this.alive && this.controller.channelling && !this.channelBroken && this.drinking <= 0 &&
      (this.phase === 'idle' || this.phase === 'recovery');
    this.channelGain = this.momentum.update(dt, channelling);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.riposteTimer = Math.max(0, this.riposteTimer - dt);
    this.sheatheTimer = Math.max(0, this.sheatheTimer - dt);
    this.model.setSwordDrawn(this.sheatheTimer > 0);

    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.reset();
        this.respawn();
      }
      return;
    }

    if (this.phase === 'staggered') {
      this.timer -= dt;
      this.controller.moveScale = 0.15;
      this.controller.attackLock = true;
      if (this.timer <= 0) this.endAttack();
      return;
    }

    if (this.drinking > 0) {
      this.drinking -= dt;
      this.controller.moveScale = 0.35;
      if (this.drinking <= 0) {
        const before = this.health;
        this.health = Math.min(this.maxHealth, this.health + COMBAT_TUNING.flaskHeal);
        this.effects.number(this.tmpA.copy(this.position).addScaledVector(UP, 2), `+${Math.round(this.health - before)}`, 0x9affb1, 1.3);
        this.effects.sparkBurst(this.tmpA.copy(this.position).addScaledVector(UP, 1), UP, 0xffb45a, 18, 4);
        this.flasksDrunk++;
      }
      return;
    }

    this.readInput(dt);
    this.advance(dt);
  }

  // --- input ---------------------------------------------------------------

  private readInput(dt: number): void {
    const inp = this.input;
    if (this.controller.frozen) return;

    this.guarding = inp.isDown('KeyQ') && !this.busy;
    if (inp.pressed('KeyQ') && this.phase !== 'windup' && this.phase !== 'active') {
      this.parryTimer = COMBAT_TUNING.parryWindow;
      this.effects.ring(this.tmpA.copy(this.position).addScaledVector(UP, 1.1), 0x9ad8ff, 1.1, 0.25, true);
    }

    const free = this.phase === 'idle' || this.phase === 'recovery';
    this.spellInput?.(inp.takePressed('KeyE'), inp.isDown('KeyE'), inp.released('KeyE'));
    this.primaryInput?.(inp.mouseDown(2) && free);
    if (inp.wheel !== 0 && !inp.blocked) { this.onWheel?.(Math.sign(inp.wheel)); inp.wheel = 0; }

    if (inp.takePressed('KeyX')) this.cycleArt(1);
    if (inp.takePressed('KeyG') && free) this.drinkFlask();
    if (inp.takePressed('KeyR') && free) this.useArt();

    // Holding the attack charges a heavy that looses crescents.
    if (inp.mouseDown(0)) this.holdTime += dt; else this.holdTime = 0;
    if (this.phase === 'charge') {
      this.charge = Math.min(1, this.charge + dt / COMBAT_TUNING.chargeTime);
      this.controller.moveScale = 0.35;
      this.controller.attackLock = false;
      if (!inp.mouseDown(0)) { this.releasedCharge = this.charge; this.begin('heavy'); }
      return;
    }
    if (this.phase === 'recovery' && inp.mouseDown(0) && this.holdTime > COMBAT_TUNING.holdToCharge && !this.queued &&
      this.controller.grounded) {
      this.phase = 'charge';
      this.charge = 0;
      this.attack = null;
      this.effects.endTrail();
      this.sheatheTimer = COMBAT_TUNING.sheatheAfter;
      return;
    }

    if (inp.mousePressed(0)) {
      if (this.phase === 'idle') this.begin(this.contextualAttack());
      else if (this.phase === 'recovery') this.queued = this.attack?.next ?? this.contextualAttack();
      else if (this.phase === 'windup' || this.phase === 'active') this.queued = this.attack?.next ?? null;
    }

    // Dash and jump cancel recovery — keeping the movement flow alive.
    if (this.phase === 'recovery' && (this.controller.events.dashed || this.controller.events.jumped)) this.endAttack();
  }

  /** Mouse wheel: set by Player (cycles spell pages). */
  onWheel: ((step: number) => void) | null = null;

  private contextualAttack(): string {
    if (this.riposteTimer > 0) return 'riposte';
    if (this.controller.state === 'dash') return 'thrust';
    if (this.controller.sliding) return 'sweep';
    if (!this.controller.grounded) return 'plunge';
    return 'light1';
  }

  cycleArt(step: number): void {
    const owned = SWORD_ARTS.filter(a => this.artsUnlocked.has(a.id));
    const i = owned.findIndex(a => a.id === this.art);
    this.art = owned[(i + step + owned.length * 4) % owned.length].id;
    this.artMessage = this.currentArt.name;
    this.artMessageTime = 1.6;
  }

  /** R: the equipped Sword Art, if Momentum and its cooldown allow. */
  useArt(): boolean {
    const art = this.currentArt;
    const fail = (m: string) => { this.artMessage = m; this.artMessageTime = 2.5; return false; };
    if (this.artRemaining() > 0) return fail(`${art.name} is recovering`);
    if (!this.momentum.spend(art.cost)) return fail(`${art.name} needs ${this.momentum.costOf(art.cost)} Momentum · hold Shift standing still`);
    this.artCooldowns.set(art.id, art.cooldown);
    this.artsUsed++;
    this.begin(art.id);
    return true;
  }

  drinkFlask(): boolean {
    if (this.flasks <= 0 || this.health >= this.maxHealth) {
      this.artMessage = this.flasks <= 0 ? 'No Ember Flasks left · rest at a shrine' : 'Vigour is already full';
      this.artMessageTime = 2;
      return false;
    }
    this.flasks--;
    this.drinking = COMBAT_TUNING.flaskTime;
    this.endAttack();
    return true;
  }

  // --- attack lifecycle ----------------------------------------------------

  private begin(id: string): void {
    const def = ATTACKS[id];
    if (!def) return;
    this.attack = def;
    this.phase = 'windup';
    this.timer = def.windup;
    this.phaseT = 0;
    this.queued = null;
    this.hitList.clear();
    this.plungeLanded = false;
    this.sheatheTimer = COMBAT_TUNING.sheatheAfter;
    if (id === 'riposte') this.riposteTimer = 0;
    if (id !== 'heavy') this.releasedCharge = 0;

    // First-person strikes follow aim; never turn the body away from the crosshair.
    this.controller.facing = this.camera.movementYaw;
    this.controller.attackLock = true;
    if (def.leap) {
      const f = this.controller.facing;
      this.controller.addImpulse(-Math.sin(f) * def.lunge, def.leap, -Math.cos(f) * def.lunge);
    }
  }

  private advance(dt: number): void {
    if (this.phase === 'idle') {
      this.controller.moveScale = 1;
      this.controller.attackLock = false;
      return;
    }
    const def = this.attack;
    if (!def) return;
    this.timer -= dt;

    if (this.phase === 'windup') {
      this.phaseT = 1 - Math.max(0, this.timer) / def.windup;
      this.controller.moveScale = def.leap ? 1 : 0.3;
      if (def.arc === 'overhead') this.controller.moveScale = 0.15;
      if (this.timer <= 0) {
        this.phase = 'active';
        this.timer = def.active;
        this.phaseT = 0;
        if (!def.leap) this.lunge(def);
        // The first-person rig traces the blade's own ribbon (FirstPersonRig).
        this.bladeAt(def, 0, this.prevHilt, this.prevTip);
        if (def.arc === 'plunge') this.controller.velocity.y = Math.min(this.controller.velocity.y, def.leap ? 4 : -26);
        if (def.emit && def.arc !== 'plunge') this.emitters[def.emit]?.(this.releasedCharge);
      }
    } else if (this.phase === 'active') {
      this.phaseT = 1 - Math.max(0, this.timer) / def.active;
      this.controller.moveScale = 0.1;
      this.controller.invulnerableOverride = !!def.iframes;
      this.sweepBlade(def);
      if (def.arc === 'plunge') {
        if (this.phaseT > (def.leap ? 0.18 : 0)) this.controller.velocity.y = Math.min(this.controller.velocity.y, -26);
        if (this.controller.grounded && !this.plungeLanded && (this.phaseT > 0.05 || !def.leap)) {
          this.plungeLanded = true;
          this.plungeImpact(def);
          if (def.emit) this.emitters[def.emit]?.(0);
          this.timer = 0;
        }
      }
      if (this.timer <= 0) {
        this.phase = 'recovery';
        this.timer = def.recovery;
        this.phaseT = 0;
        this.controller.invulnerableOverride = false;
        this.effects.endTrail();
      }
    } else if (this.phase === 'recovery') {
      this.phaseT = 1 - Math.max(0, this.timer) / def.recovery;
      this.controller.moveScale = 0.45;
      if (this.timer <= 0) {
        if (this.queued) this.begin(this.queued);
        else this.endAttack();
      }
    }

    this.model.setAttackPose(this.attack?.arc ?? null, this.phase, this.phaseT, this.charge);
  }

  private endAttack(): void {
    this.phase = 'idle';
    this.attack = null;
    this.charge = 0;
    this.queued = null;
    this.controller.moveScale = 1;
    this.controller.attackLock = false;
    this.controller.invulnerableOverride = false;
    this.effects.endTrail();
    this.model.setAttackPose(null, 'idle', 0, 0);
  }

  private lunge(def: AttackDef): void {
    if (def.lunge <= 0) return;
    const f = this.controller.facing;
    this.controller.velocity.x += -Math.sin(f) * def.lunge;
    this.controller.velocity.z += -Math.cos(f) * def.lunge;
  }

  // --- blade geometry and hit detection ------------------------------------

  /** Analytic blade pose for arc progress `t`. */
  private bladeAt(def: AttackDef, t: number, hilt: THREE.Vector3, tip: THREE.Vector3): void {
    const f = this.controller.facing;
    const pos = this.controller.position;
    let angle = 0;
    let height = 1.2;
    let pitch = 0;
    let reach = def.reach;
    const charged = def.arc === 'overhead' ? 1 + this.releasedCharge * 0.15 : 1;

    switch (def.arc) {
      case 'slashR':
        angle = THREE.MathUtils.lerp(1.35, -1.35, t);
        height = 1.3 - t * 0.25;
        pitch = -0.15;
        break;
      case 'slashL':
        angle = THREE.MathUtils.lerp(-1.45, 1.3, t);
        height = 1.0 + t * 0.2;
        pitch = -0.1;
        break;
      case 'spin':
        angle = t * Math.PI * 2;
        height = 1.1;
        break;
      case 'overhead':
        pitch = THREE.MathUtils.lerp(1.2, -0.85, t);
        height = 1.4;
        reach *= charged;
        break;
      case 'thrust':
        reach = THREE.MathUtils.lerp(1.1, def.reach, Math.min(1, t * 1.7));
        height = 1.2;
        break;
      case 'sweep':
        angle = THREE.MathUtils.lerp(1.3, -1.3, t);
        height = 0.38;
        break;
      case 'plunge':
        pitch = -1.25;
        height = 1.5;
        break;
    }

    pitch += this.camera.pitch;
    const cos = Math.cos(pitch);
    this.dir.set(-Math.sin(f + angle) * cos, Math.sin(pitch), -Math.cos(f + angle) * cos).normalize();
    hilt.copy(pos).addScaledVector(UP, height).addScaledVector(this.dir, 0.3);
    tip.copy(hilt).addScaledVector(this.dir, reach);
  }

  /** Steps the blade from its previous pose to the current one, damaging what it crosses. */
  private sweepBlade(def: AttackDef): void {
    const steps = 3;
    for (let i = 1; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(Math.max(0, this.phaseT - 1 / steps), this.phaseT, i / steps);
      this.bladeAt(def, t, this.hilt, this.tip);
      this.effects.pushTrail(this.hilt, this.tip);
      this.world.sweep(this.hilt, this.tip, def.radius, 'player', this.found);
      for (const target of this.found) {
        if (this.hitList.has(target)) continue;
        this.hitList.add(target);
        this.land(def, target);
      }
      this.prevHilt.copy(this.hilt);
      this.prevTip.copy(this.tip);
    }
  }

  private land(def: AttackDef, target: Damageable): void {
    const point = this.tmpA.copy(target.position).addScaledVector(UP, target.bodyHeight * 0.6);
    const dir = this.tmpB.subVectors(point, this.position).setY(0).normalize();
    const damage = def.damage * (def.id === 'heavy' ? 1 + this.releasedCharge * 1.0 : 1);
    const result = this.world.strike(target, {
      damage,
      direction: dir.clone(),
      point: point.clone(),
      knockback: def.knockback,
      stagger: def.stagger,
      source: 'player',
      kind: def.kind,
      attacker: this,
    });
    if (!result.hit) return;

    this.momentum.add(def.momentum);
    this.time.hitStop(def.hitStop);
    this.camera.addShake(def.shake);
    this.effects.sparkBurst(point, dir, def.trail, 10 + Math.round(damage / 3), 6 + damage * 0.2);
    this.effects.number(
      this.tmpA.copy(point).addScaledVector(UP, 0.3),
      String(Math.round(result.damage ?? damage)),
      def.kind === 'riposte' ? 0xffd070 : 0xfff0c0,
      def.kind === 'light' ? 1 : 1.35,
    );
  }

  private plungeImpact(def: AttackDef): void {
    const centre = this.tmpA.copy(this.position);
    const radius = def.leap ? 6 : 4.2;
    this.effects.ring(centre, def.trail, radius * 1.1, 0.45);
    this.effects.ring(centre, 0xffffff, radius * 0.6, 0.3);
    this.camera.addShake(def.shake);
    this.camera.addKick(0.03);
    this.time.hitStop(def.hitStop);
    this.effects.sparkBurst(centre, UP, def.trail, 26, 10);
    this.world.sphere(centre, radius, 'player', this.found);
    for (const target of this.found) {
      if (this.hitList.has(target)) continue;
      this.hitList.add(target);
      this.land(def, target);
    }
  }

  // --- taking damage -------------------------------------------------------

  applyHit(hit: HitInfo): HitResult {
    if (!this.alive) return { hit: false };

    // Dash i-frames: a perfect dodge pays a little Momentum and a slow-motion beat.
    if (this.controller.invulnerable) {
      this.momentum.add(MOMENTUM_GAINS.perfectDodge);
      this.time.slowMotion(0.45, 0.18);
      this.effects.number(this.position.clone().addScaledVector(UP, 2.1), '+', 0x7fffd4, 1.2);
      return { hit: false, dodged: true };
    }

    const facingDot = -hit.direction.x * -Math.sin(this.controller.facing) + -hit.direction.z * -Math.cos(this.controller.facing);
    const fromFront = facingDot > -0.2 && hit.kind !== 'hazard';

    if (this.parryTimer > 0 && fromFront) {
      this.parryTimer = 0;
      this.riposteTimer = COMBAT_TUNING.riposteWindow;
      this.momentum.add(MOMENTUM_GAINS.parry);
      this.time.hitStop(0.12);
      this.camera.addShake(0.5);
      const centre = this.position.clone().addScaledVector(UP, 1.2);
      this.effects.ring(centre, 0xffd070, 2.4, 0.4, true);
      this.effects.sparkBurst(hit.point, hit.direction.clone().negate(), 0xffd070, 18, 9);
      this.effects.number(centre.clone().addScaledVector(UP, 0.7), '!', 0xffd070, 1.4);
      hit.attacker?.applyHit({
        damage: 0,
        direction: hit.direction.clone().negate(),
        point: hit.point,
        knockback: 5,
        stagger: 1.3,
        source: 'player',
        kind: 'riposte',
        parry: true,
      });
      return { hit: false, parried: true };
    }

    let damage = hit.damage * (this.wardTime > 0 ? 1 - this.wardReduction : 1);
    // Standing still to channel is the gamble: a hit breaks it and lands harder.
    if (this.momentum.channelTime > 0) {
      damage *= CHANNEL.exposed;
      this.momentum.channelTime = 0;
      this.channelBroken = true;
    }
    const blocked = this.guarding && fromFront;
    if (blocked) {
      damage *= COMBAT_TUNING.guardReduction;
      this.effects.sparkBurst(hit.point, hit.direction.clone().negate(), 0x9ad8ff, 8, 5);
    }

    this.health -= damage;
    this.controller.addImpulse(hit.direction.x * hit.knockback, 2.5, hit.direction.z * hit.knockback);
    this.camera.addShake(blocked ? 0.3 : 0.7);
    this.camera.addKick(blocked ? 0.01 : 0.025);
    this.time.hitStop(blocked ? 0.04 : 0.07);
    this.effects.sparkBurst(hit.point, hit.direction, 0xff4a6a, 12, 6);
    this.effects.number(hit.point.clone().addScaledVector(UP, 0.4), String(Math.round(damage)), 0xff5a7a, 1.2);

    if (!blocked && hit.stagger > 0) {
      this.phase = 'staggered';
      this.timer = Math.min(hit.stagger, 0.55);
      this.attack = null;
      this.drinking = 0;
      this.effects.endTrail();
      this.model.setAttackPose(null, 'idle', 0, 0);
    }

    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.phase = 'dead';
      this.respawnTimer = COMBAT_TUNING.respawnDelay;
      this.time.slowMotion(0.25, 0.9);
      this.camera.addShake(1);
      return { hit: true, damage, killed: true, blocked };
    }
    return { hit: true, damage, blocked };
  }
}
