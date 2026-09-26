import * as THREE from 'three';
import { Random } from '../../core/Random';
import type { ColliderWorld } from '../../physics/Colliders';
import { glow, rangeClipped, toon } from '../../render/Materials';
import type { PropKind } from '../biomes/BiomeTypes';
import { box, cone, cylinder, merge, place } from '../geometry';
import { boulderGeometry, cardGeometry, pineGeometry } from '../props/Foliage';
import type { WorldMaterials } from '../props/WorldMaterials';

/** Which streaming ring a prop kind lives in. */
export type PropTier = 'near' | 'mid';

/** One instanced part of a prop (a tree is trunk + canopy). */
export interface PropPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Same material, clipped to draw only near / only far of the hand-off radius. */
  midMaterial: THREE.Material;
  farMaterial: THREE.Material;
  /** Simplified shape for the far ring (defaults to `geometry`). */
  farGeometry?: THREE.BufferGeometry;
  /** Per-instance tint applies to this part. */
  tinted: boolean;
  castShadow: boolean;
}

export interface PropModel {
  kind: PropKind;
  tier: PropTier;
  parts: PropPart[];
  /** Adds collision for one instance (world space); omitted for grass-like props. */
  collider?: (col: ColliderWorld, x: number, y: number, z: number, scale: number) => void;
}

/**
 * Geometry, materials and collision for every prop kind the biomes can scatter.
 * Unit-sized: instance scale is the prop's height (trees, spires) or overall size.
 * Everything is shared across all cells; cells own only their InstancedMeshes.
 */
export class PropLibrary {
  private readonly models = new Map<PropKind, PropModel>();

  constructor(m: WorldMaterials) {
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, tinted = false, castShadow = true, farGeometry?: THREE.BufferGeometry): PropPart => ({
      geometry, material, tinted, castShadow, farGeometry,
      midMaterial: rangeClipped(material, 'near'), farMaterial: rangeClipped(material, 'far'),
    });
    const trunkCollider = (radius: number, height: number) =>
      (col: ColliderWorld, x: number, y: number, z: number, s: number) => col.addCylinder(x, y + s * height * 0.5, z, Math.max(0.12, s * radius), s * height);
    const rng = new Random('prop-library');
    const white = (params: THREE.MeshToonMaterialParameters = {}) => toon({ color: 0xffffff, ...params });

    const pine = pineGeometry('world-pine');
    // Far pines: one 6-sided cone (16 triangles instead of ~110).
    const farPine = place(cone(0.22, 0.85, 6, 0.06), 0, 0.55, 0);
    const farTrunk = place(cylinder(0.02, 0.03, 0.2, 3, 0.08), 0, 0.1, 0);
    this.add({ kind: 'pine', tier: 'mid', parts: [part(pine.trunk, m.bark, false, true, farTrunk), part(pine.foliage, m.needles, true, true, farPine)], collider: trunkCollider(0.04, 0.62) });

    // Broadleaf: short trunk and a lumpy canopy of flat-shaded blobs.
    const blobs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.IcosahedronGeometry(0.2 + rng.next() * 0.08, 0);
      blobs.push(place(g, rng.signed() * 0.16, 0.62 + rng.next() * 0.22, rng.signed() * 0.16));
    }
    const leafTrunk = place(cylinder(0.035, 0.06, 0.6, 6, 0.1), 0, 0.3, 0);
    const farCanopy = place(new THREE.OctahedronGeometry(0.3, 0), 0, 0.72, 0);
    this.add({ kind: 'leafTree', tier: 'mid', parts: [part(leafTrunk, m.bark), part(merge(blobs), white(), true, true, farCanopy)], collider: trunkCollider(0.06, 0.6) });

    // Dead tree: leaning trunk with crooked branches.
    const dead: THREE.BufferGeometry[] = [place(cylinder(0.02, 0.06, 1, 5, 0.1), 0, 0.5, 0, 0, 0.08)];
    for (let i = 0; i < 4; i++) {
      const y = 0.45 + i * 0.13;
      dead.push(place(box(0.025, 0.32 - i * 0.04, 0.025, 1), Math.cos(i * 2.2) * 0.1, y, Math.sin(i * 2.2) * 0.1, i * 2.2, 0, 0.9 * (i % 2 ? 1 : -1)));
    }
    this.add({ kind: 'deadTree', tier: 'mid', parts: [part(merge(dead), white(), true)], collider: trunkCollider(0.05, 1) });

    this.add({ kind: 'grass', tier: 'near', parts: [part(cardGeometry(), m.grass, true, false)] });
    this.add({ kind: 'flowers', tier: 'near', parts: [part(cardGeometry(), m.flowers, false, false)] });
    const reed = cardGeometry().scale(0.35, 1.6, 0.35);
    this.add({ kind: 'reeds', tier: 'near', parts: [part(reed, m.grass, true, false)] });

    // Glowing mushroom: pale stem, luminous cap.
    const stem = place(cylinder(0.05, 0.07, 0.5, 6, 0.2), 0, 0.25, 0);
    const cap = place(new THREE.ConeGeometry(0.32, 0.22, 8, 1), 0, 0.58, 0);
    this.add({ kind: 'mushroom', tier: 'mid', parts: [part(stem, toon({ color: 0xd8d0e8 })), part(cap, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8) }), true, false)] });

    this.add({ kind: 'boulder', tier: 'mid', parts: [part(boulderGeometry('world-boulder'), m.rock)],
      collider: (col, x, y, z, s) => { if (s > 1.1) col.addSphere(x, y + s * 0.3, z, s * 0.72); } });

    // Crystal cluster: tall faceted shards, tinted and faintly self-lit.
    const shards: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.OctahedronGeometry(0.16, 0).scale(1, 3.2 - i * 0.5, 1);
      shards.push(place(g, rng.signed() * 0.18, 0.45 - i * 0.05, rng.signed() * 0.18, rng.next() * 3, rng.signed() * 0.35, rng.signed() * 0.35));
    }
    this.add({ kind: 'crystal', tier: 'mid', parts: [part(merge(shards), white({ emissive: 0x6a6a7a }), true)], collider: trunkCollider(0.18, 0.8) });

    const spike = place(cone(0.18, 1, 7, 0.3), 0, 0.5, 0);
    this.add({ kind: 'iceSpike', tier: 'mid', parts: [part(spike, white({ emissive: 0x28323a }), true)], collider: trunkCollider(0.14, 0.9) });

    // Classical column (unit height): plinth, shaft, capital.
    const column = merge([
      place(box(0.36, 0.06, 0.36, 2), 0, 0.03, 0),
      place(cylinder(0.1, 0.12, 0.86, 12, 2), 0, 0.49, 0),
      place(box(0.34, 0.06, 0.34, 2), 0, 0.95, 0),
    ]);
    this.add({ kind: 'column', tier: 'mid', parts: [part(column, m.marble)], collider: trunkCollider(0.14, 1) });

    // Red rock spire: tall jagged cone.
    const spire = cone(0.16, 1, 7, 0.2);
    const sp = spire.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i) + 0.5;
      const k = 1 + Math.sin(y * 17 + sp.getX(i) * 9) * 0.12;
      sp.setXYZ(i, sp.getX(i) * k, y, sp.getZ(i) * k);
    }
    spire.computeVertexNormals();
    this.add({ kind: 'redSpire', tier: 'mid', parts: [part(spire.toNonIndexed(), white(), true)], collider: trunkCollider(0.12, 0.7) });

    // Obelisk with a glowing rune seam.
    const obelisk = merge([place(box(0.16, 0.9, 0.16, 1), 0, 0.45, 0), place(cone(0.12, 0.12, 4, 1), 0, 0.96, 0, Math.PI / 4)]);
    const seam = place(box(0.03, 0.6, 0.17, 1), 0, 0.5, 0);
    this.add({ kind: 'obelisk', tier: 'mid', parts: [part(obelisk, m.darkStone), part(seam, glow(0xb07cff, 2.4), false, false)], collider: trunkCollider(0.12, 1) });

    const shrub = new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.7, 1).translate(0, 0.3, 0);
    this.add({ kind: 'shrub', tier: 'mid', parts: [part(shrub, white(), true)] });

    // Bones: a ribcage of arcs and a skull-ish block.
    const ribs: THREE.BufferGeometry[] = [place(box(0.12, 0.12, 1.4, 1), 0, 0.12, 0)];
    for (let i = 0; i < 5; i++) {
      const arc = new THREE.TorusGeometry(0.42, 0.04, 4, 10, Math.PI);
      ribs.push(place(arc, 0, 0.12, -0.55 + i * 0.27, Math.PI / 2, 0, 0));
    }
    ribs.push(place(box(0.3, 0.26, 0.34, 1), 0, 0.2, 0.84));
    this.add({ kind: 'bones', tier: 'mid', parts: [part(merge(ribs), toon({ color: 0xe8e0d0 }))] });
  }

  private add(model: PropModel): void {
    this.models.set(model.kind, model);
  }

  get(kind: PropKind): PropModel {
    const m = this.models.get(kind);
    if (!m) throw new Error(`Unknown prop kind: ${kind}`);
    return m;
  }
}
