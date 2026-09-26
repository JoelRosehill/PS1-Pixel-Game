// Post-processes the creature GLBs Blender exports: drops animation channels that never
// move a bone away from its rest pose (Blender's NLA export writes one for every bone),
// then prunes and deduplicates what is left. Run after tools/creatures/build.py:
//   node tools/creatures/strip.mjs [id ...]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';

const dir = join(import.meta.dirname, '..', '..', 'public', 'models', 'creatures');
const ids = process.argv.slice(2);
const files = readdirSync(dir).filter(f => f.endsWith('.glb') && (!ids.length || ids.includes(f.slice(0, -4))));
const io = new NodeIO();
const EPS = 1e-4;

function restValue(node, path) {
  if (path === 'translation') return node.getTranslation();
  if (path === 'rotation') return node.getRotation();
  if (path === 'scale') return node.getScale();
  return null;
}

for (const file of files) {
  const path = join(dir, file);
  const before = statSync(path).size;
  const doc = await io.read(path);
  let removed = 0, kept = 0;
  for (const anim of doc.getRoot().listAnimations()) {
    for (const channel of anim.listChannels()) {
      const node = channel.getTargetNode();
      const sampler = channel.getSampler();
      const rest = node && restValue(node, channel.getTargetPath());
      const out = sampler?.getOutput()?.getArray();
      let still = !!rest && !!out;
      if (still) {
        const n = rest.length;
        for (let i = 0; i < out.length && still; i++) {
          let d = Math.abs(out[i] - rest[i % n]);
          // q and -q are the same rotation.
          if (channel.getTargetPath() === 'rotation' && d > EPS) d = Math.abs(out[i] + rest[i % n]);
          if (d > EPS) still = false;
        }
      }
      if (still) { channel.dispose(); sampler.dispose(); removed++; } else kept++;
    }
  }
  await doc.transform(prune({ keepLeaves: true, keepAttributes: true }), dedup());
  await io.write(path, doc);
  console.log(`${file}: ${kept} channels kept, ${removed} removed, ${(before / 1024).toFixed(0)} → ${(statSync(path).size / 1024).toFixed(0)} KiB`);
}

// Keep the manifest's byte counts in step with the stripped files.
const manifestPath = join(dir, 'creatures.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const id of Object.keys(manifest)) manifest[id].bytes = statSync(join(dir, `${id}.glb`)).size;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');

