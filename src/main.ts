import './fonts.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel-decorative/latin-900.css';
import './ui.css';
import { Game, DIFF, type Tower } from './core/game';
import { MAPS } from './core/maps';
import { TOWERS, TOWER_MAP, canUpgradePath } from './core/towers';
import { HEROES, HERO_MAP, HERO_XP } from './core/heroes';
import { PERKS, POWERS, canBuyPerk, powersEarned } from './core/progress';
import { waveInfo, type WaveInfo } from './core/waves';
import { upgradeDelta } from './core/delta';
import { analyzeDefeat, recommendTower } from './core/analysis';
import { POWER_PRICE, SHARDS_BOSS_WAVE, SHARDS_PER_WAVE, SHARDS_VICTORY, VAULT_LEVELS, collectVault, spendShards, upgradeVault, vaultCap, vaultFullIn, vaultStored } from './core/vault';
import { WORLD_H, WORLD_W, type Difficulty, type Targeting } from './core/types';
import { Renderer, type Overlay } from './render/renderer';
import { drawEnemyModel } from './render/enemyArt';
import { ENEMIES } from './core/enemies';
import { audio } from './audio/audio';
import { ICON, POWER_ICON, SPELL_ICON } from './ui/icons';
import { BUILD_ORDER, DTYPE, GROUPS, baseStats, groupOf, infoFor } from './ui/towerInfo';
import { clearRun, heroUnlocked, loadProfile, loadRun, mapUnlocked, medalCount, perkPointsLeft, saveProfile, saveRun, towerUnlocked, type Profile } from './save';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.floor(n).toLocaleString();
const fmtShort = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e5 ? `${Math.floor(n / 1e3)}K` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : fmt(n));

document.getElementById('app')!.innerHTML = `
<div id="game">
  <div id="stage"><canvas id="canvas"></canvas>
    <div id="hud">
      <div class="hs lives" title="Lives">${ICON.heart}<span id="lives">0</span></div>
      <div class="hs gold" title="Gold">${ICON.coin}<span id="gold">0</span></div>
      <div class="sp"></div>
      <div class="hs round" title="Wave"><small>Wave</small><span id="round">0</span><i class="wprog"><b id="wprog"></b></i></div>
      <button class="cb" id="pauseBtn" title="Pause (P / Esc)" aria-label="Pause">${ICON.pause}</button>
    </div>
    <div id="abil"></div>
  </div>
  <div id="rail"><div id="coach"></div><div id="slotw"><div id="slot"></div><div id="toast"></div></div><div id="tiles"></div></div>
  <div id="ctrl">
    <button class="cb" id="autoBtn" title="Auto-start the next wave">${ICON.auto}<span class="cl">Auto <b id="autoState">Off</b></span></button>
    <button class="cb" id="speedBtn" title="Game speed (F)">${ICON.speed}<span class="cl" id="spd">1×</span></button>
    <button class="cb" id="startBtn"></button>
  </div>
  <div id="tpanel"></div>
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
  const field = $('#stage');
  const cs = getComputedStyle(field);
  const w = field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = field.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (!w || !h) return;
  const s = Math.min(w / WORLD_W, h / WORLD_H);
  renderer.resize(Math.floor(WORLD_W * s), Math.floor(WORLD_H * s), profile.settings.quality === 'low' ? 1 : 2);
}
window.addEventListener('resize', () => setTimeout(layout, 50));
window.addEventListener('orientationchange', () => setTimeout(layout, 200));
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => layout()).observe(document.getElementById('stage')!);

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

let toastT = 0;
/** One message at a time, shown in the info box beside/below the map. Nothing is ever drawn over the map. */
function toast(msg: string, kind: 'info' | 'bad' | 'good' = 'info') {
  const box = $('#toast');
  box.innerHTML = `<div class="toast ${kind}">${esc(msg)}</div>`;
  const wrap = $('#slotw'); wrap.classList.add('msg'); // the wave info steps aside so the two never overlap
  clearTimeout(toastT);
  toastT = window.setTimeout(() => { wrap.classList.remove('msg'); }, 2450);
  window.setTimeout(() => { if (!wrap.classList.contains('msg')) box.innerHTML = ''; }, 2900);
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
  $('#wprog').style.width = game.freeplay ? '100%' : `${Math.min(100, (game.round / game.totalWaves) * 100)}%`;
  $('#spd').textContent = `${speed}×`;
  $('#speedBtn').classList.toggle('on', speed > 1);
  $('#autoState').textContent = auto ? 'On' : 'Off';
  const ab = $('#autoBtn');
  ab.classList.toggle('on', auto);
  ab.setAttribute('aria-pressed', String(auto));
  const sb = $('#startBtn');
  const building = game.state === 'build';
  const next = game.round + 1;
  // one round button: Play between waves, a dimmed "fighting" state during one
  if (building && autoT !== null) sb.innerHTML = `${ICON.play}<span class="cl">Wave ${next} in ${Math.ceil(autoT)}s</span>`;
  else if (building) sb.innerHTML = `${ICON.play}<span class="cl">${game.round === 0 ? 'Start' : `Start wave ${next}`}</span>`;
  else sb.innerHTML = `${ICON.swords}<span class="cl">Wave ${game.round}</span>`;
  sb.title = building ? `Start wave ${next} (Space)` : 'Wave in progress';
  sb.classList.toggle('running', !building);
  sb.classList.toggle('pulse', building && game.round === 0);
}

// ================================================================ next-wave box (fixed height, never shifts the Armory)
const waveBox = $('#slot');
let waveKey = '';
let waveInfoCache: WaveInfo | null = null;
/** Tower the advisor suggests for the coming wave (starred in the Armory). */
let recId: string | null = null;
function renderWaveBox() {
  if (!game || waveBox.classList.contains('slot')) return;
  const g = game;
  const building = g.state === 'build';
  const r = building ? g.round + 1 : g.round;
  const left = g.enemies.length + g.queue.length;
  const key = `${r}|${building}|${building ? 0 : Math.ceil(left / 5)}|${Math.floor(g.gold / 500)}|${g.towers.length}|${g.towers.reduce((a, t) => a + t.tiers[0] + t.tiers[1] + t.tiers[2], 0)}|${profile.settings.advisor}`;
  if (key === waveKey) return;
  waveKey = key;
  if (!waveInfoCache || waveInfoCache.round !== r) waveInfoCache = waveInfo(r);
  const wi = waveInfoCache;
  const chips = wi.freeplay ? '<span class="chip">FREEPLAY</span>' : wi.threats.slice(0, 4).map((t) => `<span class="chip ${t.danger ? 'danger' : ''}">${esc(t.tag)}</span>`).join('');
  const rec = building && profile.settings.advisor ? recommendTower(g, r) : null;
  recId = rec?.tower ?? null;
  const tip = rec ? `<span class="chip gold" title="${esc(rec.why)}">${ICON.star.replace('class="ico"', 'class="ico sm"')} ${esc(TOWER_MAP[rec.tower].name)}</span>` : '';
  const hoard = building && (wi.giant || wi.boss) && g.gold >= 1500 ? `<span class="chip gold">${fmtShort(g.gold)} gold unspent</span>` : '';
  const head = building ? `Next: wave ${r}` : `${left} enemies left`;
  const units = wi.units.map((u) => `${u.count} ${u.name}${u.count > 1 && !u.name.endsWith('s') ? 's' : ''}`).join(', ');
  waveBox.innerHTML = `<button class="sl sl-wave" data-a="waveinfo" title="Wave details"><b>${head} ${ICON.info}</b><span class="sl-u">${esc(units || 'Freeplay wave')}</span><span class="sl-c">${tip}${chips}${hoard}</span></button>`;
}
function waveDetails() {
  if (!game) return;
  const g = game;
  const r = g.state === 'build' ? g.round + 1 : g.round;
  const wi = waveInfo(r);
  const rows = wi.units.map((u) => `<li><b>${u.count}× ${esc(u.name)}</b>${u.mods.includes('s') ? ' · shadowed' : ''}${u.mods.includes('r') ? ' · regrow' : ''}${u.mods.includes('f') ? ' · fortified' : ''}${u.isNew ? ' <span class="chip">NEW</span>' : ''}</li>`).join('');
  const threats = wi.threats.map((t) => `<li class="${t.danger ? 'dg' : ''}"><span class="chip ${t.danger ? 'danger' : ''}">${esc(t.tag)}</span> ${esc(t.text)}</li>`).join('');
  const rec = g.state === 'build' && profile.settings.advisor ? recommendTower(g, r) : null;
  modal(`<h2>Wave ${r}</h2>
    ${rec ? `<div class="rc-cause advisor">${ICON.star} Advisor: add a <b>${esc(TOWER_MAP[rec.tower].name)}</b>. ${esc(rec.why)}.</div>` : ''}
    ${wi.freeplay ? '<div class="hint">Freeplay waves are randomized giants and armored hordes that grow every round.</div>' : `<ul class="wlist">${rows}</ul>
    <div class="hint">Threat size: <b>${fmt(wi.rbe)}</b> layers${wi.worstLeak !== Infinity ? ` · worst single leak: <b>${fmt(wi.worstLeak)}</b> lives` : ''}.</div>`}
    ${threats ? `<ul class="tlist">${threats}</ul>` : '<div class="hint">No special traits. Any tower works.</div>'}
    <button class="mbtn btn pri" data-m="resume">Got it</button>`);
}

// ================================================================ side panel
const side = $('#rail');
const sbody = $('#tiles');
const tpanel = $('#tpanel');
function panelClick(ev: Event) {
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
    selected.targeting = order[(order.indexOf(selected.targeting) + (v === '-1' ? 3 : 1)) % 4];
    panelKey = ''; audio.play('click');
  } else if (a === 'tmode') {
    if (!selected) return;
    selected.targeting = v as Targeting; panelKey = ''; audio.play('click');
  } else if (a === 'withdraw' && selected) { game.withdraw(selected); audio.play('coin'); panelKey = ''; }
  else if (a === 'rally' && selected) { rallyEdit = rallyEdit ? null : selected; audio.play('click'); panelKey = ''; }
  else if (a === 'powers') powersMenu();
  else if (a === 'groups') groupGuide(v || undefined);
  else if (a === 'waveinfo') waveDetails();
  else if (a === 'info' && selected) towerInfoModal(selected.defId, selected.isHero);
}
side.addEventListener('click', panelClick);
tpanel.addEventListener('click', panelClick);

function buyUpgrade(p: number) {
  if (!game || !selected) return;
  const t = selected;
  if (t.isHero) return;
  if (t.tiers[p] >= 5) { audio.play('error'); toast('Path maxed out', 'bad'); return; }
  if (!canUpgradePath(t.tiers, p)) { audio.play('error'); toast('Path closed: only 2 paths, and only one past tier 2', 'bad'); return; }
  const cost = game.upgradeCost(t, p);
  if (game.gold < cost) { audio.play('error'); toast(`Not enough gold (need ${fmt(cost - game.gold)} more)`, 'bad'); return; }
  if (game.upgrade(t, p)) { audio.play('upgrade'); panelKey = ''; tut('upgraded'); }
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

let shopKey = '';
function renderSide() {
  if (!game) return;
  const g = game;
  const t = selected && g.towers.includes(selected) ? selected : null;
  if (!t && selected) selected = null;
  // the tower tiles are built once per battle and only updated in place, so they never move
  const sk = `shop|${profile.totalRounds}|${g.heroId}`;
  if (sk !== shopKey) { shopKey = sk; sbody.innerHTML = shopPanel(); }
  updateShop();
  const key = t ? `t${t.uid}|${t.tiers.join('')}|${t.targeting}|${t.level}|${Math.floor(t.bank)}|${!!rallyEdit}` : 'none';
  if (key !== panelKey) {
    panelKey = key;
    tpanel.innerHTML = t ? towerPanel(t) : '';
    // while moving a rally point the panel steps aside so the whole road is reachable,
    // and it opens on the side away from the tower so it never hides it
    tpanel.classList.toggle('on', !!t && !rallyEdit);
    if (t) tpanel.classList.toggle('L', t.x > WORLD_W / 2);
  }
  document.querySelectorAll<HTMLElement>('#tiles [data-cost], #tpanel [data-cost]').forEach((el) => el.classList.toggle('poor', g.gold < Number(el.dataset.cost)));
  sbody.classList.toggle('more', sbody.scrollHeight > sbody.clientHeight + 2); // fade the bottom row when the list runs past the rail
  if (t) { const st = tpanel.querySelector('.tq-sub'); if (st) st.textContent = towerStatLine(t); }
}

/** Plain-language combat record for a tower. */
function towerStatLine(t: Tower) {
  const parts = [`Damage ${fmtShort(t.dmg)}`, `Broken ${fmtShort(t.pops)}`];
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
  const tile = (id: string) => {
    const gc = groupOf(id).color;
    if (id === 'hero') return `<button class="tile hero" style="--gc:${gc}" data-a="buy" data-v="hero" data-cost="${g.towerCost('hero')}" aria-label="${esc(hd.name)}">${img(hd.id, true)}<span class="tc">${ICON.coinSmall}<span>${fmt(g.towerCost('hero'))}</span></span></button>`;
    const d = TOWER_MAP[id];
    const cost = g.towerCost(id);
    return towerUnlocked(profile, id)
      ? `<button class="tile" style="--gc:${gc}" data-a="buy" data-v="${id}" data-cost="${cost}" aria-label="${esc(d.name)}">${img(id)}<span class="tc">${ICON.coinSmall}<span>${fmt(cost)}</span></span></button>`
      : `<button class="tile locked" style="--gc:${gc}" data-a="buy" data-v="${id}" aria-label="${esc(d.name)} (locked)" data-lock="${esc(d.name)} unlocks after ${d.unlockRounds} rounds played (${d.unlockRounds - profile.totalRounds} to go)">${img(id)}<span class="tc lk">${ICON.lock.replace('class="ico"', 'class="ico sm"')}<span>${d.unlockRounds - profile.totalRounds} rds</span></span></button>`;
  };
  // each job gets its own labelled, colour-coded section so the colours mean something at a glance
  const order = ['hero', 'single', 'crowd', 'control', 'support'];
  return [...GROUPS].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((gr) => `<section class="grp" style="--gc:${gr.color}">
    <button class="grp-h" data-a="groups" data-v="${gr.id}" title="${esc(gr.how)}"><b>${esc(gr.name)}</b><span>${esc(gr.short)}</span>${ICON.info}</button>
    <div class="grp-g">${gr.towers.map(tile).join('')}</div><i class="grp-tip">${esc(gr.short)}</i></section>`).join('');
}
/** Explains the tower groups and a sensible build order. */
function creditsModal() {
  const fonts: [string, string][] = [['Inter', '© 2016 The Inter Project Authors'], ['Cinzel', '© 2020 The Cinzel Project Authors'], ['Cinzel Decorative', '© 2012 Natanael Gama']];
  modal(`<h2>Credits &amp; licences</h2>
    <div class="hint">Shatterspire is an original game. Its art is drawn in code and its sound is synthesised in the game. It is not affiliated with, or based on, any other game, book or film.</div>
    <div class="ti-h">Fonts (SIL Open Font License 1.1)</div><ul class="rc-tips">${fonts.map(([n, c]) => `<li><b>${n}</b> ${c}</li>`).join('')}</ul>
    <div class="hint">Licence text: openfontlicense.org</div>
    <button class="mbtn btn pri" data-m="resume">Close</button>`);
}
function groupGuide(focus?: string) {
  const rows = GROUPS.map((gr) => `<div class="gg ${gr.id === focus ? 'focus' : ''}" style="--gc:${gr.color}"><div class="gg-h"><b>${esc(gr.name)}</b><span>${gr.towers.map((t) => esc(t === 'hero' ? 'your hero' : TOWER_MAP[t].name)).join(' · ')}</span></div><div class="gg-t">${esc(gr.how)}</div></div>`).join('');
  modal(`<h2>Tower Guide</h2><div class="hint">Every tower has a job. A strong defense mixes groups.</div>${rows}
    <div class="ti-h">A good build order</div><ol class="rc-tips">${BUILD_ORDER.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <button class="mbtn btn pri" data-m="resume">Got it</button>`);
  if (focus) modalEl.querySelector('.gg.focus')?.scrollIntoView({ block: 'center' });
}
function updateShop() {
  const g = game!;
  for (const el of Array.from(sbody.querySelectorAll<HTMLElement>('.tile[data-v]'))) {
    const id = el.dataset.v!;
    if (el.classList.contains('locked')) continue;
    el.classList.toggle('sel', placing === id);
    el.classList.toggle('rec', recId === id);
    const cost = g.towerCost(id);
    if (id === 'hero') {
      const dep = g.heroPlaced;
      if (el.classList.contains('deployed') !== dep) {
        el.classList.toggle('deployed', dep);
        const c = el.querySelector('.tc');
        if (c) c.innerHTML = dep ? '<span>Deployed</span>' : `${ICON.coinSmall}<span>${fmt(cost)}</span>`;
        if (dep) { el.removeAttribute('data-cost'); el.classList.remove('poor'); } else el.dataset.cost = String(cost);
      }
      if (dep) continue;
    }
    if (el.dataset.cost !== String(cost)) { el.dataset.cost = String(cost); const c = el.querySelector('.tc span'); if (c) c.textContent = cost === 0 ? 'FREE' : fmt(cost); }
  }
}

function towerPanel(t: Tower) {
  const g = game!;
  const head = (name: string, isHero: boolean) => `<div class="tq-head">${img(t.defId, isHero)}<div class="tq-id"><div class="tq-name">${esc(name)}</div><div class="tq-sub"></div></div><button class="tq-ib tq-info" data-a="info" title="What this tower does">${ICON.info}</button><button class="tq-ib tq-x" data-a="close" title="Close (Esc)">${ICON.close}</button></div>`;
  const modes: [Targeting, string][] = [['first', 'First'], ['last', 'Last'], ['strong', 'Strong'], ['close', 'Close']];
  const target = t.stats.attacks.length ? `<div class="tq-target" role="radiogroup" aria-label="Which enemy to shoot">${modes.map(([m, l]) => `<button data-a="tmode" data-v="${m}" role="radio" aria-checked="${t.targeting === m}" class="${t.targeting === m ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';
  let h = '';
  if (t.isHero) {
    const hd = HERO_MAP[t.defId];
    const L = t.level, next = HERO_XP[L] ?? null, prev = HERO_XP[L - 1];
    h += head(`${hd.name} · Lv ${L}`, true) + target;
    h += `<div class="xpbar"><div style="width:${next ? Math.min(100, ((t.xp - prev) / (next - prev)) * 100) : 100}%"></div></div>`;
    h += `<div class="tq-note">${next ? `${fmt(t.xp)} / ${fmt(next)} XP to level ${L + 1}` : 'Max level'}</div>`;
    for (const a of hd.abilities) {
      const has = t.abilities.some((x) => x.def.id === a.def.id);
      h += `<div class="tq-ab ${has ? 'has' : ''}"><b>${esc(a.def.name)}</b><small>${has ? 'Unlocked' : `Level ${a.level}`} · ${a.def.cd}s</small><span>${esc(a.desc)}</span></div>`;
    }
  } else {
    const d = TOWER_MAP[t.defId];
    h += head(d.name, false) + target;
    for (let p = 0; p < 3; p++) {
      const tier = t.tiers[p];
      const pips = Array.from({ length: 5 }, (_, i) => `<i class="pip ${i < tier ? 'on' : ''}"></i>`).join('');
      let btn: string;
      if (tier >= 5) btn = `<div class="ug max"><b>Path complete</b></div>`;
      else if (!canUpgradePath(t.tiers, p)) btn = `<div class="ug closed"><b>${ICON.lock.replace('class="ico"', 'class="ico sm"')} Path closed</b><span class="udl">2 paths, only one past tier 2</span></div>`;
      else { const u = d.upgrades[p][tier]; const cost = g.upgradeCost(t, p); btn = `<button class="ug" data-a="up" data-v="${p}" data-cost="${cost}" title="${esc(u.desc)}"><b>${esc(u.name)}</b><span class="udl">${upgradeDelta(d, t.tiers, p).map(esc).join(' · ')}</span><span class="uc">${ICON.coinSmall}${fmt(cost)}</span></button>`; }
      h += `<div class="tq-path p${p}"><div class="tq-own"><small>${esc(d.paths[p])}</small><b>${tier ? esc(d.upgrades[p][tier - 1].name) : 'Not upgraded'}</b><div class="pips">${pips}</div></div>${btn}</div>`;
    }
  }
  h += '<div class="tq-foot">';
  if (!t.isHero && t.stats.bank) h += `<button class="tq-btn gold" data-a="withdraw">Withdraw ${fmt(t.bank)}</button>`;
  if (!t.isHero && t.stats.barracks) h += `<button class="tq-btn blue" data-a="rally">${rallyEdit ? 'Tap the road…' : 'Move rally'}</button>`;
  h += `<button class="tq-btn sell" data-a="sell">Sell ${ICON.coinSmall}${fmt(g.sellValue(t) + t.bank)}</button></div>`;
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
    h += `<div class="ti-h">Upgrade paths (pick 2, only one past tier 2)</div><div class="ti-paths">${d.paths.map((pn, p) => `<div class="ti-path"><div class="path-h p${p}">${esc(pn)}</div><ol>${d.upgrades[p].map((u, k) => { const tr = [0, 0, 0]; tr[p] = k; return `<li><b>${esc(u.name)}</b><span>${esc(u.desc)}</span><span class="udl">${upgradeDelta(d, tr, p).map(esc).join(' · ')}</span></li>`; }).join('')}</ol></div>`).join('')}</div>`;
  }
  if (!compact && isHero) {
    const hd = HERO_MAP[defId];
    h += `<div class="ti-h">Abilities</div><ul class="ti-ab">${hd.abilities.map((a) => `<li><b>Lv ${a.level}: ${esc(a.def.name)}</b> ${esc(a.desc)}</li>`).join('')}</ul><div class="hint">Heroes earn XP every wave: roughly a level every 2-3 waves, reaching level 10 around wave 27.</div>`;
  }
  return h;
}
function towerInfoModal(defId: string, isHero: boolean, lockNote?: string) {
  const name = isHero ? HERO_MAP[defId].name : TOWER_MAP[defId].name;
  const cost = game ? game.towerCost(isHero ? 'hero' : defId) : isHero ? HERO_MAP[defId].cost : TOWER_MAP[defId].cost;
  modal(`<div class="ti-head">${img(defId, isHero, 64)}<div><h2>${esc(name)}</h2><div class="ti-cost">${ICON.coinSmall} ${fmt(cost)} · <b>${esc(infoFor(defId, isHero).tag)}</b></div></div></div>
    ${lockNote ? `<div class="m-note bad">${ICON.lock} ${esc(lockNote)}</div>` : ''}
    <div class="ti">${infoBody(defId, isHero, false)}</div>
    <button class="mbtn btn pri" data-m="resume">Got it</button>`);
}
/** Card under the mouse (desktop); its summary shows in the side panel's info slot. */
let hoverId: string | null = null;
function hideTip() { hoverId = null; }
function hoverHtml(id: string) {
  const g = game!;
  const isHero = id === 'hero', defId = isHero ? g.heroDef.id : id;
  const inf = infoFor(defId, isHero), gr = groupOf(isHero ? 'hero' : defId), dt = DTYPE[baseStats(defId, isHero).dtype];
  const name = isHero ? g.heroDef.name : TOWER_MAP[id].name;
  return `<div class="sl sl-info" style="--gc:${gr.color}"><b>${esc(name)}</b><span class="sl-g">${esc(gr.name)} · ${esc(dt.name)}</span><span class="sl-l">${esc(inf.line)}</span></div>`;
}
sbody.addEventListener('pointerover', (ev) => {
  if (ev.pointerType !== 'mouse' || drag || placing) return;
  const card = (ev.target as HTMLElement).closest('.tile[data-v]') as HTMLElement | null;
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
    const btns = `<span class="sl-b"><button data-h="info" aria-label="Tower info">${ICON.info}</button><button class="x" data-h="cancel">${ICON.close} Cancel</button></span>`;
    html = `<div class="sl sl-place ${bad ? 'bad' : ''}"><b>${esc(nm)} · ${cost === 0 ? 'FREE' : fmt(cost)}</b><span class="sl-l">${esc(inf.line)}</span><span class="sl-u">${esc(status)}</span>${btns}</div>`;
  } else if (armedSpell) {
    const sp = g.spells.find((s) => s.id === armedSpell)!;
    key = `s|${armedSpell}`;
    html = `<div class="sl sl-place"><b>${esc(sp.name)}</b><span class="sl-u">Tap the map to aim</span><span class="sl-b"><button class="x" data-h="cancel">${ICON.close} Cancel</button></span></div>`;
  } else if (rallyEdit) {
    key = 'r';
    html = `<div class="sl sl-place"><b>Move rally point</b><span class="sl-u">Tap the road in the blue circle</span><span class="sl-b"><button class="x" data-h="cancel">${ICON.close} Cancel</button></span></div>`;
  }
  if (!key && hoverId) { key = `h|${hoverId}`; html = hoverHtml(hoverId); }
  if (key === hudKey) return;
  hudKey = key;
  if (html) { waveBox.innerHTML = html; waveBox.classList.add('slot'); }
  else { waveBox.classList.remove('slot'); waveKey = ''; renderWaveBox(); }
}
// click (not pointerdown): on touch, a pointerdown handler that swaps the UI lets the follow-up click land on whatever replaced it
waveBox.addEventListener('click', (ev) => {
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
  const SHORT: Record<string, string> = { meteor: 'Meteor', freeze: 'Freeze', reinforce: 'Walls' };
  for (const s of g.spells) items.push({ key: `s:${s.id}:0`, icon: SPELL_ICON[s.id] ?? s.icon, left: s.left, cd: s.cd, title: `${s.name}: ${s.desc}. ${s.cd}s recharge (battle time).`, name: SHORT[s.id] ?? s.name, usable: !g.spellBlock(s.id) });
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
const TUT: { id: string; title: string; text: string; pulse?: string }[] = [
  { id: 'placed', title: 'Build your first tower', text: 'Drag the Archer onto the glowing spot beside the road.', pulse: '.tile[data-v="archer"]' },
  { id: 'wave', title: 'Start the battle', text: 'Press the green Start button.', pulse: '#startBtn' },
  { id: 'waveEnd', title: 'Hold the line', text: 'Enemies follow the road to your Spire. Every one that gets through costs lives.' },
  { id: 'selected', title: 'Spend your gold', text: 'You earned gold. Tap your Archer on the map to see its upgrades.' },
  { id: 'upgraded', title: 'Make it stronger', text: 'Buy an upgrade. Each tower can follow 2 of its 3 paths.' },
  { id: 'read', title: 'Plan ahead', text: 'Next Wave shows what is coming. A ★ marks a tower that counters it. Add more towers and have fun!' },
];
let tutStep = -1;
let tutSpot: { x: number; y: number } | null = null;
function tut(evId: string) {
  if (tutStep < 0 || tutStep >= TUT.length) return;
  if (TUT[tutStep].id === evId) { tutStep++; renderCoach(); }
}
/** A good first spot: buildable ground that covers the most road. */
function findTutSpot() {
  const g = game!; let best: { x: number; y: number } | null = null, bv = -1;
  for (let x = 60; x < WORLD_W - 60; x += 16) for (let y = 60; y < WORLD_H - 60; y += 16) {
    if (!g.canPlace(x, y, 24)) continue;
    let v = 0; for (const p of g.paths) for (let i = 0; i < p.pts.length; i += 2) if (Math.hypot(p.pts[i].x - x, p.pts[i].y - y) < 115) v++;
    if (v > bv) { bv = v; best = { x, y }; }
  }
  return best;
}
function renderCoach() {
  if (tutStep >= TUT.length) { profile.tutorialDone = true; saveProfile(profile); tutStep = -1; }
  if (tutStep < 0) { coach.classList.remove('on'); coach.innerHTML = ''; document.querySelectorAll('.tut-pulse').forEach((e) => e.classList.remove('tut-pulse')); return; }
  const s = TUT[tutStep];
  coach.innerHTML = `<div class="cc"><div class="cc-n">${tutStep + 1}/${TUT.length}</div><div class="cc-t"><b>${esc(s.title)}</b><span>${esc(s.text)}</span></div><div class="cc-b">${s.id === 'read' ? '<button class="btn pri" data-c="next">Got it</button>' : '<button class="btn sec" data-c="skip">Skip</button>'}</div></div>`;
  coach.classList.add('on');
  document.querySelectorAll('.tut-pulse').forEach((e) => e.classList.remove('tut-pulse'));
  const pe = s.pulse ? document.querySelector(s.pulse) : null;
  if (pe) { pe.classList.add('tut-pulse'); if (pe.closest('#tiles')) pe.scrollIntoView({ block: 'nearest' }); }
}
coach.addEventListener('click', (ev) => {
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
  const sb = document.querySelector('.hs.lives'); if (sb) { sb.classList.remove('hit'); void (sb as HTMLElement).offsetWidth; sb.classList.add('hit'); }
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
      case 'waveStart': audio.play(e.boss ? 'boss' : 'wave'); if (e.boss) toast('Boss wave!', 'bad'); break;
      case 'waveEnd': onWaveEnd(e.round); break;
      case 'levelUp': audio.play('level'); toast(`Hero reached level ${e.level}!`, 'good'); break;
      case 'bossDown': toast(`${e.name} defeated!`, 'good'); break;
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
  { const n = game.isBossWave(round) ? SHARDS_BOSS_WAVE : SHARDS_PER_WAVE; profile.shards += n; battleShards += n; }
  for (const t of TOWERS) if (before < t.unlockRounds && profile.totalRounds >= t.unlockRounds) toast(`New tower unlocked: ${t.name}`, 'good');
  for (const h of HEROES) if (before < h.unlockRounds && profile.totalRounds >= h.unlockRounds) toast(`New hero unlocked: ${h.name}`, 'good');
  if (game.freeplay) { const m = (profile.medals[game.map.id] ??= {}); m.freeplay = Math.max(m.freeplay ?? 0, round); }
  saveProfile(profile);
  if (game.state === 'build') saveRun(game);
  panelKey = '';
  tut('waveEnd');
  // the auto-start countdown is handled by the main loop in game time (pausing holds it; turning Auto off cancels it)
  const wi = waveInfo(round + 1);
  if (game.state === 'build' && !wi.freeplay) { const big = wi.threats.find((t) => t.danger); if (big) toast(`Next: ${big.tag}. Check Details`, 'bad'); }
}

/** Powers earned by a defeat are granted when the player leaves the run (not on Retry, so retries can't farm them). */
let pendingPowers: string[] = [];
/** Shards earned in the current battle (shown on the end screens). */
let battleShards = 0;
const SH = ICON.shard.replace('class="ico"', 'class="ico sm"');
function grantPending() { for (const p of pendingPowers) profile.powers[p] = (profile.powers[p] ?? 0) + 1; if (pendingPowers.length) saveProfile(profile); pendingPowers = []; }
let recapHtml = '';
function onGameEnd(won: boolean) {
  if (!game || endHandled) return;
  endHandled = true;
  autoT = null;
  const g = game;
  audio.play(won ? 'win' : 'lose');
  const earned = powersEarned(g.round, won);
  const pwIcons = earned.map((id) => `<span class="pwi" title="${esc(POWERS.find((p) => p.id === id)!.name)}">${POWER_ICON[id] ?? ICON.sparkle}</span>`).join('');
  const top = g.towers.filter((t) => !t.isHero || t.dmg > 0).sort((a, b) => b.dmg - a.dmg).slice(0, 3)
    .map((t) => `<li><b>${esc(t.isHero ? HERO_MAP[t.defId].name : TOWER_MAP[t.defId].name)}</b>: ${fmtShort(t.dmg)} damage</li>`).join('');
  if (won) {
    for (const p of earned) profile.powers[p] = (profile.powers[p] ?? 0) + 1;
    profile.shards += SHARDS_VICTORY; battleShards += SHARDS_VICTORY;
    let medal = '';
    const m = (profile.medals[g.map.id] ??= {});
    if (!m[g.diff]) medal = `New medal: ${g.map.name} (${DIFF[g.diff].label}). +1 perk point`;
    m[g.diff] = 1;
    saveProfile(profile);
    modal(`<div class="m-hero win">${ICON.trophy}</div><h2>Victory</h2>
      <div class="hint">You held ${esc(g.map.name)} through all ${g.totalWaves} waves. Unspent gold: ${fmtShort(g.gold)}</div>
      ${top ? `<div class="ti-h">Top towers</div><ul class="wlist">${top}</ul>` : ''}
      ${medal ? `<div class="m-note gold">${ICON.medal} ${medal}</div>` : ''}${earned.length ? `<div class="m-note">Powers earned ${pwIcons}</div>` : ''}
      <div class="m-note shard">${SH} <b>+${battleShards} Shards</b> earned this battle</div>
      <button class="mbtn big btn pri" data-m="freeplay">Continue: Freeplay</button>
      <button class="mbtn btn sec" data-m="restart">Restart</button>
      <button class="mbtn btn sec" data-m="menu">Main Menu</button>`);
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
  recapHtml = `<div class="m-hero lose">${ICON.skull}</div><h2>The Spire has fallen</h2>
    <div class="hint">${esc(g.map.name)} · ${DIFF[g.diff].label} · fell on wave ${rc.round}</div>
    <div class="rc-cause">${esc(rc.cause)}</div>
    ${leakRows ? `<div class="ti-h">What got through on wave ${rc.round}</div><div class="rc-leaks">${leakRows}</div>` : ''}
    ${rc.history.length > 1 ? `<div class="ti-h">Lives lost per wave</div><div class="rc-hist">${hist}</div>` : ''}
    ${tips ? `<div class="ti-h">How to hold next time</div><ul class="rc-tips">${tips}</ul>` : ''}
    ${top ? `<details class="rc-more"><summary>Your top towers</summary><ul class="wlist">${top}</ul></details>` : ''}
    ${canRetry ? `<button class="mbtn big btn pri" data-m="retrywave">${ICON.auto} Retry wave ${rc.round}</button><div class="hint rc-small">Restarts this wave with your defenses as they were before it began, so you can rebuild.</div>` : ''}
    <button class="mbtn btn sec" data-m="restart">Restart map</button>
    <button class="mbtn btn sec" data-m="menu">Main Menu</button>
    <div class="hint rc-small">${SH} +${battleShards} Shards earned this battle.${earned.length ? ` Powers ${pwIcons} are yours when you leave this run.` : ''}</div>`;
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
// A touch that opens a modal on pointerdown is followed by a click at the same spot. Swallow that one click, or it
// presses whatever modal button is under the finger (this used to burn a Power by accident on phones).
let lastTouchDown = -1e9, swallowClickUntil = 0;
document.addEventListener('pointerdown', (e) => { swallowClickUntil = 0; if (e.pointerType !== 'mouse') lastTouchDown = performance.now(); }, true);
function modal(html: string) { const now = performance.now(); swallowClickUntil = now - lastTouchDown < 80 ? now + 600 : 0; modalEl.innerHTML = `<div class="scroll"><div class="mbox">${html}</div></div>`; modalEl.classList.add('on'); paused = true; lastTop = ''; }
function closeModal() { modalEl.classList.remove('on'); modalEl.innerHTML = ''; paused = false; lastTop = ''; }
modalEl.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-m]') as HTMLElement | null;
  if (performance.now() < swallowClickUntil) { swallowClickUntil = 0; return; }
  if (!el) { if (ev.target === modalEl && game && game.state !== 'over' && game.state !== 'victory') closeModal(); return; }
  audio.play('click');
  const m = el.dataset.m!;
  if (m === 'resume') closeModal();
  else if (m === 'freeplay') { game?.continueFreeplay(); endHandled = false; closeModal(); if (game) saveRun(game); }
  else if (m === 'restart') { grantPending(); if (game) { clearRun(); startGame(game.map.id, game.diff, game.heroId); } closeModal(); }
  else if (m === 'guide') groupGuide();
  else if (m === 'retrywave') { closeModal(); retryWave(); }
  else if (m.startsWith('tinfo:')) { towerInfoModal(m.slice(6), false); const btn = modalEl.querySelector('[data-m="resume"]'); if (btn && recapHtml && game?.state === 'over') { btn.setAttribute('data-m', 'recap'); btn.innerHTML = `${ICON.back} Back to recap`; } }
  else if (m === 'recap') modal(recapHtml);
  else if (m === 'menu') { grantPending(); if (game && game.state === 'over') clearRun(); else if (game && game.state === 'build' && game.round > 0) saveRun(game); closeModal(); showMenu('main'); }
  else if (m === 'auto') { toggleAuto(); pauseMenu(); }
  else if (m === 'sfx') { profile.settings.sfx = !profile.settings.sfx; audio.setSfx(profile.settings.sfx); saveProfile(profile); pauseMenu(); }
  else if (m === 'music') { profile.settings.music = !profile.settings.music; audio.setMusic(profile.settings.music); saveProfile(profile); pauseMenu(); }
  else if (m === 'full') { toggleFullscreen(); setTimeout(pauseMenu, 150); }
  else if (m.startsWith('buypower:')) {
    const id = m.slice(9), p = POWERS.find((x) => x.id === id)!, price = POWER_PRICE[id];
    if (!spendShards(profile, price)) { audio.play('error'); toast(`${p.name} costs ${price} Shards (you have ${profile.shards})`, 'bad'); return; }
    profile.powers[id] = (profile.powers[id] ?? 0) + 1; saveProfile(profile); audio.play('coin'); abilKey = ''; powersMenu();
  }
  else if (m.startsWith('power:')) {
    const id = m.slice(6);
    const p = POWERS.find((x) => x.id === id)!;
    if ((profile.powers[id] ?? 0) <= 0) { audio.play('error'); toast(`No ${p.name} owned. Tap +1 to buy one with Shards`, 'bad'); return; }
    const err = game?.powerBlock(id);
    if (err) { audio.play('error'); toast(`${p.name}: ${err}`, 'bad'); return; }
    if (game && game.usePower(id)) { profile.powers[id]--; saveProfile(profile); audio.play('ability'); toast(`${p.name}: ${p.desc}`, 'good'); panelKey = ''; abilKey = ''; closeModal(); }
  }
});

function pauseMenu() {
  if (!game || game.state === 'over' || game.state === 'victory') return;
  const fs = document.fullscreenEnabled ? `<button class="mbtn btn sec" data-m="full">Fullscreen: ${document.fullscreenElement ? 'On' : 'Off'}</button>` : '';
  modal(`<h2>Paused</h2>
    <div class="hint">${game.map.name} · ${DIFF[game.diff].label} · Wave ${game.round}${game.state === 'wave' ? ' (in progress)' : ''}</div>
    <button class="mbtn big btn pri" data-m="resume">${ICON.play} Resume</button>
    <button class="mbtn btn sec" data-m="auto">Auto-start waves: ${profile.settings.autoStart ? 'On' : 'Off'}</button>
    <div class="mrow"><button class="mbtn btn sec" data-m="sfx">Sound: ${profile.settings.sfx ? 'On' : 'Off'}</button><button class="mbtn btn sec" data-m="music">Music: ${profile.settings.music ? 'On' : 'Off'}</button></div>
    ${fs}
    <button class="mbtn btn sec" data-m="guide">Tower Guide</button>
    <button class="mbtn btn sec" data-m="restart">Restart Map</button>
    <button class="mbtn btn sec" data-m="menu">Save &amp; Quit</button>
    <div class="hint">Progress saves at the end of every wave. Quitting mid-wave resumes from the start of that wave.</div>`);
}

function powersMenu() {
  const used = game?.powersUsed ?? 0;
  const rows = POWERS.map((p) => {
    const n = profile.powers[p.id] ?? 0;
    const why = !n ? 'None owned' : game?.powerBlock(p.id) ?? '';
    const price = POWER_PRICE[p.id];
    return `<div class="pwrow"><button class="pw btn sec ${n && !why ? '' : 'empty'}" data-m="power:${p.id}"><div class="pi">${POWER_ICON[p.id] ?? ICON.sparkle}</div><div class="pt"><b>${p.name}</b><span>${p.desc}${why ? ` · <i>${esc(why)}</i>` : ''}</span></div><div class="pc">×${n}</div></button><button class="pwbuy btn ${profile.shards >= price ? 'inf' : 'mut'}" data-m="buypower:${p.id}" title="Buy one for ${price} Shards">+1<span>${SH}${price}</span></button></div>`;
  }).join('');
  modal(`<h2>Powers</h2><div class="wallet">${SH} <b>${fmt(profile.shards)}</b> Shards</div>
    <div class="hint">One-shot items, up to ${Game.POWERS_PER_BATTLE} per battle (${used} used). Win them by finishing games, or buy them with Shards from your Vault.</div>${rows}<button class="mbtn btn sec" data-m="resume">Close</button>`);
}

// ---------------------------------------------------------------- Shard Vault
const fmtDur = (ms: number) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
function vaultWidget() {
  const now = Date.now(), stored = vaultStored(profile, now), cap = vaultCap(profile), full = stored >= cap;
  return `<div class="vault ${full ? 'full' : ''}" id="vaultw"><div class="v-top">${ICON.shard}<div class="v-t"><b>${VAULT_LEVELS[profile.vaultLevel].name}</b><span>${full ? 'Full! Collect to keep it filling' : `+1 Shard a minute · full in ${fmtDur(vaultFullIn(profile, now))}`}</span></div><div class="v-wallet" title="Your Shards">${SH}<b>${fmt(profile.shards)}</b></div></div>
    <div class="v-bar"><i style="width:${(stored / cap) * 100}%"></i><span>${stored} / ${cap}</span></div>
    <div class="v-btns"><button class="btn ${stored ? 'pri' : 'mut'}" data-g="collect">Collect${stored ? ` ${stored}` : ''}</button><button class="btn inf" data-g="shop">Shard Shop</button></div></div>`;
}
function shopScreen() {
  const next = VAULT_LEVELS[profile.vaultLevel + 1];
  const rows = POWERS.map((p) => { const price = POWER_PRICE[p.id]; return `<button class="pw btn ${profile.shards >= price ? 'sec' : 'mut'}" data-g="buypower:${p.id}"><div class="pi">${POWER_ICON[p.id] ?? ICON.sparkle}</div><div class="pt"><b>${p.name}</b><span>${p.desc} · you own ${profile.powers[p.id] ?? 0}</span></div><div class="pc price">${SH}${price}</div></button>`; }).join('');
  return `<div class="mh">Shard Shop</div>${vaultWidget()}
    <div class="panel shop-panel"><div class="ti-h">Bigger vault</div>
      ${next ? `<button class="pw btn ${profile.shards >= next.cost ? 'pri' : 'mut'}" data-g="vaultup"><div class="pi">${ICON.shard}</div><div class="pt"><b>${next.name}</b><span>Holds ${next.cap} Shards instead of ${vaultCap(profile)}, so you can stay away ${fmtDur(next.cap * 60000)} before it fills.</span></div><div class="pc price">${SH}${next.cost}</div></button>` : '<div class="hint">Your vault is as big as it gets: 500 Shards.</div>'}
      <div class="ti-h">Powers (one-shot items, up to ${Game.POWERS_PER_BATTLE} per battle)</div>${rows}
      <div class="hint">You also earn Shards by playing: ${SHARDS_PER_WAVE} per wave, ${SHARDS_BOSS_WAVE} for boss waves, ${SHARDS_VICTORY} for a victory.</div></div>
    <button class="mbtn btn sec" data-g="main">Back</button>`;
}
setInterval(() => { // keep the vault display live while a menu is open
  if (!menuWrap.classList.contains('on') || (menuScreen !== 'main' && menuScreen !== 'shop')) return;
  const el = document.getElementById('vaultw'); if (!el) return;
  const fresh = document.createElement('div'); fresh.innerHTML = vaultWidget(); el.replaceWith(fresh.firstElementChild!);
}, 5000);

function toggleFullscreen() {
  try { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); } catch { /* not allowed here */ }
}

// ---------------------------------------------------------------- main menu screens
const menu = $('#menuBody');
const menuWrap = $('#menu');
let menuScreen = 'main';
const pick = { map: profile.lastMap ?? 'meadow', diff: (profile.lastDiff ?? (profile.totalRounds === 0 ? 'easy' : 'medium')) as Difficulty, hero: profile.lastHero };
if (!mapUnlocked(profile, pick.map)) pick.map = 'meadow';
if (!heroUnlocked(profile, pick.hero)) pick.hero = 'aldric';

function showMenu(screen: 'main' | 'play' | 'tree' | 'settings' | 'how' | 'shop') {
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
    const pts = perkPointsLeft(profile);
    h += `<div class="brand"><div class="logo">Shatterspire</div><div class="tagline">Fantasy Tower Defense</div></div>
      <div class="cta">
        ${run ? `<button class="mbtn big btn pri" data-g="continue">${ICON.play}<span>Continue</span><small>Wave ${run.round + 1}</small></button>` : ''}
        <button class="mbtn ${run ? '' : 'big'} btn ${run ? 'sec' : 'pri'}" data-g="play">${ICON.swords}<span>${run ? 'New game' : 'Play'}</span></button>
      </div>
      <div class="mgrid">
        <button class="mtile" data-g="tree">${ICON.book}<b>Perks</b><span>${pts ? `Spend ${pts} point${pts > 1 ? 's' : ''}` : 'Upgrades'}</span>${pts ? `<i class="badge">${pts}</i>` : ''}</button>
        <button class="mtile" data-g="shop">${ICON.shard}<b>Shard Shop</b><span>${fmt(profile.shards)} Shards</span></button>
        <button class="mtile" data-g="how">${ICON.target}<b>How to play</b><span>The basics</span></button>
        <button class="mtile" data-g="settings">${ICON.menu}<b>Settings</b><span>Sound, graphics</span></button>
      </div>
      ${vaultWidget()}
      <div class="small-note">${ICON.medal.replace('class="ico"', 'class="ico sm"')} ${medalCount(profile)} medals · ${fmt(profile.totalRounds)} rounds played</div>`;
  } else if (screen === 'shop') {
    h += shopScreen();
  } else if (screen === 'tree') {
    const left = perkPointsLeft(profile);
    h += `<div class="mh">Perks</div><div class="panel"><div class="hint center">Earn points from medals (1 per map per difficulty) and every 30 rounds played. Points to spend: <b class="accent">${left}</b>. Second-row perks need 2 perks in the same branch.</div><div class="tree">`;
    for (const b of ['economy', 'military', 'arcane'] as const) {
      h += `<div class="branch"><h3>${b}</h3>`;
      for (const p of PERKS.filter((x) => x.branch === b)) {
        const owned = profile.perks.includes(p.id);
        const can = canBuyPerk(p.id, profile.perks, left);
        h += `<button class="perk btn ${owned ? 'pri' : can ? 'sec' : 'mut na'} ${p.tier === 2 ? 't2' : ''}" data-g="perk:${p.id}"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span>${owned ? '<i class="perk-st">Owned</i>' : p.tier === 2 ? '<i class="perk-st">Tier 2</i>' : ''}</button>`;
      }
      h += '</div>';
    }
    h += `</div></div><button class="mbtn btn dan" data-g="reset">Refund all perks</button><button class="mbtn btn sec" data-g="main">Back</button>`;
  } else if (screen === 'settings') {
    const st = profile.settings;
    const tog = (k: string, label: string, on: boolean) => `<button class="toggle ${on ? 'on' : ''}" data-g="${k}" role="switch" aria-pressed="${on}"><span>${label}</span><i class="sw" aria-label="${on ? 'On' : 'Off'}"></i></button>`;
    h += `<div class="mh">Settings</div><div class="setlist">
      ${tog('sfx', 'Sound effects', st.sfx)}
      <label class="slider"><span>Effects volume</span><input type="range" min="0" max="100" value="${Math.round(st.sfxVol * 100)}" data-s="sfxVol"></label>
      ${tog('music', 'Music', st.music)}
      <label class="slider"><span>Music volume</span><input type="range" min="0" max="100" value="${Math.round(st.musicVol * 100)}" data-s="musicVol"></label>
      ${tog('auto', 'Auto-start waves', st.autoStart)}
      ${tog('advisor', 'Advisor tips (★ suggested tower)', st.advisor)}
      <button class="toggle" data-g="quality"><span>Graphics</span><em>${st.quality === 'high' ? 'High' : 'Battery saver'}</em></button>
      ${document.fullscreenEnabled ? `<button class="toggle ${document.fullscreenElement ? 'on' : ''}" data-g="full" role="switch" aria-pressed="${!!document.fullscreenElement}"><span>Fullscreen</span><i class="sw"></i></button>` : ''}
      <button class="toggle" data-g="tutorial"><span>Replay tutorial</span><em>${profile.tutorialDone ? 'Next game' : 'On'}</em></button>
      <button class="toggle" data-g="credits"><span>Credits &amp; licences</span>${ICON.next}</button>
      <button class="mbtn btn dan" data-g="wipe">Reset all progress</button>
      <button class="mbtn btn sec" data-g="main">Back</button></div>`;
  } else {
    const card = (ic: string, t: string, body: string) => `<div class="hcard">${ic}<div><b>${t}</b><p>${body}</p></div></div>`;
    h += `<div class="mh">How to Play</div><div class="howto">
      ${card(ICON.castle, 'Defend the Spire', 'Enemies march down the road toward your Spire. Each one that gets through costs lives: one per layer it still has.')}
      ${card(ICON.shield, 'Enemies come in layers', 'Hit an Ogre and it becomes a Troll, then an Orc, a Goblin, an Imp. Big enemies burst into several smaller ones.')}
      ${card(ICON.target, 'Counters matter', 'The Next Wave box warns you. Ironclads shrug off arrows and swords, Glooms ignore explosions, Frostlings ignore frost, Hexlings ignore magic, and Shadowed enemies are invisible without True Sight.')}
      ${card(ICON.skull, 'Giants', 'From wave 26 giants arrive with huge health and cost hundreds of lives if they leak. Build heavy single-target damage before they come.')}
      ${card(ICON.swords, 'Tower groups', GROUPS.filter((g) => g.id !== 'hero').map((g) => `<b>${esc(g.name)}</b> (${g.towers.map((t) => esc(TOWER_MAP[t].name)).join(', ')}): ${esc(g.how)}`).join(' '))}
      ${card(ICON.up, 'Upgrades', 'Every tower has 3 paths of 5 tiers. You can upgrade 2 paths, and only one of them past tier 2 (for example 5-2-0).')}
      ${card(ICON.flag, 'Barracks', 'Soldiers hold enemies in place. The flag shows where they stand; use Move rally to post them anywhere on the road nearby.')}
      ${card(ICON.hourglass, 'Spells recharge in battle', 'Spells and abilities recharge only while a wave is running, so 2× and 3× speed recharge them faster. Reinforce Walls works any time but never raises lives above your starting total.')}
      ${card(ICON.coin, 'Gold', 'You earn gold for every layer broken, a bonus each wave, and 0.5% interest on banked gold (max 20). Gold in the bank does not defend you, so spend it before big waves.')}
      ${card(ICON.menu, 'Keyboard', 'Space next wave · F speed · A auto · P or Esc pause · 1-0 towers · Shift keep building · , . / upgrade paths · Delete sell.')}
      </div><button class="mbtn btn sec" data-g="main">Back</button>`;
  }
  h += '</div>';
  menu.innerHTML = h;
}

/** Battle setup: everything on one screen, Begin Battle pinned to the bottom. */
function setupScreen() {
  const medalsOf = (id: string) => { const md = profile.medals[id] ?? {}; return (['easy', 'medium', 'hard'] as const).map((d) => `<i class="md-${d} ${md[d] ? 'got' : ''}" title="${DIFF[d].label}${md[d] ? ': medal earned' : ''}"></i>`).join(''); };
  let maps = '';
  for (const m of MAPS) {
    const un = mapUnlocked(profile, m.id);
    maps += `<button class="mapc ${pick.map === m.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'map:' + m.id : 'lockedmap:' + m.id}" aria-pressed="${pick.map === m.id}"><canvas data-map="${m.id}" width="300" height="200"></canvas><div class="mi"><div class="mn">${un ? '' : `${ICON.lock.replace('class="ico"', 'class="ico sm"')} `}${esc(m.name)}</div><div class="md">${esc(m.difficultyLabel)}</div><div class="medals">${medalsOf(m.id)}</div></div></button>`;
  }
  let diffs = '';
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) diffs += `<button class="btn ${pick.diff === d ? 'pri' : 'sec'}" data-g="diff:${d}" aria-pressed="${pick.diff === d}">${DIFF[d].label}<small>${DIFF[d].lives} lives${d === 'hard' ? ' · tough giants' : d === 'easy' ? ' · cheaper' : ''}</small></button>`;
  let heroes = '';
  for (const hd of HEROES) {
    const un = heroUnlocked(profile, hd.id);
    heroes += `<button class="heroc ${pick.hero === hd.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-g="${un ? 'hero:' + hd.id : 'lockedhero:' + hd.id}" aria-pressed="${pick.hero === hd.id}">${img(hd.id, true, 44)}<div class="hn">${un ? '' : `${ICON.lock.replace('class="ico"', 'class="ico sm"')} `}${esc(hd.name)}</div></button>`;
  }
  const hd = HERO_MAP[pick.hero];
  const map = MAPS.find((m) => m.id === pick.map)!;
  return `<div class="setup">
    <div class="su-head"><button class="su-back btn sec" data-g="main" aria-label="Back">${ICON.back}<span>Back</span></button><div class="su-title">Prepare for Battle</div></div>
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
      <button class="su-go btn go" data-g="start">${ICON.swords}<span>Begin Battle</span></button>
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
    case 'shop': showMenu('shop'); break;
    case 'collect': { const n = collectVault(profile, Date.now()); if (n) { saveProfile(profile); audio.play('coin'); toast2(`+${n} Shards collected`); } else toast2('Nothing to collect yet: the vault fills by 1 Shard a minute'); showMenu(menuScreen as 'main' | 'shop'); break; }
    case 'vaultup': if (upgradeVault(profile, Date.now())) { saveProfile(profile); audio.play('upgrade'); toast2(`Vault upgraded: holds ${vaultCap(profile)} Shards`); } else { audio.play('error'); toast2(`Not enough Shards (need ${VAULT_LEVELS[profile.vaultLevel + 1]?.cost ?? 0})`); } showMenu('shop'); break;
    case 'buypower': { const p = POWERS.find((x) => x.id === v)!; if (spendShards(profile, POWER_PRICE[v])) { profile.powers[v] = (profile.powers[v] ?? 0) + 1; saveProfile(profile); audio.play('coin'); toast2(`Bought ${p.name}`); } else { audio.play('error'); toast2(`${p.name} costs ${POWER_PRICE[v]} Shards (you have ${profile.shards})`); } showMenu('shop'); break; }
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
    case 'advisor': profile.settings.advisor = !profile.settings.advisor; saveProfile(profile); showMenu('settings'); break;
    case 'quality': profile.settings.quality = profile.settings.quality === 'high' ? 'low' : 'high'; saveProfile(profile); showMenu('settings'); break;
    case 'full': toggleFullscreen(); setTimeout(() => showMenu('settings'), 200); break;
    case 'tutorial': profile.tutorialDone = false; saveProfile(profile); showMenu('settings'); break;
    case 'credits': creditsModal(); break;
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
  panelKey = ''; shopKey = ''; abilKey = ''; lastTop = ''; waveKey = ''; hudKey = ''; endHandled = false; paused = false; autoT = null;
  battleShards = 0;
  tutSpot = null;
  tutStep = !profile.tutorialDone && game && game.round === 0 ? 0 : -1;
  if (tutStep === 0 && game) tutSpot = findTutSpot();
  renderSide(); renderCoach();
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
  attractR.resize(Math.ceil(WORLD_W * s), Math.ceil(WORLD_H * s), 1.25); // it's blurred anyway
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
    renderer.draw(game, { ghost, selected, targeting: !!armedSpell, cursor, hint: tutStep === 0 ? tutSpot : null, rally: rt && rp ? { tx: rt.x, ty: rt.y, r: Game.RALLY_RANGE, x: rp.x, y: rp.y, editing: !!rallyEdit } : null });
    refreshTop();
    renderWaveBox();
    renderSide();
    renderHud();
    renderAbil();
    { const busy = !!(placing || armedSpell || rallyEdit); $('#stage').classList.toggle('coach-hide', busy); side.classList.toggle('coach-hide', busy); }
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
