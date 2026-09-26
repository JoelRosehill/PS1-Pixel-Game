import type { PlayerCombat } from '../player/PlayerCombat';
import { PLAYER_TUNING, type PlayerController } from '../player/PlayerController';

/**
 * In-game HUD: health, the Momentum Pool (Pillar 2) and dash charges, drawn as chunky
 * DOM bars so they match the pixel palette without costing a draw call.
 */
export class GameHud {
  private readonly root: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly healthGhost: HTMLElement;
  private readonly momentumFill: HTMLElement;
  private readonly momentumLabel: HTMLElement;
  private readonly pips: HTMLElement[] = [];
  private readonly flash: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly velocity: HTMLElement;
  private readonly movementHint: HTMLElement;
  private readonly speedFill: HTMLElement;

  private ghost = 1;
  private flashAmount = 0;
  private blindTime = 0;
  private blindDuration = 1;
  private blindStrength = 0;
  private announceTime = 0;
  private readonly blindEl: HTMLElement;
  private readonly announceEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly compassStrip: HTMLElement;
  private readonly compassRegion: HTMLElement;
  private readonly compassMarker: HTMLElement;
  private readonly saved: HTMLElement;
  private savedTime = 0;
  private showHints = true;
  /** Last value written per element and property: the DOM is only touched on change. */
  private readonly written = new Map<HTMLElement, Record<string, string>>();
  private keys = { slide: 'Ctrl', jump: 'Space', dash: 'Shift' };
  /** Called with every title card (audio stinger). */
  onAnnounce: (title: string) => void = () => {};

  constructor(container: HTMLElement) {
    container.innerHTML = `
      <div class="bars">
        <div class="bar health"><div class="ghost"></div><div class="fill"></div><div class="label">VIGOUR</div></div>
        <div class="bar momentum"><div class="fill"></div><div class="label">MOMENTUM</div></div>
        <div class="pips"></div>
      </div>
      <div class="hit-flash"></div>
      <div class="blind-flash"></div>
      <div class="announce"><strong></strong><span></span></div>
      <div class="world-hint" role="status" aria-live="polite" hidden></div>
      <div class="banner"></div>
      <div class="compass" aria-hidden="true"><div class="compass-window"><div class="compass-strip"></div><i class="compass-marker">✦</i></div><span class="compass-region"></span></div>
      <div class="save-indicator" role="status" aria-live="polite"><i></i>Journey saved</div>
      <div class="aim-reticle" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="kinetic-hud"><div><strong class="velocity">0</strong><span>m/s</span></div><div class="speed-track"><i></i></div><p class="movement-hint"></p></div>`;
    this.root = container;
    this.healthFill = container.querySelector('.health .fill')!;
    this.healthGhost = container.querySelector('.health .ghost')!;
    this.momentumFill = container.querySelector('.momentum .fill')!;
    this.momentumLabel = container.querySelector('.momentum .label')!;
    this.flash = container.querySelector('.hit-flash')!;
    this.blindEl = container.querySelector('.blind-flash')!;
    this.announceEl = container.querySelector('.announce')!;
    this.hintEl = container.querySelector('.world-hint')!;
    this.banner = container.querySelector('.banner')!;
    this.velocity = container.querySelector('.velocity')!;
    this.movementHint = container.querySelector('.movement-hint')!;
    this.speedFill = container.querySelector('.speed-track i')!;
    this.compass = container.querySelector('.compass')!;
    this.compassStrip = container.querySelector('.compass-strip')!;
    this.compassRegion = container.querySelector('.compass-region')!;
    this.compassMarker = container.querySelector('.compass-marker')!;
    this.saved = container.querySelector('.save-indicator')!;
    // Three turns of 15° ticks so the strip can scroll either way without a seam.
    const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let ticks = '';
    for (let turn = 0; turn < 3; turn++)
      for (let deg = 0; deg < 360; deg += 15) ticks += `<span class="${names[deg] ? (deg % 90 ? 'mid' : 'card') : ''}">${names[deg] ?? '·'}</span>`;
    this.compassStrip.innerHTML = ticks;
    const pipHolder = container.querySelector('.pips')!;
    for (let i = 0; i < PLAYER_TUNING.dashCharges; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      pipHolder.appendChild(pip);
      this.pips.push(pip);
    }
  }

  /** Call when the player takes damage, for the screen-edge flash. */
  onPlayerDamaged(amount: number): void {
    this.flashAmount = Math.min(1, this.flashAmount + amount / 45);
  }

  /** Sunkeeper flash: white-out that fades over `seconds`. */
  blind(seconds: number, strength: number): void {
    if (strength * seconds < this.blindStrength * this.blindTime) return;
    this.blindTime = this.blindDuration = seconds;
    this.blindStrength = strength;
  }

  get blinded(): number {
    return this.blindTime > 0 ? this.blindStrength * (this.blindTime / this.blindDuration) : 0;
  }

  /** Title card in the upper third (encounters, discoveries). */
  announce(title: string, subtitle = ''): void {
    this.announceEl.querySelector('strong')!.textContent = title;
    this.announceEl.querySelector('span')!.textContent = subtitle;
    this.announceTime = 3.2;
    this.onAnnounce(title);
  }

  /** Brief "Journey saved" ember in the corner. */
  flashSaved(): void {
    this.savedTime = 1.8;
  }

  setOptions(o: { hints: boolean; compass: boolean; slideKey?: string; jumpKey?: string; dashKey?: string }): void {
    this.showHints = o.hints;
    this.compass.hidden = !o.compass;
    this.keys = { slide: o.slideKey ?? 'Ctrl', jump: o.jumpKey ?? 'Space', dash: o.dashKey ?? 'Shift' };
  }

  private css(el: HTMLElement, prop: 'width' | 'opacity' | 'transform', value: string): void {
    const cache = this.written.get(el) ?? {};
    if (cache[prop] === value) return;
    cache[prop] = value;
    this.written.set(el, cache);
    el.style[prop] = value;
  }

  private text(el: HTMLElement, value: string): void {
    const cache = this.written.get(el) ?? {};
    if (cache.text === value) return;
    cache.text = value;
    this.written.set(el, cache);
    el.textContent = value;
  }

  /**
   * Compass: `yaw` is the camera yaw (0 = facing north, −z); `marker` is a world bearing
   * in radians for the nearest unlit shrine (null hides it).
   */
  setHeading(yaw: number, region: string, marker: number | null): void {
    const deg = (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
    const px = 22 / 15; // px per degree
    this.css(this.compassStrip, 'transform', `translateX(${(-(deg + 360) * px + 130 - 11).toFixed(1)}px)`);
    if (this.compassRegion.textContent !== region) this.compassRegion.textContent = region;
    if (marker === null) { this.compassMarker.hidden = true; return; }
    const m = ((marker * 180) / Math.PI - deg + 540) % 360 - 180;
    this.compassMarker.hidden = Math.abs(m) > 88;
    this.css(this.compassMarker, 'transform', `translateX(${(m * px).toFixed(1)}px)`);
  }

  /** A persistent prompt near the bottom (e.g. why a gate is closed). */
  setHint(text: string): void {
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.hidden = !text;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  update(dt: number, combat: PlayerCombat, controller: PlayerController): void {
    const health = combat.health / 100;
    // The "ghost" bar drains behind the real one so damage spikes are legible.
    this.ghost = this.ghost > health ? Math.max(health, this.ghost - dt * 0.5) : health;
    this.css(this.healthFill, 'width', `${(health * 100).toFixed(1)}%`);
    this.css(this.healthGhost, 'width', `${(this.ghost * 100).toFixed(1)}%`);

    const m = combat.momentum;
    this.css(this.momentumFill, 'width', `${(m.fraction * 100).toFixed(1)}%`);
    this.root.classList.toggle('resonance', m.resonance);
    const channelling = m.channelTime > 0;
    this.text(this.momentumLabel, channelling ? `CHANNELLING ${Math.round(m.value)}` : m.resonance ? 'RESONANCE' : `MOMENTUM ${Math.round(m.value)}`);
    this.root.classList.toggle('channelling', channelling);

    for (let i = 0; i < this.pips.length; i++) {
      this.pips[i].classList.toggle('spent', i >= controller.dashCharges);
    }

    this.blindTime = Math.max(0, this.blindTime - dt);
    const b = this.blinded;
    this.css(this.blindEl, 'opacity', Math.min(1, b * 1.15).toFixed(3));
    this.announceTime = Math.max(0, this.announceTime - dt);
    this.announceEl.classList.toggle('shown', this.announceTime > 0.4);

    this.flashAmount = Math.max(0, this.flashAmount - dt * 2.2);
    this.css(this.flash, 'opacity', (this.flashAmount * 0.7).toFixed(3));

    this.savedTime = Math.max(0, this.savedTime - dt);
    this.saved.classList.toggle('shown', this.savedTime > 0);

    const dead = !combat.alive;
    this.text(this.banner, dead ? 'THE EMBER FADES' : '');
    this.banner.classList.toggle('shown', dead);
    this.text(this.velocity, String(Math.round(controller.speed)));
    this.css(this.speedFill, 'transform', `scaleX(${Math.min(1, controller.speed / 42).toFixed(3)})`);
    this.root.classList.toggle('at-speed', controller.speed > 18);
    this.root.classList.toggle('is-guarding', combat.guarding);
    const k = this.keys;
    this.text(this.movementHint, dead || !this.showHints ? '' : controller.wallRunning ? `WALL RUN ${controller.wallRunRemaining.toFixed(1)}s · ${k.jump.toUpperCase()} kick` :
      controller.slamming ? `SLAM · ${k.jump.toUpperCase()} at impact to rebound` : controller.techniqueTime > 0 ? controller.lastTechnique :
      m.value < 30 && !channelling ? `Low Momentum · stand still and hold ${k.dash} to channel` :
      `${k.dash} dash · hold ${k.dash} standing still to channel · ${k.slide} slide`);
  }
}
