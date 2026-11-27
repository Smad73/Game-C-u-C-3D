// Chuẩn bị model VRM (src/assets/prepareVrm.js): tách ảnh nhúng, models.json, bỏ qua tệp hỏng/tên lạ, idempotent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { prepareVrmDir } from '../src/assets/prepareVrm.js';
import { makeTmpDir, removeDir } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');

/** GLB nhỏ nhất có phần mở rộng VRM và một ảnh PNG nhúng trong BIN. */
function glb({ vrm = true, image = true } = {}) {
  const bin = Buffer.concat([PNG, Buffer.alloc((4 - (PNG.length % 4)) % 4)]);
  const json = { asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: PNG.length }],
    images: image ? [{ bufferView: 0, mimeType: 'image/png' }] : [], extensions: vrm ? { VRMC_vrm: { specVersion: '1.0' } } : {} };
  let j = Buffer.from(JSON.stringify(json));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + j.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii'); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(j.length, 12); out.write('JSON', 16, 'ascii'); j.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + j.length); out.write('BIN\0', 24 + j.length, 'ascii'); bin.copy(out, 28 + j.length);
  return out;
}

test('prepareVrm: tách ảnh nhúng ra tệp, GLB trỏ uri; models.json liệt kê; tệp hỏng/không VRM/tên lạ bị bỏ qua; chạy lại không đổi', (t) => {
  const dir = makeTmpDir('nova-vrm-');
  t.after(() => removeDir(dir));
  writeFileSync(join(dir, 'Cau_Thu-1.vrm'), glb());
  writeFileSync(join(dir, 'KhongVrm.vrm'), glb({ vrm: false }));
  writeFileSync(join(dir, 'Hong.vrm'), Buffer.from('khong phai glb'));
  writeFileSync(join(dir, 'tên có dấu.vrm'), glb());
  writeFileSync(join(dir, 'ghichu.txt'), 'không liên quan');

  const r = prepareVrmDir(dir);
  assert.deepEqual(r.models, ['Cau_Thu-1']);
  assert.deepEqual(r.extracted, { 'Cau_Thu-1': 1 });
  assert.deepEqual(r.skipped.map((s) => s.file).sort(), ['Hong.vrm', 'KhongVrm.vrm', 'tên có dấu.vrm']);
  assert.ok(existsSync(join(dir, 'Cau_Thu-1', 'tex0.png')));
  assert.deepEqual(readFileSync(join(dir, 'Cau_Thu-1', 'tex0.png')), PNG);
  const buf = readFileSync(join(dir, 'Cau_Thu-1.vrm'));
  const json = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
  assert.equal(json.images[0].uri, 'Cau_Thu-1/tex0.png');
  assert.equal(json.images[0].bufferView, undefined);
  assert.equal(buf.readUInt32LE(8), buf.length, 'độ dài GLB trong header khớp tệp');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'models.json'), 'utf8')), { models: ['Cau_Thu-1'] });

  const again = prepareVrmDir(dir);
  assert.deepEqual(again.extracted, {}, 'chạy lại: không tách lần hai');
  assert.deepEqual(readFileSync(join(dir, 'Cau_Thu-1.vrm')), buf, 'tệp không bị ghi lại');
});
