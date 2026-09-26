import * as THREE from 'three';
import { ModelLibrary } from '../assets/ModelLibrary';
import { CombatWorld } from '../combat/CombatWorld';
import { DebugHud } from '../debug/DebugHud';
import { FlyCamera } from '../debug/FlyCamera';
import { Atmosphere } from '../render/Atmosphere';
import { sharedUniforms } from '../render/Materials';
import { DEBUG_PRESETS, getSkyPreset } from '../render/sky/SkyPresets';
import { Effects } from '../render/effects/Effects';
import { PIXEL_MODES, SmartPixelRenderer } from '../render/SmartPixelRenderer';
import { GameHud } from '../ui/GameHud';
import { Player } from '../player/Player';
import { World } from '../world/World';
import { Input } from './Input';
import { TimeControl } from './TimeControl';
import { PagePickups } from '../spells/PagePickups';
import { SpellbookUI } from '../ui/SpellbookUI';
import { EnemyDirector } from '../enemies/EnemyDirector';
import { EnemyHud } from '../ui/EnemyHud';
import { WorldMap } from '../ui/WorldMap';
import { Progress } from './Progress';

/** Anything that ticks with the game. Gameplay systems (Job 2+) use fixedUpdate. */
export interface GameSystem {
  fixedUpdate?(dt: number): void;
  /** `alpha` is the fraction into the next fixed step, for render interpolation. */
  update?(dt: number, alpha: number): void;
}

export interface GameOptions {
  preset?: string;
  mode?: string;
  camera?: { position: THREE.Vector3; lookAt: THREE.Vector3 };
  /** Freeze animation time (deterministic screenshots). */
  time?: number;
  debugBands?: boolean;
  baseLines?: number;
  /** Drop the player here instead of the level spawn (screenshots, testing). */
  playerAt?: THREE.Vector3;
  /** Chase-camera yaw in radians. */
  playerYaw?: number;
  /** false skips drawing (logic-only test harnesses on software WebGL). */
  render?: boolean;
}

const FIXED_DT = 1 / 60;

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 9000);
  readonly input: Input;
  readonly atmosphere: Atmosphere;
  readonly pixel: SmartPixelRenderer;
  readonly level: World;
  readonly player: Player;
  readonly combatWorld = new CombatWorld();
  readonly effects = new Effects();
  readonly time = new TimeControl();
  readonly systems: GameSystem[] = [];
  readonly models = new ModelLibrary();
  readonly assetsReady: Promise<void>;
  readonly assetErrors: string[] = [];
  readonly pages: PagePickups;
  readonly spellbookUI: SpellbookUI;
  readonly worldMap: WorldMap;
  readonly enemies: EnemyDirector;
  /** Discoveries, cleared encounters, opened gates (persisted by Job 9). */
  readonly progress = new Progress();
  /** Tests set this to drive the simulation only through `step()`. */
  manual = false;
  /** Debug fly camera instead of the player's chase camera. */
  flyMode = false;
  frames = 0;

  private readonly fly: FlyCamera;
  private readonly hud: DebugHud;
  readonly gameHud: GameHud;
  private readonly enemyHud: EnemyHud;
  private elapsed = 0;
  private accumulator = 0;
  private last = 0;
  private fps = 60;
  private readonly frozenTime: number | undefined;
  private readonly renderEnabled: boolean;
  private readonly focus = new THREE.Vector3();
  private readonly billboard = new THREE.Quaternion();

  constructor(container: HTMLElement, hudEl: HTMLElement, gameHudEl: HTMLElement, opts: GameOptions = {}) {
    this.scene.matrixWorldAutoUpdate = false; // the renderer updates once per frame, not once per band
    this.atmosphere = new Atmosphere(opts.preset ?? 'cosmic-violet');
    this.pixel = new SmartPixelRenderer(container, this.atmosphere);
    if (opts.baseLines) this.pixel.settings.baseLines = opts.baseLines;
    if (opts.debugBands) this.pixel.settings.debugBands = true;
    const mode = PIXEL_MODES.find((m) => m.id === opts.mode);
    if (mode) this.pixel.setMode(mode);
    else this.pixel.resize();

    this.input = new Input(this.pixel.renderer.domElement);
    this.hud = new DebugHud(hudEl);

    this.level = new World(this.atmosphere, this.progress);
    if (!opts.preset) {
      this.atmosphere.setPreset(this.level.skyPreset, 0);
      this.atmosphere.biomeDriven = !!this.level.biomeDriven;
    }
    this.scene.add(this.level.root, this.atmosphere.group);

    this.player = new Player(this.camera, this.input, this.level.colliders, this.level.spawn, {
      combat: this.combatWorld,
      effects: this.effects,
      time: this.time,
    });
    this.scene.add(this.player.model.root, this.effects.group);
    this.systems.push(this.player);
    for (const e of this.level.enemies) this.combatWorld.register(e);

    this.gameHud = new GameHud(gameHudEl);
    this.pages = new PagePickups(this.level, this.player.spells);
    this.scene.add(this.pages.group, this.player.spells.group);
    this.spellbookUI = new SpellbookUI(this.player, this.input, this.pages, gameHudEl);
    this.enemies = new EnemyDirector({
      player: this.player,
      colliders: this.level.colliders,
      combat: this.combatWorld,
      effects: this.effects,
      time: this.time,
      encounters: this.level.encounters,
      blind: (seconds, strength) => this.gameHud.blind(seconds, strength),
    });
    this.enemies.onAnnounce = (title, subtitle) => this.gameHud.announce(title, subtitle);
    this.enemies.onCleared = (encounter) => this.progress.clear(encounter.def.id);
    this.level.onRegion = (title, subtitle) => this.gameHud.announce(title, subtitle);
    this.systems.push(this.enemies);
    this.scene.add(this.enemies.group);
    this.enemyHud = new EnemyHud(gameHudEl);
    this.worldMap = new WorldMap(this.level, this.player, this.input, this.progress, this.enemies);
    this.combatWorld.onHit = (target, hit, result) => {
      if (target === this.player.combat && result.hit) this.gameHud.onPlayerDamaged(result.damage ?? hit.damage);
      this.enemies.onHit(target, hit, result);
    };

    this.fly = new FlyCamera(this.camera, this.input, (x, z) => this.level.heightAt(x, z));
    const pose = opts.camera ?? this.level.spawn;
    this.fly.setPose(pose.position, pose.lookAt);
    if (opts.camera) {
      // A fixed viewpoint was requested (screenshots): park the player and fly.
      this.fly.walk = false;
      this.setFlyMode(true);
    }
    if (opts.playerAt) {
      const p = opts.playerAt;
      this.player.controller.teleport(p.x, p.y, p.z, opts.playerYaw ?? 0);
      this.player.camera.setYaw(opts.playerYaw ?? 0, -0.14);
    }
    this.frozenTime = opts.time;
    this.renderEnabled = opts.render ?? true;
    // Build the streamed world around the first viewpoint before the first frame.
    this.level.setViewer?.(opts.camera ? opts.camera.position : this.player.controller.position, true);
    this.assetsReady = this.loadAssets();

    window.addEventListener('resize', () => this.pixel.resize());
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  private async loadAssets(): Promise<void> {
    await Promise.all([
      this.models.instantiate('ps1-italian-broadsword', { size: 1.35, grounded: false })
        .then(asset => this.player.model.setSwordModel(asset.root))
        .catch(error => { this.assetErrors.push(`sword: ${error}`); }),
      this.level.loadAssets?.(this.models).then(errors => this.assetErrors.push(...errors)),
    ]);
    for (const error of this.assetErrors) console.warn(`Asset fallback: ${error}`);
  }

  private tick = (now: number): void => {
    const realDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.fps = THREE.MathUtils.lerp(this.fps, 1 / Math.max(realDt, 1e-4), 0.05);
    // Hit-stop and slow motion scale everything except the camera's own smoothing.
    const dt = this.menuOpen ? 0 : this.time.update(realDt);
    this.elapsed = this.frozenTime ?? this.elapsed + dt;

    if (!this.menuOpen) this.handleDebugKeys();
    if (!this.flyMode && !this.menuOpen) this.player.camera.readLook();

    this.accumulator = this.manual ? 0 : this.accumulator + dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT) {
      this.fixedStep();
      this.accumulator -= FIXED_DT;
      steps++;
    }
    const alpha = this.accumulator / FIXED_DT;
    for (const s of this.systems) s.update?.(dt, alpha);

    if (this.flyMode) this.fly.update(dt);
    this.level.setViewer?.(this.camera.position);
    this.level.update(dt, this.elapsed);
    sharedUniforms.uWindTime.value = this.elapsed;
    this.atmosphere.setFocus(
      this.flyMode ? this.fly.focusPoint(this.focus) : this.focus.copy(this.player.controller.position),
    );
    this.atmosphere.update(dt, this.elapsed);

    this.effects.update(dt, this.camera);
    this.camera.getWorldQuaternion(this.billboard);
    for (const e of this.level.enemies) e.faceCamera(this.billboard);
    this.enemies.faceCamera(this.billboard);
    this.gameHud.update(realDt, this.player.combat, this.player.controller);
    this.enemyHud.update(realDt, this.flyMode ? null : this.enemies.focus);
    this.gameHud.setHint(this.flyMode ? '' : this.level.gateHint ?? '');
    this.spellbookUI.update(realDt);

    if (this.renderEnabled) this.pixel.render(this.scene, this.camera, this.flyMode ? undefined : this.player.view);
    const pc = this.player.controller;
    this.hud.update(dt, this.pixel, {
      fps: this.fps,
      presetName: getSkyPreset(this.atmosphere.presetId).name,
      flyMode: this.flyMode,
      flyWalk: this.fly.walk,
      flySpeed: this.fly.speed,
      player: {
        state: pc.state,
        speed: pc.speed,
        vertical: pc.velocity.y,
        dash: pc.dashCharges,
        grounded: pc.grounded,
      },
    });
    this.input.endFrame(steps > 0);
    this.frames++;
    requestAnimationFrame(this.tick);
  };

  /** A pausing menu (spellbook, quick-wheel or world map) is open. */
  get menuOpen(): boolean {
    return this.spellbookUI.paused || this.worldMap.paused;
  }

  /** One 60 Hz simulation step: player, enemies, constructs and pickups. */
  private fixedStep(): void {
    const playerPos = this.player.controller.position;
    for (const s of this.systems) s.fixedUpdate?.(FIXED_DT);
    for (const e of this.level.enemies) e.update(FIXED_DT, playerPos, this.combatWorld, this.effects);
    this.pages.update(FIXED_DT, playerPos, this.player.combat.alive && !this.flyMode);
    if (this.input.takePressed('KeyF') && !this.flyMode) this.pages.collectNearest();
  }

  /**
   * Advances the simulation deterministically by `seconds` (test harnesses; pair with
   * `manual = true` so the render loop does not add steps of its own).
   */
  step(seconds: number): void {
    const n = Math.max(1, Math.round(seconds / FIXED_DT));
    for (let i = 0; i < n; i++) {
      this.fixedStep();
      for (const s of this.systems) s.update?.(FIXED_DT, 1);
    }
  }

  setFlyMode(on: boolean): void {
    this.flyMode = on;
    this.player.active = !on;
    this.gameHud.setVisible(!on);
    if (!on) {
      // Hand the view back to the chase camera without a jump cut.
      this.player.camera.setYaw(this.player.controller.facing, -0.12);
    }
  }

  private handleDebugKeys(): void {
    const inp = this.input;
    const px = this.pixel;
    if (inp.pressed('F1')) {
      const i = PIXEL_MODES.indexOf(px.mode);
      px.setMode(PIXEL_MODES[(i + 1) % PIXEL_MODES.length]);
    }
    if (inp.pressed('F2')) px.settings.debugBands = !px.settings.debugBands;
    if (inp.pressed('F3')) px.settings.outline = px.settings.outline > 0 ? 0 : 1;
    if (inp.pressed('F4')) px.settings.quantLevels = px.settings.quantLevels < 64 ? 256 : 28;
    if (inp.takePressed('F6')) this.player.camera.motionScale = this.player.camera.motionScale ? 0 : 1;
    if (inp.pressed('BracketLeft')) px.cycleBaseLines(-1);
    if (inp.pressed('BracketRight')) px.cycleBaseLines(1);
    if (inp.pressed('KeyH')) this.hud.toggle();
    if (inp.pressed('KeyV')) this.setFlyMode(!this.flyMode);
    if (inp.pressed('KeyR') && !this.flyMode) this.player.respawn();
    DEBUG_PRESETS.forEach((p, i) => {
      if (inp.pressed(`Digit${i + 1}`)) this.atmosphere.setPreset(p.id, 2);
    });
    // 0 hands the sky back to the biomes after a debug preset.
    if (inp.pressed('Digit0')) this.atmosphere.biomeDriven = true;
  }
}
