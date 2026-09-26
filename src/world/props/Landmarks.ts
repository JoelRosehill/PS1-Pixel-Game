import * as THREE from 'three';
import { Noise2D, smoothstep } from '../../core/Noise';
import { Random } from '../../core/Random';
import { toon } from '../../render/Materials';
import { box, cone, cylinder, GeoBucket, place } from '../geometry';
import type { WorldMaterials } from './WorldMaterials';

/**
 * Far landmarks. These live almost entirely in the coarsest Smart-Pixel bands,
 * so they are designed as strong silhouettes rather than detailed models.
 */

export interface MountainOptions {
  inner: number;
  outer: number;
  /** Azimuth (radians, 0 = -Z) of a low valley that frames the far landmark. */
  valleyAzimuth: number;
  seed: string;
}

export function buildMountainRing(o: MountainOptions): THREE.Mesh {
  const noise = new Noise2D(o.seed);
  const radial = 40;
  const angular = 320;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cForest = new THREE.Color(0x1c3a3a);
  const cRock = new THREE.Color(0x4a4058);
  const cHigh = new THREE.Color(0x6a6080);
  const cSnow = new THREE.Color(0xe6e0f4);
  const c = new THREE.Color();

  for (let j = 0; j <= radial; j++) {
    const t = j / radial;
    const r = o.inner + (o.outer - o.inner) * Math.pow(t, 1.4);
    for (let i = 0; i <= angular; i++) {
      const a = (i / angular) * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const ridge = noise.ridged(x * 0.0016 + 11, z * 0.0016 - 7, 5);
      const broad = noise.fbm(x * 0.0007, z * 0.0007, 3) * 0.5 + 0.5;
      let h = 40 + smoothstep(o.inner, o.inner + 500, r) * (ridge * 420 + broad * 160);
      // Soft valley toward the far landmark.
      const da = Math.abs(((a - o.valleyAzimuth + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      h *= 1 - 0.75 * Math.exp(-Math.pow(da / 0.32, 2)) * (1 - smoothstep(o.inner + 600, o.outer, r) * 0.6);
      // Fall away at the far rim so the silhouette sits on the horizon.
      h *= 1 - smoothstep(o.outer * 0.8, o.outer, r) * 0.5;
      pos.push(x, h, z);
      const snowLine = 260 + noise.get(x * 0.01, z * 0.01) * 40;
      if (h > snowLine) c.copy(cSnow);
      else if (h > 170) c.lerpColors(cRock, cHigh, (h - 170) / 90);
      else c.lerpColors(cForest, cRock, smoothstep(60, 170, h));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < radial; j++)
    for (let i = 0; i < angular; i++) {
      const a0 = j * (angular + 1) + i;
      const b0 = a0 + angular + 1;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toon({ vertexColors: true }));
  mesh.name = 'mountains';
  return mesh;
}

/** A craggy rock mass: displaced cylinder. */
function crag(rTop: number, rBottom: number, h: number, seed: string): THREE.BufferGeometry {
  const rng = new Random(seed);
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 14, 6).toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    let k = cache.get(key);
    if (k === undefined) cache.set(key, (k = 0.78 + rng.next() * 0.4));
    const topRing = pos.getY(i) > h / 2 - 1e-3;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) + (topRing ? 0 : (k - 1) * h * 0.08), pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The Spire Citadel: a colossal gothic silhouette on a crag, meant to stand
 * against the blood moon (ref: reference_img/995f…png, a90b…png).
 */
export function buildCitadel(m: WorldMaterials, seed = 'citadel'): THREE.Group {
  const rng = new Random(seed);
  const b = new GeoBucket();
  const cragH = 120;
  b.add(m.rock, place(crag(70, 150, cragH, seed), 0, cragH / 2, 0));

  const top = cragH;
  // Central keep and great spire
  b.add(m.darkStone, place(box(56, 70, 44), 0, top + 35, 0));
  b.add(m.darkStone, place(cylinder(10, 13, 170, 8), 0, top + 85, -4));
  b.add(m.darkStone, place(cone(14, 80, 8), 0, top + 170 + 40, -4));
  b.add(m.darkStone, place(cone(1.5, 30, 4), 0, top + 250 + 15, -4));
  // Flanking spires
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng.signed() * 0.2;
    const d = 30 + rng.next() * 26;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d * 0.8;
    const r = 3 + rng.next() * 3.5;
    const h = 45 + rng.next() * 110;
    b.add(m.darkStone, place(cylinder(r, r * 1.15, h, 6), x, top + h / 2, z));
    b.add(m.darkStone, place(cone(r * 1.35, h * 0.42, 6), x, top + h + h * 0.21, z));
    // Glowing slit windows
    for (let k = 0; k < 3; k++)
      if (rng.chance(0.5)) {
        const wy = top + h * (0.35 + k * 0.2);
        b.add(m.windowRed, place(box(r * 0.5, 4, 0.8), x, wy, z + r * 1.05));
      }
  }
  // Buttresses leaning on the keep
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++)
      b.add(m.darkStone, place(box(6, 60, 8), sx * 36, top + 25, -14 + k * 14, 0, 0, sx * 0.25));
  // Great window rows on the keep and spire
  for (let k = 0; k < 6; k++) b.add(m.windowRed, place(box(3, 9, 1), -18 + k * 7.2, top + 40, 22.2));
  for (let k = 0; k < 5; k++) b.add(m.windowRed, place(box(2.4, 6, 1), 0, top + 60 + k * 22, 7.5));

  const group = b.build(new THREE.Group(), { castShadow: false, receiveShadow: false });
  group.name = 'citadel';
  return group;
}

/** Colossal stone ring rising from the lake — a mid-distance portal landmark (ref: ebaa…png). */
export function buildMistGate(m: WorldMaterials): THREE.Group {
  const b = new GeoBucket();
  const ring = new THREE.TorusGeometry(20, 2.6, 8, 36);
  b.add(m.rock, place(ring, 0, 14, 0));
  const inner = new THREE.TorusGeometry(17.6, 0.35, 4, 48);
  b.add(m.portalGlow, place(inner, 0, 14, 0));
  // Gothic finials around the ring
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI;
    const x = Math.cos(a) * 24;
    const y = 14 + Math.sin(a) * 24;
    b.add(m.darkStone, place(cone(1.4, 6, 5), x, y, 0, 0, 0, a - Math.PI / 2));
  }
  // Broken flanking pillars
  b.add(m.darkStone, place(cylinder(2.4, 2.8, 26, 8), -27, 9, 0));
  b.add(m.darkStone, place(cylinder(2.4, 2.8, 16, 8), 27, 4, 2));
  b.add(m.darkStone, place(box(7, 2.4, 7), -27, 22.6, 0, 0.3));
  const group = b.build(new THREE.Group(), { castShadow: false });
  group.name = 'mist-gate';
  return group;
}
