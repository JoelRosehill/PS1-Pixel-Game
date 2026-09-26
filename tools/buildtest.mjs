// Production build smoke test (Job 10): builds with Vite, checks bundle sizes and that
// every URL is relative (so dist/ runs from any folder or sub-path), serves it with
// `vite preview`, and boots the game headless checking for errors and asset fallbacks.
//
//   npm run buildtest
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { build, preview } from 'vite';
import { browserPath, launchArgs } from './browser.mjs';

const failures = [];
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures.push(name);
};

await build({ logLevel: 'warn' });
const assets = fs.readdirSync('dist/assets');
const size = f => fs.statSync(path.join('dist/assets', f)).size;
const js = assets.filter(f => f.endsWith('.js'));
const main = js.find(f => f.startsWith('index-'));
const three = js.find(f => f.startsWith('three-'));
check('bundle splits the game from three.js', !!main && !!three, js.map(f => `${f}=${(size(f) / 1024).toFixed(0)}k`).join(' '));
check('game bundle stays small', !!main && size(main) < 900 * 1024, main ? `${(size(main) / 1024).toFixed(0)} KiB` : '');
const html = fs.readFileSync('dist/index.html', 'utf8');
check('asset URLs are relative', !/(src|href)="\/(?!\/)/.test(html), html.match(/(src|href)="[^"]+"/g)?.join(' ') ?? '');
check('model manifest is shipped', fs.existsSync('dist/models/manifest.json'));
const version = fs.readFileSync(path.join('dist/assets', main), 'utf8').match(/["'`](v\d+\.\d+\.\d+(?:-dev)?)["'`]/)?.[1];
check('the build carries its version', !!version, version ?? 'not found');

const server = await preview({ logLevel: 'error', preview: { port: 5193, strictPort: false } });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => errors.push(`request failed: ${r.url()}`));
  const url = server.resolvedUrls.local[0];
  await page.goto(`${url}?shot=1&render=0&frames=3`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  const r = await page.evaluate(() => ({ error: window.__error, assets: window.__game?.assetErrors ?? ['no game'], title: document.title }));
  check('the built game boots', !r.error, r.error ?? r.title);
  check('every model loads from the build', r.assets.length === 0, r.assets.join('; '));
  // And with the real title screen (not a screenshot run).
  await page.goto(url);
  await page.waitForFunction('window.__game && window.__game.frames > 2', { timeout: 180000 });
  const t = await page.evaluate(() => ({ screen: window.__game.menu.screen, splash: getComputedStyle(document.getElementById('splash')).display }));
  check('the build opens on the title screen', t.screen === 'title' && t.splash === 'none', JSON.stringify(t));
  check('no console errors or failed requests', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  failures.push(`harness: ${e.stack ?? e}`);
} finally {
  await browser?.close();
  await new Promise(r => server.httpServer.close(r));
}

console.log(`\n${total - failures.filter(f => f.startsWith('harness')).length}/${total} passed`);
if (failures.length) {
  console.log('Failures:', failures.join('; '));
  process.exit(1);
}
