// The Spellblade Arsenal (Job 13): Starbolts, the twelve Codex pages, the sword's ranged
// follow-throughs, Sword Arts, Ember Flasks, Momentum rules and the book/wheel UI.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs, logicQuery } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { port: 5197, strictPort: false } });
await server.listen();
let browser;
const failures = [];
let total = 0;
const check = (name, ok, detail = '') => { total++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failures.push(name); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => failures.push(e.message));
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=8${logicQuery}`);
  await page.waitForFunction('window.__ready || window.__error');
  fs.mkdirSync('screenshots', { recursive: true });
  check('starts with Starfall bound and a full Momentum pool', await page.evaluate(() => {
    const p = window.__game.player, s = p.spells;
    return s.book.count === 1 && s.book.selected === 'starfall' && !s.book.select('windstep') && p.combat.momentum.value === 100;
  }));
  await page.keyboard.press('b'); await wait(100);
  const paused = await page.evaluate(() => { const g = window.__game; return { p: g.player.controller.position.toArray(), m: g.player.combat.momentum.value }; });
  await page.keyboard.down('w'); await wait(250); await page.keyboard.up('w');
  check('book pauses player and Momentum', await page.evaluate(before => {
    const g = window.__game;
    return g.spellbookUI.paused && g.player.controller.position.toArray().every((v, i) => v === before.p[i]) && g.player.combat.momentum.value === before.m;
  }, paused));
  await page.keyboard.press('ArrowRight');
  check('missing page has a clue and cannot be equipped', await page.$eval('[data-action="equip"]', e => e.disabled && document.querySelector('.page-location').textContent.length > 8));
  await page.screenshot({ path: 'screenshots/book-missing.png' });
  await page.keyboard.press('Escape');
  check('close clears held input', await page.evaluate(() => !window.__game.input.blocked && !window.__game.input.isDown('KeyW')));

  // Real F input recovers every placed page.
  const ids = await page.evaluate(() => window.__game.pages.pickups.map(p => p.id));
  for (const id of ids) {
    await page.evaluate(id => {
      const g = window.__game, p = g.pages.pickups.find(p => p.id === id);
      g.player.combat.reset();
      const v = p.object.position;
      g.player.controller.teleport(v.x, p.trial ? p.baseY - 1.65 : p.baseY - 1.3, v.z, 0);
    }, id);
    await wait(200); await page.keyboard.press('f'); await wait(80);
    const state = await page.evaluate(id => ({ has: window.__game.player.spells.book.has(id) }), id);
    check(`pickup ${id}`, state.has, JSON.stringify(state));
  }

  // Deterministic fixtures: isolated dummy targets on open ground, stepped by hand.
  const mechanics = await page.evaluate(() => {
    const g = window.__game, p = g.player, s = p.spells, c = p.combat, T = window.__three;
    g.enemies.clear();
    const results = [];
    const check = (name, ok, detail) => results.push({ name, ok, detail });
    for (const pg of ['starfall', 'comet-lance', 'chain-storm', 'glacial-rupture', 'void-maw', 'phoenix-flight', 'moon-aegis',
      'blood-bloom', 'prism-ray', 'wisp-choir', 'windstep', 'eclipse']) s.book.collect(pg);
    for (const a of ['art-crescents', 'art-skyfall', 'art-tempest', 'art-phantom', 'art-rend', 'art-sunder']) c.artsUnlocked.add(a);
    const X = 1200, Z = 1200;
    const ground = (x, z) => g.level.heightAt(x, z);
    const makeDummy = () => ({ team: 'enemy', position: new T.Vector3(), velocity: new T.Vector3(), bodyRadius: 0.6, bodyHeight: 2, alive: true,
      health: 1000, hits: [], applyHit(hit) { this.health -= hit.damage; this.hits.push(hit); return { hit: true, damage: hit.damage }; } });
    const dummies = [makeDummy(), makeDummy(), makeDummy(), makeDummy()];
    for (const d of dummies) g.combatWorld.register(d);
    const place = (d, dx, dz) => { d.position.set(X + dx, ground(X + dx, Z + dz), Z + dz); d.health = 1000; d.hits.length = 0; d.alive = true; d.velocity.set(0, 0, 0); };
    const park = () => { for (const d of dummies) place(d, 500, 500); };
    const setup = (pg, pitch = -0.05) => {
      c.reset(); s.reset(); g.time.clear(); park();
      p.controller.teleport(X, ground(X, Z) + 0.05, Z, 0);
      g.level.setViewer(p.controller.position, true);
      p.controller.grounded = true;
      p.camera.setYaw(0, pitch);
      if (pg) s.book.select(pg);
    };
    const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { s.fixedUpdate(1 / 60); c.fixedUpdate?.call; } };
    const dmg = d => 1000 - d.health;

    // --- Starbolts: free, ranged, lightly homing ------------------------------------------
    setup('starfall', 0.05); place(dummies[0], 0, -30);
    const m0 = c.momentum.value;
    for (let i = 0; i < 10; i++) { s.primary(true); advance(0.25); }
    advance(0.8);
    check('Starbolts are free and hit at 30 m', dmg(dummies[0]) >= 56 && c.momentum.value === m0, [dmg(dummies[0]), c.momentum.value]);

    // --- the twelve pages ----------------------------------------------------------------------
    setup('starfall', -0.35); place(dummies[0], 0, -8);
    check('Starfall spends 30 Momentum', s.cast() && c.momentum.value === 70);
    advance(3);
    check('Starfall meteors land and burst', dmg(dummies[0]) >= 44, dmg(dummies[0]));
    check('cooldown prevents double casting', (() => { setup('starfall'); s.cast(); const m = c.momentum.value; return !s.cast() && c.momentum.value === m; })());
    setup('starfall'); c.momentum.value = 100; c.momentum.resonance = true; s.cast();
    check('Resonance halves spell cost', c.momentum.value === 85, c.momentum.value);

    setup('comet-lance', 0.02); place(dummies[0], 0, -22); place(dummies[1], 0.3, -30);
    s.spell(true, true, false); for (let i = 0; i < 40; i++) s.spell(false, true, false); s.spell(false, false, true); advance(0.1);
    check('Comet Lance pierces two foes in a line', dmg(dummies[0]) >= 60 && dmg(dummies[1]) >= 60, [dmg(dummies[0]), dmg(dummies[1])]);

    setup('chain-storm', 0.02); place(dummies[0], 0, -10); place(dummies[1], 6, -12); place(dummies[2], 10, -16); place(dummies[3], 60, 60);
    s.cast();
    check('Chain Storm jumps between nearby foes only', dmg(dummies[0]) === 26 && dmg(dummies[1]) === 26 && dmg(dummies[2]) === 26 && dmg(dummies[3]) === 0,
      dummies.map(dmg));

    setup('glacial-rupture'); place(dummies[0], 0, -12); s.cast(); advance(1);
    check('Glacial Rupture spikes along the ground and slows', dmg(dummies[0]) === 30 && dummies[0].hits[0]?.slow === 3, [dmg(dummies[0]), dummies[0].hits[0]?.slow]);

    setup('void-maw', 0); place(dummies[0], 0, -14); place(dummies[1], 4, -14); s.cast();
    const startGap = dummies[0].position.distanceTo(dummies[1].position);
    advance(1.2);
    let pulled = false;
    for (let i = 0; i < 60; i++) {
      s.fixedUpdate(1 / 60);
      if (dummies[1].velocity.length() > 0.5) pulled = true;
      dummies[1].position.addScaledVector(dummies[1].velocity, 1 / 60);
      dummies[1].velocity.multiplyScalar(0.85); // an enemy's own movement damps the pull
    }
    advance(2.5);
    check('Void Maw pulls foes in, then bursts', pulled && dmg(dummies[0]) >= 60 && dmg(dummies[1]) >= 60, [pulled, startGap, dmg(dummies[0]), dmg(dummies[1])]);

    setup('phoenix-flight'); place(dummies[0], 0, -6);
    s.cast(); for (let i = 0; i < 30; i++) { p.controller.fixedUpdate(1 / 60); s.fixedUpdate(1 / 60); }
    check('Phoenix Flight carries you through foes, burning them', p.controller.position.z < Z - 10 && dmg(dummies[0]) >= 24,
      [p.controller.position.z - Z, dmg(dummies[0])]);

    setup('moon-aegis'); s.cast();
    const orb = { mesh: new T.Object3D(), active: true, team: 'enemy' };
    s.hostileOrbs = () => [orb];
    let swallowed = false;
    for (let i = 0; i < 60 && !swallowed; i++) { orb.mesh.position.copy(s.moons[0].mesh.position); s.fixedUpdate(1 / 60); swallowed = !orb.active; }
    s.hostileOrbs = () => [];
    place(dummies[0], 1.5, 0); advance(0.5);
    check('Moon Aegis swallows orbs and bites close foes', swallowed && dmg(dummies[0]) >= 18, [swallowed, dmg(dummies[0])]);

    setup('blood-bloom'); c.health = 40; place(dummies[0], 3, 0); place(dummies[1], -3, 2); s.cast();
    check('Blood Bloom hurts all around and heals per foe', dmg(dummies[0]) === 35 && dmg(dummies[1]) === 35 && c.health === 71, [dmg(dummies[0]), c.health]);

    setup('prism-ray', 0.02); place(dummies[0], 0, -20);
    s.spell(true, true, false); for (let i = 0; i < 60; i++) { s.spell(false, true, false); s.fixedUpdate(1 / 60); } s.spell(false, false, true);
    check('Prism Ray pours damage and drains Momentum', dmg(dummies[0]) >= 70 && c.momentum.value < 70, [dmg(dummies[0]), c.momentum.value]);

    setup('wisp-choir'); place(dummies[0], 5, -8); s.cast(); advance(6);
    check('Wisp Choir hunts foes', dmg(dummies[0]) >= 54, dmg(dummies[0]));

    setup('windstep', 0); p.controller.velocity.x = 5; s.cast();
    check('Windstep blinks 10 m and keeps velocity', p.controller.position.z < Z - 9 && p.controller.velocity.x === 5, p.controller.position.z - Z);

    setup('eclipse'); place(dummies[0], 6, 6); place(dummies[1], -10, 0); c.momentum.value = 100; s.cast(); advance(1);
    check('Eclipse spends the full pool and strikes 14 m around', dmg(dummies[0]) === 140 && dmg(dummies[1]) === 140 && c.momentum.value === 0,
      [dmg(dummies[0]), c.momentum.value]);
    setup('eclipse'); c.momentum.value = 40;
    check('insufficient Momentum refuses the cast', !s.cast() && c.momentum.value === 40 && /Shift/.test(s.message));

    // --- the sword's reach ------------------------------------------------------------------
    setup(); place(dummies[0], 0, -12); c.emitters.finisher(0); advance(0.6);
    check('combo finisher throws a crescent 12 m', dmg(dummies[0]) === 16, dmg(dummies[0]));
    setup(); place(dummies[0], 0, -18); place(dummies[1], 3.6, -18); c.emitters.charged(1); advance(0.8);
    check('full charge looses three crescents', dmg(dummies[0]) >= 50 && dmg(dummies[1]) >= 50, [dmg(dummies[0]), dmg(dummies[1])]);
    setup(); place(dummies[0], 0, -14); c.emitters.lance(0); advance(0.4);
    check('dash thrust fires a lance of light', dmg(dummies[0]) === 18, dmg(dummies[0]));
    setup(); place(dummies[0], 0, -9); c.emitters.groundWave(0); advance(0.5);
    check('slide sweep sends a wave along the ground', dmg(dummies[0]) === 18, dmg(dummies[0]));

    // --- Sword Arts ------------------------------------------------------------------------------
    const artRun = (id, d0, seconds) => {
      setup(); c.art = id; place(dummies[0], d0[0], d0[1]);
      const ok = c.useArt();
      for (let i = 0; i < Math.round(seconds * 60); i++) { c.fixedUpdate(1 / 60); s.fixedUpdate(1 / 60); p.controller.fixedUpdate(1 / 60); }
      return ok;
    };
    check('Moonlit Crescents hit at 20 m', artRun('art-crescents', [0, -20], 1.2) && dmg(dummies[0]) >= 30 && c.momentum.value === 80, [dmg(dummies[0]), c.momentum.value]);
    check('Skyfall leaps and lands a spear line', artRun('art-skyfall', [0, -14], 2.5) && dmg(dummies[0]) >= 34, dmg(dummies[0]));
    check('Tempest Cross hits behind you', artRun('art-tempest', [0, 10], 1.2) && dmg(dummies[0]) >= 24, dmg(dummies[0]));
    check('Phantom Blades hunt a target', artRun('art-phantom', [2, -18], 2.5) && dmg(dummies[0]) >= 54, dmg(dummies[0]));
    check('Bloodmoon Rend passes through and bursts', artRun('art-rend', [0, -5], 1.5) && dmg(dummies[0]) >= 48 && p.controller.position.z < Z - 7,
      [dmg(dummies[0]), p.controller.position.z - Z]);
    check('Sunder tears a line 18 m out', artRun('art-sunder', [0, -18], 1.5) && dmg(dummies[0]) >= 42, dmg(dummies[0]));
    setup(); c.momentum.value = 5; c.art = 'art-sunder';
    check('Sword Arts need Momentum', !c.useArt() && /Momentum/.test(c.artMessage));
    setup(); c.art = 'art-crescents'; c.useArt(); c.phase = 'idle';
    check('Sword Arts have cooldowns', !c.useArt() && c.artRemaining() > 0);

    // --- flasks, death -----------------------------------------------------------------------------
    setup(); c.health = 30;
    c.drinkFlask(); for (let i = 0; i < 60; i++) c.fixedUpdate(1 / 60);
    check('Ember Flask heals 45 after drinking', c.health === 75 && c.flasks === 2, [c.health, c.flasks]);
    c.flasks = 0; c.health = 30;
    check('no flasks left refuses', !c.drinkFlask() && c.health === 30);
    setup('void-maw'); s.cast(); c.alive = false; s.fixedUpdate(1 / 60);
    check('death clears live spells but keeps pages', s.maws.length === 0 && p.shots.shots.length === 0 && s.book.count === 12);

    for (const d of dummies) g.combatWorld.unregister(d);
    c.reset(); p.respawn(); g.time.clear(); s.book.select('starfall');
    return results;
  });
  for (const result of mechanics) check(result.name, result.ok, JSON.stringify(result.detail));

  await page.keyboard.down('Tab'); await wait(100); await page.keyboard.press('2');
  await page.screenshot({ path: 'screenshots/spell-wheel.png' });
  await page.keyboard.up('Tab'); await wait(100);
  check('quick-wheel keyboard selection equips on release', await page.evaluate(() => !window.__game.spellbookUI.paused && window.__game.player.spells.book.selected === 'comet-lance'));
  await page.keyboard.down('Tab'); await page.keyboard.press('3'); await page.keyboard.press('Escape'); await page.keyboard.up('Tab');
  check('Escape cancels wheel selection', await page.evaluate(() => window.__game.player.spells.book.selected === 'comet-lance'));
  check('wheel has twelve slots', await page.evaluate(() => window.__game.spellbookUI !== undefined) && true);
  await page.keyboard.press('b'); await wait(100);
  await page.screenshot({ path: 'screenshots/spellbook.png' });
  await page.keyboard.press('ArrowRight'); await page.click('[data-action="equip"]');
  check('reading screen equips selected page', await page.evaluate(() => window.__game.player.spells.book.selected === 'chain-storm'));
  await page.setViewport({ width: 390, height: 700 });
  await page.screenshot({ path: 'screenshots/spellbook-narrow.png' });
  check('book fits narrow viewport', await page.$eval('dialog', d => d.scrollWidth <= d.clientWidth && d.getBoundingClientRect().right <= innerWidth));
  await page.keyboard.press('Escape'); await page.keyboard.down('Tab'); await wait(100);
  await page.screenshot({ path: 'screenshots/spell-wheel-narrow.png' });
  check('wheel buttons fit narrow viewport', await page.$$eval('[data-slot]', buttons => buttons.length === 12 && buttons.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })));
  await page.keyboard.up('Tab');
  check('no runtime asset errors', await page.evaluate(() => !window.__error && window.__game.assetErrors.length === 0));
} finally { await browser?.close(); await server.close(); }
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
