import type { PlayerCombat } from '../player/PlayerCombat';
import type { PlayerController } from '../player/PlayerController';

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
      <div class="banner"></div>
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
    this.banner = container.querySelector('.banner')!;
    this.velocity = container.querySelector('.velocity')!;
    this.movementHint = container.querySelector('.movement-hint')!;
    this.speedFill = container.querySelector('.speed-track i')!;
    const pipHolder = container.querySelector('.pips')!;
    for (let i = 0; i < 3; i++) {
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
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  update(dt: number, combat: PlayerCombat, controller: PlayerController): void {
    const health = combat.health / 100;
    // The "ghost" bar drains behind the real one so damage spikes are legible.
    this.ghost = this.ghost > health ? Math.max(health, this.ghost - dt * 0.5) : health;
    this.healthFill.style.width = `${health * 100}%`;
    this.healthGhost.style.width = `${this.ghost * 100}%`;

    const m = combat.momentum;
    this.momentumFill.style.width = `${m.fraction * 100}%`;
    this.root.classList.toggle('resonance', m.resonance);
    this.momentumLabel.textContent = m.resonance ? 'RESONANCE' : `MOMENTUM ${Math.round(m.value)}`;

    for (let i = 0; i < this.pips.length; i++) {
      this.pips[i].classList.toggle('spent', i >= controller.dashCharges);
    }

    this.blindTime = Math.max(0, this.blindTime - dt);
    const b = this.blinded;
    this.blindEl.style.opacity = String(Math.min(1, b * 1.15));
    this.announceTime = Math.max(0, this.announceTime - dt);
    this.announceEl.classList.toggle('shown', this.announceTime > 0.4);

    this.flashAmount = Math.max(0, this.flashAmount - dt * 2.2);
    this.flash.style.opacity = String(this.flashAmount * 0.7);

    const dead = !combat.alive;
    this.banner.textContent = dead ? 'THE EMBER FADES' : '';
    this.banner.classList.toggle('shown', dead);
    this.velocity.textContent = String(Math.round(controller.speed));
    this.speedFill.style.transform = `scaleX(${Math.min(1, controller.speed / 42)})`;
    this.root.classList.toggle('at-speed', controller.speed > 18);
    this.root.classList.toggle('is-guarding', combat.guarding);
    this.movementHint.textContent = dead ? '' : controller.wallRunning ? `WALL RUN ${controller.wallRunRemaining.toFixed(1)}s · SPACE kick` :
      controller.slamming ? 'SLAM · SPACE at impact to rebound' : controller.techniqueTime > 0 ? controller.lastTechnique :
      'Ctrl slide → Space launch · C in air: slam';
  }
}
