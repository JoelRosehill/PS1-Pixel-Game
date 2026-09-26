// Headless combat test: drives attacks with real mouse/key events and checks damage,
// Momentum, parry, dodge, the Rune Burst spender and death/respawn.
//
//   npm run combattest
import { browserPath, launchArgs, logicQuery } from './browser.mjs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const chrome = browserPath();

const server = await createServer({ logLevel: 'error', server: { port: 5195, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: launchArgs(),
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=8${logicQuery}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true || !!window.__error');
await page.mouse.move(480, 270);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const read = () =>
  page.evaluate(() => {
    const g = window.__game;
    const c = g.player.combat;
    const dummy = g.level.enemies[0];
    const brute = g.level.enemies[2];
    return {
      health: c.health,
      alive: c.alive,
      momentum: c.momentum.value,
      resonance: c.momentum.resonance,
      phase: c.phase,
      pos: { x: c.position.x, y: c.position.y, z: c.position.z },
      dummyHealth: dummy.health,
      dummyMax: dummy.maxHealth,
      bruteHealth: brute.health,
      timeScale: g.time.scale,
    };
  });
/** Teleports the player next to the first (passive) dummy, facing it. */
const faceDummy = (distance = 1.9) =>
  page.evaluate((distance) => {
    const g = window.__game;
    const d = g.level.enemies[0];
    const yaw = 0;
    g.player.controller.teleport(d.position.x, d.position.y + 0.2, d.position.z + distance, yaw);
    g.player.camera.setYaw(yaw, -0.1);
    g.player.controller.cameraYaw = yaw;
    g.player.combat.reset();
    d.health = d.maxHealth;
    d.alive = true;
  }, distance);

const results = [];
const check = (name, ok, detail) => {
  results.push({ ok });
  console.log(`${ok ? '✔ PASS' : '✘ FAIL'}  ${name.padEnd(24)} ${detail}`);
};

// 1. Light combo chains and damages
await faceDummy();
await wait(400);
// The pool starts full (Job 12); empty it to measure what hits earn.
await page.evaluate(() => { window.__game.player.combat.momentum.value = 0; window.__game.player.combat.momentum.resonance = false; });
const before = await read();
for (let i = 0; i < 3; i++) {
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await wait(280);
}
await wait(800);
const afterCombo = await read();
const comboDamage = before.dummyHealth - afterCombo.dummyHealth;
check('light combo damage', comboDamage >= 45 && comboDamage <= 80, `${comboDamage.toFixed(0)} dmg over 3 hits`);
check('momentum from hits', afterCombo.momentum >= 12, `momentum=${afterCombo.momentum.toFixed(0)}`);

// 2. Charged heavy hits harder than a light
await faceDummy();
await wait(400);
const beforeHeavy = await read();
// Holding the attack: a quick slash, then the charge; release looses the heavy.
await page.mouse.down({ button: 'left' });
await wait(1300);
await page.mouse.up({ button: 'left' });
await wait(700);
const afterHeavy = await read();
const heavyDamage = beforeHeavy.dummyHealth - afterHeavy.dummyHealth;
check('charged heavy damage', heavyDamage > 50, `${heavyDamage.toFixed(0)} dmg`);

// 3. Hit-stop fires on impact
await faceDummy();
await wait(350);
const sampler = page.evaluate(
  () =>
    new Promise((resolve) => {
      const g = window.__game;
      let min = 1;
      const t0 = performance.now();
      const tick = () => {
        min = Math.min(min, g.time.scale);
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
        else resolve(min);
      };
      requestAnimationFrame(tick);
    }),
);
await wait(80);
await page.mouse.down({ button: 'left' });
await page.mouse.up({ button: 'left' });
const stopSeen = await sampler;
check('hit-stop on impact', stopSeen < 0.5, `min timeScale=${stopSeen.toFixed(2)}`);

// 4. Parry: window is open right after pressing Q
await faceDummy(2.4);
await wait(300);
const parry = await page.evaluate(async () => {
  const g = window.__game;
  const c = g.player.combat;
  c.momentum.value = 0;
  const before = c.momentum.value;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const result = c.applyHit({
    damage: 12,
    direction: new window.__three.Vector3(0, 0, 1),
    point: c.position.clone(),
    knockback: 4,
    stagger: 0.3,
    source: 'enemy',
    kind: 'enemy',
  });
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
  return { parried: !!result.parried, gained: c.momentum.value - before, health: c.health };
});
check('parry blocks damage', parry.parried && parry.health === 100, `parried=${parry.parried} hp=${parry.health}`);
check('parry momentum', parry.gained >= 15, `+${parry.gained.toFixed(0)}`);

// 5. Dash i-frames = perfect dodge
const dodge = await page.evaluate(async () => {
  const g = window.__game;
  const c = g.player.combat;
  const THREE = window.__three;
  g.player.controller.frozen = false;
  g.time.clear();
  c.momentum.value = 0;
  // Shift while moving dashes (standing still it channels Momentum instead).
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  // Wait for the dash to actually start (hit-stop can stretch this out).
  for (let i = 0; i < 40 && !g.player.controller.invulnerable; i++) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  const before = c.momentum.value;
  const result = c.applyHit({
    damage: 12, direction: new THREE.Vector3(0, 0, 1), point: c.position.clone(),
    knockback: 4, stagger: 0.3, source: 'enemy', kind: 'enemy',
  });
  return { dodged: !!result.dodged, gained: c.momentum.value - before, invuln: g.player.controller.invulnerable };
});
check('dash i-frame dodge', dodge.dodged && dodge.gained >= 8, `dodged=${dodge.dodged} +${dodge.gained.toFixed(0)}`);

// 6. Starfall (the first page) spends Momentum and rains on the aimed point
await faceDummy(6);
await wait(300);
const burst = await page.evaluate(async () => {
  const g = window.__game;
  const c = g.player.combat;
  const d = g.level.enemies[0];
  const p = g.player;
  // Aim at the construct's feet.
  const eye = p.controller.position.clone(); eye.y += p.controller.capsuleHeight - 0.25;
  const to = d.position.clone().sub(eye);
  p.camera.setYaw(p.camera.yaw, Math.atan2(to.y, Math.hypot(to.x, to.z)));
  c.momentum.value = 80;
  c.momentum.resonance = false;
  const hpBefore = d.health;
  const mBefore = c.momentum.value;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  await new Promise((r) => setTimeout(r, 120));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  const spent = mBefore - c.momentum.value;
  await new Promise((r) => setTimeout(r, 2200));
  return { spent, damage: hpBefore - d.health };
});
check('starfall', burst.spent === 30 && burst.damage > 0, `spent=${burst.spent} dmg=${burst.damage.toFixed(0)}`);

// 7. Resonance halves the cost
// Job 4 adds a shared casting lockout and per-spell recovery.
await wait(400);
const resonance = await page.evaluate(async () => {
  const g = window.__game;
  const c = g.player.combat;
  c.momentum.value = 100;
  c.momentum.resonance = true;
  const before = c.momentum.value;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  await new Promise((r) => setTimeout(r, 120));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  return { spent: before - c.momentum.value };
});
check('resonance discount', resonance.spent === 15, `spent=${resonance.spent} (half of 30)`);

// 8. Death and automatic respawn at the shrine
const death = await page.evaluate(async () => {
  const g = window.__game;
  const c = g.player.combat;
  const THREE = window.__three;
  c.applyHit({
    damage: 500, direction: new THREE.Vector3(0, 0, 1), point: c.position.clone(),
    knockback: 4, stagger: 0.3, source: 'enemy', kind: 'enemy',
  });
  const died = !c.alive;
  await new Promise((r) => setTimeout(r, 2600));
  return { died, alive: c.alive, health: c.health, x: c.position.x, z: c.position.z };
});
check('death and respawn', death.died && death.alive && death.health === 100,
  `died=${death.died} respawned hp=${death.health} at (${death.x.toFixed(0)}, ${death.z.toFixed(0)})`);

// 9. A sparring construct fights back
const brute = await page.evaluate(async () => {
  const g = window.__game;
  const c = g.player.combat;
  const enemy = g.level.enemies[2];
  g.player.controller.teleport(enemy.position.x, enemy.position.y + 0.2, enemy.position.z + 2.2, 0);
  c.reset();
  const hpBefore = c.health;
  let sawTelegraph = false;
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) {
    if (enemy.state === 'telegraph') sawTelegraph = true;
    if (c.health < hpBefore) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { sawTelegraph, damaged: c.health < hpBefore, health: c.health };
});
check('construct attacks player', brute.sawTelegraph && brute.damaged, `telegraph=${brute.sawTelegraph} hp=${brute.health.toFixed(0)}`);

if (errors.length) console.log('page errors:', errors.join(' | '));
await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
