import * as THREE from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { EncounterDef } from '../enemies/Encounters';
import type { ColliderWorld } from '../physics/Colliders';
import type { Atmosphere } from '../render/Atmosphere';
import { Progress } from '../core/Progress';
import { ChapterGates } from './engine/ChapterGates';
import type { BossArenaDef } from '../enemies/bosses/BossArena';
import type { BossDef } from '../enemies/bosses/Boss';
import { GLOOMHORN } from '../enemies/bosses/Gloomhorn';
import { SOVEREIGN } from '../enemies/bosses/Sovereign';
import { VERMILION } from '../enemies/bosses/Vermilion';
import { rangeUniforms } from '../render/Materials';
import { buildBiomeLandmark, type Landmark, type LightAnchor } from './biomes/BiomeLandmarks';
import { CHAPTERS, roman } from './biomes/Chapters';
import { Ambience } from './engine/Ambience';
import { generateCamps } from './engine/Camps';
import { PropLibrary } from './engine/PropLibrary';
import { PropStreamer, ReservedMap } from './engine/PropStreamer';
import { TerrainStreamer } from './engine/TerrainStreamer';
import { type BiomeSite, type ChapterDef, WorldAtlas } from './engine/WorldAtlas';
import { WorldTerrain } from './engine/WorldTerrain';
import type { Level } from './Level';
import { ProvingGrounds, ThresholdTerrain } from './ProvingGrounds';
import { buildWater } from './Water';
import { StoryProps } from './StoryProps';

/**
 * The streamed world (Job 6): The Threshold as the hub at the centre, eight chapter
 * sectors of biomes around it, one analytic ground function, quadtree terrain, streamed
 * props, per-site landmarks and enemy camps, biome-driven sky, fog and motes.
 * Implements `Level`, so the game, AI and tests use it exactly like the old diorama.
 */
export class World implements Level {
  readonly name = 'The Threshold and the Eight Chapters';
  readonly root = new THREE.Group();
  readonly hub: ProvingGrounds;
  readonly atlas: WorldAtlas;
  readonly terrain: WorldTerrain;
  readonly tiles: TerrainStreamer;
  readonly props: PropStreamer;
  readonly landmarks: Landmark[] = [];
  readonly reserved = new ReservedMap();
  readonly ambience: Ambience;
  readonly encounters: EncounterDef[];
  readonly gates: ChapterGates;
  /** Shrines, lore tablets and memorials (Job 9). */
  readonly story: StoryProps;
  /** Where the bosses wait (Job 8). */
  readonly bossArenas: BossArenaDef[] = [];
  readonly biomeDriven = true;
  /** Hint from a closed chapter gate near the viewer ('' when none). */
  gateHint = '';
  /** Title-card hook: fired when the viewer settles into a new region. */
  onRegion: (title: string, subtitle: string) => void = () => {};
  /** Region the viewer is in ('hub' or a site id). */
  region = 'hub';

  private readonly water: THREE.Mesh;
  private readonly viewer = new THREE.Vector3();
  private readonly mood = new Map<string, number>();
  private candidate = 'hub';
  private candidateTime = 0;
  private readonly anchors: LightAnchor[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private lightTimer = 0;

  constructor(private readonly atmosphere: Atmosphere, readonly progress: Progress = new Progress(), chapters: ChapterDef[] = CHAPTERS) {
    this.atlas = new WorldAtlas(chapters);
    const ground = new ThresholdTerrain();
    this.terrain = new WorldTerrain(this.atlas, ground);
    this.hub = new ProvingGrounds(atmosphere, { ground, heightAt: this.terrain.heightAt, embedded: true });
    this.root.add(this.hub.root);
    const col = this.colliders;

    for (const site of this.atlas.sites) {
      const lm = buildBiomeLandmark(site, this.hub.materials, col, this.terrain.heightAt);
      this.landmarks.push(lm);
      this.root.add(lm.group);
      this.reserved.add(lm.x, lm.z, lm.clearance);
      this.anchors.push(...lm.lights);
    }
    for (const pass of this.atlas.passes) this.reserved.add(pass.x, pass.z, 45);
    // Boss arenas: the flattest dry ground near a landmark in each boss's chapter.
    for (const [boss, preferred, radius] of [
      [GLOOMHORN, ['c2-4', 'c2-3', 'c2-1', 'c2-2', 'c2-0'], 34],
      [VERMILION, ['c5-0', 'c5-3', 'c5-1', 'c5-2', 'c5-4'], 36],
      [SOVEREIGN, ['c8-4', 'c8-3', 'c8-1', 'c8-2', 'c8-0'], 34],
    ] as [BossDef, string[], number][]) {
      const center = this.findArena(preferred, radius);
      this.bossArenas.push({ boss, center, radius });
      this.reserved.add(center.x, center.z, radius + 8);
    }
    this.reserved.add(this.hub.citadelAt.x, this.hub.citadelAt.z, 360);

    this.story = new StoryProps(this.atlas, this.landmarks, this.hub.shrine, this.hub.materials, this.terrain.heightAt, this.reserved);
    this.root.add(this.story.group);

    const camps = generateCamps(this.atlas, this.terrain.heightAt, this.reserved);
    this.encounters = [...(this.hub.encounters ?? []), ...camps.encounters];

    this.gates = new ChapterGates(this.atlas, this.terrain.heightAt, col, progress, camps.encounters.map(e => e.id), this.hub.materials);
    this.gates.bossRequirement = chapter => {
      const arena = this.bossArenas.find(a => a.boss.chapter === chapter);
      if (!arena || progress.bosses.has(arena.boss.id)) return { met: true, text: '' };
      return { met: false, text: `The mist answers to ${arena.boss.name}, ${arena.boss.epithet}. Defeat it in ${this.atlas.chapters[chapter - 1].name}.` };
    };
    this.gates.onOpen = gate => this.onRegion('THE MIST PARTS', `The way to Chapter ${roman(gate.to)} · ${this.atlas.chapters[gate.to - 1].name} lies open`);
    this.root.add(this.gates.group);

    this.props = new PropStreamer(new PropLibrary(this.hub.materials), this.atlas, this.terrain.heightAt, col, this.reserved);
    for (const d of camps.dressing) this.props.addFixed(d);
    this.tiles = new TerrainStreamer(this.terrain.heightAt, this.terrain.colorAt);
    this.water = buildWater(atmosphere, 7000, 0);
    this.ambience = new Ambience(this.terrain);
    this.root.add(this.tiles.group, this.props.group, this.water, this.ambience.points);

    // A small, constant pool of point lights lent to the nearest landmark anchors
    // (a fixed light count keeps every shader's light loop the same size).
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      this.lights.push(light);
      this.root.add(light);
    }
  }

  // --- Level contract ------------------------------------------------------

  get skyPreset(): string { return this.hub.skyPreset; }
  get spawn() { return this.hub.spawn; }
  get colliders(): ColliderWorld { return this.hub.colliders; }
  get enemies() { return this.hub.enemies; }
  get lostPage(): THREE.Object3D { return this.hub.lostPage; }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  /** The flattest dry circle of `radius` near the landmarks of the preferred sites. */
  private findArena(siteIds: string[], radius: number): THREE.Vector3 {
    const h = this.terrain.heightAt;
    let best: { x: number; z: number; score: number } | null = null;
    siteIds.forEach((id, rank) => {
      const lm = this.landmarks[this.atlas.sites.findIndex(s => s.id === id)];
      for (let ring = 70; ring <= 250; ring += 30)
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + ring * 0.01;
          const x = lm.x + Math.sin(a) * ring, z = lm.z + Math.cos(a) * ring;
          if (this.atlas.boundary(x, z).distance < radius + 60 || Math.hypot(x, z) < 900) continue;
          if (this.reserved.blocked(x, z, radius)) continue;
          const h0 = h(x, z);
          let spread = 0, wet = 0;
          for (let i = 0; i < 16; i++) {
            const b = (i / 16) * Math.PI * 2;
            for (const f of [0.45, 0.9]) {
              const hi = h(x + Math.sin(b) * radius * f, z + Math.cos(b) * radius * f);
              if (hi < 0.6) wet++;
              spread = Math.max(spread, Math.abs(hi - h0));
            }
          }
          // The arena will be levelled anyway; prefer spots that need the least of it.
          const score = spread + wet * 0.5 + rank * 1.5;
          if (!best || score < best.score) best = { x, z, score };
        }
    });
    const b = best ?? { x: this.landmarks[0].x, z: this.landmarks[0].z };
    // Level a dry floor (a raised mudflat in the fens).
    const floor = Math.max(1.6, h(b.x, b.z));
    this.terrain.addPlateau(b.x, b.z, radius + 4, floor);
    return new THREE.Vector3(b.x, floor, b.z);
  }

  loadAssets(library: ModelLibrary): Promise<string[]> {
    return this.hub.loadAssets(library);
  }

  /** Where the camera is; drives streaming, mood and region titles. */
  setViewer(position: THREE.Vector3, instant = false): void {
    this.viewer.copy(position);
    rangeUniforms.uViewer.value.copy(position);
    if (!instant) return;
    this.tiles.prewarm(position);
    this.props.prewarm(position);
    this.updateMood(0, true);
  }

  update(dt: number, elapsed: number): void {
    this.hub.update(dt, elapsed);
    // Once Vermilion falls, the dragon no longer circles the Threshold.
    if (this.hub.heroAssets.dragon) this.hub.heroAssets.dragon.visible = !this.progress.bosses.has('vermilion');
    this.tiles.update(this.viewer, 4);
    this.props.update(this.viewer, 3);
    this.water.position.set(Math.round(this.viewer.x / 64) * 64, 0, Math.round(this.viewer.z / 64) * 64);
    this.ambience.update(dt, this.viewer);
    this.story.update(dt, elapsed, this.viewer);
    this.updateMood(dt, false);
    this.gateHint = this.gates.update(dt, this.viewer);
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) { this.lightTimer = 0.5; this.assignLights(); }
  }

  // --- mood ----------------------------------------------------------------

  /** The site under (x, z), or null inside the hub. */
  siteAt(x: number, z: number): BiomeSite | null {
    return this.terrain.hubWeight(x, z) > 0.5 ? null : this.atlas.nearest(x, z);
  }

  private updateMood(dt: number, instant: boolean): void {
    const site = this.terrain.moodAt(this.viewer.x, this.viewer.z, this.hub.skyPreset, this.mood);
    this.atmosphere.setWeights(this.mood, instant);
    const key = site && (this.mood.get(this.hub.skyPreset) ?? 0) < 0.5 ? site.id : 'hub';
    if (instant) { this.region = this.candidate = key; this.progress.discover(key); return; }
    if (key !== this.candidate) { this.candidate = key; this.candidateTime = 0; }
    this.candidateTime += dt;
    if (this.candidate !== this.region && this.candidateTime > 1.2) {
      this.region = this.candidate;
      this.progress.discover(this.region);
      if (this.region === 'hub') this.onRegion('THE THRESHOLD', 'Where every road begins');
      else {
        const s = this.atlas.sites.find(x => x.id === this.region)!;
        const chapter = this.atlas.chapters[s.chapter - 1];
        this.onRegion(s.biome.name.toUpperCase(), `Chapter ${roman(s.chapter)} · ${chapter.name}`);
      }
    }
  }

  private assignLights(): void {
    const v = this.viewer;
    const nearest = [...this.anchors, ...this.story.lightAnchors()]
      .map(a => ({ a, d: Math.hypot(a.x - v.x, a.z - v.z) }))
      .filter(e => e.d < 160)
      .sort((p, q) => p.d - q.d)
      .slice(0, this.lights.length);
    this.lights.forEach((light, i) => {
      const e = nearest[i];
      if (!e) { light.intensity = 0; return; }
      light.position.set(e.a.x, e.a.y, e.a.z);
      light.color.setHex(e.a.color);
      light.intensity = e.a.intensity;
      light.distance = e.a.distance;
    });
  }
}
