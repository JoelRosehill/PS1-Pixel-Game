import fs from 'node:fs';
import path from 'node:path';

/** Shared browser discovery for screenshot and regression tools on Windows. */
export function browserPath() {
  const local = process.env.LOCALAPPDATA;
  const cache = local && path.join(local, 'ms-playwright');
  const shells = cache && fs.existsSync(cache) ? fs.readdirSync(cache)
    .filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse()
    .map(n => path.join(cache, n, 'chrome-headless-shell-win64/chrome-headless-shell.exe')) : [];
  const candidates = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ...shells, 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const found = candidates.find(p => p && fs.existsSync(p));
  if (!found) throw new Error('No Chromium browser found; set CHROME_PATH');
  return found;
}
