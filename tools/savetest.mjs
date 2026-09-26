// Narrative, Ember Shrine and save-system suite (Job 9): shrine and lore placement, the
// use prompt, kindling and resting, fast travel, respawning at the last shrine, lore and
// the journal, the Wanderer, remembrances, and the localStorage save round trip.
//
//   npm run savetest
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs, logicQuery } from './browser.mjs';

const SAVE_KEY = 'chromatic-odyssey.save.v1';
const server = await createServer({ logLevel: 'error', server: { port: 5191, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
let browser;
const failures = [];
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  if (!ok) failures.push(name);
};

/** Helpers installed in every page load. */
const helpers = () => {
  const g = window.__game;
  g.manual = true;
  const V = window.__three.Vector3;
  window.__at = (x, z, yaw = 0) => {
    const p = g.player;
    p.combat.reset();
    p.controller.teleport(x, g.level.heightAt(x, z) + 0.2, z, yaw);
    g.level.setViewer(new V(x, 10, z), true);
    g.step(0.2);
  };
  window.__press = code => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    g.step(1 / 60);
  };
  window.__shrine = id => g.level.story.shrine(id);
  window.__closeAll = () => { g.storyUI.close(false); g.worldMap.close(false); g.spellbookUI.close(false); };
};

const load = async (page, query) => {
  await page.goto(`${base}?shot=1&frames=4${logicQuery}${query}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  const error = await page.evaluate(() => window.__error);
  if (error) throw new Error(error);
  await page.evaluate(helpers);
};

try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => failures.push(`pageerror: ${e.message}`));
  const run = async (name, fn, arg) => {
    try {
      const r = await page.evaluate(fn, arg);
      check(name, r.ok, r.detail ?? '');
    } catch (e) { check(name, false, e.message); }
  };

  // --- placement ------------------------------------------------------------------
  await load(page, '');
  await page.evaluate(key => localStorage.removeItem(key), SAVE_KEY);
  await run('an Ember Shrine where every biome begins, beside the road', () => {
    const g = window.__game, S = g.level.story, A = g.level.atlas;
    const far = [], wet = [];
    S.shrines.forEach(s => {
      const d = A.road.nearest(s.position.x, s.position.z).d;
      if (d > 30) far.push(`${s.id}:${d.toFixed(0)}`);
      if (s.position.y < 1 || g.level.heightAt(s.rest.x, s.rest.z) < 0.5) wet.push(s.id);
    });
    const ids = new Set(S.shrines.map(s => s.id));
    const perSite = A.sites.every(s => s.index === 0 ? ids.has('hollowmere') : ids.has(s.id));
    return { ok: S.shrines.length === 40 && ids.size === 40 && perSite && !far.length && !wet.length, detail: `shrines=${S.shrines.length} far=[${far}] wet=[${wet}]` };
  });
  await run('only Hollowmere burns at the start', () => {
    const g = window.__game, S = g.level.story;
    const lit = S.shrines.filter(s => s.prop.kindled).map(s => s.id);
    return { ok: lit.length === 1 && lit[0] === 'hollowmere' && g.progress.kindled.has('hollowmere') && !g.resumed, detail: `lit=${lit}` };
  });
  await run('a lore tablet for every fragment and a memorial per chapter', () => {
    const S = window.__game.level.story;
    const tablets = S.lore.filter(l => l.kind === 'tablet'), memorials = S.lore.filter(l => l.kind === 'memorial');
    const chapters = new Set(memorials.map(m => m.fragment.chapter));
    const ids = new Set(S.lore.map(l => l.id));
    return { ok: tablets.length === 40 && memorials.length === 8 && chapters.size === 8 && ids.size === 48, detail: `tablets=${tablets.length} memorials=${memorials.length}` };
  });
  await run('story props keep clear of each other', () => {
    const S = window.__game.level.story;
    const pts = [...S.shrines.map(s => ({ id: s.id, p: s.position })), ...S.lore.map(l => ({ id: l.id, p: l.position }))];
    const close = [];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        if (Math.hypot(pts[i].p.x - pts[j].p.x, pts[i].p.z - pts[j].p.z) < 3) close.push(`${pts[i].id}/${pts[j].id}`);
    return { ok: close.length === 0, detail: close.length ? close.join(' ') : `${pts.length} props spaced ≥ 3 m` };
  });
  await run('screenshot mode never writes the save', () => {
    const g = window.__game;
    const wrote = g.saveNow();
    return { ok: !wrote && localStorage.getItem('chromatic-odyssey.save.v1') === null && !g.save.enabled, detail: `wrote=${wrote}` };
  });

  // --- shrines ----------------------------------------------------------------------
  await run('an unlit shrine offers to be kindled', () => {
    const g = window.__game, s = window.__shrine('c1-1');
    window.__at(s.rest.x, s.rest.z);
    const c = g.interactions.current;
    const prompt = document.querySelector('.page-prompt');
    g.step(1 / 60);
    return { ok: c?.kind === 'shrine' && c.shrine === s && g.interactions.prompt() === 'F · Kindle the Ember Shrine', detail: `${c?.kind} "${g.interactions.prompt()}" hud="${prompt?.textContent}"` };
  });
  await run('F kindles the shrine, heals, sets the respawn point and opens the rest menu', () => {
    const g = window.__game, s = window.__shrine('c1-1');
    g.player.combat.health = 35;
    window.__press('KeyF');
    const ok = s.prop.kindled && g.progress.kindled.has('c1-1') && g.player.combat.health === 100 && g.restShrine === 'c1-1'
      && g.storyUI.mode === 'rest' && g.menuOpen && g.level.story.lightAnchors().length === 1;
    const text = g.storyUI.dialog.textContent;
    return { ok: ok && text.includes(s.name) && text.includes('Hollowmere'), detail: `mode=${g.storyUI.mode} hp=${g.player.combat.health} lit=${s.prop.kindled}` };
  });
  await run('a lit shrine offers rest instead', () => {
    const g = window.__game;
    window.__closeAll();
    g.step(1 / 60);
    return { ok: g.interactions.prompt().startsWith('F · Rest at the Ember Shrine'), detail: g.interactions.prompt() };
  });
  await run('fast travel to a kindled shrine', () => {
    const g = window.__game, s = window.__shrine('c1-1');
    window.__at(g.level.testSite.x, g.level.testSite.z);
    g.restAt(window.__shrine('hollowmere'));
    const button = g.storyUI.dialog.querySelector('[data-shrine="c1-1"]');
    const unlit = g.storyUI.dialog.querySelector('[data-shrine="c1-2"]');
    button?.click();
    const p = g.player.controller.position;
    const d = Math.hypot(p.x - s.rest.x, p.z - s.rest.z);
    return { ok: !!button && !unlit && !g.storyUI.mode && d < 1 && g.restShrine === 'c1-1', detail: `d=${d.toFixed(2)} restShrine=${g.restShrine}` };
  });
  await run('death returns you to the last shrine', () => {
    const g = window.__game, s = window.__shrine('c1-1');
    window.__at(s.rest.x + 40, s.rest.z + 40);
    const before = g.deaths;
    const V = window.__three.Vector3;
    g.player.combat.applyHit({ damage: 999, direction: new V(0, 0, 1), point: g.player.controller.position.clone(), knockback: 0, stagger: 0, source: 'enemy', kind: 'hazard' });
    const died = !g.player.combat.alive;
    g.step(2.4);
    const p = g.player.controller.position;
    const d = Math.hypot(p.x - s.rest.x, p.z - s.rest.z);
    return { ok: died && g.player.combat.alive && d < 1.5 && g.deaths === before + 1, detail: `died=${died} d=${d.toFixed(2)} deaths=${g.deaths}` };
  });
  await run('the ember will not answer mid-fight', () => {
    const g = window.__game, s = window.__shrine('c1-1');
    window.__closeAll();
    const enc = g.enemies.encounters[0];
    const was = enc.state;
    enc.state = 'active';
    const rested = g.restAt(s);
    const why = g.restBlocker();
    enc.state = was;
    return { ok: !rested && !g.storyUI.mode && why.includes('enemies'), detail: why };
  });

  // --- lore -------------------------------------------------------------------------
  await run('a lore tablet can be read and is remembered', () => {
    const g = window.__game;
    window.__closeAll();
    const spot = g.level.story.lore.find(l => l.id === 'c1-0');
    window.__at(spot.position.x + 1.2, spot.position.z);
    const before = g.interactions.prompt();
    const kind = g.interactions.current?.kind;
    window.__press('KeyF');
    const title = g.storyUI.dialog.querySelector('h1')?.textContent;
    const ok = kind === 'lore' && before.includes('✦') && g.storyUI.mode === 'reader' && title === spot.fragment.title && g.progress.lore.has('c1-0');
    window.__closeAll();
    g.step(1 / 60);
    return { ok: ok && !g.interactions.prompt().includes('✦'), detail: `${kind} "${before}" title="${title}" after="${g.interactions.prompt()}"` };
  });
  await run('the kneeling dead can be looked at', () => {
    const g = window.__game;
    const spot = g.level.story.lore.find(l => l.kind === 'memorial' && l.fragment.chapter === 2);
    window.__at(spot.position.x + 1.4, spot.position.z);
    const prompt = g.interactions.prompt();
    window.__press('KeyF');
    const text = g.storyUI.dialog.textContent;
    const ok = prompt.startsWith('F · Look closer') && g.storyUI.mode === 'reader' && text.includes('KNEELING DEAD') && g.progress.lore.has(spot.id);
    window.__closeAll();
    return { ok, detail: `"${prompt}"` };
  });
  await run('the journal (J) gathers chapters, fragments and gaps', () => {
    const g = window.__game;
    window.__at(g.level.testSite.x, g.level.testSite.z);
    g.progress.discover('c1-0');
    window.__press('KeyJ');
    const d = g.storyUI.dialog;
    const arcs = [...d.querySelectorAll('.journal-arc h2')].map(h => h.textContent);
    const text = d.textContent;
    const ok = g.storyUI.mode === 'journal' && g.menuOpen && arcs.some(a => a.includes('Tranquil Reach')) && !arcs.some(a => a.includes('Frozen Choir'))
      && text.includes('Watchman') && text.includes('An unread fragment') && text.includes('Remembrances');
    window.__press('KeyJ');
    return { ok: ok && !g.storyUI.mode, detail: `arcs=${arcs.length} mode after J=${g.storyUI.mode}` };
  });

  // --- the Wanderer -------------------------------------------------------------------
  await run('the Wanderer speaks, and changes with the journey', () => {
    const g = window.__game;
    const w = g.level.wanderer.position;
    window.__at(w.x + 1.6, w.z);
    const kind = g.interactions.current?.kind;
    const prompt = g.interactions.prompt();
    window.__press('KeyF');
    const first = g.storyUI.dialog.querySelector('p')?.textContent ?? '';
    const cite = g.storyUI.dialog.querySelector('cite')?.textContent ?? '';
    window.__closeAll();
    g.progress.fellBoss('gloomhorn');
    const later = g.wandererLine();
    g.finale = true;
    const last = g.wandererLine();
    g.finale = false;
    g.progress.bosses.delete('gloomhorn');
    const ok = kind === 'wanderer' && prompt === 'F · Speak with the Wanderer' && cite.includes('Wanderer')
      && first.includes('kindled a shrine') && later.includes('colossus') && last.includes('silver');
    return { ok, detail: `kind=${kind} first="${first.slice(0, 40)}…"` };
  });
  await run('a felled boss leaves a remembrance', () => {
    const g = window.__game;
    g.enemies.onBossDefeated({ def: { boss: { id: 'vermilion', name: 'Vermilion', epithet: 'the Red Hour' } } });
    return { ok: g.progress.remembrances.has('rem-vermilion') && g.progress.bosses.has('vermilion'), detail: [...g.progress.remembrances].join(',') };
  });

  // --- saving -----------------------------------------------------------------------
  await load(page, '&save=1');
  await run('a new journey with saving enabled', () => {
    const g = window.__game;
    return { ok: g.save.enabled && !g.resumed && localStorage.getItem('chromatic-odyssey.save.v1') === null, detail: `enabled=${g.save.enabled}` };
  });
  await run('resting writes the save', () => {
    const g = window.__game, s = window.__shrine('c2-1');
    window.__at(s.rest.x, s.rest.z);
    g.player.spells.collect('comet-lance');
    g.player.spells.book.select('comet-lance');
    g.progress.clear('camp:c1-0:0');
    g.progress.readLore('c1-3');
    g.progress.fellBoss('gloomhorn');
    g.progress.remember('rem-gloomhorn');
    g.deaths = 3;
    g.playTime = 754;
    window.__press('KeyF');
    window.__closeAll();
    const data = JSON.parse(localStorage.getItem('chromatic-odyssey.save.v1') ?? 'null');
    const ok = data && data.version === 1 && data.shrine === 'c2-1' && data.pages.includes('comet-lance') && data.selected === 'comet-lance'
      && data.progress.kindled.includes('c2-1') && data.progress.bosses.includes('gloomhorn') && data.deaths === 3;
    return { ok, detail: data ? `shrine=${data.shrine} pages=${data.pages.length}` : 'no save' };
  });
  await run('autosave follows progress', async () => {
    const g = window.__game;
    g.progress.discover('c3-2');
    // The debounce runs on real frames; wait for it.
    await new Promise(r => setTimeout(r, 2600));
    const data = JSON.parse(localStorage.getItem('chromatic-odyssey.save.v1') ?? 'null');
    return { ok: !!data?.progress.discovered.includes('c3-2'), detail: `discovered=${data?.progress.discovered.length}` };
  });

  await load(page, '&save=1');
  await run('reloading resumes the journey', () => {
    const g = window.__game, s = window.__shrine('c2-1');
    const p = g.player.controller.position;
    const d = Math.hypot(p.x - s.rest.x, p.z - s.rest.z);
    const camp = g.enemies.encounters.find(e => e.def.id === 'camp:c1-0:0');
    const arena = g.enemies.arenas.find(a => a.id === 'gloomhorn');
    const ok = g.resumed && d < 1.5 && s.prop.kindled && window.__shrine('c1-1').prop.kindled === false
      && g.player.spells.book.has('comet-lance') && g.player.spells.book.selected === 'comet-lance'
      && g.progress.lore.has('c1-3') && g.progress.remembrances.has('rem-gloomhorn') && g.progress.discovered.has('c3-2')
      && (!camp || camp.state === 'cleared') && arena?.state === 'defeated' && g.deaths === 3 && g.playTime >= 754 && g.restShrine === 'c2-1';
    return { ok, detail: `resumed=${g.resumed} d=${d.toFixed(2)} camp=${camp?.state} arena=${arena?.state} deaths=${g.deaths}` };
  });
  await run('the rest menu summarises the journey', () => {
    const g = window.__game;
    g.restAt(window.__shrine('c2-1'));
    const text = g.storyUI.dialog.querySelector('.story-summary')?.textContent ?? '';
    return { ok: text.includes('12 min') && text.includes('3 deaths') && text.includes('1 / 8 great foes'), detail: text.replace(/\n/g, ' | ') };
  });

  await load(page, '&save=1&fresh=1');
  await run('fresh=1 ignores the save', () => {
    const g = window.__game;
    return { ok: !g.resumed && !g.player.spells.book.has('comet-lance') && localStorage.getItem('chromatic-odyssey.save.v1') !== null, detail: `resumed=${g.resumed}` };
  });

  // Leaving a page saves it (pagehide); stop this one first so the corrupt value survives.
  await page.evaluate(key => { window.__game.resetting = true; localStorage.setItem(key, '{"version":1,"progress":'); }, SAVE_KEY);
  await load(page, '&save=1');
  await run('a corrupt save is ignored safely', () => {
    const g = window.__game;
    return { ok: !g.resumed && g.restShrine === 'hollowmere', detail: `resumed=${g.resumed}` };
  });

  // Begin anew: a real save, then the confirm flow reloads into a fresh journey.
  await run('begin anew asks first', () => {
    const g = window.__game;
    g.restAt(window.__shrine('hollowmere'));
    g.storyUI.dialog.querySelector('[data-action="reset"]').click();
    const alert = g.storyUI.dialog.querySelector('.story-reset[role="alert"]');
    const saved = localStorage.getItem('chromatic-odyssey.save.v1') !== null;
    return { ok: !!alert && saved && g.storyUI.mode === 'rest', detail: `alert=${!!alert} saved=${saved}` };
  });
  await Promise.all([
    page.waitForNavigation({ timeout: 60000 }),
    page.evaluate(() => window.__game.storyUI.dialog.querySelector('[data-action="reset-confirm"]').click()),
  ]);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  await page.evaluate(helpers);
  await run('begin anew clears the save and restarts', () => {
    const g = window.__game;
    return { ok: !g.resumed && localStorage.getItem('chromatic-odyssey.save.v1') === null, detail: `resumed=${g.resumed}` };
  });
  await page.evaluate(key => localStorage.removeItem(key), SAVE_KEY);
} catch (e) {
  failures.push(`harness: ${e.stack ?? e}`);
  console.log(e);
} finally {
  await browser?.close();
  await server.close();
}

console.log(`\n${total - failures.filter(f => !f.startsWith('pageerror') && !f.startsWith('harness')).length}/${total} passed`);
if (failures.length) {
  console.log('Failures:', failures.join('; '));
  process.exit(1);
}
