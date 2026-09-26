import type { Enemy } from '../enemies/Enemy';
import { CreatureEnemy } from '../enemies/CreatureEnemy';

/**
 * Target frame for the enemy being fought: name, Vigour and the poise meter, plus text cues for states that colour alone would hide.
 */
export class EnemyHud {
  private readonly root = document.createElement('div');
  private readonly name = document.createElement('div');
  private readonly fill = document.createElement('i');
  private readonly ghost = document.createElement('b');
  private readonly poise = document.createElement('div');
  private readonly poiseFill = document.createElement('i');
  private readonly cue = document.createElement('div');
  private shown: Enemy | null = null;
  private ghostValue = 1;

  constructor(container: HTMLElement) {
    this.root.className = 'enemy-frame';
    this.root.setAttribute('aria-live', 'off');
    this.name.className = 'enemy-name';
    const bar = document.createElement('div');
    bar.className = 'enemy-bar';
    bar.append(this.ghost, this.fill);
    this.poise.className = 'enemy-poise';
    this.poise.append(this.poiseFill);
    this.cue.className = 'enemy-cue';
    this.root.append(this.name, bar, this.poise, this.cue);
    container.append(this.root);
  }

  update(dt: number, enemy: Enemy | null): void {
    this.root.classList.toggle('shown', !!enemy);
    if (!enemy) { this.shown = null; return; }
    if (enemy !== this.shown) {
      this.shown = enemy;
      this.name.textContent = enemy.displayName.toUpperCase();
      this.ghostValue = enemy.health / enemy.maxHealth;
    }
    const f = Math.max(0, enemy.health / enemy.maxHealth);
    this.ghostValue = this.ghostValue > f ? Math.max(f, this.ghostValue - dt * 0.6) : f;
    this.fill.style.transform = `scaleX(${f})`;
    this.ghost.style.transform = `scaleX(${this.ghostValue})`;
    const knight = enemy instanceof CreatureEnemy ? enemy : null;
    this.poise.style.display = knight ? '' : 'none';
    if (knight) this.poiseFill.style.transform = `scaleX(${Math.max(0, knight.poise / knight.spec.poise)})`;
    let cue = '';
    if (knight?.exposed) cue = 'EXPOSED · strike now';
    else if (knight?.guarding) cue = 'GUARDING · heavy, spells or flank';
    else if (enemy.state === 'staggered') cue = 'STAGGERED';
    else if (enemy.state === 'cast' || enemy.state === 'windup') cue = 'ATTACKING';
    this.cue.textContent = cue;
    this.root.classList.toggle('exposed', !!knight?.exposed);
  }
}
