# PHASE 2 — TIKTOK INGEST & GIFTJOURNAL — BÁO CÁO (BẢN NHÁP, CHƯA ĐỀ XUẤT NGHIỆM THU)
Ngày 2026-11-25 · Kiến trúc v0.0.9 · Phase 1 v0.1.0 · Model: Opus 5.5 (theo NOVA MODEL SELECTION POLICY) · Không tự đánh dấu APPROVED.
**Chưa đề xuất nghiệm thu vì:** (1) **P0** — thư viện TikTok được kiến trúc ghim có giấy phép AGPL và gọi dịch vụ ngoài → chưa cài, chưa kiểm LIVE thật (Module 10); (2) mã chưa được commit (chờ người dùng yêu cầu; xem mục 20, kèm lỗi L-014 của Phase 1).

## 1. Kiến trúc thực tế (đúng ADR-0003/0006/0017/0018/0019/0021/0022, không đổi kiến trúc)
`Connector (Live | Mock | LoadGen — cùng ConnectorBase)` → `IngestPipeline` → `Normalizer` → quà: `GiftJournal` (RECEIVED bền → hiệu ứng + APPLIED một transaction trong `PersistenceWorker` → **chỉ sau ACK** mới `publishCommittedGift` → consumer) · sự kiện khác: dedupe → rate-limit comment → `PriorityEventQueue` → bộ xử lý tầng sau (Phase 3). `LiveSessionManager` định danh buổi LIVE theo room_id/streamEnd. `OverloadController` (Phase 1) nhận thêm đầu vào ingest. Consumer RAM ở Phase 2 là `GiftTotalsView` (tổng quà theo người chơi) — WorldCore đăng ký ở Phase 3.

## 2–3. Module & cấu trúc mã
| # | Module | Tệp | Trạng thái |
|---|---|---|---|
| 01 | Ingest Adapter (vòng đời, nối lại có giới hạn, chặn kết nối trùng, streamEnd) | `src/ingest/ConnectorBase.js`, `LiveConnector.js` | Khung + adapter xong; **gắn thư viện thật: CHỜ P0** |
| 02 | Mock Connector (tốc độ, lỗi, trùng, muộn, streak, rớt mạng, lỗi connector; seed tất định) | `src/ingest/MockConnector.js` | Xong |
| 03 | Event Normalizer (schema v1, 3 mốc thời gian, gift_key, làm sạch) | `src/ingest/Normalizer.js`, `events.js` | Xong |
| 04 | LIVE/DEMO | `src/app.js` (realm theo nguồn → nova-live.db / nova-demo.db), Worker `checkRealmKey` | Xong (2 lớp phòng thủ, có test) |
| 05 | GiftJournal + idempotency + streak | `src/gifts/GiftJournal.js`, `GiftTotalsView.js`, Worker `giftReceive/giftApply/giftMark` | Xong |
| 06 | PersistenceWorker integration | `src/data/PersistenceWorker.js` (op mới, kết quả op trong ACK), `PersistenceClient.js` (`results`, `kill()` cho test) | Xong |
| 07 | Hàng đợi & backpressure, thang S1–S4 | `src/ingest/PriorityEventQueue.js`, `IngestPipeline.js`, `GiftJournal` (S2/S3/S4), `OverloadController` | Xong một phần — thiếu từ chối WS mới khi S4 + thông báo stage |
| 08 | Recovery & crash tests | `tests/crash.test.js`, `tools/crash-suite.js`, `tools/crash-child.js` | Xong (CR1, CR2, CR8, CR9, CR10) |
| 09 | LoadGenerator | `tools/load-generator.js` (`npm run load`) | Xong |
| 10 | TikTok LIVE thật | — | **CHƯA — P0** |
| + | LiveSessionManager (ARCHITECTURE §8 Phase 2) | `src/ingest/LiveSessionManager.js` | Xong (room_id thật chưa kiểm) |
API Control mới: `GET /api/ingest`, `POST /api/ingest/connect`, `POST /api/ingest/disconnect`, `POST /api/ingest/end-live` (thao tác nguy hiểm, audit); `/api/metrics` có thêm `ingest`.

## 4. Dependency
Không thêm dependency nào. **Chưa cài** `tiktok-live-connector@2.5.0`. Thông tin đã tra (npm registry, 2026-11-25): giấy phép **AGPL-3.0-only**; nguồn github.com/zerodytrash/TikTok-Live-Connector; `engines node >=20`; phụ thuộc `@bufbuild/protobuf`, `got`, `ws`, `typed-emitter`, **`tiktok-live-proto@0.2.4` (AGPL-3.0-only)**, **`tiktok-live-api-sdk@0.4.0-beta1` (MIT, SDK của dịch vụ Euler Stream — dịch vụ ký bên thứ ba)**. Thư viện không chính thức; API dự kiến (`TikTokLiveConnection`, sự kiện `chat/gift/like/follow/share/member/streamEnd/disconnected/error`) **chưa kiểm chứng** với gói thật.

## 5–6. Database & migration
`002_ingest.sql`: thêm `players.gift_coins_total/gift_count_total`; mở rộng `gift_events` (source, source_event_id, key_mode M|S|H, streak_key, repeat_end, gift_name, live_session_id, room_id, occurred_at_utc, applied_qty, applied_coins, reason, last_error); bảng mới `gift_streaks`, `gift_ledger` (UNIQUE source_key, effect_seq), `live_sessions` (room_id UNIQUE). Chạy trong transaction, có backup tự động trước migration (cơ chế Phase 1). Test cũ kỳ vọng schema = 1 đã sửa thành "bản mới nhất" (không nới kiểm tra khác).

## 7. TikTok Connector
Adapter độc lập thư viện, nạp trễ; thiếu thư viện → `LIBRARY_NOT_INSTALLED`, FAILED, không thử lại vô ích. Ánh xạ trường viết phòng thủ cho dạng phẳng (1.x) và lồng protobuf (2.x) — chỉ thử với thư viện giả. Phòng không phát → ENDED, không poll. Không gửi comment/quà, không lưu thông tin đăng nhập.

## 8–9. Mock & Normalizer
Mock: cùng giao diện `ConnectorBase`, realm luôn demo. Normalizer: dữ liệu TikTok coi là không đáng tin (NFC, bỏ ký tự điều khiển/bidi/zero-width, giới hạn độ dài, ID dài giữ dạng chuỗi, payload ≤ 16 KB), lỗi có mã, timestamp bất thường → null + cờ, không tự tạo source ID.

## 10–12. GiftJournal, idempotency, streak
- Khoá: `M:msgId` · `S:<player>:<giftId>:<groupId>:<repeatCount>` (cộng phần tăng so với `gift_streaks.max_count`, tính TRONG transaction của Worker) · `H:hash` (WEAK, cờ `WEAK_GIFT_KEY`).
- **Quyết định cần ChatGPT xem lại:** quà streak **thiếu groupId** → sự kiện giữa chừng journal `REJECTED (STREAK_NO_GROUP_INTERMEDIATE)`, chỉ sự kiện `repeatEnd` được tính (số lượng = repeatCount). Lý do: không có groupId thì không phân biệt được hai streak, cộng từng sự kiện sẽ thành 1+2+3… Hệ quả: streak thiếu cả groupId lẫn repeatEnd sẽ không được tính (ghi rõ là giới hạn).
- Hai lớp chống áp dụng lần hai trong cùng transaction: `committed_batches` + `applied_ops (gift:<key>:totals)` + `gift_ledger UNIQUE` + kiểm `status` trước khi áp dụng. Batch mất ACK → hỏi `status`/đọc DB theo gift_key, không đoán.
- Máy trạng thái RECEIVED → APPLIED | REJECTED | FAILED(attempts++) → DEAD + `GIFT_DEAD`. Không tuyên bố exactly-once.

## 13. Recovery
Khởi động: dựng RAM từ DB → nhập tệp khẩn cấp S2 → replay RECEIVED/FAILED → mới nhận sự kiện. Kết quả CR1/CR2/CR8: mục 16.

## 14. Backpressure & thang lưu trữ
Hàng đợi có trần theo lớp (bỏ/gộp đều được đếm), critical không bao giờ bỏ. Quá tải: L2 (tốc độ, hàng đợi > 50%), L3/L4 (quà chờ lâu), L4 (INGEST_HALT). S1 DB → S2 `emergency-<realm>/emergency-gifts-*.jsonl` (fsync nhóm 50 ms, nhập lại idempotent, đổi tên `.imported`, không xoá) → S3 RAM có trần + `GIFT_AT_RISK` → S4 ở 90%: ngắt connector, chặn nối lại cho tới khi lưu trữ khôi phục; S3 → S2 khi tệp ghi được lại. Thư mục khẩn cấp tách theo realm.

## 15. LoadGenerator
`npm run load -- --comments 1000 --gifts 200 --duration 600 …` — đo throughput, trễ, hàng đợi, commit, thử lại, từ chối, bộ nhớ, CPU, kích thước DB; báo cáo JSON. Không đặt giới hạn người chơi.

## 16. Kết quả kiểm thử (chi tiết: TEST_REPORT.md)
`npm test` 161/161 · CR1 50 kill SIGKILL: I1/I2/I3/I9 đạt 50/50, mất mỗi kill p95 31 quà (≤ 55 ms trước kill, đúng cửa sổ G3), RTO p95 169 ms · CR2 10 lần giết Worker: 0 thiếu, progress khớp chính xác · CR8 16/16 dưới tải · Tải 10 phút: 1,03 triệu sự kiện, I1–I3 đạt, trễ quà p95 140 ms (< 1 s), 0 bỏ.

## 17. TikTok LIVE thật
**Chưa kiểm chứng.** Cần: quyết định thư viện (mục 18), một LIVE thử của chính người dùng, rồi ghi nhận thực tế room_id, userId, giftId, msgId, repeatCount, repeatEnd, groupId, streamEnd, disconnect/reconnect.

## 18. Vấn đề còn tồn tại
| Mức | Vấn đề | Đề xuất |
|---|---|---|
| **P0** | `tiktok-live-connector` AGPL-3.0-only (+ proto AGPL) mâu thuẫn mục tiêu bán sản phẩm; 2.x gửi dữ liệu qua Euler Stream (bên thứ ba) | Người dùng/ChatGPT chọn: (a) chấp nhận AGPL (công bố mã nguồn theo giấy phép) · (b) xin giấy phép thương mại/ý kiến pháp lý · (c) thư viện/adapter khác (cần ADR mới). Adapter đã sẵn để thay thư viện không phải sửa game |
| P1 | Lớp lưu trữ Phase 1 (`src/data/*`) chưa từng commit do `.gitignore` (L-014) — đã sửa `.gitignore` | Commit ngay khi người dùng cho phép |
| P1 | DB tăng ~25 MB/phút ở tải chuẩn; chưa dọn `committed_batches`/`applied_ops` > 7 ngày | Dọn định kỳ trong Worker (ADR-0017 đã quy định) + đo trên buổi LIVE thực tế |
| P1 | S4: chưa từ chối WebSocket mới (trừ admin) và chưa có thông báo "đang bảo trì" trên stage | Làm cùng Phase 7 (Control/Overlay) hoặc sớm hơn nếu duyệt |
| P2 | API `/api/ingest*` chưa có test HTTP riêng; ánh xạ trường thư viện chỉ thử với bản giả | Thêm test khi có thư viện |
| P2 | A5 (tái dùng glass-bridge) không cần nữa: viết mới, không chép mã cũ | Đóng A5 |

## 19. Chưa kiểm chứng
TikTok LIVE thật; Windows; mất điện thật (CR7); đĩa đầy thật (CR5, Phase 3); khôi phục backup (CR6, Phase 3); hộp thoại tương tác OBS (đã miễn ở Phase 1).

## 20. Git
Nhánh `main`, HEAD `a96f968` (chưa push). **Toàn bộ Phase 2 + tài liệu NOVA chưa commit** (không tự commit). `src/data/` chưa từng được theo dõi (L-014). Đề xuất khi được phép: 1 commit sửa `.gitignore` + thêm `src/data/` của Phase 1, rồi các commit Phase 2 theo module.

## 21. Đề xuất Phase 3
Sau khi xử lý P0 (hoặc chấp nhận làm Phase 3 song song với Mock): WorldCore đăng ký `onCommittedGift` + `onEvent`, PlayerRegistry nóng/lạnh, FishingSim, ScoreLedger, BXH 5 phạm vi, batch `progress/state`, backup `VACUUM INTO`, CR1–CR6 đầy đủ với RPO/RTO theo ADR-0022.
