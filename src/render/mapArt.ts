// Painted map backgrounds in a hand-painted style:
// noise-textured terrain, textured roads with ruts and edge stones, framing foliage,
// water with banks, lava, crystals and set pieces. Light comes from the top-left.
import type { MapDef, Obstacle } from '../core/maps';
import { PATH_WIDTH, distToPath } from '../core/maps';
import type { Vec } from '../core/types';
import { WORLD_H, WORLD_W } from '../core/types';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const OUT = '#2a1d16';

// ---------------------------------------------------------------- noise
function hash(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 4) { let t = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * amp; f *= 2; amp *= 0.5; } return t / 0.9375; }
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(stops: string[], t: number) {
  t = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(t), f = t - i, a = hex(stops[i]), b = hex(stops[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
/** Low-res noise texture upscaled for a soft painted look. */
function noiseCanvas(w: number, h: number, scale: number, seed: number, stops: string[], detail = 0.35) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!; const img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const n = fbm(i / scale, j / scale, seed) * (1 - detail) + vnoise(i / 2.2, j / 2.2, seed + 99) * detail;
    const [r, g, b] = ramp(stops, n);
    const k = (j * w + i) * 4; img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return cv;
}

interface Theme {
  ground: string[]; dirt: string[]; edge: string; road: 'dirt' | 'cobble' | 'flag' | 'basalt';
  tuft?: string; tuftDark?: string; decal: (c: C, x: number, y: number, r: () => number) => void;
}
const THEMES: Record<string, Theme> = {
  meadow: {
    ground: ['#3f8a2e', '#55a83c', '#6fbf4c', '#8fd462'], dirt: ['#9a6e3e', '#c29560', '#dcb47c', '#b08050'], edge: '#7a5530', road: 'dirt', tuft: '#5fae46', tuftDark: '#3f8a30',
    decal: (c, x, y, r) => { const k = r(); if (k < 0.45) flowers(c, x, y, r); else if (k < 0.8) grass(c, x, y, '#4a9636', r); else pebble(c, x, y, r, '#a9a091'); },
  },
  caverns: {
    ground: ['#262a44', '#323858', '#3e466c', '#4a5480'], dirt: ['#7d6f95', '#8f82a8', '#a093b8', '#857898'], edge: '#3a3050', road: 'flag',
    decal: (c, x, y, r) => { const k = r(); if (k < 0.35) glowSpeck(c, x, y, r); else if (k < 0.7) pebble(c, x, y, r, '#5a6288'); else tinyCrystal(c, x, y, r); },
  },
  ember: {
    ground: ['#2e2220', '#3e2c26', '#4e3830', '#5e4434'], dirt: ['#3a3030', '#4a3c38', '#584640', '#433836'], edge: '#1e1614', road: 'basalt',
    decal: (c, x, y, r) => { const k = r(); if (k < 0.18) crack(c, x, y, r); else if (k < 0.6) pebble(c, x, y, r, '#2a201c'); else if (k < 0.66) bones(c, x, y, r); else ash(c, x, y, r); },
  },
  summit: {
    ground: ['#c9d8e6', '#dce7f1', '#eef4fa', '#ffffff'], dirt: ['#7d8794', '#8d97a4', '#9da7b2', '#88919c'], edge: '#4e5864', road: 'cobble',
    decal: (c, x, y, r) => { const k = r(); if (k < 0.5) snowDrift(c, x, y, r); else if (k < 0.8) pebble(c, x, y, r, '#8a96a3'); else grass(c, x, y, '#5a7a6a', r); },
  },
};

// ---------------------------------------------------------------- small decals
function flowers(c: C, x: number, y: number, r: () => number) {
  const col = ['#ffffff', '#ffe066', '#ff8fb8', '#c9a2ff', '#ff6a5a'][Math.floor(r() * 5)];
  for (let i = 0; i < 4; i++) { const fx = x + (r() - 0.5) * 12, fy = y + (r() - 0.5) * 8; c.fillStyle = 'rgba(30,80,20,0.35)'; c.beginPath(); c.arc(fx + 0.5, fy + 0.8, 1.8, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(fx, fy, 1.6, 0, TAU); c.fill(); c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(fx, fy, 0.6, 0, TAU); c.fill(); }
}
function grass(c: C, x: number, y: number, col: string, r: () => number) {
  c.strokeStyle = col; c.lineWidth = 1.2; c.lineCap = 'round';
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.1; const l = 4 + r() * 4; c.beginPath(); c.moveTo(x + (i - 2) * 1.5, y); c.quadraticCurveTo(x + (i - 2) * 1.5 + Math.cos(a) * l * 0.4, y + Math.sin(a) * l * 0.6, x + (i - 2) * 1.5 + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
}
function pebble(c: C, x: number, y: number, r: () => number, col: string) {
  const s = 1.5 + r() * 2.5;
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 1, y + 1, s, s * 0.7, 0, 0, TAU); c.fill();
  c.fillStyle = col; c.beginPath(); c.ellipse(x, y, s, s * 0.7, r(), 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.25, s * 0.4, s * 0.25, 0, 0, TAU); c.fill();
}
function glowSpeck(c: C, x: number, y: number, r: () => number) { const g = c.createRadialGradient(x, y, 0, x, y, 6); g.addColorStop(0, 'rgba(140,240,255,0.7)'); g.addColorStop(1, 'rgba(140,240,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill(); void r; }
function tinyCrystal(c: C, x: number, y: number, r: () => number) { const h = 4 + r() * 5; c.fillStyle = '#7fd8f0'; c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + 2, y); c.lineTo(x - 2, y); c.fill(); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x - 0.4, y - h + 1, 0.8, h - 2); }
function crack(c: C, x: number, y: number, r: () => number) {
  c.strokeStyle = 'rgba(255,110,30,0.55)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y);
  let px = x, py = y; for (let i = 0; i < 4; i++) { px += 3 + r() * 6; py += (r() - 0.5) * 8; c.lineTo(px, py); } c.stroke();
  c.strokeStyle = 'rgba(255,220,120,0.5)'; c.lineWidth = 0.6; c.stroke();
}
function bones(c: C, x: number, y: number, r: () => number) { c.strokeStyle = '#e8dcc0'; c.lineWidth = 1.6; c.lineCap = 'round'; const a = r() * TAU; c.beginPath(); c.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5); c.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); c.stroke(); c.fillStyle = '#e8dcc0'; c.beginPath(); c.arc(x + 6, y + 2, 2.6, 0, TAU); c.fill(); c.fillStyle = '#3a2a24'; c.fillRect(x + 5, y + 1.5, 0.9, 0.9); c.fillRect(x + 6.6, y + 1.5, 0.9, 0.9); }
function ash(c: C, x: number, y: number, r: () => number) { c.fillStyle = 'rgba(40,30,30,0.35)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + (r() - 0.5) * 16, y + (r() - 0.5) * 10, 2 + r() * 3, 0, TAU); c.fill(); } }
function snowDrift(c: C, x: number, y: number, r: () => number) { c.fillStyle = 'rgba(160,185,215,0.35)'; c.beginPath(); c.ellipse(x + 1, y + 2, 10 + r() * 8, 3, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.ellipse(x, y, 9 + r() * 8, 3, 0, 0, TAU); c.fill(); }

// ---------------------------------------------------------------- set pieces / obstacles
function shadow(c: C, x: number, y: number, rx: number, ry: number, a = 0.28) { c.fillStyle = `rgba(0,0,0,${a})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }

interface Leaf { dark: string; mid: string; light: string; hi: string; out: string }
const LEAVES: Leaf[] = [
  { dark: '#2c5e22', mid: '#3f8a2e', light: '#62ad3e', hi: '#9bd65a', out: '#1a3812' }, // oak
  { dark: '#2f6a3a', mid: '#46914a', light: '#6cb85a', hi: '#a6e07a', out: '#173a1e' }, // linden
  { dark: '#7a3a12', mid: '#c4621e', light: '#e8952e', hi: '#ffcf5a', out: '#3e1a08' }, // autumn
  { dark: '#4a6e1e', mid: '#6f9a2a', light: '#9cc43a', hi: '#d2ea6a', out: '#26380e' }, // birch
];

function bark(c: C, x: number, yTop: number, yBot: number, wTop: number, wBot: number, light: string, dark: string) {
  c.beginPath();
  c.moveTo(x - wBot * 0.5 - wBot * 0.35, yBot + 1.5);
  c.quadraticCurveTo(x - wBot * 0.5, yBot - 1, x - wBot * 0.45, yBot - (yBot - yTop) * 0.3);
  c.lineTo(x - wTop * 0.5, yTop);
  c.lineTo(x + wTop * 0.5, yTop);
  c.lineTo(x + wBot * 0.45, yBot - (yBot - yTop) * 0.3);
  c.quadraticCurveTo(x + wBot * 0.5, yBot - 1, x + wBot * 0.5 + wBot * 0.4, yBot + 1.5);
  c.closePath();
  const g = c.createLinearGradient(x - wBot, 0, x + wBot, 0); g.addColorStop(0, light); g.addColorStop(0.55, dark); g.addColorStop(1, '#2a1a10');
  c.fillStyle = g; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
}

/** Painted deciduous tree: tapered trunk + forked branches + lobed, shaded canopy with leaf texture. */
function tree(c: C, o: Obstacle, r: () => number) {
  const s = o.r * 1.05, x = o.x, y = o.y + s * 0.55;
  const k = r();
  const L = k < 0.55 ? LEAVES[0] : k < 0.78 ? LEAVES[1] : k < 0.9 ? LEAVES[3] : LEAVES[2];
  const birch = L === LEAVES[3];
  const cx = x + (r() - 0.5) * s * 0.15, cy = y - s * 1.25, rx = s * (0.95 + r() * 0.15), ry = s * (0.82 + r() * 0.12);
  // ground shadow cast to bottom-right
  const sg = c.createRadialGradient(x + s * 0.55, y + s * 0.05, 1, x + s * 0.55, y + s * 0.05, s * 1.3);
  sg.addColorStop(0, 'rgba(0,0,0,0.32)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg; c.beginPath(); c.ellipse(x + s * 0.55, y + s * 0.05, s * 1.35, s * 0.55, 0, 0, TAU); c.fill();
  // trunk + branches
  const tl = birch ? '#f2efe6' : '#8a5a34', td = birch ? '#b8b2a4' : '#5a3a20';
  bark(c, x, cy + ry * 0.2, y, s * 0.16, s * 0.3, tl, td);
  c.lineCap = 'round';
  for (const side of [-1, 1]) {
    c.strokeStyle = OUT; c.lineWidth = s * 0.12 + 2; c.beginPath(); c.moveTo(x, y - s * 0.5); c.quadraticCurveTo(x + side * s * 0.2, y - s * 0.75, x + side * s * 0.42, cy + ry * 0.15); c.stroke();
    c.strokeStyle = side < 0 ? tl : td; c.lineWidth = s * 0.12; c.stroke();
  }
  if (birch) { c.strokeStyle = '#2a2a2a'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { const yy = y - s * 0.15 - i * s * 0.18; c.beginPath(); c.moveTo(x - s * 0.08, yy); c.lineTo(x + s * 0.04, yy - 1); c.stroke(); } }
  else { c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x - s * 0.04 + i * s * 0.05, y - 2); c.lineTo(x - s * 0.02 + i * s * 0.03, y - s * 0.55); c.stroke(); } }
  // canopy clumps: bumpy rim + fuller interior
  const clumps: [number, number, number][] = [];
  const rim = 13 + Math.floor(r() * 4);
  for (let i = 0; i < rim; i++) {
    const a = (i / rim) * TAU + r() * 0.3;
    const rr = s * (0.2 + r() * 0.1);
    clumps.push([cx + Math.cos(a) * (rx - rr * 0.6), cy + Math.sin(a) * (ry - rr * 0.6) * (Math.sin(a) > 0 ? 0.85 : 1), rr]);
  }
  for (let i = 0; i < 7; i++) clumps.push([cx + (r() - 0.5) * rx * 0.9, cy + (r() - 0.5) * ry * 0.8, s * (0.3 + r() * 0.12)]);
  const dot = (px: number, py: number, pr: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); };
  for (const [px, py, pr] of clumps) dot(px, py, pr + 1.8, L.out);
  for (const [px, py, pr] of clumps) dot(px, py, pr, L.dark);
  // mid tone, nudged toward the light
  for (const [px, py, pr] of clumps) { const lit = (cx - px) / rx * 0.5 + (cy - py) / ry * 0.6; if (lit > -0.55) dot(px - pr * 0.15, py - pr * 0.2, pr * 0.82, L.mid); }
  // light + highlight on the upper-left
  for (const [px, py, pr] of clumps) {
    const lit = (cx - px) / rx * 0.5 + (cy - py) / ry * 0.7;
    if (lit > -0.05) dot(px - pr * 0.25, py - pr * 0.3, pr * 0.58, L.light);
    if (lit > 0.35) dot(px - pr * 0.35, py - pr * 0.42, pr * 0.3, L.hi);
  }
  // leaf texture strokes
  for (let i = 0; i < 70; i++) {
    const a = r() * TAU, d = Math.sqrt(r());
    const px = cx + Math.cos(a) * rx * d * 0.92, py = cy + Math.sin(a) * ry * d * 0.9;
    const lit = (cx - px) / rx * 0.5 + (cy - py) / ry * 0.7;
    c.fillStyle = lit > 0.2 ? L.hi : lit > -0.2 ? L.light : L.dark;
    c.save(); c.translate(px, py); c.rotate(r() * TAU); c.beginPath(); c.ellipse(0, 0, 2.2, 1.1, 0, 0, TAU); c.fill(); c.restore();
  }
  // inner shadow under the crown where it meets the trunk
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(cx + rx * 0.1, cy + ry * 0.55, rx * 0.55, ry * 0.18, 0, 0, TAU); c.fill();
  // fruit / blossoms on some
  if (L === LEAVES[1] && r() < 0.5) for (let i = 0; i < 6; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.8; dot(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 1.8, '#e8403a'); dot(cx + Math.cos(a) * rx * d - 0.6, cy + Math.sin(a) * ry * d - 0.6, 0.6, '#ffb0a0'); }
}

function bush(c: C, o: Obstacle, r: () => number = Math.random) {
  const s = o.r * 0.85, x = o.x, y = o.y + s * 0.3;
  const sg = c.createRadialGradient(x + 4, y + 2, 1, x + 4, y + 2, s * 1.3); sg.addColorStop(0, 'rgba(0,0,0,0.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg; c.beginPath(); c.ellipse(x + 4, y + 2, s * 1.3, s * 0.5, 0, 0, TAU); c.fill();
  const L = LEAVES[r() < 0.7 ? 0 : 1];
  const clumps: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; clumps.push([x + Math.cos(a) * s * 0.85, y - s * 0.35 + Math.sin(a) * s * 0.6, s * (0.32 + r() * 0.1)]); }
  for (let i = 0; i < 4; i++) clumps.push([x + (r() - 0.5) * s, y - s * 0.4 + (r() - 0.5) * s * 0.4, s * 0.42]);
  const dot = (px: number, py: number, pr: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); };
  for (const [px, py, pr] of clumps) dot(px, py, pr + 1.5, L.out);
  for (const [px, py, pr] of clumps) dot(px, py, pr, L.dark);
  for (const [px, py, pr] of clumps) dot(px - pr * 0.2, py - pr * 0.25, pr * 0.72, L.mid);
  for (const [px, py, pr] of clumps) if (py < y - s * 0.3) dot(px - pr * 0.3, py - pr * 0.4, pr * 0.35, L.light);
  for (let i = 0; i < 25; i++) { const px = x + (r() - 0.5) * s * 1.6, py = y - s * 0.4 + (r() - 0.5) * s * 0.8; c.fillStyle = r() < 0.5 ? L.light : L.hi; c.save(); c.translate(px, py); c.rotate(r() * TAU); c.beginPath(); c.ellipse(0, 0, 1.8, 0.9, 0, 0, TAU); c.fill(); c.restore(); }
  if (r() < 0.6) { const col = ['#ff6a8a', '#ffffff', '#ffd23a', '#c9a2ff'][Math.floor(r() * 4)]; for (let i = 0; i < 7; i++) dot(x + (r() - 0.5) * s * 1.4, y - s * 0.45 + (r() - 0.5) * s * 0.6, 1.4, col); }
}

/** Painted conifer with jagged, drooping bough tiers. Snow caps when snowy. */
function pine(c: C, o: Obstacle, r: () => number = Math.random, snowy = true) {
  const s = o.r * 1.1, x = o.x, y = o.y + s * 0.55;
  const sg = c.createRadialGradient(x + s * 0.5, y, 1, x + s * 0.5, y, s * 1.1); sg.addColorStop(0, 'rgba(0,0,0,0.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg; c.beginPath(); c.ellipse(x + s * 0.5, y, s * 1.1, s * 0.4, 0, 0, TAU); c.fill();
  bark(c, x, y - s * 0.6, y, s * 0.1, s * 0.2, '#7a4a2a', '#4a2a14');
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const w = s * (0.95 - t * 0.2), yb = y - s * 0.35 - t * s * 0.5, yt = yb - s * 0.85;
    const teeth = 5 + (tiers - t);
    const pts: [number, number][] = [[x, yt]];
    for (let i = 0; i <= teeth; i++) {
      const fx = x + w - (2 * w * i) / teeth;
      const droop = Math.sin((i / teeth) * Math.PI) * s * 0.08;
      pts.push([fx, yb + droop + (i % 2 ? -s * 0.12 : 0) + (r() - 0.5) * 1.5]);
    }
    const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const [px, py] of pts.slice(1)) c.lineTo(px, py); c.closePath(); };
    path(); c.fillStyle = '#1e4a32'; c.fill(); c.strokeStyle = '#0e2a1a'; c.lineWidth = 1.5; c.stroke();
    // lit left side
    c.save(); path(); c.clip();
    c.fillStyle = '#2f6e4a'; c.beginPath(); c.moveTo(x, yt); c.lineTo(x - w * 1.1, yb + 4); c.lineTo(x - w * 0.1, yb + 4); c.closePath(); c.fill();
    c.fillStyle = '#4a9068'; c.beginPath(); c.moveTo(x, yt); c.lineTo(x - w * 0.9, yb - 2); c.lineTo(x - w * 0.55, yb - 2); c.closePath(); c.fill();
    // needle strokes
    c.strokeStyle = 'rgba(10,40,25,0.5)'; c.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) { const fx = x + (r() - 0.5) * w * 1.6, fy = yt + (yb - yt) * (0.4 + r() * 0.55); c.beginPath(); c.moveTo(fx, fy - 3); c.lineTo(fx + (fx < x ? -2 : 2), fy + 2); c.stroke(); }
    if (snowy) {
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(x, yt - 1); c.lineTo(x + w * 0.5, yt + (yb - yt) * 0.5);
      for (let i = 0; i < 4; i++) c.quadraticCurveTo(x + w * (0.35 - i * 0.25), yt + (yb - yt) * (0.62 + (i % 2) * 0.1), x + w * (0.25 - i * 0.25), yt + (yb - yt) * 0.52);
      c.lineTo(x - w * 0.6, yt + (yb - yt) * 0.5); c.closePath(); c.fill();
      c.fillStyle = 'rgba(150,180,215,0.6)'; c.beginPath(); c.ellipse(x + w * 0.15, yt + (yb - yt) * 0.55, w * 0.25, 1.2, 0, 0, TAU); c.fill();
    }
    c.restore();
  }
}

function rock(c: C, o: Obstacle, r: () => number, cols = ['#a39a8c', '#7a7266', '#c9c0b0'], cap: 'moss' | 'snow' | 'glow' | null = null) {
  const s = o.r, x = o.x, y = o.y;
  const sg = c.createRadialGradient(x + s * 0.35, y + s * 0.45, 1, x + s * 0.35, y + s * 0.45, s * 1.3); sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg; c.beginPath(); c.ellipse(x + s * 0.35, y + s * 0.45, s * 1.3, s * 0.6, 0, 0, TAU); c.fill();
  // silhouette: rounded lumpy boulder
  const n = 11, pts: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const rr = s * (0.82 + r() * 0.22); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * (Math.sin(a) > 0 ? 0.55 : 0.85)]); }
  const shape = () => { c.beginPath(); for (let i = 0; i < n; i++) { const p0 = pts[i], p1 = pts[(i + 1) % n]; const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (i === 0) c.moveTo(mx, my); else c.quadraticCurveTo(p0[0], p0[1], mx, my); } const p0 = pts[0], p1 = pts[1]; c.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); c.closePath(); };
  shape(); const g = c.createLinearGradient(x - s, y - s, x + s, y + s); g.addColorStop(0, cols[2]); g.addColorStop(0.45, cols[0]); g.addColorStop(1, cols[1]);
  c.fillStyle = g; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.7; c.stroke();
  c.save(); shape(); c.clip();
  // facets: shadowed lower-right, lit plane top-left
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.1); c.lineTo(x + s * 1.2, y - s * 0.3); c.lineTo(x + s * 1.2, y + s); c.lineTo(x - s * 0.2, y + s); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.2)'; c.beginPath(); c.moveTo(x - s, y - s * 0.2); c.lineTo(x - s * 0.1, y - s * 0.85); c.lineTo(x + s * 0.25, y - s * 0.35); c.lineTo(x - s * 0.3, y - s * 0.05); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.1); c.lineTo(x + s * 0.35, y + s * 0.2); c.lineTo(x + s * 0.25, y + s * 0.5); c.stroke();
  c.beginPath(); c.moveTo(x - s * 0.45, y + s * 0.05); c.lineTo(x - s * 0.2, y + s * 0.3); c.stroke();
  if (cap === 'moss') { c.fillStyle = '#5a9a3a'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(x - s * 0.5 + i * s * 0.18, y - s * 0.62 + Math.abs(i - 2.5) * s * 0.07, s * 0.17, 0, TAU); c.fill(); } c.fillStyle = '#7ec04e'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x - s * 0.45 + i * s * 0.2, y - s * 0.7 + Math.abs(i - 1.5) * s * 0.07, s * 0.08, 0, TAU); c.fill(); } }
  if (cap === 'snow') { c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x - s * 1.1, y - s * 0.25); c.quadraticCurveTo(x - s * 0.6, y - s * 1.1, x + s * 0.1, y - s * 0.95); c.quadraticCurveTo(x + s * 0.8, y - s * 0.85, x + s * 1.1, y - s * 0.35); c.quadraticCurveTo(x + s * 0.5, y - s * 0.45, x + s * 0.2, y - s * 0.3); c.quadraticCurveTo(x - s * 0.3, y - s * 0.5, x - s * 1.1, y - s * 0.25); c.fill(); c.fillStyle = 'rgba(150,180,215,0.6)'; c.fillRect(x - s, y - s * 0.32, s * 2, 1.2); }
  if (cap === 'glow') { c.strokeStyle = 'rgba(255,120,30,0.9)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.2); c.lineTo(x - s * 0.1, y + s * 0.05); c.lineTo(x + s * 0.3, y - s * 0.1); c.lineTo(x + s * 0.55, y + s * 0.2); c.stroke(); c.strokeStyle = 'rgba(255,230,140,0.9)'; c.lineWidth = 0.5; c.stroke(); }
  c.restore();
  shape(); c.strokeStyle = OUT; c.lineWidth = 1.7; c.stroke();
}

function deadtree(c: C, o: Obstacle, r: () => number) {
  const s = o.r * 1.1, x = o.x, y = o.y + s * 0.5;
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x + s * 0.4, y, s * 0.9, s * 0.3, 0, 0, TAU); c.fill();
  bark(c, x, y - s * 1.1, y, s * 0.12, s * 0.28, '#4a3a32', '#1e1612');
  const branch = (bx: number, by: number, ang: number, len: number, w: number, d: number) => {
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    c.strokeStyle = OUT; c.lineWidth = w + 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = '#3a2c26'; c.lineWidth = w; c.stroke();
    if (d > 0) { branch(ex, ey, ang - 0.5 - r() * 0.3, len * 0.65, w * 0.65, d - 1); branch(ex, ey, ang + 0.4 + r() * 0.3, len * 0.6, w * 0.6, d - 1); }
    else if (r() < 0.4) { c.fillStyle = 'rgba(255,130,40,0.8)'; c.beginPath(); c.arc(ex, ey, 1.2, 0, TAU); c.fill(); }
  };
  branch(x, y - s * 1.05, -Math.PI / 2 - 0.35, s * 0.55, s * 0.12, 2);
  branch(x, y - s * 0.8, -Math.PI / 2 + 0.6, s * 0.45, s * 0.09, 1);
}
function obsidian(c: C, o: Obstacle, r: () => number) {
  const s = o.r, x = o.x, y = o.y + s * 0.4;
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x + 4, y, s, s * 0.35, 0, 0, TAU); c.fill();
  const spikes = [[0, 1.5, 0.3], [-0.5, 1.0, 0.25], [0.45, 1.15, 0.25], [-0.85, 0.6, 0.2], [0.8, 0.7, 0.2]];
  for (const [dx, h, w] of spikes) {
    const bx = x + dx * s, tx = bx + dx * s * 0.25, ty = y - h * s;
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(bx + w * s, y); c.lineTo(bx - w * s, y); c.closePath(); c.fillStyle = '#1e1a24'; c.fill(); c.strokeStyle = '#05040a'; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(bx - w * s, y); c.lineTo(bx - w * s * 0.1, y); c.closePath(); c.fillStyle = '#3e3650'; c.fill();
    c.strokeStyle = 'rgba(255,140,60,0.5)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(tx - 0.5, ty + 3); c.lineTo(bx - w * s * 0.4, y - 2); c.stroke();
  }
  void r;
}
function stalagmite(c: C, o: Obstacle, r: () => number) {
  const s = o.r, x = o.x, y = o.y + s * 0.5;
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x + 4, y, s, s * 0.35, 0, 0, TAU); c.fill();
  const cones = [[0, 1.7, 0.42], [-0.6, 1.0, 0.3], [0.55, 1.2, 0.32]];
  for (const [dx, h, w] of cones) {
    const bx = x + dx * s, ty = y - h * s;
    c.beginPath(); c.moveTo(bx - w * s, y); c.quadraticCurveTo(bx - w * s * 0.4, y - h * s * 0.5, bx, ty); c.quadraticCurveTo(bx + w * s * 0.4, y - h * s * 0.5, bx + w * s, y); c.closePath();
    const g = c.createLinearGradient(bx - w * s, 0, bx + w * s, 0); g.addColorStop(0, '#7a7a9a'); g.addColorStop(0.5, '#5a5a78'); g.addColorStop(1, '#2e2e44');
    c.fillStyle = g; c.fill(); c.strokeStyle = '#141428'; c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8; for (let k = 1; k < 4; k++) { const yy = y - h * s * k * 0.22; c.beginPath(); c.moveTo(bx - w * s * (1 - k * 0.22) * 0.8, yy); c.quadraticCurveTo(bx, yy + 2, bx + w * s * (1 - k * 0.22) * 0.8, yy); c.stroke(); }
    if (r() < 0.6) { c.fillStyle = 'rgba(140,240,255,0.9)'; c.beginPath(); c.arc(bx, ty + 3, 1.2, 0, TAU); c.fill(); }
  }
}

/** Dark cave wall that frames the cavern map. */
function caveWalls(c: C, rnd: () => number, paths: Vec[][]) {
  c.save();
  for (let pass = 0; pass < 2; pass++) {
    c.beginPath();
    const step = 12;
    const edge = (x: number, y: number, nx: number, ny: number, i: number) => {
      const depth = 26 + fbm(i * 0.05, pass * 3, 77) * 50;
      let d = depth;
      // keep the wall off the road
      for (let k = 0; k < 6; k++) { const px = x + nx * d, py = y + ny * d; if (!paths.some((p) => distToPath(px, py, p) < PATH_WIDTH / 2 + 14)) break; d *= 0.6; }
      return [x + nx * d, y + ny * d];
    };
    const pts: number[][] = [];
    for (let x = 0; x <= WORLD_W; x += step) pts.push(edge(x, 0, 0, 1, x));
    for (let y = 0; y <= WORLD_H; y += step) pts.push(edge(WORLD_W, y, -1, 0, y + 1000));
    for (let x = WORLD_W; x >= 0; x -= step) pts.push(edge(x, WORLD_H, 0, -1, x + 2000));
    for (let y = WORLD_H; y >= 0; y -= step) pts.push(edge(0, y, 1, 0, y + 3000));
    c.rect(-10, -10, WORLD_W + 20, WORLD_H + 20);
    c.moveTo(pts[0][0], pts[0][1]); for (const [px, py] of pts) c.lineTo(px, py); c.closePath();
    if (pass === 0) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.save(); c.translate(3, 5); c.fill('evenodd'); c.restore(); }
    else {
      c.fillStyle = '#1a1830'; c.fill('evenodd');
      c.strokeStyle = '#6a6890'; c.lineWidth = 2.5; c.stroke();
      c.strokeStyle = '#0a0818'; c.lineWidth = 1; c.stroke();
    }
  }
  c.restore();
  void rnd;
}

function crystal(c: C, o: Obstacle, r: () => number) {
  const s = o.r;
  const g = c.createRadialGradient(o.x, o.y, 2, o.x, o.y, s * 1.8); g.addColorStop(0, 'rgba(120,230,255,0.35)'); g.addColorStop(1, 'rgba(120,230,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y, s * 1.8, 0, TAU); c.fill();
  shadow(c, o.x + 3, o.y + s * 0.5, s, s * 0.35);
  const HUES = [['#5fbfe0', '#a8ecff', '#1e4a6a'], ['#a46ae8', '#dcb8ff', '#3e1e6a'], ['#e86ab8', '#ffc0e8', '#6a1e4a']];
  const hue = HUES[Math.floor(r() * 3)];
  const shards = [[0, 1.4, 0.32], [-0.5, 0.95, 0.26], [0.5, 1.05, 0.27], [-0.25, 0.7, 0.2], [0.75, 0.6, 0.18]];
  for (const [dx, h, w] of shards) {
    const bx = o.x + dx * s, by = o.y + s * 0.45, tx = bx + dx * s * 0.3, ty = by - h * s;
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(bx + w * s, by - h * s * 0.2); c.lineTo(bx + w * s * 0.8, by); c.lineTo(bx - w * s * 0.8, by); c.lineTo(bx - w * s, by - h * s * 0.2); c.closePath();
    c.fillStyle = hue[0]; c.fill(); c.strokeStyle = hue[2]; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(bx - w * s, by - h * s * 0.2); c.lineTo(bx - w * s * 0.8, by); c.lineTo(bx, by); c.closePath(); c.fillStyle = hue[1]; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(tx, ty + 2); c.lineTo(bx - w * s * 0.3, by - 2); c.stroke();
  }
  void r;
}
function mushroom(c: C, o: Obstacle, r: () => number) {
  for (let i = 0; i < 4; i++) {
    const mx = o.x + (r() - 0.5) * o.r * 1.4, my = o.y + (r() - 0.5) * o.r * 0.8, s = o.r * (0.35 + r() * 0.3);
    const g = c.createRadialGradient(mx, my - s, 1, mx, my - s, s * 2.2); g.addColorStop(0, 'rgba(180,120,255,0.4)'); g.addColorStop(1, 'rgba(180,120,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(mx, my - s, s * 2.2, 0, TAU); c.fill();
    c.fillStyle = '#e8e0d0'; c.fillRect(mx - s * 0.18, my - s, s * 0.36, s); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(mx - s * 0.18, my - s, s * 0.36, s);
    c.beginPath(); c.ellipse(mx, my - s, s, s * 0.55, 0, Math.PI, 0); c.closePath(); c.fillStyle = '#9a5ae0'; c.fill(); c.stroke();
    for (let k = 0; k < 3; k++) { c.fillStyle = '#e8d0ff'; c.beginPath(); c.arc(mx + (k - 1) * s * 0.45, my - s * 1.25, s * 0.12, 0, TAU); c.fill(); }
  }
}
function water(c: C, o: Obstacle, r: () => number, theme: string) {
  const rx = o.r * 1.35, ry = o.r;
  const frozen = theme === 'summit';
  const bank = theme === 'caverns' ? '#3a3550' : frozen ? '#e8f0f8' : '#a8875a';
  c.fillStyle = bank; c.beginPath(); c.ellipse(o.x, o.y, rx + 6, ry + 5, 0, 0, TAU); c.fill();
  c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
  const g = c.createRadialGradient(o.x - rx * 0.3, o.y - ry * 0.3, 2, o.x, o.y, rx);
  if (frozen) { g.addColorStop(0, '#e8faff'); g.addColorStop(1, '#8ccbe8'); }
  else if (theme === 'caverns') { g.addColorStop(0, '#5ad8ff'); g.addColorStop(1, '#1a5a8a'); }
  else { g.addColorStop(0, '#6ac8ff'); g.addColorStop(1, '#1f6fb8'); }
  c.fillStyle = g; c.beginPath(); c.ellipse(o.x, o.y, rx, ry, 0, 0, TAU); c.fill();
  // inner shore shadow
  c.strokeStyle = 'rgba(0,30,60,0.35)'; c.lineWidth = 3; c.beginPath(); c.ellipse(o.x + 1, o.y + 1.5, rx - 1.5, ry - 1.5, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  if (frozen) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(o.x - rx * 0.5 + i * rx * 0.3, o.y - ry * 0.3); c.lineTo(o.x - rx * 0.3 + i * rx * 0.3, o.y + ry * 0.2); c.stroke(); } return; }
  if (theme === 'meadow') {
    for (let i = 0; i < 3; i++) { const a = r() * TAU, d = r() * 0.6; const px = o.x + Math.cos(a) * rx * d, py = o.y + Math.sin(a) * ry * d; c.fillStyle = '#3f9a3a'; c.beginPath(); c.arc(px, py, 4, 0.4, TAU - 0.1); c.lineTo(px, py); c.fill(); if (i === 0) { c.fillStyle = '#ffb3d1'; c.beginPath(); c.arc(px + 1, py - 1, 1.6, 0, TAU); c.fill(); } }
    for (let i = 0; i < 7; i++) { const a = Math.PI * 0.7 + r() * 0.8; const px = o.x + Math.cos(a) * (rx + 2), py = o.y + Math.sin(a) * (ry + 2); c.strokeStyle = '#4a8a30'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py); c.lineTo(px + (r() - 0.5) * 3, py - 8 - r() * 5); c.stroke(); c.fillStyle = '#6b4424'; c.fillRect(px - 1, py - 10 - r() * 3, 2, 4); }
  }
}
function lava(c: C, o: Obstacle, r: () => number = Math.random) {
  const rx = o.r * 1.35, ry = o.r, x = o.x, y = o.y;
  const blob = (k: number) => { c.beginPath(); for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; const n = 1 + (vnoise(Math.cos(a) * 2 + x, Math.sin(a) * 2 + y, 5) - 0.5) * 0.35; const px = x + Math.cos(a) * rx * n * k, py = y + Math.sin(a) * ry * n * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); };
  blob(1.25); c.fillStyle = '#1e1614'; c.fill(); c.strokeStyle = '#0a0606'; c.lineWidth = 1.5; c.stroke();
  blob(1.12); c.fillStyle = '#3a2420'; c.fill();
  blob(1); const g = c.createRadialGradient(x - rx * 0.2, y - ry * 0.2, 2, x, y, rx);
  g.addColorStop(0, '#fff6b0'); g.addColorStop(0.3, '#ffc23a'); g.addColorStop(0.7, '#f06a1a'); g.addColorStop(1, '#a8300e');
  c.fillStyle = g; c.fill();
  // floating crust plates
  c.save(); blob(1); c.clip();
  for (let i = 0; i < 9; i++) {
    const px = x + (r() - 0.5) * rx * 1.6, py = y + (r() - 0.5) * ry * 1.4, pr = 4 + r() * 8;
    c.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + r(); const q = pr * (0.7 + r() * 0.4); if (k) c.lineTo(px + Math.cos(a) * q, py + Math.sin(a) * q * 0.7); else c.moveTo(px + Math.cos(a) * q, py + Math.sin(a) * q * 0.7); } c.closePath();
    c.fillStyle = '#4a2a1e'; c.fill(); c.strokeStyle = 'rgba(255,200,90,0.9)'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.arc(px - pr * 0.25, py - pr * 0.2, pr * 0.3, 0, TAU); c.fill();
  }
  c.restore();
  // rim rocks
  for (let i = 0; i < 10; i++) { const a = r() * TAU; pebble(c, x + Math.cos(a) * rx * 1.22, y + Math.sin(a) * ry * 1.2, r, '#2a2020'); }
}
function ruin(c: C, o: Obstacle, r: () => number) {
  const s = o.r, x = o.x, y = o.y + s * 0.4;
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x + 8, y + 2, s * 1.3, s * 0.4, 0, 0, TAU); c.fill();
  // base slab
  c.fillStyle = '#7a6f62'; c.fillRect(x - s * 1.1, y - 3, s * 2.2, 7); c.strokeStyle = OUT; c.lineWidth = 1.4; c.strokeRect(x - s * 1.1, y - 3, s * 2.2, 7); c.fillStyle = '#9a8f80'; c.fillRect(x - s * 1.1, y - 3, s * 2.2, 2);
  const cols = 2;
  for (let i = 0; i < cols; i++) {
    const px = x + (i ? 0.5 : -0.5) * s, h = s * (i ? 0.9 + r() * 0.4 : 1.6 + r() * 0.5), w = s * 0.32;
    const g = c.createLinearGradient(px - w, 0, px + w, 0); g.addColorStop(0, '#d8cfc0'); g.addColorStop(0.5, '#b0a594'); g.addColorStop(1, '#6e6456');
    c.fillStyle = g; c.fillRect(px - w, y - h, w * 2, h); c.strokeStyle = OUT; c.lineWidth = 1.4; c.strokeRect(px - w, y - h, w * 2, h);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(px + k * w * 0.5, y - h + 2); c.lineTo(px + k * w * 0.5, y - 1); c.stroke(); }
    // broken top
    c.fillStyle = '#c9bfae'; c.beginPath(); c.moveTo(px - w - 1, y - h); c.lineTo(px - w * 0.2, y - h - 4); c.lineTo(px + w * 0.3, y - h - 1); c.lineTo(px + w + 1, y - h - 5); c.lineTo(px + w + 1, y - h + 1); c.lineTo(px - w - 1, y - h + 1); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
    if (i === 0) { c.fillStyle = '#c9bfae'; c.fillRect(px - w * 1.35, y - h - 1, w * 2.7, 3); c.strokeRect(px - w * 1.35, y - h - 1, w * 2.7, 3); }
  }
  // fallen drum
  c.save(); c.translate(x + s * 1.2, y + 1); c.rotate(0.25);
  c.fillStyle = '#b0a594'; c.fillRect(-7, -4, 14, 8); c.strokeStyle = OUT; c.lineWidth = 1.2; c.strokeRect(-7, -4, 14, 8);
  c.beginPath(); c.ellipse(7, 0, 2.2, 4, 0, 0, TAU); c.fillStyle = '#d8cfc0'; c.fill(); c.stroke();
  c.restore();
  for (let i = 0; i < 4; i++) pebble(c, x + (r() - 0.5) * s * 2.2, y + 4 + r() * 4, r, '#9a8f80');
}
function house(c: C, o: Obstacle) {
  const s = o.r;
  shadow(c, o.x + 8, o.y + s * 0.55, s * 1.3, s * 0.45);
  c.fillStyle = '#e8d8b8'; c.fillRect(o.x - s, o.y - s * 0.5, s * 2, s); c.strokeStyle = OUT; c.lineWidth = 1.6; c.strokeRect(o.x - s, o.y - s * 0.5, s * 2, s);
  c.strokeStyle = '#7a5530'; c.lineWidth = 2; c.beginPath(); c.moveTo(o.x - s, o.y); c.lineTo(o.x + s, o.y); c.moveTo(o.x - s * 0.3, o.y - s * 0.5); c.lineTo(o.x - s * 0.3, o.y + s * 0.5); c.stroke();
  c.fillStyle = '#5a3a22'; c.fillRect(o.x + s * 0.15, o.y - s * 0.05, s * 0.4, s * 0.55);
  c.fillStyle = '#ffe28a'; c.fillRect(o.x - s * 0.8, o.y - s * 0.35, s * 0.35, s * 0.28); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(o.x - s * 0.8, o.y - s * 0.35, s * 0.35, s * 0.28);
  c.fillStyle = '#b8432f'; c.beginPath(); c.moveTo(o.x - s * 1.2, o.y - s * 0.45); c.lineTo(o.x - s * 0.6, o.y - s * 1.25); c.lineTo(o.x + s * 0.6, o.y - s * 1.25); c.lineTo(o.x + s * 1.2, o.y - s * 0.45); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { const yy = o.y - s * 0.45 - i * s * 0.2; c.beginPath(); c.moveTo(o.x - s * 1.2 + i * s * 0.15, yy); c.lineTo(o.x + s * 1.2 - i * s * 0.15, yy); c.stroke(); }
  c.fillStyle = '#8a7f72'; c.fillRect(o.x + s * 0.5, o.y - s * 1.45, s * 0.25, s * 0.5); c.strokeStyle = OUT; c.strokeRect(o.x + s * 0.5, o.y - s * 1.45, s * 0.25, s * 0.5);
}
function windmill(c: C, o: Obstacle) {
  const s = o.r;
  shadow(c, o.x + 10, o.y + s * 0.6, s * 1.1, s * 0.4);
  c.fillStyle = '#d8c8a8'; c.beginPath(); c.moveTo(o.x - s * 0.55, o.y + s * 0.5); c.lineTo(o.x - s * 0.35, o.y - s * 1.2); c.lineTo(o.x + s * 0.35, o.y - s * 1.2); c.lineTo(o.x + s * 0.55, o.y + s * 0.5); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
  c.fillStyle = '#5a3a22'; c.fillRect(o.x - 3, o.y + s * 0.1, 6, s * 0.4);
  c.fillStyle = '#7a4a2a'; c.beginPath(); c.moveTo(o.x - s * 0.45, o.y - s * 1.2); c.lineTo(o.x, o.y - s * 1.6); c.lineTo(o.x + s * 0.45, o.y - s * 1.2); c.fill(); c.stroke();
}
// blades are animated, drawn in ambient layer
function windmillBlades(c: C, o: Obstacle, time: number) {
  const hx = o.x, hy = o.y - o.r * 1.15;
  c.save(); c.translate(hx, hy); c.rotate(time * 0.8);
  for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.fillStyle = '#f2ead6'; c.fillRect(2, -2.5, o.r * 1.2, 5); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(2, -2.5, o.r * 1.2, 5); c.strokeStyle = '#7a5530'; c.beginPath(); c.moveTo(0, 0); c.lineTo(o.r * 1.25, 0); c.stroke(); }
  c.restore();
  c.fillStyle = '#5a3a22'; c.beginPath(); c.arc(hx, hy, 3, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- road
function strokePath(c: C, p: Vec[]) { c.beginPath(); p.forEach((pt, i) => (i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y))); }
function offsetPath(p: Vec[], off: number): Vec[] {
  return p.map((pt, i) => {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: pt.x - (dy / l) * off, y: pt.y + (dx / l) * off };
  });
}

function road(c: C, map: MapDef, th: Theme, pxs: number, rnd: () => number) {
  const W = PATH_WIDTH;
  c.lineCap = 'round'; c.lineJoin = 'round';
  // soft outer shadow / worn grass ring
  for (const p of map.paths) { strokePath(c, p); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = W + 22; c.stroke(); strokePath(c, p); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = W + 14; c.stroke(); }
  for (const p of map.paths) { strokePath(c, p); c.strokeStyle = th.edge; c.lineWidth = W + 6; c.stroke(); }
  // textured surface: draw path mask on its own canvas, then fill with noise texture
  const cv = document.createElement('canvas'); cv.width = c.canvas.width; cv.height = c.canvas.height;
  const m = cv.getContext('2d')!; m.setTransform(c.getTransform()); m.lineCap = 'round'; m.lineJoin = 'round';
  for (const p of map.paths) { strokePath(m, p); m.strokeStyle = '#000'; m.lineWidth = W - 2; m.stroke(); }
  m.globalCompositeOperation = 'source-in';
  const tex = noiseCanvas(Math.ceil(WORLD_W / 3), Math.ceil(WORLD_H / 3), 9, 404, th.dirt, 0.45);
  m.imageSmoothingEnabled = true; m.drawImage(tex, 0, 0, WORLD_W, WORLD_H);
  m.globalCompositeOperation = 'source-atop';
  // inner shading: darker edges, lighter crown
  for (const p of map.paths) { strokePath(m, p); m.strokeStyle = 'rgba(0,0,0,0.16)'; m.lineWidth = W - 2; m.stroke(); strokePath(m, p); m.strokeStyle = 'rgba(255,255,255,0.08)'; m.lineWidth = W * 0.7; m.stroke(); strokePath(m, p); m.strokeStyle = 'rgba(255,255,255,0.08)'; m.lineWidth = W * 0.4; m.stroke(); }
  if (th.road === 'dirt') {
    // wheel ruts
    // mud and sand patches
    for (const p of map.paths) for (let i = 0; i < p.length; i += 6) {
      const px = p[i].x + (rnd() - 0.5) * W * 0.7, py = p[i].y + (rnd() - 0.5) * W * 0.7, pr = 4 + rnd() * 9;
      const g = m.createRadialGradient(px, py, 0, px, py, pr);
      const mud = rnd() < 0.5;
      g.addColorStop(0, mud ? 'rgba(90,55,25,0.28)' : 'rgba(255,235,190,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g; m.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    // broken, uneven wheel ruts
    for (const p of map.paths) for (const off of [-8, 8]) { m.setLineDash([22 + rnd() * 20, 8 + rnd() * 14, 10, 18]); strokePath(m, offsetPath(p, off)); m.strokeStyle = 'rgba(90,55,25,0.22)'; m.lineWidth = 2.6; m.stroke(); m.setLineDash([]); }
    for (const p of map.paths) for (let i = 0; i < p.length; i += 3) if (rnd() < 0.5) pebble(m, p[i].x + (rnd() - 0.5) * W * 0.8, p[i].y + (rnd() - 0.5) * W * 0.8, rnd, '#a88a62');
  } else {
    // stones: cobble (summit), flagstones (caverns), basalt slabs (ember)
    const size = th.road === 'cobble' ? 7 : th.road === 'flag' ? 11 : 13;
    for (const p of map.paths) {
      let acc = 0;
      for (let i = 1; i < p.length; i++) {
        acc += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        if (acc < size * 0.9) continue;
        acc = 0;
        const dx = p[i].x - p[i - 1].x, dy = p[i].y - p[i - 1].y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        for (let k = -2; k <= 2; k++) {
          const off = k * size * 0.95 + (rnd() - 0.5) * 3;
          if (Math.abs(off) > W / 2 - size * 0.45) continue;
          const sx = p[i].x + nx * off, sy = p[i].y + ny * off, ang = Math.atan2(dy, dx);
          m.save(); m.translate(sx, sy); m.rotate(ang + (rnd() - 0.5) * 0.3);
          const w = size * (0.8 + rnd() * 0.25), h = size * (0.7 + rnd() * 0.25);
          m.fillStyle = 'rgba(0,0,0,0.28)'; roundRect(m, -w / 2 + 0.8, -h / 2 + 0.8, w, h, size * 0.3); m.fill();
          const shadeV = Math.floor(rnd() * 30) - 15;
          m.fillStyle = th.road === 'basalt' ? `rgb(${70 + shadeV},${60 + shadeV},${58 + shadeV})` : th.road === 'flag' ? `rgb(${140 + shadeV},${128 + shadeV},${165 + shadeV})` : `rgb(${150 + shadeV},${158 + shadeV},${168 + shadeV})`;
          roundRect(m, -w / 2, -h / 2, w, h, size * 0.3); m.fill();
          m.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(m, -w / 2 + 1, -h / 2 + 1, w * 0.6, h * 0.35, size * 0.2); m.fill();
          m.restore();
        }
      }
    }
    if (th.road === 'basalt') for (const p of map.paths) { strokePath(m, offsetPath(p, 0)); m.strokeStyle = 'rgba(255,120,40,0.12)'; m.lineWidth = 3; m.stroke(); }
    if (th.road === 'cobble') for (const p of map.paths) for (const off of [-12, 12]) { strokePath(m, offsetPath(p, off)); m.strokeStyle = 'rgba(255,255,255,0.55)'; m.lineWidth = 5; m.stroke(); }
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(cv, 0, 0); c.restore();
  // edge stones and overhanging tufts
  for (const p of map.paths) {
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i]; const seg = Math.hypot(b.x - a.x, b.y - a.y); acc += seg;
      if (acc < 9) continue; acc = 0;
      const nx = -(b.y - a.y) / (seg || 1), ny = (b.x - a.x) / (seg || 1);
      for (const side of [-1, 1]) {
        const sx = b.x + nx * side * (W / 2 + 1), sy = b.y + ny * side * (W / 2 + 1);
        if (map.paths.some((q) => q !== p && distToPath(sx, sy, q) < W / 2 + 1)) continue;
        if (th.tuft && rnd() < 0.55) {
          c.strokeStyle = rnd() < 0.5 ? th.tuft : th.tuftDark!; c.lineWidth = 1.4; c.lineCap = 'round';
          for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(sx + (k - 1) * 2, sy); c.lineTo(sx + (k - 1) * 2 - nx * side * (3 + rnd() * 4) + (rnd() - 0.5) * 2, sy - ny * side * (3 + rnd() * 4) - 1.5); c.stroke(); }
        } else if (rnd() < 0.5) pebble(c, sx, sy, rnd, th.road === 'basalt' ? '#2a2020' : th.road === 'flag' ? '#4a4068' : '#8a7f72');
      }
    }
  }
  void pxs;
}
function roundRect(c: C, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

// ---------------------------------------------------------------- spire + portals
export function drawSpire(c: C, x: number, y: number, time = 0) {
  shadow(c, x + 10, y + 16, 34, 11, 0.32);
  // base keep
  const stone = (x0: number, y0: number, w: number, h: number) => {
    const g = c.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, '#d9d2c3'); g.addColorStop(0.6, '#b8af9e'); g.addColorStop(1, '#8a8172');
    c.fillStyle = g; c.fillRect(x0, y0, w, h); c.strokeStyle = OUT; c.lineWidth = 1.6; c.strokeRect(x0, y0, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 0.8;
    for (let yy = y0 + 5; yy < y0 + h; yy += 5) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x0 + w, yy); c.stroke(); for (let xx = x0 + ((yy / 5) % 2) * 4 + 4; xx < x0 + w; xx += 8) { c.beginPath(); c.moveTo(xx, yy - 5); c.lineTo(xx, yy); c.stroke(); } }
  };
  stone(x - 26, y - 14, 52, 30);
  for (let i = 0; i < 6; i++) { c.fillStyle = '#c9c0b0'; c.fillRect(x - 26 + i * 9, y - 19, 6, 5); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(x - 26 + i * 9, y - 19, 6, 5); }
  // central spire tower
  stone(x - 11, y - 62, 22, 50);
  c.fillStyle = '#ffe28a'; for (const wy of [-48, -32]) { c.fillRect(x - 3, y + wy, 6, 8); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(x - 3, y + wy, 6, 8); }
  c.fillStyle = '#5b3fc0'; c.beginPath(); c.moveTo(x - 15, y - 62); c.lineTo(x, y - 96); c.lineTo(x + 15, y - 62); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
  c.fillStyle = '#7b5fe0'; c.beginPath(); c.moveTo(x - 15, y - 62); c.lineTo(x, y - 96); c.lineTo(x - 3, y - 62); c.closePath(); c.fill();
  // gate
  c.fillStyle = '#3a2414'; c.beginPath(); c.moveTo(x - 7, y + 16); c.lineTo(x - 7, y + 4); c.arc(x, y + 4, 7, Math.PI, 0); c.lineTo(x + 7, y + 16); c.fill();
  c.strokeStyle = '#8a96a3'; c.lineWidth = 1; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x + i * 3.5, y - 2); c.lineTo(x + i * 3.5, y + 16); c.stroke(); }
  // glowing crystal on top
  const pulse = 1 + Math.sin(time * 2) * 0.1;
  const g = c.createRadialGradient(x, y - 104, 1, x, y - 104, 16 * pulse); g.addColorStop(0, 'rgba(200,180,255,0.9)'); g.addColorStop(1, 'rgba(160,120,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y - 104, 16 * pulse, 0, TAU); c.fill();
  c.fillStyle = '#e8dcff'; c.beginPath(); c.moveTo(x, y - 115); c.lineTo(x + 5, y - 104); c.lineTo(x, y - 95); c.lineTo(x - 5, y - 104); c.closePath(); c.fill(); c.strokeStyle = '#5b3fc0'; c.lineWidth = 1.2; c.stroke();
  // banners
  for (const bx of [-22, 22]) { c.fillStyle = '#5b3fc0'; c.fillRect(x + bx - 3, y - 12, 6, 14); c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(x + bx, y - 6, 1.6, 0, TAU); c.fill(); }
}

function portal(c: C, x: number, y: number) {
  const g = c.createRadialGradient(x, y, 2, x, y, 34);
  g.addColorStop(0, 'rgba(20,0,30,0.95)'); g.addColorStop(0.55, 'rgba(70,20,110,0.75)'); g.addColorStop(1, 'rgba(70,20,110,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, 34, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- public API
export function exitPoint(map: MapDef) { const last = map.paths[0][map.paths[0].length - 1]; return { x: Math.max(34, Math.min(WORLD_W - 34, last.x)), y: Math.max(110, Math.min(WORLD_H - 22, last.y)) }; }
export function entryPoints(map: MapDef) { return map.paths.map((p) => ({ x: Math.max(10, Math.min(WORLD_W - 10, p[0].x)), y: Math.max(10, Math.min(WORLD_H - 10, p[0].y)) })); }

/** Paint the static background into ctx (already scaled to world units). */
export function paintMap(c: C, map: MapDef, pxScale: number) {
  const th = THEMES[map.id] ?? THEMES.meadow;
  let s = 7 + map.id.length * 13;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // terrain
  const ground = noiseCanvas(Math.ceil(WORLD_W / 4), Math.ceil(WORLD_H / 4), 22, 101 + map.id.length, th.ground, 0.25);
  c.imageSmoothingEnabled = true; c.drawImage(ground, 0, 0, WORLD_W, WORLD_H);
  // big soft light/shade blobs for depth
  for (let i = 0; i < 18; i++) {
    const x = rnd() * WORLD_W, y = rnd() * WORLD_H, r = 60 + rnd() * 120, light = rnd() < 0.5;
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, light ? 'rgba(255,255,220,0.10)' : 'rgba(0,20,40,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine ground texture: blades (grass maps), grit (others)
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * WORLD_W, y = rnd() * WORLD_H;
    const n = vnoise(x / 60, y / 60, 7);
    if (map.id === 'meadow') {
      c.strokeStyle = n > 0.5 ? (rnd() < 0.5 ? 'rgba(150,215,95,0.55)' : 'rgba(40,100,30,0.45)') : (rnd() < 0.5 ? 'rgba(30,90,25,0.4)' : 'rgba(120,195,80,0.4)');
      c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 2.5, y - 2.5 - rnd() * 3); c.stroke();
    } else if (map.id === 'summit') {
      if (i % 3) continue; c.fillStyle = rnd() < 0.5 ? 'rgba(170,195,225,0.35)' : 'rgba(255,255,255,0.7)'; c.fillRect(x, y, 2, 1);
    } else {
      if (i % 2) continue; c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.08)'; c.fillRect(x, y, 1.5, 1.5);
    }
  }
  // decals away from road
  for (let i = 0; i < 260; i++) {
    const x = rnd() * WORLD_W, y = rnd() * WORLD_H;
    if (map.paths.some((p) => distToPath(x, y, p) < PATH_WIDTH / 2 + 8)) continue;
    th.decal(c, x, y, rnd);
  }
  road(c, map, th, pxScale, rnd);
  if (map.id === 'summit') {
    for (const p of map.paths) for (const side of [-1, 1]) for (let i = 0; i < p.length; i += 2) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l; const d = PATH_WIDTH / 2 + 3 + rnd() * 3;
      const sx = p[i].x + nx * side * d, sy = p[i].y + ny * side * d; const sr = 3 + rnd() * 3;
      c.fillStyle = 'rgba(140,170,205,0.5)'; c.beginPath(); c.arc(sx + 1, sy + 1.5, sr, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
    }
  }
  if (map.id === 'caverns') caveWalls(c, rnd, map.paths);
  for (const e of entryPoints(map)) portal(c, e.x, e.y);
  // obstacles, back-to-front
  const obs = map.obstacles.slice().sort((a, b) => a.y - b.y);
  for (const o of obs) {
    switch (o.kind) {
      case 'tree': tree(c, o, rnd); break;
      case 'bush': bush(c, o, rnd); break;
      case 'pine': pine(c, o, rnd, map.id === 'summit'); break;
      case 'rock': rock(c, o, rnd, map.id === 'ember' ? ['#4a3c38', '#2a2220', '#6a5a52'] : map.id === 'summit' ? ['#9aa4ae', '#6a747e', '#c8d0d8'] : map.id === 'caverns' ? ['#5a6288', '#2e3450', '#7a84a8'] : undefined, map.id === 'meadow' ? 'moss' : map.id === 'summit' ? 'snow' : map.id === 'ember' ? 'glow' : null); break;
      case 'deadtree': deadtree(c, o, rnd); break;
      case 'obsidian': obsidian(c, o, rnd); break;
      case 'stalagmite': stalagmite(c, o, rnd); break;
      case 'crystal': crystal(c, o, rnd); break;
      case 'mushroom': mushroom(c, o, rnd); break;
      case 'water': water(c, o, rnd, map.id); break;
      case 'lava': lava(c, o, rnd); break;
      case 'ruin': ruin(c, o, rnd); break;
      case 'house': house(c, o); break;
      case 'windmill': windmill(c, o); break;
    }
  }
  // vignette + warm light from top-left
  const lg = c.createLinearGradient(0, 0, WORLD_W, WORLD_H); lg.addColorStop(0, 'rgba(255,240,200,0.08)'); lg.addColorStop(1, 'rgba(0,0,40,0.10)');
  c.fillStyle = lg; c.fillRect(0, 0, WORLD_W, WORLD_H);
  const vg = c.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.42, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.68);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.32)');
  c.fillStyle = vg; c.fillRect(0, 0, WORLD_W, WORLD_H);
}

/** Animated ambience drawn every frame on top of the background (cheap). */
export function drawAmbient(c: C, map: MapDef, time: number) {
  // water shimmer / lava glow
  for (const o of map.obstacles) {
    if (o.kind === 'water' && map.id !== 'summit') {
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { const ph = (time * 0.6 + i / 3) % 1; const rx = o.r * 1.35 * (0.3 + ph * 0.6); c.globalAlpha = 1 - ph; c.beginPath(); c.ellipse(o.x - o.r * 0.2 + i * 6, o.y - o.r * 0.2 + i * 4, rx * 0.4, rx * 0.12, 0, 0, Math.PI); c.stroke(); }
      c.globalAlpha = 1;
    } else if (o.kind === 'lava') {
      const p = 0.25 + Math.sin(time * 2 + o.x) * 0.12;
      const g = c.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r * 2.2); g.addColorStop(0, `rgba(255,200,80,${p})`); g.addColorStop(1, 'rgba(255,90,20,0)');
      c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y, o.r * 2.2, 0, TAU); c.fill();
      const bx = o.x + Math.sin(time * 1.3 + o.y) * o.r * 0.6, by = o.y + Math.cos(time * 1.7) * o.r * 0.3, br = ((time * 0.8 + o.x) % 1) * 4;
      c.strokeStyle = 'rgba(255,240,160,0.8)'; c.lineWidth = 1; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.stroke();
    } else if (o.kind === 'windmill') windmillBlades(c, o, time);
    else if (o.kind === 'crystal' && Math.sin(time * 2 + o.x) > 0.6) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(o.x - o.r * 0.1, o.y - o.r * 0.8, 1.2, 0, TAU); c.fill(); }
  }
  // portals swirl
  for (const e of entryPoints(map)) {
    for (let i = 0; i < 3; i++) { c.strokeStyle = `rgba(190,120,255,${0.5 - i * 0.12})`; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, 10 + i * 7, time * (2 - i * 0.4) + i, time * (2 - i * 0.4) + i + 3.5); c.stroke(); }
  }
  // drifting particles
  const n = 26;
  for (let i = 0; i < n; i++) {
    const seed = i * 97.13;
    if (map.id === 'summit') { const x = (seed * 13 + time * (12 + (i % 5) * 4)) % WORLD_W, y = (seed * 7 + time * (24 + (i % 4) * 6)) % WORLD_H; c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(x + Math.sin(time + i) * 6, y, 1.4 + (i % 3) * 0.6, 0, TAU); c.fill(); }
    else if (map.id === 'ember') { const x = (seed * 11 + Math.sin(time * 0.7 + i) * 20 + 2000) % WORLD_W, y = WORLD_H - ((seed * 5 + time * (18 + (i % 4) * 5)) % WORLD_H); c.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,${0.5 + (i % 3) * 0.15})`; c.fillRect(x, y, 2, 2); }
    else if (map.id === 'caverns') { const x = (seed * 17 + Math.sin(time * 0.5 + i) * 30 + 2000) % WORLD_W, y = (seed * 9 + Math.cos(time * 0.4 + i) * 25 + 2000) % WORLD_H; const a = 0.35 + Math.sin(time * 3 + i) * 0.3; c.fillStyle = `rgba(150,240,255,${Math.max(0, a)})`; c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill(); }
    else if (i < 10) { const x = (seed * 23 + time * 14) % (WORLD_W + 40) - 20, y = (seed * 3 + Math.sin(time * 2 + i) * 10 + 2000) % WORLD_H; c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x, y, 2, 1, Math.sin(time * 3 + i), 0, TAU); c.fill(); }
  }
  // slow cloud shadows
  if (map.id === 'meadow' || map.id === 'summit') {
    for (let i = 0; i < 3; i++) { const x = ((time * 8 + i * 420) % (WORLD_W + 400)) - 200, y = 120 + i * 200; const g = c.createRadialGradient(x, y, 10, x, y, 160); g.addColorStop(0, 'rgba(0,20,40,0.07)'); g.addColorStop(1, 'rgba(0,20,40,0)'); c.fillStyle = g; c.fillRect(x - 160, y - 160, 320, 320); }
  }
}
