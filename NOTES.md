# Handoff notes

## Status (2026-11-15)
- v1 playable: 10 towers (3 paths x 5 tiers, 5-2-0 crosspath, no paragons), Barracks blockers, layered enemies + giants + bosses (waves 20/30/40), 4 curved spline maps, 3 difficulties, 40 waves + freeplay, 3 heroes, spells, consumable powers, knowledge tree, WebAudio SFX/music, localStorage saves.
- Unlock everything for testing: `?unlockall` or `#unlockall`.
- Debug hook: `window.__ss.game` (used by Playwright tests).

## Layout
- `src/core/` headless sim (no DOM): game.ts, towers.ts, enemies.ts, waves.ts, maps.ts, heroes.ts, progress.ts
- `src/render/renderer.ts` canvas art; `src/main.ts` UI/input/loop; `src/audio/audio.ts`; `src/save.ts`
- `test/bot.ts` headless balance bot: `npx tsx test/bot.ts <map> <difficulty> 40`

## Balance baseline (bot, deliberately mediocre)
- Easy: wins all maps. Medium: wins Meadowbrook, dies to wave-40 dragon elsewhere. Hard: dies ~wave 26-30.

## Deploy
- GitHub Pages via .github/workflows/pages.yml (needs Settings > Pages > Source = GitHub Actions).
- Artifact build: `npx vite build --mode single` -> dist-single/index.html.

## Ideas / next
- Playtest feedback from Brian; tune boss HP and late-wave density.
- Parked: merge mode, async/real-time multiplayer, roguelike relics.
