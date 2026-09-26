import * as THREE from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { EncounterDef } from '../enemies/Encounters';
import type { ColliderWorld } from '../physics/Colliders';
import type { Atmosphere } from '../render/Atmosphere';
import { Progress } from '../core/Progress';
import { ChapterGates } from './engine/ChapterGates';
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
    this.reserved.add(this.hub.citadelAt.x, this.hub.citadelAt.z, 360);

    const camps = generateCamps(this.atlas, this.terrain.heightAt, this.reserved);
    this.encounters = [...(this.hub.encounters ?? []), ...camps.encounters];

    this.gates = new ChapterGates(this.atlas, this.terrain.heightAt, col, progress, camps.encounters.map(e => e.id), this.hub.materials);
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
    this.tiles.update(this.viewer, 4);
    this.props.update(this.viewer, 3);
    this.water.position.set(Math.round(this.viewer.x / 64) * 64, 0, Math.round(this.viewer.z / 64) * 64);
    this.ambience.update(dt, this.viewer);
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
    const nearest = [...this.anchors]
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
