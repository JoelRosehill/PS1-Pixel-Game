// Audio, menus, settings and HUD suite (Job 10): the title screen, the procedural score
// (rendered offline and live), every sound effect, gameplay sound hooks, music state,
// pause and settings menus, key rebinding, compass, save indicator, the ending card and
// pixel bloom.
//
//   npm run uitest
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs, logicQuery } from './browser.mjs';

const SAVE_KEY = 'chromatic-odyssey.save.v1';
const SETTINGS_KEY = 'chromatic-odyssey.settings.v1';
const server = await createServer({ logLevel: 'error', server: { port: 5192, strictPort: false } });
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

const helpers = () => {
  const g = window.__game;
  g.manual = true;
  const V = window.__three.Vector3;
  window.__at = (x, z, yaw = 0) => {
    const p = g.player;
    p.combat.reset();
    p.controller.teleport(x, g.level.heightAt(x, z) + 0.2, z, yaw);
    p.camera.setYaw(yaw, 0);
    g.level.setViewer(new V(x, 10, z), true);
    g.step(0.2);
  };
  window.__key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  // Edges are consumed by rendered frames; synchronous steps must consume them explicitly.
  window.__press = code => { window.__key(code); g.step(1 / 60); g.input.endFrame(); window.__key(code, 'keyup'); g.step(1 / 60); g.input.endFrame(); };
  window.__frames = n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
};

const load = async (page, query) => {
  await page.goto(`${base}?shot=1&frames=3${query}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  const error = await page.evaluate(() => window.__error);
  if (error) throw new Error(error);
  await page.evaluate(helpers);
};

try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs(['--autoplay-policy=no-user-gesture-required']) });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => failures.push(`pageerror: ${e.message}`));
  const run = async (name, fn, arg) => {
    try {
      const r = await page.evaluate(fn, arg);
      check(name, r.ok, r.detail ?? '');
    } catch (e) { check(name, false, e.message); }
  };

  await load(page, `${logicQuery}`);
  await page.evaluate((a, b) => { localStorage.removeItem(a); localStorage.removeItem(b); }, SAVE_KEY, SETTINGS_KEY);

  // --- the score and effects, rendered offline ---------------------------------------
  await run('every mood renders an audible, unclipped loop', async () => {
    const { Music, MOODS, FINALE_MOOD } = await import('/src/audio/Music.ts');
    const out = [];
    let ok = true;
    for (const [mood, intensity] of [...MOODS.map(m => [m, 'explore']), [FINALE_MOOD, 'finale'], [MOODS[5], 'boss'], [MOODS[1], 'combat']]) {
      const ctx = new OfflineAudioContext(2, 44100 * 3, 44100);
      const music = new Music(ctx, ctx.destination);
      music.mood = mood; music.intensity = intensity;
      music.start(0);
      music.schedule(0, 2.8);
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      let sum = 0, peak = 0;
      for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
      const rms = Math.sqrt(sum / d.length);
      out.push(`${mood.id}/${intensity}:${rms.toFixed(3)}/${peak.toFixed(2)}`);
      if (rms < 0.01 || peak >= 1 || music.notes < 8) ok = false;
    }
    return { ok, detail: out.join(' ') };
  });
  await run('every sound effect renders audibly without clipping', async () => {
    const { SFX } = await import('/src/audio/Sfx.ts');
    const bad = [];
    const names = Object.keys(SFX);
    for (const name of names) {
      const kinds = name === 'cast' ? ['burst', 'projectile', 'frost', 'field', 'blink', 'launch', 'ward', 'heal'] : [''];
      for (const kind of kinds) {
        const ctx = new OfflineAudioContext(1, 44100 * 2.5, 44100);
        SFX[name](ctx, ctx.destination, 0.01, { strength: 1, pan: 0, kind });
        const d = (await ctx.startRendering()).getChannelData(0);
        let peak = 0;
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
        if (peak < 0.005 || peak >= 1) bad.push(`${name}${kind ? ':' + kind : ''}=${peak.toFixed(3)}`);
      }
    }
    return { ok: bad.length === 0 && names.length >= 30, detail: bad.length ? bad.join(' ') : `${names.length} effects` };
  });

  // --- title screen and live audio --------------------------------------------------------
  await load(page, `${logicQuery}&title=1&audio=1`);
  await run('the title screen opens paused, offering a first journey', () => {
    const g = window.__game;
    const d = g.menu.dialog;
    const first = d.querySelector('[data-autofocus]');
    return { ok: g.menu.screen === 'title' && g.menuOpen && d.open && !d.querySelector('[data-action="continue"]') && first?.dataset.action === 'new' && document.activeElement === first,
      detail: `screen=${g.menu.screen} focus=${document.activeElement?.textContent}` };
  });
  await run('the version shows on the title screen and menus only', () => {
    const g = window.__game;
    const onTitle = document.querySelector('.menu-version')?.textContent ?? '';
    const box = document.querySelector('.menu-version')?.getBoundingClientRect();
    const corner = !!box && box.right > innerWidth - 40 && box.bottom > innerHeight - 40;
    g.menu.open('settings');
    const inSettings = !!g.menu.dialog.querySelector('.menu-version');
    g.menu.show('title');
    return { ok: /^v\d+\.\d+\.\d+(-dev)?$/.test(onTitle) && corner && inSettings, detail: `${onTitle} corner=${corner}` };
  });
  await run('beginning starts the score', async () => {
    const g = window.__game;
    g.menu.dialog.querySelector('[data-action="new"]').click();
    // Music changes land on the next bar line.
    for (let i = 0; i < 40 && g.audio.music?.intensity !== 'explore'; i++) await new Promise(r => setTimeout(r, 200));
    const m = g.audio.music;
    return { ok: !g.menu.screen && g.audio.running && m && m.notes > 4 && m.intensity === 'explore', detail: `state=${g.audio.ctx?.state} notes=${m?.notes} intensity=${m?.intensity}` };
  });

  // --- sound hooks -----------------------------------------------------------------------
  await run('movement, sword and spells make sounds', async () => {
    const g = window.__game, c = g.audio.counts, p = g.player;
    window.__at(6, 30);
    const before = { ...c };
    // Dash in the air: on the ground, Shift standing still channels Momentum instead.
    window.__press('Space'); g.step(0.2);
    window.__press('ShiftLeft'); g.step(1.1);
    const canvas = g.pixel.renderer.domElement;
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    g.step(1 / 60);
    g.input.endFrame();
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    g.step(0.5);
    p.combat.momentum.value = 100;
    window.__press('KeyE'); g.step(0.3);
    p.spells.collect('mend'); g.step(1 / 60);
    const got = n => (c[n] ?? 0) - (before[n] ?? 0);
    const r = { jump: got('jump'), dash: got('dash'), swing: got('swing'), cast: got('cast'), pickup: got('pickup'), land: got('land') };
    return { ok: Object.values(r).every(v => v > 0), detail: r };
  });
  await run('hits, hurts and enemy tells make sounds', () => {
    const g = window.__game, c = g.audio.counts, V = window.__three.Vector3;
    const before = { ...c };
    const target = g.level.enemies[0];
    const hit = (source, kind) => ({ damage: 10, direction: new V(0, 0, 1), point: new V(), knockback: 0, stagger: 0, source, kind });
    g.combatWorld.strike(target, hit('player', 'light'));
    g.combatWorld.strike(g.player.combat, hit('enemy', 'light'));
    g.enemies.telegraphs.circle(g.player.controller.position.clone(), 2, 1, 0xffffff);
    g.enemies.projectiles.fire(new V(0, 5, 0), new V(0, 0, 1), 10, 5, target);
    g.enemies.hazards.shockwave(new V(0, 2, 0), 10, 5, 5, 0xffffff);
    g.step(1 / 60);
    g.enemies.telegraphs.clear(); g.enemies.projectiles.clear(); g.enemies.hazards.clear();
    const got = n => (c[n] ?? 0) - (before[n] ?? 0);
    const r = { hit: got('hit'), hurt: got('hurt'), telegraph: got('telegraph'), enemyShot: got('enemyShot'), shockwave: got('shockwave') };
    g.player.combat.reset();
    return { ok: Object.values(r).every(v => v > 0), detail: r };
  });
  await run('rest, lore and the world announce themselves', () => {
    const g = window.__game, c = g.audio.counts;
    const before = { ...c };
    g.restAt(g.level.story.shrine('threshold'));
    g.storyUI.close(false);
    g.readLore(g.level.story.lore[0]);
    g.storyUI.close(false);
    g.gameHud.announce('TEST');
    const got = n => (c[n] ?? 0) - (before[n] ?? 0);
    const r = { rest: got('rest'), lore: got('lore'), announce: got('announce'), uiOpen: got('uiOpen') };
    return { ok: r.rest > 0 && r.lore > 0 && r.announce > 0, detail: r };
  });
  await run('the score follows the journey', () => {
    const g = window.__game, S = g.sound;
    const explore = S.state();
    const site = g.level.atlas.sites.find(s => s.chapter === 3);
    const lm = g.level.landmarks[g.level.atlas.sites.indexOf(site)];
    window.__at(lm.x + 30, lm.z + 30);
    const coast = S.state();
    window.__at(6, 30);
    g.enemies.clear();
    const enc = g.enemies.encounters[0];
    const was = enc.state;
    enc.state = 'active';
    const combat = S.state();
    enc.state = was;
    const rested = g.restAt(g.level.story.shrine('threshold'));
    const why = g.restBlocker(), mode = g.storyUI.mode, dialogs = [...document.querySelectorAll('dialog[open]')].map(d => d.className);
    const rest = S.state();
    g.storyUI.close(false);
    g.finale = true;
    const fin = S.state();
    g.finale = false;
    const ok = explore.intensity === 'explore' && explore.mood === 0 && coast.mood === 3 && combat.intensity === 'combat' && rest.intensity === 'rest' && fin.mood === 'finale';
    return { ok, detail: `${explore.intensity}/${explore.mood} coast=${coast.mood} ${combat.intensity} ${rest.intensity} ${fin.mood} rested=${rested} why=${why} mode=${mode} open=${dialogs}` };
  });

  // --- pause and settings ----------------------------------------------------------------
  await run('Esc pauses; Resume returns', () => {
    const g = window.__game;
    window.__key('Escape');
    const paused = g.menu.screen === 'pause' && g.menuOpen;
    const labels = [...g.menu.dialog.querySelectorAll('button')].map(b => b.textContent);
    const versionPaused = !!document.querySelector('.menu-version')?.checkVisibility();
    g.menu.dialog.querySelector('[data-action="resume"]').click();
    const versionInPlay = [...document.querySelectorAll('.menu-version')].some(v => v.checkVisibility());
    return { ok: paused && labels.includes('Journal') && labels.includes('Settings') && !g.menu.screen && versionPaused && !versionInPlay,
      detail: `${labels.join('|')} version paused=${versionPaused} in play=${versionInPlay}` };
  });
  await run('display settings apply live', () => {
    const g = window.__game, d = g.menu.dialog;
    g.menu.open('pause');
    d.querySelector('[data-action="settings"]').click();
    d.querySelector('[data-tab="display"]').click();
    const set = (key, value) => { const el = d.querySelector(`[data-setting="${key}"]`); if (el.type === 'checkbox') el.checked = value; else el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set('bands', 4);
    const four = g.pixel.mode.bands.length;
    set('bands', 8);
    const eight = g.pixel.mode.bands.length;
    set('pixelLines', 360);
    set('bloom', 0);
    set('fov', 90);
    set('compass', false);
    set('hints', false);
    const r = { four, eight, lines: g.pixel.settings.baseLines, bloom: g.pixel.settings.bloom, fov: g.player.camera.baseFov, compass: document.querySelector('.compass').hidden };
    set('bands', 6); set('pixelLines', 540); set('bloom', 0.6); set('compass', true); set('hints', true); set('fov', 75);
    return { ok: r.four === 4 && r.eight === 8 && r.lines === 360 && r.bloom === 0 && r.fov === 90 && r.compass && g.pixel.mode.bands.length === 6, detail: r };
  });
  await run('audio and mouse settings apply live', () => {
    const g = window.__game, d = g.menu.dialog;
    d.querySelector('[data-tab="audio"]').click();
    const music = d.querySelector('[data-setting="music"]');
    music.value = '0.2'; music.dispatchEvent(new Event('input', { bubbles: true }));
    const vol = g.audio.volumes.music;
    const label = d.querySelector(`output[for="${music.id}"]`).textContent;
    d.querySelector('[data-tab="controls"]').click();
    const sens = d.querySelector('[data-setting="sensitivity"]');
    sens.value = '2'; sens.dispatchEvent(new Event('input', { bubbles: true }));
    const inv = d.querySelector('[data-setting="invertY"]');
    inv.checked = true; inv.dispatchEvent(new Event('change', { bubbles: true }));
    const r = { vol, label, sens: g.player.camera.sensitivity, inv: g.player.camera.invertY };
    g.menu.dialog.querySelector('[data-action="reset-all"]').click();
    return { ok: vol === 0.2 && label === '20%' && Math.abs(r.sens - 0.0044) < 1e-6 && r.inv && !g.player.camera.invertY, detail: r };
  });
  await run('keys can be rebound, and swap instead of clashing', () => {
    const g = window.__game, d = g.menu.dialog, keys = g.settings.data.keys;
    d.querySelector('[data-tab="controls"]').click();
    d.querySelector('[data-rebind="jump"]').click();
    const prompt = d.querySelector('[data-rebind="jump"]').textContent;
    window.__key('KeyK');
    const jumpKey = keys.jump;
    d.querySelector('[data-rebind="use"]').click();
    window.__key('KeyE');
    const swapped = keys.use === 'KeyE' && keys.cast === 'KeyF';
    g.menu.close(false);
    // K now jumps and Space does nothing.
    window.__at(6, 30);
    const c = g.audio.counts;
    const j0 = c.jump ?? 0;
    window.__press('Space'); g.step(0.8);
    const spaceJumps = (c.jump ?? 0) - j0;
    window.__press('KeyK'); g.step(0.8);
    const kJumps = (c.jump ?? 0) - j0;
    g.menu.open('settings');
    g.menu.dialog.querySelector('[data-tab="controls"]').click();
    g.menu.dialog.querySelector('[data-action="reset-keys"]').click();
    g.menu.close(false);
    return { ok: prompt.startsWith('Press a key') && jumpKey === 'KeyK' && swapped && spaceJumps === 0 && kJumps === 1 && keys.jump === 'Space', detail: `jump=${jumpKey} space=${spaceJumps} k=${kJumps}` };
  });
  await run('rebound menu keys follow too (map on a new key)', () => {
    const g = window.__game;
    g.settings.data.keys.map = 'KeyN';
    g.applySettings();
    window.__key('KeyN');
    const opened = g.worldMap.isOpen;
    g.worldMap.close(false);
    window.__key('KeyM');
    const oldKey = g.worldMap.isOpen;
    g.worldMap.close(false);
    g.settings.data.keys.map = 'KeyM';
    g.applySettings();
    return { ok: opened && !oldKey, detail: `N opens=${opened} M opens=${oldKey}` };
  });

  // --- HUD ---------------------------------------------------------------------------------
  await run('compass shows heading, region and the nearest unlit shrine', async () => {
    const g = window.__game;
    const s = g.level.story.shrine('c1-0');
    const out = s.rest.clone().sub(s.position).setY(0).normalize();
    const x = s.position.x + out.x * 60, z = s.position.z + out.z * 60;
    window.__at(x, z, Math.atan2(out.x, out.z));
    g.markerTimer = 0;
    await window.__frames(3);
    const marker = document.querySelector('.compass-marker');
    const region = document.querySelector('.compass-region').textContent;
    const facingMarker = !marker.hidden;
    window.__at(x, z, Math.atan2(out.x, out.z) + Math.PI);
    g.markerTimer = 0;
    await window.__frames(3);
    const behind = marker.hidden;
    const site = g.level.siteAt(x, z);
    return { ok: facingMarker && behind && region === (site?.biome.name ?? 'The Threshold'), detail: `region=${region} ahead=${facingMarker} behind-hidden=${behind}` };
  });
  await run('the ending card follows the final victory', async () => {
    const g = window.__game;
    g.finale = true;
    g.finaleTimer = 0.05;
    await window.__frames(4);
    const screen = g.menu.screen;
    const text = g.menu.dialog.textContent;
    g.menu.dialog.querySelector('[data-action="keep-exploring"]').click();
    g.finale = false;
    return { ok: screen === 'ending' && text.includes('GREAT FOES') && text.includes('Long Night Ends') && !g.menu.screen, detail: `screen=${screen}` };
  });

  // --- persistence ---------------------------------------------------------------------------
  await load(page, `${logicQuery}&save=1`);
  await run('settings persist and a save indicator shows', async () => {
    const g = window.__game;
    g.settings.data.bands = 4;
    g.settings.data.music = 0.3;
    g.settings.save();
    g.saveNow();
    await window.__frames(2);
    const shown = document.querySelector('.save-indicator').classList.contains('shown');
    return { ok: shown && !!localStorage.getItem('chromatic-odyssey.settings.v1'), detail: `indicator=${shown}` };
  });
  await load(page, `${logicQuery}&save=1&title=1`);
  await run('the title offers Continue; a new journey asks first', () => {
    const g = window.__game, d = g.menu.dialog;
    const cont = d.querySelector('[data-action="continue"]');
    const label = cont?.textContent ?? '';
    const r = { bands: g.pixel.mode.bands.length, music: g.audio.volumes.music };
    d.querySelector('[data-action="new"]').click();
    const confirm = g.menu.screen === 'confirm-new';
    d.querySelector('[data-action="back"]').click();
    const back = g.menu.screen === 'title';
    return { ok: !!cont && label.includes('The Threshold') && confirm && back && r.bands === 4 && r.music === 0.3, detail: `${label} ${JSON.stringify(r)}` };
  });
  await page.evaluate((a, b) => { window.__game.resetting = true; localStorage.removeItem(a); localStorage.removeItem(b); }, SAVE_KEY, SETTINGS_KEY);
  await run('corrupt settings fall back to defaults', async () => {
    const { sanitize, defaultSettings } = await import('/src/core/Settings.ts');
    const s = sanitize({ bands: 5, bloom: 7, fov: 'x', keys: { jump: 'Key K!', dash: 'KeyL' }, music: -3 });
    const d = defaultSettings();
    return { ok: s.bands === 6 && s.bloom === 1 && s.fov === d.fov && s.keys.jump === 'Space' && s.keys.dash === 'KeyL' && s.music === 0, detail: JSON.stringify({ bands: s.bands, bloom: s.bloom, jump: s.keys.jump }) };
  });

  // --- pixel bloom (drawn) -------------------------------------------------------------------
  await load(page, '&cam=9,4.6,17&look=6,10,-60&time=14&preset=cosmic-violet');
  const shoot = async bloom => {
    await page.evaluate(async b => { window.__game.pixel.settings.bloom = b; await window.__frames(2); }, bloom);
    return page.screenshot({ type: 'png', encoding: 'binary' });
  };
  const off = await shoot(0);
  const on = await shoot(1);
  const diff = await page.evaluate(async (a, b) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const read = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const da = read(ia), db = read(ib);
    let changed = 0, darker = 0;
    for (let i = 0; i < da.length; i += 4) {
      const la = da[i] + da[i + 1] + da[i + 2], lb = db[i] + db[i + 1] + db[i + 2];
      if (lb !== la) changed++;
      if (lb < la - 6) darker++;
    }
    return { changed: changed / (da.length / 4), darker: darker / (da.length / 4) };
  }, `data:image/png;base64,${Buffer.from(off).toString('base64')}`, `data:image/png;base64,${Buffer.from(on).toString('base64')}`);
  check('pixel bloom brightens glowing pixels and never darkens', diff.changed > 0.002 && diff.darker < 0.001, `changed=${(diff.changed * 100).toFixed(2)}% darker=${(diff.darker * 100).toFixed(3)}%`);
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
