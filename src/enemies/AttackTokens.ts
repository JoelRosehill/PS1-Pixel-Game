/**
 * Attack tokens keep group fights readable: only a few enemies may commit to an attack
 * at once, and new attacks are spaced out, so every telegraph can be seen and answered.
 * An enemy requests a token before its windup and releases it after recovery (or when
 * it is staggered or killed).
 */
export type TokenKind = 'melee' | 'ranged';

export class AttackTokens {
  readonly limits: Record<TokenKind, number> = { melee: 2, ranged: 2 };
  /** Minimum seconds between two attack starts across all enemies. */
  minGap = 0.35;
  private readonly holders = new Map<object, TokenKind>();
  private clock = 0;
  private lastGrant = -Infinity;

  update(dt: number): void {
    this.clock += dt;
  }

  holds(owner: object): boolean {
    return this.holders.has(owner);
  }

  count(kind: TokenKind): number {
    let n = 0;
    for (const k of this.holders.values()) if (k === kind) n++;
    return n;
  }

  request(owner: object, kind: TokenKind): boolean {
    if (this.holders.has(owner)) return true;
    if (this.count(kind) >= this.limits[kind]) return false;
    if (this.clock - this.lastGrant < this.minGap) return false;
    this.holders.set(owner, kind);
    this.lastGrant = this.clock;
    return true;
  }

  release(owner: object): void {
    this.holders.delete(owner);
  }

  clear(): void {
    this.holders.clear();
  }
}
