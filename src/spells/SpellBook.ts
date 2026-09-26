export type SpellId = 'rune-burst' | 'ember-lance' | 'frost-needle' | 'violet-well' | 'windstep' | 'updraft' | 'ember-ward' | 'mend';
export type SpellEffect =
  | { kind: 'burst'; radius: number; damage: number; stagger: number }
  | { kind: 'projectile'; speed: number; damage: number; stagger: number; splash: number }
  | { kind: 'field'; radius: number; damage: number; duration: number }
  | { kind: 'blink'; distance: number }
  | { kind: 'launch'; speed: number }
  | { kind: 'ward'; duration: number; reduction: number }
  | { kind: 'heal'; amount: number };
export interface SpellPage {
  id: SpellId;
  name: string;
  glyph: string;
  school: string;
  color: number;
  cost: number;
  cooldown: number;
  description: string;
  lore: string;
  hint: string;
  effect: SpellEffect;
}
export const SPELL_PAGES: readonly SpellPage[] = [
  { id: 'rune-burst', name: 'Rune Burst', glyph: '✧', school: 'Rupture', color: 0xb07cff, cost: 40, cooldown: 0.7,
    description: 'Release a 4.6 m shockwave. Deals 30 damage, throws enemies back and staggers them for 1 second.',
    lore: 'The first word was not spoken. It broke the silence.', hint: 'Bound into your book from the beginning.',
    effect: { kind: 'burst', radius: 4.6, damage: 30, stagger: 1 } },
  { id: 'ember-lance', name: 'Ember Lance', glyph: '↑', school: 'Projectile', color: 0xffa45e, cost: 25, cooldown: 0.55,
    description: 'Hurl a burning lance toward the enemy ahead. Deals 24 damage in a 2 m impact burst. Stone and trees stop it.',
    lore: 'A coal carried from a home whose name you no longer remember.', hint: 'Beside the Ember Shrine in the central plaza.',
    effect: { kind: 'projectile', speed: 25, damage: 24, stagger: 0.35, splash: 2 } },
  { id: 'frost-needle', name: 'Frost Needle', glyph: '⋈', school: 'Projectile', color: 0x8be8ff, cost: 20, cooldown: 0.5,
    description: 'Fire a swift crystal needle. Deals 16 damage and interrupts its target with a 1.6 second stagger.',
    lore: 'Winter wrote with a finer hand than any scribe.', hint: 'At the southern end of the castle bridge.',
    effect: { kind: 'projectile', speed: 38, damage: 16, stagger: 1.6, splash: 0 } },
  { id: 'violet-well', name: 'Violet Well', glyph: '◎', school: 'Area', color: 0xd39aff, cost: 50, cooldown: 5,
    description: 'Place a 4 m well ahead of you for 4 seconds. Four pulses deal 9 damage each and pull enemies inward.',
    lore: 'Beneath still water, the sky continues forever.', hint: 'Among the graves beside the western chapel.',
    effect: { kind: 'field', radius: 4, damage: 9, duration: 4 } },
  { id: 'windstep', name: 'Windstep', glyph: '»', school: 'Movement', color: 0x7fffd4, cost: 25, cooldown: 1.2,
    description: 'Blink up to 7 m in the direction your camera faces. Stops safely before walls; preserves your velocity.',
    lore: 'The road remembers every footstep but this one.', hint: 'Beyond the dash gap, atop the Wayfarer’s Trial.',
    effect: { kind: 'blink', distance: 7 } },
  { id: 'updraft', name: 'Updraft', glyph: '≋', school: 'Movement', color: 0xb9ef92, cost: 30, cooldown: 1.8,
    description: 'Ride a rising gust, even in midair. Launch upward at 14 m/s and keep your horizontal momentum.',
    lore: 'A page torn free is not always a page lost.', hint: 'Near the entrance pillars of the eastern trial.',
    effect: { kind: 'launch', speed: 14 } },
  { id: 'ember-ward', name: 'Ember Ward', glyph: '◇', school: 'Buff', color: 0xffd070, cost: 35, cooldown: 8,
    description: 'Wrap yourself in embers for 8 seconds. Incoming damage is halved. Does not stack with itself.',
    lore: 'Some promises outlive the hands that made them.', hint: 'On the open ground south of the training yard.',
    effect: { kind: 'ward', duration: 8, reduction: 0.5 } },
  { id: 'mend', name: 'Mend', glyph: '+', school: 'Restoration', color: 0x9affb1, cost: 45, cooldown: 6,
    description: 'Turn earned Momentum into 28 Vigour. Cannot be cast at full health.',
    lore: 'What was broken may yet carry light.', hint: 'On the bank east of the central plaza.',
    effect: { kind: 'heal', amount: 28 } },
];

/** Session progression. Save/load belongs to Job 9; death does not remove pages. */
export class SpellBook {
  private readonly pages = new Set<SpellId>(['rune-burst']);
  selected: SpellId = 'rune-burst';
  revision = 0;
  get count(): number { return this.pages.size; }
  get tier(): number { return this.count >= 8 ? 3 : this.count >= 5 ? 2 : this.count >= 3 ? 1 : 0; }
  get tierName(): string { return ['Leather', 'Brass-bound', 'Gilded', 'Runic'][this.tier]; }
  get current(): SpellPage { return SPELL_PAGES.find(p => p.id === this.selected)!; }
  has(id: SpellId): boolean { return this.pages.has(id); }
  collect(id: SpellId): boolean {
    if (this.has(id) || !SPELL_PAGES.some(p => p.id === id)) return false;
    this.pages.add(id); this.revision++; return true;
  }
  /** Loads saved pages (unknown ids are ignored; Rune Burst is always bound). */
  restore(ids: string[], selected: string): void {
    this.pages.clear();
    this.pages.add('rune-burst');
    for (const id of ids) if (SPELL_PAGES.some(p => p.id === id)) this.pages.add(id as SpellId);
    this.selected = this.pages.has(selected as SpellId) ? selected as SpellId : 'rune-burst';
    this.revision++;
  }
  get ids(): SpellId[] { return [...this.pages]; }
  select(id: SpellId): boolean {
    if (!this.has(id)) return false;
    this.selected = id; this.revision++; return true;
  }
}
