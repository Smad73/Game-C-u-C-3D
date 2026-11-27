// Chuẩn bị model VRM cho stage (dùng chung cho server lúc khởi động và tools/prepare-vrm.js):
//  1) Tách ảnh texture nhúng (bufferView) thành tệp cạnh model và ghi lại JSON của GLB trỏ tới tệp đó.
//     Lý do: CSP stage (img-src 'self' data:) chặn blob: URL mà GLTFLoader tạo cho ảnh nhúng (LESSONS L-020) — không nới CSP.
//  2) Ghi models.json liệt kê mọi *.vrm hợp lệ trong thư mục → người dùng chỉ cần thả file .vrm mới vào là có nhân vật mới.
// Idempotent: model đã tách chỉ đọc phần đầu (header + JSON), không đọc lại cả tệp. Chỉ dùng API Node đa nền tảng.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/; // tên tệp đưa lên stage (tránh ký tự lạ trong URL/đường dẫn)

/** Đọc header + JSON của GLB (không đọc phần BIN). */
function readGlbJson(path) {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(20);
    if (readSync(fd, head, 0, 20, 0) < 20 || head.toString('ascii', 0, 4) !== 'glTF' || head.toString('ascii', 16, 20) !== 'JSON') return null;
    const jsonLen = head.readUInt32LE(12);
    if (jsonLen <= 0 || jsonLen > 64 * 1024 * 1024) return null;
    const buf = Buffer.alloc(jsonLen);
    readSync(fd, buf, 0, jsonLen, 20);
    return JSON.parse(buf.toString('utf8'));
  } catch { return null; } finally { closeSync(fd); }
}

function readGlb(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  return { json, bin: buf.subarray(binStart + 8, binStart + 8 + binLen) };
}

function writeGlb(json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binBuf = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii'); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12); out.write('JSON', 16, 'ascii'); jsonBuf.copy(out, 20);
  const b = 20 + jsonBuf.length;
  out.writeUInt32LE(binBuf.length, b); out.write('BIN\0', b + 4, 'ascii'); binBuf.copy(out, b + 8);
  return out;
}

/**
 * Chuẩn bị mọi *.vrm trong `dir`. Trả về {models:[tên], extracted:{tên:số ảnh}, skipped:[{file, reason}]}.
 * Không ném lỗi vì một model hỏng: model đó bị bỏ qua và ghi vào skipped.
 */
export function prepareVrmDir(dir) {
  const out = { models: [], extracted: {}, skipped: [] };
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => extname(f).toLowerCase() === '.vrm').sort()) {
    const name = basename(file, extname(file));
    if (!SAFE_NAME.test(name)) { out.skipped.push({ file, reason: 'tên tệp chỉ được dùng chữ không dấu, số, - và _' }); continue; }
    const path = join(dir, file);
    const json = readGlbJson(path);
    if (!json) { out.skipped.push({ file, reason: 'không phải tệp VRM/GLB hợp lệ' }); continue; }
    const ext = json.extensions || {};
    if (!ext.VRMC_vrm && !ext.VRM) { out.skipped.push({ file, reason: 'không có dữ liệu VRM' }); continue; }
    if ((json.images || []).some((img) => img.uri === undefined && img.bufferView !== undefined)) {
      try {
        const { json: full, bin } = readGlb(readFileSync(path));
        const texDir = join(dir, name);
        mkdirSync(texDir, { recursive: true });
        let n = 0;
        (full.images || []).forEach((img, i) => {
          if (img.uri !== undefined || img.bufferView === undefined) return;
          const e = EXT[img.mimeType] ?? '.png';
          const bv = full.bufferViews[img.bufferView];
          writeFileSync(join(texDir, `tex${i}${e}`), bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
          img.uri = `${name}/tex${i}${e}`;
          delete img.bufferView;
          n++;
        });
        writeFileSync(path, writeGlb(full, bin));
        out.extracted[name] = n;
      } catch (e) { out.skipped.push({ file, reason: `không tách được ảnh: ${e.message}` }); continue; }
    }
    out.models.push(name);
  }
  writeFileSync(join(dir, 'models.json'), `${JSON.stringify({ models: out.models }, null, 2)}\n`);
  return out;
}
