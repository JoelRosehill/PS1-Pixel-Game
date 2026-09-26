// Gameplay behavior and real keyboard/menu regression checks for Job 4.
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
  check('initial page and locked selection', await page.evaluate(() => {
    const s = window.__game.player.spells;
    return s.book.count === 1 && s.book.selected === 'rune-burst' && !s.book.select('windstep');
  }));
  await page.keyboard.press('b'); await wait(100);
  const paused = await page.evaluate(() => { const g = window.__game; return { p: g.player.controller.position.toArray(), m: g.player.combat.momentum.value }; });
  await page.keyboard.down('w'); await wait(250); await page.keyboard.up('w');
  check('book pauses player and Momentum', await page.evaluate(before => {
    const g = window.__game;
    return g.spellbookUI.paused && g.player.controller.position.toArray().every((v, i) => v === before.p[i]) && g.player.combat.momentum.value === before.m;
  }, paused));
  await page.keyboard.press('ArrowRight');
  check('missing page has clue and cannot equip', await page.$eval('[data-action="equip"]', e => e.disabled && document.querySelector('.page-location').textContent.includes('Shrine')));
  await page.screenshot({ path: 'screenshots/book-missing.png' });
  await page.keyboard.press('Escape');
  check('close clears held input', await page.evaluate(() => !window.__game.input.blocked && !window.__game.input.isDown('KeyW')));

  // Use real F input to recover every placed page, including the old trial reward.
  const ids = await page.evaluate(() => window.__game.pages.pickups.map(p => p.id));
  for (const id of ids) {
    await page.evaluate(id => {
      const g = window.__game, p = g.pages.pickups.find(p => p.id === id);
      g.player.combat.reset();
      const v = p.object.position;
      g.player.controller.teleport(v.x, p.trial ? p.baseY - 1.65 : p.baseY - 1.3, v.z, 0);
    }, id);
    await wait(200); await page.keyboard.press('f'); await wait(80);
    const state = await page.evaluate(id => {
      const g = window.__game;
      return { has: g.player.spells.book.has(id), near: g.pages.nearest?.id, position: g.player.controller.position.toArray() };
    }, id);
    check(`pickup ${id}`, state.has, JSON.stringify(state));
  }
  check('book grows; duplicate page does not grow it twice', await page.evaluate(() => {
    const p = window.__game.player;
    return p.spells.book.count === 8 && p.spells.book.tier === 3 && p.model.book.pageCount === 8 && p.model.book.leaves[0].scale.y > 2 && !p.spells.collect('windstep');
  }));

  // Real target colliders must not absorb a spell before its damage query runs.
  for (const id of ['ember-lance', 'frost-needle', 'violet-well']) {
    await page.evaluate(id => {
      const g = window.__game, p = g.player, target = g.level.enemies[0];
      p.combat.reset(); g.time.clear(); target.health = target.maxHealth; target.alive = true;
      p.spells.book.select(id); p.combat.momentum.value = 80;
      p.controller.teleport(target.position.x, target.position.y + 0.05, target.position.z + 6, 0);
      p.camera.setYaw(0, -0.1);
    }, id);
    await wait(150); await page.keyboard.press('e'); await wait(id === 'violet-well' ? 700 : 500);
    const health = await page.evaluate(() => window.__game.level.enemies[0].health);
    check(`in-world ${id} damages solid construct`, health < 200, health);
  }

  // These synchronous fixtures use real casting, collision and damage code with
  // isolated targets above the world, avoiding random AI/terrain timing.
  const mechanics = await page.evaluate(() => {
    const g = window.__game, p = g.player, s = p.spells, c = p.combat, T = window.__three;
    const results = [];
    const check = (name, ok, detail) => results.push({ name, ok, detail });
    const origin = new T.Vector3(400, 150, 400);
    const target = { team: 'enemy', position: origin.clone(), bodyRadius: 0.5, bodyHeight: 2, alive: true, health: 200, hits: [],
      applyHit(hit) { this.health -= hit.damage; this.hits.push(hit); return { hit: true, damage: hit.damage }; } };
    g.combatWorld.register(target);
    const setup = (id, range = 6) => {
      c.reset(); g.time.clear(); c.momentum.value = 80;
      p.controller.teleport(origin.x, origin.y, origin.z, 0); p.controller.invulnerable = false;
      p.camera.setYaw(0, -0.1); s.book.select(id);
      target.position.copy(origin).add(new T.Vector3(0, 0, -range)); target.health = 200; target.hits.length = 0;
    };
    const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) s.fixedUpdate(1 / 60); };
    setup('rune-burst', 2);
    check('burst damage and cost', s.cast() && target.health === 170 && c.momentum.value === 40);
    check('cooldown prevents double spending', !s.cast() && c.momentum.value === 40);
    setup('rune-burst', 2); c.momentum.value = 100; c.momentum.resonance = true; s.cast();
    check('Resonance halves spell cost', c.momentum.value === 80);
    setup('ember-lance'); s.cast(); advance(0.4);
    check('ember projectile damages target', target.health === 176 && s.projectiles.length === 0, target.health);
    setup('frost-needle'); s.cast(); advance(0.3);
    check('frost projectile staggers', target.health === 184 && target.hits[0]?.stagger === 1.6);
    setup('violet-well'); s.cast();
    target.position.y = g.level.heightAt(target.position.x, target.position.z);
    advance(4.1);
    check('well hits four times and expires', target.health === 164 && target.hits.length === 4 && s.fields.length === 0, [target.health, target.hits.length]);
    setup('windstep'); p.controller.velocity.x = 5; s.cast();
    check('Windstep moves and preserves velocity', p.controller.position.z < 393.2 && p.controller.velocity.x === 5);
    setup('updraft'); p.controller.velocity.set(7, -3, 0); s.cast();
    check('Updraft launches without erasing lateral speed', p.controller.velocity.y === 14 && p.controller.velocity.x === 7 && !p.controller.grounded);
    setup('ember-ward'); s.cast();
    const hit = { damage: 20, direction: new T.Vector3(0, 0, 1), point: origin.clone(), knockback: 0, stagger: 0, source: 'enemy', kind: 'enemy' };
    c.applyHit(hit);
    check('ward halves incoming damage', c.health === 90 && c.wardTime === 8);
    c.wardTime = 0; c.applyHit(hit); check('expired ward no longer protects', c.health === 70);
    setup('mend'); const before = c.momentum.value;
    check('full-health Mend is free rejection', !s.cast() && c.momentum.value === before);
    c.health = 90; s.cast(); check('Mend heals without exceeding max', c.health === 100 && c.momentum.value === 35);
    setup('updraft'); c.momentum.value = 2;
    check('insufficient Momentum has no effect', !s.cast() && p.controller.velocity.y === 0 && c.momentum.value === 2);
    setup('updraft'); c.phase = 'staggered'; check('stagger blocks casting', !s.cast() && c.momentum.value === 80);
    setup('ember-lance');
    // A nearby non-intersecting box is examined before the blocking wall. This
    // catches the old sweep-point/scratch-vector alias bug with multiple colliders.
    g.level.colliders.addBox(402, 151, 398, 1, 4, 1);
    g.level.colliders.addBox(400, 151, 397, 8, 8, 0.5);
    s.cast(); advance(0.5);
    check('wall blocks projectile damage', target.health === 200 && s.projectiles.length === 0);
    setup('windstep'); s.cast();
    check('Windstep cannot cross a wall', p.controller.position.z > 397.6 && p.controller.position.z < 400, p.controller.position.z);
    setup('ember-lance'); s.cast(); c.alive = false; s.fixedUpdate(1 / 60);
    check('death clears live spells but keeps pages', s.projectiles.length === 0 && s.fields.length === 0 && c.wardTime === 0 && s.book.count === 8);
    c.reset(); g.combatWorld.unregister(target); p.respawn(); g.time.clear(); s.book.select('rune-burst');
    return results;
  });
  for (const result of mechanics) check(result.name, result.ok, JSON.stringify(result.detail));

  await page.keyboard.down('Tab'); await wait(100); await page.keyboard.press('2');
  await page.screenshot({ path: 'screenshots/spell-wheel.png' });
  await page.keyboard.up('Tab'); await wait(100);
  check('quick-wheel keyboard selection equips on release', await page.evaluate(() => !window.__game.spellbookUI.paused && window.__game.player.spells.book.selected === 'ember-lance'));
  await page.keyboard.down('Tab'); await page.keyboard.press('3'); await page.keyboard.press('Escape'); await page.keyboard.up('Tab');
  check('Escape cancels wheel selection', await page.evaluate(() => window.__game.player.spells.book.selected === 'ember-lance'));
  await page.keyboard.press('b'); await wait(100);
  await page.screenshot({ path: 'screenshots/spellbook.png' });
  await page.keyboard.press('ArrowRight'); await page.click('[data-action="equip"]');
  check('reading screen equips selected page', await page.evaluate(() => window.__game.player.spells.book.selected === 'frost-needle'));
  await page.setViewport({ width: 390, height: 700 });
  await page.screenshot({ path: 'screenshots/spellbook-narrow.png' });
  check('book fits narrow viewport', await page.$eval('dialog', d => d.scrollWidth <= d.clientWidth && d.getBoundingClientRect().right <= innerWidth));
  await page.keyboard.press('Escape'); await page.keyboard.down('Tab'); await wait(100);
  await page.screenshot({ path: 'screenshots/spell-wheel-narrow.png' });
  check('wheel buttons fit narrow viewport', await page.$$eval('[data-slot]', buttons => buttons.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })));
  await page.keyboard.up('Tab');
  check('no runtime asset errors', await page.evaluate(() => !window.__error && window.__game.assetErrors.length === 0));
} finally { await browser?.close(); await server.close(); }
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
