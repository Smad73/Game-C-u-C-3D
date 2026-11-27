// Chuẩn bị model VRM cho stage bằng tay (server cũng tự chạy bước này khi khởi động): tách texture + ghi models.json.
// Chạy: `npm run prepare:vrm`. Logic nằm ở src/assets/prepareVrm.js.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareVrmDir } from '../src/assets/prepareVrm.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'stage', 'assets', 'vrm');
const r = prepareVrmDir(dir);
for (const [name, n] of Object.entries(r.extracted)) console.log(`${name}.vrm: tách ${n} ảnh → ${name}/`);
for (const s of r.skipped) console.log(`BỎ QUA ${s.file}: ${s.reason}`);
console.log(`Nhân vật dùng được (${r.models.length}): ${r.models.join(', ') || '—'}`);
