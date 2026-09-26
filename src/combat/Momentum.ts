/**
 * The Momentum Pool replaces mana (Pillar 2). It fills through aggression — sword hits,
 * perfect dodges and parries — and bleeds away when the player stops fighting, so the
 * cheapest way to cast is to keep attacking.
 *
 * Filling it completely enters *Resonance*: spells cost half until the pool drops to
 * the exit threshold, which rewards a burst of aggression with a spending window.
 */
export const MOMENTUM_GAINS = {
  swordHit: 8,
  heavyHit: 12,
  perfectDodge: 15,
  parry: 25,
  riposte: 18,
} as const;

export class Momentum {
  readonly max = 100;
  value = 0;
  resonance = false;

  private idle = 0;
  /** Seconds of calm before the pool starts draining. */
  private readonly grace = 2.5;
  private readonly drain = 6;
  /** Resonance ends when the pool falls below this. */
  private readonly resonanceExit = 35;

  add(amount: number): void {
    this.value = Math.min(this.max, this.value + amount);
    this.idle = 0;
    if (this.value >= this.max) this.resonance = true;
  }

  /** Cost after the Resonance discount. */
  costOf(cost: number): number {
    return this.resonance ? cost * 0.5 : cost;
  }

  canAfford(cost: number): boolean {
    return this.value >= this.costOf(cost);
  }

  /** Spends if affordable; returns whether it went through. */
  spend(cost: number): boolean {
    const actual = this.costOf(cost);
    if (this.value < actual) return false;
    this.value -= actual;
    this.idle = 0;
    if (this.value < this.resonanceExit) this.resonance = false;
    return true;
  }

  reset(): void {
    this.value = 0;
    this.resonance = false;
    this.idle = 0;
  }

  update(dt: number): void {
    this.idle += dt;
    if (this.idle <= this.grace) return;
    this.value = Math.max(0, this.value - this.drain * dt);
    if (this.value < this.resonanceExit) this.resonance = false;
  }

  get fraction(): number {
    return this.value / this.max;
  }
}
