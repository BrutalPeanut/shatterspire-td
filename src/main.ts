import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/cinzel-decorative/latin-900.css';
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './style.css';
import { Game, DIFF, type Tower } from './core/game';
import { MAPS } from './core/maps';
import { TOWERS, TOWER_MAP, canUpgradePath } from './core/towers';
import { HEROES, HERO_MAP, HERO_XP } from './core/heroes';
import { PERKS, POWERS, canBuyPerk, powersEarned } from './core/progress';
import { WORLD_H, WORLD_W, type Difficulty, type Targeting } from './core/types';
import { Renderer, type Overlay } from './render/renderer';
import { drawEnemyModel } from './render/enemyArt';
import { ENEMIES } from './core/enemies';
import { audio } from './audio/audio';
import { ICON } from './ui/icons';
import { clearRun, heroUnlocked, loadProfile, loadRun, mapUnlocked, medalCount, perkPointsLeft, saveProfile, saveRun, towerUnlocked, type Profile } from './save';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.floor(n).toLocaleString();
const fmtShort = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e5 ? `${Math.floor(n / 1e3)}K` : fmt(n));

document.getElementById('app')!.innerHTML = `
<div id="game">
  <div id="topbar">
    <div class="stat lives" title="Lives">${ICON.heart}<div class="sv"><span class="cap">Lives</span><span id="lives">0</span></div></div>
    <div class="stat gold" title="Gold">${ICON.coin}<div class="sv"><span class="cap">Gold</span><span id="gold">0</span></div></div>
    <div class="stat" title="Wave">${ICON.swords}<div class="sv"><span class="cap">Wave</span><span id="round">0</span></div></div>
    <div class="spacer"></div>
    <button class="tbtn btn3d woodb" id="speedBtn" title="Game speed">${ICON.speed}<span class="tl"><span class="lbl2">Speed</span><span id="spd">1×</span></span></button>
    <button class="tbtn btn3d woodb" id="autoBtn" title="Auto-start next wave">${ICON.auto}<span class="tl"><span class="lbl2">Auto</span><span class="lbl3">waves</span></span></button>
    <button class="tbtn btn3d greenb" id="startBtn"></button>
    <button class="tbtn btn3d woodb" id="menuBtn" title="Menu">${ICON.menu}<span class="tl"><span class="lbl2">Menu</span></span></button>
  </div>
  <div id="main">
    <div id="field"><canvas id="canvas"></canvas><div id="abil"></div><div id="toast"></div></div>
    <div id="side"></div>
  </div>
</div>
<div id="menu"><canvas id="menuBg"></canvas><div id="menuShade"></div><div id="menuBody"></div></div>
<div id="modal"></div>`;

const canvas = $<HTMLCanvasElement>('#canvas');
const renderer = new Renderer(canvas);
let profile: Profile = loadProfile();
audio.setSfx(profile.settings.sfx); audio.setMusic(profile.settings.music);

let game: Game | null = null;
let speed = 1;
let paused = false;
let selected: Tower | null = null;
let placing: string | null = null;
let ghost: Overlay['ghost'] | undefined;
let armedSpell: string | null = null;
let cursor: { x: number; y: number } | null = null;
let panelKey = '';
let endHandled = false;

// ================================================================ layout
function layout() {
  const field = $('#field');
  const w = field.clientWidth, h = field.clientHeight;
  if (!w || !h) return;
  const s = Math.min(w / WORLD_W, h / WORLD_H);
  renderer.resize(Math.floor(WORLD_W * s), Math.floor(WORLD_H * s));
}
window.addEventListener('resize', () => setTimeout(layout, 50));
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

const TOUCH_LIFT = 42; // css px: keep the tower visible above the finger
function toWorld(ev: PointerEvent, lift = false) {
  const r = canvas.getBoundingClientRect();
  const dy = lift && ev.pointerType !== 'mouse' ? TOUCH_LIFT : 0;
  return { x: ((ev.clientX - r.left) / r.width) * WORLD_W, y: ((ev.clientY - dy - r.top) / r.height) * WORLD_H };
}
function overCanvas(ev: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
}

// Drag a tower straight from the shop onto the map.
let drag: { id: string; x: number; y: number; active: boolean } | null = null;
document.addEventListener('pointerdown', (ev) => {
  const card = (ev.target as HTMLElement).closest('[data-a="buy"]') as HTMLElement | null;
  if (!card || !game) return;
  audio.init();
  ev.preventDefault();
  drag = { id: card.dataset.v!, x: ev.clientX, y: ev.clientY, active: false };
});
window.addEventListener('pointermove', (ev) => {
  if (!drag || !game) return;
  if (!drag.active && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 8) {
    const id = drag.id;
    if (id !== 'hero' && !towerUnlocked(profile, id)) { drag = null; return; }
    if (game.gold < game.towerCost(id)) { audio.play('error'); toast('Not enough gold'); drag = null; return; }
    drag.active = true; select(null); placing = id; panelKey = '';
  }
  if (drag.active) { if (overCanvas(ev)) updateGhost(toWorld(ev, true)); else ghost = undefined; }
});
window.addEventListener('pointerup', (ev) => {
  if (!drag || !game) return;
  const d = drag; drag = null;
  if (!d.active) { beginPlacing(d.id); return; } // simple tap: tap-to-place fallback
  if (overCanvas(ev)) {
    updateGhost(toWorld(ev, true));
    if (ghost?.valid) { if (game.placeTower(d.id, ghost.x, ghost.y)) audio.play('place'); }
    else audio.play('error');
  }
  cancelPlacing();
});
window.addEventListener('pointercancel', () => { if (drag?.active) cancelPlacing(); drag = null; });

function toast(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ================================================================ input on field
let pointerDown = false;
canvas.addEventListener('pointerdown', (ev) => {
  audio.init();
  if (!game) return;
  canvas.setPointerCapture(ev.pointerId);
  pointerDown = true;
  const p = toWorld(ev);
  cursor = p;
  if (placing) { updateGhost(toWorld(ev, true)); return; }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!game) return;
  const p = toWorld(ev);
  cursor = p;
  if (placing && !drag && (pointerDown || ev.pointerType === 'mouse')) updateGhost(toWorld(ev, true));
});
canvas.addEventListener('pointerup', (ev) => {
  if (!game) return;
  const wasDown = pointerDown;
  pointerDown = false;
  const p = toWorld(ev);
  if (!wasDown) return;
  if (armedSpell) {
    const spName = game.spells.find((s) => s.id === armedSpell)?.name ?? 'Spell';
    if (game.castSpell(armedSpell, p.x, p.y)) { audio.play('ability', { x: p.x }); toast(`${spName}!`); }
    armedSpell = null; return;
  }
  if (placing) {
    updateGhost(toWorld(ev, true));
    if (ghost?.valid) {
      const t = game.placeTower(placing, ghost.x, ghost.y);
      if (t) { audio.play('place'); placing = null; ghost = undefined; panelKey = ''; }
    } else audio.play('error');
    return;
  }
  // select tower
  const hit = game.towers.find((t) => Math.hypot(t.x - p.x, t.y - p.y) <= t.radius + 6);
  select(hit ?? null);
});
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelPlacing(); });
canvas.addEventListener('pointerleave', () => { if (placing && !pointerDown) ghost = undefined; cursor = null; });
window.addEventListener('keydown', (e) => {
  if (!game) return;
  if (e.key === 'Escape') { cancelPlacing(); select(null); armedSpell = null; }
  else if (e.key === ' ') { e.preventDefault(); startWave(); }
  else if (e.key === 'f') cycleSpeed();
  else if (/^[0-9]$/.test(e.key)) { const ids = shopIds(); const id = ids[(Number(e.key) + 9) % 10]; if (id) beginPlacing(id); }
  else if (selected && [',', '.', '/'].includes(e.key)) { buyUpgrade([',', '.', '/'].indexOf(e.key)); }
  else if (selected && (e.key === 'Backspace' || e.key === 'Delete')) sellSelected();
});

function updateGhost(p: { x: number; y: number }) {
  if (!game || !placing) return;
  const isHero = placing === 'hero';
  const radius = isHero ? game.heroDef.radius : TOWER_MAP[placing].radius;
  const range = isHero ? game.heroDef.stats(1).range : (() => { const s = TOWER_MAP[placing].base(); return s.range === Infinity ? 0 : s.range; })();
  const valid = game.canPlace(p.x, p.y, radius) && game.gold >= game.towerCost(placing, p.x, p.y);
  ghost = { defId: placing, x: p.x, y: p.y, valid, radius, range };
}

function shopIds() { return TOWERS.map((t) => t.id); }

function beginPlacing(id: string) {
  if (!game) return;
  if (id !== 'hero' && !towerUnlocked(profile, id)) return;
  if (placing === id) { cancelPlacing(); return; }
  if (game.gold < game.towerCost(id)) { audio.play('error'); toast('Not enough gold'); return; }
  select(null);
  placing = id; ghost = undefined;
  audio.play('click');
  panelKey = '';
}
function cancelPlacing() { placing = null; ghost = undefined; panelKey = ''; }
function select(t: Tower | null) { selected = t; panelKey = ''; if (t) audio.play('click'); }

// ================================================================ top bar
$('#startBtn').addEventListener('click', () => { audio.init(); startWave(); });
$('#speedBtn').addEventListener('click', cycleSpeed);
$('#autoBtn').addEventListener('click', () => { audio.init(); toggleAuto(); });
$('#menuBtn').addEventListener('click', () => { audio.init(); pauseMenu(); });

function toggleAuto() {
  profile.settings.autoStart = !profile.settings.autoStart;
  saveProfile(profile);
  toast(profile.settings.autoStart ? '⏩ Auto-start ON: waves start automatically' : 'Auto-start OFF');
  lastTop = '';
  if (profile.settings.autoStart && game && game.state === 'build' && game.round > 0) setTimeout(() => { if (game && game.state === 'build' && !paused && profile.settings.autoStart) game.startWave(); }, 800);
}

function startWave() {
  if (!game) return;
  if (game.state === 'build') { game.startWave(); }
}
function cycleSpeed() { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; refreshTop(); }

let lastTop = '';
function refreshTop() {
  if (!game) return;
  const key = `${game.lives}|${Math.floor(game.gold)}|${game.round}|${speed}|${game.state}|${profile.settings.autoStart}`;
  if (key === lastTop) return;
  lastTop = key;
  $('#lives').textContent = fmt(Math.max(0, game.lives));
  $('#gold').textContent = fmtShort(game.gold);
  $('#round').textContent = game.freeplay ? `${game.round}` : `${game.round}/${game.totalWaves}`;
  $('#spd').textContent = `${speed}×`;
  ($('#speedBtn').querySelector('.lbl2') as HTMLElement).textContent = window.matchMedia('(orientation: portrait)').matches ? `Speed ${speed}×` : 'Speed';
  $('#autoBtn').classList.toggle('on', profile.settings.autoStart);
  const sb = $('#startBtn');
  const building = game.state === 'build';
  sb.innerHTML = building ? `${ICON.play}<span class="tl"><span class="lbl2">${game.round === 0 ? 'Start' : 'Next'}</span><span class="lbl3">wave</span></span>` : `${ICON.swords}<span class="tl"><span class="lbl2">Battle</span><span class="lbl3">wave ${game.round}</span></span>`;
  sb.classList.toggle('running', !building);
  sb.classList.toggle('pulse', building && game.round === 0);
}

// ================================================================ side panel
const side = $('#side');
side.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
  if (!el || !game) return;
  audio.init();
  const a = el.dataset.a!, v = el.dataset.v ?? '';
  if (a === 'buy') return;
  else if (a === 'up') buyUpgrade(Number(v));
  else if (a === 'sell') sellSelected();
  else if (a === 'close') select(null);
  else if (a === 'target') {
    if (!selected) return;
    const order: Targeting[] = ['first', 'last', 'strong', 'close'];
    selected.targeting = order[(order.indexOf(selected.targeting) + 1) % 4];
    panelKey = ''; audio.play('click');
  } else if (a === 'withdraw' && selected) { game.withdraw(selected); audio.play('coin'); panelKey = ''; }
  else if (a === 'cancel') cancelPlacing();
  else if (a === 'powers') powersMenu();
});

function buyUpgrade(p: number) {
  if (!game || !selected) return;
  if (game.upgrade(selected, p)) { audio.play('upgrade'); panelKey = ''; }
  else audio.play('error');
}
function sellSelected() {
  if (!game || !selected) return;
  game.sell(selected); audio.play('sell'); select(null);
}

const iconCache = new Map<string, string>();
function iconURL(defId: string, isHero: boolean) {
  const k = (isHero ? 'h:' : '') + defId;
  if (iconCache.has(k)) return iconCache.get(k)!;
  const c = document.createElement('canvas');
  c.style.width = '48px';
  document.body.appendChild(c);
  renderer.icon(c, defId, isHero);
  const url = c.toDataURL();
  c.remove();
  iconCache.set(k, url);
  return url;
}
const img = (defId: string, isHero = false, size = 52) => `<img src="${iconURL(defId, isHero)}" width="${size}" height="${size}" alt="">`;

function renderSide() {
  if (!game) return;
  const g = game;
  const t = selected && g.towers.includes(selected) ? selected : null;
  if (!t && selected) selected = null;
  const key = t ? `t${t.uid}|${t.tiers.join('')}|${t.targeting}|${t.level}|${Math.floor(t.bank)}` : `shop|${placing}|${!!drag?.active}|${profile.totalRounds}|${g.heroPlaced}|${g.freeTower}`;
  if (key !== panelKey) {
    panelKey = key;
    side.innerHTML = t ? towerPanel(t) : shopPanel();
  }
  // affordability refresh
  side.querySelectorAll<HTMLElement>('[data-cost]').forEach((el) => el.classList.toggle('poor', g.gold < Number(el.dataset.cost)));
  if (t) { const st = side.querySelector('.tp-sub'); if (st) st.textContent = `Pops: ${fmt(t.pops)}${t.stats.income ? ` · +${fmt(t.stats.income * t.stats.incomeMult)}/round` : ''}`; }
}

function shopPanel() {
  const g = game!;
  let h = '';
  h += `<div class="side-title">Armory</div>`;
  if (placing && !drag?.active) { const nm = placing === 'hero' ? g.heroDef.name : TOWER_MAP[placing].name; const ds = placing === 'hero' ? g.heroDef.desc : TOWER_MAP[placing].desc; h += `<div class="placing"><b>${esc(nm)}</b>: ${esc(ds)}<div class="hint" style="margin:4px 0 0">Tap the map to build it here.</div><div class="row"><button class="btn btn3d redb" data-a="cancel">${ICON.close} Cancel</button></div></div>`; }
  if (g.freeTower) h += `<div class="hint">📜 Your next tower is free!</div>`;
  h += '<div class="shop">';
  if (!g.heroPlaced) {
    const hd = g.heroDef, cost = g.towerCost('hero');
    h += `<button class="card hero ${placing === 'hero' ? 'sel' : ''}" data-a="buy" data-v="hero" data-cost="${cost}" title="${esc(hd.desc)}">${img(hd.id, true)}<div class="nm">${esc(hd.name)}</div><div class="cost">${ICON.coinSmall}${fmt(cost)}</div></button>`;
  }
  for (const d of TOWERS) {
    const un = towerUnlocked(profile, d.id);
    const cost = g.towerCost(d.id);
    h += un
      ? `<button class="card ${placing === d.id ? 'sel' : ''}" data-a="buy" data-v="${d.id}" data-cost="${cost}" title="${esc(d.desc)}">${img(d.id)}<div class="nm">${esc(d.name)}</div><div class="cost">${ICON.coinSmall}${fmt(cost)}</div></button>`
      : `<div class="card locked">${img(d.id)}<div class="nm">${esc(d.name)}</div><div class="cost">${ICON.lock.replace('class="ico"', 'class="ico sm"')} ${d.unlockRounds - profile.totalRounds} rounds</div></div>`;
  }
  h += '</div>';
  const pw = Object.values(profile.powers).reduce((a, b) => a + b, 0);
  h += `<div class="row"><button class="btn btn3d blueb" data-a="powers">${ICON.sparkle} Powers (${pw})</button></div>`;
  h += `<div class="hint">👆 <b>Drag</b> a tower onto the map to build. Tap a built tower to upgrade it.</div>`;
  return h;
}

function towerPanel(t: Tower) {
  const g = game!;
  const head = (name: string, isHero: boolean) => `<div class="tp-head">${img(t.defId, isHero)}<div><div class="tp-name">${esc(name)}</div><div class="tp-sub"></div></div><button class="tp-x btn3d redb" data-a="close">${ICON.close}</button></div>`;
  let h = '';
  if (t.isHero) {
    const hd = HERO_MAP[t.defId];
    const L = t.level, next = HERO_XP[L] ?? null, prev = HERO_XP[L - 1];
    h += head(`${hd.name} · Lv ${L}`, true);
    h += `<div class="hint">${esc(hd.title)}. ${esc(hd.desc)}</div>`;
    h += `<div class="xpbar"><div style="width:${next ? Math.min(100, ((t.xp - prev) / (next - prev)) * 100) : 100}%"></div></div>`;
    h += `<div class="hint">${next ? `XP ${fmt(t.xp)} / ${fmt(next)}` : 'MAX LEVEL'}. Heroes level up every round.</div>`;
    for (const a of hd.abilities) h += `<div class="path"><div class="path-h p1">${esc(a.def.name)} <span class="pips">${L >= a.level ? 'Unlocked' : `Level ${a.level}`}</span></div><div class="up max"><div class="ud">${esc(a.desc)}</div></div></div>`;
  } else {
    const d = TOWER_MAP[t.defId];
    h += head(d.name, false);
    for (let p = 0; p < 3; p++) {
      const tier = t.tiers[p];
      const pips = Array.from({ length: 5 }, (_, i) => `<div class="pip ${i < tier ? 'on' : ''}"></div>`).join('');
      let btn: string;
      if (tier >= 5) btn = `<div class="up max"><div class="un">${esc(d.upgrades[p][4].name)} <span>MAX</span></div></div>`;
      else if (!canUpgradePath(t.tiers, p)) btn = `<div class="up closed"><div class="un">${esc(d.upgrades[p][tier].name)} <span>🔒</span></div><div class="ud">Path closed (max 2 paths, only one past tier 2)</div></div>`;
      else { const u = d.upgrades[p][tier]; const cost = g.upgradeCost(t, p); btn = `<button class="up btn3d woodb" data-a="up" data-v="${p}" data-cost="${cost}"><div class="un">${esc(u.name)} <span class="uc">${ICON.coinSmall}${fmt(cost)}</span></div><div class="ud">${esc(u.desc)}</div></button>`; }
      h += `<div class="path"><div class="path-h p${p}">${esc(d.paths[p])}<div class="pips">${pips}</div></div>${btn}</div>`;
    }
    if (t.stats.bank) h += `<div class="row"><button class="btn btn3d gilt" data-a="withdraw">${ICON.coinSmall} Withdraw ${fmt(t.bank)}</button></div>`;
  }
  const canTarget = t.stats.attacks.length > 0;
  h += `<div class="row">${canTarget ? `<button class="btn btn3d woodb" data-a="target">${ICON.target} ${t.targeting[0].toUpperCase() + t.targeting.slice(1)}</button>` : ''}<button class="btn btn3d redb" data-a="sell">Sell ${ICON.coinSmall}${fmt(g.sellValue(t) + t.bank)}</button></div>`;
  return h;
}

// ================================================================ abilities bar
const abil = $('#abil');
abil.addEventListener('pointerdown', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-ab]') as HTMLElement | null;
  if (!el || !game) return;
  ev.stopPropagation();
  audio.init();
  const [kind, id, uid] = el.dataset.ab!.split(':');
  if (kind === 's') {
    const sp = game.spells.find((s) => s.id === id)!;
    if (game.state !== 'wave') { audio.play('error'); toast(`${sp.name}: use during a wave`); return; }
    if (sp.left > 0) { audio.play('error'); toast(`${sp.name}: ready in ${Math.ceil(sp.left)}s`); return; }
    if (sp.targeted) { armedSpell = armedSpell === id ? null : id; cancelPlacing(); toast(`${sp.name}: tap the map to aim`); }
    else if (game.castSpell(id)) { audio.play('ability'); toast(`${sp.name}!`); }
  } else {
    const t = game.towers.find((x) => x.uid === Number(uid));
    const ab = t?.abilities.find((a) => a.def.id === id);
    if (t && ab && game.useAbility(t, id)) { audio.play('ability', { x: t.x }); toast(`${ab.def.name}!`); }
    else { audio.play('error'); if (ab) toast(game.state !== 'wave' ? `${ab.def.name}: use during a wave` : `${ab.def.name}: ready in ${Math.ceil(ab.left)}s`); }
  }
});
let abilKey = '';
function renderAbil() {
  if (!game) return;
  const g = game;
  const items: { key: string; icon: string; left: number; cd: number; title: string; name: string }[] = [];
  const SPELL_ICON: Record<string, string> = { meteor: ICON.meteor, freeze: ICON.hourglass, reinforce: ICON.shield };
  for (const s of g.spells) items.push({ key: `s:${s.id}:0`, icon: SPELL_ICON[s.id] ?? s.icon, left: s.left, cd: s.cd, title: `${s.name}: ${s.desc}`, name: s.name });
  for (const t of g.towers) for (const a of t.abilities) items.push({ key: `t:${a.def.id}:${t.uid}`, icon: `<img src="${iconURL(t.defId, t.isHero)}" alt="">`, left: a.left, cd: a.def.cd, title: a.def.name, name: a.def.name });
  const key = items.map((i) => i.key).join(',');
  if (key !== abilKey) {
    abilKey = key;
    abil.innerHTML = items.map((i) => `<button class="abw" data-ab="${i.key}" title="${esc(i.title)}"><div class="ab">${i.icon}<div class="cdv"></div><div class="cdt"></div></div><div class="abl">${esc(i.name)}</div></button>`).join('');
  }
  const els = abil.children;
  items.forEach((it, i) => {
    const el = (els[i] as HTMLElement).firstElementChild as HTMLElement;
    const frac = it.left / it.cd;
    const ready = it.left <= 0 && g.state === 'wave';
    el.classList.toggle('ready', ready);
    el.classList.toggle('armed', armedSpell !== null && it.key === `s:${armedSpell}:0`);
    (el.children[1] as HTMLElement).style.background = frac > 0 ? `conic-gradient(rgba(10,4,20,0.72) ${frac * 360}deg, transparent 0)` : 'none';
    (el.children[2] as HTMLElement).textContent = it.left > 0 ? String(Math.ceil(it.left)) : '';
  });
}

// ================================================================ events
const SHOT_SOUND: Record<string, string> = { arrow: 'bow', firearrow: 'bow', thorn: 'bow', shard: 'bow', star: 'fire', fireball: 'fire', comet: 'fire', bomb: 'cannon', bolt: 'zap', ballista: 'ballista', sweep: 'swing', frost: 'frost', potion: 'potion', vine: 'whip' };
function handleEvents() {
  if (!game) return;
  const g = game;
  for (const e of g.events) {
    switch (e.type) {
      case 'pop': audio.play(e.big ? 'bigpop' : 'pop', { x: e.x }); break;
      case 'shoot': audio.play(SHOT_SOUND[e.kind] ?? 'bow', { x: e.x }); break;
      case 'boom': audio.play('boom', { x: e.x }); break;
      case 'leak': audio.play('leak'); break;
      case 'waveStart': audio.play(e.boss ? 'boss' : 'wave'); if (e.boss) toast('⚠ Boss wave!'); break;
      case 'waveEnd': onWaveEnd(e.round, e.reward); break;
      case 'levelUp': audio.play('level'); toast(`Hero reached level ${e.level}!`); break;
      case 'bossDown': toast(`🏆 ${e.name} defeated!`); break;
      case 'gameOver': onGameEnd(false); break;
      case 'victory': onGameEnd(true); break;
    }
  }
  g.events.length = 0;
}

function onWaveEnd(round: number, reward: number) {
  if (!game) return;
  audio.play('coin');
  const before = profile.totalRounds;
  profile.totalRounds++;
  for (const t of TOWERS) if (before < t.unlockRounds && profile.totalRounds >= t.unlockRounds) toast(`🔓 New tower: ${t.name}!`);
  for (const h of HEROES) if (before < h.unlockRounds && profile.totalRounds >= h.unlockRounds) toast(`🔓 New hero: ${h.name}!`);
  if (game.freeplay) { const m = (profile.medals[game.map.id] ??= {}); m.freeplay = Math.max(m.freeplay ?? 0, round); }
  saveProfile(profile);
  if (game.state === 'build') saveRun(game);
  void reward;
  panelKey = '';
  if (profile.settings.autoStart && game.state === 'build') setTimeout(() => { if (game && game.state === 'build' && !paused && profile.settings.autoStart) game.startWave(); }, 900);
}

function onGameEnd(won: boolean) {
  if (!game || endHandled) return;
  endHandled = true;
  const g = game;
  audio.play(won ? 'win' : 'lose');
  const earned = powersEarned(won ? g.round : g.round, won);
  for (const p of earned) profile.powers[p] = (profile.powers[p] ?? 0) + 1;
  let medal = '';
  if (won) {
    const m = (profile.medals[g.map.id] ??= {});
    if (!m[g.diff]) medal = `🏅 New medal: ${g.map.name} (${DIFF[g.diff].label})! +1 knowledge point`;
    m[g.diff] = 1;
  }
  saveProfile(profile);
  if (!won) clearRun();
  const pw = earned.length ? `<div class="hint">Powers earned: ${earned.map((id) => POWERS.find((p) => p.id === id)!.icon).join(' ')}</div>` : '';
  modal(`
    <h2>${won ? '🏆 Victory!' : '💀 The Spire Has Fallen'}</h2>
    <div class="hint">${won ? `You held ${g.map.name} through all ${g.totalWaves} waves.` : `You survived ${g.round - 1} wave${g.round === 2 ? '' : 's'}.`} Pops: ${fmt(g.stats.pops)}</div>
    ${medal ? `<div class="hint" style="color:var(--gold)">${medal}</div>` : ''}${pw}
    ${won ? '<button class="mbtn big btn3d gilt" data-m="freeplay">Continue: Freeplay</button>' : ''}
    <button class="mbtn btn3d woodb" data-m="restart">Restart</button>
    <button class="mbtn btn3d woodb" data-m="menu">Main Menu</button>`);
}

// ================================================================ modal + menus
const modalEl = $('#modal');
function modal(html: string) { modalEl.innerHTML = `<div class="scroll"><div class="mbox">${html}</div></div>`; modalEl.classList.add('on'); paused = true; }
function closeModal() { modalEl.classList.remove('on'); modalEl.innerHTML = ''; paused = false; }
modalEl.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-m]') as HTMLElement | null;
  if (!el) { if (ev.target === modalEl && game && game.state !== 'over' && game.state !== 'victory') closeModal(); return; }
  audio.play('click');
  const m = el.dataset.m!;
  if (m === 'resume') closeModal();
  else if (m === 'freeplay') { game?.continueFreeplay(); endHandled = false; closeModal(); if (game) saveRun(game); }
  else if (m === 'restart') { if (game) startGame(game.map.id, game.diff, game.heroId); closeModal(); }
  else if (m === 'menu') { if (game && game.state === 'build' && game.round > 0) saveRun(game); closeModal(); showMenu('main'); }
  else if (m === 'auto') { toggleAuto(); pauseMenu(); }
  else if (m === 'sfx') { profile.settings.sfx = !profile.settings.sfx; audio.setSfx(profile.settings.sfx); saveProfile(profile); pauseMenu(); }
  else if (m === 'music') { profile.settings.music = !profile.settings.music; audio.setMusic(profile.settings.music); saveProfile(profile); pauseMenu(); }
  else if (m.startsWith('power:')) {
    const id = m.slice(6);
    if ((profile.powers[id] ?? 0) > 0 && game && game.usePower(id)) { profile.powers[id]--; saveProfile(profile); audio.play('ability'); panelKey = ''; closeModal(); }
    else audio.play('error');
  }
});

function pauseMenu() {
  modal(`<h2>Paused</h2>
    <button class="mbtn big btn3d gilt" data-m="resume">Resume</button>
    <button class="mbtn btn3d woodb" data-m="auto">Auto-start waves: ${profile.settings.autoStart ? 'On' : 'Off'}</button>
    <button class="mbtn btn3d woodb" data-m="sfx">Sound: ${profile.settings.sfx ? 'On' : 'Off'}</button>
    <button class="mbtn btn3d woodb" data-m="music">Music: ${profile.settings.music ? 'On' : 'Off'}</button>
    <button class="mbtn btn3d woodb" data-m="restart">Restart Map</button>
    <button class="mbtn btn3d woodb" data-m="menu">Save & Quit</button>
    <div class="hint">Progress saves automatically at the end of each wave.</div>`);
}

function powersMenu() {
  const rows = POWERS.map((p) => {
    const n = profile.powers[p.id] ?? 0;
    return `<button class="pw btn3d woodb ${n ? '' : 'empty'}" data-m="power:${p.id}"><div class="pi">${p.icon}</div><div class="pt"><b>${p.name}</b><span>${p.desc}</span></div><div class="pc">×${n}</div></button>`;
  }).join('');
  modal(`<h2>Powers</h2><div class="hint">One-shot items. Earn more by finishing games (more waves survived = more powers).</div>${rows}<button class="mbtn btn3d woodb" data-m="resume">Close</button>`);
}

// ---------------------------------------------------------------- main menu screens
const menu = $('#menuBody');
const menuWrap = $('#menu');
let pick = { map: profile.lastHero ? 'meadow' : 'meadow', diff: 'medium' as Difficulty, hero: profile.lastHero };

function showMenu(screen: 'main' | 'play' | 'tree' | 'settings' | 'how') {
  menuWrap.classList.add('on');
  $('#game').classList.remove('on');
  startAttract();
  game = null;
  const run = loadRun();
  let h = '<div class="mwrap">';
  if (screen === 'main') {
    h += `<div class="logo">Shatterspire</div><div class="tagline">Fantasy Tower Defense</div>
      ${run ? `<button class="mbtn big btn3d gilt" data-g="continue">${ICON.play} Continue · Wave ${run.round + 1}</button>` : ''}
      <button class="mbtn btn3d ${run ? 'woodb' : 'big gilt'}" data-g="play">${ICON.swords} Play</button>
      <button class="mbtn btn3d woodb" data-g="tree">${ICON.book} Knowledge <span class="num">(${perkPointsLeft(profile)})</span></button>
      <button class="mbtn btn3d woodb" data-g="how">${ICON.target} How to Play</button>
      <button class="mbtn btn3d woodb" data-g="settings">${ICON.menu} Settings</button>
      <div class="small-note">Medals ${medalCount(profile)} · Rounds played ${profile.totalRounds}</div>`;
  } else if (screen === 'play') {
    h += `<div class="mh">Choose a Map</div><div class="maps">`;
    for (const m of MAPS) {
      const un = mapUnlocked(profile, m.id);
      const md = profile.medals[m.id] ?? {};
      const medals = (['easy', 'medium', 'hard'] as const).map((d) => (md[d] ? ['🥉', '🥈', '🥇'][['easy', 'medium', 'hard'].indexOf(d)] : '◇')).join(' ');
      h += `<button class="mapc ${pick.map === m.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'map:' + m.id : ''}"><canvas data-map="${m.id}" width="300" height="200"></canvas><div class="mi"><div class="mn">${un ? '' : '🔒 '}${esc(m.name)}</div><div class="md">${m.difficultyLabel}${un ? '' : ` · beat ${esc(MAPS.find((x) => x.id === m.unlock)!.name)}`}${md.freeplay ? ` · best freeplay wave ${md.freeplay}` : ''}</div><div class="medals">${medals}</div></div></button>`;
    }
    h += `</div><div class="mh">Difficulty</div><div class="seg">`;
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) h += `<button class="btn3d ${pick.diff === d ? 'gilt' : 'woodb'}" data-g="diff:${d}">${DIFF[d].label}<small>${DIFF[d].lives} lives${d === 'hard' ? ', tougher giants' : d === 'easy' ? ', cheaper towers' : ''}</small></button>`;
    h += `</div><div class="mh">Hero</div><div class="heroes">`;
    for (const hd of HEROES) {
      const un = heroUnlocked(profile, hd.id);
      h += `<button class="heroc ${pick.hero === hd.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'hero:' + hd.id : ''}">${img(hd.id, true, 54)}<div class="hn">${esc(hd.name)}</div><div class="hd">${un ? esc(hd.desc) : `🔒 Unlocks after ${hd.unlockRounds} rounds`}</div></button>`;
    }
    h += `</div><button class="mbtn big btn3d greenb" style="margin-top:18px" data-g="start">${ICON.swords} Begin Battle</button><button class="mbtn btn3d woodb" data-g="main">Back</button>`;
  } else if (screen === 'tree') {
    const left = perkPointsLeft(profile);
    h += `<div class="mh">Knowledge</div><div class="panel"><div class="hint" style="text-align:center">Earn points from medals (1 per map per difficulty) and every 30 rounds played. Points available: <b style="color:var(--gold)">${left}</b>. Second-row perks need 2 perks in the same branch.</div><div class="tree">`;
    for (const b of ['economy', 'military', 'arcane'] as const) {
      h += `<div class="branch"><h3>${b}</h3>`;
      for (const p of PERKS.filter((x) => x.branch === b)) {
        const owned = profile.perks.includes(p.id);
        const can = canBuyPerk(p.id, profile.perks, left);
        h += `<button class="perk btn3d ${owned ? 'gilt' : can ? 'woodb' : 'stoneb na'}" data-g="perk:${p.id}"><b>${owned ? '✔ ' : p.tier === 2 ? '★ ' : ''}${esc(p.name)}</b><span>${esc(p.desc)}</span></button>`;
      }
      h += '</div>';
    }
    h += `</div></div><button class="mbtn btn3d redb" data-g="reset">Refund all perks</button><button class="mbtn btn3d woodb" data-g="main">Back</button>`;
  } else if (screen === 'settings') {
    h += `<div class="mh">Settings</div>
      <button class="toggle btn3d ${profile.settings.sfx ? 'gilt' : 'woodb'}" data-g="sfx"><span>Sound effects</span><span>${profile.settings.sfx ? 'ON' : 'OFF'}</span></button>
      <button class="toggle btn3d ${profile.settings.music ? 'gilt' : 'woodb'}" data-g="music"><span>Music</span><span>${profile.settings.music ? 'ON' : 'OFF'}</span></button>
      <button class="toggle btn3d ${profile.settings.autoStart ? 'gilt' : 'woodb'}" data-g="auto"><span>Auto-start waves</span><span>${profile.settings.autoStart ? 'ON' : 'OFF'}</span></button>
      <button class="mbtn btn3d redb" data-g="wipe">Reset all progress</button>
      <button class="mbtn btn3d woodb" data-g="main">Back</button>`;
  } else {
    h += `<div class="mh">How to Play</div><div class="panel howto">
      <p>🏰 Enemies march down the path toward your Spire. Every enemy that gets through costs lives.</p>
      <p>💥 <b>Enemies come in layers.</b> Hit an Ogre and it becomes a Troll, then an Orc, then a Goblin, then an Imp. Bigger enemies shatter into several smaller ones.</p>
      <p>🛡 <b>Counters matter.</b> Ironclads shrug off arrows and swords (sharp). Glooms ignore explosions. Frostlings ignore cold. Hexlings ignore magic. Shadowed enemies are invisible without True Sight.</p>
      <p>⬆ <b>Upgrades:</b> every tower has 3 paths of 5 tiers. You can upgrade 2 paths, and only one of them past tier 2 (e.g. 5-2-0).</p>
      <p>🪖 <b>Barracks</b> soldiers hold enemies in place while your towers pound them.</p>
      <p>☄️ Spells and abilities appear bottom-left. ✨ Powers are one-shot items you earn by playing.</p>
      <p>⌨️ PC shortcuts: Space = next wave, F = speed, 1-0 = towers, , . / = upgrade paths, Delete = sell, Esc = cancel.</p>
      </div><button class="mbtn btn3d woodb" data-g="main" style="margin-top:16px">Back</button>`;
  }
  h += '</div>';
  menu.innerHTML = h;
  menu.querySelectorAll<HTMLCanvasElement>('canvas[data-map]').forEach((c) => drawMapPreview(c, c.dataset.map!));
}

function drawMapPreview(c: HTMLCanvasElement, id: string) {
  const m = MAPS.find((x) => x.id === id)!;
  const r = new Renderer(c);
  r.scale = 300 / WORLD_W; r.dpr = 1;
  r.buildBg(m);
  c.getContext('2d')!.drawImage(r.bg!, 0, 0);
}

menu.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-g]') as HTMLElement | null;
  if (!el || !el.dataset.g) return;
  audio.init(); audio.play('click');
  const [a, v] = el.dataset.g.split(':');
  switch (a) {
    case 'main': showMenu('main'); break;
    case 'play': showMenu('play'); break;
    case 'tree': showMenu('tree'); break;
    case 'how': showMenu('how'); break;
    case 'settings': showMenu('settings'); break;
    case 'map': pick.map = v; showMenu('play'); break;
    case 'diff': pick.diff = v as Difficulty; showMenu('play'); break;
    case 'hero': pick.hero = v; profile.lastHero = v; saveProfile(profile); showMenu('play'); break;
    case 'start': clearRun(); startGame(pick.map, pick.diff, pick.hero); break;
    case 'continue': { const run = loadRun(); if (run) { game = Game.restore(run, profile.perks); beginSession(); } break; }
    case 'perk': if (canBuyPerk(v, profile.perks, perkPointsLeft(profile))) { profile.perks.push(v); saveProfile(profile); audio.play('upgrade'); } showMenu('tree'); break;
    case 'reset': profile.perks = []; saveProfile(profile); showMenu('tree'); break;
    case 'sfx': profile.settings.sfx = !profile.settings.sfx; audio.setSfx(profile.settings.sfx); saveProfile(profile); showMenu('settings'); break;
    case 'music': profile.settings.music = !profile.settings.music; audio.setMusic(profile.settings.music); saveProfile(profile); showMenu('settings'); break;
    case 'auto': profile.settings.autoStart = !profile.settings.autoStart; saveProfile(profile); showMenu('settings'); break;
    case 'wipe':
      if (el.dataset.armed) { try { localStorage.removeItem('shatterspire.profile.v1'); localStorage.removeItem('shatterspire.run.v1'); } catch { /* ignore */ } profile = loadProfile(); showMenu('main'); }
      else { el.dataset.armed = '1'; el.textContent = 'Tap again to erase everything'; }
      break;
  }
});

function startGame(mapId: string, diff: Difficulty, heroId: string) {
  game = new Game({ mapId, difficulty: diff, heroId, seed: Date.now() % 100000, perks: profile.perks });
  beginSession();
}

function beginSession() {
  menuWrap.classList.remove('on');
  attract = null;
  $('#game').classList.add('on');
  selected = null; placing = null; ghost = undefined; armedSpell = null; panelKey = ''; abilKey = ''; lastTop = ''; endHandled = false; paused = false;
  requestAnimationFrame(layout);
}

// ================================================================ attract mode (live battle behind menus)
const menuBg = $<HTMLCanvasElement>('#menuBg');
const attractR = new Renderer(menuBg);
let attract: Game | null = null;
function startAttract() {
  if (attract) return;
  const g = new Game({ mapId: 'meadow', difficulty: 'easy', heroId: 'aldric', seed: 3 });
  g.gold = 1e9;
  const spots: [string, number, number, number][] = [['archer', 300, 200, 1], ['mage', 470, 120, 1], ['cannon', 560, 420, 0], ['druid', 130, 360, 2], ['barracks', 750, 380, 0], ['bard', 640, 260, 0], ['ballista', 480, 600, 1], ['knight', 280, 470, 1], ['hero', 820, 200, 0]];
  for (const [id, x, y, p] of spots) { const t = g.placeTower(id, x, y); if (t && !t.isHero) { g.upgrade(t, p); g.upgrade(t, p); g.upgrade(t, p); } }
  g.round = 8;
  attract = g;
  sizeAttract();
}
function sizeAttract() {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.max(w / WORLD_W, h / WORLD_H);
  attractR.resize(Math.ceil(WORLD_W * s), Math.ceil(WORLD_H * s));
  menuBg.style.left = `${(w - WORLD_W * s) / 2}px`; menuBg.style.top = `${(h - WORLD_H * s) / 2}px`;
  menuBg.style.width = `${WORLD_W * s}px`; menuBg.style.height = `${WORLD_H * s}px`;
}
window.addEventListener('resize', () => { if (attract) sizeAttract(); });
function tickAttract(dt: number) {
  const g = attract!;
  if (g.state === 'build') g.startWave();
  if (g.state === 'over' || g.state === 'victory' || g.round > 30) { attract = null; startAttract(); return; }
  g.lives = 9999;
  for (let i = 0; i < 2; i++) g.update(Math.min(dt, 0.05) / 2);
  g.events.length = 0;
  attractR.draw(g, {});
}

// ================================================================ loop
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game && attract && menuWrap.classList.contains('on')) { tickAttract(dt); audio.setIntensity(0); }
  if (game) {
    if (!paused) {
      acc += dt * speed;
      let n = 0;
      while (acc >= STEP && n < 12) { game.update(STEP); acc -= STEP; n++; }
      if (n >= 12) acc = 0;
    }
    handleEvents();
    audio.setIntensity(game.state === 'wave' ? 1 : 0);
    if (placing && ghost) updateGhost(ghost);
    renderer.draw(game, { ghost, selected, targeting: !!armedSpell, cursor });
    refreshTop();
    renderSide();
    renderAbil();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.state === 'wave' && !paused) pauseMenu(); });

showMenu('main');

// Debug/test hook (used by automated playtests).
(window as unknown as { __ss: unknown }).__ss = {
  get game() { return game; },
  audio,
  enemies(time = 1.3) {
    const ids = ['imp', 'goblin', 'orc', 'troll', 'ogre', 'gloom', 'frostling', 'hexling', 'wraith', 'iron', 'hydra', 'golem', 'behemoth', 'warbeast', 'colossus', 'golemking', 'lich', 'dragon'];
    const cv = document.createElement('canvas'); cv.width = 1100; cv.height = 700;
    cv.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:700px;z-index:99;background:#7cc95a';
    document.body.appendChild(cv);
    const c = cv.getContext('2d')!;
    const pos = [[70, 120], [150, 120], [230, 120], [310, 120], [400, 120], [500, 120], [580, 120], [660, 120], [740, 120], [830, 120], [930, 120], [1030, 120], [130, 330], [380, 330], [650, 330], [920, 350], [200, 620], [600, 620]];
    ids.forEach((id, i) => {
      const def = ENEMIES[id];
      c.save(); c.scale(1, 1);
      const [x, y] = pos[i];
      const sc = id === 'dragon' || id === 'lich' || id === 'golemking' || id === 'colossus' || id === 'warbeast' ? 1.6 : 2.2;
      c.translate(x, y); c.scale(sc, sc);
      drawEnemyModel(c, { type: id, x: 0, y: 0, angle: 0, wob: time * 3, hp: def.hp, maxHp: def.hp, flash: 0, def }, time, 2);
      c.restore();
      c.fillStyle = '#1a0a04'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText(def.name, x, y + 22);
    });
  },
  gallery(time = 1.2) {
    const ids = [...TOWERS.map((t) => t.id), 'aldric', 'lyra', 'grimbeard'];
    const tiersSet = [[0, 0, 0], [3, 2, 0], [0, 2, 5], [2, 0, 5]];
    const cv = document.createElement('canvas');
    const cell = 150; cv.width = cell * 4; cv.height = cell * ids.length * 0.75;
    cv.style.cssText = 'position:fixed;inset:0;z-index:99;background:#7cc95a';
    document.body.appendChild(cv);
    const c = cv.getContext('2d')!;
    ids.forEach((id, row) => tiersSet.forEach((tiers, col) => {
      const hero = ['aldric', 'lyra', 'grimbeard'].includes(id);
      renderer.drawTowerBody(c, id, hero, col * cell + cell / 2, row * cell * 0.75 + cell * 0.66, col % 2 ? Math.PI - 0.3 : -0.2, time, hero ? [0, 0, 0] : tiers, 0, hero ? col * 3 + 1 : 1, 1.1);
    }));
  },
};
