import fs from 'node:fs';
import path from 'node:path';

/** Shared browser discovery for screenshot and regression tools (Windows, Linux, macOS). */
export function browserPath() {
  const local = process.env.LOCALAPPDATA;
  const cache = local && path.join(local, 'ms-playwright');
  const shells = cache && fs.existsSync(cache) ? fs.readdirSync(cache)
    .filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse()
    .map(n => path.join(cache, n, 'chrome-headless-shell-win64/chrome-headless-shell.exe')) : [];
  // Playwright's Linux cache (PLAYWRIGHT_BROWSERS_PATH, e.g. /opt/pw-browsers).
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const linux = pw && fs.existsSync(pw) ? fs.readdirSync(pw).sort().reverse().flatMap(n =>
    n.startsWith('chromium_headless_shell-') ? [path.join(pw, n, 'chrome-linux/headless_shell')]
      : n.startsWith('chromium-') ? [path.join(pw, n, 'chrome-linux/chrome')] : []) : [];
  const candidates = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ...shells, 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', ...linux,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const found = candidates.find(p => p && fs.existsSync(p));
  if (!found) throw new Error('No Chromium browser found; set CHROME_PATH');
  return found;
}

/**
 * GPU flags per platform. Windows renders through ANGLE/D3D11 on the real GPU; elsewhere
 * ANGLE picks its default backend and falls back to SwiftShader when no GPU exists.
 * Containers usually run as root, which Chromium only allows without its sandbox.
 * GPU=0 forces software rendering everywhere.
 */
export function launchArgs(extra = []) {
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
  if (process.env.GPU === '0') args.push('--use-angle=swiftshader');
  else if (process.platform === 'win32') args.push('--use-angle=d3d11');
  if (process.platform === 'linux') args.push('--no-sandbox');
  return [...args, ...extra];
}

/**
 * Query suffix for logic-only suites. RENDER=1 keeps the 3D render; otherwise the
 * simulation runs without drawing (`render=0`), so real-time suites keep 60 Hz even
 * on machines where software WebGL manages one frame per second.
 */
export const logicQuery = process.env.RENDER === '1' ? '' : '&render=0';
