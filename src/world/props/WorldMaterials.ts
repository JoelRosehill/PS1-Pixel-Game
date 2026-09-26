import * as THREE from 'three';
import { glow, toon, withWind } from '../../render/Materials';
import * as tex from '../../render/PixelTextures';

/** Shared material palette for world props — one instance per level. */
export function createWorldMaterials() {
  return {
    castle: toon({ map: tex.castleStone(), vertexColors: true }),
    trim: toon({ map: tex.castleStone(), color: 0xb8c4b8 }),
    roof: toon({ map: tex.roofShingles() }),
    marble: toon({ map: tex.marble() }),
    wood: toon({ map: tex.woodPlanks() }),
    cobble: toon({ map: tex.cobblestone() }),
    rock: toon({ map: tex.rock() }),
    darkStone: toon({ color: 0x2c2338 }),
    bark: toon({ map: tex.bark() }),
    needles: withWind(toon({ map: tex.pineNeedles() }), 0.012, 0.8),
    grass: withWind(
      toon({ map: tex.grassCard(), alphaTest: 0.5, side: THREE.DoubleSide }),
      0.14,
      1.2,
    ),
    flowers: withWind(
      toon({ map: tex.flowerCard(), alphaTest: 0.5, side: THREE.DoubleSide }),
      0.08,
      1.0,
    ),
    windowWarm: glow(0xffb85a, 2.6),
    windowDark: toon({ color: 0x14101c }),
    windowRed: glow(0xff2a44, 3.2),
    ember: glow(0xff6a1a, 5),
    emberHot: glow(0xffd070, 6),
    ash: toon({ color: 0x2a2224 }),
    steel: toon({ color: 0x9aa4b4 }),
    crystalPink: toon({ color: 0xff7ae0, emissive: 0xd0309a, emissiveIntensity: 1.4 }),
    crystalBlue: toon({ color: 0x7ae0ff, emissive: 0x2a8ad8, emissiveIntensity: 1.4 }),
    portalGlow: glow(0x7ffff0, 2.2),
  };
}

export type WorldMaterials = ReturnType<typeof createWorldMaterials>;
