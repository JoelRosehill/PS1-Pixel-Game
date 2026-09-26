// Validate the exported files and publish a compact runtime manifest plus a full
// provenance/optimization report. Run after Blender finishes all conversions.
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from 'gltf-validator';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const inventory = JSON.parse(fs.readFileSync('assets/.work/inventory.json', 'utf8'));
const models = {};
const reports = [];
const failures = [];
for (const pack of inventory.packs) {
  const reportPath = `assets/.work/${pack.id}.report.json`;
  if (!fs.existsSync(reportPath)) { failures.push(`${pack.id}: not converted`); continue; }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.status !== 'ok') { failures.push(`${pack.id}: ${report.error}`); continue; }
  const file = path.resolve('public', report.url);
  const bytes = fs.readFileSync(file);
  const validation = await validateBytes(new Uint8Array(bytes), { maxIssues: 100 });
  const size = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + size));
  const binStart = 20 + size + 8;
  const issues = [];
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(8) !== bytes.length) issues.push('Invalid GLB header');
  if (gltf.buffers?.some(b => b.uri) || gltf.images?.some(i => i.uri)) issues.push('External dependency in GLB');
  const textures = (gltf.images ?? []).map(i => {
    const view = gltf.bufferViews[i.bufferView];
    const image = bytes.subarray(binStart + (view.byteOffset ?? 0), binStart + (view.byteOffset ?? 0) + view.byteLength);
    if (i.mimeType !== 'image/png' || image.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
      issues.push('Expected an embedded PNG');
      return { name: i.name, width: 0, height: 0 };
    }
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
    if (Math.max(width, height) > 256) issues.push(`Texture exceeds 256 px: ${width}x${height}`);
    return { name: i.name, width, height };
  });
  let triangles = 0, draws = 0;
  const bounds = new Box3();
  function walk(index, parent) {
    const n = gltf.nodes[index];
    const local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(
      new Vector3().fromArray(n.translation ?? [0, 0, 0]),
      new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(n.scale ?? [1, 1, 1]));
    const world = parent.clone().multiply(local);
    if (n.mesh !== undefined) for (const primitive of gltf.meshes[n.mesh].primitives) {
      const positions = gltf.accessors[primitive.attributes.POSITION];
      const count = primitive.indices === undefined ? positions.count : gltf.accessors[primitive.indices].count;
      if ((primitive.mode ?? 4) !== 4) issues.push('Non-triangle primitive');
      triangles += count / 3;
      draws++;
      if (positions.min && positions.max) bounds.union(new Box3(new Vector3().fromArray(positions.min), new Vector3().fromArray(positions.max)).applyMatrix4(world));
    }
    for (const child of n.children ?? []) walk(child, world);
  }
  for (const node of gltf.scenes[gltf.scene ?? 0].nodes ?? []) walk(node, new Matrix4());
  const dimensions = bounds.getSize(new Vector3()).toArray();
  if (!dimensions.every(Number.isFinite) || Math.max(...dimensions) <= 0 || triangles <= 0) issues.push('Empty/non-finite geometry');
  if (validation.issues.numErrors) issues.push(`${validation.issues.numErrors} glTF validation errors`);
  report.validation = validation.issues;
  report.exportedTriangles = triangles;
  report.drawCalls = draws;
  report.embeddedImages = textures;
  report.bounds = { min: bounds.min.toArray(), max: bounds.max.toArray(), size: dimensions };
  report.animations = (gltf.animations ?? []).map((a, i) => a.name ?? `animation-${i}`);
  report.skins = gltf.skins?.length ?? 0;
  reports.push(report);
  models[pack.id] = { url: report.url, bytes: bytes.length, triangles, drawCalls: draws,
    bounds: report.bounds, animations: report.animations, skins: report.skins };
  if (issues.length) failures.push(`${pack.id}: ${issues.join('; ')}`);
  console.log(`${issues.length ? 'FAIL' : 'PASS'} ${pack.id}: ${triangles} triangles, ${draws} primitives, ${textures.length} embedded images`);
}
fs.mkdirSync('docs/assets', { recursive: true });
fs.writeFileSync('docs/assets/conversion-report.json', JSON.stringify({ format: 'glTF 2.0 binary', reports, failures }, null, 2) + '\n');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
fs.writeFileSync('public/models/manifest.json', JSON.stringify({ version: 1, models }, null, 2) + '\n');
const sourceTriangles = reports.reduce((n, r) => n + r.sourceTriangles, 0);
const triangles = reports.reduce((n, r) => n + r.exportedTriangles, 0);
const bytes = reports.reduce((n, r) => n + r.bytes, 0);
const rows = reports.map(r => `| ${r.id} | ${r.sourceTriangles.toLocaleString('en-US')} | ${r.exportedTriangles.toLocaleString('en-US')} | ${(r.bytes / 1024).toFixed(1)} | ${r.animations.length} |`);
fs.writeFileSync('docs/assets/CONVERSION.md', `# Optimized asset library\n\n${reports.length}/${inventory.packs.length} packs converted to self-contained GLB files. All exported files passed glTF validation without errors and contain only embedded textures at most 256 px per side.\n\nGeometry: ${sourceTriangles.toLocaleString('en-US')} source triangles → ${triangles.toLocaleString('en-US')} exported triangles. Total runtime library: ${(bytes / 1048576).toFixed(2)} MiB. Counts include mesh instances; per-model source and exported counts can differ when Blender evaluates geometry.\n\n| Pack | Source triangles | GLB triangles | KiB | Animation clips |\n|---|---:|---:|---:|---:|\n${rows.join('\n')}\n\nDetailed material recovery, validation messages, source hashes, texture sizes, bounds and source alternatives are in [conversion-report.json](conversion-report.json). Originals remain in assets/*.zip.\n`);
console.log(`TOTAL ${reports.length} models: ${sourceTriangles} -> ${triangles} triangles; ${(bytes / 1048576).toFixed(2)} MiB`);
