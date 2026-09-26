// Boss suite (Jobs 8, 14): eight animated creature bosses — arenas, cinematic intro,
// phases, whole movesets, real damage, posture, parry windows, Vermilion's flight and
// knockdown, jumpable shockwaves, defeat/reset, gates and the finale.
//
//   npm run bosstest
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs, logicQuery } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { port: 5189, strictPort: false } });
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
  await page.evaluate(() => {
    const g = window.__game;
    g.manual = true;
    /** Puts the player just inside an arena and runs the intro; returns the arena. */
    window.__enter = (id, skipIntro = true) => {
      const L = g.level, p = g.player;
      g.enemies.clear();
      p.combat.reset();
      const def = L.bossArenas.find(a => a.boss.id === id);
      const c = def.center;
      p.controller.teleport(c.x + def.radius - 9, L.heightAt(c.x + def.radius - 9, c.z) + 0.2, c.z, 0);
      L.setViewer(p.controller.position.clone(), true);
      g.step(0.1);
      if (skipIntro) g.step(3.7);
      return g.enemies.arena(id);
    };
    window.__godStep = (seconds) => {
      for (let i = 0; i < seconds * 60; i++) { g.step(1 / 60); if (g.player.combat.health < 50) g.player.combat.health = 100; }
    };
  });
  const run = async (name, fn) => {
    try { const r = await page.evaluate(fn); check(name, r.ok, r.detail ?? ''); } catch (e) { check(name, false, e.message); }
  };

  await run('eight arenas on level, dry ground in their chapters', () => {
    const L = window.__game.level;
    const out = L.bossArenas.map(a => {
      let spread = 0, lowest = Infinity;
      for (let i = 0; i < 24; i++) {
        const b = i / 24 * Math.PI * 2;
        const h = L.heightAt(a.center.x + Math.sin(b) * a.radius * 0.95, a.center.z + Math.cos(b) * a.radius * 0.95);
        spread = Math.max(spread, Math.abs(h - a.center.y)); lowest = Math.min(lowest, h);
      }
      return { id: a.boss.id, chapter: L.atlas.chapterAt(a.center.x, a.center.z), want: a.boss.chapter, spread, lowest };
    });
    return { ok: out.length === 8 && out.every(o => o.chapter === o.want && o.spread < 0.2 && o.lowest > 1), detail: out.map(o => `${o.id}: ch${o.chapter} spread ${o.spread.toFixed(2)}`).join(' | ') };
  });
  await run('entering an arena plays the intro, then seals the fight', () => {
    const g = window.__game;
    const arena = window.__enter('gloomhorn', false);
    const intro = arena.state === 'intro' && g.enemies.intro === arena && g.player.controller.frozen && arena.wallsUp;
    const hurt = arena.boss.applyHit({ damage: 50, direction: new window.__three.Vector3(0, 0, 1), point: arena.boss.position.clone(), knockback: 0, stagger: 0, source: 'player', kind: 'heavy' });
    g.step(3.7);
    const fight = arena.state === 'fight' && !g.player.controller.frozen && g.enemies.intro === null;
    // The walls hold the player in.
    const V = window.__three.Vector3, c = arena.def.center, r = arena.def.radius;
    const wall = g.level.colliders.overlaps(new V(c.x + r, g.level.heightAt(c.x + r, c.z) + 2, c.z), 1);
    return { ok: intro && fight && wall && hurt.damage === 0, detail: `intro=${intro} fight=${fight} wall=${wall} introDamage=${hurt.damage}` };
  });
  const ALL = ['morrow', 'gloomhorn', 'solenne', 'glutton', 'vermilion', 'caddoc', 'hivequeen', 'sovereign'];
  await run('every boss is an animated creature', () => {
    const g = window.__game;
    const out = [];
    for (const a of g.level.bossArenas) {
      const boss = window.__enter(a.boss.id).boss;
      const t0 = boss.model?.mixer?.time ?? 0;
      const clips = new Set();
      for (let i = 0; i < 12 * 60; i++) {
        g.step(1 / 60);
        if (g.player.combat.health < 50) g.player.combat.health = 100;
        const c = boss.model?.current;
        if (c) clips.add(c);
      }
      out.push({ id: a.boss.id, model: !!boss.model, moved: (boss.model?.mixer?.time ?? 0) > t0, clips: clips.size });
    }
    return { ok: out.every(o => o.model && o.moved && o.clips >= 3), detail: out.map(o => `${o.id}:${o.model ? o.clips + ' clips' : 'NO MODEL'}`).join(' ') };
  });
  await run('bosses are hard: an idle player falls to each within a minute', () => {
    const g = window.__game;
    const out = [];
    for (const id of ['morrow', 'gloomhorn', 'solenne', 'glutton', 'vermilion', 'caddoc', 'hivequeen', 'sovereign']) {
      const arena = window.__enter(id);
      const p = g.player;
      const c = arena.def.center;
      p.controller.teleport(c.x + 6, g.level.heightAt(c.x + 6, c.z) + 0.2, c.z, 0);
      let t = 0, biggest = 0, last = p.combat.health;
      for (; t < 60 * 60 && p.combat.alive; t++) {
        g.step(1 / 60);
        biggest = Math.max(biggest, last - p.combat.health);
        last = p.combat.health;
      }
      out.push({ id, dead: !p.combat.alive, s: t / 60, biggest });
      p.combat.reset();
      g.step(3);
    }
    return { ok: out.every(o => o.dead && o.s < 45), detail: out.map(o => `${o.id}:${o.dead ? o.s.toFixed(0) + 's' : 'SURVIVED'} max ${o.biggest.toFixed(0)}`).join(' ') };
  });
  for (const id of ALL) {
    await run(`${id} uses its whole moveset across its phases`, `(() => {
      const g = window.__game;
      const arena = window.__enter('${id}');
      const boss = arena.boss;
      const phases = new Set([boss.phase]);
      const thresholds = boss.def.phases;
      for (let k = 0; k <= thresholds.length; k++) {
        if (k > 0) boss.health = boss.maxHealth * (thresholds[k - 1] - 0.02);
        for (let i = 0; i < 60 * 60; i++) {
          // Alternate between pressing in close and hanging back so range-bound moves come up.
          if (i % 360 === 0) {
            const pc = g.player.controller, c = arena.def.center;
            const near = (i / 360) % 2 === 0;
            const a = Math.random() * Math.PI * 2, r = near ? 4 : arena.def.radius * 0.7;
            const x = near ? boss.position.x + Math.sin(a) * r : c.x + Math.sin(a) * r, z = near ? boss.position.z + Math.cos(a) * r : c.z + Math.cos(a) * r;
            const off = Math.hypot(x - c.x, z - c.z), lim = arena.def.radius * 0.8;
            const f = off > lim ? lim / off : 1;
            const px = c.x + (x - c.x) * f, pz = c.z + (z - c.z) * f;
            pc.teleport(px, g.level.heightAt(px, pz) + 0.2, pz, 0);
          }
          g.player.combat.maxHealth = 1e6;
          g.player.combat.health = 1e6;
          g.step(1 / 60);
          if (!g.player.combat.alive) break;
          if (boss.state === 'staggered') boss.staggerTimer = 0;
        }
        phases.add(boss.phase);
      }
      g.player.combat.maxHealth = 100; g.player.combat.health = 100;
      const used = new Set(boss.history);
      const all = boss.moveIds();
      const missing = all.filter(m => !used.has(m));
      return { ok: phases.size === thresholds.length + 1 && missing.length <= 1, detail: 'phases ' + [...phases].join(',') + ' · used ' + used.size + '/' + all.length + (missing.length ? ' missing ' + missing.join(',') : '') };
    })()`);
  }
  await run('phase changes roar and resist damage', () => {
    const g = window.__game;
    const arena = window.__enter('sovereign');
    const boss = arena.boss;
    boss.health = boss.maxHealth * 0.55;
    g.step(1 / 60);
    const r = boss.applyHit({ damage: 40, direction: new window.__three.Vector3(0, 0, -1), point: boss.position.clone(), knockback: 0, stagger: 0, source: 'player', kind: 'light' });
    return { ok: boss.phase === 1 && r.damage === 10, detail: `phase=${boss.phase} damage during roar=${r.damage}` };
  });
  await run('posture breaks into a long stun', () => {
    const g = window.__game;
    const boss = window.__enter('gloomhorn').boss;
    let broke = false;
    for (let i = 0; i < 20 && !broke; i++) {
      boss.applyHit({ damage: 30, direction: new window.__three.Vector3(0, 0, -1), point: boss.position.clone(), knockback: 0, stagger: 0.5, source: 'player', kind: 'heavy' });
      broke = boss.state === 'staggered' && boss.staggerTimer > 2.5;
    }
    g.step(1 / 60);
    return { ok: broke && boss.exposed > 0, detail: `staggered=${boss.state} exposed=${boss.exposed.toFixed(1)}` };
  });
  await run('the boss bar tracks the fight', () => {
    const g = window.__game;
    const arena = window.__enter('gloomhorn');
    arena.boss.health = arena.boss.maxHealth * 0.4;
    g.manual = true;
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      const hud = document.querySelector('.boss-hud');
      const fill = hud.querySelector('.boss-bar i').style.transform;
      resolve({ ok: hud.classList.contains('shown') && /Gloomhorn/.test(hud.textContent) && fill.includes('0.4'), detail: `${hud.className} ${fill}` });
    })));
  });
  await run('parrying a telegraphed blow staggers the boss', () => {
    const g = window.__game;
    const arena = window.__enter('sovereign');
    const boss = arena.boss;
    const ctx = g.enemies.ctx;
    const p = g.player;
    // Stand in front, let it wind up Sever, parry at the tell.
    p.controller.teleport(boss.position.x, boss.position.y + 0.2, boss.position.z + 5, 0);
    boss.facing = Math.PI;
    boss.startMove('sever', ctx);
    let parried = false;
    for (let i = 0; i < 120 && !parried; i++) {
      if (boss.current && boss.moveTime > 0.58 && boss.moveTime < 0.66) p.combat.parryTimer = 0.18;
      g.step(1 / 60);
      parried = boss.state === 'staggered' && boss.exposed > 0;
    }
    return { ok: parried && p.combat.health === 100, detail: `state=${boss.state} exposed=${boss.exposed.toFixed(1)} hp=${p.combat.health}` };
  });
  await run('a parried fireball knocks Vermilion out of the sky', () => {
    const g = window.__game;
    const arena = window.__enter('vermilion');
    const boss = arena.boss;
    const ctx = g.enemies.ctx;
    const p = g.player;
    boss.airborne = true; boss.collider.active = false;
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    boss.startMove('fireballs', ctx);
    const hp0 = boss.health;
    let knocked = false;
    for (let i = 0; i < 360 && !knocked; i++) {
      const orb = g.enemies.projectiles.orbs.find(o => o.active && o.team === 'enemy' && o.kind === 'fire');
      if (orb && orb.mesh.position.distanceTo(ctx.playerEye) < 3) p.combat.parryTimer = 0.18;
      g.step(1 / 60);
      if (p.combat.health < 50) p.combat.health = 100;
      knocked = boss.knockdowns > 0;
    }
    return { ok: knocked && !boss.airborne && boss.health < hp0, detail: `knockdowns=${boss.knockdowns} airborne=${boss.airborne} damage=${(hp0 - boss.health).toFixed(0)}` };
  });
  await run('shockwaves can be jumped', () => {
    const g = window.__game, T = window.__three;
    const arena = window.__enter('gloomhorn');
    const boss = arena.boss;
    boss.presenting = true; // hold still
    const p = g.player;
    const hz = g.enemies.hazards;
    const center = boss.position.clone();
    // Standing: caught.
    hz.hitsTaken = 0;
    p.controller.teleport(center.x + 10, g.level.heightAt(center.x + 10, center.z) + 0.05, center.z, 0);
    g.step(0.1);
    hz.shockwave(center, 14, 20, 18, 0xffffff);
    g.step(1.2);
    const standing = hz.hitsTaken;
    // Jumping as it arrives: cleared.
    hz.hitsTaken = 0;
    p.combat.reset();
    p.controller.teleport(center.x + 10, g.level.heightAt(center.x + 10, center.z) + 0.05, center.z, 0);
    g.step(0.1);
    hz.shockwave(center, 14, 20, 18, 0xffffff);
    for (let i = 0; i < 72; i++) {
      if (i === 30) { g.input.down.add('Space'); g.input.pressedSet.add('Space'); }
      g.step(1 / 60);
    }
    g.input.clear();
    return { ok: standing === 1 && hz.hitsTaken === 0, detail: `standing hits=${standing} jumping hits=${hz.hitsTaken}` };
  });
  await run('dying resets the arena for another attempt', () => {
    const g = window.__game, T = window.__three;
    const arena = window.__enter('gloomhorn');
    arena.boss.health = 300;
    const attempts = arena.attempts;
    g.combatWorld.strike(g.player.combat, { damage: 999, direction: new T.Vector3(0, 0, 1), point: g.player.controller.position.clone(), knockback: 0, stagger: 0, source: 'enemy', kind: 'enemy' });
    g.step(0.2);
    const reset = arena.state === 'idle' && !arena.wallsUp && arena.boss === null;
    g.step(2.5); // respawn at the shrine
    const again = window.__enter('gloomhorn');
    return { ok: reset && again.boss.health === again.boss.maxHealth && again.attempts === attempts + 1, detail: `reset=${reset} fresh hp=${again.boss.health}` };
  });
  await run('felling a boss records it and opens its gate', () => {
    const g = window.__game, T = window.__three, L = g.level;
    // Chapter II: clear three camps first — the gate must still wait for Gloomhorn.
    for (const c of L.encounters.filter(e => e.id.startsWith('camp:c2-')).slice(0, 3)) g.progress.clear(c.id);
    const gate = L.gates.gateFor(2);
    L.update(1 / 60, 0);
    const waiting = !gate.open && /Gloomhorn/.test(L.gates.blocker(gate) ?? '');
    const arena = window.__enter('gloomhorn');
    const titles = [];
    const prev = g.gameHud.announce.bind(g.gameHud);
    g.gameHud.announce = (t, s) => { titles.push(t); prev(t, s); };
    arena.boss.applyHit({ damage: 99999, direction: new T.Vector3(0, 0, -1), point: arena.boss.position.clone(), knockback: 0, stagger: 0, source: 'player', kind: 'heavy' });
    g.step(0.2);
    L.update(1 / 60, 0);
    g.gameHud.announce = prev;
    return { ok: waiting && arena.state === 'defeated' && g.progress.bosses.has('gloomhorn') && gate.open && !arena.wallsUp && titles.includes('GREAT FOE FELLED'),
      detail: `waited=${waiting} state=${arena.state} gate=${gate.open} titles=${titles.join(',')}` };
  });
  await run('the Pale Sovereign ends the long night', () => {
    const g = window.__game, T = window.__three;
    const arena = window.__enter('sovereign');
    arena.boss.applyHit({ damage: 99999, direction: new T.Vector3(0, 0, -1), point: arena.boss.position.clone(), knockback: 0, stagger: 0, source: 'player', kind: 'heavy' });
    g.step(0.2);
    g.level.update(1 / 60, 0);
    return { ok: g.finale && g.progress.bosses.has('sovereign') && g.level.dawnspire.chainBroken, detail: `finale=${g.finale} chain broken=${g.level.dawnspire.chainBroken}` };
  });
} finally {
  await browser?.close();
  await server.close();
}
console.log(`${total - failures.length}/${total} passed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
