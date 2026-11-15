import type { Attack, TowerDef, TowerStats, UpgradeDef } from './types';

// ---- helpers -------------------------------------------------------------
const stats = (attacks: Attack[], extra: Partial<TowerStats> = {}): TowerStats => ({
  range: attacks[0]?.range ?? 0,
  trueSight: false, armorPierce: false, wardBreak: false, blastAll: false,
  attacks, income: 0, incomeMult: 1, livesPerRound: 0, goldPerPop: 0, ironGold: 0,
  ...extra,
});
const main = (s: TowerStats) => s.attacks[0];
const atk = (s: TowerStats, id: string) => s.attacks.find((a) => a.id === id);
const U = (name: string, cost: number, desc: string, apply: (s: TowerStats) => void): UpgradeDef => ({ name, cost, desc, apply });
const range = (s: TowerStats, add: number) => { for (const a of s.attacks) if (a.range !== Infinity) a.range += add; s.range += add; if (s.aura) s.aura.radius += add; };
const faster = (a: Attack | undefined, m: number) => { if (a) a.cd *= m; };

// ---- Archer --------------------------------------------------------------
const archer: TowerDef = {
  id: 'archer', name: 'Archer', cost: 200, color: '#3f8f3a', accent: '#c9a35b', radius: 16, unlockRounds: 0,
  desc: 'Cheap, reliable arrows. Sharp damage: cannot hurt Ironclads until upgraded.',
  paths: ['Volley', 'Hawkeye', 'Elven Fire'],
  base: () => stats([{ id: 'main', kind: 'proj', cd: 0.95, damage: 1, pierce: 2, range: 130, speed: 620, dtype: 'sharp', visual: 'arrow', color: '#6b4a2b' }]),
  upgrades: [
    [
      U('Sharp Arrows', 140, '+1 pierce', (s) => { main(s).pierce += 1; }),
      U('Barbed Arrows', 220, '+2 pierce', (s) => { main(s).pierce += 2; }),
      U('Triple Shot', 400, 'Fires 3 arrows at once', (s) => { main(s).count = 3; main(s).spread = 0.2; }),
      U('Arrow Storm', 2000, '5 arrows, 40% faster', (s) => { main(s).count = 5; main(s).spread = 0.16; faster(main(s), 0.6); main(s).pierce += 2; }),
      U('Ranger General', 15000, '8 arrows, +2 dmg. Ability: Arrow Rain hits every enemy for 12', (s) => { const a = main(s); a.count = 8; a.spread = 0.12; a.damage += 2; a.pierce += 4; s.ability = { id: 'arrowrain', name: 'Arrow Rain', cd: 45, icon: '🏹' }; }),
    ],
    [
      U('Long Bow', 100, '+30 range', (s) => range(s, 30)),
      U('Eagle Eye', 180, '+20 range, sees Shadowed enemies', (s) => { range(s, 20); s.trueSight = true; }),
      U('Piercing Bolts', 600, '+2 dmg, +2 pierce, hits Ironclads', (s) => { main(s).damage += 2; main(s).pierce += 2; s.armorPierce = true; main(s).speed = 900; }),
      U('Marksman', 1800, '+3 dmg, 30% faster, +4 vs giants', (s) => { main(s).damage += 3; faster(main(s), 0.7); main(s).giantBonus = (main(s).giantBonus ?? 0) + 4; }),
      U('Deadeye', 12000, '+12 dmg, +15 vs giants, +5 pierce', (s) => { main(s).damage += 12; main(s).giantBonus! += 15; main(s).pierce += 5; faster(main(s), 0.7); }),
    ],
    [
      U('Swift Fingers', 120, '15% faster', (s) => faster(main(s), 0.85)),
      U('Flame Arrows', 300, 'Arrows burn and can hurt Ironclads', (s) => { main(s).burn = { dps: 1, dur: 3 }; s.armorPierce = true; main(s).visual = 'firearrow'; }),
      U('Explosive Tips', 700, 'Arrows explode on hit', (s) => { main(s).splash = 30; main(s).splashPierce = 8; }),
      U('Sunfire Bow', 3000, 'Twice as fast, bigger blasts, hotter burn', (s) => { faster(main(s), 0.5); main(s).splash = 45; main(s).splashPierce = 14; main(s).damage += 2; main(s).burn = { dps: 3, dur: 3 }; }),
      U('Avatar of the Sun', 18000, 'Blazing rapid fire, huge blasts', (s) => { faster(main(s), 0.45); main(s).damage += 5; main(s).splash = 70; main(s).splashPierce = 30; main(s).burn = { dps: 10, dur: 3 }; main(s).pierce += 5; }),
    ],
  ],
};

// ---- Knight ---------------------------------------------------------------
const knight: TowerDef = {
  id: 'knight', name: 'Knight', cost: 300, color: '#9aa5b8', accent: '#d94040', radius: 17, unlockRounds: 0,
  desc: 'Sword sweeps hit everything nearby. Great at corners.',
  paths: ['Whirlwind', 'Holy Order', 'Guardian'],
  base: () => stats([{ id: 'main', kind: 'melee', cd: 1.1, damage: 1, pierce: 6, range: 70, dtype: 'sharp', visual: 'sweep', color: '#e8eef7' }]),
  upgrades: [
    [
      U('Quick Spin', 150, '20% faster', (s) => faster(main(s), 0.8)),
      U('Wider Swing', 200, '+18 range', (s) => range(s, 18)),
      U('Blade Dancer', 600, '40% faster, +4 pierce', (s) => { faster(main(s), 0.6); main(s).pierce += 4; }),
      U('Bladestorm', 2800, 'Relentless spinning: +2 dmg, +10 pierce', (s) => { faster(main(s), 0.4); main(s).damage += 2; main(s).pierce += 10; }),
      U('Storm of Steel', 16000, 'A whirlwind of blades', (s) => { faster(main(s), 0.35); main(s).damage += 4; main(s).pierce += 30; range(s, 20); }),
    ],
    [
      U('Blessed Blade', 200, '+1 damage', (s) => { main(s).damage += 1; }),
      U('Holy Steel', 400, 'Hits Ironclads', (s) => { s.armorPierce = true; }),
      U('Paladin', 1200, '+2 dmg, +3 vs giants, sees Shadowed', (s) => { main(s).damage += 2; main(s).giantBonus = 3; s.trueSight = true; }),
      U('Templar', 4000, '+4 dmg. Aura: nearby towers +1 pierce & hit Ironclads', (s) => { main(s).damage += 4; s.aura = { radius: 120, pierce: 1, armorPierce: true }; }),
      U('Avatar of Light', 20000, '+12 dmg, +20 vs giants. Ability: Judgment smites the strongest enemy for 3000', (s) => { main(s).damage += 12; main(s).giantBonus! += 20; s.ability = { id: 'judgment', name: 'Judgment', cd: 40, icon: '⚔️' }; }),
    ],
    [
      U('Shield Bash', 150, 'Hits stun briefly', (s) => { main(s).stun = 0.3; }),
      U('Heavy Shield', 300, 'Knocks enemies back', (s) => { main(s).knock = 10; }),
      U('Bulwark', 900, 'Longer stun, slows giants nearby', (s) => { main(s).stun = 0.6; range(s, 10); s.aura = { radius: main(s).range, enemySlow: 0.2, enemySlowBoss: 0.1 }; }),
      U('Warden', 3000, '+2 dmg, stuns even giants', (s) => { main(s).stun = 1.0; main(s).stunGiants = 0.3; main(s).damage += 2; }),
      U('Unbreakable Wall', 14000, 'Enemies nearby crawl at half speed', (s) => { main(s).stun = 1.5; main(s).stunGiants = 0.5; main(s).damage += 4; s.aura = { radius: main(s).range, enemySlow: 0.5, enemySlowBoss: 0.25 }; }),
    ],
  ],
};

// ---- Fire Mage --------------------------------------------------------------
const mage: TowerDef = {
  id: 'mage', name: 'Fire Mage', cost: 400, color: '#c2412f', accent: '#ffcf4a', radius: 16, unlockRounds: 0,
  desc: 'Fireballs with small splash. Magic: hurts Ironclads, but Hexlings are immune.',
  paths: ['Pyromancy', 'Arcane', 'Meteor'],
  base: () => stats([{ id: 'main', kind: 'proj', cd: 1.1, damage: 1, pierce: 1, range: 150, speed: 420, splash: 26, splashPierce: 6, dtype: 'magic', visual: 'fireball', color: '#ff7a1a', size: 6 }]),
  upgrades: [
    [
      U('Kindle', 250, 'Fireballs set enemies ablaze', (s) => { main(s).burn = { dps: 1, dur: 3 }; }),
      U('Inferno', 500, 'Bigger explosions', (s) => { main(s).splash! += 12; main(s).splashPierce! += 6; }),
      U('Wall of Fire', 1600, 'Conjures burning walls on the path', (s) => { s.attacks.push({ id: 'firewall', kind: 'groundfx', cd: 4, damage: 1, pierce: 20, range: main(s).range, dtype: 'magic', fx: { radius: 42, dps: 4, dur: 4 }, visual: 'firewall', color: '#ff5a1a' }); }),
      U('Phoenix Caller', 5000, 'A phoenix circles the map raining fire', (s) => { s.attacks.push({ id: 'phoenix', kind: 'proj', cd: 0.3, damage: 3, pierce: 1, range: Infinity, speed: 600, splash: 30, splashPierce: 8, dtype: 'magic', visual: 'fireball', color: '#ffd23a', size: 5 }); }),
      U('Infernal Archmage', 22000, 'Everything burns hotter', (s) => { for (const a of s.attacks) a.damage += 4; const p = atk(s, 'phoenix'); if (p) p.damage += 6; main(s).burn = { dps: 6, dur: 3 }; const fw = atk(s, 'firewall'); if (fw) fw.fx!.dps = 16; }),
    ],
    [
      U('Focus', 150, '20% faster', (s) => faster(main(s), 0.8)),
      U('Arcane Sight', 300, '+20 range, sees Shadowed', (s) => { range(s, 20); s.trueSight = true; }),
      U('Chain Lightning', 1200, 'Lightning arcs between 6 enemies', (s) => { s.attacks.push({ id: 'lightning', kind: 'chain', cd: 1.0, damage: 2, pierce: 1, chain: 6, range: main(s).range, dtype: 'magic', visual: 'bolt', color: '#9fe0ff' }); }),
      U('Storm Caller', 4200, 'Lightning hits 12, twice as often', (s) => { const l = atk(s, 'lightning')!; l.chain = 12; l.damage = 4; l.cd = 0.5; }),
      U('Archmage of Storms', 18000, 'Devastating storms that pierce wards', (s) => { const l = atk(s, 'lightning')!; l.chain = 25; l.damage = 10; l.cd = 0.3; s.wardBreak = true; }),
    ],
    [
      U('Bigger Fireballs', 300, '+1 dmg, bigger splash', (s) => { main(s).damage += 1; main(s).splash! += 10; }),
      U('Searing Core', 600, '+2 vs giants', (s) => { main(s).giantBonus = 2; }),
      U('Meteor', 2000, '+1 dmg. Ability: Meteor Strike', (s) => { main(s).damage += 1; s.ability = { id: 'meteor', name: 'Meteor Strike', cd: 35, icon: '☄️' }; }),
      U('Comet Fall', 6000, 'Comets crash down every 3s', (s) => { s.attacks.push({ id: 'comet', kind: 'lob', cd: 3, damage: 30, pierce: 1, range: Infinity, speed: 500, splash: 60, splashPierce: 40, dtype: 'magic', targeting: 'strong', visual: 'comet', color: '#ffb02e', size: 10 }); }),
      U('Starfall', 24000, 'Comets every second; Meteor Strike much stronger', (s) => { const c = atk(s, 'comet')!; c.cd = 1; c.damage = 80; c.splash = 80; s.ability = { id: 'starfall', name: 'Starfall', cd: 35, icon: '🌠' }; }),
    ],
  ],
};

// ---- Frost Druid ------------------------------------------------------------
const druid: TowerDef = {
  id: 'druid', name: 'Frost Druid', cost: 350, color: '#4aa3c7', accent: '#e8fbff', radius: 16, unlockRounds: 0,
  desc: 'Chilling pulse damages and slows everything around it. Frostlings are immune to cold.',
  paths: ['Deep Freeze', 'Wildwood', 'Blizzard'],
  base: () => stats([{ id: 'main', kind: 'pulse', cd: 1.6, damage: 1, pierce: 40, range: 80, dtype: 'cold', slow: { f: 0.4, dur: 1.2 }, visual: 'frost', color: '#bdf0ff' }]),
  upgrades: [
    [
      U('Permafrost', 200, 'Stronger, longer slow', (s) => { main(s).slow = { f: 0.5, dur: 2 }; }),
      U('Flash Freeze', 350, 'Freezes enemies solid', (s) => { main(s).stun = 0.6; }),
      U('Shatter', 1200, 'Frozen enemies take +2 damage from everything', (s) => { s.shatter = 2; }),
      U('Glacial Core', 3500, '+2 dmg, longer freeze, chills giants', (s) => { main(s).damage += 2; main(s).stun = 1.2; main(s).slow = { f: 0.5, dur: 2, giants: 0.3 }; }),
      U('Absolute Zero', 15000, '+4 dmg. Ability: freeze every enemy for 6s', (s) => { main(s).damage += 4; s.shatter = 4; s.ability = { id: 'absolutezero', name: 'Absolute Zero', cd: 50, icon: '❄️' }; }),
    ],
    [
      U('Bramble', 150, 'Throws thorns', (s) => { s.attacks.push({ id: 'thorns', kind: 'proj', cd: 0.8, damage: 1, pierce: 3, range: main(s).range + 40, speed: 520, dtype: 'sharp', visual: 'thorn', color: '#4b7d2a' }); }),
      U('Entangle', 400, 'Thorns root enemies briefly', (s) => { atk(s, 'thorns')!.stun = 0.3; }),
      U('Grove Guardian', 1400, '4 thorns at once, sees Shadowed', (s) => { const t = atk(s, 'thorns')!; t.count = 4; t.spread = 0.3; s.trueSight = true; }),
      U('Wrath of Nature', 4500, 'Vines lash through 10 enemies', (s) => { s.attacks.push({ id: 'vines', kind: 'chain', cd: 0.6, damage: 4, pierce: 1, chain: 10, range: main(s).range + 60, dtype: 'acid', visual: 'vine', color: '#3fa34d' }); }),
      U('Heart of the Forest', 17000, 'The forest itself fights', (s) => { const v = atk(s, 'vines')!; v.damage = 15; v.chain = 20; atk(s, 'thorns')!.damage += 3; }),
    ],
    [
      U('Wide Chill', 150, '+20 range', (s) => range(s, 20)),
      U('Biting Cold', 400, '+1 dmg, faster pulses', (s) => { main(s).damage += 1; faster(main(s), 0.7); }),
      U("Frost Giant's Breath", 1500, 'Slows giants and bosses too', (s) => { main(s).slow = { ...(main(s).slow ?? { f: 0.4, dur: 1.2 }), giants: 0.4 }; }),
      U('Blizzard', 4000, '+40 range, +2 dmg, sees Shadowed', (s) => { range(s, 40); main(s).damage += 2; faster(main(s), 0.6); s.trueSight = true; }),
      U('Eternal Winter', 16000, 'Every enemy on the map is slowed 30%', (s) => { main(s).damage += 6; s.globalSlow = 0.3; }),
    ],
  ],
};

// ---- Ballista ------------------------------------------------------------------
const ballista: TowerDef = {
  id: 'ballista', name: 'Ballista', cost: 500, color: '#8a5a32', accent: '#d9d9d9', radius: 17, unlockRounds: 10,
  desc: 'Map-wide range, instant heavy bolts. Slow but hits hard.',
  paths: ['Siege Bolts', 'Repeater', 'Shrapnel'],
  base: () => stats([{ id: 'main', kind: 'hitscan', cd: 1.6, damage: 3, pierce: 1, range: Infinity, dtype: 'sharp', visual: 'bolt', color: '#fff3c4' }]),
  upgrades: [
    [
      U('Heavy Bolts', 300, '+2 dmg', (s) => { main(s).damage += 2; }),
      U('Iron Tips', 450, '+1 dmg, hits Ironclads', (s) => { main(s).damage += 1; s.armorPierce = true; }),
      U('Giant Slayer', 2600, '+5 dmg, +12 vs giants', (s) => { main(s).damage += 5; main(s).giantBonus = 12; }),
      U('Wyrm Piercer', 6500, '+15 dmg, +30 vs giants', (s) => { main(s).damage += 15; main(s).giantBonus! += 30; }),
      U('Godspear', 28000, '+40 dmg, +80 vs giants, pierces 4', (s) => { main(s).damage += 40; main(s).giantBonus! += 80; main(s).pierce += 4; }),
    ],
    [
      U('Oiled Gears', 300, '25% faster', (s) => faster(main(s), 0.75)),
      U('Repeating Crank', 600, '40% faster', (s) => faster(main(s), 0.6)),
      U('Volley Ballista', 2500, 'Twice as fast, +1 dmg', (s) => { faster(main(s), 0.5); main(s).damage += 1; }),
      U('Siege Engine', 5000, 'Twice as fast again, +2 dmg', (s) => { faster(main(s), 0.5); main(s).damage += 2; }),
      U('Thousand Bolts', 22000, 'A storm of bolts, +6 dmg', (s) => { faster(main(s), 0.4); main(s).damage += 6; }),
    ],
    [
      U("Spotter's Scope", 200, 'Sees Shadowed enemies', (s) => { s.trueSight = true; }),
      U('Shrapnel Bolts', 400, 'Bolts burst into shards', (s) => { main(s).shards = { count: 4, damage: 1, pierce: 2 }; }),
      U('Bursting Bolts', 1400, 'Bolts explode', (s) => { main(s).splash = 40; main(s).splashPierce = 15; main(s).damage += 1; }),
      U('Supply Drop', 3000, '+250 gold every round', (s) => { s.income += 250; }),
      U('Elite Siege Team', 14000, 'All Ballistas +50% damage, +600 gold/round', (s) => { s.income += 600; s.globalBallistaBuff = 0.5; main(s).damage += 4; }),
    ],
  ],
};

// ---- Alchemist ------------------------------------------------------------------
const alchemist: TowerDef = {
  id: 'alchemist', name: 'Alchemist', cost: 450, color: '#5a8f3e', accent: '#b6ff5a', radius: 16, unlockRounds: 25,
  desc: 'Acid potions hurt every enemy type. Can brew buffs or gold.',
  paths: ['Acid', 'Elixirs', 'Gold'],
  base: () => stats([{ id: 'main', kind: 'lob', cd: 1.4, damage: 1, pierce: 1, range: 120, speed: 380, splash: 35, splashPierce: 12, dtype: 'acid', acid: { dps: 1, dur: 2 }, visual: 'potion', color: '#8eff3a', size: 6 }]),
  upgrades: [
    [
      U('Stronger Acid', 250, 'Acid burns twice as fast', (s) => { main(s).acid = { dps: 2, dur: 2.5 }; }),
      U('Corrosion', 500, 'Strips Regen and Fortified', (s) => { main(s).strip = true; }),
      U('Unstable Concoction', 2500, 'Hurls volatile flasks at giants', (s) => { s.attacks.push({ id: 'unstable', kind: 'lob', cd: 2, damage: 50, pierce: 1, range: main(s).range + 40, speed: 420, splash: 25, splashPierce: 4, dtype: 'acid', targeting: 'strong', giantBonus: 50, visual: 'potion', color: '#ff3ad2', size: 8 }); }),
      U('Dissolution', 6000, 'Acid 8/s, flasks hit harder', (s) => { main(s).acid = { dps: 8, dur: 3 }; atk(s, 'unstable')!.giantBonus = 150; }),
      U("Philosopher's Acid", 20000, 'Acid 25/s, reveals Shadowed', (s) => { main(s).acid = { dps: 25, dur: 3 }; main(s).splash! += 20; main(s).reveal = true; atk(s, 'unstable')!.giantBonus = 500; }),
    ],
    [
      U('Brewing', 200, 'Buffs 1 nearby tower: +40% speed, +1 pierce', (s) => { s.brew = { count: 1, rate: 0.4, pierce: 1, damage: 0, period: 6, dur: 6 }; }),
      U('Potent Brew', 400, 'Buffs 2 towers, +60% speed', (s) => { s.brew!.count = 2; s.brew!.rate = 0.6; }),
      U('Elixir of Power', 1800, 'Buffs 4 towers, +2 dmg, +2 pierce', (s) => { s.brew!.count = 4; s.brew!.damage = 2; s.brew!.pierce = 2; }),
      U('Grand Alchemy', 4000, 'Buffs 6; buffed towers see Shadowed & hit Ironclads', (s) => { s.brew!.count = 6; s.brew!.trueSight = true; s.brew!.armorPierce = true; }),
      U('Elixir of Ages', 16000, 'Buffs every tower in range: double speed', (s) => { s.brew!.count = 99; s.brew!.rate = 1.0; s.brew!.damage = 3; }),
    ],
    [
      U('Golden Touch', 300, '+1 gold per layer this tower pops', (s) => { s.goldPerPop += 1; }),
      U('Precious Potions', 600, '+60 gold per round', (s) => { s.income += 60; }),
      U('Midas Mixture', 2200, 'Ironclads drop +5 gold, +150/round', (s) => { s.ironGold = 5; s.income += 150; }),
      U('Gilded Cauldron', 5000, '+400 gold per round', (s) => { s.income += 400; }),
      U("Philosopher's Stone", 18000, '+1500/round; upgrades nearby 15% cheaper', (s) => { s.income += 1500; s.aura = { radius: main(s).range, discount: 0.15 }; }),
    ],
  ],
};

// ---- Bard -------------------------------------------------------------------------
const bard: TowerDef = {
  id: 'bard', name: 'Bard', cost: 400, color: '#d68a2f', accent: '#7a3fbf', radius: 16, unlockRounds: 40,
  desc: "Doesn't attack. Songs buff nearby towers.",
  paths: ['Anthem', 'Insight', 'Thrift'],
  base: () => stats([], { range: 140, aura: { radius: 140, range: 0.1 } }),
  upgrades: [
    [
      U('Marching Tune', 250, 'Nearby towers +10% attack speed', (s) => { s.aura!.rate = 0.1; }),
      U('War Drums', 500, '+15% speed, +10% range', (s) => { s.aura!.rate = 0.15; s.aura!.range = 0.2; }),
      U('Hymn of Valor', 2000, '+25% speed, +1 pierce', (s) => { s.aura!.rate = 0.25; s.aura!.pierce = 1; }),
      U('Battle Opera', 6000, '+35% speed, +1 damage', (s) => { s.aura!.rate = 0.35; s.aura!.damage = 1; }),
      U('Symphony of Heroes', 20000, '+50% speed, +2 dmg, +3 pierce. Ability: Crescendo', (s) => { s.aura!.rate = 0.5; s.aura!.damage = 2; s.aura!.pierce = 3; s.ability = { id: 'crescendo', name: 'Crescendo', cd: 60, icon: '🎵' }; }),
    ],
    [
      U('Songs of Insight', 200, 'Nearby towers see Shadowed', (s) => { s.aura!.trueSight = true; }),
      U('Lay of Iron', 600, 'Nearby towers hit Ironclads and Hexlings', (s) => { s.aura!.armorPierce = true; s.aura!.wardBreak = true; }),
      U('Echo Locator', 1500, '+40 radius, reveals Shadowed in range', (s) => { s.aura!.radius += 40; s.range += 40; s.aura!.reveal = true; }),
      U('Dirge of Weakness', 4000, 'Enemies in range take +1 damage', (s) => { s.aura!.vuln = 1; }),
      U('Requiem', 15000, 'Enemies take +3 dmg, giants +20%; strips Fortified', (s) => { s.aura!.vuln = 3; s.aura!.giantVuln = 0.2; s.aura!.stripFortify = true; }),
    ],
    [
      U('Coin Ballad', 400, '+80 gold per round', (s) => { s.income += 80; }),
      U('Bargain Song', 600, 'Nearby towers & upgrades 10% cheaper', (s) => { s.aura!.discount = 0.1; }),
      U("Minstrel's Purse", 2000, '+250 gold per round', (s) => { s.income += 250; }),
      U('Royal Patron', 6000, '+600 gold/round, 15% discount', (s) => { s.income += 600; s.aura!.discount = 0.15; }),
      U('Golden Age', 20000, '+2000 gold/round, 20% discount', (s) => { s.income += 2000; s.aura!.discount = 0.2; }),
    ],
  ],
};

// ---- Dwarven Cannon ---------------------------------------------------------
const cannon: TowerDef = {
  id: 'cannon', name: 'Dwarven Cannon', cost: 550, color: '#5c5c66', accent: '#e0a030', radius: 18, unlockRounds: 0,
  desc: 'Explosive shells hit crowds. Blast cannot hurt Glooms.',
  paths: ['Big Bombs', 'Rapid Fire', 'Concussive'],
  base: () => stats([{ id: 'main', kind: 'proj', cd: 1.4, damage: 1, pierce: 1, range: 140, speed: 460, splash: 32, splashPierce: 14, dtype: 'blast', visual: 'bomb', color: '#2a2a2a', size: 7 }]),
  upgrades: [
    [
      U('Bigger Bombs', 350, 'Bigger blast radius', (s) => { main(s).splash! += 10; main(s).splashPierce! += 8; }),
      U('Heavy Powder', 600, '+1 dmg, bigger blast', (s) => { main(s).damage += 1; main(s).splash! += 6; }),
      U('Mountain Breaker', 1800, '+2 dmg, +6 vs giants', (s) => { main(s).damage += 2; main(s).giantBonus = 6; }),
      U('Earthshaker', 5500, '+4 dmg, +20 vs giants, stuns giants', (s) => { main(s).damage += 4; main(s).giantBonus! += 20; main(s).stunGiants = 0.3; }),
      U('Ragnarök Mortar', 26000, 'Apocalyptic shells', (s) => { main(s).damage += 20; main(s).giantBonus! += 60; main(s).splash! += 30; main(s).splashPierce! += 30; }),
    ],
    [
      U('Quick Loader', 250, '25% faster', (s) => faster(main(s), 0.75)),
      U('Twin Barrels', 500, 'Fires 2 shells', (s) => { main(s).count = 2; main(s).spread = 0.15; }),
      U('Cluster Bombs', 1300, 'Shells scatter bomblets', (s) => { main(s).cluster = { count: 6, damage: 1, splash: 18, depth: 1 }; }),
      U('Recursive Cluster', 3500, 'Bomblets scatter bomblets, 30% faster', (s) => { main(s).cluster!.depth = 2; faster(main(s), 0.7); }),
      U('Bombardment Engine', 20000, 'Non-stop bombardment', (s) => { faster(main(s), 0.4); main(s).damage += 3; main(s).cluster!.damage += 2; main(s).cluster!.count = 8; }),
    ],
    [
      U('Long Fuse', 200, '+25 range', (s) => range(s, 25)),
      U('Concussion', 500, 'Explosions stun', (s) => { main(s).stun = 0.5; }),
      U('Shell Shock', 1100, 'Blast hurts Glooms, longer stun', (s) => { s.blastAll = true; main(s).stun = 0.8; }),
      U('Thunder Cannon', 3600, '+2 dmg, knockback', (s) => { main(s).damage += 2; main(s).knock = 20; }),
      U('Doomhammer', 18000, '+8 dmg, stuns giants, huge knockback', (s) => { main(s).damage += 8; main(s).stun = 1.5; main(s).stunGiants = 0.5; main(s).knock = 40; }),
    ],
  ],
};

// ---- Gold Mine ------------------------------------------------------------------
const mine: TowerDef = {
  id: 'mine', name: 'Gold Mine', cost: 1000, color: '#7a5a3a', accent: '#ffd23a', radius: 18, unlockRounds: 60,
  desc: 'Digs up gold during each round.',
  paths: ['Deep Shafts', 'Bank', 'Overseer'],
  base: () => stats([], { range: 40, income: 80 }),
  upgrades: [
    [
      U('Pickaxes', 500, '+40 gold/round', (s) => { s.income += 40; }),
      U('Mine Carts', 600, '+60 gold/round', (s) => { s.income += 60; }),
      U('Gem Vein', 2800, '+250 gold/round', (s) => { s.income += 250; }),
      U('Mithril Mine', 6000, '+600 gold/round', (s) => { s.income += 600; }),
      U("Dragon's Hoard", 18000, '+2500 gold/round', (s) => { s.income += 2500; }),
    ],
    [
      U('Vault', 400, 'Gold goes into a vault earning 15% interest. Withdraw anytime', (s) => { s.bank = { cap: 7000, interest: 0.15, bonus: 0 }; }),
      U('Strongroom', 800, 'Cap 10k, 20% interest', (s) => { s.bank = { cap: 10000, interest: 0.2, bonus: 0 }; }),
      U('Royal Treasury', 3000, 'Cap 15k, +250 gold/round', (s) => { s.bank!.cap = 15000; s.income += 250; }),
      U('Gold Reserve', 7000, 'Cap 25k, 25% interest', (s) => { s.bank!.cap = 25000; s.bank!.interest = 0.25; }),
      U('Kingdom Bank', 30000, 'Cap 60k, +10% bonus on withdraw', (s) => { s.bank!.cap = 60000; s.bank!.bonus = 0.1; s.income += 500; }),
    ],
    [
      U('Lucky Strikes', 300, '+25% gold', (s) => { s.incomeMult += 0.25; }),
      U('Gem Polish', 600, '+50% gold', (s) => { s.incomeMult += 0.25; }),
      U('Mine Overseer', 2500, '+2 lives per round, all mines +10%', (s) => { s.livesPerRound += 2; s.mineGlobalBonus = 0.1; }),
      U('Guild Hall', 6000, '+5 lives per round, double gold', (s) => { s.livesPerRound += 3; s.incomeMult += 0.5; }),
      U('Dwarven Kingdom', 20000, '+10 lives/round, triple gold', (s) => { s.livesPerRound += 5; s.incomeMult += 1; }),
    ],
  ],
};

// ---- Barracks (Kingdom Rush-style blockers) ---------------------------------
const barracks: TowerDef = {
  id: 'barracks', name: 'Barracks', cost: 400, color: '#7d4f2e', accent: '#c94a3a', radius: 18, unlockRounds: 0,
  desc: 'Soldiers march onto the path and hold enemies in place. Giants trample them until upgraded.',
  paths: ['Shieldwall', 'Weaponmasters', 'Rally'],
  base: () => stats([], { range: 110, barracks: { count: 3, hp: 12, damage: 1, cd: 0.9, block: 1, blockGiants: false, blockBoss: false, cleave: false, respawn: 8, regen: 0.5, giantBonus: 0 } }),
  upgrades: [
    [
      U('Chainmail', 200, '+50% soldier health', (s) => { s.barracks!.hp *= 1.5; }),
      U('Fourth Soldier', 350, 'Trains a 4th soldier', (s) => { s.barracks!.count = 4; }),
      U('Shieldwall', 1400, 'Soldiers can hold giants, +HP, each holds 2', (s) => { s.barracks!.blockGiants = true; s.barracks!.hp *= 1.6; s.barracks!.block = 2; }),
      U('Royal Guard', 4500, 'Double HP, +3 dmg, each holds 3', (s) => { s.barracks!.hp *= 2; s.barracks!.damage += 3; s.barracks!.block = 3; }),
      U('Iron Legion', 16000, '6 soldiers who can even hold bosses', (s) => { s.barracks!.count = 6; s.barracks!.hp *= 3; s.barracks!.blockBoss = true; s.barracks!.damage += 5; }),
    ],
    [
      U('Sharpened Spears', 200, '+1 damage', (s) => { s.barracks!.damage += 1; }),
      U('Veterans', 450, 'Faster attacks, hit Ironclads', (s) => { s.barracks!.cd *= 0.7; s.armorPierce = true; }),
      U('Spearmasters', 1600, '+2 dmg, strikes every held enemy', (s) => { s.barracks!.damage += 2; s.barracks!.cleave = true; }),
      U('Champions', 5000, '+4 dmg, +10 vs giants, see Shadowed', (s) => { s.barracks!.damage += 4; s.barracks!.giantBonus = 10; s.trueSight = true; }),
      U('Legendary Heroes', 18000, '+12 dmg, +40 vs giants, lightning-fast', (s) => { s.barracks!.damage += 12; s.barracks!.giantBonus += 40; s.barracks!.cd *= 0.5; }),
    ],
    [
      U('Quick Muster', 150, 'Soldiers respawn twice as fast', (s) => { s.barracks!.respawn = 4; }),
      U('Long March', 300, '+40 rally range', (s) => { s.range += 40; }),
      U('Field Medics', 1200, 'Soldiers heal quickly', (s) => { s.barracks!.regen = 4; }),
      U('Shield Slam', 3500, 'Holding stuns enemies; +HP', (s) => { s.barracks!.stun = 0.5; s.barracks!.hp *= 1.5; }),
      U('Eternal Guard', 14000, 'Near-unkillable soldiers, instant respawn', (s) => { s.barracks!.regen = 40; s.barracks!.respawn = 1; s.barracks!.hp *= 2; }),
    ],
  ],
};

export const TOWERS: TowerDef[] = [archer, knight, barracks, mage, druid, cannon, ballista, alchemist, bard, mine];
export const TOWER_MAP: Record<string, TowerDef> = Object.fromEntries(TOWERS.map((t) => [t.id, t]));

/** Build tower stats from its upgrade tiers. */
export function computeStats(def: TowerDef, tiers: number[]): TowerStats {
  const s = def.base();
  for (let p = 0; p < 3; p++) for (let t = 0; t < tiers[p]; t++) def.upgrades[p][t].apply(s);
  s.range = s.attacks[0]?.range ?? s.range;
  if (s.aura && s.aura.radius && !s.attacks.length) s.range = s.aura.radius;
  return s;
}

/** BTD6-style crosspathing: max 2 paths, only one past tier 2. */
export function canUpgradePath(tiers: number[], p: number): boolean {
  if (tiers[p] >= 5) return false;
  const next = tiers.slice();
  next[p]++;
  const used = next.filter((t) => t > 0).length;
  if (used > 2) return false;
  if (next.filter((t) => t > 2).length > 1) return false;
  return true;
}
