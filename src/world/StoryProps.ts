import * as THREE from 'three';
import { glow, toon } from '../render/Materials';
import { LORE, type LoreFragment, MEMORIALS } from '../story/Lore';
import type { LightAnchor } from './biomes/BiomeLandmarks';
import type { ReservedMap } from './engine/PropStreamer';
import type { WorldAtlas } from './engine/WorldAtlas';
import { box, cone, cylinder, GeoBucket, place } from './geometry';
import { EmberShrine } from './props/Details';
import type { WorldMaterials } from './props/WorldMaterials';

export interface Shrine {
  id: string;
  name: string;
  chapter: number;
  position: THREE.Vector3;
  /** Where the player stands after resting or travelling here. */
  rest: THREE.Vector3;
  facing: number;
  prop: EmberShrine;
}

export interface LoreSpot {
  id: string;
  fragment: LoreFragment;
  position: THREE.Vector3;
  object: THREE.Object3D;
  kind: 'tablet' | 'memorial';
}

type Height = (x: number, z: number) => number;

/**
 * Story objects in the world (Job 9): an Ember Shrine beside every landmark (plus the
 * Threshold's own), a lore tablet near each, and one Emberwarden memorial per chapter.
 * They are shown only within a few hundred metres; kindled shrines borrow the world's
 * light pool.
 */
export class StoryProps {
  readonly group = new THREE.Group();
  readonly shrines: Shrine[] = [];
  readonly lore: LoreSpot[] = [];
  private timer = 0;
  private readonly tabletMats = { stone: toon({ color: 0x6a6474 }), scroll: glow(0xffe0a0, 1.6) };

  constructor(
    atlas: WorldAtlas,
    landmarks: { x: number; z: number; clearance: number; name: string }[],
    hubShrine: EmberShrine,
    private readonly m: WorldMaterials,
    heightAt: Height,
    reserved: ReservedMap,
  ) {
    this.group.name = 'story-props';
    // The Threshold's shrine, at the plaza, already exists; its rest spot is the spawn.
    this.shrines.push({
      id: 'threshold', name: 'The Threshold', chapter: 0, prop: hubShrine,
      position: new THREE.Vector3(0, 2, 0), rest: new THREE.Vector3(6, 2, 11), facing: Math.atan2(2, 71),
    });
    // Hub lore: shrine stones, castle gate, bridge.
    this.addLore('hub-1', new THREE.Vector3(-2.6, heightAt(-2.6, 2.4), 2.4));
    this.addLore('hub-2', new THREE.Vector3(-8.5, heightAt(-8.5, -40), -40));
    this.addLore('hub-3', new THREE.Vector3(-15, heightAt(-15, -15), -15));

    atlas.sites.forEach((site, i) => {
      const lm = landmarks[i];
      const spot = (dist: number, startAngle: number): THREE.Vector3 => {
        // Dry, gentle, unreserved ground; relax the slope limit before giving up.
        for (const maxSlope of [0.35, 0.7]) {
          for (let k = 0; k < 24; k++) {
            const a = startAngle + k * 0.27;
            for (const d of [dist, dist + 6, dist + 12, dist + 20, dist + 30]) {
              const x = lm.x + Math.sin(a) * d, z = lm.z + Math.cos(a) * d;
              const h = heightAt(x, z);
              if (h < 1 || reserved.blocked(x, z, 1.5)) continue;
              const slope = Math.max(Math.abs(heightAt(x + 2, z) - h), Math.abs(heightAt(x, z + 2) - h)) / 2;
              if (slope < maxSlope) return new THREE.Vector3(x, h, z);
            }
          }
        }
        const x = lm.x + Math.sin(startAngle) * (dist + 8), z = lm.z + Math.cos(startAngle) * (dist + 8);
        return new THREE.Vector3(x, heightAt(x, z), z);
      };
      const base = (i * 2.399) % (Math.PI * 2);
      // Shrine.
      const at = spot(lm.clearance + 7, base);
      reserved.add(at.x, at.z, 5);
      const prop = new EmberShrine(m, `shrine:${site.id}`, false);
      prop.group.position.copy(at);
      prop.setKindled(false);
      this.group.add(prop.group);
      const out = new THREE.Vector3(at.x - lm.x, 0, at.z - lm.z).normalize();
      const rest = at.clone().addScaledVector(out, 2.6);
      rest.y = heightAt(rest.x, rest.z);
      this.shrines.push({ id: site.id, name: site.biome.name, chapter: site.chapter, position: at, rest, facing: Math.atan2(out.x, out.z), prop });
      // Lore tablet on the other side of the landmark.
      const tablet = spot(lm.clearance + 4, base + Math.PI);
      reserved.add(tablet.x, tablet.z, 3);
      this.addLore(site.id, tablet);
      // One Emberwarden memorial per chapter, beside the fourth site's landmark.
      if (site.slot === 3) {
        const mem = spot(lm.clearance + 10, base + Math.PI / 2);
        reserved.add(mem.x, mem.z, 4);
        this.addMemorial(site.chapter, mem);
      }
    });
  }

  private addLore(id: string, at: THREE.Vector3): void {
    const fragment = LORE[id];
    if (!fragment) return;
    const b = new GeoBucket();
    b.add(this.tabletMats.stone, place(box(0.7, 1.05, 0.5, 1), 0, 0.52, 0));
    b.add(this.tabletMats.stone, place(box(0.9, 0.12, 0.7, 1), 0, 1.08, 0.05, 0, -0.35));
    b.add(this.tabletMats.scroll, place(box(0.6, 0.03, 0.45, 1), 0, 1.16, 0.06, 0, -0.35));
    const object = b.build(new THREE.Group());
    object.position.copy(at);
    object.rotation.y = Math.atan2(-at.x, -at.z);
    object.name = `lore:${id}`;
    this.group.add(object);
    this.lore.push({ id, fragment, position: at.clone().setY(at.y + 1), object, kind: 'tablet' });
  }

  /** A kneeling Emberwarden with a sword planted in a dead fire. */
  private addMemorial(chapter: number, at: THREE.Vector3): void {
    const fragment = MEMORIALS[chapter];
    const m = this.m;
    const b = new GeoBucket();
    const armour = toon({ color: 0x7a7488 });
    b.add(armour, place(box(0.5, 0.55, 0.36, 1), 0, 1.05, 0, 0, 0.35));
    b.add(armour, place(box(0.34, 0.34, 0.34, 1), 0, 1.45, 0.16, 0, 0.5));
    b.add(armour, place(box(0.22, 0.2, 0.6, 1), -0.14, 0.32, 0.12));
    b.add(armour, place(box(0.22, 0.55, 0.2, 1), 0.14, 0.4, -0.1, 0, -0.3));
    b.add(m.darkStone, place(box(0.62, 0.9, 0.06, 1), 0, 1.0, -0.22, 0, 0.3));
    b.add(m.steel, place(box(0.07, 1.3, 0.18, 1), 0, 0.7, 0.62, 0, 0.08));
    b.add(m.steel, place(box(0.5, 0.07, 0.1, 1), 0, 1.3, 0.62));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.add(m.rock, place(new THREE.DodecahedronGeometry(0.16, 0), Math.cos(a) * 0.55, 0.08, 0.62 + Math.sin(a) * 0.55));
    }
    b.add(m.ash, place(cone(0.45, 0.16, 8, 1), 0, 0.08, 0.62));
    b.add(glow(0xff6a2a, 2), place(cylinder(0.03, 0.03, 0.05, 4, 1), 0.05, 0.12, 0.6));
    const object = b.build(new THREE.Group());
    object.position.copy(at);
    object.rotation.y = chapter * 1.3;
    object.name = `memorial:${chapter}`;
    this.group.add(object);
    this.lore.push({ id: fragment.id, fragment, position: at.clone().setY(at.y + 1), object, kind: 'memorial' });
  }

  shrine(id: string): Shrine | undefined {
    return this.shrines.find(s => s.id === id);
  }

  /** Lit shrines near the viewer borrow the world's point lights. */
  lightAnchors(): LightAnchor[] {
    return this.shrines.filter(s => s.id !== 'threshold' && s.prop.kindled)
      .map(s => ({ x: s.position.x, y: s.position.y + 1.2, z: s.position.z, color: 0xff8a3a, intensity: 22, distance: 16 }));
  }

  update(dt: number, elapsed: number, viewer: THREE.Vector3): void {
    this.timer -= dt;
    const near = (p: THREE.Vector3) => Math.hypot(p.x - viewer.x, p.z - viewer.z) < 380;
    if (this.timer <= 0) {
      this.timer = 0.5;
      for (const s of this.shrines) if (s.id !== 'threshold') s.prop.group.visible = near(s.position);
      for (const l of this.lore) l.object.visible = near(l.position);
    }
    for (const s of this.shrines) if (s.id !== 'threshold' && s.prop.group.visible) s.prop.update(elapsed);
    void dt;
  }
}
