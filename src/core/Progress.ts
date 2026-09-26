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
  kindled: string[];
  lore: string[];
  remembrances: string[];
}

export class Progress {
  readonly discovered = new Set<string>();
  readonly cleared = new Set<string>();
  readonly gates = new Set<string>();
  readonly bosses = new Set<string>();
  /** Ember Shrines the player has lit (fast-travel destinations). */
  readonly kindled = new Set<string>();
  /** Lore fragments read (Job 9). */
  readonly lore = new Set<string>();
  /** Boss remembrances received. */
  readonly remembrances = new Set<string>();
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
  kindle(id: string): boolean { return this.add(this.kindled, id); }
  readLore(id: string): boolean { return this.add(this.lore, id); }
  remember(id: string): boolean { return this.add(this.remembrances, id); }

  toJSON(): ProgressData {
    return {
      discovered: [...this.discovered], cleared: [...this.cleared], gates: [...this.gates], bosses: [...this.bosses],
      kindled: [...this.kindled], lore: [...this.lore], remembrances: [...this.remembrances],
    };
  }

  load(data: Partial<ProgressData>): void {
    const pairs: [Set<string>, string[] | undefined][] = [
      [this.discovered, data.discovered], [this.cleared, data.cleared], [this.gates, data.gates], [this.bosses, data.bosses],
      [this.kindled, data.kindled], [this.lore, data.lore], [this.remembrances, data.remembrances],
    ];
    for (const [set, list] of pairs) {
      set.clear();
      for (const id of list ?? []) if (typeof id === 'string') set.add(id);
    }
    this.changed();
  }
}
