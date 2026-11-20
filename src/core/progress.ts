// Meta-progression: knowledge tree perks and consumable powers.

export interface Perk { id: string; branch: 'economy' | 'military' | 'arcane'; name: string; desc: string; tier: 1 | 2 }

export const PERKS: Perk[] = [
  { id: 'purse', branch: 'economy', tier: 1, name: 'Starting Purse', desc: '+150 starting gold' },
  { id: 'tax', branch: 'economy', tier: 1, name: 'Tax Collector', desc: '+15% end-of-round gold' },
  { id: 'thrift', branch: 'economy', tier: 1, name: 'Thrifty Builders', desc: 'Towers & upgrades 4% cheaper' },
  { id: 'banker', branch: 'economy', tier: 2, name: "Banker's Insight", desc: 'Interest cap raised from 20 to 40' },
  { id: 'academy', branch: 'economy', tier: 2, name: 'Hero Academy', desc: 'Heroes gain 25% more XP' },
  { id: 'steel', branch: 'military', tier: 1, name: 'Tempered Steel', desc: 'Sharp attacks 8% faster' },
  { id: 'study', branch: 'military', tier: 1, name: 'Arcane Study', desc: 'Magic attacks +10% range' },
  { id: 'powder', branch: 'military', tier: 1, name: 'Dwarven Powder', desc: 'Explosions 12% bigger' },
  { id: 'medics', branch: 'military', tier: 2, name: 'Field Hospital', desc: '+25 starting lives' },
  { id: 'drill', branch: 'military', tier: 2, name: 'Drill Sergeant', desc: 'Soldiers +25% health' },
  { id: 'spells', branch: 'arcane', tier: 1, name: 'Spell Mastery', desc: 'Spell cooldowns 20% shorter' },
  { id: 'meteor', branch: 'arcane', tier: 1, name: 'Heavier Meteors', desc: 'Meteor Shower +60% damage' },
  { id: 'freeze', branch: 'arcane', tier: 1, name: 'Deep Time', desc: 'Time Freeze lasts 1.5s longer' },
  { id: 'walls', branch: 'arcane', tier: 2, name: 'Stone Masons', desc: 'Reinforce Walls +15 more lives' },
  { id: 'relics', branch: 'arcane', tier: 2, name: 'Ancient Relics', desc: 'Tower & hero abilities recharge 10% faster' },
];

export interface PowerDef { id: string; name: string; icon: string; desc: string }
export const POWERS: PowerDef[] = [
  { id: 'chest', name: 'Treasure Chest', icon: '🪙', desc: '+500 gold' },
  { id: 'draught', name: 'Healing Draught', icon: '🧪', desc: '+50 lives' },
  { id: 'merc', name: 'Mercenary Contract', icon: '📜', desc: 'Your next tower is free' },
  { id: 'dragonfire', name: 'Dragonfire Scroll', icon: '🔥', desc: '40 damage to every enemy on the map' },
  { id: 'hourglass', name: 'Hourglass', icon: '⌛', desc: 'Freeze all non-boss enemies for 8s' },
];

export function perkPoints(medalCount: number, totalRounds: number) { return medalCount + Math.floor(totalRounds / 30); }

export function canBuyPerk(id: string, owned: string[], available: number): boolean {
  const p = PERKS.find((x) => x.id === id);
  if (!p || owned.includes(id) || available <= 0) return false;
  if (p.tier === 2) return owned.filter((o) => PERKS.find((x) => x.id === o)?.branch === p.branch).length >= 2;
  return true;
}

/** Powers earned at the end of a game. */
export function powersEarned(rounds: number, won: boolean, rnd: () => number = Math.random): string[] {
  const n = Math.floor(rounds / 8) + (won ? 2 : 0);
  return Array.from({ length: n }, () => POWERS[Math.floor(rnd() * POWERS.length)].id);
}
