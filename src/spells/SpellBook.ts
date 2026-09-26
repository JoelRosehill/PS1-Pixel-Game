/**
 * The Chromatic Codex (remade in Job 13). Twelve pages, each a loud, distinct tool:
 * artillery (Starfall, Comet Lance, Prism Ray), crowd control (Chain Storm, Glacial
 * Rupture, Void Maw), summons (Wisp Choir, Moon Aegis), sustain (Blood Bloom), movement
 * (Phoenix Flight, Windstep) and the capstone, Eclipse.
 *
 * Every spell costs Momentum, which is always within reach: hold Shift standing still
 * to channel it back. The free Starbolt (right mouse) is not a page — it is the book
 * itself.
 */
export type SpellId = 'starfall' | 'comet-lance' | 'chain-storm' | 'glacial-rupture' | 'void-maw' | 'phoenix-flight' |
  'moon-aegis' | 'blood-bloom' | 'prism-ray' | 'wisp-choir' | 'eclipse' | 'windstep';

export type SpellEffect =
  | { kind: 'starfall'; count: number; damage: number; radius: number; range: number }
  | { kind: 'lance'; damage: number; range: number; charge: number }
  | { kind: 'chain'; damage: number; jumps: number; range: number; stagger: number }
  | { kind: 'rupture'; damage: number; length: number; slow: number }
  | { kind: 'maw'; radius: number; duration: number; damage: number; range: number }
  | { kind: 'phoenix'; distance: number; damage: number }
  | { kind: 'aegis'; moons: number; duration: number; damage: number }
  | { kind: 'bloom'; radius: number; damage: number; heal: number; perHit: number }
  | { kind: 'prism'; dps: number; drain: number; range: number }
  | { kind: 'wisps'; count: number; damage: number; duration: number }
  | { kind: 'eclipse'; radius: number; damage: number }
  | { kind: 'blink'; distance: number };

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
  { id: 'starfall', name: 'Starfall', glyph: '✦', school: 'Artillery', color: 0xb07cff, cost: 30, cooldown: 1.2,
    description: 'Call five stars down around the point you aim at (up to 45 m away). Each bursts for 22 damage in 3 m.',
    lore: 'Isolde wrote the first page by lamplight: "Everything that falls was once held up. Let go."',
    hint: 'Bound into the book from the beginning.', effect: { kind: 'starfall', count: 5, damage: 22, radius: 3, range: 45 } },
  { id: 'comet-lance', name: 'Comet Lance', glyph: '➶', school: 'Artillery', color: 0x8ae8ff, cost: 35, cooldown: 1.6,
    description: 'Hold to gather (0.6 s), release to fire a beam 70 m long that pierces everything in its line for up to 70 damage.',
    lore: 'A comet does not aim. It simply refuses to stop.', hint: 'Whisperpine: on the watch stone above the road.',
    effect: { kind: 'lance', damage: 70, range: 70, charge: 0.6 } },
  { id: 'chain-storm', name: 'Chain Storm', glyph: 'ϟ', school: 'Storm', color: 0x9ad8ff, cost: 30, cooldown: 1.4,
    description: 'Lightning leaps from your book to the nearest foe and on to five more within 12 m. 26 damage each and a stagger.',
    lore: 'The storm is only the sky remembering how to speak.', hint: 'The Violet Fen: in the lantern-keeper’s tower.',
    effect: { kind: 'chain', damage: 26, jumps: 6, range: 12, stagger: 0.8 } },
  { id: 'glacial-rupture', name: 'Glacial Rupture', glyph: '❄', school: 'Frost', color: 0xbff4ff, cost: 30, cooldown: 1.8,
    description: 'Tear a 22 m line of ice spikes out of the ground. 30 damage, and everything hit is slowed for 3 seconds.',
    lore: 'Winter wrote with a finer hand than any scribe.', hint: 'Frostmouth, at the mouth of the Crystal Deep.',
    effect: { kind: 'rupture', damage: 30, length: 22, slow: 3 } },
  { id: 'void-maw', name: 'Void Maw', glyph: '◉', school: 'Void', color: 0xd06cff, cost: 45, cooldown: 6,
    description: 'Hurl a seed of nothing up to 30 m. It drags every foe within 7 m inward for 3 seconds, then bursts for 60.',
    lore: 'Beneath still water, the sky continues forever. Beneath the sky, this.', hint: 'The drowned Coronation Pool.',
    effect: { kind: 'maw', radius: 7, duration: 3, damage: 60, range: 30 } },
  { id: 'phoenix-flight', name: 'Phoenix Flight', glyph: '♨', school: 'Movement', color: 0xff9a4a, cost: 20, cooldown: 1.2,
    description: 'Burst 14 m forward wreathed in fire, untouchable, burning everything you pass for 24 and leaving a trail that burns.',
    lore: 'A coal carried from a home whose name you no longer remember.', hint: 'Terrace of the Low Sun.',
    effect: { kind: 'phoenix', distance: 14, damage: 24 } },
  { id: 'moon-aegis', name: 'Moon Aegis', glyph: '☾', school: 'Ward', color: 0xfff0b0, cost: 35, cooldown: 10,
    description: 'Six small moons orbit you for 12 seconds. Each one swallows a projectile or bites a foe that comes close (18 damage).',
    lore: 'Some promises outlive the hands that made them.', hint: 'Heliotrope Gardens, in the sundial court.',
    effect: { kind: 'aegis', moons: 6, duration: 12, damage: 18 } },
  { id: 'blood-bloom', name: 'Blood Bloom', glyph: '❀', school: 'Blood', color: 0xff4a6a, cost: 40, cooldown: 7,
    description: 'A crimson nova 7 m wide: 35 damage to all it touches. Heals 15 Vigour, plus 8 for every foe caught.',
    lore: 'What was broken may yet carry light.', hint: 'The Red Canyons, beneath the gallows.',
    effect: { kind: 'bloom', radius: 7, damage: 35, heal: 15, perHit: 8 } },
  { id: 'prism-ray', name: 'Prism Ray', glyph: '✺', school: 'Artillery', color: 0xffffff, cost: 10, cooldown: 0.8,
    description: 'Hold to pour a rainbow beam 55 m long: 80 damage per second to whatever it touches. Drains 28 Momentum a second.',
    lore: 'Split white light and you find every colour it was hiding. Split a king, and you find the same.',
    hint: 'The Prism Galleries of the Crystal Deep.', effect: { kind: 'prism', dps: 80, drain: 28, range: 55 } },
  { id: 'wisp-choir', name: 'Wisp Choir', glyph: '✧', school: 'Summon', color: 0x9affc8, cost: 35, cooldown: 8,
    description: 'Four singing wisps hunt the nearest foes for 14 seconds, striking three times each for 18.',
    lore: 'The fen’s grief, given somewhere warm to rest at last.', hint: 'Glowcap Hollows.',
    effect: { kind: 'wisps', count: 4, damage: 18, duration: 14 } },
  { id: 'windstep', name: 'Windstep', glyph: '»', school: 'Movement', color: 0x7fffd4, cost: 15, cooldown: 0.9,
    description: 'Blink 10 m where you look (up or down too). Stops safely before walls and keeps your speed.',
    lore: 'The road remembers every footstep but this one.', hint: 'The Obsolete Sea, atop the fallen keyboard.',
    effect: { kind: 'blink', distance: 10 } },
  { id: 'eclipse', name: 'Eclipse', glyph: '●', school: 'Capstone', color: 0xffd070, cost: 100, cooldown: 20,
    description: 'Put out the moon for a heartbeat. Time slows, then everything within 14 m takes 140 damage and is thrown down.',
    lore: 'Isolde’s last page, written in a hand that shook: "If you are reading this, finish it."',
    hint: 'The Stair of Nine Hundred Links.', effect: { kind: 'eclipse', radius: 14, damage: 140 } },
];

/** Session progression; saved by Job 9's SaveGame. Starfall is always bound. */
export class SpellBook {
  private readonly pages = new Set<SpellId>(['starfall']);
  selected: SpellId = 'starfall';
  revision = 0;
  get count(): number { return this.pages.size; }
  get tier(): number { return this.count >= 10 ? 3 : this.count >= 6 ? 2 : this.count >= 3 ? 1 : 0; }
  get tierName(): string { return ['Leather', 'Brass-bound', 'Gilded', 'Runic'][this.tier]; }
  get current(): SpellPage { return SPELL_PAGES.find(p => p.id === this.selected)!; }
  has(id: SpellId): boolean { return this.pages.has(id); }
  collect(id: SpellId): boolean {
    if (this.has(id) || !SPELL_PAGES.some(p => p.id === id)) return false;
    this.pages.add(id); this.revision++; return true;
  }
  /** Loads saved pages (unknown ids from older saves are ignored; Starfall is always bound). */
  restore(ids: string[], selected: string): void {
    this.pages.clear();
    this.pages.add('starfall');
    for (const id of ids) if (SPELL_PAGES.some(p => p.id === id)) this.pages.add(id as SpellId);
    this.selected = this.pages.has(selected as SpellId) ? selected as SpellId : 'starfall';
    this.revision++;
  }
  get ids(): SpellId[] { return [...this.pages]; }
  select(id: SpellId): boolean {
    if (!this.has(id)) return false;
    this.selected = id; this.revision++; return true;
  }
  /** Next/previous owned page in codex order (mouse wheel). */
  cycle(step: number): SpellId {
    const owned = SPELL_PAGES.filter(p => this.has(p.id));
    const i = owned.findIndex(p => p.id === this.selected);
    const next = owned[(i + step + owned.length * 4) % owned.length];
    this.select(next.id);
    return next.id;
  }
}
