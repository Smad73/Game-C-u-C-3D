#!/usr/bin/env node
// Tiến trình con cho CR1 (tools/crash-suite.js): chạy đường ống thật dưới tải trên một thư mục dữ liệu DEMO, để bị SIGKILL ngẫu nhiên.
// Nhật ký kiểm thử của harness (ADR-0022 R14): mọi quà connector phát được ghi ĐỒNG BỘ (appendFileSync) vào emitted.log TRƯỚC khi vào
// đường ống — nằm ở kernel buffer nên còn sau SIGKILL; status.json ghi chỉ số cảnh báo mỗi 100 ms để so với số mất thực tế.
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from '../src/ingest/Normalizer.js';
import { Logger } from '../src/system/Logger.js';
import { buildStack } from './load-generator.js';

const [dir, seed = '1', comments = '1000', gifts = '200'] = process.argv.slice(2);
const logger = new Logger({ level: 'error', stdout: false, toFile: false });
const s = await buildStack({ dir, logger, scenario: { users: 1000, commentsPerSec: Number(comments), giftsPerSec: Number(gifts), likesPerSec: 200, seed: Number(seed), streakStepMs: 150, duplicateRate: 0.01 } });
const log = join(dir, 'emitted.log');
s.connector.prependListener('raw', (raw, meta) => { // ghi TRƯỚC khi vào đường ống
  if (raw.type !== 'gift') return;
  try { const ev = normalize(raw, meta); appendFileSync(log, `${ev.payload.gift_key}\t${meta.receivedAt}\n`); } catch { /* sự kiện lỗi: đường ống cũng bỏ */ }
});
const st = join(dir, 'status.json');
setInterval(() => { try { writeFileSync(st, JSON.stringify({ at: Date.now(), unpersisted: s.journal.unpersisted(), journal: s.journal.metrics().counters, persist: s.client.metrics().oldestUnpersistedEventAgeMs })); } catch { /* bỏ qua */ } }, 100);
await s.pipeline.connect();
process.stdout.write(`READY ${JSON.stringify({ restoreMs: s.restoreMs, replayed: s.restore.replayed })}\n`);
