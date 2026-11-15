import type { AbilityDef, TowerStats } from './types';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  cost: number;
  color: string;
  accent: string;
  radius: number;
  desc: string;
  unlockRounds: number;
  stats: (level: number) => TowerStats;
  abilities: { level: number; def: AbilityDef; desc: string }[];
}

// Cumulative XP needed for levels 1..10
export const HERO_XP = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200];
export const heroXpForRound = (round: number) => 60 + 10 * round;

const base = (): Omit<TowerStats, 'attacks' | 'range'> => ({
  trueSight: false, armorPierce: false, wardBreak: false, blastAll: false,
  income: 0, incomeMult: 1, livesPerRound: 0, goldPerPop: 0, ironGold: 0,
});

export const HEROES: HeroDef[] = [
  {
    id: 'aldric', name: 'Sir Aldric', title: 'Knight-Captain', cost: 450, color: '#c9d3e3', accent: '#2f6fd6', radius: 18, unlockRounds: 0,
    desc: 'Melee sweeps that hit many enemies. Rallies your towers.',
    stats: (L) => ({
      ...base(), range: 78, armorPierce: L >= 2, trueSight: L >= 5,
      attacks: [{ id: 'main', kind: 'melee', cd: Math.max(0.45, 0.9 - L * 0.045), damage: 1 + Math.floor(L / 2), pierce: 4 + L * 2, range: 78 + L * 2, dtype: 'sharp', giantBonus: L >= 10 ? 10 : L >= 6 ? 3 : 0, visual: 'sweep', color: '#9cc6ff' }],
    }),
    abilities: [
      { level: 3, def: { id: 'rally', name: 'Rallying Cry', cd: 45, icon: '📯' }, desc: 'All towers attack 50% faster for 10s' },
      { level: 7, def: { id: 'dawnblade', name: 'Blade of Dawn', cd: 40, icon: '🗡️' }, desc: 'Massive strike around Aldric that stuns' },
    ],
  },
  {
    id: 'lyra', name: 'Lyra Starfall', title: 'Arcanist', cost: 600, color: '#6b4fd6', accent: '#ffe27a', radius: 16, unlockRounds: 20,
    desc: 'Long-range star bolts. Sees Shadowed enemies from level 1.',
    stats: (L) => ({
      ...base(), range: 160 + L * 4, trueSight: true, wardBreak: L >= 8,
      attacks: [{ id: 'main', kind: 'proj', cd: Math.max(0.3, 0.65 - L * 0.03), damage: 1 + Math.floor(L / 3), pierce: 2 + Math.floor(L / 2), range: 160 + L * 4, speed: 700, dtype: 'magic', giantBonus: L >= 9 ? 8 : 0, visual: 'star', color: '#ffe27a', size: 5 }],
    }),
    abilities: [
      { level: 3, def: { id: 'nova', name: 'Arcane Nova', cd: 35, icon: '✨' }, desc: 'Burst of magic around Lyra' },
      { level: 7, def: { id: 'chrono', name: 'Chrono Field', cd: 60, icon: '⏳' }, desc: 'All enemies slowed 50% for 8s' },
    ],
  },
  {
    id: 'grimbeard', name: 'Grimbeard', title: 'Dwarf Engineer', cost: 550, color: '#a0522d', accent: '#ffcc33', radius: 17, unlockRounds: 50,
    desc: 'Blunderbuss blasts that hurt everything. Makes money.',
    stats: (L) => ({
      ...base(), range: 130 + L * 3, blastAll: true,
      attacks: [{ id: 'main', kind: 'proj', cd: Math.max(0.5, 1.1 - L * 0.05), damage: 1 + Math.floor(L / 3), pierce: 1, range: 130 + L * 3, speed: 520, splash: 28 + L * 2, splashPierce: 8 + L * 2, dtype: 'blast', giantBonus: L >= 8 ? 6 : 0, visual: 'bomb', color: '#3a2a1a', size: 5 }],
    }),
    abilities: [
      { level: 3, def: { id: 'keg', name: 'Powder Keg', cd: 30, icon: '🛢️' }, desc: 'Drops an exploding keg in front of the lead enemy' },
      { level: 7, def: { id: 'haul', name: 'Golden Haul', cd: 60, icon: '💰' }, desc: 'Instantly gain gold' },
    ],
  },
];
export const HERO_MAP: Record<string, typeof HEROES[number]> = Object.fromEntries(HEROES.map((h) => [h.id, h]));

export function heroLevel(xp: number): number {
  let L = 1;
  for (let i = 0; i < HERO_XP.length; i++) if (xp >= HERO_XP[i]) L = i + 1;
  return L;
}
