import type { Vec } from './types';

export interface Obstacle { x: number; y: number; r: number; kind: 'tree' | 'rock' | 'crystal' | 'water' | 'lava' | 'pine' }

export interface MapDef {
  id: string;
  name: string;
  difficultyLabel: string;
  paths: Vec[][];
  obstacles: Obstacle[];
  theme: { ground: string; ground2: string; path: string; pathEdge: string; accent: string };
  unlock: string | null; // map id that must be beaten to unlock
}

export const PATH_WIDTH = 44;

function scatter(seed: number, n: number, kind: Obstacle['kind'], rMin: number, rMax: number, avoid: Vec[][], extra: Obstacle[] = []): Obstacle[] {
  // Deterministic scatter of decorations away from the path.
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Obstacle[] = extra.filter((o) => !avoid.some((p) => distToPath(o.x, o.y, p) < PATH_WIDTH / 2 + o.r + 6));
  let tries = 0;
  while (out.length < n + extra.length && tries < 4000) {
    tries++;
    const r = rMin + rnd() * (rMax - rMin);
    const x = 20 + rnd() * 920;
    const y = 20 + rnd() * 600;
    if (avoid.some((p) => distToPath(x, y, p) < PATH_WIDTH / 2 + r + 6)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 4)) continue;
    out.push({ x, y, r, kind });
  }
  return out;
}

export function distToSeg(px: number, py: number, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function distToPath(x: number, y: number, p: Vec[]): number {
  let m = Infinity;
  for (let i = 0; i < p.length - 1; i++) m = Math.min(m, distToSeg(x, y, p[i], p[i + 1]));
  return m;
}

/** Smooth a list of control points with a centripetal Catmull-Rom spline into a dense polyline. */
export function spline(ctrl: number[][], step = 7): Vec[] {
  const P = ctrl.map(([x, y]) => ({ x, y }));
  const pts = [P[0], ...P, P[P.length - 1]];
  const out: Vec[] = [];
  const tj = (ti: number, a: Vec, b: Vec) => ti + Math.pow(Math.hypot(b.x - a.x, b.y - a.y) || 1e-4, 0.5);
  for (let i = 0; i < pts.length - 3; i++) {
    const [p0, p1, p2, p3] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const lerp = (a: Vec, b: Vec, ta: number, tb: number) => ({ x: ((tb - t) / (tb - ta)) * a.x + ((t - ta) / (tb - ta)) * b.x, y: ((tb - t) / (tb - ta)) * a.y + ((t - ta) / (tb - ta)) * b.y });
      const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
      const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
      out.push(lerp(B1, B2, t1, t2));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

const meadowPath = [spline([[-40, 120], [110, 112], [215, 150], [250, 250], [190, 340], [120, 440], [175, 545], [320, 565], [410, 480], [400, 360], [430, 240], [530, 160], [650, 175], [700, 280], [650, 390], [640, 500], [740, 565], [860, 530], [880, 410], [840, 300], [870, 180], [990, 150]])];
const cavernPath = [spline([[-40, 545], [90, 540], [175, 470], [165, 340], [110, 230], [165, 115], [295, 95], [380, 175], [360, 310], [320, 440], [395, 545], [535, 560], [600, 465], [560, 335], [580, 205], [675, 110], [800, 120], [860, 230], [790, 350], [795, 470], [880, 540], [1000, 525]])];
const emberShared = [[330, 325], [430, 330], [505, 250], [570, 150], [690, 115], [770, 185], [760, 315], [705, 430], [765, 535], [880, 560], [1000, 545]];
const emberPaths = [
  spline([[-40, 115], [90, 120], [200, 165], [270, 250], ...emberShared]),
  spline([[-40, 545], [90, 540], [200, 490], [270, 400], ...emberShared]),
];
const summitPath = [spline([[480, -40], [470, 60], [380, 110], [220, 105], [120, 175], [140, 290], [280, 335], [480, 320], [680, 320], [820, 370], [845, 480], [745, 555], [570, 545], [490, 600], [480, 690]])];

export const MAPS: MapDef[] = [
  {
    id: 'meadow', name: 'Meadowbrook', difficultyLabel: 'Beginner', paths: meadowPath, unlock: null,
    obstacles: scatter(11, 20, 'tree', 13, 22, meadowPath, [{ x: 540, y: 330, r: 36, kind: 'water' }, { x: 300, y: 440, r: 22, kind: 'water' }]),
    theme: { ground: '#7cc95a', ground2: '#6bb84c', path: '#e8cf94', pathEdge: '#b89a5e', accent: '#f7f3a1' },
  },
  {
    id: 'caverns', name: 'Crystal Caverns', difficultyLabel: 'Intermediate', paths: cavernPath, unlock: 'meadow',
    obstacles: scatter(23, 20, 'crystal', 12, 20, cavernPath, [{ x: 470, y: 320, r: 34, kind: 'water' }, { x: 700, y: 330, r: 26, kind: 'water' }]),
    theme: { ground: '#5b6a8c', ground2: '#506080', path: '#b8a9c9', pathEdge: '#7d6d93', accent: '#9ef0ff' },
  },
  {
    id: 'ember', name: 'Ember Pass', difficultyLabel: 'Advanced', paths: emberPaths, unlock: 'caverns',
    obstacles: scatter(37, 16, 'rock', 14, 24, emberPaths, [{ x: 450, y: 470, r: 42, kind: 'lava' }, { x: 890, y: 330, r: 34, kind: 'lava' }, { x: 120, y: 330, r: 30, kind: 'lava' }]),
    theme: { ground: '#a8794f', ground2: '#9a6c45', path: '#5b4636', pathEdge: '#3b2c22', accent: '#ffb347' },
  },
  {
    id: 'summit', name: 'Spire Summit', difficultyLabel: 'Expert', paths: summitPath, unlock: 'ember',
    obstacles: scatter(51, 24, 'pine', 13, 22, summitPath, [{ x: 330, y: 215, r: 44, kind: 'rock' }, { x: 640, y: 440, r: 44, kind: 'rock' }, { x: 900, y: 120, r: 36, kind: 'rock' }]),
    theme: { ground: '#d8e6ef', ground2: '#c8d9e5', path: '#8d9aa8', pathEdge: '#5f6b78', accent: '#ffffff' },
  },
];

export interface PathInfo { pts: Vec[]; cum: number[]; len: number }

export function buildPath(pts: Vec[]): PathInfo {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[cum.length - 1] };
}

export function pointAt(p: PathInfo, d: number, out: Vec): number {
  // Returns heading angle; writes position into out.
  if (d <= 0) { out.x = p.pts[0].x; out.y = p.pts[0].y; return Math.atan2(p.pts[1].y - p.pts[0].y, p.pts[1].x - p.pts[0].x); }
  let lo = 0, hi = p.cum.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] <= d) lo = mid; else hi = mid; }
  const a = p.pts[lo], b = p.pts[Math.min(lo + 1, p.pts.length - 1)];
  const seg = p.cum[lo + 1] - p.cum[lo] || 1;
  const t = Math.min(1, (d - p.cum[lo]) / seg);
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return Math.atan2(b.y - a.y, b.x - a.x);
}
