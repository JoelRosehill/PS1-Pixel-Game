# Asset pipeline

Job 3.5 converts all 40 original packs to one runtime format: **glTF 2.0 binary
(.glb)** with embedded PNG textures. The archives in `assets/` remain untouched.
The game downloads only the five packs used in the current level; the entire
20 MiB library is not loaded at startup.

## Rebuild

```powershell
$env:BLENDER_PATH = 'D:\Apps\Blender\blender.exe'
$env:PYTHON_PATH = 'D:\Apps\Blender\5.2\python\bin\python.exe'
npm run assets:build
npm run assets:validate
npm run assettest
```

Those paths are the defaults on the current machine. Override them when moving
the project. Windows' bundled tar extracts RAR; Python handles ZIP to preserve
Cyrillic filenames. No Blender add-ons or native converter install is required.
Blender runs in the background with automatic source-file script execution disabled.

`npm run assets:build -- --only=red-dragon --force` reconverts one pack. A normal
build resumes completed conversions when the source SHA-256 and pipeline version
match. Increase `VERSION` in `tools/assets-convert.py` after changing conversion
rules, or use `--force`. Validation always checks the complete library before
publishing the runtime manifest. Do not run simultaneous builds of the same pack.

## Outputs

- `public/models/*.glb`: the 40 runtime models, copied into production by Vite.
- `public/models/manifest.json`: byte sizes, triangles, draw calls, bounds and clips.
- `docs/assets/CONVERSION.md`: readable per-pack reduction table.
- `docs/assets/conversion-report.json`: source hashes/paths, material recovery,
  texture sizes, retained animations, validation messages and exceptions.
- `assets/.work/`: ignored extraction folders, conversion logs, intermediate textures
  and resumable reports. Rebuildable from the original archives.
- `screenshots/assets/`: ignored individual previews and five contact sheets.

`npm run dev`, then open `/tools/asset-preview.html?id=red-dragon` to orbit an
individual model. This review page is a development tool, not part of the game's UI.
`npm run shot -- --view=chapel,demon,dragon,fight --w=1920 --h=1080 --perf`
captures the integrated set pieces. Browser tools locate installed Chromium
headless shells automatically, or accept `CHROME_PATH`.

## Conversion choices

The Blender script uses category budgets: 1,200 triangles for weapons, 2,400 for
small props, 6,000 for creatures, 8,000 for kits, 12,000 for the dragon, and 24,000
for full environments. Already-low-poly meshes are retained. Large static scenes
are merged to reduce draw calls; modular kit parts remain named and separable.
Decimation keeps UVs/material boundaries and vertex weights. Rigs and available
clips are exported; the standard four largest bone weights per vertex are retained
and normalized by the glTF exporter.

Colour/alpha and emission images are resized to at most 256 pixels per side.
Normal, metallic, roughness and AO maps are omitted for the game's toon look.
Fresh image datablocks prevent Blender from reusing the original packed GLB
textures after resizing. Runtime textures use nearest filtering and nearest
mip levels; alpha cutouts write depth for the Smart-Pixel compositor.

The runtime caches one load per model and shares geometry/textures/materials.
Skeleton clones keep animated characters independent. Callers remove their own
instances, but must not dispose library-owned geometry or materials.
Hero models load asynchronously; failed assets leave the game running and produce
an entry in `Game.assetErrors`. The procedural sword is retained if its load fails.

## Source-specific notes

- Castle XIII includes OBJ and DAE versions. OBJ is the selected canonical source;
  the alternate DAE remains in the preserved archive and is listed in the report.
- Castle XIII (~51K triangles) and The Lost Relic (~43K) exceed the 24K target:
  repeated decimation reaches a limit imposed by disconnected details. These are
  complete environments, and are not loaded by the current game. Reductions are
  approximately 81% and 93%, respectively.
- The Lost Relic contains no image textures or vertex colours in its supplied FBX;
  its plain source materials are retained. Conversion cannot recover absent art.
- Broken texture paths are repaired using pack-local files; a sole colour texture
  is used when source material links are missing. Recovery is listed per asset.
- The lowpoly-castle source includes a surrounding sky dome, moon, clouds and bloom
  cards. These presentation meshes are omitted so they do not obscure the castle
  or replace the game's sky. Their originals remain in the Blend archive.
- The demon's SupaVoxel presentation badge is preserved in its GLB and full asset
  preview. The in-world instance omits that separate billboard. Its source credit
  is recorded in [CREDITS.md](CREDITS.md).
- Animation clips retain the author's names and poses, including test/reference
  clips. The browser checks sample each clip for finite skinned geometry; that is
  not a guarantee that every source animation is suitable as finished gameplay.

The placed dragon and demon demonstrate the imported models. They do not implement
the later boss or enemy jobs. The chapel is a solid exterior set piece with a
conservative collider; the original movement/combat test course stays separate.
