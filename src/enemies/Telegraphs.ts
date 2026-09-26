import * as THREE from 'three';

/**
 * Ground telegraphs for area attacks: an outline ring plus a disc that fills toward the
 * edge as the strike approaches, then a column of light when it lands. Pooled and
 * additive, so they read against the dark palette without allocating mid-fight.
 */
interface Marker {
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  life: number;
  duration: number;
  active: boolean;
}

interface Pillar {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  duration: number;
}

interface Strike {
  point: THREE.Vector3;
  radius: number;
  delay: number;
  color: THREE.ColorRepresentation;
  land: (point: THREE.Vector3, radius: number) => void;
}

const MARKERS = 12;
const PILLARS = 8;

export class Telegraphs {
  readonly group = new THREE.Group();
  private readonly markers: Marker[] = [];
  private readonly pillars: Pillar[] = [];
  private readonly strikes: Strike[] = [];

  constructor() {
    this.group.name = 'telegraphs';
    const ringGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    const fillGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    const mat = () => new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < MARKERS; i++) {
      const ringMat = mat();
      const fillMat = mat();
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const fill = new THREE.Mesh(fillGeo, fillMat);
      ring.visible = fill.visible = false;
      ring.frustumCulled = fill.frustumCulled = false;
      this.group.add(ring, fill);
      this.markers.push({ ring, fill, ringMat, fillMat, life: 0, duration: 1, active: false });
    }
    const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < PILLARS; i++) {
      const pmat = mat();
      const mesh = new THREE.Mesh(pillarGeo, pmat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pillars.push({ mesh, mat: pmat, life: 0, duration: 1 });
    }
  }

  /** Shows a filling circle at `point` for `duration` seconds. */
  circle(point: THREE.Vector3, radius: number, duration: number, color: THREE.ColorRepresentation): void {
    const m = this.markers.find(x => !x.active);
    if (!m) return;
    m.active = true;
    m.life = 0;
    m.duration = duration;
    m.ring.position.copy(point).y += 0.06;
    m.fill.position.copy(point).y += 0.05;
    m.ring.scale.setScalar(radius);
    m.fill.scale.setScalar(0.01);
    m.ringMat.color.set(color);
    m.fillMat.color.set(color);
    m.ring.visible = m.fill.visible = true;
    m.fill.userData.radius = radius;
  }

  /** A column of light (the strike itself). */
  pillar(point: THREE.Vector3, radius: number, height: number, color: THREE.ColorRepresentation, duration = 0.45): void {
    const p = this.pillars.find(x => x.life <= 0);
    if (!p) return;
    p.life = p.duration = duration;
    p.mesh.position.copy(point);
    p.mesh.scale.set(radius, height, radius);
    p.mat.color.set(color);
    p.mesh.visible = true;
  }

  /**
   * Marks the ground now and calls `land` after `delay` seconds, even if whoever cast it
   * has since died — the light is already falling. Advanced by `fixedUpdate`.
   */
  schedule(point: THREE.Vector3, radius: number, delay: number, color: THREE.ColorRepresentation,
    land: (point: THREE.Vector3, radius: number) => void): void {
    this.circle(point, radius, delay, color);
    this.strikes.push({ point: point.clone(), radius, delay, color, land });
  }

  get pendingStrikes(): number {
    return this.strikes.length;
  }

  fixedUpdate(dt: number): void {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.delay -= dt;
      if (s.delay > 0) continue;
      this.strikes.splice(i, 1);
      this.pillar(s.point, s.radius * 0.85, 26, s.color);
      s.land(s.point, s.radius);
    }
  }

  get activeCount(): number {
    return this.markers.filter(m => m.active).length;
  }

  clear(): void {
    this.strikes.length = 0;
    for (const m of this.markers) { m.active = false; m.ring.visible = m.fill.visible = false; }
    for (const p of this.pillars) { p.life = 0; p.mesh.visible = false; }
  }

  update(dt: number, elapsed: number): void {
    for (const m of this.markers) {
      if (!m.active) continue;
      m.life += dt;
      const k = Math.min(1, m.life / m.duration);
      const r = m.fill.userData.radius as number;
      m.fill.scale.setScalar(Math.max(0.01, r * k));
      m.fillMat.opacity = 0.18 + 0.3 * k;
      m.ringMat.opacity = 0.55 + 0.45 * Math.abs(Math.sin(elapsed * (8 + k * 14)));
      if (m.life >= m.duration) { m.active = false; m.ring.visible = m.fill.visible = false; }
    }
    for (const p of this.pillars) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = Math.max(0, p.life / p.duration);
      p.mat.opacity = k * k;
      p.mesh.scale.x = p.mesh.scale.z = p.mesh.scale.x * (1 - dt * 1.5);
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}
