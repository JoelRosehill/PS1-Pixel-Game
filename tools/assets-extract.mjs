// Unpack the original archives without changing them. Nested ZIP/RAR files are
// isolated in sibling folders; every archive member is checked before extraction.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve('assets');
const work = path.join(root, '.work');
const tar = process.env.TAR_PATH || (process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar');
fs.mkdirSync(work, { recursive: true });
const slash = (s) => s.replaceAll('\\', '/');
const slug = (s) => s.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'model';
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${p}`);
    return e.isDirectory() ? files(p) : [p];
  });
}
function unpack(archive, dest) {
  if (/\.zip$/i.test(archive)) {
    const python = process.env.PYTHON_PATH || 'D:/Apps/Blender/5.2/python/bin/python.exe';
    execFileSync(python, ['tools/assets-unzip.py', archive, dest], { stdio: 'pipe' });
    files(dest);
    return;
  }
  const entries = execFileSync(tar, ['-tf', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
  for (const entry of entries) {
    const name = slash(entry);
    if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) throw new Error(`Unsafe archive path: ${entry}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  execFileSync(tar, ['-xf', archive, '-C', dest], { stdio: 'pipe' });
  files(dest); // reject links before traversing nested archives
}
const packs = [];
for (const zip of fs.readdirSync(root).filter(n => n.endsWith('.zip')).sort()) {
  const id = zip.slice(0, -4);
  const folder = path.join(work, id);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, zip))).digest('hex');
  const marker = path.join(folder, '.extracted');
  if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== digest) {
    if (fs.existsSync(marker)) throw new Error(`Source changed: use a new work directory for ${id}`);
    unpack(path.join(root, zip), folder);
    const seen = new Set();
    for (let depth = 0; depth < 8; depth++) {
      const nested = files(folder).filter(p => /\.(zip|rar|7z)$/i.test(p) && !seen.has(p));
      if (!nested.length) break;
      for (const p of nested) { seen.add(p); unpack(p, `${p}.unpacked`); }
    }
    const pending = files(folder).filter(p => /\.(zip|rar|7z)$/i.test(p) && !seen.has(p));
    if (pending.length) throw new Error(`Archive nesting limit reached in ${id}`);
    fs.writeFileSync(marker, digest);
  }
  const all = files(folder);
  const models = all.filter(p => /\.(fbx|obj|blend|gltf|glb|dae|3ds)$/i.test(p) && !p.includes('__MACOSX'));
  const unique = new Map();
  for (const p of models) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    if (!unique.has(hash)) unique.set(hash, p);
  }
  const notices = all.filter(p => /(?:licen[cs]e|credits|readme|copyright)/i.test(path.basename(p)));
  const sources = [...unique.values()].map((p, i) => ({
    id: unique.size === 1 ? id : `${id}--${slug(path.basename(p, path.extname(p)))}-${i + 1}`,
    path: slash(path.relative(process.cwd(), p)),
    format: path.extname(p).slice(1).toLowerCase(),
    bytes: fs.statSync(p).size,
  }));
  packs.push({ id, archive: `assets/${zip}`, sha256: digest, folder: slash(path.relative(process.cwd(), folder)), sources,
    notices: notices.map(p => slash(path.relative(process.cwd(), p))), archiveBytes: fs.statSync(path.join(root, zip)).size });
  console.log(`${id}: ${sources.length} model source(s), ${notices.length} notice(s)`);
}
fs.writeFileSync(path.join(work, 'inventory.json'), JSON.stringify({ packs }, null, 2) + '\n');
console.log(`Inventory: ${packs.length} packs, ${packs.reduce((n, p) => n + p.sources.length, 0)} unique model sources`);
