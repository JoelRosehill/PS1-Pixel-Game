import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { port: 5194, strictPort: false } });
await server.listen();
let browser;
const errors = [];
try {
  browser = await puppeteer.launch({ executablePath: browserPath(), headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 600 });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${server.resolvedUrls.local[0]}tools/asset-preview.html`);
  await page.waitForFunction('!!window.assetReview');
  const manifest = JSON.parse(fs.readFileSync('public/models/manifest.json', 'utf8'));
  fs.mkdirSync('screenshots/assets', { recursive: true });
  for (const id of Object.keys(manifest.models)) {
    const result = await page.evaluate(async id => {
      const api = window.assetReview;
      const result = await api.show(id);
      // Independent skeletons, shared immutable meshes, and one cached load.
      const copy = await api.library.instantiate(id, { size: 3, grounded: false });
      let distinctSkeleton = true;
      const bones = [];
      api.instance.root.traverse(o => { if (o.isSkinnedMesh) bones.push(o.skeleton.bones[0]); });
      copy.root.traverse(o => { if (o.isSkinnedMesh && bones.includes(o.skeleton.bones[0])) distinctSkeleton = false; });
      return { ...result, distinctSkeleton, distinctRoot: copy.root !== api.instance.root,
        animationErrors: await api.checkAnimations(id) };
    }, id);
    if (!result.meshes || !result.size.every(Number.isFinite) || Math.max(...result.size) > 3.05 || !result.distinctSkeleton || !result.distinctRoot || result.animationErrors.length) {
      errors.push(`${id}: invalid model instance ${JSON.stringify(result)}`);
    }
    await page.screenshot({ path: `screenshots/assets/${id}.png` });
    console.log(`PASS ${id}: ${result.meshes} meshes, normalized bounds ${result.size.map(v => v.toFixed(2)).join(' × ')}`);
  }
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=8`);
  await page.waitForFunction('window.__ready === true || !!window.__error');
  const game = await page.evaluate(() => {
    const game = window.__game;
    let assets = 0, graves = 0;
    game.scene.traverse(o => { if (o.name.startsWith('asset:')) assets++; if (o.name === 'graveyard-piece') graves++; });
    return { errors: game.assetErrors, assets, graves, error: window.__error };
  });
  if (game.error || game.errors.length || game.assets !== 4 || game.graves !== 8) errors.push(`Game integration: ${JSON.stringify(game)}`);
  else console.log('PASS game integration: sword, church, demon, dragon, and eight graveyard pieces');
  // Contact sheets keep visual review practical without modifying the screenshots.
  const names = Object.keys(manifest.models);
  for (let i = 0; i < names.length; i += 8) {
    const sheet = await browser.newPage();
    await sheet.setViewport({ width: 1440, height: 600 });
    await sheet.setContent(`<body style="margin:0;background:#181623;display:grid;grid-template-columns:repeat(4,1fr)">${names.slice(i, i + 8).map(id => `<img width="360" height="300" style="object-fit:contain" src="data:image/png;base64,${fs.readFileSync(`screenshots/assets/${id}.png`).toString('base64')}">`).join('')}</body>`);
    await sheet.screenshot({ path: `screenshots/assets/sheet-${i / 8 + 1}.png` });
    await sheet.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
