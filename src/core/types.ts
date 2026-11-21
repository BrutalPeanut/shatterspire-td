// Shared types for the Shatterspire simulation (no DOM access in core/).

export const WORLD_W = 960;
export const WORLD_H = 640;

export type DamageType = 'sharp' | 'blast' | 'magic' | 'cold' | 'acid' | 'pure';
export type Targeting = 'first' | 'last' | 'strong' | 'close';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Vec { x: number; y: number }

export interface Burn { dps: number; dur: number }
export interface Slow { f: number; dur: number; giants?: number }

/** One attack a tower (or hero) performs on a cooldown. */
export interface Attack {
  id: string;
  kind: 'proj' | 'melee' | 'pulse' | 'hitscan' | 'chain' | 'lob' | 'groundfx';
  cd: number;
  damage: number;
  pierce: number;
  range: number; // Infinity = global
  dtype: DamageType;
  speed?: number;
  count?: number;
  spread?: number; // radians between projectiles
  splash?: number;
  splashPierce?: number;
  burn?: Burn;
  acid?: Burn;
  slow?: Slow;
  stun?: number;
  stunGiants?: number;
  knock?: number;
  giantBonus?: number;
  chain?: number;
  cluster?: { count: number; damage: number; splash: number; depth: number };
  shards?: { count: number; damage: number; pierce: number };
  strip?: boolean; // removes regen/fortified
  reveal?: boolean; // removes shadowed
  targeting?: Targeting; // forced targeting
  fx?: { radius: number; dps: number; dur: number }; // ground effect (groundfx kind)
  visual: string;
  color: string;
  size?: number;
}

export interface Aura {
  radius: number;
  rate?: number; // +% attack speed (0.25 = +25%)
  range?: number; // +% range
  pierce?: number;
  damage?: number;
  trueSight?: boolean;
  armorPierce?: boolean;
  wardBreak?: boolean;
  discount?: number; // upgrade/tower discount fraction
  vuln?: number; // enemies in radius take +N damage
  giantVuln?: number; // multiplier extra vs giants
  reveal?: boolean; // strip shadow in radius
  stripFortify?: boolean;
  enemySlow?: number; // enemies in radius slowed by fraction
  enemySlowBoss?: number;
}

export interface Brew {
  count: number; // towers buffed (99 = all)
  rate: number;
  pierce: number;
  damage: number;
  trueSight?: boolean;
  armorPierce?: boolean;
  period: number;
  dur: number;
}

export interface TowerStats {
  range: number; // main attack range for display
  trueSight: boolean;
  armorPierce: boolean; // sharp hits Ironclad
  wardBreak: boolean; // magic hits Hexlings
  blastAll: boolean; // blast hits Glooms
  attacks: Attack[];
  aura?: Aura;
  brew?: Brew;
  income: number; // gold per round
  incomeMult: number;
  livesPerRound: number;
  bank?: { cap: number; interest: number; bonus: number };
  goldPerPop: number;
  ironGold: number;
  globalSlow?: number; // Eternal Winter
  ability?: AbilityDef;
  shatter?: number; // frozen enemies take +N damage
  vsFrozenBonus?: number;
  giantStun?: number;
  globalBallistaBuff?: number;
  mineGlobalBonus?: number;
  barracks?: Barracks;
}

export interface Barracks {
  count: number;
  hp: number;
  damage: number;
  cd: number;
  block: number; // enemies each soldier can hold
  blockGiants: boolean;
  blockBoss: boolean;
  cleave: boolean;
  respawn: number;
  regen: number; // hp/s
  stun?: number;
  giantBonus: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  cd: number;
  icon: string;
}

export interface UpgradeDef {
  name: string;
  cost: number;
  desc: string;
  apply: (s: TowerStats) => void;
}

export interface TowerDef {
  id: string;
  name: string;
  cost: number;
  desc: string;
  color: string;
  accent: string;
  radius: number;
  paths: [string, string, string];
  base: () => TowerStats;
  upgrades: [UpgradeDef[], UpgradeDef[], UpgradeDef[]];
  unlockRounds: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  children: string[];
  color: string;
  giant?: boolean;
  boss?: boolean;
  /** Lives a boss costs if it reaches the Spire at full health; scaled by the health it has left (min 3). */
  leakLives?: number;
  immune: DamageType[];
  rank: number;
  gold: number; // gold awarded for destroying this layer
  spawn?: { every: number; type: string; count: number; mods?: string };
  regenParent?: string;
}

export interface WaveGroup {
  type: string;
  count: number;
  spacing: number;
  delay: number; // seconds from wave start
  mods?: string; // s=shadow r=regen f=fortified
  path?: number;
}
