import type { WaveGroup } from './types';
import { ENEMIES } from './enemies';
import { rbe } from './enemies';

const g = (type: string, count: number, spacing: number, delay = 0, mods = ''): WaveGroup => ({ type, count, spacing, delay, mods });

// 40 handcrafted waves. Bosses on 20, 30, 40.
export const WAVES: WaveGroup[][] = [
  /* 1 */[g('imp', 20, 0.6)],
  /* 2 */[g('imp', 32, 0.45)],
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
  /* 26 */[g('golem', 10, 1.5), g('behemoth', 1, 1, 5)], // first giant. Same enemies as before, half the density (was 0.8s spacing)
  /* 27 */[g('wraith', 15, 0.5, 0, 's'), g('iron', 10, 0.8, 4)],
  /* 28 */[g('golem', 12, 1.0), g('hydra', 10, 0.8, 5, 'r')], // same enemies, less burst (was 0.6s / 0.5s)
  /* 29 */[g('wraith', 20, 0.3), g('behemoth', 2, 3, 6)],
  /* 30 */[g('golem', 10, 0.8), g('lich', 1, 1, 6)],
  /* 31 */[g('hydra', 34, 0.3), g('behemoth', 4, 2.5, 6)],
  /* 32 */[g('golem', 30, 0.4, 0, 'r')],
  /* 33 */[g('behemoth', 6, 2)],
  /* 34 */[g('iron', 34, 0.3), g('golem', 24, 0.5, 6, 's')],
  /* 35 */[g('golem', 24, 0.4), g('warbeast', 1, 1, 10)],
  /* 36 */[g('golem', 18, 0.45, 0, 'f'), g('behemoth', 5, 2, 6)],
  /* 37 */[g('hydra', 36, 0.25), g('behemoth', 3, 3, 4), g('warbeast', 1, 1, 12)],
  /* 38 */[g('golem', 34, 0.3, 0, 'r'), g('behemoth', 4, 2, 10, 'f')],
  /* 39 */[g('golem', 28, 0.3, 0, 's'), g('behemoth', 6, 1.8, 6), g('warbeast', 1, 1, 16)],
  /* 40 */[g('behemoth', 4, 2.5), g('warbeast', 1, 1, 8), g('dragon', 1, 1, 14)],
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

// ---------------------------------------------------------------- wave preview (shown before a wave starts)

export interface WaveInfo {
  round: number; rbe: number; boss: boolean; giant: boolean; freeplay: boolean;
  units: { type: string; name: string; count: number; mods: string; isNew: boolean }[];
  threats: { tag: string; text: string; danger: boolean }[];
  /** Lives lost if the single most valuable enemy leaks. */
  worstLeak: number;
}

const COUNTER: Record<string, string> = {
  blast: 'Explosions can\'t hurt them: use arrows, blades or magic',
  sharp: 'Arrows and blades bounce off: use Cannon, Mage, Druid or Alchemist',
  cold: 'Immune to frost: don\'t rely on Druid cold',
  magic: 'Immune to magic: use arrows, cannons or soldiers',
};
const IMMUNE_NAME: Record<string, string> = { blast: 'blast', sharp: 'sharp', cold: 'cold', magic: 'magic' };

export function waveInfo(round: number): WaveInfo {
  const freeplay = round > WAVES.length;
  const groups = freeplay ? [] : WAVES[round - 1];
  const seen = new Set<string>();
  for (let i = 0; i < Math.min(round - 1, WAVES.length); i++) for (const gr of WAVES[i]) seen.add(gr.type);
  const units = groups.map((gr) => ({ type: gr.type, name: ENEMIES[gr.type].name, count: gr.count, mods: gr.mods ?? '', isNew: !seen.has(gr.type) }));
  const threats: WaveInfo['threats'] = [];
  let total = 0, worst = 0, giant = false, boss = false;
  const imm = new Map<string, string[]>();
  const modSeen = { s: false, r: false, f: false };
  for (const u of units) {
    const d = ENEMIES[u.type];
    const r = rbe(u.type) * (u.mods.includes('f') ? 1.6 : 1);
    total += r * u.count; worst = Math.max(worst, d.boss ? Infinity : Math.ceil(r));
    if (d.giant && !d.boss) giant = true;
    if (d.boss) boss = true;
    // immunities of the unit AND of the layers it contains
    const stack = [u.type];
    while (stack.length) { const id = stack.pop()!; const ed = ENEMIES[id]; for (const i of ed.immune) { const l = imm.get(i) ?? []; if (!l.includes(ed.name)) l.push(ed.name); imm.set(i, l); } stack.push(...ed.children.filter((c) => ENEMIES[c].rank >= 6)); }
    for (const m of ['s', 'r', 'f'] as const) if (u.mods.includes(m)) modSeen[m] = true;
  }
  if (boss) { const b = units.find((u) => ENEMIES[u.type].boss)!; threats.push({ tag: 'BOSS', text: `${b.name}: if it reaches the Spire you lose instantly. Save Meteor and abilities for it.`, danger: true }); }
  for (const u of units) {
    const d = ENEMIES[u.type];
    if (d.giant && !d.boss) threats.push({ tag: u.isNew ? 'NEW GIANT' : 'GIANT', text: `${u.count}× ${d.name} (${Math.round(d.hp)} HP shell). One leak costs ~${Math.ceil(rbe(u.type) * (u.mods.includes('f') ? 1.6 : 1))} lives! Needs heavy single-target damage: Ballista, Cannon (Big Bombs), Mage.`, danger: true });
  }
  for (const [i, names] of imm) threats.push({ tag: `${IMMUNE_NAME[i].toUpperCase()}-PROOF`, text: `${names.join(', ')}: ${COUNTER[i]}`, danger: false });
  if (modSeen.s) threats.push({ tag: 'SHADOWED', text: 'Invisible to towers without True Sight (Lyra, Archer Eagle Eye, Mage Arcane Sight, Ballista Spotter\'s Scope, Bard Songs of Insight).', danger: true });
  if (modSeen.r) threats.push({ tag: 'REGROW', text: 'Damaged layers grow back over time. Kill them quickly.', danger: false });
  if (modSeen.f) threats.push({ tag: 'FORTIFIED', text: 'Armored: extra HP on giants, golems and Ironclads.', danger: false });
  for (const u of units) if (u.isNew && !ENEMIES[u.type].giant) threats.push({ tag: 'NEW', text: `First ${u.name} sighting.`, danger: false });
  return { round, rbe: Math.round(total), boss, giant, freeplay, units, threats, worstLeak: worst };
}
