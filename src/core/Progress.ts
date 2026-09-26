/**
 * What the player has achieved in the world: regions discovered, encounters cleared,
 * chapter gates opened, bosses felled. Plain data with change notifications so the map,
 * gates and (Job 9) the save system share one source of truth.
 */
export interface ProgressData {
  discovered: string[];
  cleared: string[];
  gates: string[];
  bosses: string[];
}

export class Progress {
  readonly discovered = new Set<string>();
  readonly cleared = new Set<string>();
  readonly gates = new Set<string>();
  readonly bosses = new Set<string>();
  /** Bumped on every change (cheap dirty check for UIs). */
  revision = 0;
  private readonly listeners: (() => void)[] = [];

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private changed(): void {
    this.revision++;
    for (const fn of this.listeners) fn();
  }

  private add(set: Set<string>, id: string): boolean {
    if (set.has(id)) return false;
    set.add(id);
    this.changed();
    return true;
  }

  discover(id: string): boolean { return this.add(this.discovered, id); }
  clear(id: string): boolean { return this.add(this.cleared, id); }
  openGate(id: string): boolean { return this.add(this.gates, id); }
  fellBoss(id: string): boolean { return this.add(this.bosses, id); }

  toJSON(): ProgressData {
    return { discovered: [...this.discovered], cleared: [...this.cleared], gates: [...this.gates], bosses: [...this.bosses] };
  }

  load(data: Partial<ProgressData>): void {
    this.discovered.clear(); this.cleared.clear(); this.gates.clear(); this.bosses.clear();
    for (const id of data.discovered ?? []) this.discovered.add(id);
    for (const id of data.cleared ?? []) this.cleared.add(id);
    for (const id of data.gates ?? []) this.gates.add(id);
    for (const id of data.bosses ?? []) this.bosses.add(id);
    this.changed();
  }
}
