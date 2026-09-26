import * as THREE from 'three';

/**
 * Transient visuals for the Job 13 arsenal: beams (Comet Lance, Prism Ray), jagged
 * lightning (Chain Storm), erupting spikes (Glacial Rupture, Sunder), expanding flash
 * spheres (meteor impacts, Eclipse) and fading ground scorch discs. Pooled, additive
 * and unlit so they read as bright pixel shapes in every depth band.
 */

interface Beam { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; width: number }
interface Spike { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; height: number; base: THREE.Vector3 }
interface Flash { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; radius: number }

const BEAMS = 120;
const SPIKES = 64;
const FLASHES = 16;
const BOLT_POINTS = 10;

function additive(color = 0xffffff): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
}

export class SpellFx {
  readonly group = new THREE.Group();
  private readonly beams: Beam[] = [];
  private readonly spikes: Spike[] = [];
  private readonly flashes: Flash[] = [];
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor() {
    this.group.name = 'spell-fx';
    this.group.frustumCulled = false;
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < BEAMS; i++) {
      const mat = additive();
      mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(beamGeo, mat);
      mesh.visible = false; mesh.frustumCulled = false;
      this.group.add(mesh);
      this.beams.push({ mesh, mat, life: 0, max: 1, width: 0.2 });
    }
    const spikeGeo = new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0);
    for (let i = 0; i < SPIKES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(spikeGeo, mat);
      mesh.visible = false; mesh.frustumCulled = false;
      this.group.add(mesh);
      this.spikes.push({ mesh, mat, life: 0, max: 1, height: 1, base: new THREE.Vector3() });
    }
    const flashGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < FLASHES; i++) {
      const mat = additive();
      const mesh = new THREE.Mesh(flashGeo, mat);
      mesh.visible = false; mesh.frustumCulled = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, mat, life: 0, max: 1, radius: 1 });
    }
  }

  private take<T extends { life: number }>(pool: T[]): T {
    let best = pool[0];
    for (const e of pool) { if (e.life <= 0) return e; if (e.life < best.life) best = e; }
    return best;
  }

  /** A straight glowing beam from a to b. */
  beam(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, width = 0.25, duration = 0.3): void {
    const e = this.take(this.beams);
    e.life = e.max = duration; e.width = width;
    e.mat.color.set(color).multiplyScalar(2);
    const d = this.tmp.subVectors(b, a);
    const len = d.length();
    e.mesh.position.copy(a);
    e.mesh.quaternion.setFromUnitVectors(this.up, d.normalize());
    e.mesh.scale.set(width, Math.max(0.01, len), width);
    e.mesh.visible = true;
  }

  /**
   * Jagged lightning from a to b, drawn as a chain of thin beams (one-pixel lines would
   * vanish in the Smart-Pixel bands).
   */
  lightning(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, duration = 0.25, jag = 0.45): void {
    const len = a.distanceTo(b);
    const segments = Math.max(3, Math.min(BOLT_POINTS - 1, Math.round(len / 1.5)));
    let prev = a.clone();
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i < segments) {
        const k = jag * Math.min(1.5, len * 0.08) * Math.sin(Math.PI * t);
        p.x += (Math.random() - 0.5) * 2 * k; p.y += (Math.random() - 0.5) * 2 * k; p.z += (Math.random() - 0.5) * 2 * k;
      }
      this.beam(prev, p, color, 0.09, duration);
      this.beam(prev, p, 0xffffff, 0.035, duration * 0.7);
      prev = p;
    }
  }

  /** A spike that erupts from the ground, holds, and sinks back. */
  spike(base: THREE.Vector3, color: THREE.ColorRepresentation, height = 2, duration = 1.1, width = 0.6, delay = 0): void {
    const e = this.take(this.spikes);
    e.life = e.max = duration + delay; e.height = height;
    e.base.copy(base);
    e.mat.color.set(color);
    e.mesh.position.copy(base);
    e.mesh.rotation.set((Math.random() - 0.5) * 0.35, Math.random() * Math.PI, (Math.random() - 0.5) * 0.35);
    e.mesh.scale.set(width, 0.001, width);
    e.mesh.visible = delay <= 0;
    e.mesh.userData.delay = delay;
    e.mesh.userData.duration = duration;
  }

  /** An expanding, fading sphere of light. */
  flash(point: THREE.Vector3, color: THREE.ColorRepresentation, radius = 2, duration = 0.35): void {
    const e = this.take(this.flashes);
    e.life = e.max = duration; e.radius = radius;
    e.mat.color.set(color).multiplyScalar(1.6);
    e.mesh.position.copy(point);
    e.mesh.visible = true;
  }

  update(frameDt: number): void {
    // Slow frames must not skip short-lived flashes entirely.
    const dt = Math.min(frameDt, 1 / 30);
    for (const e of this.beams) {
      if (e.life <= 0) continue;
      e.life -= dt;
      const k = Math.max(0, e.life / e.max);
      e.mat.opacity = k;
      e.mesh.scale.x = e.mesh.scale.z = e.width * (0.4 + 0.6 * k);
      if (e.life <= 0) e.mesh.visible = false;
    }
    for (const e of this.spikes) {
      if (e.life <= 0) continue;
      e.life -= dt;
      const delay = e.mesh.userData.delay as number;
      const duration = e.mesh.userData.duration as number;
      const age = e.max - e.life - delay;
      if (age < 0) continue;
      e.mesh.visible = true;
      const rise = Math.min(1, age / 0.12);
      const sink = Math.min(1, Math.max(0, (duration - age) / 0.3));
      e.mesh.scale.y = Math.max(0.001, e.height * rise * sink);
      if (e.life <= 0) e.mesh.visible = false;
    }
    for (const e of this.flashes) {
      if (e.life <= 0) continue;
      e.life -= dt;
      const k = 1 - Math.max(0, e.life / e.max);
      e.mesh.scale.setScalar(e.radius * (0.3 + 0.7 * Math.sqrt(k)));
      e.mat.opacity = Math.max(0, 1 - k) * 0.8;
      if (e.life <= 0) e.mesh.visible = false;
    }
    void this.tmp2;
  }

  clear(): void {
    for (const e of [...this.beams, ...this.flashes]) { e.life = 0; e.mesh.visible = false; }
    for (const e of this.spikes) { e.life = 0; e.mesh.visible = false; }
  }
}
