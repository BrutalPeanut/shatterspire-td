# Handoff notes

## >>> PICK UP HERE (end of 2026-11-15)
1. **Open + merge the PR for branch `audio-enemies-labels`** (modern audio, enemy character models, name labels on every control, these notes).
   - Compare link: https://github.com/BrutalPeanut/shatterspire-td/compare/main...audio-enemies-labels?expand=1
   - Blocked last session: GitHub was signed out in Brian's Chrome. If still signed out, send him https://github.com/login (never type the password).
   - After merge: check the Actions run (Pages deploy) is green, then `git checkout main && git pull --ff-only`.
2. Republish the artifact (https://claude.ai/artifact/VwzxiE8yFLsDbxp2C9VpWT) only if main changed beyond this branch. It already has this build.
3. Give Brian the play link: https://brutalpeanut.github.io/shatterspire-td/?unlockall
4. Then wait for his playtest feedback. Open threads:
   - Medium Ember (loses w30) / Summit (w40) and Hard feel too hard for the bot. Decide with him whether that is intended.
   - Check that the enemy models read clearly on a phone at 3x speed, especially when bosses are crowded.
   - Check the music volume balance versus SFX on mobile speakers.

### Working alongside ChatGPT (from 2026-11-15)
- Brian is having ChatGPT review these changes, and it has push access to this repo. Start each session by pulling every branch and reading its commits and PRs (`git fetch --all`, `git log --all --oneline -20`) before touching anything.
- If Claude and ChatGPT disagree (design, balance, code approach, reverting each other's work), do NOT override ChatGPT's work. Lay out both positions for Brian and let him decide.
- Brian trusts Claude's judgment more: actively review ChatGPT's commits and proactively tell Brian about anything Claude disagrees with (bugs, balance, art/UX regressions, style), with a recommendation. He still makes the call.
- Run the full test checklist below on any ChatGPT changes before merging them.

### Session checklist (every change)
- Branch, then run `npx tsc --noEmit` and `npx vite build`, plus `npx vite build --mode single` for the artifact.
- Run the bot matrix (`npx tsx test/bot.ts <map> <diff> 40`) across 4 maps x easy/medium. It must match the baseline below.
- Run the Playwright drag test (desktop + touch) against `npx vite preview --port 4173`.
- Push with `git -c push.negotiate=true push`, open the PR in Chrome, merge it yourself, and confirm Pages is green.
- Update this file in the same PR.

## Status (2026-11-15)
- v1 playable: 10 towers (3 paths x 5 tiers, 5-2-0 crosspath, no paragons), Barracks blockers, layered enemies + giants + bosses (waves 20/30/40), 4 curved spline maps, 3 difficulties, 40 waves + freeplay, 3 heroes, spells, consumable powers, knowledge tree, WebAudio SFX/music, localStorage saves.
- Unlock everything for testing: `?unlockall` or `#unlockall`.
- Debug hook: `window.__ss.game` (used by Playwright tests).

## Layout
- `src/core/` headless sim (no DOM): game.ts, towers.ts, enemies.ts, waves.ts, maps.ts, heroes.ts, progress.ts
- `src/render/renderer.ts` canvas art; `src/main.ts` UI/input/loop; `src/audio/audio.ts`; `src/save.ts`
- `test/bot.ts` headless balance bot: `npx tsx test/bot.ts <map> <difficulty> 40`

## Balance baseline (bot, deliberately mediocre)
- Easy: wins all 4 maps. Medium: wins Meadowbrook + Caverns, loses Ember (w30) / Summit (w40). Hard: dies ~w26-30.
- The bot is very sensitive to which spots are free: keep scenery off prime build land near the road (frame() keeps decor 34px+ off the path).

## Art
- Maps: src/render/mapArt.ts (noise terrain, textured roads, painted trees/pines/rocks/lava/crystals, cave walls, ambient anim).
- Towers: src/render/buildings.ts (KR-style structures with back/front layers) + figures in src/render/towerArt.ts.
- UI: src/style.css (wood/parchment/stone/gilt, all CSS+SVG), src/ui/icons.ts (SVG icon set), fonts bundled via @fontsource.
- Menu background is a live "attract mode" demo battle.
- Enemies: src/render/enemyArt.ts (character models scaled by power, layer colours kept; small ones sprite-cached 8 frames x 2 facings). `window.__ss.enemies()` shows all 18.

## Audio
- src/audio/audio.ts: reverb+compressor bus, stereo pan by x, Karplus-Strong plucks, FM bells, layered noise/sub hits; adaptive score (calm harp/pads, taiko+pulse layer during waves via setIntensity).

## UI principle
- Every icon-only control gets a visible name (top bar captions, ability name plates, recharge/use toasts).

## Deploy
- GitHub Pages via .github/workflows/pages.yml (needs Settings > Pages > Source = GitHub Actions).
- Artifact build: `npx vite build --mode single` -> dist-single/index.html.

## UI
- Towers: drag from shop onto map (touch lifts ghost 42px above finger); tap card = tap-to-place fallback.
- Auto-start toggle in top bar (Auto) + pause menu.
- Tower/hero art lives in src/render/towerArt.ts; `window.__ss.gallery()` renders every model at 4 tier states.

## Workflow
- No GitHub API token in the cloud session: PRs are opened/merged through the browser.

## Ideas / next
- Playtest feedback from Brian; tune boss HP and late-wave density.
- Parked: merge mode, async/real-time multiplayer, roguelike relics.
