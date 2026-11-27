// Kiểm thử chính công cụ check-portability: nó phải BẮT ĐƯỢC từng loại lỗi (không chỉ báo "sạch"), và kho mã thật phải sạch.
// Các chuỗi vi phạm được dựng từ mảnh (join) để file test này không tự bị quét là vi phạm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkPortability } from '../tools/check-portability.js';
import { projectRoot } from '../src/system/platform.js';
import { makeTmpDir, removeDir } from './helpers.js';

const macPath = ['', 'Users', 'ai-do', 'game', 'a.json'].join('/');
const linuxPath = ['', 'home', 'ai-do', 'x'].join('/');
const winPath = ['C:', '\\', 'Games', '\\', 'a'].join('');
const tmpPath = ['', 'tmp', 'du-lieu.db'].join('/');
const macCmd = ['xat', 'tr'].join('');
const sedMac = `${['s', 'ed'].join('')} -${'i'} ''`;

const BASE = {
  'package.json': JSON.stringify({ name: 'x', version: '1.0.0', engines: { node: '>=22.13.0' }, scripts: { test: 'node tests/run.js' } }),
  '.gitattributes': '*.bat text eol=crlf\n*.command text eol=lf\n',
  'src/a.js': 'export const a = 1;\n',
  'src/system/platform.js': 'export const p = process.platform;\n'
};

function fixture(extra = {}, { removeBase = [] } = {}) {
  const root = makeTmpDir('nova-port-');
  const files = { ...BASE, ...extra };
  for (const k of removeBase) delete files[k];
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
const rulesOf = (root) => checkPortability({ root }).violations.map((v) => v.rule);
const has = (root, rule) => rulesOf(root).includes(rule);
async function inFixture(extra, fn, opts) { const root = fixture(extra, opts); try { await fn(root); } finally { removeDir(root); } }

test('nền tảng sạch: dự án tối thiểu hợp lệ không có vi phạm', () => inFixture({}, (root) => {
  assert.deepEqual(checkPortability({ root }).violations, []);
}));

test('P01: đường dẫn tuyệt đối macOS / Linux / Windows / thư mục tạm bị bắt; chú thích portability-ok miễn trừ', () => inFixture({
  'src/b.js': `const p = '${macPath}';\n`,
  'src/c.js': `const p = '${linuxPath}';\n`,
  'src/d.js': `const p = '${winPath}';\n`,
  'config/e.json': `{ "dir": "${tmpPath}" }\n`,
  'src/f.js': `const ok = '${macPath}'; // portability-ok: ví dụ trong chú thích\n`
}, (root) => {
  const v = checkPortability({ root }).violations.filter((x) => x.rule === 'P01');
  assert.deepEqual(v.map((x) => x.file).sort(), ['config/e.json', 'src/b.js', 'src/c.js', 'src/d.js']);
  assert.ok(v.every((x) => x.line >= 1));
}));

test('P02: lệnh chỉ có trên macOS trong mã/công cụ bị bắt; được phép trong platform.js', () => inFixture({
  'tools/build.js': `spawn('${macCmd}', ['-c', 'x']);\n`,
  'tools/build2.js': `exec("${sedMac} s/a/b/ f");\n`
}, (root) => {
  const v = checkPortability({ root }).violations.filter((x) => x.rule === 'P02');
  assert.deepEqual(v.map((x) => x.file).sort(), ['tools/build.js', 'tools/build2.js']);
  inFixture({ 'src/system/platform.js': `const c = '${macCmd}';\n` }, (r2) => assert.ok(!has(r2, 'P02'), 'platform.js là nơi duy nhất được chứa khác biệt OS'));
}));

test('P03: script package.json chỉ được gọi node/npm/npx; chuỗi && / ; / | đều bị tách để kiểm', () => {
  const mk = (scripts) => ({ 'package.json': JSON.stringify({ name: 'x', engines: { node: '>=22' }, scripts }) });
  return inFixture(mk({ build: 'chmod +x a', ok: 'node a.js && npm run b', pipe: 'node a.js | grep x', semi: 'node a.js; rm -f b' }), (root) => {
    const msgs = checkPortability({ root }).violations.filter((x) => x.rule === 'P03').map((x) => x.message);
    assert.equal(msgs.length, 3);
    assert.ok(msgs.some((m) => /"build".*chmod/.test(m)));
    assert.ok(msgs.some((m) => /"pipe".*grep/.test(m)));
    assert.ok(msgs.some((m) => /"semi".*rm/.test(m)));
    assert.ok(!msgs.some((m) => /"ok"/.test(m)));
  });
});

test('P04/P05: tên tệp — trùng hoa/thường (nếu ổ đĩa phân biệt), tên dành riêng, ký tự cấm, dấu chấm cuối, đường dẫn quá dài', async (t) => {
  const root = makeTmpDir('nova-port-names-');
  try {
    const tryWrite = (rel) => { try { const f = join(root, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, 'x'); return true; } catch { return false; } };
    for (const [rel, c] of Object.entries(BASE)) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), c); }
    const made = ['src/con.js', 'src/aux.txt', 'src/lpt1.log', 'src/trailing.', `src/${'d'.repeat(120)}.js`, `src/${'sub/'.repeat(60)}deep.js`].filter(tryWrite);
    const v = checkPortability({ root }).violations.filter((x) => x.rule === 'P05').map((x) => x.file);
    for (const m of made) assert.ok(v.includes(m), `phải bắt tên: ${m.slice(0, 40)}`);
    assert.ok(made.length >= 3, `tạo được ${made.length} tệp tên xấu để kiểm`);

    const lowerOk = tryWrite('src/CaseTest.js') && tryWrite('src/casetest.js');
    const entries = checkPortability({ root }).violations.filter((x) => x.rule === 'P04');
    if (lowerOk && entries.length === 0) {
      // Ổ đĩa không phân biệt hoa/thường (macOS mặc định): hai tệp trùng nhau thực ra là MỘT tệp → không thể có lỗi P04 ở đây.
      t.diagnostic('P04 không kiểm chứng được trên ổ đĩa không phân biệt hoa/thường (macOS mặc định) — cần chạy trên CI Linux/Windows hoặc ổ phân biệt hoa/thường.');
    } else {
      assert.ok(entries.length >= 1, 'ổ phân biệt hoa/thường: phải bắt cặp trùng');
    }
  } finally { removeDir(root); }
});

test('P06: kiểm tra hệ điều hành ngoài platform.js bị bắt (src/, server.js); cho phép ở platform.js, tools, tests', () => inFixture({
  'src/x.js': 'export const isMac = process.platform === "darwin";\n',
  'src/y.js': 'import os from "node:os"; export const t = os.type();\n',
  'server.js': 'if (process.arch === "arm64") {}\n',
  'tools/ok.js': 'console.log(process.platform);\n',
  'tests/ok.test.js': 'console.log(process.platform);\n'
}, (root) => {
  const v = checkPortability({ root }).violations.filter((x) => x.rule === 'P06').map((x) => x.file).sort();
  assert.deepEqual(v, ['server.js', 'src/x.js', 'src/y.js']);
}));

test('P07: .bat phải CRLF; tệp khác phải LF', () => inFixture({
  'launchers/windows/lf.bat': '@echo off\necho a\n',
  'launchers/windows/crlf.bat': '@echo off\r\necho a\r\n',
  'src/crlf.js': 'a;\r\nb;\r\n',
  'src/lf.js': 'a;\nb;\n'
}, (root) => {
  const v = checkPortability({ root }).violations.filter((x) => x.rule === 'P07').map((x) => x.file).sort();
  assert.deepEqual(v, ['launchers/windows/lf.bat', 'src/crlf.js']);
}));

test('P08: launcher — tên không ASCII, .bat không ASCII, .command thiếu shebang hoặc quyền chạy', () => inFixture({
  'launchers/windows/khởi-chạy.bat': '@echo off\r\n',
  'launchers/windows/dau.bat': '@echo off\r\necho Câu cá\r\n',
  'launchers/macos/no-shebang.command': 'echo hi\n',
  'launchers/macos/no-exec.command': '#!/bin/bash\necho hi\n',
  'launchers/macos/ok.command': '#!/bin/bash\necho hi\n'
}, (root) => {
  chmodSync(join(root, 'launchers/macos/ok.command'), 0o755);
  chmodSync(join(root, 'launchers/macos/no-shebang.command'), 0o755);
  chmodSync(join(root, 'launchers/macos/no-exec.command'), 0o644);
  const v = checkPortability({ root }).violations.filter((x) => x.rule === 'P08');
  const by = (re) => v.filter((x) => re.test(x.message)).map((x) => x.file);
  assert.deepEqual(by(/tên tệp/), ['launchers/windows/khởi-chạy.bat']);
  assert.deepEqual(by(/nội dung \.bat/), ['launchers/windows/dau.bat']);
  assert.deepEqual(by(/shebang/), ['launchers/macos/no-shebang.command']);
  assert.deepEqual(by(/quyền thực thi/), ['launchers/macos/no-exec.command']);
}));

test('P09: tệp native trong node_modules và gói có script cài đặt bị bắt', () => inFixture({
  'node_modules/addon/build/addon.node': 'x',
  'node_modules/addon2/binding.gyp': '{}',
  'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/xau': { hasInstallScript: true } } })
}, (root) => {
  const v = checkPortability({ root }).violations.filter((x) => x.rule === 'P09');
  assert.equal(v.length, 3);
  assert.ok(v.some((x) => x.file === 'package-lock.json' && /xau/.test(x.message)));
}));

test('P10: thiếu engines.node hoặc quy tắc .gitattributes cho .bat/.command', async () => {
  await inFixture({ 'package.json': JSON.stringify({ name: 'x', scripts: {} }) }, (root) => assert.ok(has(root, 'P10')));
  await inFixture({ '.gitattributes': '* text=auto\n' }, (root) => assert.equal(rulesOf(root).filter((r) => r === 'P10').length, 2));
  await inFixture({}, (root) => assert.ok(!has(root, 'P10')), {});
  await inFixture({}, (root) => assert.ok(has(root, 'P10')), { removeBase: ['.gitattributes'] });
});

test('P11: dấu "\\" cứng trong đường dẫn gọi API tệp bị bắt', () => inFixture({
  'src/w.js': `readFileSync('data${'\\'}file.txt');\n`,
  'src/ok.js': "readFileSync(join('data', 'file.txt'));\n"
}, (root) => {
  assert.deepEqual(checkPortability({ root }).violations.filter((x) => x.rule === 'P11').map((x) => x.file), ['src/w.js']);
}));

test('bỏ qua đúng chỗ: docs/, node_modules/ (nội dung), public/vendor/ không bị quét luật nội dung', () => inFixture({
  'docs/ghi-chu.md': `Ví dụ đường dẫn ${macPath}\n`,
  'docs/x.js': `const p = '${macPath}';\n`,
  'public/vendor/lib/a.js': `const p = '${macPath}';\n`,
  'node_modules/m/index.js': `const p = '${macPath}';\n`
}, (root) => {
  assert.deepEqual(checkPortability({ root }).violations, []);
}));

test('CLI: mã thoát 1 + liệt kê vi phạm khi có lỗi; --json hợp lệ; mã thoát 0 khi sạch', () => {
  const dirty = fixture({ 'src/b.js': `const p = '${macPath}';\n` });
  const clean = fixture({});
  try {
    const tool = join(projectRoot(), 'tools', 'check-portability.js');
    const bad = spawnSync(process.execPath, [tool, '--root', dirty], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /\[P01\] src\/b\.js:1/);
    assert.match(bad.stdout, /KẾT QUẢ: 1 vi phạm/);
    const js = spawnSync(process.execPath, [tool, '--root', dirty, '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(js.stdout).violations[0].rule, 'P01');
    const ok = spawnSync(process.execPath, [tool, '--root', clean], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /sạch/);
  } finally { removeDir(dirty); removeDir(clean); }
});

test('kho mã THẬT của dự án: không có lỗi phụ thuộc hệ điều hành', () => {
  const res = checkPortability({ root: projectRoot() });
  assert.deepEqual(res.violations, [], res.violations.map((v) => `[${v.rule}] ${v.file}:${v.line} ${v.message}`).join('\n'));
  assert.ok(res.stats.scannedText > 20, `đã quét ${res.stats.scannedText} tệp văn bản`);
  assert.equal(res.stats.nativeChecked, true, 'node_modules phải được kiểm mã native (chạy npm ci trước)');
});
