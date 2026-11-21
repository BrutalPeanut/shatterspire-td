// Procedural audio, built so nothing can clash.
//
// Every pitched sound in the game (music, pops, plucks, chimes, horns, even the error beep) is taken from ONE
// five-note scale, D minor pentatonic (D F G A C). A pentatonic scale has no half-steps and no tritone, so any
// notes from it can ring together without sounding sour, however many towers fire at once. Unpitched sounds
// (whooshes, crackles, thumps) are filtered noise or low sine thuds. Bells are harmonic (whole-number overtones),
// never the inharmonic metallic kind. The reverb is short and light so tails don't pile up into mud.
//
// The score is calm between waves (soft pad, bass, harp arpeggio, an occasional flute phrase) and adds tuned taiko
// drums, a shaker and a pulsing bass during combat.
type Opt = { x?: number; vol?: number; at?: number; kind?: string };

/** D minor pentatonic in semitones above D. */
const PENTA = [0, 3, 5, 7, 10];
/** MIDI note of scale degree i, counting from D2 (MIDI 38). Degree 5 = D3, 10 = D4, 15 = D5, 20 = D6. */
const deg = (i: number) => 38 + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// Chords, every tone inside the scale (as scale degrees from D2): Dm, F6, Csus2, Am7(no 5), Gsus4, Dm(add11)
const CHORDS: Record<string, number[]> = {
  Dm: [5, 6, 8, 10], // D3 F3 A3 D4
  F: [6, 8, 9, 11], // F3 A3 C4 F4
  C: [4, 5, 7, 9], // C3 D3 G3 C4
  Am: [8, 9, 12, 13], // A3 C4 G4 A4
  G: [7, 9, 10, 12], // G3 C4 D4 G4
};
const PROG = ['Dm', 'F', 'C', 'Dm', 'Am', 'F', 'G', 'Dm'];
const STEP = 60 / 76 / 2; // eighth notes at 76 bpm
// a short flute phrase every other pass through the progression (scale degrees, -1 = rest)
const MELODY = [15, -1, 17, 18, 17, -1, 15, -1, 13, -1, 15, -1, -1, -1, -1, -1];

export class Audio {
  ctx: BaseAudioContext | null = null;
  sfxOn = true; musicOn = true;
  private sfx!: GainNode; private music!: GainNode; private master!: GainNode;
  private verb!: ConvolverNode;
  private noise!: AudioBuffer;
  private plucks = new Map<number, AudioBuffer>();
  private last: Record<string, number> = {};
  private recent: number[] = [];
  private offline = false;
  private step = 0; private nextT = 0; private timer = 0;
  private intensity = 0; private targetIntensity = 0;
  private drums!: GainNode; private pad!: GainNode;

  /** Pass an OfflineAudioContext to render offline (tests and previews); the music then has to be scheduled by hand. */
  init(offline?: BaseAudioContext) {
    if (this.ctx) { if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    let ctx: BaseAudioContext;
    if (offline) ctx = offline;
    else {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    this.ctx = ctx;
    this.offline = !!offline;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.25;
    // a gentle top-end roll-off: nothing in the game needs fizz above 9 kHz
    const tame = ctx.createBiquadFilter(); tame.type = 'lowpass'; tame.frequency.value = 9000; tame.Q.value = 0.5;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.master.connect(comp); comp.connect(tame); tame.connect(ctx.destination);
    // short, light room
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(1.7, 3.6);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.8; this.verb.connect(verbOut); verbOut.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 0.75 * this.sfxVol : 0; this.sfx.connect(this.master);
    const sfxVerb = ctx.createGain(); sfxVerb.gain.value = 0.1; this.sfx.connect(sfxVerb); sfxVerb.connect(this.verb);
    this.music = ctx.createGain(); this.music.gain.value = this.musicOn ? 0.5 * this.musicVol : 0; this.music.connect(this.master);
    const musVerb = ctx.createGain(); musVerb.gain.value = 0.32; this.music.connect(musVerb); musVerb.connect(this.verb);
    this.drums = ctx.createGain(); this.drums.gain.value = 0; this.drums.connect(this.music);
    this.pad = ctx.createGain(); this.pad.gain.value = 1; this.pad.connect(this.music);
    const n = ctx.sampleRate * 1.5; this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    if (!offline) this.startMusic();
  }

  sfxVol = 1; musicVol = 1;
  setSfx(on: boolean) { this.sfxOn = on; if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.75 * this.sfxVol : 0, this.ctx.currentTime, 0.05); }
  setMusic(on: boolean) { this.musicOn = on; if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.5 * this.musicVol : 0, this.ctx.currentTime, 0.1); }
  /** 0..1 volume sliders (independent of the on/off toggles). */
  setVolumes(sfx: number, music: number) { this.sfxVol = sfx; this.musicVol = music; this.setSfx(this.sfxOn); this.setMusic(this.musicOn); }
  /** 0 = calm (build phase / menus), 1 = combat. */
  setIntensity(v: number) { this.targetIntensity = v; }

  // ---------------------------------------------------------------- building blocks
  private impulse(sec: number, decay: number) {
    const ctx = this.ctx!; const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * 0.3; d[i] = lp * Math.pow(1 - i / len, decay) * (i < 300 ? i / 300 : 1); }
    }
    return b;
  }
  private out(x?: number, vol = 1) {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.gain.value = vol;
    if (x !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.7, Math.min(0.7, (x / 960) * 1.4 - 0.7)); g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, peak: number, a = 0.005, slideTo?: number) {
    const ctx = this.ctx!; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    this.env(g, t, a, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  private noiseHit(t: number, dur: number, dest: AudioNode, peak: number, type: BiquadFilterType, f0: number, f1?: number, q = 0.8, a = 0.003) {
    const ctx = this.ctx!; const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this.env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
  }
  /** A warm harmonic chime (glockenspiel/celesta): a sine with whole-number overtones that fade first. */
  private chime(m: number, t: number, dur: number, dest: AudioNode, peak: number) {
    const f = hz(m);
    this.osc('sine', f, t, dur, dest, peak, 0.003);
    this.osc('sine', f * 2, t, dur * 0.45, dest, peak * 0.28, 0.003);
    this.osc('sine', f * 3, t, dur * 0.2, dest, peak * 0.1, 0.002);
  }
  /** Karplus-Strong plucked string, damped so it doesn't ring into the next chord. */
  private pluckBuf(freq: number) {
    const key = Math.round(freq);
    const cached = this.plucks.get(key); if (cached) return cached;
    const ctx = this.ctx!; const sr = ctx.sampleRate; const len = Math.floor(sr * 1.1);
    const b = ctx.createBuffer(1, len, sr); const d = b.getChannelData(0);
    const p = Math.max(2, Math.round(sr / freq)); const line = new Float32Array(p);
    for (let i = 0; i < p; i++) line[i] = (Math.random() * 2 - 1) * (1 - (i / p) * 0.5);
    let idx = 0;
    for (let i = 0; i < len; i++) { const nx = (idx + 1) % p; const v = (line[idx] + line[nx]) * 0.4965; d[i] = line[idx] * (1 - i / len); line[idx] = v; idx = nx; }
    this.plucks.set(key, b); return b;
  }
  private pluck(m: number, t: number, dest: AudioNode, peak: number, bright = 2400) {
    const ctx = this.ctx!; const s = ctx.createBufferSource(); s.buffer = this.pluckBuf(hz(m));
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright;
    const g = ctx.createGain(); g.gain.value = peak;
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + 1.1);
  }
  /** Rate-limit a sound and cap simultaneous voices, so a big wave stays clear instead of a wall of noise. */
  private ok(key: string, ms: number, t: number, maxVoices = 18) {
    const now = this.offline ? t * 1000 : performance.now(); // offline renders schedule ahead, so they count audio time
    if ((this.last[key] ?? -1e9) + ms > now) return false;
    this.recent = this.recent.filter((x) => now - x < 220);
    if (this.recent.length > maxVoices) return false;
    this.last[key] = now; this.recent.push(now);
    return true;
  }

  // ---------------------------------------------------------------- foley building blocks (real-world sounds, not notes)
  /** A creature's voice: a buzzy source through mouth formants, pitch sliding down like a cry or grunt. */
  private voice(t: number, d: AudioNode, f0: number, f1: number, dur: number, formants: [number, number, number][], peak: number, breath = 0.15, a = 0.012, vib = 0) {
    const ctx = this.ctx!; const j = 0.88 + Math.random() * 0.24;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * j, t); o.frequency.exponentialRampToValueAtTime(Math.max(25, f1 * j), t + dur);
    if (vib) { const v = ctx.createOscillator(); const vg = ctx.createGain(); v.frequency.value = 6 + Math.random() * 3; vg.gain.value = f0 * vib; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + dur + 0.05); }
    const sum = ctx.createGain(); sum.gain.value = 1;
    for (const [f, q, g] of formants) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (0.95 + Math.random() * 0.1); bp.Q.value = q; const gg = ctx.createGain(); gg.gain.value = g; o.connect(bp); bp.connect(gg); gg.connect(sum); }
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(peak, t + a); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sum.connect(env); env.connect(d); o.start(t); o.stop(t + dur + 0.05);
    if (breath) this.noiseHit(t, dur * 0.8, d, peak * breath, 'bandpass', formants[0][0] * 1.6, undefined, 1.2, a);
  }
  /** Random short noise grains: fire crackle, rubble, ice, sparks. */
  private crackle(t: number, d: AudioNode, dur: number, n: number, f: number, peak: number, type: BiquadFilterType = 'bandpass') {
    for (let i = 0; i < n; i++) { const at = t + Math.random() * dur; this.noiseHit(at, 0.008 + Math.random() * 0.025, d, peak * (0.4 + Math.random() * 0.6), type, f * (0.6 + Math.random() * 0.8), undefined, 1.5, 0.001); }
  }
  /** Struck metal: inharmonic partials of a plate/blade (real metal doesn't ring in tune). */
  private metal(t: number, d: AudioNode, f: number, dur: number, peak: number) {
    [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25]].forEach(([m, g]) => this.osc('sine', f * m * (0.97 + Math.random() * 0.06), t, dur / (1 + m * 0.3), d, peak * g, 0.001));
    this.noiseHit(t, 0.02, d, peak * 0.8, 'highpass', 4000, undefined, 0.7, 0.001);
  }
  /** Air moving: a bandpassed noise sweep (arrows, blades, flames, wings). */
  private whoosh(t: number, d: AudioNode, dur: number, f0: number, f1: number, peak: number, q = 1.2) { this.noiseHit(t, dur, d, peak, 'bandpass', f0, f1, q, dur * 0.35); }
  /** Body hitting the ground / heavy impact. */
  private thud(t: number, d: AudioNode, f: number, peak: number, dur = 0.18) {
    this.osc('sine', f, t, dur, d, peak, 0.002, f * 0.45);
    this.noiseHit(t, dur * 0.7, d, peak * 0.5, 'lowpass', 700, 150, 0.7, 0.002);
  }
  private bubbles(t: number, d: AudioNode, n: number, peak: number) {
    for (let i = 0; i < n; i++) { const at = t + Math.random() * 0.25; const f = 300 + Math.random() * 500; this.osc('sine', f, at, 0.04, d, peak, 0.002, f * 2.2); }
  }

  // ---------------------------------------------------------------- deaths, one per creature
  private death(kind: string | undefined, t: number, d: AudioNode) {
    const A: [number, number, number][] = [[700, 6, 1], [1150, 7, 0.7]]; // "ah"
    const U: [number, number, number][] = [[450, 6, 1], [900, 7, 0.5]]; // "uh"
    const E: [number, number, number][] = [[350, 6, 0.8], [2300, 8, 0.8]]; // "ee"
    const O: [number, number, number][] = [[320, 5, 1], [750, 6, 0.6]]; // "oo"
    switch (kind) {
      case 'imp': this.voice(t, d, 1050, 600, 0.13, E, 0.5, 0.1, 0.006); this.noiseHit(t, 0.06, d, 0.25, 'bandpass', 1800, 600, 1); break;
      case 'goblin': this.voice(t, d, 520, 300, 0.2, E, 0.55, 0.15, 0.008); this.thud(t + 0.05, d, 170, 0.12, 0.08); break;
      case 'orc': this.voice(t, d, 170, 95, 0.24, A, 0.75, 0.25); this.thud(t + 0.06, d, 130, 0.22, 0.12); break;
      case 'troll': this.voice(t, d, 120, 65, 0.34, U, 0.8, 0.3); this.thud(t + 0.1, d, 105, 0.3, 0.16); break;
      case 'ogre': this.voice(t, d, 100, 52, 0.45, U, 0.85, 0.3, 0.02); this.thud(t + 0.15, d, 85, 0.4, 0.2); break;
      case 'gloom': this.whoosh(t, d, 0.45, 1200, 250, 0.45, 3); this.voice(t, d, 380, 200, 0.4, O, 0.18, 0.6, 0.05, 0.03); break;
      case 'frostling': this.crackle(t, d, 0.12, 9, 5000, 0.4, 'highpass'); [2600, 3900, 5200].forEach((f, i) => this.metal(t + i * 0.025, d, f, 0.18, 0.05)); break;
      case 'hexling': this.whoosh(t, d, 0.25, 3500, 500, 0.4, 2); this.crackle(t, d, 0.2, 7, 6000, 0.25, 'highpass'); this.voice(t, d, 700, 350, 0.15, E, 0.25, 0.1); break;
      case 'wraith': this.voice(t, d, 520, 230, 0.6, O, 0.35, 0.7, 0.08, 0.04); this.whoosh(t, d, 0.55, 900, 2400, 0.25, 2); break;
      case 'iron': this.metal(t, d, 520, 0.35, 0.3); this.crackle(t + 0.04, d, 0.2, 6, 3000, 0.25); this.thud(t, d, 120, 0.35, 0.12); break;
      case 'hydra': this.noiseHit(t, 0.4, d, 0.4, 'highpass', 3500, 5000, 0.8, 0.03); this.voice(t + 0.05, d, 140, 70, 0.35, U, 0.5, 0.2, 0.02, 0.15); break;
      case 'golem': this.thud(t, d, 80, 0.8, 0.3); this.crackle(t, d, 0.5, 26, 600, 0.45, 'lowpass'); this.crackle(t + 0.05, d, 0.35, 10, 2200, 0.2); break;
      case 'behemoth': this.thud(t, d, 60, 0.9, 0.4); this.crackle(t, d, 0.6, 24, 900, 0.4); this.metal(t + 0.05, d, 300, 0.4, 0.15); this.noiseHit(t, 0.5, d, 0.3, 'lowpass', 900, 100, 0.7); break;
      case 'warbeast': this.voice(t, d, 260, 150, 0.7, A, 0.55, 0.3, 0.05, 0.02); this.thud(t + 0.35, d, 55, 0.95, 0.45); break;
      case 'colossus': this.metal(t, d, 180, 0.8, 0.4); this.metal(t + 0.12, d, 260, 0.6, 0.25); this.thud(t, d, 55, 0.9, 0.5); this.crackle(t, d, 0.6, 18, 2500, 0.3); break;
      case 'golemking': case 'lich': case 'dragon':
        this.voice(t, d, kind === 'lich' ? 160 : 90, 40, 1.4, kind === 'lich' ? O : A, 0.9, 0.5, 0.06, 0.03);
        this.thud(t + 0.4, d, 45, 1, 0.7); this.crackle(t + 0.3, d, 1.0, 40, 700, 0.45, 'lowpass'); this.noiseHit(t, 1.4, d, 0.35, 'lowpass', 1500, 80, 0.6, 0.1); break;
      default: this.noiseHit(t, 0.06, d, 0.4, 'bandpass', 1500, 500, 1.2); this.thud(t, d, 160, 0.15, 0.06);
    }
  }

  // ---------------------------------------------------------------- sound events
  play(name: string, o: Opt = {}) {
    const ctx = this.ctx; if (!ctx || !this.sfxOn) return;
    const t = o.at ?? ctx.currentTime + 0.005;
    const vol = o.vol ?? 1;
    switch (name) {
      case 'pop': { if (!this.ok('pop', 55, t)) return; this.death(o.kind, t, this.out(o.x, 0.42 * vol)); break; }
      case 'bigpop': { if (!this.ok('bigpop', 160, t)) return; this.death(o.kind, t, this.out(o.x, 0.85 * vol)); break; }
      case 'bow': { // bowstring thrum + the arrow cutting air
        if (!this.ok('bow', 70, t)) return; const d = this.out(o.x, 0.4 * vol);
        this.pluck(38 + Math.floor(Math.random() * 4), t, d, 0.55, 500);
        this.noiseHit(t, 0.012, d, 0.35, 'highpass', 3000, undefined, 0.7, 0.001);
        this.whoosh(t + 0.015, d, 0.14, 3200, 900, 0.22, 1.5);
        break;
      }
      case 'thorn': { if (!this.ok('thorn', 80, t)) return; const d = this.out(o.x, 0.35 * vol); this.whoosh(t, d, 0.1, 2500, 1200, 0.3, 2); this.noiseHit(t, 0.015, d, 0.3, 'bandpass', 1800, undefined, 3, 0.001); break; }
      case 'swing': { // a blade through the air, then steel ringing off armour
        if (!this.ok('swing', 90, t)) return; const d = this.out(o.x, 0.42 * vol);
        this.whoosh(t, d, 0.17, 500, 2800, 0.45, 1.3);
        this.metal(t + 0.13, d, 1700 + Math.random() * 400, 0.28, 0.07);
        break;
      }
      case 'fire': { // fireball launch: a roar of flame and crackles
        if (!this.ok('fire', 90, t)) return; const d = this.out(o.x, 0.45 * vol);
        this.noiseHit(t, 0.35, d, 0.5, 'lowpass', 300, 2200, 0.9, 0.04);
        this.crackle(t + 0.03, d, 0.3, 8, 2500, 0.18);
        break;
      }
      case 'comet': { if (!this.ok('comet', 120, t)) return; const d = this.out(o.x, 0.5 * vol); this.whoosh(t, d, 0.45, 2500, 300, 0.4, 0.9); this.crackle(t + 0.1, d, 0.35, 10, 2000, 0.2); this.thud(t + 0.42, d, 70, 0.6, 0.25); break; }
      case 'cannon': { // gunpowder crack, the boom, and the echo
        if (!this.ok('cannon', 110, t)) return; const d = this.out(o.x, 0.7 * vol);
        this.noiseHit(t, 0.03, d, 0.7, 'highpass', 1500, undefined, 0.7, 0.001);
        this.osc('sine', 85, t, 0.35, d, 0.95, 0.002, 34);
        this.noiseHit(t, 0.55, d, 0.5, 'lowpass', 1200, 90, 0.6, 0.004);
        break;
      }
      case 'boom': { // explosion on the road: blast, rumble, falling debris
        if (!this.ok('boom', 100, t)) return; const d = this.out(o.x, 0.6 * vol);
        this.osc('sine', 70, t, 0.5, d, 0.9, 0.003, 28);
        this.noiseHit(t, 0.6, d, 0.55, 'lowpass', 2000, 100, 0.6, 0.003);
        this.crackle(t + 0.08, d, 0.45, 10, 1500, 0.18);
        break;
      }
      case 'zap': { // lightning: electric crackle and a short thunder crack
        if (!this.ok('zap', 90, t)) return; const d = this.out(o.x, 0.38 * vol);
        this.crackle(t, d, 0.12, 14, 5000, 0.45, 'highpass');
        const ctx2 = this.ctx!; const b = ctx2.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 55 + Math.random() * 20; const bf = ctx2.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2400; bf.Q.value = 0.8; const bg = ctx2.createGain(); this.env(bg, t, 0.002, 0.25, 0.12); b.connect(bf); bf.connect(bg); bg.connect(d); b.start(t); b.stop(t + 0.16);
        this.noiseHit(t + 0.03, 0.3, d, 0.3, 'lowpass', 1500, 120, 0.6, 0.002);
        break;
      }
      case 'ballista': { // wooden arms snapping forward, the bolt whooshing out
        if (!this.ok('ballista', 110, t)) return; const d = this.out(o.x, 0.6 * vol);
        this.noiseHit(t, 0.05, d, 0.6, 'bandpass', 700, 300, 2.5, 0.001);
        this.thud(t, d, 90, 0.5, 0.12);
        this.pluck(26, t + 0.005, d, 0.45, 350);
        this.whoosh(t + 0.02, d, 0.2, 1800, 500, 0.3, 1.2);
        break;
      }
      case 'frost': { // icy blast: cold wind, ice crackling, shards
        if (!this.ok('frost', 130, t)) return; const d = this.out(o.x, 0.35 * vol);
        this.whoosh(t, d, 0.35, 5000, 2000, 0.25, 0.8);
        this.crackle(t + 0.04, d, 0.25, 12, 6000, 0.35, 'highpass');
        this.metal(t + 0.1, d, 3100 + Math.random() * 800, 0.15, 0.04);
        break;
      }
      case 'potion': { // a glass flask: thrown, smashes, fizzes
        if (!this.ok('potion', 110, t)) return; const d = this.out(o.x, 0.4 * vol);
        this.whoosh(t, d, 0.12, 1500, 700, 0.15, 1.5);
        this.metal(t + 0.12, d, 2300 + Math.random() * 500, 0.1, 0.12);
        this.crackle(t + 0.12, d, 0.08, 8, 4500, 0.3, 'highpass');
        this.bubbles(t + 0.16, d, 5, 0.06);
        this.noiseHit(t + 0.15, 0.35, d, 0.08, 'highpass', 6000, undefined, 0.7, 0.03);
        break;
      }
      case 'whip': { if (!this.ok('whip', 100, t)) return; const d = this.out(o.x, 0.4 * vol); this.whoosh(t, d, 0.1, 600, 3500, 0.35, 1.5); this.noiseHit(t + 0.09, 0.02, d, 0.6, 'highpass', 2500, undefined, 0.7, 0.001); break; }
      case 'place': { // stonework set down on the ground
        const d = this.out(o.x, 0.75);
        this.thud(t, d, 110, 0.75, 0.16);
        this.crackle(t + 0.01, d, 0.18, 10, 1100, 0.25);
        this.noiseHit(t, 0.03, d, 0.3, 'bandpass', 1200, undefined, 2, 0.001);
        break;
      }
      case 'upgrade': { // hammer on the anvil, twice, then a magic shimmer
        const d = this.out(o.x, 0.6);
        this.metal(t, d, 820, 0.45, 0.18); this.metal(t + 0.16, d, 860, 0.5, 0.2);
        [18, 20, 23].forEach((s, i) => this.chime(deg(s), t + 0.3 + i * 0.05, 0.5, d, 0.07));
        break;
      }
      case 'sell': { const d = this.out(o.x, 0.55); for (let i = 0; i < 6; i++) this.metal(t + i * 0.04 + Math.random() * 0.02, d, 3000 + Math.random() * 1500, 0.15, 0.06); this.thud(t, d, 150, 0.2, 0.08); break; }
      case 'coin': { if (!this.ok('coin', 70, t)) return; const d = this.out(o.x, 0.45); this.metal(t, d, 3600, 0.22, 0.09); this.metal(t + 0.05, d, 4300, 0.25, 0.07); break; }
      case 'leak': { // a low, sombre hit (D and A together: grim, not sour)
        if (!this.ok('leak', 240, t)) return; const d = this.out(undefined, 0.75);
        this.osc('sine', hz(deg(0)), t, 0.6, d, 0.7, 0.01);
        this.osc('triangle', hz(deg(3)), t, 0.45, d, 0.18, 0.02);
        this.noiseHit(t, 0.25, d, 0.2, 'lowpass', 500, 120, 0.7);
        break;
      }
      case 'wave': this.horn(t, 0.75, false); this.drum(t + 0.05, 0.85); this.drum(t + 0.4, 0.65); break;
      case 'boss': this.horn(t, 0.95, true); for (let i = 0; i < 4; i++) this.drum(t + i * 0.3, 1 - i * 0.12); break;
      case 'ability': { // magic whoosh + chimes
        const d = this.out(o.x, 0.75);
        this.noiseHit(t, 0.5, d, 0.32, 'bandpass', 400, 3500, 1.1, 0.12);
        [18, 20, 23].forEach((s, i) => this.chime(deg(s), t + 0.12 + i * 0.05, 0.8, d, 0.11));
        break;
      }
      case 'level': { const d = this.out(undefined, 0.75); [15, 17, 18, 20].forEach((s, i) => { this.chime(deg(s), t + i * 0.08, 0.9, d, 0.14); this.pluck(deg(s - 5), t + i * 0.08, d, 0.22); }); break; }
      case 'win': { // bright F major (inside the scale) with a rising run
        const d = this.out(undefined, 0.85);
        this.pad3(t, [deg(6), deg(8), deg(9), deg(11)], 2.6, d, 0.07);
        [15, 16, 17, 18, 19, 20, 21].forEach((s, i) => this.chime(deg(s), t + 0.15 + i * 0.1, 1.0, d, 0.12));
        this.drum(t, 1); this.drum(t + 0.75, 0.8);
        break;
      }
      case 'lose': { const d = this.out(undefined, 0.85); this.pad3(t, [deg(5), deg(6), deg(8)], 3, d, 0.08); this.osc('sine', hz(deg(0)) / 2, t, 2.2, d, 0.4, 0.05); break; }
      case 'click': { if (!this.ok('click', 40, t)) return; const d = this.out(undefined, 0.4); this.noiseHit(t, 0.012, d, 0.25, 'highpass', 5000, undefined, 0.7); this.osc('sine', hz(deg(20)), t, 0.035, d, 0.1, 0.001); break; }
      case 'error': { // a soft descending "nope": G then D, never overlapping
        const d = this.out(undefined, 0.45);
        this.osc('triangle', hz(deg(12)), t, 0.08, d, 0.22, 0.004);
        this.osc('triangle', hz(deg(10)), t + 0.1, 0.12, d, 0.2, 0.004);
        break;
      }
    }
  }

  /** A clean brass call: unison saws plus the fifth above (a power chord can't clash), through a swelling filter. */
  private horn(t: number, vol: number, deep: boolean) {
    const ctx = this.ctx!; const d = this.out(undefined, vol);
    const root = hz(deep ? deg(0) : deg(5));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(deep ? 900 : 1400, t + 0.35); lp.frequency.linearRampToValueAtTime(500, t + 1.4);
    lp.connect(d);
    for (const [mult, gain, det] of [[1, 0.1, -3], [1, 0.1, 3], [1.5, 0.07, 0], [2, 0.04, 0]] as const) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(root * mult * 0.97, t); o.frequency.linearRampToValueAtTime(root * mult, t + 0.08); o.detune.value = det;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.14); g.gain.setValueAtTime(gain, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + 1.5);
    }
  }
  /** Taiko-style drum tuned to D, so even the drums sit in the key. */
  private drum(t: number, vol: number, dest?: AudioNode) {
    const d = dest ?? this.out(undefined, vol);
    const k = dest ? vol : 1;
    this.osc('sine', hz(deg(3)), t, 0.42, d, 0.85 * k, 0.002, hz(deg(0)) * 0.6);
    this.noiseHit(t, 0.07, d, 0.2 * k, 'lowpass', 1000, 250);
  }
  /** Soft chord (triangles, gently filtered) for the win/lose stingers. */
  private pad3(t: number, notes: number[], dur: number, dest: AudioNode, peak: number) {
    const ctx = this.ctx!;
    for (const m of notes) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(m);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  // ---------------------------------------------------------------- adaptive score
  private startMusic() {
    const ctx = this.ctx!;
    this.nextT = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => {
      if (!this.ctx) return;
      this.intensity += (this.targetIntensity - this.intensity) * 0.08;
      this.drums.gain.setTargetAtTime(this.intensity * 0.85, this.ctx.currentTime, 0.4);
      while (this.nextT < this.ctx.currentTime + 0.5) { this.musicStep(this.step, this.nextT); this.step++; this.nextT += STEP; }
    }, 100);
  }
  /** Offline preview: schedule the score from 0 to `sec`, switching the combat layer on at `combatAt`. */
  scheduleMusic(sec: number, combatAt = Infinity) {
    for (let s = 0, t = 0.05; t < sec; s++, t += STEP) this.musicStep(s, t);
    if (combatAt < sec) this.drums.gain.setTargetAtTime(0.85, combatAt, 0.4);
  }
  private musicStep(step: number, t: number) {
    const ctx = this.ctx!;
    const bar = Math.floor(step / 8) % PROG.length, beat = step % 8, pass = Math.floor(step / (8 * PROG.length));
    const ch = CHORDS[PROG[bar]];
    const barLen = STEP * 8;
    if (beat === 0) {
      // soft pad: triangle + a quiet sine an octave up, slow swell, released before the next chord arrives
      for (const s of ch.slice(0, 3)) for (const [type, mult, gain] of [['triangle', 1, 0.03], ['sine', 2, 0.012]] as const) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(deg(s)) * mult; o.detune.value = (Math.random() - 0.5) * 6;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.9); g.gain.setValueAtTime(gain, t + barLen - 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + barLen + 0.05);
        o.connect(lp); lp.connect(g); g.connect(this.pad); o.start(t); o.stop(t + barLen + 0.1);
      }
      // bass: the chord root, low and round
      const bo = ctx.createOscillator(); bo.type = 'sine'; bo.frequency.value = hz(deg(ch[0] - 5));
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.14, t + 0.06); bg.gain.exponentialRampToValueAtTime(0.0001, t + barLen - 0.1);
      bo.connect(bg); bg.connect(this.pad); bo.start(t); bo.stop(t + barLen);
    }
    // harp arpeggio from the chord's own tones
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    if (beat !== 7) this.pluck(deg(ch[pattern[beat]] + 5), t, this.pad, beat === 0 ? 0.15 : 0.11, 2200);
    // a flute phrase on odd passes
    if (pass % 2 === 1) { const m = MELODY[(step % 16)]; if (m >= 0 && bar % 2 === 0) this.flute(deg(m), t, STEP * 1.8); }
    // combat layer: tuned taiko, a shaker, a pulsing bass on the root
    if (beat === 0 || beat === 3 || beat === 6) this.drum(t, beat === 0 ? 0.55 : 0.32, this.drums);
    if (beat % 2 === 1) this.noiseHit(t, 0.04, this.drums, 0.04, 'bandpass', 7000, undefined, 0.9);
    if (beat % 2 === 0) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(deg(ch[0] - 5)); const g = ctx.createGain(); this.env(g, t, 0.005, 0.07, 0.22); o.connect(g); g.connect(this.drums); o.start(t); o.stop(t + 0.3); }
  }
  /** A breathy flute: sine with a little vibrato and air. */
  private flute(m: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m);
    const vib = ctx.createOscillator(); const vg = ctx.createGain(); vib.frequency.value = 5; vg.gain.value = hz(m) * 0.004; vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.08); g.gain.setValueAtTime(0.045, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.pad); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    this.noiseHit(t, dur * 0.6, this.pad, 0.006, 'bandpass', hz(m) * 2, undefined, 4, 0.05);
  }
}

export const audio = new Audio();
