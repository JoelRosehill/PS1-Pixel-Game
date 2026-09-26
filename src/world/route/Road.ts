/**
 * The Long Road (Job 15): one authored route from Hollowmere on the western rim to the
 * foot of the Dawnspire at the centre of the world. It is an Archimedean spiral turning
 * clockwise inward (arms ~2.4 km apart, so the mountains between them are colossal),
 * bent by gentle meanders, ending in a straight approach to the spire.
 *
 * Everything in the world is laid out by arc length `s` along the road: biomes, chapter
 * gates, camps, shrines and structures. `nearest()` answers "where along the road, and
 * how far from it" for any point — the terrain, props and mood all ask it.
 */

export interface RoadHit {
  /** Arc length (m) of the closest road point. */
  s: number;
  /** Distance (m) from the road's centre line. */
  d: number;
  /** +1 when the point is left of the direction of travel, −1 right. */
  side: number;
  /** Closest road point. */
  x: number;
  z: number;
  /** Unit tangent (direction of travel) there. */
  tx: number;
  tz: number;
}

export const ROAD = {
  /** Spiral radius at the start (Hollowmere) and where the spiral hands over to the approach. */
  outer: 3900,
  inner: 640,
  /** The approach ends on the Dawnspire's plaza, this far from the centre. */
  plaza: 230,
  /** Sample spacing (m). */
  step: 8,
  /** World half-extent covered by the lookup grid. */
  extent: 4700,
} as const;

const CELL = 200;

export class Road {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  /** Per-sample tangent. */
  readonly txs: Float64Array;
  readonly tzs: Float64Array;
  readonly length: number;
  readonly count: number;
  private readonly cells: Int32Array[] = [];
  private readonly gridN: number;

  /**
   * @param total  arc length of the spiral part (the approach adds its own length)
   * @param meander lateral offset (m) as a function of arc length
   */
  constructor(total: number, meander: (s: number) => number) {
    const R0 = ROAD.outer, R1 = ROAD.inner;
    // Archimedean spiral r = R0 − cθ whose length is `total` between R0 and R1.
    const theta = (2 * total) / (R0 + R1);
    const c = (R0 - R1) / theta;
    const az0 = -Math.PI / 2; // due west
    const pts: [number, number][] = [];
    // Dense raw samples of the spiral, then the meander along its normal.
    const raw: [number, number][] = [];
    const fine = 2;
    for (let s = 0; s <= total + 1e-6; s += fine) {
      const th = (R0 - Math.sqrt(Math.max(0, R0 * R0 - 2 * c * s))) / c;
      const r = R0 - c * th;
      const az = az0 + th;
      raw.push([Math.sin(az) * r, -Math.cos(az) * r]);
    }
    for (let i = 0; i < raw.length; i++) {
      const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      // Fade the meander out at both ends so the start and the approach line up.
      const s = i * fine;
      const k = Math.min(1, s / 300, (total - s) / 300);
      const m = meander(s) * Math.max(0, k);
      // Offset along the right-hand normal (the sign is irrelevant: the meander is a wave).
      pts.push([raw[i][0] - tz * m, raw[i][1] + tx * m]);
    }
    // The approach: from the spiral's end the road bends (no tighter than a 260 m radius, so
    // the valley around it never folds over itself) toward the centre, to the plaza's edge.
    {
      let [x, z] = pts[pts.length - 1];
      const [px, pz] = pts[pts.length - 2];
      let hx = x - px, hz = z - pz;
      const hl = Math.hypot(hx, hz);
      hx /= hl; hz /= hl;
      const maxTurn = fine / 260;
      for (let i = 0; i < 4000 && Math.hypot(x, z) > ROAD.plaza; i++) {
        const r = Math.hypot(x, z);
        const want = Math.atan2(-x / r, -z / r);
        const have = Math.atan2(hx, hz);
        const diff = Math.atan2(Math.sin(want - have), Math.cos(want - have));
        const heading = have + Math.max(-maxTurn, Math.min(maxTurn, diff));
        hx = Math.sin(heading); hz = Math.cos(heading);
        x += hx * fine; z += hz * fine;
        pts.push([x, z]);
      }
    }

    // Resample at a constant step by true arc length (the meander stretched it).
    const out: number[] = [];
    let acc = 0, next = 0;
    out.push(pts[0][0], pts[0][1]);
    next = ROAD.step;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const seg = Math.hypot(bx - ax, bz - az);
      while (acc + seg >= next) {
        const t = (next - acc) / seg;
        out.push(ax + (bx - ax) * t, az + (bz - az) * t);
        next += ROAD.step;
      }
      acc += seg;
    }
    this.count = out.length / 2;
    this.xs = new Float64Array(this.count);
    this.zs = new Float64Array(this.count);
    this.txs = new Float64Array(this.count);
    this.tzs = new Float64Array(this.count);
    for (let i = 0; i < this.count; i++) { this.xs[i] = out[i * 2]; this.zs[i] = out[i * 2 + 1]; }
    for (let i = 0; i < this.count; i++) {
      const a = Math.max(0, i - 1), b = Math.min(this.count - 1, i + 1);
      const tx = this.xs[b] - this.xs[a], tz = this.zs[b] - this.zs[a];
      const l = Math.hypot(tx, tz) || 1;
      this.txs[i] = tx / l; this.tzs[i] = tz / l;
    }
    this.length = (this.count - 1) * ROAD.step;

    // Lookup grid: for each cell, every segment that could be the nearest to a point in it.
    this.gridN = Math.ceil((ROAD.extent * 2) / CELL);
    const half = (CELL * Math.SQRT2) / 2;
    const d = new Float64Array(this.count - 1);
    for (let gz = 0; gz < this.gridN; gz++)
      for (let gx = 0; gx < this.gridN; gx++) {
        const cx = -ROAD.extent + (gx + 0.5) * CELL, cz = -ROAD.extent + (gz + 0.5) * CELL;
        let best = Infinity;
        for (let i = 0; i < this.count - 1; i++) {
          d[i] = this.segDist(i, cx, cz);
          if (d[i] < best) best = d[i];
        }
        const list: number[] = [];
        for (let i = 0; i < this.count - 1; i++) if (d[i] <= best + half * 2) list.push(i);
        this.cells.push(Int32Array.from(list));
      }
  }

  private segDist(i: number, x: number, z: number): number {
    const ax = this.xs[i], az = this.zs[i];
    const dx = this.xs[i + 1] - ax, dz = this.zs[i + 1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  }

  /** Closest point on the road to (x, z). */
  nearest(x: number, z: number, out: RoadHit = { s: 0, d: 0, side: 1, x: 0, z: 0, tx: 1, tz: 0 }): RoadHit {
    const gx = Math.floor((x + ROAD.extent) / CELL), gz = Math.floor((z + ROAD.extent) / CELL);
    const inside = gx >= 0 && gz >= 0 && gx < this.gridN && gz < this.gridN;
    const list = inside ? this.cells[gz * this.gridN + gx] : null;
    let best = Infinity, bi = 0, bt = 0;
    const test = (i: number) => {
      const ax = this.xs[i], az = this.zs[i];
      const dx = this.xs[i + 1] - ax, dz = this.zs[i + 1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const px = ax + dx * t - x, pz = az + dz * t - z;
      const dd = px * px + pz * pz;
      if (dd < best) { best = dd; bi = i; bt = t; }
    };
    if (list) for (let k = 0; k < list.length; k++) test(list[k]);
    else for (let i = 0; i < this.count - 1; i += 4) test(i);
    const ax = this.xs[bi], az = this.zs[bi];
    out.x = ax + (this.xs[bi + 1] - ax) * bt;
    out.z = az + (this.zs[bi + 1] - az) * bt;
    out.s = (bi + bt) * ROAD.step;
    out.d = Math.sqrt(best);
    out.tx = this.txs[bi] + (this.txs[bi + 1] - this.txs[bi]) * bt;
    out.tz = this.tzs[bi] + (this.tzs[bi + 1] - this.tzs[bi]) * bt;
    const l = Math.hypot(out.tx, out.tz) || 1;
    out.tx /= l; out.tz /= l;
    // Left of travel: cross(t, p − road) > 0 in the x-right / z-south plane.
    out.side = out.tx * (z - out.z) - out.tz * (x - out.x) < 0 ? 1 : -1;
    return out;
  }

  /** Road point at arc length `s` (clamped). */
  pointAt(s: number, out: { x: number; z: number; tx: number; tz: number } = { x: 0, z: 0, tx: 1, tz: 0 }) {
    const f = Math.max(0, Math.min(this.count - 1.0001, s / ROAD.step));
    const i = Math.floor(f), t = f - i;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    out.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t;
    out.tx = this.txs[i] + (this.txs[i + 1] - this.txs[i]) * t;
    out.tz = this.tzs[i] + (this.tzs[i + 1] - this.tzs[i]) * t;
    const l = Math.hypot(out.tx, out.tz) || 1;
    out.tx /= l; out.tz /= l;
    return out;
  }

  /**
   * A point beside the road: `lateral` metres to the left (negative: right) of the road
   * at arc length `s`.
   */
  offset(s: number, lateral: number): { x: number; z: number; tx: number; tz: number } {
    const p = this.pointAt(s);
    const l = this.leftNormal(p.tx, p.tz);
    return { x: p.x + l[0] * lateral, z: p.z + l[1] * lateral, tx: p.tx, tz: p.tz };
  }

  /** Left of travel for a tangent (x right, z toward the viewer's back). */
  leftNormal(tx: number, tz: number): [number, number] {
    return [tz, -tx];
  }
}
