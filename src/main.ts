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
import { waveInfo, type WaveInfo } from './core/waves';
import { analyzeDefeat } from './core/analysis';
import { WORLD_H, WORLD_W, type Difficulty, type Targeting } from './core/types';
import { Renderer, type Overlay } from './render/renderer';
import { drawEnemyModel } from './render/enemyArt';
import { ENEMIES } from './core/enemies';
import { audio } from './audio/audio';
import { ICON } from './ui/icons';
import { BUILD_ORDER, DTYPE, GROUPS, baseStats, groupOf, infoFor } from './ui/towerInfo';
import { clearRun, heroUnlocked, loadProfile, loadRun, mapUnlocked, medalCount, perkPointsLeft, saveProfile, saveRun, towerUnlocked, type Profile } from './save';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.floor(n).toLocaleString();
const fmtShort = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e5 ? `${Math.floor(n / 1e3)}K` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : fmt(n));

document.getElementById('app')!.innerHTML = `
<div id="game">
  <div id="topbar">
    <div class="stat lives" title="Lives">${ICON.heart}<div class="sv"><span class="cap">Lives</span><span id="lives">0</span></div></div>
    <div class="stat gold" title="Gold">${ICON.coin}<div class="sv"><span class="cap">Gold</span><span id="gold">0</span></div></div>
    <div class="stat" title="Wave">${ICON.swords}<div class="sv"><span class="cap">Wave</span><span id="round">0</span></div></div>
    <div class="spacer"></div>
    <button class="tbtn btn3d woodb" id="pauseBtn" title="Pause (P / Esc)">${ICON.pause}<span class="tl"><span class="lbl2">Pause</span></span></button>
    <button class="tbtn btn3d woodb" id="speedBtn" title="Game speed (F)">${ICON.speed}<span class="tl"><span class="lbl2">Speed</span><span class="lbl3" id="spd">1×</span></span></button>
    <button class="tbtn btn3d woodb" id="autoBtn" title="Auto-start the next wave">${ICON.auto}<span class="tl"><span class="lbl2">Auto</span><span class="lbl3" id="autoState">Off</span></span></button>
    <button class="tbtn btn3d greenb" id="startBtn"></button>
  </div>
  <div id="main">
    <div id="field"><canvas id="canvas"></canvas><div id="coach"></div><div id="abil"></div><div id="toast"></div></div>
    <div id="side"><div id="wavebox"></div><div id="sbody"></div></div>
  </div>
</div>
<div id="menu"><canvas id="menuBg"></canvas><div id="menuShade"></div><div id="menuBody"></div></div>
<div id="modal"></div>`;

const canvas = $<HTMLCanvasElement>('#canvas');
const renderer = new Renderer(canvas);
let profile: Profile = loadProfile();
audio.setVolumes(profile.settings.sfxVol, profile.settings.musicVol);
audio.setSfx(profile.settings.sfx); audio.setMusic(profile.settings.music);

let game: Game | null = null;
let speed = 1;
let paused = false;
let selected: Tower | null = null;
let placing: string | null = null;
let ghost: Overlay['ghost'] | undefined;
let armedSpell: string | null = null;
let rallyEdit: Tower | null = null;
let cursor: { x: number; y: number } | null = null;
let panelKey = '';
let endHandled = false;
/** Seconds until the queued automatic wave start (null = nothing queued). Ticks only while unpaused. */
let autoT: number | null = null;
const AUTO_DELAY = 2;
let shiftHeld = false;

// ================================================================ layout
function layout() {
  const field = $('#field');
  const cs = getComputedStyle(field);
  const w = field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = field.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (!w || !h) return;
  const s = Math.min(w / WORLD_W, h / WORLD_H);
  renderer.resize(Math.floor(WORLD_W * s), Math.floor(WORLD_H * s));
  if (profile.settings.quality === 'low') renderer.dpr = Math.min(renderer.dpr, 1);
}
window.addEventListener('resize', () => setTimeout(layout, 50));
window.addEventListener('orientationchange', () => setTimeout(layout, 200));
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => layout()).observe(document.getElementById('field')!);

const TOUCH_LIFT = 42; // css px: keep a dragged tower visible above the finger
function toWorld(ev: { clientX: number; clientY: number; pointerType?: string }, lift = false) {
  const r = canvas.getBoundingClientRect();
  // Lift shrinks near the top edge so the top rows of the map are still reachable with a finger.
  const dy = lift && ev.pointerType && ev.pointerType !== 'mouse' ? Math.min(TOUCH_LIFT, Math.max(0, ev.clientY - r.top - 4)) : 0;
  return { x: ((ev.clientX - r.left) / r.width) * WORLD_W, y: ((ev.clientY - dy - r.top) / r.height) * WORLD_H };
}
/** Is the (lifted) tower position on the map? Drag/drop must test the tower, not the finger under it. */
function dropOnMap(ev: { clientX: number; clientY: number; pointerType?: string }) {
  const p = toWorld(ev, true);
  return p.x >= 0 && p.x <= WORLD_W && p.y >= 0 && p.y <= WORLD_H;
}

function toast(msg: string, kind: 'info' | 'bad' | 'good' = 'info') {
  const box = $('#toast');
  // drop duplicates of the same message so repeated taps don't stack ribbons
  for (const el of Array.from(box.children)) if (el.textContent === msg) el.remove();
  while (box.children.length > 2) box.firstElementChild!.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ================================================================ placement
function makeGhost(id: string, p: { x: number; y: number }): NonNullable<Overlay['ghost']> {
  const g = game!;
  const isHero = id === 'hero';
  const radius = isHero ? g.heroDef.radius : TOWER_MAP[id].radius;
  const range = isHero ? g.heroDef.stats(1).range : (() => { const s = TOWER_MAP[id].base(); return s.range === Infinity ? 0 : s.range; })();
  const reason = g.placeError(id, p.x, p.y);
  const deploy = id === 'barracks' ? g.deployPoint(p.x, p.y) : null;
  return { defId: id, x: p.x, y: p.y, valid: !reason, reason, radius, range, deploy };
}
function updateGhost(p: { x: number; y: number }) { if (game && placing) ghost = makeGhost(placing, p); }

/** Try to build at the ghost. Returns true when built. Always explains a failure. */
function tryPlace(keep = false): boolean {
  if (!game || !placing || !ghost) return false;
  const err = game.placeError(placing, ghost.x, ghost.y);
  if (err) { audio.play('error'); flashSlot(); return false; }
  const id = placing;
  const t = game.placeTower(id, ghost.x, ghost.y);
  if (!t) { audio.play('error'); flashSlot(); return false; }
  audio.play('place');
  tut('placed');
  // keep building copies when Shift is held (desktop) — never for the one-off hero
  if (keep && id !== 'hero' && game.gold >= game.towerCost(id)) { ghost = makeGhost(id, ghost); return true; }
  cancelPlacing();
  return true;
}

// Drag a tower straight from the Armory onto the map. The card captures the pointer so the gesture survives
// leaving the panel; a "jump" drag (press on the card, release over the map with no moves in between) also builds.
let drag: { id: string; x: number; y: number; active: boolean; pid: number; el: HTMLElement } | null = null;
document.addEventListener('pointerdown', (ev) => {
  const card = (ev.target as HTMLElement).closest('[data-a="buy"]') as HTMLElement | null;
  if (!card || !game) return;
  audio.init();
  ev.preventDefault();
  if (card.classList.contains('locked')) { audio.play('click'); towerInfoModal(card.dataset.v!, false, card.dataset.lock); return; }
  if (card.classList.contains('deployed')) { const h = game.towers.find((t) => t.isHero); if (h) select(h); return; }
  try { card.setPointerCapture(ev.pointerId); } catch { /* not capturable (synthetic events) */ }
  drag = { id: card.dataset.v!, x: ev.clientX, y: ev.clientY, active: false, pid: ev.pointerId, el: card };
});
function activateDrag() {
  if (!drag || !game) return;
  drag.active = true; hideTip(); select(null); cancelSpells(); placing = drag.id; ghost = undefined;
  document.body.classList.add('dragging');
}
window.addEventListener('pointermove', (ev) => {
  if (!drag || !game || ev.pointerId !== drag.pid) return;
  if (!drag.active && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 8) activateDrag();
  if (drag.active) { if (dropOnMap(ev)) { updateGhost(toWorld(ev, true)); cursor = ghost ? { x: ghost.x, y: ghost.y } : null; } else ghost = undefined; }
});
window.addEventListener('pointerup', (ev) => {
  if (!drag || !game || ev.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  document.body.classList.remove('dragging');
  try { d.el.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
  const moved = Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8;
  if (!d.active && !moved) { beginPlacing(d.id); return; } // simple tap: tap-to-place mode
  if (!d.active) activateDrag();
  // an invalid drop keeps the tower in hand (tap mode) so the reason stays visible and you can tap a better spot
  if (dropOnMap(ev)) { updateGhost(toWorld(ev, true)); tryPlace(ev.shiftKey); }
  else cancelPlacing();
});
window.addEventListener('pointercancel', (ev) => {
  if (!drag || ev.pointerId !== drag.pid) return;
  const was = drag.active; drag = null;
  document.body.classList.remove('dragging');
  if (was) { cancelPlacing(); toast('Drag interrupted: tap a tower, then tap the map', 'bad'); }
});

// ================================================================ input on field
let pointerDown = false;
canvas.addEventListener('pointerdown', (ev) => {
  audio.init();
  if (!game) return;
  try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  pointerDown = true;
  cursor = toWorld(ev);
  if (placing) updateGhost(cursor);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!game || drag) return;
  cursor = toWorld(ev);
  if (placing && (pointerDown || ev.pointerType === 'mouse')) updateGhost(cursor);
});
canvas.addEventListener('pointerup', (ev) => {
  if (!game) return;
  const wasDown = pointerDown;
  pointerDown = false;
  if (!wasDown) return;
  const p = toWorld(ev);
  if (armedSpell) {
    const sp = game.spells.find((s) => s.id === armedSpell)!;
    const err = game.spellBlock(sp.id);
    if (!err && game.castSpell(sp.id, p.x, p.y)) { audio.play('ability', { x: p.x }); toast(`${sp.name}!`, 'good'); }
    else { audio.play('error'); toast(`${sp.name}: ${err ?? 'can\'t cast now'}`, 'bad'); }
    armedSpell = null; return;
  }
  if (rallyEdit) {
    const err = game.setRally(rallyEdit, p.x, p.y);
    if (err) { audio.play('error'); toast(err, 'bad'); }
    else { audio.play('click'); toast('Rally point moved', 'good'); rallyEdit = null; panelKey = ''; }
    return;
  }
  if (placing) { updateGhost(p); tryPlace(ev.shiftKey); return; }
  const hit = game.towers.find((t) => Math.hypot(t.x - p.x, t.y - p.y) <= t.radius + 8);
  select(hit ?? null);
});
canvas.addEventListener('pointercancel', () => { pointerDown = false; });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelAll(); });
canvas.addEventListener('pointerleave', () => { if (placing && !pointerDown && !drag) ghost = undefined; cursor = null; });
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftHeld = false; });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') shiftHeld = true;
  if (!game) return;
  if (modalEl.classList.contains('on')) { if (e.key === 'Escape' || e.key === 'p') { if (game.state !== 'over' && game.state !== 'victory') closeModal(); } return; }
  if (e.key === 'Escape') { if (!cancelAll()) pauseMenu(); }
  else if (e.key === 'p') pauseMenu();
  else if (e.key === ' ') { e.preventDefault(); startWave(); }
  else if (e.key === 'f') cycleSpeed();
  else if (e.key === 'a') toggleAuto();
  else if (/^[0-9]$/.test(e.key)) { const id = TOWERS[(Number(e.key) + 9) % 10]?.id; if (id) beginPlacing(id); }
  else if (selected && [',', '.', '/'].includes(e.key)) { buyUpgrade([',', '.', '/'].indexOf(e.key)); }
  else if (selected && (e.key === 'Backspace' || e.key === 'Delete')) sellSelected();
});

function beginPlacing(id: string) {
  if (!game) return;
  if (id !== 'hero' && !towerUnlocked(profile, id)) return;
  if (placing === id) { cancelPlacing(); return; }
  select(null); cancelSpells();
  placing = id; ghost = undefined;
  audio.play('click');
}
function cancelPlacing() { placing = null; ghost = undefined; }
function cancelSpells() { armedSpell = null; rallyEdit = null; }
/** Escape / right-click: cancel the innermost mode. Returns true if something was cancelled. */
function cancelAll() {
  if (placing) { cancelPlacing(); return true; }
  if (armedSpell || rallyEdit) { cancelSpells(); return true; }
  if (selected) { select(null); return true; }
  return false;
}
function select(t: Tower | null) { selected = t; rallyEdit = null; panelKey = ''; if (t) { audio.play('click'); tut('selected'); } }

// ================================================================ top bar
$('#startBtn').addEventListener('click', () => { audio.init(); startWave(); });
$('#speedBtn').addEventListener('click', () => { audio.init(); cycleSpeed(); });
$('#autoBtn').addEventListener('click', () => { audio.init(); toggleAuto(); });
$('#pauseBtn').addEventListener('click', () => { audio.init(); pauseMenu(); });

function toggleAuto() {
  profile.settings.autoStart = !profile.settings.autoStart;
  saveProfile(profile);
  if (!profile.settings.autoStart) autoT = null; // cancel anything queued
  toast(profile.settings.autoStart ? 'Auto-start ON: next wave starts by itself' : 'Auto-start OFF: press Start for each wave');
  lastTop = '';
}

function startWave() {
  if (!game || game.state !== 'build') return;
  autoT = null;
  game.startWave();
  tut('wave');
}
function cycleSpeed() { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; lastTop = ''; }

let lastTop = '';
function refreshTop() {
  if (!game) return;
  const auto = profile.settings.autoStart;
  const key = `${game.lives}|${Math.floor(game.gold)}|${game.round}|${speed}|${game.state}|${auto}|${autoT === null ? -1 : Math.ceil(autoT)}`;
  if (key === lastTop) return;
  lastTop = key;
  $('#lives').textContent = fmt(Math.max(0, game.lives));
  $('#gold').textContent = fmtShort(game.gold);
  $('#round').textContent = game.freeplay ? `${game.round}` : `${game.round}/${game.totalWaves}`;
  $('#spd').textContent = `${speed}×`;
  $('#autoState').textContent = auto ? 'On' : 'Off';
  const ab = $('#autoBtn');
  ab.classList.toggle('on', auto);
  ab.setAttribute('aria-pressed', String(auto));
  const sb = $('#startBtn');
  const building = game.state === 'build';
  const next = game.round + 1;
  if (building && autoT !== null) sb.innerHTML = `${ICON.play}<span class="tl"><span class="lbl2">Wave ${next}</span><span class="lbl3">in ${Math.ceil(autoT)}s</span></span>`;
  else if (building) sb.innerHTML = `${ICON.play}<span class="tl"><span class="lbl2">${game.round === 0 ? 'Start' : 'Next'}</span><span class="lbl3">wave ${next}</span></span>`;
  else sb.innerHTML = `${ICON.swords}<span class="tl"><span class="lbl2">Wave ${game.round}</span><span class="lbl3">fighting</span></span>`;
  sb.title = building ? `Start wave ${next} (Space)` : 'Wave in progress';
  sb.classList.toggle('running', !building);
  sb.classList.toggle('pulse', building && game.round === 0);
}

// ================================================================ next-wave box (fixed height, never shifts the Armory)
const waveBox = $('#wavebox');
let waveKey = '';
let waveInfoCache: WaveInfo | null = null;
function renderWaveBox() {
  if (!game || waveBox.classList.contains('slot')) return;
  const g = game;
  const building = g.state === 'build';
  const r = building ? g.round + 1 : g.round;
  const left = g.enemies.length + g.queue.length;
  const key = `${r}|${building}|${building ? 0 : Math.ceil(left / 5)}|${Math.floor(g.gold / 500)}`;
  if (key === waveKey) return;
  waveKey = key;
  if (!waveInfoCache || waveInfoCache.round !== r) waveInfoCache = waveInfo(r);
  const wi = waveInfoCache;
  const chips = wi.freeplay ? '<span class="chip">FREEPLAY</span>' : wi.threats.slice(0, 4).map((t) => `<span class="chip ${t.danger ? 'danger' : ''}">${esc(t.tag)}</span>`).join('');
  const hoard = building && (wi.giant || wi.boss) && g.gold >= 1500 ? `<span class="chip gold">${fmtShort(g.gold)} gold unspent</span>` : '';
  const head = building ? `Next: Wave ${r}${g.freeplay ? '' : `/${g.totalWaves}`}` : `Wave ${r}: ${left} enemies left`;
  const units = wi.units.map((u) => `${u.count} ${u.name}${u.count > 1 && !u.name.endsWith('s') ? 's' : ''}`).join(', ');
  waveBox.innerHTML = `<button class="wb" data-a="waveinfo" title="Wave details">
    <div class="wb-top"><span class="wb-h">${head}</span><span class="wb-more">${ICON.info}<span>Details</span></span></div>
    <div class="wb-units">${esc(units || 'Procedural freeplay wave')}</div>
    <div class="wb-chips">${chips}${hoard}</div></button>`;
}
function waveDetails() {
  if (!game) return;
  const g = game;
  const r = g.state === 'build' ? g.round + 1 : g.round;
  const wi = waveInfo(r);
  const rows = wi.units.map((u) => `<li><b>${u.count}× ${esc(u.name)}</b>${u.mods.includes('s') ? ' · shadowed' : ''}${u.mods.includes('r') ? ' · regrow' : ''}${u.mods.includes('f') ? ' · fortified' : ''}${u.isNew ? ' <span class="chip">NEW</span>' : ''}</li>`).join('');
  const threats = wi.threats.map((t) => `<li class="${t.danger ? 'dg' : ''}"><span class="chip ${t.danger ? 'danger' : ''}">${esc(t.tag)}</span> ${esc(t.text)}</li>`).join('');
  modal(`<h2>Wave ${r}</h2>
    ${wi.freeplay ? '<div class="hint">Freeplay waves are randomized giants and armored hordes that grow every round.</div>' : `<ul class="wlist">${rows}</ul>
    <div class="hint">Threat size: <b>${fmt(wi.rbe)}</b> layers${wi.worstLeak !== Infinity ? ` · worst single leak: <b>${fmt(wi.worstLeak)}</b> lives` : ''}.</div>`}
    ${threats ? `<ul class="tlist">${threats}</ul>` : '<div class="hint">No special traits. Any tower works.</div>'}
    <button class="mbtn btn3d gilt" data-m="resume">Got it</button>`);
}

// ================================================================ side panel
const side = $('#side');
const sbody = $('#sbody');
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
  else if (a === 'rally' && selected) { rallyEdit = rallyEdit ? null : selected; audio.play('click'); panelKey = ''; }
  else if (a === 'powers') powersMenu();
  else if (a === 'groups') groupGuide(v || undefined);
  else if (a === 'waveinfo') waveDetails();
  else if (a === 'info' && selected) towerInfoModal(selected.defId, selected.isHero);
});

function buyUpgrade(p: number) {
  if (!game || !selected) return;
  const t = selected;
  if (t.isHero) return;
  if (t.tiers[p] >= 5) { audio.play('error'); toast('Path maxed out', 'bad'); return; }
  if (!canUpgradePath(t.tiers, p)) { audio.play('error'); toast('Path closed: only 2 paths, and only one past tier 2', 'bad'); return; }
  const cost = game.upgradeCost(t, p);
  if (game.gold < cost) { audio.play('error'); toast(`Not enough gold (need ${fmt(cost - game.gold)} more)`, 'bad'); return; }
  if (game.upgrade(t, p)) { audio.play('upgrade'); panelKey = ''; }
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
const img = (defId: string, isHero = false, size = 52) => `<img src="${iconURL(defId, isHero)}" width="${size}" height="${size}" alt="" draggable="false">`;

function renderSide() {
  if (!game) return;
  const g = game;
  const t = selected && g.towers.includes(selected) ? selected : null;
  if (!t && selected) selected = null;
  const key = t ? `t${t.uid}|${t.tiers.join('')}|${t.targeting}|${t.level}|${Math.floor(t.bank)}|${!!rallyEdit}` : `shop|${profile.totalRounds}|${g.heroId}`;
  if (key !== panelKey) {
    panelKey = key;
    sbody.innerHTML = t ? towerPanel(t) : shopPanel();
  }
  if (!t) updateShop();
  sbody.querySelectorAll<HTMLElement>('[data-cost]').forEach((el) => el.classList.toggle('poor', g.gold < Number(el.dataset.cost)));
  if (t) { const st = sbody.querySelector('.tp-sub'); if (st) st.textContent = towerStatLine(t); }
}

/** Plain-language combat record for a tower. */
function towerStatLine(t: Tower) {
  const parts = [`Damage ${fmtShort(t.dmg)}`, `Layers ${fmtShort(t.pops)}`];
  if (t.stats.barracks) parts.push(`Held ${fmtShort(t.assists)}`);
  else if (t.assists) parts.push(`Slowed/stunned ${fmtShort(t.assists)}`);
  if (t.stats.income) parts.push(`+${fmt(t.stats.income * t.stats.incomeMult)}/wave`);
  if (t.stats.aura || t.stats.brew) parts.push('Buffs allies');
  return parts.join(' · ');
}

// Armory: built once per session, then updated in place so cards never move.
function shopPanel() {
  const g = game!;
  const hd = g.heroDef;
  const card = (id: string) => {
    if (id === 'hero') return `<button class="card hero" data-a="buy" data-v="hero" data-cost="${g.towerCost('hero')}">${img(hd.id, true)}<div class="nm">${esc(hd.name)}</div><div class="role">Hero</div><div class="cost">${ICON.coinSmall}<span>${fmt(g.towerCost('hero'))}</span></div></button>`;
    const d = TOWER_MAP[id];
    const cost = g.towerCost(id);
    return towerUnlocked(profile, id)
      ? `<button class="card" data-a="buy" data-v="${id}" data-cost="${cost}">${img(id)}<div class="nm">${esc(d.name)}</div><div class="role">${esc(infoFor(id, false).tag)}</div><div class="cost">${ICON.coinSmall}<span>${fmt(cost)}</span></div></button>`
      : `<button class="card locked" data-a="buy" data-v="${id}" data-lock="${esc(d.name)} unlocks after ${d.unlockRounds} rounds played (${d.unlockRounds - profile.totalRounds} to go)">${img(id)}<div class="nm">${esc(d.name)}</div><div class="role">${esc(infoFor(id, false).tag)}</div><div class="cost">${ICON.lock.replace('class="ico"', 'class="ico sm"')} ${d.unlockRounds - profile.totalRounds}</div></button>`;
  };
  // Towers are grouped by job; each group box spans as many grid columns as it has cards.
  let h = `<div class="side-title">Armory</div><div class="shop">`;
  for (const gr of GROUPS) {
    h += `<div class="grp ${gr.towers.length === 1 ? "one" : ""}" style="--gc:${gr.color};--n:${gr.towers.length}"><button class="grp-h" data-a="groups" data-v="${gr.id}" title="${esc(gr.how)}"><b>${esc(gr.name)}</b><span>${esc(gr.short)}</span></button><div class="grp-c">${gr.towers.map(card).join('')}</div></div>`;
  }
  h += `</div><div class="row"><button class="btn btn3d woodb" data-a="groups">${ICON.book} Tower guide</button><button class="btn btn3d blueb" data-a="powers">${ICON.sparkle} Powers <span id="pwN"></span></button></div>
    <div class="hint" id="shopHint"></div>`;
  return h;
}
/** Explains the tower groups and a sensible build order. */
function groupGuide(focus?: string) {
  const rows = GROUPS.map((gr) => `<div class="gg ${gr.id === focus ? 'focus' : ''}" style="--gc:${gr.color}"><div class="gg-h"><b>${esc(gr.name)}</b><span>${gr.towers.map((t) => esc(t === 'hero' ? 'your hero' : TOWER_MAP[t].name)).join(' · ')}</span></div><div class="gg-t">${esc(gr.how)}</div></div>`).join('');
  modal(`<h2>Tower Guide</h2><div class="hint">Every tower has a job. A strong defense mixes groups.</div>${rows}
    <div class="ti-h">A good build order</div><ol class="rc-tips">${BUILD_ORDER.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <button class="mbtn btn3d gilt" data-m="resume">Got it</button>`);
  if (focus) modalEl.querySelector('.gg.focus')?.scrollIntoView({ block: 'center' });
}
function updateShop() {
  const g = game!;
  for (const el of Array.from(sbody.querySelectorAll<HTMLElement>('.card[data-v]'))) {
    const id = el.dataset.v!;
    if (el.classList.contains('locked')) continue;
    el.classList.toggle('sel', placing === id);
    const cost = g.towerCost(id);
    if (id === 'hero') {
      const dep = g.heroPlaced;
      if (el.classList.contains('deployed') !== dep) {
        el.classList.toggle('deployed', dep);
        const c = el.querySelector('.cost');
        if (c) c.innerHTML = dep ? '<span>Deployed</span>' : `${ICON.coinSmall}<span>${fmt(cost)}</span>`;
        if (dep) { el.removeAttribute('data-cost'); el.classList.remove('poor'); } else el.dataset.cost = String(cost);
      }
      if (dep) continue;
    }
    if (el.dataset.cost !== String(cost)) { el.dataset.cost = String(cost); const c = el.querySelector('.cost span'); if (c) c.textContent = cost === 0 ? 'FREE' : fmt(cost); }
  }
  const pw = Object.values(profile.powers).reduce((a, b) => a + b, 0);
  const n = sbody.querySelector('#pwN'); if (n && n.textContent !== `(${pw})`) n.textContent = `(${pw})`;
  const hint = sbody.querySelector('#shopHint');
  const txt = g.freeTower ? '📜 Your next tower is free!' : matchMedia('(pointer: coarse)').matches ? '<b>Drag</b> a tower onto the map, or tap it, then tap the map. Tap a built tower to upgrade it.' : '<b>Drag</b> a tower onto the map, or click it, then click the map. Hold <b>Shift</b> to build several. Click a tower to upgrade it.';
  if (hint && hint.innerHTML !== txt) hint.innerHTML = txt;
}

function towerPanel(t: Tower) {
  const g = game!;
  const head = (name: string, isHero: boolean) => {
    const inf = infoFor(t.defId, isHero), dt = DTYPE[baseStats(t.defId, isHero).dtype];
    return `<div class="tp-head">${img(t.defId, isHero)}<div><div class="tp-name">${esc(name)}</div><div class="tp-sub"></div></div><button class="tp-x btn3d redb" data-a="close" title="Close (Esc)">${ICON.close}</button></div>
    <button class="tp-role" data-a="info" title="What this tower does">${ICON.info}<span><b>${esc(inf.tag)}</b> · ${esc(dt.name)} damage. ${esc(inf.line)}</span></button>`;
  };
  let h = '';
  if (t.isHero) {
    const hd = HERO_MAP[t.defId];
    const L = t.level, next = HERO_XP[L] ?? null, prev = HERO_XP[L - 1];
    h += head(`${hd.name} · Lv ${L}`, true);
    h += `<div class="hint">${esc(hd.title)}. ${esc(hd.desc)}</div>`;
    h += `<div class="xpbar"><div style="width:${next ? Math.min(100, ((t.xp - prev) / (next - prev)) * 100) : 100}%"></div></div>`;
    h += `<div class="hint">${next ? `XP ${fmt(t.xp)} / ${fmt(next)} to level ${L + 1}` : 'MAX LEVEL'}. Heroes gain XP every wave.</div>`;
    for (const a of hd.abilities) {
      const has = t.abilities.some((x) => x.def.id === a.def.id);
      h += `<div class="path"><div class="path-h p1">${esc(a.def.name)} <span class="pips">${has ? 'Unlocked' : `Unlocks at Lv ${a.level}`}</span></div><div class="up max"><div class="ud">${esc(a.desc)} · ${a.def.cd}s recharge</div></div></div>`;
    }
  } else {
    const d = TOWER_MAP[t.defId];
    h += head(d.name, false);
    for (let p = 0; p < 3; p++) {
      const tier = t.tiers[p];
      const pips = Array.from({ length: 5 }, (_, i) => `<div class="pip ${i < tier ? 'on' : ''}"></div>`).join('');
      let btn: string;
      if (tier >= 5) btn = `<div class="up max"><div class="un">${esc(d.upgrades[p][4].name)} <span>MAX</span></div></div>`;
      else if (!canUpgradePath(t.tiers, p)) btn = `<div class="up closed"><div class="un">${esc(d.upgrades[p][tier].name)} <span>${ICON.lock.replace('class="ico"', 'class="ico sm"')}</span></div><div class="ud">Path closed: 2 paths max, only one past tier 2</div></div>`;
      else { const u = d.upgrades[p][tier]; const cost = g.upgradeCost(t, p); btn = `<button class="up btn3d woodb" data-a="up" data-v="${p}" data-cost="${cost}"><div class="un">${esc(u.name)} <span class="uc">${ICON.coinSmall}${fmt(cost)}</span></div><div class="ud">${esc(u.desc)}</div></button>`; }
      h += `<div class="path"><div class="path-h p${p}">${esc(d.paths[p])}<div class="pips">${pips}</div></div>${btn}</div>`;
    }
    if (t.stats.bank) h += `<div class="row"><button class="btn btn3d gilt" data-a="withdraw">${ICON.coinSmall} Withdraw ${fmt(t.bank)}</button></div>`;
    if (t.stats.barracks) h += `<div class="row"><button class="btn btn3d ${rallyEdit ? 'gilt' : 'blueb'}" data-a="rally">${ICON.flag} ${rallyEdit ? 'Tap the road… (Cancel)' : 'Move Rally Point'}</button></div>`;
  }
  const canTarget = t.stats.attacks.length > 0;
  const tlabel = t.targeting[0].toUpperCase() + t.targeting.slice(1);
  h += `<div class="row">${canTarget ? `<button class="btn btn3d woodb" data-a="target" title="Which enemy to shoot: First, Last, Strong, Close">${ICON.target} Target: ${tlabel}</button>` : ''}<button class="btn btn3d redb" data-a="sell">Sell ${ICON.coinSmall}${fmt(g.sellValue(t) + t.bank)}</button></div>`;
  return h;
}

// ================================================================ tower info: hover tip (mouse) + full info sheet
function infoBody(defId: string, isHero: boolean, compact: boolean) {
  const inf = infoFor(defId, isHero), st = baseStats(defId, isHero), dt = DTYPE[st.dtype];
  const rows = st.rows.map(([k, v]) => `<div class="ti-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  const good = inf.good.map((x) => `<li>${esc(x)}</li>`).join(''), weak = inf.weak.map((x) => `<li>${esc(x)}</li>`).join('');
  const gr = groupOf(isHero ? 'hero' : defId);
  let h = `<div class="ti-grp" style="--gc:${gr.color}"><b>${esc(gr.name)}</b> ${esc(gr.how)}</div><div class="ti-line">${esc(inf.line)}</div>
    <div class="ti-dt"><span class="chip">${esc(dt.name.toUpperCase())}</span> ${esc(dt.blocked)}</div>
    ${compact ? '' : `<div class="ti-stats">${rows}</div>`}
    <div class="ti-gw"><div><div class="ti-h good">Good against</div><ul>${good}</ul></div><div><div class="ti-h weak">Weak against</div><ul>${weak}</ul></div></div>`;
  if (!compact && !isHero) {
    const d = TOWER_MAP[defId];
    h += `<div class="ti-h">Upgrade paths (pick 2, only one past tier 2)</div><div class="ti-paths">${d.paths.map((pn, p) => `<div class="ti-path"><div class="path-h p${p}">${esc(pn)}</div><ol>${d.upgrades[p].map((u) => `<li><b>${esc(u.name)}</b><span>${esc(u.desc)}</span></li>`).join('')}</ol></div>`).join('')}</div>`;
  }
  if (!compact && isHero) {
    const hd = HERO_MAP[defId];
    h += `<div class="ti-h">Abilities</div><ul class="ti-ab">${hd.abilities.map((a) => `<li><b>Lv ${a.level}: ${esc(a.def.name)}</b> ${esc(a.desc)}</li>`).join('')}</ul><div class="hint">Heroes level up every wave (max 10).</div>`;
  }
  return h;
}
function towerInfoModal(defId: string, isHero: boolean, lockNote?: string) {
  const name = isHero ? HERO_MAP[defId].name : TOWER_MAP[defId].name;
  const cost = game ? game.towerCost(isHero ? 'hero' : defId) : isHero ? HERO_MAP[defId].cost : TOWER_MAP[defId].cost;
  modal(`<div class="ti-head">${img(defId, isHero, 64)}<div><h2>${esc(name)}</h2><div class="ti-cost">${ICON.coinSmall} ${fmt(cost)} · <b>${esc(infoFor(defId, isHero).tag)}</b></div></div></div>
    ${lockNote ? `<div class="hint" style="color:#8a1610">🔒 ${esc(lockNote)}</div>` : ''}
    <div class="ti">${infoBody(defId, isHero, false)}</div>
    <button class="mbtn btn3d gilt" data-m="resume">Got it</button>`);
}
/** Card under the mouse (desktop); its summary shows in the side panel's info slot. */
let hoverId: string | null = null;
function hideTip() { hoverId = null; }
function hoverHtml(id: string) {
  const g = game!;
  const isHero = id === 'hero', defId = isHero ? g.heroDef.id : id;
  const inf = infoFor(defId, isHero), gr = groupOf(isHero ? 'hero' : defId), dt = DTYPE[baseStats(defId, isHero).dtype];
  const name = isHero ? g.heroDef.name : TOWER_MAP[id].name;
  return `<div class="hb slotinfo" style="--gc:${gr.color}"><div class="hb-t"><b>${esc(name)} <span class="chip" style="background:var(--gc)">${esc(gr.name)}</span></b><span class="hb-line">${esc(inf.line)}</span><span class="hb-st">${esc(dt.name)}: ${esc(dt.blocked)}</span></div></div>`;
}
sbody.addEventListener('pointerover', (ev) => {
  if (ev.pointerType !== 'mouse' || drag || placing) return;
  const card = (ev.target as HTMLElement).closest('.card[data-v]') as HTMLElement | null;
  hoverId = card ? card.dataset.v! : null;
});
sbody.addEventListener('pointerleave', () => { hoverId = null; });
function flashSlot() { waveBox.classList.remove('shake'); void waveBox.offsetWidth; waveBox.classList.add('shake'); }

// ================================================================ field HUD bar: placement / aiming / rally instructions
let hudKey = '';
function renderHud() {
  if (!game) return;
  const g = game;
  let key = '', html = '';
  if (placing) {
    const nm = placing === 'hero' ? g.heroDef.name : TOWER_MAP[placing].name;
    const cost = g.towerCost(placing, ghost?.x, ghost?.y);
    const status = !ghost ? (drag ? 'Drop it on the map' : matchMedia('(pointer: coarse)').matches ? 'Tap the map to build' : 'Click the map to build') : ghost.valid ? (drag ? 'Release to build here' : 'Tap to build here') : ghost.reason ?? 'Can\'t build here';
    const bad = !!ghost && !ghost.valid;
    key = `p|${placing}|${cost}|${status}|${bad}`;
    const inf = infoFor(placing === 'hero' ? g.heroDef.id : placing, placing === 'hero');
    html = `<div class="hb ${bad ? 'bad' : ''}">${img(placing === 'hero' ? g.heroDef.id : placing, placing === 'hero', 34)}<div class="hb-t"><b>${esc(nm)} · ${cost === 0 ? 'FREE' : fmt(cost)}g</b><span class="hb-line">${esc(inf.line)}</span><span class="hb-st">${bad ? '✖ ' : '✔ '}${esc(status)}${placing === 'barracks' && ghost?.valid ? ' · flag = where soldiers stand' : ''}</span></div><div class="hb-btns"><button class="hb-x btn3d blueb" data-h="info">${ICON.info}<span>Info</span></button><button class="hb-x btn3d redb" data-h="cancel">${ICON.close}<span>Cancel</span></button></div></div>`;
  } else if (armedSpell) {
    const sp = g.spells.find((s) => s.id === armedSpell)!;
    key = `s|${armedSpell}`;
    html = `<div class="hb"><div class="hb-t"><b>${esc(sp.name)}</b><span>Tap the map to aim</span></div><button class="hb-x btn3d redb" data-h="cancel">${ICON.close}<span>Cancel</span></button></div>`;
  } else if (rallyEdit) {
    key = 'r';
    html = `<div class="hb"><div class="hb-t"><b>Move Rally Point</b><span>Tap the road inside the blue circle</span></div><button class="hb-x btn3d redb" data-h="cancel">${ICON.close}<span>Cancel</span></button></div>`;
  }
  if (!key && hoverId) { key = `h|${hoverId}`; html = hoverHtml(hoverId); }
  if (key === hudKey) return;
  hudKey = key;
  if (html) { waveBox.innerHTML = html; waveBox.classList.add('slot'); }
  else { waveBox.classList.remove('slot'); waveKey = ''; renderWaveBox(); }
}
waveBox.addEventListener('pointerdown', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-h]') as HTMLElement | null;
  if (!el) return;
  ev.stopPropagation(); audio.play('click');
  if (el.dataset.h === 'info' && placing && game) { towerInfoModal(placing === 'hero' ? game.heroDef.id : placing, placing === 'hero'); return; }
  cancelPlacing(); cancelSpells(); panelKey = '';
});

// ================================================================ abilities bar
const abil = $('#abil');
abil.addEventListener('pointerdown', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-ab]') as HTMLElement | null;
  if (!el || !game) return;
  ev.stopPropagation();
  audio.init();
  const [kind, id, uid] = el.dataset.ab!.split(':');
  if (kind === 'p') { powersMenu(); return; }
  if (kind === 's') {
    const sp = game.spells.find((s) => s.id === id)!;
    const err = game.spellBlock(id);
    if (err) { audio.play('error'); toast(`${sp.name}: ${err}`, 'bad'); return; }
    if (sp.targeted) { armedSpell = armedSpell === id ? null : id; cancelPlacing(); rallyEdit = null; }
    else if (game.castSpell(id)) { audio.play('ability'); toast(id === 'reinforce' ? `${sp.name}: +${game.lastHeal} lives` : `${sp.name}!`, 'good'); }
  } else {
    const t = game.towers.find((x) => x.uid === Number(uid));
    const ab = t?.abilities.find((a) => a.def.id === id);
    if (!t || !ab) return;
    const err = game.state !== 'wave' ? 'only during a wave' : ab.left > 0 ? `recharging: ${Math.ceil(ab.left)}s of battle time left` : null;
    if (!err && game.useAbility(t, id)) { audio.play('ability', { x: t.x }); toast(`${ab.def.name}!`, 'good'); }
    else { audio.play('error'); toast(`${ab.def.name}: ${err ?? 'no target'}`, 'bad'); }
  }
});
let abilKey = '';
function renderAbil() {
  if (!game) return;
  const g = game;
  const items: { key: string; icon: string; left: number; cd: number; title: string; name: string; usable: boolean }[] = [];
  const SPELL_ICON: Record<string, string> = { meteor: ICON.meteor, freeze: ICON.hourglass, reinforce: ICON.shield };
  for (const s of g.spells) items.push({ key: `s:${s.id}:0`, icon: SPELL_ICON[s.id] ?? s.icon, left: s.left, cd: s.cd, title: `${s.name}: ${s.desc}. ${s.cd}s recharge (battle time).`, name: s.name, usable: !g.spellBlock(s.id) });
  for (const t of g.towers) for (const a of t.abilities) items.push({ key: `t:${a.def.id}:${t.uid}`, icon: `<img src="${iconURL(t.defId, t.isHero)}" alt="" draggable="false">`, left: a.left, cd: a.def.cd, title: `${a.def.name}: ${a.def.cd}s recharge (battle time)`, name: a.def.name, usable: a.left <= 0 && g.state === 'wave' });
  const pw = Object.values(profile.powers).reduce((a, b) => a + b, 0);
  items.push({ key: 'p:powers:0', icon: ICON.sparkle, left: 0, cd: 1, title: 'Powers: one-shot items you earn by playing', name: `Powers (${pw})`, usable: pw > 0 });
  const key = items.map((i) => i.key + i.name).join(',');
  if (key !== abilKey) {
    abilKey = key;
    abil.innerHTML = items.map((i) => `<button class="abw" data-ab="${i.key}" title="${esc(i.title)}"><div class="ab">${i.icon}<div class="cdv"></div><div class="cdt"></div></div><div class="abl">${esc(i.name)}</div></button>`).join('');
  }
  const els = abil.children;
  const live = g.state === 'wave';
  items.forEach((it, i) => {
    const w = els[i] as HTMLElement;
    const el = w.firstElementChild as HTMLElement;
    const frac = it.left / it.cd;
    el.classList.toggle('ready', it.usable && it.left <= 0);
    el.classList.toggle('idle', !it.usable);
    el.classList.toggle('armed', armedSpell !== null && it.key === `s:${armedSpell}:0`);
    (el.children[1] as HTMLElement).style.background = frac > 0 ? `conic-gradient(rgba(10,4,20,0.72) ${frac * 360}deg, transparent 0)` : 'none';
    // seconds left; a pause glyph means "recharge is waiting for the next wave"
    (el.children[2] as HTMLElement).textContent = it.left > 0 ? `${Math.ceil(it.left)}${live ? '' : '⏸'}` : '';
  });
}

// ================================================================ first-run tutorial (non-blocking coach card)
const coach = $('#coach');
const TUT = [
  { id: 'placed', title: 'Build a tower', text: 'Drag a tower from the Armory onto the grass, or tap it and then tap the map. The ring shows its range.' },
  { id: 'selected', title: 'Upgrade it', text: 'Tap your tower to see its 3 upgrade paths. You can take 2 paths, and only one past tier 2.' },
  { id: 'read', title: 'Know your enemy', text: 'The Next Wave box lists what\'s coming. Tags like SHARP-PROOF or GIANT tell you which towers you need.' },
  { id: 'wave', title: 'Start the wave', text: 'Press Start (top right). Use Speed for 2× or 3×, and Pause any time.' },
];
let tutStep = -1;
function tut(evId: string) {
  if (tutStep < 0 || tutStep >= TUT.length) return;
  if (TUT[tutStep].id === evId) { tutStep++; renderCoach(); }
  if (evId === 'wave' && tutStep < TUT.length) { tutStep = TUT.length; renderCoach(); } // started early: done
}
function renderCoach() {
  if (tutStep >= TUT.length) { profile.tutorialDone = true; saveProfile(profile); tutStep = -1; }
  if (tutStep < 0) { coach.classList.remove('on'); coach.innerHTML = ''; return; }
  const s = TUT[tutStep];
  coach.innerHTML = `<div class="cc"><div class="cc-n">${tutStep + 1}/${TUT.length}</div><div class="cc-t"><b>${esc(s.title)}</b><span>${esc(s.text)}</span></div><div class="cc-b">${s.id === 'read' ? '<button class="btn3d gilt" data-c="next">Got it</button>' : ''}<button class="btn3d woodb" data-c="skip">Skip</button></div></div>`;
  coach.classList.add('on');
}
coach.addEventListener('pointerdown', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-c]') as HTMLElement | null;
  if (!el) return;
  ev.stopPropagation(); audio.play('click');
  if (el.dataset.c === 'skip') tutStep = TUT.length; else tutStep++;
  renderCoach();
});

// ================================================================ events
const SHOT_SOUND: Record<string, string> = { arrow: 'bow', firearrow: 'bow', thorn: 'bow', shard: 'bow', star: 'fire', fireball: 'fire', comet: 'fire', bomb: 'cannon', bolt: 'zap', ballista: 'ballista', sweep: 'swing', frost: 'frost', potion: 'potion', vine: 'whip' };
const leakAgg: Record<string, { n: number; lives: number }> = {};
let leakTimer = 0;
/** One ribbon per burst of leaks: "Leaked: 3 Ogres, 1 Troll (−19 lives)". */
function flushLeaks() {
  leakTimer = 0;
  const ents = Object.entries(leakAgg).sort((a, b) => b[1].lives - a[1].lives);
  if (!ents.length) return;
  const total = ents.reduce((s, [, v]) => s + v.lives, 0);
  const what = ents.slice(0, 2).map(([n, v]) => `${v.n} ${n}${v.n > 1 && !n.endsWith('s') ? 's' : ''}`).join(', ') + (ents.length > 2 ? '…' : '');
  for (const k of Object.keys(leakAgg)) delete leakAgg[k];
  if (game && game.state === 'over') return;
  toast(`Leaked: ${what} (−${fmt(total)} lives)`, 'bad');
  const sb = document.querySelector('.stat.lives'); if (sb) { sb.classList.remove('hit'); void (sb as HTMLElement).offsetWidth; sb.classList.add('hit'); }
}
function handleEvents() {
  if (!game) return;
  const g = game;
  for (const e of g.events) {
    switch (e.type) {
      case 'pop': audio.play(e.big ? 'bigpop' : 'pop', { x: e.x }); break;
      case 'shoot': audio.play(SHOT_SOUND[e.kind] ?? 'bow', { x: e.x }); break;
      case 'boom': audio.play('boom', { x: e.x }); break;
      case 'leak': audio.play('leak'); { const l = (leakAgg[e.name] ??= { n: 0, lives: 0 }); l.n++; l.lives += e.lives; if (!leakTimer) leakTimer = window.setTimeout(flushLeaks, 700); } break;
      case 'waveStart': audio.play(e.boss ? 'boss' : 'wave'); if (e.boss) toast('⚠ Boss wave!', 'bad'); break;
      case 'waveEnd': onWaveEnd(e.round); break;
      case 'levelUp': audio.play('level'); toast(`Hero reached level ${e.level}!`, 'good'); break;
      case 'bossDown': toast(`🏆 ${e.name} defeated!`, 'good'); break;
      case 'gameOver': onGameEnd(false); break;
      case 'victory': onGameEnd(true); break;
    }
  }
  g.events.length = 0;
}

function onWaveEnd(round: number) {
  if (!game) return;
  audio.play('coin');
  const before = profile.totalRounds;
  profile.totalRounds++;
  for (const t of TOWERS) if (before < t.unlockRounds && profile.totalRounds >= t.unlockRounds) toast(`🔓 New tower: ${t.name}!`, 'good');
  for (const h of HEROES) if (before < h.unlockRounds && profile.totalRounds >= h.unlockRounds) toast(`🔓 New hero: ${h.name}!`, 'good');
  if (game.freeplay) { const m = (profile.medals[game.map.id] ??= {}); m.freeplay = Math.max(m.freeplay ?? 0, round); }
  saveProfile(profile);
  if (game.state === 'build') saveRun(game);
  panelKey = '';
  // the auto-start countdown is handled by the main loop in game time (pausing holds it; turning Auto off cancels it)
  const wi = waveInfo(round + 1);
  if (game.state === 'build' && !wi.freeplay) { const big = wi.threats.find((t) => t.danger); if (big) toast(`Next: ${big.tag}. Check Details`, 'bad'); }
}

/** Powers earned by a defeat are granted when the player leaves the run (not on Retry, so retries can't farm them). */
let pendingPowers: string[] = [];
function grantPending() { for (const p of pendingPowers) profile.powers[p] = (profile.powers[p] ?? 0) + 1; if (pendingPowers.length) saveProfile(profile); pendingPowers = []; }
let recapHtml = '';
function onGameEnd(won: boolean) {
  if (!game || endHandled) return;
  endHandled = true;
  autoT = null;
  const g = game;
  audio.play(won ? 'win' : 'lose');
  const earned = powersEarned(g.round, won);
  const pwIcons = earned.map((id) => POWERS.find((p) => p.id === id)!.icon).join(' ');
  const top = g.towers.filter((t) => !t.isHero || t.dmg > 0).sort((a, b) => b.dmg - a.dmg).slice(0, 3)
    .map((t) => `<li><b>${esc(t.isHero ? HERO_MAP[t.defId].name : TOWER_MAP[t.defId].name)}</b>: ${fmtShort(t.dmg)} damage</li>`).join('');
  if (won) {
    for (const p of earned) profile.powers[p] = (profile.powers[p] ?? 0) + 1;
    let medal = '';
    const m = (profile.medals[g.map.id] ??= {});
    if (!m[g.diff]) medal = `🏅 New medal: ${g.map.name} (${DIFF[g.diff].label})! +1 knowledge point`;
    m[g.diff] = 1;
    saveProfile(profile);
    modal(`<h2>🏆 Victory!</h2>
      <div class="hint">You held ${esc(g.map.name)} through all ${g.totalWaves} waves. Unspent gold: ${fmtShort(g.gold)}</div>
      ${top ? `<ul class="wlist">${top}</ul>` : ''}
      ${medal ? `<div class="hint" style="color:#a8680f">${medal}</div>` : ''}${earned.length ? `<div class="hint">Powers earned: ${pwIcons}</div>` : ''}
      <button class="mbtn big btn3d gilt" data-m="freeplay">Continue: Freeplay</button>
      <button class="mbtn btn3d woodb" data-m="restart">Restart</button>
      <button class="mbtn btn3d woodb" data-m="menu">Main Menu</button>`);
    return;
  }
  pendingPowers = earned;
  const rc = analyzeDefeat(g);
  const maxLeak = Math.max(1, ...rc.leaks.map((l) => l.lives));
  const leakRows = rc.leaks.slice(0, 5).map((l) => `<div class="rc-leak"><span class="rc-ln">${l.n}× ${esc(l.name)}</span><span class="rc-bar"><i style="width:${Math.max(6, (l.lives / maxLeak) * 100)}%"></i></span><b>−${fmt(l.lives)}</b></div>`).join('');
  const maxH = Math.max(1, ...rc.history.map((h) => h.lost));
  const hist = rc.history.map((h) => `<div class="rc-col ${h.round === rc.round ? 'last' : ''}" title="Wave ${h.round}: −${h.lost} lives"><i style="height:${h.lost ? Math.max(8, (h.lost / maxH) * 100) : 2}%"></i><span>${h.round}</span></div>`).join('');
  const tips = rc.tips.map((t) => `<li>${esc(t.text)}${t.tower ? ` <button class="rc-info" data-m="tinfo:${t.tower}">${ICON.info} ${esc(TOWER_MAP[t.tower].name)}</button>` : ''}</li>`).join('');
  const canRetry = !!g.waveStartSave;
  recapHtml = `<h2>💀 The Spire Has Fallen</h2>
    <div class="hint">${esc(g.map.name)} · ${DIFF[g.diff].label} · fell on wave ${rc.round}</div>
    <div class="rc-cause">${esc(rc.cause)}</div>
    ${leakRows ? `<div class="ti-h">What got through on wave ${rc.round}</div><div class="rc-leaks">${leakRows}</div>` : ''}
    ${rc.history.length > 1 ? `<div class="ti-h">Lives lost per wave</div><div class="rc-hist">${hist}</div>` : ''}
    ${tips ? `<div class="ti-h">How to hold next time</div><ul class="rc-tips">${tips}</ul>` : ''}
    ${top ? `<details class="rc-more"><summary>Your top towers</summary><ul class="wlist">${top}</ul></details>` : ''}
    ${canRetry ? `<button class="mbtn big btn3d gilt" data-m="retrywave">↻ Retry wave ${rc.round}</button><div class="hint rc-small">Restarts this wave with your defenses as they were before it began, so you can rebuild.</div>` : ''}
    <button class="mbtn btn3d woodb" data-m="restart">Restart map</button>
    <button class="mbtn btn3d woodb" data-m="menu">Main Menu</button>
    ${earned.length ? `<div class="hint rc-small">Powers ${pwIcons} are yours when you leave this run.</div>` : ''}`;
  modal(recapHtml);
}

function retryWave() {
  if (!game || !game.waveStartSave) return;
  const hist = game.history.slice(0, -1);
  const g = Game.restore(game.waveStartSave, profile.perks);
  g.history = hist;
  game = g;
  saveRun(g);
  beginSession();
  toast(`Wave ${g.round + 1}: rebuild, then press Start`, 'info');
}

// ================================================================ modal + menus
const modalEl = $('#modal');
function modal(html: string) { modalEl.innerHTML = `<div class="scroll"><div class="mbox">${html}</div></div>`; modalEl.classList.add('on'); paused = true; lastTop = ''; }
function closeModal() { modalEl.classList.remove('on'); modalEl.innerHTML = ''; paused = false; lastTop = ''; }
modalEl.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-m]') as HTMLElement | null;
  if (!el) { if (ev.target === modalEl && game && game.state !== 'over' && game.state !== 'victory') closeModal(); return; }
  audio.play('click');
  const m = el.dataset.m!;
  if (m === 'resume') closeModal();
  else if (m === 'freeplay') { game?.continueFreeplay(); endHandled = false; closeModal(); if (game) saveRun(game); }
  else if (m === 'restart') { grantPending(); if (game) { clearRun(); startGame(game.map.id, game.diff, game.heroId); } closeModal(); }
  else if (m === 'retrywave') { closeModal(); retryWave(); }
  else if (m.startsWith('tinfo:')) { towerInfoModal(m.slice(6), false); const btn = modalEl.querySelector('[data-m="resume"]'); if (btn && recapHtml && game?.state === 'over') { btn.setAttribute('data-m', 'recap'); btn.textContent = '‹ Back to recap'; } }
  else if (m === 'recap') modal(recapHtml);
  else if (m === 'menu') { grantPending(); if (game && game.state === 'over') clearRun(); else if (game && game.state === 'build' && game.round > 0) saveRun(game); closeModal(); showMenu('main'); }
  else if (m === 'auto') { toggleAuto(); pauseMenu(); }
  else if (m === 'sfx') { profile.settings.sfx = !profile.settings.sfx; audio.setSfx(profile.settings.sfx); saveProfile(profile); pauseMenu(); }
  else if (m === 'music') { profile.settings.music = !profile.settings.music; audio.setMusic(profile.settings.music); saveProfile(profile); pauseMenu(); }
  else if (m === 'full') { toggleFullscreen(); setTimeout(pauseMenu, 150); }
  else if (m.startsWith('power:')) {
    const id = m.slice(6);
    const p = POWERS.find((x) => x.id === id)!;
    if ((profile.powers[id] ?? 0) <= 0) { audio.play('error'); toast(`No ${p.name} left. Earn more by finishing games`, 'bad'); return; }
    const err = game?.powerBlock(id);
    if (err) { audio.play('error'); toast(`${p.name}: ${err}`, 'bad'); return; }
    if (game && game.usePower(id)) { profile.powers[id]--; saveProfile(profile); audio.play('ability'); toast(`${p.name}: ${p.desc}`, 'good'); panelKey = ''; abilKey = ''; closeModal(); }
  }
});

function pauseMenu() {
  if (!game || game.state === 'over' || game.state === 'victory') return;
  const fs = document.fullscreenEnabled ? `<button class="mbtn btn3d woodb" data-m="full">Fullscreen: ${document.fullscreenElement ? 'On' : 'Off'}</button>` : '';
  modal(`<h2>Paused</h2>
    <div class="hint">${game.map.name} · ${DIFF[game.diff].label} · Wave ${game.round}${game.state === 'wave' ? ' (in progress)' : ''}</div>
    <button class="mbtn big btn3d gilt" data-m="resume">${ICON.play} Resume</button>
    <button class="mbtn btn3d woodb" data-m="auto">Auto-start waves: ${profile.settings.autoStart ? 'On' : 'Off'}</button>
    <div class="mrow"><button class="mbtn btn3d woodb" data-m="sfx">Sound: ${profile.settings.sfx ? 'On' : 'Off'}</button><button class="mbtn btn3d woodb" data-m="music">Music: ${profile.settings.music ? 'On' : 'Off'}</button></div>
    ${fs}
    <button class="mbtn btn3d woodb" data-m="restart">Restart Map</button>
    <button class="mbtn btn3d woodb" data-m="menu">Save &amp; Quit</button>
    <div class="hint">Progress saves at the end of every wave. Quitting mid-wave resumes from the start of that wave.</div>`);
}

function powersMenu() {
  const rows = POWERS.map((p) => {
    const n = profile.powers[p.id] ?? 0;
    const why = !n ? 'None left' : game?.powerBlock(p.id) ?? '';
    return `<button class="pw btn3d woodb ${n && !why ? '' : 'empty'}" data-m="power:${p.id}"><div class="pi">${p.icon}</div><div class="pt"><b>${p.name}</b><span>${p.desc}${why ? ` · <i>${esc(why)}</i>` : ''}</span></div><div class="pc">×${n}</div></button>`;
  }).join('');
  modal(`<h2>Powers</h2><div class="hint">One-shot items. Earn more by finishing games: the more waves you survive, the more you get.</div>${rows}<button class="mbtn btn3d woodb" data-m="resume">Close</button>`);
}

function toggleFullscreen() {
  try { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); } catch { /* not allowed here */ }
}

// ---------------------------------------------------------------- main menu screens
const menu = $('#menuBody');
const menuWrap = $('#menu');
let menuScreen = 'main';
const pick = { map: profile.lastMap ?? 'meadow', diff: (profile.lastDiff ?? 'medium') as Difficulty, hero: profile.lastHero };
if (!mapUnlocked(profile, pick.map)) pick.map = 'meadow';
if (!heroUnlocked(profile, pick.hero)) pick.hero = 'aldric';

function showMenu(screen: 'main' | 'play' | 'tree' | 'settings' | 'how') {
  menuScreen = screen;
  menuWrap.classList.add('on');
  menuWrap.classList.toggle('setupmode', screen === 'play');
  $('#game').classList.remove('on');
  startAttract();
  game = null; autoT = null;
  const run = loadRun();
  let h = '';
  if (screen === 'play') { menu.innerHTML = setupScreen(); menu.querySelectorAll<HTMLCanvasElement>('canvas[data-map]').forEach((c) => drawMapPreview(c, c.dataset.map!)); return; }
  h = '<div class="mwrap">';
  if (screen === 'main') {
    h += `<div class="logo">Shatterspire</div><div class="tagline">Fantasy Tower Defense</div>
      ${run ? `<button class="mbtn big btn3d gilt" data-g="continue">${ICON.play} Continue · Wave ${run.round + 1}</button>` : ''}
      <button class="mbtn btn3d ${run ? 'woodb' : 'big gilt'}" data-g="play">${ICON.swords} ${run ? 'New Game' : 'Play'}</button>
      <button class="mbtn btn3d woodb" data-g="tree">${ICON.book} Knowledge <span class="num">(${perkPointsLeft(profile)})</span></button>
      <button class="mbtn btn3d woodb" data-g="how">${ICON.target} How to Play</button>
      <button class="mbtn btn3d woodb" data-g="settings">${ICON.menu} Settings</button>
      <div class="small-note">Medals ${medalCount(profile)} · Rounds played ${profile.totalRounds}</div>`;
  } else if (screen === 'tree') {
    const left = perkPointsLeft(profile);
    h += `<div class="mh">Knowledge</div><div class="panel"><div class="hint" style="text-align:center">Earn points from medals (1 per map per difficulty) and every 30 rounds played. Points available: <b style="color:#a8680f">${left}</b>. Second-row perks need 2 perks in the same branch.</div><div class="tree">`;
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
    const st = profile.settings;
    const tog = (k: string, label: string, on: boolean) => `<button class="toggle btn3d ${on ? 'gilt' : 'woodb'}" data-g="${k}" aria-pressed="${on}"><span>${label}</span><span>${on ? 'ON' : 'OFF'}</span></button>`;
    h += `<div class="mh">Settings</div><div class="setlist">
      ${tog('sfx', 'Sound effects', st.sfx)}
      <label class="slider"><span>Effects volume</span><input type="range" min="0" max="100" value="${Math.round(st.sfxVol * 100)}" data-s="sfxVol"></label>
      ${tog('music', 'Music', st.music)}
      <label class="slider"><span>Music volume</span><input type="range" min="0" max="100" value="${Math.round(st.musicVol * 100)}" data-s="musicVol"></label>
      ${tog('auto', 'Auto-start waves', st.autoStart)}
      <button class="toggle btn3d woodb" data-g="quality"><span>Graphics</span><span>${st.quality === 'high' ? 'HIGH' : 'LOW (battery saver)'}</span></button>
      ${document.fullscreenEnabled ? `<button class="toggle btn3d woodb" data-g="full"><span>Fullscreen</span><span>${document.fullscreenElement ? 'ON' : 'OFF'}</span></button>` : ''}
      <button class="toggle btn3d woodb" data-g="tutorial"><span>Replay tutorial</span><span>${profile.tutorialDone ? 'NEXT GAME' : 'ON'}</span></button>
      <button class="mbtn btn3d redb" data-g="wipe">Reset all progress</button>
      <button class="mbtn btn3d woodb" data-g="main">Back</button></div>`;
  } else {
    h += `<div class="mh">How to Play</div><div class="panel howto">
      <p>🏰 Enemies march down the road toward your Spire. Every enemy that gets through costs lives: one per layer it still has.</p>
      <p>💥 <b>Enemies come in layers.</b> Hit an Ogre and it becomes a Troll, then an Orc, then a Goblin, then an Imp. Big enemies burst into several smaller ones.</p>
      <p>🛡 <b>Counters matter.</b> The Next Wave box warns you: SHARP-PROOF Ironclads shrug off arrows and swords, BLAST-PROOF Glooms ignore explosions, COLD-PROOF Frostlings ignore frost, MAGIC-PROOF Hexlings ignore magic, and SHADOWED enemies are invisible without True Sight.</p>
      <p>🐘 <b>Giants</b> (from wave 26) have huge health and cost hundreds of lives if they leak. Build heavy single-target damage before they arrive.</p>
      <p>🧭 <b>Tower groups:</b> ${GROUPS.filter((g) => g.id !== 'hero').map((g) => `<b>${esc(g.name)}</b> (${g.towers.map((t) => esc(TOWER_MAP[t].name)).join(', ')}): ${esc(g.how)}`).join(' ')}</p>
      <p>⬆ <b>Upgrades:</b> every tower has 3 paths of 5 tiers. You can upgrade 2 paths, and only one of them past tier 2 (e.g. 5-2-0).</p>
      <p>🚩 <b>Barracks</b> soldiers hold enemies in place. The flag shows where they stand; use <i>Move Rally Point</i> to post them anywhere on the road nearby.</p>
      <p>⏱ <b>Spells and abilities recharge only while a wave is running</b>, in game time, so 2×/3× speed recharges them faster. Between waves the timer waits (⏸). Reinforce Walls can be cast any time but can't raise lives above your starting total.</p>
      <p>💰 You earn gold for every layer popped, a bonus each wave, and 1% interest on banked gold (max 40). Gold in the bank doesn't defend you, so spend it before big waves.</p>
      <p>⌨️ PC: Space = next wave, F = speed, A = auto, P/Esc = pause, 1-0 = towers, Shift = keep building, , . / = upgrade paths, Delete = sell.</p>
      </div><button class="mbtn btn3d woodb" data-g="main" style="margin-top:16px">Back</button>`;
  }
  h += '</div>';
  menu.innerHTML = h;
}

/** Battle setup: everything on one screen, Begin Battle pinned to the bottom. */
function setupScreen() {
  const medalsOf = (id: string) => { const md = profile.medals[id] ?? {}; return (['easy', 'medium', 'hard'] as const).map((d, i) => `<i class="${md[d] ? 'got' : ''}" title="${DIFF[d].label}">${md[d] ? ['🥉', '🥈', '🥇'][i] : '◇'}</i>`).join(''); };
  let maps = '';
  for (const m of MAPS) {
    const un = mapUnlocked(profile, m.id);
    maps += `<button class="mapc ${pick.map === m.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'map:' + m.id : 'lockedmap:' + m.id}" aria-pressed="${pick.map === m.id}"><canvas data-map="${m.id}" width="300" height="200"></canvas><div class="mi"><div class="mn">${un ? '' : '🔒 '}${esc(m.name)}</div><div class="md">${esc(m.difficultyLabel)}</div><div class="medals">${medalsOf(m.id)}</div></div></button>`;
  }
  let diffs = '';
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) diffs += `<button class="btn3d ${pick.diff === d ? 'gilt' : 'woodb'}" data-g="diff:${d}" aria-pressed="${pick.diff === d}">${DIFF[d].label}<small>${DIFF[d].lives} lives${d === 'hard' ? ' · tough giants' : d === 'easy' ? ' · cheaper' : ''}</small></button>`;
  let heroes = '';
  for (const hd of HEROES) {
    const un = heroUnlocked(profile, hd.id);
    heroes += `<button class="heroc ${pick.hero === hd.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'hero:' + hd.id : 'lockedhero:' + hd.id}" aria-pressed="${pick.hero === hd.id}">${img(hd.id, true, 44)}<div class="hn">${un ? '' : '🔒 '}${esc(hd.name)}</div></button>`;
  }
  const hd = HERO_MAP[pick.hero];
  const map = MAPS.find((m) => m.id === pick.map)!;
  return `<div class="setup">
    <div class="su-head"><button class="su-back btn3d woodb" data-g="main">‹ Back</button><div class="su-title">Prepare for Battle</div></div>
    <div class="su-body">
      <section class="su-maps"><div class="su-h">Map</div><div class="maps">${maps}</div></section>
      <section class="su-opts">
        <div class="su-h">Difficulty</div><div class="seg">${diffs}</div>
        <div class="su-h">Hero</div><div class="heroes">${heroes}</div>
        <div class="su-herodesc"><b>${esc(hd.name)}</b>, ${esc(hd.title)}: ${esc(hd.desc)}</div>
      </section>
    </div>
    <div class="su-foot">
      <div class="su-sum"><b>${esc(map.name)}</b><span>${DIFF[pick.diff].label} · ${esc(hd.name)} · ${DIFF[pick.diff].lives} lives</span></div>
      <button class="su-go btn3d greenb" data-g="start">${ICON.swords}<span>Begin Battle</span></button>
    </div></div>`;
}

const previewCache = new Map<string, string>();
function drawMapPreview(c: HTMLCanvasElement, id: string) {
  const ctx = c.getContext('2d')!;
  if (!previewCache.has(id)) {
    const m = MAPS.find((x) => x.id === id)!;
    const tmp = document.createElement('canvas');
    const r = new Renderer(tmp);
    r.scale = 300 / WORLD_W; r.dpr = 1;
    r.buildBg(m);
    previewCache.set(id, r.bg!.toDataURL());
  }
  const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, c.width, c.height); im.src = previewCache.get(id)!;
}

menu.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (!el.dataset.s) return;
  const v = Number(el.value) / 100;
  if (el.dataset.s === 'sfxVol') profile.settings.sfxVol = v; else profile.settings.musicVol = v;
  audio.init(); audio.setVolumes(profile.settings.sfxVol, profile.settings.musicVol);
  saveProfile(profile);
});
menu.addEventListener('change', (ev) => { if ((ev.target as HTMLInputElement).dataset.s === 'sfxVol') audio.play('coin'); });
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
    case 'map': pick.map = v; profile.lastMap = v; saveProfile(profile); refreshSetup(); break;
    case 'diff': pick.diff = v as Difficulty; profile.lastDiff = v as Difficulty; saveProfile(profile); refreshSetup(); break;
    case 'hero': pick.hero = v; profile.lastHero = v; saveProfile(profile); refreshSetup(); break;
    case 'lockedmap': { const m = MAPS.find((x) => x.id === v)!; toast2(`${m.name}: earn a medal on ${MAPS.find((x) => x.id === m.unlock)!.name} to unlock`); break; }
    case 'lockedhero': { const hh = HEROES.find((x) => x.id === v)!; toast2(`${hh.name} unlocks after ${hh.unlockRounds} rounds played (you have ${profile.totalRounds})`); break; }
    case 'start': clearRun(); startGame(pick.map, pick.diff, pick.hero); break;
    case 'continue': { const run = loadRun(); if (run) { game = Game.restore(run, profile.perks); beginSession(); } break; }
    case 'perk': if (canBuyPerk(v, profile.perks, perkPointsLeft(profile))) { profile.perks.push(v); saveProfile(profile); audio.play('upgrade'); } showMenu('tree'); break;
    case 'reset': profile.perks = []; saveProfile(profile); showMenu('tree'); break;
    case 'sfx': profile.settings.sfx = !profile.settings.sfx; audio.setSfx(profile.settings.sfx); saveProfile(profile); showMenu('settings'); break;
    case 'music': profile.settings.music = !profile.settings.music; audio.setMusic(profile.settings.music); saveProfile(profile); showMenu('settings'); break;
    case 'auto': profile.settings.autoStart = !profile.settings.autoStart; saveProfile(profile); showMenu('settings'); break;
    case 'quality': profile.settings.quality = profile.settings.quality === 'high' ? 'low' : 'high'; saveProfile(profile); showMenu('settings'); break;
    case 'full': toggleFullscreen(); setTimeout(() => showMenu('settings'), 200); break;
    case 'tutorial': profile.tutorialDone = false; saveProfile(profile); showMenu('settings'); break;
    case 'wipe':
      if (el.dataset.armed) { try { localStorage.removeItem('shatterspire.profile.v1'); localStorage.removeItem('shatterspire.run.v1'); } catch { /* ignore */ } profile = loadProfile(); showMenu('main'); }
      else { el.dataset.armed = '1'; el.textContent = 'Tap again to erase everything'; }
      break;
  }
});
/** Update the setup screen in place (keeps scroll position and map thumbnails). */
function refreshSetup() {
  const fresh = document.createElement('div'); fresh.innerHTML = setupScreen();
  for (const sel of ['.seg', '.heroes', '.su-herodesc', '.su-sum']) { const a = menu.querySelector(sel), b = fresh.querySelector(sel); if (a && b) a.replaceWith(b); }
  menu.querySelectorAll<HTMLElement>('.mapc').forEach((c) => { const on = c.dataset.g === `map:${pick.map}`; c.classList.toggle('sel', on); c.setAttribute('aria-pressed', String(on)); });
}
function toast2(msg: string) {
  let box = document.getElementById('mtoast');
  if (!box) { box = document.createElement('div'); box.id = 'mtoast'; menuWrap.appendChild(box); }
  box.textContent = msg; box.classList.remove('on'); void box.offsetWidth; box.classList.add('on');
}

function startGame(mapId: string, diff: Difficulty, heroId: string) {
  game = new Game({ mapId, difficulty: diff, heroId, seed: Date.now() % 100000, perks: profile.perks });
  beginSession();
}

function beginSession() {
  menuWrap.classList.remove('on', 'setupmode');
  attract = null;
  $('#game').classList.add('on');
  selected = null; placing = null; ghost = undefined; armedSpell = null; rallyEdit = null; drag = null;
  panelKey = ''; abilKey = ''; lastTop = ''; waveKey = ''; hudKey = ''; endHandled = false; paused = false; autoT = null;
  tutStep = !profile.tutorialDone && game && game.round === 0 ? 0 : -1;
  renderCoach();
  requestAnimationFrame(layout);
}

// ================================================================ attract mode (demo battle behind the main menu only)
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
  attractR.dpr = Math.min(attractR.dpr, 1.25); // it's blurred anyway
  menuBg.style.left = `${(w - WORLD_W * s) / 2}px`; menuBg.style.top = `${(h - WORLD_H * s) / 2}px`;
  menuBg.style.width = `${WORLD_W * s}px`; menuBg.style.height = `${WORLD_H * s}px`;
}
window.addEventListener('resize', () => { if (attract) sizeAttract(); });
let attractAcc = 0;
let attractDrawn = false;
function tickAttract(dt: number) {
  const g = attract!;
  // Only the title screen animates; other menus show a still frame. Low quality = still frame everywhere.
  const animate = menuScreen === 'main' && profile.settings.quality === 'high';
  if (!animate) { if (!attractDrawn) { attractR.draw(g, {}); attractDrawn = true; } return; }
  attractAcc += dt;
  if (attractAcc < 1 / 30) return; // 30 fps is plenty for a blurred backdrop
  const step = Math.min(attractAcc, 0.1); attractAcc = 0;
  if (g.state === 'build') g.startWave();
  if (g.state === 'over' || g.state === 'victory' || g.round > 30) { attract = null; startAttract(); return; }
  g.lives = 9999;
  g.update(step / 2); g.update(step / 2);
  g.events.length = 0;
  attractR.draw(g, {});
  attractDrawn = true;
}

// ================================================================ loop
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
/** Max sim steps per frame: 24 keeps 3× speed in real time down to 10 fps without a death spiral. */
const MAX_STEPS = 24;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (document.hidden) { requestAnimationFrame(frame); return; }
  if (!game && attract && menuWrap.classList.contains('on')) { tickAttract(dt); audio.setIntensity(0); }
  else attractDrawn = false;
  if (game) {
    if (!paused) {
      acc += dt * speed;
      let n = 0;
      while (acc >= STEP && n < MAX_STEPS) { game.update(STEP); acc -= STEP; n++; }
      if (n >= MAX_STEPS) acc = 0;
      // queued auto-start: counts down only while unpaused; cancelled the moment Auto is switched off
      if (game.state === 'build' && profile.settings.autoStart && game.round > 0 && !endHandled) {
        autoT = (autoT ?? AUTO_DELAY) - dt;
        if (autoT <= 0) startWave();
      } else autoT = null;
    }
    handleEvents();
    if (!game) { requestAnimationFrame(frame); return; }
    audio.setIntensity(game.state === 'wave' ? 1 : 0);
    if (placing && ghost) updateGhost(ghost);
    const rt = rallyEdit ?? (selected?.stats.barracks ? selected : null);
    const rp = rt ? game.rallyPos(rt) : null;
    renderer.draw(game, { ghost, selected, targeting: !!armedSpell, cursor, rally: rt && rp ? { tx: rt.x, ty: rt.y, r: Game.RALLY_RANGE, x: rp.x, y: rp.y, editing: !!rallyEdit } : null });
    refreshTop();
    renderWaveBox();
    renderSide();
    renderHud();
    renderAbil();
    $('#field').classList.toggle('coach-hide', !!(placing || armedSpell || rallyEdit));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.state === 'wave' && !paused) pauseMenu(); });

showMenu('main');

// Debug/test hook (used by automated playtests).
(window as unknown as { __ss: unknown }).__ss = {
  get game() { return game; },
  /** UI state snapshot for automated tests. */
  ui() { return { placing, ghost: ghost ? { x: ghost.x, y: ghost.y, valid: ghost.valid, reason: ghost.reason ?? null } : null, autoT, paused, speed, selected: selected?.uid ?? null, rally: !!rallyEdit, tut: tutStep, screen: menuScreen, drag: !!drag }; },
  worldToClient(x: number, y: number) { const r = canvas.getBoundingClientRect(); return { x: r.left + (x / WORLD_W) * r.width, y: r.top + (y / WORLD_H) * r.height }; },
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
