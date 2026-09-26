import * as THREE from 'three';
import { groundDetail } from '../render/PixelTextures';
import { toon } from '../render/Materials';

export type HeightFn = (x: number, z: number) => number;
export type ColorFn = (x: number, z: number, h: number, slope: number, out: THREE.Color) => void;

export interface TerrainOptions {
  /** Half extent of the square terrain in metres. */
  halfSize: number;
  /** Grid segments per side (must be divisible by `chunks`). */
  segments: number;
  /** Chunks per side, so each band can frustum-cull the terrain. */
  chunks: number;
  /** Vertex spacing at the centre in metres (the grid gets sparser toward the edges). */
  centerSpacing: number;
  heightAt: HeightFn;
  colorAt: ColorFn;
  /** Metres per ground-texture repeat. */
  tile?: number;
}

/**
 * Chunked heightfield on a warped grid: dense near the origin (foreground detail
 * where the crisp band lives), sparse at the edges (far bands are chunky anyway).
 */
export function buildTerrain(o: TerrainOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain';
  const S = o.halfSize;
  const N = o.segments;
  const du = 2 / N;
  const a = Math.min(1, o.centerSpacing / (S * du));
  const warp = (u: number) => S * (a * u + (1 - a) * u * u * u);
  const tile = o.tile ?? 4;

  const coords = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) coords[i] = warp(-1 + i * du);

  const material = toon({ map: groundDetail(), vertexColors: true });
  const k = N / o.chunks;
  const color = new THREE.Color();
  const e = 0.6;

  for (let cj = 0; cj < o.chunks; cj++)
    for (let ci = 0; ci < o.chunks; ci++) {
      const vc = (k + 1) * (k + 1);
      const pos = new Float32Array(vc * 3);
      const nor = new Float32Array(vc * 3);
      const uv = new Float32Array(vc * 2);
      const col = new Float32Array(vc * 3);
      let v = 0;
      for (let j = 0; j <= k; j++)
        for (let i = 0; i <= k; i++) {
          const x = coords[ci * k + i];
          const z = coords[cj * k + j];
          const h = o.heightAt(x, z);
          const nx = o.heightAt(x - e, z) - o.heightAt(x + e, z);
          const nz = o.heightAt(x, z - e) - o.heightAt(x, z + e);
          const len = Math.hypot(nx, 2 * e, nz);
          const ny = (2 * e) / len;
          pos.set([x, h, z], v * 3);
          nor.set([nx / len, ny, nz / len], v * 3);
          uv.set([x / tile, z / tile], v * 2);
          o.colorAt(x, z, h, 1 - ny, color);
          col.set([color.r, color.g, color.b], v * 3);
          v++;
        }
      const idx: number[] = [];
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const a0 = j * (k + 1) + i;
          const b0 = a0 + (k + 1);
          const c0 = a0 + 1;
          const d0 = b0 + 1;
          idx.push(a0, b0, c0, c0, b0, d0);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.name = `terrain-${ci}-${cj}`;
      group.add(mesh);
    }
  return group;
}
