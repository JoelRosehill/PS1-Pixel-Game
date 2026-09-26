import * as THREE from 'three';
import { Random } from '../core/Random';

/**
 * Procedural pixel-art texture library. Every texture is painted pixel-by-pixel
 * from small colour ramps, tiles seamlessly, and is magnified with NEAREST so
 * foreground surfaces read as crisp hand-made pixel art.
 */

type RGBA = [number, number, number, number];

class PixelCanvas {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  private idx(x: number, y: number) {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    return (y * this.w + x) * 4;
  }
  set(x: number, y: number, c: RGBA | number, a = 255) {
    const i = this.idx(Math.floor(x), Math.floor(y));
    const [r, g, b, al] = typeof c === 'number' ? hexRGBA(c, a) : c;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = al;
  }
  get(x: number, y: number): RGBA {
    const i = this.idx(Math.floor(x), Math.floor(y));
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  fill(c: number) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
  }
  /** Multiply a pixel's RGB by k (shading). */
  shade(x: number, y: number, k: number) {
    const [r, g, b, a] = this.get(x, y);
    this.set(x, y, [r * k, g * k, b * k, a]);
  }
}

function hexRGBA(hex: number, a = 255): RGBA {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, a];
}

/** Tileable value noise on an integer lattice of `cells` per tile. */
function tileNoise(rng: Random, cells: number) {
  const g = Array.from({ length: cells * cells }, () => rng.next());
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (i: number, j: number) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function toTexture(pc: PixelCanvas, opts: { mipmaps?: boolean; srgb?: boolean } = {}): THREE.Texture {
  // Painters use image convention (y = 0 is the top row); GL textures start at the bottom.
  const flipped = new Uint8ClampedArray(pc.data.length);
  const row = pc.w * 4;
  for (let y = 0; y < pc.h; y++) flipped.set(pc.data.subarray(y * row, (y + 1) * row), (pc.h - 1 - y) * row);
  const tex = new THREE.DataTexture(flipped, pc.w, pc.h, THREE.RGBAFormat);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = opts.mipmaps === false ? THREE.NearestFilter : THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = opts.mipmaps !== false;
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

// ---------------------------------------------------------------------------

/** Near-white luminance detail for terrain; hue comes from vertex colours. */
export function groundDetail(): THREE.Texture {
  return cached('ground', () => {
    const rng = new Random('ground');
    const S = 64;
    const pc = new PixelCanvas(S, S);
    const n = tileNoise(rng, 8);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = 0.8 + n(x / S, y / S) * 0.14 + (rng.next() - 0.5) * 0.06;
        const c = Math.round(v * 255);
        pc.set(x, y, [c, c, c, 255]);
      }
    // grass tufts: short vertical strokes, light tip + dark root
    for (let i = 0; i < 150; i++) {
      const x = rng.int(0, S - 1);
      const y = rng.int(0, S - 1);
      const len = rng.int(2, 3);
      for (let k = 0; k < len; k++) pc.set(x, y + k, k === 0 ? 0xffffff : 0xe8e8e8);
      pc.set(x, y + len, 0xc4c4c4);
    }
    // pebbles / dark specks
    for (let i = 0; i < 40; i++) pc.set(rng.int(0, S), rng.int(0, S), 0xbababa);
    return toTexture(pc);
  });
}

/** Voronoi cobblestones with mortar, bevel light and moss (plaza, paths). */
export function cobblestone(): THREE.Texture {
  return cached('cobble', () => {
    const rng = new Random('cobble');
    const S = 64;
    const cells = 4;
    const pc = new PixelCanvas(S, S);
    const pts: { x: number; y: number; col: number }[] = [];
    const palette = [0x5c6672, 0x6b7682, 0x545e6c, 0x737e86, 0x626a78, 0x68727a];
    for (let j = 0; j < cells; j++)
      for (let i = 0; i < cells; i++)
        pts.push({
          x: (i + 0.5 + rng.signed() * 0.3) * (S / cells),
          y: (j + 0.5 + rng.signed() * 0.3) * (S / cells),
          col: rng.pick(palette),
        });
    const moss = tileNoise(rng, 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let d1 = 1e9;
        let d2 = 1e9;
        let best = pts[0];
        let bdx = 0;
        let bdy = 0;
        for (const p of pts)
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              const dx = x + 0.5 - (p.x + ox * S);
              const dy = y + 0.5 - (p.y + oy * S);
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < d1) {
                d2 = d1;
                d1 = d;
                best = p;
                bdx = dx;
                bdy = dy;
              } else if (d < d2) d2 = d;
            }
        const edge = d2 - d1;
        const m = moss(x / S, y / S);
        if (edge < 1.6) {
          pc.set(x, y, m > 0.55 ? 0x2f5a2c : 0x262a30);
          continue;
        }
        let [r, g, b] = hexRGBA(best.col);
        // bevel: light from top-left, shadow bottom-right near the edges
        const bevel = edge < 3.2 ? (bdx + bdy < 0 ? 1.18 : 0.78) : 1;
        const speck = 0.94 + rng.next() * 0.12;
        r *= bevel * speck;
        g *= bevel * speck;
        b *= bevel * speck;
        if (m > 0.62 && edge < 4 && rng.chance(0.6)) [r, g, b] = hexRGBA(rng.chance(0.5) ? 0x4f7f3a : 0x6a9a48);
        pc.set(x, y, [r, g, b, 255]);
      }
    return toTexture(pc);
  });
}

/** Coursed castle masonry, green-grey with creeping moss (castle walls, quays). */
export function castleStone(): THREE.Texture {
  return cached('castle', () => {
    const rng = new Random('castle');
    const S = 64;
    const pc = new PixelCanvas(S, S);
    const palette = [0x5f6b64, 0x6b7870, 0x56615a, 0x737f72, 0x646e6a];
    const moss = tileNoise(rng, 4);
    const bw = 16;
    const bh = 8;
    const brickCol = new Map<string, number>();
    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / bh);
      const off = row % 2 ? bw / 2 : 0;
      for (let x = 0; x < S; x++) {
        const bx = Math.floor((x + off) / bw);
        const lx = (x + off) % bw;
        const ly = y % bh;
        const key = `${bx % (S / bw)},${row}`;
        if (!brickCol.has(key)) brickCol.set(key, rng.pick(palette));
        if (ly === bh - 1 || lx === bw - 1) {
          pc.set(x, y, 0x2c3431);
          continue;
        }
        let [r, g, b] = hexRGBA(brickCol.get(key)!);
        let k = 0.93 + rng.next() * 0.12;
        if (ly === 0) k *= 1.16;
        if (ly === bh - 2) k *= 0.84;
        if (lx === 0) k *= 1.08;
        r *= k;
        g *= k;
        b *= k;
        const m = moss(x / S, y / S) + (y / S) * 0.25;
        if (m > 0.78 && rng.chance(0.75)) [r, g, b] = hexRGBA(rng.chance(0.5) ? 0x3f6a3a : 0x5b8a44);
        pc.set(x, y, [r, g, b, 255]);
      }
    }
    return toTexture(pc);
  });
}

/** Pale marble with fine veins (Sunkeeper columns). */
export function marble(): THREE.Texture {
  return cached('marble', () => {
    const rng = new Random('marble');
    const S = 32;
    const pc = new PixelCanvas(S, S);
    const n = tileNoise(rng, 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n(x / S, y / S);
        const vein = Math.abs(Math.sin((x / S + v * 0.9) * Math.PI * 3)) < 0.08;
        pc.set(x, y, vein ? 0xa89cb0 : v > 0.6 ? 0xe4dcd6 : v > 0.35 ? 0xd6cec8 : 0xc6beba);
      }
    return toTexture(pc);
  });
}

/** Scalloped slate shingles in violet (castle roofs). */
export function roofShingles(): THREE.Texture {
  return cached('roof', () => {
    const rng = new Random('roof');
    const S = 32;
    const pc = new PixelCanvas(S, S);
    const ramp = [0x3a1a5a, 0x5a2e86, 0x6a3a9a, 0x7e4ab0, 0x9a6ad0];
    const w = 8;
    const h = 6;
    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / h);
      const off = row % 2 ? w / 2 : 0;
      for (let x = 0; x < S; x++) {
        const lx = (x + off) % w;
        const ly = y % h;
        const dx = lx - (w - 1) / 2;
        const round = ly >= h - 2 && Math.abs(dx) > 2.5;
        let t = 3 - Math.floor((ly / h) * 2.2);
        if (lx === 0) t -= 1;
        if (round || ly === h - 1) t = 0;
        t += rng.chance(0.1) ? 1 : 0;
        pc.set(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, t))]);
      }
    }
    return toTexture(pc);
  });
}

/** Reddish pine bark with vertical fissures. */
export function bark(): THREE.Texture {
  return cached('bark', () => {
    const rng = new Random('bark');
    const W = 16;
    const H = 32;
    const pc = new PixelCanvas(W, H);
    const cols = [0x4e2a20, 0x6a3a2a, 0x7e4a32, 0x9a5e3e];
    const colShade = Array.from({ length: W }, () => rng.int(1, 2));
    for (let x = 0; x < W; x++) {
      let fissure = rng.chance(0.3);
      for (let y = 0; y < H; y++) {
        if (rng.chance(0.08)) fissure = !fissure;
        const t = fissure ? 0 : colShade[x] + (rng.chance(0.15) ? 1 : 0);
        pc.set(x, y, cols[Math.min(3, t)]);
      }
    }
    return toTexture(pc);
  });
}

/** Pine needle clusters for cone foliage. */
export function pineNeedles(): THREE.Texture {
  return cached('needles', () => {
    const rng = new Random('needles');
    const S = 32;
    const pc = new PixelCanvas(S, S);
    pc.fill(0x1c4234);
    for (let i = 0; i < 90; i++) {
      const x = rng.int(0, S);
      const y = rng.int(0, S);
      const c = rng.pick([0x2a6044, 0x2e6a48, 0x3e7e4c]);
      for (let k = 0; k < 3; k++) pc.set(x + k, y + k, c);
      pc.set(x + 3, y + 3, 0x12302a);
    }
    for (let i = 0; i < 26; i++) pc.set(rng.int(0, S), rng.int(0, S), rng.pick([0x6aa45a, 0x84b864]));
    return toTexture(pc);
  });
}

/** Grey-violet rock with cracks and lichen. */
export function rock(): THREE.Texture {
  return cached('rock', () => {
    const rng = new Random('rock');
    const S = 32;
    const pc = new PixelCanvas(S, S);
    const n = tileNoise(rng, 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n(x / S, y / S) + (rng.next() - 0.5) * 0.15;
        pc.set(x, y, v > 0.62 ? 0x8a8898 : v > 0.42 ? 0x72707e : v > 0.25 ? 0x5e5c6a : 0x4a4856);
      }
    for (let i = 0; i < 5; i++) {
      let x = rng.int(0, S);
      let y = rng.int(0, S);
      for (let k = 0; k < 10; k++) {
        pc.set(x, y, 0x34323e);
        x += rng.int(-1, 1);
        y += 1;
      }
    }
    for (let i = 0; i < 30; i++) pc.set(rng.int(0, S), rng.int(0, S), rng.pick([0x7a9a5a, 0xa0a860]));
    return toTexture(pc);
  });
}

/** Dark planks with iron bands (doors, bridges). */
export function woodPlanks(): THREE.Texture {
  return cached('wood', () => {
    const rng = new Random('wood');
    const S = 32;
    const pc = new PixelCanvas(S, S);
    for (let x = 0; x < S; x++) {
      const plank = Math.floor(x / 8);
      const base = [0x4a2a1a, 0x553020, 0x4e2c1c, 0x5a3422][plank % 4];
      for (let y = 0; y < S; y++) {
        let c = base;
        if (x % 8 === 0) c = 0x24140c;
        else if (rng.chance(0.12)) c = 0x3a2014;
        if (y === 6 || y === 25) c = 0x2a2a30;
        pc.set(x, y, c);
      }
    }
    return toTexture(pc);
  });
}

/** Alpha-cut grass tuft card. */
export function grassCard(): THREE.Texture {
  return cached('grasscard', () => {
    const rng = new Random('grasscard');
    const S = 32;
    const pc = new PixelCanvas(S, S);
    pc.fill(0x000000);
    for (let i = 0; i < S * S; i++) pc.data[i * 4 + 3] = 0;
    const ramp = [0x2e6a2e, 0x4a8a38, 0x6aac44, 0x8ac850, 0xb4e070];
    for (let b = 0; b < 11; b++) {
      let x = 4 + rng.next() * 24;
      const h = 10 + rng.next() * 20;
      const lean = rng.signed() * 0.35;
      for (let k = 0; k < h; k++) {
        const y = S - 1 - k;
        const t = Math.min(ramp.length - 1, Math.floor((k / h) * ramp.length));
        pc.set(x, y, ramp[t]);
        if (k < h * 0.4) pc.set(x + 1, y, ramp[Math.max(0, t - 1)]);
        x += lean;
      }
    }
    return toTexture(pc, { mipmaps: false });
  });
}

/** Alpha-cut flowering shrub card (red/pink blossoms, ref: pine coast + chromatic lake). */
export function flowerCard(): THREE.Texture {
  return cached('flowercard', () => {
    const rng = new Random('flowers');
    const S = 32;
    const pc = new PixelCanvas(S, S);
    for (let i = 0; i < S * S; i++) pc.data[i * 4 + 3] = 0;
    for (let i = 0; i < 260; i++) {
      const a = rng.next() * Math.PI;
      const r = Math.sqrt(rng.next()) * 14;
      const x = 16 + Math.cos(a) * r;
      const y = S - 1 - Math.sin(a) * r * 1.1;
      pc.set(x, y, rng.pick([0x1e4a2a, 0x2a5e30, 0x356a34]));
    }
    for (let i = 0; i < 70; i++) {
      const a = rng.next() * Math.PI;
      const r = Math.sqrt(rng.next()) * 13;
      const x = 16 + Math.cos(a) * r;
      const y = S - 2 - Math.sin(a) * r * 1.1;
      const c = rng.pick([0xff4a6a, 0xff7a9a, 0xd8284a, 0xffa0bc]);
      pc.set(x, y, c);
      if (rng.chance(0.5)) pc.set(x + 1, y, c);
    }
    return toTexture(pc, { mipmaps: false });
  });
}

/** 3x5 pixel font, scaled x2, for floating damage numbers. Cells are 8x10. */
const GLYPH_ROWS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
  '!': ['010', '010', '010', '000', '010'],
};
export const GLYPH_ORDER = '0123456789+!';
export const GLYPH_CELL = 8;
export const GLYPH_ATLAS_WIDTH = GLYPH_ORDER.length * GLYPH_CELL;
export const GLYPH_ATLAS_HEIGHT = 12;

export function glyphAtlas(): THREE.Texture {
  return cached('glyphs', () => {
    const pc = new PixelCanvas(GLYPH_ATLAS_WIDTH, GLYPH_ATLAS_HEIGHT);
    for (let i = 0; i < GLYPH_ATLAS_WIDTH * GLYPH_ATLAS_HEIGHT; i++) pc.data[i * 4 + 3] = 0;
    GLYPH_ORDER.split('').forEach((ch, i) => {
      const rows = GLYPH_ROWS[ch];
      const ox = i * GLYPH_CELL + 1;
      for (let r = 0; r < rows.length; r++)
        for (let c = 0; c < 3; c++) {
          if (rows[r][c] !== '1') continue;
          // x2 scale
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) pc.set(ox + c * 2 + dx, 1 + r * 2 + dy, 0xffffff);
        }
    });
    return toTexture(pc, { mipmaps: false });
  });
}
