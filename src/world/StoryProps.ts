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

/** Id of the first shrine, at Hollowmere where the journey begins. */
export const FIRST_SHRINE = 'hollowmere';

/**
 * Story objects along the Long Road (Jobs 9, 15): an Ember Shrine beside the road where
 * each biome begins (the first, at Hollowmere, always lit), a lore tablet further along,
 * and one Emberwarden memorial per chapter. They are shown only within a few hundred
 * metres; kindled shrines borrow the world's light pool.
 */
export class StoryProps {
  readonly group = new THREE.Group();
  readonly shrines: Shrine[] = [];
  readonly lore: LoreSpot[] = [];
  private timer = 0;
  private readonly tabletMats = { stone: toon({ color: 0x6a6474 }), scroll: glow(0xffe0a0, 1.6) };

  constructor(atlas: WorldAtlas, private readonly m: WorldMaterials, heightAt: Height, reserved: ReservedMap) {
    this.group.name = 'story-props';
    const road = atlas.road;
    /** Dry, gentle, unreserved ground near a point beside the road. */
    const spot = (s: number, lateral: number): THREE.Vector3 => {
      for (const maxSlope of [0.3, 0.7]) {
        for (let k = 0; k < 16; k++) {
          const ds = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 6;
          for (const extra of [0, 5, 10]) {
            const lat = Math.sign(lateral) * (Math.abs(lateral) + extra);
            const { x, z } = road.offset(s + ds, lat);
            const h = heightAt(x, z);
            if (h < 1 || reserved.blocked(x, z, 1.5)) continue;
            const slope = Math.max(Math.abs(heightAt(x + 2, z) - h), Math.abs(heightAt(x, z + 2) - h)) / 2;
            if (slope < maxSlope) return new THREE.Vector3(x, h, z);
          }
        }
      }
      const { x, z } = road.offset(s, lateral);
      return new THREE.Vector3(x, heightAt(x, z), z);
    };

    for (const site of atlas.sites) {
      const first = site.index === 0;
      const side = site.index % 2 ? -1 : 1;
      // Shrine: where the biome begins (the first a few steps ahead of where you wake).
      const at = spot(first ? 54 : site.s0 + 45, side * 10);
      reserved.add(at.x, at.z, 5);
      const prop = new EmberShrine(m, `shrine:${site.id}`, first);
      prop.group.position.copy(at);
      prop.setKindled(first);
      this.group.add(prop.group);
      // Rest spot: toward the road, facing along it.
      const hit = road.nearest(at.x, at.z);
      const toward = new THREE.Vector3(hit.x - at.x, 0, hit.z - at.z).normalize();
      const rest = at.clone().addScaledVector(toward, 2.6);
      rest.y = heightAt(rest.x, rest.z);
      this.shrines.push({
        id: first ? FIRST_SHRINE : site.id, name: site.biome.name, chapter: site.chapter,
        position: at, rest, facing: Math.atan2(-hit.tx, -hit.tz), prop,
      });
      // Lore tablet on the other side of the road, further along.
      const tablet = spot(site.s0 + (site.s1 - site.s0) * 0.45, -side * 12);
      reserved.add(tablet.x, tablet.z, 3);
      this.addLore(site.id, tablet);
      // One Emberwarden memorial per chapter, in its fourth biome.
      if (site.slot === 3) {
        const mem = spot(site.s0 + (site.s1 - site.s0) * 0.7, side * 16);
        reserved.add(mem.x, mem.z, 4);
        this.addMemorial(site.chapter, mem);
      }
    }
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
    object.rotation.y = Math.atan2(at.x, at.z);
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
    return this.shrines.filter(s => s.prop.kindled && !s.prop.light)
      .map(s => ({ x: s.position.x, y: s.position.y + 1.2, z: s.position.z, color: 0xff8a3a, intensity: 22, distance: 16 }));
  }

  update(dt: number, elapsed: number, viewer: THREE.Vector3): void {
    this.timer -= dt;
    const near = (p: THREE.Vector3) => Math.hypot(p.x - viewer.x, p.z - viewer.z) < 380;
    if (this.timer <= 0) {
      this.timer = 0.5;
      for (const s of this.shrines) s.prop.group.visible = near(s.position);
      for (const l of this.lore) l.object.visible = near(l.position);
    }
    for (const s of this.shrines) if (s.prop.group.visible) s.prop.update(elapsed);
    void dt;
  }
}
