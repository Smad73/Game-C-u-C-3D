// Trang điều khiển (Control) — chạy trên máy phát hoặc điện thoại. Ghép đôi/đăng nhập → phiên + CSRF; mọi thao tác qua REST có CSRF.
// Chỉ dùng textContent/DOM API (không innerHTML), không script/handler nội tuyến (CSP).
'use strict';
const $ = (id) => document.getElementById(id);
let csrf = null;
let health = {};
let ws = null;
let wsBackoff = 1000;
let revoked = false;
let catalog = null;
let realm = null;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'value') el.value = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('vi-VN') : '—');
const vnTime = (ms) => (ms ? new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—');

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-Nova-CSRF'] = csrf;
  let r;
  try { r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch { return { ok: false, status: 0, code: 'NETWORK', message: 'Không kết nối được server.' }; }
  const j = await r.json().catch(() => ({ ok: false, code: 'BAD_RESPONSE', message: 'Phản hồi không hợp lệ.' }));
  return { status: r.status, ...j };
}

function msg(text, kind = '') {
  const m = $('msg');
  m.textContent = text;
  m.className = `msg ${kind}`;
  m.hidden = !text;
  if (text && kind === 'ok') setTimeout(() => { if (m.textContent === text) m.hidden = true; }, 4000);
}

function show(paired) {
  $('unpaired').hidden = paired;
  $('paired').hidden = !paired;
  $('login-form').hidden = paired || !health.passwordLogin;
  $('lan-banner').hidden = !(health.mode === 'lan' && !health.https);
}

// ───────── khởi động / ghép đôi ─────────
async function init() {
  health = await api('/api/health');
  const code = new URLSearchParams(location.hash.slice(1)).get('pair');
  if (code) {
    history.replaceState(null, '', location.pathname); // xoá mã khỏi thanh địa chỉ/lịch sử ngay
    await redeem(code);
  }
  if (!csrf) {
    const s = await api('/api/admin/session');
    if (s.ok) csrf = s.csrf;
  }
  if (!csrf) { // mở trên chính máy chạy game → vào thẳng, không cần mã (server chỉ cho phép kết nối cùng máy)
    const l = await api('/api/admin/local', { method: 'POST', body: {} });
    if (l.ok) csrf = l.csrf;
  }
  if (csrf) enterPaired(); else show(false);
}
async function redeem(code) {
  const r = await api('/api/admin/pair', { method: 'POST', body: { code } });
  if (r.ok) { csrf = r.csrf; msg('Ghép đôi thành công.', 'ok'); } else msg(r.message || 'Ghép đôi thất bại.', 'err');
}
$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await redeem($('pair-code').value.trim());
  $('pair-code').value = '';
  if (csrf) enterPaired();
});
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('/api/admin/login', { method: 'POST', body: { password: $('login-pass').value } });
  $('login-pass').value = '';
  if (r.ok) { csrf = r.csrf; msg('Đăng nhập thành công.', 'ok'); enterPaired(); } else msg(r.message || 'Đăng nhập thất bại.', 'err');
});

async function enterPaired() {
  show(true);
  $('stage-url').textContent = `${location.origin}/stage/`;
  $('check-url').textContent = `${location.origin}/stage/check.html`;
  const c = await api('/api/catalog');
  catalog = c.catalog;
  openWs();
  showTab('overview');
}

// ───────── tab ─────────
let curTab = 'overview';
const loaders = {
  overview: () => { refreshGame(); if (!$('preview').src) $('preview').src = '/stage/?mute=1'; },
  live: () => refreshLive(),
  players: () => searchPlayers(0),
  gifts: () => loadGifts(),
  events: () => loadEvents(),
  lb: () => loadPeriods().then(() => loadLb(0)),
  settings: () => loadConfig(),
  screen: () => { loadScreen(); if (!$('preview2').src) $('preview2').src = '/stage/?mute=1'; },
  system: () => { refreshMetrics(); refreshDevices(); loadBackups(); loadLogs(); }
};
function showTab(t) {
  if (curTab === 'screen' && t !== 'screen') $('preview2').removeAttribute('src'); // giải phóng stage xem trước thứ hai (WebGL)
  curTab = t;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const d of document.querySelectorAll('.tab')) d.hidden = d.dataset.tab !== t;
  loaders[t]?.();
}
for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
setInterval(() => { if (!csrf || document.hidden) return; if (curTab === 'overview') refreshGame(); if (curTab === 'events') loadEvents(); if (curTab === 'live') refreshLive(true); }, 3000);

// ───────── WebSocket admin ─────────
function openWs() {
  if (ws) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=admin`);
  ws.onopen = () => { wsBackoff = 1000; setConn('đã kết nối', 'ok'); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'status') renderStatus(m);
    if (m.type === 'stage_report') renderStage(m.report);
  };
  ws.onclose = (e) => {
    ws = null;
    if (e.code === 4401) { revoked = true; csrf = null; setConn('phiên đã bị thu hồi/hết hạn', 'bad'); show(false); msg('Phiên không còn hiệu lực. Hãy ghép đôi lại.', 'err'); return; }
    setConn('mất kết nối — thử lại…', 'bad');
    setTimeout(() => { if (csrf && !revoked) openWs(); }, wsBackoff);
    wsBackoff = Math.min(wsBackoff * 2, 10000);
  };
}
function setConn(text, kind) { const c = $('conn'); c.textContent = text; c.className = `pill ${kind}`; }

function dl(target, rows) {
  const box = typeof target === 'string' ? $(target) : target;
  box.replaceChildren();
  const list = h('dl', { class: 'grid' });
  for (const [k, v] of rows) list.append(h('dt', {}, k), h('dd', {}, v instanceof Node ? v : String(v ?? '—')));
  box.append(list);
}

function renderStatus(s) {
  realm = s.realm ?? realm;
  const rp = $('realm');
  rp.textContent = s.realm === 'demo' ? 'DEMO' : s.ingestMode === 'live' ? 'LIVE' : 'LIVE (chưa nối)';
  rp.className = `pill ${s.realm === 'demo' ? 'warn' : 'ok'}`;
  const box = $('alerts');
  box.replaceChildren();
  if (!s.alerts?.length) box.append(h('div', { class: 'none' }, '✔ Không có cảnh báo'));
  for (const a of s.alerts || []) box.append(h('div', { class: `a ${a.level}` }, h('b', {}, `${a.code}: `), a.message, h('div', { class: 'small' }, a.hint)));
  if (s.stage) renderStage(s.stage);
}
function renderStage(r) {
  if (!r) { dl('stage', [['Trạng thái', 'chưa có stage nào kết nối']]); return; }
  dl('stage', [
    ['WebGL2', r.webgl2 ? 'CÓ' : 'KHÔNG'], ['Card đồ hoạ', r.renderer], ['Three.js', r.three?.ok ? `OK r${r.three.revision}` : 'chưa chạy'],
    ['FPS', r.fps], ['Âm thanh', `${r.audio?.state}${r.audio?.ok ? '' : ' (chưa chạy — trong OBS bật "Control audio via OBS")'}`],
    ['WebSocket RTT', `${r.ws?.rttMs ?? '—'} ms`], ['Trình duyệt', r.userAgent]
  ]);
}

// ───────── Tổng quan ─────────
async function refreshGame() {
  const g = await api('/api/game');
  if (!g.ok) return;
  realm = g.realm;
  const w = g.world;
  const ev = w.events;
  const boss = ev.active.find((x) => x.kind === 'BOSS');
  dl('world', [
    ['Trạng thái', `${w.state}${g.realm === 'demo' ? ' · DEMO' : ''}`],
    ['Cần thủ', `${fmt(w.counts.active)} đang câu · ${fmt(w.counts.afk)} AFK · ${fmt(g.stats.players)} hồ sơ`],
    ['Cá/phút', fmt(w.catchesPerMin)], ['Tổng cá', fmt(g.stats.catches)],
    ['Boss', boss ? `${boss.status} cấp ${boss.level} — ${fmt(boss.hp)}/${fmt(boss.hpMax)} HP` : `kế tiếp ${ev.nextBossAtUtc ? vnTime(ev.nextBossAtUtc) : 'tắt'}`],
    ['Sự kiện', ev.active.filter((x) => x.kind !== 'BOSS').map((x) => x.name).join(', ') || '—'],
    ['Tick server', `p50 ${w.tickMs.p50 ?? '—'} ms · p95 ${w.tickMs.p95 ?? '—'} ms`],
    ['Kỳ hiện tại', `ngày ${g.labels.day} · tuần ${g.labels.week}`],
    ['Buổi LIVE', g.live?.session ? `${g.live.session.session_id ?? '—'} (${g.live.session.status ?? ''})` : '—']
  ]);
}
$('btn-pause').addEventListener('click', async () => { const r = await api('/api/world/pause', { method: 'POST', body: {} }); msg(r.ok ? 'Đã tạm dừng thế giới.' : r.message, r.ok ? 'ok' : 'err'); refreshGame(); });
$('btn-resume').addEventListener('click', async () => { const r = await api('/api/world/resume', { method: 'POST', body: {} }); msg(r.ok ? 'Thế giới tiếp tục.' : r.message, r.ok ? 'ok' : 'err'); refreshGame(); });

// ───────── LIVE / Demo ─────────
let liveInit = false;
async function refreshLive(quiet = false) {
  const s = await api('/api/tiktok/status');
  if (!s.ok) return;
  const c = s.connector;
  dl('live-now', [
    ['Chế độ', s.mode === 'demo' ? 'DEMO (giả lập)' : s.mode === 'live' ? `LIVE @${s.username}` : 'tắt'],
    ['Kết nối', c ? `${c.state}${c.reason ? ` (${c.reason})` : ''}${c.lastError ? ` — ${c.lastError.message ?? c.lastError}` : ''}` : '—'],
    ['Room', c?.roomId ?? '—'],
    ['Buổi LIVE', s.session ? `${s.session.session_id} · ${s.session.status} · room ${s.session.room_id ?? '—'}` : '—'],
    ['Đã kiểm chứng trên LIVE thật', s.verifiedOnRealLive ? 'có' : 'CHƯA (Module 10: cần buổi LIVE thử)']
  ]);
  $('demo-box').hidden = s.mode !== 'demo';
  if (quiet && liveInit) return;
  liveInit = true;
  $('mode').value = s.mode;
  $('username').value = s.username ?? '';
  const sel = $('provider');
  sel.replaceChildren(...Object.entries(s.providers).map(([id, p]) => h('option', { value: id }, `${p.pkg} (${p.license})`)));
  sel.value = s.provider;
  const pv = $('providers');
  pv.replaceChildren(h('h3', {}, 'Thư viện kết nối TikTok'), ...Object.entries(s.providers).map(([id, p]) => h('div', { class: 'small' },
    h('span', { class: `tag ${p.installed ? 'ok' : 'bad'}` }, p.installed ? 'đã cài' : 'CHƯA CÀI'),
    p.needsKey ? h('span', { class: `tag ${p.keyPresent ? 'ok' : 'warn'}` }, p.keyPresent ? 'có API key' : `thiếu ${p.keyEnv}`) : null,
    `${p.pkg}@${p.version} — ${p.license}. ${p.note}`)));
  if (s.mode === 'demo') loadRates();
}
$('btn-connect').addEventListener('click', async () => { const r = await api('/api/ingest/connect', { method: 'POST', body: {} }); msg(r.ok ? `Đã kết nối (room ${r.roomId ?? '—'}).` : r.message, r.ok ? 'ok' : 'err'); refreshLive(true); });
$('btn-disconnect').addEventListener('click', async () => { const r = await api('/api/ingest/disconnect', { method: 'POST', body: {} }); msg(r.ok ? 'Đã ngắt kết nối (không tự nối lại).' : r.message, r.ok ? 'ok' : 'err'); refreshLive(true); });
$('btn-endlive').addEventListener('click', () => dangerous('/api/ingest/end-live', 'Đã kết thúc buổi LIVE. Tiến trình người chơi được giữ nguyên.'));
$('mode-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('/api/run-mode', { method: 'PUT', body: { mode: $('mode').value, username: $('username').value, provider: $('provider').value } });
  msg(r.ok ? r.message : r.message, r.ok ? 'ok' : 'err');
});
$('btn-restart').addEventListener('click', async () => {
  if (!window.confirm('Lưu an toàn rồi khởi động lại game?')) return;
  const r = await api('/api/system/restart', { method: 'POST', body: {} });
  msg(r.ok ? r.message : r.message, r.ok ? 'ok' : 'err');
  if (r.ok) setTimeout(() => location.reload(), 6000);
});

async function demo(path, body) { const r = await api(`/api/demo/${path}`, { method: 'POST', body }); msg(r.ok ? 'Đã gửi.' : r.message, r.ok ? 'ok' : 'err'); return r; }
$('demo-join').addEventListener('click', () => demo('bulk-join', { count: 20 }));
$('demo-join200').addEventListener('click', () => demo('bulk-join', { count: 200 }));
$('demo-join2000').addEventListener('click', () => demo('bulk-join', { count: 2000 }));
$('demo-comment').addEventListener('submit', (e) => { e.preventDefault(); demo('comment', { user: Number($('dc-user').value), text: $('dc-text').value }); });
$('demo-gift').addEventListener('submit', (e) => { e.preventDefault(); demo('gift', { user: Number($('dg-user').value), giftId: Number($('dg-gift').value), count: Number($('dg-count').value), diamond: Number($('dg-diamond').value) }); });
const RATE_NAMES = { commentsPerSec: 'Comment/giây', giftsPerSec: 'Quà/giây', likesPerSec: 'Like/giây', followsPerSec: 'Follow/giây', sharesPerSec: 'Share/giây', joinsPerSec: 'Vào phòng/giây', users: 'Số người xem ảo' };
async function loadRates() {
  const r = await api('/api/demo/rates');
  const f = $('demo-rates');
  f.replaceChildren();
  if (!r.rates) return;
  for (const [k, v] of Object.entries(r.rates)) f.append(h('label', {}, RATE_NAMES[k] ?? k, h('input', { type: 'number', step: 'any', min: 0, name: k, value: String(v) })));
  f.append(h('button', { type: 'submit' }, 'Áp dụng nhịp giả lập'));
  const giftSel = $('dg-gift');
  const rules = (await api('/api/gift-rules')).rules;
  giftSel.replaceChildren(...rules.rules.map((x) => h('option', { value: String(x.giftId) }, `${x.label || x.giftId} (${x.giftId})`)));
}
// Nhịp giả lập có sẵn: Chậm ≈ 1 quà/20 s (xem thoải mái, mặc định), Vừa, Nhanh (thử tải).
const SPEED_PRESETS = {
  slow: { commentsPerSec: 0.6, giftsPerSec: 0.05, likesPerSec: 2, followsPerSec: 0.02, sharesPerSec: 0.01, joinsPerSec: 0.15 },
  normal: { commentsPerSec: 1.5, giftsPerSec: 0.15, likesPerSec: 4, followsPerSec: 0.05, sharesPerSec: 0.03, joinsPerSec: 0.4 },
  fast: { commentsPerSec: 5, giftsPerSec: 1, likesPerSec: 10, followsPerSec: 0.2, sharesPerSec: 0.2, joinsPerSec: 1 }
};
$('demo-speed').addEventListener('click', async (e) => {
  const sp = e.target.dataset?.speed;
  if (!SPEED_PRESETS[sp]) return;
  const r = await api('/api/demo/rates', { method: 'POST', body: SPEED_PRESETS[sp] });
  msg(r.ok ? `Đã đặt nhịp ${e.target.textContent.toLowerCase()}.` : r.message, r.ok ? 'ok' : 'err');
  if (r.ok) loadRates();
});
$('demo-rates').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {};
  for (const i of e.target.querySelectorAll('input')) body[i.name] = Number(i.value);
  const r = await api('/api/demo/rates', { method: 'POST', body });
  msg(r.ok ? 'Đã áp dụng nhịp giả lập.' : r.message, r.ok ? 'ok' : 'err');
});

// ───────── Người chơi ─────────
let pOffset = 0;
async function searchPlayers(offset) {
  pOffset = Math.max(0, offset);
  const r = await api(`/api/players?q=${encodeURIComponent($('p-q').value)}&offset=${pOffset}&limit=30`);
  if (!r.ok) return msg(r.message, 'err');
  $('p-total').textContent = `${fmt(r.total)} hồ sơ`;
  const t = h('table', {}, h('tr', {}, ...['Tên', 'Cấp', 'Điểm', 'Cá', 'Xu', 'Trạng thái', 'Lần cuối'].map((x) => h('th', {}, x))));
  for (const p of r.players) {
    t.append(h('tr', { class: 'clickable', onclick: () => openPlayer(p.player_key) },
      h('td', {}, p.nickname || p.unique_id || p.player_key), h('td', {}, String(p.level)), h('td', {}, fmt(p.total_score)), h('td', {}, fmt(p.catches_total)), h('td', {}, fmt(p.coins)),
      h('td', {}, p.hot), h('td', {}, vnTime(p.last_seen_utc))));
  }
  $('p-list').replaceChildren(t);
  return undefined;
}
$('p-search').addEventListener('submit', (e) => { e.preventDefault(); searchPlayers(0); });
$('p-prev').addEventListener('click', () => searchPlayers(pOffset - 30));
$('p-next').addEventListener('click', () => searchPlayers(pOffset + 30));
async function openPlayer(key) {
  const r = await api(`/api/players/${encodeURIComponent(key)}`);
  if (!r.ok) return msg(r.message, 'err');
  const p = r.profile?.player ?? {};
  const hot = r.hot;
  const box = $('p-info');
  box.replaceChildren();
  const info = h('div');
  dl(info, [
    ['Tên', p.nickname ?? hot?.name], ['Khoá', key], ['Cấp / XP', `${p.level ?? hot?.level} / ${fmt(p.xp ?? hot?.xp)}`], ['Xu', fmt(hot?.coins ?? p.coins)],
    ['Điểm tổng', fmt(p.total_score)], ['Cá đã câu', fmt(p.catches_total)], ['Tổng kg', fmt(Math.round((p.total_weight_g ?? 0) / 1000))], ['Boss hạ', fmt(p.boss_kills)],
    ['Điểm danh', `${p.daily_streak ?? 0} ngày liên tiếp (gần nhất ${p.last_daily ?? '—'})`],
    ['Trang bị', (r.profile?.equipment ?? []).map((e) => `${e.slot} ${e.level}`).join(', ') || 'mặc định (cấp 1)'],
    ['Sổ tay cá', `${r.profile?.fishdex?.length ?? 0}/${catalog?.fishdexTotal ?? '?'}`],
    ['Thành tích', (r.profile?.achievements ?? []).map((a) => catalog?.achievements.find((x) => x.id === a.achievement_id)?.name ?? a.achievement_id).join(', ') || '—'],
    ['Buff', (hot?.buffs ?? []).map((b) => `${b.kind} ${b.value}${b.uses ? ` ×${b.uses}` : ''}`).join(', ') || '—'],
    ['Hạng', Object.entries(r.ranks).map(([s, v]) => `${s}: ${v ?? '—'}`).join(' · ')],
    ['Trong game', hot ? `${hot.state} · ${hot.phase}${hot.inSlot ? ' · đang lên hình' : ''}` : 'COLD (chỉ trong DB)']
  ]);
  box.append(info, h('div', { class: 'row' },
    h('button', { type: 'button', onclick: () => playerAct(key, 'wake') }, 'Đánh thức'),
    h('button', { type: 'button', onclick: () => playerAct(key, 'spotlight') }, 'Đưa lên hình'),
    h('button', { type: 'button', onclick: () => playerAct(key, 'afk') }, 'Cho AFK')));
  $('p-detail').hidden = false;
  $('p-detail').scrollIntoView({ behavior: 'smooth' });
  return undefined;
}
async function playerAct(key, action) {
  const r = await api(`/api/players/${encodeURIComponent(key)}/${action}`, { method: 'POST', body: {} });
  msg(r.ok ? 'Đã thực hiện.' : r.message, r.ok ? 'ok' : 'err');
}

// ───────── Gift Mapping ─────────
let rules = null;
const ACT_PARAMS = { xp: ['amount'], coins: ['amount'], score: ['amount'], luck: ['pct', 'minutes'], power: ['pct', 'minutes'], help_all: ['pct', 'minutes'], rare_next: ['minTier', 'count'], boss: ['level'], event: ['kind'], cast: [] };
const PARAM_LABEL = { amount: 'lượng', pct: '%', minutes: 'phút', minTier: 'bậc ≥', count: 'lượt', level: 'cấp', kind: 'loại' };
async function loadGifts() {
  const r = await api('/api/gift-rules');
  if (!r.ok) return msg(r.message, 'err');
  rules = r.rules;
  renderRules();
  return undefined;
}
function num(label, obj, key, attrs = {}) { return h('label', {}, label, h('input', { type: 'number', step: 'any', value: String(obj[key] ?? ''), oninput: (e) => { obj[key] = Number(e.target.value); }, ...attrs })); }
function renderRules() {
  const gb = $('g-global');
  gb.replaceChildren(num('Xu gốc = √kim cương ×', rules, 'coinFactor'), num('XP gốc = √kim cương ×', rules, 'xpFactor'), num('Buff tối đa (phút)', rules, 'maxBuffMinutes'));
  const box = $('g-rules');
  box.replaceChildren();
  const all = [...rules.rules.map((r) => ({ r, isDefault: false })), { r: rules.default, isDefault: true }];
  for (const { r, isDefault } of all) {
    const acts = h('div');
    const draw = () => {
      acts.replaceChildren(...r.actions.map((a, i) => {
        const row = h('div', { class: 'act' }, h('b', {}, catalog?.giftActions[a.type]?.name ?? a.type));
        for (const p of ACT_PARAMS[a.type] ?? []) {
          if (p === 'kind') row.append(h('select', { onchange: (e) => { a.kind = e.target.value; } }, ...Object.entries(catalog.eventKinds).filter(([k]) => k !== 'BOSS').map(([k, v]) => h('option', { value: k, selected: a.kind === k }, v.name))));
          else row.append(h('span', { class: 'small' }, PARAM_LABEL[p]), h('input', { type: 'number', value: String(a[p] ?? ''), oninput: (e) => { a[p] = Number(e.target.value); } }));
        }
        row.append(h('button', { type: 'button', class: 'mini danger-btn', onclick: () => { r.actions.splice(i, 1); draw(); } }, '✕'));
        return row;
      }));
    };
    draw();
    const addSel = h('select', {}, ...Object.entries(catalog?.giftActions ?? {}).map(([k, v]) => h('option', { value: k }, v.name)));
    const head = h('div', { class: 'row' },
      isDefault ? h('b', {}, 'Quà chưa gán (mặc định)') : h('input', { type: 'number', class: 'num', value: String(r.giftId), title: 'giftId', oninput: (e) => { r.giftId = Number(e.target.value); } }),
      isDefault ? null : h('input', { type: 'text', value: r.label ?? '', placeholder: 'Tên quà', oninput: (e) => { r.label = e.target.value; } }),
      h('label', {}, h('input', { type: 'checkbox', checked: r.enabled, onchange: (e) => { r.enabled = e.target.checked; } }), ' bật'),
      h('label', {}, h('input', { type: 'checkbox', checked: r.show, onchange: (e) => { r.show = e.target.checked; } }), ' hiện banner'),
      isDefault ? null : h('button', { type: 'button', class: 'mini danger-btn', onclick: () => { rules.rules.splice(rules.rules.indexOf(r), 1); renderRules(); } }, 'Xoá quà'));
    box.append(h('div', { class: 'rule' }, head, acts, h('div', { class: 'row' }, addSel, h('button', { type: 'button', class: 'mini', onclick: () => {
      const t = addSel.value; const a = { type: t };
      for (const p of ACT_PARAMS[t] ?? []) a[p] = p === 'kind' ? 'RARE_SURGE' : p === 'minTier' ? 3 : p === 'minutes' || p === 'count' || p === 'level' ? 1 : p === 'pct' ? 20 : 50;
      r.actions.push(a); draw();
    } }, '+ Hành động'))));
  }
  const it = rules.interactions;
  $('g-inter').replaceChildren(
    num('Like: may mắn +%', it.like, 'luckPct'), num('Like: thời lượng (phút)', it.like, 'minutes'), num('Like: mỗi N like', it.like, 'everyLikes'),
    num('Follow: xu (1 lần/buổi)', it.follow, 'coins'), num('Share: xu', it.share, 'coins'), num('Share: XP', it.share, 'xp'));
}
$('g-add').addEventListener('click', () => { rules.rules.push({ giftId: 1, label: 'Quà mới', enabled: true, show: true, actions: [{ type: 'cast' }] }); renderRules(); });
$('g-save').addEventListener('click', async () => { const r = await api('/api/gift-rules', { method: 'PUT', body: { rules } }); if (r.ok) { rules = r.rules; renderRules(); } msg(r.ok ? 'Đã lưu luật quà.' : r.message, r.ok ? 'ok' : 'err'); });
$('g-reset').addEventListener('click', async () => { if (!window.confirm('Đưa luật quà về mặc định?')) return; const r = await api('/api/gift-rules/reset', { method: 'POST', body: {} }); if (r.ok) { rules = r.rules; renderRules(); } msg(r.ok ? 'Đã về mặc định.' : r.message, r.ok ? 'ok' : 'err'); });

// ───────── Sự kiện ─────────
let evButtons = false;
async function loadEvents() {
  if (!evButtons && catalog) {
    evButtons = true;
    $('ev-buttons').replaceChildren(...Object.entries(catalog.eventKinds).map(([k, v]) => h('button', { type: 'button', onclick: async () => {
      const r = await api('/api/events/trigger', { method: 'POST', body: { kind: k, level: Number($('ev-level').value) } });
      msg(r.ok ? `Đã xếp hàng: ${v.name}` : r.message, r.ok ? 'ok' : 'err'); loadEvents();
    } }, k === 'BOSS' ? '🐉 Gọi Boss' : v.name)));
  }
  const r = await api('/api/events');
  if (!r.ok) return;
  const row = (e) => h('tr', {}, h('td', {}, e.name ?? e.kind), h('td', {}, e.status), h('td', {}, e.source), h('td', {}, e.hpMax ? `${fmt(e.hp)}/${fmt(e.hpMax)}` : ''),
    h('td', {}, e.endsAtUtc ? vnTime(e.endsAtUtc) : ''), h('td', {}, h('button', { type: 'button', class: 'mini danger-btn', onclick: async () => { await api(`/api/events/${encodeURIComponent(e.id)}/cancel`, { method: 'POST', body: {} }); loadEvents(); } }, 'Huỷ')));
  const t = h('table', {}, h('tr', {}, ...['Sự kiện', 'Trạng thái', 'Nguồn', 'HP', 'Kết thúc', ''].map((x) => h('th', {}, x))), ...r.active.map(row), ...r.queued.map(row));
  $('ev-now').replaceChildren(t, h('p', { class: 'small' }, `Boss định kỳ kế tiếp: ${r.nextBossAtUtc ? vnTime(r.nextBossAtUtc) : 'tắt'} · Sự kiện tự động kế tiếp: ${r.nextAutoAtUtc ? vnTime(r.nextAutoAtUtc) : 'tắt'}`));
  $('ev-recent').replaceChildren(h('table', {}, h('tr', {}, ...['Loại', 'Nguồn', 'Trạng thái', 'Kết quả', 'Bắt đầu'].map((x) => h('th', {}, x))),
    ...r.recent.map((e) => h('tr', {}, h('td', {}, e.kind), h('td', {}, e.source), h('td', {}, e.status), h('td', {}, e.result ?? ''), h('td', {}, vnTime(e.started_at_utc))))));
}

// ───────── BXH ─────────
let lbOffset = 0;
async function loadPeriods() {
  const scope = $('lb-scope').value;
  const sel = $('lb-period');
  sel.replaceChildren(h('option', { value: '' }, 'Kỳ hiện tại'));
  if (['live', 'day', 'week'].includes(scope)) {
    const r = await api(`/api/leaderboard/periods?scope=${scope}`);
    for (const p of r.periods ?? []) sel.append(h('option', { value: p }, p));
  }
}
async function loadLb(offset) {
  lbOffset = Math.max(0, offset);
  const scope = $('lb-scope').value;
  const period = $('lb-period').value;
  const r = await api(`/api/leaderboard?scope=${scope}${period ? `&period=${encodeURIComponent(period)}` : ''}&offset=${lbOffset}&limit=50`);
  if (!r.ok) return msg(r.message, 'err');
  $('lb-total').textContent = `${fmt(r.total)} người · kỳ ${r.period}`;
  const t = h('table', {}, h('tr', {}, ...['#', 'Tên', 'Cấp', 'Điểm', 'Tổng kg'].map((x) => h('th', {}, x))),
    ...r.rows.map((x, i) => h('tr', { class: 'clickable', onclick: () => { showTab('players'); openPlayer(x.player_key); } }, h('td', {}, String(lbOffset + i + 1)), h('td', {}, x.nickname || x.unique_id || x.player_key), h('td', {}, String(x.level)), h('td', {}, fmt(x.score)), h('td', {}, fmt(Math.round(x.weight_g / 1000))))));
  $('lb-table').replaceChildren(t);
  return undefined;
}
$('lb-scope').addEventListener('change', () => loadPeriods().then(() => loadLb(0)));
$('lb-go').addEventListener('click', () => loadLb(0));
$('lb-prev').addEventListener('click', () => loadLb(lbOffset - 50));
$('lb-next').addEventListener('click', () => loadLb(lbOffset + 50));

// ───────── Cài đặt ─────────
let cfg = null;
const CFG_FIELDS = [
  ['worldName', 'Tên hồ (hiện trên stage)', 'text'], ['bossIntervalMin', 'Boss định kỳ (phút, 0 = tắt)'], ['bossWarnSec', 'Cảnh báo Boss trước (giây)'], ['bossDurationSec', 'Thời gian Boss (giây)'],
  ['maxConcurrentBoss', 'Số Boss đồng thời tối đa'], ['bossHpPerPlayer', 'HP Boss / người (tự điều chỉnh)'], ['autoEventEveryMin', 'Sự kiện tự động (phút, 0 = tắt)'],
  ['afkMinutes', 'AFK sau (phút không tương tác)'], ['coldMinutes', 'Đưa hồ sơ AFK về DB sau (phút)'], ['detailedSlots', 'Số cần thủ vẽ chi tiết (ngân sách hiển thị)'],
  ['lbRotateSec', 'BXH: đổi bảng mỗi (giây)'], ['lbPageSec', 'BXH: lật trang mỗi (giây)'], ['likeBuffEvery', 'Like: buff mỗi N like'], ['showGuides', 'Hiện đường kẻ vùng TikTok', 'checkbox']
];
async function loadConfig() {
  const r = await api('/api/game/config');
  if (!r.ok) return;
  cfg = r.config;
  const f = $('cfg-form');
  f.replaceChildren();
  for (const [k, label, type = 'number'] of CFG_FIELDS) {
    f.append(h('label', {}, label, type === 'checkbox'
      ? h('input', { type: 'checkbox', checked: cfg[k], onchange: (e) => { cfg[k] = e.target.checked; } })
      : h('input', { type, step: 'any', value: String(cfg[k]), oninput: (e) => { cfg[k] = type === 'number' ? Number(e.target.value) : e.target.value; } })));
  }
  for (const [k, label] of [['master', 'Âm lượng tổng'], ['music', 'Nhạc nền'], ['sfx', 'Hiệu ứng'], ['ambient', 'Môi trường']]) {
    f.append(h('label', {}, `${label} (0–1)`, h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(cfg.volumes[k]), oninput: (e) => { cfg.volumes[k] = Number(e.target.value); } })));
  }
}
$('cfg-save').addEventListener('click', async () => { const r = await api('/api/game/config', { method: 'PUT', body: { config: cfg } }); msg(r.ok ? 'Đã lưu cài đặt (stage cập nhật ngay).' : r.message, r.ok ? 'ok' : 'err'); });

// ───────── Màn hình phát: bố cục + nhạc nền (ADR-0028) ─────────
const LAY_NAMES = { top: 'Thanh tiêu đề', eventbar: 'Thanh sự kiện / Boss', feed: 'Bảng Diễn biến', lb: 'Bảng TOP', banner: 'Banner quà / thành tích', ticker: 'Dòng hướng dẫn lệnh', yt: 'Khung YouTube' };
const LAY_DEFAULT = (k) => ({ show: true, dx: 0, dy: 0, scale: 1, opacity: 1, hideOnClose: k === 'feed' || k === 'lb' });
const LAY_SLIDERS = [['dx', 'Ngang', -1080, 1080, 10], ['dy', 'Dọc', -1920, 1920, 10], ['scale', 'Cỡ', 0.3, 2, 0.05], ['opacity', 'Độ đậm', 0, 1, 0.05]];
const MUSIC_MODES = [['synth', 'Nhạc tổng hợp (có sẵn)'], ['files', 'Tệp trên máy'], ['youtube', 'YouTube'], ['off', 'Tắt nhạc']];
let screenCfg = null;
const layTimers = {};
/** Lưu một phần cấu hình (gộp sâu ở server); gom thay đổi liên tục của thanh trượt. */
function saveCfgPart(key, part, delay = 250) {
  clearTimeout(layTimers[key]);
  layTimers[key] = setTimeout(async () => {
    const r = await api('/api/game/config', { method: 'PUT', body: { config: part } });
    if (!r.ok) msg(r.message, 'err'); else screenCfg = r.config ?? screenCfg;
  }, delay);
}
function renderLayout() {
  const list = $('lay-list');
  list.replaceChildren();
  for (const [k, name] of Object.entries(LAY_NAMES)) {
    const p = { ...LAY_DEFAULT(k), ...(screenCfg.layout?.[k] || {}) };
    const save = () => { screenCfg.layout[k] = p; saveCfgPart(`lay-${k}`, { layout: { [k]: p } }); };
    const out = {};
    const row = h('div', { class: 'lay-row' },
      h('div', { class: 'lay-head' }, h('b', {}, name),
        h('label', {}, h('input', { type: 'checkbox', checked: p.show, onchange: (e) => { p.show = e.target.checked; save(); } }), ' Hiện'),
        h('label', { title: 'Tự ẩn khi camera cận cảnh cần thủ hoặc dưới nước' }, h('input', { type: 'checkbox', checked: p.hideOnClose, onchange: (e) => { p.hideOnClose = e.target.checked; save(); } }), ' Ẩn khi cận cảnh'),
        h('button', { type: 'button', onclick: () => { Object.assign(p, LAY_DEFAULT(k)); save(); renderLayout(); } }, 'Mặc định')),
      ...LAY_SLIDERS.map(([f, label, min, max, step]) => h('label', { class: 'lay-slider' }, label,
        h('input', { type: 'range', min, max, step, value: String(p[f]), oninput: (e) => { p[f] = Number(e.target.value); out[f].textContent = String(p[f]); save(); } }),
        (out[f] = h('span', { class: 'num' }, String(p[f]))))));
    list.append(row);
  }
}
function renderMusic() {
  const m = screenCfg.music || { mode: 'synth', youtube: '', shuffle: false };
  $('music-mode').replaceChildren(...MUSIC_MODES.map(([v, label]) => h('label', {}, h('input', { type: 'radio', name: 'music-mode', value: v, checked: m.mode === v, onchange: () => { m.mode = v; saveCfgPart('music', { music: { mode: v } }, 0); } }), ` ${label}`)));
  $('yt-url').value = m.youtube ? `https://www.youtube.com/watch?v=${m.youtube}` : '';
  $('music-shuffle').checked = m.shuffle;
  $('music-vol').value = String(screenCfg.volumes?.music ?? 0.35);
}
async function loadTracks() {
  const r = await api('/api/music/tracks');
  const t = r.tracks ?? [];
  $('music-count').textContent = `${t.length} bài trong thư mục nhạc`;
  $('music-tracks').replaceChildren(...t.map((x) => h('li', {}, x)));
}
async function loadScreen() {
  const r = await api('/api/game/config');
  if (!r.ok) return msg(r.message, 'err');
  screenCfg = r.config;
  screenCfg.layout ??= {};
  renderLayout(); renderMusic(); loadTracks();
}
$('lay-reset-all').addEventListener('click', () => { screenCfg.layout = Object.fromEntries(Object.keys(LAY_NAMES).map((k) => [k, LAY_DEFAULT(k)])); saveCfgPart('lay-all', { layout: screenCfg.layout }, 0); renderLayout(); });
$('lay-compact').addEventListener('click', () => {
  // Gọn: bảng Diễn biến/TOP nhỏ lại, nép sát mép trên, nhường giữa màn hình cho cần thủ; banner dời lên cao
  const L = screenCfg.layout;
  L.feed = { ...LAY_DEFAULT('feed'), ...L.feed, scale: 0.7, dx: -70, dy: -110, opacity: 0.9 };
  L.lb = { ...LAY_DEFAULT('lb'), ...L.lb, scale: 0.7, dx: 75, dy: -110, opacity: 0.9 };
  L.banner = { ...LAY_DEFAULT('banner'), ...L.banner, scale: 0.85, dy: -120 };
  L.ticker = { ...LAY_DEFAULT('ticker'), ...L.ticker, dy: 560, scale: 0.85 };
  saveCfgPart('lay-all', { layout: L }, 0); renderLayout();
});
$('yt-apply').addEventListener('click', () => {
  saveCfgPart('music-yt', { music: { youtube: $('yt-url').value.trim(), mode: 'youtube' } }, 0);
  setTimeout(() => { if (screenCfg?.music && !screenCfg.music.youtube) msg('Link YouTube không hợp lệ.', 'err'); else renderMusic(); }, 600);
});
$('music-shuffle').addEventListener('change', (e) => saveCfgPart('music-sh', { music: { shuffle: e.target.checked } }, 0));
$('music-vol').addEventListener('input', (e) => saveCfgPart('music-vol', { volumes: { music: Number(e.target.value) } }));
$('music-refresh').addEventListener('click', () => { loadTracks(); saveCfgPart('music-re', { music: { mode: screenCfg.music?.mode ?? 'files' } }, 0); });
for (const b of document.querySelectorAll('[data-mcmd]')) b.addEventListener('click', async () => { const r = await api('/api/music/cmd', { method: 'POST', body: { cmd: b.dataset.mcmd } }); if (!r.ok) msg(r.message, 'err'); });

// ───────── Hệ thống ─────────
async function refreshMetrics() {
  const m = await api('/api/metrics');
  if (!m.ok) { dl('metrics', [['Lỗi', m.message]]); return; }
  const p = m.persist;
  const gi = m.ingest?.gifts;
  dl('metrics', [
    ['Thời gian chạy', `${m.uptimeSec}s`], ['RAM (rss/heap)', `${m.process.rssMb} / ${m.process.heapUsedMb} MB`],
    ['Độ trễ event loop p95', `${m.eventLoop.p95Ms} ms`], ['Bậc quá tải', m.overload?.level],
    ['Dữ liệu chưa ghi bền cũ nhất', `${p.oldestUnpersistedEventAgeMs} ms`], ['Batch chưa ACK cũ nhất', `${p.oldestUnackedBatchAgeMs} ms`],
    ['Bộ đệm ghi', `${p.writeBufferOps} op (${p.writeBufferLevel})`], ['Lần khởi động lại Worker', p.workerRestarts],
    ['Đĩa còn trống', p.worker?.freeBytes != null ? `${Math.round(p.worker.freeBytes / 1048576)} MB` : '—'],
    ['Sự kiện/giây', m.ingest?.eventsPerSec ?? 0], ['Quà: áp dụng / trùng / chờ', gi ? `${gi.counters.applied} / ${gi.counters.duplicates} / ${gi.pending}` : '—'],
    ['Trễ quà p95', gi?.latencyMs?.p95 != null ? `${gi.latencyMs.p95} ms` : '—'],
    ['Lần chạy trước tắt đột ngột', m.previousRunUnclean ? 'CÓ' : 'không']
  ]);
}
$('btn-refresh').addEventListener('click', refreshMetrics);
async function loadBackups() {
  const r = await api('/api/db/backups');
  if (!r.ok) return;
  const t = h('table', {}, h('tr', {}, ...['Bản sao lưu', 'Dung lượng', 'Lúc', ''].map((x) => h('th', {}, x))),
    ...r.backups.map((b) => h('tr', {}, h('td', {}, b.name), h('td', {}, `${Math.round(b.bytes / 1024)} KB`), h('td', {}, vnTime(b.atUtc)),
      h('td', {}, h('button', { type: 'button', class: 'mini danger-btn', onclick: () => dangerous('/api/db/restore', 'Đã lên lịch khôi phục — game đang khởi động lại.', { name: b.name }).then((x) => { if (x?.ok) setTimeout(() => location.reload(), 7000); }) }, 'Khôi phục')))));
  $('backups').replaceChildren(h('p', { class: 'small' }, `Dữ liệu ${r.realm === 'demo' ? 'DEMO' : 'LIVE'}. Khôi phục: game lưu an toàn, giữ DB hiện tại trong thư mục backups, rồi khởi động lại.`), t);
}
$('btn-backup').addEventListener('click', async () => { const r = await api('/api/db/backup', { method: 'POST', body: {} }); msg(r.ok ? `Đã sao lưu: ${r.name}` : r.message, r.ok ? 'ok' : 'err'); loadBackups(); });
async function loadLogs() {
  const r = await api(`/api/logs?level=${$('log-level').value}&limit=200`);
  if (!r.ok) return;
  $('logs').textContent = r.logs.map((l) => `${new Date(l.t).toLocaleTimeString('vi-VN')} ${l.level.toUpperCase().padEnd(5)} [${l.component}] ${l.msg}${l.fields ? ` ${JSON.stringify(l.fields)}` : ''}`).reverse().join('\n');
}
$('log-go').addEventListener('click', loadLogs);

async function refreshDevices() {
  const r = await api('/api/admin/devices');
  const box = $('devices');
  box.replaceChildren();
  if (!r.ok) return;
  const t = h('table', {}, h('tr', {}, h('th', {}, 'Thiết bị'), h('th', {}, 'Ghép đôi lúc'), h('th', {}, 'Lần cuối'), h('th', {}, 'Trạng thái'), h('th', {}, '')));
  for (const d of r.devices) {
    const isMe = d.device_id === r.currentDeviceId;
    const btn = d.revoked_at_utc === null ? h('button', { type: 'button', onclick: () => revokeDevice(d.device_id) }, 'Thu hồi') : '';
    t.append(h('tr', {}, h('td', {}, d.name + (isMe ? ' (thiết bị này)' : '')), h('td', {}, vnTime(d.paired_at_utc)), h('td', {}, vnTime(d.last_seen_utc)), h('td', {}, d.revoked_at_utc === null ? 'hoạt động' : 'đã thu hồi'), h('td', {}, btn)));
  }
  box.append(t);
}
async function revokeDevice(id) {
  const r = await api(`/api/admin/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: {} });
  msg(r.ok ? 'Đã thu hồi thiết bị.' : r.message, r.ok ? 'ok' : 'err');
  if (r.ok) refreshDevices();
}
let codeTimer = null;
$('btn-paircode').addEventListener('click', async () => {
  let r = await api('/api/admin/pair-code', { method: 'POST', body: {} });
  if (r.code === 'REAUTH_REQUIRED' && await reauth()) r = await api('/api/admin/pair-code', { method: 'POST', body: {} });
  if (!r.ok) { msg(r.message, 'err'); return; }
  const out = $('paircode-out');
  out.hidden = false;
  clearInterval(codeTimer);
  const tick = () => {
    const left = Math.max(0, Math.round((r.expiresAtUtc - Date.now()) / 1000));
    out.textContent = left > 0 ? `${r.code}   (còn ${left}s, dùng một lần)` : 'Mã đã hết hạn.';
    if (left <= 0) clearInterval(codeTimer);
  };
  tick();
  codeTimer = setInterval(tick, 1000);
});
$('btn-cancelcode').addEventListener('click', async () => {
  const r = await api('/api/admin/pair-code', { method: 'DELETE' });
  clearInterval(codeTimer);
  $('paircode-out').hidden = true;
  msg(r.cancelled ? 'Đã huỷ mã.' : 'Không có mã nào đang hiệu lực.', 'ok');
});

// ───────── thao tác nguy hiểm: xác nhận gõ tay + xác thực lại ─────────
async function reauth() {
  const local = await api('/api/admin/reauth', { method: 'POST', body: { local: true } }); // cùng máy: không cần nhập gì
  if (local.ok) return true;
  if (health.passwordLogin) {
    const password = window.prompt('Cần xác thực lại. Nhập mật khẩu Admin:');
    if (!password) return false;
    const r = await api('/api/admin/reauth', { method: 'POST', body: { password } });
    if (!r.ok) msg(r.message, 'err');
    return r.ok;
  }
  const pairCode = window.prompt('Cần xác thực lại. Tại cửa sổ khởi chạy gõ p rồi Enter, rồi dán MÃ GHÉP ĐÔI MỚI vào đây:');
  if (!pairCode) return false;
  const r = await api('/api/admin/reauth', { method: 'POST', body: { pairCode } });
  if (!r.ok) msg(r.message, 'err');
  return r.ok;
}
async function dangerous(path, doneText, extra = {}) {
  const confirm = window.prompt('THAO TÁC NGUY HIỂM. Gõ đúng XAC NHAN để tiếp tục:');
  if (confirm !== 'XAC NHAN') { msg('Đã huỷ (chưa gõ đúng XAC NHAN).', ''); return null; }
  let r = await api(path, { method: 'POST', body: { confirm, ...extra } });
  if (r.code === 'REAUTH_REQUIRED' && await reauth()) r = await api(path, { method: 'POST', body: { confirm, ...extra } });
  msg(r.ok ? doneText : r.message, r.ok ? 'ok' : 'err');
  return r;
}
$('btn-revokeall').addEventListener('click', async () => {
  const r = await dangerous('/api/admin/revoke-all', 'Đã thu hồi tất cả thiết bị. Hãy ghép đôi lại.');
  if (r?.ok) { csrf = null; show(false); }
});
$('btn-safeexit').addEventListener('click', () => dangerous('/api/world/stop', 'Đang lưu an toàn rồi tắt game…'));

init();
