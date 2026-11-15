import type { WaveGroup } from './types';
import { rbe } from './enemies';

const g = (type: string, count: number, spacing: number, delay = 0, mods = ''): WaveGroup => ({ type, count, spacing, delay, mods });

// 40 handcrafted waves. Bosses on 20, 30, 40.
export const WAVES: WaveGroup[][] = [
  /* 1 */[g('imp', 20, 0.8)],
  /* 2 */[g('imp', 32, 0.55)],
  /* 3 */[g('imp', 20, 0.6), g('goblin', 6, 1.0, 6)],
  /* 4 */[g('imp', 25, 0.45), g('goblin', 15, 0.8, 4)],
  /* 5 */[g('imp', 10, 0.5), g('goblin', 26, 0.45, 3)],
  /* 6 */[g('imp', 15, 0.5), g('goblin', 15, 0.5, 3), g('orc', 6, 0.9, 8)],
  /* 7 */[g('goblin', 22, 0.4), g('orc', 12, 0.7, 5)],
  /* 8 */[g('imp', 10, 0.4), g('goblin', 20, 0.4, 2), g('orc', 14, 0.5, 6), g('troll', 3, 1, 12)],
  /* 9 */[g('orc', 30, 0.45)],
  /* 10 */[g('goblin', 80, 0.18), g('troll', 4, 1, 10)],
  /* 11 */[g('orc', 14, 0.4), g('troll', 8, 0.7, 4)],
  /* 12 */[g('goblin', 20, 0.3), g('orc', 15, 0.4, 3), g('ogre', 6, 0.8, 8)],
  /* 13 */[g('orc', 20, 0.35), g('troll', 10, 0.7, 4, 'r')],
  /* 14 */[g('orc', 50, 0.22), g('troll', 8, 0.5, 6), g('ogre', 8, 0.5, 10)],
  /* 15 */[g('troll', 20, 0.4), g('gloom', 6, 1, 5)],
  /* 16 */[g('ogre', 12, 0.5), g('frostling', 8, 0.8, 4)],
  /* 17 */[g('goblin', 20, 0.4, 0, 's'), g('troll', 15, 0.5, 5)],
  /* 18 */[g('ogre', 30, 0.3), g('hexling', 6, 0.9, 6)],
  /* 19 */[g('troll', 40, 0.25), g('wraith', 10, 0.7, 6)],
  /* 20 */[g('ogre', 20, 0.4), g('golemking', 1, 1, 6)],
  /* 21 */[g('gloom', 20, 0.4), g('iron', 4, 1.5, 4)],
  /* 22 */[g('ogre', 25, 0.25), g('wraith', 10, 0.6, 4, 'r')],
  /* 23 */[g('orc', 20, 0.3, 0, 's'), g('iron', 8, 1, 4), g('hexling', 8, 0.6, 8)],
  /* 24 */[g('hydra', 15, 0.7)],
  /* 25 */[g('ogre', 30, 0.2), g('golem', 6, 1.2, 4)],
  /* 26 */[g('golem', 10, 0.8), g('behemoth', 1, 1, 8)],
  /* 27 */[g('wraith', 15, 0.5, 0, 's'), g('iron', 10, 0.8, 4)],
  /* 28 */[g('golem', 12, 0.6), g('hydra', 10, 0.5, 4, 'r')],
  /* 29 */[g('wraith', 20, 0.3), g('behemoth', 2, 3, 6)],
  /* 30 */[g('golem', 10, 0.8), g('lich', 1, 1, 6)],
  /* 31 */[g('hydra', 30, 0.3), g('behemoth', 3, 2.5, 6)],
  /* 32 */[g('golem', 25, 0.4, 0, 'r')],
  /* 33 */[g('behemoth', 5, 2)],
  /* 34 */[g('iron', 30, 0.3), g('golem', 20, 0.5, 6, 's')],
  /* 35 */[g('golem', 20, 0.4), g('warbeast', 1, 1, 10)],
  /* 36 */[g('golem', 15, 0.45, 0, 'f'), g('behemoth', 4, 2, 6)],
  /* 37 */[g('hydra', 30, 0.25), g('behemoth', 2, 3, 4), g('warbeast', 1, 1, 12)],
  /* 38 */[g('golem', 30, 0.3, 0, 'r'), g('behemoth', 3, 2, 10, 'f')],
  /* 39 */[g('golem', 25, 0.3, 0, 's'), g('behemoth', 5, 1.8, 6), g('warbeast', 1, 1, 16)],
  /* 40 */[g('behemoth', 3, 2.5), g('warbeast', 1, 1, 8), g('dragon', 1, 1, 14)],
];

export const FINAL_WAVE = WAVES.length;

/** Procedural freeplay waves after 40. Budget grows ~12%/round. */
export function freeplayWave(round: number, rnd: () => number): WaveGroup[] {
  const budget = 30000 * Math.pow(1.12, round - 40);
  const pool: [string, string][] = [['golem', ''], ['golem', 'f'], ['behemoth', ''], ['behemoth', 'f'], ['warbeast', ''], ['colossus', ''], ['hydra', 'r'], ['golem', 's']];
  const groups: WaveGroup[] = [];
  let spent = 0;
  let delay = 0;
  while (spent < budget && groups.length < 8) {
    const avail = pool.filter(([t]) => (t !== 'colossus' || round >= 45) && rbe(t) < budget * 0.6);
    const [type, mods] = avail[Math.floor(rnd() * avail.length)] ?? ['golem', ''];
    const unit = rbe(type) * (mods.includes('f') ? 1.6 : 1);
    const count = Math.max(1, Math.min(60, Math.floor((budget - spent) / unit / (2 + rnd() * 2))));
    groups.push(g(type, count, rbe(type) > 1000 ? 2.2 : 0.35, delay, mods));
    spent += count * unit;
    delay += 3 + rnd() * 4;
  }
  if (round % 10 === 0) groups.push(g(round >= 60 ? 'dragon' : 'lich', 1, 1, delay));
  return groups;
}
