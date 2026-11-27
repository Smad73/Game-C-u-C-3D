// Lớp phủ màn hình phát (ADR-0028): bố cục các bảng do Control chỉnh + nhạc nền (tệp trên máy / YouTube nhúng / nhạc tổng hợp).
// Không import Three.js; chỉ thao tác DOM. Server là nguồn sự thật: cấu hình tới qua WS 'config', lệnh nhạc qua WS 'music'.
const $ = (id) => document.getElementById(id);
// Tâm co giãn mặc định khi bảng đang ẩn (chưa đo được kích thước): theo vị trí gốc trong stage.css.
const FALLBACK_ORIGIN = { banner: [540, 430], yt: [874, 1520], eventbar: [540, 220], ticker: [540, 1240] };

/** Áp bố cục: mỗi lớp .lay#lay-<khoá> dịch (dx,dy), co giãn quanh tâm bảng, độ mờ, bật/tắt, tự ẩn khi cận cảnh. */
export function applyLayout(layout) {
  if (!layout || typeof layout !== 'object') return;
  for (const [k, p] of Object.entries(layout)) {
    const el = $(`lay-${k}`);
    if (!el || !p) continue;
    el.classList.toggle('off', !p.show);
    el.classList.toggle('hide-close', Boolean(p.hideOnClose));
    el.style.opacity = String(Number.isFinite(p.opacity) ? p.opacity : 1);
    const inner = el.firstElementChild;
    let ox; let oy;
    if (inner && inner.offsetWidth > 0) { ox = inner.offsetLeft + inner.offsetWidth / 2; oy = inner.offsetTop + inner.offsetHeight / 2; } else [ox, oy] = FALLBACK_ORIGIN[k] ?? [540, 960];
    el.style.transformOrigin = `${ox}px ${oy}px`;
    el.style.transform = `translate(${Number(p.dx) || 0}px, ${Number(p.dy) || 0}px) scale(${Number(p.scale) || 1})`;
  }
}

/** Nhạc nền. mode: synth | files | youtube | off. */
export class MusicPlayer {
  constructor(audioEngine) {
    this.ae = audioEngine;
    this.el = $('bgm');
    this.box = $('yt');
    this.mode = null;
    this.tracks = [];
    this.order = [];
    this.i = 0;
    this.shuffle = false;
    this.paused = false;
    this.ytId = '';
    this.el.addEventListener('ended', () => this.next());
    this.el.addEventListener('error', () => { if (this.mode === 'files' && this.tracks.length > 1) setTimeout(() => this.next(), 1500); });
  }

  /** Áp cấu hình nhạc + âm lượng (volumes.master × volumes.music). */
  async apply(music = {}, volumes = {}) {
    const mode = music.mode || 'synth';
    this.el.volume = Math.min(1, Math.max(0, (volumes.master ?? 0.8) * (volumes.music ?? 0.35) * 1.6));
    this.ae.setSynthMusic?.(mode === 'synth');
    const shuffleChanged = this.shuffle !== Boolean(music.shuffle);
    this.shuffle = Boolean(music.shuffle);
    if (mode === 'files') {
      if (this.mode !== 'files' || shuffleChanged || !this.tracks.length) await this.#loadTracks();
      if (!this.paused) this.#playCurrent();
    } else { this.el.pause(); }
    if (mode === 'youtube' && music.youtube && !this.paused) this.#showYoutube(music.youtube);
    else this.#hideYoutube();
    this.ytId = music.youtube || '';
    this.mode = mode;
  }

  /** Lệnh từ Control: play | pause | next | prev. */
  cmd(c) {
    if (c === 'pause') { this.paused = true; this.el.pause(); this.#hideYoutube(); return; }
    if (c === 'play') { this.paused = false; if (this.mode === 'files') this.#playCurrent(); if (this.mode === 'youtube' && this.ytId) this.#showYoutube(this.ytId); return; }
    if (this.mode !== 'files' || !this.tracks.length) return;
    this.paused = false;
    this.i = (this.i + (c === 'prev' ? this.order.length - 1 : 1)) % this.order.length;
    this.#load(); this.#playCurrent();
  }

  next() { this.cmd('next'); }

  /** Gọi sau khi người xem bấm (mở khoá tự phát của trình duyệt). */
  resume() { if (this.mode === 'files' && !this.paused) this.#playCurrent(); }

  /** Trạng thái để báo về Control. */
  status() { return { mode: this.mode, paused: this.paused, track: this.order.length ? this.tracks[this.order[this.i]] : null, tracks: this.tracks.length }; }

  async #loadTracks() {
    try { this.tracks = (await (await fetch('/api/music/tracks', { cache: 'no-store' })).json()).tracks ?? []; } catch { this.tracks = []; }
    this.order = this.tracks.map((_, i) => i);
    if (this.shuffle) for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
    this.i = 0;
    this.#load();
  }

  #load() {
    if (!this.order.length) { this.el.removeAttribute('src'); return; }
    const name = this.tracks[this.order[this.i]];
    const url = `/stage/assets/music/${encodeURIComponent(name)}`;
    if (!this.el.src.endsWith(url)) this.el.src = url;
  }

  #playCurrent() {
    if (!this.el.getAttribute('src')) return;
    this.el.play().catch(() => { /* trình duyệt chặn tự phát: chờ người dùng bấm (OBS không chặn) */ });
  }

  #showYoutube(id) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    const cur = this.box.querySelector('iframe');
    if (cur?.dataset.id === id) { this.box.hidden = false; return; }
    const f = document.createElement('iframe');
    f.dataset.id = id;
    f.title = 'Nhạc nền YouTube';
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&controls=0&rel=0&playsinline=1`;
    f.allow = 'autoplay; encrypted-media';
    f.referrerPolicy = 'strict-origin-when-cross-origin'; // YouTube từ chối phát khi không có Referer (lỗi 153)
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation'); // không cho khung điều hướng trang stage
    this.box.replaceChildren(f);
    this.box.hidden = false;
  }

  #hideYoutube() { this.box.replaceChildren(); this.box.hidden = true; }
}
