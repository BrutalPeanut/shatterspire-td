# Handoff notes

## >>> PICK UP HERE (2026-11-16, after the vault / map-first / onboarding PR)
**Owner direction (Brian), in priority order:**
1. The map is the main focus; Bloons TD 6 is the layout template. Nothing instructional may cover the map.
2. A casual first-time player (his girlfriend) must understand and enjoy the first game. Don't remove core mechanics to get there.
3. He likes the Idle Cat Gunner "diamond auto-collect" loop (1/min up to a cap; he paid to raise the cap to 500). Shatterspire's version is the Shard Vault.
4. "Use any open source repos to make this game the best it can be."
5. Workflow: every change via a PR you open and merge yourself (GitHub is signed in in the **built-in browser** of the Claude desktop app, not Chrome). Ship when tests pass, tell him after, always give the play link: https://brutalpeanut.github.io/shatterspire-td/?unlockall (normal players: no `?unlockall`).

**Unfinished work: branch `design-pass` (pushed, NOT merged, balance not final).** It was interrupted by newer requests. It branches from main at 0881fcd, so rebase it onto main first (conflicts are likely in game.ts and unit.ts). What it holds:
- `test/strategies.ts`: five rule-based strategies (wide, tall, eco, control, support) across maps and difficulties. `DETAIL=1 npx tsx test/strategies.ts all medium` prints leak waves; `RunResult.tension` is how far the lead enemy got each wave (% of road), which is the best pacing metric we have.
- `src/core/delta.ts`: `upgradeDelta(def, tiers, path)` returns what an upgrade really changes, computed from stats. **Already on main (PR #10)**: shown under every upgrade button and in the info sheet.
- Shatter-through (in `Game.damage`): overkill damage left after breaking a layer is shared between every child it splits into (`Game.SHATTER_CARRY`, 1 = all of it). Plus a `shatter` event and "SHATTER ×N" text when one hit breaks 6+/10+ layers. This is the proposed identity mechanic. It makes big hits and Meteor Shower noticeably stronger, so late waves need more pressure.
- Boss crack points (`EnemyDef.cracks`): at 66/33% (dragon 75/50/25%) of its shell a boss staggers 1.5s and sheds minions behind it; bosses no longer spill children on death, so killing the boss ends its threat. Dragon's timed behemoth spawn became 2 hydras every 9s.
- `Enemy.born` (road fraction where it appeared), `waveLeaks[].late`, `Game.bossLeak`, `Tower.blocked` (immune hits by enemy name), an `immune` event and floating "IMMUNE" text.
- Waves 1-2 respaced; waves 31-40 counts raised about 15-20% to offset shatter-through. **This last tuning was applied but never measured.**

Baseline findings on main, before those changes (simulation, one seed, bots have no perks):
- Easy: every strategy wins every map except `wide` on Ember.
- Medium: `tall` and `support` win all four maps; `eco` wins two; `wide` and `control` lose on all four (wave 40 on every map except `wide` on Summit, wave 30).
- Hard: only `support` wins (three maps).
- Cheap tower spam does NOT dominate specialised builds, so no tower caps are needed.
- Wave-40 losses were not the dragon leaking. They were behemoths the dragon spawned or spilled near the exit. Where a giant breaks decides where its children start, and nothing told the player that. It is the key lesson to teach.
- Waves 1-5 have almost no tension (lead enemy reaches about 11% of the road).
- Text audit: descriptions match mechanics, with two exceptions: heroes do not level "every wave" (XP is 60+10×wave, about a level every 2-3 waves, level 10 near wave 27), and a base Gold Mine pays back in about 13 waves, not 10. Both strings were fixed on main in PR #10.
- With shatter-through and cracks on (before the +15-20% wave bump), Medium Meadowbrook became flawless for all four strategies run on it (tall, support, control, wide), which is too easy; hence the bump.

Next steps for `design-pass`, in order:
1. Rebase, run `npx tsx test/unit.ts`, then the strategy matrix on easy/medium/hard. Target on Medium: strong builds win with some losses, `wide` loses late or scrapes by, and tension in waves 31-39 reaches 75-95% so wave 40 is not the first hard wave. Keep Easy winnable by all five; keep Hard hard.
2. If balance will not settle quickly, set `SHATTER_CARRY = 0.75` (roughly neutral versus the old first-child-only rule) and revert the wave 31-40 bumps.
3. Show `Tower.blocked` in the tower panel ("37 hits bounced off Ironclads"). (Upgrade deltas and the two string fixes are done on main.)
4. Teach "break giants early": a Tower Guide line, and a defeat-recap cause that uses `waveLeaks[].late` and `bossLeak.hpFrac`.
5. Combat feel: distinct sounds for the `immune`, `shatter` and `crack` events (audio.ts has no handlers for them yet), a bigger burst when a giant splits, notches on the boss bar for crack points, respect `prefers-reduced-motion`.
6. Move toasts off the map (render them over the side-panel info slot).

**Open-source options not yet used (workspace network reaches only npm and GitHub):**
- Kenney asset packs (CC0, mirrored on GitHub and npm) for UI sounds and impact SFX; would beat the synthesised effects for hits and coins.
- `howler` (MIT) only if sampled audio is added.
- `@tweenjs/tween.js` or `motion` (MIT) for UI and number animations; `canvas-confetti` (ISC) for victory.
- `seedrandom` is unnecessary (a mulberry RNG is built in). Avoid a full engine swap (Phaser/Pixi): rendering is a custom canvas and performs fine.

### Shard Vault, map-first layout, casual onboarding (2026-11-16)
- **Shard Vault** (`src/core/vault.ts`, pure and unit-tested with a fake clock): 1 Shard per real minute, even offline, up to a cap (100, then 250 for 150 Shards, then 500 for 400). Collect from the main menu. Shards buy Powers (80-120) in the Shard Shop or with the "+1" buttons in the in-battle Powers menu. Also earned by play: 1 per wave, 5 per boss wave, 25 per victory. New and existing profiles find 50 waiting. Max 3 Powers per battle (`Game.powersUsed`, saved). There are no real-money purchases; the cap upgrade is the natural paid item if a store build ever happens. The clock is the device clock, so it can be cheated; fine for now.
- **Map-first layout:** in landscape (phones and desktop) `#game` is a grid: the map takes the full height and a right rail holds stats, the four controls, the info slot and the Armory (`display: contents` on `#main`). Rail: 204px on landscape phones (icon + price cards), 264px, or 300px on big screens. Portrait keeps map on top, spells strip, panel below.
- **Onboarding:** a brand-new profile defaults to Easy. The 6-step coach lives in the side panel, pulses its target (`.tut-pulse`) and shows a glowing suggested build spot on the map (`Overlay.hint`). Steps advance on real events: placed, wave, waveEnd, selected, upgraded, read.
- **Advisor** (`recommendTower` in analysis.ts): before each wave it stars one Armory card and adds a gold chip in the Next Wave box when the defense lacks something concrete (nothing can hurt an immune enemy, no True Sight, no giant killer, no crowd damage, no control). Setting: "Advisor tips".
- **Touch click-through rule:** on touch, a `pointerdown` handler that swaps the UI is followed by a click at the same spot, which presses whatever is now under the finger. This used to burn a Power when opening the Powers menu, and opened Wave details after Cancel or Skip. Use `click` for buttons that change the UI under them; `modal()` also swallows the one click that follows a touch-opened modal.

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

### Tower explanations + defeat recap (2026-11-15, night)
- `src/ui/towerInfo.ts`: per-tower role tag, one-liner, good/weak against, base stats, damage type. Shown on Armory cards (tag), the desktop hover tip, the placement bar (+ Info button), the selected-tower panel, and the full info sheet (all 3 upgrade paths).
- Defeat recap, modelled on BTD6 (continue/retry) and Kingdom Rush (tip on defeat), but with an actual diagnosis. Logic is `src/core/analysis.ts` `analyzeDefeat(g)`: what leaked on the fatal wave, a headline cause, up to 4 tips with tower links, and lives lost per wave.
  - Causes are checked in this order: boss, giant, immunity (nothing could hurt it), shadowed without True Sight, fast enemies without slows/blockers, then volume.
- **Retry wave:** `Game.waveStartSave` (snapshot at `startWave`) is restored. Powers from a defeat are granted only when leaving the run (Restart/Menu), so retries can't farm them.
- Live leak ribbons are grouped every 0.7s ("Leaked: 3 Ogres (−15 lives)"), and the Lives pill shakes.

### Tower groups (2026-11-15, night)
- `GROUPS` in `src/ui/towerInfo.ts`:
  - Hero
  - Crowd Damage: Knight, Fire Mage, Cannon
  - Single Target: Archer, Ballista
  - Control: Barracks, Frost Druid
  - Support & Gold: Alchemist, Bard, Gold Mine
- Each group has a one-line "how to use". There's also `BUILD_ORDER`.
- The Armory is a grid with `grid-auto-flow: dense`. Each colored group box spans as many columns as it has towers (6 columns on portrait, 4 on landscape phones, 3 elsewhere).
- Group headers and the "Tower guide" button open the guide modal. The info sheet and hover tip show the group too, and How to Play lists the groups.

### Rule: nothing floats over the map (2026-11-15, Brian)
- Brian: tooltips must never cover the map. The `#hudbar` overlay and the floating `#tip` are gone. Placement, aiming and rally instructions, plus desktop hover info, now render into the side panel's fixed-height info slot (`#wavebox.slot`), replacing the Next Wave box while active.
- Toasts are hidden while placing. Placement errors shake the slot instead of toasting.
- An invalid drag-drop keeps the tower in hand (tap mode) so the reason stays visible.
- A UI test samples points across the canvas mid-drag and fails if anything but the canvas is on top.

### Bug: towers wouldn't drop (fixed 2026-11-15)
- Root cause: touch drags lift the tower 42px above the finger, but the drop and hover checks tested the finger (`overCanvas`), not the tower. For spots in the bottom ~42px of the map the finger sat below the canvas (on the spell strip), so drops were silently discarded while the ghost showed valid. Fix: `dropOnMap()` tests the lifted tower position, and the lift shrinks near the top edge so the top rows stay reachable.
- Regression: `ui_test.py` touch-drags to the bottom and top edges. `test/soak.py` runs about 70 random human-like actions per input type (drag, tap, select, upgrade, info, guide, waves, speed), and every valid drop must build.

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
- `python3 test/soak.py`: random-session soak, mouse and touch (needs the preview server).
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
