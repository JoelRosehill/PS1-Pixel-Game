import * as THREE from 'three';
import type { Level } from '../world/Level';
import { glow, toon } from '../render/Materials';
import type { SpellCasting } from './SpellCasting';
import { SPELL_PAGES, type SpellId } from './SpellBook';

interface Pickup { id: SpellId; object: THREE.Object3D; baseY: number; trial: boolean; }
export class PagePickups {
  readonly group = new THREE.Group();
  readonly pickups: Pickup[] = [];
  nearest: Pickup | null = null;
  private elapsed = 0;
  constructor(private readonly level: Level, private readonly spells: SpellCasting) {
    this.group.name = 'lost-pages';
    const geo = new THREE.BoxGeometry(0.48, 0.64, 0.035);
    for (const site of level.pageSites) {
      const page = SPELL_PAGES.find(p => p.id === site.id)!;
      const object = new THREE.Group();
      object.name = `lost-page:${site.id}`;
      const sheet = new THREE.Mesh(geo, toon({ color: 0xffefcb, emissive: page.color, emissiveIntensity: 0.2 }));
      object.add(sheet);
      const sigil = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), glow(page.color, 1.6));
      object.add(sigil);
      for (const y of [-0.2, 0.2]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.05), glow(page.color));
        line.position.y = y; object.add(line);
      }
      object.position.set(site.x, site.y ?? level.heightAt(site.x, site.z) + 1.35, site.z);
      this.group.add(object);
      this.pickups.push({ id: site.id, object, baseY: object.position.y, trial: false });
    }
  }
  update(dt: number, position: THREE.Vector3, alive: boolean): void {
    this.elapsed += dt;
    this.nearest = null;
    let best = 2.5;
    const centre = position.clone().add(new THREE.Vector3(0, 1, 0));
    for (const [i, pickup] of this.pickups.entries()) {
      pickup.object.visible = !this.spells.book.has(pickup.id);
      if (!pickup.object.visible) continue;
      if (!pickup.trial) {
        pickup.object.position.y = pickup.baseY + Math.sin(this.elapsed * 1.7 + i) * 0.18;
        pickup.object.rotation.y = this.elapsed * 0.8 + i;
      }
      const distance = centre.distanceTo(pickup.object.position);
      if (alive && distance < best && this.level.colliders.sweepSphere(centre, pickup.object.position, 0.04, 20) === 1) {
        best = distance; this.nearest = pickup;
      }
    }
  }
  collectNearest(): boolean {
    if (!this.nearest) return false;
    const result = this.spells.collect(this.nearest.id);
    if (result) { this.nearest.object.visible = false; this.nearest = null; }
    return result;
  }
}
