# Chromatic Odyssey

A "Chill-Fi Dark Fantasy" Action-RPG built with Three.js. The game is built in jobs.
See [docs/ROADMAP.md](docs/ROADMAP.md) for the plan and [docs/GDD.md](docs/GDD.md) for the design pillars.
**Continuing in a new AI session?** Start with [docs/HANDOFF.md](docs/HANDOFF.md).
The chat history that produced this project is archived in [docs/sessions/](docs/sessions/).

**The world is the Long Road** (Job 15): one journey of about 22 km, spiralling inward
from Hollowmere on the western rim to the Dawnspire at the centre of the world, through
40 biomes in 8 chapters. Colossal mountains wall every valley; chapters meet at gorges
held shut by a gateway of mist until the chapter's camps are cleared and its boss is
dead. The supplied structures stand, levelled and grounded, in the biomes they belong
to: St Aldric's chapel and graveyard, the Highpine Wall, the Temple of the Sun under its
kept sun, the Crimson Pavilion, the Red Keep, the Sword Graveyard, Caddoc's moat keep, the
Obsolete Sea, the Bard's Rest and the Pale Cathedral. The chain from the spire to the
moon is visible from everywhere. Press M for the map.

**The story** (Job 16): Queen Liriel died at dawn, and King Maelor chained the moon so no
dawn would ever come again. Your sister Isolde walked the Long Road to break the Chain
and never came back. You are Wren, the last Emberwarden. Eight great foes each hold a
Link of the Chain; Oswin, the masked Wanderer, waits ahead of you at each chapter's first
fire — and knows more about the Chain than he first admits.

**Enemies and bosses are the supplied PS1 creatures, rigged and animated in Blender**
(Job 11): twelve Bestiary foes (Job 14) and eight hard bosses — Morrow, Gloomhorn,
Solenne, the Glutton, the dragon Vermilion (ground and air), Sir Caddoc, the Hive Queen
and Maelor, the Pale Sovereign.

**Combat** (Jobs 12–13): view bob, a two-charge dash, Momentum you channel by holding
Shift while standing still, a sword that throws crescents and waves, six Sword Arts, free
Starbolts, Ember Flasks and a twelve-page Chromatic Codex. Ember Shrines along the road
let you rest, respawn and fast travel; the journey saves automatically.

## Run it

```bash
npm install
npm run dev        # open http://localhost:5173 and click to explore
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` then serve `dist/` | Static production build (relative paths; any web host) |
| `npm run build` | Typecheck + production bundle in `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run shot` | Headless screenshots of the standard views into `screenshots/` |
| `npm run shot -- --view=castle --perf` | One view, plus a frame-time measurement |
| `npm run movetest` | Headless movement assertions (run after touching the controller) |
| `npm run combattest` | Headless combat assertions (damage, parry, dodge, Momentum, death) |
| `npm run spelltest` | Spell effects, collisions, pickups, book growth and keyboard/menu checks |
| `npm run kinetictest` | First-person camera and kinetic movement (wall-run, slam, rebound) |
| `npm run enemytest` | Deterministic enemy AI, combat rules and encounter checks |
| `npm run worldtest` | The Long Road: layout, valleys and mountains, grounded structures, streaming, moods, camps |
| `npm run atlastest` | The 40 biomes in order, structures in their biomes, the valley edge, gates and the map |
| `npm run bosstest` | Boss arenas, intros, phases, movesets, parries, posture and victory |
| `npm run savetest` | Ember Shrines, fast travel, lore, journal, the Wanderer and save/load |
| `npm run uitest` | Score and effects (rendered offline), menus, settings, rebinding, HUD, bloom |
| `npm run buildtest` | Builds, serves and boots the production bundle |
| `npm run perf` | CPU frame cost at five places (simulation, streaming, AI, HUD) |
| `npm run assets:build` | Extract sources, convert with Blender, validate and rebuild the manifest |
| `npm run assets:validate` | Validate all GLBs and regenerate asset reports/manifest |
| `npm run assettest` | Load every model, check animations/clones and capture asset previews |

## Controls

| Key | Action |
|---|---|
| Mouse | Look (click the canvas to capture the mouse) |
| WASD | Move (camera-relative) |
| Space | Jump · wall-jump (hold for a higher jump) |
| LMB | Light attack (chains ×3; the finisher throws a crescent; contextual while dashing — lance of light, sliding — ground wave, airborne — plunge shockwave) |
| LMB (hold) | After a slash, charge a heavy; release to cleave and loose a crescent (three at full charge) |
| RMB (hold) | Starbolts from the book: free, rapid, lightly homing |
| Q | Parry (tap) · guard (hold) |
| E | Cast the equipped page (Momentum). Hold for Comet Lance (gather) and Prism Ray (pour) |
| Mouse wheel | Cycle owned spell pages |
| R | Sword Art (Momentum + cooldown) · X cycles arts |
| G | Drink an Ember Flask (3, refilled at shrines) |
| F | Use: bind a Lost Page · kindle/rest at an Ember Shrine · read lore · speak with the Wanderer |
| J | Journal (pauses): chapter arcs, lore read, remembrances |
| B | Open/close the spellbook; arrows or buttons turn pages and equip spells |
| M | World map (pauses): discovered regions, landmarks, camps, gates, chapter progress |
| Tab (hold) | Spell quick-wheel (12 pages); mouse/arrows/1–0,−,= choose, release Tab to equip; Esc cancels |
| Shift | Dash while moving (2 charges, short i-frame window, one per jump in the air) |
| Shift (hold, standing still) | Channel Momentum — fast, but rooted; a hit breaks it and lands 30 % harder |
| Ctrl / C | Slide (keeps momentum, accelerates downhill) · in the air: gravity slam (Space on landing to rebound) |
| W into a wall at speed | Wall-run (per-wall budget) · Space kicks off and refunds a dash |
| K | Return to the last shrine rested at |
| V | Debug fly camera (then WASD · Shift fast · Space/C up-down · G walk) |
| F6 | Toggle camera motion (FOV kick, wall-run roll, shake) |
| 1–4 | Debug sky presets: Cosmic Violet, Crimson Vigil, Sunlit Wilderness, Verdigris Mist |
| 0 | Return the sky to the biomes (after a 1–4 preset) |
| F1 | Render mode: Smart-Pixel / Flat HD / Global pixel filter (comparison) |
| F2 | Colour-code the depth bands |
| F3 · F4 | Toggle pixel outlines · palette quantisation |
| [ · ] | Change base pixel size |
| H | Debug overlay (frame rate, bands) |
| Esc | Pause menu: resume, journal, map, settings, save and return to title |

The book, quick-wheel, map, journal and shrine menus pause gameplay. Melee hits,
parries and perfect dodges earn Momentum; Resonance halves spell costs. Pages survive
death. Progress saves to the browser (localStorage) when you rest, shortly after
anything changes, and when the page closes; *Begin anew* at any shrine wipes it.

| Spell | Momentum | Effect |
|---|---:|---|
| Rune Burst | 40 | 30 damage in a 4.6 m radial shockwave |
| Ember Lance | 25 | 24 damage projectile with a 2 m impact burst |
| Frost Needle | 20 | 16 damage projectile; 1.6 s stagger |
| Violet Well | 50 | Four 9-damage pulses; pulls enemies inward |
| Windstep | 25 | Blink up to 7 m; stops before solid geometry |
| Updraft | 30 | Upward launch while preserving lateral velocity |
| Ember Ward | 35 | Halve incoming damage for 8 seconds |
| Mend | 45 | Restore up to 28 Vigour |

Missing pages have location clues in the book. Windstep is the reward at the end
of the Wayfarer's Trial. Spells have individual recovery times and cannot be cast
while staggered, dead, charging or in an active sword strike.

## Version

The title screen and menus show the version in the bottom-right corner:
`v<major>.<minor>.<commits>` — major/minor come from `package.json`, the last number is
the git commit count, so every commit bumps it automatically. `-dev` means the build has
uncommitted changes. Raise major/minor in `package.json` for big releases.

## Sound and settings

The music is generated live: each chapter has its own key, chords and tempo, fights make
the drums busier, bosses speed everything up, and the dawn after the final boss is in a
major key. Headphones recommended. Settings (title screen or Esc → Settings) cover volume
per bus, pixel size, **depth bands** (4 is fastest), pixel bloom, outlines, FOV, camera
motion, compass, hints, mouse sensitivity, invert Y and **key rebinding** (keys that
clash swap). Settings save to the browser separately from your journey.

## Enemies

- **Shadow Knights** hide behind tower shields. Frontal light hits barely scratch them;
  heavy blows, plunges and spells break the guard, and the glowing rune on their back is
  a weak point. Parry their swings (especially the slow, blazing overhead) to leave them
  open for a riposte.
- **Sunkeeper Wizards** keep their distance and blink away when you close in. Dash
  through or parry their orbs (a parry throws the orb back), keep moving when the ground
  glows gold, and look away when the halo swells to avoid being blinded.
- Encounters rise when you enter their ground and reset if you die or flee. Clearing one
  restores Vigour and Momentum.
- **Bosses** seal their arenas. Watch the telegraphs, jump the shockwaves, and parry the
  blows that glow longest. Heavy strikes and spells break their posture; a parried
  fireball brings the dragon down.

## Testing on Linux / in containers

The browser tools find Playwright's Chromium automatically and add `--no-sandbox`.
Logic suites skip drawing (`render=0`) so they stay at 60 Hz on software WebGL;
set `RENDER=1` to keep rendering, or `CHROME_PATH` to choose a browser.

## URL parameters

`?preset=blood-moon&mode=smart&cam=9,4.6,17&look=6,10,-60&time=14&bands=1&lines=540`

These open a fixed viewpoint, which is handy for sharing a shot. `tools/screenshot.mjs` uses the same parameters.
With `shot=1` the save is neither read nor written unless `save=1` is added; `fresh=1`
ignores an existing save. `shot=1` also skips the title screen, audio and mouse capture
(`title=1`, `audio=1` turn the first two back on).
