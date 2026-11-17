import { MAPS } from './core/maps';
import { TOWERS } from './core/towers';
import { HEROES } from './core/heroes';
import { perkPoints } from './core/progress';
import type { Difficulty } from './core/types';
import type { Game } from './core/game';

export interface Profile {
  v: 1;
  totalRounds: number;
  medals: Record<string, Partial<Record<Difficulty | 'freeplay', number>>>; // value = 1 for medal, freeplay = best round
  perks: string[];
  powers: Record<string, number>;
  settings: { sfx: boolean; music: boolean; autoStart: boolean; sfxVol: number; musicVol: number; quality: 'high' | 'low'; advisor: boolean };
  /** Shard wallet and vault (see core/vault.ts). vaultSince = when the vault last started filling (ms). */
  shards: number; vaultLevel: number; vaultSince: number;
  /** First-run tutorial finished or dismissed. */
  tutorialDone: boolean;
  lastHero: string;
  lastMap?: string;
  lastDiff?: Difficulty;
}

const KEY = 'shatterspire.profile.v1';
const RUN = 'shatterspire.run.v1';
export const UNLOCK_ALL = typeof location !== 'undefined' && (/[?&]unlockall\b/.test(location.search) || location.hash === '#unlockall');

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
function safeDel(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

/** ?fresh erases the saved profile so the next load is a true first run, then cleans the URL so a refresh does not erase again. */
if (typeof location !== 'undefined' && /[?&]fresh\b/.test(location.search)) {
  safeDel(KEY); safeDel(RUN);
  try { const u = new URL(location.href); u.searchParams.delete('fresh'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch { /* ignore */ }
}

export function loadProfile(): Profile {
  const def: Profile = { v: 1, totalRounds: 0, medals: {}, perks: [], powers: { chest: 1, draught: 1 }, settings: { sfx: true, music: true, autoStart: false, sfxVol: 0.8, musicVol: 0.7, quality: 'high', advisor: true }, lastHero: 'aldric', tutorialDone: false,
    shards: 0, vaultLevel: 0, vaultSince: Date.now() - 50 * 60_000 }; // new and returning players find 50 shards waiting
  const raw = safeGet(KEY);
  if (!raw) return def;
  try { const p = JSON.parse(raw); return { ...def, tutorialDone: (p.totalRounds ?? 0) > 0, ...p, settings: { ...def.settings, ...p.settings }, powers: { ...p.powers } }; } catch { return def; }
}
export function saveProfile(p: Profile) { safeSet(KEY, JSON.stringify(p)); }

export function medalCount(p: Profile) {
  let n = 0;
  for (const m of Object.values(p.medals)) for (const d of ['easy', 'medium', 'hard'] as const) if (m[d]) n++;
  return n;
}
export function perkPointsLeft(p: Profile) { return (UNLOCK_ALL ? 99 : perkPoints(medalCount(p), p.totalRounds)) - p.perks.length; }

export function towerUnlocked(p: Profile, id: string) { const t = TOWERS.find((x) => x.id === id)!; return UNLOCK_ALL || p.totalRounds >= t.unlockRounds; }
export function heroUnlocked(p: Profile, id: string) { const h = HEROES.find((x) => x.id === id)!; return UNLOCK_ALL || p.totalRounds >= h.unlockRounds; }
export function mapUnlocked(p: Profile, id: string) {
  const m = MAPS.find((x) => x.id === id)!;
  if (UNLOCK_ALL || !m.unlock) return true;
  const req = p.medals[m.unlock];
  return !!(req && (req.easy || req.medium || req.hard));
}

export function saveRun(g: Game) { safeSet(RUN, JSON.stringify(g.serialize())); }
export function loadRun(): ReturnType<Game['serialize']> | null { const r = safeGet(RUN); if (!r) return null; try { return JSON.parse(r); } catch { return null; } }
export function clearRun() { safeDel(RUN); }
