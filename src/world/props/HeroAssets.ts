import * as THREE from 'three';
import type { ModelLibrary } from '../../assets/ModelLibrary';
import type { ColliderWorld } from '../../physics/Colliders';

/** Hero set pieces for Job 3.5. Creatures are environmental previews; their boss
 * and enemy behaviour belongs to later jobs. Procedural terrain remains in charge.
 */
export class HeroAssets {
  readonly group = new THREE.Group();
  readonly errors: string[] = [];
  /** The dragon display circling the Threshold (hidden once Vermilion falls). */
  dragon: THREE.Object3D | null = null;
  private readonly mixers: THREE.AnimationMixer[] = [];

  async load(library: ModelLibrary, colliders: ColliderWorld, heightAt: (x: number, z: number) => number): Promise<void> {
    const jobs = [
      { id: 'church-psx', x: -61, z: 30, height: 13, yaw: Math.PI / 2, solid: true },
      { id: 'shadow-demon-creature-hitem3d-vs-supavoxel', x: -78, z: 19, height: 4.5, yaw: Math.PI / 2, solid: true },
      { id: 'red-dragon', x: -92, z: -87, size: 26, yaw: 0.65, solid: false },
    ];
    await Promise.all(jobs.map(async job => {
      try {
        const asset = await library.instantiate(job.id, { height: job.height, size: job.size, omitPresentation: true });
        asset.root.rotation.y = job.yaw;
        asset.root.position.set(job.x, heightAt(job.x, job.z) + (job.solid ? 0 : 11), job.z);
        this.group.add(asset.root);
        asset.root.updateMatrixWorld(true);
        if (job.solid) {
          const bounds = new THREE.Box3().setFromObject(asset.root);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          colliders.addBox(center.x, center.y, center.z, size.x, size.y, size.z);
        }
        if (job.id === 'red-dragon') this.dragon = asset.root;
        if (job.id === 'red-dragon' && asset.animations.length) {
          const mixer = new THREE.AnimationMixer(asset.content);
          const flight = asset.animations.find(a => /angryFlightPose/i.test(a.name)) ?? asset.animations[0];
          mixer.clipAction(flight).play();
          this.mixers.push(mixer);
        }
      } catch (error) { this.errors.push(`${job.id}: ${error}`); }
    }));
    // Use the modular graveyard's named parts, preserving its complete GLB as a
    // reusable kit instead of dropping the author's exploded layout into the level.
    try {
      const kit = await library.instantiate('psx-graveyard-modular-ps1-style-free');
      kit.content.updateMatrixWorld(true);
      const names = ['grave1', 'grave2', 'piller', 'gate_piller'];
      for (let i = 0; i < 8; i++) {
        const original = kit.content.getObjectByName(names[i % names.length]);
        if (!(original instanceof THREE.Mesh)) throw new Error(`Missing graveyard part: ${names[i % names.length]}`);
        const part = original.clone();
        part.matrix.copy(original.matrixWorld);
        part.matrix.decompose(part.position, part.quaternion, part.scale);
        part.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(part);
        const center = bounds.getCenter(new THREE.Vector3());
        const wrapper = new THREE.Group();
        const scale = 1.5 / Math.max(bounds.max.y - bounds.min.y, 0.01);
        part.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
        wrapper.add(part);
        wrapper.scale.setScalar(scale);
        const x = -49 + (i % 4) * 3;
        const z = 22 + Math.floor(i / 4) * 6;
        wrapper.position.set(x, heightAt(x, z), z);
        wrapper.rotation.y = -Math.PI / 2;
        wrapper.name = 'graveyard-piece';
        this.group.add(wrapper);
        colliders.addCylinder(x, wrapper.position.y + 0.75, z, 0.6, 1.5);
      }
    } catch (error) { this.errors.push(`graveyard: ${error}`); }
  }

  update(dt: number): void { for (const mixer of this.mixers) mixer.update(dt); }
}
