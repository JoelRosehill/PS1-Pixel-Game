# Project Chromatic Odyssey — Game Design Document

**Genre:** "Chill-Fi Dark Fantasy" Action-RPG, first-person (the composite's third-person
framing was used through Job 4; a kinetic pass moved the camera into the eyes)
**Tone:** the world feels mesmerizing and peaceful, and the combat is violent,
fast and heavy. That contrast is the whole identity of the game.
**Visual references:** [`reference_img/`](../reference_img/). The key frame is the composite:
a mossy castle, a glowing turquoise moat, a blood moon under purple cosmic clouds and a
distant spire citadel.

---

## Pillar 1 — Smart-Pixel Visuals

### Depth-banded pixel rendering (no global pixel filter)
The camera frustum is cut into **depth bands**. Each band is rasterised into its own
render target at its own resolution, then all bands are composited front-to-back:

| Band | Distance | Pixel scale* | Reads as |
|------|----------|--------------|----------|
| 0 | 0 – 16 m | ×1 | Crisp HD pixel art (player, sword, ground) |
| 1 | 16 – 40 m | ×2 | Detailed pixel art |
| 2 | 40 – 100 m | ×3 | Chunky |
| 3 | 100 – 240 m | ×5 | Blocky |
| 4 | 240 – 650 m | ×8 | Abstract shapes |
| 5 | 650 m – ∞ | ×12 | Blocks of colour (mountains, citadels) |
| Sky | — | ×3 | Pixel sky, chunky stars |

\*×1 = one "base pixel", about `screenHeight / 540` device pixels (2 px at 1080p).
The table is `PIXEL_MODES` in `src/render/SmartPixelRenderer.ts`.

- Geometry is rasterised *natively* at low resolution, so we get true pixel-art
  aliasing, not a blurred downscale.
- Neighbouring bands overlap by 22%. The seam is **ordered-dithered** on the coarser
  band's pixel grid, so there are no hard lines.
- Bands 0–1 get **pixel outlines** (a 1-pixel dark silhouette edge). A planarity test keeps
  ground at grazing angles from being outlined.
- **Colour quantisation + Bayer dithering** gives a limited-palette feel.
- **Height fog sampled from the sky:** exponential fog is integrated along each ray and
  coloured by the sky haze in that direction. Valleys fill with mist, spires stay
  readable, and silhouettes stay darker than the moon behind them
  (like `reference_img/48c9…png`).
- **Performance:** the compositor runs on the base-pixel canvas, then does a
  nearest-neighbour upscale. The nebula is baked into a cubemap once. The shadow map
  renders once per frame, not once per band. Result: 60 fps at 1080p on an Intel UHD 770
  (integrated GPU).

### Atmospheric skies
Sky presets drive the whole mood *and* the scene lighting:
blood moon (huge, cratered, haloed), nebula dust in purple/pink/green, oversized
4-point coloured stars, pixel clouds, sun for day biomes.

### Environmental contrast
Gothic, dark architecture set against saturated, calm nature (glowing water,
flower meadows, pine lakes).

---

## Pillar 2 — Combat & Movement
*As remade in Jobs 12, 13 and 15b; history in ROADMAP.md.*

- **Movement verbs:** run (9 m/s), jump (2.3 m held / 1.3 m tapped), physics slide,
  wall-run, wall-jump, air slam, and a **dash** with 2 charges (1.45 s refill each),
  25 m/s × 0.18 s, i-frames only for the first 0.13 s, one air dash per jump.
- **Feel:** stride view bob with a figure-eight sway, landing dip scaled by fall speed,
  lean into strafes, dash roll and FOV punch; the hands and sword lag and sway.
- **Momentum (no mana):** 0–100, starts full and never drains. **Hold Shift standing
  still to channel** (+42/s after 0.35 s) — easy alone, dangerous in a fight: a hit while
  channelling lands 30 % harder and breaks the channel. Hits, parries and perfect dodges
  add a little. Spells and Sword Arts spend it; Resonance at 100 halves spell costs.
- **The sword reaches:** LMB ×3 slash → backhand → spin that throws a crescent (12 m);
  hold after a slash to charge a heavy that looses a vertical crescent (three in a fan at
  full charge); dash + attack fires a lance of light; slide + attack sends a ground wave;
  plunges land with a ring of stone spears; Q parries (riposte for 48).
- **Sword Arts** (R, X cycles): Moonlit Crescents and Skyfall at the start; Tempest Cross,
  Phantom Blades, Bloodmoon Rend and Sunder come from the bosses' remembrances.
- **Starbolts** (RMB hold): free, 5/s, lightly homing — ranged pressure that never needs
  Momentum. **Ember Flasks** (G): 3+ charges, 45 health, refilled at shrines.
- The blade is the supplied ps1-sword-b, swung through keyed arcs around a shoulder pivot
  with a ribbon traced by the blade; hits use an **analytic blade arc**, so hitboxes are
  identical at any framerate. Impacts apply hit-stop, shake, knockback and stagger.

Physics is a **custom kinematic controller**: the capsule is a stack of spheres resolved
against the analytic terrain plus primitive colliders; Quake-style acceleration keeps
earned speed.

## Pillar 3 — The Living Spellbook
- The **Chromatic Codex**, written by Isolde, worn at the hip; thickness and ornaments grow
  with its pages. F binds a found page, B reads the book, hold Tab (or 1–0, −, =) selects,
  E casts; the mouse wheel cycles.
- **12 pages:** Starfall (bound from the start), Comet Lance, Chain Storm, Glacial
  Rupture, Void Maw, Phoenix Flight, Moon Aegis, Blood Bloom, Prism Ray, Wisp Choir,
  Windstep and Eclipse. The other eleven lie along the Long Road where their clues say
  (Windstep on the fallen keyboard in the Obsolete Sea, Eclipse in Isolde's keeping).

## Pillar 4 — World Structure: the Long Road
*Job 15.* One authored journey of 21.7 km: a road spiralling inward from **Hollowmere**
on the western rim to the **Dawnspire** at the centre of the world, through 40 biomes in
8 chapters of 5, in a fixed order. Colossal mountains (200–700 m) wall every valley and
separate the turns of the spiral; the Sunkeepers' Coast opens onto the sea. Chapters meet
at gorges spanned by colossal gateways of mist, which open once three of the chapter's
camps are cleared and its boss has fallen. The Dawnspire (1.3 km) and the Chain rising
from it to the moon are the lodestar over every horizon.

| Chapter | Biomes (in road order) | Boss |
|---|---|---|
| I · The Hollow Reach | Hollowmere · Whisperpine Wood · Mirrorlake · The Graveyard of St Aldric · Highpine Gate | Morrow the Gravewarden |
| II · The Violet Fen | Lantern Bog · The Violet Marshes · Drowned Chapel Fen · Wisp Hollows · The Drowned Circle | Gloomhorn |
| III · The Sunkeepers' Coast | Sunkeepers' Terrace · Gilded Cascades · Coral Colonnade · Heliotrope Gardens · Temple of the Sun | Solenne |
| IV · The Crystal Deep | Rimefrost Galleries · The Crystal Caverns · Rosequartz Vault · Geode Chasm · The Frozen Echo | The Glutton Below |
| V · The Bloodstone Wastes | Bloodstone and Shadow · Carmine Canyons · Spirefield of Night · Ossuary Flats · The Red Keep | Vermilion |
| VI · The Knight's March | Ashfall Barrens · The Sword Graveyard · Cinder Marsh · Smoulder Wood · Caddoc's Moat | Sir Caddoc |
| VII · The Dreaming Wastes | Snowbound Pines · The Obsolete Sea · Bard's Rest · The Humming Orchard · The Hive | The Hive Queen |
| VIII · The Dawnspire | Garden of the Last Sun · Starfall Grove · The Pale Cathedral · The Chain Road · The Dawnspire | Maelor |

**Structures** (the user's supplied models) stand on levelled ground in the biomes they
belong to: St Aldric's chapel and graveyards, the Highpine Wall, the forest dioramas, the
Temple of the Sun under its kept sun, the Crimson Pavilion, the Red Keep, the Sword
Graveyard, Caddoc's moat keep, the Obsolete Sea (CRT, keyboard, mouse, CPU), the Bard's
Rest (a colossal guitar) and the Pale Cathedral. Nothing is piled up at the start.

## Pillar 5 — Enemy Ecology
*Jobs 11 and 14.* Every enemy and boss is one of the user's PS1 creatures, rigged and
animated in Blender (`tools/creatures/`).

**Normal foes are average, Elden Ring style:** readable wind-ups timed to the animation's
hit frame, at most two attackers at once, poise and armour, guards that chip frontal
blows (spells and backstabs get through), parry → stagger → exposed (×1.6), backstab ×1.3,
leash and heal. They grow tougher along the road (health +16 %, damage +10 % per level).

| Foe | Model · weapon | Where |
|---|---|---|
| Pale Hollow, Crystal Hollow | pale | I–II, IV |
| Hollow Pilgrim | pale · sickle | I–III, VII |
| Stitched Brute | nemesis · machete | I, V |
| Shadow Knight | nemesis · long sword, guard | I, III, VI, VIII |
| Ashen Knight | nemesis · war axe | V–VI, VIII |
| Sunkeeper | wanderer · orbs, blink, sunfall | III, VII–VIII |
| Umbral Stalker | demon | II, IV–V |
| Pale Gnawer | bingus | I, IV, VII |
| Gloom Wasp | bee (flies) | II, VII |
| Nightmare Steed | horse | VI, VIII |
| Wyrmling | dragon (small) | V |

**Bosses are hard:** eight multi-phase creature fights with posture breaks, parry
windows and sealed arenas across the road before each gate (an idle player dies in
6–20 s). Morrow (nemesis with a war axe), Gloomhorn (demon), Solenne (wanderer under a sun
halo), the Glutton Below (bingus), **Vermilion** (the dragon — ground and air; a reflected
fireball knocks it down; its wing tears in the last phase), Sir Caddoc (a rider who
dismounts), the Hive Queen (flying, summons daughters) and Maelor, the Pale Sovereign.

## Story, Shrines & Saves (Jobs 9, 16)
Told the Elden Ring way — in fragments, the kneeling dead, remembrances and one voice.
**Queen Liriel died at dawn.** King Maelor swore no dawn would come again and had Oswin
the Chainwright forge a Chain from his knights' oaths; the moon has hung above the
Dawnspire for four hundred years. Eight great servants each hold a Link. **Isolde** of
Hollowmere wrote the Chromatic Codex and walked the Long Road to break the Chain, hiding
its pages along the way. Her sister **Wren**, the last Emberwarden, wakes in burned
Hollowmere and follows. Oswin waits ahead at each chapter's first fire; before the
Dawnspire he confesses he forged the Chain. The ending: the Last Link breaks, the moon
goes home, dawn comes over Hollowmere.

- **Prologue** when a journey begins; **40 fragments** beside the road; **8 memorials**
  (the last is Isolde); **8 remembrances**, each breaking a Link and giving a gift (Sword
  Arts, vigour, flasks); the **journal** (J) collects arcs, fragments and remembrances.
- **Ember Shrines:** one where every biome begins (40), the first always lit. Resting heals,
  refills flasks, resets fights, sets the respawn point and saves; the rest menu
  fast-travels between kindled shrines.
- **Saves:** localStorage, one slot, written on rest/travel, after progress and on exit.

---

## Presentation: Sound, Menus & Polish (Job 10 · all pillars)
**Chill-fi score.** Everything is synthesised live (WebAudio), no audio files. A lo-fi
band plays in each chapter: FM electric piano, round bass, soft swung drums, a kalimba
melody that answers the chords every other phrase, and pads where the land feels open.
Each chapter has its own key, progression and tempo (the Reach is bright F major, the
Bloodstone Wastes sit in a Phrygian C minor, the Last Garden in D minor with a minor-
major tonic); beating the Sovereign turns the score to D major — the dawn. Fights make
the drums tighter and busier; bosses push the tempo with a four-on-the-floor kick and a
low drone. A tape wobble, a crackle bed and a speed-driven wind layer carry the
"chill-fi" texture; opening a menu sinks the music under a low-pass.

**Sound effects** are short and soft so they sit inside the mix: the parry is a bright
metallic ring, perfect dodges chime, each spell type has its own voice, enemy telegraphs
give a small two-note tell (audio support for readable attacks), bosses roar.

**Menus.** A title screen looking down Hollowmere's valley to the Dawnspire (Continue shows
the shrine and play time), Esc pauses, and settings cover audio levels, pixel size,
depth band count (a performance lever), pixel bloom, outlines, FOV, camera motion,
compass, hints, sensitivity/invert and rebindable keys. The ending card shows the
journey's stats.

**HUD.** Vigour/Momentum/dash bottom-left, speed bottom-centre, spell bottom-right, and a
compass at the top with the region name and an ember marker toward the nearest unlit
shrine (quiet exploration guidance in the Elden Ring spirit).

**Pixel bloom** glows in stepped, dithered rings on a quarter-size grid, so glow reads as
pixel art rather than a smooth blur.

## Code map
```
src/
  main.ts                 entry point
  core/                   Game loop, Input, TimeControl (hit-stop), seeded RNG, noise
  render/                 SmartPixelRenderer, compositor shader, sky, pixel textures, materials
  render/effects/         combat VFX pools (trails, sparks, rings, damage numbers)
  physics/Colliders.ts    static collision world (terrain + primitives, grid broadphase)
  combat/                 CombatWorld registry, Momentum pool, shared hit types
  spells/                 SpellBook data/progression, SpellCasting, PagePickups
  assets/                 ModelLibrary (supplied GLBs), Creatures (animated creature library)
  enemies/                EnemyDirector, Enemy base, Perception, AttackTokens, Telegraphs,
                          EnemyProjectiles, Hazards, Encounters, Bestiary, CreatureEnemy
  enemies/bosses/         Boss, BossArena, CreatureBoss, Roster and the eight bosses
  player/                 PlayerController (tuning), PlayerCombat (attacks), PlayerModel,
                          FirstPersonCamera, FirstPersonRig (hands/sword/book), Player
  ui/GameHud.ts           health / Momentum / dash HUD
  ui/SpellbookUI.ts       reading screen, quick-wheel and spell HUD
  ui/EnemyHud.ts          target frame (enemy name, Vigour, poise, state cues)
  ui/StoryUI.ts           lore reader, shrine rest menu (fast travel), journal
  ui/MenuUI.ts            title, pause, settings (rebinding), ending
  audio/                  AudioEngine, Music (procedural score), Sfx, Synth, SoundDirector
  core/Settings.ts        persisted preferences and rebindable actions
  story/Lore.ts           lore fragments, memorials, remembrances, arcs, Wanderer lines
  core/SaveGame.ts        localStorage save slot; core/Progress.ts shared progress
  world/                  World (the Long Road), prop builders, StoryProps (shrines,
                          tablets, memorials), Interactions (F)
  world/route/            Road (the spiral), Structures (supplied models, grounded),
                          Dawnspire (tower, Chain, moon anchor), ModelBounds
  world/engine/           WorldAtlas (sites by arc length), WorldTerrain (valleys,
                          mountains, plateaus), TerrainStreamer, PropStreamer/Library,
                          Camps, ChapterGates, Ambience
  world/biomes/           BiomeTypes, Archetypes, Atlas (biome variants), Journey (the
                          40 legs), Chapters, BiomeLandmarks
  debug/                  fly camera, debug HUD
tools/screenshot.mjs      headless Chrome screenshots for visual verification
tools/movetest.mjs        headless movement assertions
tools/combattest.mjs      headless combat assertions
tools/spelltest.mjs       spell behavior, pickups, progression and menu assertions
tools/kinetictest.mjs     first-person camera and kinetic movement assertions
tools/enemytest.mjs       deterministic enemy/encounter assertions (Game.step)
tools/worldtest.mjs       the Long Road: layout, terrain, structures, streaming, camps
tools/creatures/          Blender pipeline that rigs and animates the supplied creatures
tools/creaturetest.mjs    creature library assertions
tools/atlastest.mjs       biome order, structures in their biomes, valley edge, gates, map
tools/bosstest.mjs        boss framework and fight assertions
tools/savetest.mjs        shrines, lore, journal, Wanderer and save/load assertions
tools/uitest.mjs          audio, menus, settings, rebinding, HUD and bloom assertions
tools/buildtest.mjs       production build smoke test
tools/perf.mjs            CPU frame-cost profiler
```
