// Cấu hình theo lớp: config/default.json → config/platform/<os>.json → config/local.json (tuỳ chọn, không commit)
// → biến môi trường NOVA_* → overrides (dùng trong test). Bí mật (mật khẩu Admin) KHÔNG nằm trong đối tượng Settings.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformId, projectRoot } from './platform.js';

export class SettingsError extends Error {
  constructor(problems) {
    super(`Cấu hình không hợp lệ:\n - ${problems.join('\n - ')}`);
    this.name = 'SettingsError';
    this.problems = problems;
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

function deepFreeze(o) {
  if (isObj(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

function readJson(path, { optional = false } = {}) {
  if (!existsSync(path)) {
    if (optional) return {};
    throw new SettingsError([`Không tìm thấy tệp cấu hình: ${path}`]);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new SettingsError([`Tệp cấu hình không phải JSON hợp lệ: ${path} (${e.message})`]);
  }
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Luật kiểm tra: [đường dẫn, kiểu, tuỳ chọn]
const RULES = [
  ['server.port', 'int', { min: 0, max: 65535 }],
  ['server.mode', 'enum', { values: ['local', 'lan'] }],
  ['server.lanHost', 'string?', {}],
  ['timezone', 'string', {}],
  ['dataDir', 'string?', {}],
  ['logging.level', 'enum', { values: ['debug', 'info', 'warn', 'error'] }],
  ['logging.toFile', 'bool', {}],
  ['logging.retainDays', 'int', { min: 1, max: 365 }],
  ['shutdown.deadlineMs', 'int', { min: 500, max: 120000 }],
  ['shutdown.stepTimeoutMs', 'int', { min: 100, max: 60000 }],
  ['persistence.maxInFlightBatches', 'int', { min: 1, max: 16 }],
  ['persistence.ackTimeoutMs', 'int', { min: 100, max: 120000 }],
  ['persistence.maxRestarts', 'int', { min: 0, max: 100 }],
  ['persistence.restartBackoffMs', 'int', { min: 0, max: 60000 }],
  ['persistence.maxRetryAttempts', 'int', { min: 0, max: 100 }],
  ['persistence.retryBackoffMs', 'int', { min: 0, max: 60000 }],
  ['persistence.busyTimeoutMs', 'int', { min: 0, max: 60000 }],
  ['persistence.healthIntervalMs', 'int', { min: 100, max: 600000 }],
  ['persistence.writeBufferSoftMax', 'int', { min: 1 }],
  ['persistence.writeBufferHardMax', 'int', { min: 1 }],
  ['overload.evaluateIntervalMs', 'int', { min: 100, max: 60000 }],
  ['overload.recoverAfterOkTicks', 'int', { min: 1, max: 1000 }],
  ['security.pairCodeTtlMs', 'int', { min: 1000, max: 600000 }],
  ['security.sessionIdleMs', 'int', { min: 60000 }],
  ['security.reauthWindowMs', 'int', { min: 1000 }],
  ['security.loginMaxPerMinute', 'int', { min: 1, max: 1000 }],
  ['security.restMaxPerMinute', 'int', { min: 1, max: 100000 }],
  ['security.jsonBodyLimitBytes', 'int', { min: 256, max: 1048576 }],
  ['security.wsMaxMessageBytes', 'int', { min: 256, max: 1048576 }],
  ['security.wsMaxMessagesPerSec', 'int', { min: 1, max: 10000 }],
  ['security.adminPasswordMinLength', 'int', { min: 8, max: 128 }],
  ['overload.ingestEventsPerSec', 'int', { min: 1 }],
  ['ingest.mode', 'enum', { values: ['off', 'live', 'demo'] }],
  ['ingest.autoConnect', 'bool', {}],
  ['ingest.live.username', 'string?', {}],
  ['ingest.live.provider', 'enum', { values: ['tiktok-live-connector', 'tiktool'] }],
  ['ingest.reconnect.maxAttempts', 'int', { min: 0, max: 50 }],
  ['ingest.reconnect.baseDelayMs', 'int', { min: 10, max: 600000 }],
  ['ingest.reconnect.maxDelayMs', 'int', { min: 10, max: 3600000 }],
  ['ingest.pipeline.drainPerTick', 'int', { min: 1 }],
  ['ingest.pipeline.tickMs', 'int', { min: 5, max: 10000 }],
  ['ingest.pipeline.commentsPerUserPerSec', 'int', { min: 1, max: 1000 }],
  ['ingest.queue.criticalSoftMax', 'int', { min: 1 }],
  ['ingest.queue.progressMax', 'int', { min: 1 }],
  ['ingest.queue.stateMax', 'int', { min: 1 }],
  ['ingest.queue.logMax', 'int', { min: 1 }],
  ['ingest.journal.groupCommitMs', 'int', { min: 0, max: 1000 }],
  ['ingest.journal.maxBatchGifts', 'int', { min: 1, max: 2000 }],
  ['ingest.journal.maxGiftAttempts', 'int', { min: 1, max: 100 }],
  ['ingest.journal.retryFailedMs', 'int', { min: 50, max: 600000 }],
  ['ingest.journal.emergency.ramGiftsMax', 'int', { min: 10 }]
];

export function validateSettings(s) {
  const problems = [];
  for (const [path, type, o] of RULES) {
    const v = getPath(s, path);
    if (type.endsWith('?') && (v === null || v === undefined)) continue;
    const t = type.replace('?', '');
    if (t === 'int') {
      if (!Number.isInteger(v)) problems.push(`${path} phải là số nguyên (đang là ${JSON.stringify(v)})`);
      else if ((o.min !== undefined && v < o.min) || (o.max !== undefined && v > o.max)) problems.push(`${path}=${v} ngoài khoảng cho phép [${o.min ?? '-∞'}, ${o.max ?? '+∞'}]`);
    } else if (t === 'bool') {
      if (typeof v !== 'boolean') problems.push(`${path} phải là true/false`);
    } else if (t === 'string') {
      if (typeof v !== 'string' || v.length === 0) problems.push(`${path} phải là chuỗi không rỗng`);
    } else if (t === 'enum') {
      if (!o.values.includes(v)) problems.push(`${path}=${JSON.stringify(v)} không hợp lệ (cho phép: ${o.values.join(', ')})`);
    }
  }
  if (s.persistence && s.persistence.writeBufferSoftMax >= s.persistence.writeBufferHardMax) {
    problems.push('persistence.writeBufferSoftMax phải nhỏ hơn writeBufferHardMax');
  }
  return problems;
}

const ENV_MAP = [
  ['NOVA_PORT', 'server.port', 'int'],
  ['NOVA_MODE', 'server.mode', 'string'],
  ['NOVA_LAN_HOST', 'server.lanHost', 'string'],
  ['NOVA_DATA_DIR', 'dataDir', 'string'],
  ['NOVA_LOG_LEVEL', 'logging.level', 'string'],
  ['NOVA_INGEST_MODE', 'ingest.mode', 'string'],
  ['NOVA_TIKTOK_USERNAME', 'ingest.live.username', 'string'],
  ['NOVA_TIKTOK_PROVIDER', 'ingest.live.provider', 'string']
];

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] = isObj(o[k]) ? o[k] : {};
  o[keys.at(-1)] = value;
}

/**
 * Nạp và kiểm tra cấu hình. Ném SettingsError (tiếng Việt) nếu sai.
 * @returns {{ settings: object, sources: string[] }}
 */
export function loadSettings({ root = projectRoot(), env = process.env, platform = platformId(), overrides = {} } = {}) {
  const sources = [];
  let s = readJson(join(root, 'config', 'default.json'));
  sources.push('config/default.json');

  const platFile = join(root, 'config', 'platform', `${platform}.json`);
  if (existsSync(platFile)) {
    s = deepMerge(s, readJson(platFile));
    sources.push(`config/platform/${platform}.json`);
  } else {
    sources.push(`(không có config/platform/${platform}.json — nền tảng ngoài phạm vi V1)`);
  }

  const localFile = join(root, 'config', 'local.json');
  if (existsSync(localFile)) {
    s = deepMerge(s, readJson(localFile));
    sources.push('config/local.json');
  }

  const fromEnv = {};
  for (const [name, path, type] of ENV_MAP) {
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    setPath(fromEnv, path, type === 'int' ? Number(raw) : raw);
    sources.push(`env ${name}`);
  }
  s = deepMerge(s, fromEnv);
  s = deepMerge(s, overrides);

  const problems = validateSettings(s);
  if (problems.length) throw new SettingsError(problems);
  return { settings: deepFreeze(s), sources };
}

/** Khoá API của nhà cung cấp kết nối TikTok (bí mật): chỉ từ biến môi trường, không bao giờ vào cấu hình/log. */
export function readProviderApiKey(env = process.env) {
  return env.NOVA_TIKTOOL_API_KEY || null;
}

/** Mật khẩu Admin do người dùng tự đặt qua môi trường (hoặc được launcher hỏi). Không bao giờ ghi vào log/cấu hình. */
export function readAdminPassword(env = process.env) {
  return env.NOVA_ADMIN_PASSWORD || null;
}

/** Điều kiện bảo mật trước khi chạy (ADR-0020 mục 1): chế độ LAN bắt buộc có mật khẩu đủ dài. */
export function assertSecurityPreconditions(settings, adminPassword) {
  const problems = [];
  if (settings.server.mode === 'lan') {
    const min = settings.security.adminPasswordMinLength;
    if (!adminPassword) problems.push(`Chế độ điện thoại (LAN) bắt buộc đặt mật khẩu Admin (tối thiểu ${min} ký tự).`);
    else if (adminPassword.length < min) problems.push(`Mật khẩu Admin quá ngắn (cần tối thiểu ${min} ký tự).`);
  }
  if (problems.length) throw new SettingsError(problems);
}
