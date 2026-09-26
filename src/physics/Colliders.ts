import * as THREE from 'three';

/**
 * Static collision world.
 *
 * The terrain is an analytic height function, so ground contact is exact and free.
 * Props register cheap primitives (oriented boxes, vertical cylinders, spheres) into a
 * uniform grid. The character controller resolves a capsule as a stack of spheres
 * against whatever the grid returns, which is fast and completely predictable —
 * the movement in this game is tuned, not simulated.
 */

export interface Contact {
  normal: THREE.Vector3;
  depth: number;
}

interface ColliderBase {
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** Streaming group this collider belongs to (removable together). */
  group?: string;
  /** Physical character body; spell damage queries handle these separately. */
  body?: boolean;
}

interface BoxCollider extends ColliderBase {
  kind: 'box';
  center: THREE.Vector3;
  half: THREE.Vector3;
  /** Rotation basis columns (world axes of the box). */
  ax: THREE.Vector3;
  ay: THREE.Vector3;
  az: THREE.Vector3;
}

interface CylinderCollider extends ColliderBase {
  kind: 'cyl';
  center: THREE.Vector3;
  radius: number;
  halfHeight: number;
}

interface SphereCollider extends ColliderBase {
  kind: 'sph';
  center: THREE.Vector3;
  radius: number;
}

type Collider = BoxCollider | CylinderCollider | SphereCollider;

/**
 * A moving character body (enemies). Vertical cylinder from `position` (feet) up to
 * `height`. Bodies are few, so they are tested linearly instead of living in the grid;
 * the owner mutates `position` and `active` directly.
 */
export interface DynamicBody {
  readonly position: THREE.Vector3;
  radius: number;
  height: number;
  active: boolean;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _local = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class ColliderWorld {
  private colliders: (Collider | null)[] = [];
  private readonly groups = new Map<string, number[]>();
  private activeGroup: string | undefined;
  private live = 0;
  private readonly bodies: DynamicBody[] = [];
  private grid = new Map<number, number[]>();
  private readonly cell = 8;
  // Penetration tests use _v internally. A march point must not alias that scratch
  // vector, otherwise testing one box corrupts the point for the next collider.
  private readonly sweepPoint = new THREE.Vector3();
  /** Transform applied to everything added while a builder is active. */
  private offset = new THREE.Vector3();
  private rotY = 0;

  constructor(readonly heightAt: (x: number, z: number) => number) {}

  get count(): number {
    return this.live;
  }

  /**
   * Colliders added until `endGroup()` belong to `name` and can be removed together
   * with `removeGroup(name)` (streamed prop cells).
   */
  beginGroup(name: string): void {
    this.activeGroup = name;
  }

  endGroup(): void {
    this.activeGroup = undefined;
  }

  hasGroup(name: string): boolean {
    return this.groups.has(name);
  }

  removeGroup(name: string): void {
    const list = this.groups.get(name);
    if (!list) return;
    this.groups.delete(name);
    for (const index of list) {
      const c = this.colliders[index];
      if (!c) continue;
      this.forCells(c, (key) => {
        const cell = this.grid.get(key);
        if (!cell) return;
        const at = cell.indexOf(index);
        if (at >= 0) { cell[at] = cell[cell.length - 1]; cell.pop(); }
        if (cell.length === 0) this.grid.delete(key);
      });
      this.colliders[index] = null;
      this.free.push(index);
      this.live--;
    }
  }

  private readonly free: number[] = [];

  private forCells(c: Collider, fn: (key: number) => void): void {
    const x0 = Math.floor(c.min.x / this.cell);
    const x1 = Math.floor(c.max.x / this.cell);
    const z0 = Math.floor(c.min.z / this.cell);
    const z1 = Math.floor(c.max.z / this.cell);
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) fn(gx * 73856093 + gz * 19349663);
  }

  /** Builders add colliders in local space between push/pop. */
  push(position: THREE.Vector3, rotY = 0): void {
    this.offset.copy(position);
    this.rotY = rotY;
  }

  pop(): void {
    this.offset.set(0, 0, 0);
    this.rotY = 0;
  }

  private toWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.rotY);
    const s = Math.sin(this.rotY);
    return out.set(this.offset.x + x * c + z * s, this.offset.y + y, this.offset.z + (-x * s + z * c));
  }

  addBox(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    rotY = 0, rotX = 0, rotZ = 0,
  ): void {
    const center = this.toWorld(x, y, z, new THREE.Vector3());
    _q.setFromEuler(new THREE.Euler(rotX, rotY + this.rotY, rotZ, 'YXZ'));
    _m.makeRotationFromQuaternion(_q);
    const e = _m.elements;
    const ax = new THREE.Vector3(e[0], e[1], e[2]);
    const ay = new THREE.Vector3(e[4], e[5], e[6]);
    const az = new THREE.Vector3(e[8], e[9], e[10]);
    const half = new THREE.Vector3(w / 2, h / 2, d / 2);
    // Conservative AABB from the projected extents.
    const ex = Math.abs(ax.x) * half.x + Math.abs(ay.x) * half.y + Math.abs(az.x) * half.z;
    const ey = Math.abs(ax.y) * half.x + Math.abs(ay.y) * half.y + Math.abs(az.y) * half.z;
    const ez = Math.abs(ax.z) * half.x + Math.abs(ay.z) * half.y + Math.abs(az.z) * half.z;
    this.add({
      kind: 'box',
      center, half, ax, ay, az,
      min: new THREE.Vector3(center.x - ex, center.y - ey, center.z - ez),
      max: new THREE.Vector3(center.x + ex, center.y + ey, center.z + ez),
    });
  }

  addCylinder(x: number, y: number, z: number, radius: number, height: number, body = false): void {
    const center = this.toWorld(x, y, z, new THREE.Vector3());
    const halfHeight = height / 2;
    this.add({
      kind: 'cyl',
      center, radius, halfHeight, body,
      min: new THREE.Vector3(center.x - radius, center.y - halfHeight, center.z - radius),
      max: new THREE.Vector3(center.x + radius, center.y + halfHeight, center.z + radius),
    });
  }

  addSphere(x: number, y: number, z: number, radius: number): void {
    const center = this.toWorld(x, y, z, new THREE.Vector3());
    this.add({
      kind: 'sph',
      center, radius,
      min: new THREE.Vector3(center.x - radius, center.y - radius, center.z - radius),
      max: new THREE.Vector3(center.x + radius, center.y + radius, center.z + radius),
    });
  }

  addBody(body: DynamicBody): void {
    if (!this.bodies.includes(body)) this.bodies.push(body);
  }

  removeBody(body: DynamicBody): void {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  get bodyCount(): number {
    return this.bodies.length;
  }

  /** Penetration of a sphere into a dynamic body's cylinder, or null. */
  private bodyPenetration(b: DynamicBody, center: THREE.Vector3, radius: number): Contact | null {
    if (!b.active) return null;
    const half = b.height / 2;
    const dx = center.x - b.position.x;
    const dz = center.z - b.position.z;
    const dy = center.y - (b.position.y + half);
    const horiz = Math.hypot(dx, dz);
    const hDepth = b.radius + radius - horiz;
    const vDepth = half + radius - Math.abs(dy);
    if (hDepth <= 0 || vDepth <= 0) return null;
    if (vDepth < hDepth) return { normal: new THREE.Vector3(0, Math.sign(dy) || 1, 0), depth: vDepth };
    const normal = horiz > 1e-5 ? new THREE.Vector3(dx / horiz, 0, dz / horiz) : new THREE.Vector3(1, 0, 0);
    return { normal, depth: hDepth };
  }

  private add(c: Collider): void {
    const index = this.free.length ? this.free.pop()! : this.colliders.length;
    this.colliders[index] = c;
    this.live++;
    if (this.activeGroup) {
      c.group = this.activeGroup;
      let list = this.groups.get(this.activeGroup);
      if (!list) this.groups.set(this.activeGroup, (list = []));
      list.push(index);
    }
    this.forCells(c, (key) => {
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(index);
    });
  }

  /** Collider indices overlapping a world-space AABB (may contain duplicates). */
  private queryIndices(min: THREE.Vector3, max: THREE.Vector3, out: Set<number>): Set<number> {
    out.clear();
    const x0 = Math.floor(min.x / this.cell);
    const x1 = Math.floor(max.x / this.cell);
    const z0 = Math.floor(min.z / this.cell);
    const z1 = Math.floor(max.z / this.cell);
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) {
        const list = this.grid.get(gx * 73856093 + gz * 19349663);
        if (!list) continue;
        for (const i of list) {
          const c = this.colliders[i]!;
          if (c.max.x < min.x || c.min.x > max.x || c.max.y < min.y || c.min.y > max.y || c.max.z < min.z || c.min.z > max.z)
            continue;
          out.add(i);
        }
      }
    return out;
  }

  private readonly scratch = new Set<number>();
  private readonly qMin = new THREE.Vector3();
  private readonly qMax = new THREE.Vector3();

  /**
   * Pushes a sphere out of every collider it overlaps, moving `center` in place.
   * Contact normals (pointing away from the surface) are appended to `contacts`.
   */
  resolveSphere(center: THREE.Vector3, radius: number, contacts: Contact[], ignore?: DynamicBody): void {
    this.qMin.set(center.x - radius, center.y - radius, center.z - radius);
    this.qMax.set(center.x + radius, center.y + radius, center.z + radius);
    const near = this.queryIndices(this.qMin, this.qMax, this.scratch);
    for (const i of near) {
      const c = this.colliders[i]!;
      const hit = this.penetration(c, center, radius);
      if (!hit) continue;
      center.addScaledVector(hit.normal, hit.depth);
      contacts.push(hit);
    }
    for (const b of this.bodies) {
      if (b === ignore) continue;
      const hit = this.bodyPenetration(b, center, radius);
      if (!hit) continue;
      center.addScaledVector(hit.normal, hit.depth);
      contacts.push(hit);
    }
  }

  /** Penetration of a sphere into one collider, or null. */
  private penetration(c: Collider, center: THREE.Vector3, radius: number): Contact | null {
    if (c.kind === 'sph') {
      _v.subVectors(center, c.center);
      const d = _v.length();
      const depth = radius + c.radius - d;
      if (depth <= 0) return null;
      const normal = d > 1e-5 ? _v.clone().divideScalar(d) : new THREE.Vector3(0, 1, 0);
      return { normal, depth };
    }

    if (c.kind === 'cyl') {
      const dx = center.x - c.center.x;
      const dz = center.z - c.center.z;
      const dy = center.y - c.center.y;
      const horiz = Math.hypot(dx, dz);
      const hDepth = c.radius + radius - horiz;
      const vDepth = c.halfHeight + radius - Math.abs(dy);
      if (hDepth <= 0 || vDepth <= 0) return null;
      if (vDepth < hDepth) {
        return { normal: new THREE.Vector3(0, Math.sign(dy) || 1, 0), depth: vDepth };
      }
      const inv = horiz > 1e-5 ? 1 / horiz : 0;
      const normal = horiz > 1e-5 ? new THREE.Vector3(dx * inv, 0, dz * inv) : new THREE.Vector3(1, 0, 0);
      return { normal, depth: hDepth };
    }

    // Oriented box: work in the box's local frame.
    _v.subVectors(center, c.center);
    _local.set(_v.dot(c.ax), _v.dot(c.ay), _v.dot(c.az));
    _closest.set(
      THREE.MathUtils.clamp(_local.x, -c.half.x, c.half.x),
      THREE.MathUtils.clamp(_local.y, -c.half.y, c.half.y),
      THREE.MathUtils.clamp(_local.z, -c.half.z, c.half.z),
    );
    const inside = _closest.equals(_local);
    if (inside) {
      // Deepest-axis escape.
      const px = c.half.x - Math.abs(_local.x);
      const py = c.half.y - Math.abs(_local.y);
      const pz = c.half.z - Math.abs(_local.z);
      let axis = c.ax;
      let depth = px;
      let sign = Math.sign(_local.x) || 1;
      if (py < depth) {
        axis = c.ay;
        depth = py;
        sign = Math.sign(_local.y) || 1;
      }
      if (pz < depth) {
        axis = c.az;
        depth = pz;
        sign = Math.sign(_local.z) || 1;
      }
      return { normal: axis.clone().multiplyScalar(sign), depth: depth + radius };
    }
    _v2.subVectors(_local, _closest);
    const dist = _v2.length();
    const depth = radius - dist;
    if (depth <= 0) return null;
    _v2.divideScalar(dist);
    const normal = new THREE.Vector3()
      .addScaledVector(c.ax, _v2.x)
      .addScaledVector(c.ay, _v2.y)
      .addScaledVector(c.az, _v2.z)
      .normalize();
    return { normal, depth };
  }

  /**
   * Deepest contact for a sphere without moving it. The character controller uses this
   * when probing downward, so ground snapping keeps the real surface normal (slides
   * need it to accelerate downhill).
   */
  deepestContact(center: THREE.Vector3, radius: number, ignore?: DynamicBody): Contact | null {
    this.qMin.set(center.x - radius, center.y - radius, center.z - radius);
    this.qMax.set(center.x + radius, center.y + radius, center.z + radius);
    let best: Contact | null = null;
    for (const i of this.queryIndices(this.qMin, this.qMax, this.scratch)) {
      const hit = this.penetration(this.colliders[i]!, center, radius);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
    for (const b of this.bodies) {
      if (b === ignore) continue;
      const hit = this.bodyPenetration(b, center, radius);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
    return best;
  }

  /** True if a sphere at this position overlaps anything (used for stand-up / step checks). */
  overlaps(center: THREE.Vector3, radius: number, ignoreBodies = false): boolean {
    this.qMin.set(center.x - radius, center.y - radius, center.z - radius);
    this.qMax.set(center.x + radius, center.y + radius, center.z + radius);
    for (const i of this.queryIndices(this.qMin, this.qMax, this.scratch)) {
      const c = this.colliders[i]!;
      if (ignoreBodies && c.body) continue;
      if (this.penetration(c, center, radius)) return true;
    }
    if (!ignoreBodies) for (const b of this.bodies) if (this.bodyPenetration(b, center, radius)) return true;
    return false;
  }

  /**
   * Marches a sphere from `from` to `to` and returns the fraction (0..1) it can travel
   * before hitting geometry or the terrain. Used by the camera boom.
   */
  sweepSphere(from: THREE.Vector3, to: THREE.Vector3, radius: number, steps = 12, ignoreBodies = false): number {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.sweepPoint.lerpVectors(from, to, t);
      if (this.sweepPoint.y < this.heightAt(this.sweepPoint.x, this.sweepPoint.z) + radius) return Math.max(0, (i - 1) / steps);
      if (this.overlaps(this.sweepPoint, radius, ignoreBodies)) return Math.max(0, (i - 1) / steps);
    }
    return 1;
  }

  /** Terrain surface normal from finite differences. */
  terrainNormal(x: number, z: number, out: THREE.Vector3, e = 0.4): THREE.Vector3 {
    const hx = this.heightAt(x - e, z) - this.heightAt(x + e, z);
    const hz = this.heightAt(x, z - e) - this.heightAt(x, z + e);
    return out.set(hx, 2 * e, hz).normalize();
  }
}
