# Chromatic Odyssey

A "Chill-Fi Dark Fantasy" Action-RPG built with Three.js. The game is built in jobs.
See [docs/ROADMAP.md](docs/ROADMAP.md) for the plan and [docs/GDD.md](docs/GDD.md) for the design pillars.
**Continuing in a new AI session?** Start with [docs/HANDOFF.md](docs/HANDOFF.md).
The chat history that produced this project is archived in [docs/sessions/](docs/sessions/).
Job 3.5 adds a [Blender asset pipeline](docs/assets/PIPELINE.md) and an optimized
[40-pack GLB library](docs/assets/CONVERSION.md). The chapel and graveyard are west
of spawn; the dragon display is north-west beyond the castle.
Job 4 adds the physical Living Spellbook, seven discoverable pages and eight
Momentum-powered spells. Find the first page beside the central Ember Shrine.

## Run it

```bash
npm install
npm run dev        # open http://localhost:5173 and click to explore
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production bundle in `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run shot` | Headless screenshots of the standard views into `screenshots/` |
| `npm run shot -- --view=castle --perf` | One view, plus a frame-time measurement |
| `npm run movetest` | Headless movement assertions (run after touching the controller) |
| `npm run combattest` | Headless combat assertions (damage, parry, dodge, Momentum, death) |
| `npm run spelltest` | Spell effects, collisions, pickups, book growth and keyboard/menu checks |
| `npm run assets:build` | Extract sources, convert with Blender, validate and rebuild the manifest |
| `npm run assets:validate` | Validate all GLBs and regenerate asset reports/manifest |
| `npm run assettest` | Load every model, check animations/clones and capture asset previews |

## Controls

| Key | Action |
|---|---|
| Mouse | Look (click the canvas to capture the mouse) |
| WASD | Move (camera-relative) |
| Space | Jump · wall-jump (hold for a higher jump) |
| LMB | Light attack (chains ×3; contextual while dashing, sliding or airborne) |
| RMB (hold) | Charged heavy overhead |
| Q | Parry (tap) · guard (hold) |
| E | Cast the equipped spell using Momentum (Rune Burst initially) |
| F | Bind a nearby Lost Page |
| B | Open/close the spellbook; arrows or buttons turn pages and equip spells |
| Tab (hold) | Spell quick-wheel; mouse/arrows/1–8 choose, release Tab to equip; Esc cancels |
| Shift | Dash (8-way, 3 charges, i-frames) |
| Ctrl / C | Slide (keeps momentum, accelerates downhill) |
| R | Respawn |
| V | Debug fly camera (then WASD · Shift fast · Space/C up-down · G walk) |
| 1–4 | Sky presets: Cosmic Violet, Crimson Vigil, Sunlit Wilderness, Verdigris Mist |
| F1 | Render mode: Smart-Pixel / Flat HD / Global pixel filter (comparison) |
| F2 | Colour-code the depth bands |
| F3 · F4 | Toggle pixel outlines · palette quantisation |
| [ · ] | Change base pixel size |
| H | Hide HUD |

The book and quick-wheel pause gameplay. Melee hits, parries and perfect dodges
earn Momentum; Resonance halves spell costs. Pages survive death, but progression
currently lasts for the browser session (persistent saves are planned for Job 9).

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

## URL parameters

`?preset=blood-moon&mode=smart&cam=9,4.6,17&look=6,10,-60&time=14&bands=1&lines=540`

These open a fixed viewpoint, which is handy for sharing a shot. `tools/screenshot.mjs` uses the same parameters.
