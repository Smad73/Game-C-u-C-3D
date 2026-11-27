# ADR-0017: Persistence Worker — tách ghi DB khỏi event loop chính (R01)
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.9 theo R13: idempotency batch/op, trạng thái batch; R14: chỉ số dữ liệu chưa ghi bền) — Trạng thái: Đề xuất (theo yêu cầu R01, R13, R14 của ChatGPT) — chờ ChatGPT duyệt
- Liên quan: ADR-0016 (giữ `node:sqlite`, **không đổi công nghệ DB**), ADR-0018 (quà), ADR-0019 (backpressure/lỗi lưu trữ), ADR-0022 (độ bền).

## Bối cảnh — rủi ro của `node:sqlite` `DatabaseSync`
| # | Rủi ro | Hệ quả nếu chạy trên luồng chính |
|---|---|---|
| D1 | API **đồng bộ**: mọi `exec/prepare/run/all` chặn luồng gọi | Tick game, WebSocket, Ingest (TikTok) đứng trong lúc ghi |
| D2 | `COMMIT` với `synchronous=FULL` gọi fsync; thời gian phụ thuộc ổ đĩa (SSD/HDD), antivirus Windows, Spotlight macOS | Giật tick vài–hàng chục ms, khó đoán |
| D3 | Checkpoint WAL (tự động khi WAL vượt ngưỡng) chạy ngay trong lệnh commit gây ra nó | Đỉnh trễ bất thường |
| D4 | Truy vấn đọc lớn (BXH phân trang lịch sử, dựng lại cửa sổ 60 phút, nạp hồ sơ lạnh) | Chặn luồng chính |
| D5 | Lỗi I/O (`SQLITE_FULL`, `SQLITE_IOERR`, `SQLITE_BUSY`, `SQLITE_CORRUPT`) ném đồng bộ | Nếu không cô lập: làm sập vòng lặp game |
| D6 | `node:sqlite` còn mới; mức ổn định (stability) theo từng bản Node LTS **chưa xác minh** cho bản LTS sẽ chốt | Thay đổi API giữa các bản Node |
| D7 | Một kết nối không an toàn khi chia sẻ giữa luồng | Phải có đúng một chủ sở hữu kết nối ghi |

## Quyết định
1. **PersistenceWorker** = một `worker_threads` Worker **sở hữu duy nhất** kết nối ghi `DatabaseSync` (single writer). Luồng chính **không bao giờ** gọi `node:sqlite` trực tiếp.
2. **ReadWorker** (tuỳ chọn, bật nếu Phase 3 đo thấy đọc làm trễ ghi): Worker thứ hai mở kết nối **chỉ đọc** (WAL cho phép đọc song song) cho BXH lịch sử, phân trang, nạp hồ sơ lạnh, dựng lại cửa sổ 60 phút. Mặc định: đọc đi qua PersistenceWorker với mức ưu tiên thấp hơn ghi.
3. **Giao tiếp** (`postMessage`, structured clone; schema trong `src/shared/persistence-protocol.js`):
   - Main → Worker: `commit {batchId, class, ops[]}` · `read {reqId, query, params}` · `checkpoint` · `backup {path}` · `shutdown {deadlineMs}`.
   - Main → Worker (0.0.9): `status {batchId}`.
   - Worker → Main: `ack {batchId, committedAtUtc, status:'COMMITTED'|'ALREADY_COMMITTED', results}` · `nack {batchId, code, retryable}` · `batchStatus {batchId, state}` (0.0.9) · `result {reqId, rows}` · `health {walBytes, lastCommitMs, freeBytes}` · `fatal {code}`.
   - `ops[]` là thao tác **khai báo** (upsert/insert-ignore/update-by-key), không phải SQL tự do; mỗi op mang khoá idempotency nên **phát lại an toàn** (ADR-0018).
4. **Batch write (PersistenceClient trên luồng chính):**
   - Lớp `critical` (journal quà, ADR-0018): gom tối đa **50 ms** (group commit) rồi gửi ngay; ưu tiên cao nhất.
   - Lớp `progress` (điểm, cá, tiến trình): gom theo **500 ms hoặc 500 op** (cấu hình).
   - Lớp `state` (world_state, presence, boss): snapshot tối đa mỗi **5 s** hoặc khi đổi trạng thái quan trọng.
   - Lớp `log`: gom lớn, bỏ đầu tiên khi áp lực (ADR-0019).
   - Tối đa **2 batch đang chờ ack** (in-flight, cấu hình); batch sau xếp trong WriteBuffer → tín hiệu backpressure (ADR-0019).
5. **Transaction:** mỗi batch = `BEGIN IMMEDIATE … COMMIT` — **tất cả hoặc không**. Một batch có thể gồm nhiều lớp nhưng thao tác của **một quà** hoặc **một cú câu** không bao giờ bị tách qua hai batch.
6. **WAL & PRAGMA:** `journal_mode=WAL`, **`synchronous=FULL`** (commit đã ack bền cả khi mất điện, theo bảo đảm của SQLite và phần cứng), `busy_timeout=5000`, `foreign_keys=ON`, `wal_autocheckpoint` giữ mặc định + `wal_checkpoint(PASSIVE)` định kỳ khi rảnh, `wal_checkpoint(TRUNCATE)` khi tắt an toàn. Checkpoint chạy trong Worker nên không chặn luồng chính.
7. **Phục hồi:**
   - Khởi động: Worker mở DB → SQLite tự phục hồi WAL → `PRAGMA quick_check` → migration (ADR-0021) → báo `ready`. Luồng chính chỉ chuyển thế giới sang RUNNING sau `ready` + xử lý journal quà (ADR-0018).
   - Worker chết (`exit`/`error`): luồng chính đánh dấu `PERSISTENCE_DEGRADED`, giữ các batch chưa ack trong RAM, khởi động lại Worker (giãn cách tăng dần), với mỗi batch `UNKNOWN` hỏi `status` rồi mới gửi lại (an toàn nhờ idempotency hai lớp — mục R13 bên dưới). Thất bại liên tiếp quá ngưỡng → SAFE MODE (ADR-0019).
   - Tắt an toàn: `shutdown` → Worker commit nốt, checkpoint TRUNCATE, đóng DB, ack → mới thoát.
8. **Đường dẫn & OS:** thư mục dữ liệu do `platform.js` cấp (không đường dẫn tuyệt đối); hướng dẫn Windows: loại trừ thư mục dữ liệu khỏi quét antivirus thời gian thực (khuyến nghị, không bắt buộc).
9. **Xác minh Phase 1:** ghi lại mức stability của `node:sqlite` trong tài liệu Node của bản LTS chốt; nếu là experimental thì báo ChatGPT trước khi dựa vào (không tự đổi DB — cần ADR mới).

## 0.0.9 — R13: Idempotency của PersistenceWorker (batch đã commit nhưng mất ACK)
**Hai lớp chống áp dụng lần hai, cả hai nằm TRONG cùng transaction của batch:**
1. **Lớp batch:** mỗi batch có `batch_id` (UUID sinh ở PersistenceClient, **không đổi** khi gửi lại; client không bao giờ tách/gộp lại một batch đã gửi). Transaction của batch luôn kết thúc bằng `INSERT INTO committed_batches(batch_id, committed_at_utc, op_count, checksum)`. Khi nhận `commit`, Worker kiểm `committed_batches` **trước**: có rồi → không thực thi gì, trả `ack {batchId, status:'ALREADY_COMMITTED'}`.
2. **Lớp operation:** mọi op làm thay đổi tích luỹ (cộng điểm, cộng `leaderboard_scores`, cộng/trừ vật phẩm, gia hạn/thêm buff, cộng XP/tiến trình, cộng đóng góp Boss, đếm sổ tay) mang **`op_key` ổn định sinh từ miền nghiệp vụ** (không phải số ngẫu nhiên): ví dụ `catch:<catch_id>:score`, `catch:<catch_id>:xp`, `gift:<gift_key>:<effect_seq>`, `boss:<event_id>:reward:<player_key>`, `ach:<player_key>:<achievement_id>`. Worker thực hiện `INSERT OR IGNORE INTO applied_ops(op_key, batch_id, at_utc)` rồi **chỉ** chạy phép cộng khi câu lệnh đó chèn được 1 dòng (`changes() = 1`). Op dạng chèn dòng mới (ledger, catches) dùng `UNIQUE(source_key, effect_seq)` / PK tự nhiên với `INSERT OR IGNORE`. Op ghi đè trạng thái (snapshot `world_state`, `player_presence`) là **idempotent tự nhiên** (ghi cùng giá trị hai lần không đổi kết quả) và mang `version` tăng dần để không ghi đè bằng bản cũ hơn.
- Lý do cần cả hai lớp: lớp batch rẻ và bắt trường hợp phổ biến (gửi lại nguyên batch); lớp op bắt trường hợp cùng một op nghiệp vụ lọt vào hai batch khác nhau (lỗi logic, phục hồi sau crash tiến trình rồi replay từ journal).
- Lưu giữ: `committed_batches` và `applied_ops` được dọn bản ghi cũ hơn **7 ngày** (cấu hình). An toàn vì cửa sổ gửi lại một batch chỉ tính bằng giây–phút; replay journal quà dựa trên `gift_events.status` (không phụ thuộc `applied_ops` cũ). Không dọn trong lúc có batch đang chờ.

**Trạng thái batch (PersistenceClient theo dõi):**
| Trạng thái | Ý nghĩa | Xử lý |
|---|---|---|
| `PENDING` | Trong WriteBuffer, chưa gửi | Gửi khi đến lượt |
| `SENT` | Đã gửi, chưa có phản hồi | Chờ; quá `persist.ackTimeoutMs` → `UNKNOWN` |
| `COMMITTED` | `ack` (kể cả `ALREADY_COMMITTED`) | Giải phóng; công bố RAM nếu là batch hiệu ứng quà (ADR-0018 bước 5) |
| `REJECTED` | `nack` **không thử lại được** (vi phạm ràng buộc ngoài dự kiến, op sai schema) — transaction đã rollback toàn bộ | Không gửi lại nguyên batch; ghi `rejected_batches` (nội dung + lỗi) vào file cách ly trong thư mục dữ liệu, cảnh báo `BATCH_REJECTED`; op quà liên quan → `FAILED` (ADR-0018); dữ liệu tiến trình liên quan được đánh dấu trong metrics là "chưa ghi bền" |
| `RETRYABLE` | `nack` thử lại được (BUSY, IOERR tạm thời, FULL) — đã rollback | Gửi lại **nguyên batch cùng `batch_id`** với giãn cách tăng dần (ADR-0019) |
| `UNKNOWN` | Worker chết / hết thời gian chờ ack | Sau khi Worker sẵn sàng: gửi `status {batchId}` → Worker trả `COMMITTED` (có trong `committed_batches`) hoặc `NOT_FOUND` (chưa commit, đã rollback do WAL) → tương ứng chuyển `COMMITTED` hoặc gửi lại |
Thêm message: `status {batchId}` → `batchStatus {batchId, state:'COMMITTED'|'NOT_FOUND'}`.

**Kiểm thử bắt buộc (Phase 1 khung, Phase 2–3 đầy đủ):** (W1) Worker commit thành công rồi bị giết **trước khi gửi ack** (điểm chèn lỗi `after_commit_before_ack`) → client gửi lại batch → **hash trạng thái DB trước và sau lần gửi lại giống hệt**; (W2) gửi cùng một op nghiệp vụ trong hai batch khác `batch_id` → chỉ áp dụng một lần; (W3) nack retryable rồi gửi lại → áp dụng một lần; (W4) batch REJECTED không làm thay đổi DB; (W5) dọn `applied_ops` không xoá bản ghi của batch đang chờ.

## 0.0.9 — R14: Chỉ số dữ liệu có nguy cơ mất (thay cho chỉ dùng `persist.unackedAgeMs`)
`persist.unackedAgeMs` của bản 0.0.8 **chỉ đo batch đã gửi**, không đo dữ liệu còn nằm trong RAM chưa thành op. Thay bằng bộ chỉ số (Metrics, `/api/metrics`, Control):
| Chỉ số | Đo gì |
|---|---|
| `persist.oldestUnpersistedEventAgeMs` | Tuổi của sự kiện/thay đổi cũ nhất **chưa được ghi bền** (tính từ lúc sự kiện vào hệ thống: quà từ lúc connector phát; cú câu từ lúc kết quả được tính) — gồm cả phần ở RAM, WriteBuffer và batch đang bay |
| `persist.oldestUnackedBatchAgeMs` | Tuổi batch `SENT`/`UNKNOWN`/`RETRYABLE` cũ nhất chưa có ack |
| `persist.unpersistedByType{giftReceived, giftEffect, catch, progress, state, log}` | Số sự kiện/thay đổi chưa ghi bền theo loại |
| `persist.ramDirtyNotEnqueued{count, oldestAgeMs}` | Số thay đổi trong RAM **chưa được đưa vào hàng đợi ghi** (ví dụ trường dirty của presence/state chờ snapshot) |
| `persist.writeBufferOps`, `persist.inFlightBatches` | Kích thước bộ đệm và số batch đang bay |
Ngưỡng cảnh báo/bậc quá tải dùng các chỉ số này (ADR-0019). **Các chỉ số chỉ là cảnh báo vận hành, không phải cam kết độ bền**; RPO thực tế chỉ được ghi khi đã đo bằng crash test (ADR-0022) và ghi vào TEST_REPORT.

## Phương án đã loại
- Gọi `DatabaseSync` trên luồng chính (D1–D5).
- Chỉ dựa vào `UNIQUE` trên bảng đích (không chặn được phép **cộng** lặp lại vào bộ đếm) — bản 0.0.8 chưa đủ cho R13.
- Nhiều Worker cùng ghi (SQLite chỉ một writer; tăng `SQLITE_BUSY`).
- Child process riêng cho DB (IPC nặng hơn, khó đóng gói 2 OS; Worker đủ).
- Đổi sang `better-sqlite3`/DB server (trái ADR-0016; cần ADR riêng).

## Hệ quả
- Luồng chính chỉ thấy API bất đồng bộ (`await client.commit(...)`, `await client.read(...)`).
- Cần test: Worker chết giữa batch; ack chậm; fsync chậm giả lập; đo p95 tick không đổi khi ghi tải lớn (Phase 3).
- Bộ nhớ: batch chưa ack nằm trong RAM — có trần, xem ADR-0019.
