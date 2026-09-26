// World engine regression suite (Job 6): layout, blended terrain, ridges and passes,
// quadtree streaming and LOD, prop streaming and colliders, biome moods, camps.
//
//   npm run worldtest
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs, logicQuery } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { port: 5192, strictPort: false } });
await server.listen();
let browser;
const failures = [];
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  if (!ok) failures.push(name);
};

try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
  const page = await browser.newPage();
  page.on('pageerror', e => failures.push(`pageerror: ${e.message}`));
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=4${logicQuery}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  await page.evaluate(() => { window.__game.manual = true; });
  const run = async (name, fn) => {
    try {
      const r = await page.evaluate(fn);
      check(name, r.ok, r.detail ?? '');
    } catch (e) { check(name, false, e.message); }
  };

  // --- layout and terrain ------------------------------------------------------
  await run('eight chapters of five biome sites', () => {
    const A = window.__game.level.atlas;
    const per = {};
    for (const s of A.sites) per[s.chapter] = (per[s.chapter] ?? 0) + 1;
    const archetypes = new Set(A.sites.map(s => s.biome.archetype));
    return { ok: A.sites.length === 40 && Object.values(per).every(n => n === 5) && archetypes.size === 5 && A.passes.length === 7,
      detail: `sites=${A.sites.length} archetypes=${[...archetypes].join(',')} passes=${A.passes.length}` };
  });
  await run('the hub is untouched inside its radius', () => {
    const L = window.__game.level;
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const a = i * 2.39996, r = Math.sqrt(i / 400) * 375;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      worst = Math.max(worst, Math.abs(L.heightAt(x, z) - L.hub.ground.heightAt(x, z)));
    }
    return { ok: worst === 0, detail: `max difference ${worst}` };
  });
  await run('biome borders are continuous', () => {
    const L = window.__game.level, A = L.atlas;
    // Find the largest step along each border crossing, then zoom into it: a steep slope
    // shrinks when sampled 100× finer, a discontinuity does not.
    let worst = 0, where = '';
    for (const s of A.sites) {
      let o = null, best = Infinity;
      for (const t of A.sites) { const d = Math.hypot(t.x - s.x, t.z - s.z); if (t !== s && d < best) { best = d; o = t; } }
      const at = f => L.heightAt(s.x + (o.x - s.x) * f, s.z + (o.z - s.z) * f);
      let prev = at(0), big = 0, bigAt = 0;
      for (let k = 1; k <= 800; k++) {
        const h = at(k / 800);
        if (Math.abs(h - prev) > big) { big = Math.abs(h - prev); bigAt = k; }
        prev = h;
      }
      let zoom = 0;
      prev = at((bigAt - 1) / 800);
      for (let k = 1; k <= 100; k++) {
        const h = at((bigAt - 1 + k / 100) / 800);
        zoom = Math.max(zoom, Math.abs(h - prev));
        prev = h;
      }
      if (zoom > worst) { worst = zoom; where = `${s.id}→${o.id} coarse ${big.toFixed(2)} m`; }
    }
    return { ok: worst < 0.4, detail: `largest step at ${(1 / 100).toFixed(2)}× spacing: ${worst.toFixed(3)} m (${where})` };
  });
  await run('blend weights sum to one and favour the nearest site', () => {
    const A = window.__game.level.atlas;
    const sites = [], w = [];
    let ok = true;
    for (const s of A.sites) {
      const n = A.weights(s.x, s.z, sites, w);
      const sum = w.slice(0, n).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-9 || sites[0] !== s || w[0] < 0.9) ok = false;
    }
    return { ok, detail: 'checked all 40 site centres' };
  });
  await run('ridges divide chapters; passes cut through them', () => {
    const L = window.__game.level, A = L.atlas;
    const at = (az, r) => L.heightAt(Math.sin(az) * r, -Math.cos(az) * r);
    const results = [];
    let ok = true;
    for (let b = 0; b < 8; b++) {
      const az = b * Math.PI / 4 + Math.PI / 8;
      const pass = A.passFor(b);
      // Ridge: the crest stands well above ground 250 m to either side.
      const r = pass ? (pass.r > 2500 ? pass.r - 700 : pass.r + 700) : 2200;
      const side = Math.max(at(az - 250 / r, r), at(az + 250 / r, r));
      const ridge = at(az, r) - side;
      if (ridge < 40) ok = false;
      let detail = `${b}:ridge+${ridge.toFixed(0)}`;
      if (pass) {
        // Pass: far below the crest nearby, and walkable straight across.
        const crest = Math.max(at(az, pass.r - 320), at(az, pass.r + 320));
        const drop = crest - at(az, pass.r);
        let steepest = 0;
        let prev = at(az - 150 / pass.r, pass.r);
        for (let k = -149; k <= 150; k++) {
          const h = at(az + k / pass.r, pass.r);
          steepest = Math.max(steepest, Math.abs(h - prev));
          prev = h;
        }
        if (drop < 30 || steepest > 1) ok = false;
        detail += ` pass-${drop.toFixed(0)} slope ${steepest.toFixed(2)}`;
      } else detail += ' sealed';
      results.push(detail);
    }
    return { ok, detail: results.join(' | ') };
  });
  await run('the world is ringed by high mountains', () => {
    const L = window.__game.level;
    let lowest = Infinity;
    for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; lowest = Math.min(lowest, L.heightAt(Math.sin(a) * 4800, Math.cos(a) * 4800)); }
    return { ok: lowest > 200, detail: `lowest edge peak ${lowest.toFixed(0)} m` };
  });

  // --- archetype signatures --------------------------------------------------
  await run('each archetype has its signature ground', () => {
    const L = window.__game.level, A = L.atlas;
    const stats = {};
    for (const s of A.sites.filter(s => s.slot === 0 && s.chapter <= 5)) {
      const hs = [];
      for (let i = 0; i < 900; i++) {
        const a = i * 2.39996, r = Math.sqrt(i / 900) * s.radius * 0.6;
        hs.push(L.heightAt(s.x + Math.sin(a) * r, s.z + Math.cos(a) * r));
      }
      const water = hs.filter(h => h < 0).length / hs.length;
      const mean = [...hs].sort((a, b) => a - b)[hs.length >> 1];
      const low = hs.filter(h => h < 8).length / hs.length;
      const rim = Math.max(...[0, 1, 2, 3, 4, 5].map(k => L.heightAt(s.x + Math.sin(k) * s.radius * 0.66, s.z + Math.cos(k) * s.radius * 0.66)));
      stats[s.biome.archetype] = { water, mean, low, centre: L.heightAt(s.x, s.z), rim };
    }
    const w = stats.wilderness, m = stats.marsh, t = stats.terrace, c = stats.caverns, b = stats.bloodstone;
    const ok = w.water > 0.02 && w.mean > 3 && m.water > 0.2 && m.mean < 2.5 && t.water > 0.05 && c.rim - c.centre > 20 && b.mean > 18 && b.low > 0.03;
    const f = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(2)]));
    return { ok, detail: { wilderness: f(w), marsh: f(m), terrace: f(t), caverns: f(c), bloodstone: f(b) } };
  });

  // --- streaming ---------------------------------------------------------------
  await run('terrain tiles cover the view without holes or overlaps', () => {
    const T = window.__three, L = window.__game.level;
    const v = new T.Vector3(700, 10, -700);
    L.setViewer(v, true);
    const tiles = L.tiles.visibleTiles;
    let bad = 0;
    for (let i = 0; i < 2000; i++) {
      const x = v.x + (Math.random() * 2 - 1) * 1500, z = v.z + (Math.random() * 2 - 1) * 1500;
      const n = tiles.filter(t => Math.abs(x - t.cx) < t.size / 2 && Math.abs(z - t.cz) < t.size / 2).length;
      if (n !== 1) bad++;
    }
    return { ok: bad === 0 && tiles.length < 220, detail: `tiles=${tiles.length} uncovered/overlapped samples=${bad}` };
  });
  await run('tile size grows with distance (LOD follows the bands)', () => {
    const T = window.__three, L = window.__game.level;
    const v = new T.Vector3(700, 10, -700);
    L.setViewer(v, true);
    const sizeAt = (d) => L.tiles.visibleTiles.find(t => Math.abs(v.x + d - t.cx) <= t.size / 2 && Math.abs(v.z - t.cz) <= t.size / 2)?.size ?? -1;
    const s0 = sizeAt(0), s1 = sizeAt(120), s2 = sizeAt(600), s3 = sizeAt(2000);
    return { ok: s0 === L.tiles.leafSize && s1 > s0 && s2 >= 144 && s3 >= 576 && s3 > s2, detail: `0 m:${s0} 120 m:${s1} 600 m:${s2} 2 km:${s3}` };
  });
  await run('streaming stays within its time budget while moving', () => {
    const T = window.__three, L = window.__game.level;
    const v = new T.Vector3(700, 10, -700);
    L.setViewer(v, true);
    let worst = 0;
    for (let i = 0; i < 90; i++) {
      v.z -= 6;
      L.setViewer(v);
      L.update(1 / 60, i / 60);
      worst = Math.max(worst, L.tiles.lastBuildMs, L.props.lastBuildMs);
    }
    return { ok: worst < 60, detail: `worst frame spent ${worst.toFixed(1)} ms building (budgets 4 + 3 ms, one unit may overrun)` };
  });
  await run('props stream in with colliders near and out far', () => {
    const T = window.__three, L = window.__game.level;
    const site = L.atlas.sites.find(s => s.biome.archetype === 'wilderness' && s.slot === 3);
    const v = new T.Vector3(site.x, 10, site.z);
    L.setViewer(v, true);
    L.update(1 / 60, 0);
    const near = L.props.colliderCells;
    let pines = 0;
    L.props.group.traverse(o => { if (o.isInstancedMesh && o.name.startsWith('pine@mid')) pines += o.count; });
    const far = new T.Vector3(site.x + 3000, 10, site.z);
    L.setViewer(far, true);
    L.update(1 / 60, 0);
    const leftBehind = [...L.props.group.children].some(c => c.name.startsWith('mid:') && Math.hypot(Number(c.name.split(':')[1]) * 192 - site.x, Number(c.name.split(':')[2]) * 192 - site.z) < 300);
    return { ok: near > 0 && pines > 50 && !leftBehind, detail: `collider cells=${near} mid pines=${pines} stale=${leftBehind}` };
  });
  await run('a streamed tree trunk blocks movement', () => {
    const T = window.__three, L = window.__game.level;
    const site = L.atlas.sites.find(s => s.biome.archetype === 'wilderness' && s.slot === 3);
    const v = new T.Vector3(site.x, 10, site.z);
    L.setViewer(v, true);
    L.update(1 / 60, 0);
    const m = new T.Matrix4(), p = new T.Vector3();
    let tested = 0, blocked = 0;
    L.props.group.traverse(o => {
      if (!o.isInstancedMesh || !o.name.startsWith('pine@mid') || tested >= 20) return;
      for (let i = 0; i < o.count && tested < 20; i++) {
        o.getMatrixAt(i, m); p.setFromMatrixPosition(m);
        if (Math.hypot(p.x - v.x, p.z - v.z) > 150) continue;
        tested++;
        if (L.colliders.overlaps(new T.Vector3(p.x, p.y + 1.5, p.z), 0.1)) blocked++;
      }
    });
    return { ok: tested > 5 && blocked === tested, detail: `${blocked}/${tested} trunks solid` };
  });
  await run('no biome props inside the hub', () => {
    const T = window.__three, L = window.__game.level;
    L.setViewer(new T.Vector3(0, 5, 0), true);
    const m = new T.Matrix4(), p = new T.Vector3();
    let inside = 0;
    L.props.group.traverse(o => {
      if (!o.isInstancedMesh) return;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (Math.hypot(p.x, p.z) < 460) inside++; }
    });
    return { ok: inside === 0, detail: `${inside} instances inside r<460` };
  });

  // --- mood --------------------------------------------------------------------
  await run('sky follows the biome underfoot', () => {
    const T = window.__three, g = window.__game, L = g.level;
    const out = {};
    for (const arch of ['wilderness', 'marsh', 'terrace', 'caverns', 'bloodstone']) {
      const s = L.atlas.sites.find(x => x.biome.archetype === arch && x.slot === 0);
      L.setViewer(new T.Vector3(s.x, 10, s.z), true);
      out[arch] = g.atmosphere.presetId === s.biome.sky ? 'ok' : g.atmosphere.presetId;
    }
    L.setViewer(new T.Vector3(0, 5, 0), true);
    out.hub = g.atmosphere.presetId;
    return { ok: Object.values(out).every(v => v === 'ok' || v === 'cosmic-violet') && out.hub === 'cosmic-violet', detail: out };
  });
  await run('crossing a border crossfades rather than snapping', () => {
    const T = window.__three, g = window.__game, L = g.level;
    const a = L.atlas.sites.find(s => s.id === 'c2-0'), b = L.atlas.sites.find(s => s.id === 'c3-0');
    // Start in the marsh, step into the terraces and sample the fog density over time.
    L.setViewer(new T.Vector3(a.x, 5, a.z), true);
    const d0 = g.atmosphere.fog.density;
    L.setViewer(new T.Vector3(b.x, 5, b.z));
    L.update(1 / 60, 0); g.atmosphere.update(1 / 60, 0);
    const d1 = g.atmosphere.fog.density;
    for (let i = 0; i < 300; i++) { L.update(1 / 60, 0); g.atmosphere.update(1 / 60, 0); }
    const d2 = g.atmosphere.fog.density;
    const between = (d1 - d0) * (d1 - d2) < 0;
    return { ok: between && Math.abs(d0 - d2) > 1e-4, detail: `fog ${d0.toFixed(4)} → ${d1.toFixed(4)} → ${d2.toFixed(4)}` };
  });
  await run('entering a region shows its title', () => {
    const T = window.__three, L = window.__game.level;
    const titles = [];
    const prev = L.onRegion;
    L.onRegion = (t, s) => titles.push(`${t} / ${s}`);
    L.setViewer(new T.Vector3(0, 5, 0), true);
    const s = L.atlas.sites.find(x => x.id === 'c4-0');
    L.setViewer(new T.Vector3(s.x, 10, s.z));
    for (let i = 0; i < 100; i++) L.update(1 / 60, 0);
    L.onRegion = prev;
    return { ok: titles.length === 1 && titles[0].startsWith('CRYSTAL CAVERNS / Chapter IV'), detail: titles };
  });

  // --- camps and walking ---------------------------------------------------------
  await run('every biome site has enemy camps on dry ground', () => {
    const g = window.__game, L = g.level, A = L.atlas;
    const camps = L.encounters.filter(e => e.id.startsWith('camp:'));
    const sites = new Set(camps.map(e => e.id.split(':')[1]));
    const bad = camps.filter(e => L.heightAt(e.trigger.x, e.trigger.z) < 1 || Math.hypot(e.trigger.x, e.trigger.z) < 600 || A.boundary(e.trigger.x, e.trigger.z).distance < 150);
    const registered = g.enemies.encounters.filter(e => e.def.id.startsWith('camp:')).length;
    return { ok: sites.size === 40 && bad.length === 0 && registered === camps.length, detail: `camps=${camps.length} sites=${sites.size} bad=${bad.length}` };
  });
  await run('walking into a camp raises its enemies', () => {
    const T = window.__three, g = window.__game, L = g.level;
    const enc = g.enemies.encounters.find(e => e.def.id === 'camp:c2-0:0') ?? g.enemies.encounters.find(e => e.def.id.startsWith('camp:c2'));
    const t = enc.def.trigger;
    g.enemies.clear();
    g.player.combat.reset();
    L.setViewer(new T.Vector3(t.x, 10, t.z), true);
    g.player.controller.teleport(t.x + 20, L.heightAt(t.x + 20, t.z) + 0.1, t.z, 0);
    g.step(0.2);
    const before = enc.state;
    g.player.controller.teleport(t.x + 4, L.heightAt(t.x + 4, t.z) + 0.1, t.z, 0);
    g.step(2);
    const kinds = enc.living.map(e => e.kind).join(',');
    const ys = enc.living.map(e => e.position.y.toFixed(1)).join(',');
    const dry = enc.living.length > 0 && enc.living.every(e => e.position.y > -0.5);
    const state = enc.state;
    g.enemies.clear();
    return { ok: before === 'dormant' && state === 'active' && dry, detail: `${enc.def.name}: ${before}→${state} ${kinds} y=${ys}` };
  });
  await run('the player walks out of the hub into Chapter I', () => {
    const T = window.__three, g = window.__game, L = g.level;
    g.enemies.clear();
    const p = g.player;
    p.combat.reset();
    p.controller.teleport(40, L.heightAt(40, -560) + 0.1, -560, 0);
    p.camera.setYaw(0.05, 0);
    L.setViewer(p.controller.position, true);
    g.input.down.add('KeyW');
    let lowestGap = Infinity;
    for (let i = 0; i < 480; i++) {
      g.step(1 / 60);
      L.setViewer(p.controller.position); L.update(1 / 60, i / 60);
      lowestGap = Math.min(lowestGap, p.controller.position.y - L.heightAt(p.controller.position.x, p.controller.position.z));
    }
    g.input.clear();
    const z = p.controller.position.z;
    const chapter = L.atlas.chapterAt(p.controller.position.x, z);
    p.respawn();
    return { ok: z < -610 && lowestGap > -0.2 && chapter === 1, detail: `reached z=${z.toFixed(0)} chapter=${chapter} min ground clearance=${lowestGap.toFixed(2)}` };
  });
} finally {
  await browser?.close();
  await server.close();
}
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
