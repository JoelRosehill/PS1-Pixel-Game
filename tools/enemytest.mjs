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
    const SITE = { x: 20, z: 60 };
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
  await run('knight notices a player in its view cone', () => {
    const { g, reset, spawn } = window.__et;
    reset();
    const k = spawn('knight', 14);
    let t = 0;
    while (!k.perception.alerted && t < 4) { g.step(0.1); t += 0.1; }
    return { ok: k.perception.alerted && t < 2.5, detail: `alerted after ${t.toFixed(1)}s` };
  });
  await run('knight facing away does not notice at 12 m', () => {
    const { g, reset, spawn } = window.__et;
    reset();
    const k = spawn('knight', 12);
    k.facing = 0; // looking away (-Z)
    g.step(2);
    return { ok: !k.perception.alerted && k.state === 'idle', detail: `awareness=${k.perception.awareness.toFixed(2)}` };
  });
  await run('walls block line of sight', () => {
    const { g, reset, spawn, SITE } = window.__et;
    reset();
    const k = spawn('knight', 14);
    // A tall wall between them (added to this test page's collision world only).
    g.level.colliders.addBox(SITE.x, g.level.heightAt(SITE.x, SITE.z - 7) + 3, SITE.z - 7, 8, 6, 0.6);
    g.step(2.5);
    const blind = !k.perception.canSee && !k.perception.alerted;
    return { ok: blind, detail: `canSee=${k.perception.canSee} awareness=${k.perception.awareness.toFixed(2)}` };
  });

  // Move away from the wall used above for the remaining tests.
  await page.evaluate(() => { window.__et.SITE.x = 60; window.__et.SITE.z = 62; });

  // --- knight offence --------------------------------------------------------
  await run('knight telegraphs before damage lands', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('knight', 3);
    k.perception.alert(p.controller.position);
    let windupAt = -1, damageAt = -1, t = 0;
    for (let i = 0; i < 480 && damageAt < 0; i++) {
      g.step(1 / 60); t += 1 / 60;
      if (k.state === 'windup' && windupAt < 0) windupAt = t;
      if (p.combat.health < 100) damageAt = t;
    }
    return { ok: windupAt >= 0 && damageAt - windupAt >= 0.37, detail: `windup@${windupAt.toFixed(2)} damage@${damageAt.toFixed(2)} (${k.attack?.id ?? k.state})` };
  });
  await run('attack tokens cap simultaneous attackers', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    p.combat.health = 1e6;
    const ks = [spawn('knight', 3.5, -2), spawn('knight', 3.5, 2), spawn('knight', 3, 0), spawn('knight', -3.5, 0)];
    for (const k of ks) k.perception.alert(p.controller.position);
    let most = 0, attacks = 0;
    for (let i = 0; i < 600; i++) {
      g.step(1 / 60);
      const n = ks.filter(k => k.state === 'windup' || k.state === 'strike').length;
      most = Math.max(most, n);
      if (n) attacks++;
    }
    return { ok: most <= 2 && attacks > 60, detail: `max simultaneous=${most}, attacking frames=${attacks}` };
  });

  // --- parry, guard, weak point ---------------------------------------------
  await run('parrying a knight staggers and exposes it', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('knight', 2.8);
    k.perception.alert(p.controller.position);
    p.combat.momentum.value = 0; const m0 = 0;
    let parried = false;
    for (let i = 0; i < 600 && !parried; i++) {
      if (k.state === 'windup' && k.attack && k.attack.windup - k.stateTime < 0.08) p.combat.parryTimer = 0.18;
      g.step(1 / 60);
      parried = k.state === 'staggered' && k.exposed > 0;
    }
    return { ok: parried && p.combat.health === 100 && p.combat.momentum.value >= m0 + 15 && p.combat.riposteReady,
      detail: `state=${k.state} exposed=${k.exposed.toFixed(2)} hp=${p.combat.health} momentum=${p.combat.momentum.value}` };
  });
  await run('exposed knight takes bonus riposte damage', () => {
    const { reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('knight', 2.5));
    k.exposed = 2;
    const r = hit(k, 34, 'riposte', [0, 0, -1]);
    return { ok: r.critical && Math.abs(r.damage - 34 * 1.6) < 0.01, detail: `damage=${r.damage}` };
  });
  await run('shield blocks frontal light hits; back rune is weak', () => {
    const { reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('knight', 2.5));
    k.guarding = true;
    const front = hit(k, 11, 'light', [0, 0, -1]);
    k.poise = 100;
    const back = hit(k, 11, 'light', [0, 0, 1]);
    return { ok: front.blocked && front.damage <= 11 * 0.21 && !back.blocked && back.critical && Math.abs(back.damage - 16.5) < 0.01,
      detail: `front=${front.damage.toFixed(1)} blocked=${front.blocked}; back=${back.damage}` };
  });
  await run('heavy blows break the guard', () => {
    const { g, reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('knight', 2.5));
    k.guarding = true;
    hit(k, 26, 'heavy', [0, 0, -1]);
    g.step(1 / 60);
    k.guarding = true;
    const second = hit(k, 26, 'heavy', [0, 0, -1]);
    return { ok: k.state === 'staggered' && k.exposed > 0 && !second.blocked, detail: `state=${k.state} exposed=${k.exposed.toFixed(2)} poise=${k.poise}` };
  });
  await run('spells pierce the shield', () => {
    const { reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('knight', 2.5));
    k.guarding = true;
    const r = hit(k, 16, 'burst', [0, 0, -1], { stagger: 1.6 });
    return { ok: !r.blocked && r.damage === 16 && k.state === 'staggered', detail: `damage=${r.damage} state=${k.state}` };
  });
  await run('perfect dodge avoids a knight blow', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const k = spawn('knight', 3);
    k.perception.alert(p.controller.position);
    let dodged = false;
    p.combat.momentum.value = 0; const m0 = 0;
    for (let i = 0; i < 600 && !dodged; i++) {
      if (k.state === 'strike') p.controller.dashTimer = 0.2;
      g.step(1 / 60);
      dodged = k.state === 'recover' && p.combat.momentum.value >= m0 + 8;
    }
    return { ok: dodged && p.combat.health === 100, detail: `hp=${p.combat.health} momentum=${p.combat.momentum.value}` };
  });

  // --- bodies ----------------------------------------------------------------
  await run('player cannot walk through a knight', () => {
    const { g, reset, spawn, freeze } = window.__et;
    const p = reset();
    const k = freeze(spawn('knight', 3));
    g.input.down.add('KeyW');
    let closest = Infinity;
    for (let i = 0; i < 90; i++) {
      g.step(1 / 60);
      closest = Math.min(closest, Math.hypot(p.controller.position.x - k.position.x, p.controller.position.z - k.position.z));
    }
    g.input.clear();
    // Bodies are round, so the player slides around rather than stopping dead — but never overlaps.
    return { ok: closest > 0.85, detail: `closest=${closest.toFixed(2)} (radii ${(0.55 + 0.36).toFixed(2)})` };
  });
  await run('knights avoid deep water', () => {
    const { g, reset } = window.__et;
    // Player on the far bank of the canal; knight on the near bank.
    const p = reset(0, 30, -38);
    const k = g.enemies.spawn('knight', 30, -14, { rise: false, facing: 0 });
    k.perception.alert(p.controller.position);
    let lowest = Infinity;
    for (let i = 0; i < 360; i++) { g.step(1 / 60); lowest = Math.min(lowest, k.position.y); }
    return { ok: lowest > -0.5, detail: `lowest y=${lowest.toFixed(2)} at z=${k.position.z.toFixed(1)}` };
  });

  // --- wizard ----------------------------------------------------------------
  await run('wizard blinks away when approached', () => {
    const { g, reset, spawn } = window.__et;
    const p = reset();
    const w = spawn('wizard', 14);
    w.perception.alert(p.controller.position);
    g.step(0.6);
    p.controller.teleport(w.position.x, w.position.y, w.position.z + 3, 0);
    g.step(1.2);
    const d = w.distanceToPlayer(g.enemies.ctx);
    const ground = g.level.heightAt(w.position.x, w.position.z);
    return { ok: w.blinks >= 1 && d >= 9 && ground > 0.3, detail: `blinks=${w.blinks} dist=${d.toFixed(1)} ground=${ground.toFixed(2)}` };
  });
  await run('solar lance marks the ground and punishes standing still', () => {
    const { g, reset, spawn, freeze } = window.__et;
    const p = reset();
    const w = freeze(spawn('wizard', 15));
    w.spell = 'lance';
    w.release(g.enemies.ctx);
    const marked = g.enemies.telegraphs.pendingStrikes === 1 && g.enemies.telegraphs.activeCount >= 1;
    g.step(1.3);
    const stayed = 100 - p.combat.health;
    p.combat.reset();
    w.spell = 'lance';
    w.release(g.enemies.ctx);
    p.controller.teleport(p.controller.position.x + 6, p.controller.position.y + 0.2, p.controller.position.z, 0);
    g.step(1.3);
    const moved = 100 - p.combat.health;
    return { ok: marked && stayed >= 20 && moved === 0, detail: `marked=${marked} stayed=-${stayed} moved=-${moved}` };
  });
  await run('blinding flash blinds only when looked at', () => {
    const { g, reset, spawn, freeze } = window.__et;
    const p = reset();
    const w = freeze(spawn('wizard', 10));
    w.spell = 'flash';
    w.release(g.enemies.ctx);
    const looked = g.gameHud.blinded;
    g.gameHud.blind(0, 0); g.gameHud.update(5, p.combat, p.controller);
    p.camera.setYaw(Math.PI, 0);
    w.spell = 'flash';
    w.release(g.enemies.ctx);
    const away = g.gameHud.blinded;
    return { ok: looked > 0.9 && away === 0 && w.lastFlash === 'avoided', detail: `looking=${looked.toFixed(2)} away=${away}` };
  });
  await run('parry reflects a sun orb into its caster', () => {
    const { g, T, reset, spawn, freeze } = window.__et;
    const p = reset();
    const w = freeze(spawn('wizard', 12));
    const tip = w.staffTip(new T.Vector3());
    g.enemies.projectiles.fire(tip, new T.Vector3().subVectors(g.enemies.ctx.playerEye, tip), 15, 14, w);
    const hp0 = w.health;
    for (let i = 0; i < 240; i++) {
      const orb = g.enemies.projectiles.orbs.find(o => o.active && o.team === 'enemy');
      if (orb && orb.mesh.position.distanceTo(g.enemies.ctx.playerEye) < 2.2) p.combat.parryTimer = 0.18;
      g.step(1 / 60);
    }
    return { ok: g.enemies.projectiles.reflections === 1 && w.health <= hp0 - 34 && p.combat.health === 100,
      detail: `reflections=${g.enemies.projectiles.reflections} wizard hp ${hp0}→${w.health} player=${p.combat.health}` };
  });
  await run('dodging through an orb takes no damage', () => {
    const { g, T, reset, spawn, freeze } = window.__et;
    const p = reset();
    const w = freeze(spawn('wizard', 12));
    const tip = w.staffTip(new T.Vector3());
    g.enemies.projectiles.fire(tip, new T.Vector3().subVectors(g.enemies.ctx.playerEye, tip), 15, 14, w);
    for (let i = 0; i < 180; i++) { p.controller.dashTimer = 0.2; p.controller.velocity.set(0, 0, 0); g.step(1 / 60); }
    return { ok: p.combat.health === 100 && p.combat.momentum.value >= 15, detail: `hp=${p.combat.health} momentum=${p.combat.momentum.value}` };
  });
  await run('hitting a casting wizard interrupts it', () => {
    const { g, reset, spawn, hit } = window.__et;
    const p = reset();
    const w = spawn('wizard', 12);
    w.perception.alert(p.controller.position);
    for (let i = 0; i < 600 && w.state !== 'cast'; i++) g.step(1 / 60);
    const casting = w.state === 'cast' && g.enemies.tokens.holds(w);
    hit(w, 11, 'light', [0, 0, -1], { stagger: 0.1 });
    g.step(1 / 60);
    return { ok: casting && w.state === 'staggered' && w.spell === null && !g.enemies.tokens.holds(w), detail: `state=${w.state}` };
  });

  // --- spells against enemies ------------------------------------------------
  await run('violet well pulls enemies inward', () => {
    const { g, T, reset, spawn, freeze } = window.__et;
    const p = reset();
    const k = freeze(spawn('knight', 9, 3));
    p.spells.collect('violet-well'); p.spells.book.select('violet-well');
    p.combat.momentum.value = 100;
    p.spells.cast();
    const well = p.spells.fields[0].mesh.position.clone();
    const d0 = Math.hypot(k.position.x - well.x, k.position.z - well.z);
    g.step(3.2);
    const d1 = Math.hypot(k.position.x - well.x, k.position.z - well.z);
    return { ok: d1 < d0 - 0.3 && k.health < k.maxHealth, detail: `distance ${d0.toFixed(2)}→${d1.toFixed(2)} hp=${k.health.toFixed(0)}` };
  });

  // --- lifecycle -------------------------------------------------------------
  await run('death dissolves and removes the enemy', () => {
    const { g, reset, spawn, freeze, hit } = window.__et;
    reset();
    const k = freeze(spawn('knight', 4));
    const r = hit(k, 999, 'heavy', [0, 0, -1]);
    const inactive = !k.collider.active;
    g.step(0.75);
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
    const enc = g.enemies.encounters.find(e => e.def.id === 'graveyard-vigil');
    const p = reset(0, enc.def.trigger.x + 2, enc.def.trigger.z + 2);
    p.combat.health = 50;
    g.step(0.1);
    const first = enc.state === 'active' ? enc.living.length : -1;
    g.step(1.5);
    for (const e of enc.living) hit(e, 999, 'heavy', [0, 0, -1]);
    g.step(4);
    const second = enc.wave === 1 ? enc.enemies.filter(e => e.alive).length : -1;
    g.step(1.2);
    for (const e of enc.living) hit(e, 999, 'heavy', [0, 0, -1]);
    g.step(4);
    return { ok: first === 2 && second === 2 && enc.state === 'cleared' && p.combat.health > 50,
      detail: `wave1=${first} wave2=${second} state=${enc.state} hp=${p.combat.health.toFixed(0)}` };
  });
  await run('dying resets an active encounter', () => {
    const { g, reset, hit } = window.__et;
    const enc = g.enemies.encounters.find(e => e.def.id === 'bridge-warden');
    const p = reset(0, enc.def.trigger.x, enc.def.trigger.z);
    g.step(0.2);
    const active = enc.state === 'active' && enc.living.length === 1;
    g.combatWorld.strike(p.combat, { damage: 999, direction: new window.__three.Vector3(0, 0, 1), point: p.controller.position.clone(),
      knockback: 0, stagger: 0, source: 'enemy', kind: 'enemy' });
    g.step(2.5);
    return { ok: active && p.combat.alive && enc.state === 'dormant' && g.enemies.enemies.length === 0,
      detail: `active=${active} state=${enc.state} enemies=${g.enemies.enemies.length}` };
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
