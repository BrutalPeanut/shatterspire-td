import type { Enemy, Game, Projectile, Soldier, Tower } from '../core/game';
import { MAPS, PATH_WIDTH, type MapDef } from '../core/maps';
import { TOWER_MAP } from '../core/towers';
import { HERO_MAP } from '../core/heroes';
import { WORLD_H, WORLD_W } from '../core/types';

export interface Overlay {
  ghost?: { defId: string; x: number; y: number; valid: boolean; radius: number; range: number };
  selected?: Tower | null;
  targeting?: boolean; // meteor targeting cursor
  cursor?: { x: number; y: number } | null;
}

const TAU = Math.PI * 2;

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
    const th = map.theme;
    x.fillStyle = th.ground; x.fillRect(0, 0, WORLD_W, WORLD_H);
    let s = 99;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) { x.globalAlpha = 0.5; circle(x, rnd() * WORLD_W, rnd() * WORLD_H, 10 + rnd() * 40, th.ground2); }
    x.globalAlpha = 1;
    // little tufts / flowers / sparkles
    for (let i = 0; i < 140; i++) {
      const px = rnd() * WORLD_W, py = rnd() * WORLD_H;
      if (map.id === 'meadow') { x.fillStyle = ['#fff7a8', '#ffffff', '#ffb3d1'][i % 3]; x.beginPath(); x.arc(px, py, 2, 0, TAU); x.fill(); }
      else if (map.id === 'caverns') { x.fillStyle = 'rgba(158,240,255,0.5)'; x.fillRect(px, py, 2, 2); }
      else if (map.id === 'ember') { x.fillStyle = 'rgba(80,40,20,0.35)'; x.beginPath(); x.arc(px, py, 3, 0, TAU); x.fill(); }
      else { x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(px, py, 1.6, 0, TAU); x.fill(); }
    }
    // path
    for (const p of map.paths) {
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); p.forEach((pt, i) => (i ? x.lineTo(pt.x, pt.y) : x.moveTo(pt.x, pt.y)));
      x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = PATH_WIDTH + 14; x.stroke();
      x.strokeStyle = th.pathEdge; x.lineWidth = PATH_WIDTH + 6; x.stroke();
    }
    for (const p of map.paths) {
      x.beginPath(); p.forEach((pt, i) => (i ? x.lineTo(pt.x, pt.y) : x.moveTo(pt.x, pt.y)));
      x.strokeStyle = th.path; x.lineWidth = PATH_WIDTH - 2; x.stroke();
      x.setLineDash([2, 18]); x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 6; x.stroke(); x.setLineDash([]);
    }
    // obstacles
    for (const o of map.obstacles) {
      if (o.kind === 'tree') { circle(x, o.x + 3, o.y + 5, o.r, 'rgba(0,0,0,0.18)'); circle(x, o.x, o.y, o.r, '#3e8f3a', '#2c6a2a', 2); circle(x, o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.45, '#56ad4c'); }
      else if (o.kind === 'pine') { x.fillStyle = 'rgba(0,0,0,0.15)'; x.beginPath(); x.ellipse(o.x + 3, o.y + o.r * 0.8, o.r * 0.8, o.r * 0.3, 0, 0, TAU); x.fill(); x.fillStyle = '#2f6e4a'; x.beginPath(); x.moveTo(o.x, o.y - o.r * 1.2); x.lineTo(o.x + o.r * 0.9, o.y + o.r * 0.8); x.lineTo(o.x - o.r * 0.9, o.y + o.r * 0.8); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(o.x, o.y - o.r * 1.2); x.lineTo(o.x + o.r * 0.35, o.y - o.r * 0.4); x.lineTo(o.x - o.r * 0.35, o.y - o.r * 0.4); x.fill(); }
      else if (o.kind === 'rock') { circle(x, o.x + 3, o.y + 4, o.r, 'rgba(0,0,0,0.2)'); x.fillStyle = '#8b8178'; x.beginPath(); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const rr = o.r * (0.8 + ((i * 37) % 10) / 40); x.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr); } x.fill(); x.strokeStyle = '#5e5650'; x.lineWidth = 2; x.stroke(); circle(x, o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.3, 'rgba(255,255,255,0.18)'); }
      else if (o.kind === 'crystal') { x.fillStyle = 'rgba(0,0,0,0.2)'; x.beginPath(); x.ellipse(o.x + 2, o.y + o.r * 0.7, o.r * 0.8, o.r * 0.3, 0, 0, TAU); x.fill(); for (let k = -1; k <= 1; k++) { x.fillStyle = k ? '#7fd8f0' : '#b9f3ff'; x.beginPath(); x.moveTo(o.x + k * o.r * 0.45, o.y - o.r * (k ? 0.8 : 1.3)); x.lineTo(o.x + k * o.r * 0.45 + o.r * 0.3, o.y + o.r * 0.6); x.lineTo(o.x + k * o.r * 0.45 - o.r * 0.3, o.y + o.r * 0.6); x.fill(); x.strokeStyle = '#3a9fbf'; x.lineWidth = 1.5; x.stroke(); } }
      else if (o.kind === 'water') { x.fillStyle = '#3a8fd6'; x.beginPath(); x.ellipse(o.x, o.y, o.r * 1.3, o.r, 0, 0, TAU); x.fill(); x.strokeStyle = '#d8f0ff'; x.lineWidth = 3; x.stroke(); x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.5, o.r * 0.2, -0.3, 0, TAU); x.fill(); }
      else if (o.kind === 'lava') { const gr = x.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r * 1.3); gr.addColorStop(0, '#ffe066'); gr.addColorStop(0.5, '#ff7a1a'); gr.addColorStop(1, '#8a2a10'); x.fillStyle = gr; x.beginPath(); x.ellipse(o.x, o.y, o.r * 1.3, o.r, 0, 0, TAU); x.fill(); }
    }
    // entrance portals and the spire at the exit
    for (const p of map.paths) {
      const a = p[0], b = p[1];
      const ex = Math.max(16, Math.min(WORLD_W - 16, a.x)), ey = Math.max(16, Math.min(WORLD_H - 16, a.y));
      void b;
      x.fillStyle = 'rgba(40,10,60,0.55)'; x.beginPath(); x.arc(ex, ey, 26, 0, TAU); x.fill();
    }
    const last = map.paths[0][map.paths[0].length - 1];
    const sx = Math.max(30, Math.min(WORLD_W - 30, last.x)), sy = Math.max(40, Math.min(WORLD_H - 30, last.y));
    this.drawSpire(x, sx, sy);
    this.bg = c; this.bgMap = map.id;
  }

  drawSpire(x: CanvasRenderingContext2D, sx: number, sy: number) {
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(sx + 4, sy + 18, 26, 9, 0, 0, TAU); x.fill();
    x.fillStyle = '#d9d2c3'; x.fillRect(sx - 16, sy - 30, 32, 48);
    x.strokeStyle = '#8f8576'; x.lineWidth = 2; x.strokeRect(sx - 16, sy - 30, 32, 48);
    for (let i = -2; i <= 1; i++) x.fillRect(sx + i * 9 + 1, sy - 37, 6, 8);
    x.fillStyle = '#6b4fd6'; x.beginPath(); x.moveTo(sx - 18, sy - 30); x.lineTo(sx, sy - 62); x.lineTo(sx + 18, sy - 30); x.fill();
    x.fillStyle = '#ffe27a'; x.beginPath(); x.arc(sx, sy - 64, 4, 0, TAU); x.fill();
    x.fillStyle = '#4a3a2a'; x.beginPath(); x.arc(sx, sy + 8, 7, Math.PI, 0); x.fillRect(sx - 7, sy + 8, 14, 10); x.fill();
  }

  // ------------------------------------------------------------ frame
  draw(g: Game, ov: Overlay) {
    const c = this.ctx;
    if (!this.bg || this.bgMap !== g.map.id) this.buildBg(g.map);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bg!, 0, 0);
    c.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);
    const time = g.time;

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

    // towers
    for (const t of g.towers) this.drawTower(c, t, time, t === ov.selected);
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
      this.drawTowerBody(c, gh.defId === 'hero' ? g.heroId : gh.defId, gh.defId === 'hero', gh.x, gh.y, -Math.PI / 2, time, [0, 0, 0], 0);
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
    const col = e.flash > 0 ? '#ffffff' : d.color;
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
    if (selected) { c.strokeStyle = '#ffe27a'; c.lineWidth = 3; c.beginPath(); c.arc(t.x, t.y, t.radius + 6, 0, TAU); c.stroke(); }
    if (t.brewBuff) { c.strokeStyle = 'rgba(182,255,90,0.7)'; c.lineWidth = 2; c.beginPath(); c.arc(t.x, t.y, t.radius + 4 + Math.sin(time * 6) * 1.5, 0, TAU); c.stroke(); }
    this.drawTowerBody(c, t.defId, t.isHero, t.x, t.y, t.angle, time, t.tiers, t.anim, t.level);
    if (!t.isHero) {
      // tier pips
      const total = t.tiers[0] + t.tiers[1] + t.tiers[2];
      if (total) {
        const cols = ['#ff6a5a', '#5ab8ff', '#7dff6a'];
        let i = 0;
        const n = t.tiers.filter((x) => x).length;
        t.tiers.forEach((tier, p) => { if (!tier) return; const px = t.x + (i - (n - 1) / 2) * 12; c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(px - 5, t.y + t.radius - 2, 10, 9); c.fillStyle = cols[p]; c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.fillText(String(tier), px, t.y + t.radius + 5); i++; });
      }
    } else {
      c.fillStyle = 'rgba(0,0,0,0.65)'; this.roundRect(c, t.x - 9, t.y + t.radius - 3, 18, 11, 4); c.fill();
      c.fillStyle = '#ffe27a'; c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.fillText(String(t.level), t.x, t.y + t.radius + 5);
    }
  }

  drawTowerBody(c: CanvasRenderingContext2D, defId: string, isHero: boolean, x: number, y: number, ang: number, time: number, tiers: number[], anim: number, level = 1) {
    const def = isHero ? HERO_MAP[defId] : TOWER_MAP[defId];
    if (!def) return;
    const r = def.radius;
    const top = Math.max(...tiers);
    // platform
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 2, y + 4, r + 2, r * 0.8, 0, 0, TAU); c.fill();
    circle(c, x, y, r, top >= 5 ? '#ffe9a8' : top >= 3 ? '#cfc6b8' : '#a99f92', top >= 5 ? '#d4a017' : '#6e665c', 2.5);
    circle(c, x, y, r * 0.78, shade(def.color, -10));
    const kick = anim > 0 ? -2 : 0;
    c.save(); c.translate(x, y);
    switch (isHero ? 'hero:' + defId : defId) {
      case 'archer': {
        c.rotate(ang);
        circle(c, 0, 0, r * 0.55, def.color, shade(def.color, -50), 1.5);
        c.strokeStyle = '#6b4a2b'; c.lineWidth = 2.5; c.beginPath(); c.arc(r * 0.35 + kick, 0, r * 0.55, -1.2, 1.2); c.stroke();
        c.strokeStyle = '#eee'; c.lineWidth = 1; c.beginPath(); c.moveTo(r * 0.35 + kick + Math.cos(-1.2) * r * 0.55, Math.sin(-1.2) * r * 0.55); c.lineTo(r * 0.35 + kick + Math.cos(1.2) * r * 0.55, Math.sin(1.2) * r * 0.55); c.stroke();
        circle(c, -r * 0.1, 0, r * 0.28, '#f1c27d');
        if (tiers[2] >= 2) circle(c, r * 0.8, 0, 3, '#ff7a1a');
        break;
      }
      case 'knight': {
        c.rotate(ang + (anim > 0 ? (0.15 - anim) * 20 : 0));
        circle(c, 0, 0, r * 0.6, '#c3ccd8', '#6e7888', 2);
        c.fillStyle = tiers[1] >= 3 ? '#ffe27a' : '#e8eef7'; c.fillRect(r * 0.3, -2, r * 0.9, 4);
        c.fillStyle = '#8a5a32'; c.fillRect(r * 0.2, -4, 4, 8);
        c.fillStyle = def.accent; c.beginPath(); c.arc(-r * 0.15, 0, r * 0.25, 0, TAU); c.fill();
        break;
      }
      case 'barracks': {
        c.fillStyle = '#8a5a3a'; c.fillRect(-r * 0.6, -r * 0.45, r * 1.2, r * 0.9);
        c.fillStyle = '#c94a3a'; c.beginPath(); c.moveTo(-r * 0.75, -r * 0.4); c.lineTo(0, -r * 0.95); c.lineTo(r * 0.75, -r * 0.4); c.fill();
        c.fillStyle = '#3a2a1a'; c.fillRect(-r * 0.18, -r * 0.05, r * 0.36, r * 0.5);
        c.strokeStyle = '#ffe27a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(r * 0.5, -r * 0.4); c.lineTo(r * 0.5, -r * 1.1); c.stroke();
        c.fillStyle = '#ffe27a'; c.beginPath(); c.moveTo(r * 0.5, -r * 1.1); c.lineTo(r * 0.85, -r * 0.95 + Math.sin(time * 5) * 2); c.lineTo(r * 0.5, -r * 0.8); c.fill();
        break;
      }
      case 'mage': case 'hero:lyra': {
        const robe = isHero ? '#6b4fd6' : '#c2412f';
        circle(c, 0, 0, r * 0.6, robe, shade(robe, -50), 1.5);
        c.fillStyle = shade(robe, -30); c.beginPath(); c.moveTo(-r * 0.4, -r * 0.1); c.lineTo(0, -r * 0.95); c.lineTo(r * 0.4, -r * 0.1); c.fill();
        c.rotate(ang);
        c.strokeStyle = '#7a5230'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, r * 0.3); c.lineTo(r * 0.85, r * 0.3); c.stroke();
        const glow = isHero ? '#ffe27a' : tiers[1] >= 3 ? '#9fe0ff' : '#ffb02e';
        circle(c, r * 0.9, r * 0.3, 3.5 + Math.sin(time * 8) * 1, glow);
        break;
      }
      case 'druid': {
        circle(c, 0, 0, r * 0.6, '#4aa3c7', '#2a6f8a', 1.5);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + time * 0.8; c.fillStyle = '#e8fbff'; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); c.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75); c.lineTo(Math.cos(a + 0.3) * r * 0.35, Math.sin(a + 0.3) * r * 0.35); c.fill(); }
        circle(c, 0, 0, r * 0.25, tiers[1] ? '#5ab84a' : '#ffffff');
        break;
      }
      case 'cannon': {
        c.rotate(ang);
        circle(c, 0, 0, r * 0.62, '#6b6b75', '#3a3a42', 2);
        const n = tiers[1] >= 2 ? 2 : 1;
        for (let k = 0; k < n; k++) { const off = n === 2 ? (k ? 4 : -4) : 0; c.fillStyle = '#2a2a2a'; c.fillRect(r * 0.1 + kick, off - 4, r * 0.95, 8); c.fillStyle = '#e0a030'; c.fillRect(r * 0.95 + kick, off - 5, 3, 10); }
        circle(c, -r * 0.25, 0, r * 0.22, '#d9a066');
        break;
      }
      case 'ballista': {
        c.rotate(ang);
        c.fillStyle = '#8a5a32'; c.fillRect(-r * 0.6, -3, r * 1.5 + kick, 6);
        c.strokeStyle = '#5a3a1a'; c.lineWidth = 3; c.beginPath(); c.arc(r * 0.3, 0, r * 0.7, -1.3, 1.3); c.stroke();
        c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(r * 0.3 + Math.cos(-1.3) * r * 0.7, Math.sin(-1.3) * r * 0.7); c.lineTo(-r * 0.3 + kick, 0); c.lineTo(r * 0.3 + Math.cos(1.3) * r * 0.7, Math.sin(1.3) * r * 0.7); c.stroke();
        c.fillStyle = '#d9d9d9'; c.beginPath(); c.moveTo(r * 1 + kick, 0); c.lineTo(r * 0.75 + kick, -3); c.lineTo(r * 0.75 + kick, 3); c.fill();
        break;
      }
      case 'alchemist': {
        circle(c, 0, 0, r * 0.6, '#3a3a3a', '#1a1a1a', 2);
        circle(c, 0, 0, r * 0.45, '#5aff3a');
        for (let i = 0; i < 3; i++) circle(c, Math.sin(time * 3 + i * 2) * r * 0.25, Math.cos(time * 4 + i) * r * 0.2, 2.5, '#d9ffb0');
        if (tiers[2] >= 1) circle(c, r * 0.6, -r * 0.5, 4, '#ffd23a', '#b8860b', 1);
        break;
      }
      case 'bard': {
        circle(c, 0, 0, r * 0.55, '#d68a2f', '#8a5a1a', 1.5);
        c.fillStyle = '#7a3fbf'; c.beginPath(); c.ellipse(r * 0.2, r * 0.15, r * 0.35, r * 0.25, 0.4, 0, TAU); c.fill();
        c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * 0.3, r * 0.1); c.lineTo(-r * 0.4, -r * 0.5); c.stroke();
        c.fillStyle = '#ffe27a'; c.font = `${r * 0.8}px system-ui`; c.textAlign = 'center'; c.fillText('♪', Math.sin(time * 2) * 6, -r * 0.6 - ((time * 20) % 10));
        break;
      }
      case 'mine': {
        c.fillStyle = '#5a4030'; c.beginPath(); c.arc(0, r * 0.1, r * 0.6, Math.PI, 0); c.fill();
        c.fillStyle = '#1a1210'; c.beginPath(); c.arc(0, r * 0.15, r * 0.35, Math.PI, 0); c.fill();
        c.fillStyle = '#8a6a3a'; c.fillRect(-r * 0.65, r * 0.1, r * 1.3, 4);
        for (let i = 0; i < 3; i++) circle(c, -r * 0.35 + i * r * 0.35, r * 0.4, 3.5, '#ffd23a', '#b8860b', 1);
        if (tiers[1]) { c.fillStyle = '#fff'; c.font = `bold ${r * 0.6}px system-ui`; c.textAlign = 'center'; c.fillText('🏦', 0, -r * 0.5); }
        break;
      }
      case 'hero:aldric': {
        c.rotate(ang + (anim > 0 ? (0.15 - anim) * 20 : 0));
        c.fillStyle = '#2f6fd6'; c.beginPath(); c.arc(-r * 0.2, 0, r * 0.65, Math.PI * 0.5, Math.PI * 1.5); c.fill();
        circle(c, 0, 0, r * 0.5, '#d5dde8', '#7a8494', 2);
        c.fillStyle = '#fff6b0'; c.fillRect(r * 0.3, -2.5, r * 1.0, 5);
        c.fillStyle = '#c9a35b'; c.fillRect(r * 0.25, -5, 4, 10);
        c.fillStyle = '#d94040'; c.fillRect(-3, -r * 0.6, 6, 4);
        break;
      }
      case 'hero:grimbeard': {
        c.rotate(ang);
        circle(c, 0, 0, r * 0.55, '#a0522d', '#5a2a10', 2);
        c.fillStyle = '#e07a2a'; c.beginPath(); c.arc(-r * 0.1, 0, r * 0.4, -1, 1); c.fill();
        c.fillStyle = '#3a3a3a'; c.fillRect(r * 0.2 + kick, -3, r * 0.9, 6);
        c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(-r * 0.2, 0, r * 0.25, 0, TAU); c.fill();
        break;
      }
    }
    c.restore();
    void level;
  }

  drawSoldier(c: CanvasRenderingContext2D, s: Soldier, time: number) {
    if (s.dead) return;
    const x = s.x, y = s.y;
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(x + 1, y + 6, 7, 3, 0, 0, TAU); c.fill();
    circle(c, x, y, 7, '#c94a3a', '#6a1a10', 1.5);
    circle(c, x, y - 1, 4, '#d5dde8');
    c.fillStyle = '#8a96a3'; c.fillRect(x - 9, y - 4, 4, 8);
    const stab = s.anim > 0 ? 3 : 0;
    c.strokeStyle = '#e8eef7'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 5, y + 2); c.lineTo(x + 11 + stab, y - 6 - stab); c.stroke();
    if (s.hp < s.maxHp) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x - 8, y - 13, 16, 3); c.fillStyle = '#5aff6a'; c.fillRect(x - 8, y - 13, (16 * s.hp) / s.maxHp, 3); }
    void time;
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
    this.drawTowerBody(c, defId, isHero, 24, 24, -Math.PI / 4, 0, [0, 0, 0], 0);
  }
}

export { MAPS };
