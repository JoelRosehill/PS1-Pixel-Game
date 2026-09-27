// Headless screenshot tool: boots the Vite dev server, opens the game in Chrome
// with fixed camera/time, and saves PNGs to ./screenshots/.
//
//   npm run shot                       → the default view set (the Long Road)
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
  // The Long Road (Job 15). Player views start at the spawn in Hollowmere; fly views are
  // placed from the level's own data (road positions, structures, gates, arenas).
  spawn: { at: 'spawn', preset: 'cosmic-violet' },
  'spawn-bands': { at: 'spawn', preset: 'cosmic-violet', bands: true },
  vista: { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const p = A.road.pointAt(40); fly(new V(p.x - p.tx * 40, L.heightAt(p.x, p.z) + 45, p.z - p.tz * 40), new V(0, 700, 0));" },
  'road-ahead': { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const site = A.sites.find(s => s.id === (window.__site ?? 'c1-1')); const s = site.s0 + (site.s1 - site.s0) * 0.3; const p = A.road.pointAt(s), q = A.road.pointAt(s + 120); fly(new V(p.x, L.heightAt(p.x, p.z) + 3, p.z), new V(q.x, L.heightAt(q.x, q.z) + 4, q.z));" },
  gate: { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const gt = A.gates[0]; const p = A.road.pointAt(gt.s - 110); fly(new V(p.x, L.heightAt(p.x, p.z) + 8, p.z), new V(gt.x, L.heightAt(gt.x, gt.z) + 30, gt.z));" },
  dawnspire: { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const p = A.road.pointAt(A.road.length - 700); fly(new V(p.x, L.heightAt(p.x, p.z) + 6, p.z), new V(0, 600, 0));" },
  church: { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const st = L.structures.placed.find(p => p.spec.model === 'church-psx'); const h = A.road.nearest(st.x, st.z); const dx = h.x - st.x, dz = h.z - st.z, d = Math.hypot(dx, dz); const x = st.x + dx / d * (st.radius * 1.2 + 40), z = st.z + dz / d * (st.radius * 1.2 + 40); fly(new V(x, L.heightAt(x, z) + 20, z), new V(st.x, st.y + st.radius * 0.2, st.z));" },
  'red-keep': { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const st = L.structures.placed.find(p => p.spec.model === 'castle-xiii'); const h = A.road.nearest(st.x, st.z); const dx = h.x - st.x, dz = h.z - st.z, d = Math.hypot(dx, dz); const x = st.x + dx / d * (st.radius * 1.0 + 40), z = st.z + dz / d * (st.radius * 1.0 + 40); fly(new V(x, L.heightAt(x, z) + 60, z), new V(st.x, st.y + st.radius * 0.2, st.z));" },
  'sword-graveyard': { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const site = A.sites.find(x => x.id === 'c6-1'); const s = site.s0 + (site.s1 - site.s0) * 0.05; const p = A.road.pointAt(s), q = A.road.pointAt(s + 200); fly(new V(p.x, L.heightAt(p.x, p.z) + 5, p.z), new V(q.x, L.heightAt(q.x, q.z) + 45, q.z));" },
  'obsolete-sea': { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const st = L.structures.placed.find(p => p.spec.model === 'retro-lowpoly-crt-tv'); const h = A.road.nearest(st.x, st.z); const dx = h.x - st.x, dz = h.z - st.z, d = Math.hypot(dx, dz); const x = st.x + dx / d * (st.radius * 2 + 40), z = st.z + dz / d * (st.radius * 2 + 40); fly(new V(x, L.heightAt(x, z) + 20, z), new V(st.x, st.y + st.radius * 0.2, st.z));" },
  'temple-of-the-sun': { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const st = L.structures.placed.find(p => p.spec.model === 'proc:temple'); const h = A.road.nearest(st.x, st.z); const dx = h.x - st.x, dz = h.z - st.z, d = Math.hypot(dx, dz); const x = st.x + dx / d * (st.radius * 1.0 + 40), z = st.z + dz / d * (st.radius * 1.0 + 40); fly(new V(x, L.heightAt(x, z) + 60, z), new V(st.x, st.y + st.radius * 0.2, st.z));" },
  'moat-keep': { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const st = L.structures.placed.find(p => p.spec.model === 'lowpoly-castle'); const h = A.road.nearest(st.x, st.z); const p = A.road.pointAt(h.s - 160); fly(new V(p.x, L.heightAt(p.x, p.z) + 30, p.z), new V(st.x, st.y + 10, st.z));" },
  'pale-cathedral': { cam: '0,20,0', look: '0,20,-10', holdMs: 400, eval: "const g = window.__game, L = g.level, A = L.atlas, V = window.__three.Vector3; const fly = (from, to) => { g.fly.walk = false; g.fly.setPose(from, to); g.setFlyMode(true); L.setViewer(from, true); }; const st = L.structures.placed.find(p => p.spec.model === 'the-lost-relic'); const h = A.road.nearest(st.x, st.z); const dx = h.x - st.x, dz = h.z - st.z, d = Math.hypot(dx, dz); const x = st.x + dx / d * (st.radius * 1.0 + 40), z = st.z + dz / d * (st.radius * 1.0 + 40); fly(new V(x, L.heightAt(x, z) + 40, z), new V(st.x, st.y + st.radius * 0.2, st.z));" },
  map: { at: 'spawn', holdMs: 400,
    eval: "const g = window.__game; for (const id of ['c1-0', 'c1-1', 'c1-2', 'c2-0', 'c8-0']) g.progress.discover(id); g.progress.clear(g.level.encounters.find(e => e.id.startsWith('camp:c1-')).id); g.worldMap.open();" },
  // Bosses: a fight frame each.
  'boss-intro': { at: 'spawn', holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'vermilion'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(1.6); " },
  'boss-gloomhorn': { at: 'spawn', holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'gloomhorn'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(4.2); const b = g.enemies.activeBoss; b.startMove('slam', g.enemies.ctx); g.step(0.7);" },
  'boss-vermilion': { at: 'spawn', holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'vermilion'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(4.2); const b = g.enemies.activeBoss; b.startMove('breath', g.enemies.ctx); g.step(1.4);" },
  'boss-sovereign': { at: 'spawn', holdMs: 500,
    eval: "const g = window.__game, L = g.level; g.manual = true; const a = L.bossArenas.find(x => x.boss.id === 'sovereign'); const c = a.center; const p = g.player; p.controller.teleport(c.x + a.radius - 10, L.heightAt(c.x + a.radius - 10, c.z) + 0.2, c.z, 0); L.setViewer(p.controller.position.clone(), true); g.step(4.2); const b = g.enemies.activeBoss; b.startMove('descent', g.enemies.ctx); g.step(1.0);" },
  // Story: a kindled shrine, the rest menu, a lore tablet and the journal.
  shrine: { at: 'spawn', holdMs: 700,
    eval: "const g = window.__game, s = g.level.story.shrine('c1-1'); const out = s.rest.clone().sub(s.position).setY(0).normalize(); const p = s.rest.clone().addScaledVector(out, 2.5); p.y = g.level.heightAt(p.x, p.z); g.player.controller.teleport(p.x, p.y + 0.2, p.z, s.facing); g.player.camera.setYaw(Math.atan2(-out.x, -out.z) + Math.PI, -0.12); g.level.setViewer(p, true); s.prop.setKindled(true); g.progress.kindle('c1-1');" },
  'rest-menu': { at: 'spawn', holdMs: 500,
    eval: "const g = window.__game, S = g.level.story; for (const id of ['c1-1', 'c1-3', 'c2-0', 'c2-4']) { S.shrine(id).prop.setKindled(true); g.progress.kindle(id); } const s = S.shrine('c1-1'); g.travelTo(s); g.playTime = 4520; g.deaths = 7; g.restAt(s);" },
  'lore-reader': { at: 'spawn', holdMs: 500,
    eval: "const g = window.__game, spot = g.level.story.lore.find(l => l.id === 'c1-2'); const p = spot.position; g.player.controller.teleport(p.x + 2, g.level.heightAt(p.x + 2, p.z) + 0.2, p.z, Math.PI / 2); g.level.setViewer(p, true); g.readLore(spot);" },
  journal: { at: 'spawn', holdMs: 500,
    eval: "const g = window.__game; for (const id of ['c1-0', 'c1-1', 'c1-2', 'c2-0']) g.progress.discover(id); for (const id of ['c1-0', 'c1-2', 'c1-4', 'mem-1', 'c2-0']) g.progress.readLore(id); g.progress.remember('rem-gloomhorn'); g.storyUI.openJournal();" },
  prologue: { at: 'spawn', holdMs: 500, eval: "window.__game.progress.lore.delete('prologue'); window.__game.showPrologue();" },
  wanderer: { at: 'spawn', holdMs: 400,
    eval: "const g = window.__game, w = g.level.wanderer.position, p = g.player.controller.position; g.player.camera.setYaw(Math.atan2(-(w.x - p.x), -(w.z - p.z)), -0.05);" },
  // Title, menus, HUD, ending, pixel bloom.
  title: { at: 'spawn', title: true, holdMs: 1500, eval: "window.__game.menu.dialog.querySelector('[data-autofocus]')?.blur()" },
  pause: { at: 'spawn', holdMs: 400, eval: "window.__game.menu.open('pause')" },
  settings: { at: 'spawn', holdMs: 400, eval: "const m = window.__game.menu; m.open('pause'); m.dialog.querySelector('[data-action=\"settings\"]').click(); m.dialog.querySelector('[data-tab=\"display\"]').click();" },
  controls: { at: 'spawn', holdMs: 400, eval: "const m = window.__game.menu; m.open('pause'); m.dialog.querySelector('[data-action=\"settings\"]').click(); m.dialog.querySelector('[data-tab=\"controls\"]').click();" },
  ending: { at: 'spawn', holdMs: 400,
    eval: "const g = window.__game; g.playTime = 9 * 3600 + 42 * 60; g.deaths = 57; for (const s of g.level.story.shrines.slice(0, 33)) s.prop.setKindled(true); for (const b of ['morrow', 'gloomhorn', 'solenne', 'glutton', 'vermilion', 'caddoc', 'hivequeen', 'sovereign']) g.progress.fellBoss(b); g.menu.open('ending');" },
  'bloom-off': { at: 'spawn', preset: 'cosmic-violet', holdMs: 600, eval: 'window.__game.pixel.settings.bloom = 0' },
  'bloom-on': { at: 'spawn', preset: 'cosmic-violet', holdMs: 600, eval: 'window.__game.pixel.settings.bloom = 0.6' },
};
const DEFAULT_SET = ['spawn', 'vista', 'road-ahead', 'gate', 'church', 'red-keep', 'dawnspire', 'boss-vermilion'];

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
    if (v.title) q.set('title', '1');
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
