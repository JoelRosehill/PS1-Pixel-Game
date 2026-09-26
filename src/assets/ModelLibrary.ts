import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { toon } from '../render/Materials';

export interface ModelInfo {
  url: string;
  bytes: number;
  triangles: number;
  drawCalls: number;
  bounds: { min: number[]; max: number[]; size: number[] };
  animations: string[];
  skins: number;
}
export interface ModelInstance {
  root: THREE.Group;
  content: THREE.Object3D;
  animations: THREE.AnimationClip[];
  info: ModelInfo;
}

/** One network/decode per asset. Instances share immutable geometry, textures and
 * materials, while SkeletonUtils gives each character its own bones and pose.
 * The library owns shared GPU resources; callers should remove instances, not
 * dispose their shared meshes. Only requested assets are downloaded.
 */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<GLTF>>();
  private manifestPromise?: Promise<Record<string, ModelInfo>>;

  manifest(): Promise<Record<string, ModelInfo>> {
    return this.manifestPromise ??= fetch(`${import.meta.env.BASE_URL}models/manifest.json`)
      .then(async response => {
        if (!response.ok) throw new Error(`Model manifest: HTTP ${response.status}`);
        return (await response.json()).models as Record<string, ModelInfo>;
      }).catch(error => { this.manifestPromise = undefined; throw error; });
  }

  async instantiate(id: string, options: { height?: number; size?: number; grounded?: boolean; omitPresentation?: boolean } = {}): Promise<ModelInstance> {
    const info = (await this.manifest())[id];
    if (!info) throw new Error(`Unknown model: ${id}`);
    let promise = this.cache.get(id);
    if (!promise) {
      promise = this.loader.loadAsync(`${import.meta.env.BASE_URL}${info.url}`)
        .then(gltf => { this.pixelify(gltf.scene); return gltf; })
        .catch(error => { this.cache.delete(id); throw error; });
      this.cache.set(id, promise);
    }
    const gltf = await promise;
    const content = clone(gltf.scene);
    // Keep the source credit badge in the GLB and asset viewer; its presentation
    // billboard is not part of the creature's in-world model. Credits are recorded
    // separately in docs/assets/CREDITS.md.
    if (options.omitPresentation) content.getObjectByName('supavoxel-badge')?.removeFromParent();
    content.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(content);
    const dimensions = bounds.getSize(new THREE.Vector3());
    const extent = options.height ? dimensions.y : Math.max(dimensions.x, dimensions.y, dimensions.z);
    const scale = (options.height ?? options.size ?? extent) / Math.max(extent, 1e-6);
    const center = bounds.getCenter(new THREE.Vector3());
    const normalized = new THREE.Group();
    normalized.scale.setScalar(scale);
    normalized.position.set(-center.x * scale, (options.grounded === false ? -center.y : -bounds.min.y) * scale, -center.z * scale);
    normalized.add(content);
    const root = new THREE.Group();
    root.name = `asset:${id}`;
    root.add(normalized);
    root.userData.assetId = id;
    return { root, content, animations: gltf.animations, info };
  }

  private pixelify(scene: THREE.Object3D): void {
    const materials = new Map<THREE.Material, THREE.Material>();
    const sourceMaterials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // Skinned bounds can change with imported animation. Static pieces retain
      // frustum culling; animated hero pieces must not vanish at a band boundary.
      if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      const convert = (source: THREE.Material) => {
        let material = materials.get(source);
        if (material) return material;
        const src = source as THREE.MeshStandardMaterial;
        for (const texture of [src.map, src.emissiveMap]) if (texture) {
          texture.magFilter = THREE.NearestFilter;
          // Nearest mip levels reduce shimmer on distant textures while retaining
          // the pixel look. These 256 px maps are inexpensive to mipmap.
          texture.minFilter = THREE.NearestMipmapNearestFilter;
          texture.generateMipmaps = true;
          texture.needsUpdate = true;
        }
        material = toon({ color: src.color ?? 0xffffff, map: src.map ?? null,
          emissive: src.emissive ?? 0x000000, emissiveMap: src.emissiveMap ?? null,
          emissiveIntensity: src.emissiveIntensity ?? 1, vertexColors: src.vertexColors,
          side: src.side, opacity: src.opacity,
          // Cutouts write depth, essential for correct Smart-Pixel compositing.
          alphaTest: src.transparent ? 0.5 : src.alphaTest, transparent: false });
        material.name = source.name;
        materials.set(source, material);
        sourceMaterials.add(source);
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    });
    for (const source of sourceMaterials) source.dispose();
  }
}
