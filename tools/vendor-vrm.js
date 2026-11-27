// Chép GLTFLoader + SkeletonUtils + BufferGeometryUtils (Three.js addons) và @pixiv/three-vrm vào public/vendor/
// để stage tự host (ADR-0001: không CDN). Bare specifier "three" được viết lại thành đường dẫn nội bộ
// để mọi module dùng CHUNG một instance Three.js (tránh lỗi "hai bản THREE").
// Chạy sau `npm ci`: `npm run vendor:vrm`. Chỉ dùng API Node đa nền tảng.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const threeDir = join(root, 'node_modules', 'three');
const outRoot = join(root, 'public', 'vendor');
const THREE_URL = '/vendor/three/three.module.js';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const threeVer = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')).version;
if (threeVer !== pkg.dependencies.three) {
  console.error(`Phiên bản three đã cài (${threeVer}) khác phiên bản ghim (${pkg.dependencies.three}). Chạy "npm ci" rồi thử lại.`);
  process.exit(1);
}

/** Viết lại import 'three' và 'three/addons/...' sang đường dẫn /vendor/three/... */
function rewrite(src) {
  return src
    .replace(/(from\s+|import\s+)(['"])three\2/g, (_, a, q) => `${a}${q}${THREE_URL}${q}`)
    .replace(/(from\s+)(['"])three\/addons\/([^'"]+)\2/g, (_, a, q, p) => `${a}${q}/vendor/three/addons/${p}${q}`);
}

function copyTransformed(from, to) {
  if (!existsSync(from)) { console.error(`Thiếu tệp: ${from}`); process.exit(1); }
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, rewrite(readFileSync(from, 'utf8')));
  console.log(`đã chép ${from.replace(root + '/', '')} -> ${to.replace(root + '/', '')}`);
}

const addons = [
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/SkeletonUtils.js',
  'examples/jsm/utils/BufferGeometryUtils.js'
];
for (const f of addons) {
  copyTransformed(join(threeDir, f), join(outRoot, 'three', 'addons', f.replace('examples/jsm/', '')));
}

const vrmDir = join(root, 'node_modules', '@pixiv', 'three-vrm');
const vrmVer = JSON.parse(readFileSync(join(vrmDir, 'package.json'), 'utf8')).version;
if (vrmVer !== pkg.dependencies['@pixiv/three-vrm']) {
  console.error(`@pixiv/three-vrm đã cài (${vrmVer}) khác bản ghim (${pkg.dependencies['@pixiv/three-vrm']}).`);
  process.exit(1);
}
copyTransformed(join(vrmDir, 'lib', 'three-vrm.module.js'), join(outRoot, 'three-vrm', 'three-vrm.module.js'));
// Giữ nguyên văn giấy phép (MIT) bên cạnh mã đã vendor.
copyFileSync(join(threeDir, 'LICENSE'), join(outRoot, 'three', 'LICENSE'));
copyFileSync(join(vrmDir, 'LICENSE'), join(outRoot, 'three-vrm', 'LICENSE'));
