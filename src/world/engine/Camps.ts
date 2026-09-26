import { Random } from '../../core/Random';
import type { EncounterDef, SpawnDef } from '../../enemies/Encounters';
import type { Archetype } from '../biomes/BiomeTypes';
import type { FixedProp, ReservedMap } from './PropStreamer';
import { WORLD, type WorldAtlas } from './WorldAtlas';

const NAMES: Record<Archetype, string[]> = {
  wilderness: ["Poacher's Hollow", 'Grey Pine Watch', 'The Mossy Muster', 'Lakeside Vigil', 'The Hunter\'s Ring'],
  marsh: ['The Sunken Picket', 'Wisp-Lantern Camp', 'The Drowned Muster', 'Reedwall Watch', 'The Glowing Ford'],
  terrace: ['The Gilded Steps', 'Watch of the Low Sun', 'The Marble Choir', 'Dawnpool Vigil', 'The Sunward Post'],
  caverns: ['The Frozen Picket', 'Hall of Shards', 'The Icebound Muster', 'Rimefall Watch', 'The Singing Post'],
  bloodstone: ['The Red Muster', 'Ashen Gate Watch', 'The Bone Picket', 'Spire-Shadow Camp', 'The Weeping Door'],
};

export interface Camps {
  encounters: EncounterDef[];
  dressing: FixedProp[];
}

/**
 * Enemy camps for every biome site (Job 6 fauna): count from `fauna.campsPerKm2`,
 * placed on dry, gentle ground away from ridges, landmarks and each other; waves
 * and Knight/Wizard mix from the biome's fauna spec. Deterministic per site.
 */
export function generateCamps(atlas: WorldAtlas, heightAt: (x: number, z: number) => number, reserved: ReservedMap): Camps {
  const encounters: EncounterDef[] = [];
  const dressing: FixedProp[] = [];
  const placed: [number, number][] = [];
  for (const site of atlas.sites) {
    const rng = new Random(`camps:${site.id}`);
    const fauna = site.biome.fauna;
    const area = Math.PI * site.radius * site.radius;
    const wantedCamps = Math.max(1, Math.min(3, Math.round(fauna.campsPerKm2 * area / 1e6 * 2)));
    let made = 0;
    for (let attempt = 0; attempt < 60 && made < wantedCamps; attempt++) {
      const a = rng.next() * Math.PI * 2;
      const d = site.radius * rng.range(0.2, 0.85);
      const x = site.x + Math.sin(a) * d;
      const z = site.z + Math.cos(a) * d;
      if (Math.hypot(x, z) < WORLD.hubOuter + 120) continue;
      if (Math.hypot(x, z) > WORLD.edgeStart - 150) continue;
      const h = heightAt(x, z);
      if (h < 1) continue;
      let flat = true;
      for (let k = 0; k < 6 && flat; k++) {
        const ka = (k / 6) * Math.PI * 2;
        const hk = heightAt(x + Math.sin(ka) * 9, z + Math.cos(ka) * 9);
        if (Math.abs(hk - h) > 2.4 || hk < 0.6) flat = false;
      }
      if (!flat) continue;
      if (atlas.boundary(x, z).distance < 150) continue;
      if (reserved.blocked(x, z, 12)) continue;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 220)) continue;
      placed.push([x, z]);
      reserved.add(x, z, 15);

      const waves: SpawnDef[][] = [];
      const waveCount = rng.int(fauna.waves[0], fauna.waves[1]);
      for (let w = 0; w < waveCount; w++) {
        const wave: SpawnDef[] = [];
        const size = rng.int(fauna.size[0], fauna.size[1]);
        for (let i = 0; i < size; i++) {
          const ea = (i / size) * Math.PI * 2 + w * 0.7 + rng.next() * 0.5;
          const er = (5 + rng.next() * 4);
          const kind = rng.next() < fauna.knight / (fauna.knight + fauna.wizard) ? 'knight' : 'wizard';
          const reach = er * (kind === 'wizard' ? 1.6 : 1);
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
        trigger: { x, z, radius: 13 }, leash: 34, waves,
        reward: { vigour: 30, momentum: 25 },
      });
      // Dressing: knights plant a bone totem and a rune stone; wizards raise columns.
      const knights = waves.flat().filter(s => s.kind === 'knight').length;
      if (knights >= waves.flat().length / 2) {
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
