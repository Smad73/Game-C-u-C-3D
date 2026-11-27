import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Alerts, ALERT_CATALOG } from '../src/ops/Alerts.js';
import { OverloadController, evaluateOverload } from '../src/ops/OverloadController.js';
import { loadSettings } from '../src/system/Settings.js';
import { Logger } from '../src/system/Logger.js';

const { settings } = loadSettings({ env: {} });
const cfg = settings.overload;
const pcfg = settings.persistence;
const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
const calm = { eventLoopP95Ms: 2, heapUsedMb: 50, persist: { writeBufferOps: 0, oldestUnpersistedEventAgeMs: 0, oldestUnackedBatchAgeMs: 0 }, diskFreeBytes: 50 * 1024 ** 3, persistState: 'READY' };
const lvl = (over) => evaluateOverload({ ...calm, ...over }, cfg, pcfg);

test('alerts: tạo, cập nhật mức, xoá; mã ngoài danh mục bị từ chối; sắp xếp theo mức', () => {
  let t = 1000;
  const a = new Alerts({ now: () => t });
  const seen = [];
  a.on('raised', (x) => seen.push(`+${x.code}:${x.level}`));
  a.on('cleared', (x) => seen.push(`-${x.code}`));
  a.raise('DISK_LOW', 'warn');
  t = 2000;
  a.raise('SAFE_MODE', 'critical');
  a.raise('DISK_LOW', 'warn'); // không đổi → không phát lại
  a.raise('DISK_LOW', 'critical');
  assert.equal(a.list()[0].level, 'critical');
  assert.equal(a.list().find((x) => x.code === 'DISK_LOW').since, 1000, 'giữ thời điểm bắt đầu khi đổi mức');
  assert.equal(a.worstLevel(), 'critical');
  assert.ok(a.clear('SAFE_MODE') && !a.clear('SAFE_MODE'));
  assert.deepEqual(seen, ['+DISK_LOW:warn', '+SAFE_MODE:critical', '+DISK_LOW:critical', '-SAFE_MODE']);
  assert.throws(() => a.raise('KHONG_CO', 'warn'), /danh mục/);
  assert.throws(() => a.raise('DISK_LOW', 'xxx'), /Mức/);
  assert.ok(Object.values(ALERT_CATALOG).every((s) => s.length > 20), 'mọi mã đều có gợi ý tiếng Việt');
});

test('overload: bình thường = L0, không cảnh báo', () => {
  const r = lvl({});
  assert.equal(r.level, 'L0');
  assert.deepEqual(r.alerts, []);
});

test('overload: từng nguồn kích hoạt đúng bậc theo ADR-0019', () => {
  assert.equal(lvl({ stageFps: 20 }).level, 'L1');
  assert.equal(lvl({ eventLoopP95Ms: cfg.eventLoopP95WarnMs }).level, 'L2');
  assert.equal(lvl({ eventLoopP95Ms: cfg.eventLoopP95CritMs }).level, 'L3');
  assert.equal(lvl({ persist: { ...calm.persist, writeBufferOps: pcfg.writeBufferSoftMax } }).level, 'L3');
  assert.equal(lvl({ persist: { ...calm.persist, writeBufferOps: pcfg.writeBufferHardMax } }).level, 'L4');
  assert.equal(lvl({ persist: { ...calm.persist, oldestUnpersistedEventAgeMs: pcfg.oldestUnpersistedWarnMs } }).level, 'L3');
  assert.equal(lvl({ persist: { ...calm.persist, oldestUnpersistedEventAgeMs: pcfg.oldestUnpersistedCritMs } }).level, 'L4');
  assert.equal(lvl({ persist: { ...calm.persist, oldestUnackedBatchAgeMs: pcfg.oldestUnackedBatchCritMs } }).level, 'L4');
  assert.equal(lvl({ heapUsedMb: cfg.heapUsedWarnMb }).level, 'L3');
  assert.equal(lvl({ diskFreeBytes: cfg.disk.warnFreeBytes - 1 }).level, 'L2');
  assert.equal(lvl({ diskFreeBytes: cfg.disk.critFreeBytes - 1 }).level, 'L3');
  assert.equal(lvl({ diskFreeBytes: cfg.disk.safeFreeBytes - 1 }).level, 'L4');
  assert.equal(lvl({ persistState: 'DEGRADED' }).level, 'L3');
  assert.equal(lvl({ persistState: 'SAFE_MODE' }).level, 'SAFE_MODE');
});

test('overload: lấy bậc CAO NHẤT khi nhiều nguồn cùng kích hoạt; cảnh báo đúng mã/mức; xoá cảnh báo hết lý do', () => {
  const r = lvl({ eventLoopP95Ms: cfg.eventLoopP95WarnMs, diskFreeBytes: cfg.disk.critFreeBytes - 1 });
  assert.equal(r.level, 'L3');
  assert.deepEqual(r.alerts.map((a) => `${a.code}:${a.level}`).sort(), ['DISK_CRITICAL:warn', 'TICK_SLOW:warn']);
  assert.ok(r.clear.includes('PERSIST_LAG') && !r.clear.includes('TICK_SLOW'));
  assert.equal(lvl({ diskFreeBytes: null }).level, 'L0', 'không đo được đĩa thì không báo');
});

test('overload: tăng bậc NGAY, hạ bậc chỉ sau N lần đánh giá liên tiếp (hysteresis); pausedProtect ở L4', () => {
  const alerts = new Alerts();
  let inputs = { ...calm };
  const oc = new OverloadController({ config: { ...cfg, recoverAfterOkTicks: 3 }, persistConfig: pcfg, alerts, logger: quiet, getInputs: () => inputs });
  const changes = [];
  oc.on('level', (e) => changes.push(`${e.prev}->${e.level}`));
  oc.evaluateNow();
  assert.equal(oc.level, 'L0');

  inputs = { ...calm, persist: { ...calm.persist, writeBufferOps: pcfg.writeBufferHardMax } };
  oc.evaluateNow();
  assert.equal(oc.level, 'L4');
  assert.equal(oc.pausedProtect, true);

  inputs = { ...calm };
  oc.evaluateNow(); oc.evaluateNow();
  assert.equal(oc.level, 'L4', 'chưa đủ 3 lần ổn → vẫn giữ L4 (tránh dao động)');
  oc.evaluateNow();
  assert.equal(oc.level, 'L0');
  assert.equal(oc.pausedProtect, false);
  assert.deepEqual(changes, ['L0->L4', 'L4->L0']);

  // dao động ngắn không làm hạ bậc
  inputs = { ...calm, persist: { ...calm.persist, writeBufferOps: pcfg.writeBufferHardMax } };
  oc.evaluateNow();
  inputs = { ...calm };
  oc.evaluateNow(); oc.evaluateNow();
  inputs = { ...calm, persist: { ...calm.persist, writeBufferOps: pcfg.writeBufferHardMax } };
  oc.evaluateNow();
  inputs = { ...calm };
  oc.evaluateNow();
  assert.equal(oc.level, 'L4', 'bộ đếm ổn định bị reset khi tái phát');
});

test('overload: cảnh báo được bật/tắt theo đầu vào qua Alerts', () => {
  const alerts = new Alerts();
  let inputs = { ...calm, diskFreeBytes: cfg.disk.warnFreeBytes - 1 };
  const oc = new OverloadController({ config: { ...cfg, recoverAfterOkTicks: 1 }, persistConfig: pcfg, alerts, logger: quiet, getInputs: () => inputs });
  oc.evaluateNow();
  assert.ok(alerts.has('DISK_LOW'));
  inputs = { ...calm };
  oc.evaluateNow();
  assert.ok(!alerts.has('DISK_LOW'), 'hết nguyên nhân thì cảnh báo được xoá');
});

test('overload: SAFE_MODE khi lớp ghi dữ liệu báo SAFE_MODE', () => {
  const oc = new OverloadController({ config: cfg, persistConfig: pcfg, alerts: new Alerts(), logger: quiet, getInputs: () => ({ ...calm, persistState: 'SAFE_MODE' }) });
  oc.evaluateNow();
  assert.equal(oc.level, 'SAFE_MODE');
  assert.equal(oc.pausedProtect, true);
});
