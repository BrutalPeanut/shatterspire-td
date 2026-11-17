// Tower buildings: each tower is a structure with its unit(s)
// standing on or around it. Each building has a back layer, a figure anchor and a
// front layer so units sit *inside* the architecture instead of on a pedestal.
type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const OUT = '#2a1d16';

export interface BPose { aim: number; anim: number; time: number; tiers: number[]; level: number; hero: boolean }
export interface Anchor { x: number; y: number; s: number }
export interface Building {
  back: (c: C, p: BPose) => void;
  figures: (p: BPose) => Anchor[]; // where to draw the unit(s)
  front?: (c: C, p: BPose) => void;
}

// ---------------------------------------------------------------- primitives
function shadow(c: C, rx: number, ry: number, dx = 4, dy = 3) {
  const g = c.createRadialGradient(dx, dy, 1, dx, dy, rx);
  g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.ellipse(dx, dy, rx, ry, 0, 0, TAU); c.fill();
}
function hgrad(c: C, x0: number, x1: number, cols: string[]) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  return g;
}
const STONE = ['#e6dfd2', '#c9c0b0', '#a39a8a', '#6e6556'];
const MARBLE = ['#ffffff', '#ece8df', '#cfc8b8', '#9a9384'];
const DARKSTONE = ['#8a8494', '#6a6476', '#4e485a', '#2e2a38'];
const WOOD = ['#c48a52', '#a06a3a', '#7a4e28', '#4e3018'];

/** Vertical cylinder with brick courses. Top at yTop, bottom at yBot (front edge), radius r. */
function cylinder(c: C, r: number, yTop: number, yBot: number, cols = STONE, bricks = true, ellK = 0.38) {
  c.beginPath();
  c.moveTo(-r, yTop); c.lineTo(-r, yBot); c.ellipse(0, yBot, r, r * ellK, 0, Math.PI, 0, true); c.lineTo(r, yTop);
  c.ellipse(0, yTop, r, r * ellK, 0, 0, Math.PI, false); c.closePath();
  c.fillStyle = hgrad(c, -r, r, cols); c.fill();
  if (bricks) {
    c.save(); c.clip();
    c.strokeStyle = 'rgba(40,28,20,0.28)'; c.lineWidth = 0.8;
    const course = 4.5;
    let row = 0;
    for (let y = yTop + course; y < yBot + r * ellK; y += course, row++) {
      c.beginPath(); c.ellipse(0, y, r, r * ellK, 0, 0, Math.PI); c.stroke();
      for (let k = 0; k < 7; k++) { const a = ((k + (row % 2) * 0.5) / 7) * Math.PI; const bx = Math.cos(a) * r; const by = y + Math.sin(a) * r * ellK; c.beginPath(); c.moveTo(bx, by - course); c.lineTo(bx, by); c.stroke(); }
    }
    c.restore();
  }
  c.beginPath(); c.moveTo(-r, yTop); c.lineTo(-r, yBot); c.ellipse(0, yBot, r, r * ellK, 0, Math.PI, 0, true); c.lineTo(r, yTop);
  c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
}
function disc(c: C, r: number, y: number, fill: string, ellK = 0.38, stroke = true) {
  c.beginPath(); c.ellipse(0, y, r, r * ellK, 0, 0, TAU); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke(); }
}
function crenels(c: C, r: number, y: number, h: number, cols = STONE, front: boolean, ellK = 0.38) {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.15;
    const sy = Math.sin(a);
    if (front ? sy < 0.05 : sy >= 0.05) continue;
    const x = Math.cos(a) * r, yy = y + sy * r * ellK;
    const w = 3.6;
    c.fillStyle = sy > 0 ? hgrad(c, x - w, x + w, [cols[1], cols[2]]) : cols[2];
    c.fillRect(x - w / 2, yy - h, w, h); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(x - w / 2, yy - h, w, h);
    c.fillStyle = cols[0]; c.fillRect(x - w / 2, yy - h, w, 1);
  }
}
/** Conical shingled roof. */
function cone(c: C, r: number, yBase: number, h: number, col: string, dark: string, light: string, ellK = 0.38) {
  c.beginPath(); c.moveTo(-r - 2, yBase); c.ellipse(0, yBase, r + 2, (r + 2) * ellK, 0, Math.PI, 0, true); c.lineTo(0, yBase - h); c.closePath();
  c.fillStyle = hgrad(c, -r, r, [light, col, dark]); c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.9;
  for (let k = 1; k < 6; k++) { const t = k / 6; const rr = (r + 2) * (1 - t); c.beginPath(); c.ellipse(0, yBase - h * t, rr, rr * ellK, 0, 0, Math.PI); c.stroke(); }
  for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(0, yBase - h); c.lineTo(k * (r + 2) / 3.2, yBase + (r + 2) * ellK * 0.9); c.stroke(); }
  c.restore();
  c.beginPath(); c.moveTo(-r - 2, yBase); c.ellipse(0, yBase, r + 2, (r + 2) * ellK, 0, Math.PI, 0, true); c.lineTo(0, yBase - h); c.closePath();
  c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
}
function flag(c: C, x: number, y: number, h: number, col: string, time: number, emblem = '#fff3c4') {
  c.strokeStyle = OUT; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
  c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.2; c.stroke();
  const w = Math.sin(time * 5 + x) * 1.6;
  c.beginPath(); c.moveTo(x, y - h); c.quadraticCurveTo(x + 6, y - h + w, x + 12, y - h + 1.5); c.lineTo(x + 10, y - h + 4.5); c.lineTo(x + 12, y - h + 7.5); c.quadraticCurveTo(x + 6, y - h + 6 + w, x, y - h + 7);
  c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.9; c.stroke();
  c.fillStyle = emblem; c.beginPath(); c.arc(x + 5, y - h + 3.6, 1.4, 0, TAU); c.fill();
}
function banner(c: C, x: number, y: number, w: number, h: number, col: string, trim = '#e8c45a', emblem?: string) {
  c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.lineTo(x, y + h - w * 0.4); c.lineTo(x - w / 2, y + h); c.closePath();
  c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
  c.strokeStyle = trim; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - w / 2 + 1, y + 1.5); c.lineTo(x + w / 2 - 1, y + 1.5); c.stroke();
  if (emblem) { c.fillStyle = emblem; c.beginPath(); c.moveTo(x, y + 3); c.lineTo(x + 2, y + 5.5); c.lineTo(x, y + 8); c.lineTo(x - 2, y + 5.5); c.closePath(); c.fill(); }
  c.strokeStyle = '#6b4424'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x - w / 2 - 1, y); c.lineTo(x + w / 2 + 1, y); c.stroke();
}
function window(c: C, x: number, y: number, w: number, h: number, glow: string) {
  c.beginPath(); c.moveTo(x - w / 2, y + h); c.lineTo(x - w / 2, y + w / 2); c.arc(x, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, y + h); c.closePath();
  c.fillStyle = glow; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
  c.strokeStyle = 'rgba(40,20,10,0.6)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x, y + h); c.moveTo(x - w / 2, y + h * 0.55); c.lineTo(x + w / 2, y + h * 0.55); c.stroke();
}
function plankRing(c: C, r: number, yTop: number, yBot: number, cols = WOOD, ellK = 0.38) {
  cylinder(c, r, yTop, yBot, cols, false, ellK);
  c.save();
  c.beginPath(); c.moveTo(-r, yTop); c.lineTo(-r, yBot); c.ellipse(0, yBot, r, r * ellK, 0, Math.PI, 0, true); c.lineTo(r, yTop); c.ellipse(0, yTop, r, r * ellK, 0, 0, Math.PI, false); c.closePath(); c.clip();
  c.strokeStyle = 'rgba(40,20,8,0.45)'; c.lineWidth = 0.9;
  for (let k = 1; k < 12; k++) { const a = (k / 12) * Math.PI; const x = Math.cos(a) * r; c.beginPath(); c.moveTo(x, yTop + Math.sin(a) * r * ellK); c.lineTo(x, yBot + Math.sin(a) * r * ellK); c.stroke(); }
  c.restore();
  // iron bands
  for (const yy of [yTop + 2, yBot - 2]) { c.strokeStyle = '#3a3a44'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, yy, r, r * ellK, 0, 0, Math.PI); c.stroke(); }
}
function railing(c: C, r: number, y: number, h: number, front: boolean, col = '#8a5a2e', ellK = 0.38) {
  const from = front ? 0 : Math.PI, to = front ? Math.PI : TAU;
  c.strokeStyle = OUT; c.lineWidth = 3; c.beginPath(); c.ellipse(0, y - h, r, r * ellK, 0, from, to); c.stroke();
  c.strokeStyle = col; c.lineWidth = 1.8; c.stroke();
  for (let k = 0; k <= 8; k++) {
    const a = from + ((to - from) * k) / 8;
    const x = Math.cos(a) * r, yy = y + Math.sin(a) * r * ellK;
    c.strokeStyle = OUT; c.lineWidth = 2.6; c.beginPath(); c.moveTo(x, yy); c.lineTo(x, yy - h); c.stroke();
    c.strokeStyle = col; c.lineWidth = 1.4; c.stroke();
  }
}

// ---------------------------------------------------------------- towers
const top = (p: BPose) => Math.max(...p.tiers);

const archer: Building = {
  back: (c, p) => {
    const [, hawk, elf] = p.tiers;
    const cols = elf >= 3 ? MARBLE : STONE;
    const baseH = hawk >= 3 ? 30 : 24;
    shadow(c, 24, 9);
    cylinder(c, 15, -baseH, 2, cols);
    // arrow-slit windows
    c.fillStyle = '#2a1a10'; c.fillRect(-1, -baseH + 8, 2, 7); c.fillRect(-9, -baseH + 10, 1.6, 5);
    if (elf >= 3) { c.strokeStyle = '#d9b45a'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, -baseH + 4, 15, 15 * 0.38, 0, 0, Math.PI); c.stroke(); for (let i = -1; i <= 1; i++) { c.fillStyle = '#5aa04a'; c.beginPath(); c.ellipse(i * 7, -baseH + 6 + Math.abs(i), 2.4, 1.2, i * 0.6, 0, TAU); c.fill(); } }
    // wooden deck
    plankRing(c, 18, -baseH - 8, -baseH, elf >= 3 ? ['#e8d8a8', '#c9b07a', '#a08850', '#6e5a30'] : WOOD);
    disc(c, 18, -baseH - 8, elf >= 3 ? '#d9c590' : '#b07a48');
    railing(c, 17, -baseH - 8, 6, false, elf >= 3 ? '#e8c45a' : '#8a5a2e');
    if (hawk >= 2) { c.strokeStyle = OUT; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-12, -baseH - 10); c.lineTo(-12, -baseH - 34); c.stroke(); c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.2; c.stroke(); flag(c, -12, -baseH - 10, 24, '#2d5f8a', p.time); }
  },
  figures: (p) => {
    const baseH = p.tiers[1] >= 3 ? 30 : 24;
    return p.tiers[0] >= 3 ? [{ x: -6, y: -baseH - 9, s: 0.82 }, { x: 6, y: -baseH - 7, s: 0.82 }] : [{ x: 0, y: -baseH - 8, s: 0.88 }];
  },
  front: (c, p) => {
    const [, hawk, elf] = p.tiers;
    const baseH = hawk >= 3 ? 30 : 24;
    railing(c, 17, -baseH - 8, 6, true, elf >= 3 ? '#e8c45a' : '#8a5a2e');
    banner(c, 0, -baseH - 2, 8, 11, elf >= 3 ? '#2f8a3a' : hawk >= 3 ? '#2d5f8a' : '#3f7a34', '#e8c45a', '#fff3c4');
    if (elf >= 4) for (const bx of [-15, 15]) { c.fillStyle = '#3a3a44'; c.fillRect(bx - 2, -baseH - 2, 4, 3); const f = 2 + Math.sin(p.time * 12 + bx) * 0.6; c.fillStyle = '#ffb02e'; c.beginPath(); c.ellipse(bx, -baseH - 4, f, f * 1.6, 0, 0, TAU); c.fill(); c.fillStyle = '#fff2a0'; c.beginPath(); c.ellipse(bx, -baseH - 3.5, f * 0.5, f, 0, 0, TAU); c.fill(); }
  },
};

const knight: Building = {
  back: (c, p) => {
    const [, holy, guard] = p.tiers;
    shadow(c, 26, 10);
    // low arena wall back half + sand floor
    const wall = holy >= 3 ? MARBLE : STONE;
    c.save(); c.beginPath(); c.rect(-30, -30, 60, 28); c.clip();
    cylinder(c, 20, -6, 2, wall);
    c.restore();
    disc(c, 18, -6, '#e0c48a', 0.38, false);
    c.fillStyle = 'rgba(160,120,60,0.35)'; c.beginPath(); c.ellipse(2, -5, 12, 4, 0, 0, TAU); c.fill();
    // banner poles behind
    for (const bx of [-14, 14]) {
      c.strokeStyle = OUT; c.lineWidth = 2.4; c.beginPath(); c.moveTo(bx, -8); c.lineTo(bx, -40); c.stroke(); c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#c9a35b'; c.beginPath(); c.arc(bx, -41, 1.8, 0, TAU); c.fill();
      banner(c, bx, -38, 8, 16, holy >= 3 ? '#f2e2a0' : guard >= 3 ? '#2f5fb8' : '#b02a2a', '#e8c45a', holy >= 3 ? '#b8963a' : '#fff3c4');
    }
    // weapon rack
    c.strokeStyle = '#6b4424'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-6, -8); c.lineTo(6, -8); c.stroke();
    for (let i = 0; i < 3; i++) { c.strokeStyle = '#cfd6de'; c.lineWidth = 1; c.beginPath(); c.moveTo(-4 + i * 4, -7); c.lineTo(-4 + i * 4, -17); c.stroke(); }
  },
  figures: () => [{ x: 0, y: -3, s: 1.12 }],
  front: (c, p) => {
    const wall = p.tiers[1] >= 3 ? MARBLE : STONE;
    c.save(); c.beginPath(); c.rect(-30, -2, 60, 20); c.clip();
    cylinder(c, 20, -6, 2, wall);
    c.restore();
    c.beginPath(); c.ellipse(0, -6, 20, 20 * 0.38, 0, 0, Math.PI); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = wall[0]; c.lineWidth = 1; c.beginPath(); c.ellipse(0, -6.6, 19, 19 * 0.38, 0, 0.1, Math.PI - 0.1); c.stroke();
    if (p.tiers[2] >= 3) for (const sx of [-12, 12]) { c.fillStyle = '#2f5fb8'; c.beginPath(); c.moveTo(sx - 4, -4); c.lineTo(sx + 4, -4); c.lineTo(sx + 4, 3); c.lineTo(sx, 6); c.lineTo(sx - 4, 3); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke(); c.strokeStyle = '#e8c45a'; c.beginPath(); c.moveTo(sx, -3); c.lineTo(sx, 4); c.stroke(); }
  },
};

const barracks: Building = {
  back: (c, p) => {
    const [sw, wm, ra] = p.tiers;
    const t = top(p);
    shadow(c, 32, 12);
    const wallCols = sw >= 3 ? DARKSTONE : STONE;
    // keep behind
    c.fillStyle = hgrad(c, -14, 14, ['#e0c8a0', '#c8a878', '#9a7a50']); c.fillRect(-14, -34, 28, 18); c.strokeStyle = OUT; c.lineWidth = 1.4; c.strokeRect(-14, -34, 28, 18);
    c.strokeStyle = '#6b4424'; c.lineWidth = 1.6; for (const x of [-14, -5, 5, 14]) { c.beginPath(); c.moveTo(x, -34); c.lineTo(x, -16); c.stroke(); }
    c.beginPath(); c.moveTo(-14, -25); c.lineTo(14, -25); c.stroke();
    window(c, -9.5, -32, 4, 5, '#ffd27a'); window(c, 9.5, -32, 4, 5, '#ffd27a');
    c.beginPath(); c.moveTo(-17, -33); c.lineTo(0, -46); c.lineTo(17, -33); c.closePath(); c.fillStyle = hgrad(c, -17, 17, sw >= 3 ? ['#6a7a9a', '#4a5a7a', '#2e3a54'] : ['#d8644a', '#b8432f', '#7a2a1a']); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-17 + i * 4.2, -33 - i * 3.2); c.lineTo(17 - i * 4.2, -33 - i * 3.2); c.stroke(); }
    flag(c, 0, -46, 14, ra >= 3 ? '#2fa83c' : t >= 5 ? '#ffd23a' : '#c94a3a', p.time);
    // curtain wall
    c.fillStyle = hgrad(c, -24, 24, wallCols); c.fillRect(-24, -16, 48, 18); c.strokeStyle = OUT; c.lineWidth = 1.5; c.strokeRect(-24, -16, 48, 18);
    c.strokeStyle = 'rgba(40,28,20,0.28)'; c.lineWidth = 0.8;
    for (let y = -12, row = 0; y < 2; y += 4.5, row++) { c.beginPath(); c.moveTo(-24, y); c.lineTo(24, y); c.stroke(); for (let x = -24 + (row % 2) * 4; x < 24; x += 8) { c.beginPath(); c.moveTo(x, y - 4.5); c.lineTo(x, y); c.stroke(); } }
    for (let i = 0; i < 7; i++) { c.fillStyle = wallCols[1]; c.fillRect(-24 + i * 7.3, -20, 4.4, 4); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(-24 + i * 7.3, -20, 4.4, 4); }
    // gate
    c.fillStyle = '#2a1a10'; c.beginPath(); c.moveTo(-6, 2); c.lineTo(-6, -7); c.arc(0, -7, 6, Math.PI, 0); c.lineTo(6, 2); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
    c.strokeStyle = '#7a8494'; c.lineWidth = 0.9; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 2.4, -12); c.lineTo(i * 2.4, 2); c.stroke(); } for (const yy of [-8, -4, 0]) { c.beginPath(); c.moveTo(-6, yy); c.lineTo(6, yy); c.stroke(); }
    // corner towers
    for (const tx of [-24, 24]) {
      c.save(); c.translate(tx, 0);
      cylinder(c, 7, t >= 3 ? -30 : -24, 3, wallCols);
      if (t >= 3) cone(c, 7, t >= 3 ? -30 : -24, 13, sw >= 3 ? '#4a5a7a' : '#b8432f', sw >= 3 ? '#2e3a54' : '#7a2a1a', sw >= 3 ? '#6a7a9a' : '#d8644a');
      else { disc(c, 7, -24, wallCols[1]); crenels(c, 7, -24, 3, wallCols, false); crenels(c, 7, -24, 3, wallCols, true); }
      c.fillStyle = '#2a1a10'; c.fillRect(-1, -18, 2, 5);
      c.restore();
    }
    if (wm >= 1) { c.strokeStyle = '#6b4424'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(12, 1); c.lineTo(16, -9); c.stroke(); c.fillStyle = '#dfe6ee'; c.beginPath(); c.moveTo(16, -9); c.lineTo(17, -12.5); c.lineTo(15, -10); c.fill(); c.fillStyle = '#c94a3a'; c.beginPath(); c.arc(-14, -4, 3, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke(); }
  },
  figures: () => [],
};

const mage: Building = {
  back: (c, p) => {
    const [pyro, arc, met] = p.tiers;
    const roof = arc >= 3 ? ['#5a8ae8', '#2f4fb8', '#1a2a6a'] : met >= 3 ? ['#ff9a4a', '#d8642a', '#7a2a10'] : ['#d84a4a', '#a02a2a', '#5a1414'];
    const glow = arc >= 2 ? '#9fe0ff' : '#ffb02e';
    shadow(c, 20, 8);
    cylinder(c, 13, -30, 2, DARKSTONE);
    // rune band + glowing windows
    c.strokeStyle = glow; c.lineWidth = 1; c.globalAlpha = 0.7 + Math.sin(p.time * 3) * 0.2; c.beginPath(); c.ellipse(0, -10, 13, 5, 0, 0.2, Math.PI - 0.2); c.stroke(); c.globalAlpha = 1;
    window(c, -5, -24, 4, 7, glow); window(c, 5, -22, 4, 7, glow);
    c.fillStyle = '#2a1a10'; c.beginPath(); c.moveTo(-3.5, 2.8); c.lineTo(-3.5, -3); c.arc(0, -3, 3.5, Math.PI, 0); c.lineTo(3.5, 2.8); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
    // upper tower + roof
    cylinder(c, 10, -56, -30, DARKSTONE);
    disc(c, 15, -31, '#5a5466');
    window(c, 0, -50, 4, 6, glow);
    cone(c, 11, -56, 26, roof[1], roof[2], roof[0]);
    c.fillStyle = '#e8c45a'; c.beginPath(); c.arc(0, -83, 1.8, 0, TAU); c.fill();
    if (pyro >= 1) { const f = 3 + Math.sin(p.time * 10) * 0.8; c.fillStyle = 'rgba(255,170,40,0.85)'; c.beginPath(); c.ellipse(0, -87 - f * 0.6, f * 0.8, f * 1.4, 0, 0, TAU); c.fill(); }
    if (arc >= 3) { const y = -94 + Math.sin(p.time * 2) * 2; c.fillStyle = '#bfefff'; c.beginPath(); c.moveTo(0, y - 6); c.lineTo(3, y); c.lineTo(0, y + 6); c.lineTo(-3, y); c.closePath(); c.fill(); c.strokeStyle = '#2f4fb8'; c.lineWidth = 1; c.stroke(); }
    if (met >= 3) { const a = p.time * 1.5; for (let i = 0; i < 2; i++) { const aa = a + i * Math.PI; c.fillStyle = '#6a4a3a'; c.beginPath(); c.arc(Math.cos(aa) * 18, -60 + Math.sin(aa) * 5, 3, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke(); c.fillStyle = '#ff9a2a'; c.beginPath(); c.arc(Math.cos(aa) * 18 - 1, -61 + Math.sin(aa) * 5, 1.2, 0, TAU); c.fill(); } }
  },
  figures: () => [{ x: 6, y: -31, s: 0.78 }],
  front: (c) => { railing(c, 15, -31, 4, true, '#5a5466'); },
};

const druid: Building = {
  back: (c, p) => {
    const [deep, wild, bliz] = p.tiers;
    shadow(c, 24, 9);
    // mossy/snowy ground circle
    disc(c, 20, 0, wild >= 2 ? '#4a7a3a' : '#dceaf4', 0.38, false);
    // standing stones
    const stone = (x: number, y: number, h: number, w: number) => {
      c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w / 2 + 1, y - h); c.quadraticCurveTo(x, y - h - 3, x + w / 2 - 1, y - h); c.lineTo(x + w / 2, y); c.closePath();
      c.fillStyle = hgrad(c, x - w / 2, x + w / 2, ['#b8b8c4', '#8a8a98', '#5a5a68']); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
      c.strokeStyle = deep >= 2 || bliz >= 2 ? '#9fe8ff' : wild >= 2 ? '#7fd06a' : '#9fe8ff'; c.lineWidth = 1; c.globalAlpha = 0.6 + Math.sin(p.time * 2 + x) * 0.3;
      c.beginPath(); c.moveTo(x - 1.5, y - h * 0.7); c.lineTo(x + 1.5, y - h * 0.55); c.lineTo(x - 1, y - h * 0.4); c.stroke(); c.globalAlpha = 1;
      if (wild < 2) { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, y - h - 0.5, w / 2, 1.8, 0, 0, TAU); c.fill(); }
      else { c.fillStyle = '#5aa04a'; c.beginPath(); c.ellipse(x - 1, y - h * 0.3, w / 2.5, 2, 0, 0, TAU); c.fill(); }
    };
    stone(-15, -2, 20, 7); stone(15, -2, 22, 7); stone(-6, -7, 26, 7); stone(7, -7, 24, 7);
    // lintel
    c.fillStyle = hgrad(c, -10, 10, ['#b8b8c4', '#8a8a98', '#5a5a68']); c.fillRect(-10, -36, 21, 5); c.strokeStyle = OUT; c.lineWidth = 1.2; c.strokeRect(-10, -36, 21, 5);
    if (wild >= 2) {
      // gnarled sacred tree
      c.strokeStyle = OUT; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(-4, -22, 2, -38); c.stroke(); c.strokeStyle = '#6b4a2a'; c.lineWidth = 3.4; c.stroke();
      for (const [x, y, r] of [[2, -44, 9], [-7, -40, 7], [9, -39, 7], [-2, -50, 6]]) { c.fillStyle = '#1a3812'; c.beginPath(); c.arc(x, y, r + 1.4, 0, TAU); c.fill(); }
      for (const [x, y, r] of [[2, -44, 9], [-7, -40, 7], [9, -39, 7], [-2, -50, 6]]) { c.fillStyle = '#3f8a2e'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = '#7ec04e'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, TAU); c.fill(); }
    } else {
      // floating ice crystal
      const y = -24 + Math.sin(p.time * 1.6) * 2;
      const g = c.createRadialGradient(0, y, 1, 0, y, 16); g.addColorStop(0, 'rgba(180,240,255,0.7)'); g.addColorStop(1, 'rgba(180,240,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, y, 16, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(0, y - 11); c.lineTo(5, y - 2); c.lineTo(2.5, y + 8); c.lineTo(-2.5, y + 8); c.lineTo(-5, y - 2); c.closePath(); c.fillStyle = '#7fd8f0'; c.fill(); c.strokeStyle = '#1e4a6a'; c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.moveTo(0, y - 11); c.lineTo(-5, y - 2); c.lineTo(-2.5, y + 8); c.lineTo(0, y + 8); c.closePath(); c.fillStyle = '#d8f8ff'; c.fill();
    }
  },
  figures: () => [{ x: 0, y: 4, s: 0.95 }],
  front: (c, p) => {
    if (p.tiers[2] >= 2) { for (let i = 0; i < 10; i++) { const a = p.time * 1.5 + i * 0.63; c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(Math.cos(a) * 22, -14 + Math.sin(a) * 8 + Math.sin(a * 3) * 3, 1.3, 0, TAU); c.fill(); } }
  },
};

const cannon: Building = {
  back: (c, p) => {
    const t = top(p);
    shadow(c, 26, 10);
    // octagonal stone bastion
    const pts = [[-20, 0], [-14, 5], [14, 5], [20, 0], [20, -16], [14, -21], [-14, -21], [-20, -16]];
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    c.fillStyle = hgrad(c, -20, 20, DARKSTONE.slice(0, 3).concat(['#3e3848'])); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    // facets
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(-20, 0); c.lineTo(-14, 5); c.lineTo(-14, -16); c.lineTo(-20, -16); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.moveTo(20, 0); c.lineTo(14, 5); c.lineTo(14, -16); c.lineTo(20, -16); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8; for (const yy of [-11, -6, -1]) { c.beginPath(); c.moveTo(-20, yy); c.lineTo(-14, yy + 4.5); c.lineTo(14, yy + 4.5); c.lineTo(20, yy); c.stroke(); }
    // iron bands with rivets
    c.strokeStyle = '#2a2a30'; c.lineWidth = 2; c.beginPath(); c.moveTo(-20, -14); c.lineTo(-14, -10); c.lineTo(14, -10); c.lineTo(20, -14); c.stroke();
    for (let i = -3; i <= 3; i++) { c.fillStyle = '#c9a35b'; c.beginPath(); c.arc(i * 4.5, -10, 0.9, 0, TAU); c.fill(); }
    // door with dwarven rune
    c.fillStyle = '#3a2414'; c.fillRect(-4, -6, 8, 11); c.strokeStyle = OUT; c.lineWidth = 1.2; c.strokeRect(-4, -6, 8, 11);
    c.strokeStyle = '#e8a030'; c.lineWidth = 1; c.beginPath(); c.moveTo(-2, -3); c.lineTo(0, 0); c.lineTo(2, -3); c.moveTo(0, 0); c.lineTo(0, 3); c.stroke();
    // top platform
    c.beginPath(); c.moveTo(-20, -16); c.lineTo(-14, -21); c.lineTo(14, -21); c.lineTo(20, -16); c.lineTo(14, -12); c.lineTo(-14, -12); c.closePath(); c.fillStyle = '#6a6476'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
    // back merlons
    for (let i = 0; i < 5; i++) { const x = -14 + i * 7; c.fillStyle = DARKSTONE[1]; c.fillRect(x - 2, -25, 4, 4); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(x - 2, -25, 4, 4); }
    // powder kegs
    for (const kx of [-16, -11]) { c.fillStyle = '#8a5a2e'; c.beginPath(); c.ellipse(kx, -16, 2.6, 3.2, 0, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke(); c.strokeStyle = '#3a3a44'; c.beginPath(); c.moveTo(kx - 2.6, -16); c.lineTo(kx + 2.6, -16); c.stroke(); }
    if (t >= 5) { c.fillStyle = '#e8c45a'; for (const x of [-20, 20]) { c.beginPath(); c.arc(x, -16, 2, 0, TAU); c.fill(); } }
  },
  figures: () => [{ x: 3, y: -14, s: 0.95 }],
  front: (c) => {
    for (let i = 0; i < 4; i++) { const x = -15 + i * 10; c.fillStyle = hgrad(c, x - 2.5, x + 2.5, [DARKSTONE[0], DARKSTONE[2]]); c.fillRect(x - 2.5, -16, 5, 4.5); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(x - 2.5, -16, 5, 4.5); }
  },
};

const ballista: Building = {
  back: (c, p) => {
    const t = top(p);
    shadow(c, 26, 10);
    // square stone platform seen in 3/4
    c.beginPath(); c.moveTo(-20, -6); c.lineTo(0, -14); c.lineTo(20, -6); c.lineTo(0, 2); c.closePath(); c.fillStyle = t >= 3 ? '#a08060' : '#9a8f80'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.moveTo(-20, -6); c.lineTo(0, 2); c.lineTo(0, 10); c.lineTo(-20, 2); c.closePath(); c.fillStyle = hgrad(c, -20, 0, [STONE[0], STONE[1]]); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(20, -6); c.lineTo(0, 2); c.lineTo(0, 10); c.lineTo(20, 2); c.closePath(); c.fillStyle = hgrad(c, 0, 20, [STONE[2], STONE[3]]); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-20 + i * 5, -6 + i * 2 + 2); c.lineTo(-20 + i * 5, -6 + i * 2 + 10); c.stroke(); c.beginPath(); c.moveTo(20 - i * 5, -6 + i * 2 + 2); c.lineTo(20 - i * 5, -6 + i * 2 + 10); c.stroke(); }
    // plank deck
    c.save(); c.beginPath(); c.moveTo(-17, -6); c.lineTo(0, -12.5); c.lineTo(17, -6); c.lineTo(0, 0.5); c.closePath(); c.clip();
    c.fillStyle = '#a06a3a'; c.fillRect(-20, -15, 40, 18);
    c.strokeStyle = 'rgba(40,20,8,0.4)'; c.lineWidth = 0.8; for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(i * 3.5 - 10, -16); c.lineTo(i * 3.5 + 10, 4); c.stroke(); }
    c.restore();
    // bolt rack
    c.strokeStyle = '#6b4424'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-14 + i * 2, -5); c.lineTo(-8 + i * 2, -9); c.stroke(); }
    if (p.tiers[2] >= 4) { c.fillStyle = '#8a5a2e'; c.fillRect(10, -10, 7, 5); c.strokeStyle = OUT; c.lineWidth = 0.8; c.strokeRect(10, -10, 7, 5); c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(13.5, -10.5, 1.5, 0, TAU); c.fill(); }
  },
  figures: () => [{ x: 0, y: -2, s: 1.15 }],
};

const alchemist: Building = {
  back: (c, p) => {
    const gold = p.tiers[2];
    shadow(c, 26, 10);
    // cottage (left/back)
    c.save(); c.translate(-8, -4);
    c.fillStyle = hgrad(c, -12, 12, ['#e8dcc0', '#cbb894', '#9a8660']); c.fillRect(-12, -18, 24, 18); c.strokeStyle = OUT; c.lineWidth = 1.4; c.strokeRect(-12, -18, 24, 18);
    c.strokeStyle = '#6b4424'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-12, -9); c.lineTo(12, -9); c.moveTo(-4, -18); c.lineTo(-4, 0); c.moveTo(-12, -18); c.lineTo(-4, -9); c.stroke();
    window(c, 5, -16, 5, 6, gold >= 2 ? '#ffe28a' : '#b6ff8a');
    c.fillStyle = '#3a2414'; c.fillRect(-10, -7, 5, 7);
    c.beginPath(); c.moveTo(-15, -17); c.lineTo(-6, -30); c.lineTo(10, -30); c.lineTo(15, -17); c.closePath(); c.fillStyle = hgrad(c, -15, 15, ['#7a8a5a', '#5a6a3a', '#3a4a20']); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-15 + i * 2, -17 - i * 3.2); c.lineTo(15 - i * 1.4, -17 - i * 3.2); c.stroke(); }
    // crooked chimney
    c.save(); c.translate(6, -30); c.rotate(0.12); c.fillStyle = hgrad(c, -2.5, 2.5, ['#c9c0b0', '#8a8172']); c.fillRect(-2.5, -9, 5, 10); c.strokeStyle = OUT; c.lineWidth = 1.1; c.strokeRect(-2.5, -9, 5, 10); c.restore();
    c.restore();
    // potion shelf crate
    c.fillStyle = '#8a5a2e'; c.fillRect(8, -10, 12, 8); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(8, -10, 12, 8);
    const cols = ['#8eff3a', '#ff5ad2', '#5ab8ff', '#ffd23a'];
    for (let i = 0; i < 4; i++) { c.fillStyle = cols[i]; c.beginPath(); c.arc(9.8 + i * 2.8, -12.4, 1.4, 0, TAU); c.fill(); c.fillStyle = '#c9e8ff'; c.fillRect(9.3 + i * 2.8, -15, 1, 1.6); }
    // chimney smoke (colored)
    const smoke = gold >= 2 ? '255,220,90' : p.tiers[1] >= 2 ? '255,90,210' : '140,255,90';
    for (let i = 0; i < 4; i++) { const t = (p.time * 0.5 + i / 4) % 1; c.fillStyle = `rgba(${smoke},${0.45 * (1 - t)})`; c.beginPath(); c.arc(-1 + Math.sin(t * 5 + i) * 3, -46 - t * 18, 2.5 + t * 4, 0, TAU); c.fill(); }
  },
  figures: () => [{ x: 6, y: 4, s: 1.0 }],
};

const bard: Building = {
  back: (c, p) => {
    const [anth, ins, thr] = p.tiers;
    shadow(c, 24, 9);
    // round wooden stage
    plankRing(c, 18, -6, 1, WOOD);
    disc(c, 18, -6, '#c48a52');
    c.strokeStyle = 'rgba(60,30,10,0.35)'; c.lineWidth = 0.8; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 5, -12.5); c.lineTo(i * 5, 0.5); c.stroke(); }
    // back poles
    for (const px of [-15, 15]) { c.strokeStyle = OUT; c.lineWidth = 2.6; c.beginPath(); c.moveTo(px, -9); c.lineTo(px, -40); c.stroke(); c.strokeStyle = '#a06a3a'; c.lineWidth = 1.4; c.stroke(); }
    // bunting
    const bun = thr >= 2 ? ['#ffd23a', '#2f7a4a'] : ins >= 2 ? ['#5ab8ff', '#ffffff'] : ['#c94a3a', '#ffd23a'];
    c.strokeStyle = '#4a2e18'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-15, -34); c.quadraticCurveTo(0, -28, 15, -34); c.stroke();
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6; const x = -15 + 30 * t, y = -34 + Math.sin(t * Math.PI) * 6 * 0.5 + 3 * Math.sin(t * Math.PI); c.fillStyle = bun[i % 2]; c.beginPath(); c.moveTo(x - 2, y - 1); c.lineTo(x + 2, y - 1); c.lineTo(x, y + 3); c.closePath(); c.fill(); }
    if (anth >= 3) { c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(-15, -41, 2, 0, TAU); c.arc(15, -41, 2, 0, TAU); c.fill(); }
  },
  figures: () => [{ x: 0, y: -4, s: 1.0 }],
  front: (c, p) => {
    const [anth, ins, thr] = p.tiers;
    const stripes = thr >= 2 ? ['#2f7a4a', '#ffd23a'] : ins >= 2 ? ['#2f4f9a', '#ffffff'] : anth >= 3 ? ['#7a3fbf', '#ffd23a'] : ['#c94a3a', '#f2ead6'];
    // front poles
    for (const px of [-10, 10]) { c.strokeStyle = OUT; c.lineWidth = 2.6; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, -40); c.stroke(); c.strokeStyle = '#a06a3a'; c.lineWidth = 1.4; c.stroke(); }
    // striped tent canopy
    const yb = -40, h = 16, r = 20;
    c.save(); c.beginPath(); c.moveTo(-r, yb); c.quadraticCurveTo(0, yb + 6, r, yb); c.lineTo(0, yb - h); c.closePath(); c.clip();
    for (let i = -4; i <= 4; i++) { c.fillStyle = stripes[(i + 4) % 2]; c.beginPath(); c.moveTo(0, yb - h); c.lineTo(i * 5 - 2.5, yb + 6); c.lineTo(i * 5 + 2.5, yb + 6); c.closePath(); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(6, yb - h, 20, h + 8);
    c.restore();
    c.beginPath(); c.moveTo(-r, yb); c.quadraticCurveTo(0, yb + 6, r, yb); c.lineTo(0, yb - h); c.closePath(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    // scalloped valance
    for (let i = 0; i < 8; i++) { const x = -r + (i + 0.5) * (2 * r / 8); const y = yb + Math.sin(((i + 0.5) / 8) * Math.PI) * 3; c.fillStyle = stripes[i % 2]; c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.6; c.stroke(); }
    c.fillStyle = '#e8c45a'; c.beginPath(); c.arc(0, yb - h - 1, 1.8, 0, TAU); c.fill();
    flag(c, 0, yb - h, 9, stripes[0], p.time);
  },
};

const mine: Building = {
  back: (c, p) => {
    const [deep, bank, over] = p.tiers;
    shadow(c, 30, 11);
    // rocky hill
    c.beginPath(); c.moveTo(-28, 4); c.quadraticCurveTo(-30, -16, -16, -26); c.quadraticCurveTo(-4, -36, 10, -30); c.quadraticCurveTo(26, -22, 28, 4); c.closePath();
    c.fillStyle = hgrad(c, -28, 28, ['#c0ad90', '#9a8668', '#6e5c44']); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(-24, -10); c.quadraticCurveTo(-20, -24, -8, -30); c.quadraticCurveTo(-14, -20, -18, -6); c.closePath(); c.fill();
    c.fillStyle = '#5a9a3a'; for (const [x, y] of [[-20, -18], [16, -22], [-6, -32]]) { c.beginPath(); c.arc(x, y, 3.2, 0, TAU); c.arc(x + 3, y + 1, 2.4, 0, TAU); c.fill(); }
    // entrance
    c.fillStyle = '#140c08'; c.beginPath(); c.moveTo(-9, 4); c.lineTo(-9, -9); c.quadraticCurveTo(0, -17, 9, -9); c.lineTo(9, 4); c.closePath(); c.fill();
    for (let i = 0; i < 3 + deep * 2; i++) { const tw = (Math.sin(p.time * 3 + i * 2) + 1) / 2; c.fillStyle = `rgba(255,215,80,${0.35 + tw * 0.65})`; c.beginPath(); c.arc(-5 + ((i * 2.9) % 10), -6 + ((i * 1.7) % 8), 0.7 + tw * 0.6, 0, TAU); c.fill(); }
    // timber frame
    const beam = (x1: number, y1: number, x2: number, y2: number, w: number) => { c.strokeStyle = OUT; c.lineWidth = w + 1.6; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = '#8a5a2e'; c.lineWidth = w; c.stroke(); };
    beam(-10, 5, -10, -11, 3); beam(10, 5, 10, -11, 3); beam(-13, -12, 13, -12, 3.4);
    // headframe with pulley wheel
    beam(-6, -12, 0, -42, 2); beam(6, -12, 0, -42, 2); beam(-4, -24, 4, -24, 1.6);
    c.save(); c.translate(0, -42); c.rotate(p.time * 1.5);
    c.strokeStyle = OUT; c.lineWidth = 2.4; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.stroke(); c.strokeStyle = '#6a6a72'; c.lineWidth = 1.4; c.stroke();
    for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.stroke(); }
    c.restore();
    c.strokeStyle = '#3a3a3a'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(4, -40); c.lineTo(5, -10); c.stroke();
    // lantern
    c.fillStyle = `rgba(255,210,80,${0.2 + Math.sin(p.time * 4) * 0.06})`; c.beginPath(); c.arc(12, -9, 7, 0, TAU); c.fill();
    c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(12, -9, 1.8, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.7; c.stroke();
    // rails + minecart full of gold
    c.strokeStyle = '#5a5a62'; c.lineWidth = 1; c.beginPath(); c.moveTo(-26, 9); c.lineTo(0, 6); c.moveTo(-26, 12); c.lineTo(0, 9); c.stroke();
    c.save(); c.translate(-16, 6);
    c.beginPath(); c.moveTo(-7, -6); c.lineTo(7, -6); c.lineTo(5.5, 2); c.lineTo(-5.5, 2); c.closePath(); c.fillStyle = hgrad(c, -7, 7, ['#9aa4b0', '#6a6a72', '#3a3a44']); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.1; c.stroke();
    for (let i = 0; i < 6 + Math.min(6, deep * 2); i++) { const gx = -5 + (i % 5) * 2.5, gy = -6.5 - Math.floor(i / 5) * 1.8; c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(gx, gy, 1.5, 0, TAU); c.fill(); c.strokeStyle = '#a8780a'; c.lineWidth = 0.5; c.stroke(); }
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(-3.5, 2.5, 1.6, 0, TAU); c.arc(3.5, 2.5, 1.6, 0, TAU); c.fill();
    c.restore();
    if (bank >= 1) { c.save(); c.translate(19, -2); c.fillStyle = hgrad(c, -6, 6, ['#b8c0c8', '#7a8494', '#4a5262']); c.fillRect(-6, -10, 12, 12); c.strokeStyle = OUT; c.lineWidth = 1.2; c.strokeRect(-6, -10, 12, 12); c.beginPath(); c.arc(0, -4, 3.5, 0, TAU); c.stroke(); c.strokeStyle = '#c9a35b'; c.beginPath(); c.moveTo(-2.5, -4); c.lineTo(2.5, -4); c.moveTo(0, -6.5); c.lineTo(0, -1.5); c.stroke(); c.restore(); }
    if (over >= 1) flag(c, -22, -20, 14, over >= 3 ? '#ffd23a' : '#2f6fd6', p.time);
  },
  figures: () => [],
};

const hero: Building = {
  back: (c, p) => {
    shadow(c, 16, 6, 3, 3);
    const g = 0.45 + Math.sin(p.time * 2.5) * 0.15;
    c.strokeStyle = `rgba(255,226,122,${g})`; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 2, 15, 5.6, 0, 0, TAU); c.stroke();
    c.strokeStyle = `rgba(255,226,122,${g * 0.5})`; c.lineWidth = 4; c.beginPath(); c.ellipse(0, 2, 17, 6.4, 0, 0, TAU); c.stroke();
  },
  figures: () => [{ x: 0, y: -2, s: 1.45 }],
};

export const BUILDINGS: Record<string, Building> = { archer, knight, barracks, mage, druid, cannon, ballista, alchemist, bard, mine, aldric: hero, lyra: hero, grimbeard: hero };
