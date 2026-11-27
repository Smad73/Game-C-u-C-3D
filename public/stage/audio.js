// Âm thanh tổng hợp bằng WebAudio (KHÔNG dùng tệp âm thanh có bản quyền — mọi âm do mã sinh ra).
// Kênh: nhạc nền, môi trường (nước/chim/dế/mưa), hiệu ứng. Âm lượng từng kênh do Control đặt (config.volumes).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.35, sfx: 0.8, ambient: 0.5 };
    this.mood = 'calm'; // calm | boss | night
    this.weather = 'clear';
    this.lastSfx = new Map();
    this.reelOn = false;
  }

  get state() { return this.ctx?.state ?? 'chưa khởi tạo'; }

  init() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    const ctx = new C();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(this.comp).connect(ctx.destination);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.applyVolumes(this.vol);
    this.noise = this.#noiseBuffer(2);
    this.#ambience();
    this.#musicLoop();
    return ctx;
  }

  async resume() { this.init(); try { await this.ctx?.resume(); } catch { /* bị chặn tự phát */ } return this.state; }

  /** Bật/tắt nhạc tổng hợp (nhạc nền tệp/YouTube thay thế nó). */
  setSynthMusic(on) { this.synthOn = Boolean(on); this.applyVolumes(); }

  applyVolumes(v) {
    this.vol = { ...this.vol, ...(v || {}) };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.1);
    this.music.gain.setTargetAtTime(this.synthOn === false ? 0 : this.vol.music * 0.5, t, 0.3); // tắt khi dùng nhạc tệp/YouTube
    this.sfx.gain.setTargetAtTime(this.vol.sfx * 0.6, t, 0.1);
    this.amb.gain.setTargetAtTime(this.vol.ambient * 0.5, t, 0.3);
  }

  #noiseBuffer(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // nhiễu nâu (mềm)
    return b;
  }
  #white(sec = 1) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ───────── môi trường ─────────
  #ambience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); g.gain.value = 0.35;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.17;
    const lg = ctx.createGain(); lg.gain.value = 0.18;
    lfo.connect(lg).connect(g.gain);
    src.connect(lp).connect(g).connect(this.amb);
    src.start(); lfo.start();
    // mưa: nhiễu trắng lọc dải
    const rs = ctx.createBufferSource(); rs.buffer = this.#white(2); rs.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.5;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rs.connect(bp).connect(this.rainGain).connect(this.amb);
    rs.start();
    const tickCreatures = () => {
      if (!this.ctx) return;
      if (this.ctx.state === 'running') {
        if (this.mood === 'night' || this.weather === 'night') this.#cricket();
        else if (this.weather === 'clear' && Math.random() < 0.7) this.#bird();
      }
      setTimeout(tickCreatures, 2500 + Math.random() * 6000);
    };
    setTimeout(tickCreatures, 3000);
  }
  #bird() {
    const ctx = this.ctx; const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4); const base = 2200 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      const s = t + i * 0.13;
      o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.08);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.05, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.11);
      o.connect(g).connect(this.amb); o.start(s); o.stop(s + 0.12);
    }
  }
  #cricket() {
    const ctx = this.ctx; const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain(); const s = t + i * 0.06;
      o.frequency.value = 4400; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.025, s + 0.01); g.gain.linearRampToValueAtTime(0, s + 0.04);
      o.connect(g).connect(this.amb); o.start(s); o.stop(s + 0.05);
    }
  }
  setWeather(w) {
    this.weather = w;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(w === 'storm' ? 0.4 : w === 'rain' ? 0.22 : 0, t, 1.5);
  }
  thunder() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime + 0.4 + Math.random();
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    s.connect(lp).connect(g).connect(this.amb); s.start(t); s.stop(t + 3);
  }

  // ───────── nhạc nền sinh tự động (ngũ cung; Boss → giọng thứ, nhanh hơn, có trống) ─────────
  #musicLoop() {
    const ctx = this.ctx;
    const scaleCalm = [0, 2, 4, 7, 9, 12, 14, 16];
    const scaleBoss = [0, 3, 5, 7, 10, 12, 15];
    const prog = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
    let step = 0;
    const loop = () => {
      if (!this.ctx) return;
      const boss = this.mood === 'boss';
      const bpm = boss ? 132 : 84;
      const dur = 60 / bpm / 2;
      if (ctx.state === 'running') {
        const t = ctx.currentTime + 0.05;
        const root = boss ? 45 : 55; // A2 / G3
        const bar = Math.floor(step / 8) % 4;
        if (step % 8 === 0) for (const n of (boss ? [0, 3, 7] : prog[bar])) this.#pad(root + n - 12, t, dur * 8);
        const sc = boss ? scaleBoss : scaleCalm;
        if (Math.random() < (boss ? 0.75 : 0.55)) this.#pluck(root + 12 + sc[Math.floor(Math.random() * sc.length)], t, boss ? 0.09 : 0.07);
        if (boss) { if (step % 2 === 0) this.#kick(t); if (step % 4 === 2) this.#hat(t); }
        else if (step % 8 === 0) this.#kick(t, 0.25);
        step++;
      }
      setTimeout(loop, (60 / (this.mood === 'boss' ? 132 : 84) / 2) * 1000);
    };
    loop();
  }
  #hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  #pluck(midi, t, v) {
    const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = this.#hz(midi);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.music); o.start(t); o.stop(t + 1);
  }
  #pad(midi, t, d) {
    const ctx = this.ctx; const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = this.#hz(midi); o.detune.value = (Math.random() - 0.5) * 12;
    f.type = 'lowpass'; f.frequency.value = this.mood === 'boss' ? 900 : 650;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + d * 0.3); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(f).connect(g).connect(this.music); o.start(t); o.stop(t + d + 0.05);
  }
  #kick(t, v = 0.5) {
    const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.22);
  }
  #hat(t) {
    const ctx = this.ctx; const s = ctx.createBufferSource(); s.buffer = this.#white(0.1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(hp).connect(g).connect(this.music); s.start(t); s.stop(t + 0.06);
  }

  // ───────── hiệu ứng ─────────
  /** Giới hạn tần suất mỗi loại âm (đám đông lớn không thành tạp âm). */
  #gate(name, ms) { const n = performance.now(); if ((this.lastSfx.get(name) || 0) + ms > n) return false; this.lastSfx.set(name, n); return true; }
  #tone(freq, t, d, { type = 'sine', v = 0.2, to = null, dest = this.sfx } = {}) {
    const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(dest); o.start(t); o.stop(t + d + 0.02);
  }
  #noiseHit(t, d, { f = 1000, type = 'bandpass', v = 0.3, sweepTo = null } = {}) {
    const ctx = this.ctx; const s = ctx.createBufferSource(); s.buffer = this.#white(Math.max(0.1, d));
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(flt).connect(g).connect(this.sfx); s.start(t); s.stop(t + d);
  }

  play(name, opt = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'cast': if (this.#gate('cast', 250)) this.#noiseHit(t, 0.35, { f: 600, sweepTo: 3000, v: 0.12 }); break;
      case 'plop': if (this.#gate('plop', 200)) this.#tone(700, t, 0.18, { to: 180, v: 0.25 }); break;
      case 'bite': if (this.#gate('bite', 300)) { this.#tone(900, t, 0.08, { v: 0.18 }); this.#tone(1200, t + 0.1, 0.08, { v: 0.18 }); } break;
      case 'splash': if (this.#gate('splash', 150)) this.#noiseHit(t, 0.5, { f: 1800, type: 'lowpass', v: 0.35, sweepTo: 300 }); break;
      case 'catch': {
        if (!this.#gate('catch', 180)) break;
        const tier = opt.tier || 1;
        const notes = [0, 4, 7, 12, 16, 19, 24].slice(0, 2 + tier);
        notes.forEach((n, i) => this.#tone(this.#hz(72 + n), t + i * 0.07, 0.35, { type: 'triangle', v: 0.16 + tier * 0.02 }));
        if (tier >= 5) this.#noiseHit(t, 1.2, { f: 6000, type: 'highpass', v: 0.12 });
        break;
      }
      case 'escape': if (this.#gate('escape', 300)) { this.#tone(500, t, 0.35, { to: 200, type: 'square', v: 0.07 }); } break;
      case 'gift': {
        if (!this.#gate('gift', 120)) break;
        for (const [i, n] of [84, 91, 96].entries()) this.#tone(this.#hz(n), t + i * 0.06, 0.8, { v: 0.12 });
        break;
      }
      case 'levelup': if (this.#gate('levelup', 400)) [0, 4, 7, 12].forEach((n, i) => this.#tone(this.#hz(67 + n), t + i * 0.09, 0.4, { type: 'square', v: 0.07 })); break;
      case 'achievement': if (this.#gate('ach', 400)) [0, 7, 12, 16, 19].forEach((n, i) => this.#tone(this.#hz(72 + n), t + i * 0.08, 0.5, { type: 'triangle', v: 0.12 })); break;
      case 'notify': if (this.#gate('notify', 200)) this.#tone(1046, t, 0.15, { v: 0.1 }); break;
      case 'warning': [0, 0.5, 1.0].forEach((d) => this.#tone(220, t + d, 0.4, { type: 'sawtooth', v: 0.12, to: 200 })); break;
      case 'roar': {
        const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 1.8);
        f.type = 'lowpass'; f.frequency.value = 600;
        g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2);
        o.connect(f).connect(g).connect(this.sfx); o.start(t); o.stop(t + 2.1);
        this.#noiseHit(t, 1.5, { f: 300, type: 'lowpass', v: 0.4 });
        break;
      }
      case 'hit': if (this.#gate('hit', 90)) { this.#tone(160, t, 0.18, { to: 60, v: 0.35 }); this.#noiseHit(t, 0.12, { f: 2000, v: 0.12 }); } break;
      case 'victory': [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((n, i) => this.#tone(this.#hz(67 + n), t + i * 0.11, 0.5, { type: 'square', v: 0.08 })); this.#noiseHit(t + 0.9, 2, { f: 7000, type: 'highpass', v: 0.15 }); break;
      case 'fail': [0, -3, -7].forEach((n, i) => this.#tone(this.#hz(60 + n), t + i * 0.25, 0.6, { type: 'triangle', v: 0.12 })); break;
      default: break;
    }
  }

  /** Tiếng rè của guồng khi có người đang kéo cá (một âm chung, mức theo số người kéo). */
  reel(count) {
    if (!this.ctx || this.ctx.state !== 'running' || count <= 0) return;
    if (!this.#gate('reel', Math.max(60, 180 - count * 15))) return;
    this.#noiseHit(this.ctx.currentTime, 0.03, { f: 4000, v: 0.05 + Math.min(0.08, count * 0.01) });
  }
}
