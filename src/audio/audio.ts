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
type Opt = { x?: number; vol?: number; at?: number };

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

  // ---------------------------------------------------------------- sound events
  play(name: string, o: Opt = {}) {
    const ctx = this.ctx; if (!ctx || !this.sfxOn) return;
    const t = o.at ?? ctx.currentTime + 0.005;
    const vol = o.vol ?? 1;
    switch (name) {
      case 'pop': { // a soft, percussive pop with a tiny in-key blip
        if (!this.ok('pop', 45, t)) return; const d = this.out(o.x, 0.42 * vol);
        this.noiseHit(t, 0.035, d, 0.4, 'bandpass', 1500 + Math.random() * 900, undefined, 1.4);
        this.osc('sine', hz(pick([deg(20), deg(21), deg(22), deg(23)])), t, 0.05, d, 0.12, 0.002);
        break;
      }
      case 'bigpop': { // a giant breaks: deep thump, crunch, a low in-key note
        if (!this.ok('bigpop', 140, t)) return; const d = this.out(o.x, 0.9 * vol);
        this.osc('sine', hz(deg(5)), t, 0.5, d, 0.7, 0.004, hz(deg(0)));
        this.noiseHit(t, 0.4, d, 0.45, 'lowpass', 2400, 200, 0.7);
        this.pluck(deg(5), t + 0.02, d, 0.35, 1200);
        break;
      }
      case 'bow': { // a tuned bowstring and a little air
        if (!this.ok('bow', 70, t)) return; const d = this.out(o.x, 0.36 * vol);
        this.pluck(pick([deg(5), deg(7), deg(8)]), t, d, 0.45, 1600);
        this.noiseHit(t + 0.01, 0.1, d, 0.18, 'bandpass', 3000, 1000, 1);
        break;
      }
      case 'swing': { if (!this.ok('swing', 80, t)) return; const d = this.out(o.x, 0.38 * vol); this.noiseHit(t, 0.16, d, 0.4, 'bandpass', 700, 2600, 1.2, 0.035); break; }
      case 'fire': { // whoomph
        if (!this.ok('fire', 80, t)) return; const d = this.out(o.x, 0.42 * vol);
        this.noiseHit(t, 0.32, d, 0.45, 'lowpass', 400, 2000, 0.9, 0.03);
        this.osc('sine', hz(deg(3)), t, 0.22, d, 0.22, 0.02, hz(deg(0)));
        break;
      }
      case 'cannon': { // deep boom
        if (!this.ok('cannon', 100, t)) return; const d = this.out(o.x, 0.65 * vol);
        this.osc('sine', hz(deg(5)), t, 0.32, d, 0.85, 0.002, 42);
        this.noiseHit(t, 0.22, d, 0.42, 'lowpass', 1600, 250);
        break;
      }
      case 'boom': { // explosion: sub thump and a rumble
        if (!this.ok('boom', 90, t)) return; const d = this.out(o.x, 0.55 * vol);
        this.osc('sine', hz(deg(2)), t, 0.45, d, 0.8, 0.003, 34);
        this.noiseHit(t, 0.5, d, 0.45, 'lowpass', 1400, 120, 0.6);
        break;
      }
      case 'zap': { // crackle (unpitched)
        if (!this.ok('zap', 90, t)) return; const d = this.out(o.x, 0.32 * vol);
        for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.022, 0.035, d, 0.32, 'highpass', 3500 + Math.random() * 1500, undefined, 0.9);
        this.chime(deg(23), t, 0.08, d, 0.05);
        break;
      }
      case 'ballista': { // heavy thunk
        if (!this.ok('ballista', 100, t)) return; const d = this.out(o.x, 0.55 * vol);
        this.pluck(deg(3), t, d, 0.6, 800);
        this.osc('sine', hz(deg(5)), t, 0.14, d, 0.5, 0.002, 60);
        this.noiseHit(t + 0.02, 0.16, d, 0.14, 'bandpass', 2500, 1200, 1.5);
        break;
      }
      case 'frost': { // icy chimes
        if (!this.ok('frost', 130, t)) return; const d = this.out(o.x, 0.3 * vol);
        [deg(23), deg(25), deg(28)].forEach((m, i) => this.chime(m, t + i * 0.035, 0.45, d, 0.09));
        this.noiseHit(t, 0.3, d, 0.12, 'highpass', 6000, 3500, 0.7, 0.05);
        break;
      }
      case 'potion': { if (!this.ok('potion', 110, t)) return; const d = this.out(o.x, 0.36 * vol); this.chime(deg(17), t, 0.12, d, 0.18); this.chime(deg(19), t + 0.07, 0.16, d, 0.16); this.noiseHit(t + 0.08, 0.15, d, 0.12, 'bandpass', 1400, 500, 1.5); break; }
      case 'whip': { if (!this.ok('whip', 100, t)) return; const d = this.out(o.x, 0.36 * vol); this.noiseHit(t, 0.11, d, 0.4, 'bandpass', 1000, 4500, 1.6, 0.02); break; }
      case 'place': { // wooden thunk + one chime
        const d = this.out(o.x, 0.75);
        this.osc('sine', hz(deg(8)), t, 0.16, d, 0.7, 0.002, hz(deg(3)));
        this.noiseHit(t, 0.06, d, 0.3, 'bandpass', 900, 450, 1.8);
        this.chime(deg(18), t + 0.05, 0.6, d, 0.14);
        break;
      }
      case 'upgrade': { // rising pentatonic sparkle
        const d = this.out(o.x, 0.65);
        [15, 16, 18, 19, 20].forEach((s, i) => this.chime(deg(s), t + i * 0.055, 0.7, d, 0.14));
        break;
      }
      case 'sell': { const d = this.out(o.x, 0.55); [20, 18, 16].forEach((s, i) => this.chime(deg(s), t + i * 0.06, 0.45, d, 0.13)); break; }
      case 'coin': { if (!this.ok('coin', 70, t)) return; const d = this.out(o.x, 0.45); this.chime(deg(23), t, 0.3, d, 0.15); this.chime(deg(25), t + 0.06, 0.4, d, 0.13); break; }
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
