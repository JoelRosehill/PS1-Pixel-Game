// Dev helper: evaluates a JS expression in the running game (render=0) and prints JSON.
//   node tools/probe.mjs "window.__game.level.heightAt(0, 0)"
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { browserPath, launchArgs } from './browser.mjs';
const server = await createServer({ logLevel: 'error', server: { port: 5191, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: launchArgs() });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pageerror', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') console.error(m.text()); });
  await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=4&render=0${process.argv[3] ?? ''}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 120000 });
  const out = await page.evaluate(`(async () => { ${process.argv[2].includes('return') ? process.argv[2] : `return (${process.argv[2]})`} })()`);
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); await server.close(); }
