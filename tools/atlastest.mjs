// 40-biome atlas and chapter structure suite (Job 7): biome variants, landmark kinds,
// ridge/hub/edge walls, chapter gates, discovery and the world map.
//
//   npm run atlastest
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs, logicQuery } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { port: 5190, strictPort: false } });
await server.listen();
let browser;
const failures = [];
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  if (!ok) failures.push(name);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => failures.push(`pageerror: ${e.message}`));
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=4${logicQuery}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.manual = true;
    const V = window.__three.Vector3;
    /** Walks the player from polar (az, r) along the tangent for `seconds`; returns final polar coords. */
    window.__walkAcross = (az, r, seconds) => {
      const L = g.level, p = g.player;
      const x = Math.sin(az) * r, z = -Math.cos(az) * r;
      g.enemies.clear();
      p.combat.reset();
      p.controller.teleport(x, L.heightAt(x, z) + 0.2, z, 0);
      const yaw = Math.atan2(-Math.cos(az), -Math.sin(az));
      p.camera.setYaw(yaw, 0);
      L.setViewer(new V(x, 10, z), true);
      g.input.down.add('KeyW');
      for (let i = 0; i < seconds * 60; i++) { g.step(1 / 60); L.setViewer(p.controller.position); if (i % 30 === 0) L.update(1 / 60, 0); }
      g.input.clear();
      const q = p.controller.position;
      return { az: Math.atan2(q.x, -q.z), r: Math.hypot(q.x, q.z), chapter: L.atlas.chapterAt(q.x, q.z), x: q.x, z: q.z };
    };
  });
  const run = async (name, fn, arg) => {
    try {
      const r = await page.evaluate(fn, arg);
      check(name, r.ok, r.detail ?? '');
    } catch (e) { check(name, false, e.message); }
  };

  // --- atlas data -------------------------------------------------------------
  await run('forty distinct biomes, five per chapter', () => {
    const A = window.__game.level.atlas;
    const ids = new Set(A.sites.map(s => s.biome.id));
    const names = new Set(A.sites.map(s => s.biome.name));
    const perChapter = A.chapters.every(c => new Set(c.biomes.map(b => b.id)).size === 5);
    return { ok: ids.size === 40 && names.size === 40 && perChapter, detail: `ids=${ids.size} names=${names.size}` };
  });
  await run('every variant differs from its archetype in several ways', () => {
    const A = window.__game.level.atlas;
    const bases = {};
    for (const c of A.chapters.slice(0, 5)) bases[c.biomes[0].archetype] = c.biomes[0];
    const weak = [];
    for (const s of A.sites) {
      const b = s.biome, base = bases[b.archetype];
      if (b === base) continue;
      let diffs = 0;
      for (const key of ['terrain', 'palette', 'props', 'fauna', 'motes']) if (JSON.stringify(b[key]) !== JSON.stringify(base[key])) diffs++;
      if (b.sky !== base.sky) diffs++;
      if (JSON.stringify(b.landmark) !== JSON.stringify(base.landmark)) diffs++;
      if (diffs < 3) weak.push(`${b.id}:${diffs}`);
    }
    return { ok: weak.length === 0, detail: weak.length ? weak.join(' ') : 'all variants differ in ≥3 aspects' };
  });
  await run('expansion chapters have their own skies', () => {
    const A = window.__game.level.atlas;
    const skies = [6, 7, 8].map(c => new Set(A.chapters[c - 1].biomes.map(b => b.sky)));
    return { ok: skies[0].has('ashen-dusk') && skies[1].has('aurora-night') && skies[2].has('celestial-garden'), detail: skies.map(s => [...s].join('/')).join(' | ') };
  });
  await run('landmark generator uses every kind', () => {
    const L = window.__game.level;
    const kinds = new Set(L.atlas.sites.map(s => s.biome.landmark.kind));
    let empty = 0;
    for (const lm of L.landmarks) { let n = 0; lm.group.traverse(o => { if (o.isMesh) n++; }); if (!n || !lm.name) empty++; }
    return { ok: kinds.size === 10 && empty === 0 && L.landmarks.length === 40, detail: `${kinds.size} kinds: ${[...kinds].join(', ')}` };
  });

  // --- walls and gates ------------------------------------------------------------
  await run('invisible walls back every ridge crest', () => {
    const L = window.__game.level, V = window.__three.Vector3;
    let solid = 0, tested = 0;
    for (let b = 0; b < 8; b++) {
      const az = b * Math.PI / 4 + Math.PI / 8;
      for (const r of [900, 2000, 3300, 4000]) {
        const pass = L.atlas.passFor(b);
        if (pass && Math.abs(r - pass.r) < 150) continue;
        tested++;
        const x = Math.sin(az) * r, z = -Math.cos(az) * r;
        if (L.colliders.overlaps(new V(x, L.heightAt(x, z) + 3, z), 0.5)) solid++;
      }
    }
    return { ok: solid === tested, detail: `${solid}/${tested} crest samples solid` };
  });
  await run('the hub can only be left through its northern valley', () => {
    const L = window.__game.level, V = window.__three.Vector3;
    let walled = 0, open = 0;
    for (let i = 0; i < 72; i++) {
      const az = i / 72 * Math.PI * 2;
      const x = Math.sin(az) * 585, z = -Math.cos(az) * 585;
      if (L.colliders.overlaps(new V(x, L.heightAt(x, z) + 3, z), 0.5)) walled++; else open++;
    }
    const valley = window.__walkAcross(0.071, 540, 0.01);
    const north = L.colliders.overlaps(new V(Math.sin(0.071) * 585, L.heightAt(Math.sin(0.071) * 585, -Math.cos(0.071) * 585) + 3, -Math.cos(0.071) * 585), 0.5);
    return { ok: open <= 3 && walled >= 69 && !north, detail: `walled=${walled} open=${open} valley open=${!north} (at r=${valley.r.toFixed(0)})` };
  });
  await run('a sealed gate stops the player at the pass', () => {
    const g = window.__game, L = g.level;
    const gate = L.gates.gateFor(1);
    const start = gate.pass.azimuth - 40 / gate.pass.r;
    const end = window.__walkAcross(start, gate.pass.r, 6);
    const t = (end.az - gate.pass.azimuth) * gate.pass.r;
    return { ok: !gate.open && t < 0 && t > -12 && end.chapter === 1, detail: `stopped ${(-t).toFixed(1)} m short of the veil (chapter ${end.chapter})` };
  });
  await run('a closed gate explains itself', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const gate = L.gates.gateFor(1);
    L.setViewer(new V(gate.pass.x, 10, gate.pass.z));
    L.update(1 / 60, 0);
    return { ok: /Clear 3 more camps in The Tranquil Reach \(0\/3\)/.test(L.gateHint), detail: L.gateHint };
  });
  await run('clearing three camps opens the gate and the way through', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const gate = L.gates.gateFor(1);
    const camps = L.encounters.filter(e => e.id.startsWith('camp:c1-')).slice(0, 3);
    const announcements = [];
    const prev = L.onRegion;
    L.onRegion = (t, s) => announcements.push(`${t}: ${s}`);
    for (const c of camps) g.progress.clear(c.id);
    L.setViewer(new V(gate.pass.x, 10, gate.pass.z));
    L.update(1 / 60, 0);
    L.onRegion = prev;
    const opened = gate.open && g.progress.gates.has(gate.id);
    const start = gate.pass.azimuth - 40 / gate.pass.r;
    const end = window.__walkAcross(start, gate.pass.r, 9);
    const t = (end.az - gate.pass.azimuth) * gate.pass.r;
    return { ok: opened && t > 20 && end.chapter === 2 && announcements.some(a => a.startsWith('THE MIST PARTS')),
      detail: `open=${opened} crossed ${t.toFixed(1)} m into chapter ${end.chapter}; ${announcements[0]}` };
  });
  await run('clearing an encounter records progress', () => {
    const g = window.__game, T = window.__three;
    const enc = g.enemies.encounters.find(e => e.def.id === 'bridge-warden');
    g.enemies.clear();
    const p = g.player;
    p.combat.reset();
    p.controller.teleport(enc.def.trigger.x, g.level.heightAt(enc.def.trigger.x, enc.def.trigger.z) + 0.2, enc.def.trigger.z, 0);
    g.step(1.8); // let the warden finish rising (spawning enemies cannot be hit)
    for (const e of enc.living) g.combatWorld.strike(e, { damage: 999, direction: new T.Vector3(0, 0, -1), point: e.position.clone(), knockback: 0, stagger: 0, source: 'player', kind: 'heavy' });
    g.step(3);
    const ok = enc.state === 'cleared' && g.progress.cleared.has('bridge-warden');
    p.respawn();
    return { ok, detail: `state=${enc.state}` };
  });

  // --- discovery and the map ---------------------------------------------------------
  await run('walking into a region discovers it', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const site = L.atlas.sites.find(s => s.id === 'c3-2');
    const before = g.progress.discovered.has(site.id);
    L.setViewer(new V(0, 5, 0), true);
    L.setViewer(new V(site.x, 10, site.z));
    for (let i = 0; i < 100; i++) L.update(1 / 60, 0);
    L.setViewer(new V(0, 5, 0), true);
    return { ok: !before && g.progress.discovered.has(site.id), detail: [...g.progress.discovered].join(',') };
  });
  await page.evaluate(() => { const g = window.__game; g.manual = false; g.player.respawn(); });
  await page.keyboard.press('m');
  await wait(300);
  const opened = await page.evaluate(() => {
    const g = window.__game;
    const c = document.querySelector('.map-dialog canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) colors.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return { open: g.worldMap.isOpen && document.querySelector('.map-dialog').open, paused: g.menuOpen, colors: colors.size, text: document.querySelector('.map-panel').textContent };
  });
  check('M opens the map and pauses the world', opened.open && opened.paused, opened);
  check('the map is painted from the world', opened.colors > 40, `${opened.colors} distinct colours`);
  check('the map lists discovered regions and chapter progress', /Sunkeepers' Coast/.test(opened.text) && /Gate open/.test(opened.text) && /Undiscovered/.test(opened.text), opened.text.slice(0, 160));
  await page.keyboard.press('b');
  await wait(150);
  check('the spellbook cannot open over the map', await page.evaluate(() => window.__game.spellbookUI.mode === null));
  const revealed = await page.evaluate(() => {
    const g = window.__game;
    const before = g.worldMap.stats.revealed;
    g.progress.discover('c5-3');
    return { before, after: g.worldMap.stats.revealed };
  });
  check('discovering a region reveals it on the map', revealed.after > revealed.before, revealed);
  await page.keyboard.press('m');
  await wait(200);
  check('M closes the map and resumes', await page.evaluate(() => !window.__game.worldMap.isOpen && !window.__game.menuOpen && !window.__game.input.blocked));
} finally {
  await browser?.close();
  await server.close();
}
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
