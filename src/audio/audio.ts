// Modern procedural audio: reverb + compression bus, stereo panning, layered
// synthesis (Karplus-Strong plucks, FM bells, sub thumps, filtered noise) and an
// adaptive fantasy score (calm between waves, drums during combat).
type Opt = { x?: number; vol?: number };

export class Audio {
  ctx: AudioContext | null = null;
  sfxOn = true; musicOn = true;
  private sfx!: GainNode; private music!: GainNode; private master!: GainNode;
  private verb!: ConvolverNode; private sfxVerb!: GainNode; private musVerb!: GainNode;
  private noise!: AudioBuffer;
  private plucks = new Map<number, AudioBuffer>();
  private last: Record<string, number> = {};
  private voices = 0;
  private step = 0; private nextT = 0; private timer = 0;
  private intensity = 0; private targetIntensity = 0;
  private drums!: GainNode; private pad!: GainNode;

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(comp); comp.connect(ctx.destination);
    // reverb
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.6, 2.8);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.9; this.verb.connect(verbOut); verbOut.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 0.75 * this.sfxVol : 0; this.sfx.connect(this.master);
    this.sfxVerb = ctx.createGain(); this.sfxVerb.gain.value = 0.22; this.sfx.connect(this.sfxVerb); this.sfxVerb.connect(this.verb);
    this.music = ctx.createGain(); this.music.gain.value = this.musicOn ? 0.42 * this.musicVol : 0; this.music.connect(this.master);
    this.musVerb = ctx.createGain(); this.musVerb.gain.value = 0.55; this.music.connect(this.musVerb); this.musVerb.connect(this.verb);
    this.drums = ctx.createGain(); this.drums.gain.value = 0; this.drums.connect(this.music);
    this.pad = ctx.createGain(); this.pad.gain.value = 1; this.pad.connect(this.music);
    // noise buffer
    const n = ctx.sampleRate * 1.5; this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  sfxVol = 1; musicVol = 1;
  setSfx(on: boolean) { this.sfxOn = on; if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.75 * this.sfxVol : 0, this.ctx.currentTime, 0.05); }
  setMusic(on: boolean) { this.musicOn = on; if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.42 * this.musicVol : 0, this.ctx.currentTime, 0.1); }
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
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * 0.35; d[i] = lp * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1); }
    }
    return b;
  }
  private out(x?: number, vol = 1) {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.gain.value = vol;
    if (x !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, (x / 960) * 1.6 - 0.8)); g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, peak: number, a = 0.005, slideTo?: number, detune = 0) {
    const ctx = this.ctx!; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    this.env(g, t, a, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  private noiseHit(t: number, dur: number, dest: AudioNode, peak: number, type: BiquadFilterType, f0: number, f1?: number, q = 0.8, a = 0.003) {
    const ctx = this.ctx!; const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this.env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
  }
  /** FM bell: bright metallic chime (coins, upgrades, sparkles). */
  private bell(f: number, t: number, dur: number, dest: AudioNode, peak: number, ratio = 3.5, index = 2.2) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
    this.env(g, t, 0.003, peak, dur);
    car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
  }
  /** Karplus-Strong plucked string (harp, bowstring twang). */
  private pluckBuf(freq: number) {
    const key = Math.round(freq);
    const cached = this.plucks.get(key); if (cached) return cached;
    const ctx = this.ctx!; const sr = ctx.sampleRate; const len = Math.floor(sr * 1.8);
    const b = ctx.createBuffer(1, len, sr); const d = b.getChannelData(0);
    const p = Math.max(2, Math.round(sr / freq)); const line = new Float32Array(p);
    for (let i = 0; i < p; i++) line[i] = (Math.random() * 2 - 1) * (1 - i / p * 0.5);
    let idx = 0;
    for (let i = 0; i < len; i++) { const nx = (idx + 1) % p; const v = (line[idx] + line[nx]) * 0.4975; d[i] = line[idx]; line[idx] = v; idx = nx; }
    this.plucks.set(key, b); return b;
  }
  private pluck(freq: number, t: number, dest: AudioNode, peak: number, bright = 3000) {
    const ctx = this.ctx!; const s = ctx.createBufferSource(); s.buffer = this.pluckBuf(freq);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright;
    const g = ctx.createGain(); g.gain.value = peak;
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + 1.8);
  }
  private ok(key: string, ms: number, maxVoices = 26) {
    const now = performance.now();
    if ((this.last[key] ?? 0) + ms > now || this.voices > maxVoices) return false;
    this.last[key] = now; this.voices++; setTimeout(() => this.voices--, 250);
    return true;
  }
  private jit(f: number, amt = 0.06) { return f * (1 + (Math.random() - 0.5) * amt * 2); }

  // ---------------------------------------------------------------- sound events
  play(name: string, o: Opt = {}) {
    const ctx = this.ctx; if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime + 0.005;
    const vol = o.vol ?? 1;
    switch (name) {
      case 'pop': { // soft bubbly "pop" with body
        if (!this.ok('pop', 28)) return; const d = this.out(o.x, 0.55 * vol);
        this.osc('sine', this.jit(700), t, 0.07, d, 0.5, 0.002, this.jit(240));
        this.noiseHit(t, 0.03, d, 0.25, 'highpass', 2500);
        break;
      }
      case 'bigpop': { // giant shatter: crack + sub + debris
        if (!this.ok('bigpop', 120)) return; const d = this.out(o.x, vol);
        this.osc('sine', 90, t, 0.6, d, 0.9, 0.004, 35);
        this.noiseHit(t, 0.5, d, 0.6, 'lowpass', 3000, 200, 0.7);
        for (let i = 0; i < 5; i++) this.noiseHit(t + 0.05 + i * 0.05 + Math.random() * 0.03, 0.06, d, 0.25, 'bandpass', this.jit(1800, 0.3), undefined, 3);
        break;
      }
      case 'bow': { // string twang + whoosh
        if (!this.ok('bow', 55)) return; const d = this.out(o.x, 0.45 * vol);
        this.pluck(this.jit(196, 0.04), t, d, 0.5, 1800);
        this.noiseHit(t + 0.01, 0.12, d, 0.3, 'bandpass', 3500, 900, 1.2);
        break;
      }
      case 'swing': { if (!this.ok('swing', 70)) return; const d = this.out(o.x, 0.45 * vol); this.noiseHit(t, 0.18, d, 0.45, 'bandpass', 600, 3200, 1.5, 0.04); break; }
      case 'fire': { // whoomph
        if (!this.ok('fire', 70)) return; const d = this.out(o.x, 0.5 * vol);
        this.noiseHit(t, 0.35, d, 0.5, 'lowpass', 400, 2400, 1, 0.03);
        this.osc('sine', 110, t, 0.25, d, 0.3, 0.02, 70);
        break;
      }
      case 'cannon': { // deep boom with mechanical punch
        if (!this.ok('cannon', 90)) return; const d = this.out(o.x, 0.75 * vol);
        this.osc('sine', 120, t, 0.35, d, 0.9, 0.002, 40);
        this.noiseHit(t, 0.25, d, 0.5, 'lowpass', 2000, 300);
        break;
      }
      case 'boom': { // explosion: sub thump + debris tail into reverb
        if (!this.ok('boom', 75)) return; const d = this.out(o.x, 0.65 * vol);
        this.osc('sine', 80, t, 0.5, d, 0.85, 0.003, 30);
        this.noiseHit(t, 0.6, d, 0.55, 'lowpass', 1800, 120, 0.6);
        this.noiseHit(t + 0.08, 0.35, d, 0.15, 'bandpass', 3000, 1200, 2);
        break;
      }
      case 'zap': { // lightning crackle
        if (!this.ok('zap', 80)) return; const d = this.out(o.x, 0.4 * vol);
        for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.025, 0.04, d, 0.35, 'highpass', this.jit(4000, 0.3), undefined, 1.5);
        this.osc('sawtooth', this.jit(1200), t, 0.12, d, 0.08, 0.002, 300);
        break;
      }
      case 'ballista': { // heavy thunk + whistle
        if (!this.ok('ballista', 90)) return; const d = this.out(o.x, 0.6 * vol);
        this.pluck(98, t, d, 0.7, 900);
        this.osc('sine', 160, t, 0.15, d, 0.6, 0.002, 60);
        this.noiseHit(t + 0.02, 0.2, d, 0.2, 'bandpass', 5000, 2000, 4);
        break;
      }
      case 'frost': { // icy shimmer
        if (!this.ok('frost', 120)) return; const d = this.out(o.x, 0.35 * vol);
        for (let i = 0; i < 3; i++) this.bell(this.jit([1568, 2093, 2637][i], 0.02), t + i * 0.03, 0.5, d, 0.12, 1.41, 1.2);
        this.noiseHit(t, 0.35, d, 0.18, 'highpass', 6000, 3000, 0.7, 0.05);
        break;
      }
      case 'potion': { if (!this.ok('potion', 100)) return; const d = this.out(o.x, 0.4 * vol); this.osc('sine', this.jit(500), t, 0.12, d, 0.4, 0.002, 1100); this.noiseHit(t + 0.1, 0.2, d, 0.2, 'bandpass', 1500, 400, 2); break; }
      case 'whip': { if (!this.ok('whip', 90)) return; const d = this.out(o.x, 0.4 * vol); this.noiseHit(t, 0.12, d, 0.45, 'bandpass', 900, 5000, 2, 0.02); break; }
      case 'place': { // wooden thunk + chime
        const d = this.out(o.x, 0.8);
        this.osc('sine', 140, t, 0.18, d, 0.8, 0.002, 70);
        this.noiseHit(t, 0.08, d, 0.4, 'bandpass', 900, 400, 2);
        this.bell(1046, t + 0.06, 0.6, d, 0.12);
        break;
      }
      case 'upgrade': { // rising sparkle arpeggio
        const d = this.out(o.x, 0.7);
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.bell(f, t + i * 0.055, 0.8, d, 0.16, 2, 1.6));
        this.noiseHit(t, 0.4, d, 0.1, 'highpass', 7000, undefined, 0.7, 0.1);
        break;
      }
      case 'sell': { const d = this.out(o.x, 0.6); [1318, 1046, 1568].forEach((f, i) => this.bell(f, t + i * 0.06, 0.5, d, 0.14)); break; }
      case 'coin': { if (!this.ok('coin', 60)) return; const d = this.out(o.x, 0.5); this.bell(1975, t, 0.35, d, 0.18, 2.4, 1.2); this.bell(2637, t + 0.06, 0.5, d, 0.16, 2.4, 1.2); break; }
      case 'leak': { // ominous low hit
        if (!this.ok('leak', 220)) return; const d = this.out(undefined, 0.8);
        this.osc('sine', 70, t, 0.6, d, 0.8, 0.01, 45);
        this.osc('sawtooth', 110, t, 0.5, d, 0.12, 0.02, 80, 7);
        break;
      }
      case 'wave': this.horn(t, 0.8, false); this.drum(t + 0.05, 0.9); this.drum(t + 0.35, 0.7); break;
      case 'boss': this.horn(t, 1, true); for (let i = 0; i < 4; i++) this.drum(t + i * 0.28, 1 - i * 0.12); break;
      case 'ability': { // magic whoosh + shimmer
        const d = this.out(o.x, 0.8);
        this.noiseHit(t, 0.6, d, 0.4, 'bandpass', 300, 4000, 1.2, 0.15);
        [784, 1175, 1568].forEach((f, i) => this.bell(f, t + 0.15 + i * 0.05, 0.9, d, 0.12, 1.5, 2));
        break;
      }
      case 'level': { const d = this.out(undefined, 0.8); [523, 659, 784, 1046].forEach((f, i) => { this.bell(f, t + i * 0.08, 1.0, d, 0.16, 2, 1.4); this.pluck(f / 2, t + i * 0.08, d, 0.25); }); break; }
      case 'win': { const d = this.out(undefined, 0.9); this.chord(t, [262, 330, 392, 523], 2.5, d, 0.1); [523, 659, 784, 1046, 1318].forEach((f, i) => this.bell(f, t + 0.2 + i * 0.12, 1.2, d, 0.14)); this.drum(t, 1); break; }
      case 'lose': { const d = this.out(undefined, 0.9); this.chord(t, [147, 175, 220], 2.8, d, 0.12); this.osc('sine', 55, t, 2, d, 0.5, 0.05); break; }
      case 'click': { if (!this.ok('click', 40)) return; const d = this.out(undefined, 0.5); this.noiseHit(t, 0.025, d, 0.35, 'bandpass', 2500, undefined, 3); this.osc('sine', 900, t, 0.04, d, 0.15, 0.001, 600); break; }
      case 'error': { const d = this.out(undefined, 0.5); this.osc('triangle', 220, t, 0.12, d, 0.25, 0.005, 180); this.osc('triangle', 208, t + 0.09, 0.14, d, 0.2, 0.005, 160); break; }
    }
  }

  private horn(t: number, vol: number, deep: boolean) {
    const ctx = this.ctx!; const d = this.out(undefined, vol);
    const f = deep ? 73 : 110;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1600, t + 0.3); lp.frequency.linearRampToValueAtTime(700, t + 1.4);
    lp.connect(d);
    for (const det of [-8, 0, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.linearRampToValueAtTime(f, t + 0.12); o.detune.value = det;
      const vib = ctx.createOscillator(); const vg = ctx.createGain(); vib.frequency.value = 5; vg.gain.value = 2; vib.connect(vg); vg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.12); g.gain.setValueAtTime(0.12, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(g); g.connect(lp); o.start(t); vib.start(t); o.stop(t + 1.6); vib.stop(t + 1.6);
    }
  }
  private drum(t: number, vol: number, dest?: AudioNode) { // taiko-like
    const d = dest ?? this.out(undefined, vol);
    this.osc('sine', 95, t, 0.45, d, 0.9 * (dest ? vol : 1), 0.002, 48);
    this.noiseHit(t, 0.08, d, 0.25 * (dest ? vol : 1), 'lowpass', 1200, 300);
  }
  private chord(t: number, fs: number[], dur: number, dest: AudioNode, peak: number) {
    for (const f of fs) for (const det of [-6, 6]) {
      const ctx = this.ctx!; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak / 2, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
      this.drums.gain.setTargetAtTime(this.intensity * 0.9, this.ctx.currentTime, 0.4);
      while (this.nextT < this.ctx.currentTime + 0.5) { this.musicStep(this.step, this.nextT); this.step++; this.nextT += 60 / 92 / 2; }
    }, 100);
  }
  private musicStep(step: number, t: number) {
    const ctx = this.ctx!;
    const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    // D minor: i - VI - III - VII  (Dm, Bb, F, C) then iv - i - VI - V (Gm, Dm, Bb, A)
    const prog = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60], [55, 58, 62, 67], [50, 53, 57, 62], [46, 50, 53, 58], [45, 49, 52, 57]];
    const bar = Math.floor(step / 8) % prog.length, beat = step % 8;
    const ch = prog[bar];
    if (beat === 0) {
      // warm pad: detuned saws through a slow lowpass
      for (const n of ch.slice(0, 3)) for (const det of [-9, 9]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(900, t + 1.5); lp.frequency.linearRampToValueAtTime(500, t + 2.6);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.8); g.gain.setValueAtTime(0.022, t + 2.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.9);
        o.connect(lp); lp.connect(g); g.connect(this.pad); o.start(t); o.stop(t + 3);
      }
      // bass
      const bo = ctx.createOscillator(); bo.type = 'triangle'; bo.frequency.value = midi(ch[0] - 12);
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.12, t + 0.05); bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      bo.connect(bg); bg.connect(this.pad); bo.start(t); bo.stop(t + 2.5);
    }
    // harp arpeggio (Karplus-Strong)
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    if (beat !== 7 || bar % 2) this.pluck(midi(ch[pattern[beat]] + 12), t, this.pad, 0.16 + (beat === 0 ? 0.05 : 0), 2600);
    if (bar % 4 === 3 && beat === 6) this.pluck(midi(ch[3] + 24), t, this.pad, 0.08, 3500);
    // combat layer: taiko + low pulse
    if (beat === 0 || beat === 3 || beat === 6) this.drum(t, beat === 0 ? 0.55 : 0.32, this.drums);
    if (beat % 2 === 1) this.noiseHit(t, 0.05, this.drums, 0.05, 'highpass', 7000);
    if (beat % 2 === 0) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(ch[0] - 12); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const g = ctx.createGain(); this.env(g, t, 0.005, 0.05, 0.25); o.connect(lp); lp.connect(g); g.connect(this.drums); o.start(t); o.stop(t + 0.3); }
  }
}

export const audio = new Audio();
