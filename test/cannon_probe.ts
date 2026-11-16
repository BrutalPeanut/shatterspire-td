// Measures how many shells actually connect, with and without target leading.
import { Game } from '../src/core/game';
function run(lead: boolean) {
  const g = new Game({ mapId: 'meadow', difficulty: 'easy', heroId: 'aldric', seed: 7 });
  if (!lead) g.predict = (e) => ({ x: e.x, y: e.y });
  g.gold = 1e6;
  // a spot right beside the road, like the tester's
  let cannon = null as ReturnType<Game['placeTower']>;
  for (let x = 120; x < 900 && !cannon; x += 10) for (let y = 60; y < 600 && !cannon; y += 10) if (g.canPlace(x, y, 18)) { const dp = g.deployPoint(x, y)!; if (Math.hypot(dp.x - x, dp.y - y) < 48) cannon = g.placeTower('cannon', x, y); }
  g.lives = 1e9;
  for (let r = 0; r < 20; r++) { g.startWave(); let n = 0; while (g.state === 'wave' && n++ < 60 * 400) g.update(1 / 60); }
  return cannon!;
}
for (const lead of [false, true]) { const c = run(lead); console.log(`${lead ? 'with lead   ' : 'without lead'}: pops ${c.pops}, damage ${Math.round(c.dmg)}, kills ${c.kills}`); }
