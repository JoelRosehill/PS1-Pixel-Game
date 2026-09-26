import { CreatureLibrary } from '../assets/Creatures';
import { FOE_WEAPONS } from '../enemies/Bestiary';
import { BOSS_PROPS } from '../enemies/bosses/Roster';
import { SPELL_PAGES } from '../spells/SpellBook';
import * as THREE from 'three';
import { ModelLibrary } from '../assets/ModelLibrary';
import { CombatWorld } from '../combat/CombatWorld';
import { DebugHud } from '../debug/DebugHud';
import { FlyCamera } from '../debug/FlyCamera';
import { Atmosphere } from '../render/Atmosphere';
import { sharedUniforms } from '../render/Materials';
import { DEBUG_PRESETS, getSkyPreset } from '../render/sky/SkyPresets';
import { Effects } from '../render/effects/Effects';
import { PIXEL_MODES, SmartPixelRenderer, smartMode } from '../render/SmartPixelRenderer';
import { GameHud } from '../ui/GameHud';
import { Player } from '../player/Player';
import { World } from '../world/World';
import { Input, setKeyBindings } from './Input';
import { TimeControl } from './TimeControl';
import { PagePickups } from '../spells/PagePickups';
import { SpellbookUI } from '../ui/SpellbookUI';
import { EnemyDirector } from '../enemies/EnemyDirector';
import { EnemyHud } from '../ui/EnemyHud';
import { WorldMap } from '../ui/WorldMap';
import { BossHud } from '../ui/BossHud';
import { INTRO_SECONDS } from '../enemies/bosses/BossArena';
import { Progress } from './Progress';
import { SaveGame, type SaveData } from './SaveGame';
import { Interactions } from '../world/Interactions';
import type { LoreSpot, Shrine } from '../world/StoryProps';
import { StoryUI } from '../ui/StoryUI';
import { REMEMBRANCES, WANDERER_LINES } from '../story/Lore';
import { roman } from '../world/biomes/Chapters';
import { AudioEngine } from '../audio/AudioEngine';
import { SoundDirector } from '../audio/SoundDirector';
import { MenuUI } from '../ui/MenuUI';
import { ACTIONS, keyName, Settings } from './Settings';
import { LORE, MEMORIALS } from '../story/Lore';

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
  /** Read and write the save in localStorage (off for screenshots and tests unless asked). */
  save?: boolean;
  /** Ignore any existing save and start a new journey. */
  fresh?: boolean;
  /** Create audio (it still waits for a user gesture to start). */
  audio?: boolean;
  /** Open on the title screen. */
  title?: boolean;
  /** Force the debug overlay on or off (screenshots); otherwise the setting decides. */
  debugHud?: boolean;
  /** Capture the mouse for play (off for screenshots and tests). */
  pointerLock?: boolean;
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
  /** The animated creatures of the Creature Forge (Job 11), preloaded at start. */
  readonly creatures = new CreatureLibrary();
  readonly assetsReady: Promise<void>;
  readonly assetErrors: string[] = [];
  readonly pages: PagePickups;
  readonly spellbookUI: SpellbookUI;
  readonly worldMap: WorldMap;
  readonly enemies: EnemyDirector;
  /** Discoveries, cleared encounters, opened gates (persisted by Job 9). */
  readonly progress = new Progress();
  readonly interactions: Interactions;
  readonly storyUI: StoryUI;
  readonly save: SaveGame;
  /** The Ember Shrine the player last rested at (respawn point, saved). */
  restShrine = 'threshold';
  /** Seconds of unpaused play, and deaths, across the whole journey (saved). */
  playTime = 0;
  deaths = 0;
  /** A save was found and applied at startup. */
  resumed = false;
  readonly settings: Settings;
  readonly audio: AudioEngine;
  readonly sound: SoundDirector;
  readonly menu: MenuUI;
  /** Tests set this to drive the simulation only through `step()`. */
  manual = false;
  /** Debug fly camera instead of the player's chase camera. */
  flyMode = false;
  frames = 0;

  private readonly fly: FlyCamera;
  private readonly hud: DebugHud;
  readonly gameHud: GameHud;
  private readonly enemyHud: EnemyHud;
  private readonly bossHud: BossHud;
  /** Set when the final boss falls (the ending card). */
  finale = false;
  private elapsed = 0;
  private accumulator = 0;
  private last = 0;
  private fps = 60;
  private readonly frozenTime: number | undefined;
  private readonly renderEnabled: boolean;
  private readonly focus = new THREE.Vector3();
  private saveTimer = -1;
  private bookRevision = -1;
  private wasAlive = true;
  private resetting = false;
  private finaleTimer = -1;
  private endingShown = false;
  private titleTime = 0;
  private titleShown = false;
  private wasLocked = false;
  private markerTimer = 0;
  private shrineBearing: number | null = null;
  private readonly debugHudOverride: boolean | undefined;
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
    this.input.lockEnabled = opts.pointerLock ?? true;
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
    this.scene.add(this.pages.group, this.player.spells.group, this.player.shots.group, this.player.fx.group);
    this.spellbookUI = new SpellbookUI(this.player, this.input, gameHudEl);
    this.enemies = new EnemyDirector({
      player: this.player,
      colliders: this.level.colliders,
      combat: this.combatWorld,
      effects: this.effects,
      time: this.time,
      encounters: this.level.encounters,
      blind: (seconds, strength) => this.gameHud.blind(seconds, strength),
      models: this.models,
      creatures: this.creatures,
      isPaused: () => this.flyMode,
    });
    for (const arena of this.level.bossArenas) this.enemies.addArena(arena);
    this.enemies.onBossIntro = arena => {
      // The cinematic: freeze the player, show the name, face the boss afterwards.
      this.player.controller.frozen = true;
      this.input.clear();
      this.gameHud.announce(arena.def.boss.name.toUpperCase(), arena.def.boss.epithet);
      this.audio?.play('bossRoar');
    };
    this.enemies.onBossBegin = arena => {
      this.player.controller.frozen = this.flyMode;
      const b = arena.boss!;
      const p = this.player.controller.position;
      this.player.camera.setYaw(Math.atan2(-(b.position.x - p.x), -(b.position.z - p.z)), 0.08);
    };
    this.enemies.onBossDefeated = arena => {
      const boss = arena.def.boss;
      this.progress.fellBoss(boss.id);
      const rem = REMEMBRANCES.find(r => r.boss === boss.id);
      if (rem) this.progress.remember(rem.id);
      this.audio?.play('bossDefeat');
      this.player.combat.restore();
      this.gameHud.announce(boss.id === 'sovereign' ? 'THE LONG NIGHT ENDS' : 'GREAT FOE FELLED', boss.id === 'sovereign' ? 'The moon is free. Thank you for playing.' : `${boss.name}, ${boss.epithet}`);
      if (boss.id === 'sovereign') this.finale = true;
    };
    this.enemies.onAnnounce = (title, subtitle) => this.gameHud.announce(title, subtitle);
    this.enemies.onCleared = (encounter) => this.progress.clear(encounter.def.id);
    this.level.onRegion = (title, subtitle) => this.gameHud.announce(title, subtitle);
    this.systems.push(this.enemies);
    this.scene.add(this.enemies.group);
    this.enemyHud = new EnemyHud(gameHudEl);
    this.bossHud = new BossHud(gameHudEl);
    this.worldMap = new WorldMap(this.level, this.player, this.input, this.progress, this.enemies);
    this.interactions = new Interactions(this.pages, this.level.story, this.level.hub.wanderer, id => this.progress.lore.has(id));
    this.interactions.onRest = shrine => this.restAt(shrine);
    this.interactions.onRead = spot => this.readLore(spot);
    this.interactions.onTalk = () => this.talkToWanderer();
    this.storyUI = new StoryUI(this.input, this.progress, () => this.player.active && this.player.combat.alive);
    this.storyUI.shrines = () => this.level.story.shrines;
    this.storyUI.summary = () => this.journeySummary();
    this.storyUI.onTravel = shrine => this.travelTo(shrine);
    this.storyUI.onReset = () => this.beginAnew();
    this.combatWorld.onHit = (target, hit, result) => {
      if (target === this.player.combat && result.hit) this.gameHud.onPlayerDamaged(result.damage ?? hit.damage);
      this.enemies.onHit(target, hit, result);
      this.sound?.onHit(target, hit, result);
    };

    this.fly = new FlyCamera(this.camera, this.input, (x, z) => this.level.heightAt(x, z));
    const pose = opts.camera ?? this.level.spawn;
    this.fly.setPose(pose.position, pose.lookAt);
    if (opts.camera) {
      // A fixed viewpoint was requested (screenshots): park the player and fly.
      this.fly.walk = false;
      this.setFlyMode(true);
    }
    // Resume a saved journey (before any explicit test placement below).
    this.save = new SaveGame(opts.save ?? true);
    const saved = opts.fresh ? null : this.save.load();
    if (saved) this.applySave(saved, !opts.camera && !opts.playerAt);
    // The Threshold's fire has always been lit.
    this.progress.kindle('threshold');
    this.progress.onChange(() => this.requestSave());
    this.bookRevision = this.player.spells.book.revision;
    window.addEventListener('pagehide', () => this.saveNow());

    // Job 10: settings, audio, menus.
    this.debugHudOverride = opts.debugHud;
    this.settings = new Settings(opts.save ?? true);
    this.audio = new AudioEngine(opts.audio ?? true);
    this.sound = new SoundDirector(this, this.audio);
    this.gameHud.onAnnounce = () => this.audio.play('announce');
    this.menu = new MenuUI({
      input: this.input,
      settings: this.settings,
      applySettings: () => this.applySettings(),
      resumed: () => this.resumed,
      continueLabel: () => `${this.level.story.shrine(this.restShrine)?.name ?? 'The Threshold'} · ${this.formatTime(this.playTime)}`,
      begin: () => this.audio.start(),
      newJourney: () => this.beginAnew(),
      toTitle: () => { this.saveNow(); this.resetting = true; location.reload(); },
      openJournal: () => this.storyUI.openJournal(),
      openMap: () => this.worldMap.open(),
      endingStats: () => this.endingStats(),
      sound: name => this.audio.play(name),
    });
    this.applySettings();
    document.addEventListener('pointerlockchange', () => {
      if (this.input.locked) { this.wasLocked = true; return; }
      // Esc released the mouse during play: pause (menus release it themselves).
      if (this.wasLocked && !this.menuOpen && !document.querySelector('dialog[open]')) this.menu.open('pause');
      this.wasLocked = false;
    });
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape' || this.menuOpen || this.input.locked || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      this.menu.open('pause');
    }, true);
    if (opts.title) this.menu.open('title');
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
      this.creatures.preload().then(() => this.assetErrors.push(...this.creatures.errors))
        .catch(error => { this.assetErrors.push(`creatures: ${error}`); }),
      this.models.preload([...FOE_WEAPONS, ...BOSS_PROPS]),
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
    if (!this.flyMode) this.playTime += dt;
    this.updateAutosave(realDt);
    this.updateFinale(realDt);

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
    this.updateCinematic();
    this.updateTitleCamera(realDt);
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
    this.bossHud.update(realDt, this.flyMode ? null : this.enemies.activeBoss, !!this.enemies.intro);
    this.gameHud.setHint(this.flyMode ? '' : this.level.gateHint ?? '');
    this.spellbookUI.update(realDt, this.flyMode || this.menuOpen ? '' : this.interactions.prompt());
    this.updateCompass(realDt);
    this.sound.frame();

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

  /**
   * Boss intro camera: a slow orbit that closes in on the boss, then hands control
   * back facing it. Runs after the player camera, so it simply overrides the frame.
   */
  private updateCinematic(): void {
    const arena = this.enemies.intro;
    if (!arena?.boss) return;
    const b = arena.boss;
    const k = Math.min(1, arena.introTime / INTRO_SECONDS);
    const p = this.player.controller.position;
    const start = Math.atan2(p.x - b.position.x, p.z - b.position.z);
    const angle = start + 0.9 * (1 - k) - 0.35;
    const dist = THREE.MathUtils.lerp(b.bodyHeight * 4 + 14, b.bodyHeight * 2 + 8, k * k);
    const height = THREE.MathUtils.lerp(b.bodyHeight * 1.6, b.bodyHeight * 0.7, k);
    this.camera.position.set(b.position.x + Math.sin(angle) * dist, b.position.y + height, b.position.z + Math.cos(angle) * dist);
    this.camera.lookAt(b.position.x, b.position.y + b.bodyHeight * 0.6, b.position.z);
    this.camera.updateMatrixWorld();
    this.player.view.scene.visible = false;
  }

  /** A pausing menu (spellbook, quick-wheel or world map) is open. */
  get menuOpen(): boolean {
    return this.spellbookUI.paused || this.worldMap.paused || this.storyUI.paused || this.menu.paused;
  }

  /** One 60 Hz simulation step: player, enemies, constructs and pickups. */
  private fixedStep(): void {
    const playerPos = this.player.controller.position;
    for (const s of this.systems) s.fixedUpdate?.(FIXED_DT);
    for (const e of this.level.enemies) e.update(FIXED_DT, playerPos, this.combatWorld, this.effects);
    const alive = this.player.combat.alive;
    this.pages.update(FIXED_DT, playerPos, alive && !this.flyMode);
    this.interactions.update(playerPos, alive && !this.flyMode && this.player.active);
    if (this.input.takePressed('KeyF') && !this.flyMode) this.interactions.interact();
    if (this.wasAlive && !alive) { this.deaths++; this.requestSave(); }
    this.wasAlive = alive;
    this.sound.fixedStep();
  }

  // --- settings, menus and presentation (Job 10) -----------------------------------

  /** Pushes the current settings into the renderer, camera, audio, HUD and keymap. */
  applySettings(): void {
    const s = this.settings.data;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience });
    const px = this.pixel;
    const smart = px.mode.id.startsWith('smart');
    if (smart && px.mode.bands.length !== s.bands) px.setMode(smartMode(s.bands));
    if (px.settings.baseLines !== s.pixelLines) { px.settings.baseLines = s.pixelLines; px.resize(); }
    px.settings.bloom = s.bloom;
    px.settings.outline = s.outline ? 1 : 0;
    const cam = this.player.camera;
    cam.sensitivity = 0.0022 * s.sensitivity;
    cam.invertY = s.invertY;
    cam.baseFov = s.fov;
    cam.motionScale = s.motion ? 1 : 0;
    this.gameHud.setOptions({ hints: s.hints, compass: s.compass, slideKey: keyName(s.keys.slide), jumpKey: keyName(s.keys.jump), dashKey: keyName(s.keys.dash) });
    const debug = this.debugHudOverride ?? s.debugHud;
    if (this.hud.visible !== debug) this.hud.toggle();
    setKeyBindings(s.keys, Object.fromEntries(ACTIONS.map(a => [a.id, a.key])));
  }

  formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60;
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  private endingStats(): [string, string][] {
    const p = this.progress;
    return [
      ['JOURNEY', this.formatTime(this.playTime)],
      ['DEATHS', String(this.deaths)],
      ['SHRINES KINDLED', `${this.level.story.shrines.filter(s => s.prop.kindled).length} / ${this.level.story.shrines.length}`],
      ['FRAGMENTS READ', `${p.lore.size} / ${Object.keys(LORE).length + Object.keys(MEMORIALS).length}`],
      ['PAGES', `${this.player.spells.book.count} / ${SPELL_PAGES.length}`],
      ['GREAT FOES', `${p.bosses.size} / 3`],
    ];
  }

  /** The ending card appears a few seconds after the final boss falls. */
  private updateFinale(dt: number): void {
    if (!this.finale || this.endingShown) return;
    if (this.finaleTimer < 0) this.finaleTimer = 7;
    if (this.menuOpen) return;
    this.finaleTimer -= dt;
    if (this.finaleTimer <= 0) { this.endingShown = true; this.menu.open('ending'); }
  }

  /** Behind the title screen the camera drifts slowly over the Threshold. */
  private updateTitleCamera(dt: number): void {
    const title = this.menu.screen === 'title';
    if (title !== this.titleShown) {
      this.titleShown = title;
      this.gameHud.setVisible(!title && !this.flyMode);
    }
    if (!title || this.flyMode) return;
    this.titleTime += dt;
    const t = this.titleTime;
    // Over the plaza toward the castle and the moon, drifting slowly.
    const yaw = 0.3 + Math.sin(t * 0.06) * 0.22;
    this.camera.position.set(15 + Math.sin(t * 0.05) * 2.5, 7.5 + Math.sin(t * 0.08) * 0.6, 26);
    this.camera.rotation.set(0.1, yaw, 0, 'YXZ');
    this.camera.fov = 62;
    this.camera.updateMatrixWorld();
    this.player.view.scene.visible = false;
  }

  /** Heading, region name and a marker for the nearest unlit shrine. */
  private updateCompass(dt: number): void {
    const p = this.player.controller.position;
    this.markerTimer -= dt;
    if (this.markerTimer <= 0) {
      this.markerTimer = 0.5;
      let best = 700, bearing: number | null = null;
      for (const s of this.level.story.shrines) {
        if (s.prop.kindled) continue;
        const d = Math.hypot(s.position.x - p.x, s.position.z - p.z);
        if (d < best) { best = d; bearing = Math.atan2(s.position.x - p.x, -(s.position.z - p.z)); }
      }
      this.shrineBearing = bearing;
    }
    const site = this.level.siteAt(p.x, p.z);
    this.gameHud.setHeading(this.player.camera.yaw, site ? site.biome.name : 'The Threshold', this.shrineBearing);
  }

  // --- story, shrines and saving (Job 9) -------------------------------------------

  /** Why resting is refused right now ('' when the ember answers). */
  restBlocker(): string {
    if (this.enemies.activeBoss) return 'Not while a great foe is near.';
    if (this.enemies.encounters.some(e => e.state === 'active')) return 'Not while enemies are near.';
    return '';
  }

  /** Kindles (first visit) and rests at a shrine: heal, set the respawn point, save. */
  restAt(shrine: Shrine): boolean {
    const blocked = this.restBlocker();
    if (blocked) { this.gameHud.announce('THE EMBER WILL NOT ANSWER', blocked); return false; }
    this.audio.play(shrine.prop.kindled ? 'rest' : 'kindle');
    if (!shrine.prop.kindled) {
      shrine.prop.setKindled(true);
      this.effects.sparkBurst(shrine.position.clone().setY(shrine.position.y + 1), new THREE.Vector3(0, 1, 0), 0xff8a3a, 24, 6);
    }
    this.progress.kindle(shrine.id);
    this.player.combat.restore();
    this.player.spells.reset();
    this.player.setRespawn(shrine.rest, shrine.facing);
    this.restShrine = shrine.id;
    this.enemies.resetActive();
    this.saveNow();
    this.storyUI.rest(shrine);
    return true;
  }

  /** Fast travel to a kindled shrine. */
  travelTo(shrine: Shrine): void {
    if (!shrine.prop.kindled) return;
    const r = shrine.rest;
    this.player.controller.teleport(r.x, r.y + 0.2, r.z, shrine.facing);
    this.player.camera.setYaw(shrine.facing, -0.1);
    this.player.setRespawn(r, shrine.facing);
    this.restShrine = shrine.id;
    this.enemies.resetActive();
    this.level.setViewer(r, true);
    this.audio.play('travel');
    this.gameHud.announce(shrine.name.toUpperCase(), shrine.chapter ? `Chapter ${roman(shrine.chapter)}` : 'The last fire');
    this.saveNow();
  }

  readLore(spot: LoreSpot): void {
    this.audio.play('lore');
    this.progress.readLore(spot.id);
    const f = spot.fragment;
    const where = f.chapter ? `CHAPTER ${roman(f.chapter)} · ${this.level.atlas.chapters[f.chapter - 1]?.name.toUpperCase() ?? ''}` : 'THE THRESHOLD';
    this.storyUI.read({ kicker: spot.kind === 'memorial' ? `${where} · THE KNEELING DEAD` : where, title: f.title, text: f.text });
  }

  /** The Wanderer's line for the current state of the journey. */
  wandererLine(): string {
    const state = {
      bosses: this.progress.bosses, gates: this.progress.gates.size, kindled: this.progress.kindled.size,
      pages: this.player.spells.book.count, cleared: this.progress.cleared.size, finale: this.finale || this.progress.bosses.has('sovereign'),
    };
    return WANDERER_LINES.find(l => l.when(state))!.text;
  }

  talkToWanderer(): void {
    this.audio.play('lore');
    this.storyUI.read({ kicker: 'THE THRESHOLD', title: 'The Wanderer', text: this.wandererLine(), speaker: 'the Wanderer' });
  }

  private journeySummary(): string {
    const p = this.progress;
    const hours = Math.floor(this.playTime / 3600), minutes = Math.floor(this.playTime / 60) % 60;
    return [
      `Journey ${hours ? `${hours} h ` : ''}${minutes} min · ${this.deaths} death${this.deaths === 1 ? '' : 's'}`,
      `${this.player.spells.book.count} / ${SPELL_PAGES.length} pages · ${p.gates.size} / 7 gates open`,
      `${p.bosses.size} / 3 great foes felled · ${p.lore.size} fragments read`,
    ].join('\n');
  }

  /** Everything that goes into the save. */
  snapshot(): Omit<SaveData, 'version' | 'savedAt'> {
    const book = this.player.spells.book;
    return { progress: this.progress.toJSON(), pages: book.ids, selected: book.selected, shrine: this.restShrine, playTime: this.playTime, deaths: this.deaths };
  }

  saveNow(): boolean {
    this.saveTimer = -1;
    if (this.resetting) return false;
    const ok = this.save.save(this.snapshot());
    if (ok) this.gameHud.flashSaved();
    return ok;
  }

  /** Debounced autosave (progress changes, new pages, deaths). */
  requestSave(delay = 1.5): void {
    this.saveTimer = this.saveTimer < 0 ? delay : Math.min(this.saveTimer, delay);
  }

  private updateAutosave(dt: number): void {
    const revision = this.player.spells.book.revision;
    if (revision !== this.bookRevision) { this.bookRevision = revision; this.requestSave(); }
    if (this.saveTimer < 0) return;
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) this.saveNow();
  }

  private applySave(data: SaveData, placePlayer: boolean): void {
    this.progress.load(data.progress);
    this.enemies.restore(this.progress.cleared, this.progress.bosses);
    this.level.gates.sync();
    this.player.spells.restore(data.pages, data.selected);
    for (const shrine of this.level.story.shrines) if (this.progress.kindled.has(shrine.id)) shrine.prop.setKindled(true);
    this.playTime = data.playTime;
    this.deaths = data.deaths;
    const shrine = this.level.story.shrine(data.shrine) ?? this.level.story.shrine('threshold')!;
    this.restShrine = shrine.id;
    this.player.setRespawn(shrine.rest, shrine.facing);
    if (placePlayer) this.player.respawn();
    this.resumed = true;
  }

  /** Forget the journey and start again. */
  beginAnew(): void {
    this.resetting = true;
    this.save.clear();
    location.reload();
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
    if (inp.pressed('KeyH')) { this.hud.toggle(); this.settings.data.debugHud = this.hud.visible; this.settings.save(); }
    if (inp.pressed('KeyV')) this.setFlyMode(!this.flyMode);
    if (inp.pressed('KeyK') && !this.flyMode) this.player.respawn();
    DEBUG_PRESETS.forEach((p, i) => {
      if (inp.pressed(`Digit${i + 1}`)) this.atmosphere.setPreset(p.id, 2);
    });
    // 0 hands the sky back to the biomes after a debug preset.
    if (inp.pressed('Digit0')) this.atmosphere.biomeDriven = true;
  }
}
