---
name: chromatic-odyssey-jobs
description: "Chromatic Odyssey game is built job-by-job from docs/ROADMAP.md; Jobs 1-3 done (renderer, movement, combat), Job 4 (spellbook) next"
metadata:
  node_type: memory
  type: project
  originSessionId: 2c6722ce-d0bc-4cf1-88ff-868382d5a74a
  modified: 2026-09-24T10:39:11.531Z
---

The pixel-game folder is "Project Chromatic Odyssey", a Chill-Fi Dark Fantasy action-RPG made from a 5-pillar master prompt, with reference images in `reference_img/`. The user asked for it to be built "in parts, split in jobs", so each job is one focused session. The plan is 10 jobs in `docs/ROADMAP.md`, the design in `docs/GDD.md`, and full context (including the verbatim master prompt) in `docs/HANDOFF.md`.

- Job 1 (Smart-Pixel depth-band renderer, sky presets, proving-grounds diorama) done 2026-09-22.
- Job 2 (custom kinematic controller, third-person camera, slide/wall-jump/dash/swim, blocky animated knight, parkour trial course) done 2026-09-23.
- Job 3 (spellblade combat: contextual attack set, parry/riposte, perfect dodge, hit-stop, Momentum pool with Resonance, Rune Burst, sparring constructs, combat VFX, game HUD) done 2026-09-24.
- Job 4 is next: the Living Spellbook — a physical book that grows with collected pages, plus the casting framework and 8 starter spells.
- Third-person camera was chosen from the user's composite reference and built in Job 2, but the user has still never explicitly confirmed it.
- Physics deliberately uses no engine (no Rapier): arcade feel needs exact control, and terrain is an analytic height function.
- Still no git repo; Claude has offered twice and the user hasn't answered.

**Why:** the user wants incremental, reviewable chunks rather than one giant prompt.
**How to apply:** start each session by reading `docs/HANDOFF.md` and ROADMAP.md, do exactly the next job, tick its checklist, and add "Notes for Job N+1" plus a handoff update. See [[chromatic-odyssey-workflow]] for verification.
