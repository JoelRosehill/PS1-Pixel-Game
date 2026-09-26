import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * Version shown on the title screen and menus: major.minor from package.json, patch =
 * number of commits, so every commit bumps it. Uncommitted changes add "-dev"; without
 * git (e.g. a source zip) it falls back to package.json.
 */
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const [major, minor] = pkg.version.split('.');
const commits = git('rev-list --count HEAD');
const commit = git('rev-parse --short HEAD');
const dirty = git('status --porcelain') ? '-dev' : '';
const version = commits ? `v${major}.${minor}.${commits}${dirty}` : `v${pkg.version}`;

export default defineConfig({
  // Relative asset URLs, so the build runs from any folder or sub-path (itch.io, GitHub Pages).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // three.js changes rarely; keep it in its own long-cached chunk.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
