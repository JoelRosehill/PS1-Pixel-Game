// CPU frame-cost profiler (Job 10 performance pass). Drawing is skipped (render=0), so
// this measures the JavaScript side of a frame — simulation, streaming, AI, effects,
// HUD — at a few representative places. GPU cost needs a real GPU: use
// `npm run shot -- --view=spawn --perf` on a machine with one.
//
//   npm run perf
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { port: 5194, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
try {
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&render=0&frames=3`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  const scenarios = ['hub', 'run-north', 'chapter-2', 'camp-fight', 'boss'];
  for (const name of scenarios) {
    const r = await page.evaluate(async scenario => {
      const g = window.__game, L = g.level, p = g.player, V = window.__three.Vector3;
      g.input.clear(); g.enemies.clear(); p.combat.reset();
      const place = (x, z, yaw = 0) => { p.controller.teleport(x, L.heightAt(x, z) + 0.2, z, yaw); p.camera.setYaw(yaw, 0); L.setViewer(new V(x, 10, z), true); };
      if (scenario === 'hub') place(6, 11, Math.atan2(2, 71));
      if (scenario === 'run-north') { place(40, -560, 0); g.input.down.add('KeyW'); g.input.down.add('ShiftLeft'); }
      if (scenario === 'chapter-2') { const s = L.atlas.sites.find(x => x.chapter === 2); place(s.x, s.z); }
      if (scenario === 'camp-fight') {
        const enc = g.enemies.encounters.find(e => e.def.id.startsWith('camp:c1-'));
        place(enc.def.trigger.x, enc.def.trigger.z);
        p.combat.health = 1e9;
      }
      if (scenario === 'boss') {
        const a = L.bossArenas.find(x => x.boss.id === 'vermilion');
        place(a.center.x + a.radius - 10, a.center.z);
        p.combat.health = 1e9;
      }
      // Warm up, then time the whole frame function over real animation frames.
      const orig = g.tick;
      const samples = [];
      g.tick = now => { const t0 = performance.now(); orig(now); samples.push(performance.now() - t0); if (p.combat.health < 1e8 && scenario !== 'hub' && scenario !== 'run-north' && scenario !== 'chapter-2') p.combat.health = 1e9; };
      await new Promise(res => { let n = 0; const f = () => (++n > 300 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      g.tick = orig;
      g.input.clear();
      const s = samples.slice(60).sort((a, b) => a - b);
      const mean = s.reduce((a, b) => a + b, 0) / s.length;
      return { mean, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], enemies: g.enemies.enemies?.length ?? 0 };
    }, name);
    console.log(`${name.padEnd(12)} mean ${r.mean.toFixed(2)} ms · p95 ${r.p95.toFixed(2)} ms · max ${r.max.toFixed(1)} ms · enemies ${r.enemies}`);
  }
} finally {
  await browser.close();
  await server.close();
}
