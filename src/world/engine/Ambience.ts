import * as THREE from 'three';
import type { WorldTerrain } from './WorldTerrain';

const COUNT = 700;
const HALF = 42;
const HEIGHT = 18;

/**
 * Ambient motes around the viewer (Job 6 biome mood): fireflies in the wilderness,
 * spores over the marsh, gold dust on the terraces, snow in the caverns, embers in
 * Bloodstone. Motes wrap around the viewer and take their colour from whichever
 * biome they respawn in, so borders mix naturally.
 */
export class Ambience {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly rise = new Float32Array(COUNT);
  private readonly phase = new Float32Array(COUNT);
  /** Motes skipped by the density roll wait a while before rolling again. */
  private readonly sleep = new Float32Array(COUNT);
  private time = 0;
  private readonly color = new THREE.Color();

  constructor(private readonly terrain: WorldTerrain, private readonly hubColor = 0xfff0a0) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(COUNT * 3);
    this.col = new Float32Array(COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 0.14, sizeAttenuation: true, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'ambient-motes';
    for (let i = 0; i < COUNT; i++) this.pos[i * 3 + 1] = -1e4;
  }

  update(dt: number, viewer: THREE.Vector3): void {
    this.time += dt;
    const p = this.pos;
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      let x = p[k], y = p[k + 1], z = p[k + 2];
      if (y < -1e3) {
        this.sleep[i] -= dt;
        if (this.sleep[i] <= 0) this.respawn(i, viewer);
        continue;
      }
      if ( Math.abs(x - viewer.x) > HALF || Math.abs(z - viewer.z) > HALF || y > viewer.y + HEIGHT * 1.4 || y < viewer.y - HEIGHT) {
        this.respawn(i, viewer);
        continue;
      }
      const ph = this.phase[i];
      x += Math.sin(this.time * 0.7 + ph) * 0.25 * dt;
      z += Math.cos(this.time * 0.6 + ph * 1.3) * 0.25 * dt;
      y += this.rise[i] * dt + Math.sin(this.time * 1.3 + ph) * 0.08 * dt;
      if (this.rise[i] < 0 && y < this.terrain.heightAt(x, z)) { this.respawn(i, viewer, true); continue; }
      p[k] = x; p[k + 1] = y; p[k + 2] = z;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private respawn(i: number, viewer: THREE.Vector3, top = false): void {
    const k = i * 3;
    const x = viewer.x + (Math.random() * 2 - 1) * HALF;
    const z = viewer.z + (Math.random() * 2 - 1) * HALF;
    const ground = Math.max(0, this.terrain.heightAt(x, z));
    const biome = this.terrain.biomeAt(x, z);
    const density = biome ? biome.motes.density / 1.6 : 0.35;
    const falling = biome ? biome.motes.rise < 0 : false;
    this.phase[i] = Math.random() * 20;
    if (Math.random() > density) { this.pos[k + 1] = -1e4; this.sleep[i] = 0.5 + Math.random() * 2; return; }
    this.rise[i] = (biome ? biome.motes.rise : 0.12) * (0.6 + Math.random() * 0.8);
    this.pos[k] = x;
    this.pos[k + 2] = z;
    this.pos[k + 1] = falling || top ? ground + HEIGHT * (0.6 + Math.random() * 0.4) : ground + 0.4 + Math.random() * HEIGHT * 0.5;
    this.color.set(biome ? biome.motes.color : this.hubColor).multiplyScalar(2.2);
    this.col[k] = this.color.r; this.col[k + 1] = this.color.g; this.col[k + 2] = this.color.b;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
