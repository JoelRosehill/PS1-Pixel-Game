import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const blender = process.env.BLENDER_PATH || 'D:/Apps/Blender/blender.exe';
if (!fs.existsSync(blender)) throw new Error('Set BLENDER_PATH to your Blender executable');
const run = (exe, args) => {
  const result = spawnSync(exe, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run(process.execPath, ['tools/assets-extract.mjs']);
run(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1',
  '--python', 'tools/assets-convert.py', '--', ...process.argv.slice(2)]);
run(process.execPath, ['tools/assets-manifest.mjs']);
