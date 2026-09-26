import type { Damageable, HitInfo, HitResult } from '../combat/types';
import type { Game } from '../core/Game';
import type { AudioEngine, AudioState } from './AudioEngine';
import type { Intensity } from './Music';

/**
 * Turns what happens in the game into sound (Job 10). Most cues are read from state the
 * systems already keep — movement events, attack phases, cast/kill/telegraph counters —
 * so gameplay code stays free of audio calls. Hits arrive through `CombatWorld.onHit`.
 */
export class SoundDirector {
  private phase = 'idle';
  private casts = 0;
  private alive = true;
  private pages = 0;
  private kills = 0;
  private telegraphs = 0;
  private orbs = 0;
  private hazards = 0;
  private resonance = false;
  private menu = false;
  private gates = 0;

  constructor(private readonly game: Game, private readonly audio: AudioEngine) {
    this.sync();
  }

  /** Re-reads every counter (after loading a save, so restored state is silent). */
  sync(): void {
    const g = this.game, p = g.player;
    this.phase = p.combat.phase;
    this.casts = p.spells.castCount;
    this.alive = p.combat.alive;
    this.pages = p.spells.book.count;
    this.kills = g.enemies.kills;
    this.telegraphs = g.enemies.telegraphs.shown;
    this.orbs = g.enemies.projectiles.fired;
    this.hazards = g.enemies.hazards.spawned;
    this.resonance = p.combat.momentum.resonance;
    this.gates = g.progress.gates.size;
  }

  private play(name: string, strength = 1, kind = ''): void {
    this.audio.play(name, { strength, kind });
  }

  private channelTimer = 0;
  private channelFull = true;

  /** After each fixed step. */
  fixedStep(): void {
    const g = this.game, p = g.player, c = p.controller, combat = p.combat;
    const ev = c.events;
    if (ev.rebounded) this.play('rebound');
    else if (ev.walljumped) this.play('walljump');
    else if (ev.jumped) this.play('jump');
    if (ev.dashed) this.play('dash');
    if (ev.slid) this.play('slide');
    if (ev.slammed) this.play('slam');
    else if (ev.landed) this.play('land', Math.min(1, 0.4 + c.landingSpeed / 25));
    if (ev.step) this.play('step', Math.min(1, 0.45 + c.speed / 20));
    if (combat.channelGain > 0) {
      this.channelTimer -= 1 / 60;
      if (this.channelTimer <= 0) { this.channelTimer = 0.32; this.play('channel', combat.momentum.fraction); }
      if (combat.momentum.value >= combat.momentum.max && !this.channelFull) this.play('channelFull');
    } else this.channelTimer = 0;
    this.channelFull = combat.momentum.value >= combat.momentum.max;

    if (combat.phase === 'active' && this.phase !== 'active' && combat.attack) {
      const heavy = combat.attack.kind === 'heavy' || combat.attack.arc === 'overhead' || combat.attack.kind === 'plunge';
      this.play(heavy ? 'heavy' : 'swing');
    }
    this.phase = combat.phase;

    if (p.spells.castCount !== this.casts) {
      this.casts = p.spells.castCount;
      const page = p.spells.book.current;
      this.play('cast', 1, page.id === 'frost-needle' ? 'frost' : page.effect.kind);
    }
    if (this.alive && !combat.alive) this.play('death');
    this.alive = combat.alive;
    if (p.spells.book.count > this.pages) this.play('pickup');
    this.pages = p.spells.book.count;
    if (combat.momentum.resonance && !this.resonance) this.play('resonance');
    this.resonance = combat.momentum.resonance;

    const e = g.enemies;
    if (e.kills > this.kills) this.play('enemyDeath');
    this.kills = e.kills;
    if (e.telegraphs.shown > this.telegraphs) this.play('telegraph');
    this.telegraphs = e.telegraphs.shown;
    if (e.projectiles.fired > this.orbs) this.play('enemyShot');
    this.orbs = e.projectiles.fired;
    if (e.hazards.spawned > this.hazards) this.play('shockwave');
    this.hazards = e.hazards.spawned;
    if (g.progress.gates.size > this.gates) this.play('gate');
    this.gates = g.progress.gates.size;
  }

  onHit(target: Damageable, hit: HitInfo, result: HitResult): void {
    const player = this.game.player.combat;
    if (target === player) {
      if (result.parried) this.play('parry');
      else if (result.dodged) this.play('dodge');
      else if (result.blocked) this.play('block');
      else if (result.hit) this.play('hurt', Math.min(1, (result.damage ?? hit.damage) / 25));
      return;
    }
    if (hit.source !== 'player' || !result.hit) {
      if (result.parried && hit.source === 'player') this.play('block');
      return;
    }
    this.play(result.critical ? 'crit' : 'hit', Math.min(1, 0.5 + (result.damage ?? hit.damage) / 60));
  }

  /** The score's state right now. */
  state(): AudioState {
    const g = this.game;
    const p = g.player.controller.position;
    let intensity: Intensity = 'explore';
    if (g.menu.screen === 'title') intensity = 'title';
    else if (g.finale) intensity = 'finale';
    else if (g.enemies.activeBoss || g.enemies.intro) intensity = 'boss';
    else if (g.storyUI.mode === 'rest') intensity = 'rest';
    else if (g.enemies.encounters.some(e => e.state === 'active')) intensity = 'combat';
    const site = g.level.siteAt(p.x, p.z);
    const speed = g.player.controller.speed;
    return {
      mood: g.finale ? 'finale' : site?.chapter ?? 0,
      intensity,
      menu: g.menuOpen && g.menu.screen !== 'title' && g.storyUI.mode !== 'rest',
      wind: Math.min(1, Math.max(0, (speed - 8) / 30) + Math.max(0, p.y - 60) / 200),
    };
  }

  /** Every rendered frame. */
  frame(): void {
    const open = this.game.menuOpen;
    if (open !== this.menu) this.play(open ? 'uiOpen' : 'uiClose');
    this.menu = open;
    this.audio.update(this.state());
  }
}
