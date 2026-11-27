// check-portability.js — quét lỗi phụ thuộc hệ điều hành (ADR-0015 mục 6, ARCHITECTURE §0.3 mục 5).
// Chạy: `npm run check:portability` (hoặc `node tools/check-portability.js [--root <thư-mục>] [--json]`). Mã thoát: 0 = sạch, 1 = có vi phạm.
// Luật P01–P11 (xem RULES bên dưới). Một dòng có chú thích `portability-ok` được miễn các luật nội dung (cần ghi lý do bên cạnh).
// Công cụ này tự chỉ dùng API Node đa nền tảng; chạy được trên macOS và Windows (kể cả CI).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = Object.freeze({
  P01: 'Đường dẫn tuyệt đối viết cứng (máy Mac/Linux/Windows) trong mã nguồn/cấu hình',
  P02: 'Lệnh chỉ có trên macOS trong mã nguồn/công cụ build',
  P03: 'Script build/test trong package.json gọi lệnh shell riêng OS (chỉ cho phép node/npm/npx)',
  P04: 'Hai tệp chỉ khác nhau chữ hoa/thường (hỏng trên Windows/macOS mặc định)',
  P05: 'Tên tệp/đường dẫn không hợp lệ trên Windows (ký tự cấm, tên dành riêng, dấu chấm/khoảng trắng cuối, quá dài)',
  P06: 'Kiểm tra hệ điều hành (process.platform…) ngoài src/system/platform.js',
  P07: 'Sai kiểu xuống dòng (.bat/.cmd phải CRLF; tệp khác phải LF)',
  P08: 'Launcher: tên tệp hoặc nội dung .bat không phải ASCII; .command thiếu shebang hoặc quyền chạy',
  P09: 'Phụ thuộc native (.node, binding.gyp, script cài đặt) — vi phạm ADR-0016',
  P10: 'Thiếu cấu hình bắt buộc (engines.node trong package.json, .gitattributes cho .bat/.command)',
  P11: 'Đường dẫn dùng dấu phân cách cứng "\\\\" thay vì node:path'
});

const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'dist', 'docs', '.claude', '.github-cache']);
const SKIP_PREFIX = ['public/vendor/']; // mã bên thứ ba, không phải mã của dự án
const SELF = 'tools/check-portability.js';
const PLATFORM_FILE = 'src/system/platform.js';
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.sql', '.html', '.css', '.bat', '.cmd', '.command', '.sh', '.yml', '.yaml']);
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Mẫu được dựng từ các mảnh để tệp này không tự khớp chính nó.
const J = (...p) => p.join('');
const ABS_PATTERNS = [
  [new RegExp(J('/Us', 'ers/[^\\s\'"`]+')), 'đường dẫn người dùng macOS'],
  [new RegExp(J('/ho', 'me/[a-z_][^\\s\'"`]*'), 'i'), 'đường dẫn home Linux'],
  [new RegExp(J('\\b[A-Za-z]:\\\\', '[^\\s\'"`]')), 'ổ đĩa Windows'],
  [new RegExp(J('/pri', 'vate/(tmp|var)/')), 'thư mục tạm macOS'],
  [new RegExp(J('/var/', 'folders/')), 'thư mục tạm macOS'],
  [new RegExp(J('/t', 'mp/[^\\s\'"`]')), 'thư mục tạm POSIX (dùng os.tmpdir())'],
  [new RegExp(J('/opt/', 'homebrew')), 'Homebrew']
];
const MAC_ONLY = new RegExp(J('\\b(xat', 'tr|osasc', 'ript|pbco', 'py|pbpa', 'ste|hdiu', 'til|dit', 'to|launc', 'hctl|sw_', 'vers|mdf', 'ind|code', 'sign)\\b'));
const SED_MAC = new RegExp(J('sed\\s+-', "i\\s+''"));
const PLATFORM_USE = /\bprocess\.platform\b|\bos\.platform\s*\(|\bos\.type\s*\(|\bprocess\.arch\b/;
const HARD_BACKSLASH = /(?:readFile|writeFile|join|resolve|spawn|exec)\w*\(\s*['"`][^'"`]*[A-Za-z0-9_]\\[A-Za-z0-9_]/;

function walk(root) {
  const out = [];
  const rec = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join('/');
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        if (SKIP_PREFIX.some((p) => `${rel}/`.startsWith(p))) continue;
        rec(full);
      } else {
        out.push({ full, rel, mode: st.mode });
      }
    }
  };
  rec(root);
  return out;
}

/** @returns {{violations:Array<{rule:string,file:string,line:number|null,message:string}>, stats:object}} */
export function checkPortability({ root }) {
  const violations = [];
  const add = (rule, file, line, message) => violations.push({ rule, file, line, message });
  const files = walk(root);
  const waived = (text) => /portability-ok/.test(text);

  // P04 + P05: tên tệp
  const seenLower = new Map();
  for (const f of files) {
    const lower = f.rel.toLowerCase();
    if (seenLower.has(lower) && seenLower.get(lower) !== f.rel) add('P04', f.rel, null, `trùng không phân biệt hoa/thường với ${seenLower.get(lower)}`);
    seenLower.set(lower, f.rel);
    const segs = f.rel.split('/');
    if (f.rel.length > 200) add('P05', f.rel, null, `đường dẫn dài ${f.rel.length} ký tự (> 200)`);
    for (const s of segs) {
      if (/[<>:"|?*\u0000-\u001f]/.test(s)) add('P05', f.rel, null, `ký tự cấm trên Windows trong "${s}"`);
      if (/[. ]$/.test(s)) add('P05', f.rel, null, `"${s}" kết thúc bằng dấu chấm/khoảng trắng`);
      if (WIN_RESERVED.test(s.replace(/\.[^.]*$/, ''))) add('P05', f.rel, null, `"${s}" là tên dành riêng của Windows`);
      if (s.length > 100) add('P05', f.rel, null, `thành phần "${s.slice(0, 30)}…" dài > 100 ký tự`);
    }
  }

  let scanned = 0;
  for (const f of files) {
    const ext = extname(f.rel).toLowerCase();
    const isLauncher = f.rel.startsWith('launchers/');

    // P08: tên launcher ASCII; .command phải có shebang + quyền chạy
    if (isLauncher && /[^\x20-\x7e/]/.test(f.rel)) add('P08', f.rel, null, 'tên tệp launcher phải là ASCII');
    if (!TEXT_EXT.has(ext) && basename(f.rel) !== '.gitattributes') continue;

    let buf;
    try { buf = readFileSync(f.full); } catch { continue; }
    const text = buf.toString('utf8');
    scanned++;

    // P07: kiểu xuống dòng
    const crlf = (text.match(/\r\n/g) || []).length;
    const lfOnly = (text.match(/(?<!\r)\n/g) || []).length;
    if (ext === '.bat' || ext === '.cmd') {
      if (lfOnly > 0) add('P07', f.rel, null, `${lfOnly} dòng chỉ có LF — .bat/.cmd phải CRLF hoàn toàn`);
      if (isLauncher && /[^\x00-\x7f]/.test(text)) add('P08', f.rel, null, 'nội dung .bat phải ASCII (cmd.exe xử lý UTF-8 không ổn định)');
    } else if (crlf > 0) {
      add('P07', f.rel, null, `${crlf} dòng CRLF — tệp này phải dùng LF`);
    }
    if (ext === '.command') {
      if (!text.startsWith('#!')) add('P08', f.rel, 1, '.command thiếu shebang (#!/bin/bash)');
      if (process.platform !== 'win32' && (f.mode & 0o111) === 0) add('P08', f.rel, null, '.command chưa có quyền thực thi (chmod 755)'); // portability-ok: chỉ kiểm quyền trên POSIX
    }

    if (f.rel === SELF) continue; // tệp này chứa các mẫu để quét
    const lines = text.split(/\r?\n/);
    const isCode = ext === '.js' || ext === '.mjs' || ext === '.cjs';
    const underSrc = f.rel.startsWith('src/') || f.rel === 'server.js';

    lines.forEach((line, i) => {
      if (waived(line)) return;
      const n = i + 1;
      // P01
      if (!isLauncher || ext === '.bat' || ext === '.command') {
        for (const [re, what] of ABS_PATTERNS) {
          if (re.test(line)) { add('P01', f.rel, n, `${what}: ${line.trim().slice(0, 100)}`); break; }
        }
      }
      // P02
      if (f.rel !== PLATFORM_FILE && !isLauncher && (isCode || ext === '.json' || ext === '.sh')) {
        if (MAC_ONLY.test(line) || SED_MAC.test(line)) add('P02', f.rel, n, `lệnh chỉ có trên macOS: ${line.trim().slice(0, 100)}`);
      }
      // P06
      if (underSrc && f.rel !== PLATFORM_FILE && isCode && PLATFORM_USE.test(line)) add('P06', f.rel, n, `kiểm tra OS ngoài platform.js: ${line.trim().slice(0, 100)}`);
      // P11
      if (isCode && HARD_BACKSLASH.test(line)) add('P11', f.rel, n, `dấu "\\" cứng trong đường dẫn: ${line.trim().slice(0, 100)}`);
    });
  }

  // P03 + P10: package.json
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    let pkg = null;
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { add('P10', 'package.json', null, 'không phải JSON hợp lệ'); }
    if (pkg) {
      if (!pkg.engines?.node) add('P10', 'package.json', null, 'thiếu engines.node');
      for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
        for (const seg of String(cmd).split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean)) {
          if (!/^(node|npm|npx)(\s|$)/.test(seg)) add('P03', 'package.json', null, `script "${name}" gọi lệnh ngoài node/npm/npx: "${seg.slice(0, 60)}"`);
        }
      }
    }
  }
  const ga = join(root, '.gitattributes');
  if (!existsSync(ga)) add('P10', '.gitattributes', null, 'thiếu .gitattributes (cần quy định xuống dòng cho .bat/.command)');
  else {
    const t = readFileSync(ga, 'utf8');
    if (!/\*\.bat\s+.*eol=crlf/.test(t)) add('P10', '.gitattributes', null, 'thiếu quy tắc *.bat eol=crlf');
    if (!/\*\.command\s+.*eol=lf/.test(t)) add('P10', '.gitattributes', null, 'thiếu quy tắc *.command eol=lf');
  }

  // P09: native
  const lock = join(root, 'package-lock.json');
  if (existsSync(lock)) {
    try {
      const l = JSON.parse(readFileSync(lock, 'utf8'));
      for (const [k, v] of Object.entries(l.packages || {})) if (v.hasInstallScript) add('P09', 'package-lock.json', null, `gói ${k || '(gốc)'} có script cài đặt`);
    } catch { add('P10', 'package-lock.json', null, 'không phải JSON hợp lệ'); }
  }
  const nm = join(root, 'node_modules');
  let nativeChecked = false;
  if (existsSync(nm)) {
    nativeChecked = true;
    const rec = (dir, depth) => {
      if (depth > 6) return;
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) rec(full, depth + 1);
        else if (name.endsWith('.node') || name === 'binding.gyp') add('P09', relative(root, full).split(sep).join('/'), null, 'tệp native trong node_modules');
      }
    };
    rec(nm, 0);
  }

  return { violations, stats: { files: files.length, scannedText: scanned, nativeChecked } };
}

// ───────── CLI ─────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `${d.toUpperCase()}:`) || process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? args[rootArg + 1] : join(fileURLToPath(import.meta.url), '..', '..');
  const res = checkPortability({ root });
  if (args.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`check-portability: đã quét ${res.stats.scannedText} tệp văn bản / ${res.stats.files} tệp${res.stats.nativeChecked ? ' + node_modules (mã native)' : ' (chưa có node_modules: bỏ qua kiểm mã native)'}.`);
    for (const v of res.violations) console.log(`  [${v.rule}] ${v.file}${v.line ? `:${v.line}` : ''} — ${v.message}`);
    console.log(res.violations.length === 0 ? 'KẾT QUẢ: sạch — không có lỗi phụ thuộc hệ điều hành.' : `KẾT QUẢ: ${res.violations.length} vi phạm. Luật: ${[...new Set(res.violations.map((v) => v.rule))].map((r) => `${r}=${RULES[r]}`).join(' | ')}`);
  }
  process.exit(res.violations.length === 0 ? 0 : 1);
}
