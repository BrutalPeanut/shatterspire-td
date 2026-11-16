// What an upgrade actually changes, derived from the real stats (never from the flavour text).
import { computeStats } from './towers';
import type { Attack, TowerDef, TowerStats } from './types';

const n = (v: number, d = 1) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(d));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const arrow = (label: string, a: string, b: string) => `${label} ${a}→${b}`;

const ATTACK_NAME: Record<string, string> = { thorns: 'Thorns', vines: 'Vines', unstable: 'Giant flasks', phoenix: 'Phoenix', firewall: 'Fire wall', comet: 'Comets', lightning: 'Lightning' };

function attackDiff(a: Attack | undefined, b: Attack, sink: string[], label = '') {
  const out: string[] = [];
  const L = (s: string) => (label ? `${label} ${s.toLowerCase()}` : s);
  if (!a) {
    const what = b.kind === 'groundfx' ? `burning ground (${n(b.fx?.dps ?? 0)}/s)` : `${n(b.damage)} dmg${b.count && b.count > 1 ? ` ×${b.count}` : ''} every ${n(b.cd)}s${b.range === Infinity ? ', whole map' : ''}`;
    sink.push(`NEW ${label || ATTACK_NAME[b.id] || 'attack'}: ${what}`);
    return;
  }
  if (a.damage !== b.damage && b.kind !== 'groundfx') out.push(arrow(L('Damage'), n(a.damage), n(b.damage)));
  if ((a.count ?? 1) !== (b.count ?? 1)) out.push(arrow(L('Shots'), n(a.count ?? 1), n(b.count ?? 1)));
  if (a.cd !== b.cd) out.push(arrow(L('Speed'), `${n(1 / a.cd)}`, `${n(1 / b.cd)}/s`));
  if (a.range !== b.range && b.range !== Infinity) out.push(arrow(L('Range'), n(a.range), n(b.range)));
  if (a.pierce !== b.pierce) out.push(arrow(L('Pierce'), n(a.pierce), n(b.pierce)));
  if ((a.splash ?? 0) !== (b.splash ?? 0)) out.push(a.splash ? arrow(L('Blast'), n(a.splash), n(b.splash ?? 0)) : `NEW: explodes (radius ${n(b.splash ?? 0)})`);
  if ((a.giantBonus ?? 0) !== (b.giantBonus ?? 0)) out.push(arrow(L('Vs giants'), `+${n(a.giantBonus ?? 0)}`, `+${n(b.giantBonus ?? 0)}`));
  if ((a.burn?.dps ?? 0) !== (b.burn?.dps ?? 0)) out.push(a.burn ? arrow(L('Burn'), `${n(a.burn.dps)}`, `${n(b.burn!.dps)}/s`) : `NEW: burns ${n(b.burn!.dps)}/s for ${n(b.burn!.dur)}s`);
  if ((a.acid?.dps ?? 0) !== (b.acid?.dps ?? 0)) out.push(a.acid ? arrow(L('Acid'), `${n(a.acid.dps)}`, `${n(b.acid!.dps)}/s`) : `NEW: acid ${n(b.acid!.dps)}/s`);
  if ((a.slow?.f ?? 0) !== (b.slow?.f ?? 0) || (a.slow?.dur ?? 0) !== (b.slow?.dur ?? 0)) out.push(a.slow ? arrow(L('Slow'), `${pct(a.slow.f)} ${n(a.slow.dur)}s`, `${pct(b.slow!.f)} ${n(b.slow!.dur)}s`) : `NEW: slows ${pct(b.slow!.f)}`);
  if ((a.slow?.giants ?? 0) !== (b.slow?.giants ?? 0)) out.push(`NEW: slows giants ${pct(b.slow!.giants ?? 0)} (bosses half)`);
  if ((a.stun ?? 0) !== (b.stun ?? 0)) out.push(a.stun ? arrow(L('Stun'), `${n(a.stun)}s`, `${n(b.stun ?? 0)}s`) : `NEW: ${b.dtype === 'cold' ? 'freezes' : 'stuns'} ${n(b.stun ?? 0)}s`);
  if ((a.stunGiants ?? 0) !== (b.stunGiants ?? 0)) out.push(`${a.stunGiants ? '' : 'NEW: '}stuns giants ${n(b.stunGiants ?? 0)}s`);
  if ((a.knock ?? 0) !== (b.knock ?? 0)) out.push(a.knock ? arrow(L('Knockback'), n(a.knock), n(b.knock ?? 0)) : 'NEW: knocks enemies back');
  if ((a.chain ?? 0) !== (b.chain ?? 0)) out.push(arrow(L('Chains to'), n(a.chain ?? 1), n(b.chain ?? 1)));
  if (a.kind !== b.kind && b.kind === 'chain') out.push('NEW: lightning that jumps between enemies');
  if (!a.cluster && b.cluster) out.push(`NEW: ${b.cluster.count} bomblets`); else if (a.cluster && b.cluster && (a.cluster.count !== b.cluster.count || a.cluster.depth !== b.cluster.depth)) out.push(a.cluster.depth !== b.cluster.depth ? 'Bomblets split again' : arrow('Bomblets', n(a.cluster.count), n(b.cluster.count)));
  if (!a.shards && b.shards) out.push(`NEW: bursts into ${b.shards.count} shards`);
  if (!a.strip && b.strip) out.push('NEW: strips Regrow and Fortified');
  if (!a.reveal && b.reveal) out.push('NEW: reveals Shadowed enemies');
  if ((a.fx?.dps ?? 0) !== (b.fx?.dps ?? 0)) out.push(arrow(L('Ground fire'), `${n(a.fx?.dps ?? 0)}`, `${n(b.fx?.dps ?? 0)}/s`));
  if (a.dtype !== b.dtype) out.push(`Damage type: ${a.dtype}→${b.dtype}`);
  for (const line of out) sink.push(label && line.startsWith('NEW: ') ? `${label}: ${line.slice(5)}` : line);
}

export function statsDelta(a: TowerStats, b: TowerStats): string[] {
  const out: string[] = [];
  b.attacks.forEach((atk, i) => {
    const prev = a.attacks.find((x) => x.id === atk.id);
    attackDiff(prev, atk, out, i === 0 ? '' : ATTACK_NAME[atk.id] ?? 'Extra');
  });
  if (!a.trueSight && b.trueSight) out.push('NEW: sees Shadowed enemies');
  if (!a.armorPierce && b.armorPierce) out.push('NEW: can hurt Ironclads');
  if (!a.wardBreak && b.wardBreak) out.push('NEW: can hurt Hexlings');
  if (!a.blastAll && b.blastAll) out.push('NEW: can hurt Glooms');
  const A = a.aura, B = b.aura;
  if (B) {
    if ((A?.radius ?? 0) !== B.radius && A) out.push(arrow('Song radius', n(A.radius), n(B.radius)));
    if ((A?.rate ?? 0) !== (B.rate ?? 0)) out.push(arrow('Allies speed', `+${pct(A?.rate ?? 0)}`, `+${pct(B.rate ?? 0)}`));
    if ((A?.range ?? 0) !== (B.range ?? 0)) out.push(arrow('Allies range', `+${pct(A?.range ?? 0)}`, `+${pct(B.range ?? 0)}`));
    if ((A?.pierce ?? 0) !== (B.pierce ?? 0)) out.push(arrow('Allies pierce', `+${n(A?.pierce ?? 0)}`, `+${n(B.pierce ?? 0)}`));
    if ((A?.damage ?? 0) !== (B.damage ?? 0)) out.push(arrow('Allies damage', `+${n(A?.damage ?? 0)}`, `+${n(B.damage ?? 0)}`));
    if (!A?.trueSight && B.trueSight) out.push('NEW: nearby towers see Shadowed');
    if (!A?.armorPierce && B.armorPierce) out.push('NEW: nearby towers hurt Ironclads');
    if (!A?.wardBreak && B.wardBreak) out.push('NEW: nearby towers hurt Hexlings');
    if ((A?.discount ?? 0) !== (B.discount ?? 0)) out.push(arrow('Nearby prices', `−${pct(A?.discount ?? 0)}`, `−${pct(B.discount ?? 0)}`));
    if ((A?.vuln ?? 0) !== (B.vuln ?? 0)) out.push(arrow('Enemies in range take', `+${n(A?.vuln ?? 0)}`, `+${n(B.vuln ?? 0)} dmg`));
    if ((A?.giantVuln ?? 0) !== (B.giantVuln ?? 0)) out.push(`NEW: giants in range take +${pct(B.giantVuln ?? 0)}`);
    if (!A?.reveal && B.reveal) out.push('NEW: reveals Shadowed in range');
    if (!A?.stripFortify && B.stripFortify) out.push('NEW: strips Fortified in range');
    if ((A?.enemySlow ?? 0) !== (B.enemySlow ?? 0)) out.push(arrow('Enemies nearby slowed', pct(A?.enemySlow ?? 0), pct(B.enemySlow ?? 0)));
  }
  const X = a.brew, Y = b.brew;
  if (Y) {
    if (!X) out.push(`NEW: brews for ${Y.count >= 99 ? 'every tower in range' : `${Y.count} nearby tower${Y.count > 1 ? 's' : ''}`}: +${pct(Y.rate)} speed${Y.pierce ? `, +${Y.pierce} pierce` : ''}`);
    else {
      if (X.count !== Y.count) out.push(arrow('Towers buffed', n(X.count), Y.count >= 99 ? 'all in range' : n(Y.count)));
      if (X.rate !== Y.rate) out.push(arrow('Brew speed', `+${pct(X.rate)}`, `+${pct(Y.rate)}`));
      if (X.damage !== Y.damage) out.push(arrow('Brew damage', `+${n(X.damage)}`, `+${n(Y.damage)}`));
      if (X.pierce !== Y.pierce) out.push(arrow('Brew pierce', `+${n(X.pierce)}`, `+${n(Y.pierce)}`));
      if (!X.trueSight && Y.trueSight) out.push('NEW: brewed towers see Shadowed');
      if (!X.armorPierce && Y.armorPierce) out.push('NEW: brewed towers hurt Ironclads');
    }
  }
  const inc = (s: TowerStats) => s.income * s.incomeMult;
  if (inc(a) !== inc(b)) out.push(arrow('Gold per wave', n(inc(a)), n(inc(b))));
  if (a.livesPerRound !== b.livesPerRound) out.push(arrow('Lives per wave', `+${a.livesPerRound}`, `+${b.livesPerRound}`));
  if (a.goldPerPop !== b.goldPerPop) out.push(arrow('Gold per layer', `+${a.goldPerPop}`, `+${b.goldPerPop}`));
  if (a.ironGold !== b.ironGold) out.push(`Ironclads drop +${b.ironGold} gold`);
  if (b.bank && (!a.bank || a.bank.cap !== b.bank.cap || a.bank.interest !== b.bank.interest || a.bank.bonus !== b.bank.bonus)) out.push(a.bank ? `Vault: cap ${n(b.bank.cap)}, ${pct(b.bank.interest)} interest${b.bank.bonus ? `, +${pct(b.bank.bonus)} on withdraw` : ''}` : `NEW: vault (cap ${n(b.bank.cap)}, ${pct(b.bank.interest)} interest per wave)`);
  if ((a.shatter ?? 0) !== (b.shatter ?? 0)) out.push(`Frozen enemies take +${b.shatter} from every tower`);
  if ((a.globalSlow ?? 0) !== (b.globalSlow ?? 0)) out.push(`All enemies slowed ${pct(b.globalSlow ?? 0)} (bosses half)`);
  if ((a.globalBallistaBuff ?? 0) !== (b.globalBallistaBuff ?? 0)) out.push(`All Ballistas +${pct(b.globalBallistaBuff ?? 0)} damage`);
  if ((a.mineGlobalBonus ?? 0) !== (b.mineGlobalBonus ?? 0)) out.push(`All Mines +${pct(b.mineGlobalBonus ?? 0)} gold`);
  if (b.ability && a.ability?.id !== b.ability.id) out.push(`NEW ability: ${b.ability.name} (${b.ability.cd}s)`);
  const P = a.barracks, Q = b.barracks;
  if (P && Q) {
    if (P.count !== Q.count) out.push(arrow('Soldiers', n(P.count), n(Q.count)));
    if (P.hp !== Q.hp) out.push(arrow('Soldier health', n(P.hp), n(Q.hp)));
    if (P.damage !== Q.damage) out.push(arrow('Soldier damage', n(P.damage), n(Q.damage)));
    if (P.cd !== Q.cd) out.push(arrow('Soldier speed', n(1 / P.cd), `${n(1 / Q.cd)}/s`));
    if (P.block !== Q.block) out.push(arrow('Each holds', n(P.block), n(Q.block)));
    if (!P.blockGiants && Q.blockGiants) out.push('NEW: can hold giants');
    if (!P.blockBoss && Q.blockBoss) out.push('NEW: can hold bosses');
    if (!P.cleave && Q.cleave) out.push('NEW: strikes every held enemy');
    if (P.respawn !== Q.respawn) out.push(arrow('Respawn', `${n(P.respawn)}s`, `${n(Q.respawn)}s`));
    if (P.regen !== Q.regen) out.push(arrow('Healing', `${n(P.regen)}`, `${n(Q.regen)}/s`));
    for (const k of ['giantBonus', 'stun'] as const) { const pv = (P as unknown as Record<string, number>)[k] ?? 0, qv = (Q as unknown as Record<string, number>)[k] ?? 0; if (pv !== qv) out.push(k === 'stun' ? `Holding stuns ${n(qv)}s` : arrow('Vs giants', `+${n(pv)}`, `+${n(qv)}`)); }
    if (a.range !== b.range) out.push(arrow('Rally range', n(a.range), n(b.range)));
  }
  return out;
}

/** The concrete changes buying `path`'s next tier would make to a tower with these tiers. */
export function upgradeDelta(def: TowerDef, tiers: number[], path: number): string[] {
  const next = tiers.slice(); next[path]++;
  return statsDelta(computeStats(def, tiers), computeStats(def, next));
}
