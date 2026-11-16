// Strategy matrix: several genuinely different ways to play, run headless.
//   npx tsx test/strategies.ts [maps=all] [diffs=easy,medium] [strategies=all] [seeds=1]
// These are simulations with fixed decision rules. Varying the seed repeats the same decisions,
// so treat extra seeds as noise checks, not as extra strategic coverage.
import { Game, type Tower } from '../src/core/game';
import { MAPS, distToPath } from '../src/core/maps';
import { TOWER_MAP, canUpgradePath } from '../src/core/towers';
import type { Difficulty } from '../src/core/types';

export interface Strategy {
  name: string; about: string; hero: string;
  /** Build order; cycles through `repeat` once the opening list is used up. */
  order: string[]; repeat: string[];
  maxTowers: number;
  /** Upgrade path sequence per tower type (path index per step). */
  plan: Record<string, number[]>;
  /** Highest total tiers a tower may reach (wide = low, tall = 7 for 5-2-0). */
  maxTiers: number;
  /** Prefer a new tower when it costs less than this multiple of the cheapest upgrade. */
  placeBias: number;
}

const P = {
  archer: [1, 1, 0, 0, 1, 1, 1], knight: [0, 0, 1, 1, 0, 0, 0], mage: [1, 1, 0, 0, 1, 1, 1], druid: [0, 0, 2, 2, 0, 0, 0],
  cannon: [0, 0, 1, 1, 0, 0, 0], ballista: [0, 0, 2, 0, 0, 0, 2], barracks: [0, 0, 1, 1, 0, 0, 0], alchemist: [1, 1, 0, 0, 1, 1, 1],
  bard: [0, 0, 1, 1, 0, 0, 0], mine: [0, 0, 2, 2, 0, 0, 0],
};

export const STRATEGIES: Strategy[] = [
  { name: 'wide', about: 'Many cheap towers, upgrades capped at tier 2+2', hero: 'aldric', maxTowers: 99, maxTiers: 4, placeBias: 99,
    order: ['archer', 'knight', 'archer', 'hero', 'mage', 'cannon', 'archer', 'druid', 'ballista', 'mage'], repeat: ['archer', 'mage', 'cannon', 'ballista', 'knight', 'druid'], plan: P },
  { name: 'tall', about: 'At most 9 towers, everything else into upgrades (5-2-0)', hero: 'lyra', maxTowers: 9, maxTiers: 7, placeBias: 0,
    order: ['archer', 'knight', 'hero', 'mage', 'cannon', 'ballista', 'druid', 'ballista', 'alchemist'], repeat: [], plan: { ...P, cannon: [0, 0, 0, 0, 0, 2, 2], knight: [1, 1, 1, 1, 1, 0, 0] } },
  { name: 'eco', about: 'Gold Mines early (by wave 6, 10, 14), then mixed', hero: 'grimbeard', maxTowers: 40, maxTiers: 7, placeBias: 2,
    order: ['archer', 'knight', 'archer', 'mine', 'hero', 'mage', 'mine', 'cannon', 'mine', 'ballista', 'druid', 'ballista'], repeat: ['mage', 'cannon', 'ballista', 'archer'], plan: { ...P, mine: [0, 0, 0, 2, 2, 0, 0] } },
  { name: 'control', about: 'Barracks + Druids hold enemies inside splash damage', hero: 'aldric', maxTowers: 22, maxTiers: 7, placeBias: 1.2,
    order: ['knight', 'druid', 'barracks', 'hero', 'cannon', 'mage', 'druid', 'barracks', 'cannon', 'ballista', 'mage', 'ballista'], repeat: ['cannon', 'mage', 'ballista', 'druid'], plan: { ...P, druid: [0, 0, 0, 2, 2, 0, 0], barracks: [0, 0, 0, 2, 2, 0, 0], knight: [2, 2, 2, 0, 0, 2, 2] } },
  { name: 'support', about: 'Small core boosted by Bard + Alchemist buffs', hero: 'lyra', maxTowers: 14, maxTiers: 7, placeBias: 0.8,
    order: ['archer', 'knight', 'hero', 'mage', 'bard', 'cannon', 'alchemist', 'ballista', 'archer', 'ballista', 'mage', 'cannon'], repeat: ['ballista', 'mage'], plan: { ...P, alchemist: [1, 1, 1, 1, 0, 0, 1], bard: [0, 0, 0, 1, 1, 0, 0] } },
];

export interface RunResult { state: string; round: number; lives: number; towers: number; gold: number; spent: number; worst: { round: number; lost: number } | null; leakWaves: number; byType: Record<string, number>; bossHp: number | null; leaks: string; tension: number[] }

export function runStrategy(st: Strategy, mapId: string, diff: Difficulty, seed = 1, maxRound = 40): RunResult {
  if (process.env.CARRY) Game.SHATTER_CARRY = Number(process.env.CARRY);
  const g = new Game({ mapId, difficulty: diff, heroId: st.hero, seed });
  const map = MAPS.find((m) => m.id === mapId)!;
  // candidate spots, scored by how much road each range ring covers
  const cand: { x: number; y: number; near: number; cover: Record<number, number> }[] = [];
  for (let x = 24; x < 940; x += 20) for (let y = 24; y < 620; y += 20) {
    if (!g.canPlace(x, y, 20)) continue;
    const cover: Record<number, number> = { 75: 0, 140: 0 };
    for (const p of g.paths) for (let i = 0; i < p.pts.length; i += 3) { const d = Math.hypot(p.pts[i].x - x, p.pts[i].y - y); if (d < 75) cover[75]++; if (d < 140) cover[140]++; }
    cand.push({ x, y, near: Math.min(...map.paths.map((p) => distToPath(x, y, p))), cover });
  }
  const spotFor = (id: string) => {
    const short = id === 'knight' || id === 'druid' || id === 'barracks' || id === 'hero' && st.hero === 'aldric';
    const far = id === 'mine' || id === 'ballista';
    let best: typeof cand[number] | null = null, bv = -1e9;
    for (const c of cand) {
      if (!g.canPlace(c.x, c.y, 20)) continue;
      let v = far ? c.near : short ? c.cover[75] * 3 - c.near * 0.05 : c.cover[140];
      if (id === 'bard' || id === 'alchemist') v = g.towers.filter((t) => t.stats.attacks.length && Math.hypot(t.x - c.x, t.y - c.y) < 120).length * 10 + c.cover[140] * 0.1;
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  };
  let oi = 0; const step = new Map<number, number>();
  const nextType = () => (oi < st.order.length ? st.order[oi] : st.repeat.length ? st.repeat[(oi - st.order.length) % st.repeat.length] : null);
  const cheapestUp = () => {
    let best: { t: Tower; p: number; cost: number } | null = null;
    for (const t of g.towers) {
      if (t.isHero) continue;
      const plan = st.plan[t.defId]; let s = step.get(t.uid) ?? 0;
      while (s < plan.length && !canUpgradePath(t.tiers, plan[s])) s++;
      step.set(t.uid, s);
      if (s >= plan.length || t.tiers[0] + t.tiers[1] + t.tiers[2] >= st.maxTiers) continue;
      const cost = g.upgradeCost(t, plan[s]);
      if (!best || cost < best.cost) best = { t, p: plan[s], cost };
    }
    return best;
  };
  const shop = () => {
    for (let guard = 0; guard < 40; guard++) {
      const nt = g.towers.length < st.maxTowers ? nextType() : null;
      const up = cheapestUp();
      const pc = nt ? g.towerCost(nt) : Infinity;
      const wantPlace = nt && (!up || pc <= up.cost * st.placeBias || g.towers.length < 3 + g.round / 3);
      if (wantPlace && g.gold >= pc) {
        if (nt === 'hero' && g.heroPlaced) { oi++; continue; }
        const s = spotFor(nt!); if (!s) { oi++; continue; }
        const t = g.placeTower(nt!, s.x, s.y); if (!t) { oi++; continue; }
        if (t.defId === 'ballista') t.targeting = 'strong';
        oi++; continue;
      }
      if (up && g.gold >= up.cost && (!wantPlace || g.gold < pc)) { if (g.upgrade(up.t, up.p)) step.set(up.t.uid, (step.get(up.t.uid) ?? 0) + 1); continue; }
      break;
    }
  };
  let spent = 0, lastGold = g.gold;
  const byType: Record<string, number> = {};
  const tension: number[] = [];
  while (g.round < maxRound && g.state !== 'over') {
    shop();
    g.startWave();
    let ticks = 0, far = 0;
    while (g.state === 'wave') {
      g.update(1 / 60); ticks++;
      if (ticks % 10 === 0) for (const e of g.enemies) { const f = e.d / g.paths[e.path].len; if (f > far) far = f; }
      if (ticks % 30 === 0) {
        shop();
        for (const t of g.towers) for (const ab of t.abilities) if (ab.left <= 0) g.useAbility(t, ab.def.id);
        const s = g.strongest();
        if (s && (s.def.giant || g.enemies.length > 25)) g.castSpell('meteor', s.x, s.y);
        const lead = g.leader();
        if (lead && lead.d / g.paths[lead.path].len > 0.8) g.castSpell('freeze');
        if (g.lives < g.maxLives - 25) g.castSpell('reinforce');
      }
      if (ticks > 60 * 900) break;
      g.events.length = 0;
    }
    tension.push(Math.round(far * 100));
    if (g.state === 'build' && g.lives < g.maxLives - 25) g.castSpell('reinforce');
    void lastGold; lastGold = g.gold;
  }
  for (const t of g.towers) { spent += t.spent; byType[t.defId] = (byType[t.defId] ?? 0) + 1; }
  const worst = g.history.reduce((a, h) => (!a || h.lost > a.lost ? h : a), null as RunResult['worst']);
  return { state: g.state === 'over' ? 'LOST' : 'won', round: g.round, lives: g.lives, towers: g.towers.length, gold: Math.floor(g.gold), spent: Math.floor(spent), worst: worst && worst.lost > 0 ? worst : null, leakWaves: g.history.filter((h) => h.lost > 0).length, byType, bossHp: g.bossLeak ? Math.round(g.bossLeak.hpFrac * 100) : null, leaks: g.history.filter((h) => h.lost > 0 && h.round >= 20).map((h) => `${h.round}:${h.lost}`).join(' '), tension };
}

if (process.argv[1]?.endsWith('strategies.ts')) {
  const [mapsA = 'all', diffsA = 'easy,medium', stratA = 'all', seedsA = '1'] = process.argv.slice(2);
  const maps = mapsA === 'all' ? MAPS.map((m) => m.id) : mapsA.split(',');
  const strats = stratA === 'all' ? STRATEGIES : STRATEGIES.filter((s) => stratA.split(',').includes(s.name));
  for (const d of diffsA.split(',') as Difficulty[]) {
    console.log(`\n== ${d} ==  (cell: result@wave lives | towers | worst wave:-lives)`);
    for (const st of strats) {
      const cells = maps.map((m) => {
        const rs = Array.from({ length: Number(seedsA) }, (_, i) => runStrategy(st, m, d, i + 1));
        const r = rs[0];
        const wins = rs.filter((x) => x.state === 'won').length;
        return `${m.slice(0, 7).padEnd(7)} ${Number(seedsA) > 1 ? `${wins}/${rs.length} ` : ''}${r.state}@${String(r.round).padStart(2)} ${String(r.lives).padStart(3)}L ${String(r.towers).padStart(2)}T ${process.env.DETAIL ? `[${r.leaks}]${r.bossHp !== null ? ` boss ${r.bossHp}% left` : ''}` : r.worst ? `w${r.worst.round}:-${r.worst.lost}` : 'clean'}`;
      });
      console.log(st.name.padEnd(8), cells.join('  ||  '));
    }
  }
}
