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

interface LineMarker {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  duration: number;
  active: boolean;
}

interface LineStrike {
  from: THREE.Vector3;
  to: THREE.Vector3;
  width: number;
  delay: number;
  land: (from: THREE.Vector3, to: THREE.Vector3, width: number) => void;
}

const MARKERS = 12;
const LINES = 10;
const PILLARS = 8;

export class Telegraphs {
  readonly group = new THREE.Group();
  private readonly markers: Marker[] = [];
  private readonly pillars: Pillar[] = [];
  private readonly strikes: Strike[] = [];
  private readonly lines: LineMarker[] = [];
  private readonly lineStrikes: LineStrike[] = [];

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
    // Lane markers: a unit quad along +Z, scaled to (width, 1, length).
    const laneGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    for (let i = 0; i < LINES; i++) {
      const lmat = mat();
      const mesh = new THREE.Mesh(laneGeo, lmat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.lines.push({ mesh, mat: lmat, life: 0, duration: 1, active: false });
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
    return this.strikes.length + this.lineStrikes.length;
  }

  /** A glowing lane on the ground from `from` to `to` (charges, breath runs, spike lines). */
  lane(from: THREE.Vector3, to: THREE.Vector3, width: number, duration: number, color: THREE.ColorRepresentation): void {
    const l = this.lines.find(x => !x.active);
    if (!l) return;
    l.active = true;
    l.life = 0;
    l.duration = duration;
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    l.mesh.position.set(from.x, Math.max(from.y, to.y) + 0.08, from.z);
    l.mesh.rotation.set(0, Math.atan2(to.x - from.x, to.z - from.z), 0);
    l.mesh.scale.set(width, 1, len);
    l.mat.color.set(color);
    l.mesh.visible = true;
  }

  /** Marks a lane now and calls `land` after `delay` seconds. */
  scheduleLane(from: THREE.Vector3, to: THREE.Vector3, width: number, delay: number, color: THREE.ColorRepresentation,
    land: (from: THREE.Vector3, to: THREE.Vector3, width: number) => void): void {
    this.lane(from, to, width, delay, color);
    this.lineStrikes.push({ from: from.clone(), to: to.clone(), width, delay, land });
  }

  fixedUpdate(dt: number): void {
    for (let i = this.lineStrikes.length - 1; i >= 0; i--) {
      const s = this.lineStrikes[i];
      s.delay -= dt;
      if (s.delay > 0) continue;
      this.lineStrikes.splice(i, 1);
      s.land(s.from, s.to, s.width);
    }
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
    this.lineStrikes.length = 0;
    for (const l of this.lines) { l.active = false; l.mesh.visible = false; }
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
    for (const l of this.lines) {
      if (!l.active) continue;
      l.life += dt;
      const k = Math.min(1, l.life / l.duration);
      l.mat.opacity = 0.25 + 0.55 * k * (0.6 + 0.4 * Math.abs(Math.sin(elapsed * (10 + k * 16))));
      if (l.life >= l.duration) { l.active = false; l.mesh.visible = false; }
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
