import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { dissolvable } from '../render/Materials';
import { pixelify } from './ModelLibrary';

/**
 * Animated creatures built by the Creature Forge (tools/creatures/build.py): the user's
 * PS1 models, rigged and animated in Blender. `creatures.json` lists each creature's
 * clips with their lengths, loop flags and events ('hit' = the frame a blow lands).
 *
 * Models face +Z with feet at y = 0 (Enemy rotates its visual by facing + π).
 */

export type CreatureId = 'nemesis' | 'pale' | 'demon' | 'wanderer' | 'bingus' | 'bee' | 'chicken' | 'horse' | 'dragon';
export const CREATURE_IDS: CreatureId[] = ['nemesis', 'pale', 'demon', 'wanderer', 'bingus', 'bee', 'chicken', 'horse', 'dragon'];

export interface ClipInfo { seconds: number; loop: boolean; events: Record<string, number> }
export interface CreatureInfo { url: string; height: number; clips: Record<string, ClipInfo> }

export interface CreatureOptions {
  /** World height in metres (the model is scaled from its exported height). */
  height?: number;
  /** Multiplies every material colour (recolours one model into several enemies). */
  tint?: number;
  /** Adds a flat emissive glow (eyes and skin of shadow creatures). */
  emissive?: number;
  emissiveIntensity?: number;
  /** Death-dissolve uniform shared with the owning enemy. */
  dissolve?: { value: number };
}

export interface PlayOptions {
  fade?: number;
  speed?: number;
  /** Restart even if this clip is already playing. */
  restart?: boolean;
  /** Stretches the clip so it lasts this many seconds. */
  duration?: number;
}

export class CreatureLibrary {
  private readonly loader = new GLTFLoader();
  private readonly gltfs = new Map<CreatureId, GLTF>();
  private readonly pending = new Map<CreatureId, Promise<GLTF>>();
  info: Record<string, CreatureInfo> = {};
  readonly errors: string[] = [];

  constructor(private readonly base: string = import.meta.env.BASE_URL) {}

  /** Downloads the manifest and the listed creatures (all of them by default). */
  async preload(ids: CreatureId[] = CREATURE_IDS): Promise<void> {
    if (!Object.keys(this.info).length) {
      const response = await fetch(`${this.base}models/creatures/creatures.json`);
      if (!response.ok) throw new Error(`Creature manifest: HTTP ${response.status}`);
      this.info = await response.json();
    }
    await Promise.all(ids.map(id => this.load(id).catch(error => { this.errors.push(`${id}: ${error}`); })));
  }

  loaded(id: CreatureId): boolean {
    return this.gltfs.has(id);
  }

  private load(id: CreatureId): Promise<GLTF> {
    const done = this.gltfs.get(id);
    if (done) return Promise.resolve(done);
    let p = this.pending.get(id);
    if (!p) {
      const info = this.info[id];
      if (!info) return Promise.reject(new Error(`Unknown creature: ${id}`));
      p = this.loader.loadAsync(`${this.base}${info.url}`).then(gltf => {
        pixelify(gltf.scene);
        this.gltfs.set(id, gltf);
        return gltf;
      });
      this.pending.set(id, p);
    }
    return p;
  }

  /** A new, independently animated instance (null until the creature has loaded). */
  create(id: CreatureId, options: CreatureOptions = {}): CreatureModel | null {
    const gltf = this.gltfs.get(id);
    if (!gltf) return null;
    return new CreatureModel(id, gltf, this.info[id], options);
  }
}

export class CreatureModel {
  readonly root = new THREE.Group();
  readonly content: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly materials: THREE.MeshToonMaterial[] = [];
  readonly scale: number;
  current = '';
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly bones = new Map<string, THREE.Object3D>();
  private readonly baseEmissive = new Map<THREE.MeshToonMaterial, THREE.Color>();

  constructor(readonly id: CreatureId, gltf: GLTF, readonly info: CreatureInfo, options: CreatureOptions) {
    this.content = clone(gltf.scene);
    this.scale = (options.height ?? info.height) / info.height;
    this.content.scale.setScalar(this.scale);
    this.root.add(this.content);
    this.root.name = `creature:${id}`;
    const cache = new Map<THREE.Material, THREE.MeshToonMaterial>();
    this.content.traverse(o => {
      if ((o as THREE.Bone).isBone || o.type === 'Object3D') this.bones.set(o.name, o);
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      const convert = (m: THREE.Material) => {
        let c = cache.get(m);
        if (c) return c;
        c = (m as THREE.MeshToonMaterial).clone();
        if (options.tint !== undefined) c.color.multiply(new THREE.Color(options.tint));
        if (options.emissive !== undefined) {
          // The glow follows the texture (seams, eyes, skin), never a flat silhouette.
          c.emissive.setHex(options.emissive);
          c.emissiveIntensity = options.emissiveIntensity ?? 1;
          if (c.map && !c.emissiveMap) c.emissiveMap = c.map;
        }
        if (options.dissolve) dissolvable(c, options.dissolve);
        cache.set(m, c);
        this.materials.push(c);
        this.baseEmissive.set(c, c.emissive.clone());
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
    });
    this.mixer = new THREE.AnimationMixer(this.content);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  /** Clip length in seconds (0 if missing). */
  length(name: string): number {
    return this.info.clips[name]?.seconds ?? 0;
  }

  /** Time of a clip event ('hit') in seconds of the unstretched clip. */
  event(name: string, key = 'hit'): number {
    return this.info.clips[name]?.events?.[key] ?? this.length(name) * 0.5;
  }

  /** Cross-fades to a clip. Loops follow the manifest; one-shots hold their last frame. */
  play(name: string, options: PlayOptions = {}): void {
    const action = this.actions.get(name);
    if (!action) return;
    const info = this.info.clips[name];
    const loop = info?.loop ?? false;
    if (this.current === name && !options.restart) {
      if (options.speed !== undefined) action.timeScale = options.speed;
      return;
    }
    const previous = this.actions.get(this.current);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.timeScale = options.duration ? (info?.seconds ?? 1) / Math.max(0.05, options.duration) : options.speed ?? 1;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    const fade = options.fade ?? 0.18;
    if (previous && previous !== action) previous.crossFadeTo(action, fade, false);
    else if (fade > 0) action.fadeIn(fade);
    this.current = name;
  }

  /** Seconds into the current clip (clip time, unscaled). */
  get time(): number {
    return this.actions.get(this.current)?.time ?? 0;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Bones by their Blender name ('grip.R'); three.js strips the dots on load. */
  bone(name: string): THREE.Object3D | undefined {
    return this.bones.get(THREE.PropertyBinding.sanitizeNodeName(name));
  }

  /** World position of a bone or socket (grip.R, mouth, stinger, saddle, head...). */
  socket(name: string, out: THREE.Vector3): THREE.Vector3 {
    const b = this.bone(name);
    if (!b) return this.root.getWorldPosition(out);
    return b.getWorldPosition(out);
  }

  /** Hit flash: 0..1 of white emissive on top of any base glow. */
  flash(k: number): void {
    for (const m of this.materials) {
      const base = this.baseEmissive.get(m)!;
      m.emissive.setRGB(base.r + k * 0.9, base.g + k * 0.9, base.b + k * 0.9);
    }
  }

  /** Attaches an object to a bone (weapons in grips, riders in saddles). */
  attach(boneName: string, object: THREE.Object3D): void {
    (this.bone(boneName) ?? this.content).add(object);
  }
}

/**
 * Puts a library weapon in a creature's fist: the weapon's longest axis is turned along
 * the grip socket's forward and the grip sits about a third of the way up the blade.
 * The container undoes the creature's scale so the weapon keeps its own size.
 */
export function gripWeapon(model: CreatureModel, weapon: THREE.Object3D, socket = 'grip.R'): THREE.Object3D | null {
  if (!model.bone(socket)) return null;
  const size = new THREE.Box3().setFromObject(weapon).getSize(new THREE.Vector3());
  if (size.y >= size.x && size.y >= size.z) weapon.rotation.x = Math.PI / 2;
  else if (size.x >= size.z) weapon.rotation.y = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(weapon);
  holder.position.z = Math.max(size.x, size.y, size.z) * 0.35;
  const container = new THREE.Group();
  container.add(holder);
  container.scale.setScalar(1 / model.scale);
  model.attach(socket, container);
  return container;
}
