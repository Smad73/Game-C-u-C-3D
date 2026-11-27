// API gameplay cho trang Control. Mọi route thay đổi trạng thái: phiên admin + CSRF (http.js `admin`); thao tác nguy hiểm: `dangerous`.
// Đọc DB qua Worker (không chặn luồng chính). Không trả khoá bí mật (API key nhà cung cấp chỉ báo "có/không").
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_PUBLIC } from './game/publicCatalog.js';
import { PROVIDERS } from './ingest/LiveConnector.js';
import { WORLD_EVENT_KINDS } from './game/catalog.js';
import { readProviderApiKey } from './system/Settings.js';

/** Tệp nhạc phát được trên stage (không có dấu / — chỉ tệp nằm thẳng trong thư mục nhạc). */
const MUSIC_FILE = /^[^/\\]{1,120}\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i;

const FIRST = ['Minh', 'Lan', 'Hùng', 'Thảo', 'Tuấn', 'Ngọc', 'Phúc', 'Linh', 'Khoa', 'Vy', 'Đạt', 'Hà', 'Nam', 'Trang', 'Bảo', 'An', 'Quân', 'My', 'Sơn', 'Yến'];
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Huỳnh'];
const demoName = (i) => `${LAST[i % LAST.length]} ${FIRST[Math.floor(i / LAST.length) % FIRST.length]}${i >= 200 ? ` ${Math.floor(i / 200)}` : ''}`;

export const runModeFile = (dataDir) => join(dataDir, 'run-mode.json');
export const restorePendingDir = (dataDir) => join(dataDir, 'restore-pending');

export function mountGameRoutes(app, d) {
  const { admin, requireAdmin, dangerous, wrap, fail, audit, clientIp, world, leaderboards, gameConfig, persistence, ingest, logger, realm, settings, dataDir, shutdown, root = null, gateway = null } = d;
  const who = (req, action, detail = null, result = 'ok') => audit.record({ deviceId: req.session?.deviceId, ip: clientIp(req), action, detail: detail ? String(detail).slice(0, 300) : null, result });
  const isMock = () => Boolean(ingest && typeof ingest.conn.inject === 'function');

  // ── công khai: danh mục hiển thị (không nhạy cảm) ──
  app.get('/api/catalog', (_req, res) => res.json({ ok: true, catalog: CATALOG_PUBLIC }));

  // ── tổng quan thế giới ──
  app.get('/api/game', requireAdmin, wrap(async (_req, res) => {
    const [stats] = await persistence.read('game_stats', { dayStartUtc: Date.now() - 86400000 });
    res.json({ ok: true, realm, ingestMode: settings.ingest.mode, world: world.metrics(), stats, config: gameConfig.config, labels: leaderboards.labels(),
      live: ingest ? { connector: ingest.conn.snapshot(), session: ingest.sessions?.snapshot() ?? null } : null });
  }));
  app.post('/api/world/pause', ...admin, wrap(async (req, res) => { world.pause(); await who(req, 'world_pause'); res.json({ ok: true, state: world.state }); }));
  app.post('/api/world/resume', ...admin, wrap(async (req, res) => { world.resume(); await who(req, 'world_resume'); res.json({ ok: true, state: world.state }); }));

  // ── cấu hình gameplay & Gift Mapping ──
  app.get('/api/game/config', requireAdmin, (_req, res) => res.json({ ok: true, config: gameConfig.config }));

  // ── Nhạc nền (ADR-0028): danh sách tệp trong public/stage/assets/music (công khai, chỉ tên tệp) + lệnh phát cho stage ──
  const musicDir = root ? join(root, 'public', 'stage', 'assets', 'music') : null;
  app.get('/api/music/tracks', (_req, res) => {
    let tracks = [];
    try { if (musicDir && existsSync(musicDir)) tracks = readdirSync(musicDir).filter((f) => MUSIC_FILE.test(f) && !f.startsWith('.') && statSync(join(musicDir, f)).isFile()).sort((a, b) => a.localeCompare(b)); } catch { tracks = []; }
    res.json({ ok: true, tracks: tracks.slice(0, 500) });
  });
  app.post('/api/music/cmd', ...admin, wrap(async (req, res) => {
    const cmd = req.body?.cmd;
    if (!['play', 'pause', 'next', 'prev'].includes(cmd)) return fail(res, 400, 'BAD_CMD', 'Lệnh nhạc không hợp lệ (play/pause/next/prev).');
    gateway?.()?.broadcastStage({ type: 'music', cmd });
    await who(req, 'music_cmd', cmd);
    return res.json({ ok: true });
  }));
  app.put('/api/game/config', ...admin, wrap(async (req, res) => {
    const c = await gameConfig.setConfig(req.body?.config ?? {});
    await who(req, 'game_config', JSON.stringify(c).slice(0, 300));
    res.json({ ok: true, config: c });
  }));
  app.get('/api/gift-rules', requireAdmin, (_req, res) => res.json({ ok: true, rules: gameConfig.rules, actions: CATALOG_PUBLIC.giftActions }));
  app.put('/api/gift-rules', ...admin, wrap(async (req, res) => {
    const r = await gameConfig.setRules(req.body?.rules ?? {});
    await who(req, 'gift_rules', `${r.rules.length} luật`);
    res.json({ ok: true, rules: r });
  }));
  app.post('/api/gift-rules/reset', ...admin, wrap(async (req, res) => { const r = await gameConfig.resetRules(); await who(req, 'gift_rules_reset'); res.json({ ok: true, rules: r }); }));

  // ── BXH (toàn bộ người chơi, phân trang) ──
  app.get('/api/leaderboard', requireAdmin, wrap(async (req, res) => {
    const scope = String(req.query.scope || 'live');
    try {
      const r = await leaderboards.query(scope, { period: req.query.period ? String(req.query.period).slice(0, 40) : undefined, offset: Math.max(0, Number(req.query.offset) | 0), limit: Math.min(200, Math.max(1, Number(req.query.limit) | 0 || 20)) });
      res.json({ ok: true, ...r });
    } catch (e) { fail(res, 400, e.code || 'BAD_REQUEST', e.message); }
  }));
  app.get('/api/leaderboard/periods', requireAdmin, wrap(async (req, res) => {
    const scope = ['live', 'day', 'week'].includes(req.query.scope) ? req.query.scope : 'day';
    res.json({ ok: true, periods: (await persistence.read('lb_periods', { scope })).map((r) => r.period_key) });
  }));

  // ── người chơi ──
  app.get('/api/players', requireAdmin, wrap(async (req, res) => {
    const rows = await persistence.read('players_search', { q: String(req.query.q ?? '').slice(0, 60), offset: Number(req.query.offset) | 0, limit: Number(req.query.limit) | 0 || 30 });
    const [{ n }] = await persistence.read('players_count');
    res.json({ ok: true, total: n, players: rows.map((r) => ({ ...r, hot: world.playerInfo(r.player_key)?.state ?? 'COLD' })) });
  }));
  app.get('/api/players/:key', requireAdmin, wrap(async (req, res) => {
    const key = String(req.params.key).slice(0, 80);
    const prof = (await persistence.read('player_profile', { player_key: key, now: Date.now() }))[0] ?? null;
    if (!prof && !world.playerInfo(key)) return fail(res, 404, 'NOT_FOUND', 'Không có người chơi này.');
    const ranks = {};
    for (const s of ['live', 'hour', 'day', 'week', 'all']) ranks[s] = (await leaderboards.rank(s, key))?.rank ?? null;
    return res.json({ ok: true, profile: prof, hot: world.playerInfo(key), ranks });
  }));
  app.post('/api/players/:key/:action', ...admin, wrap(async (req, res) => {
    const key = String(req.params.key).slice(0, 80);
    const action = String(req.params.action);
    if (!['wake', 'afk', 'spotlight'].includes(action)) return fail(res, 400, 'BAD_ACTION', 'Thao tác không hợp lệ.');
    const ok = world.adminPlayer(key, action);
    await who(req, `player_${action}`, key, ok ? 'ok' : 'not_hot');
    return ok ? res.json({ ok: true }) : fail(res, 409, 'NOT_HOT', 'Người chơi chưa vào game trong lần chạy này (đang ở DB).');
  }));

  // ── sự kiện thế giới / Boss ──
  app.get('/api/events', requireAdmin, wrap(async (_req, res) => res.json({ ok: true, ...world.events.snapshot(), recent: await persistence.read('events_recent', { limit: 30 }) })));
  app.post('/api/events/trigger', ...admin, wrap(async (req, res) => {
    const kind = String(req.body?.kind || '');
    if (!WORLD_EVENT_KINDS[kind]) return fail(res, 400, 'BAD_EVENT', 'Loại sự kiện không hợp lệ.');
    const ev = world.events.enqueue({ kind, source: 'ADMIN', level: Number(req.body?.level) | 0 || 1 });
    await who(req, 'event_trigger', `${kind} L${ev.level}`);
    return res.json({ ok: true, id: ev.id });
  }));
  app.post('/api/events/:id/cancel', ...admin, wrap(async (req, res) => {
    const ok = world.events.cancel(String(req.params.id).slice(0, 80));
    await who(req, 'event_cancel', req.params.id, ok ? 'ok' : 'none');
    res.json({ ok });
  }));

  // ── Demo (chỉ realm demo + MockConnector; KHÔNG bao giờ chạm DB LIVE) ──
  const demoOnly = (req, res, next) => {
    if (realm !== 'demo' || !isMock()) return fail(res, 409, 'NOT_DEMO', 'Chỉ dùng được ở chế độ Demo.');
    if (ingest.conn.state !== 'CONNECTED') return fail(res, 409, 'NOT_CONNECTED', 'Nguồn giả lập chưa kết nối — bấm "Kết nối" ở tab LIVE / Demo.');
    return next();
  };
  let demoSeq = 0;
  const demoUser = (i) => ({ userId: `v${i}`, uniqueId: `viewer${i}`, nickname: demoName(i) });
  const injectRaw = (raw) => ingest.conn.inject({ msgId: `adm${Date.now()}${++demoSeq}`, createTime: Date.now(), roomId: ingest.conn.roomId, ...raw });
  app.post('/api/demo/comment', ...admin, demoOnly, (req, res) => {
    const i = Math.max(0, Number(req.body?.user) | 0);
    res.json({ ok: injectRaw({ type: 'chat', user: demoUser(i), comment: String(req.body?.text || 'câu').slice(0, 150) }) !== false });
  });
  app.post('/api/demo/gift', ...admin, demoOnly, (req, res) => {
    const i = Math.max(0, Number(req.body?.user) | 0);
    const giftId = Number(req.body?.giftId) | 0 || 5655;
    const rule = gameConfig.ruleFor(giftId);
    const count = Math.min(99, Math.max(1, Number(req.body?.count) | 0 || 1));
    res.json({ ok: injectRaw({ type: 'gift', user: demoUser(i), giftId, giftName: rule.label || `Quà ${giftId}`, diamondCount: Math.max(0, Number(req.body?.diamond) | 0 || 1), giftType: 2, repeatCount: count, repeatEnd: true }) !== false });
  });
  app.post('/api/demo/like', ...admin, demoOnly, (req, res) => {
    const i = Math.max(0, Number(req.body?.user) | 0);
    res.json({ ok: injectRaw({ type: 'like', user: demoUser(i), likeCount: Math.min(1000, Math.max(1, Number(req.body?.count) | 0 || 10)) }) !== false });
  });
  app.post('/api/demo/bulk-join', ...admin, demoOnly, (req, res) => {
    const n = Math.min(20000, Math.max(1, Number(req.body?.count) | 0 || 20)); // trần một lần bấm (bảo vệ hàng đợi), không phải trần người chơi
    const start = Math.max(0, Number(req.body?.from) | 0 || 1000 + Math.floor(Math.random() * 100000));
    let i = 0;
    const step = () => { for (let k = 0; k < 500 && i < n; k++, i++) injectRaw({ type: 'chat', user: demoUser(start + i), comment: 'câu' }); if (i < n) setTimeout(step, 50); };
    step();
    res.json({ ok: true, count: n });
  });
  app.post('/api/demo/rates', ...admin, (req, res, next) => (realm === 'demo' && isMock() ? next() : fail(res, 409, 'NOT_DEMO', 'Chỉ dùng được ở chế độ Demo.')), (req, res) => {
    const sc = ingest.conn.sc;
    for (const k of ['commentsPerSec', 'giftsPerSec', 'likesPerSec', 'followsPerSec', 'sharesPerSec', 'joinsPerSec', 'users']) {
      if (req.body?.[k] !== undefined) sc[k] = Math.min(k === 'users' ? 1000000 : 5000, Math.max(0, Number(req.body[k]) || 0));
    }
    res.json({ ok: true, rates: { commentsPerSec: sc.commentsPerSec, giftsPerSec: sc.giftsPerSec, likesPerSec: sc.likesPerSec, followsPerSec: sc.followsPerSec, sharesPerSec: sc.sharesPerSec, joinsPerSec: sc.joinsPerSec, users: sc.users } });
  });
  app.get('/api/demo/rates', requireAdmin, (_req, res) => {
    if (!isMock()) return res.json({ ok: true, rates: null });
    const sc = ingest.conn.sc;
    return res.json({ ok: true, rates: { commentsPerSec: sc.commentsPerSec, giftsPerSec: sc.giftsPerSec, likesPerSec: sc.likesPerSec, followsPerSec: sc.followsPerSec, sharesPerSec: sc.sharesPerSec, joinsPerSec: sc.joinsPerSec, users: sc.users } });
  });

  // ── TikTok LIVE: trạng thái nhà cung cấp + chế độ chạy (áp dụng khi khởi động lại) ──
  app.get('/api/tiktok/status', requireAdmin, wrap(async (_req, res) => {
    const providers = {};
    for (const [id, p] of Object.entries(PROVIDERS)) {
      let installed = false;
      try { await import(p.pkg); installed = true; } catch { installed = false; }
      providers[id] = { ...p, installed, keyPresent: p.needsKey ? Boolean(readProviderApiKey()) : null };
    }
    res.json({ ok: true, mode: settings.ingest.mode, username: settings.ingest.live.username, provider: settings.ingest.live.provider, providers,
      connector: ingest ? ingest.conn.snapshot() : null, session: ingest?.sessions?.snapshot() ?? null, verifiedOnRealLive: false });
  }));
  app.put('/api/run-mode', ...admin, wrap(async (req, res) => {
    const mode = String(req.body?.mode || '');
    if (!['demo', 'live', 'off'].includes(mode)) return fail(res, 400, 'BAD_MODE', 'Chế độ phải là demo | live | off.');
    const username = req.body?.username ? String(req.body.username).replace(/^@/, '').trim() : null;
    if (mode === 'live' && (!username || !/^[A-Za-z0-9._]{2,24}$/.test(username))) return fail(res, 400, 'BAD_USERNAME', 'Cần @username TikTok hợp lệ cho chế độ LIVE.');
    const provider = PROVIDERS[req.body?.provider] ? req.body.provider : settings.ingest.live.provider;
    writeFileSync(runModeFile(dataDir), JSON.stringify({ mode, username, provider, savedAtUtc: Date.now() }, null, 2));
    await who(req, 'run_mode', `${mode} ${username ?? ''} ${provider}`);
    res.json({ ok: true, message: 'Đã lưu. Bấm "Khởi động lại" để áp dụng.' });
  }));
  app.post('/api/system/restart', ...admin, wrap(async (req, res) => {
    await who(req, 'restart');
    res.status(202).json({ ok: true, message: 'Đang lưu an toàn rồi khởi động lại (khoảng 5 giây).' });
    setImmediate(() => shutdown.run('api:restart', { exitCode: 75 }));
  }));

  // ── sao lưu / khôi phục ──
  const backupDir = join(dataDir, 'backups');
  app.get('/api/db/backups', requireAdmin, (_req, res) => {
    const list = existsSync(backupDir) ? readdirSync(backupDir).filter((f) => f.endsWith('.db')).map((f) => { const st = statSync(join(backupDir, f)); return { name: f, bytes: st.size, atUtc: st.mtimeMs }; }).sort((a, b) => b.atUtc - a.atUtc) : [];
    res.json({ ok: true, realm, backups: list, persist: persistence.metrics() });
  });
  app.post('/api/db/backup', ...admin, wrap(async (req, res) => {
    const name = `manual-${realm}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const path = await persistence.backup(name);
    await who(req, 'db_backup', name);
    res.json({ ok: true, name: `${name}.db`, path });
  }));
  app.post('/api/db/restore', ...admin, dangerous('db_restore'), wrap(async (req, res) => {
    const name = String(req.body?.name || '');
    if (!/^[A-Za-z0-9._-]{1,120}\.db$/.test(name) || !existsSync(join(backupDir, name))) return fail(res, 400, 'BAD_BACKUP', 'Không có bản sao lưu này.');
    mkdirSync(restorePendingDir(dataDir), { recursive: true });
    copyFileSync(join(backupDir, name), join(restorePendingDir(dataDir), `nova-${realm}.db`));
    writeFileSync(join(restorePendingDir(dataDir), 'restore.json'), JSON.stringify({ realm, from: name, requestedAtUtc: Date.now() }));
    await audit.record({ ...req.audit, detail: name, result: 'scheduled' });
    res.status(202).json({ ok: true, message: `Đã lên lịch khôi phục từ ${name}. Game sẽ lưu an toàn rồi khởi động lại; DB hiện tại được giữ lại trong backups/.` });
    setImmediate(() => shutdown.run('api:restore', { exitCode: 75 }));
  }));

  // ── nhật ký ──
  app.get('/api/logs', requireAdmin, (req, res) => {
    const lvl = ['debug', 'info', 'warn', 'error'].indexOf(String(req.query.level || 'info'));
    const rows = (logger?.tail?.(600) ?? []).filter((r) => ['debug', 'info', 'warn', 'error'].indexOf(r.level) >= Math.max(0, lvl)).slice(-Math.min(500, Number(req.query.limit) | 0 || 200));
    res.json({ ok: true, logs: rows });
  });
}
