/**
 * Global time scale: hit-stop on impact (the single biggest contributor to weighty
 * melee) and short slow-motion flourishes for perfect dodges and parries.
 */
export class TimeControl {
  scale = 1;
  private stopTimer = 0;
  private slowTimer = 0;
  private slowDuration = 0;
  private slowScale = 1;

  /** Near-freeze for `duration` real seconds. */
  hitStop(duration: number): void {
    this.stopTimer = Math.max(this.stopTimer, duration);
  }

  slowMotion(scale: number, duration: number): void {
    if (duration <= this.slowTimer && scale >= this.slowScale) return;
    this.slowScale = scale;
    this.slowTimer = duration;
    this.slowDuration = duration;
  }

  clear(): void {
    this.stopTimer = 0;
    this.slowTimer = 0;
    this.scale = 1;
  }

  /** Called with real (unscaled) delta; returns the scaled delta for the game. */
  update(realDt: number): number {
    if (this.stopTimer > 0) {
      this.stopTimer -= realDt;
      this.scale = 0.02;
    } else if (this.slowTimer > 0) {
      this.slowTimer -= realDt;
      // Ease back to full speed over the tail of the window.
      const k = 1 - this.slowTimer / Math.max(this.slowDuration, 1e-4);
      this.scale = this.slowScale + (1 - this.slowScale) * k * k;
    } else {
      this.scale = 1;
    }
    return realDt * this.scale;
  }
}
