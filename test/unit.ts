// Focused regression tests for core rules. Run: npx tsx test/unit.ts
import { Game } from '../src/core/game';
import { HEROES, HERO_XP, heroLevel } from '../src/core/heroes';
import { waveInfo } from '../src/core/waves';
import { MAPS, distToPath, PATH_WIDTH } from '../src/core/maps';

let fails = 0, passes = 0;
function ok(cond: unknown, msg: string) { if (cond) passes++; else { fails++; console.log('FAIL:', msg); } }
const STEP = 1 / 60;
const run = (g: Game, secs: number) => { for (let i = 0; i < secs * 60; i++) g.update(STEP); };
const fresh = (diff: 'easy' | 'medium' | 'hard' = 'medium', heroId = 'aldric') => new Game({ mapId: 'meadow', difficulty: diff, heroId, seed: 1 });
function findSpot(g: Game, r = 18, near = true) {
  for (let x = 60; x < 900; x += 6) for (let y = 40; y < 600; y += 6) {
    if (!g.canPlace(x, y, r)) continue;
    const d = Math.min(...g.map.paths.map((p) => distToPath(x, y, p)));
    if (!near || d < PATH_WIDTH / 2 + r + 20) return { x, y };
  }
  throw new Error('no spot');
}

// ---- timing: cooldowns tick in battle time only, and speed-independent per sim second
{
  const g = fresh();
  g.startWave(); run(g, 0.5);
  ok(g.castSpell('freeze'), 'freeze castable during wave');
  const cd = g.spells.find((s) => s.id === 'freeze')!;
  const before = cd.left; run(g, 10);
  ok(Math.abs(before - cd.left - 10) < 0.05, `cooldown drops 10s per 10 sim seconds (got ${(before - cd.left).toFixed(2)})`);
  g.lives = 1e9; g.enemies.length = 0; g.queue.length = 0; g.update(STEP);
  ok(g.state === 'build', 'wave ends when cleared');
  const held = cd.left; run(g, 20);
  ok(cd.left === held, 'cooldown waits between waves (documented rule)');
}

// ---- reinforce: capped heal, never silently wasted, usable between waves
{
  const g = fresh('easy');
  ok(g.maxLives === 200, 'easy max lives 200');
  ok(!!g.spellBlock('reinforce') && /full strength/.test(g.spellBlock('reinforce')!), 'reinforce at cap explains why');
  ok(!g.castSpell('reinforce'), 'reinforce at cap is refused');
  ok(g.spells.find((s) => s.id === 'reinforce')!.left === 0, 'refused cast does not start the cooldown');
  g.lives = 184;
  ok(g.spellBlock('reinforce') === null, 'reinforce allowed between waves when hurt');
  ok(g.castSpell('reinforce') && g.lives === 200 && g.lastHeal === 16, `184 → 200 (+16), got ${g.lives}`);
  ok(g.spells.find((s) => s.id === 'reinforce')!.left > 0, 'successful cast starts the cooldown');
  ok(/Recharging/.test(g.spellBlock('reinforce') ?? ''), 'recharging message');
  const m = fresh('medium'); m.lives = 150 - 30; m.startWave();
  ok(m.castSpell('reinforce') && m.lives === 145, 'medium 120 → 145 (+25)');
  const r = Game.restore(m.serialize());
  ok(r.spells.find((s) => s.id === 'reinforce')!.left > 0, 'cooldown survives save/restore');
}

// ---- placement validation reasons (single source of truth)
{
  const g = fresh();
  const p = g.paths[0]; const pt = { x: 0, y: 0 };
  const { pointAt } = await import('../src/core/maps');
  pointAt(p, p.len / 2, pt);
  ok(g.placeError('archer', pt.x, pt.y) === 'Too close to the path', 'on the road → too close to path');
  ok(/edge/.test(g.placeError('archer', 2, 2) ?? ''), 'edge');
  const ob = g.map.obstacles.find((o) => o.kind === 'water' || o.kind === 'rock' || o.kind === 'tree')!;
  ok(/terrain|water|lava/.test(g.placeError('archer', ob.x, ob.y) ?? ''), `obstacle → terrain (${g.placeError('archer', ob.x, ob.y)})`);
  const s = findSpot(g);
  ok(g.placeError('archer', s.x, s.y) === null, 'free spot is buildable');
  g.placeTower('archer', s.x, s.y);
  ok(g.placeError('archer', s.x + 3, s.y) === 'Overlaps another tower', 'overlap');
  g.gold = 0;
  const s2 = findSpot(g);
  ok(/Not enough gold/.test(g.placeError('archer', s2.x, s2.y) ?? ''), 'gold');
  ok(g.placeTower('archer', s2.x, s2.y) === null, 'placeTower agrees with placeError');
}

// ---- hero abilities unlock at exactly the level the panel shows
for (const h of HEROES) {
  for (let L = 1; L <= HERO_XP.length; L++) {
    const g = fresh('medium', h.id); g.gold = 1e9;
    const s = findSpot(g, h.radius);
    const t = g.placeTower('hero', s.x, s.y)!;
    t.xp = HERO_XP[L - 1]; g.recompute(t);
    ok(t.level === L && heroLevel(t.xp) === L, `${h.id} level ${L}`);
    for (const a of h.abilities) ok(t.abilities.some((x) => x.def.id === a.def.id) === (L >= a.level), `${h.id} L${L} ${a.def.id} unlock == (L >= ${a.level})`);
    // one XP short of the next level must not unlock early
    if (L < HERO_XP.length) { t.xp = HERO_XP[L] - 1; g.recompute(t); ok(t.level === L, `${h.id} ${HERO_XP[L] - 1}xp still L${L}`); }
  }
}

// ---- save compatibility: a v1 save written before this update still loads
{
  const old = { v: 1, mapId: 'meadow', difficulty: 'easy', heroId: 'lyra', gold: 1234, lives: 77, round: 12, freeplay: false,
    towers: [{ defId: 'barracks', x: 0, y: 0, tiers: [1, 0, 0], targeting: 'first', spent: 400, pops: 55, bank: 0, xp: 0 }], spells: [0, 12, 0] };
  const g0 = fresh(); const s = findSpot(g0, 20); old.towers[0].x = s.x; old.towers[0].y = s.y;
  const g = Game.restore(old as unknown as ReturnType<Game['serialize']>);
  ok(g.gold === 1234 && g.lives === 77 && g.round === 12, 'old save: gold/lives/round');
  ok(g.towers.length === 1 && g.towers[0].pops === 55 && g.towers[0].dmg === 0 && g.towers[0].tiers[0] === 1, 'old save: tower + defaults for new stats');
  ok(!!g.towers[0].rally, 'old save: barracks gets a default rally point');
  // new fields round-trip
  const t = g.towers[0]; const rp = g.rallyPos(t)!;
  const err = g.setRally(t, rp.x + 0, rp.y);
  ok(err === null, `setRally on the road works (${err})`);
  ok(g.setRally(t, t.x + 400, t.y) !== null, 'setRally rejects far spots');
  t.dmg = 999;
  const g2 = Game.restore(g.serialize());
  ok(g2.towers[0].dmg === 999 && g2.towers[0].rally?.d === t.rally?.d, 'new fields round-trip');
}

// ---- barracks deploy preview == actual deployment
for (const m of MAPS) {
  const g = new Game({ mapId: m.id, difficulty: 'medium', heroId: 'aldric', seed: 2 }); g.gold = 1e9;
  const s = findSpot(g, 20);
  const pv = g.deployPoint(s.x, s.y)!;
  const t = g.placeTower('barracks', s.x, s.y)!;
  const rp = g.rallyPos(t)!;
  ok(Math.hypot(pv.x - rp.x, pv.y - rp.y) < 0.5, `${m.id}: preview flag matches deployment`);
}

// ---- wave preview flags the wave-26 giant and the leak cost
{
  const w = waveInfo(26);
  ok(w.giant && w.threats.some((t) => /GIANT/.test(t.tag) && t.danger), 'wave 26 warns about the first giant');
  ok(w.worstLeak >= 600, `wave 26 worst leak ${w.worstLeak}`);
  ok(waveInfo(21).threats.some((t) => t.tag === 'SHARP-PROOF') && waveInfo(21).threats.some((t) => t.tag === 'BLAST-PROOF'), 'wave 21 flags ironclads + glooms');
  ok(waveInfo(17).threats.some((t) => t.tag === 'SHADOWED'), 'wave 17 flags shadowed');
  ok(waveInfo(20).boss, 'wave 20 boss');
}

// ---- powers explain themselves
{
  const g = fresh();
  ok(g.powerBlock('dragonfire') !== null && !g.usePower('dragonfire'), 'dragonfire needs enemies');
  ok(g.powerBlock('chest') === null && g.usePower('chest') && g.gold === 650 + 500, 'chest +500');
}

// ---- defeat recap names the real cause, and a lost wave can be retried
{
  const { analyzeDefeat } = await import('../src/core/analysis');
  const g = fresh('medium'); g.gold = 1e6;
  for (let i = 0; i < 8; i++) { const s = findSpot(g); const t = g.placeTower('archer', s.x, s.y)!; g.upgrade(t, 0); g.upgrade(t, 0); g.upgrade(t, 2); }
  g.gold = 2500; g.round = 20; g.lives = 60;
  g.startWave(); // wave 21: Glooms + Ironclads
  let n = 0; while (g.state === 'wave' && n++ < 60 * 300) g.update(STEP);
  ok(g.state === 'over', 'sharp-only defense loses wave 21');
  const rc = analyzeDefeat(g);
  ok(rc.round === 21 && rc.leaks.length > 0, `recap lists leaks (${rc.leaks.map((l) => l.name + ':' + l.lives).join(', ')})`);
  ok(/Ironclad/.test(rc.cause), `cause blames Ironclads: "${rc.cause}"`);
  ok(rc.tips.some((t) => t.tower === 'mage'), 'tip points to a Sharp-proof answer');
  ok(rc.tips.some((t) => /unspent/.test(t.text)), 'tip calls out unspent gold');
  ok(rc.history[rc.history.length - 1].round === 21 && rc.history[rc.history.length - 1].lost === 60, 'history records the fatal wave');
  const r = Game.restore(g.waveStartSave!);
  ok(r.round === 20 && r.state === 'build' && r.lives === 60 && r.towers.length === 8 && r.gold === 2500, 'retry restores the pre-wave state');
  // giant leak
  const g2 = fresh('easy'); g2.round = 25; g2.lives = 200; g2.startWave(); n = 0; while (g2.state === 'wave' && n++ < 60 * 400) g2.update(STEP);
  const rc2 = analyzeDefeat(g2);
  ok(g2.state === 'over' && rc2.tips.length > 0 && rc2.cause.length > 10, `empty defense on w26 gets a cause: "${rc2.cause}"`);
}

// ---- advisor suggests a real counter
{
  const { recommendTower } = await import('../src/core/analysis');
  const g = fresh(); g.gold = 1e6;
  ok(recommendTower(g, 1)?.tower === 'archer', 'no towers -> Archer');
  for (let i = 0; i < 3; i++) { const s = findSpot(g); g.placeTower('archer', s.x, s.y); }
  ok(recommendTower(g, 21)?.tower === 'mage', 'archers only vs wave 21 Ironclads -> Fire Mage');
  const s1 = findSpot(g); g.placeTower('mage', s1.x, s1.y);
  ok(recommendTower(g, 21)?.tower !== 'mage', 'once a Mage is built the Ironclad warning goes away');
  ok(recommendTower(g, 26)?.tower === 'ballista', 'first giant with no Ballista -> Ballista');
  ok(recommendTower(g, 17)?.tower === 'archer' && /Eagle Eye/.test(recommendTower(g, 17)!.why), 'shadowed wave without True Sight -> Eagle Eye tip');
}

// ---- Shard Vault: 1 per minute, capped, partial minutes kept, upgrades, clock safety
{
  const V = await import('../src/core/vault');
  const MIN = 60_000, t0 = 1_000_000_000;
  const s = { shards: 0, vaultLevel: 0, vaultSince: t0 };
  ok(V.vaultStored(s, t0 + 37 * MIN + 59_000) === 37, '37m59s -> 37 shards');
  ok(V.vaultStored(s, t0 + 9999 * MIN) === 100, 'capped at 100');
  ok(V.vaultFullIn(s, t0 + 40 * MIN) === 60 * MIN && V.vaultFullIn(s, t0 + 500 * MIN) === 0, 'time to full');
  ok(V.collectVault(s, t0 + 37 * MIN + 59_000) === 37 && s.shards === 37, 'collect moves shards to the wallet');
  ok(V.vaultStored(s, t0 + 38 * MIN) === 1, 'partial minute carries over after collecting');
  ok(V.collectVault(s, t0 + 38 * MIN + 1000) === 1 && V.collectVault(s, t0 + 38 * MIN + 2000) === 0, 'cannot double-collect');
  ok(V.collectVault(s, t0 + 9999 * MIN) === 100 && V.vaultStored(s, t0 + 9999 * MIN) === 0, 'full vault: time past the cap is not banked');
  ok(V.vaultStored(s, t0 - 5 * MIN) === 0 && V.collectVault(s, t0 - 5 * MIN) === 0, 'clock set backwards gives nothing');
  s.shards = 149; ok(!V.upgradeVault(s, t0) && s.vaultLevel === 0, 'upgrade needs 150');
  s.shards = 150; s.vaultSince = t0; const now = t0 + 300 * MIN;
  ok(V.upgradeVault(s, now) && s.shards === 0 && V.vaultCap(s) === 250, 'upgrade to 250');
  ok(V.vaultStored(s, now) === 100 && V.vaultStored(s, now + 150 * MIN) === 250, 'a full vault keeps its 100 after upgrading and resumes filling');
  s.shards = 400; ok(V.upgradeVault(s, now) && V.vaultCap(s) === 500 && !V.upgradeVault(s, now), '500 is the top level');
  ok(V.spendShards(s, 1) === false && s.shards === 0, 'cannot overspend');
  ok(Object.keys(V.POWER_PRICE).length === 5, 'every power has a price');
  // per-battle power cap, saved with the run
  const g = fresh(); for (let i = 0; i < 3; i++) ok(g.usePower('chest'), `power ${i + 1} allowed`);
  ok(/per battle/.test(g.powerBlock('chest') ?? '') && !g.usePower('chest'), '4th power in a battle is refused');
  ok(Game.restore(g.serialize()).powersUsed === 3, 'power count survives save/restore');
}

console.log(`${passes} passed, ${fails} failed`);
if (fails) process.exit(1);
