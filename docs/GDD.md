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
- **Movement verbs:** run, jump, physics slide, wall-slide, wall-jump, 8-way dash.
  Momentum carries between verbs (slide → jump keeps speed, dash cancels recovery).

- **Spellblade loop:** melee builds Momentum, spells spend it, evasion refunds it.
- **Momentum Pool (no mana):** a 0–100 meter (implemented in Job 3).
  - +8 per sword hit, +12 heavy, +15 per perfect dodge (dash i-frames), +25 per parry
  - Drains 6/s after 2.5 s without aggression
  - Spells cost 20–60. Filling it enters *Resonance* (spells −50%) until it drops below 35

### Attack set (Job 3, `ATTACKS` in PlayerCombat.ts)
| Input | Attack | Damage | Notes |
|---|---|---|---|
| LMB ×3 | slash → backhand → spin | 11 / 13 / 20 | chains through recovery; dash or jump cancels |
| RMB (hold) | charged overhead | 26 → 44 | 0.85 s stagger, biggest hit-stop |
| LMB while dashing | thrust | 16 | keeps dash speed |
| LMB while sliding | low sweep | 15 | 0.6 s trip |
| LMB airborne | plunge | 24 + 3.2 m shockwave | slams to the ground |
| Q tap → LMB | parry → riposte | 34 | parry staggers the attacker for 1.3 s |
| E | Equipped spell (Rune Burst initially) | spell-dependent | costs Momentum; half cost in Resonance |

Hit detection sweeps an **analytic blade arc**, not the animated mesh, so hitboxes are
identical at any framerate. Impacts apply hit-stop, screen shake, knockback and stagger.

### Measured movement (Job 2, `npm run movetest`)
| Action | Value |
|---|---|
| Run speed | 9.2 m/s |
| Jump (held / tapped) | 2.26 m / 1.27 m apex, ~0.7 s airborne |
| Dash | 26 m/s burst, 0.16 s, 3 charges, 1.05 s refill each |
| Slide | boosts to 12.6 m/s, reaches 19.5 m/s down the trial ramp |
| Wall-jump | ~2.0 m rise + 8.5 m/s away from the wall |
| Gravity | 30 m/s² (×1.3 falling, ×1.85 on early jump release) |

Physics is a **custom kinematic controller**, not a rigid-body engine: the capsule is a
stack of spheres resolved against an analytic terrain height function plus primitive
colliders. Acceleration is Quake-style, so speed gained from slides and dashes survives
strafing instead of being clamped to the run speed.

## Pillar 3 — The Living Spellbook
- The spell inventory is a **physical book** worn at the hip. It floats open when casting.
- Each **Lost Page** found in the world adds one unique spell.
- The book mesh is rebuilt from game state: thickness = page count;
  ornament tier (leather → brass corners → gilded clasp → runic glow) = milestones.
- Implemented in Job 4: thickness updates on collection; ornaments appear at 3, 5
  and 8 pages. F binds nearby pages; B reads the book; hold Tab selects a spell;
  E casts. Both menus pause gameplay and keep keyboard focus inside the menu.
- Eight spells: Rune Burst, Ember Lance, Frost Needle, Violet Well, Windstep,
  Updraft, Ember Ward and Mend. See README for costs/effects and the book for clues.
- Pages persist through death and are saved with the journey (Job 9).

## Pillar 4 — World Structure

### Implemented in Job 6 (the world engine)
The world is a 9 km disc. The Threshold (the Job 1–5 diorama) is the hub at its centre.
Eight chapter sectors of 45° fan out clockwise from due north, each with five biome
sites. Jagged 60–130 m ridges separate chapters, with one walkable pass between each
consecutive pair (the Chapter VIII → I ridge is sealed). The hub's only exit is its
northern valley into Chapter I, where the Spire Citadel now stands 1.5 km away.
World-edge mountains ring everything at 4.1–4.75 km.

| Archetype | Ground | Props | Sky | Landmark |
|---|---|---|---|---|
| Tranquil Wilderness | rolling hills, lakes | pines, broadleaf, meadow flowers | Sunlit Wilderness | Wayward Watchtower |
| Violet Marshes | flat, half glowing pools | reeds, glowing mushrooms, dead trees, obelisks | Violet Marshes | The Drowned Circle |
| Sunkeeper's Terrace | 2 m stepped lawns, turquoise pools | columns, blossom trees | Sunkeeper's Dusk | Temple of the Low Sun |
| Crystal Caverns | 40 m massif with an ice basin under a rock roof | crystals, ice spikes, bones | Crystal Caverns | The Singing Hall |
| Bloodstone & Shadow | 34 m plateau cut by red canyons | red spires, dead trees, bones | Crimson Vigil | Citadel of the Red Hour |

Biome borders blend over ~80 m (ground, colour and vegetation interleave); the sky blends
over ~300 m and eases over about a second. Entering a new region shows its title card.

### The atlas (Job 7)
| Chapter | Name | Biomes |
|---|---|---|
| I | The Tranquil Reach | Tranquil Wilderness · Mirrorlake Shallows · Emberleaf Grove · Highpine Ridge · Glimmer Meadows |
| II | The Violet Fen | Violet Marshes · Lantern Bog · Drowned Chapel Fen · Wisp Hollows · Mirefall Thicket |
| III | The Sunkeepers' Coast | Sunkeeper's Terrace · Gilded Cascades · Coral Colonnade · Heliotrope Gardens · The Drowned Agora |
| IV | The Crystal Deep | Crystal Caverns · Rimefrost Galleries · Rosequartz Vault · Geode Chasm · The Frozen Echo |
| V | The Bloodstone Wastes | Bloodstone & Shadow · Carmine Canyons · Spirefield of Night · Ossuary Flats · The Weeping Portals |
| VI | The Ashen March | Ashfall Barrens · Cinder Marsh · Obsidian Steps · Smoulder Wood · Emberdeep |
| VII | The Frozen Choir | The Choir of Ice · Snowbound Pines · Frostmere · Glacier Terraces · Aurora Steppe |
| VIII | The Last Garden | Garden of the Last Sun · Starfall Grove · Moonpetal Marsh · Celestine Caverns · The Heart of the Moon |

**Gating:** each chapter's pass is sealed by a veil of mist until three of the chapter's
camps are cleared (Job 8 adds its boss). The map (M) reveals regions as they are found.
- Elden Ring-style pacing: long walks, landmarks visible from far away (made readable by
  Smart-Pixel), and a story found organically.
- **40+ biomes in 8 chapters of 5.** Required archetypes are anchored as:
  - Ch.1 *Tranquil Wilderness* (pine lakes, sunlit)
  - Ch.2 *Violet Marshes* (bioluminescent wetlands)
  - Ch.3 *Sunkeeper's Terrace* (classical ruins over colourful water)
  - Ch.4 *Crystal Caverns* (ice + pink/blue crystal)
  - Ch.5 *Bloodstone & Shadow* (red canyons, gothic citadels, portals)
  - Ch.6–8: expansion variants (see Job 7)

## Pillar 5 — Enemy Ecology
- **Shadow Knights:** armoured, methodical, glowing seams; test parry + heavy sword.
- **Sunkeeper Wizards:** evasive, blinding light, long-range AoE; test movement.
- **Dark Fauna:** colossal beasts and dragon-kin as regional bosses.

### Implemented in Job 5 (`src/enemies/`)
**Shared rules.** Enemies perceive through a view cone plus a hearing radius, with
line-of-sight sweeps; awareness fills faster up close. Allies in an encounter share
alerts. At most 2 melee and 2 ranged enemies commit to attacks at once, with 0.35 s
between attack starts, so every telegraph is readable. Dragged beyond their leash,
enemies walk home and heal. Deaths dissolve through a dithered pixel shader. Killing a
knight pays 15 Momentum (wizard 10); clearing an encounter restores Vigour and Momentum.

| Shadow Knight (190 HP) | |
|---|---|
| Guard | While duelling, frontal blows deal 20% and drain poise (100). Light 17, spin 26, heavy 55, plunge 60, riposte 100, spells 32. Poise 0 = guard break: 1.8 s stagger + exposed |
| Weak point | The rune on its back: ×1.5 and ignores the shield |
| Parry | Parrying any swing staggers it 2.1 s and exposes it (×1.6 damage) |
| Armour | Light hits never interrupt its swings; heavy, plunge, riposte and ≥1 s-stagger spells do. Spells pierce the shield |
| Cleave → backhand | 0.55 s tell, 16 dmg; 45% chains a 0.38 s backhand (14) |
| Doom Descent | 1.05 s overhead with blazing seams, 30 dmg — the parry bait |
| Lunge | From 5–9 m: 0.5 s tell, then a 13 m/s thrust (18). Perfect-dodge it |

| Sunkeeper Wizard (95 HP) | |
|---|---|
| Range | Keeps 10–24 m; blinks (3.8 s cooldown) to perches or open ground 12–17 m away when the player closes to 6.5 m |
| Sun Orb | 0.6 s cast, 15 m/s gently homing orb, 14 dmg. Dash through it, or parry to reflect it for 34 |
| Solar Lance | Marks a 3.2 m circle where the player is heading; light falls 1.15 s later (24 dmg) |
| Blinding Flash | 0.95 s halo swell; bursting within 22 m blinds a player looking within 40° of it for 1.8 s (partial further out). Look away or break line of sight |
| Fragile | Any hit of 8+ damage during a cast interrupts it |

### Bosses (Job 8)
Every boss telegraphs, has phases (with a roar that shrugs off damage), and a **posture**
meter that breaks into a long stun. Specific moves have **parry windows**. Arenas seal with
mist after a short cinematic; dying resets the fight.

| Boss | Where | Signature | Answer |
|---|---|---|---|
| **Gloomhorn**, the Mire Colossus (900) | Chapter II, a mudflat in Mirefall Thicket | slam → ground shockwave; lane charge; swipe | jump the wave, step off the lane, parry the swipe; below half it summons knights and spike lines |
| **Vermilion**, Wyrm of the Red Hour (1200) | Chapter V, beside the Citadel of the Red Hour | airborne fire volleys, breath runs, dives, meteor rain | **parry a fireball back** to knock it down, then bite/tail/gust on the ground; wings tear at 25% (fire novas) |
| **The Pale Sovereign**, Who Kept the Moon (1500) | Chapter VIII, before the Pale Citadel | great cleave, Moon Descent, moon blades, blink strikes, lunar lances, Moonfall | parry the cleaves, reflect the blades, read the lances, find the gaps in the moonfall |

Gloomhorn and Vermilion also hold the keys to their chapters' gates.

## Story, Shrines & Saves (Job 9 · serves Pillar 4)
The story is never narrated; it is found. **The Long Night:** the Sunkeepers kept the
day, the Moon-kings the night. The last Moon-king, the **Pale Sovereign**, could not bear
endings and chained the moon to the world. Night has lasted four hundred years and the
chained moon bleeds (the red moon in every sky). The **Emberwardens** planted their swords
in the last fires to keep them burning — those are the Ember Shrines. The player is the
last Emberwarden, woken at the Threshold by a hooded **Wanderer**.

| Chapter | Arc |
|---|---|
| Threshold | The last lit shrine; the Wanderer; the way north |
| I · Tranquil Reach | Peace that remembers; an empty keep; a door to a morning that never comes |
| II · Violet Fen | Where Moon-kings were crowned; Gloomhorn, a gentle colossus poisoned by the moon's tears |
| III · Sunkeepers' Coast | The sun-order's terraces; Keepers praying with burned eyes |
| IV · Crystal Deep | The moon's tears frozen into singing crystal |
| V · Bloodstone Wastes | The war on the sun; Vermilion, the sun's dragon, its fire stolen |
| VI · Ashen March | A kingdom burned to hide the moon's wound |
| VII · Frozen Choir | The choir that sang the moon down |
| VIII · Last Garden | The Sovereign's garden where nothing ends; the Pale Citadel |

How it is told:
- **Lore tablets** — one beside every landmark (40) and three in the hub; short, concrete
  fragments (logs, notes, inscriptions). Unread ones are marked ✦ in the prompt.
- **Memorials** — one kneeling Emberwarden per chapter with a one-line epitaph; the last
  one has your face.
- **Remembrances** — item descriptions left by each boss.
- **The Wanderer** — one line at a time, changing with the journey.
- **Journal (J)** — collects chapter arcs as chapters are discovered, fragments read (gaps
  shown), and remembrances.

**Ember Shrines:** 41 (the Threshold + one per landmark), unlit until found. Resting
(F) heals, resets spell cooldowns and any fight in progress, sets the respawn point and
saves. It is refused mid-fight. The rest menu fast-travels between kindled shrines,
summarises the journey and offers *Begin anew* (confirmed).

**Saves:** localStorage, one slot. Everything in `Progress`, the spellbook, the rest
shrine, play time and deaths. Written on rest/travel, shortly after any progress, and
when the page closes.

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

**Menus.** A title screen over a slowly drifting view of the Threshold (Continue shows
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
  enemies/                EnemyDirector, Enemy base, Perception, AttackTokens, Telegraphs,
                          EnemyProjectiles, Hazards, Encounters, ShadowKnight, SunkeeperWizard
  enemies/bosses/         Boss framework, BossArena, Gloomhorn, Vermilion, Sovereign
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
  world/                  World (streamed level), ProvingGrounds (the hub), prop builders,
                          StoryProps (shrines, tablets, memorials), Interactions (F)
  world/engine/           WorldAtlas, WorldTerrain, TerrainStreamer, PropStreamer/Library,
                          Camps, Ambience
  world/biomes/           BiomeTypes, Archetypes, Chapters, BiomeLandmarks
  debug/                  fly camera, debug HUD
tools/screenshot.mjs      headless Chrome screenshots for visual verification
tools/movetest.mjs        headless movement assertions
tools/combattest.mjs      headless combat assertions
tools/spelltest.mjs       spell behavior, pickups, progression and menu assertions
tools/kinetictest.mjs     first-person camera and kinetic movement assertions
tools/enemytest.mjs       deterministic enemy/encounter assertions (Game.step)
tools/worldtest.mjs       world layout, streaming, biome and camp assertions
tools/atlastest.mjs       atlas, landmarks, gates, map assertions
tools/bosstest.mjs        boss framework and fight assertions
tools/savetest.mjs        shrines, lore, journal, Wanderer and save/load assertions
tools/uitest.mjs          audio, menus, settings, rebinding, HUD and bloom assertions
tools/buildtest.mjs       production build smoke test
tools/perf.mjs            CPU frame-cost profiler
```
