// Player-facing explanations for every tower and hero: role, damage type, what it's good/bad against.
import { TOWER_MAP } from '../core/towers';
import { HERO_MAP } from '../core/heroes';
import type { DamageType } from '../core/types';

export interface TowerInfo {
  /** 1-word role tag shown on the Armory card */
  tag: string;
  /** one sentence: what it does */
  line: string;
  good: string[];
  weak: string[];
}

export const TOWER_INFO: Record<string, TowerInfo> = {
  archer: { tag: 'Ranged', line: 'Cheap, fast arrows at one or two enemies. A solid all-rounder.', good: ['Early waves', 'Fast enemies', 'Shadowed (with Eagle Eye)'], weak: ['Ironclads until Piercing Bolts or Flame Arrows'] },
  knight: { tag: 'Melee AoE', line: 'Sword sweeps hit every enemy in reach. Short range: put it on a bend.', good: ['Crowds at corners', 'Stunning (Guardian path)'], weak: ['Ironclads until Holy Steel', 'Anything out of reach'] },
  barracks: { tag: 'Blocker', line: 'Soldiers stand on the road and hold enemies so your other towers can hit them.', good: ['Stalling enemies in a kill zone', 'Fast enemies'], weak: ['Giants trample soldiers until Shieldwall'] },
  mage: { tag: 'Splash', line: 'Fireballs with a small blast. Magic damage gets through Ironclad armor.', good: ['Ironclads', 'Groups', 'Giants (Meteor path)'], weak: ['Hexlings (immune to magic)'] },
  druid: { tag: 'Slow', line: 'A chilling pulse that damages and slows everything around it.', good: ['Slowing fast waves', 'Crowds', 'Freezing for combos (Shatter)'], weak: ['Frostlings (immune to cold)', 'Low damage on its own'] },
  cannon: { tag: 'Splash', line: 'Explosive shells that hit a whole group at once.', good: ['Dense crowds', 'Ironclads', 'Giants (Big Bombs)'], weak: ['Glooms until Shell Shock', 'Lone fast enemies'] },
  ballista: { tag: 'Sniper', line: 'Hits anywhere on the map with heavy single bolts. Your giant and boss killer.', good: ['Giants and bosses', 'Shadowed (Spotter\'s Scope)', 'Any spot on the map'], weak: ['Big swarms', 'Ironclads until Iron Tips'] },
  alchemist: { tag: 'Acid', line: 'Acid splash that every enemy is vulnerable to. Can also buff towers or brew gold.', good: ['Any enemy type', 'Stripping Regrow and Fortified', 'Buffing your best towers'], weak: ['Low raw damage'] },
  bard: { tag: 'Support', line: 'Doesn\'t attack. Songs make nearby towers faster and stronger.', good: ['Boosting a cluster of towers', 'Letting towers hit Ironclads/Shadowed', 'Gold (Thrift path)'], weak: ['Useless with no towers nearby'] },
  mine: { tag: 'Income', line: 'Doesn\'t attack. Earns gold at the end of every wave.', good: ['Long games: pays for itself in about 13 waves, sooner with upgrades'], weak: ['Adds no defense'] },
};

export const HERO_INFO: Record<string, TowerInfo> = {
  aldric: { tag: 'Hero', line: 'Melee knight who sweeps crowds and rallies your towers to attack faster.', good: ['Crowds', 'Boosting towers (Rallying Cry)'], weak: ['Ironclads (sharp damage)'] },
  lyra: { tag: 'Hero', line: 'Long-range star bolts. Sees Shadowed enemies from level 1.', good: ['Shadowed', 'Ironclads (magic)', 'Slowing everything (Chrono Field)'], weak: ['Hexlings (immune to magic)'] },
  grimbeard: { tag: 'Hero', line: 'Blunderbuss blasts that hit groups, and he digs up gold.', good: ['Groups', 'Extra gold (Golden Haul)'], weak: ['Glooms (immune to blast)'] },
};

export const DTYPE: Record<DamageType | 'none', { name: string; blocked: string }> = {
  sharp: { name: 'Sharp', blocked: "Can't hurt Ironclads" },
  magic: { name: 'Magic', blocked: "Can't hurt Hexlings" },
  cold: { name: 'Cold', blocked: "Can't hurt Frostlings" },
  blast: { name: 'Blast', blocked: "Can't hurt Glooms" },
  acid: { name: 'Acid', blocked: 'Hurts everything' },
  pure: { name: 'Pure', blocked: 'Hurts everything' },
  none: { name: 'None', blocked: 'Does not attack' },
} as Record<DamageType | 'none', { name: string; blocked: string }>;

export function infoFor(defId: string, isHero: boolean): TowerInfo {
  return (isHero ? HERO_INFO[defId] : TOWER_INFO[defId]) ?? { tag: '', line: '', good: [], weak: [] };
}

/** Base combat numbers in plain words. */
export function baseStats(defId: string, isHero: boolean) {
  const s = isHero ? HERO_MAP[defId].stats(1) : TOWER_MAP[defId].base();
  const a = s.attacks[0];
  const dtype = (a?.dtype ?? (s.barracks ? 'sharp' : 'none')) as DamageType | 'none';
  if (s.barracks) {
    const b = s.barracks;
    return { dtype, rows: [['Soldiers', `${b.count}`], ['Damage', `${b.damage} per hit`], ['Holds', `${b.block} enemy each`], ['Range', `${Math.round(s.range)}`]] };
  }
  if (!a) {
    const rows: string[][] = [];
    if (s.income) rows.push(['Income', `+${s.income} gold per wave`]);
    if (s.aura) rows.push(['Song radius', `${Math.round(s.aura.radius)}`]);
    return { dtype, rows };
  }
  const rows: string[][] = [
    ['Damage', `${a.damage} per hit${a.count && a.count > 1 ? ` × ${a.count}` : ''}`],
    ['Speed', `${(1 / a.cd).toFixed(1)} attacks/s`],
    ['Range', a.range === Infinity ? 'Whole map' : `${Math.round(a.range)}`],
  ];
  if (a.splash) rows.push(['Splash', `radius ${Math.round(a.splash)}`]);
  else if (a.pierce > 1) rows.push(['Pierce', `hits ${a.pierce} enemies`]);
  if (a.slow) rows.push(['Slow', `${Math.round(a.slow.f * 100)}% for ${a.slow.dur}s`]);
  return { dtype, rows };
}

// ---------------------------------------------------------------- tower groups (how to use them)
export interface TowerGroup { id: string; name: string; short: string; how: string; color: string; towers: string[] }
export const GROUPS: TowerGroup[] = [
  { id: 'hero', name: 'Hero', short: 'Levels up', color: '#7a4fd6', towers: ['hero'],
    how: 'One per battle. Levels up every 2-3 waves (max level 10) and unlocks two abilities. Put it where the fighting is heaviest.' },
  { id: 'crowd', name: 'Crowd Damage', short: 'Hit groups', color: '#d8572f', towers: ['knight', 'mage', 'cannon'],
    how: 'Hit many enemies at once. Your answer to swarms. Put them on bends and where the road doubles back, so they reach more of it.' },
  { id: 'single', name: 'Single Target', short: 'Big enemies', color: '#2f7fd8', towers: ['archer', 'ballista'],
    how: 'Pour damage into one enemy at a time. Your answer to giants and bosses. Set targeting to Strong when giants show up.' },
  { id: 'control', name: 'Control', short: 'Slow & hold', color: '#1f9a8a', towers: ['barracks', 'druid'],
    how: 'Slow or hold enemies so your damage towers get more hits. Put them inside your damage towers\' range, never on their own.' },
  { id: 'support', name: 'Support & Gold', short: 'Buff & earn', color: '#c8901a', towers: ['alchemist', 'bard', 'mine'],
    how: 'Make nearby towers stronger, or earn gold. They barely attack, so build them once your defense is holding and place buffers next to your best towers.' },
];
export function groupOf(id: string): TowerGroup { return GROUPS.find((g) => g.towers.includes(id)) ?? GROUPS[0]; }
/** A good defense, in order. Shown in the group guide. */
export const BUILD_ORDER = [
  'Start with Crowd Damage on a bend: the early waves are swarms.',
  'Add Single Target before the first big enemies (Golems, then Giants from wave 26).',
  'Add Control where your damage overlaps, so enemies stay in range longer.',
  'Once nothing is leaking, add Support next to your best towers, or a Gold Mine early on for a long game.',
  'Break giants early. Everything inside a giant spills out where it dies, so kill it far from your Spire.',
  'Check the Next Wave box: it names the counter you need (Ironclads, Shadowed, Giants…).',
];
