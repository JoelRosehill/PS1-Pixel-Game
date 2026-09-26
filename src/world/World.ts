import * as THREE from 'three';
import type { CreatureLibrary, CreatureModel } from '../assets/Creatures';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { CombatEntity } from '../combat/types';
import { Progress } from '../core/Progress';
import type { BossArenaDef } from '../enemies/bosses/BossArena';
import { BOSSES } from '../enemies/bosses/Roster';
import type { EncounterDef } from '../enemies/Encounters';
import { ColliderWorld } from '../physics/Colliders';
import type { Atmosphere } from '../render/Atmosphere';
import { rangeUniforms } from '../render/Materials';
import type { SpellId } from '../spells/SpellBook';
import type { Landmark, LightAnchor } from './biomes/BiomeLandmarks';
import { CHAPTERS, roman } from './biomes/Chapters';
import { JOURNEY } from './biomes/Journey';
import { Ambience } from './engine/Ambience';
import { generateCamps } from './engine/Camps';
import { ChapterGates } from './engine/ChapterGates';
import { PropLibrary } from './engine/PropLibrary';
import { PropStreamer, ReservedMap } from './engine/PropStreamer';
import { TerrainStreamer } from './engine/TerrainStreamer';
import { type BiomeSite, type ChapterDef, WORLD, WorldAtlas } from './engine/WorldAtlas';
import { WorldTerrain } from './engine/WorldTerrain';
import type { Level, PageSite } from './Level';
import { createWorldMaterials, type WorldMaterials } from './props/WorldMaterials';
import { Dawnspire, MOON_ANCHOR } from './route/Dawnspire';
import { MODEL_BOUNDS } from './route/ModelBounds';
import { Structures } from './route/Structures';
import { SparringConstruct } from './props/SparringConstruct';
import { StoryProps } from './StoryProps';
import { buildWater } from './Water';

/** Where the Codex's lost pages lie along the road (see each page's hint in SpellBook). */
const PAGES: { id: SpellId; site: string; at: number; lateral: number }[] = [
  { id: 'comet-lance', site: 'c1-1', at: 0.35, lateral: 14 },
  { id: 'chain-storm', site: 'c2-0', at: 0.5, lateral: -18 },
  { id: 'void-maw', site: 'c2-2', at: 0.6, lateral: 16 },
  { id: 'wisp-choir', site: 'c2-3', at: 0.45, lateral: -20 },
  { id: 'phoenix-flight', site: 'c3-0', at: 0.62, lateral: -30 },
  { id: 'moon-aegis', site: 'c3-3', at: 0.5, lateral: 22 },
  { id: 'glacial-rupture', site: 'c4-0', at: 0.08, lateral: 12 },
  { id: 'prism-ray', site: 'c4-2', at: 0.55, lateral: -18 },
  { id: 'blood-bloom', site: 'c5-1', at: 0.4, lateral: -24 },
  { id: 'eclipse', site: 'c8-3', at: 0.85, lateral: 10 },
];

/**
 * The streamed world (Jobs 6, 15): the Long Road. One authored journey spiralling inward
 * from Hollowmere to the Dawnspire through forty biomes in eight chapters, each valley
 * walled by colossal mountains, the supplied structures standing on levelled ground in the
 * biomes they belong to, camps and shrines along the way, a gorge and a gateway between
 * chapters, and the boss of each chapter across the road before its gate.
 * Implements `Level`, so the game, AI and tests use it like any other level.
 */
export class World implements Level {
  readonly name = 'The Long Road';
  readonly root = new THREE.Group();
  readonly atlas: WorldAtlas;
  readonly terrain: WorldTerrain;
  readonly tiles: TerrainStreamer;
  readonly props: PropStreamer;
  readonly structures: Structures;
  readonly reserved = new ReservedMap();
  readonly ambience: Ambience;
  readonly encounters: EncounterDef[];
  readonly gates: ChapterGates;
  /** Shrines, lore tablets and memorials (Job 9). */
  readonly story: StoryProps;
  /** Where the bosses wait (Jobs 8, 14). */
  readonly bossArenas: BossArenaDef[] = [];
  readonly dawnspire: Dawnspire;
  readonly materials: WorldMaterials;
  readonly colliders: ColliderWorld;
  readonly enemies: CombatEntity[] = [];
  readonly pageSites: PageSite[] = [];
  readonly spawn: { position: THREE.Vector3; lookAt: THREE.Vector3 };
  readonly skyPreset = 'cosmic-violet';
  /**
   * A flat, quiet spot for tests and tools: the far side of the Dawnspire's plaza, away
   * from the road, camps and arenas.
   */
  readonly testSite: THREE.Vector3;
  readonly biomeDriven = true;
  /** Oswin, the masked Wanderer, waiting by the first fire. */
  readonly wanderer = new THREE.Group();
  wandererModel: CreatureModel | null = null;
  /** Hint from a closed chapter gate near the viewer ('' when none). */
  gateHint = '';
  /** Title-card hook: fired when the viewer settles into a new region. */
  onRegion: (title: string, subtitle: string) => void = () => {};
  /** Region (site id) the viewer is in. */
  region = '';

  private readonly water: THREE.Mesh;
  private readonly viewer = new THREE.Vector3();
  private readonly mood = new Map<string, number>();
  private candidate = '';
  private candidateTime = 0;
  private readonly anchors: LightAnchor[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private lightTimer = 0;

  constructor(private readonly atmosphere: Atmosphere, readonly progress: Progress = new Progress(), chapters: ChapterDef[] = CHAPTERS) {
    this.atlas = new WorldAtlas(chapters, JOURNEY);
    this.terrain = new WorldTerrain(this.atlas);
    const m = (this.materials = createWorldMaterials());
    const col = (this.colliders = new ColliderWorld((x, z) => this.terrain.heightAt(x, z)));
    const road = this.atlas.road;

    // The road bed stays clear of props, camps and shrines.
    for (let s = 0; s <= road.length; s += 6) {
      const p = road.pointAt(s);
      this.reserved.add(p.x, p.z, 5);
    }

    // The valley's edge, a little way up the mountainsides: an analytic wall (the distance
    // to the road) that nothing can cross, whatever the curves; open around the plaza.
    const edgeHit = { s: 0, d: 0, side: 1, x: 0, z: 0, tx: 1, tz: 0 };
    col.boundary = (c, radius) => {
      if (Math.hypot(c.x, c.z) < WORLD.plaza + 30) return null;
      const hit = road.nearest(c.x, c.z, edgeHit);
      const depth = hit.d + radius - (this.atlas.widthAt(hit.s) + WORLD.wallOffset);
      if (depth <= 0 || hit.d < 1e-3) return null;
      return { normal: new THREE.Vector3((hit.x - c.x) / hit.d, 0, (hit.z - c.z) / hit.d), depth };
    };

    // Structures first: their plateaus must exist before anything samples the ground.
    this.structures = new Structures(this.atlas, this.terrain, this.reserved);

    // Boss arenas: across the road where each chapter's last stretch ends.
    for (const boss of BOSSES) {
      const site = this.atlas.sites.find(s => s.chapter === boss.chapter && s.leg.arena !== undefined);
      if (!site) continue;
      const radius = boss.kind === 'dragon' || boss.kind === 'swarm' ? 38 : 34;
      const s = site.s0 + (site.s1 - site.s0) * site.leg.arena!;
      const p = road.pointAt(s);
      const floor = this.terrain.addPlateau(p.x, p.z, radius + 6, Math.max(1.6, this.atlas.roadHeight(s)), 40);
      this.bossArenas.push({ boss, center: new THREE.Vector3(p.x, floor, p.z), radius });
      this.reserved.add(p.x, p.z, radius + 10);
    }

    // The Dawnspire at the centre of the world, its plaza, and the chain to the moon.
    const plazaY = this.atlas.roadHeight(road.length);
    this.reserved.add(0, 0, WORLD.plaza);
    this.dawnspire = new Dawnspire(plazaY, col);
    this.root.add(this.dawnspire.group);
    atmosphere.moonAnchor = MOON_ANCHOR;

    this.structures.buildProcedural(m, col);
    this.root.add(this.structures.group);
    for (const lm of this.structures.landmarks) this.anchors.push(...lm.lights);

    this.story = new StoryProps(this.atlas, m, this.terrain.heightAt, this.reserved);
    this.root.add(this.story.group);

    const camps = generateCamps(this.atlas, this.terrain.heightAt, this.reserved);
    this.encounters = camps.encounters;

    this.gates = new ChapterGates(this.atlas, this.terrain.heightAt, col, progress, camps.encounters.map(e => e.id), m);
    this.gates.bossRequirement = chapter => {
      const arena = this.bossArenas.find(a => a.boss.chapter === chapter);
      if (!arena || progress.bosses.has(arena.boss.id)) return { met: true, text: '' };
      return { met: false, text: `The mist answers to ${arena.boss.name}, ${arena.boss.epithet}. It waits on the road before this gate.` };
    };
    this.gates.onOpen = gate => this.onRegion('THE MIST PARTS', `The way to Chapter ${roman(gate.to)} · ${this.atlas.chapters[gate.to - 1].name} lies open`);
    this.root.add(this.gates.group);

    this.props = new PropStreamer(new PropLibrary(m), this.atlas, this.terrain.heightAt, col, this.reserved);
    for (const d of camps.dressing) this.props.addFixed(d);
    this.tiles = new TerrainStreamer(this.terrain.heightAt, this.terrain.colorAt);
    this.water = buildWater(atmosphere, 7000, 0);
    this.ambience = new Ambience(this.terrain);
    this.root.add(this.tiles.group, this.props.group, this.water, this.ambience.points);

    // Lost pages of the Codex.
    for (const page of PAGES) {
      const site = this.atlas.sites.find(s => s.id === page.site)!;
      const { x, z } = road.offset(site.s0 + (site.s1 - site.s0) * page.at, page.lateral);
      this.pageSites.push({ id: page.id, x, z });
    }
    // Windstep lies on top of the fallen keyboard in the Obsolete Sea.
    const keyboard = this.structures.placed.find(p => p.spec.model === 'ps1-style-old-keyboard');
    if (keyboard) {
      const b = MODEL_BOUNDS['ps1-style-old-keyboard'];
      const top = keyboard.y + b[1] * ((keyboard.spec.size ?? 1) / Math.max(...b));
      this.pageSites.push({ id: 'windstep', x: keyboard.x, z: keyboard.z, y: top + 1.3 });
    }

    const end = road.pointAt(road.length);
    const er = Math.hypot(end.x, end.z) || 1;
    const tx = (-end.x / er) * 340, tz = (-end.z / er) * 340;
    this.testSite = new THREE.Vector3(tx, this.terrain.heightAt(tx, tz), tz);

    // Spawn: a little way into Hollowmere, beside the first fire, looking down the road.
    const st = this.atlas.start;
    const sy = this.terrain.heightAt(st.x, st.z);
    const ahead = road.pointAt(160);
    this.spawn = {
      position: new THREE.Vector3(st.x, sy, st.z),
      lookAt: new THREE.Vector3(ahead.x, this.terrain.heightAt(ahead.x, ahead.z) + 6, ahead.z),
    };
    // The Wanderer stands across the fire from where you wake.
    const first = this.story.shrines[0];
    const w = road.offset(34, -8);
    this.wanderer.position.set(w.x, this.terrain.heightAt(w.x, w.z), w.z);
    this.wanderer.rotation.y = Math.atan2(first.position.x - w.x, first.position.z - w.z);
    this.wanderer.name = 'wanderer';
    this.root.add(this.wanderer);
    col.addCylinder(w.x, this.wanderer.position.y + 1, w.z, 0.5, 2);

    // A small, constant pool of point lights lent to the nearest landmark anchors
    // (a fixed light count keeps every shader's light loop the same size).
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      this.lights.push(light);
      this.root.add(light);
    }
  }

  /**
   * Raises the old training yard at the test site (two passive dummies and two sparring
   * constructs) for tests and tools; not part of the journey. Idempotent.
   */
  trainingYard(): SparringConstruct[] {
    const have = this.enemies.filter((e): e is SparringConstruct => e instanceof SparringConstruct);
    if (have.length) return have;
    const t = this.testSite;
    for (const [dx, dz, aggressive] of [[-6, 21, false], [3, 25, false], [-1, 16, true], [8, 20, true]] as [number, number, boolean][]) {
      const x = t.x + dx, z = t.z + dz;
      const c = new SparringConstruct(x, this.heightAt(x, z), z, { aggressive });
      this.enemies.push(c);
      this.root.add(c.group);
      this.colliders.addBody(c.collider);
    }
    return this.enemies as SparringConstruct[];
  }

  // --- Level contract ------------------------------------------------------

  /** Landmarks (procedural structures) for the map and the light pool. */
  get landmarks(): Landmark[] {
    return this.structures.landmarks;
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  async loadAssets(library: ModelLibrary, creatures?: CreatureLibrary): Promise<string[]> {
    const jobs: Promise<unknown>[] = [this.structures.load(library)];
    if (creatures) jobs.push(creatures.preload(['wanderer']).then(() => {
      const oswin = creatures.create('wanderer', { height: 2.05, tint: 0xd8d0e0 });
      if (!oswin) return;
      this.wandererModel = oswin;
      oswin.play('idle', { fade: 0 });
      this.wanderer.add(oswin.root);
    }));
    await Promise.all(jobs);
    return this.structures.errors;
  }

  /** Where the camera is; drives streaming, mood and region titles. */
  setViewer(position: THREE.Vector3, instant = false): void {
    this.viewer.copy(position);
    rangeUniforms.uViewer.value.copy(position);
    if (!instant) return;
    this.tiles.prewarm(position);
    this.props.prewarm(position);
    this.structures.prewarm(position);
    this.updateMood(0, true);
  }

  update(dt: number, elapsed: number): void {
    this.tiles.update(this.viewer, 4);
    this.props.update(this.viewer, 3);
    this.structures.update(this.viewer);
    this.water.position.set(Math.round(this.viewer.x / 64) * 64, 0, Math.round(this.viewer.z / 64) * 64);
    this.ambience.update(dt, this.viewer);
    this.story.update(dt, elapsed, this.viewer);
    this.dawnspire.update(elapsed);
    if (this.progress.bosses.has('sovereign')) this.dawnspire.breakChain();
    this.wandererModel?.update(dt);
    this.updateMood(dt, false);
    this.gateHint = this.gates.update(dt, this.viewer);
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) { this.lightTimer = 0.5; this.assignLights(); }
  }

  /**
   * The title screen's slow drift: high over Hollowmere, looking down the valley to the
   * Dawnspire and the chain rising to the moon.
   */
  titleView(t: number, camera: THREE.PerspectiveCamera): void {
    const road = this.atlas.road;
    const p = road.pointAt(20 + Math.sin(t * 0.03) * 12);
    const x = p.x - p.tx * 30, z = p.z - p.tz * 30;
    camera.position.set(x, this.terrain.heightAt(x, z) + 26 + Math.sin(t * 0.08) * 1.5, z);
    camera.lookAt(0, 900, 0);
    camera.rotation.x = Math.min(camera.rotation.x, 0.12);
  }

  // --- mood ----------------------------------------------------------------

  /** The site under (x, z). */
  siteAt(x: number, z: number): BiomeSite {
    return this.atlas.nearest(x, z);
  }

  private updateMood(dt: number, instant: boolean): void {
    const site = this.terrain.moodAt(this.viewer.x, this.viewer.z, this.mood);
    this.atmosphere.setWeights(this.mood, instant);
    const key = site.id;
    if (instant) { this.region = this.candidate = key; this.progress.discover(key); return; }
    if (key !== this.candidate) { this.candidate = key; this.candidateTime = 0; }
    this.candidateTime += dt;
    if (this.candidate !== this.region && this.candidateTime > 1.2) {
      this.region = this.candidate;
      this.progress.discover(this.region);
      const s = this.atlas.sites.find(x => x.id === this.region)!;
      const chapter = this.atlas.chapters[s.chapter - 1];
      this.onRegion(s.biome.name.toUpperCase(), `Chapter ${roman(s.chapter)} · ${chapter.name}`);
    }
  }

  private assignLights(): void {
    const v = this.viewer;
    const nearest = [...this.anchors, ...this.story.lightAnchors()]
      .map(a => ({ a, d: Math.hypot(a.x - v.x, a.z - v.z) }))
      .filter(e => e.d < 220)
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
