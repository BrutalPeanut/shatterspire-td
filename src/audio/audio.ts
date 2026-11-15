// Procedural WebAudio SFX + a simple looping fantasy tune. No asset files.
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode; music!: GainNode;
  sfxOn = true; musicOn = true;
  private last: Record<string, number> = {};
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer = 0; private step = 0; private nextT = 0;

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 0.5 : 0; this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.gain.value = this.musicOn ? 0.16 : 0; this.music.connect(this.master);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setSfx(on: boolean) { this.sfxOn = on; if (this.ctx) this.sfx.gain.value = on ? 0.5 : 0; }
  setMusic(on: boolean) { this.musicOn = on; if (this.ctx) this.music.gain.value = on ? 0.16 : 0; }

  private throttle(key: string, ms: number) {
    const now = performance.now();
    if ((this.last[key] ?? 0) + ms > now) return false;
    this.last[key] = now; return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, dest?: AudioNode, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest ?? this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur);
  }

  play(name: string) {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'pop': if (this.throttle('pop', 35)) this.tone(500 + Math.random() * 500, 0.06, 'triangle', 0.18, 0.4); break;
      case 'bigpop': this.noise(0.5, 0.5, 600); this.tone(120, 0.5, 'sawtooth', 0.2, 0.3); break;
      case 'shoot': if (this.throttle('shoot', 60)) this.noise(0.05, 0.08, 3000, 2); break;
      case 'boom': if (this.throttle('boom', 70)) { this.noise(0.25, 0.25, 500); this.tone(90, 0.2, 'sine', 0.25, 0.5); } break;
      case 'zap': if (this.throttle('zap', 80)) this.tone(1200, 0.08, 'square', 0.06, 0.3); break;
      case 'place': this.tone(220, 0.12, 'triangle', 0.3, 0.6); this.noise(0.08, 0.15, 900); break;
      case 'upgrade': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.18, 1, undefined, i * 0.06)); break;
      case 'sell': [784, 523].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.18, 1, undefined, i * 0.07)); break;
      case 'coin': this.tone(988, 0.07, 'square', 0.08); this.tone(1319, 0.12, 'square', 0.08, 1, undefined, 0.06); break;
      case 'leak': if (this.throttle('leak', 200)) this.tone(160, 0.3, 'sawtooth', 0.2, 0.5); break;
      case 'wave': [392, 523, 659].forEach((f, i) => this.tone(f, 0.25, 'sawtooth', 0.12, 1, undefined, i * 0.12)); break;
      case 'boss': this.tone(80, 1.2, 'sawtooth', 0.35, 0.5); this.noise(1, 0.3, 300); break;
      case 'ability': this.tone(330, 0.4, 'sine', 0.3, 3); this.noise(0.4, 0.2, 2000); break;
      case 'level': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.15, 'square', 0.1, 1, undefined, i * 0.07)); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, 1, undefined, i * 0.15)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.15, 1, undefined, i * 0.25)); break;
      case 'click': this.tone(700, 0.04, 'triangle', 0.12); break;
      case 'error': this.tone(140, 0.15, 'square', 0.12); break;
    }
  }

  // --- music: D dorian, pad + plucked arpeggio, 8-bar loop
  private startMusic() {
    if (!this.ctx) return;
    this.nextT = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.ctx) return;
      while (this.nextT < this.ctx.currentTime + 0.4) { this.scheduleStep(this.step, this.nextT); this.step++; this.nextT += 0.22; }
    };
    this.musicTimer = window.setInterval(tick, 100);
  }
  private scheduleStep(step: number, t: number) {
    const chords = [[62, 65, 69], [60, 64, 67], [58, 62, 65], [60, 64, 69], [62, 65, 69], [65, 69, 72], [67, 70, 74], [64, 67, 72]];
    const bar = Math.floor(step / 8) % chords.length;
    const ch = chords[bar];
    const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const when = t - this.ctx!.currentTime;
    if (step % 8 === 0) for (const n of ch) this.tone(midi(n - 12), 1.8, 'triangle', 0.05, 1, this.music, when);
    const arp = [0, 1, 2, 1, 2, 0, 1, 2][step % 8];
    if (step % 2 === 0 || step % 8 === 5) this.tone(midi(ch[arp] + 12), 0.18, 'square', 0.025, 1, this.music, when);
    if (step % 8 === 0) this.tone(midi(ch[0] - 24), 0.5, 'sine', 0.12, 1, this.music, when);
    if (step % 4 === 2) this.tone(midi(ch[0] - 24), 0.2, 'sine', 0.06, 1, this.music, when);
  }
}

export const audio = new Audio();
