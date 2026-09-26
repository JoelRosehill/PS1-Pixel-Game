// Headless screenshot tool: boots the Vite dev server, opens the game in Chrome
// with fixed camera/time, and saves PNGs to ./screenshots/.
//
//   npm run shot                       → the default Job 1 view set
//   npm run shot -- --view=spawn       → one named view
//   npm run shot -- --name=x --cam=0,5,10 --look=0,5,-50 --preset=blood-moon --bands
//
// Env: CHROME_PATH to override the browser, GPU=0 to force software rendering.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs } from './browser.mjs';

const VIEWS = {
  spawn: { cam: '9,4.6,17', look: '6,10,-60', preset: 'cosmic-violet' },
  'spawn-blood': { cam: '9,4.6,17', look: '6,10,-60', preset: 'blood-moon' },
  'spawn-bands': { cam: '9,4.6,17', look: '6,10,-60', preset: 'cosmic-violet', bands: true },
  'spawn-flat': { cam: '9,4.6,17', look: '6,10,-60', preset: 'cosmic-violet', mode: 'flat' },
  plaza: { cam: '5.5,3.4,10.5', look: '0,2.6,0', preset: 'cosmic-violet' },
  castle: { cam: '-6,4.2,-12', look: '-12,9,-54', preset: 'cosmic-violet' },
  lake: { cam: '40,5,-6', look: '112,8,-84', preset: 'verdigris-mist' },
  day: { cam: '30,4.5,4', look: '100,6,-60', preset: 'sunlit-wilderness' },
  high: { cam: '60,70,90', look: '-10,0,-90', preset: 'blood-moon' },
  // Player views (chase camera). 'at' teleports the player, 'yaw' aims the camera.
  hero: { at: '6,2.1,11', yaw: 186, preset: 'cosmic-violet' },
  'hero-course': { at: '20,5,10', yaw: 270, preset: 'cosmic-violet' },
  course: { cam: '16,17,30', look: '70,8,8', preset: 'cosmic-violet' },
  // Action poses: keys are held down for holdMs before the shot.
  'hero-run': { at: '6,2.1,24', yaw: 0, preset: 'cosmic-violet', hold: ['w'], holdMs: 900 },
  'hero-slide': { at: '54,11,10', yaw: 90, preset: 'sunlit-wilderness', hold: ['w', 'Control'], holdMs: 1100 },
  'hero-air': { at: '6,2.1,24', yaw: 0, preset: 'cosmic-violet', hold: ['w', ' '], holdMs: 380 },
  // Combat (Job 3). 'eval' runs in the page first; 'mouse' holds buttons before the shot.
  yard: { cam: '6,10,44', look: '26,3,28', preset: 'cosmic-violet' },
  fight: { at: '19,4,28.4', yaw: 0, preset: 'cosmic-violet', mouse: ['left'], holdMs: 150,
    eval: 'window.__game.player.combat.momentum.value = 64' },
  'fight-heavy': { at: '19,4,28.6', yaw: 0, preset: 'blood-moon', mouse: ['right'], holdMs: 520 },
  'fight-burst': { at: '19,4,29', yaw: 0, preset: 'cosmic-violet', holdMs: 220,
    eval: "const c = window.__game.player.combat; c.momentum.value = 100; c.momentum.resonance = true; setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })), 60)" },
  'hero-ramp': { at: '52,10,10', yaw: 100, preset: 'sunlit-wilderness' },
  'hero-shaft': { at: '70,4,10', yaw: 80, preset: 'cosmic-violet' },
  'hero-bridge': { at: '-12,2.2,-18', yaw: 0, preset: 'blood-moon' },
  chapel: { cam: '-24,13,55', look: '-61,8,27', preset: 'cosmic-violet' },
  demon: { cam: '-66,6,28', look: '-78,5,19', preset: 'blood-moon' },
  dragon: { cam: '-63,24,-58', look: '-92,24,-87', preset: 'sunlit-wilderness' },
  'book-cast': { at: '6,2.1,11', yaw: 186, preset: 'cosmic-violet', holdMs: 230,
    eval: "const p = window.__game.player; for (const id of ['ember-lance','frost-needle','violet-well','windstep','updraft','ember-ward','mend']) p.spells.collect(id); p.spells.book.select('ember-ward'); p.combat.momentum.value = 80; p.spells.cast();" },
  'book-leather': { at: '6,2.1,11', yaw: 186, preset: 'cosmic-violet' },
  spellbook: { at: '6,2.1,11', yaw: 186, preset: 'cosmic-violet',
    eval: "window.__game.player.spells.collect('ember-lance'); window.__game.player.spells.book.select('ember-lance'); window.__game.spellbookUI.open('book')" },
  // Enemies (Job 5). Spawned in manual mode and posed by stepping the simulation.
  knights: { at: '20,2.5,64', yaw: 0, preset: 'cosmic-violet', holdMs: 400,
    eval: "const g = window.__game; g.manual = true; const p = g.player.controller.position; const a = g.enemies.spawn('knight', 18, 58, { rise: false, facing: Math.PI }); const b = g.enemies.spawn('knight', 23, 57, { rise: false, facing: Math.PI * 0.9 }); a.perception.alert(p); b.perception.alert(p); g.step(1.5); a.attack = { id: 'doom', windup: 1.05, arc: 'overhead' }; a.state = 'windup'; a.stateTime = 0.8; g.step(1 / 60); a.think = () => {}; a.stateTime = 0.8; g.step(0.2);" },
  ruin: { cam: '2,12,-66', look: '22,5,-90', preset: 'cosmic-violet', holdMs: 400,
    eval: "const g = window.__game; for (const [x, y, z] of g.level.encounters[2].perches) g.enemies.spawn('wizard', x, z, { y, rise: false, facing: 0.9 });" },
  'wizard-cast': { at: '22,2.2,-76', yaw: 0, preset: 'blood-moon', holdMs: 400,
    eval: "const g = window.__game; g.manual = true; const [x, y, z] = g.level.encounters[2].perches[3]; const w = g.enemies.spawn('wizard', 22, -86, { rise: false, facing: 0 }); w.perception.alert(g.player.controller.position); w.think = () => {}; w.spell = 'flash'; w.state = 'cast'; w.stateTime = 0.85; g.step(1 / 60); const pp = g.player.controller.position.clone(); pp.x += 2.5; pp.z -= 3; pp.y = g.level.heightAt(pp.x, pp.z); g.enemies.telegraphs.circle(pp, 3.2, 30, 0xffd36a); g.enemies.telegraphs.update(0.6, 1); g.enemies.projectiles.fire(w.staffTip(new window.__three.Vector3()), new window.__three.Vector3(0.1, -0.15, 1), 0, 14, w, 0); g.gameHud.announce('SUNKEEPER WATCH', '2 waves'); g.player.camera.setYaw(0, 0.12);" },
  // Biomes (Job 6): fly-camera views of each archetype's anchor site.
  wilderness: { cam: '-45,26,-990', look: '15,14,-1056' },
  marsh: { cam: '650,14,-610', look: '708,6,-670' },
  terrace: { cam: '960,20,95', look: '1018,10,40' },
  caverns: { cam: '560,14,560', look: '659,30,653' },
  bloodstone: { cam: '-110,70,1030', look: '-30,60,1139' },
  'world-high': { cam: '0,420,700', look: '0,0,-900', preset: 'cosmic-violet' },
  // Walking out of the hub along the northern valley.
  'hub-exit': { at: '40,6,-560', yaw: 0 },
  // Job 7 landmark kinds and chapter gates (positions resolved in the page).
  'lm-bones': { cam: '0,20,0', look: '0,20,-10', eval: "const g = window.__game, L = g.level, V = window.__three.Vector3; const lm = L.landmarks.find(l => l.group.name.startsWith('bones:')); const p = new V(lm.x + 55, L.heightAt(lm.x + 55, lm.z + 40) + 18, lm.z + 40); g.fly.setPose(p, new V(lm.x, L.heightAt(lm.x, lm.z) + 6, lm.z)); L.setViewer(p, true);", holdMs: 300 },
  'lm-tree': { cam: '0,20,0', look: '0,20,-10', eval: "const g = window.__game, L = g.level, V = window.__three.Vector3; const lm = L.landmarks.find(l => l.group.name.startsWith('great-tree:')); const p = new V(lm.x + 60, L.heightAt(lm.x + 60, lm.z + 50) + 14, lm.z + 50); g.fly.setPose(p, new V(lm.x, L.heightAt(lm.x, lm.z) + 22, lm.z)); L.setViewer(p, true);", holdMs: 300 },
  'lm-portal': { cam: '0,20,0', look: '0,20,-10', eval: "const g = window.__game, L = g.level, V = window.__three.Vector3; const lm = L.landmarks.find(l => l.group.name.startsWith('portal:')); const p = new V(lm.x + 40, L.heightAt(lm.x + 40, lm.z + 35) + 8, lm.z + 35); g.fly.setPose(p, new V(lm.x, L.heightAt(lm.x, lm.z) + 10, lm.z)); L.setViewer(p, true);", holdMs: 300 },
  'lm-ruins': { cam: '0,20,0', look: '0,20,-10', eval: "const g = window.__game, L = g.level, V = window.__three.Vector3; const lm = L.landmarks.find(l => l.group.name.startsWith('ruins:')); const p = new V(lm.x + 50, L.heightAt(lm.x + 50, lm.z + 45) + 16, lm.z + 45); g.fly.setPose(p, new V(lm.x, L.heightAt(lm.x, lm.z) + 6, lm.z)); L.setViewer(p, true);", holdMs: 300 },
  'lm-arch': { cam: '0,20,0', look: '0,20,-10', eval: "const g = window.__game, L = g.level, V = window.__three.Vector3; const lm = L.landmarks.find(l => l.group.name.startsWith('arch:')); const p = new V(lm.x + 60, L.heightAt(lm.x + 60, lm.z + 45) + 12, lm.z + 45); g.fly.setPose(p, new V(lm.x, L.heightAt(lm.x, lm.z) + 12, lm.z)); L.setViewer(p, true);", holdMs: 300 },
  gate: { cam: '0,20,0', look: '0,20,-10', holdMs: 300,
    eval: "const g = window.__game, L = g.level, V = window.__three.Vector3; const gate = L.gates.gates[0]; const a = gate.pass.azimuth - 0.05; const p = new V(Math.sin(a) * (gate.pass.r - 40), 0, -Math.cos(a) * (gate.pass.r - 40)); p.y = L.heightAt(p.x, p.z) + 6; g.fly.setPose(p, new V(gate.pass.x, L.heightAt(gate.pass.x, gate.pass.z) + 14, gate.pass.z)); L.setViewer(p, true);" },
  map: { at: '6,2.1,11', yaw: 186, holdMs: 400,
    eval: "const g = window.__game; for (const id of ['c1-0', 'c1-1', 'c1-2', 'c2-0', 'c8-0']) g.progress.discover(id); g.progress.clear(g.level.encounters.find(e => e.id.startsWith('camp:c1-0')).id); g.worldMap.open();" },
  // Bosses (Job 8): an intro frame and a fight frame each.
  'boss-intro': { at: '0,20,0', yaw: 0, holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'vermilion'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(1.6); " },
  'boss-gloomhorn': { at: '0,20,0', yaw: 0, holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'gloomhorn'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(4.2); const b = g.enemies.activeBoss; b.startMove('slam', g.enemies.ctx); g.step(0.7);" },
  'boss-vermilion': { at: '0,20,0', yaw: 0, holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'vermilion'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(4.2); const b = g.enemies.activeBoss; b.startMove('breathRun', g.enemies.ctx); g.step(1.1);" },
  'boss-sovereign': { at: '0,20,0', yaw: 0, holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'sovereign'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(4.2); const b = g.enemies.activeBoss; b.startMove('moonDescent', g.enemies.ctx); g.step(1.0);" },
};
const DEFAULT_SET = ['spawn', 'spawn-bands', 'spawn-blood', 'plaza', 'castle', 'lake', 'day', 'hero', 'hero-course', 'fight'];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const W = Number(args.w ?? 1280);
const H = Number(args.h ?? 720);
const outDir = path.resolve('screenshots');
fs.mkdirSync(outDir, { recursive: true });

let jobs;
if (args.cam) {
  jobs = [[args.name ?? 'custom', { cam: args.cam, look: args.look, preset: args.preset, mode: args.mode, bands: !!args.bands }]];
} else if (args.at) {
  jobs = [[args.name ?? 'custom', { at: args.at, yaw: args.yaw, preset: args.preset, mode: args.mode, bands: !!args.bands }]];
} else {
  const names = args.view ? String(args.view).split(',') : DEFAULT_SET;
  jobs = names.map((n) => [n, VIEWS[n]]);
}

const executablePath = browserPath();

const server = await createServer({ logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: launchArgs([`--window-size=${W},${H}`]),
});

let failed = false;
try {
  for (const [name, v] of jobs) {
    if (!v) {
      console.error(`unknown view: ${name}`);
      failed = true;
      continue;
    }
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const logs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    const q = new URLSearchParams({ shot: '1' });
    if (!v.hold && !v.mouse && !v.eval) q.set('time', String(args.time ?? 14));
    if (v.at) {
      // Player shots need a few more frames so the character settles on the ground.
      q.set('gamehud', args.gamehud === '0' ? '0' : '1');
      q.set('at', v.at);
      q.set('yaw', String(v.yaw ?? 0));
      q.set('frames', String(args.frames ?? 40));
    } else {
      q.set('cam', v.cam);
      q.set('look', v.look);
    }
    if (v.preset) q.set('preset', v.preset);
    if (v.mode) q.set('mode', v.mode);
    if (v.bands) q.set('bands', '1');
    if (args.hud) q.set('hud', '1');
    if (args.lines) q.set('lines', String(args.lines));
    const t0 = Date.now();
    await page.goto(`${base}?${q}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 180000 });
    const info = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return { error: window.__error };
      const gl = g.pixel.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = g.pixel.renderer.info.render;
      return {
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        calls: r.calls,
        tris: r.triangles,
        error: window.__error || (g.assetErrors.length ? g.assetErrors.join('; ') : undefined),
      };
    });
    if (args.perf) {
      const ms = await page.evaluate(
        () =>
          new Promise((resolve) => {
            let n = 0;
            let t0 = 0;
            const f = (t) => {
              if (n === 10) t0 = t;
              if (++n === 130) resolve((t - t0) / 120);
              else requestAnimationFrame(f);
            };
            requestAnimationFrame(f);
          }),
      );
      console.log(`   perf: ${ms.toFixed(2)} ms/frame (${(1000 / ms).toFixed(0)} fps, rAF-capped)`);
    }
    if (v.eval) await page.evaluate(v.eval);
    if (v.hold) for (const k of v.hold) await page.keyboard.down(k);
    if (v.mouse) for (const b of v.mouse) await page.mouse.down({ button: b });
    if (v.hold || v.mouse || v.eval) await new Promise((r) => setTimeout(r, v.holdMs ?? 600));
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    if (v.hold) for (const k of v.hold) await page.keyboard.up(k);
    if (v.mouse) for (const b of v.mouse) await page.mouse.up({ button: b });
    console.log(`✔ ${name}.png  ${Date.now() - t0}ms  draws=${info.calls} tris=${info.tris}  gpu=${info.gpu}`);
    if (info.error) {
      console.error(info.error);
      failed = true;
    }
    for (const l of logs) console.log(`   ${l}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
