// Logger có mức, ghi stdout + tệp theo ngày (UTC). Không log bí mật: khoá nhạy cảm bị che, tệp lỗi → chuyển sang stderr
// (ADR-0019, CODING_STANDARDS). Định dạng tệp: JSON mỗi dòng.
import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /(pass(word|wd)?|token|secret|cookie|authorization|csrf|pair_?code|view_?key|\bsid\b|session_?id)/i;
const SENSITIVE_IN_TEXT = /\b(password|passwd|token|secret|authorization)\s*[=:]\s*[^\s,;]+/gi;
// Khoá API nhà cung cấp kết nối TikTok (A17) — che cả theo tên trường lẫn trong chuỗi.
const SENSITIVE_KEY_EXTRA = /api_?key/i;
const SENSITIVE_TEXT_EXTRA = /\b(api_?key|apiKey)\s*[=:]\s*[^\s,;&]+/gi;
const MAX_STR = 600;

export function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const t = value.replace(SENSITIVE_IN_TEXT, '$1=***').replace(SENSITIVE_TEXT_EXTRA, '$1=***');
    return t.length > MAX_STR ? `${t.slice(0, MAX_STR)}…(+${t.length - MAX_STR})` : t;
  }
  if (typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1), code: value.code };
  if (depth >= 4) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) || SENSITIVE_KEY_EXTRA.test(k) ? '***' : redact(v, depth + 1);
  return out;
}

const utcDay = (d) => d.toISOString().slice(0, 10);

export class Logger {
  /**
   * @param {{level?:string, dir?:string|null, toFile?:boolean, stdout?:boolean, retainDays?:number,
   *          now?:()=>Date, writeStdout?:(s:string)=>void}} o
   */
  constructor({ level = 'info', dir = null, toFile = true, stdout = true, retainDays = 14, now = () => new Date(), writeStdout = null } = {}) {
    this.threshold = LEVELS[level] ?? LEVELS.info;
    this.dir = dir;
    this.toFile = Boolean(toFile && dir);
    this.stdout = stdout;
    this.now = now;
    this.writeStdout = writeStdout || ((s) => process.stdout.write(s));
    this.stream = null;
    this.streamDay = null;
    this.fileBroken = false;
    this.component = 'app';
    this.recent = []; // vòng đệm bản ghi gần nhất (đã che bí mật) cho trang Control
    if (this.toFile) this.#prepareDir(retainDays);
  }

  /** Logger con gắn tên thành phần; dùng chung luồng ghi tệp với logger cha. */
  child(component) {
    const parent = this;
    return {
      debug: (msg, fields) => parent.#log('debug', msg, fields, component),
      info: (msg, fields) => parent.#log('info', msg, fields, component),
      warn: (msg, fields) => parent.#log('warn', msg, fields, component),
      error: (msg, fields) => parent.#log('error', msg, fields, component),
      child: (name) => parent.child(name),
      tail: (n) => parent.tail(n),
      close: () => parent.close()
    };
  }

  /** n bản ghi gần nhất (mới nhất cuối). */
  tail(n = 200) { return this.recent.slice(-Math.max(1, Math.min(600, n))); }

  debug(msg, fields) { this.#log('debug', msg, fields, this.component); }
  info(msg, fields) { this.#log('info', msg, fields, this.component); }
  warn(msg, fields) { this.#log('warn', msg, fields, this.component); }
  error(msg, fields) { this.#log('error', msg, fields, this.component); }

  #prepareDir(retainDays) {
    try {
      mkdirSync(this.dir, { recursive: true });
      const limit = this.now().getTime() - retainDays * 86400000;
      for (const f of readdirSync(this.dir)) {
        if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue; // chỉ dọn tệp do chính Logger tạo
        const p = join(this.dir, f);
        if (statSync(p).mtimeMs < limit) unlinkSync(p);
      }
    } catch (e) {
      this.#fileProblem(e);
    }
  }

  #fileProblem(e) {
    if (this.fileBroken) return;
    this.fileBroken = true;
    process.stderr.write(`[logger] Không ghi được tệp log (${e.code || e.message}); chuyển sang chỉ in ra màn hình.\n`);
  }

  #openStream(day) {
    if (this.stream) this.stream.end();
    const file = join(this.dir, `app-${day}.log`);
    this.stream = createWriteStream(file, { flags: 'a' });
    this.stream.on('error', (e) => this.#fileProblem(e));
    this.streamDay = day;
  }

  #log(level, msg, fields, component) {
    if (LEVELS[level] < this.threshold) return;
    const t = this.now();
    const safe = fields === undefined ? undefined : redact(fields);
    this.recent.push({ t: t.getTime(), level, component, msg: redact(String(msg)), ...(safe === undefined ? {} : { fields: safe }) });
    if (this.recent.length > 600) this.recent.splice(0, 100);
    if (this.stdout) {
      const extra = safe === undefined ? '' : ` ${JSON.stringify(safe)}`;
      this.writeStdout(`${t.toISOString()} ${level.toUpperCase().padEnd(5)} [${component}] ${redact(String(msg))}${extra}\n`);
    }
    if (this.toFile && !this.fileBroken && !this.closed) {
      try {
        const day = utcDay(t);
        if (this.streamDay !== day || !this.stream) this.#openStream(day);
        this.stream.write(`${JSON.stringify({ t: t.toISOString(), level, component, msg: redact(String(msg)), ...(safe === undefined ? {} : { fields: safe }) })}\n`);
      } catch (e) {
        this.#fileProblem(e);
      }
    }
  }

  /** Đóng tệp và chờ ghi xong. */
  close() {
    this.closed = true; // sau khi đóng: chỉ còn in ra màn hình, không mở lại tệp
    return new Promise((done) => {
      if (!this.stream) return done();
      const s = this.stream;
      this.stream = null;
      s.end(() => done());
    });
  }
}
