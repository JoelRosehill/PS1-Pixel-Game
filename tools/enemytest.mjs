// Enemy ecology regression suite (Job 5). Drives the real game deterministically with
// `game.step()` (manual mode), so results do not depend on frame rate.
//
//   npm run enemytest
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs, logicQuery } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { port: 5196, strictPort: false } });
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
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => failures.push(`pageerror: ${e.message}`));
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=8${logicQuery}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });

  // Shared helpers inside the page.
  await page.evaluate(() => {
    const g = window.__game;
    const T = window.__three;
    const SITE = { x: g.level.testSite.x, z: g.level.testSite.z };
    window.__key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    window.__et = {
      g, T, SITE,
      reset(yaw = 0, x = SITE.x, z = SITE.z) {
        g.manual = true;
        g.enemies.clear();
        g.time.clear();
        g.input.clear();
        const p = g.player;
        p.combat.reset();
        p.controller.teleport(x, g.level.heightAt(x, z) + 0.05, z, yaw);
        p.camera.setYaw(yaw, 0);
        g.step(0.1);
        return p;
      },
      /** Spawns in front of the player (who faces -Z) at `dist` metres, facing them. */
      spawn(kind, dist = 4, dx = 0, opts = {}) {
        const x = SITE.x + dx, z = SITE.z - dist;
        return g.enemies.spawn(kind, x, z, { rise: false, facing: Math.atan2(-(SITE.x - x), -(SITE.z - z)), ...opts });
      },
      hit(target, damage, kind, dir, extra = {}) {
        const p = g.player;
        return g.combatWorld.strike(target, {
          damage, direction: new T.Vector3(...dir).normalize(), point: target.position.clone().setY(target.position.y + 1.2),
          knockback: 0, stagger: 0.2, source: 'player', kind, attacker: p.combat, ...extra,
        });
      },
      /** Freezes an enemy's brain (physics and hits still apply). */
      freeze(e) { e.think = () => e.move(0, 0, 0); return e; },
    };
  });
  const run = async (name, fn, arg) => {
    try {
      const r = await page.evaluate(fn, arg);
      check(name, r.ok, r.detail ?? '');
    } catch (e) { check(name, false, e.message); }
  };

  // --- perception ----------------------------------------------------------
  await run('a foe notices a player in its view cone', () => {
    const { g, reset, spawn } = window.__et;
    reset();
    const k = spawn('hollow', 14);
    g.step(1.5);
    return { ok: k.perception.alerted && k.state !== 'idle', detail: `state=${k.state} awareness=${k.perception.awareness.toFixed(2)}` };
  });
  await run('a foe facing away does not notice at 12 m', () => {
    const { g, reset, spawn } = window.__et;
    reset();
    const k = spawn('hollow', 12, 0, { facing: 0 });
    k.facing = 0; // looking away (-Z)
    g.step(1.5);
    return { ok: !k.perception.alerted, detail: `awareness=${k.perception.awareness.toFixed(2)}` };
  });

  // --- the Bestiary --------------------------------------------------------------
  await run('every Bestiary foe wears its animated model', () => {
    const { g, reset, spawn } = window.__et;
    reset();
    const ids = ['hollow', 'pilgrim', 'stitched', 'shadowknight', 'ashen-knight', 'sunkeeper', 'umbral', 'gnawer', 'wasp', 'steed', 'wyrmling', 'crystal-hollow'];
    const missing = [];
    ids.forEach((id, i) => { const e = spawn(id, 20 + i * 4, 30); if (!e.model || !e.model.has('idle')) missing.push(id); });
    g.step(0.5);
    return { ok: !missing.length, detail: `missing=${missing.join(',')}` };
  });
  await run('every foe completes a full attack cycle with its clips', () => {
    const { g, reset, spawn, freeze } = window.__et;
    const bad = [];
    for (const id of ['hollow', 'pilgrim', 'stitched', 'shadowknight', 'ashen-knight', 'sunkeeper', 'umbral', 'gnawer', 'wasp', 'steed', 'wyrmling', 'crystal-hollow']) {
      const p = reset();
      p.combat.health = 99999; p.combat.maxHealth = 99999;
      const e = spawn(id, 3);
      e.perception.alert(p.controller.position);
      const seen = new Set();
      for (let i = 0; i < 60 * 8; i++) { g.step(1 / 60); seen.add(e.state); if (!Number.isFinite(e.position.x)) break; }
      p.combat.maxHealth = 100;
      if (!seen.has('windup') || !seen.has('strike') || !seen.has('recover') || !Number.isFinite(e.position.x)) bad.push(`${id}:${[...seen].join('/')}`);
    }
    return { ok: !bad.length, detail: bad.join(' ') };
  });
  await run('attacks connect only after their wind-up (telegraph)', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('shadowknight', 2.6);
    k.perception.alert(p.controller.position);
    let windupAt = -1, hitAt = -1;
    for (let i = 0; i < 60 * 6 && hitAt < 0; i++) {
      g.step(1 / 60);
      if (k.state === 'windup' && windupAt < 0) windupAt = i;
      if (p.combat.health < 100 && hitAt < 0) hitAt = i;
    }
    return { ok: windupAt >= 0 && hitAt > windupAt + 20, detail: `windup@${windupAt} hit@${hitAt}` };
  });
  await run('attack tokens limit simultaneous attackers', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    p.combat.health = 99999; p.combat.maxHealth = 99999;
    const ks = [spawn('hollow', 3, -2), spawn('hollow', 3, 2), spawn('hollow', 3, 0), spawn('hollow', -3, 0)];
    for (const k of ks) k.perception.alert(p.controller.position);
    let most = 0;
    for (let i = 0; i < 60 * 8; i++) { g.step(1 / 60); most = Math.max(most, ks.filter(k => k.state === 'windup' || k.state === 'strike').length); }
    p.combat.maxHealth = 100;
    return { ok: most >= 1 && most <= 2, detail: `max simultaneous=${most}` };
  });
  await run('a parried foe staggers and is exposed', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('shadowknight', 2.6);
    k.perception.alert(p.controller.position);
    let parried = false;
    for (let i = 0; i < 60 * 8 && !parried; i++) {
      if (k.state === 'windup' && k.stateTime > k.attack.windup - 0.1) { g.input.clear(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })); }
      g.step(1 / 60);
      g.input.endFrame();
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
      parried = k.exposed > 0;
    }
    return { ok: parried && k.state === 'staggered' && p.combat.riposteReady, detail: `state=${k.state} exposed=${k.exposed.toFixed(2)} hp=${p.combat.health}` };
  });
  await run('exposed foes take bonus damage', () => {
    const { reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('hollow', 2.5));
    const a = hit(k, 20, 'light', [0, 0, -1]);
    k.exposed = 1;
    const b = hit(k, 20, 'light', [0, 0, -1]);
    return { ok: b.damage > a.damage * 1.4 && b.critical, detail: `${a.damage}→${b.damage}` };
  });
  await run('armoured swings shrug off light blows; poise breaks', () => {
    const { g, reset, spawn, hit } = window.__et;
    const p = reset();
    p.combat.health = 99999;
    const k = spawn('stitched', 2.8);
    k.perception.alert(p.controller.position);
    let tested = false, shrugged = false;
    for (let i = 0; i < 60 * 8 && !tested; i++) {
      g.step(1 / 60);
      if (k.state === 'windup' && k.attack?.armour) { hit(k, 10, 'light', [0, 0, -1]); tested = true; shrugged = k.state === 'windup'; }
    }
    let broke = false;
    for (let i = 0; i < 12 && !broke; i++) { hit(k, 5, 'heavy', [0, 0, -1]); broke = k.state === 'staggered'; }
    return { ok: tested && shrugged && broke, detail: `tested=${tested} shrugged=${shrugged} broke=${broke} poise=${k.poise.toFixed(0)}` };
  });
  await run('guarding knights chip frontal blows; spells and backstabs get through', () => {
    const { reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('shadowknight', 2.5));
    k.guarding = true;
    const front = hit(k, 20, 'light', [0, 0, -1]);
    k.guarding = true; k.poise = 999;
    const spell = hit(k, 20, 'spell', [0, 0, -1]);
    k.guarding = true;
    const back = hit(k, 20, 'light', [0, 0, 1]);
    return { ok: front.blocked && front.damage < 6 && !spell.blocked && spell.damage === 20 && back.critical && back.damage > 20,
      detail: `front=${front.damage} spell=${spell.damage} back=${back.damage}` };
  });
  await run('a perfect dodge avoids a blow', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('hollow', 2.6);
    k.perception.alert(p.controller.position);
    let dodged = false;
    for (let i = 0; i < 60 * 8 && !dodged; i++) {
      if (k.state === 'strike') { p.controller.dashTimer = 0.18; p.controller.velocity.set(0, 0, 0); }
      g.step(1 / 60);
      if (k.state === 'recover' && p.combat.health === 100) dodged = true;
      if (p.combat.health < 100) break;
    }
    return { ok: dodged && p.combat.health === 100, detail: `hp=${p.combat.health}` };
  });
  await run('the player cannot walk through a foe', () => {
    const { g, reset, spawn, freeze } = window.__et;
    const p = reset();
    const k = freeze(spawn('stitched', 3));
    window.__key('KeyW');
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    window.__key('KeyW', 'keyup');
    const d = Math.hypot(p.controller.position.x - k.position.x, p.controller.position.z - k.position.z);
    return { ok: d > k.bodyRadius + 0.3, detail: `gap=${d.toFixed(2)}` };
  });
  await run('frost slows a foe', () => {
    const { g, reset, spawn, hit } = window.__et;
    const p = reset();
    const k = spawn('gnawer', 18);
    k.perception.alert(p.controller.position);
    g.step(1);
    let fast = 0; for (let i = 0; i < 30; i++) { g.step(1 / 60); fast = Math.max(fast, Math.hypot(k.velocity.x, k.velocity.z)); }
    hit(k, 1, 'spell', [0, 0, -1], { slow: 3, stagger: 0 });
    g.step(0.3);
    let slow = 0; for (let i = 0; i < 30; i++) { g.step(1 / 60); slow = Math.max(slow, Math.hypot(k.velocity.x, k.velocity.z)); }
    return { ok: fast > 3 && slow < fast * 0.7, detail: `${fast.toFixed(1)}→${slow.toFixed(1)} m/s` };
  });
  await run('fliers hover above the ground', () => {
    const { g, reset, spawn } = window.__et;
    reset();
    const w = spawn('wasp', 12);
    g.step(2);
    return { ok: w.visual.position.y > 1.5, detail: `hover=${w.visual.position.y.toFixed(2)}` };
  });
  await run('foes deeper along the road are tougher', () => {
    const { reset, spawn } = window.__et;
    reset();
    const a = spawn('hollow', 10, 0, { level: 1 }), b = spawn('hollow', 10, 3, { level: 5 });
    return { ok: b.maxHealth > a.maxHealth * 1.5 && b.power > a.power, detail: `${a.maxHealth}→${b.maxHealth}` };
  });

  // --- casters ------------------------------------------------------------------
  await run('Sunkeepers keep range and fire orbs', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    p.combat.health = 99999;
    const w = spawn('sunkeeper', 16);
    w.perception.alert(p.controller.position);
    const fired0 = g.enemies.projectiles.fired;
    g.step(8);
    return { ok: g.enemies.projectiles.fired > fired0, detail: `orbs=${g.enemies.projectiles.fired - fired0}` };
  });
  await run('Sunkeepers blink away when crowded', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    p.combat.health = 99999;
    const w = spawn('sunkeeper', 3);
    w.perception.alert(p.controller.position);
    let blinked = false;
    const start = w.position.clone();
    for (let i = 0; i < 60 * 10 && !blinked; i++) { g.step(1 / 60); blinked = w.position.distanceTo(start) > 6; }
    return { ok: blinked, detail: `moved=${w.position.distanceTo(start).toFixed(1)}` };
  });
  await run('sunfall marks the ground before it lands', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    p.combat.health = 99999;
    const w = spawn('sunkeeper', 14);
    w.perception.alert(p.controller.position);
    let marked = 0;
    for (let i = 0; i < 60 * 14 && !marked; i++) { g.step(1 / 60); marked = g.enemies.telegraphs.pendingStrikes; }
    return { ok: marked > 0, detail: `pending=${marked}` };
  });
  await run('a parried orb flies back and burns its caster', () => {
    const { g, T, reset, spawn, freeze } = window.__et;
    const p = reset();
    const w = freeze(spawn('sunkeeper', 12));
    const hp0 = w.health;
    const from = w.position.clone().setY(w.position.y + 1.6);
    g.enemies.projectiles.fire(from, new T.Vector3().subVectors(g.enemies.ctx.playerEye, from), 15, 14, w, 1.1);
    let reflected = false;
    for (let i = 0; i < 180; i++) {
      const orb = g.enemies.projectiles.orbs.find(o => o.active);
      if (orb && !reflected && orb.mesh.position.distanceTo(g.enemies.ctx.playerEye) < 2.5) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })); g.step(1 / 60); g.input.endFrame();
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })); reflected = true;
      }
      g.step(1 / 60);
    }
    return { ok: w.health < hp0 && p.combat.health === 100, detail: `reflections=${g.enemies.projectiles.reflections} hp ${hp0}→${w.health}` };
  });
  await run('foes avoid deep water', () => {
    const { g, reset } = window.__et;
    // Find a lake in Mirrorlake with dry ground on both sides.
    const L = g.level, road = L.atlas.road, site = L.atlas.sites.find(s => s.id === 'c1-2');
    let found = null;
    for (let s = site.s0; s < site.s1 && !found; s += 10)
      for (const lat of [-160, -120, -90, -60, -40, 40, 60, 90, 120, 160]) {
        const w = road.offset(s, lat);
        if (L.heightAt(w.x, w.z) > -1.5) continue;
        for (let a = 0; a < 8 && !found; a++) {
          const dx = Math.sin(a * 0.785), dz = Math.cos(a * 0.785);
          for (const r of [14, 20, 28]) {
            const ax = w.x + dx * r, az = w.z + dz * r, bx = w.x - dx * r, bz = w.z - dz * r;
            if (L.heightAt(ax, az) > 1.2 && L.heightAt(bx, bz) > 1.2) { found = { ax, az, bx, bz }; break; }
          }
        }
        if (found) break;
      }
    if (!found) return { ok: false, detail: 'no lake found' };
    const p = reset(0, found.bx, found.bz);
    const k = g.enemies.spawn('hollow', found.ax, found.az, { rise: false, facing: 0 });
    k.perception.alert(p.controller.position);
    let lowest = Infinity;
    for (let i = 0; i < 360; i++) { g.step(1 / 60); lowest = Math.min(lowest, k.position.y); }
    return { ok: lowest > -0.4, detail: `lowest y=${lowest.toFixed(2)}` };
  });
  await run('void maw pulls enemies inward', () => {
    const { g, T, reset, spawn, freeze } = window.__et;
    const p = reset();
    const k = freeze(spawn('knight', 9, 1.5));
    p.spells.collect('void-maw'); p.spells.book.select('void-maw');
    p.combat.momentum.value = 100;
    p.spells.cast();
    for (let i = 0; i < 30; i++) g.step(1 / 60);
    const opened = p.spells.maws.length === 1;
    // Move the seed 4 m to the side of the knight to watch the pull.
    const maw = p.spells.maws[0];
    if (!maw) return { ok: false, detail: 'no maw opened' };
    maw.pos.set(k.position.x + 4, maw.pos.y, k.position.z);
    const d0 = Math.hypot(k.position.x - maw.pos.x, k.position.z - maw.pos.z);
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    const d1 = Math.hypot(k.position.x - maw.pos.x, k.position.z - maw.pos.z);
    for (let i = 0; i < 150; i++) g.step(1 / 60);
    return { ok: opened && d1 < d0 - 0.3 && k.health < k.maxHealth && !p.spells.maws.length, detail: `distance ${d0.toFixed(2)}→${d1.toFixed(2)} hp=${k.health.toFixed(0)}/${k.maxHealth}` };
  });

  // --- lifecycle -------------------------------------------------------------
  await run('death dissolves and removes the enemy', () => {
    const { g, reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('knight', 4));
    const r = hit(k, 999, 'heavy', [0, 0, -1]);
    const inactive = !k.collider.active;
    g.step(1.2 + 0.75);
    const mid = k.dissolve.value;
    g.step(1.3);
    const gone = !g.enemies.enemies.includes(k) && !g.combatWorld.targets.has(k) && !k.group.parent;
    return { ok: r.killed && inactive && mid > 0.3 && mid < 1 && gone, detail: `dissolve mid=${mid.toFixed(2)} gone=${gone} kills=${g.enemies.kills}` };
  });
  await run('leashed enemies return home and heal', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('knight', 6);
    k.health = 60;
    k.position.set(k.home.x, k.home.y, k.home.z + 40);
    g.step(0.1);
    const returning = k.state === 'return';
    p.controller.teleport(p.controller.position.x + 200, 30, p.controller.position.z, 0);
    g.step(12);
    return { ok: returning && k.health > 60 && k.position.distanceTo(k.home) < 3, detail: `state=${k.state} hp=${k.health.toFixed(0)} home=${k.position.distanceTo(k.home).toFixed(1)}` };
  });

  // --- encounters -------------------------------------------------------------
  await run('encounter raises waves and pays out when cleared', () => {
    const { g, reset, hit } = window.__et;
    const enc = g.enemies.encounters.find(e => e.def.id.startsWith('camp:') && e.def.waves.length >= 2);
    const p = reset(0, enc.def.trigger.x + 2, enc.def.trigger.z + 2);
    p.combat.health = 50;
    g.step(0.1);
    const first = enc.state === 'active' ? enc.living.length : -1;
    g.step(1.5);
    for (const e of enc.living) hit(e, 99999, 'heavy', [0, 0, -1]);
    g.step(4);
    const second = enc.wave === 1 ? enc.enemies.filter(e => e.alive).length : -1;
    g.step(1.2);
    p.combat.health = 50;
    for (const e of enc.living) hit(e, 99999, 'heavy', [0, 0, -1]);
    g.step(4);
    return { ok: first === enc.def.waves[0].length && second === enc.def.waves[1].length && enc.state === 'cleared' && p.combat.health > 50,
      detail: `${enc.def.id} wave1=${first} wave2=${second} state=${enc.state} hp=${p.combat.health.toFixed(0)}` };
  });
  await run('dying resets an active encounter', () => {
    const { g, reset } = window.__et;
    const enc = g.enemies.encounters.find(e => e.def.id.startsWith('camp:c1-') && e.state === 'dormant');
    const p = reset(0, enc.def.trigger.x, enc.def.trigger.z);
    g.step(0.2);
    const active = enc.state === 'active' && enc.living.length === enc.def.waves[0].length;
    g.combatWorld.strike(p.combat, { damage: 999, direction: new window.__three.Vector3(0, 0, 1), point: p.controller.position.clone(),
      knockback: 0, stagger: 0, source: 'enemy', kind: 'enemy' });
    g.step(2.5);
    return { ok: active && p.combat.alive && enc.state === 'dormant' && g.enemies.enemies.length === 0,
      detail: `${enc.def.id} active=${active} state=${enc.state} enemies=${g.enemies.enemies.length}` };
  });

  // --- pause and HUD (real render loop) ---------------------------------------
  const paused = await page.evaluate(async () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('knight', 6);
    k.perception.alert(p.controller.position);
    g.step(0.9);
    window.__et.k = k;
    g.manual = false;
    g.spellbookUI.open('book');
    const before = { pos: k.position.toArray(), t: k.stateTime, state: k.state };
    await new Promise(r => setTimeout(r, 400));
    const same = k.position.toArray().every((v, i) => v === before.pos[i]) && k.stateTime === before.t;
    g.spellbookUI.close(false);
    g.manual = true;
    return { ok: same, detail: `state=${before.state}` };
  });
  check('open spellbook pauses enemies', paused.ok, paused.detail);
  await page.evaluate(() => {
    const { hit, k } = window.__et;
    hit(k, 11, 'light', [0, 0, -1]);
  });
  await wait(300);
  const frame = await page.evaluate(() => {
    const el = document.querySelector('.enemy-frame');
    return { shown: el.classList.contains('shown'), name: el.querySelector('.enemy-name').textContent };
  });
  check('target frame shows the fought enemy', frame.shown && frame.name === 'SHADOW KNIGHT', frame);
} finally {
  await browser?.close();
  await server.close();
}
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
