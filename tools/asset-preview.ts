import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x181623);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdce7ff, 0x645168, 2));
const light = new THREE.DirectionalLight(0xfff0dc, 3);
light.position.set(3, 5, 4);
scene.add(light);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
const library = new ModelLibrary();
let instance: Awaited<ReturnType<ModelLibrary['instantiate']>> | undefined;
const label = document.getElementById('label')!;
const show = async (id: string) => {
  if (instance) scene.remove(instance.root);
  instance = await library.instantiate(id, { size: 3, grounded: false });
  scene.add(instance.root);
  scene.updateMatrixWorld(true);
  camera.position.set(3.5, 2.2, 4.7);
  controls.target.set(0, 0, 0);
  controls.update();
  renderer.render(scene, camera);
  label.textContent = `${id}\n${instance.info.triangles.toLocaleString()} triangles · ${Math.round(instance.info.bytes / 1024)} KiB · ${instance.animations.length} clips`;
  let meshes = 0;
  instance.root.traverse(o => { if (o instanceof THREE.Mesh) meshes++; });
  const bounds = new THREE.Box3().setFromObject(instance.root);
  return { meshes, size: bounds.getSize(new THREE.Vector3()).toArray(), animations: instance.animations.map(a => a.name) };
};
const checkAnimations = async (id: string) => {
  const sample = await library.instantiate(id, { size: 3, grounded: false });
  const mixer = new THREE.AnimationMixer(sample.content);
  const errors: string[] = [];
  for (const clip of sample.animations) {
    const action = mixer.clipAction(clip).play();
    for (const time of [0, clip.duration * 0.5, Math.max(0, clip.duration - 0.01)]) {
      mixer.setTime(time);
      sample.root.updateMatrixWorld(true);
      sample.root.traverse(o => {
        if (o instanceof THREE.SkinnedMesh) {
          o.computeBoundingBox();
          const size = o.boundingBox!.getSize(new THREE.Vector3());
          if (![size.x, size.y, size.z].every(Number.isFinite)) errors.push(`${clip.name}: invalid skinned bounds`);
        }
      });
    }
    action.stop();
  }
  mixer.uncacheRoot(sample.content);
  return errors;
};
Object.assign(window, { assetReview: { show, checkAnimations, library, scene, camera, renderer, get instance() { return instance; } } });
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
const id = new URLSearchParams(location.search).get('id');
if (id) show(id).catch(error => { label.textContent = String(error); throw error; });
