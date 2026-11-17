// Defeat recap: what got through, why, and what to change. Pure logic (no DOM) so it can be unit-tested.
import type { Game } from './game';
import { ENEMIES } from './enemies';
import type { DamageType } from './types';

export interface Recap {
  round: number;
  leaks: { name: string; type: string; n: number; lives: number }[];
  /** One-sentence headline cause. */
  cause: string;
  /** Concrete, ordered suggestions (most important first). */
  tips: { text: string; tower?: string }[];
  history: { round: number; lost: number }[];
  unspent: number;
}

const IMMUNE_FIX: Record<string, { text: string; tower: string }> = {
  sharp: { text: 'Ironclads are immune to Sharp (arrows, swords, bolts). Use a Fire Mage, Cannon or Alchemist, or upgrade: Archer Piercing Bolts, Knight Holy Steel, Ballista Iron Tips, Bard Lay of Iron.', tower: 'mage' },
  blast: { text: 'Glooms are immune to Blast. Arrows, magic or swords handle them, or get the Cannon\'s Shell Shock upgrade.', tower: 'archer' },
  cold: { text: 'Frostlings are immune to Cold, so the Druid\'s pulse does nothing to them. Add any other damage near the Druid.', tower: 'archer' },
  magic: { text: 'Hexlings are immune to Magic. Pair your Mages with Archers, Cannons or soldiers.', tower: 'cannon' },
};

export function analyzeDefeat(g: Game): Recap {
  const leaks = Object.values(g.waveLeaks).sort((a, b) => b.lives - a.lives);
  const tips: Recap['tips'] = [];
  const atkTowers = g.towers.filter((t) => t.stats.attacks.length || t.stats.barracks);
  const types = new Set<DamageType>();
  for (const t of atkTowers) { for (const a of t.stats.attacks) types.add(a.dtype); if (t.stats.barracks) types.add('sharp'); }
  const seesShadow = g.towers.some((t) => t.stats.trueSight || t.buffs.trueSight || t.stats.aura?.trueSight);
  const hasSingleTarget = g.towers.some((t) => t.defId === 'ballista' || (t.defId === 'cannon' && t.tiers[0] >= 3) || (t.defId === 'mage' && t.tiers[2] >= 2) || (t.defId === 'archer' && t.tiers[1] >= 3));
  const hasControl = g.towers.some((t) => t.defId === 'druid' || t.defId === 'barracks' || (t.defId === 'knight' && t.tiers[2] > 0));
  let cause = '';

  const top = leaks[0];
  const topDef = top ? ENEMIES[top.type] : null;
  const boss = leaks.find((l) => ENEMIES[l.type].boss);
  const giant = leaks.find((l) => ENEMIES[l.type].giant && !ENEMIES[l.type].boss);
  const shadowLeak = leaks.filter((l) => l.shadow).reduce((s, l) => s + l.lives, 0);
  const totalLeak = leaks.reduce((s, l) => s + l.lives, 0) || 1;

  // Which leaked enemies (or the layers inside them) could none of your towers hurt?
  const unhurtable: string[] = [];
  for (const l of leaks) {
    const stack = [l.type];
    while (stack.length) {
      const id = stack.pop()!; const d = ENEMIES[id];
      if (d.immune.length && atkTowers.length && atkTowers.every((t) => (t.stats.attacks.length ? t.stats.attacks : [{ dtype: 'sharp' as DamageType }]).every((a) => !g.canHurt({ def: d } as never, a.dtype, t)))) for (const i of d.immune) if (!unhurtable.includes(i)) unhurtable.push(i);
      stack.push(...d.children.filter((c) => ENEMIES[c].rank >= 6));
    }
  }

  if (boss) {
    cause = `${boss.name} reached the Spire. A boss that gets through ends the game instantly.`;
    tips.push({ text: 'Bosses have huge health. Stack heavy single-target damage (Ballista, Cannon Big Bombs, Mage Meteor) and save Meteor Shower, Time Freeze and hero abilities for them.', tower: 'ballista' });
  } else if (giant && giant.lives >= totalLeak * 0.4) {
    cause = `A ${giant.name} broke through and cost ${giant.lives} lives. Giants carry hundreds of layers inside them.`;
    if (!hasSingleTarget) tips.push({ text: 'You had nothing built to kill giants. A Ballista with Heavy Bolts / Giant Slayer, or a Cannon on Big Bombs, melts them.', tower: 'ballista' });
    else tips.push({ text: 'Your giant-killers were not enough. Upgrade them further and use Meteor Shower on the giant.', tower: 'ballista' });
  } else if (unhurtable.length) {
    cause = `Your towers could not hurt ${unhurtable.map((i) => ({ sharp: 'Ironclads', blast: 'Glooms', cold: 'Frostlings', magic: 'Hexlings' }[i])).join(' or ')} at all, so they walked straight through.`;
  } else if (shadowLeak >= totalLeak * 0.4 && !seesShadow) {
    cause = 'Shadowed enemies got through: none of your towers could see them.';
    tips.push({ text: 'Get True Sight: Archer Eagle Eye, Mage Arcane Sight, Ballista Spotter\'s Scope (cheap!), Bard Songs of Insight, or play Lyra.', tower: 'ballista' });
  } else if (top && topDef && topDef.speed >= 150 && !hasControl) {
    cause = `Fast ${top.name}s outran your defense (${top.lives} lives).`;
    tips.push({ text: 'Slow them down: a Frost Druid or Barracks soldiers near the end of the road buys your towers time.', tower: 'druid' });
  } else if (top) {
    cause = `There were too many enemies for your defense: ${top.name}s alone cost ${top.lives} lives.`;
    tips.push({ text: 'Build more damage where the road bends. Towers on corners hit enemies for longer.', tower: 'knight' });
  } else {
    cause = 'Your lives ran out.';
  }
  for (const i of unhurtable) tips.push(IMMUNE_FIX[i]);
  if (shadowLeak > 0 && !seesShadow && !tips.some((t) => /True Sight/.test(t.text))) tips.push({ text: 'Some enemies were Shadowed. Get True Sight cheaply with the Ballista\'s Spotter\'s Scope.', tower: 'ballista' });
  if (leaks.some((l) => l.regen)) tips.push({ text: 'Regrow enemies heal their layers. Kill them fast, or strip Regrow with the Alchemist\'s Corrosion.', tower: 'alchemist' });
  if (g.gold >= 800) tips.push({ text: `You still had ${Math.floor(g.gold).toLocaleString()} gold unspent. Gold in the bank doesn't fight, so spend it before big waves (the Next Wave box warns you).` });
  if (g.towers.length <= 4 && g.round >= 10) tips.push({ text: `Only ${g.towers.length} towers by wave ${g.round}. More towers covering more of the road usually beats one big tower.` });
  return { round: g.round, leaks, cause, tips: tips.slice(0, 4), history: g.history.slice(-12), unspent: Math.floor(g.gold) };
}

// ---------------------------------------------------------------- advisor: one suggestion before each wave
import { waveInfo } from './waves';
/** A tower that would shore up the defense for the coming wave, or null when the basics are covered. */
export function recommendTower(g: Game, round: number): { tower: string; why: string } | null {
  const atk = g.towers.filter((t) => t.stats.attacks.length || t.stats.barracks);
  const has = (id: string) => g.towers.some((t) => t.defId === id);
  if (!atk.length) return { tower: 'archer', why: 'A cheap all-rounder to start with' };
  const wi = waveInfo(round);
  // an enemy type (or a layer inside it) that nothing you own can damage
  const FIX: Record<string, [string, string]> = { sharp: ['mage', 'Ironclads shrug off arrows and blades: magic gets through'], blast: ['archer', 'Glooms ignore explosions: arrows work'], cold: ['archer', 'Frostlings ignore cold: add other damage'], magic: ['cannon', 'Hexlings ignore magic: explosions work'] };
  for (const u of wi.units) {
    const stack = [u.type];
    while (stack.length) {
      const d = ENEMIES[stack.pop()!];
      if (d.immune.length && atk.every((t) => (t.stats.attacks.length ? t.stats.attacks : [{ dtype: 'sharp' as DamageType }]).every((a) => !g.canHurt({ def: d } as never, a.dtype, t)))) { const f = FIX[d.immune[0]]; if (f) return { tower: f[0], why: f[1] }; }
      stack.push(...d.children.filter((c) => ENEMIES[c].rank >= 6));
    }
  }
  const shadow = wi.threats.some((t) => t.tag === 'SHADOWED');
  if (shadow && !g.towers.some((t) => t.stats.trueSight || t.buffs.trueSight || t.stats.aura?.trueSight)) return { tower: 'archer', why: 'Shadowed enemies are invisible: upgrade an Archer to Eagle Eye (Sharpshooter path)' };
  if ((wi.giant || wi.boss) && !has('ballista')) return { tower: 'ballista', why: 'Big enemies need heavy single hits' };
  if (atk.length < 2) return { tower: 'knight', why: 'Put it on a bend: it hits everything in reach' };
  if (round >= 4 && !has('knight') && !has('mage') && !has('cannon')) return { tower: 'cannon', why: 'Crowds are coming: explosions hit the whole group' };
  if (round >= 8 && !has('druid') && !has('barracks')) return { tower: 'druid', why: 'Slows the crowd so your towers get more hits' };
  return null;
}
