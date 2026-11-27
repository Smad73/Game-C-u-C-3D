// Chép bản build của Three.js (đã ghim trong package.json) vào public/vendor/three/ để tự host.
// Lý do: stage chạy trong Browser Source, không được phụ thuộc CDN khi LIVE (ADR-0001, ARCHITECTURE §3).
// Chạy lại sau khi đổi phiên bản three: `npm run vendor:three`. Chỉ dùng API Node đa nền tảng.
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', 'three');
const outDir = join(root, 'public', 'vendor', 'three');

const pkg = JSON.parse(readFileSync(join(srcDir, 'package.json'), 'utf8'));
const wanted = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies.three;
if (pkg.version !== wanted) {
  console.error(`Phiên bản three đã cài (${pkg.version}) khác phiên bản ghim (${wanted}). Chạy "npm ci" rồi thử lại.`);
  process.exit(1);
}

// three >= 0.17x tách lõi: three.module.js import './three.core.js'.
const files = ['build/three.module.js', 'build/three.core.js', 'LICENSE'];
mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const from = join(srcDir, f);
  if (!existsSync(from)) {
    console.error(`Thiếu tệp ${f} trong gói three ${pkg.version}.`);
    process.exit(1);
  }
  const to = join(outDir, f.split('/').pop());
  copyFileSync(from, to);
  console.log(`đã chép ${f} -> public/vendor/three/${f.split('/').pop()}`);
}
console.log(`three@${pkg.version} đã sẵn sàng (không có bản .min trong gói này; xem docs/PROJECT_STATUS.md, mục P2).`);
