/**
 * The Momentum Pool replaces mana (Pillar 2), remade in Job 12 after play-testing:
 * spells must always be within reach, so the pool no longer drains and is never locked
 * behind hitting something first. It fills three ways:
 *
 * - **Channelling:** hold Shift while standing still. Fast, but you are rooted and
 *   exposed — trivial alone, a gamble with enemies around (a hit breaks the channel and
 *   lands harder).
 * - **Aggression:** sword hits, parries and perfect dodges still add a little.
 * - **Rest:** shrines and respawns refill it.
 *
 * Filling it completely enters *Resonance*: spells cost half until the pool drops to
 * the exit threshold.
 */
export const MOMENTUM_GAINS = {
  swordHit: 5,
  heavyHit: 8,
  perfectDodge: 8,
  parry: 15,
  riposte: 12,
} as const;

export const CHANNEL = {
  /** Momentum per second at full channel strength. */
  rate: 42,
  /** Seconds for the channel to reach full strength after it starts. */
  rampUp: 0.35,
  /** Extra damage taken while channelling (the price of standing still). */
  exposed: 1.3,
} as const;

export class Momentum {
  readonly max = 100;
  value = this.max;
  resonance = false;
  /** Seconds the current channel has run (0 when not channelling). */
  channelTime = 0;

  /** Resonance ends when the pool falls below this. */
  private readonly resonanceExit = 35;

  add(amount: number): void {
    this.value = Math.min(this.max, this.value + amount);
    if (this.value >= this.max) this.resonance = true;
  }

  /** Cost after the Resonance discount. */
  costOf(cost: number): number {
    return this.resonance ? Math.round(cost * 0.5) : cost;
  }

  canAfford(cost: number): boolean {
    return this.value >= this.costOf(cost);
  }

  /** Spends if affordable; returns whether it went through. */
  spend(cost: number): boolean {
    const actual = this.costOf(cost);
    if (this.value < actual) return false;
    this.value -= actual;
    if (this.value < this.resonanceExit) this.resonance = false;
    return true;
  }

  /** Full pool (respawn, rest). */
  reset(): void {
    this.value = this.max;
    this.resonance = false;
    this.channelTime = 0;
  }

  /** Advances channelling; `channelling` is whether the player is holding still on Shift. */
  update(dt: number, channelling: boolean): number {
    if (!channelling) { this.channelTime = 0; return 0; }
    this.channelTime += dt;
    const strength = Math.min(1, this.channelTime / CHANNEL.rampUp);
    const before = this.value;
    this.add(CHANNEL.rate * strength * dt);
    return this.value - before;
  }

  get fraction(): number {
    return this.value / this.max;
  }
}
