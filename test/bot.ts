// Headless playtest bot: places/upgrades towers with a simple greedy plan and
// plays every wave. Usage: npx tsx test/bot.ts [mapId] [difficulty] [maxRound]
import { Game } from '../src/core/game';
import { MAPS, distToPath } from '../src/core/maps';
import { TOWER_MAP, canUpgradePath } from '../src/core/towers';
import type { Difficulty } from '../src/core/types';

const PLAN: Record<string, number[]> = {
  archer: [1, 1, 0, 0, 1, 1, 1], knight: [0, 0, 1, 1, 0, 0, 0], mage: [1, 1, 0, 0, 1, 1, 1], druid: [0, 0, 2, 2, 0, 0, 0],
  cannon: [0, 0, 1, 1, 1, 1, 1], ballista: [0, 0, 1, 1, 0, 0, 0], barracks: [0, 0, 1, 1, 0, 0, 0], alchemist: [1, 1, 0, 0, 1, 1, 1],
  bard: [0, 0, 1, 1, 0, 0, 0], mine: [0, 0, 2, 2, 0, 0, 0],
};
const ORDER = ['archer', 'knight', 'archer', 'hero', 'mage', 'barracks', 'cannon', 'archer', 'druid', 'mine', 'ballista', 'mage', 'alchemist', 'archer', 'bard', 'cannon', 'ballista', 'mage', 'knight', 'ballista', 'druid', 'ballista', 'cannon', 'mage', 'ballista', 'knight', 'ballista', 'mage', 'cannon', 'ballista'];

export function runBot(mapId: string, diff: Difficulty, maxRound = 40, heroId = 'aldric', verbose = true) {
  const g = new Game({ mapId, difficulty: diff, heroId, seed: Number(process.env.SEED ?? 7) });
  // HOARD=0.6 simulates a player who banks 60% of everything they earn (playtest: 10.7K unspent at wave 26)
  const hoard = Number(process.env.HOARD ?? 0);
  let earned = g.gold, lastGold = g.gold;
  const track = () => { if (g.gold > lastGold) earned += g.gold - lastGold; lastGold = g.gold; };
  const spendable = () => g.gold - hoard * earned;
  const map = MAPS.find((m) => m.id === mapId)!;
  // candidate spots scored by path coverage
  const spots: { x: number; y: number; cover: number }[] = [];
  for (let x = 24; x < 940; x += 22) for (let y = 24; y < 620; y += 22) {
    if (!g.canPlace(x, y, 18)) continue;
    let cover = 0;
    for (const p of g.paths) for (let d = 0; d < p.len; d += 15) { const i = p.cum.findIndex((c) => c > d); const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.max(0, i)]; const t = (d - p.cum[Math.max(0, i - 1)]) / ((p.cum[i] - p.cum[i - 1]) || 1); const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t; if (Math.hypot(px - x, py - y) < 140) cover++; }
    const near = map.paths.some((p) => distToPath(x, y, p) < 70);
    spots.push({ x, y, cover: cover + (near ? 10 : 0) });
  }
  // BOTSEED varies the bot's own play (placement jitter) so one rule change can be judged over many playthroughs
  // instead of a single deterministic run. Unset = the original deterministic bot.
  if (process.env.BOTSEED) {
    let st = Number(process.env.BOTSEED) * 2654435761 >>> 0;
    const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (const sp of spots) sp.cover *= 0.75 + rnd() * 0.5;
  }
  spots.sort((a, b) => b.cover - a.cover);
  let orderIdx = 0;
  const plans = new Map<number, number>();
  const log: string[] = [];

  const shop = () => {
    track();
    for (let guard = 0; guard < 30; guard++) {
      const nextType = ORDER[orderIdx % ORDER.length];
      const placeCost = g.towerCost(nextType === 'hero' ? 'hero' : nextType);
      let bestUp: { t: typeof g.towers[number]; p: number; cost: number } | null = null;
      for (const t of g.towers) {
        if (t.isHero) continue;
        const plan = PLAN[t.defId]; const step = plans.get(t.uid) ?? 0;
        if (step >= plan.length) continue;
        const p = plan[step];
        if (!canUpgradePath(t.tiers, p)) { plans.set(t.uid, step + 1); continue; }
        const cost = g.upgradeCost(t, p);
        if (!bestUp || cost < bestUp.cost) bestUp = { t, p, cost };
      }
      const wantPlace = !bestUp || placeCost < bestUp.cost * 2 || g.towers.length < (g.round <= 12 ? 4 + g.round / 2 : 3 + g.round / 3);
      if (wantPlace && spendable() >= placeCost) {
        const id = nextType === 'hero' ? 'hero' : nextType;
        if (id === 'hero' && g.heroPlaced) { orderIdx++; continue; }
        const spot = spots.find((s) => g.canPlace(s.x, s.y, 18));
        if (!spot) break;
        const t = g.placeTower(id, spot.x, spot.y);
        if (t) { if (process.env.DBG) console.log('place', id, spot.x, spot.y, 'r', g.round); orderIdx++; if (t.defId === 'ballista' || t.defId === 'alchemist') t.targeting = 'strong'; continue; }
        break;
      } else if (bestUp && spendable() >= bestUp.cost && !wantPlace) {
        g.upgrade(bestUp.t, bestUp.p); plans.set(bestUp.t.uid, (plans.get(bestUp.t.uid) ?? 0) + 1); continue;
      } else if (bestUp && spendable() >= bestUp.cost && spendable() < placeCost) {
        g.upgrade(bestUp.t, bestUp.p); plans.set(bestUp.t.uid, (plans.get(bestUp.t.uid) ?? 0) + 1); continue;
      }
      break;
    }
    lastGold = g.gold;
  };

  const t0 = Date.now();
  while (g.round < maxRound && g.state !== 'over') {
    shop();
    g.startWave();
    let ticks = 0;
    const livesBefore = g.lives;
    while (g.state === 'wave') {
      g.update(1 / 60);
      ticks++;
      if (ticks % 60 === 0) {
        shop();
        for (const t of g.towers) for (const ab of t.abilities) if (ab.left <= 0) g.useAbility(t, ab.def.id);
        const s = g.strongest();
        if (s && s.def.giant) g.castSpell('meteor', s.x, s.y);
      }
      if (ticks > 60 * 600) { log.push('TIMEOUT'); break; }
      g.events.length = 0;
    }
    if (g.state === 'victory') { if (verbose) console.log(`  r${g.round} lives ${g.lives} gold ${Math.floor(g.gold)} towers ${g.towers.length}`); break; }
    const lost = livesBefore - g.lives;
    if (verbose && lost > 0 && process.env.LEAKS) { console.log('   leaked:', JSON.stringify(g.stats.leakedBy)); g.stats.leakedBy = {}; }
    if (verbose && (lost > 0 || g.round % 5 === 0)) console.log(`  r${g.round} lives ${g.lives} (-${lost}) gold ${Math.floor(g.gold)} towers ${g.towers.length} [${g.towers.filter((t) => !t.isHero).map((t) => t.defId[0] + t.tiers.join('')).join(' ')}] ${(ticks / 60).toFixed(0)}s`);
  }
  return { round: g.round, lives: g.lives, state: g.state, ms: Date.now() - t0 };
}

const [mapId = 'meadow', diff = 'medium', max = '40'] = process.argv.slice(2);
const r = runBot(mapId, diff as Difficulty, Number(max), process.env.HERO ?? 'aldric');
console.log(`${mapId}/${diff}: ${r.state} at round ${r.round}, lives ${r.lives} (${r.ms}ms)`);
