// Regenerates src/world/route/ModelBounds.ts: native bounds of every model the Long Road
// places (the `model:` ids in Journey.ts, plus the graveyard pieces), from the manifest.
//
//   node tools/model-bounds.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/models/manifest.json', 'utf8')).models;
const journey = readFileSync('src/world/biomes/Journey.ts', 'utf8');
const ids = new Set([...journey.matchAll(/model: '([^':]+)'/g)].map(m => m[1]));
for (const extra of ['ps1lowpoly-gravestone', 'psx-graveyard-modular-ps1-style-free']) ids.add(extra);
let out = `/**
 * Native bounds (m) of the models the Long Road places, from public/models/manifest.json
 * (regenerate with \`node tools/model-bounds.mjs\`). Structures need footprints before the
 * models load, so the ground under them can be levelled first.
 */
export const MODEL_BOUNDS: Record<string, [number, number, number]> = {
`;
for (const id of [...ids].sort()) {
  if (!manifest[id]) throw new Error(`No manifest entry for ${id}`);
  out += `  '${id}': [${manifest[id].bounds.size.map(v => +v.toFixed(3)).join(', ')}],\n`;
}
out += '};\n';
writeFileSync('src/world/route/ModelBounds.ts', out);
console.log(`${ids.size} models`);
