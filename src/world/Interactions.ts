import * as THREE from 'three';
import type { PagePickups } from '../spells/PagePickups';
import { SPELL_PAGES } from '../spells/SpellBook';
import type { LoreSpot, Shrine, StoryProps } from './StoryProps';

export type Interactable =
  | { kind: 'page'; distance: number }
  | { kind: 'shrine'; shrine: Shrine; distance: number }
  | { kind: 'lore'; spot: LoreSpot; distance: number }
  | { kind: 'wanderer'; distance: number };

/**
 * One "use" key for the world (F): the nearest of a Lost Page, an Ember Shrine, a lore
 * tablet or memorial, or the Wanderer. The game supplies what each one does.
 */
export class Interactions {
  current: Interactable | null = null;
  onRest: (shrine: Shrine) => void = () => {};
  onRead: (spot: LoreSpot) => void = () => {};
  onTalk: () => void = () => {};
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly pages: PagePickups,
    private readonly story: StoryProps,
    private readonly wanderer: THREE.Object3D,
    private readonly isRead: (id: string) => boolean,
  ) {}

  update(position: THREE.Vector3, alive: boolean): void {
    this.current = null;
    if (!alive) return;
    let best: Interactable | null = null;
    const consider = (c: Interactable) => { if (!best || c.distance < best.distance) best = c; };
    if (this.pages.nearest) consider({ kind: 'page', distance: this.pages.nearest.object.position.distanceTo(this.tmp.copy(position).setY(position.y + 1)) });
    for (const shrine of this.story.shrines) {
      const d = Math.hypot(position.x - shrine.position.x, position.z - shrine.position.z);
      if (d < 3.2 && Math.abs(position.y - shrine.position.y) < 3) consider({ kind: 'shrine', shrine, distance: d });
    }
    for (const spot of this.story.lore) {
      const d = Math.hypot(position.x - spot.position.x, position.z - spot.position.z);
      if (d < 2.6 && Math.abs(position.y + 1 - spot.position.y) < 3) consider({ kind: 'lore', spot, distance: d });
    }
    const w = this.wanderer.position;
    const dw = Math.hypot(position.x - w.x, position.z - w.z);
    if (dw < 3) consider({ kind: 'wanderer', distance: dw });
    this.current = best;
  }

  /** The prompt shown for the current target ('' when nothing is in reach). */
  prompt(): string {
    const c = this.current;
    if (!c) return '';
    switch (c.kind) {
      case 'page': return `F · Bind ${SPELL_PAGES.find(p => p.id === this.pages.nearest?.id)?.name ?? 'the page'}`;
      case 'shrine': return c.shrine.prop.kindled ? `F · Rest at the Ember Shrine · ${c.shrine.name}` : 'F · Kindle the Ember Shrine';
      case 'lore': return `F · ${c.spot.kind === 'memorial' ? 'Look closer' : 'Read'}${this.isRead(c.spot.id) ? '' : ' ✦'}`;
      case 'wanderer': return 'F · Speak with the Wanderer';
    }
  }

  interact(): boolean {
    const c = this.current;
    if (!c) return false;
    switch (c.kind) {
      case 'page': return this.pages.collectNearest();
      case 'shrine': this.onRest(c.shrine); return true;
      case 'lore': this.onRead(c.spot); return true;
      case 'wanderer': this.onTalk(); return true;
    }
  }
}
