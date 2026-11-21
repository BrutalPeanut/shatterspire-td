# UI plan (written 2026-11-16 after a full phone playthrough)

Owner: "the UI sucks, fix it." This is the ordered list of what to change, so any model can pick it up.
Tick items off here as they ship. Read NOTES.md first for workflow, design rules and legal guardrails.

## How the playthrough was done
Fresh profile, phone portrait 393x713 (the owner's phone), real taps, Meadowbrook Easy, every menu screen opened,
then a run to wave 36+ using abilities and upgrades. Script: see "Playtest script" at the bottom.

## What is wrong, worst first

1. **Banners cover the map.** "Hero reached level 8", "Next: boss. Check details" and "Boss wave!" stack three deep
   over the road, right where enemies enter. Breaks the owner's rule that nothing floats over the map.
2. **Portrait ability strip overflows.** With the hero's two abilities there are 6 medallions; the Powers button
   slides under Auto, the labels are about 6px tall and clipped at the bottom.
3. **Portrait upgrade panel does not fit.** Third path row and the Sell button run off the bottom of the screen.
4. **Tiles are tiny and go nearly black when unaffordable.** 39px tiles, half covered by the price strip; the
   "can't afford" filter makes the picture unreadable, which is most of the time early on.
5. **Two visual languages.** Menus are dark, gold and serif (Cinzel) and already look like epic fantasy. The battle
   screen is candy colours, bubbly Lilita One and bright brown wood. They look like two different games, and the
   battle screen is the one that reads as a kids' game.
6. **No tension.** 200/200 lives through wave 30 on Easy with careless buying, then -57 in one boss wave.
7. **Menus:** How to Play is a 1,558px wall of text with emoji; Knowledge is a 1,634px list; "Knowledge (0)" does
   not say what it is; the main menu wastes the bottom third.
8. **Small things:** wave box says "80 enemies left" but lists "80 Goblins, 4 Trolls"; locked-tile countdown
   ("16 rds") changes every wave and is noise mid-battle; hero tile says "Deployed" in 9px text.

## Fix order

### PR A: battle-screen bugs (items 1-4) -- DONE (PR #16)
- [x] Toasts: no element over `#canvas`. Show one message at a time in `#slot` (the info box under the map /
      top of the rail) for ~2.5s, then restore the wave box. Queue, never stack. Boss/giant warnings also tint
      the Start button. Files: `toast`/`toast2` in `src/main.ts`, `#toast` rules in `src/style.css`.
- [x] Portrait abilities: drop the text labels (icon + cooldown only), size medallions so six fit left of the round
      buttons, never under them. Name shows in `#slot` on press. Files: `#abil` rules in `src/battle.css`, `.abw/.ab/.abl`.
- [x] Portrait upgrade panel: three path rows + footer must fit in the rail area at 393x713. Put the owned box and
      the buy button on one compact row (about 46px), target selector into the header row.
- [x] Tiles: unaffordable = red price + slightly dimmed picture (not black). Price strip shorter. Add a UI test that
      every tile and the Sell button are inside the viewport in portrait.

### PR B: one visual language (item 5) -- FIRST PASS DONE (PR #17): dark iron/leather rail and panels, gold lines, Cinzel lettering, Nunito numbers, muted group colours, map desaturated with a CSS filter
- [x] Battle uses Cinzel (labels, buttons) and Nunito 800 (numbers).
- [ ] Lilita One is still used by a few menu/vault numbers in `src/style.css`; swap those, then remove the font package and its CREDITS row.
- [x] Rail and panels: dark slate/leather with thin gold borders (reuse the menu panel look), not bright wood.
- [x] Group colours muted (same hues, lower saturation), headers engraved rather than glossy.
- [x] Round buttons: iron/gold rings; Start stays the one saturated element.
- [ ] Map art: currently only a CSS filter on `#canvas` (saturate 0.8). Do it properly in `src/render/mapArt.ts`: cooler shadows, fog at the edges, less cartoon outline. Units leaner (owner rule).
- [ ] Ability medallions and the tutorial coach panel still use the old parchment/wood look in battle.

### PR C: menus (item 7)
- [ ] How to Play becomes 5 short cards with a picture each, no emoji.
- [ ] Rename Knowledge to "Perks", show unspent points as a badge; collapse branches.
- [ ] Main menu: Continue/Play large, vault below, footer stats.

### PR D: tension (item 6)
**Measured 2026-11-20 with `bash test/balance.sh` (6 bot seeds x 4 maps):** the real cliff is the boss waves 30 and 40, not waves 25-28.
Medium spender wins 0/6 on Ember Wastes and Summit and 2/6 on Crystal Caverns; nearly every loss is a single wave taking 60+ lives
from a run that had leaked nothing before. Easy spender wins everything. Fix the boss waves (lich on 30, wave 40), then add mid-game
pressure. Muse's wave 23-28 / interest / cannon tuning (PR #18) is in; it was roughly neutral (37/72 wins vs 35/72).
- [ ] See the balance notes in NOTES.md (`design-pass` branch). Goal: lose 5-25% of lives across waves 5-25 on Easy
      with a careless build; boss leaks hurt but do not end a healthy run.

## Done so far
- PR #19 full modern rework (see NOTES.md "Modern UI rework"): replaces PR B's restyle and most of PR C (menus, How to Play cards, perks naming, switches).
- PR #11 map-first battle layout. PR #14 labelled, colour-coded group sections. PR #12 legal cleanup.

## Playtest script
Playwright, `/usr/bin/google-chrome`, viewport 393x713 touch, against `npx vite preview --port 4173`.
Tap a tile then tap the map to place; `window.__ss.game` exposes state; `__ss.worldToClient(x, y)` maps world to
screen. Take screenshots at waves 1, 10, 20, 30 and with a tower selected; check `#tiles`, `#tpanel` and `#abil`
children are inside the viewport.
