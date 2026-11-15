// Character art for every tower and hero, drawn in code.
// 3/4 view: each unit stands on a stone pedestal, faces its target, and
// visibly changes with upgrades (trim, glow, path-themed gear).
type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export interface Pose { aim: number; anim: number; time: number; tiers: number[]; level: number; hero: boolean }

function rr(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function circ(c: C, x: number, y: number, r: number, fill: string, stroke?: string, lw = 1) {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function poly(c: C, pts: number[], fill: string, stroke?: string, lw = 1) {
  c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function line(c: C, x1: number, y1: number, x2: number, y2: number, col: string, w: number) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
const OUT = 'rgba(20,12,30,0.85)';

// ---------------------------------------------------------------- shared parts
function pedestal(c: C, r: number, top: number, time: number, stone = '#b9b0a3', stoneDark = '#7d7468') {
  // shadow
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(1.5, 9, r + 3, r * 0.5, 0, 0, TAU); c.fill();
  // side
  c.fillStyle = stoneDark; c.beginPath(); c.ellipse(0, 7, r, r * 0.45, 0, 0, Math.PI); c.lineTo(-r, 3); c.ellipse(0, 3, r, r * 0.45, 0, Math.PI, 0, true); c.closePath(); c.fill();
  // top
  c.fillStyle = stone; c.beginPath(); c.ellipse(0, 3, r, r * 0.45, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.45, 3 + Math.sin(a) * r * 0.2); c.lineTo(Math.cos(a) * r, 3 + Math.sin(a) * r * 0.45); c.stroke(); }
  c.beginPath(); c.ellipse(0, 3, r * 0.45, r * 0.2, 0, 0, TAU); c.stroke();
  if (top >= 3) { c.strokeStyle = top >= 5 ? '#ffd76a' : '#d9b45a'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, 3, r - 0.5, r * 0.45 - 0.5, 0, 0, TAU); c.stroke(); }
  if (top >= 5) {
    const g = 0.35 + Math.sin(time * 3) * 0.15;
    c.strokeStyle = `rgba(255,220,110,${g})`; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 3, r + 3, r * 0.45 + 2, 0, 0, TAU); c.stroke();
  }
}

interface Body { skin: string; torso: string; torso2: string; legs: string; boots: string; cape?: string; capeLen?: number; belt?: string; slim?: number }
/** Lean humanoid: feet at y=4, head centered at y=-19. Draws legs, cape, torso and head (no arms). */
function humanoid(c: C, b: Body, time: number, bob = 0) {
  const s = b.slim ?? 1;
  const y0 = bob;
  if (b.cape) {
    const sway = Math.sin(time * 2.2) * 1.2;
    const len = b.capeLen ?? 16;
    poly(c, [-4 * s, -13 + y0, 4 * s, -13 + y0, 6 * s + sway, -13 + len + y0, -1 + sway, -13 + len + 1 + y0, -7 * s + sway, -13 + len + y0], b.cape, OUT, 0.8);
  }
  // legs
  c.fillStyle = b.legs; rr(c, -3.2 * s, -3 + y0, 2.6 * s, 7.5 - y0, 1); c.fill(); rr(c, 0.6 * s, -3 + y0, 2.6 * s, 7.5 - y0, 1); c.fill();
  c.fillStyle = b.boots; rr(c, -3.6 * s, 2.2, 3.3 * s, 2.3, 1); c.fill(); rr(c, 0.4 * s, 2.2, 3.3 * s, 2.3, 1); c.fill();
  // torso
  c.beginPath(); c.moveTo(-4.6 * s, -14 + y0); c.lineTo(4.6 * s, -14 + y0); c.lineTo(3.8 * s, -2 + y0); c.lineTo(-3.8 * s, -2 + y0); c.closePath();
  const g = c.createLinearGradient(-5, 0, 5, 0); g.addColorStop(0, b.torso2); g.addColorStop(0.5, b.torso); g.addColorStop(1, b.torso2);
  c.fillStyle = g; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  if (b.belt) { c.fillStyle = b.belt; c.fillRect(-4 * s, -5 + y0, 8 * s, 1.6); c.fillStyle = '#e8c45a'; c.fillRect(-0.8, -5.2 + y0, 1.6, 2); }
  // neck + head
  c.fillStyle = b.skin; c.fillRect(-1, -16 + y0, 2, 2.5);
  circ(c, 0, -19 + y0, 4, b.skin, OUT, 0.8);
}
/** Arm from shoulder rotated to angle; returns hand position. */
function arm(c: C, sx: number, sy: number, ang: number, len: number, sleeve: string, hand: string, w = 2.4) {
  const hx = sx + Math.cos(ang) * len, hy = sy + Math.sin(ang) * len;
  line(c, sx, sy, hx, hy, OUT, w + 1.4); line(c, sx, sy, hx, hy, sleeve, w);
  circ(c, hx, hy, 1.4, hand);
  return { x: hx, y: hy };
}
function eye(c: C, x: number, y: number) { circ(c, x, y, 0.75, '#1a1020'); }
const clampAim = (a: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, a));

// ---------------------------------------------------------------- towers
function archer(c: C, p: Pose) {
  const [v, h, e] = p.tiers;
  const cloak = e >= 3 ? '#b3451f' : h >= 3 ? '#2d5f8a' : '#2f6b34';
  const draw = p.anim > 0 ? 1 : 0;
  // quiver on back
  c.save(); c.translate(-3.5, -9); c.rotate(-0.35);
  c.fillStyle = '#6b4424'; rr(c, -1.8, -5, 3.6, 10, 1); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.7; c.stroke();
  const n = 3 + Math.min(3, v);
  for (let i = 0; i < n; i++) { line(c, -1 + i * 0.6, -5, -1.5 + i * 0.9, -8.5, '#d9d0c0', 0.7); poly(c, [-2 + i * 0.9, -8.5, -1 + i * 0.9, -8.5, -1.5 + i * 0.9, -10.5], e >= 2 ? '#ff7a1a' : '#e8e8e8'); }
  c.restore();
  humanoid(c, { skin: '#f1c79a', torso: '#7a5532', torso2: '#5a3c22', legs: '#3b4a2a', boots: '#4a2e18', cape: cloak, capeLen: 17, belt: '#3a2414', slim: 0.92 }, p.time);
  // hood
  c.beginPath(); c.moveTo(-5, -18); c.quadraticCurveTo(-5, -25.5, 0.5, -25); c.quadraticCurveTo(5.5, -24.5, 4.8, -17.5); c.quadraticCurveTo(2, -20, -1, -16); c.closePath();
  c.fillStyle = cloak; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  eye(c, 2.2, -19); poly(c, [3.6, -19.5, 6.2, -21.5, 4, -18], '#f1c79a'); // elf ear
  if (h >= 2) { poly(c, [-3, -24, -6.5, -29, -2, -24.5], '#f0efe6', OUT, 0.5); }
  // bow arm
  const a = clampAim(p.aim, -1.2, 1.0);
  const hand = arm(c, 1.5, -12, a, 7.5, '#7a5532', '#f1c79a');
  c.save(); c.translate(hand.x, hand.y); c.rotate(a);
  const big = h >= 3 ? 1.2 : 1;
  c.strokeStyle = e >= 4 ? '#ffcf4a' : '#5b3818'; c.lineWidth = 1.8;
  c.beginPath(); c.arc(-2, 0, 8 * big, -1.25, 1.25); c.stroke();
  const pull = draw ? -5 : -3;
  c.strokeStyle = '#e8e2d0'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-2 + Math.cos(-1.25) * 8 * big, Math.sin(-1.25) * 8 * big); c.lineTo(pull, 0); c.lineTo(-2 + Math.cos(1.25) * 8 * big, Math.sin(1.25) * 8 * big); c.stroke();
  line(c, pull, 0, 7, 0, '#c9a36b', 0.9);
  poly(c, [7, -1.4, 9.5, 0, 7, 1.4], e >= 2 ? '#ff7a1a' : '#d9d9d9');
  if (e >= 2) circ(c, 9.5, 0, 1.6 + Math.sin(p.time * 20) * 0.4, 'rgba(255,170,40,0.7)');
  c.restore();
  arm(c, -1.5, -12, a + 0.15, 4.5, '#7a5532', '#f1c79a');
}

function knight(c: C, p: Pose) {
  const [w, holy, guard] = p.tiers;
  const plate = holy >= 3 ? '#e8d48a' : '#c9d2de', plate2 = holy >= 3 ? '#b8963a' : '#8e98a8';
  const swing = p.anim > 0 ? (0.15 - p.anim) / 0.15 : 0;
  humanoid(c, { skin: '#f0c49a', torso: plate, torso2: plate2, legs: plate2, boots: '#5a6070', cape: '#b02a2a', capeLen: 16, belt: '#4a3020' }, p.time);
  // helmet
  c.beginPath(); c.arc(0, -19.5, 4.6, Math.PI, 0); c.lineTo(4.6, -17); c.lineTo(-4.6, -17); c.closePath();
  c.fillStyle = plate; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  c.fillStyle = '#1a1020'; c.fillRect(0.5, -20, 4, 1.2);
  // plume
  const pc = holy >= 3 ? '#ffffff' : '#d93030';
  c.beginPath(); c.moveTo(-1, -24); c.quadraticCurveTo(-7, -29 + Math.sin(p.time * 3), -9, -21); c.quadraticCurveTo(-5, -25, -1, -23); c.fillStyle = pc; c.fill();
  // sword arm
  const a = -1.9 + swing * 3.2 + (w >= 3 ? Math.sin(p.time * 8) * 0.1 : 0);
  const hand = arm(c, 2.5, -12.5, a, 6, plate2, plate);
  c.save(); c.translate(hand.x, hand.y); c.rotate(a + Math.PI / 2 - 0.2);
  const blade = holy >= 4 ? '#fff6c8' : '#eef3fa';
  const L = w >= 4 ? 17 : 14;
  poly(c, [-1.2, 0, 1.2, 0, 0.8, -L, 0, -L - 2.5, -0.8, -L], blade, OUT, 0.6);
  c.fillStyle = '#c9a35b'; c.fillRect(-3.5, -0.5, 7, 1.6); c.fillStyle = '#5a3818'; c.fillRect(-0.8, 1, 1.6, 3);
  if (holy >= 4) { c.globalAlpha *= 0.5; poly(c, [-2.5, 0, 2.5, 0, 0, -L - 4], '#fff6b0'); c.globalAlpha /= 0.5; }
  c.restore();
  // shield
  const big = guard >= 3;
  c.save(); c.translate(-4, -8);
  const sh = big ? [-5, -8, 4, -8, 4, 4, -0.5, 8, -5, 4] : [-4, -6, 3.5, -6, 3.5, 2, -0.25, 6, -4, 2];
  poly(c, sh, holy >= 3 ? '#f2e2a0' : '#2f5fb8', OUT, 1);
  c.strokeStyle = '#e8c45a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-0.25, big ? -6 : -4.5); c.lineTo(-0.25, big ? 5 : 4); c.moveTo(big ? -3.5 : -2.8, -2); c.lineTo(big ? 2.5 : 2.2, -2); c.stroke();
  c.restore();
}

function barracks(c: C, p: Pose) {
  const [sw, wm, ra] = p.tiers;
  const top = Math.max(...p.tiers);
  // stone base
  c.fillStyle = '#9a9184'; rr(c, -13, -7, 26, 11, 1.5); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.2)'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-13, -3 + i * 3); c.lineTo(13, -3 + i * 3); c.stroke(); }
  // timber walls
  c.fillStyle = '#c8a070'; c.fillRect(-11, -18, 22, 11); c.strokeStyle = OUT; c.strokeRect(-11, -18, 22, 11);
  c.strokeStyle = '#6b4424'; c.lineWidth = 1.4;
  for (const x of [-11, -3, 3, 11]) { c.beginPath(); c.moveTo(x, -18); c.lineTo(x, -7); c.stroke(); }
  c.beginPath(); c.moveTo(-11, -12.5); c.lineTo(-3, -12.5); c.moveTo(3, -12.5); c.lineTo(11, -12.5); c.stroke();
  // door
  c.fillStyle = '#4a2e18'; c.beginPath(); c.moveTo(-2.6, -2); c.lineTo(-2.6, -9); c.arc(0, -9, 2.6, Math.PI, 0); c.lineTo(2.6, -2); c.fill();
  // roof
  const roof = sw >= 3 ? '#4a5a7a' : '#b8432f';
  poly(c, [-14, -17, 0, -28, 14, -17], roof, OUT, 0.8);
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.7; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-14 + i * 3.5, -17 - i * 2.75 + 0.5); c.lineTo(14 - i * 3.5, -17 - i * 2.75 + 0.5); c.stroke(); }
  // side towers on higher tiers
  if (top >= 3) for (const sx of [-14, 14]) { c.fillStyle = '#a89e90'; c.fillRect(sx - 3, -16, 6, 20); c.strokeStyle = OUT; c.strokeRect(sx - 3, -16, 6, 20); for (let i = 0; i < 3; i++) c.fillRect(sx - 3 + i * 2.2, -18, 1.4, 2); }
  // weapons rack
  if (wm >= 1) { line(c, 8, -1, 12, -10, '#6b4424', 1); poly(c, [12, -10, 13, -13, 11, -11], '#dfe6ee'); }
  // banner
  line(c, 0, -28, 0, -38, '#5a3818', 1.2);
  const flag = ra >= 3 ? '#2fa83c' : top >= 5 ? '#ffd23a' : '#c94a3a';
  const wv = Math.sin(p.time * 5) * 1.5;
  c.beginPath(); c.moveTo(0, -38); c.quadraticCurveTo(5, -38 + wv, 9, -36); c.lineTo(9, -32); c.quadraticCurveTo(5, -33 + wv, 0, -32); c.closePath(); c.fillStyle = flag; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.6; c.stroke();
  poly(c, [3.5, -36.5, 4.5, -34.5, 5.5, -36.5, 4.5, -33.5], '#fff3c4');
}

function mage(c: C, p: Pose, hero = false) {
  const [pyro, arc, met] = p.tiers;
  const robe = hero ? '#5b3fc0' : arc >= 3 ? '#2f4fb8' : '#b02a24';
  const robe2 = hero ? '#3a2788' : arc >= 3 ? '#1f357a' : '#7a1a14';
  const fire = hero ? '#ffe27a' : arc >= 2 ? '#7fd8ff' : '#ff8a1a';
  // long robe instead of legs
  c.beginPath(); c.moveTo(-4.6, -14); c.lineTo(4.6, -14); c.lineTo(6, 4); c.lineTo(-6, 4); c.closePath();
  const g = c.createLinearGradient(-6, 0, 6, 0); g.addColorStop(0, robe2); g.addColorStop(0.5, robe); g.addColorStop(1, robe2);
  c.fillStyle = g; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  c.strokeStyle = '#e8c45a'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -13); c.lineTo(0, 4); c.moveTo(-6, 3.4); c.lineTo(6, 3.4); c.stroke();
  c.fillStyle = '#3a2414'; c.fillRect(-4.2, -6, 8.4, 1.4);
  // head + beard
  circ(c, 0, -19, 4, '#f0c49a', OUT, 0.8);
  if (hero) { c.fillStyle = '#e8e8f8'; c.beginPath(); c.arc(0, -19.5, 4.4, Math.PI * 0.9, Math.PI * 2.1); c.lineTo(-4.6, -13); c.fill(); }
  else { c.fillStyle = '#e9e4da'; c.beginPath(); c.moveTo(-3, -17.5); c.quadraticCurveTo(0, -11, 3.4, -17.5); c.fill(); }
  eye(c, 2, -19.5);
  // hat
  c.beginPath(); c.ellipse(0, -22, 7, 1.8, 0, 0, TAU); c.fillStyle = robe2; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.7; c.stroke();
  const tip = Math.sin(p.time * 1.5) * 1.2;
  poly(c, [-4.2, -22.5, 4.2, -22.5, -2 + tip, -35], robe, OUT, 0.8);
  c.fillStyle = '#e8c45a'; c.fillRect(-4, -24, 8, 1.4);
  circ(c, 0.3, -28, 1, '#ffe27a');
  // staff arm
  const a = clampAim(p.aim, -1.3, 0.9);
  const hand = arm(c, 2.5, -12, a * 0.4 - 0.6, 6, robe, '#f0c49a');
  line(c, hand.x - 1, hand.y + 9, hand.x + 1.5, hand.y - 9, '#6b4424', 1.6);
  const ox = hand.x + 1.6, oy = hand.y - 11;
  const pulse = 2.6 + Math.sin(p.time * 7) * 0.5 + (p.anim > 0 ? 1.5 : 0);
  const og = c.createRadialGradient(ox, oy, 0.2, ox, oy, pulse * 2.4);
  og.addColorStop(0, '#ffffff'); og.addColorStop(0.35, fire); og.addColorStop(1, 'rgba(255,120,0,0)');
  c.fillStyle = og; c.beginPath(); c.arc(ox, oy, pulse * 2.4, 0, TAU); c.fill();
  if (!hero && (pyro >= 1 || met >= 1)) for (let i = 0; i < 3; i++) { const t = (p.time * 1.6 + i / 3) % 1; circ(c, ox + Math.sin(i * 2 + p.time * 4) * 2, oy - t * 8, 1.2 * (1 - t), fire); }
  if (!hero && met >= 3) { const ang = p.time * 2; circ(c, Math.cos(ang) * 11, -16 + Math.sin(ang) * 4, 2.4, '#6a4a3a', OUT, 0.6); circ(c, Math.cos(ang) * 11 - 0.6, -16.5 + Math.sin(ang) * 4, 1, '#ff9a2a'); }
  if (hero) for (let i = 0; i < 4; i++) { const ang = p.time * 1.4 + (i * TAU) / 4; c.fillStyle = '#ffe27a'; c.font = '4px sans-serif'; c.textAlign = 'center'; c.fillText('✦', Math.cos(ang) * 10, -14 + Math.sin(ang) * 4); }
  arm(c, -2.5, -12, 2.2, 5, robe, '#f0c49a');
}

function druid(c: C, p: Pose) {
  const [deep, wild, bliz] = p.tiers;
  const cloak = wild >= 2 ? '#3f7a3a' : '#2f8fb0', cloak2 = wild >= 2 ? '#24502a' : '#1d5f78';
  // flowing robe
  c.beginPath(); c.moveTo(-4.4, -14); c.lineTo(4.4, -14); c.lineTo(6.5, 4); c.quadraticCurveTo(0, 2.5, -6.5, 4); c.closePath();
  const g = c.createLinearGradient(-6, 0, 6, 0); g.addColorStop(0, cloak2); g.addColorStop(0.5, cloak); g.addColorStop(1, cloak2);
  c.fillStyle = g; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  c.strokeStyle = '#d9f5ff'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-6.3, 3); c.quadraticCurveTo(0, 1.5, 6.3, 3); c.stroke();
  // vine belt / leaves
  c.fillStyle = '#5aa04a'; c.fillRect(-4.2, -6, 8.4, 1.3);
  if (wild >= 1) for (let i = 0; i < 3; i++) poly(c, [-3 + i * 3, -6, -2 + i * 3, -8.5, -1 + i * 3, -6], '#7fd06a');
  // hooded head
  circ(c, 0, -19, 4, '#e8d0b8', OUT, 0.8);
  c.beginPath(); c.moveTo(-5, -16); c.quadraticCurveTo(-5.5, -25, 0, -24.8); c.quadraticCurveTo(5.5, -25, 5, -16); c.quadraticCurveTo(2.5, -21, 0, -21); c.quadraticCurveTo(-2.5, -21, -5, -16);
  c.fillStyle = cloak; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.7; c.stroke();
  circ(c, 1.2, -18.5, 0.8, '#7fe8ff'); circ(c, -1.2, -18.5, 0.8, '#7fe8ff');
  // ice crown / antlers
  const crown = wild >= 2 ? '#8a6a3a' : '#cff6ff';
  for (const sx of [-1, 1]) { line(c, sx * 2.5, -24, sx * 5, -29, crown, 1.2); line(c, sx * 4, -27, sx * 6.5, -27.5, crown, 1); }
  // staff
  const hand = arm(c, 2.5, -12, -0.5, 6, cloak2, '#e8d0b8');
  line(c, hand.x, hand.y + 10, hand.x + 0.5, hand.y - 10, '#7a5a3a', 1.6);
  const cx = hand.x + 0.5, cy = hand.y - 12;
  poly(c, [cx, cy - 4.5, cx + 2.4, cy, cx, cy + 3, cx - 2.4, cy], deep >= 3 ? '#ffffff' : '#9fe8ff', '#3a9fbf', 0.6);
  // orbiting snowflakes
  const n = 3 + Math.min(3, bliz);
  for (let i = 0; i < n; i++) {
    const ang = p.time * (1 + bliz * 0.2) + (i * TAU) / n;
    const fx = Math.cos(ang) * (10 + bliz), fy = -10 + Math.sin(ang) * 4;
    c.strokeStyle = 'rgba(220,250,255,0.9)'; c.lineWidth = 0.6;
    for (let k = 0; k < 3; k++) { const a2 = (k * Math.PI) / 3; c.beginPath(); c.moveTo(fx - Math.cos(a2) * 1.6, fy - Math.sin(a2) * 1.6); c.lineTo(fx + Math.cos(a2) * 1.6, fy + Math.sin(a2) * 1.6); c.stroke(); }
  }
  arm(c, -2.5, -12, 2.4, 5, cloak2, '#e8d0b8');
}

function cannon(c: C, p: Pose, gunnerOnly = false) {
  const [big, rapid, conc] = p.tiers;
  const a = clampAim(p.aim, -0.9, 0.5);
  const kick = p.anim > 0 ? -2 : 0;
  if (!gunnerOnly) {
    // carriage
    c.fillStyle = '#7a4a24'; poly(c, [-9, 2, 6, 2, 3, -5, -7, -5], '#7a4a24', OUT, 0.8);
    for (const wx of [-6, 3]) { circ(c, wx, 2, 3.6, '#5a3818', OUT, 0.8); c.strokeStyle = '#c9a35b'; c.lineWidth = 0.7; for (let k = 0; k < 4; k++) { const aa = k * Math.PI / 4; c.beginPath(); c.moveTo(wx - Math.cos(aa) * 3, 2 - Math.sin(aa) * 3); c.lineTo(wx + Math.cos(aa) * 3, 2 + Math.sin(aa) * 3); c.stroke(); } circ(c, wx, 2, 1, '#c9a35b'); }
    // barrel(s)
    const barrels = rapid >= 2 ? 2 : 1;
    for (let b = 0; b < barrels; b++) {
      c.save(); c.translate(-1, -6 - b * 3.5); c.rotate(a);
      const L = big >= 3 ? 16 : 13, R = big >= 1 ? 3.6 : 3;
      const g = c.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#e0b060'); g.addColorStop(0.5, '#b07a2a'); g.addColorStop(1, '#6a4410');
      c.fillStyle = g; rr(c, -4 + kick, -R, L, R * 2, R * 0.8); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = '#4a2e10'; c.fillRect(L - 6 + kick, -R - 0.6, 2, R * 2 + 1.2); c.fillRect(-1 + kick, -R - 0.4, 1.5, R * 2 + 0.8);
      circ(c, L - 4 + kick, 0, R * 0.55, '#1a1010');
      if (conc >= 3) { c.strokeStyle = '#7fd8ff'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(2 + kick, -R); c.lineTo(5 + kick, R); c.lineTo(8 + kick, -R); c.stroke(); }
      c.restore();
    }
    if (p.anim > 0) circ(c, -1 + Math.cos(a) * 15, -6 + Math.sin(a) * 15, 3 + p.anim * 10, 'rgba(255,200,120,0.6)');
  }
  // dwarf gunner standing behind
  c.save(); c.translate(gunnerOnly ? 0 : -10, gunnerOnly ? 0 : -1); if (!gunnerOnly) c.scale(0.85, 0.85);
  humanoid(c, { skin: '#f0b890', torso: '#7a4a8a', torso2: '#5a3068', legs: '#4a3a2a', boots: '#2a1a10', belt: '#3a2414', slim: 1.08 }, p.time, 1.5);
  // beard
  c.fillStyle = gunnerOnly ? '#c94a1a' : '#d9822a'; c.beginPath(); c.moveTo(-3.8, -18); c.quadraticCurveTo(-3, -9, 0, -8); c.quadraticCurveTo(3, -9, 3.8, -18); c.quadraticCurveTo(0, -15, -3.8, -18); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(-1, -14); c.lineTo(-1, -9.5); c.moveTo(1.2, -14); c.lineTo(1.2, -9.5); c.stroke();
  eye(c, 1.8, -19.2);
  // horned helmet
  c.beginPath(); c.arc(0, -19.8, 4.4, Math.PI, 0); c.fillStyle = '#9aa4b0'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.7; c.stroke();
  c.fillStyle = '#c9a35b'; c.fillRect(-4.4, -20.5, 8.8, 1.2);
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 3.8, -21); c.quadraticCurveTo(sx * 8, -22, sx * 7.5, -27); c.quadraticCurveTo(sx * 6, -23.5, sx * 3.2, -23); c.fillStyle = '#f2ead6'; c.fill(); c.stroke(); }
  if (gunnerOnly) {
    // hero: goggles + blunderbuss
    c.fillStyle = '#ffcc33'; c.fillRect(-1, -21.6, 5.4, 1.8); circ(c, 2, -20.6, 1.1, '#9fe0ff', OUT, 0.4);
    const ang = clampAim(p.aim, -0.9, 0.6);
    const hand = arm(c, 2.5, -12, ang, 5, '#7a4a8a', '#f0b890', 2.8);
    c.save(); c.translate(hand.x, hand.y); c.rotate(ang);
    c.fillStyle = '#5a3818'; rr(c, -5, -1, 6, 2.4, 1); c.fill();
    c.fillStyle = '#9a7a4a'; rr(c, 0, -1.3, 10 + (p.anim > 0 ? -1 : 0), 2.6, 0.8); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.6; c.stroke();
    c.beginPath(); c.moveTo(9, -1.3); c.lineTo(12, -3); c.lineTo(12, 3); c.lineTo(9, 1.3); c.fillStyle = '#b8964a'; c.fill(); c.stroke();
    c.restore();
  } else {
    // holding a torch to the fuse
    const hand = arm(c, 2.5, -12, -0.2, 5.5, '#7a4a8a', '#f0b890', 2.8);
    line(c, hand.x, hand.y, hand.x + 4, hand.y - 4, '#5a3818', 1);
    circ(c, hand.x + 4.5, hand.y - 5, 1.3 + Math.sin(p.time * 20) * 0.3, '#ffb02e');
  }
  c.restore();
}

function ballista(c: C, p: Pose) {
  const [siege, rep, shrap] = p.tiers;
  const a = clampAim(p.aim, -0.8, 0.6);
  const kick = p.anim > 0 ? 1 : 0;
  // turntable base
  c.fillStyle = '#6b4424'; rr(c, -8, -4, 16, 6, 1.5); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  line(c, -6, 2, -9, 6, '#5a3818', 2); line(c, 6, 2, 9, 6, '#5a3818', 2);
  c.save(); c.translate(0, -7); c.rotate(a);
  // stock
  const wood = rep >= 3 ? '#4a3a2a' : '#8a5a2e';
  c.fillStyle = wood; rr(c, -12, -2, 24, 4, 1); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  c.fillStyle = '#8a96a3'; for (const x of [-9, -2, 5]) c.fillRect(x, -2.3, 1.5, 4.6);
  // bow arms (seen from above-ish, curving back)
  const span = siege >= 3 ? 13 : 11;
  c.strokeStyle = siege >= 4 ? '#c9a35b' : '#5a3818'; c.lineWidth = 2.4;
  c.beginPath(); c.moveTo(7, 0); c.quadraticCurveTo(9, -span * 0.6, 3, -span); c.moveTo(7, 0); c.quadraticCurveTo(9, span * 0.6, 3, span); c.stroke();
  // string pulled
  const pull = p.anim > 0 ? -1 : -7;
  c.strokeStyle = '#e8e2d0'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(3, -span); c.lineTo(pull, 0); c.lineTo(3, span); c.stroke();
  // bolt
  if (p.anim <= 0.05) {
    line(c, pull, 0, 15, 0, '#c9a36b', 1.4);
    poly(c, [15, -2, 19, 0, 15, 2], shrap >= 2 ? '#ff9a2a' : '#dfe6ee', OUT, 0.5);
  }
  if (rep >= 2) { c.fillStyle = '#4a2e18'; rr(c, -6, -6 - kick, 6, 4, 0.8); c.fill(); for (let i = 0; i < 3; i++) line(c, -5 + i * 2, -6, -5 + i * 2, -3, '#c9a36b', 0.6); }
  c.restore();
  // crank wheel
  circ(c, -6, -5, 2.6, '#5a3818', OUT, 0.7); line(c, -6, -5, -6 + Math.cos(p.time * 4) * 2.2, -5 + Math.sin(p.time * 4) * 2.2, '#c9a35b', 0.8);
  if (shrap >= 1) { circ(c, 7, -2, 2, '#2a3a5a', OUT, 0.5); circ(c, 7.6, -2.4, 0.7, '#9fe0ff'); }
}

function alchemist(c: C, p: Pose) {
  const [acid, brew, gold] = p.tiers;
  const liquid = gold >= 2 ? '#ffd23a' : brew >= 2 ? '#ff5ad2' : '#8eff3a';
  // cauldron to the side
  c.save(); c.translate(-8, 0);
  c.fillStyle = '#ff8a2a'; c.globalAlpha *= 0.6; c.beginPath(); c.ellipse(0, 3.5, 4, 1.5, 0, 0, TAU); c.fill(); c.globalAlpha /= 0.6;
  c.beginPath(); c.arc(0, -2, 5.5, 0, Math.PI); c.lineTo(-5.5, -2); c.fillStyle = gold >= 3 ? '#c9a35b' : '#2a2a30'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
  c.beginPath(); c.ellipse(0, -2, 5.8, 1.6, 0, 0, TAU); c.fillStyle = gold >= 3 ? '#e0c060' : '#3a3a44'; c.fill(); c.stroke();
  c.beginPath(); c.ellipse(0, -2, 4.6, 1.1, 0, 0, TAU); c.fillStyle = liquid; c.fill();
  for (let i = 0; i < 3; i++) { const t = (p.time * 0.8 + i / 3) % 1; c.globalAlpha *= 1 - t; circ(c, Math.sin(i * 3 + p.time) * 2, -3 - t * 10, 1 + t * 1.5, liquid); c.globalAlpha /= Math.max(0.01, 1 - t); }
  c.restore();
  c.globalAlpha = Math.min(1, c.globalAlpha);
  // alchemist
  c.save(); c.translate(3, 0);
  humanoid(c, { skin: '#e8c4a0', torso: '#5a4a6a', torso2: '#3a2e48', legs: '#3a3030', boots: '#2a1a10', belt: '#6b4424', slim: 0.9 }, p.time);
  // leather apron
  poly(c, [-3.4, -10, 3.4, -10, 3.8, -1, -3.8, -1], '#8a5a32', OUT, 0.6);
  if (acid >= 2) { circ(c, -1, -5, 0.9, '#8eff3a'); circ(c, 1.5, -3, 0.7, '#8eff3a'); }
  // wild hair + goggles
  c.fillStyle = '#e8e8e8'; for (let i = 0; i < 5; i++) circ(c, -3.5 + i * 1.6, -22.5 + Math.abs(i - 2) * 0.6, 1.6, '#dadada');
  c.fillStyle = '#5a3818'; c.fillRect(-4.2, -20.5, 8.4, 1.4);
  circ(c, 1, -19.8, 1.6, liquid, OUT, 0.6); circ(c, 3.4, -19.8, 1.4, liquid, OUT, 0.6);
  // flask arm
  const a = clampAim(p.aim, -1.5, 0.4) * 0.6 - (p.anim > 0 ? 0.8 : 0.2);
  const hand = arm(c, 2.3, -12, a, 6, '#5a4a6a', '#e8c4a0');
  c.beginPath(); c.arc(hand.x + 1, hand.y - 2.5, 2.4, 0, TAU); c.fillStyle = liquid; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.6; c.stroke();
  c.fillStyle = '#c9e8ff'; c.fillRect(hand.x + 0.3, hand.y - 6.5, 1.4, 2.2); c.fillStyle = '#8a5a32'; c.fillRect(hand.x + 0.2, hand.y - 7.4, 1.6, 1);
  circ(c, hand.x + 0.3, hand.y - 3.2, 0.7, 'rgba(255,255,255,0.7)');
  arm(c, -2.3, -12, 2.3, 5, '#5a4a6a', '#e8c4a0');
  c.restore();
}

function bard(c: C, p: Pose) {
  const [anth, ins, thr] = p.tiers;
  const doublet = thr >= 2 ? '#2f7a4a' : ins >= 2 ? '#2f4f9a' : '#7a3fbf';
  const strum = Math.sin(p.time * 10) * 0.25;
  humanoid(c, { skin: '#f0c49a', torso: doublet, torso2: '#3a1f5a', legs: '#c94a3a', boots: '#4a2e18', cape: anth >= 3 ? '#ffd23a' : '#c94a3a', capeLen: 13, belt: '#4a2e18', slim: 0.9 }, p.time, Math.abs(Math.sin(p.time * 3)) * -0.6);
  // doublet stripes
  c.strokeStyle = 'rgba(255,230,150,0.6)'; c.lineWidth = 0.6; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 2.2, -13.5); c.lineTo(i * 1.9, -5); c.stroke(); }
  // hair + feathered cap
  c.fillStyle = '#6b3a1a'; c.beginPath(); c.arc(0, -19, 4.3, Math.PI * 0.85, Math.PI * 1.9); c.lineTo(-4.5, -15.5); c.fill();
  eye(c, 2, -19.2); c.strokeStyle = '#7a3a2a'; c.lineWidth = 0.5; c.beginPath(); c.arc(1.8, -17.4, 1, 0.2, Math.PI - 0.2); c.stroke();
  c.beginPath(); c.moveTo(-5, -21.5); c.quadraticCurveTo(0, -27, 5.5, -22); c.lineTo(-5, -21.5); c.fillStyle = '#5a2a8a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.6; c.stroke();
  c.beginPath(); c.moveTo(-3, -23); c.quadraticCurveTo(-9, -30 + Math.sin(p.time * 2), -11, -24); c.quadraticCurveTo(-7, -26, -3, -22.5); c.fillStyle = '#ff4a4a'; c.fill();
  // lute across body
  c.save(); c.translate(1, -8); c.rotate(-0.6);
  c.beginPath(); c.ellipse(0, 0, 4.2, 3.4, 0, 0, TAU); c.fillStyle = '#c98a3a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.7; c.stroke();
  circ(c, 0.5, 0, 1.2, '#3a2010');
  c.fillStyle = '#7a4a1a'; c.fillRect(3.5, -0.8, 9, 1.6); c.fillStyle = '#5a3010'; c.fillRect(12, -1.4, 2.4, 2.8);
  c.strokeStyle = '#f2ead6'; c.lineWidth = 0.3; c.beginPath(); c.moveTo(-2, -0.4); c.lineTo(13, -0.4); c.moveTo(-2, 0.4); c.lineTo(13, 0.4); c.stroke();
  c.restore();
  arm(c, 2.5, -12, 1.6 + strum, 5, doublet, '#f0c49a');
  arm(c, -2.5, -12, 0.2, 7, doublet, '#f0c49a');
  // floating notes
  for (let i = 0; i < 3; i++) {
    const t = (p.time * 0.5 + i / 3) % 1;
    c.globalAlpha = (1 - t) * 0.9;
    c.fillStyle = anth >= 4 ? '#ffd23a' : ins >= 3 ? '#9fe0ff' : '#ffffff';
    c.font = 'bold 6px serif'; c.textAlign = 'center';
    c.fillText(i % 2 ? '♪' : '♫', 6 + Math.sin(t * 6 + i) * 3, -16 - t * 14);
    c.globalAlpha = 1;
  }
  if (thr >= 1) { circ(c, -4, -4, 1.8, '#c9a35b', OUT, 0.5); }
}

function mine(c: C, p: Pose) {
  const [deep, bank, over] = p.tiers;
  // rocky mound
  poly(c, [-15, 3, -13, -9, -6, -17, 3, -18, 11, -12, 15, 3], '#8a7a68', OUT, 0.8);
  c.fillStyle = '#a3937f'; poly(c, [-12, -8, -6, -15, 1, -16, -2, -10], '#a3937f');
  // entrance
  c.fillStyle = '#1a1210'; c.beginPath(); c.moveTo(-6, 3); c.lineTo(-6, -7); c.quadraticCurveTo(0, -12, 6, -7); c.lineTo(6, 3); c.fill();
  // timber frame
  const wood = '#6b4424';
  line(c, -6.5, 3, -6.5, -8, wood, 2.2); line(c, 6.5, 3, 6.5, -8, wood, 2.2); line(c, -8, -8.5, 8, -8.5, wood, 2.4);
  // gold glints inside
  for (let i = 0; i < 3 + deep; i++) { const tw = (Math.sin(p.time * 3 + i * 2) + 1) / 2; circ(c, -3 + ((i * 2.3) % 6), -4 + ((i * 1.7) % 6), 0.6 + tw * 0.6, `rgba(255,220,90,${0.4 + tw * 0.6})`); }
  // lantern
  line(c, 7.5, -8, 9.5, -8, wood, 1); circ(c, 9.5, -6.5, 1.5, '#ffd23a', OUT, 0.5);
  c.fillStyle = `rgba(255,210,80,${0.15 + Math.sin(p.time * 4) * 0.05})`; c.beginPath(); c.arc(9.5, -6.5, 5, 0, TAU); c.fill();
  // rails + minecart
  line(c, -14, 6, 3, 6, '#5a5a62', 0.8);
  c.save(); c.translate(-9, 2 + Math.sin(p.time * 2) * 0.2);
  poly(c, [-5, -4, 5, -4, 4, 2, -4, 2], '#6a6a72', OUT, 0.7);
  for (let i = 0; i < 4 + Math.min(4, deep); i++) circ(c, -3.5 + (i % 4) * 2.3, -4.5 - Math.floor(i / 4) * 1.6, 1.3, '#ffd23a', '#b8860b', 0.4);
  circ(c, -2.5, 2.5, 1.3, '#2a2a2a'); circ(c, 2.5, 2.5, 1.3, '#2a2a2a');
  c.restore();
  // pickaxe
  line(c, 9, 3, 13, -5, wood, 1); c.beginPath(); c.moveTo(10.5, -6); c.quadraticCurveTo(13, -7.5, 15.5, -4.5); c.strokeStyle = '#9aa4b0'; c.lineWidth = 1.2; c.stroke();
  if (bank >= 1) { circ(c, 0, -14, 4, '#7a8494', OUT, 0.7); circ(c, 0, -14, 2.4, '#5a6270'); line(c, -1.6, -14, 1.6, -14, '#c9a35b', 0.8); line(c, 0, -15.6, 0, -12.4, '#c9a35b', 0.8); }
  if (over >= 1) { line(c, 11, -12, 11, -22, wood, 1); poly(c, [11, -22, 17, -20, 11, -18], over >= 3 ? '#ffd23a' : '#2f6fd6'); }
}

function aldric(c: C, p: Pose) {
  const swing = p.anim > 0 ? (0.15 - p.anim) / 0.15 : 0;
  humanoid(c, { skin: '#f0c49a', torso: '#dfe6ee', torso2: '#8e98a8', legs: '#8e98a8', boots: '#4a5060', cape: '#2f6fd6', capeLen: 18, belt: '#c9a35b' }, p.time);
  // golden pauldrons
  circ(c, -4.5, -13, 2.2, '#e8c45a', OUT, 0.6); circ(c, 4.5, -13, 2.2, '#e8c45a', OUT, 0.6);
  // hair + circlet
  c.fillStyle = '#c9902a'; c.beginPath(); c.arc(0, -19.5, 4.4, Math.PI * 0.9, Math.PI * 2.05); c.lineTo(-4.4, -16); c.fill();
  c.fillStyle = '#e8c45a'; c.fillRect(-4, -21.6, 8, 1.1); circ(c, 0, -21.1, 0.8, '#5ab8ff');
  eye(c, 2, -19);
  const a = -2 + swing * 3.4;
  const hand = arm(c, 2.6, -12.5, a, 6, '#dfe6ee', '#f0c49a', 2.6);
  c.save(); c.translate(hand.x, hand.y); c.rotate(a + Math.PI / 2 - 0.2);
  poly(c, [-1.4, 0, 1.4, 0, 1, -18, 0, -21, -1, -18], '#f4f8ff', OUT, 0.6);
  line(c, 0, -1, 0, -17, 'rgba(110,170,255,0.6)', 0.6);
  c.fillStyle = '#e8c45a'; c.fillRect(-4, -0.6, 8, 1.8); circ(c, 0, 4, 1, '#e8c45a');
  c.restore();
  if (p.level >= 7) { c.globalAlpha *= 0.35 + Math.sin(p.time * 3) * 0.1; circ(c, 0, -12, 14, '#9cc6ff'); c.globalAlpha = 1; }
}

function lyra(c: C, p: Pose) { mage(c, p, true); }
function grimbeard(c: C, p: Pose) { cannon(c, p, true); }

// ---------------------------------------------------------------- entry
const RADIUS: Record<string, number> = { archer: 13, knight: 13, barracks: 16, mage: 13, druid: 13, cannon: 15, ballista: 15, alchemist: 15, bard: 13, mine: 16, aldric: 13, lyra: 13, grimbeard: 13 };

export function drawTowerArt(c: C, id: string, x: number, y: number, pose: Pose, scale = 1) {
  c.save();
  c.translate(x, y + 2);
  c.scale(scale, scale);
  const top = Math.max(...pose.tiers, pose.hero ? (pose.level >= 10 ? 5 : pose.level >= 6 ? 3 : 0) : 0);
  const base = id === 'mine' ? ['#9a8a74', '#6a5a48'] : pose.hero ? ['#c9c0e0', '#7d72a0'] : ['#b9b0a3', '#7d7468'];
  pedestal(c, RADIUS[id] ?? 13, top, pose.time, base[0], base[1]);
  // face the target
  const f = Math.cos(pose.aim) < -0.05 ? -1 : 1;
  c.scale(f, 1);
  let aim = f === 1 ? pose.aim : Math.PI - pose.aim;
  if (aim > Math.PI) aim -= TAU;
  if (aim < -Math.PI) aim += TAU;
  // treat straight up/down as gentle
  const P = { ...pose, aim };
  switch (id) {
    case 'archer': archer(c, P); break;
    case 'knight': knight(c, P); break;
    case 'barracks': barracks(c, P); break;
    case 'mage': mage(c, P); break;
    case 'druid': druid(c, P); break;
    case 'cannon': cannon(c, P); break;
    case 'ballista': ballista(c, P); break;
    case 'alchemist': alchemist(c, P); break;
    case 'bard': bard(c, P); break;
    case 'mine': mine(c, P); break;
    case 'aldric': aldric(c, P); break;
    case 'lyra': lyra(c, P); break;
    case 'grimbeard': grimbeard(c, P); break;
  }
  c.restore();
}

/** Small spearman for Barracks soldiers. */
export function drawSoldierArt(c: C, x: number, y: number, facing: number, stab: boolean, time: number, gold: boolean) {
  c.save(); c.translate(x, y); c.scale(0.8 * facing, 0.8);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(0, 4.5, 6, 2, 0, 0, TAU); c.fill();
  humanoid(c, { skin: '#f0c49a', torso: gold ? '#e8d48a' : '#c94a3a', torso2: gold ? '#b8963a' : '#8a2a1a', legs: '#5a5a62', boots: '#3a2a1a', belt: '#4a3020' }, time);
  c.beginPath(); c.arc(0, -19.5, 4.5, Math.PI, 0); c.fillStyle = '#9aa4b0'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.7; c.stroke();
  line(c, 0, -24, 0, -26, '#9aa4b0', 1.4);
  const a = stab ? -0.1 : -0.5;
  const hand = arm(c, 2.5, -12, a, 5, '#c94a3a', '#f0c49a');
  line(c, hand.x - Math.cos(a) * 8, hand.y - Math.sin(a) * 8, hand.x + Math.cos(a) * (stab ? 12 : 9), hand.y + Math.sin(a) * (stab ? 12 : 9), '#7a5230', 1.2);
  const tx = hand.x + Math.cos(a) * (stab ? 12 : 9), ty = hand.y + Math.sin(a) * (stab ? 12 : 9);
  poly(c, [tx, ty - 1.4, tx + Math.cos(a) * 4, ty + Math.sin(a) * 4, tx, ty + 1.4], '#dfe6ee');
  poly(c, [-6, -11, -1.5, -11, -1.5, -3, -3.75, -0.5, -6, -3], gold ? '#ffd23a' : '#2f5fb8', OUT, 0.8);
  c.restore();
}
