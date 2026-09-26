// World engine regression suite (Jobs 6, 15): the Long Road's layout, its valleys and
// mountains, grounded structures, quadtree streaming and LOD, prop streaming and colliders,
// biome moods, camps and walking the road.
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

  // --- the Long Road ---------------------------------------------------------------
  await run('forty biomes along one road, five per chapter, in order', () => {
    const A = window.__game.level.atlas;
    let contiguous = true, ordered = true;
    A.sites.forEach((s, i) => {
      if (i && Math.abs(s.s0 - A.sites[i - 1].s1) > 1e-6) contiguous = false;
      if (i && s.chapter < A.sites[i - 1].chapter) ordered = false;
    });
    const perChapter = [1, 2, 3, 4, 5, 6, 7, 8].every(c => A.sites.filter(s => s.chapter === c).length === 5);
    const end = A.sites.at(-1).s1;
    return { ok: A.sites.length === 40 && contiguous && ordered && perChapter && Math.abs(end - A.road.length) < 1 && A.road.length > 15000,
      detail: `road ${(A.road.length / 1000).toFixed(1)} km, ${A.gates.length} chapter gates` };
  });
  await run('the road is dry and walkable end to end', () => {
    const L = window.__game.level, A = L.atlas;
    let worstSlope = 0, wet = 0, off = 0;
    let prev = null;
    for (let s = 0; s <= A.road.length; s += 10) {
      const p = A.road.pointAt(s);
      const h = L.heightAt(p.x, p.z);
      if (h < 0.9) wet++;
      if (Math.abs(h - A.roadHeight(s)) > 1.2 && !L.bossArenas.some(a => Math.hypot(a.center.x - p.x, a.center.z - p.z) < a.radius + 50)
        && Math.hypot(p.x, p.z) > 600) off++; // the last stretch ramps onto the Dawnspire's plaza
      if (prev !== null) worstSlope = Math.max(worstSlope, Math.abs(h - prev) / 10);
      prev = h;
    }
    return { ok: wet === 0 && off === 0 && worstSlope < 0.4, detail: `wet=${wet} off-profile=${off} steepest=${worstSlope.toFixed(2)}` };
  });
  await run('biome borders are continuous', () => {
    // Steep ground is allowed (canyons, cliffs); a jump in the height function is not.
    const L = window.__game.level, A = L.atlas;
    let worst = 0, at = '';
    for (const site of A.sites.slice(1)) for (const lat of [0, 40, -60, 120]) {
      for (let ds = -120; ds <= 120; ds += 1) {
        const a = A.road.offset(site.s0 + ds, lat), b = A.road.offset(site.s0 + ds + 0.05, lat);
        const d = Math.abs(L.heightAt(a.x, a.z) - L.heightAt(b.x, b.z));
        if (d > worst) { worst = d; at = `${site.id}@${ds},${lat}`; }
      }
    }
    return { ok: worst < 0.6, detail: `largest change over 5 cm: ${worst.toFixed(2)} m at ${at}` };
  });
  await run('blend weights sum to one', () => {
    const A = window.__game.level.atlas;
    const sites = [], w = [];
    let bad = 0;
    for (let i = 0; i < 600; i++) {
      const n = A.weights((Math.random() - 0.5) * 9000, (Math.random() - 0.5) * 9000, sites, w);
      let sum = 0;
      for (let k = 0; k < n; k++) sum += w[k];
      if (Math.abs(sum - 1) > 1e-6 || n < 1) bad++;
    }
    return { ok: bad === 0, detail: `${bad} bad samples` };
  });
  await run('colossal mountains wall the valleys', () => {
    const L = window.__game.level, A = L.atlas;
    const heights = [];
    for (let s = 200; s < A.road.length - 600; s += 250) {
      const q = A.road.pointAt(s);
      const W = A.widthAt(s);
      for (const side of [1, -1]) {
        if (A.seaAt(s, side) > 0.01) continue;
        const p = A.road.offset(s, side * (W + 420));
        if (A.road.nearest(p.x, p.z).d < W + 300) continue; // another turn of the road
        heights.push(L.heightAt(p.x, p.z) - A.roadHeight(s));
      }
      void q;
    }
    heights.sort((a, b) => a - b);
    const low = heights[Math.floor(heights.length * 0.05)];
    return { ok: heights.length > 100 && low > 120, detail: `${heights.length} samples; 5th percentile ${low.toFixed(0)} m above the road, median ${heights[heights.length >> 1].toFixed(0)} m` };
  });
  await run('the Sunkeepers\' Coast falls to the sea', () => {
    const L = window.__game.level, A = L.atlas;
    const coast = A.sites.filter(s => s.leg.sea);
    let sea = 0, n = 0;
    for (const site of coast) for (let f = 0.2; f < 0.9; f += 0.2) {
      const s = site.s0 + (site.s1 - site.s0) * f;
      const side = site.leg.sea === 'left' ? 1 : -1;
      const p = A.road.offset(s, side * (A.widthAt(s) + 350));
      n++;
      if (L.heightAt(p.x, p.z) < -4) sea++;
    }
    return { ok: coast.length === 5 && sea >= n * 0.8, detail: `${sea}/${n} open water` };
  });
  await run('the turns of the spiral stay far apart', () => {
    const A = window.__game.level.atlas;
    let closest = Infinity;
    for (let s = 0; s < A.road.length; s += 100) {
      const p = A.road.pointAt(s);
      for (let t = s + 4000; t < A.road.length; t += 50) {
        const q = A.road.pointAt(t);
        closest = Math.min(closest, Math.hypot(p.x - q.x, p.z - q.z));
      }
    }
    return { ok: closest > 1400, detail: `closest approach of two turns: ${closest.toFixed(0)} m` };
  });
  await run('structures stand on level ground, clear of the road', () => {
    const L = window.__game.level, A = L.atlas;
    const bad = [];
    for (const st of L.structures.placed) {
      if (st.spec.hover || st.spec.planted !== undefined) continue;
      let worst = 0;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, r = st.radius * 0.6;
        worst = Math.max(worst, Math.abs(L.heightAt(st.x + Math.sin(a) * r, st.z + Math.cos(a) * r) - st.y));
      }
      const road = A.road.nearest(st.x, st.z).d;
      if (worst > 0.3 || road < st.radius + 5) bad.push(`${st.spec.model}:${worst.toFixed(2)}m/${road.toFixed(0)}m`);
    }
    return { ok: bad.length === 0 && L.structures.placed.length >= 30, detail: bad.length ? bad.join(' ') : `${L.structures.placed.length} structures level` };
  });
  await run('the supplied structures all load', () => {
    const L = window.__game.level;
    const missing = L.structures.placed.filter(p => !p.object).map(p => p.spec.model);
    return { ok: !missing.length && !L.structures.errors.length, detail: missing.join(',') + L.structures.errors.join(',') };
  });
  await run('the Dawnspire rises at the centre, chained to the moon', () => {
    const g = window.__game, L = g.level, V = window.__three.Vector3;
    const solid = L.colliders.overlaps(new V(0, L.dawnspire.top - 200, 0), 1);
    return { ok: L.dawnspire.top > 1000 && solid && g.atmosphere.moonAnchor?.y > L.dawnspire.top, detail: `top=${L.dawnspire.top.toFixed(0)} m, moon at ${g.atmosphere.moonAnchor?.y} m` };
  });
  await run('each archetype has its signature ground', () => {
    const L = window.__game.level, A = L.atlas;
    const stats = {};
    for (const arch of ['wilderness', 'marsh', 'terrace', 'caverns', 'bloodstone']) {
      const sites = A.sites.filter(s => s.biome.archetype === arch);
      const hs = [];
      for (const s of sites) for (let i = 0; i < 200; i++) {
        const f = Math.random(), lat = (Math.random() * 2 - 1) * s.leg.width * 0.8;
        const p = A.road.offset(s.s0 + (s.s1 - s.s0) * f, lat);
        hs.push(L.heightAt(p.x, p.z));
      }
      const water = hs.filter(h => h < 0).length / hs.length;
      const mean = [...hs].sort((a, b) => a - b)[hs.length >> 1];
      stats[arch] = { water, mean };
    }
    const w = stats.wilderness, m = stats.marsh, t = stats.terrace, c = stats.caverns, b = stats.bloodstone;
    const ok = w.water > 0.01 && m.water > 0.06 && m.mean < 4 && t.mean > 3 && c.mean > 20 && b.mean > 15;
    const f = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(2)]));
    return { ok, detail: { wilderness: f(w), marsh: f(m), terrace: f(t), caverns: f(c), bloodstone: f(b) } };
  });

  // --- streaming ---------------------------------------------------------------
  await run('terrain tiles cover the view without holes or overlaps', () => {
    const T = window.__three, L = window.__game.level;
    const q = window.__game.level.atlas.road.pointAt(19000), v = new T.Vector3(q.x, 10, q.z);
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
    const q = window.__game.level.atlas.road.pointAt(19000), v = new T.Vector3(q.x, 10, q.z);
    L.setViewer(v, true);
    const sizeAt = (d) => L.tiles.visibleTiles.find(t => Math.abs(v.x + d - t.cx) <= t.size / 2 && Math.abs(v.z - t.cz) <= t.size / 2)?.size ?? -1;
    const s0 = sizeAt(0), s1 = sizeAt(120), s2 = sizeAt(600), s3 = sizeAt(2000);
    return { ok: s0 === L.tiles.leafSize && s1 > s0 && s2 >= 144 && s3 >= 576 && s3 > s2, detail: `0 m:${s0} 120 m:${s1} 600 m:${s2} 2 km:${s3}` };
  });
  await run('streaming stays within its time budget while moving', () => {
    const T = window.__three, L = window.__game.level;
    const q = window.__game.level.atlas.road.pointAt(19000), v = new T.Vector3(q.x, 10, q.z);
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
  await run('no props on the road bed', () => {
    const T = window.__three, L = window.__game.level;
    const q = L.atlas.road.pointAt(900);
    L.setViewer(new T.Vector3(q.x, 5, q.z), true);
    const m = new T.Matrix4(), p = new T.Vector3();
    let on = 0, total = 0;
    L.props.group.traverse(o => {
      if (!o.isInstancedMesh) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); p.setFromMatrixPosition(m);
        if (Math.hypot(p.x - q.x, p.z - q.z) > 250) continue;
        total++;
        if (L.atlas.road.nearest(p.x, p.z).d < 3.5) on++;
      }
    });
    return { ok: on === 0 && total > 100, detail: `${on} of ${total} nearby instances on the road` };
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
    const s = L.atlas.start;
    L.setViewer(new T.Vector3(s.x, 5, s.z), true);
    out.start = g.atmosphere.presetId;
    return { ok: Object.values(out).every(v => v === 'ok' || v === 'cosmic-violet') && out.start === 'cosmic-violet', detail: out };
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
    const s0 = L.atlas.start;
    L.setViewer(new T.Vector3(s0.x, 5, s0.z), true);
    const s = L.atlas.sites.find(x => x.id === 'c4-0');
    L.setViewer(new T.Vector3(s.x, 10, s.z));
    for (let i = 0; i < 100; i++) L.update(1 / 60, 0);
    L.onRegion = prev;
    return { ok: titles.length === 1 && titles[0].startsWith('RIMEFROST GALLERIES / Chapter IV'), detail: titles };
  });

  // --- camps and walking ---------------------------------------------------------
  await run('every biome site has enemy camps on dry ground', () => {
    const g = window.__game, L = g.level, A = L.atlas;
    const camps = L.encounters.filter(e => e.id.startsWith('camp:'));
    const sites = new Set(camps.map(e => e.id.split(':')[1]));
    const bad = camps.filter(e => L.heightAt(e.trigger.x, e.trigger.z) < 1 || A.road.nearest(e.trigger.x, e.trigger.z).d > 90
      || A.gates.some(gt => Math.hypot(gt.x - e.trigger.x, gt.z - e.trigger.z) < 120));
    const registered = g.enemies.encounters.filter(e => e.def.id.startsWith('camp:')).length;
    const levels = camps.every(e => e.level === Number(e.id.split(':')[1].slice(1, 2)));
    return { ok: sites.size === 40 && bad.length === 0 && registered === camps.length && levels, detail: `camps=${camps.length} sites=${sites.size} bad=${bad.length} levels=${levels}` };
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
  await run('the player walks the road out of Hollowmere', () => {
    const T = window.__three, g = window.__game, L = g.level, A = L.atlas;
    g.enemies.clear();
    const p = g.player;
    p.combat.reset();
    const st = A.start;
    p.controller.teleport(st.x, L.heightAt(st.x, st.z) + 0.1, st.z, 0);
    L.setViewer(p.controller.position, true);
    g.input.down.add('KeyW');
    let lowestGap = Infinity;
    const s0 = A.road.nearest(st.x, st.z).s;
    for (let i = 0; i < 600; i++) {
      // Steer along the road like a player would.
      const h = A.road.nearest(p.controller.position.x, p.controller.position.z);
      const ahead = A.road.pointAt(h.s + 12);
      p.camera.setYaw(Math.atan2(-(ahead.x - p.controller.position.x), -(ahead.z - p.controller.position.z)), 0);
      g.step(1 / 60);
      if (i % 20 === 0) { L.setViewer(p.controller.position); L.update(1 / 60, i / 60); }
      lowestGap = Math.min(lowestGap, p.controller.position.y - L.heightAt(p.controller.position.x, p.controller.position.z));
    }
    g.input.clear();
    const s1 = A.road.nearest(p.controller.position.x, p.controller.position.z).s;
    p.respawn();
    return { ok: s1 - s0 > 60 && lowestGap > -0.2, detail: `walked ${(s1 - s0).toFixed(0)} m along the road; min ground clearance=${lowestGap.toFixed(2)}` };
  });
} finally {
  await browser?.close();
  await server.close();
}
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
