import type { EnemyDef } from './types';

// Layered enemies, Bloons-style: destroying a layer reveals its children.
// Speeds are px/second in world units.
const list: EnemyDef[] = [
  { id: 'imp', name: 'Imp', hp: 1, speed: 62, radius: 9, children: [], color: '#e5483b', immune: [], rank: 1, gold: 1 },
  { id: 'goblin', name: 'Goblin', hp: 1, speed: 86, radius: 10, children: ['imp'], color: '#3d7fe0', immune: [], rank: 2, gold: 1, regenParent: 'orc' },
  { id: 'orc', name: 'Orc', hp: 1, speed: 110, radius: 11, children: ['goblin'], color: '#45b54a', immune: [], rank: 3, gold: 1, regenParent: 'troll' },
  { id: 'troll', name: 'Troll', hp: 1, speed: 190, radius: 11, children: ['orc'], color: '#f2c531', immune: [], rank: 4, gold: 1, regenParent: 'ogre' },
  { id: 'ogre', name: 'Ogre', hp: 1, speed: 215, radius: 12, children: ['troll'], color: '#f27ab8', immune: [], rank: 5, gold: 1 },
  { id: 'gloom', name: 'Gloom', hp: 1, speed: 110, radius: 9, children: ['ogre', 'ogre'], color: '#2b2433', immune: ['blast'], rank: 6, gold: 1 },
  { id: 'frostling', name: 'Frostling', hp: 1, speed: 125, radius: 9, children: ['ogre', 'ogre'], color: '#eaf6ff', immune: ['cold'], rank: 6, gold: 1 },
  { id: 'hexling', name: 'Hexling', hp: 1, speed: 190, radius: 10, children: ['ogre', 'ogre'], color: '#8b4fd6', immune: ['magic'], rank: 6, gold: 1 },
  { id: 'wraith', name: 'Wraith', hp: 1, speed: 110, radius: 12, children: ['gloom', 'frostling'], color: '#6d6a78', immune: ['blast', 'cold'], rank: 7, gold: 1 },
  { id: 'iron', name: 'Ironclad', hp: 1, speed: 62, radius: 13, children: ['gloom', 'gloom'], color: '#8a96a3', immune: ['sharp'], rank: 7, gold: 1 },
  { id: 'hydra', name: 'Hydra', hp: 1, speed: 145, radius: 13, children: ['wraith', 'wraith'], color: '#ff8a3d', immune: [], rank: 8, gold: 1 },
  { id: 'golem', name: 'Stone Golem', hp: 10, speed: 160, radius: 15, children: ['hydra', 'hydra'], color: '#9a8a74', immune: [], rank: 9, gold: 2 },
  // Giants (MOAB-class): big HP pools, burst into many children.
  { id: 'behemoth', name: 'Siege Behemoth', hp: 200, speed: 45, radius: 26, children: ['golem', 'golem', 'golem', 'golem'], color: '#3a5f8f', giant: true, immune: [], rank: 10, gold: 20 },
  { id: 'warbeast', name: 'War Mammoth', hp: 700, speed: 28, radius: 34, children: ['behemoth', 'behemoth', 'behemoth', 'behemoth'], color: '#a8433a', giant: true, immune: [], rank: 11, gold: 40 },
  { id: 'colossus', name: 'Iron Colossus', hp: 4000, speed: 20, radius: 42, children: ['warbeast', 'warbeast', 'warbeast', 'warbeast'], color: '#36523a', giant: true, immune: [], rank: 12, gold: 80 },
  // Bosses (HP bar at top of screen).
  { id: 'golemking', name: 'The Golem King', hp: 320, speed: 30, radius: 38, children: ['wraith', 'wraith', 'wraith', 'wraith'], color: '#8c7a5e', giant: true, boss: true, immune: [], rank: 20, gold: 300, spawn: { every: 5, type: 'troll', count: 2 } },
  { id: 'lich', name: 'Malachar the Lich', hp: 1600, speed: 26, radius: 36, children: ['golem', 'golem', 'golem', 'golem'], color: '#5b3d8a', giant: true, boss: true, immune: [], rank: 21, gold: 700, spawn: { every: 6, type: 'wraith', count: 2, mods: 's' } },
  { id: 'dragon', name: 'Vyrmax the Elder Dragon', hp: 6400, speed: 22, radius: 46, children: ['behemoth', 'behemoth'], color: '#c23b2a', giant: true, boss: true, immune: [], rank: 22, gold: 2000, spawn: { every: 14, type: 'behemoth', count: 1 } },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));

// Red-Bloon-Equivalent: total hits to fully clear (also lives lost on leak).
const rbeCache: Record<string, number> = {};
export function rbe(id: string): number {
  if (rbeCache[id] !== undefined) return rbeCache[id];
  const d = ENEMIES[id];
  let v = d.hp;
  for (const c of d.children) v += rbe(c);
  rbeCache[id] = v;
  return v;
}

export const ENEMY_ORDER = list.map((e) => e.id);
