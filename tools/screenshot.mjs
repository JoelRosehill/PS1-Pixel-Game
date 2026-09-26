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
