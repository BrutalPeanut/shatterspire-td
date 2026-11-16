# Handoff notes

## >>> PICK UP HERE (end of 2026-11-15, late)
1. **Open + merge ONE PR from branch `playtest-overhaul`** (it contains `audio-enemies-labels` too, so no separate PR is needed for that).
   - Compare link: https://github.com/BrutalPeanut/shatterspire-td/compare/main...playtest-overhaul?expand=1
   - Blocked last session: GitHub signed out in Brian's Chrome. If still signed out, send him https://github.com/login (never type the password).
   - After merge: check the Pages Actions run is green, `git checkout main && git pull --ff-only`, delete the old branches.
2. Republish the artifact (https://claude.ai/artifact/VwzxiE8yFLsDbxp2C9VpWT) from `npx vite build --mode single` if main changed after this.
3. Give Brian the play link: https://brutalpeanut.github.io/shatterspire-td/?unlockall
4. Open threads:
   - Not reproduced, so watch in playtests: Reinforce "no feedback at 184 lives" and Lyra Chrono Field "showing at Lv 6". Both now have explicit feedback and unit tests (see below).
   - Medium Ember (bot dies w30) / Summit (bot dies w30, was w40 before wave 26/28 respacing) and Hard. Is that intended? Brian decides.
   - Desktop headless fps with ~28 towers at 3x is ~36 (no regression vs the old build at 88 towers: 17 vs 16.5). Real hardware is faster, but check on a phone.

### Playtest overhaul (2026-11-15): what changed and the rules it set
- **Setup screen:** one screen, Begin Battle pinned in a footer with a summary; 2x2 map grid on phones, 2-column layout in landscape. Fits 375x667 / 740x360 / desktop with no scrolling (UI test checks this).
- **HUD:** Pause button (P/Esc), "Auto On/Off" text, Start shows "wave N" or "Wave N in 2s"; Next Wave box (fixed height, `waveInfo()` in waves.ts) with threat tags + Details modal; a field-top bar for placement/aim/rally with the specific invalid reason; Powers medallion in the spell bar; first-run 4-step coach (`profile.tutorialDone`, replay in Settings).
- **Armory is built once per session and updated in place**: the hero card stays and shows "Deployed" (tap = select hero). Nothing shifts when placing.
- **Placement:** `Game.placeError()/placeBlock()` are the single source of truth for reasons. Drag fixes: the card captures the pointer, the shop no longer re-renders under the finger mid-drag, and a "jump" drag (down on card, up on map, no moves) builds. pointercancel explains itself. Tap mode places exactly under the finger (lift is only for drags). Shift = keep building. Esc/right-click cancel the innermost mode.
- **Barracks:** a ghost flag previews the deploy point (same `deployPoint()` the game uses, ties go to the entrance-side point); "Move Rally Point" for any road spot within `Game.RALLY_RANGE` (150). The rally point is saved.
- **Timing rule (unchanged, now documented):** spells and abilities recharge only during waves, in game time (2x/3x recharge faster). Between waves the medallion shows a pause glyph. Sim steps per frame went from 12 to 24, so 3x speed stays real-time down to 10 fps. Low-fps cloud browsers were dropping sim time, which is why cooldowns looked slow.
- **Reinforce Walls:** heals up to 25 (40 with perk), capped at starting lives (`maxLives`), castable between waves. At cap it's refused with a reason and the cooldown is not used.
- **Auto-start:** now a game-time countdown in the main loop (`autoT`). Turning it off cancels the queued start; pausing holds it; restart/quit clears it. Old bug: setTimeout + global `game` let a queued start fire into a freshly restarted game, and pausing during the 0.9s window silently dropped the auto-start.
- **Projectiles lead their targets** (`Game.predict`). Tower stats are now Damage (`t.dmg`), Layers (`t.pops`), Held/Slowed (`t.assists`). A cannon "with 10 pops" isn't a damage bug: a lone cannon beside the road pops ~640 layers by wave 20 (`test/cannon_probe.ts`). Low numbers mean other towers popped first.
- **Wave 26 cliff (root cause):** a bot banking 40% of income was perfect through w25, then lost all 189 lives on w26. Leaks were Ogres/Trolls/Frostlings from 10 golems at 0.8s spacing plus the behemoth's 4 golems: a 2.1x RBE spike. Fix: same enemies (same gold) at half the density on w26 and w28. The 35%-hoarder bot now reaches w40 instead of dying at w34. Interest is unchanged (1%, cap 40). Hoarding is addressed with a "gold unspent" chip before giant/boss waves and an end-screen line.
- **Settings:** effects/music volume sliders, Graphics High/Low (Low = still menu backdrop, DPR 1), Fullscreen, Replay tutorial. The menu demo battle animates only on the title screen at 30fps and stops when the tab is hidden.
- **Saves:** the run format is still v1. New fields (`dmg`, `kills`, `assists`, `rally`) are optional and old saves load (unit test). The profile gains `tutorialDone` (true for existing players), `lastMap`, `lastDiff`, `sfxVol`, `musicVol`, `quality`.

### Tests
- `npx tsx test/unit.ts`: timing, reinforce cap, placement reasons, hero unlock levels, save compatibility, deploy preview, wave preview, powers (155 checks).
- `python3 test/ui_test.py` against `npx vite preview --port 4173` runs real Chrome:
  - mouse drag, jump-drag, invalid drop, cancel, tap mode, Esc, Shift
  - stable Armory, hero Deployed, upgrades/path lock, Pause
  - auto-start cancel/pause/restart
  - spells/powers
  - barracks rally + save/reload
  - portrait touch drag + tap placement + tutorial
  - landscape touch drag
- Bot: `SEED=n HOARD=0.4 HERO=lyra LEAKS=1 npx tsx test/bot.ts caverns easy 40` (HOARD = fraction of income banked; LEAKS prints what got through).

### Working alongside ChatGPT (from 2026-11-15)
- Brian is having ChatGPT review these changes, and it has push access to this repo. Start each session by pulling every branch and reading its commits and PRs (`git fetch --all`, `git log --all --oneline -20`) before touching anything.
- If Claude and ChatGPT disagree (design, balance, code approach, reverting each other's work), do NOT override ChatGPT's work. Lay out both positions for Brian and let him decide.
- Brian trusts Claude's judgment more: actively review ChatGPT's commits and proactively tell Brian about anything Claude disagrees with (bugs, balance, art/UX regressions, style), with a recommendation. He still makes the call.
- Run the full test checklist below on any ChatGPT changes before merging them.

### Session checklist (every change)
- Branch, then run `npx tsc --noEmit`, `npx tsx test/unit.ts`, `npx vite build` (+ `--mode single` for the artifact) and `python3 test/ui_test.py`.
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
- 5 seeds each (`SEED=1..5`): Easy wins all 4 maps 5/5. Medium wins Meadowbrook + Caverns 5/5, loses Ember (w30) and Summit (w30) 5/5. Hard dies ~w20-30.
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
