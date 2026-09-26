import type { Boss } from '../enemies/bosses/Boss';

/**
 * The great boss bar (Job 8): name and epithet, a long Vigour bar with a draining ghost,
 * notches where the phases turn, a thin posture meter, and a letterbox for the intro.
 */
export class BossHud {
  private readonly root = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly fill = document.createElement('i');
  private readonly ghost = document.createElement('b');
  private readonly notches = document.createElement('div');
  private readonly posture = document.createElement('div');
  private readonly postureFill = document.createElement('i');
  private readonly cue = document.createElement('div');
  private readonly letterbox = document.createElement('div');
  private shown: Boss | null = null;
  private ghostValue = 1;

  constructor(container: HTMLElement) {
    this.root.className = 'boss-hud';
    this.title.className = 'boss-title';
    const bar = document.createElement('div');
    bar.className = 'boss-bar';
    this.notches.className = 'boss-notches';
    bar.append(this.ghost, this.fill, this.notches);
    this.posture.className = 'boss-posture';
    this.posture.append(this.postureFill);
    this.cue.className = 'boss-cue';
    this.root.append(this.title, bar, this.posture, this.cue);
    this.letterbox.className = 'letterbox';
    this.letterbox.innerHTML = '<i></i><i></i>';
    container.append(this.root, this.letterbox);
  }

  update(dt: number, boss: Boss | null, cinematic: boolean): void {
    this.letterbox.classList.toggle('shown', cinematic);
    this.root.classList.toggle('shown', !!boss && !cinematic);
    if (!boss) { this.shown = null; return; }
    if (boss !== this.shown) {
      this.shown = boss;
      this.title.innerHTML = `<strong>${boss.def.name}</strong><span>${boss.def.epithet}</span>`;
      this.notches.innerHTML = boss.def.phases.map(p => `<em style="left:${p * 100}%"></em>`).join('');
      this.ghostValue = boss.healthFraction;
    }
    const f = Math.max(0, boss.healthFraction);
    this.ghostValue = this.ghostValue > f ? Math.max(f, this.ghostValue - dt * 0.35) : f;
    this.fill.style.transform = `scaleX(${f})`;
    this.ghost.style.transform = `scaleX(${this.ghostValue})`;
    this.postureFill.style.transform = `scaleX(${Math.max(0, boss.posture / boss.def.poise)})`;
    this.cue.textContent = boss.exposed > 0 ? 'OPEN · strike now' : boss.state === 'staggered' ? 'STAGGERED' : '';
    this.root.classList.toggle('exposed', boss.exposed > 0);
  }
}
