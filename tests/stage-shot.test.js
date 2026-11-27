// Stage: bộ chọn góc camera (public/stage/shotPicker.js) — hàm thuần, không cần WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickShot } from '../public/stage/shotPicker.js';

const a = (slot, ph, phaseStart = 0) => ({ slot, ph, phaseStart });

test('shot: không ai cắn/giằng → tổng quan (góc 1)', () => {
  const s = pickShot([a(0, 'wait'), a(1, 'cast'), a(2, 'idle')], null, 1000);
  assert.equal(s.mode, 'overview');
  assert.equal(s.slot, null);
});

test('shot: cá cắn → cận cảnh cần thủ (góc 2)', () => {
  const s = pickShot([a(0, 'wait'), a(3, 'bite', 500)], null, 1000);
  assert.equal(s.mode, 'close');
  assert.equal(s.slot, 3);
});

test('shot: đang giằng co → dưới nước (góc 3), ưu tiên hơn người chỉ mới cắn', () => {
  const s = pickShot([a(1, 'bite', 100), a(4, 'fight', 900)], null, 1000);
  assert.equal(s.mode, 'under');
  assert.equal(s.slot, 4);
});

test('shot: nhiều người cùng cắn → người cắn sớm nhất', () => {
  const s = pickShot([a(2, 'bite', 800), a(5, 'bite', 300)], null, 1000);
  assert.equal(s.slot, 5);
});

test('shot: theo một cần thủ qua bite → fight → result, đổi góc close → under → close', () => {
  const s1 = pickShot([a(2, 'bite', 100)], null, 1000);
  assert.deepEqual([s1.mode, s1.slot], ['close', 2]);
  const s2 = pickShot([a(2, 'fight', 100), a(6, 'fight', 50)], s1, 2000);
  assert.deepEqual([s2.mode, s2.slot, s2.since], ['under', 2, 2000], 'không nhảy sang người khác đang giằng');
  const s3 = pickShot([a(2, 'result', 100), a(6, 'fight', 50)], s2, 3000);
  assert.deepEqual([s3.mode, s3.slot], ['close', 2], 'kéo cá lên → cận cảnh người đó');
  const s4 = pickShot([a(2, 'cast', 100), a(6, 'fight', 50)], s3, 4000);
  assert.deepEqual([s4.mode, s4.slot], ['under', 6], 'xong lượt → sang người khác đang giằng');
});

test('shot: giữ nguyên đối tượng khi góc không đổi (không đặt lại mốc)', () => {
  const s1 = pickShot([a(2, 'fight', 100)], null, 1000);
  assert.equal(pickShot([a(2, 'fight', 100)], s1, 1500), s1);
});

test('shot: người đang theo hết lượt và không còn ai → tổng quan; tổng quan giữ nguyên mốc', () => {
  const s1 = pickShot([a(2, 'fight', 100)], null, 1000);
  const back = pickShot([a(2, 'wait', 100)], s1, 2000);
  assert.equal(back.mode, 'overview');
  assert.equal(pickShot([a(0, 'wait')], back, 5000), back);
});

test('shot: người đang theo rời khỏi khu → chọn lại', () => {
  const s1 = pickShot([a(2, 'fight', 100)], null, 1000);
  const s2 = pickShot([a(7, 'bite', 100)], s1, 1100);
  assert.deepEqual([s2.mode, s2.slot], ['close', 7]);
});
