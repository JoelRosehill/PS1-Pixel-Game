import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath } from './browser.mjs';
const server = await createServer({ logLevel: 'error', server: { port: 5194, strictPort: false } });
await server.listen();
let browser;
const failures = [];
let total = 0;
const check = (name, ok, detail = '') => { total++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); if (!ok) failures.push(name); };
try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => failures.push(e.message));
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=8`);
  await page.waitForFunction('window.__ready || window.__error');
  check('camera sits at player eye; world body hidden', await page.evaluate(() => {
    const g = window.__game, c = g.player.controller, p = g.camera.position;
    return Math.hypot(p.x - c.position.x, p.z - c.position.z) < 0.05 && Math.abs(p.y - c.position.y - 1.55) < 0.08 && !g.player.model.root.visible;
  }));
  check('first-person sword and book are rendered separately', await page.evaluate(() => {
    const p = window.__game.player;
    return p.view.scene.children.includes(p.view.swordHand) && p.view.book.root.parent === p.view.bookHand && p.view.swordHand.children.length > 3;
  }));
  check('projectile follows vertical and horizontal aim', await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.combat.reset(); p.spells.collect('ember-lance'); p.spells.book.select('ember-lance');
    p.controller.teleport(400, 150, 400, 0.3); p.camera.setYaw(0.3, 0.6); p.combat.momentum.value = 80;
    p.spells.cast();
    const ray = p.spells.projectiles[0].direction;
    const expected = p.camera.aimDirection(new window.__three.Vector3());
    const ok = ray.dot(expected) > 0.9999 && ray.y > 0.5;
    p.combat.reset(); p.respawn(); return ok;
  }));
  const beforeMotion = await page.evaluate(() => window.__game.player.camera.motionScale);
  await page.keyboard.press('F6');
  check('F6 toggles camera motion', await page.evaluate(before => window.__game.player.camera.motionScale !== before, beforeMotion));
  await page.keyboard.press('F6');

  const results = await page.evaluate(async () => {
    const { PlayerController } = await import('/src/player/PlayerController.ts');
    const { ColliderWorld } = await import('/src/physics/Colliders.ts');
    const results = [];
    const check = (name, ok, detail) => results.push({ name, ok, detail });
    // Deterministic input harness drives the production controller at 60 Hz.
    // These worlds isolate the maneuver, rather than depending on render cadence.
    const setup = (wall = false) => {
      const down = new Set(), edges = new Set();
      const input = { isDown: k => down.has(k), pressed: k => edges.has(k), takePressed: k => edges.delete(k),
        axis: (a, b) => Number(down.has(b)) - Number(down.has(a)), mousePressed: () => false };
      const world = new ColliderWorld(() => 0);
      if (wall) world.addBox(0, 10, 0, 0.6, 20, 100);
      const c = new PlayerController(input, world);
      c.teleport(wall ? 0.67 : 0, wall ? 8 : 0, wall ? 20 : 0, 0);
      const press = key => { down.add(key); edges.add(key); };
      const tick = (frames = 1, observe = () => {}) => {
        for (let i = 0; i < frames; i++) { c.fixedUpdate(1 / 60); observe(c); edges.clear(); }
      };
      return { c, world, down, press, tick };
    };
    {
      const { c, press, tick } = setup(); tick(2); press('KeyW'); tick(30); press('ShiftLeft'); tick(); press('Space'); tick();
      check('dash-jump keeps speed and launches', c.speed > 29 && c.velocity.y > 10 && !c.invulnerable, [c.speed, c.velocity.y]);
    }
    {
      const { c, press, tick } = setup(); tick(2); c.velocity.z = -36; press('KeyW'); press('ShiftLeft'); tick();
      check('dash does not brake earned speed', c.speed > 35, c.speed);
    }
    {
      const { c, press, tick } = setup(); tick(2); press('KeyW'); tick(30); press('ControlLeft'); tick(); press('Space'); tick();
      const launch = c.speed; tick(12);
      check('slide-jump gains speed without accidental slam', launch > 15 && !c.slamming && c.position.y > 1, [launch, c.position.y]);
    }
    {
      const { c, press, tick } = setup(); c.teleport(0, 30, 0, 0); c.velocity.z = -30; press('KeyW'); press('KeyD'); tick(20);
      check('air steering bends trajectory while preserving speed', c.velocity.x > 8 && c.speed >= 29 && c.facing === 0, [c.velocity.x, c.speed]);
    }
    {
      const { c, press, tick } = setup(); tick(2); press('KeyD'); tick(20);
      check('strafing does not turn the aim', c.velocity.x > 8 && c.facing === 0);
    }
    {
      const { c, press, tick } = setup(true); c.velocity.z = -16; press('KeyW'); let runFrames = 0;
      tick(90, c => { if (c.wallRunning) runFrames++; });
      check('wall-run sustains lateral traversal', runFrames >= 80 && c.position.y > 5 && c.position.z < 0, [runFrames, c.position.toArray()]);
      c.dashCharges = 1; press('Space'); tick();
      check('wall kick preserves tangent speed and refunds a dash', c.velocity.x > 7 && c.velocity.z < -12 && c.velocity.y > 9 && c.dashCharges === 2, [c.velocity.toArray(), c.dashCharges]);
    }
    {
      const { c, press, tick } = setup(true); c.velocity.z = -16; press('KeyW'); tick(145);
      check('wall-run has a finite per-wall budget', c.wallRunRemaining === 0 && !c.wallRunning, c.wallRunRemaining);
    }
    {
      const { c, press, tick } = setup(); c.teleport(0, 12, 0); press('KeyW'); tick(10); press('KeyC'); tick();
      check('air slam commits downward', c.slamming && c.velocity.y <= -37, c.velocity.y);
      let slam = false, rebound = false, buffered = false, peak = 0;
      for (let i = 0; i < 80; i++) {
        if (!buffered && c.position.y < 1 && !c.grounded) { press('Space'); buffered = true; }
        tick(); slam ||= c.events.slammed; rebound ||= c.events.rebounded;
        if (rebound) peak = Math.max(peak, c.position.y);
      }
      check('buffered slam rebound launches above a normal jump', slam && rebound && peak > 4, { slam, rebound, peak });
    }
    {
      const { c, world, press, tick } = setup(); world.addBox(0, 4, -3, 20, 8, 0.06);
      c.teleport(0, 2, 0); c.velocity.z = -42; press('KeyW'); tick(16);
      check('top-speed traversal cannot tunnel through thin walls', c.position.z > -2.64, c.position.z);
    }
    {
      const { c, world, press, tick } = setup(); tick(2); press('KeyW'); tick(25); press('ControlLeft'); tick();
      world.addBox(0, 1.45, c.position.z - 1, 6, 0.6, 6); press('Space'); tick();
      check('slide-jump cannot expand into low ceiling', c.capsuleHeight < 1.1 && c.velocity.y < 1, c.capsuleHeight);
    }
    {
      const { c, press, tick } = setup(true); c.velocity.z = -16; press('KeyW'); tick(20); c.teleport(10, 2, 10);
      check('teleport resets transient traversal state', !c.wallRunning && !c.slamming && c.reboundRemaining === 0 && c.capsuleHeight === 1.8);
    }
    return results;
  });
  for (const r of results) check(r.name, r.ok, r.detail);
} finally { await browser?.close(); await server.close(); }
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
