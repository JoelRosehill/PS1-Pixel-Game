import { Random } from '../../core/Random';
import type { EncounterDef, SpawnDef } from '../../enemies/Encounters';
import type { Archetype } from '../biomes/BiomeTypes';
import type { FixedProp, ReservedMap } from './PropStreamer';
import type { WorldAtlas } from './WorldAtlas';

const NAMES: Record<Archetype, string[]> = {
  wilderness: ["Poacher's Hollow", 'Grey Pine Watch', 'The Mossy Muster', 'Lakeside Vigil', "The Hunter's Ring"],
  marsh: ['The Sunken Picket', 'Wisp-Lantern Camp', 'The Drowned Muster', 'Reedwall Watch', 'The Glowing Ford'],
  terrace: ['The Gilded Steps', 'Watch of the Low Sun', 'The Marble Choir', 'Dawnpool Vigil', 'The Sunward Post'],
  caverns: ['The Frozen Picket', 'Hall of Shards', 'The Icebound Muster', 'Rimefall Watch', 'The Singing Post'],
  bloodstone: ['The Red Muster', 'Ashen Gate Watch', 'The Bone Picket', 'Spire-Shadow Camp', 'The Weeping Door'],
};

/** Foes that keep their distance and cast (they rise further out). */
const RANGED = new Set(['sunkeeper', 'wizard']);

export interface Camps {
  encounters: EncounterDef[];
  dressing: FixedProp[];
}

/**
 * Enemy camps along the Long Road (Job 15): each biome's stretch holds `fauna.camps`
 * camps, spaced along the road and set a little to one side of it on dry, gentle ground,
 * raising that biome's Bestiary foes at the leg's level. Deterministic per site.
 */
export function generateCamps(atlas: WorldAtlas, heightAt: (x: number, z: number) => number, reserved: ReservedMap): Camps {
  const encounters: EncounterDef[] = [];
  const dressing: FixedProp[] = [];
  for (const site of atlas.sites) {
    const rng = new Random(`camps:${site.id}`);
    const fauna = site.biome.fauna;
    const foes = Object.entries(fauna.foes ?? { knight: fauna.knight ?? 1, wizard: fauna.wizard ?? 0 }).filter(([, w]) => w > 0);
    const total = foes.reduce((a, [, w]) => a + w, 0);
    const pick = () => {
      let r = rng.next() * total;
      for (const [id, w] of foes) if ((r -= w) <= 0) return id;
      return foes[0][0];
    };
    const wanted = fauna.camps ?? 2;
    const span = site.s1 - site.s0;
    let made = 0;
    for (let attempt = 0; attempt < 80 && made < wanted; attempt++) {
      // Spread along the leg: camp k aims for its own share of the road.
      const share = (made + 0.25 + rng.next() * 0.5) / wanted;
      const s = site.s0 + span * (0.1 + share * 0.8);
      const lateral = (rng.chance(0.5) ? 1 : -1) * rng.range(22, Math.min(70, site.leg.width * 0.5));
      const { x, z } = atlas.road.offset(s, lateral);
      const h = heightAt(x, z);
      if (h < 1) continue;
      let flat = true;
      for (let k = 0; k < 6 && flat; k++) {
        const ka = (k / 6) * Math.PI * 2;
        const hk = heightAt(x + Math.sin(ka) * 9, z + Math.cos(ka) * 9);
        if (Math.abs(hk - h) > 2.4 || hk < 0.6) flat = false;
      }
      if (!flat) continue;
      if (reserved.blocked(x, z, 12)) continue;
      if (atlas.gates.some(g => Math.hypot(g.x - x, g.z - z) < 120)) continue;
      reserved.add(x, z, 15);

      const waves: SpawnDef[][] = [];
      const waveCount = rng.int(fauna.waves[0], fauna.waves[1]);
      for (let w = 0; w < waveCount; w++) {
        const wave: SpawnDef[] = [];
        const size = rng.int(fauna.size[0], fauna.size[1]);
        for (let i = 0; i < size; i++) {
          const ea = (i / size) * Math.PI * 2 + w * 0.7 + rng.next() * 0.5;
          const kind = pick();
          const reach = (5 + rng.next() * 4) * (RANGED.has(kind) ? 1.6 : 1);
          // Rise on dry ground: turn around the camp until the spot is above water.
          let sx = x, sz = z;
          for (let k = 0; k < 8; k++) {
            const a = ea + k * 0.8;
            const px = x + Math.sin(a) * reach, pz = z + Math.cos(a) * reach;
            if (heightAt(px, pz) > 0.8) { sx = px; sz = pz; break; }
          }
          wave.push({ kind, x: sx, z: sz });
        }
        waves.push(wave);
      }
      const names = NAMES[site.biome.archetype];
      encounters.push({
        id: `camp:${site.id}:${made}`,
        name: names[(site.slot + made * 2) % names.length],
        trigger: { x, z, radius: 14 }, leash: 36, waves,
        level: site.leg.level,
        reward: { vigour: 30, momentum: 25 },
      });
      // Dressing: casters raise columns; the rest plant a rune stone and bones.
      const casters = waves.flat().filter(s => RANGED.has(s.kind)).length;
      if (casters < waves.flat().length / 2) {
        dressing.push({ kind: 'obelisk', x: x + 2, z: z - 1.5, scale: 5, rot: rng.next() * 6 });
        dressing.push({ kind: 'bones', x: x - 3, z: z + 2, scale: 1.6, rot: rng.next() * 6 });
      } else {
        for (let k = 0; k < 3; k++) {
          const ka = (k / 3) * Math.PI * 2 + 0.4;
          dressing.push({ kind: 'column', x: x + Math.sin(ka) * 4, z: z + Math.cos(ka) * 4, scale: 4 + k, rot: ka });
        }
      }
      made++;
    }
  }
  return { encounters, dressing };
}
