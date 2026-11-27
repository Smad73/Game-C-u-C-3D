// Đích của `npm test`: (1) check-portability, (2) toàn bộ tests/*.test.js bằng node:test. Chạy được trên macOS và Windows
// (không dùng shell). Mã thoát 0 chỉ khi cả hai đều đạt. In dòng TỔNG KẾT để ghi vào TEST_REPORT.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skipPortability = process.argv.includes('--skip-portability');
const pattern = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const t0 = Date.now();

let portability = 'bỏ qua';
if (!skipPortability) {
  console.log('── check-portability ──────────────────────────');
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-portability.js')], { stdio: 'inherit' });
  portability = r.status === 0 ? 'ĐẠT' : 'KHÔNG ĐẠT';
}

const files = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.js') && (!pattern || f.includes(pattern))).sort().map((f) => join('tests', f));
console.log(`\n── node:test (${files.length} tệp) ───────────────────────────`);
const child = spawn(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=3', '--test-timeout=90000', ...files], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
const tee = (stream, sink) => stream.on('data', (d) => { out += d; sink.write(d); });
tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on('exit', (code) => {
  const num = (name) => Number(new RegExp(`ℹ ${name} (\\d+)`).exec(out)?.[1] ?? 0);
  const [tests, pass, fail, skipped] = [num('tests'), num('pass'), num('fail'), num('skipped')];
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  console.log('\n════════════════ TỔNG KẾT ════════════════');
  console.log(`Môi trường : Node ${process.version} · ${process.platform}/${process.arch}`);
  console.log(`Portability: ${portability}`);
  console.log(`node:test  : ${tests} test · ${pass} đạt · ${fail} lỗi · ${skipped} bỏ qua · ${files.length} tệp`);
  console.log(`Thời gian  : ${secs}s`);
  const ok = code === 0 && fail === 0 && tests > 0 && portability !== 'KHÔNG ĐẠT';
  console.log(ok ? 'KẾT QUẢ    : ĐẠT' : 'KẾT QUẢ    : KHÔNG ĐẠT');
  process.exit(ok ? 0 : 1);
});
