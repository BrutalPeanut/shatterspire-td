"""Browser interaction tests (Playwright + Chrome).
Run: npx vite build && npx vite preview --port 4173 &  then  python3 test/ui_test.py
"""
import sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/?unlockall'
CHROME = '/usr/bin/google-chrome'
fails = []
def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

FIND_SPOT = """(near) => { const g = __ss.game; for (let x = 80; x < 880; x += 7) for (let y = 60; y < 580; y += 7) {
  if (!g.canPlace(x, y, 22)) continue; const d = Math.min(...g.map.paths.map(p => { let m = 1e9; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i+1]; const dx = b.x-a.x, dy = b.y-a.y; const t = Math.max(0, Math.min(1, ((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy))); m = Math.min(m, Math.hypot(a.x+dx*t-x, a.y+dy*t-y)); } return m; }));
  if (!near || d < 60) return __ss.worldToClient(x, y); } return null; }"""

def new_game(pg, hero='aldric', diff='medium', map_='meadow'):
    pg.click('[data-g="play"]'); pg.wait_for_timeout(300)
    pg.click(f'[data-g="map:{map_}"]'); pg.click(f'[data-g="diff:{diff}"]'); pg.click(f'[data-g="hero:{hero}"]')
    pg.click('.su-go'); pg.wait_for_timeout(500)
    if pg.locator('#coach.on [data-c="skip"]').count(): pg.click('#coach [data-c="skip"]')

def towers(pg): return pg.evaluate('__ss.game.towers.length')
def card_boxes(pg): return [ (round(b['x']), round(b['y'])) for b in [pg.locator(f'.card[data-v="{v}"]').bounding_box() for v in ['archer','knight','mage','cannon','mine']] ]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)

    # ------------------------------------------------ desktop mouse
    print('desktop (mouse)')
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '&t=d1'); pg.wait_for_timeout(700)
    new_game(pg)
    # 1. normal multi-step drag
    c = pg.locator('.card[data-v="archer"]').bounding_box(); s = pg.evaluate(FIND_SPOT, True)
    pg.mouse.move(c['x'] + 30, c['y'] + 30); pg.mouse.down()
    for i in range(1, 11): pg.mouse.move(c['x'] + 30 + (s['x'] - c['x'] - 30) * i / 10, c['y'] + 30 + (s['y'] - c['y'] - 30) * i / 10)
    pg.mouse.up(); pg.wait_for_timeout(100)
    check(towers(pg) == 1, 'drag (10 moves) builds an archer')
    # 2. "jump" drag: press on card, one move straight to the map, release
    before = card_boxes(pg)
    c = pg.locator('.card[data-v="archer"]').bounding_box(); s = pg.evaluate(FIND_SPOT, True)
    pg.mouse.move(c['x'] + 30, c['y'] + 30); pg.mouse.down(); pg.mouse.move(s['x'], s['y'], steps=1); pg.mouse.up(); pg.wait_for_timeout(100)
    check(towers(pg) == 2, 'jump drag (single move) builds')
    # 3. drag onto the road -> specific reason, nothing built
    road = pg.evaluate("() => { const pts = __ss.game.map.paths[0]; const q = pts[Math.floor(pts.length / 2)]; return __ss.worldToClient(q.x, q.y); }")
    c = pg.locator('.card[data-v="archer"]').bounding_box()
    pg.mouse.move(c['x'] + 30, c['y'] + 30); pg.mouse.down(); pg.mouse.move(road['x'], road['y'], steps=6)
    bar = pg.inner_text('#hudbar')
    check('Too close to the path' in bar, f'hud bar explains invalid spot while dragging ({bar.splitlines()[-2:]})')
    pg.mouse.up(); pg.wait_for_timeout(100)
    check(towers(pg) == 2 and 'Too close to the path' in pg.inner_text('#toast'), 'invalid drop builds nothing and toasts the reason')
    # 4. drop back on the panel cancels
    c = pg.locator('.card[data-v="archer"]').bounding_box()
    pg.mouse.move(c['x'] + 30, c['y'] + 30); pg.mouse.down(); pg.mouse.move(c['x'] + 90, c['y'] + 120, steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    check(towers(pg) == 2 and pg.evaluate('__ss.ui().placing') is None, 'releasing over the Armory cancels')
    pg.evaluate('__ss.game.gold = 5000')
    # 5. tap-to-place + Escape
    pg.click('.card[data-v="mage"]'); pg.wait_for_timeout(80); check(pg.evaluate('__ss.ui().placing') == 'mage', 'tap card enters placement')
    check(pg.locator('#hudbar.on').count() == 1 and 'Fire Mage' in pg.inner_text('#hudbar'), 'placement shown in the field bar')
    after = card_boxes(pg); check(before == after, 'Armory cards did not move when placement started')
    pg.keyboard.press('Escape'); check(pg.evaluate('__ss.ui().placing') is None, 'Escape cancels placement')
    pg.click('.card[data-v="mage"]'); s = pg.evaluate(FIND_SPOT, True); pg.mouse.click(s['x'], s['y']); pg.wait_for_timeout(80)
    check(towers(pg) == 3, 'tap card, tap map builds')
    # 6. hero deploy keeps the grid stable
    before = card_boxes(pg)
    pg.click('.card[data-v="hero"]'); s = pg.evaluate(FIND_SPOT, True); pg.mouse.click(s['x'], s['y']); pg.wait_for_timeout(120)
    check(pg.evaluate('__ss.game.heroPlaced'), 'hero deployed')
    check(card_boxes(pg) == before, 'Armory cards keep their slots after the hero deploys')
    check('Deployed' in pg.inner_text('.card[data-v="hero"]'), 'hero card shows Deployed')
    # 7. shift = repeat build
    pg.evaluate('__ss.game.gold = 5000')
    pg.click('.card[data-v="archer"]'); pg.keyboard.down('Shift')
    for _ in range(2): s = pg.evaluate(FIND_SPOT, False); pg.mouse.click(s['x'], s['y']); pg.wait_for_timeout(60)
    pg.keyboard.up('Shift')
    check(towers(pg) == 6 and pg.evaluate('__ss.ui().placing') == 'archer', 'Shift-click keeps building')
    pg.keyboard.press('Escape')
    # 8. upgrades + path lock still work
    pg.evaluate("__ss.game.gold = 1e6")
    t = pg.evaluate("(() => { const t = __ss.game.towers.find(t => t.defId === 'archer'); return __ss.worldToClient(t.x, t.y); })()")
    pg.mouse.click(t['x'], t['y']); pg.wait_for_timeout(80)
    pg.click('[data-a="up"][data-v="0"]'); pg.click('[data-a="up"][data-v="1"]'); pg.wait_for_timeout(50)
    check(pg.locator('.up.closed').count() == 1, 'two paths bought -> third path closed')
    check('Damage' in pg.inner_text('.tp-sub'), 'tower panel shows damage stat')
    pg.keyboard.press('Escape')
    # 8b. tower explanations: role tags, info sheet while placing, info from the tower panel
    check(all(pg.inner_text(f'.card[data-v="{v}"] .role').strip() for v in ['archer','cannon','bard','mine']), 'every Armory card shows a role tag')
    pg.click('.card[data-v="cannon"]'); pg.wait_for_timeout(80)
    check('whole group' in pg.inner_text('#hudbar'), 'placement bar says what the tower does')
    pg.click('[data-h="info"]'); pg.wait_for_timeout(80)
    txt = pg.inner_text('#modal')
    check('Glooms' in txt and 'Ragnarök Mortar' in txt and 'Good against' in txt.title() or 'GOOD AGAINST' in txt.upper(), 'info sheet: damage type, counters and all upgrade names')
    pg.click('[data-m="resume"]'); pg.keyboard.press('Escape')
    pg.mouse.click(t['x'], t['y']); pg.wait_for_timeout(80)
    pg.click('.tp-role'); pg.wait_for_timeout(80)
    check('Archer' in pg.inner_text('#modal') and 'Eagle Eye' in pg.inner_text('#modal'), 'tower panel opens the info sheet')
    pg.click('[data-m="resume"]'); pg.keyboard.press('Escape')
    # 8c. tower groups
    pg.wait_for_timeout(120)
    groups = pg.evaluate("[...document.querySelectorAll('.grp .grp-h b')].map(e => e.textContent)")
    check(len(groups) == 5 and pg.locator('.grp .card').count() == 11, f'Armory grouped by job ({groups})')
    pg.click('.grp-h[data-v="control"]'); pg.wait_for_timeout(80)
    check('Tower Guide' in pg.inner_text('#modal') and pg.locator('.gg.focus').count() == 1, 'group header opens the Tower Guide focused on that group')
    pg.click('[data-m="resume"]')
    # 9. pause button freezes the sim
    pg.click('#startBtn'); pg.wait_for_timeout(300)
    pg.click('#pauseBtn'); t0 = pg.evaluate('__ss.game.time'); pg.wait_for_timeout(500)
    check(pg.evaluate('__ss.ui().paused') and abs(pg.evaluate('__ss.game.time') - t0) < 1e-6, 'Pause button opens menu and stops time')
    pg.click('[data-m="resume"]'); pg.wait_for_timeout(200)
    check(pg.evaluate('__ss.game.time') > t0, 'Resume continues')
    check(errs == [], f'no page errors {errs}')
    ctx.close()

    # ------------------------------------------------ auto-start
    print('auto-start')
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '&t=a1'); pg.wait_for_timeout(600)
    new_game(pg)
    clear = "(() => { const g = __ss.game; g.queue.length = 0; g.enemies.length = 0; })()"
    pg.click('#startBtn'); pg.wait_for_timeout(200); pg.evaluate(clear); pg.wait_for_timeout(200)
    check(pg.evaluate('__ss.game.state') == 'build' and pg.evaluate('__ss.ui().autoT') is None, 'auto off: no countdown after a wave')
    check('Off' in pg.inner_text('#autoBtn'), 'Auto button reads Off')
    pg.click('#autoBtn'); pg.wait_for_timeout(150)
    check('On' in pg.inner_text('#autoBtn'), 'Auto button reads On')
    check(pg.evaluate('__ss.ui().autoT') is not None and 'in' in pg.inner_text('#startBtn'), 'auto on: countdown shown on Start button')
    pg.click('#autoBtn'); pg.wait_for_timeout(2600)
    check(pg.evaluate('__ss.game.round') == 1 and pg.evaluate('__ss.game.state') == 'build', 'turning Auto off cancels the queued start')
    # pause holds the countdown
    pg.click('#autoBtn'); pg.wait_for_timeout(300); pg.click('#pauseBtn'); pg.wait_for_timeout(2500)
    check(pg.evaluate('__ss.game.round') == 1, 'paused: queued auto-start waits')
    pg.click('[data-m="resume"]'); pg.wait_for_timeout(2500)
    check(pg.evaluate('__ss.game.round') == 2, 'resumed: queued auto-start fires')
    # restart during a countdown does not leak into the new game
    pg.evaluate(clear); pg.wait_for_timeout(400)
    check(pg.evaluate('__ss.ui().autoT') is not None, 'countdown running before restart')
    pg.click('#pauseBtn'); pg.click('[data-m="restart"]'); pg.wait_for_timeout(2800)
    check(pg.evaluate('__ss.game.round') == 0, 'restart: new game does not auto-start wave 1')
    check(errs == [], f'no page errors {errs}')
    ctx.close()

    # ------------------------------------------------ spells
    print('spells')
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '&t=s1'); pg.wait_for_timeout(600)
    new_game(pg, diff='easy')
    rf = '#abil [data-ab="s:reinforce:0"]'
    pg.click(rf); pg.wait_for_timeout(80)
    check('full strength' in pg.inner_text('#toast') and pg.evaluate("__ss.game.spells[2].left") == 0, 'Reinforce at 200/200: explained, not consumed')
    pg.evaluate('__ss.game.lives = 184'); pg.click(rf); pg.wait_for_timeout(80)
    check(pg.evaluate('__ss.game.lives') == 200 and '+16' in pg.inner_text('#toast'), 'Reinforce between waves: 184 -> 200 with feedback')
    pg.evaluate('__ss.game.lives = 150'); pg.click(rf); pg.wait_for_timeout(80)
    check(pg.evaluate('__ss.game.lives') == 150 and 'Recharging' in pg.inner_text('#toast'), 'Reinforce on cooldown: explained')
    pg.click('#abil [data-ab="s:meteor:0"]'); pg.wait_for_timeout(80)
    check('Only during a wave' in pg.inner_text('#toast'), 'Meteor between waves: explained')
    pg.click('#abil [data-ab="p:powers:0"]'); pg.wait_for_timeout(100)
    check(pg.locator('#modal.on .pw').count() == 5, 'Powers medallion opens the Powers inventory')
    gold = pg.evaluate('__ss.game.gold'); pg.click('[data-m="power:chest"]'); pg.wait_for_timeout(100)
    check(pg.evaluate('__ss.game.gold') == gold + 500, 'Treasure Chest +500')
    check(errs == [], f'no page errors {errs}')
    ctx.close()

    # ------------------------------------------------ defeat recap + retry wave
    print('defeat recap')
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '&t=d9'); pg.wait_for_timeout(600)
    new_game(pg, diff='easy')
    c = pg.locator('.card[data-v="archer"]').bounding_box(); s = pg.evaluate(FIND_SPOT, True)
    pg.mouse.move(c['x'] + 30, c['y'] + 30); pg.mouse.down(); pg.mouse.move(s['x'], s['y'], steps=4); pg.mouse.up()
    pg.evaluate("__ss.game.round = 20; __ss.game.lives = 5; __ss.game.gold = 3000")
    pg.click('#startBtn'); pg.keyboard.press('f'); pg.keyboard.press('f')
    for _ in range(60):
        pg.wait_for_timeout(500)
        if pg.evaluate("__ss.game.state") == 'over': break
    pg.wait_for_timeout(300)
    txt = pg.inner_text('#modal')
    check('What got through' in txt or 'WHAT GOT THROUGH' in txt.upper(), 'defeat recap lists what got through')
    check(pg.locator('.rc-cause').count() == 1 and len(pg.inner_text('.rc-cause')) > 15, f'recap names a cause ({pg.inner_text(".rc-cause")[:70]})')
    check(pg.locator('.rc-tips li').count() >= 1, 'recap gives tips')
    if pg.locator('.rc-info').count():
        pg.click('.rc-info >> nth=0'); pg.wait_for_timeout(80)
        check(pg.locator('[data-m="recap"]').count() == 1, 'tip opens tower info with a way back')
        pg.click('[data-m="recap"]'); pg.wait_for_timeout(80)
    pw = pg.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('shatterspire.profile.v1')).powers)")
    pg.click('[data-m="retrywave"]'); pg.wait_for_timeout(200)
    check(pg.evaluate('__ss.game.round') == 20 and pg.evaluate('__ss.game.state') == 'build' and pg.evaluate('__ss.game.lives') == 5 and pg.evaluate('__ss.game.towers.length') == 1, 'Retry wave restores the pre-wave state')
    check(pg.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('shatterspire.profile.v1')).powers)") == pw, 'retrying does not hand out powers')
    check(errs == [], f'no page errors {errs}')
    ctx.close()

    # ------------------------------------------------ barracks rally + save/reload
    print('barracks + save/reload')
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '&t=r1'); pg.wait_for_timeout(600)
    new_game(pg)
    c = pg.locator('.card[data-v="barracks"]').bounding_box(); s = pg.evaluate(FIND_SPOT, True)
    pg.mouse.move(c['x'] + 30, c['y'] + 30); pg.mouse.down(); pg.mouse.move(s['x'], s['y'], steps=8)
    check(pg.evaluate("!!document.querySelector('#hudbar') && __ss.ui().ghost && __ss.ui().ghost.valid"), 'barracks ghost valid')
    pg.mouse.up(); pg.wait_for_timeout(100)
    t = pg.evaluate("(() => { const t = __ss.game.towers[0]; return __ss.worldToClient(t.x, t.y); })()")
    pg.mouse.click(t['x'], t['y']); pg.click('[data-a="rally"]')
    check(pg.evaluate('__ss.ui().rally'), 'rally edit mode')
    d0 = pg.evaluate('__ss.game.towers[0].rally.d')
    # pick a road point 70px along the path from the current flag
    pt = pg.evaluate("""(() => { const g = __ss.game, t = g.towers[0]; const base = g.rallyPos(t);
      for (let dd = 40; dd < 140; dd += 10) for (const sgn of [1, -1]) { const d = t.rally.d + sgn * dd; const p = g.paths[t.rally.path]; if (d < 0 || d > p.len) continue;
        const save = t.rally.d; t.rally.d = d; const v = g.rallyPos(t); t.rally.d = save;
        if (Math.hypot(v.x - t.x, v.y - t.y) < 140) return __ss.worldToClient(v.x, v.y); } return null; })()""")
    pg.mouse.click(pt['x'], pt['y']); pg.wait_for_timeout(100)
    d1 = pg.evaluate('__ss.game.towers[0].rally.d')
    check(abs(d1 - d0) > 20 and not pg.evaluate('__ss.ui().rally'), f'rally moved ({d0:.0f} -> {d1:.0f})')
    # save & quit, reload, continue
    pg.evaluate("__ss.game.gold = 4321"); pg.click('#startBtn'); pg.wait_for_timeout(100)
    pg.evaluate("(() => { const g = __ss.game; g.queue.length = 0; g.enemies.length = 0; })()"); pg.wait_for_timeout(200)
    pg.click('#pauseBtn'); pg.click('[data-m="menu"]'); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(700)
    pg.click('[data-g="continue"]'); pg.wait_for_timeout(300)
    check(pg.evaluate('__ss.game.round') == 1 and pg.evaluate('__ss.game.towers.length') == 1, 'continue after reload restores the run')
    check(abs(pg.evaluate('__ss.game.towers[0].rally.d') - d1) < 0.01, 'rally point survives reload')
    check(errs == [], f'no page errors {errs}')
    ctx.close()

    # ------------------------------------------------ touch (portrait phone)
    print('touch (portrait 375x667)')
    ctx = b.new_context(viewport={'width': 375, 'height': 667}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '&t=m1'); pg.wait_for_timeout(700)
    pg.tap('[data-g="play"]'); pg.wait_for_timeout(300)
    bb = pg.locator('.su-go').bounding_box()
    check(bb and bb['y'] + bb['height'] <= 667, 'Begin Battle visible without scrolling')
    pg.tap('.su-go'); pg.wait_for_timeout(500)
    check(pg.locator('#coach.on').count() == 1, 'first-run tutorial shows')
    cdp = ctx.new_cdp_session(pg)
    def touch(kind, x, y): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})
    c = pg.locator('.card[data-v="archer"]').bounding_box(); s = pg.evaluate(FIND_SPOT, True)
    sx, sy = s['x'], s['y'] + 42  # finger sits below the lifted tower
    touch('touchStart', c['x'] + 25, c['y'] + 25)
    for i in range(1, 13): touch('touchMove', c['x'] + 25 + (sx - c['x'] - 25) * i / 12, c['y'] + 25 + (sy - c['y'] - 25) * i / 12); pg.wait_for_timeout(16)
    touch('touchEnd', 0, 0); pg.wait_for_timeout(150)
    check(towers(pg) == 1, 'touch drag from the Armory builds')
    check(pg.locator('#coach.on').count() == 1 and '2/4' in pg.inner_text('#coach'), 'tutorial advanced to step 2')
    # tap-to-place on touch: tower lands where tapped (no lift)
    pg.tap('.card[data-v="knight"]'); s = pg.evaluate(FIND_SPOT, False)
    pg.touchscreen.tap(s['x'], s['y']); pg.wait_for_timeout(100)
    check(towers(pg) == 2, 'touch tap-to-place builds')
    w = pg.evaluate("(() => { const t = __ss.game.towers[1]; return __ss.worldToClient(t.x, t.y); })()")
    check(abs(w['x'] - s['x']) < 3 and abs(w['y'] - s['y']) < 3, 'tap-placed tower sits under the finger')
    sw = pg.evaluate('document.documentElement.scrollWidth')
    check(sw <= 375, f'no horizontal overflow ({sw})')
    check(errs == [], f'no page errors {errs}')
    ctx.close()

    # ------------------------------------------------ landscape phone
    print('touch (landscape 740x360)')
    ctx = b.new_context(viewport={'width': 740, 'height': 360}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '&t=l1'); pg.wait_for_timeout(700)
    pg.tap('[data-g="play"]'); pg.wait_for_timeout(300)
    bb = pg.locator('.su-go').bounding_box()
    check(bb and bb['y'] + bb['height'] <= 360, 'Begin Battle visible without scrolling')
    pg.tap('.su-go'); pg.wait_for_timeout(500)
    cdp = ctx.new_cdp_session(pg)
    c = pg.locator('.card[data-v="archer"]').bounding_box(); s = pg.evaluate(FIND_SPOT, True)
    sx, sy = s['x'], s['y'] + 42
    touch('touchStart', c['x'] + 20, c['y'] + 20)
    for i in range(1, 13): touch('touchMove', c['x'] + 20 + (sx - c['x'] - 20) * i / 12, c['y'] + 20 + (sy - c['y'] - 20) * i / 12); pg.wait_for_timeout(16)
    touch('touchEnd', 0, 0); pg.wait_for_timeout(150)
    check(towers(pg) == 1, 'landscape touch drag builds')
    for sel in ['#autoBtn', '#speedBtn', '#pauseBtn', '#startBtn']:
        bx = pg.locator(sel).bounding_box(); check(bx and bx['height'] >= 34 and bx['x'] + bx['width'] <= 740, f'{sel} visible, touchable ({bx and round(bx["height"])}px)')
    check('Off' in pg.inner_text('#autoBtn'), 'Auto state visible in landscape')
    check(errs == [], f'no page errors {errs}')
    ctx.close()
    b.close()

print(f'\n{len(fails)} failures')
sys.exit(1 if fails else 0)
