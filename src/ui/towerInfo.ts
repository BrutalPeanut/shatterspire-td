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
  mine: { tag: 'Income', line: 'Doesn\'t attack. Earns gold at the end of every wave.', good: ['Long games: pays for itself after ~10 waves'], weak: ['Adds no defense'] },
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
