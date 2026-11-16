// Shard Vault: a premium-style currency that trickles in over real time (even while away), up to a cap.
// Collecting empties the vault into the wallet, so coming back a couple of times a day is rewarded.
// Pure logic with an injectable clock so it can be unit-tested.

export const SHARD_RATE_MS = 60_000; // 1 shard per minute
export const VAULT_LEVELS = [
  { cap: 100, cost: 0, name: 'Shard Vault' },
  { cap: 250, cost: 150, name: 'Deep Vault' },
  { cap: 500, cost: 400, name: 'Royal Vault' },
];
/** Shard prices for the consumable Powers. A full Royal Vault (500) buys roughly five. */
export const POWER_PRICE: Record<string, number> = { chest: 80, draught: 80, merc: 100, hourglass: 100, dragonfire: 120 };
/** Shards earned by playing. */
export const SHARDS_PER_WAVE = 1, SHARDS_BOSS_WAVE = 5, SHARDS_VICTORY = 25;

export interface VaultState { shards: number; vaultLevel: number; vaultSince: number }

export const vaultCap = (s: VaultState) => VAULT_LEVELS[Math.min(s.vaultLevel, VAULT_LEVELS.length - 1)].cap;

/** Shards waiting in the vault right now. */
export function vaultStored(s: VaultState, now: number): number {
  const elapsed = Math.max(0, now - s.vaultSince); // a clock set backwards yields nothing rather than negatives
  return Math.min(vaultCap(s), Math.floor(elapsed / SHARD_RATE_MS));
}
/** Milliseconds until the vault is full (0 when full). */
export function vaultFullIn(s: VaultState, now: number): number {
  return Math.max(0, vaultCap(s) * SHARD_RATE_MS - Math.max(0, now - s.vaultSince));
}
/** Move the vault's contents into the wallet. Returns how many were collected. */
export function collectVault(s: VaultState, now: number): number {
  const n = vaultStored(s, now);
  if (n <= 0) { if (now < s.vaultSince) s.vaultSince = now; return 0; }
  const full = n >= vaultCap(s);
  s.shards += n;
  // keep the partial minute unless the vault was full (time past the cap is not banked)
  s.vaultSince = full ? now : s.vaultSince + n * SHARD_RATE_MS;
  return n;
}
/** Buy the next vault size with shards. Collects first so nothing in the vault is lost. */
export function upgradeVault(s: VaultState, now: number): boolean {
  const next = VAULT_LEVELS[s.vaultLevel + 1];
  if (!next || s.shards < next.cost) return false;
  const stored = vaultStored(s, now), wasFull = stored >= vaultCap(s);
  s.shards -= next.cost; s.vaultLevel++;
  if (wasFull) s.vaultSince = now - stored * SHARD_RATE_MS; // a full vault keeps what it held and resumes filling
  return true;
}
export function spendShards(s: VaultState, n: number): boolean { if (s.shards < n) return false; s.shards -= n; return true; }
