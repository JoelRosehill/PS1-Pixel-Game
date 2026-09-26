import * as THREE from 'three';
import { Game, type GameOptions } from './core/Game';
import './style.css';

declare global {
  interface Window {
    __game?: Game;
    /** Exposed for headless test tooling (tools/*.mjs). */
    __three?: typeof THREE;
    __ready?: boolean;
    __error?: string;
  }
}

function parseVec(s: string | null): THREE.Vector3 | undefined {
  if (!s) return undefined;
  const [x, y, z] = s.split(',').map(Number);
  return [x, y, z].every(Number.isFinite) ? new THREE.Vector3(x, y, z) : undefined;
}

// URL params (used by tools/screenshot.mjs and for sharing viewpoints):
//   ?preset=blood-moon&mode=smart&cam=10,5,20&look=0,8,-60&time=12&bands=1&lines=540&shot=1
const q = new URLSearchParams(location.search);
const cam = parseVec(q.get('cam'));
const look = parseVec(q.get('look'));
const at = parseVec(q.get('at'));
const opts: GameOptions = {
  preset: q.get('preset') ?? undefined,
  mode: q.get('mode') ?? undefined,
  camera: cam && look ? { position: cam, lookAt: look } : undefined,
  time: q.has('time') ? Number(q.get('time')) : undefined,
  debugBands: q.get('bands') === '1',
  playerAt: at,
  playerYaw: q.has('yaw') ? (Number(q.get('yaw')) * Math.PI) / 180 : undefined,
  baseLines: q.has('lines') ? Number(q.get('lines')) : undefined,
  render: q.get('render') !== '0',
  // Screenshots and test harnesses never touch the save unless they ask (&save=1).
  save: q.get('shot') !== '1' || q.get('save') === '1',
  fresh: q.get('fresh') === '1',
  audio: q.get('shot') !== '1' || q.get('audio') === '1',
  title: q.get('shot') !== '1' || q.get('title') === '1',
  debugHud: q.get('shot') === '1' ? q.get('hud') === '1' : undefined,
  pointerLock: q.get('shot') !== '1',
};
const shot = q.get('shot') === '1';

const splash = document.getElementById('splash')!;
const hud = document.getElementById('hud')!;
const gameHud = document.getElementById('gamehud')!;

try {
  const game = new Game(document.getElementById('app')!, hud, gameHud, opts);
  window.__game = game;
  window.__three = THREE;
  game.start();

  // The title screen (Game.menu) replaces the loading splash once the game exists.
  splash.style.display = 'none';
  if (shot) {
    if (q.get('gamehud') === '0') gameHud.style.display = 'none';
    const target = Number(q.get('frames') ?? 4);
    const waitFrames = () => (game.frames >= target ? (window.__ready = true) : requestAnimationFrame(waitFrames));
    game.assetsReady.then(() => requestAnimationFrame(waitFrames));
  } else {
    game.pixel.renderer.domElement.addEventListener('click', () => {
      game.audio.start();
      if (!game.menuOpen) game.input.requestLock();
    });
  }
} catch (err) {
  window.__error = String(err instanceof Error ? err.stack : err);
  console.error(err);
  splash.innerHTML = `<h1>Error</h1><p>${String(err)}</p>`;
}
