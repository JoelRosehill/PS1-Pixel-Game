// 40-biome atlas and chapter structure suite (Jobs 7, 15): the journey's biomes, the
// supplied structures in their biomes, valley walls, chapter gates, discovery and the map.
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
    /** Walks the player along the road from arc length `s` for `seconds`, steering like a player. */
    window.__walkRoad = (s, seconds) => {
      const L = g.level, A = L.atlas, p = g.player;
      const q = A.road.pointAt(s);
      g.enemies.clear();
      p.combat.reset();
      p.controller.teleport(q.x, L.heightAt(q.x, q.z) + 0.2, q.z, 0);
      L.setViewer(new V(q.x, 10, q.z), true);
      g.input.down.add('KeyW');
      for (let i = 0; i < seconds * 60; i++) {
        const h = A.road.nearest(p.controller.position.x, p.controller.position.z);
        const ahead = A.road.pointAt(h.s + 12);
        p.camera.setYaw(Math.atan2(-(ahead.x - p.controller.position.x), -(ahead.z - p.controller.position.z)), 0);
        g.step(1 / 60);
        L.setViewer(p.controller.position);
        if (i % 30 === 0) L.update(1 / 60, 0);
      }
      g.input.clear();
      const e = p.controller.position;
      return { s: A.road.nearest(e.x, e.z).s, chapter: A.chapterAt(e.x, e.z) };
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
  await run('neighbouring biomes differ in several ways', () => {
    const A = window.__game.level.atlas;
    const weak = [];
    A.sites.forEach((site, i) => {
      if (!i) return;
      const a = A.sites[i - 1].biome, b = site.biome;
      let diffs = 0;
      for (const key of ['terrain', 'palette', 'props', 'fauna', 'motes']) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) diffs++;
      if (a.sky !== b.sky) diffs++;
      if (a.mood !== b.mood) diffs++;
      if (diffs < 3) weak.push(`${b.id}:${diffs}`);
    });
    return { ok: weak.length === 0, detail: weak.length ? weak.join(' ') : 'every step of the road changes ≥3 aspects' };
  });
  await run('later chapters have their own skies', () => {
    const A = window.__game.level.atlas;
    const skies = [6, 7, 8].map(c => new Set(A.chapters[c - 1].biomes.map(b => b.sky)));
    return { ok: skies[0].has('ashen-dusk') && skies[1].has('aurora-night') && skies[2].has('celestial-garden'), detail: skies.map(s => [...s].join('/')).join(' | ') };
  });
  await run('every biome names its own foes, and they grow stronger along the road', () => {
    const A = window.__game.level.atlas;
    const foes = new Set();
    let named = 0, rising = true;
    A.sites.forEach((s, i) => {
      if (s.biome.fauna.foes && Object.keys(s.biome.fauna.foes).length) named++;
      for (const f of Object.keys(s.biome.fauna.foes ?? {})) foes.add(f);
      if (i && s.leg.level < A.sites[i - 1].leg.level) rising = false;
    });
    return { ok: named === 40 && foes.size >= 11 && rising, detail: `${foes.size} kinds: ${[...foes].join(', ')}` };
  });
  await run('the supplied structures stand in the biomes they belong to', () => {
    const L = window.__game.level;
    const want = {
      'church-psx': 'c1-3', 'free-modular-castle-kit': 'c1-4', 'ps1-style-low-poly-sun': 'c3-4', 'ps1-style-creepy-forest-environment': 'c5-1',
      'castle-xiii': 'c5-4', 'ps1-sword-b': 'c6-1', 'lowpoly-castle': 'c6-4', 'retro-lowpoly-crt-tv': 'c7-1', 'ps1-style-old-keyboard': 'c7-1',
      'classical-guitar-ps1-low-poly': 'c7-2', 'the-lost-relic': 'c8-2', 'a-forest-3-with-a-road-at-night-for-game': 'c1-0',
    };
    const wrong = [];
    for (const [model, site] of Object.entries(want)) {
      const st = L.structures.placed.find(p => p.spec.model === model);
      const at = st && L.atlas.nearest(st.x, st.z).id;
      if (at !== site) wrong.push(`${model}:${at}`);
    }
    return { ok: !wrong.length, detail: wrong.length ? wrong.join(' ') : `${Object.keys(want).length} checked` };
  });
  await run('nothing colossal is piled up at the start', () => {
    const L = window.__game.level, st = L.atlas.start;
    const near = L.structures.placed.filter(p => Math.hypot(p.x - st.x, p.z - st.z) < 900 && p.radius > 12).map(p => p.spec.model);
    const arenas = L.bossArenas.filter(a => Math.hypot(a.center.x - st.x, a.center.z - st.z) < 900).length;
    return { ok: near.every(m => m.startsWith('a-forest') || m.startsWith('the-landscape')) && arenas === 0 && L.enemies.length === 0, detail: `near the start: ${near.join(', ') || 'nothing large'}` };
  });

  // --- walls and gates ------------------------------------------------------------
  await run('the valley edge holds; its floor is open', () => {
    const L = window.__game.level, A = L.atlas, V = window.__three.Vector3;
    let solid = 0, tested = 0, blocked = 0, floor = 0;
    for (let s = 300; s < A.road.length - 900; s += 211) {
      const W = A.widthAt(s);
      for (const side of [1, -1]) {
        const p = A.road.offset(s, side * (W + 116));
        if (Math.hypot(p.x, p.z) < 560) continue; // the Dawnspire's plaza is open all round
        // Only where this offset really is nearest to its own stretch (not inside a curve).
        if (Math.abs(A.road.nearest(p.x, p.z).s - s) > 30) continue;
        tested++;
        if (L.colliders.overlaps(new V(p.x, L.heightAt(p.x, p.z) + 3, p.z), 1.5)) solid++;
        const q = A.road.offset(s, side * W * 0.4);
        floor++;
        if (L.colliders.overlaps(new V(q.x, L.heightAt(q.x, q.z) + 60, q.z), 0.5)) blocked++;
      }
    }
    return { ok: solid === tested && tested > 120 && blocked === 0, detail: `${solid}/${tested} wall samples solid; ${blocked}/${floor} valley samples blocked` };
  });
  await run('behind Hollowmere the valley is closed', () => {
    const L = window.__game.level, A = L.atlas, V = window.__three.Vector3;
    const p = A.road.pointAt(0);
    const back = { x: p.x - p.tx * (A.widthAt(0) + 110), z: p.z - p.tz * (A.widthAt(0) + 110) };
    return { ok: L.colliders.overlaps(new V(back.x, L.heightAt(back.x, back.z) + 3, back.z), 1.5), detail: `wall behind the start` };
  });
  await run('a sealed gate stops the player in the gorge', () => {
    const g = window.__game, L = g.level;
    const gate = L.gates.gateFor(1);
    const end = window.__walkRoad(gate.pass.s - 40, 7);
    const t = end.s - gate.pass.s;
    return { ok: !gate.open && t < 0 && t > -12 && end.chapter === 1, detail: `stopped ${(-t).toFixed(1)} m short of the veil (chapter ${end.chapter})` };
  });
  await run('a closed gate explains itself', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const gate = L.gates.gateFor(1);
    L.setViewer(new V(gate.pass.x, 10, gate.pass.z));
    L.update(1 / 60, 0);
    return { ok: /Clear 3 more camps in The Hollow Reach \(0\/3\)/.test(L.gateHint), detail: L.gateHint };
  });
  await run('the chapter boss is the last key', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const gate = L.gates.gateFor(1);
    for (const c of L.encounters.filter(e => e.id.startsWith('camp:c1-')).slice(0, 3)) g.progress.clear(c.id);
    L.setViewer(new V(gate.pass.x, 10, gate.pass.z));
    L.update(1 / 60, 0);
    return { ok: !gate.open && /Morrow/.test(L.gateHint), detail: L.gateHint };
  });
  await run('felling the boss opens the gate and the way through', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const gate = L.gates.gateFor(1);
    const announcements = [];
    const prev = L.onRegion;
    L.onRegion = (t, s) => announcements.push(`${t}: ${s}`);
    g.progress.fellBoss('morrow');
    L.setViewer(new V(gate.pass.x, 10, gate.pass.z));
    L.update(1 / 60, 0);
    L.onRegion = prev;
    const opened = gate.open && g.progress.gates.has(gate.id);
    const end = window.__walkRoad(gate.pass.s - 40, 9);
    const t = end.s - gate.pass.s;
    return { ok: opened && t > 20 && end.chapter === 2 && announcements.some(a => a.startsWith('THE MIST PARTS')),
      detail: `open=${opened} crossed ${t.toFixed(1)} m into chapter ${end.chapter}; ${announcements[0]}` };
  });
  await run('clearing an encounter records progress', () => {
    const g = window.__game, T = window.__three;
    const enc = g.enemies.encounters.find(e => e.def.id.startsWith('camp:c2-') && e.state === 'dormant');
    g.enemies.clear();
    const p = g.player;
    p.combat.reset();
    p.controller.teleport(enc.def.trigger.x, g.level.heightAt(enc.def.trigger.x, enc.def.trigger.z) + 0.2, enc.def.trigger.z, 0);
    for (let w = 0; w < enc.def.waves.length; w++) {
      g.step(1.8); // let the wave finish rising (spawning enemies cannot be hit)
      for (const e of enc.living) g.combatWorld.strike(e, { damage: 99999, direction: new T.Vector3(0, 0, -1), point: e.position.clone(), knockback: 0, stagger: 0, source: 'player', kind: 'heavy' });
      g.step(3);
    }
    const ok = enc.state === 'cleared' && g.progress.cleared.has(enc.def.id);
    p.respawn();
    return { ok, detail: `${enc.def.id} state=${enc.state}` };
  });

  // --- discovery and the map ---------------------------------------------------------
  await run('walking into a region discovers it', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const site = L.atlas.sites.find(s => s.id === 'c3-2');
    const before = g.progress.discovered.has(site.id);
    const st = L.atlas.start;
    L.setViewer(new V(st.x, 5, st.z), true);
    L.setViewer(new V(site.x, 10, site.z));
    for (let i = 0; i < 100; i++) L.update(1 / 60, 0);
    L.setViewer(new V(st.x, 5, st.z), true);
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
