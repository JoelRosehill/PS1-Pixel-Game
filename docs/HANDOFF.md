# Session Handoff — Project Chromatic Odyssey

**Latest verification:** [2026-09-26 Job 9](sessions/2026-09-26-job-9.md)
records the story, Ember Shrines, fast travel, journal and the save system.

**Last updated:** 2026-09-26, at the end of Job 9.
**For:** the next development session continuing this project. Read this file first, then
[ROADMAP.md](ROADMAP.md) (job plan and checklists) and [GDD.md](GDD.md) (design pillars).

The full chat history for Jobs 1–3 is archived in [sessions/](sessions/) — read
[sessions/session-transcript.md](sessions/session-transcript.md) only when you need the
reasoning behind a decision; this file is the current state.

**Suggested opening prompt for the new session:**
> Read docs/HANDOFF.md, docs/ROADMAP.md and docs/GDD.md, then do the next job.

---

## 1. What the user asked for

The user gave a master design prompt and told me to **"do this game in parts, not in one
prompt, split it in jobs."** Do one job per session, and stop at the end of each job so the
user can review it. Here is the master prompt in full (lightly reformatted):

> **MASTER GAME DESIGN PROMPT: PROJECT CHROMATIC ODYSSEY**
> **Role & Objective:** Act as a Lead Game Designer and Technical Architect. Your objective is to expand, document, and generate assets, code structures, or narrative elements for a "Chill-Fi Dark Fantasy" Action-RPG. Adhere strictly to the following core pillars, mechanics, and visual constraints in all subsequent outputs.
>
> **1. Visual Art Direction & Rendering Constraints**
> - *"Smart-Pixel" Depth of Field Rendering:* Do not use a global pixelation filter. Implement a dynamic resolution scaling system. Objects in the immediate foreground (player character, equipped sword, ground textures) must render in crisp, high-definition pixel art. As distance from the camera increases, aggressively lower the pixel resolution. Distant landmarks (mountains, castles, horizons) must appear as abstract, heavily pixelated blocks of color.
> - *Atmospheric Skyboxes:* The sky is a primary atmospheric driver. Generate visuals featuring massive, blood-red moons, vibrant cosmic dust clouds in deep purples, pinks, and greens, and brightly colored, oversized stars.
> - *Environmental Contrast:* Balance dark fantasy gothic architecture with highly saturated, tranquil nature biomes. The world must look incredibly peaceful and visually mesmerizing, contrasting directly with the violent combat.
>
> **2. Core Combat & Movement Mechanics**
> - *High-Velocity Movement (Ultrakill-Inspired):* The player character is highly mobile. Core traversal must include a physics-driven ground slide to evade or close distances instantly. Implement vertical mobility via wall-sliding, wall-jumping, and directional dashing.
> - *Spellblade Combat System:* Combat is a heavy, high-impact mechanical loop mixing melee strikes with rapid spell-casting.
> - *No Traditional Mana:* Replace mana pools with a momentum-based "mechanics pool" that rapidly recharges through aggressive melee strikes and successful evasions to encourage constant offensive pressure.
>
> **3. Progression & The Dynamic Spellbook**
> - *The Spellbook UI/Mechanic:* The player's spell inventory is a literal physical book.
> - *Page Acquisition:* Character progression is tied to exploring the world and finding lost pages. Adding a page adds a new, completely unique spell to the combat rotation.
> - *Visual Evolution:* As the player advances, the in-game spellbook must physically grow thicker and more ornate, dynamically representing the player's expanding arsenal.
>
> **4. World Structure & Biome Generation**
> - *Pacing & Traversal:* Elden Ring style of narrative pacing. The story is long and discovered organically through extensive walking and environmental storytelling.
> - *Staged Biome Progression:* A minimum of 40 distinct biomes, grouped mechanically and thematically into sequential Stages/Chapters.
> - *Required Biome Archetypes:* Violet Marshes (bioluminescent wetlands); Sunkeeper's Terrace (classical architecture over colorful bodies of water); Crystal Caverns (massive underground ice and pink/blue crystal formations); Tranquil Wilderness (lush, colorful pine forests and sunlit lakes); Bloodstone & Shadow (deep red canyons and heavily gothic, dark mystical portals and citadels).
>
> **5. Enemy Ecology & Encounter Design**
> - *Shadow Knights:* Heavily armored, methodical melee units with glowing elements. Test the player's parry and heavy sword mechanics.
> - *Sunkeeper Wizards:* Evasive casters using blinding light magic and long-range area-of-effect spells. Force the player to use movement mechanics (slides/wall-jumps) to close the gap.
> - *Dark Fantasy Fauna:* Colossal, monstrous beasts and dragon-like entities as regional bosses.
>
> **Execution Directive:** When prompted for levels, code, or story, cross-reference all outputs against these 5 pillars. Prioritize fast mechanics, smart-pixel visuals, and vast, staged exploration.

**Reference images** (`reference_img/`):
- A mossy stone castle with violet conical roofs and a glowing turquoise moat.
- Blood-red moons behind black gothic spires (3 images).
- A knight resting at a sword-in-bonfire under a spire citadel.
- A sunlit pixel pine coast and a sunlit forest lake.
- A foggy teal stone portal ring.
- A red-eyed forest-beast face.
- `Gemini_Generated_Image_…jpg`: the user's **master composite**. It shows a third-person
  hero with a glowing sword and a spellbook, a Shadow Knight, the castle, a blood moon
  under purple clouds, and thumbnails for biomes 1–40.

---

## 2. Decisions made (some still need the user's confirmation)

| Decision | Status |
|---|---|
| **Stack:** TypeScript + Three.js 0.186 (WebGL2) + Vite 8. Procedural world plus selected imported GLB hero pieces. | Asset pipeline completed in Job 3.5. |
| **First-person camera** | Job 2 built a third-person chase camera; a later kinetic pass (after Job 4, undocumented at the time) switched to first person with hands/sword/book in a separate near-field scene. Jobs 5+ build for first person. |
| Mana replacement is called the **Momentum Pool** (0–100, "Resonance" at 100) | In the GDD |
| Rest/respawn points are **Ember Shrines** (a sword in embers) | In the GDD |
| 40 biomes = **8 chapters × 5**. Ch.1 Tranquil Wilderness, Ch.2 Violet Marshes, Ch.3 Sunkeeper's Terrace, Ch.4 Crystal Caverns, Ch.5 Bloodstone & Shadow, Ch.6–8 expansions | In the GDD |
| Physics: **custom kinematic controller**, no Rapier | Changed in Job 2 (reason in ROADMAP.md). Capsule = sphere stack vs analytic terrain + primitive colliders. |
| Git | The project now lives on GitHub (`JoelRosehill/PS1-Pixel-Game`); each job is a commit. |

---

## 3. Current state: Jobs 1–9 (including 3.5) complete ✅

**Run:** `npm install && npm run dev`, then open http://localhost:5173 and click. Controls are in [README.md](../README.md).
You play a spellblade in first person: WASD, Space jump, Shift dash, Ctrl slide (C in the air slams),
LMB attack, RMB charged heavy, Q parry, E cast, F bind a page, B read the book,
hold Tab for the spell wheel, M for the world map, V for the debug fly camera.

**What exists:**
- **Smart-Pixel renderer** (`src/render/SmartPixelRenderer.ts`):
  - 6 depth bands (16/40/100/240/650/∞ m at ×1/2/3/5/8/12 base px); the sky is ×3.
    1 base px = `round(screenHeight/540)` device px.
  - Each band is rendered to its own low-res target with a depth texture.
  - The compositor runs front-to-back on a **base-pixel canvas**, then a nearest-neighbour
    blit scales it to the screen. It adds Bayer-dithered band hand-offs (22% overlap),
    outlines in bands 0–1 (with a planarity test so ground isn't outlined), analytic
    **height fog coloured by the sky haze**, a hue-preserving tonemap, saturation, and
    palette quantisation.
  - The shadow map renders once per frame (`shadowMap.autoUpdate=false`).
  - `scene.matrixWorldAutoUpdate=false`, because the renderer updates matrices once.
- **Sky** (`src/render/sky/`): shared GLSL (gradient, glow, stars snapped to sky pixels,
  cratered moon, clouds). The nebula masks are baked once into a cubemap
  (`NebulaCache.ts`) and colourised per frame.
- **Presets** (`SkyPresets.ts`): cosmic-violet (default), blood-moon, sunlit-wilderness and
  verdigris-mist. They drive the sky, fog, key and hemisphere lights, water tint and exposure.
  `Atmosphere.ts` blends between presets.
- **World** (`src/world/`):
  - `ProvingGrounds.ts` holds the level, `heightAt()`, colours and scatter.
  - `Terrain.ts` is a chunked, warped grid that is dense at the centre.
  - `Water.ts` is unlit glowing water.
  - `props/` has the castle, foliage (chunked instancing), landmarks (mountain ring, spire
    citadel, mist gate), and details (ember shrine, columns, crystals, bridge, fireflies,
    placeholder wanderer).
- **Core:** `Game.ts` has a fixed 60 Hz `systems[]` hook plus variable update. `Input.ts`
  handles keyboard/mouse with pointer lock. `Random.ts` and `Noise.ts` are seeded.
- **Debug:** `FlyCamera.ts` (walk/fly) and `DebugHud.ts`. F1 switches render mode
  (smart / flat / global-filter comparison), F2 shows band colours, F3/F4 toggle outline
  and palette, 1–4 switch presets, [ ] change pixel size.

- **Job 2 — movement** (`src/physics/`, `src/player/`):
  - `Colliders.ts`: static collision world. Terrain is the analytic height function;
    props register oriented boxes / vertical cylinders / spheres into a grid broadphase
    (~3,200 colliders, including every tree trunk). Queries: `resolveSphere`,
    `deepestContact`, `overlaps`, `sweepSphere`, `terrainNormal`.
  - `PlayerController.ts`: the whole feel lives in `PLAYER_TUNING` at the top. Capsule is
    a stack of spheres; Quake-style acceleration; slide / wall-jump / dash / swim; step-up
    and ground snapping (which must keep the real surface normal or slides stop
    accelerating downhill — that was a real bug).
  - `PlayerModel.ts`: blocky knight, posed procedurally per movement state. Authored
    facing +Z, so the root is rotated `facing + π`.
  - `ThirdPersonCamera.ts`: boom with sphere-sweep collision, min distance, speed FOV,
    `addShake()` for combat.
  - `Player.ts`: glues them together; fixed-step physics, interpolated rendering.
  - `world/props/ParkourCourse.ts`: "The Wayfarer's Trial" east of the plaza
    (centre x 64, z 10): slide ramp, low tunnel, wall-jump shaft, stepped platforms,
    dash gap, floating Lost Page.

- **Job 3 — combat** (`src/combat/`, `src/player/PlayerCombat.ts`, `src/render/effects/`, `src/ui/`):
  - `CombatWorld`: registry of everything damageable, swept-segment queries, aim assist.
    All damage flows through `strike()`, which fires one `onHit` callback.
  - `PlayerCombat`: the attack state machine (windup → active → recovery), contextual
    attacks, parry/guard/riposte, perfect dodge, Rune Burst, HP and respawn. Hit detection
    uses an **analytic blade arc** (`bladeAt`), never the animated mesh.
  - `Momentum`: the mana replacement, with the Resonance state.
  - `TimeControl`: hit-stop and slow motion via a global time scale applied in `Game.tick`.
  - `Effects`: pooled sword trails, sparks, shock rings and instanced pixel damage numbers
    (digit atlas lives in `PixelTextures.glyphAtlas`).
  - `SparringConstruct`: stone golem that telegraphs, swings, staggers, dies and rebuilds.
    Four sit in the training yard south-east of the plaza (2 passive, 2 aggressive).
  - `GameHud`: DOM bars for Vigour and Momentum, dash pips, hit flash, death banner.

**Historical Job 3 performance baseline:** 60 fps (vsync cap) at 1080p on an Intel UHD 770 integrated GPU;
~56 fps in the training yard with four constructs and combat effects. About 640 draw calls
and 0.76M triangles per frame, summed across all bands.

- **Job 3.5 — asset pipeline** (`tools/assets-*`, `src/assets/ModelLibrary.ts`):
  - All 40 source packs converted to embedded-texture GLBs in `public/models/`.
    1,654,255 source triangles → 192,611 runtime triangles; 20.02 MiB total library.
    Original archives remain untouched. Textures are at most 256 px per side.
  - Cached, on-demand loads, independent skeleton clones, toon materials and nearest
    texture filtering. Only five packs are loaded by the current game.
  - Imported sword uses existing back/hand anchors and unchanged analytic hitboxes.
  - `HeroAssets.ts`: chapel/graves west of spawn; demon beside the chapel; animated
    dragon beyond the western ridge. Creatures are display pieces, without enemy AI.
  - Rebuild instructions and source exceptions: [assets/PIPELINE.md](assets/PIPELINE.md).
    Conversion table: [assets/CONVERSION.md](assets/CONVERSION.md).
    Source licences remain unverified: [assets/CREDITS.md](assets/CREDITS.md).

**Current Job 3.5 performance:** approximately 60 fps at 1080p on this machine's
RTX 2080 Ti, across spawn, chapel, demon, dragon, combat and player views. These
measurements are refresh capped and do not establish a speedup over the old GPU.

- **Job 4 — Living Spellbook** (`src/spells/`, `src/player/SpellbookModel.ts`,
  `src/ui/SpellbookUI.ts`):
  - Hinged book at the hip, floating open on cast. Thickness tracks pages;
    brass appears at 3, gilding at 5, runic glow at 8.
  - Rune Burst is initially bound; seven pickups unlock seven additional spells.
    The first is beside the shrine, and Windstep is the old trial ledge reward.
  - `SpellBook.ts` holds typed effect definitions and session progression.
    `SpellCasting.ts` owns projectiles, wells, collision queries, healing and ward.
  - E casts the selected spell; all costs use Momentum/Resonance. Invalid casts
    do not spend. Recovery is per spell, plus a short shared casting lockout.
  - B reading screen has lore, location clues, costs and equip controls. Hold Tab
    opens the wheel; mouse/arrows/1–8 select, release equips, Escape cancels.
    Menus pause the fixed simulation and clear/block gameplay input.
  - Damage passes through `CombatWorld.strike`. Body colliders remain solid for
    movement but spell geometry sweeps ignore them, since damage queries handle
    bodies separately. Walls still block projectiles, wells and impact splashes.
    Rune Burst retains its original cover-ignoring shockwave behavior.
  - Death clears spell effects/buffs but preserves pages. Browser reload resets
    progression; save/load belongs to Job 9.

**Job 4 verification:** build passed; spell suite 38/38, movement 11/11, combat
11/11. Final 1080p spawn/yard/player view measurements remain approximately 60 fps
on RTX 2080 Ti (refresh capped). Reading screen, wheel and casting model inspected.

- **Kinetic first-person pass** (after Job 4): `FirstPersonCamera` (eyes in the capsule,
  speed FOV, wall-run roll, F6 toggles camera motion), `FirstPersonRig` (hands, sword and
  book in their own near-field scene, rendered over the bands), wall-running with a
  per-wall budget, air slam (C/Ctrl in the air) with a buffered rebound jump, a speed
  readout and technique hints. `npm run kinetictest` (17 checks) covers it.

- **Job 5 — Enemy Ecology** (`src/enemies/`, `src/ui/EnemyHud.ts`):
  - `EnemyDirector` is a fixed-step `GameSystem`: owns live enemies, `AttackTokens`,
    `Telegraphs` (ground markers + scheduled light strikes) and `EnemyProjectiles`,
    runs encounters and shares alerts between companions. It freezes in fly mode.
  - `Enemy` base: kinematic body (two spheres vs colliders, gravity, terrain, water
    avoidance), `move()` wish + knockback blend, stagger, leash/return/heal, spawn rise,
    per-instance dissolve uniform, hit flash, billboard bar. Subclasses implement
    `think`, `animate` and `receive` (armour rules).
  - `ShadowKnight` (190 HP, poise 100) and `SunkeeperWizard` (95 HP): see the GDD for
    their full rules. Tunables are in `KNIGHT_TUNING`/`KNIGHT_ATTACKS` and
    `WIZARD_TUNING`/`WIZARD_SPELLS`.
  - `ColliderWorld` now has **dynamic bodies** (`addBody/removeBody`, linear list, not the
    grid). `resolveSphere`/`deepestContact` take an `ignore` body. `HitInfo.parry` marks
    parry recoil; `HitResult.critical` marks weak-point/exposed hits.
  - `ProvingGrounds.encounters`: *The Bridge Warden* (castle bridge), *Graveyard Vigil*
    (graves by the chapel, 2 waves, guards the Violet Well page), *Sunkeeper Watch*
    (`props/SunkeeperRuin.ts`, 4 climbable pillars around a sun altar at x 22, z −90).
  - HUD: target frame (top centre), blinding white-out, title cards (`GameHud.announce`).
  - `Game.step(seconds)` and `game.manual` drive the simulation deterministically.

- **Job 6 — World Engine** (`src/world/World.ts`, `src/world/engine/`, `src/world/biomes/`):
  - `World` implements `Level`: it builds `ProvingGrounds` in *embedded* mode (no own
    terrain/water/mountain ring; vegetation stops at 470 m) around a `ThresholdTerrain`
    that the world blends with 40 biome sites. `level.hub` is the old diorama.
  - `WorldAtlas` (layout, weights, ridges/passes), `WorldTerrain` (height/colour, pure
    functions), `TerrainStreamer` (quadtree), `PropStreamer`/`PropLibrary` (rings, cells,
    collider groups), `Camps` (enemy camps), `Ambience` (motes), `BiomeLandmarks`.
  - `Game` calls `level.setViewer(camera position)` every frame and prewarms once at
    start (`setViewer(p, true)`). Camera far plane is 9 km.
  - `ColliderWorld.beginGroup/endGroup/removeGroup` stream prop colliders.
  - `Atmosphere.biomeDriven` + `setWeights` blend presets; `DEBUG_PRESETS` are keys 1–4,
    and 0 hands the sky back to the biomes.
  - `rangeClipped()` materials hand props from the mid to the far ring at 280 m.
  - Budgets at the five anchor sites (software GL, so counts not timings): 94–160 terrain
    tiles (≈200–370k triangles before frustum culling), 80–210 prop meshes.

- **Job 7 — Atlas, gates and map** (`src/world/biomes/Atlas.ts`, `ChapterGates.ts`,
  `src/ui/WorldMap.ts`, `src/core/Progress.ts`):
  - `ATLAS` holds 8×5 `BiomeDef`s built with `variant()`; `CHAPTERS` names the chapters.
  - `BiomeDef.landmark` picks one of ten landmark builders and its accent colour.
  - `World.gates` (`ChapterGates`): gate veils + removable gate colliders, permanent walls
    on ridge crests / hub rampart / world edge. `level.gateHint` feeds `GameHud.setHint`.
  - `Game.progress` (`Progress`) ← `World` (discoveries), `EnemyDirector.onCleared`
    (encounters), gates. `Game.worldMap` (M); `Game.menuOpen` pauses for any menu.

- **Job 8 — Bosses** (`src/enemies/bosses/`, `src/enemies/Hazards.ts`, `src/ui/BossHud.ts`):
  - `Boss` extends `Enemy` (kind `'boss'`); `Gloomhorn`, `Vermilion`, `Sovereign` build their
    move lists. `BossArena` + `EnemyDirector.addArena/arena/activeBoss/intro`; callbacks
    `onBossIntro` (freeze + title), `onBossBegin` (unfreeze, face the boss), `onBossDefeated`.
  - `World.bossArenas` (flattened with `WorldTerrain.addPlateau`), gate `bossRequirement`.
  - `Game.updateCinematic()` drives the intro camera; `Game.finale` after the Sovereign.
  - Models: Gloomhorn = shadow-demon GLB, Vermilion = animated red-dragon GLB; both have
    procedural stand-ins until loaded. The Sovereign is procedural.

- **Job 9 — Story, shrines, saves** (`src/story/Lore.ts`, `src/world/StoryProps.ts`,
  `src/world/Interactions.ts`, `src/ui/StoryUI.ts`, `src/core/SaveGame.ts`):
  - `World.story` (`StoryProps`): `shrines` (41; `threshold` wraps the hub's `EmberShrine`,
    the rest are unlit `EmberShrine(m, seed, false)` beside each landmark) and `lore`
    spots (43 tablets + 8 memorials). Kindled shrines join the light-anchor pool.
  - `Game.interactions` picks the nearest page/shrine/lore/Wanderer each fixed step; F calls
    `interact()`; its `prompt()` feeds the SpellbookUI prompt line.
  - `Game.restAt(shrine)` (refused while `restBlocker()`), `travelTo(shrine)`,
    `readLore(spot)`, `talkToWanderer()`/`wandererLine()`; `Game.storyUI` (reader, rest
    menu, journal on J). `Player.setRespawn` moves the death/R spawn point.
  - `Game.save` (`SaveGame`): `snapshot()` → localStorage; `saveNow()`, debounced
    `requestSave()` (progress `onChange`, book revision, deaths), `pagehide`. Startup
    `applySave()` → `Progress.load`, `EnemyDirector.restore`, `ChapterGates.sync`,
    `SpellCasting.restore`, lit shrines, respawn at the saved shrine. `Game.resumed`.
  - `GameOptions.save/fresh` (URL: `shot=1` disables saving unless `save=1`; `fresh=1`).
  - Boss kills add `REMEMBRANCES` to `progress.remembrances`.

**Job 9 verification:** build passed; save 25/25, boss 15/15, atlas 17/17, world 19/19,
enemy 26/26, spells 38/38, kinetic 17/17, movement 11/11, combat 11/11. Screenshots:
shrine, rest-menu, lore-reader, journal, wanderer.

**Job 8 verification:** build passed; boss 15/15, atlas 17/17, world 19/19, enemy 26/26,
spells 38/38, kinetic 17/17, movement 11/11, combat 11/11 (see the session
note). Screenshots: boss-intro, boss-gloomhorn, boss-vermilion, boss-sovereign.

**Job 7 verification:** build passed; atlas 17/17, world 19/19, enemy 26/26, spells 38/38,
kinetic 17/17, movement 11/11, combat 11/11 (see the
session note). Screenshots: bones, great tree, portal, ruins, arch, gate, map.

**Job 6 verification:** build passed; world suite 19/19; enemy 26/26, spells 38/38,
kinetic 17/17, movement 11/11, combat 11/11. Screenshots inspected: spawn, hub-exit,
wilderness, marsh, terrace, caverns, bloodstone, world-high.

**Job 5 verification:** build passed; enemy suite 26/26, spells 38/38, kinetic 17/17,
movement 11/11, combat 11/11 (all run on Linux with software WebGL via `render=0`).
Knight, ruin and wizard-cast screenshots inspected. No GPU was available in this
session, so no frame-time numbers were taken.

---

## 4. How to verify work (important)

- `npm run typecheck` and `npm run build` must pass.
- `npm run savetest` must pass (25 checks: shrine/lore placement and spacing, kindle and
  rest, fast travel, death respawn at the shrine, rest refused mid-fight, lore reading,
  memorials, journal, the Wanderer's lines, remembrances, save/autosave/resume, fresh,
  corrupt saves, Begin anew). It uses localStorage on the test origin and cleans up.
- `npm run bosstest` must pass (15 checks: arenas, intro, full movesets per phase, phase
  roar, posture break, parry, Vermilion knockdown, jumpable shockwaves, reset on death,
  gate unlock, hub dragon, finale, boss bar).
- `npm run atlastest` must pass (17 checks: atlas data and variants, landmark kinds,
  walls, gates, progress, discovery, map).
- `npm run worldtest` must pass (19 checks: layout, hub preservation, continuity,
  ridges/passes, archetype signatures, tile coverage and LOD, streaming budget, prop
  colliders, hub free of biome props, sky per biome, crossfade, titles, camps, walking out).
- `npm run enemytest` must pass (26 checks: perception, LOS, telegraph timing, attack
  tokens, parry/expose, guard/poise/back rune, spell pierce, perfect dodge, body collision,
  water avoidance, wizard blink/lance/flash/orb reflect/dodge/interrupt, well pull,
  dissolve, leash, encounter waves/reward/reset, pause, target frame).
- **Linux / containers:** the tools find Playwright's Chromium (`PLAYWRIGHT_BROWSERS_PATH`)
  and add `--no-sandbox`. Logic suites append `render=0` so they run at 60 Hz even on
  software WebGL (set `RENDER=1` to keep drawing). Screenshots still render (slowly).
- `npm run spelltest` must pass (38 checks: world pickups, actual training-target
  spell impacts, costs, effects, collision, growth, death, menus and responsive fit).
- `npm run assets:validate` checks all 40 GLBs, embedded textures and geometry.
- `npm run assettest` checks all model loads, normalization, clone independence,
  animation samples and game integration, and captures asset contact sheets.
- `npm run combattest` must stay at 11/11 (combo damage, Momentum, hit-stop, parry, dodge,
  Rune Burst, Resonance discount, death/respawn, construct attacks).
- `npm run movetest` must stay at 11/11. It drives the character with real key events in
  headless Chrome and asserts run speed, jump apex (held vs tapped), dash, slide, ramp
  acceleration, wall-jump, step-up, swimming and no NaN/fall-through.
- `npm run shot` opens headless Chrome through puppeteer-core with `--use-angle=d3d11`, on
  the real GPU. It saves PNGs of named views (spawn, spawn-bands, spawn-blood, plaza,
  castle, lake, day) to `screenshots/`. **Look at the PNGs** to judge the visuals.
- `npm run shot -- --view=spawn --w=1920 --h=1080 --perf` gives ms/frame (capped at 60).
  Headless timings are noisy, so compare whole frames only.
- Custom shot: `npm run shot -- --name=x --cam=X,Y,Z --look=X,Y,Z --preset=blood-moon --bands`.
- Player shots use `at=x,y,z` + `yaw=deg` instead of cam/look (views `hero`, `hero-run`,
  `hero-slide`, `hero-air`, `hero-shaft`, `course`). A view can list `hold: ['w','Control']`
  to hold keys before the shot, which is how action poses get captured.

## 5. Pitfalls already hit

- This machine uses PowerShell. Prefer file-based scripts for multiline code and
  careful shell quoting. Blender includes Python; see the asset pipeline paths.
- Pixel textures are painted top-down and **flipped on upload** in `toTexture()`. Without
  the flip, the grass cards render upside down.
- Unit-scale instanced geometry (pines are scaled ×10–20) needs small UV tiles
  (cone tile 0.06), or textures turn into giant checkerboards.
- `MeshToonMaterial` has no `flatShading`. Use non-indexed geometry to get flat normals.
- Distance fog that uses the moon's full glow washes silhouettes pink. `fogHaze()` uses
  0.4× glow.
- Keep landmark sightlines clear: the level removes trees in a wedge toward the citadel
  and cuts a terrain valley.
- Ground snapping must preserve the contact normal, or slides stop accelerating downhill.
- The chase camera must clamp to a minimum boom and hide the body when very close, or it
  ends up inside the character's head in tight spaces.
- `MeshToonMaterial` has no `flatShading`; `as const` on the tuning table makes literal
  types that block runtime tuning.
- Restoring an array by setting `.length` can *grow* it with `undefined` holes — the
  controller's contact list hit this and killed the game loop. Restore by copy.
- Hit-stop nearly freezes the fixed clock, so edge-triggered input must not be cleared on
  frames where no fixed step ran, or combo inputs vanish exactly when players press them.
- Place new set-pieces away from existing ones: the training yard first landed inside the
  trial course's slide tunnel.
- Round bodies deflect rather than stop: a player running at an enemy slides around its
  cylinder. Test "no overlap", not "cannot get past".
- Encounter trigger circles fire whenever the player enters them, including in tests and
  screenshots that teleport the player; call `game.enemies.clear()` to isolate a scenario.
- Streamed worlds need their viewer: after teleporting in a test, call
  `game.level.setViewer(position, true)`, or props/colliders near the new spot won't exist.
- Never add `PointLight`s per landmark: every lit material evaluates every light. Use the
  world's anchor pool.
- The pass ramps must not be gated by the ridge falloff (that left a 38 m seam once);
  `worldtest`'s zoomed continuity check catches this class of bug.
- Anything that must happen when a cinematic ends belongs in a director callback, not in
  camera code: `Game.step()` never runs the camera path, and an intro that starts and ends
  between rendered frames left the player frozen once.
- Spawning enemies are immune (they are still rising). Tests must step past the rise
  before striking them.
- Headless tests racing the render loop: after a real key press, wait for a frame
  (`requestAnimationFrame` twice) before asserting.
- Leaving a page runs `pagehide` → `saveNow()`. A test that plants a save and then
  navigates must stop the old page from saving first (`game.resetting = true`), or the
  old page overwrites it.
- Anything placed near landmarks must reserve its ground (`ReservedMap.add`) and search
  for free, dry, gentle ground; the first shrine/tablet placer fell back to one fixed
  spot and stacked a shrine on a tablet.

---

## 6. Next: Job 10 — Audio, UI & Polish

- Procedural chill-fi ambient score + SFX (WebAudio).
- Main menu (Continue / New Journey using `Game.resumed` and `SaveGame`), settings
  (pixel scale, band count, keybinds), final HUD.
- Pixel bloom/glow pass, performance pass, production build.

See ROADMAP.md's Notes for Job 10.
