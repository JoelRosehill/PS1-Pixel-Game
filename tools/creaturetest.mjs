import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs } from './browser.mjs';

// Creature Forge checks: every creature loads, has the clips the game relies on,
// its sockets, sane size and orientation, animates without NaNs, and instances are
// independent. Saves review screenshots of a few clips to screenshots/creatures/.
const server = await createServer({ logLevel: 'error', server: { port: 5196, strictPort: false } });
await server.listen();
let browser;
const errors = [];
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`PASS ${name}`); } else { errors.push(`${name} ${detail}`); console.log(`FAIL ${name} ${detail}`); }
};
const REQUIRED = {
  nemesis: ['idle', 'walk', 'run', 'attack_slash', 'attack_overhead', 'attack_thrust', 'attack_combo', 'hit', 'stagger', 'death', 'roar', 'block'],
  pale: ['idle', 'walk', 'run', 'attack_slash', 'attack_backslash', 'attack_leap', 'hit', 'stagger', 'death'],
  demon: ['idle', 'walk', 'run', 'attack_slash', 'attack_backslash', 'attack_overhead', 'attack_leap', 'roar', 'hit', 'stagger', 'death'],
  wanderer: ['idle', 'walk', 'run', 'cast', 'cast_sky', 'cast_loop', 'talk', 'kneel', 'hit', 'death', 'dodge'],
  bingus: ['idle', 'walk', 'run', 'attack_bite', 'attack_swipe', 'attack_pounce', 'roar', 'hit', 'stagger', 'death'],
  horse: ['idle', 'walk', 'run', 'attack_stomp', 'attack_bite', 'roar', 'hit', 'death'],
  bee: ['idle', 'run', 'attack_sting', 'hit', 'death'],
  chicken: ['idle', 'walk', 'run', 'attack_peck', 'death'],
  dragon: ['fly', 'glide', 'hover', 'dive', 'breath_air', 'idle', 'walk', 'attack_bite', 'attack_claw', 'attack_tail', 'attack_buffet',
    'breath', 'roar', 'takeoff', 'land', 'hit', 'stagger', 'death'],
};
const SOCKETS = { nemesis: ['grip.R', 'grip.L', 'head', 'mouth'], pale: ['grip.R', 'head'], demon: ['head', 'hand.L', 'hand.R'],
  wanderer: ['grip.R', 'head'], bingus: ['mouth', 'head'], horse: ['saddle', 'mouth'], bee: ['stinger'], chicken: ['head'], dragon: ['mouth', 'head'] };
try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 520 });
  page.on('pageerror', e => errors.push(`page: ${e.message}`));
  await page.goto(`${server.resolvedUrls.local[0]}tools/creature-preview.html?clip=idle&t=0.3`);
  await page.waitForFunction('!!window.creatureReview', { timeout: 60000 });
  const loaded = await page.evaluate(() => window.creatureReview.ready);
  check('all nine creatures load', loaded === 9, `loaded ${loaded}`);
  const report = await page.evaluate((REQUIRED, SOCKETS) => {
    const { library, THREE } = window.creatureReview;
    const out = {};
    for (const id of Object.keys(REQUIRED)) {
      const m = library.create(id);
      const a = library.create(id);
      const r = { missing: REQUIRED[id].filter(c => !m.has(c)), sockets: SOCKETS[id].filter(s => !m.bone(s)), bad: [] };
      m.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m.root);
      r.size = box.getSize(new THREE.Vector3()).toArray();
      r.minY = box.min.y;
      // Head in front of the tail: the model faces +Z.
      // Upright humanoids: toes ahead of the ankle; animals: head ahead of the middle.
      const head = m.socket('head', new THREE.Vector3());
      r.headZ = m.bone('toe.L') ? m.socket('toe.L', new THREE.Vector3()).z - m.socket('foot.L', new THREE.Vector3()).z : head.z;
      r.info = library.info[id].height;
      for (const clip of REQUIRED[id]) {
        if (!m.has(clip)) continue;
        m.play(clip, { fade: 0, restart: true });
        for (const f of [0, 0.5, 0.99]) {
          m.mixer.setTime(m.length(clip) * f);
          m.root.updateMatrixWorld(true);
          const p = m.socket(SOCKETS[id][0], new THREE.Vector3());
          if (![p.x, p.y, p.z].every(Number.isFinite)) r.bad.push(`${clip}@${f}`);
        }
      }
      // Independence: moving one instance's bones leaves the other alone.
      m.play(REQUIRED[id][1], { fade: 0, restart: true }); m.mixer.setTime(0.3); m.root.updateMatrixWorld(true);
      a.play('idle', { fade: 0, restart: true }); a.mixer.setTime(0); a.root.updateMatrixWorld(true);
      const pm = m.socket(SOCKETS[id][0], new THREE.Vector3()), pa = a.socket(SOCKETS[id][0], new THREE.Vector3());
      r.independent = m.materials[0] !== a.materials[0] && (pm.distanceTo(pa) > 1e-4 || REQUIRED[id][1] === 'idle');
      r.events = Object.keys(library.info[id].clips).filter(c => c.startsWith('attack')).every(c => library.info[id].clips[c].events.hit > 0);
      out[id] = r;
    }
    return out;
  }, REQUIRED, SOCKETS);
  for (const [id, r] of Object.entries(report)) {
    check(`${id}: required clips`, !r.missing.length, r.missing.join(','));
    check(`${id}: sockets`, !r.sockets.length, r.sockets.join(','));
    check(`${id}: grounded at native size ${r.info} m`, Math.abs(r.size[1] - r.info) / r.info < 0.2 && Math.abs(r.minY) < 0.15 * r.info, JSON.stringify(r));
    if (!['bee', 'chicken'].includes(id)) check(`${id}: faces +Z`, r.headZ > 0, `head z ${r.headZ}`);
    check(`${id}: clips sample finite poses`, !r.bad.length, r.bad.join(','));
    check(`${id}: instances are independent`, r.independent);
    check(`${id}: attacks carry hit events`, r.events);
  }
  fs.mkdirSync('screenshots/creatures', { recursive: true });
  for (const [clip, t] of [['idle', 0.3], ['walk', 0.25], ['run', 0.6], ['attack_slash', 0.45], ['death', 0.95]]) {
    await page.goto(`${server.resolvedUrls.local[0]}tools/creature-preview.html?clip=${clip}&t=${t}`);
    await page.waitForFunction('!!window.creatureReview');
    await page.evaluate(() => window.creatureReview.ready);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: `screenshots/creatures/${clip}.png` });
  }
  check('no page errors', !errors.some(e => e.startsWith('page:')), errors.join('; '));
} finally {
  await browser?.close();
  await server.close();
}
console.log(`\n${passed} passed, ${errors.length} failed`);
if (errors.length) process.exit(1);
