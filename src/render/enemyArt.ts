// Enemy character models. Size, armour and menace scale with power level, and
// each keeps its layer colour for instant readability (red imp -> blue goblin ->
// green orc -> yellow troll -> pink ogre -> specials -> giants -> bosses).
// Small enemies are pre-rendered into a sprite cache (8 walk frames x 2 facings).
type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const OUT = '#1e120c';

function circ(c: C, x: number, y: number, r: number, fill: string, stroke = true, lw = 1.2) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = OUT; c.lineWidth = lw; c.stroke(); } }
function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string, stroke = true, rot = 0, lw = 1.2) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = OUT; c.lineWidth = lw; c.stroke(); } }
function poly(c: C, p: number[], fill: string, stroke = true, lw = 1.1) { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = OUT; c.lineWidth = lw; c.stroke(); } }
function limb(c: C, x1: number, y1: number, x2: number, y2: number, w: number, col: string) { c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = w + 1.8; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
function shade(hex: string, amt: number) { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, v + amt)); return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function eyes(c: C, x: number, y: number, gap: number, r: number, col = '#fff6c8', pupil = '#1a0a04') { circ(c, x, y, r, col, false); circ(c, x + gap, y, r * 0.9, col, false); circ(c, x + r * 0.3, y, r * 0.45, pupil, false); circ(c, x + gap + r * 0.3, y, r * 0.42, pupil, false); }
function glowEyes(c: C, x: number, y: number, gap: number, r: number, col: string) { c.save(); c.shadowColor = col; c.shadowBlur = 6; circ(c, x, y, r, col, false); circ(c, x + gap, y, r, col, false); c.restore(); }

/** Generic lean biped: legs animate with phase w (radians). Facing +x. */
function legs(c: C, hipY: number, footY: number, w: number, col: string, boot: string, spread = 2.4, thick = 2.6) {
  const s = Math.sin(w) * spread * 1.6;
  limb(c, -spread * 0.4, hipY, -spread * 0.4 - s, footY, thick, col);
  limb(c, spread * 0.4, hipY, spread * 0.4 + s, footY, thick, col);
  ell(c, -spread * 0.4 - s + 1, footY + 0.5, thick * 0.9, thick * 0.55, boot);
  ell(c, spread * 0.4 + s + 1, footY + 0.5, thick * 0.9, thick * 0.55, boot);
}

// ---------------------------------------------------------------- basic chain
function imp(c: C, w: number) { // tiny winged devil
  const flap = Math.sin(w * 2) * 0.5;
  for (const k of [-1, 1]) { c.save(); c.translate(-1, -9); c.rotate(-0.5 + flap * k * 0.2 - (k > 0 ? 0.6 : 0)); poly(c, [0, 0, -9, -6, -7, -1, -9, 2, -5, 1, -2, 4], k > 0 ? '#7a1a14' : '#9a2a20'); c.restore(); }
  c.strokeStyle = OUT; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-3, -4); c.quadraticCurveTo(-9, -2, -8, -9); c.stroke(); c.strokeStyle = '#c4302a'; c.lineWidth = 1.2; c.stroke(); poly(c, [-8, -9, -10, -11, -7, -11.5], '#c4302a', false);
  legs(c, -4, 2, w, '#a8261e', '#3a0a06', 2, 2);
  ell(c, 0, -7, 3.6, 4.6, '#e0402e');
  circ(c, 1, -13, 4, '#e8483a');
  poly(c, [-1.5, -16, -3, -20.5, 0.5, -16.5], '#f2e2c0', true, 0.8); poly(c, [2.5, -16.5, 3.5, -21, 4.5, -16], '#f2e2c0', true, 0.8);
  eyes(c, 1.2, -13.5, 2.6, 1.2, '#ffe27a');
  c.strokeStyle = OUT; c.lineWidth = 0.8; c.beginPath(); c.arc(3, -11.3, 1.3, 0.2, Math.PI - 0.2); c.stroke();
  limb(c, 2, -8, 6, -6 + Math.sin(w) * 1.5, 1.4, '#e0402e');
}
function goblin(c: C, w: number) { // big-eared runner with dagger
  legs(c, -5, 3, w, '#2a3a6a', '#3a2414', 2.4, 2.4);
  poly(c, [-4, -12, 4, -12, 4.6, -4, -4.4, -4], '#6a4a2a'); // vest
  c.fillStyle = '#4a7ad0'; c.fillRect(-4, -12, 2.2, 8);
  circ(c, 1.5, -16, 4.6, '#4a7ad0');
  poly(c, [-2.5, -17.5, -9.5, -21, -3, -14.5], '#4a7ad0'); poly(c, [5, -17.5, 11, -20, 5.5, -14], '#3a62b0');
  eyes(c, 1.5, -16.5, 2.8, 1.25, '#ffe27a');
  poly(c, [5.6, -15, 8, -14.5, 5.6, -13.6], '#3a62b0', false);
  c.strokeStyle = OUT; c.lineWidth = 0.8; c.beginPath(); c.moveTo(2.5, -13.2); c.lineTo(5, -13.6); c.stroke();
  const a = Math.sin(w) * 0.4;
  limb(c, 3, -10, 7, -6 + a * 3, 1.6, '#4a7ad0');
  poly(c, [7, -7 + a * 3, 12, -9 + a * 3, 7.5, -5.5 + a * 3], '#dfe6ee', true, 0.7);
}
function orc(c: C, w: number) { // tusked warrior with axe
  legs(c, -6, 3, w, '#3a2a1a', '#2a1a0e', 3, 3.2);
  poly(c, [-5.5, -15, 5.5, -15, 5, -5, -5, -5], '#4a9a3a');
  poly(c, [-5.5, -15, 5.5, -15, 5, -9, -5, -9], '#7a5a3a'); // leather chest strap
  c.fillStyle = '#9aa4b0'; c.beginPath(); c.ellipse(-4.5, -14, 3.6, 2.6, -0.3, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke(); // pauldron
  circ(c, 1.5, -19.5, 4.8, '#56b048');
  c.fillStyle = '#2a1a0e'; c.beginPath(); c.arc(1.5, -21, 5, Math.PI * 1.05, Math.PI * 1.95); c.fill(); // hair
  eyes(c, 1.5, -20, 2.8, 1.1, '#ff5a3a');
  poly(c, [2, -16.5, 2.6, -19, 3.4, -16.5], '#fff8e0', true, 0.6); poly(c, [5, -16.5, 5.6, -19, 6.4, -16.5], '#fff8e0', true, 0.6);
  const a = Math.sin(w) * 0.5 - 0.3;
  const hx = 5 + Math.cos(a) * 6, hy = -11 + Math.sin(a) * 6;
  limb(c, 4, -12, hx, hy, 2.2, '#4a9a3a');
  limb(c, hx, hy + 4, hx + 1, hy - 9, 1.4, '#6b4424');
  poly(c, [hx + 1, hy - 9, hx + 6, hy - 11, hx + 6.5, hy - 4.5, hx + 1, hy - 5.5], '#cfd6de', true, 0.8);
}
function troll(c: C, w: number) { // lanky, long arms, club — fast
  legs(c, -8, 3, w * 1.2, '#a8862a', '#4a3a1a', 3, 2.6);
  poly(c, [-4, -18, 5, -18, 4, -8, -3.5, -8], '#e8c43a');
  c.fillStyle = '#6b4424'; c.fillRect(-4, -10, 8.5, 3); // loincloth belt
  circ(c, 3, -22, 4.2, '#f2d04a');
  poly(c, [4, -20, 9, -19.5, 4.5, -18.3], '#e8c43a'); // long nose
  eyes(c, 2.2, -23, 2.4, 1.1, '#fff6c8');
  c.fillStyle = '#5a7a3a'; c.beginPath(); c.arc(2, -25, 4.4, Math.PI, TAU); c.fill(); // mossy hair
  const a = Math.sin(w * 1.2);
  limb(c, -3, -16, -6 - a * 3, -4, 2, '#e8c43a');
  limb(c, 4, -16, 9 + a * 2, -6, 2, '#e8c43a');
  limb(c, 9 + a * 2, -6, 13 + a * 2, -16, 3.2, '#7a5230');
  circ(c, 13 + a * 2, -16.5, 2.6, '#7a5230');
}
function ogre(c: C, w: number) { // tall muscular brute, horned helm, spiked club
  legs(c, -9, 3, w * 0.8, '#7a3a5a', '#2a1a10', 4, 4);
  poly(c, [-7, -24, 7, -24, 6, -9, -6, -9], '#e86aa8');
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -22); c.lineTo(0, -12); c.moveTo(-5, -17); c.quadraticCurveTo(0, -15, 5, -17); c.stroke(); // muscles
  c.fillStyle = '#5a3a22'; c.fillRect(-6.5, -11, 13, 3.5); circ(c, 0, -9.5, 1.4, '#c9a35b', false);
  circ(c, 2, -28.5, 5.2, '#f27ab8');
  c.beginPath(); c.arc(2, -29.5, 5.6, Math.PI, TAU); c.fillStyle = '#7a8494'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.1; c.stroke();
  for (const k of [-1, 1]) { c.beginPath(); c.moveTo(2 + k * 4.5, -31); c.quadraticCurveTo(2 + k * 9, -32, 2 + k * 8, -37); c.quadraticCurveTo(2 + k * 6.5, -33.5, 2 + k * 3.5, -33); c.fillStyle = '#f2ead6'; c.fill(); c.stroke(); }
  eyes(c, 1.5, -28.5, 3, 1.2, '#ffe27a');
  poly(c, [2, -25, 2.6, -27.5, 3.4, -25], '#fff8e0', false); poly(c, [5.4, -25, 6, -27.5, 6.8, -25], '#fff8e0', false);
  const a = Math.sin(w * 0.8);
  limb(c, -6, -21, -9 - a * 2, -10, 3.2, '#e86aa8');
  limb(c, 6, -21, 11, -14 + a, 3.2, '#e86aa8');
  limb(c, 11, -12 + a, 14, -30 + a, 4, '#6b4424');
  for (let i = 0; i < 4; i++) poly(c, [13 + (i % 2) * 2, -26 + a - i * 2, 16.5 + (i % 2) * 2, -27 + a - i * 2, 14 + (i % 2) * 2, -24.5 + a - i * 2], '#cfd6de', false);
}

// ---------------------------------------------------------------- specials
function gloom(c: C, w: number) { // shadow wraith, immune to explosions
  const bob = Math.sin(w) * 1.2;
  c.save(); c.translate(0, bob);
  const g = c.createRadialGradient(0, -10, 1, 0, -10, 14); g.addColorStop(0, 'rgba(120,60,180,0.5)'); g.addColorStop(1, 'rgba(60,20,100,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, -10, 14, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(-6, 0); for (let i = 0; i <= 6; i++) c.lineTo(-6 + i * 2, 1 + (i % 2 ? -3 : 0) + Math.sin(w * 2 + i) * 1); c.quadraticCurveTo(7, -10, 3, -19); c.quadraticCurveTo(0, -22, -3, -19); c.quadraticCurveTo(-8, -10, -6, 0);
  c.fillStyle = '#2b2433'; c.fill(); c.strokeStyle = '#7a4ab0'; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = '#120c18'; c.beginPath(); c.ellipse(1, -14, 3.6, 4, 0, 0, TAU); c.fill();
  glowEyes(c, -0.2, -14.5, 2.8, 0.9, '#c27aff');
  c.restore();
}
function frostling(c: C, w: number) { // ice elemental, immune to cold
  legs(c, -4, 2, w, '#9fd8f0', '#5a9ac0', 2.2, 2.2);
  poly(c, [-4, -12, 0, -15, 4, -12, 3, -4, -3, -4], '#eaf6ff');
  poly(c, [-4, -12, 0, -15, 0, -4, -3, -4], '#bfe6ff', false);
  for (const [x, y, h] of [[-3, -15, 7], [1, -17, 9], [4, -15, 6]]) poly(c, [x - 1.5, y + 2, x, y - h + 2, x + 1.5, y + 2], '#cff2ff', true, 0.8);
  circ(c, 1, -13.5, 3, '#ffffff');
  glowEyes(c, 0, -13.8, 2.4, 0.8, '#3ab8ff');
  limb(c, 3, -10, 7, -7 + Math.sin(w) * 1.5, 1.4, '#cff2ff');
}
function hexling(c: C, w: number, time: number) { // purple warlock imp, immune to magic
  legs(c, -5, 2, w, '#4a2a7a', '#2a1440', 2.2, 2.2);
  poly(c, [-5, -14, 5, -14, 6, -3, -6, -3], '#8b4fd6');
  c.strokeStyle = '#ffe27a'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-2, -11); c.lineTo(0, -8); c.lineTo(2, -11); c.moveTo(0, -8); c.lineTo(0, -5); c.stroke();
  poly(c, [-5, -15, 7, -15, 1, -26], '#5a2a9a');
  circ(c, 1, -17, 3.4, '#b07ae8');
  glowEyes(c, 0.2, -17.5, 2.4, 0.8, '#ffe27a');
  const a = Math.sin(w) * 0.4;
  limb(c, 4, -11, 8, -13 + a * 2, 1.5, '#8b4fd6');
  c.save(); c.shadowColor = '#e8a0ff'; c.shadowBlur = 8; circ(c, 9.5, -15 + a * 2 + Math.sin(time * 6) * 0.8, 2.2, '#f2c8ff', false); c.restore();
}
function wraith(c: C, w: number) { // banshee: half dark, half pale
  const bob = Math.sin(w) * 1.5;
  c.save(); c.translate(0, bob - 2);
  c.beginPath(); c.moveTo(-7, 2); for (let i = 0; i <= 7; i++) c.lineTo(-7 + i * 2, 2 + (i % 2 ? -4 : 0) + Math.sin(w * 2 + i) * 1.2); c.quadraticCurveTo(9, -12, 3, -22); c.quadraticCurveTo(0, -25, -3, -22); c.quadraticCurveTo(-9, -12, -7, 2);
  c.save(); c.clip(); c.fillStyle = '#2b2433'; c.fillRect(-12, -26, 12, 30); c.fillStyle = '#e8eef7'; c.fillRect(0, -26, 12, 30); c.restore();
  c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = '#0a060e'; c.beginPath(); c.ellipse(1, -16, 4, 4.5, 0, 0, TAU); c.fill();
  glowEyes(c, -0.4, -16.5, 3, 0.95, '#9fe8ff');
  limb(c, -5, -12, -10, -8 + Math.sin(w) * 2, 1.2, '#2b2433'); limb(c, 5, -12, 10, -9 - Math.sin(w) * 2, 1.2, '#e8eef7');
  c.restore();
}
function ironclad(c: C, w: number) { // full plate knight, immune to sharp
  legs(c, -7, 3, w * 0.7, '#7a8494', '#3a4250', 3.2, 3.4);
  const g = c.createLinearGradient(-6, 0, 6, 0); g.addColorStop(0, '#dfe6ee'); g.addColorStop(0.5, '#a8b2be'); g.addColorStop(1, '#5a6270');
  poly(c, [-6, -19, 6, -19, 5.5, -7, -5.5, -7], g as unknown as string);
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, -18); c.lineTo(0, -8); c.stroke();
  for (const k of [-1, 1]) ell(c, k * 5.5, -18, 3, 2.4, '#c9d2de');
  // great helm
  c.beginPath(); c.moveTo(-4.5, -20); c.lineTo(-4.5, -27); c.quadraticCurveTo(0.5, -31, 5.5, -27); c.lineTo(5.5, -20); c.closePath(); c.fillStyle = '#c9d2de'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.1; c.stroke();
  c.fillStyle = '#1a1a20'; c.fillRect(-1, -25.5, 6.5, 1.4); c.fillRect(2, -25.5, 1.2, 4);
  // tower shield
  c.save(); c.translate(5, -12); poly(c, [-1, -8, 6, -8, 6, 4, 2.5, 8, -1, 4], '#5a6270', true, 1.2); c.strokeStyle = '#c9a35b'; c.lineWidth = 1; c.beginPath(); c.moveTo(2.5, -6); c.lineTo(2.5, 5); c.moveTo(0, -2); c.lineTo(5, -2); c.stroke(); c.restore();
}
function hydra(c: C, w: number, time: number) { // serpent with three heads, rainbow bands
  const cols = ['#e8403a', '#ff9a2a', '#ffe03a', '#4ac03a', '#3a8aff', '#a85aff'];
  for (let i = 5; i >= 0; i--) { const x = -10 + i * 2.6, y = -3 + Math.sin(w + i * 0.8) * 1.5; ell(c, x, y, 3.6, 3.2, cols[i]); }
  for (let h = 0; h < 3; h++) {
    const bx = 4 + h * 0.5, sway = Math.sin(time * 3 + h * 2) * 2;
    const tx = bx + (h - 1) * 5 + sway, ty = -16 - (h === 1 ? 4 : 0);
    c.strokeStyle = OUT; c.lineWidth = 4.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, -4); c.quadraticCurveTo(bx + (h - 1) * 2, -10, tx, ty); c.stroke();
    c.strokeStyle = cols[h * 2]; c.lineWidth = 3; c.stroke();
    const open = (Math.sin(time * 4 + h * 1.7) + 1) * 0.6;
    // serpent head: skull wedge, open jaw with fangs, slit eye, frill
    poly(c, [tx - 2, ty - 3.2, tx + 6.5, ty - 1.6 - open * 0.3, tx + 6.5, ty + 0.2, tx - 2, ty + 1.4], cols[h * 2 + 1], true, 0.9);
    poly(c, [tx - 1, ty + 1.4, tx + 5.5, ty + 1.2 + open, tx + 5, ty + 2.6 + open, tx - 1.5, ty + 2.6], shade(cols[h * 2 + 1], -40), true, 0.8);
    poly(c, [tx + 5.4, ty + 0.2, tx + 5.9, ty + 1.6 + open * 0.5, tx + 6.3, ty + 0.2], '#fff8e0', false);
    poly(c, [tx + 3.6, ty + 0.2, tx + 4.1, ty + 1.3 + open * 0.4, tx + 4.5, ty + 0.2], '#fff8e0', false);
    ell(c, tx + 2.2, ty - 1.6, 1.1, 0.8, '#ffe27a', false); c.fillStyle = '#1a0a04'; c.fillRect(tx + 2, ty - 2.3, 0.5, 1.4);
    poly(c, [tx - 2, ty - 3, tx - 5, ty - 6, tx - 3.5, ty - 1.5, tx - 6, ty - 1, tx - 2.5, ty + 0.5], shade(cols[h * 2], -30), true, 0.6);
  }
}
function golem(c: C, w: number, dmg = 0) { // stone golem with glowing rune core
  const s = Math.sin(w * 0.8);
  limb(c, -4, -8, -4 - s * 2, 3, 4.6, '#7a6a56'); limb(c, 4, -8, 4 + s * 2, 3, 4.6, '#7a6a56');
  poly(c, [-9, -24, 8, -26, 10, -9, -8, -8], '#9a8a74', true, 1.3);
  poly(c, [-9, -24, 0, -25, -2, -9, -8, -8], '#b0a08a', false);
  c.save(); c.shadowColor = '#ffb02e'; c.shadowBlur = 8; poly(c, [0, -20, 2.5, -17, 0, -14, -2.5, -17], '#ffcf5a', false); c.restore();
  poly(c, [-4, -30, 5, -31, 6, -24, -4, -24], '#a8987f', true, 1.2);
  glowEyes(c, -0.5, -27.5, 3.5, 0.9, '#ffb02e');
  limb(c, -8, -21, -12, -9 + s, 4, '#8a7a64'); limb(c, 9, -22, 13, -10 - s, 4, '#8a7a64');
  circ(c, -12, -8 + s, 3, '#9a8a74'); circ(c, 13, -9 - s, 3, '#9a8a74');
  if (dmg > 0) { c.strokeStyle = 'rgba(30,20,10,0.75)'; c.lineWidth = 1; for (let i = 0; i < Math.floor(dmg * 6); i++) { const a = i * 1.9; c.beginPath(); c.moveTo(Math.cos(a) * 2, -17 + Math.sin(a) * 2); c.lineTo(Math.cos(a + 0.3) * 8, -17 + Math.sin(a + 0.3) * 7); c.stroke(); } }
}

// ---------------------------------------------------------------- giants (drawn live)
function quad(c: C, w: number, len: number, h: number, hide: string, belly: string, legCol: string) { // four-legged beast body
  const legsX = [-len * 0.35, -len * 0.15, len * 0.2, len * 0.38];
  legsX.forEach((lx, i) => { const s = Math.sin(w + (i % 2 ? Math.PI : 0)) * h * 0.18; limb(c, lx, -h * 0.4, lx + s, 0, h * 0.2, i < 2 ? shade(legCol, -20) : legCol); });
  ell(c, 0, -h * 0.65, len * 0.55, h * 0.42, hide, true, 0, 1.6);
  ell(c, 0, -h * 0.45, len * 0.45, h * 0.2, belly, false);
}
function behemoth(c: C, w: number) { // armoured rhino-beast hauling a siege tower
  const L = 52, H = 34;
  quad(c, w, L, H, '#3a5f8f', '#5a7faf', '#2e4a70');
  for (let i = 0; i < 4; i++) poly(c, [-20 + i * 9, -H * 0.95, -13 + i * 9, -H * 0.98, -12 + i * 9, -H * 0.6, -21 + i * 9, -H * 0.55], '#7a8494', true, 1);
  // siege tower on back
  c.fillStyle = '#7a4e28'; c.fillRect(-14, -H * 1.75, 18, H * 0.85); c.strokeStyle = OUT; c.lineWidth = 1.4; c.strokeRect(-14, -H * 1.75, 18, H * 0.85);
  c.strokeStyle = '#4a2e18'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-14, -H * 1.75 + i * 7); c.lineTo(4, -H * 1.75 + i * 7); c.stroke(); }
  for (let i = 0; i < 3; i++) { c.fillStyle = '#7a4e28'; c.fillRect(-14 + i * 7, -H * 1.75 - 4, 4, 4); }
  c.fillStyle = '#c94a3a'; c.beginPath(); c.moveTo(-5, -H * 1.75 - 4); c.lineTo(-5, -H * 2.2); c.lineTo(3, -H * 2.05); c.lineTo(-5, -H * 1.95); c.fill();
  // head with horn
  ell(c, L * 0.55, -H * 0.62, 10, 8, '#4a6f9f', true, 0, 1.5);
  poly(c, [L * 0.62, -H * 0.8, L * 0.85, -H * 1.15, L * 0.68, -H * 0.62], '#f2ead6', true, 1.2);
  glowEyes(c, L * 0.55, -H * 0.72, 3, 1.2, '#ff3a3a');
}
function warbeast(c: C, w: number) { // war mammoth with howdah
  const L = 66, H = 46;
  quad(c, w, L, H, '#a8433a', '#c86a5a', '#7a2a24');
  c.strokeStyle = 'rgba(60,10,10,0.35)'; c.lineWidth = 1.2; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(-L * 0.4 + i * 7, -H * 0.95); c.lineTo(-L * 0.42 + i * 7, -H * 0.5); c.stroke(); }
  // howdah
  poly(c, [-18, -H * 1.02, 12, -H * 1.02, 10, -H * 1.5, -16, -H * 1.5], '#c9a35b', true, 1.4);
  c.fillStyle = '#7a2a6a'; c.fillRect(-16, -H * 1.75, 26, H * 0.25); c.strokeStyle = OUT; c.strokeRect(-16, -H * 1.75, 26, H * 0.25);
  c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(-3, -H * 1.75); c.lineTo(-3, -H * 2.25); c.lineTo(8, -H * 2.1); c.lineTo(-3, -H * 1.95); c.fill();
  // head, trunk, tusks
  ell(c, L * 0.55, -H * 0.72, 13, 12, '#b04a40', true, 0, 1.5);
  limb(c, L * 0.68, -H * 0.62, L * 0.78 + Math.sin(w) * 2, -H * 0.05, 4.5, '#a8433a');
  c.strokeStyle = OUT; c.lineWidth = 4.4; c.beginPath(); c.moveTo(L * 0.62, -H * 0.55); c.quadraticCurveTo(L * 0.9, -H * 0.5, L * 0.88, -H * 0.85); c.stroke(); c.strokeStyle = '#fff8e0'; c.lineWidth = 2.8; c.stroke();
  glowEyes(c, L * 0.56, -H * 0.82, 4, 1.4, '#ffd23a');
}
function colossus(c: C, w: number) { // iron construct giant
  const s = Math.sin(w * 0.7);
  limb(c, -9, -32, -10 - s * 4, 0, 9, '#4a5a4a'); limb(c, 9, -32, 10 + s * 4, 0, 9, '#36523a');
  const g = c.createLinearGradient(-22, 0, 22, 0); g.addColorStop(0, '#7a9a7a'); g.addColorStop(0.5, '#4a6a4a'); g.addColorStop(1, '#243424');
  poly(c, [-22, -72, 22, -74, 18, -30, -18, -30], g as unknown as string, true, 2);
  for (const [x, y] of [[-14, -66], [14, -66], [-14, -38], [14, -38]]) circ(c, x, y, 2, '#c9a35b');
  c.save(); c.shadowColor = '#7dff6a'; c.shadowBlur = 14; circ(c, 0, -52, 7, '#b6ff9a'); c.restore();
  ell(c, -24, -66, 9, 7, '#5a7a5a', true, 0, 1.6); ell(c, 24, -66, 9, 7, '#3a5a3a', true, 0, 1.6);
  limb(c, -26, -62, -30 + s * 3, -32, 8, '#4a6a4a'); limb(c, 26, -62, 30 - s * 3, -32, 8, '#36523a');
  poly(c, [-8, -86, 8, -86, 9, -74, -9, -74], '#5a7a5a', true, 1.6);
  glowEyes(c, -4, -80, 8, 1.8, '#7dff6a');
}
function golemKing(c: C, w: number) {
  c.save(); c.scale(2.3, 2.3); golem(c, w); c.restore();
  poly(c, [-9, -72, -9, -82, -5, -77, 0, -86, 5, -77, 9, -82, 9, -72], '#ffd23a', true, 1.4);
  circ(c, 0, -77, 2, '#e8403a');
}
function lich(c: C, w: number, time: number) { // floating skeletal sorcerer
  const bob = Math.sin(time * 1.5) * 3;
  c.save(); c.translate(0, bob - 8);
  const g = c.createRadialGradient(0, -30, 4, 0, -30, 48); g.addColorStop(0, 'rgba(160,100,255,0.45)'); g.addColorStop(1, 'rgba(90,40,160,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, -30, 48, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(-16, 8); for (let i = 0; i <= 8; i++) c.lineTo(-16 + i * 4, 8 + (i % 2 ? -7 : 0) + Math.sin(w + i) * 2); c.lineTo(12, -40); c.quadraticCurveTo(0, -50, -12, -40); c.closePath();
  c.fillStyle = '#3a2468'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
  c.strokeStyle = '#c9a35b'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -40); c.lineTo(0, 6); c.stroke();
  // skull
  circ(c, 1, -48, 9, '#e8e0d0', true, 1.6);
  c.fillStyle = '#1a0a24'; c.beginPath(); c.ellipse(-2, -49, 2.6, 3, 0, 0, TAU); c.ellipse(5, -49, 2.6, 3, 0, 0, TAU); c.fill();
  glowEyes(c, -2, -49, 7, 1.3, '#c27aff');
  for (let i = 0; i < 4; i++) c.fillRect(-2 + i * 2.2, -42, 1.2, 2.5);
  poly(c, [-8, -55, -6, -64, -3, -57, 1, -67, 5, -57, 8, -64, 10, -55], '#c9a35b', true, 1.2);
  // staff
  limb(c, 12, -30, 20, 6, 2.4, '#3a2a1a');
  c.save(); c.shadowColor = '#c27aff'; c.shadowBlur = 14; circ(c, 11, -34, 4.5, '#e8c8ff', false); c.restore();
  limb(c, 6, -36, 11, -32, 2, '#e8e0d0');
  c.restore();
}
function dragon(c: C, w: number, time: number) {
  const flap = Math.sin(time * 3) * 0.35;
  // far wing
  c.save(); c.translate(-6, -52); c.rotate(-0.4 - flap); poly(c, [0, 0, -38, -40, -26, -12, -44, -14, -24, 4, -36, 12, -8, 10], '#7a1a14', true, 1.6); c.restore();
  // tail
  c.strokeStyle = OUT; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-30, -30); c.quadraticCurveTo(-55, -20 + Math.sin(w) * 4, -70, -36); c.stroke(); c.strokeStyle = '#c23b2a'; c.lineWidth = 6.5; c.stroke();
  poly(c, [-70, -36, -80, -44, -76, -30], '#e8c45a', true, 1.2);
  quad(c, w, 70, 50, '#c23b2a', '#f2b05a', '#8a2014');
  for (let i = 0; i < 6; i++) poly(c, [-24 + i * 9, -48, -20 + i * 9, -58, -16 + i * 9, -48], '#e8c45a', true, 1);
  // neck + head
  c.strokeStyle = OUT; c.lineWidth = 15; c.beginPath(); c.moveTo(28, -40); c.quadraticCurveTo(42, -62, 50, -72); c.stroke(); c.strokeStyle = '#c23b2a'; c.lineWidth = 12; c.stroke();
  poly(c, [42, -80, 66, -76, 72, -68, 50, -64, 40, -70], '#d24a34', true, 1.6);
  poly(c, [46, -80, 40, -94, 52, -82], '#f2ead6', true, 1.2); poly(c, [54, -80, 52, -92, 60, -80], '#f2ead6', true, 1.2);
  glowEyes(c, 56, -74, 0, 1.8, '#ffe27a');
  if (Math.sin(time * 1.3) > 0.6) { c.save(); c.shadowColor = '#ff7a1a'; c.shadowBlur = 12; poly(c, [72, -68, 92, -76, 96, -62, 72, -64], 'rgba(255,170,40,0.8)', false); c.restore(); }
  // near wing
  c.save(); c.translate(4, -52); c.rotate(-0.2 + flap); poly(c, [0, 0, -30, -50, -18, -18, -36, -22, -14, 2, -26, 12, 0, 8], '#a82418', true, 1.6);
  c.strokeStyle = 'rgba(60,10,6,0.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(-30, -50); c.moveTo(0, 0); c.lineTo(-36, -22); c.moveTo(0, 0); c.lineTo(-26, 12); c.stroke(); c.restore();
}

// ---------------------------------------------------------------- dispatch + sprite cache
const SMALL: Record<string, (c: C, w: number, t: number) => void> = {
  imp, goblin, orc, troll, ogre, gloom, frostling, hexling: (c, w, t) => hexling(c, w, t), wraith, iron: ironclad, hydra: (c, w, t) => hydra(c, w, t), golem: (c, w) => golem(c, w),
};
/** Visual scale per type (world units), so power reads at a glance. */
export const ENEMY_SCALE: Record<string, number> = { imp: 0.95, goblin: 1.0, orc: 1.05, troll: 1.05, ogre: 1.05, gloom: 1.0, frostling: 1.0, hexling: 1.0, wraith: 1.05, iron: 1.05, hydra: 1.1, golem: 1.05, behemoth: 0.9, warbeast: 0.85, colossus: 0.8, golemking: 0.8, lich: 0.9, dragon: 0.75 };

const cache = new Map<string, HTMLCanvasElement>();
const FRAMES = 8;
function sprite(type: string, frame: number, flip: boolean, px: number, white: boolean): HTMLCanvasElement {
  const key = `${type}|${frame}|${flip ? 1 : 0}|${px}|${white ? 1 : 0}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const W = 48, H = 48; // world-units box, origin at (24, 40)
  cv = document.createElement('canvas'); cv.width = Math.ceil(W * px); cv.height = Math.ceil(H * px);
  const c = cv.getContext('2d')!;
  c.scale(px, px); c.translate(24, 40);
  const s = ENEMY_SCALE[type] ?? 1;
  c.scale(flip ? -s : s, s);
  SMALL[type](c, (frame / FRAMES) * TAU, frame * 0.4);
  if (white) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(0, 0, cv.width, cv.height); }
  cache.set(key, cv);
  return cv;
}

export interface EnemyLike { type: string; x: number; y: number; angle: number; wob: number; hp: number; maxHp: number; flash: number; def: { giant?: boolean; boss?: boolean; radius: number } }

/** Draw an enemy model. px = device pixels per world unit (for crisp sprites). */
export function drawEnemyModel(c: C, e: EnemyLike, time: number, px: number) {
  const flip = Math.cos(e.angle) < -0.1;
  const r = e.def.radius;
  // ground shadow
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(e.x + 1.5, e.y + 1, r * (e.def.giant ? 1.25 : 0.95), r * 0.38, 0, 0, TAU); c.fill();
  const walk = e.wob;
  if (SMALL[e.type]) {
    const frame = ((Math.floor((walk / TAU) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
    const img = sprite(e.type, frame, flip, Math.max(1, Math.round(px * 2) / 2), e.flash > 0);
    c.drawImage(img, e.x - 24, e.y + 2 - 40, 48, 48);
    if (e.type === 'golem' && e.hp < e.maxHp) { // live damage cracks
      c.save(); c.translate(e.x, e.y + 2); c.scale(flip ? -1.05 : 1.05, 1.05);
      c.strokeStyle = 'rgba(30,20,10,0.8)'; c.lineWidth = 1; for (let i = 0; i < Math.floor((1 - e.hp / e.maxHp) * 6); i++) { const a = i * 1.9; c.beginPath(); c.moveTo(Math.cos(a) * 2, -17 + Math.sin(a) * 2); c.lineTo(Math.cos(a + 0.3) * 8, -17 + Math.sin(a + 0.3) * 7); c.stroke(); }
      c.restore();
    }
    return;
  }
  c.save(); c.translate(e.x, e.y + 2);
  const s = ENEMY_SCALE[e.type] ?? 1;
  c.scale(flip ? -s : s, s);
  if (e.flash > 0) c.globalAlpha *= 0.85;
  switch (e.type) {
    case 'behemoth': behemoth(c, walk); break;
    case 'warbeast': warbeast(c, walk); break;
    case 'colossus': colossus(c, walk); break;
    case 'golemking': golemKing(c, walk); break;
    case 'lich': lich(c, walk, time); break;
    case 'dragon': dragon(c, walk, time); break;
  }
  c.restore();
}

/** Height in world units above the feet, for hp bars and status icons. */
export function enemyHeight(type: string): number {
  const H: Record<string, number> = { imp: 22, goblin: 22, orc: 26, troll: 30, ogre: 38, gloom: 24, frostling: 22, hexling: 28, wraith: 28, iron: 32, hydra: 24, golem: 33, behemoth: 72, warbeast: 98, colossus: 72, golemking: 72, lich: 70, dragon: 75 };
  return (H[type] ?? 24) * (ENEMY_SCALE[type] ?? 1);
}
