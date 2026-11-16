# Soak test: ~70 random human-like actions per input type; every valid drop must build. Run with the preview server up.
# Long human-like session: drag/tap towers between lots of other UI actions; log any valid drop that fails.
import random, json
from playwright.sync_api import sync_playwright
src=open(__file__.replace('soak.py', 'ui_test.py')).read()
FIND=src.split('FIND_SPOT = """')[1].split('"""')[0]
random.seed(4)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for mode in ['mouse','touch']:
        opt=dict(viewport={'width':1366,'height':768}) if mode=='mouse' else dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
        ctx=b.new_context(**opt); pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.goto('http://localhost:4173/?unlockall&t=soak'+mode); pg.wait_for_timeout(600)
        pg.click('[data-g="play"]'); pg.click('[data-g="diff:easy"]'); pg.click('.su-go'); pg.wait_for_timeout(400)
        if pg.locator('#coach.on').count(): pg.click('#coach [data-c="skip"]')
        cdp=ctx.new_cdp_session(pg) if mode=='touch' else None
        def touch(k,x,y): cdp.send('Input.dispatchTouchEvent',{'type':k,'touchPoints':[] if k=='touchEnd' else [{'x':x,'y':y}]})
        fails=[]; placed=0
        for step in range(70):
            g=pg.evaluate("({gold:__ss.game.gold,state:__ss.game.state,n:__ss.game.towers.length,ui:__ss.ui(),modal:document.querySelector('#modal').classList.contains('on')})")
            if g['modal']:
                pg.click('[data-m="resume"]') if pg.locator('[data-m="resume"]').count() else None
                if pg.locator('[data-m="retrywave"]').count(): pg.click('[data-m="retrywave"]')
                continue
            act=random.choice(['drag','drag','drag','tap','select','start','info','guide','speed'])
            if act in('drag','tap'):
                ids=['archer','knight','mage','druid','cannon','barracks','bard','alchemist','ballista']
                aff=pg.evaluate("ids=>ids.filter(i=>__ss.game.gold>=__ss.game.towerCost(i))",ids)
                if not aff: pg.evaluate("__ss.game.gold+=800"); continue
                tid=random.choice(aff); s=pg.evaluate(FIND, random.random()<0.6)
                if not s: continue
                n0=pg.evaluate('__ss.game.towers.length')
                card=pg.locator(f'.card[data-v="{tid}"]'); card.scroll_into_view_if_needed(); c=card.bounding_box()
                if act=='drag':
                    if mode=='mouse':
                        pg.mouse.move(c['x']+20,c['y']+20); pg.mouse.down(); pg.mouse.move(s['x'],s['y'],steps=random.choice([1,5,12])); pg.mouse.up()
                    else:
                        touch('touchStart',c['x']+20,c['y']+20)
                        for i in range(1,9): touch('touchMove',c['x']+20+(s['x']-c['x']-20)*i/8,c['y']+20+(s['y']+42-c['y']-20)*i/8); pg.wait_for_timeout(16)
                        touch('touchEnd',0,0)
                else:
                    card.click() if mode=='mouse' else card.tap(); pg.wait_for_timeout(50)
                    (pg.mouse.click if mode=='mouse' else pg.touchscreen.tap)(s['x'],s['y'])
                pg.wait_for_timeout(80)
                n1=pg.evaluate('__ss.game.towers.length')
                if n1==n0:
                    fails.append(dict(step=step,act=act,t=tid,ui=pg.evaluate('__ss.ui()'),slot=pg.inner_text('#wavebox')[:80],gold=pg.evaluate('__ss.game.gold'),state=pg.evaluate('__ss.game.state')))
                    pg.keyboard.press('Escape')
                else: placed+=1
            elif act=='select':
                t=pg.evaluate("(()=>{const t=__ss.game.towers[Math.floor(Math.random()*__ss.game.towers.length)]; return t?__ss.worldToClient(t.x,t.y):null})()")
                if t:
                    (pg.mouse.click if mode=='mouse' else pg.touchscreen.tap)(t['x'],t['y']); pg.wait_for_timeout(60)
                    if pg.locator('[data-a="up"]').count() and random.random()<0.6: pg.locator('[data-a="up"]').first.click()
                    pg.keyboard.press('Escape') if random.random()<0.5 else (pg.locator('[data-a="close"]').click() if pg.locator('[data-a="close"]').count() else None)
            elif act=='start':
                if g['state']=='build': pg.click('#startBtn')
                pg.wait_for_timeout(random.choice([200,900,2500]))
            elif act=='info':
                pg.click('.card[data-v="cannon"]'); pg.wait_for_timeout(50)
                if pg.locator('[data-h="info"]').count(): pg.click('[data-h="info"]'); pg.click('[data-m="resume"]')
                if random.random()<0.5: pg.keyboard.press('Escape')
            elif act=='guide':
                if pg.locator('.grp-h').count(): pg.locator('.grp-h').first.click(); pg.click('[data-m="resume"]')
            elif act=='speed': pg.click('#speedBtn')
        print(mode,'placed',placed,'failures',len(fails),'errors',errs[:3])
        for f in fails[:6]: print('  ',json.dumps(f)[:300])
        ctx.close()
    b.close()
