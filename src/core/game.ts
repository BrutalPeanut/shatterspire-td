import { ENEMIES, rbe } from './enemies';
import { HERO_MAP, heroLevel, heroXpForRound, type HeroDef } from './heroes';
import { MAPS, PATH_WIDTH, buildPath, distToPath, pointAt, type MapDef, type PathInfo } from './maps';
import { TOWER_MAP, canUpgradePath, computeStats } from './towers';
import type { AbilityDef, Attack, DamageType, Difficulty, EnemyDef, Targeting, TowerDef, TowerStats, WaveGroup } from './types';
import { WORLD_H, WORLD_W } from './types';
import { FINAL_WAVE, WAVES, freeplayWave } from './waves';

// ---------------------------------------------------------------- entities
export interface Enemy {
  id: number; type: string; def: EnemyDef;
  path: number; d: number; x: number; y: number; angle: number;
  hp: number; maxHp: number;
  shadow: boolean; regen: boolean; regenMax: number; regenT: number; fortified: boolean;
  slowF: number; slowT: number; slowG: number; stunT: number; frozen: boolean;
  burnDps: number; burnT: number; burnAcc: number; burnBy: Tower | null;
  acidDps: number; acidT: number; acidAcc: number; acidBy: Tower | null;
  auraSlow: number; spawnT: number; dead: boolean; flash: number; wob: number; blockT: number;
}

export interface Soldier { tower: Tower; i: number; x: number; y: number; hx: number; hy: number; hp: number; maxHp: number; respawnT: number; cd: number; dead: boolean; anim: number; holding: number }

export interface Buffs { rate: number; range: number; pierce: number; damage: number; trueSight: boolean; armorPierce: boolean; wardBreak: boolean }

export interface Tower {
  uid: number; defId: string; isHero: boolean; x: number; y: number; radius: number;
  tiers: number[]; targeting: Targeting; stats: TowerStats;
  cds: number[]; angle: number; pops: number; spent: number;
  abilities: { def: AbilityDef; left: number }[];
  bank: number; xp: number; level: number;
  buffs: Buffs; brewBuff: (Buffs & { t: number }) | null; brewT: number; anim: number;
  rally: { path: number; d: number } | null;
}

export interface Projectile {
  x: number; y: number; vx: number; vy: number; r: number; pierce: number; life: number;
  atk: Attack; tower: Tower; hit: Set<number>; lob: boolean; tx: number; ty: number;
  homing: Enemy | null; depth: number; damageOverride?: number; dead: boolean; spin: number;
}

export interface GroundFx { x: number; y: number; r: number; dps: number; t: number; acc: number; tower: Tower; dtype: DamageType; pierce: number; kind: string }
export interface Fx { kind: 'ring' | 'line' | 'chain' | 'sweep' | 'text' | 'boom' | 'coin' | 'meteor'; x: number; y: number; x2?: number; y2?: number; pts?: number[]; r: number; t: number; max: number; color: string; text?: string }
export interface Particle { x: number; y: number; vx: number; vy: number; t: number; max: number; color: string; size: number }

export type GameEvent =
  | { type: 'pop'; x: number; y: number; big: boolean }
  | { type: 'shoot'; kind: string }
  | { type: 'boom' }
  | { type: 'leak'; lives: number }
  | { type: 'waveStart'; round: number; boss: boolean }
  | { type: 'waveEnd'; round: number; reward: number }
  | { type: 'gameOver' }
  | { type: 'victory' }
  | { type: 'levelUp'; level: number }
  | { type: 'ability'; id: string }
  | { type: 'place' } | { type: 'upgrade' } | { type: 'sell' }
  | { type: 'bossDown'; name: string };

export interface Spell { id: string; name: string; icon: string; cd: number; left: number; targeted: boolean; desc: string }

export const DIFF = {
  easy: { lives: 200, cost: 0.85, speed: 0.9, giantHp: 1.0, label: 'Easy' },
  medium: { lives: 150, cost: 1.0, speed: 1.0, giantHp: 1.0, label: 'Medium' },
  hard: { lives: 100, cost: 1.08, speed: 1.1, giantHp: 1.25, label: 'Hard' },
} as const;

const REGEN_UP: Record<string, string> = { imp: 'goblin', goblin: 'orc', orc: 'troll', troll: 'ogre' };

function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const noBuffs = (): Buffs => ({ rate: 0, range: 0, pierce: 0, damage: 0, trueSight: false, armorPierce: false, wardBreak: false });

// ---------------------------------------------------------------- spatial grid
class Grid {
  cell = 48; cols = Math.ceil((WORLD_W + 200) / 48); rows = Math.ceil((WORLD_H + 200) / 48);
  buckets: Enemy[][] = Array.from({ length: this.cols * this.rows }, () => []);
  clear() { for (const b of this.buckets) b.length = 0; }
  idx(x: number, y: number) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x + 100) / this.cell)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((y + 100) / this.cell)));
    return r * this.cols + c;
  }
  add(e: Enemy) { this.buckets[this.idx(e.x, e.y)].push(e); }
  query(x: number, y: number, rad: number, out: Enemy[]) {
    out.length = 0;
    const c0 = Math.max(0, Math.floor((x - rad + 100) / this.cell)), c1 = Math.min(this.cols - 1, Math.floor((x + rad + 100) / this.cell));
    const r0 = Math.max(0, Math.floor((y - rad + 100) / this.cell)), r1 = Math.min(this.rows - 1, Math.floor((y + rad + 100) / this.cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const e of this.buckets[r * this.cols + c]) out.push(e);
    return out;
  }
}

// ---------------------------------------------------------------- game
export interface GameOptions { mapId: string; difficulty: Difficulty; heroId: string; seed?: number; unlockedTowers?: string[]; perks?: string[] }

export class Game {
  map: MapDef; paths: PathInfo[]; diff: Difficulty; heroId: string;
  enemies: Enemy[] = []; towers: Tower[] = []; projectiles: Projectile[] = []; soldiers: Soldier[] = [];
  perks: Set<string>; freeTower = false;
  ground: GroundFx[] = []; fx: Fx[] = []; particles: Particle[] = [];
  events: GameEvent[] = [];
  gold = 650; lives: number; round = 0; state: 'build' | 'wave' | 'over' | 'victory' = 'build';
  freeplay = false; time = 0; waveTime = 0; queue: { t: number; type: string; mods: string; path: number }[] = [];
  nextId = 1; rnd: () => number; grid = new Grid();
  rallyT = 0; crescendoT = 0; freezeT = 0; chronoT = 0; zeroBossT = 0;
  spells: Spell[];
  stats = { pops: 0, leaked: 0 };
  globalSlow = 0; ballistaBuff = 0; mineBonus = 0;
  auraTowers: Tower[] = [];
  private tmp: Enemy[] = []; private tmp2: Enemy[] = [];
  private v = { x: 0, y: 0 };

  constructor(public opts: GameOptions) {
    this.map = MAPS.find((m) => m.id === opts.mapId) ?? MAPS[0];
    this.paths = this.map.paths.map(buildPath);
    this.diff = opts.difficulty;
    this.heroId = opts.heroId;
    this.perks = new Set(opts.perks ?? []);
    this.lives = DIFF[this.diff].lives + (this.perks.has('medics') ? 25 : 0);
    if (this.perks.has('purse')) this.gold += 150;
    this.rnd = mulberry(opts.seed ?? 1234);
    this.spells = [
      { id: 'meteor', name: 'Meteor Shower', icon: '☄️', cd: 60, left: 0, targeted: true, desc: 'Tap the map: 150 damage in a big blast' },
      { id: 'freeze', name: 'Time Freeze', icon: '⏸️', cd: 90, left: 0, targeted: false, desc: 'Freeze all enemies for 4s (bosses slowed)' },
      { id: 'reinforce', name: 'Reinforce Walls', icon: '🛡️', cd: 150, left: 0, targeted: false, desc: '+25 lives' },
    ];
    if (this.perks.has('spells')) for (const s of this.spells) s.cd *= 0.8;
  }

  get costMul() { return DIFF[this.diff].cost * (this.perks.has('thrift') ? 0.96 : 1); }
  get heroDef(): HeroDef { return HERO_MAP[this.heroId]; }
  get heroPlaced() { return this.towers.some((t) => t.isHero); }
  get totalWaves() { return FINAL_WAVE; }

  price(base: number, x?: number, y?: number) {
    const disc = x !== undefined ? this.discountAt(x, y!) : 0;
    return Math.max(5, Math.round((base * this.costMul * (1 - disc)) / 5) * 5);
  }
  discountAt(x: number, y: number) {
    let d = 0;
    for (const t of this.auraTowers) if (t.stats.aura?.discount && Math.hypot(t.x - x, t.y - y) <= t.stats.aura.radius) d = Math.max(d, t.stats.aura.discount);
    return d;
  }
  towerCost(defId: string, x?: number, y?: number) { if (this.freeTower && defId !== 'hero') return 0; return defId === 'hero' ? this.price(this.heroDef.cost) : this.price(TOWER_MAP[defId].cost, x, y); }
  upgradeCost(t: Tower, p: number) {
    const def = TOWER_MAP[t.defId];
    const u = def.upgrades[p][t.tiers[p]];
    return u ? this.price(u.cost, t.x, t.y) : Infinity;
  }
  sellValue(t: Tower) { return Math.floor(t.spent * 0.7); }

  // ---------------------------------------------------------- placement
  canPlace(x: number, y: number, radius: number): boolean {
    if (x < radius || y < radius || x > WORLD_W - radius || y > WORLD_H - radius) return false;
    for (const p of this.map.paths) if (distToPath(x, y, p) < PATH_WIDTH / 2 + radius - 4) return false;
    for (const o of this.map.obstacles) if (Math.hypot(o.x - x, o.y - y) < o.r + radius * 0.6) return false;
    for (const t of this.towers) if (Math.hypot(t.x - x, t.y - y) < t.radius + radius) return false;
    return true;
  }

  placeTower(defId: string, x: number, y: number): Tower | null {
    const isHero = defId === 'hero';
    if (isHero && this.heroPlaced) return null;
    const radius = isHero ? this.heroDef.radius : TOWER_MAP[defId].radius;
    const cost = this.towerCost(defId, x, y);
    if (this.gold < cost || !this.canPlace(x, y, radius)) return null;
    this.gold -= cost;
    if (cost === 0 && !isHero) this.freeTower = false;
    const t: Tower = {
      uid: this.nextId++, defId: isHero ? this.heroId : defId, isHero, x, y, radius, tiers: [0, 0, 0],
      targeting: 'first', stats: null as unknown as TowerStats, cds: [], angle: -Math.PI / 2, pops: 0, spent: cost,
      abilities: [], bank: 0, xp: 0, level: 1, buffs: noBuffs(), brewBuff: null, brewT: 1, anim: 0, rally: null,
    };
    this.recompute(t);
    this.towers.push(t);
    this.events.push({ type: 'place' });
    return t;
  }

  recompute(t: Tower) {
    if (t.isHero) {
      const h = HERO_MAP[t.defId];
      t.level = heroLevel(t.xp);
      t.stats = h.stats(t.level);
      const abil = h.abilities.filter((a) => t.level >= a.level).map((a) => a.def);
      t.abilities = abil.map((def) => ({ def, left: t.abilities.find((x) => x.def.id === def.id)?.left ?? 0 }));
    } else {
      t.stats = computeStats(TOWER_MAP[t.defId], t.tiers);
      const a = t.stats.ability;
      t.abilities = a ? [{ def: a, left: t.abilities.find((x) => x.def.id === a.id)?.left ?? 0 }] : [];
    }
    this.applyPerks(t.stats);
    while (t.cds.length < t.stats.attacks.length) t.cds.push(0.2);
    t.cds.length = t.stats.attacks.length;
    if (t.stats.barracks) this.setupSoldiers(t);
    this.refreshGlobals();
  }

  applyPerks(s: TowerStats) {
    const P = this.perks;
    for (const a of s.attacks) {
      if (P.has('steel') && a.dtype === 'sharp') a.cd *= 0.92;
      if (P.has('study') && a.dtype === 'magic' && a.range !== Infinity) a.range *= 1.1;
      if (P.has('powder') && a.splash) a.splash *= 1.12;
    }
    if (s.attacks[0]) s.range = s.attacks[0].range;
    if (P.has('drill') && s.barracks) s.barracks.hp *= 1.25;
    if (P.has('relics') && s.ability) s.ability = { ...s.ability, cd: s.ability.cd * 0.9 };
  }

  setupSoldiers(t: Tower) {
    const b = t.stats.barracks!;
    if (!t.rally) {
      let best = { path: 0, d: 0, dist: Infinity };
      this.paths.forEach((p, pi) => {
        for (let d = 0; d <= p.len; d += 6) {
          pointAt(p, d, this.v);
          if (this.v.x < 10 || this.v.y < 10 || this.v.x > WORLD_W - 10 || this.v.y > WORLD_H - 10) continue;
          const dist = Math.hypot(this.v.x - t.x, this.v.y - t.y);
          if (dist < best.dist) best = { path: pi, d, dist };
        }
      });
      t.rally = { path: best.path, d: best.d };
    }
    const old = this.soldiers.filter((s) => s.tower === t);
    this.soldiers = this.soldiers.filter((s) => s.tower !== t);
    for (let i = 0; i < b.count; i++) {
      const p = this.paths[t.rally.path];
      pointAt(p, Math.max(0, Math.min(p.len, t.rally.d + (i - (b.count - 1) / 2) * 16)), this.v);
      const prev = old[i];
      const ratio = prev && !prev.dead ? prev.hp / prev.maxHp : 1;
      this.soldiers.push({ tower: t, i, x: prev?.x ?? t.x, y: prev?.y ?? t.y, hx: this.v.x, hy: this.v.y, hp: b.hp * ratio, maxHp: b.hp, respawnT: prev?.dead ? prev.respawnT : 0, cd: 0, dead: prev?.dead ?? false, anim: 0, holding: 0 });
    }
  }

  usePower(id: string): boolean {
    switch (id) {
      case 'chest': this.gold += 500; this.text(WORLD_W / 2, 60, '+500 gold', '#ffd23a'); break;
      case 'draught': this.lives += 50; this.text(WORLD_W / 2, 60, '+50 lives', '#7dff8a'); break;
      case 'merc': if (this.freeTower) return false; this.freeTower = true; this.text(WORLD_W / 2, 60, 'Next tower is free!', '#ffd23a'); break;
      case 'dragonfire': if (!this.enemies.length) return false; for (const e of this.enemies.slice()) this.damage(e, 40, null); this.fx.push({ kind: 'ring', x: WORLD_W / 2, y: WORLD_H / 2, r: 700, t: 0, max: 0.8, color: '#ff5a1a' }); this.events.push({ type: 'boom' }); break;
      case 'hourglass': if (!this.enemies.length) return false; for (const e of this.enemies) if (!e.def.boss) e.stunT = Math.max(e.stunT, 8); break;
      default: return false;
    }
    this.events.push({ type: 'ability', id });
    return true;
  }

  refreshGlobals() {
    this.auraTowers = this.towers.filter((t) => t.stats.aura || t.stats.brew);
    this.globalSlow = Math.max(0, ...this.towers.map((t) => t.stats.globalSlow ?? 0));
    this.ballistaBuff = Math.max(0, ...this.towers.map((t) => t.stats.globalBallistaBuff ?? 0));
    this.mineBonus = this.towers.reduce((s, t) => s + (t.stats.mineGlobalBonus ?? 0), 0);
  }

  upgrade(t: Tower, p: number): boolean {
    if (t.isHero || !canUpgradePath(t.tiers, p)) return false;
    const cost = this.upgradeCost(t, p);
    if (this.gold < cost) return false;
    this.gold -= cost;
    t.spent += cost;
    t.tiers[p]++;
    this.recompute(t);
    this.events.push({ type: 'upgrade' });
    return true;
  }

  sell(t: Tower) {
    this.gold += this.sellValue(t) + Math.floor(t.bank);
    this.towers = this.towers.filter((x) => x !== t);
    this.soldiers = this.soldiers.filter((s) => s.tower !== t);
    this.refreshGlobals();
    this.events.push({ type: 'sell' });
  }

  withdraw(t: Tower) {
    if (!t.stats.bank || t.bank <= 0) return;
    const amt = Math.floor(t.bank * (1 + t.stats.bank.bonus));
    this.gold += amt; t.bank = 0;
    this.text(t.x, t.y - 20, `+${amt}`, '#ffd23a');
  }

  // ---------------------------------------------------------- waves
  isBossWave(r: number) { return r === 20 || r === 30 || r === 40 || (r > 40 && r % 10 === 0); }

  startWave() {
    if (this.state !== 'build') return;
    this.round++;
    this.state = 'wave';
    this.waveTime = 0;
    const groups: WaveGroup[] = this.round <= FINAL_WAVE ? WAVES[this.round - 1] : freeplayWave(this.round, this.rnd);
    this.queue = [];
    groups.forEach((g, gi) => {
      for (let i = 0; i < g.count; i++) this.queue.push({ t: g.delay + i * g.spacing, type: g.type, mods: g.mods ?? '', path: g.path ?? (this.paths.length > 1 ? (gi + i) % this.paths.length : 0) });
    });
    this.queue.sort((a, b) => b.t - a.t); // pop from end
    this.events.push({ type: 'waveStart', round: this.round, boss: this.isBossWave(this.round) });
  }

  hpMul(def: EnemyDef) {
    let m = def.giant ? DIFF[this.diff].giantHp : 1;
    if (this.round > 50) m *= 1 + (this.round - 50) * 0.06;
    return m;
  }

  spawn(type: string, mods: string, path: number, d = 0, parent?: Enemy): Enemy {
    const def = ENEMIES[type];
    let hp = def.hp * this.hpMul(def);
    const fort = mods.includes('f') && (def.giant || type === 'golem' || type === 'iron');
    if (fort) hp = type === 'iron' ? 4 : hp * 2;
    const e: Enemy = {
      id: this.nextId++, type, def, path, d, x: 0, y: 0, angle: 0, hp, maxHp: hp,
      shadow: mods.includes('s'), regen: mods.includes('r'), regenMax: parent ? parent.regenMax : Math.min(def.rank, 5), regenT: 1.5, fortified: fort,
      slowF: 0, slowT: 0, slowG: 0, stunT: 0, frozen: false,
      burnDps: 0, burnT: 0, burnAcc: 0, burnBy: null, acidDps: 0, acidT: 0, acidAcc: 0, acidBy: null,
      auraSlow: 0, spawnT: def.spawn?.every ?? 0, dead: false, flash: 0, wob: this.rnd() * 6, blockT: 0,
    };
    if (parent) {
      e.burnDps = parent.burnDps; e.burnT = parent.burnT; e.burnBy = parent.burnBy;
      e.acidDps = parent.acidDps; e.acidT = parent.acidT; e.acidBy = parent.acidBy;
    }
    e.angle = pointAt(this.paths[path], d, e);
    this.enemies.push(e);
    return e;
  }

  // ---------------------------------------------------------- damage
  canHurt(e: Enemy, dtype: DamageType, t: Tower): boolean {
    const im = e.def.immune;
    if (!im.length) return true;
    if (dtype === 'pure' || dtype === 'acid') return true;
    if (!im.includes(dtype)) return true;
    if (dtype === 'sharp' && (t.stats.armorPierce || t.buffs.armorPierce)) return true;
    if (dtype === 'magic' && (t.stats.wardBreak || t.buffs.wardBreak)) return true;
    if (dtype === 'blast' && t.stats.blastAll) return true;
    return false;
  }

  vulnAt(e: Enemy): { add: number; mul: number } {
    let add = 0, mul = 1;
    for (const t of this.auraTowers) {
      const a = t.stats.aura;
      if (!a || (!a.vuln && !a.giantVuln)) continue;
      if (Math.hypot(t.x - e.x, t.y - e.y) > a.radius) continue;
      add = Math.max(add, a.vuln ?? 0);
      if (e.def.giant) mul = Math.max(mul, 1 + (a.giantVuln ?? 0));
    }
    if (e.frozen && e.stunT > 0) add += this.shatterBonus;
    return { add, mul };
  }
  shatterBonus = 0;

  /** Apply an attack hit to an enemy. Returns false if the enemy is immune (blocks the projectile). */
  hit(e: Enemy, a: Attack, t: Tower, dmgOverride?: number): boolean {
    if (e.dead) return true;
    if (!this.canHurt(e, a.dtype, t)) { this.fxRing(e.x, e.y, 6, '#ffffff', 0.15); return false; }
    const giant = !!e.def.giant;
    let dmg = (dmgOverride ?? a.damage) + (dmgOverride === undefined ? t.buffs.damage : 0);
    if (giant && a.giantBonus) dmg += a.giantBonus;
    if (t.defId === 'ballista' && this.ballistaBuff) dmg *= 1 + this.ballistaBuff;
    const v = this.vulnAt(e);
    dmg = (dmg + v.add) * v.mul;
    // statuses
    const coldImmune = a.dtype === 'cold' && e.def.immune.includes('cold');
    if (a.slow && !coldImmune) {
      const f = giant ? (a.slow.giants ?? 0) * (e.def.boss ? 0.5 : 1) : a.slow.f;
      if (f > 0) { e.slowF = Math.max(e.slowF, f); e.slowT = Math.max(e.slowT, a.slow.dur); }
    }
    if (a.stun && !coldImmune) {
      const s = giant ? (e.def.boss ? (a.stunGiants ?? 0) * 0.3 : a.stunGiants ?? 0) : a.stun;
      if (s > 0) { e.stunT = Math.max(e.stunT, s); e.frozen = a.dtype === 'cold'; }
    } else if (giant && a.stunGiants && !e.def.boss) { e.stunT = Math.max(e.stunT, a.stunGiants); }
    if (a.burn) { e.burnDps = Math.max(e.burnDps, a.burn.dps); e.burnT = Math.max(e.burnT, a.burn.dur); e.burnBy = t; }
    if (a.acid) { e.acidDps = Math.max(e.acidDps, a.acid.dps); e.acidT = Math.max(e.acidT, a.acid.dur); e.acidBy = t; }
    if (a.knock && !giant) e.d = Math.max(0, e.d - a.knock);
    if (a.strip) { e.regen = false; if (e.fortified) { e.fortified = false; e.hp = Math.min(e.hp, e.maxHp / 2); } }
    if (a.reveal) e.shadow = false;
    this.damage(e, dmg, t);
    return true;
  }

  popGold() { return this.freeplay ? 0.3 : this.round <= 30 ? 1.15 : 0.9; }

  damage(e: Enemy, amount: number, by: Tower | null) {
    let cur: Enemy | null = e;
    let rem = amount;
    while (cur && rem > 0 && !cur.dead) {
      cur.flash = 0.08;
      if (cur.hp > rem) { cur.hp -= rem; return; }
      rem -= cur.hp;
      cur = this.popLayer(cur, by);
    }
  }

  private popLayer(e: Enemy, by: Tower | null): Enemy | null {
    const def = e.def;
    let g = def.gold * this.popGold();
    if (by) { by.pops++; g += by.stats.goldPerPop; if (e.type === 'iron') g += by.stats.ironGold; }
    this.gold += g;
    this.stats.pops++;
    if (by?.isHero) by.xp += def.giant ? 5 : 0.3;
    const big = !!def.giant;
    this.events.push({ type: 'pop', x: e.x, y: e.y, big });
    this.burst(e.x, e.y, def.color, big ? 24 : 5, big ? 4 : 2);
    if (def.boss) { this.events.push({ type: 'bossDown', name: def.name }); this.text(e.x, e.y - 40, `${def.name} falls!`, '#ffd23a'); }
    const kids = def.children;
    if (kids.length === 1) {
      // transform in place
      const nd = ENEMIES[kids[0]];
      e.type = nd.id; e.def = nd; e.hp = nd.hp * this.hpMul(nd); e.maxHp = e.hp; e.fortified = false;
      return e;
    }
    e.dead = true;
    let first: Enemy | null = null;
    const mods = (e.shadow ? 's' : '') + (e.regen ? 'r' : '');
    kids.forEach((k, i) => {
      const c = this.spawn(k, mods, e.path, Math.max(0, e.d - i * (def.giant ? 14 : 7)), e);
      c.stunT = 0;
      if (!first) first = c;
    });
    return first;
  }

  // ---------------------------------------------------------- targeting
  visibleTo(e: Enemy, t: Tower) { return !e.shadow || t.stats.trueSight || t.buffs.trueSight; }

  pickTarget(t: Tower, a: Attack): Enemy | null {
    const mode = a.targeting ?? t.targeting;
    const r = a.range === Infinity ? Infinity : a.range * (1 + t.buffs.range);
    const list = r === Infinity ? this.enemies : this.grid.query(t.x, t.y, r + 50, this.tmp);
    let best: Enemy | null = null; let bv = -Infinity;
    for (const e of list) {
      if (e.dead || e.d < 0 || !this.visibleTo(e, t)) continue;
      if (e.x < -20 || e.x > WORLD_W + 20 || e.y < -20 || e.y > WORLD_H + 20) continue;
      const dist = Math.hypot(e.x - t.x, e.y - t.y);
      if (dist > r + e.def.radius) continue;
      const prog = e.d / this.paths[e.path].len;
      const v = mode === 'first' ? prog : mode === 'last' ? -prog : mode === 'strong' ? e.def.rank * 10 + prog : -dist;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------- update
  update(dt: number) {
    if (this.state === 'over') return;
    this.time += dt;
    this.updateFx(dt);
    if (this.state !== 'wave' && this.state !== 'victory') { this.tickAbilities(dt, false); return; }
    if (this.state === 'victory') return;
    this.waveTime += dt;
    while (this.queue.length && this.queue[this.queue.length - 1].t <= this.waveTime) {
      const q = this.queue.pop()!;
      const e = this.spawn(q.type, q.mods, q.path);
      if (e.def.boss) this.text(WORLD_W / 2, 80, `⚠ ${e.def.name} approaches!`, '#ff5a5a');
    }
    this.rallyT = Math.max(0, this.rallyT - dt);
    this.crescendoT = Math.max(0, this.crescendoT - dt);
    this.freezeT = Math.max(0, this.freezeT - dt);
    this.chronoT = Math.max(0, this.chronoT - dt);
    this.zeroBossT = Math.max(0, this.zeroBossT - dt);
    this.shatterBonus = Math.max(0, ...this.towers.map((t) => t.stats.shatter ?? 0));
    this.grid.clear();
    for (const e of this.enemies) this.grid.add(e);
    this.updateSoldiers(dt);
    this.updateEnemies(dt);
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.add(e);
    this.updateBuffs(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateGround(dt);
    this.tickAbilities(dt, true);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.lives <= 0) { this.lives = 0; this.state = 'over'; this.events.push({ type: 'gameOver' }); return; }
    if (!this.queue.length && !this.enemies.length) this.endWave();
  }

  endWave() {
    const r = this.round;
    let reward = 125 + 6 * r;
    if (this.freeplay) reward = Math.floor(reward * 0.5);
    if (this.perks.has('tax')) reward = Math.floor(reward * 1.15);
    const interest = Math.min(this.perks.has('banker') ? 80 : 40, Math.floor(this.gold * 0.01));
    this.gold += reward + interest;
    for (const t of this.towers) {
      const s = t.stats;
      if (s.income) {
        const inc = Math.floor(s.income * (s.incomeMult + (t.defId === 'mine' ? this.mineBonus : 0)));
        if (s.bank) { t.bank = Math.min(s.bank.cap, t.bank * (1 + s.bank.interest) + inc); this.text(t.x, t.y - 22, `🏦 ${Math.floor(t.bank)}`, '#ffe28a'); }
        else { this.gold += inc; this.text(t.x, t.y - 22, `+${inc}`, '#ffd23a'); this.fx.push({ kind: 'coin', x: t.x, y: t.y, r: 8, t: 0, max: 0.9, color: '#ffd23a' }); }
      }
      if (s.livesPerRound) this.lives += s.livesPerRound;
      if (t.isHero) {
        const before = t.level;
        t.xp += heroXpForRound(r) * (this.perks.has('academy') ? 1.25 : 1);
        if (heroLevel(t.xp) !== before) { this.recompute(t); this.events.push({ type: 'levelUp', level: t.level }); this.text(t.x, t.y - 30, `LEVEL ${t.level}!`, '#9fe0ff'); }
      }
    }
    this.projectiles = [];
    this.ground = [];
    this.events.push({ type: 'waveEnd', round: r, reward: reward + interest });
    if (r === FINAL_WAVE && !this.freeplay) { this.state = 'victory'; this.events.push({ type: 'victory' }); }
    else this.state = 'build';
  }

  continueFreeplay() { this.freeplay = true; this.state = 'build'; }

  private updateEnemies(dt: number) {
    const sp = DIFF[this.diff].speed * (this.round > 60 ? 1 + (this.round - 60) * 0.01 : 1);
    for (const t of this.auraTowers) { /* aura slows recomputed below */ }
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      e.wob += dt * 8;
      // DoTs
      if (e.burnT > 0) { e.burnT -= dt; e.burnAcc += e.burnDps * dt; if (e.burnAcc >= 1) { const n = Math.floor(e.burnAcc); e.burnAcc -= n; this.damage(e, n, e.burnBy); if (this.rnd() < 0.3) this.particle(e.x, e.y, '#ff8a2a', 2); } }
      if (e.dead) continue;
      if (e.acidT > 0) { e.acidT -= dt; e.acidAcc += e.acidDps * dt; if (e.acidAcc >= 1) { const n = Math.floor(e.acidAcc); e.acidAcc -= n; this.damage(e, n, e.acidBy); if (this.rnd() < 0.3) this.particle(e.x, e.y, '#9dff3a', 2); } }
      if (e.dead) continue;
      // regen
      if (e.regen && REGEN_UP[e.type]) {
        const up = ENEMIES[REGEN_UP[e.type]];
        if (up.rank <= e.regenMax) { e.regenT -= dt; if (e.regenT <= 0) { e.regenT = 1.5; e.type = up.id; e.def = up; e.hp = up.hp; e.maxHp = up.hp; this.fxRing(e.x, e.y, e.def.radius + 4, '#ff7ab8', 0.3); } }
      }
      // boss spawns
      if (e.def.spawn) {
        e.spawnT -= dt;
        if (e.spawnT <= 0) { e.spawnT = e.def.spawn.every; for (let i = 0; i < e.def.spawn.count; i++) this.spawn(e.def.spawn.type, e.def.spawn.mods ?? '', e.path, Math.max(0, e.d + 20 + i * 10)); this.fxRing(e.x, e.y, e.def.radius * 1.6, e.def.color, 0.5); }
      }
      // movement
      e.slowT -= dt; if (e.slowT <= 0) e.slowF = 0;
      e.stunT -= dt; if (e.stunT <= 0) { e.stunT = 0; e.frozen = false; }
      let mul = 1 - e.slowF;
      mul *= 1 - (e.def.boss ? this.globalSlow * 0.5 : this.globalSlow);
      mul *= 1 - Math.min(0.8, e.auraSlow);
      if (this.chronoT > 0) mul *= e.def.boss ? 0.75 : 0.5;
      if (this.freezeT > 0) mul *= e.def.boss ? 0.5 : 0;
      if (this.zeroBossT > 0 && e.def.boss) mul *= 0.5;
      if (e.stunT > 0 || e.blockT > 0) mul = 0;
      e.blockT = Math.max(0, e.blockT - dt);
      e.d += e.def.speed * sp * mul * dt;
      const p = this.paths[e.path];
      if (e.d >= p.len) {
        e.dead = true;
        const lost = e.def.boss ? 99999 : Math.ceil(rbe(e.type) - (e.maxHp - e.hp));
        this.lives -= lost;
        this.stats.leaked += lost;
        this.events.push({ type: 'leak', lives: lost });
        continue;
      }
      e.angle = pointAt(p, e.d, e);
      e.auraSlow = 0;
    }
    // aura slows (Bulwark / Unbreakable Wall) applied for next tick
    for (const t of this.auraTowers) {
      const a = t.stats.aura;
      if (!a?.enemySlow) continue;
      for (const e of this.grid.query(t.x, t.y, a.radius + 40, this.tmp2)) {
        if (Math.hypot(e.x - t.x, e.y - t.y) > a.radius) continue;
        const f = e.def.boss ? a.enemySlowBoss ?? 0 : e.def.giant ? a.enemySlow * 0.6 : a.enemySlow;
        e.auraSlow = Math.max(e.auraSlow, f);
      }
    }
  }

  private updateBuffs(dt: number) {
    const globalRate = (this.rallyT > 0 ? 0.5 : 0) + (this.crescendoT > 0 ? 1 : 0);
    for (const t of this.towers) {
      const b = t.buffs;
      b.rate = globalRate; b.range = 0; b.pierce = 0; b.damage = 0; b.trueSight = false; b.armorPierce = false; b.wardBreak = false;
      if (t.brewBuff) {
        t.brewBuff.t -= dt;
        if (t.brewBuff.t <= 0) t.brewBuff = null;
        else { b.rate += t.brewBuff.rate; b.pierce += t.brewBuff.pierce; b.damage += t.brewBuff.damage; b.trueSight ||= t.brewBuff.trueSight; b.armorPierce ||= t.brewBuff.armorPierce; }
      }
    }
    for (const s of this.auraTowers) {
      const a = s.stats.aura;
      if (a) {
        for (const t of this.towers) {
          if (t === s || Math.hypot(t.x - s.x, t.y - s.y) > a.radius) continue;
          const b = t.buffs;
          if (a.rate) b.rate = Math.max(b.rate, globalRate + (t.brewBuff?.rate ?? 0) + a.rate);
          if (a.range) b.range = Math.max(b.range, a.range);
          if (a.pierce) b.pierce = Math.max(b.pierce, (t.brewBuff?.pierce ?? 0) + a.pierce);
          if (a.damage) b.damage = Math.max(b.damage, (t.brewBuff?.damage ?? 0) + a.damage);
          if (a.trueSight) b.trueSight = true;
          if (a.armorPierce) b.armorPierce = true;
          if (a.wardBreak) b.wardBreak = true;
        }
        if (a.reveal || a.stripFortify) {
          for (const e of this.grid.query(s.x, s.y, a.radius + 40, this.tmp2)) {
            if (Math.hypot(e.x - s.x, e.y - s.y) > a.radius) continue;
            if (a.reveal) e.shadow = false;
            if (a.stripFortify && e.fortified) { e.fortified = false; e.hp = Math.min(e.hp, e.maxHp / 2); }
          }
        }
      }
      const br = s.stats.brew;
      if (br) {
        s.brewT -= dt;
        if (s.brewT <= 0) {
          s.brewT = br.period;
          const r = s.stats.range;
          const cands = this.towers.filter((t) => t !== s && t.stats.attacks.length && Math.hypot(t.x - s.x, t.y - s.y) <= r + 30 && !(t.brewBuff && t.brewBuff.t > 1));
          cands.sort((a, b) => b.spent - a.spent);
          for (const t of cands.slice(0, br.count)) {
            t.brewBuff = { rate: br.rate, pierce: br.pierce, damage: br.damage, range: 0, trueSight: !!br.trueSight, armorPierce: !!br.armorPierce, wardBreak: false, t: br.dur };
            this.fx.push({ kind: 'line', x: s.x, y: s.y, x2: t.x, y2: t.y, r: 3, t: 0, max: 0.4, color: '#b6ff5a' });
          }
        }
      }
    }
  }

  private updateTowers(dt: number) {
    for (const t of this.towers) {
      t.anim = Math.max(0, t.anim - dt);
      const atks = t.stats.attacks;
      for (let i = 0; i < atks.length; i++) {
        t.cds[i] -= dt * (1 + t.buffs.rate);
        if (t.cds[i] > 0) continue;
        const a = atks[i];
        const target = this.pickTarget(t, a);
        if (!target) { t.cds[i] = 0; continue; }
        t.cds[i] = a.cd;
        if (i === 0 || a.kind !== 'groundfx') t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        t.anim = 0.15;
        this.fire(t, a, target);
      }
    }
  }

  fire(t: Tower, a: Attack, target: Enemy) {
    const pierce = a.pierce + t.buffs.pierce;
    const range = a.range === Infinity ? Infinity : a.range * (1 + t.buffs.range);
    switch (a.kind) {
      case 'proj': case 'lob': {
        const n = a.count ?? 1;
        const base = Math.atan2(target.y - t.y, target.x - t.x);
        const speed = a.speed ?? 500;
        for (let k = 0; k < n; k++) {
          const ang = base + (k - (n - 1) / 2) * (a.spread ?? 0);
          const lob = a.kind === 'lob';
          const dist = Math.hypot(target.x - t.x, target.y - t.y);
          const life = lob ? dist / speed : range === Infinity ? 2.5 : (range + 80) / speed;
          this.projectiles.push({
            x: t.x, y: t.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: (a.size ?? 4) + 2,
            pierce, life, atk: a, tower: t, hit: new Set(), lob, tx: target.x, ty: target.y,
            homing: range === Infinity && !lob ? target : null, depth: 0, dead: false, spin: 0,
          });
        }
        this.events.push({ type: 'shoot', kind: a.visual });
        break;
      }
      case 'melee': case 'pulse': {
        const list = this.grid.query(t.x, t.y, range + 50, this.tmp2).slice();
        let n = pierce;
        list.sort((x, y) => y.d - x.d);
        for (const e of list) {
          if (n <= 0) break;
          if (e.dead || !this.visibleTo(e, t) || Math.hypot(e.x - t.x, e.y - t.y) > range + e.def.radius) continue;
          this.hit(e, a, t); n--;
        }
        this.fx.push({ kind: a.kind === 'melee' ? 'sweep' : 'ring', x: t.x, y: t.y, r: range, t: 0, max: a.kind === 'melee' ? 0.22 : 0.4, color: a.color });
        this.events.push({ type: 'shoot', kind: a.visual });
        break;
      }
      case 'hitscan': {
        this.fx.push({ kind: 'line', x: t.x, y: t.y, x2: target.x, y2: target.y, r: 3, t: 0, max: 0.18, color: a.color });
        this.impact(t, a, target, pierce);
        this.events.push({ type: 'shoot', kind: 'ballista' });
        break;
      }
      case 'chain': {
        const pts = [t.x, t.y];
        const hit = new Set<number>();
        let cur: Enemy | null = target;
        for (let k = 0; k < (a.chain ?? 1) && cur; k++) {
          hit.add(cur.id); pts.push(cur.x, cur.y);
          this.hit(cur, a, t);
          let next: Enemy | null = null; let nd = 95;
          for (const e of this.grid.query(cur.x, cur.y, 95, this.tmp2)) {
            if (e.dead || hit.has(e.id)) continue;
            const d = Math.hypot(e.x - cur.x, e.y - cur.y);
            if (d < nd) { nd = d; next = e; }
          }
          cur = next;
        }
        this.fx.push({ kind: 'chain', x: t.x, y: t.y, pts, r: 2, t: 0, max: 0.2, color: a.color });
        this.events.push({ type: 'shoot', kind: a.visual });
        break;
      }
      case 'groundfx': {
        const f = a.fx!;
        // place ahead of the target along its path
        const p = this.paths[target.path];
        pointAt(p, Math.min(p.len, target.d + 30), this.v);
        this.ground.push({ x: this.v.x, y: this.v.y, r: f.radius, dps: f.dps, t: f.dur, acc: 0, tower: t, dtype: a.dtype, pierce: a.pierce, kind: a.visual });
        break;
      }
    }
  }

  /** Direct hit + splash/shards/cluster at an enemy. */
  impact(t: Tower, a: Attack, e: Enemy, pierce: number) {
    this.hit(e, a, t);
    if (pierce > 1 && a.kind === 'hitscan') {
      let n = pierce - 1;
      for (const o of this.grid.query(e.x, e.y, 45, this.tmp2).slice()) { if (n <= 0) break; if (o !== e && !o.dead) { this.hit(o, a, t); n--; } }
    }
    if (a.splash) this.explode(t, a, e.x, e.y, a.splash, a.splashPierce ?? 10, undefined, 0);
    if (a.shards) {
      for (let k = 0; k < a.shards.count; k++) {
        const ang = (k / a.shards.count) * Math.PI * 2 + this.rnd();
        this.projectiles.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 500, vy: Math.sin(ang) * 500, r: 4, pierce: a.shards.pierce, life: 0.25, atk: { ...a, damage: a.shards.damage, splash: undefined, shards: undefined, kind: 'proj', visual: 'shard' }, tower: t, hit: new Set([e.id]), lob: false, tx: 0, ty: 0, homing: null, depth: 1, dead: false, spin: 0 });
      }
    }
  }

  explode(t: Tower, a: Attack, x: number, y: number, radius: number, maxHits: number, dmg: number | undefined, depth: number) {
    let n = maxHits;
    for (const e of this.grid.query(x, y, radius + 50, this.tmp2).slice()) {
      if (n <= 0) break;
      if (e.dead || Math.hypot(e.x - x, e.y - y) > radius + e.def.radius) continue;
      this.hit(e, a, t, dmg); n--;
    }
    this.fx.push({ kind: 'boom', x, y, r: radius, t: 0, max: 0.3, color: a.dtype === 'acid' ? '#9dff3a' : a.dtype === 'magic' ? '#ff9a2a' : '#ffcf6a' });
    this.events.push({ type: 'boom' });
    if (a.cluster && depth < a.cluster.depth) {
      for (let k = 0; k < a.cluster.count; k++) {
        const ang = (k / a.cluster.count) * Math.PI * 2;
        const cx = x + Math.cos(ang) * radius * 0.9, cy = y + Math.sin(ang) * radius * 0.9;
        this.projectiles.push({ x, y, vx: (cx - x) / 0.2, vy: (cy - y) / 0.2, r: 3, pierce: 1, life: 0.2, atk: { ...a, damage: a.cluster.damage, splash: a.cluster.splash, splashPierce: 6 }, tower: t, hit: new Set(), lob: true, tx: cx, ty: cy, homing: null, depth: depth + 1, dead: false, spin: 0 });
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.life -= dt;
      p.spin += dt * 12;
      if (p.homing && !p.homing.dead) {
        const sp = Math.hypot(p.vx, p.vy);
        const ang = Math.atan2(p.homing.y - p.y, p.homing.x - p.x);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      } else if (p.homing?.dead) {
        const tgt = this.pickTarget(p.tower, p.atk);
        p.homing = tgt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.lob) {
        if (p.life <= 0) {
          p.dead = true;
          const a = p.atk;
          // direct hit on whatever is under the landing point for giant bonus targets
          if (a.splash) this.explode(p.tower, a, p.tx, p.ty, a.splash, a.splashPierce ?? 10, undefined, p.depth);
        }
        continue;
      }
      if (p.life <= 0 || p.x < -60 || p.y < -60 || p.x > WORLD_W + 60 || p.y > WORLD_H + 60) { p.dead = true; continue; }
      for (const e of this.grid.query(p.x, p.y, p.r + 50, this.tmp)) {
        if (e.dead || p.hit.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) > p.r + e.def.radius) continue;
        p.hit.add(e.id);
        const a = p.atk;
        if (a.splash) {
          // explosive: blows up on first contact
          if (!this.canHurt(e, a.dtype, p.tower) && !a.splash) { p.dead = true; break; }
          this.hit(e, a, p.tower);
          this.explode(p.tower, a, p.x, p.y, a.splash, a.splashPierce ?? 10, undefined, p.depth);
          if (a.shards) this.impact(p.tower, { ...a, splash: undefined }, e, 1);
          p.dead = true; break;
        }
        const ok = this.hit(e, a, p.tower);
        if (!ok) { p.dead = true; break; }
        if (a.shards) this.impact(p.tower, { ...a, splash: undefined, shards: a.shards }, e, 1);
        // children spawned this frame shouldn't be re-hit
        p.pierce--;
        if (p.pierce <= 0) { p.dead = true; break; }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.projectiles.length > 1500) this.projectiles.splice(0, this.projectiles.length - 1500);
  }

  private updateGround(dt: number) {
    for (const g of this.ground) {
      g.t -= dt;
      g.acc += dt;
      if (g.acc >= 0.25) {
        g.acc -= 0.25;
        let n = g.pierce;
        const a: Attack = { id: 'fx', kind: 'groundfx', cd: 0, damage: g.dps * 0.25, pierce: 1, range: 0, dtype: g.dtype, visual: g.kind, color: '#f60' };
        for (const e of this.grid.query(g.x, g.y, g.r + 40, this.tmp2).slice()) {
          if (n <= 0) break;
          if (e.dead || Math.hypot(e.x - g.x, e.y - g.y) > g.r + e.def.radius) continue;
          this.hit(e, a, g.tower); n--;
        }
      }
    }
    this.ground = this.ground.filter((g) => g.t > 0);
  }

  // ---------------------------------------------------------- abilities & spells
  private tickAbilities(dt: number, live: boolean) {
    if (!live) return;
    for (const t of this.towers) for (const ab of t.abilities) ab.left = Math.max(0, ab.left - dt);
    for (const s of this.spells) s.left = Math.max(0, s.left - dt);
  }

  private updateSoldiers(dt: number) {
    for (const s of this.soldiers) {
      const b = s.tower.stats.barracks;
      if (!b) continue;
      s.anim = Math.max(0, s.anim - dt);
      if (s.dead) {
        s.respawnT -= dt;
        if (s.respawnT <= 0) { s.dead = false; s.hp = s.maxHp; s.x = s.tower.x; s.y = s.tower.y; }
        continue;
      }
      s.hp = Math.min(s.maxHp, s.hp + b.regen * dt);
      const dx = s.hx - s.x, dy = s.hy - s.y, dl = Math.hypot(dx, dy);
      if (dl > 1) { const st = Math.min(dl, 120 * dt); s.x += (dx / dl) * st; s.y += (dy / dl) * st; }
      const near = this.grid.query(s.x, s.y, 70, this.tmp2);
      const held: Enemy[] = [];
      let drain = 0;
      for (const e of near) {
        if (e.dead) continue;
        const dist = Math.hypot(e.x - s.x, e.y - s.y);
        if (dist > e.def.radius + 10) continue;
        const canHold = (!e.def.giant || b.blockGiants) && (!e.def.boss || b.blockBoss);
        if (canHold && held.length < b.block) { held.push(e); e.blockT = 0.08; if (b.stun && !e.def.giant) e.stunT = Math.max(e.stunT, b.stun); drain += e.def.boss ? 120 : e.def.giant ? e.def.rank * 4 : e.def.rank * 0.8; }
        else if (e.def.giant) drain += e.def.boss ? 400 : 25; // trampled
      }
      s.holding = held.length;
      s.hp -= drain * dt;
      if (s.hp <= 0) { s.dead = true; s.respawnT = b.respawn; this.burst(s.x, s.y, '#c94a3a', 6, 2); continue; }
      s.cd -= dt * (1 + s.tower.buffs.rate);
      if (s.cd <= 0) {
        let targets = held.length ? (b.cleave ? held : [held[0]]) : [];
        if (!targets.length) {
          for (const e of near) if (!e.dead && this.visibleTo(e, s.tower) && Math.hypot(e.x - s.x, e.y - s.y) < 34 + e.def.radius) { targets = [e]; break; }
        }
        if (targets.length) {
          s.cd = b.cd; s.anim = 0.15;
          const a: Attack = { id: 'soldier', kind: 'melee', cd: b.cd, damage: b.damage, pierce: 1, range: 30, dtype: 'sharp', giantBonus: b.giantBonus, visual: 'stab', color: '#fff' };
          for (const e of targets) this.hit(e, a, s.tower);
        }
      }
    }
  }

  strongest(): Enemy | null {
    let best: Enemy | null = null;
    for (const e of this.enemies) if (!e.dead && e.d >= 0 && (!best || e.def.rank * 1e6 + e.hp > best.def.rank * 1e6 + best.hp)) best = e;
    return best;
  }
  leader(): Enemy | null {
    let best: Enemy | null = null; let bv = -1;
    for (const e of this.enemies) { const v = e.d / this.paths[e.path].len; if (!e.dead && v > bv) { bv = v; best = e; } }
    return best;
  }

  private pure(id: string, dmg: number): Attack { return { id, kind: 'pulse', cd: 0, damage: dmg, pierce: 1, range: 0, dtype: 'pure', visual: id, color: '#fff' }; }

  areaDamage(x: number, y: number, r: number, dmg: number, by: Tower | null, stun = 0, color = '#ffb02e') {
    const a = this.pure('area', dmg);
    if (stun) a.stun = stun;
    const fake = by ?? this.towers[0];
    for (const e of this.enemies.slice()) {
      if (e.dead || Math.hypot(e.x - x, e.y - y) > r + e.def.radius) continue;
      if (fake) this.hit(e, a, fake); else this.damage(e, dmg, null);
    }
    this.fx.push({ kind: 'meteor', x, y, r, t: 0, max: 0.6, color });
    this.events.push({ type: 'boom' });
  }

  useAbility(t: Tower, id: string): boolean {
    const ab = t.abilities.find((a) => a.def.id === id);
    if (!ab || ab.left > 0 || this.state !== 'wave') return false;
    const L = t.level;
    switch (id) {
      case 'arrowrain': for (const e of this.enemies.slice()) if (!e.dead) this.hit(e, this.pure(id, 12), t); this.fx.push({ kind: 'ring', x: WORLD_W / 2, y: WORLD_H / 2, r: 600, t: 0, max: 0.6, color: '#c9a35b' }); break;
      case 'judgment': { const e = this.strongest(); if (!e) return false; this.fx.push({ kind: 'line', x: e.x, y: -20, x2: e.x, y2: e.y, r: 14, t: 0, max: 0.5, color: '#fff6b0' }); this.hit(e, this.pure(id, 3000), t); break; }
      case 'meteor': case 'starfall': { const e = this.strongest(); if (!e) return false; this.areaDamage(e.x, e.y, id === 'meteor' ? 90 : 130, id === 'meteor' ? 400 : 2000, t); break; }
      case 'absolutezero': for (const e of this.enemies) { if (!e.def.boss) { e.stunT = Math.max(e.stunT, 6); e.frozen = true; } } this.zeroBossT = 6; this.fx.push({ kind: 'ring', x: t.x, y: t.y, r: 900, t: 0, max: 0.8, color: '#bdf0ff' }); break;
      case 'crescendo': this.crescendoT = 10; break;
      case 'rally': this.rallyT = 10; this.fx.push({ kind: 'ring', x: t.x, y: t.y, r: 400, t: 0, max: 0.6, color: '#9cc6ff' }); break;
      case 'dawnblade': this.areaDamage(t.x, t.y, 170, 60 * L, t, 1, '#fff6b0'); break;
      case 'nova': this.areaDamage(t.x, t.y, 200, 25 * L, t, 0, '#c9a2ff'); break;
      case 'chrono': this.chronoT = 8; this.fx.push({ kind: 'ring', x: t.x, y: t.y, r: 900, t: 0, max: 0.8, color: '#ffe27a' }); break;
      case 'keg': { const e = this.leader(); if (!e) return false; this.areaDamage(e.x, e.y, 75, 100 * L, t, 0, '#ff9a2a'); break; }
      case 'haul': { const g = 150 * L; this.gold += g; this.text(t.x, t.y - 30, `+${g}`, '#ffd23a'); break; }
      default: return false;
    }
    ab.left = ab.def.cd * (this.perks.has('relics') && t.isHero ? 0.9 : 1);
    this.events.push({ type: 'ability', id });
    return true;
  }

  castSpell(id: string, x = 0, y = 0): boolean {
    const s = this.spells.find((s) => s.id === id);
    if (!s || s.left > 0 || this.state !== 'wave') return false;
    if (id === 'meteor') this.areaDamage(x, y, 95, this.perks.has('meteor') ? 240 : 150, this.towers[0] ?? null);
    else if (id === 'freeze') { this.freezeT = this.perks.has('freeze') ? 5.5 : 4; this.fx.push({ kind: 'ring', x: WORLD_W / 2, y: WORLD_H / 2, r: 700, t: 0, max: 0.8, color: '#bdf0ff' }); }
    else if (id === 'reinforce') { const n = this.perks.has('walls') ? 40 : 25; this.lives += n; this.text(WORLD_W / 2, 60, `+${n} lives`, '#7dff8a'); }
    s.left = s.cd;
    this.events.push({ type: 'ability', id });
    return true;
  }

  // ---------------------------------------------------------- fx
  text(x: number, y: number, text: string, color: string) { this.fx.push({ kind: 'text', x, y, r: 0, t: 0, max: 1.2, color, text }); }
  fxRing(x: number, y: number, r: number, color: string, max: number) { if (this.fx.length < 400) this.fx.push({ kind: 'ring', x, y, r, t: 0, max, color }); }
  particle(x: number, y: number, color: string, size: number) {
    if (this.particles.length > 700) return;
    const a = this.rnd() * Math.PI * 2, s = 30 + this.rnd() * 90;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: 0, max: 0.35 + this.rnd() * 0.3, color, size });
  }
  burst(x: number, y: number, color: string, n: number, size: number) { for (let i = 0; i < n; i++) this.particle(x, y, i % 3 === 0 ? '#ffffff' : color, size); }
  private updateFx(dt: number) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.max);
    for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; }
    this.particles = this.particles.filter((p) => p.t < p.max);
  }

  // ---------------------------------------------------------- save/load (between rounds)
  serialize() {
    return {
      v: 1, mapId: this.map.id, difficulty: this.diff, heroId: this.heroId, gold: this.gold, lives: this.lives, round: this.round, freeplay: this.freeplay,
      towers: this.towers.map((t) => ({ defId: t.isHero ? 'hero' : t.defId, x: t.x, y: t.y, tiers: t.tiers, targeting: t.targeting, spent: t.spent, pops: t.pops, bank: t.bank, xp: t.xp })),
      spells: this.spells.map((s) => s.left),
    };
  }
  static restore(data: ReturnType<Game['serialize']>, perks?: string[]): Game {
    const g = new Game({ mapId: data.mapId, difficulty: data.difficulty, heroId: data.heroId, perks });
    g.gold = 1e12;
    for (const s of data.towers) {
      const t = g.placeTower(s.defId, s.x, s.y);
      if (!t) continue;
      t.tiers = s.tiers.slice(); t.targeting = s.targeting as Targeting; t.spent = s.spent; t.pops = s.pops; t.bank = s.bank; t.xp = s.xp;
      g.recompute(t);
    }
    g.gold = data.gold; g.lives = data.lives; g.round = data.round; g.freeplay = data.freeplay;
    data.spells.forEach((l, i) => { if (g.spells[i]) g.spells[i].left = l; });
    g.events.length = 0;
    return g;
  }
}

export type { TowerDef };
