// Shatterspire icon set: simple single-weight glyphs on a 24px grid, drawn for this game.
// Line icons use currentColor so they take the colour of the button they sit in;
// only icons whose colour carries meaning (lives, gold, shards) are filled.
const S = (body: string) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const F = 'fill="currentColor" stroke="none"';

export const ICON = {
  heart: S(`<path d="M12 20.6s-7.6-4.6-9.1-9.5C1.8 7.5 4 4.4 7.3 4.4c2 0 3.5 1.1 4.7 2.9 1.2-1.8 2.7-2.9 4.7-2.9 3.3 0 5.5 3.1 4.4 6.7-1.5 4.9-9.1 9.5-9.1 9.5z" fill="#FF5A67" stroke="none"/>`),
  coin: S(`<circle cx="12" cy="12" r="9.5" fill="#F5B942" stroke="none"/><circle cx="12" cy="12" r="6.3" stroke="#A8690F" stroke-width="1.6"/><path d="M12 8.8v6.4" stroke="#A8690F" stroke-width="1.8"/>`),
  shard: S(`<path d="M12 2.2l6.3 6.9L12 21.8 5.7 9.1z" fill="#7FD4FF" stroke="none"/><path d="M5.7 9.1h12.6M12 2.2v19.6" stroke="#2F7FC0" stroke-width="1.2"/>`),
  swords: S(`<path d="M4.5 4.5l10 10M19.5 4.5l-10 10"/><path d="M7.5 15.5l-3 3M16.5 15.5l3 3M6 13.5l4.5 4.5M18 13.5L13.5 18"/>`),
  speed: S(`<path d="M3.5 6l7.5 6-7.5 6zM12.5 6l7.5 6-7.5 6z" ${F}/>`),
  play: S(`<path d="M8 5.2v13.6L19 12z" ${F}/>`),
  pause: S(`<rect x="6.2" y="5" width="4.2" height="14" rx="1.3" ${F}/><rect x="13.6" y="5" width="4.2" height="14" rx="1.3" ${F}/>`),
  auto: S(`<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20.2 4v4.8h-4.8"/>`),
  menu: S(`<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/><circle cx="12" cy="12" r="6.6"/>`),
  meteor: S(`<circle cx="15" cy="15" r="4.6" ${F}/><path d="M3 3l8 8M7.5 3l5 5M3 7.5l5 5"/>`),
  hourglass: S(`<path d="M6 3h12M6 21h12"/><path d="M7.5 3.5c0 4.5 9 5 9 8.5s-9 4-9 8.5M16.5 3.5c0 4.5-9 5-9 8.5s9 4 9 8.5"/>`),
  shield: S(`<path d="M12 2.8l7.6 3v5.7c0 4.8-3.3 8.3-7.6 9.7-4.3-1.4-7.6-4.9-7.6-9.7V5.8z"/>`),
  sparkle: S(`<path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2L12 21.5l-2.2-7.3L2.5 12l7.3-2.2z" ${F}/>`),
  target: S(`<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" ${F}/>`),
  lock: S(`<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`),
  book: S(`<path d="M3 5.4c3-1.5 6-1.4 9 .6 3-2 6-2.1 9-.6v13.4c-3-1.5-6-1.4-9 .6-3-2-6-2.1-9-.6z"/><path d="M12 6v13.4"/>`),
  close: S(`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
  flag: S(`<path d="M5.5 21V3.5"/><path d="M5.5 4.5c4-2 7.5 2 13 0v8.5c-5.5 2-9-2-13 0" fill="currentColor" fill-opacity=".22"/>`),
  info: S(`<circle cx="12" cy="12" r="9"/><path d="M12 11v5.6"/><circle cx="12" cy="7.7" r="1.15" ${F}/>`),
  star: S(`<path d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1.1 6L12 17l-5.4 2.8 1.1-6-4.4-4.2 6-.9z" ${F}/>`),
  trophy: S(`<path d="M8 3.8h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 5.8H5a3 3 0 0 0 3 4.2M16 5.8h3a3 3 0 0 1-3 4.2M12 13.3v3.7M8.5 20.5h7M10 17h4"/>`),
  skull: S(`<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.4 3 5.5V20h10v-3.5c1.7-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.3" r="1.7" ${F}/><circle cx="15" cy="11.3" r="1.7" ${F}/>`),
  medal: S(`<path d="M8.3 2.8l3.7 6.6 3.7-6.6"/><circle cx="12" cy="15" r="5.6" ${F}/>`),
  up: S(`<path d="M12 19.5v-15M6 10.5l6-6 6 6"/>`),
  back: S(`<path d="M15 5l-7 7 7 7"/>`),
  next: S(`<path d="M9 5l7 7-7 7"/>`),
  castle: S(`<path d="M4 21V9h3V6h2v3h2V4h2v5h2V6h2v3h3v12z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>`),
  chest: S(`<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13.2h17M5 9c0-3 2.3-5 7-5s7 2 7 5"/><rect x="10.4" y="11.6" width="3.2" height="3.6" rx=".8" ${F}/>`),
  potion: S(`<path d="M9.5 3h5M10.5 3v5.2L6 15.6A4 4 0 0 0 9.6 21h4.8a4 4 0 0 0 3.6-5.4L13.5 8.2V3"/><path d="M7.4 14.2h9.2"/>`),
  scroll: S(`<rect x="5" y="3.5" width="14" height="17" rx="2.2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>`),
  flame: S(`<path d="M12 21.2c-3.9 0-6.6-2.6-6.6-6.1 0-3.6 2.6-5.8 4.3-8.8.4 2.1 1.5 3.4 3 3.9.1-3 1.1-5.5 3-7.7.3 3.5 3 6.1 3 10.7 0 4.5-2.8 8-6.7 8z"/>`),
  coinSmall: '',
};
ICON.coinSmall = ICON.coin.replace('class="ico"', 'class="ico sm"');

/** Drawn icons for the spells and Powers (their data still carries emoji for old saves; the UI never shows those). */
export const SPELL_ICON: Record<string, string> = { meteor: ICON.meteor, freeze: ICON.hourglass, reinforce: ICON.shield };
export const POWER_ICON: Record<string, string> = { chest: ICON.chest, draught: ICON.potion, merc: ICON.scroll, dragonfire: ICON.flame, hourglass: ICON.hourglass };
