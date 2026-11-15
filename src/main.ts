import './style.css';
import { Game, DIFF, type Tower } from './core/game';
import { MAPS } from './core/maps';
import { TOWERS, TOWER_MAP, canUpgradePath } from './core/towers';
import { HEROES, HERO_MAP, HERO_XP } from './core/heroes';
import { PERKS, POWERS, canBuyPerk, powersEarned } from './core/progress';
import { WORLD_H, WORLD_W, type Difficulty, type Targeting } from './core/types';
import { Renderer, type Overlay } from './render/renderer';
import { audio } from './audio/audio';
import { clearRun, heroUnlocked, loadProfile, loadRun, mapUnlocked, medalCount, perkPointsLeft, saveProfile, saveRun, towerUnlocked, type Profile } from './save';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.floor(n).toLocaleString();

document.getElementById('app')!.innerHTML = `
<div id="game">
  <div id="topbar">
    <div class="stat lives">❤ <span id="lives">0</span></div>
    <div class="stat gold">🪙 <span id="gold">0</span></div>
    <div class="stat">🌊 <span id="round">0</span></div>
    <div class="spacer"></div>
    <button class="tbtn" id="speedBtn" title="Game speed">1×</button>
    <button class="tbtn" id="autoBtn" title="Auto-start waves">⟳</button>
    <button class="tbtn" id="startBtn">▶ Start</button>
    <button class="tbtn" id="menuBtn" title="Menu">☰</button>
  </div>
  <div id="main">
    <div id="field"><canvas id="canvas"></canvas><div id="abil"></div><div id="toast"></div></div>
    <div id="side"></div>
  </div>
</div>
<div id="menu"></div>
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

function toWorld(ev: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * WORLD_W, y: ((ev.clientY - r.top) / r.height) * WORLD_H };
}

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
  if (placing) { updateGhost(p); return; }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!game) return;
  const p = toWorld(ev);
  cursor = p;
  if (placing && (pointerDown || ev.pointerType === 'mouse')) updateGhost(p);
});
canvas.addEventListener('pointerup', (ev) => {
  if (!game) return;
  const wasDown = pointerDown;
  pointerDown = false;
  const p = toWorld(ev);
  if (!wasDown) return;
  if (armedSpell) {
    if (game.castSpell(armedSpell, p.x, p.y)) audio.play('ability');
    armedSpell = null; return;
  }
  if (placing) {
    updateGhost(p);
    if (ghost?.valid) {
      const t = game.placeTower(placing, p.x, p.y);
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
$('#autoBtn').addEventListener('click', () => { profile.settings.autoStart = !profile.settings.autoStart; saveProfile(profile); refreshTop(); });
$('#menuBtn').addEventListener('click', () => { audio.init(); pauseMenu(); });

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
  $('#gold').textContent = fmt(game.gold);
  $('#round').textContent = game.freeplay ? `${game.round}` : `${game.round}/${game.totalWaves}`;
  $('#speedBtn').textContent = `${speed}×`;
  $('#autoBtn').classList.toggle('on', profile.settings.autoStart);
  const sb = $('#startBtn');
  const building = game.state === 'build';
  sb.textContent = building ? (game.round === 0 ? '▶ Start' : '▶ Next') : '⚔ Wave';
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
  if (a === 'buy') beginPlacing(v);
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
const img = (defId: string, isHero = false, size = 44) => `<img src="${iconURL(defId, isHero)}" width="${size}" height="${size}" alt="">`;

function renderSide() {
  if (!game) return;
  const g = game;
  const t = selected && g.towers.includes(selected) ? selected : null;
  if (!t && selected) selected = null;
  const key = t ? `t${t.uid}|${t.tiers.join('')}|${t.targeting}|${t.level}|${Math.floor(t.bank)}` : `shop|${placing}|${profile.totalRounds}|${g.heroPlaced}|${g.freeTower}`;
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
  if (placing) h += `<div class="placing">Placing <b>${placing === 'hero' ? g.heroDef.name : TOWER_MAP[placing].name}</b>. Tap or drag on the map, release to build.<div class="row"><button class="btn" data-a="cancel">✕ Cancel</button></div></div>`;
  if (g.freeTower) h += `<div class="hint">📜 Your next tower is free!</div>`;
  h += '<div class="shop">';
  if (!g.heroPlaced) {
    const hd = g.heroDef, cost = g.towerCost('hero');
    h += `<button class="card hero ${placing === 'hero' ? 'sel' : ''}" data-a="buy" data-v="hero" data-cost="${cost}" title="${esc(hd.desc)}">${img(hd.id, true)}<div class="nm">${esc(hd.name)}</div><div class="cost">${fmt(cost)}</div></button>`;
  }
  for (const d of TOWERS) {
    const un = towerUnlocked(profile, d.id);
    const cost = g.towerCost(d.id);
    h += un
      ? `<button class="card ${placing === d.id ? 'sel' : ''}" data-a="buy" data-v="${d.id}" data-cost="${cost}" title="${esc(d.desc)}">${img(d.id)}<div class="nm">${esc(d.name)}</div><div class="cost">${fmt(cost)}</div></button>`
      : `<div class="card locked">${img(d.id)}<div class="nm">${esc(d.name)}</div><div class="cost">🔒 ${d.unlockRounds - profile.totalRounds} more rounds</div></div>`;
  }
  h += '</div>';
  const pw = Object.values(profile.powers).reduce((a, b) => a + b, 0);
  h += `<div class="row"><button class="btn" data-a="powers">✨ Powers (${pw})</button></div>`;
  h += `<div class="hint">Tap a tower, then tap the map to build. Tap a built tower to upgrade it.<br>Enemies shatter into smaller enemies. Watch for <b>Ironclads</b> (immune to sharp), <b>Glooms</b> (immune to blast), <b>Frostlings</b> (immune to cold), <b>Hexlings</b> (immune to magic) and <b>Shadowed</b> enemies (need True Sight).</div>`;
  return h;
}

function towerPanel(t: Tower) {
  const g = game!;
  const head = (name: string, isHero: boolean) => `<div class="tp-head">${img(t.defId, isHero)}<div><div class="tp-name">${esc(name)}</div><div class="tp-sub"></div></div><button class="tp-x" data-a="close">✕</button></div>`;
  let h = '';
  if (t.isHero) {
    const hd = HERO_MAP[t.defId];
    const L = t.level, next = HERO_XP[L] ?? null, prev = HERO_XP[L - 1];
    h += head(`${hd.name} · Lv ${L}`, true);
    h += `<div class="hint">${esc(hd.title)}. ${esc(hd.desc)}</div>`;
    h += `<div class="xpbar"><div style="width:${next ? Math.min(100, ((t.xp - prev) / (next - prev)) * 100) : 100}%"></div></div>`;
    h += `<div class="hint">${next ? `XP ${fmt(t.xp)} / ${fmt(next)}` : 'MAX LEVEL'}. Heroes level up every round.</div>`;
    for (const a of hd.abilities) h += `<div class="path"><div class="path-h">${a.def.icon} ${esc(a.def.name)} <span class="pips">${L >= a.level ? '✅' : `Lv ${a.level}`}</span></div><div class="up max"><div class="ud">${esc(a.desc)}</div></div></div>`;
  } else {
    const d = TOWER_MAP[t.defId];
    h += head(d.name, false);
    for (let p = 0; p < 3; p++) {
      const tier = t.tiers[p];
      const pips = Array.from({ length: 5 }, (_, i) => `<div class="pip" style="${i < tier ? `background:var(--p${p})` : ''}"></div>`).join('');
      let btn: string;
      if (tier >= 5) btn = `<div class="up max"><div class="un">${esc(d.upgrades[p][4].name)} <span>MAX</span></div></div>`;
      else if (!canUpgradePath(t.tiers, p)) btn = `<div class="up closed"><div class="un">${esc(d.upgrades[p][tier].name)} <span>🔒</span></div><div class="ud">Path closed (max 2 paths, only one past tier 2)</div></div>`;
      else { const u = d.upgrades[p][tier]; const cost = g.upgradeCost(t, p); btn = `<button class="up" data-a="up" data-v="${p}" data-cost="${cost}"><div class="un">${esc(u.name)} <span class="uc">${fmt(cost)}</span></div><div class="ud">${esc(u.desc)}</div></button>`; }
      h += `<div class="path"><div class="path-h" style="color:var(--p${p})">${esc(d.paths[p])}<div class="pips">${pips}</div></div>${btn}</div>`;
    }
    if (t.stats.bank) h += `<div class="row"><button class="btn primary" data-a="withdraw">🏦 Withdraw ${fmt(t.bank)}</button></div>`;
  }
  const canTarget = t.stats.attacks.length > 0;
  h += `<div class="row">${canTarget ? `<button class="btn" data-a="target">🎯 ${t.targeting[0].toUpperCase() + t.targeting.slice(1)}</button>` : ''}<button class="btn sell" data-a="sell">Sell ${fmt(g.sellValue(t) + t.bank)}</button></div>`;
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
    if (sp.left > 0 || game.state !== 'wave') { audio.play('error'); return; }
    if (sp.targeted) { armedSpell = armedSpell === id ? null : id; cancelPlacing(); toast('Tap the map to aim'); }
    else if (game.castSpell(id)) audio.play('ability');
  } else {
    const t = game.towers.find((x) => x.uid === Number(uid));
    if (t && game.useAbility(t, id)) audio.play('ability'); else audio.play('error');
  }
});
let abilKey = '';
function renderAbil() {
  if (!game) return;
  const g = game;
  const items: { key: string; icon: string; left: number; cd: number; title: string }[] = [];
  for (const s of g.spells) items.push({ key: `s:${s.id}:0`, icon: s.icon, left: s.left, cd: s.cd, title: `${s.name}: ${s.desc}` });
  for (const t of g.towers) for (const a of t.abilities) items.push({ key: `t:${a.def.id}:${t.uid}`, icon: a.def.icon, left: a.left, cd: a.def.cd, title: a.def.name });
  const key = items.map((i) => i.key).join(',');
  if (key !== abilKey) {
    abilKey = key;
    abil.innerHTML = items.map((i) => `<button class="ab" data-ab="${i.key}" title="${esc(i.title)}">${i.icon}<div class="cdv"></div><div class="cdt"></div></button>`).join('');
  }
  const els = abil.children;
  items.forEach((it, i) => {
    const el = els[i] as HTMLElement;
    const frac = it.left / it.cd;
    const ready = it.left <= 0 && g.state === 'wave';
    el.classList.toggle('ready', ready);
    el.classList.toggle('armed', armedSpell !== null && it.key === `s:${armedSpell}:0`);
    (el.children[0] as HTMLElement).style.cssText = `top:${(1 - frac) * 100}%`;
    (el.children[1] as HTMLElement).textContent = it.left > 0 ? String(Math.ceil(it.left)) : '';
  });
}

// ================================================================ events
function handleEvents() {
  if (!game) return;
  const g = game;
  for (const e of g.events) {
    switch (e.type) {
      case 'pop': audio.play(e.big ? 'bigpop' : 'pop'); break;
      case 'shoot': audio.play(e.kind === 'bolt' ? 'zap' : 'shoot'); break;
      case 'boom': audio.play('boom'); break;
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
  if (profile.settings.autoStart && game.state === 'build') setTimeout(() => { if (game && game.state === 'build' && !paused) game.startWave(); }, 600);
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
    ${won ? '<button class="mbtn big" data-m="freeplay">Continue: Freeplay</button>' : ''}
    <button class="mbtn" data-m="restart">Restart</button>
    <button class="mbtn" data-m="menu">Main Menu</button>`);
}

// ================================================================ modal + menus
const modalEl = $('#modal');
function modal(html: string) { modalEl.innerHTML = `<div class="mbox">${html}</div>`; modalEl.classList.add('on'); paused = true; }
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
    <button class="mbtn big" data-m="resume">Resume</button>
    <button class="mbtn" data-m="sfx">Sound: ${profile.settings.sfx ? 'On' : 'Off'}</button>
    <button class="mbtn" data-m="music">Music: ${profile.settings.music ? 'On' : 'Off'}</button>
    <button class="mbtn" data-m="restart">Restart Map</button>
    <button class="mbtn" data-m="menu">Save & Quit</button>
    <div class="hint">Progress saves automatically at the end of each wave.</div>`);
}

function powersMenu() {
  const rows = POWERS.map((p) => {
    const n = profile.powers[p.id] ?? 0;
    return `<button class="pw ${n ? '' : 'empty'}" data-m="power:${p.id}"><div class="pi">${p.icon}</div><div class="pt"><b>${p.name}</b><span>${p.desc}</span></div><div class="pc">×${n}</div></button>`;
  }).join('');
  modal(`<h2>✨ Powers</h2><div class="hint">One-shot items. Earn more by finishing games (more waves survived = more powers).</div>${rows}<button class="mbtn" data-m="resume">Close</button>`);
}

// ---------------------------------------------------------------- main menu screens
const menu = $('#menu');
let pick = { map: profile.lastHero ? 'meadow' : 'meadow', diff: 'medium' as Difficulty, hero: profile.lastHero };

function showMenu(screen: 'main' | 'play' | 'tree' | 'settings' | 'how') {
  menu.classList.add('on');
  $('#game').classList.remove('on');
  game = null;
  const run = loadRun();
  let h = '<div class="mwrap">';
  if (screen === 'main') {
    h += `<div class="logo">SHATTERSPIRE</div><div class="tag">Fantasy Tower Defense</div>
      ${run ? `<button class="mbtn big" data-g="continue">Continue · ${esc(MAPS.find((m) => m.id === run.mapId)?.name ?? '')} wave ${run.round + 1}</button>` : ''}
      <button class="mbtn ${run ? '' : 'big'}" data-g="play">Play</button>
      <button class="mbtn" data-g="tree">📖 Knowledge (${perkPointsLeft(profile)})</button>
      <button class="mbtn" data-g="how">How to Play</button>
      <button class="mbtn" data-g="settings">Settings</button>
      <div class="hint" style="margin-top:16px">Medals: ${medalCount(profile)} · Rounds played: ${profile.totalRounds}</div>`;
  } else if (screen === 'play') {
    h += `<div class="mh">Choose a Map</div><div class="maps">`;
    for (const m of MAPS) {
      const un = mapUnlocked(profile, m.id);
      const md = profile.medals[m.id] ?? {};
      const medals = (['easy', 'medium', 'hard'] as const).map((d) => (md[d] ? ['🥉', '🥈', '🥇'][['easy', 'medium', 'hard'].indexOf(d)] : '▫️')).join(' ');
      h += `<button class="mapc ${pick.map === m.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'map:' + m.id : ''}"><canvas data-map="${m.id}" width="300" height="200"></canvas><div class="mi"><div class="mn">${un ? '' : '🔒 '}${esc(m.name)}</div><div class="md">${m.difficultyLabel}${un ? '' : ` · beat ${esc(MAPS.find((x) => x.id === m.unlock)!.name)}`}${md.freeplay ? ` · best freeplay wave ${md.freeplay}` : ''}</div><div class="medals">${medals}</div></div></button>`;
    }
    h += `</div><div class="mh">Difficulty</div><div class="seg">`;
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) h += `<button class="${pick.diff === d ? 'sel' : ''}" data-g="diff:${d}">${DIFF[d].label}<small>${DIFF[d].lives} lives${d === 'hard' ? ', tougher giants' : d === 'easy' ? ', cheaper towers' : ''}</small></button>`;
    h += `</div><div class="mh">Hero</div><div class="heroes">`;
    for (const hd of HEROES) {
      const un = heroUnlocked(profile, hd.id);
      h += `<button class="heroc ${pick.hero === hd.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'hero:' + hd.id : ''}">${img(hd.id, true, 54)}<div class="hn">${esc(hd.name)}</div><div class="hd">${un ? esc(hd.desc) : `🔒 Unlocks after ${hd.unlockRounds} rounds`}</div></button>`;
    }
    h += `</div><button class="mbtn big" style="margin-top:14px" data-g="start">⚔ Begin</button><button class="mbtn" data-g="main">Back</button>`;
  } else if (screen === 'tree') {
    const left = perkPointsLeft(profile);
    h += `<div class="mh">📖 Knowledge</div><div class="hint" style="text-align:center">Earn points from medals (1 per map per difficulty) and every 30 rounds played. Points available: <b style="color:var(--gold)">${left}</b>. Second-row perks need 2 perks in the same branch.</div><div class="tree">`;
    for (const b of ['economy', 'military', 'arcane'] as const) {
      h += `<div class="branch"><h3>${b}</h3>`;
      for (const p of PERKS.filter((x) => x.branch === b)) {
        const owned = profile.perks.includes(p.id);
        const can = canBuyPerk(p.id, profile.perks, left);
        h += `<button class="perk ${owned ? 'owned' : can ? '' : 'na'}" data-g="perk:${p.id}"><b>${owned ? '✅ ' : p.tier === 2 ? '⭐ ' : ''}${esc(p.name)}</b><span>${esc(p.desc)}</span></button>`;
      }
      h += '</div>';
    }
    h += `</div><button class="mbtn" data-g="reset">Refund all perks</button><button class="mbtn" data-g="main">Back</button>`;
  } else if (screen === 'settings') {
    h += `<div class="mh">Settings</div>
      <button class="toggle" data-g="sfx"><span>Sound effects</span><span>${profile.settings.sfx ? '✅' : '❌'}</span></button>
      <button class="toggle" data-g="music"><span>Music</span><span>${profile.settings.music ? '✅' : '❌'}</span></button>
      <button class="toggle" data-g="auto"><span>Auto-start waves</span><span>${profile.settings.autoStart ? '✅' : '❌'}</span></button>
      <button class="mbtn" data-g="wipe" style="background:#7a2a3a">Reset all progress</button>
      <button class="mbtn" data-g="main">Back</button>`;
  } else {
    h += `<div class="mh">How to Play</div><div class="howto">
      <p>🏰 Enemies march down the path toward your Spire. Every enemy that gets through costs lives.</p>
      <p>💥 <b>Enemies come in layers.</b> Hit an Ogre and it becomes a Troll, then an Orc, then a Goblin, then an Imp. Bigger enemies shatter into several smaller ones.</p>
      <p>🛡 <b>Counters matter.</b> Ironclads shrug off arrows and swords (sharp). Glooms ignore explosions. Frostlings ignore cold. Hexlings ignore magic. Shadowed enemies are invisible without True Sight.</p>
      <p>⬆ <b>Upgrades:</b> every tower has 3 paths of 5 tiers. You can upgrade 2 paths, and only one of them past tier 2 (e.g. 5-2-0).</p>
      <p>🪖 <b>Barracks</b> soldiers hold enemies in place while your towers pound them.</p>
      <p>☄️ Spells and abilities appear bottom-left. ✨ Powers are one-shot items you earn by playing.</p>
      <p>⌨️ PC shortcuts: Space = next wave, F = speed, 1-0 = towers, , . / = upgrade paths, Delete = sell, Esc = cancel.</p>
      </div><button class="mbtn" data-g="main">Back</button>`;
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
  menu.classList.remove('on');
  $('#game').classList.add('on');
  selected = null; placing = null; ghost = undefined; armedSpell = null; panelKey = ''; abilKey = ''; lastTop = ''; endHandled = false; paused = false;
  requestAnimationFrame(layout);
}

// ================================================================ loop
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game) {
    if (!paused) {
      acc += dt * speed;
      let n = 0;
      while (acc >= STEP && n < 12) { game.update(STEP); acc -= STEP; n++; }
      if (n >= 12) acc = 0;
    }
    handleEvents();
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
(window as unknown as { __ss: unknown }).__ss = { get game() { return game; } };
