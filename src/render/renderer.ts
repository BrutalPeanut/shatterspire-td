import type { Enemy, Game, Projectile, Soldier, Tower } from '../core/game';
import { MAPS, PATH_WIDTH, distToPath, type MapDef } from '../core/maps';
import { TOWER_MAP } from '../core/towers';
import { HERO_MAP } from '../core/heroes';
import { WORLD_H, WORLD_W } from '../core/types';
import { drawSoldierArt, drawTowerArt } from './towerArt';
import { drawAmbient, drawSpire, exitPoint, paintMap } from './mapArt';

export interface Overlay {
  ghost?: { defId: string; x: number; y: number; valid: boolean; radius: number; range: number };
  selected?: Tower | null;
  targeting?: boolean; // meteor targeting cursor
  cursor?: { x: number; y: number } | null;
}

const TAU = Math.PI * 2;
const MAP_SCALE = 1.4; // on-map size of tower models

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 2) {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill();
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
}
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  bg: HTMLCanvasElement | null = null;
  bgMap = '';
  scale = 1;
  dpr = 1;
  constructor(public canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.scale = cssW / WORLD_W;
    this.bg = null;
  }

  // ------------------------------------------------------------ background
  buildBg(map: MapDef) {
    const c = document.createElement('canvas');
    c.width = Math.round(WORLD_W * this.scale * this.dpr); c.height = Math.round(WORLD_H * this.scale * this.dpr);
    const x = c.getContext('2d')!;
    x.scale(this.scale * this.dpr, this.scale * this.dpr);
    paintMap(x, map, this.scale * this.dpr);
    this.bg = c; this.bgMap = map.id;
  }

  // ------------------------------------------------------------ frame
  draw(g: Game, ov: Overlay) {
    const c = this.ctx;
    if (!this.bg || this.bgMap !== g.map.id) this.buildBg(g.map);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bg!, 0, 0);
    c.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);
    const time = g.time;
    drawAmbient(c, g.map, performance.now() / 1000);

    // ground effects
    for (const f of g.ground) {
      const a = Math.min(1, f.t);
      const gr = c.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r);
      gr.addColorStop(0, `rgba(255,220,80,${0.7 * a})`); gr.addColorStop(0.6, `rgba(255,90,20,${0.5 * a})`); gr.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill();
    }

    // range of selected / ghost
    if (ov.selected) this.rangeCircle(ov.selected.x, ov.selected.y, this.displayRange(ov.selected), 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.6)');

    // enemies (big first so small draw on top)
    const es = g.enemies;
    for (const e of es) if (e.def.giant) this.drawEnemy(c, e, time);
    for (const e of es) if (!e.def.giant) this.drawEnemy(c, e, time);

    const sp = exitPoint(g.map);
    drawSpire(c, sp.x, sp.y, performance.now() / 1000);

    // towers
    const sorted = g.towers.slice().sort((a, b) => a.y - b.y);
    for (const t of sorted) this.drawTower(c, t, time, t === ov.selected);
    for (const s of g.soldiers) this.drawSoldier(c, s, time);

    // projectiles
    for (const p of g.projectiles) this.drawProjectile(c, p);

    // fx
    for (const f of g.fx) {
      const k = f.t / f.max;
      c.globalAlpha = Math.max(0, 1 - k);
      switch (f.kind) {
        case 'ring': c.strokeStyle = f.color; c.lineWidth = 3; c.beginPath(); c.arc(f.x, f.y, f.r * (0.3 + 0.7 * k), 0, TAU); c.stroke(); break;
        case 'sweep': c.strokeStyle = f.color; c.lineWidth = 6; c.beginPath(); c.arc(f.x, f.y, f.r * 0.85, k * TAU * 1.2, k * TAU * 1.2 + 2.2); c.stroke(); break;
        case 'boom': { const gr = c.createRadialGradient(f.x, f.y, 1, f.x, f.y, f.r); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.4, f.color); gr.addColorStop(1, 'rgba(255,120,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(f.x, f.y, f.r * (0.5 + 0.6 * k), 0, TAU); c.fill(); break; }
        case 'meteor': { const gr = c.createRadialGradient(f.x, f.y, 1, f.x, f.y, f.r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, f.color); gr.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(f.x, f.y, f.r * (0.6 + 0.6 * k), 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.arc(f.x, f.y, f.r * (0.4 + k), 0, TAU); c.stroke(); break; }
        case 'line': c.strokeStyle = f.color; c.lineWidth = f.r; c.lineCap = 'round'; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x2!, f.y2!); c.stroke(); break;
        case 'chain': {
          c.strokeStyle = f.color; c.lineWidth = 2.5; c.beginPath();
          const p = f.pts!;
          c.moveTo(p[0], p[1]);
          for (let i = 2; i < p.length; i += 2) {
            const mx = (p[i - 2] + p[i]) / 2 + (Math.sin(i * 7.1 + time * 40) * 8), my = (p[i - 1] + p[i + 1]) / 2 + (Math.cos(i * 3.3 + time * 40) * 8);
            c.lineTo(mx, my); c.lineTo(p[i], p[i + 1]);
          }
          c.stroke(); break;
        }
        case 'coin': circle(c, f.x, f.y - 30 * k, 7, '#ffd23a', '#b8860b', 2); break;
        case 'text': break;
      }
      c.globalAlpha = 1;
    }
    // particles
    for (const p of g.particles) { c.globalAlpha = 1 - p.t / p.max; c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    c.globalAlpha = 1;
    // floating text
    c.textAlign = 'center'; c.font = 'bold 15px system-ui, sans-serif';
    for (const f of g.fx) if (f.kind === 'text') {
      const k = f.t / f.max;
      c.globalAlpha = Math.max(0, 1 - k * k);
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(f.text!, f.x, f.y - k * 24);
      c.fillStyle = f.color; c.fillText(f.text!, f.x, f.y - k * 24);
    }
    c.globalAlpha = 1;

    // ghost
    if (ov.ghost) {
      const gh = ov.ghost;
      this.rangeCircle(gh.x, gh.y, gh.range, gh.valid ? 'rgba(255,255,255,0.16)' : 'rgba(255,60,60,0.2)', gh.valid ? 'rgba(255,255,255,0.7)' : 'rgba(255,80,80,0.8)');
      c.globalAlpha = 0.75;
      this.drawTowerBody(c, gh.defId === 'hero' ? g.heroId : gh.defId, gh.defId === 'hero', gh.x, gh.y, -0.3, time, [0, 0, 0], 0, 1, MAP_SCALE);
      c.globalAlpha = 1;
    }
    if (ov.targeting && ov.cursor) {
      c.strokeStyle = '#ff9a2a'; c.lineWidth = 3; c.setLineDash([8, 6]);
      c.beginPath(); c.arc(ov.cursor.x, ov.cursor.y, 95, 0, TAU); c.stroke(); c.setLineDash([]);
    }

    // boss bar
    const boss = g.enemies.find((e) => e.def.boss);
    if (boss) {
      const w = 420, x0 = (WORLD_W - w) / 2, y0 = 14;
      c.fillStyle = 'rgba(20,10,30,0.8)'; this.roundRect(c, x0 - 6, y0 - 6, w + 12, 34, 10); c.fill();
      c.fillStyle = '#3a1a1a'; c.fillRect(x0, y0 + 10, w, 12);
      c.fillStyle = '#e8403a'; c.fillRect(x0, y0 + 10, (w * boss.hp) / boss.maxHp, 12);
      c.fillStyle = '#fff'; c.font = 'bold 11px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(`${boss.def.name}  ${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`, WORLD_W / 2, y0 + 6);
    }
    if (g.freezeT > 0 || g.chronoT > 0) { c.fillStyle = g.freezeT > 0 ? 'rgba(160,220,255,0.12)' : 'rgba(255,226,122,0.08)'; c.fillRect(0, 0, WORLD_W, WORLD_H); }
  }

  displayRange(t: Tower) {
    const r = t.stats.range === Infinity ? 0 : t.stats.range;
    return r * (1 + t.buffs.range);
  }

  rangeCircle(x: number, y: number, r: number, fill: string, stroke: string) {
    if (!r) return;
    const c = this.ctx;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill();
    c.setLineDash([6, 6]); c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
  }

  roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ------------------------------------------------------------ enemies
  drawEnemy(c: CanvasRenderingContext2D, e: Enemy, time: number) {
    const d = e.def, r = d.radius, x = e.x, y = e.y + Math.sin(e.wob) * (d.giant ? 0.8 : 1.6);
    if (x < -40 || x > WORLD_W + 40 || y < -40 || y > WORLD_H + 40) return;
    const shadowed = e.shadow;
    c.globalAlpha = shadowed ? 0.45 : 1;
    // ground shadow
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(x + 2, y + r * 0.8, r * 0.9, r * 0.35, 0, 0, TAU); c.fill();
    const col = e.flash > 0 ? (d.giant ? shade(d.color, 50) : '#ffffff') : d.color;
    if (d.giant) this.drawGiant(c, e, x, y, col, time);
    else {
      // body
      if (e.type === 'hydra') {
        const cols = ['#ff5a5a', '#ffb13a', '#ffe83a', '#5ad65a', '#3a9fff', '#b05aff'];
        for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, (i / 6) * TAU + time, ((i + 1) / 6) * TAU + time); c.fillStyle = cols[i]; c.fill(); }
        c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
      } else if (e.type === 'wraith') {
        circle(c, x, y, r, '#2b2433'); c.fillStyle = '#eaf6ff'; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, Math.PI / 2); c.fill();
        c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
      } else if (e.type === 'golem') {
        circle(c, x, y, r, col, shade(d.color, -50), 2.5);
        c.strokeStyle = shade(d.color, -60); c.lineWidth = 1.5;
        const cracks = Math.floor((1 - e.hp / e.maxHp) * 5);
        for (let i = 0; i < cracks; i++) { const a = i * 1.7; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2); c.lineTo(x + Math.cos(a + 0.3) * r * 0.9, y + Math.sin(a + 0.3) * r * 0.9); c.stroke(); }
        circle(c, x - r * 0.35, y - r * 0.35, r * 0.25, 'rgba(255,255,255,0.2)');
      } else if (e.type === 'iron') {
        circle(c, x, y, r, col, '#4a525c', 2.5);
        c.fillStyle = '#5a636e'; c.fillRect(x - r * 0.75, y - r * 0.2, r * 1.5, r * 0.35);
        c.fillStyle = '#1a1a1a'; c.fillRect(x - r * 0.55, y - r * 0.1, r * 1.1, r * 0.15);
        circle(c, x - r * 0.3, y - r * 0.5, r * 0.2, 'rgba(255,255,255,0.45)');
      } else {
        circle(c, x, y, r, col, shade(d.color, -60), 2);
        circle(c, x - r * 0.35, y - r * 0.4, r * 0.28, 'rgba(255,255,255,0.35)');
      }
      // features
      if (e.type !== 'iron') {
        const eyeC = e.type === 'gloom' ? '#c27aff' : e.type === 'hexling' ? '#ffe27a' : '#ffffff';
        const pupil = e.type === 'gloom' || e.type === 'hexling' ? eyeC : '#1a1a1a';
        const ex = Math.cos(e.angle) * r * 0.25, ey = Math.sin(e.angle) * r * 0.25;
        circle(c, x - r * 0.32 + ex, y - r * 0.05 + ey, r * 0.24, eyeC);
        circle(c, x + r * 0.32 + ex, y - r * 0.05 + ey, r * 0.24, eyeC);
        circle(c, x - r * 0.3 + ex * 1.4, y - r * 0.02 + ey * 1.4, r * 0.11, pupil);
        circle(c, x + r * 0.34 + ex * 1.4, y - r * 0.02 + ey * 1.4, r * 0.11, pupil);
        c.fillStyle = shade(d.color, -80);
        if (e.type === 'imp') { // horns
          c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.6); c.lineTo(x - r * 0.4, y - r * 1.25); c.lineTo(x - r * 0.15, y - r * 0.8); c.fill();
          c.beginPath(); c.moveTo(x + r * 0.6, y - r * 0.6); c.lineTo(x + r * 0.4, y - r * 1.25); c.lineTo(x + r * 0.15, y - r * 0.8); c.fill();
        } else if (e.type === 'goblin') { // ears
          c.fillStyle = col; c.beginPath(); c.moveTo(x - r * 0.8, y - r * 0.2); c.lineTo(x - r * 1.5, y - r * 0.6); c.lineTo(x - r * 0.7, y + r * 0.2); c.fill();
          c.beginPath(); c.moveTo(x + r * 0.8, y - r * 0.2); c.lineTo(x + r * 1.5, y - r * 0.6); c.lineTo(x + r * 0.7, y + r * 0.2); c.fill();
        } else if (e.type === 'orc' || e.type === 'troll' || e.type === 'ogre') { // tusks
          c.fillStyle = '#fff8e0';
          c.beginPath(); c.moveTo(x - r * 0.35, y + r * 0.35); c.lineTo(x - r * 0.25, y + r * 0.75); c.lineTo(x - r * 0.12, y + r * 0.4); c.fill();
          c.beginPath(); c.moveTo(x + r * 0.35, y + r * 0.35); c.lineTo(x + r * 0.25, y + r * 0.75); c.lineTo(x + r * 0.12, y + r * 0.4); c.fill();
          if (e.type === 'ogre') { c.fillStyle = shade(d.color, -70); c.beginPath(); c.moveTo(x - r * 0.15, y - r * 0.8); c.lineTo(x, y - r * 1.35); c.lineTo(x + r * 0.15, y - r * 0.8); c.fill(); }
        } else if (e.type === 'frostling') {
          c.fillStyle = '#9fdcff';
          for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; c.beginPath(); c.moveTo(x + Math.cos(a - 0.15) * r, y + Math.sin(a - 0.15) * r); c.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5); c.lineTo(x + Math.cos(a + 0.15) * r, y + Math.sin(a + 0.15) * r); c.fill(); }
        } else if (e.type === 'hexling') {
          c.strokeStyle = '#ffe27a'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y + r * 0.45, r * 0.25, 0, TAU); c.stroke();
        }
      }
    }
    // modifiers
    if (e.fortified) { c.strokeStyle = '#c7cdd6'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r + 3, 0, TAU); c.stroke(); c.strokeStyle = '#6a737e'; c.lineWidth = 1; c.stroke(); }
    if (e.regen) { c.fillStyle = '#ff5a9a'; c.font = `bold ${Math.max(9, r * 0.8)}px system-ui`; c.textAlign = 'center'; c.fillText('♥', x + r * 0.9, y - r * 0.6); }
    if (e.frozen && e.stunT > 0) { c.fillStyle = 'rgba(180,230,255,0.55)'; c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.fill(); }
    else if (e.slowF > 0) { c.strokeStyle = 'rgba(150,220,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.stroke(); }
    if (e.burnT > 0) { c.fillStyle = 'rgba(255,120,30,0.8)'; c.beginPath(); c.moveTo(x - 4, y - r); c.quadraticCurveTo(x, y - r - 10 - Math.sin(time * 20) * 3, x + 4, y - r); c.fill(); }
    if (e.acidT > 0) circle(c, x + r * 0.6, y + r * 0.5, 3, '#9dff3a');
    c.globalAlpha = 1;
    if (shadowed) { c.setLineDash([3, 3]); c.strokeStyle = '#b07aff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.stroke(); c.setLineDash([]); }
  }

  drawGiant(c: CanvasRenderingContext2D, e: Enemy, x: number, y: number, col: string, time: number) {
    const d = e.def, r = d.radius;
    c.save(); c.translate(x, y); c.rotate(e.angle);
    // body (oval beast seen from above)
    c.fillStyle = col; c.strokeStyle = shade(d.color, -60); c.lineWidth = 3;
    c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, TAU); c.fill(); c.stroke();
    // armor plates
    c.fillStyle = shade(d.color, -30);
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.ellipse(i * r * 0.45, 0, r * 0.22, r * 0.6, 0, 0, TAU); c.fill(); }
    // head
    c.fillStyle = shade(d.color, 20); c.beginPath(); c.arc(r * 1.05, 0, r * 0.45, 0, TAU); c.fill(); c.stroke();
    circle(c, r * 1.2, -r * 0.2, r * 0.1, d.boss ? '#ffe27a' : '#ff3a3a');
    circle(c, r * 1.2, r * 0.2, r * 0.1, d.boss ? '#ffe27a' : '#ff3a3a');
    if (e.type === 'warbeast' || e.type === 'dragon') { // tusks / horns
      c.fillStyle = '#fff8e0';
      c.beginPath(); c.moveTo(r * 1.3, -r * 0.25); c.lineTo(r * 1.9, -r * 0.45); c.lineTo(r * 1.3, -r * 0.05); c.fill();
      c.beginPath(); c.moveTo(r * 1.3, r * 0.25); c.lineTo(r * 1.9, r * 0.45); c.lineTo(r * 1.3, r * 0.05); c.fill();
    }
    if (e.type === 'dragon') { // wings
      c.fillStyle = shade(d.color, -40); c.globalAlpha *= 0.9;
      const flap = Math.sin(time * 4) * 0.25;
      c.beginPath(); c.moveTo(0, -r * 0.6); c.lineTo(-r * 0.6, -r * (2 + flap)); c.lineTo(r * 0.5, -r * 0.7); c.fill();
      c.beginPath(); c.moveTo(0, r * 0.6); c.lineTo(-r * 0.6, r * (2 + flap)); c.lineTo(r * 0.5, r * 0.7); c.fill();
    }
    if (e.type === 'golemking') { c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(r * 0.8, -r * 0.3); c.lineTo(r * 0.8, r * 0.3); c.lineTo(r * 0.55, r * 0.35); c.lineTo(r * 0.65, 0); c.lineTo(r * 0.55, -r * 0.35); c.fill(); }
    if (e.type === 'lich') { c.fillStyle = '#c9a2ff'; c.globalAlpha *= 0.6; c.beginPath(); c.arc(0, 0, r * 1.3 + Math.sin(time * 5) * 3, 0, TAU); c.fill(); }
    // damage cracks
    const dmg = 1 - e.hp / e.maxHp;
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
    for (let i = 0; i < Math.floor(dmg * 6); i++) { const a = i * 2.1; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2); c.lineTo(Math.cos(a + 0.4) * r * 0.9, Math.sin(a + 0.4) * r * 0.65); c.stroke(); }
    c.restore();
    if (!d.boss) { // hp bar
      const w = r * 2;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x - w / 2, y - r - 12, w, 5);
      c.fillStyle = '#5aff6a'; c.fillRect(x - w / 2, y - r - 12, (w * e.hp) / e.maxHp, 5);
    }
  }

  // ------------------------------------------------------------ towers
  drawTower(c: CanvasRenderingContext2D, t: Tower, time: number, selected: boolean) {
    if (selected) { c.strokeStyle = '#ffe27a'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(t.x, t.y + 6, t.radius + 6, (t.radius + 6) * 0.5, 0, 0, TAU); c.stroke(); }
    if (t.brewBuff) { c.strokeStyle = 'rgba(182,255,90,0.75)'; c.lineWidth = 2; c.beginPath(); c.ellipse(t.x, t.y + 5, t.radius + 2 + Math.sin(time * 6) * 1.5, (t.radius + 2) * 0.5, 0, 0, TAU); c.stroke(); }
    this.drawTowerBody(c, t.defId, t.isHero, t.x, t.y, t.angle, time, t.tiers, t.anim, t.level, MAP_SCALE);
    if (!t.isHero) {
      // tier pips
      const total = t.tiers[0] + t.tiers[1] + t.tiers[2];
      if (total) {
        const cols = ['#ff6a5a', '#5ab8ff', '#7dff6a'];
        let i = 0;
        const n = t.tiers.filter((x) => x).length;
        t.tiers.forEach((tier, p) => { if (!tier) return; const px = t.x + (i - (n - 1) / 2) * 12; c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(px - 5, t.y + 15, 10, 9); c.fillStyle = cols[p]; c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.fillText(String(tier), px, t.y + 22.5); i++; });
      }
    } else {
      c.fillStyle = 'rgba(0,0,0,0.65)'; this.roundRect(c, t.x - 11, t.y + 15, 22, 10, 4); c.fill();
      c.fillStyle = '#ffe27a'; c.font = 'bold 8px system-ui'; c.textAlign = 'center'; c.fillText(`Lv${t.level}`, t.x, t.y + 22.5);
    }
  }

  drawTowerBody(c: CanvasRenderingContext2D, defId: string, isHero: boolean, x: number, y: number, ang: number, time: number, tiers: number[], anim: number, level = 1, scale = 1) {
    drawTowerArt(c, defId, x, y, { aim: ang, anim, time, tiers, level, hero: isHero }, scale);
  }

  drawSoldier(c: CanvasRenderingContext2D, s: Soldier, time: number) {
    if (s.dead) return;
    const facing = s.hx >= s.tower.x ? 1 : -1;
    drawSoldierArt(c, s.x, s.y, facing, s.anim > 0, time + s.i, s.tower.tiers[1] >= 4);
    if (s.hp < s.maxHp) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(s.x - 8, s.y - 25, 16, 3); c.fillStyle = '#5aff6a'; c.fillRect(s.x - 8, s.y - 25, (16 * s.hp) / s.maxHp, 3); }
  }

  drawProjectile(c: CanvasRenderingContext2D, p: Projectile) {
    const a = p.atk;
    const ang = Math.atan2(p.vy, p.vx);
    switch (a.visual) {
      case 'arrow': case 'firearrow': case 'thorn': case 'shard': {
        c.save(); c.translate(p.x, p.y); c.rotate(ang);
        c.strokeStyle = a.visual === 'thorn' ? '#4b7d2a' : a.visual === 'shard' ? '#ddd' : '#6b4a2b'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-9, 0); c.lineTo(5, 0); c.stroke();
        c.fillStyle = a.visual === 'firearrow' ? '#ff7a1a' : '#ccc'; c.beginPath(); c.moveTo(8, 0); c.lineTo(3, -3); c.lineTo(3, 3); c.fill();
        c.restore(); break;
      }
      case 'fireball': case 'comet': case 'star': {
        const s = a.size ?? 5;
        const gr = this.ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, s * 2);
        gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.4, a.color); gr.addColorStop(1, 'rgba(255,80,0,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y, s * 2, 0, TAU); c.fill();
        break;
      }
      case 'bomb': {
        if (p.lob) { const k = Math.max(0, p.life) / 0.2; circle(c, p.x, p.y - Math.sin(k * Math.PI) * 6, 3, '#2a2a2a'); break; }
        circle(c, p.x, p.y, a.size ?? 6, '#2a2a2a', '#000', 1);
        circle(c, p.x - 2, p.y - 2, 2, 'rgba(255,255,255,0.4)');
        break;
      }
      case 'potion': {
        const h = p.lob ? Math.sin(Math.min(1, Math.max(0, p.life) * 3) * Math.PI) * 14 : 0;
        c.save(); c.translate(p.x, p.y - h); c.rotate(p.spin);
        circle(c, 0, 2, a.size ?? 5, a.color, '#1a3a0a', 1.2);
        c.fillStyle = '#8a6a3a'; c.fillRect(-2, -(a.size ?? 5) - 3, 4, 4);
        c.restore(); break;
      }
      default: circle(c, p.x, p.y, 3, a.color);
    }
  }

  /** Draw a tower icon for the shop. */
  icon(canvas: HTMLCanvasElement, defId: string, isHero: boolean) {
    const c = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = canvas.clientWidth || 44;
    canvas.width = size * dpr; canvas.height = size * dpr;
    c.setTransform(dpr * (size / 48), 0, 0, dpr * (size / 48), 0, 0);
    c.clearRect(0, 0, 48, 48);
    this.drawTowerBody(c, defId, isHero, 24, 31, -0.2, 0.6, [0, 0, 0], 0, 1, 0.98);
  }
}

export { MAPS };
