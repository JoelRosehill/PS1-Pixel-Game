---
name: chromatic-odyssey-workflow
description: "How to verify Chromatic Odyssey visually (npm run shot, headless Chrome on real Intel GPU) and shell pitfalls on this Windows machine"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 2c6722ce-d0bc-4cf1-88ff-868382d5a74a
  modified: 2026-09-24T10:39:15.950Z
---

Verification loop for [[chromatic-odyssey-jobs]]:
- `npm run shot` opens headless Chrome (installed at C:/Program Files/Google/Chrome) through puppeteer-core with `--use-angle=d3d11`. It renders on the real Intel UHD 770 iGPU and writes PNGs to `screenshots/`. Read those PNGs to judge the look.
- `--view=name[,name]` selects views, `--perf` measures ms/frame (rAF-capped at 60), and `--hud` shows the HUD.
- Named views live in `tools/screenshot.mjs`. `?cam=&look=&preset=&mode=&bands=1` URL params work in the browser too.
- `npm run movetest` drives the character with real key events in headless Chrome and asserts run speed, jump apex, dash, slide, ramp acceleration, wall-jump, step-up and swimming. It must stay at 11/11 after any controller change.
- `npm run combattest` does the same for combat (combo damage, Momentum, hit-stop, parry, dodge, Rune Burst, Resonance discount, death/respawn, enemy attacks) and must stay at 11/11. Both suites have caught real engine bugs that screenshots could not.
- `window.__three` and `window.__game` are exposed for these harnesses; screenshot views can also run an `eval` string and hold mouse buttons.
- Player screenshots use `at=x,y,z` + `yaw=deg` (not cam/look), and a view can hold keys (`hold: ['w','Control']`) to capture action poses.
- The baseline is 60 fps at 1080p on the iGPU. Treat any drop as a regression.
- Headless timings are noisy. Compare full-frame numbers, not micro-deltas.

Shell pitfall: Git Bash expands backticks and `${}` inside `node -e "..."`. Write node scripts through a quoted heredoc (`node - <<'EOF'`) or use the Edit tool. No Python is installed.
