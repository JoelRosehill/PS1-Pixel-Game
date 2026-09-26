import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURE_IDS, CreatureLibrary, type CreatureId, type CreatureModel } from '../src/assets/Creatures';

// Review page for the Creature Forge: every creature in a row, playing one clip.
// ?clip=walk&t=0.4 freezes all of them at 40% of the clip (for screenshots).
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x2a2536);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdce7ff, 0x645168, 2.2));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
sun.position.set(4, 8, 6);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.MeshLambertMaterial({ color: 0x4a4458 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 400);
camera.position.set(0, 7, 21);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.update();

const library = new CreatureLibrary();
const models: CreatureModel[] = [];
/** Display heights: dragon scaled down so the row fits. */
const heights: Partial<Record<CreatureId, number>> = { dragon: 3.2, bee: 0.9, chicken: 0.6 };

const ready = library.preload().then(() => {
  let x = -16;
  for (const id of CREATURE_IDS) {
    const m = library.create(id, { height: heights[id] });
    if (!m) continue;
    const box = new THREE.Box3().setFromObject(m.root);
    const w = Math.max(1.2, box.max.x - box.min.x);
    m.root.position.x = x + w / 2;
    x += w + 1.2;
    scene.add(m.root);
    models.push(m);
  }
  return models.length;
});

function pose(clip: string, t: number | null): string[] {
  const missing: string[] = [];
  for (const m of models) {
    const name = m.has(clip) ? clip : 'idle';
    if (!m.has(clip)) missing.push(m.id);
    m.play(name, { fade: 0, restart: true });
    if (t !== null) {
      m.mixer.update(0);
      m.mixer.setTime(m.length(name) * t);
    }
  }
  return missing;
}

const clock = new THREE.Clock();
function frame(): void {
  const dt = clock.getDelta();
  if (!params.has('t')) for (const m of models) m.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

ready.then(() => {
  const clip = params.get('clip') ?? 'idle';
  pose(clip, params.has('t') ? Number(params.get('t')) : null);
  document.getElementById('label')!.textContent = `${clip}: ${models.map(m => m.id).join(' · ')}`;
  frame();
});

Object.assign(window, { creatureReview: { library, models, ready, pose, THREE } });
