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
  const out: Obstacle[] = [...extra];
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

const P = (pts: number[][]): Vec[] => pts.map(([x, y]) => ({ x, y }));

const meadowPath = [P([[-30, 100], [220, 100], [220, 300], [80, 300], [80, 540], [380, 540], [380, 200], [560, 200], [560, 460], [760, 460], [760, 110], [900, 110], [900, 560], [990, 560]])];
const cavernPath = [P([[-30, 540], [150, 540], [150, 130], [360, 130], [360, 500], [600, 500], [600, 130], [810, 130], [810, 500], [990, 500]])];
const emberPaths = [
  P([[-30, 130], [260, 130], [260, 320], [520, 320], [520, 120], [720, 120], [720, 520], [990, 520]]),
  P([[-30, 530], [260, 530], [260, 320], [520, 320], [520, 120], [720, 120], [720, 520], [990, 520]]),
];
const summitPath = [P([[480, -30], [480, 110], [150, 110], [150, 320], [810, 320], [810, 530], [480, 530], [480, 670]])];

export const MAPS: MapDef[] = [
  {
    id: 'meadow', name: 'Meadowbrook', difficultyLabel: 'Beginner', paths: meadowPath, unlock: null,
    obstacles: scatter(11, 16, 'tree', 14, 22, meadowPath, [{ x: 470, y: 370, r: 34, kind: 'water' }]),
    theme: { ground: '#7cc95a', ground2: '#6bb84c', path: '#e8cf94', pathEdge: '#b89a5e', accent: '#f7f3a1' },
  },
  {
    id: 'caverns', name: 'Crystal Caverns', difficultyLabel: 'Intermediate', paths: cavernPath, unlock: 'meadow',
    obstacles: scatter(23, 18, 'crystal', 12, 20, cavernPath, [{ x: 480, y: 300, r: 30, kind: 'water' }]),
    theme: { ground: '#5b6a8c', ground2: '#506080', path: '#b8a9c9', pathEdge: '#7d6d93', accent: '#9ef0ff' },
  },
  {
    id: 'ember', name: 'Ember Pass', difficultyLabel: 'Advanced', paths: emberPaths, unlock: 'caverns',
    obstacles: scatter(37, 14, 'rock', 14, 24, emberPaths, [{ x: 400, y: 450, r: 40, kind: 'lava' }, { x: 860, y: 260, r: 36, kind: 'lava' }]),
    theme: { ground: '#a8794f', ground2: '#9a6c45', path: '#5b4636', pathEdge: '#3b2c22', accent: '#ffb347' },
  },
  {
    id: 'summit', name: 'Spire Summit', difficultyLabel: 'Expert', paths: summitPath, unlock: 'ember',
    obstacles: scatter(51, 22, 'pine', 14, 22, summitPath, [{ x: 330, y: 220, r: 46, kind: 'rock' }, { x: 640, y: 430, r: 46, kind: 'rock' }]),
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
