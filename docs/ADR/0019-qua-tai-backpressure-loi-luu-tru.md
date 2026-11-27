# ADR-0019: Bậc quá tải, backpressure, cảnh báo, phục hồi sự kiện & lỗi lưu trữ (R04 + R05)
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.9 theo R11: thang lưu trữ khẩn cấp S1–S4, ngừng tiếp nhận có kiểm soát; R14: ngưỡng theo chỉ số mới) — Trạng thái: Đề xuất (yêu cầu R04, R05, R11 của ChatGPT) — chờ duyệt
- Liên quan: ADR-0005 (không giới hạn người chơi), ADR-0006 (hàng đợi), ADR-0017 (Worker), ADR-0018 (quà), ADR-0022 (độ bền).

## Nguyên tắc (R04 — giữ nguyên quyết định không giới hạn)
- **Không có giới hạn cứng số cần thủ** ở gameplay, DB, API, UI (không 16, 100, 1.000 hay bất kỳ số nào).
- **Giới hạn vận hành** = ngưỡng cấu hình để bảo vệ máy; chạm ngưỡng thì **giảm chất lượng / gộp / làm chậm / chuyển hồ sơ lạnh / tạm dừng mô phỏng**, **không bao giờ**: từ chối người tham gia, xoá người chơi, chủ động bỏ quà.
- Bảng giới hạn vận hành (mặc định, đều cấu hình được, đều không phải luật chơi):

| Khoá cấu hình | Mặc định | Khi chạm |
|---|---|---|
| `ingest.globalEventsPerSec` | 2.000 | Bậc L2 |
| `queue.p3.max`, `queue.p4.max` | 20.000 / 50.000 | Gộp/lấy mẫu (P4), giảm tần suất (P3) |
| `queue.p1.softMax` | 5.000 | Cảnh báo; **không bỏ** — quà đã journal nằm ở DB |
| `persist.maxInFlightBatches` | 2 | Gom batch lớn hơn |
| `persist.writeBufferSoftMax` / `HardMax` | 50.000 / 200.000 op | L3 / L4 |
| `persist.oldestUnpersistedEventAgeMs` ngưỡng warn / crit (0.0.9, R14 — thay `unackedAge`) | 2.000 / 10.000 | Cảnh báo `PERSIST_LAG` / L4 |
| `persist.oldestUnackedBatchAgeMs` ngưỡng warn / crit | 2.000 / 10.000 | Cảnh báo / L4 |
| `emergency.ramGiftsMax` (bộ đệm quà khẩn cấp trong RAM, R11) | 20.000 quà (cấu hình theo RAM) | Mốc 90% → ngừng nhận sự kiện (xem mục R11) |
| `players.hotAfkToColdMs` | 30 phút | Giảm dần ở L3 (tối thiểu 5 phút) |
| `render.*` (ngân sách LOD, draw call) | theo preset | L1 |
| `ws.stageHz` | 10 | Giảm còn 5 ở L2 |
| `disk.warnFreeBytes` / `critFreeBytes` / `safeFreeBytes` | 2 GB / 500 MB / 100 MB | Xem mục Lưu trữ |

## Bậc quá tải (OverloadController)
| Bậc | Kích hoạt (bất kỳ) | Hành động |
|---|---|---|
| L0 Bình thường | — | — |
| L1 Render | FPS stage < 27 trong 3 s | Giảm LOD0/LOD1, render scale, preset |
| L2 Sự kiện | Tổng sự kiện/s > ngưỡng; P3/P4 > 50% max; tick p95 > 20 ms | Gộp like/share theo người/giây; siết token bucket lệnh; giảm `ws.stageHz` |
| L3 Bộ nhớ/ghi | WriteBuffer > softMax; heap > ngưỡng; `oldestUnpersistedEventAgeMs` hoặc `oldestUnackedBatchAgeMs` > warn | Gom batch lớn hơn; chuyển AFK → COLD sớm hơn; tạm dừng ghi `log` |
| L4 Bảo vệ | WriteBuffer > hardMax; `oldestUnpersistedEventAgeMs` hoặc `oldestUnackedBatchAgeMs` > crit; Worker lỗi lặp lại; đĩa < `safeFreeBytes` | **PAUSED_PROTECT**: đóng băng FishingScheduler + WorldEventScheduler (không sinh thêm ghi), **vẫn nhận và journal quà**, Control báo đỏ; tự trở về L3 khi xả xong |
| SAFE MODE | DB `SQLITE_CORRUPT`; không mở được DB; Worker không khởi động lại được | Ngừng mọi ghi tiến trình; quà đi theo **thang lưu trữ khẩn cấp** ở mục R11 (file append-only `emergency-gifts-<ts>.jsonl` → bộ đệm RAM có trần → **ngừng nhận sự kiện** trước khi tràn); Control hướng dẫn khôi phục từ backup |
Mỗi lần đổi bậc: log + metrics + cảnh báo Control; có trễ (hysteresis) để tránh dao động.

## Backpressure (chuỗi)
TikTok socket → Ingest (không thể làm chậm nguồn) → **token bucket + gộp** (L2) → PriorityEventQueue (có trần theo lớp) → GameCore xử lý theo ngân sách ms/tick → PersistenceClient WriteBuffer (trần mềm/cứng) → Worker (`maxInFlightBatches`). Khi tầng sau đầy, tầng trước **giảm việc sinh ra** (gộp, chậm mô phỏng, PAUSED_PROTECT) chứ không bỏ quà. Lệnh tham gia (P2) có tập "đang chờ" theo người (mỗi người tối đa 1 mục) → kích thước tự giới hạn bởi số người khác nhau, không bỏ.

## Cảnh báo quá tải
`/api/metrics` trả `alerts[]` (mã, mức `warn|critical`, từ lúc nào, gợi ý xử lý tiếng Việt); Control hiện thanh cảnh báo; stage **không** hiển thị cho khán giả (tuỳ chọn biểu tượng nhỏ khi Admin bật). Mã: `QUEUE_HIGH`, `TICK_SLOW`, `PERSIST_LAG`, `PERSIST_DEGRADED`, `DISK_LOW`, `DISK_CRITICAL`, `DB_ERROR`, `SAFE_MODE`, `GIFT_DEAD`, `WEAK_GIFT_KEY`.

## Phục hồi sự kiện sau restart (R05)
| Loại | Lưu bền? | Sau restart |
|---|---|---|
| Quà đã commit `RECEIVED` | Có | Replay theo ADR-0018 trước khi RUNNING |
| Quà chưa commit | Không | **Mất** (ADR-0018 G3) |
| Hàng chờ Boss quà | Có (`world_events QUEUED`) | Khôi phục thứ tự |
| Comment/lệnh/like/share/join trong RAM | Không | Mất — chấp nhận: người chơi comment lại; hồ sơ đã có vẫn còn |
| File khẩn cấp `emergency-gifts-*.jsonl` | Có (nếu ghi được) | Khi DB hoạt động lại: nhập vào journal bằng `INSERT OR IGNORE` theo `gift_key` (idempotent) |

## Lỗi lưu trữ
| Tình huống | Phát hiện | Xử lý |
|---|---|---|
| Ổ đĩa sắp đầy | Worker đo dung lượng trống định kỳ 30 s (`fs.statfs`, hỗ trợ macOS + Windows qua libuv — xác minh Phase 1) | < 2 GB: cảnh báo; < 500 MB: ngừng `log`, ngừng ghi `comment_logs`, nén/xoay log; < 100 MB: L4 PAUSED_PROTECT (chỉ còn journal quà + ledger) |
| `SQLITE_FULL` / `ENOSPC` | nack từ Worker | Batch giữ lại, thử lại giãn cách; L4; nếu journal quà không ghi được → SAFE MODE đường quà khẩn cấp |
| `SQLITE_BUSY` | nack retryable | Thử lại (busy_timeout 5 s + backoff); nguyên nhân thường gặp: antivirus/backup ngoài |
| `SQLITE_IOERR` | nack | Thử lại N lần → khởi động lại Worker → SAFE MODE nếu vẫn lỗi |
| `SQLITE_CORRUPT` / `quick_check` lỗi | Khởi động hoặc nack | SAFE MODE ngay; không ghi thêm; Control đề xuất khôi phục backup gần nhất (ADR-0022) |
| Logger không ghi được | Lỗi ghi file log | Chuyển sang stderr, không làm sập game |

## 0.0.9 — R11: Khi mọi nơi lưu trữ đều thất bại
**Nguyên tắc:** không chủ động bỏ quà **khi hệ thống còn khả năng tiếp nhận và lưu trữ**. Khi khả năng đó cạn, hệ thống **ngừng tiếp nhận có kiểm soát** thay vì nhận rồi đánh rơi, và **nói rõ** với người vận hành rằng đang có nguy cơ mất dữ liệu. **Không** tuyên bố có thể giữ quà vô hạn hay bảo đảm không mất quà khi không còn nơi lưu trữ.

**Thang lưu trữ quà (theo thứ tự):**
| Tầng | Điều kiện dùng | Độ bền |
|---|---|---|
| S1 DB qua Worker (bình thường) | Worker hoạt động, ghi được | Bền (ADR-0018) |
| S2 File khẩn cấp `data/emergency-gifts-<ts>.jsonl` | S1 thất bại: DB không ghi được (FULL/IOERR/CORRUPT) hoặc Worker không khởi động lại được | Ghi nối đuôi, fsync theo nhóm ≤ 50 ms; bền nếu fsync thành công; nhập lại vào journal bằng `INSERT OR IGNORE` theo `gift_key` khi DB hoạt động |
| S3 Bộ đệm RAM khẩn cấp | S1 **và** S2 thất bại (đĩa đầy, mất quyền ghi, ổ bị gỡ) | **Không bền** — mất nếu tiến trình chết; có trần `emergency.ramGiftsMax` |
| S4 Ngừng tiếp nhận | S3 đạt **90%** trần (10% còn lại là vùng đệm cho sự kiện đang trên đường trong lúc ngắt) | Không nhận thêm sự kiện |

**Hành vi theo từng tình huống:**
| Tình huống | Hành vi |
|---|---|
| DB không ghi được | SAFE MODE; thế giới PAUSED_PROTECT (không sinh thêm tiến trình); quà → S2; cảnh báo **critical** `DB_ERROR` + `SAFE_MODE`; Worker thử lại theo giãn cách |
| Worker không khởi động lại được (hết số lần thử) | Như trên + `PERSIST_DEGRADED`; batch chưa ack giữ trong RAM (trần WriteBuffer); quà mới → S2 |
| File khẩn cấp không ghi được | Quà → S3; cảnh báo **critical** `GIFT_AT_RISK`: "Đang giữ N quà chỉ trong bộ nhớ — sẽ MẤT nếu game tắt hoặc sập. Giải phóng ổ đĩa / khôi phục DB ngay." Hiện thường trực trên Control, kèm âm báo; ghi stderr. Bộ đếm N cập nhật liên tục |
| Bộ đệm RAM chạm 90% | **S4 INGEST_HALT**: ngắt connector TikTok (theo luật NOVA, **không tự nối lại**), ngừng nhận lệnh/quà từ Mock, **từ chối kết nối WebSocket mới** của stage/control trừ phiên admin đang mở (để còn điều khiển khôi phục); cảnh báo critical `INGEST_HALTED`. Quà khán giả gửi sau thời điểm này **không đến được game** (game không thể ghi nhận) — ghi rõ trong cảnh báo và hướng dẫn |
| Thông báo cho khán giả | Khi S3 hoặc S4: stage hiện thông báo trung tính "Hệ thống đang bảo trì — quà tạm thời chưa được ghi nhận" (bật mặc định, Admin tắt được) để khán giả không tặng quà vào lúc game không xử lý được |
| Khôi phục | Khi S1 hoặc S2 ghi được lại: xả S3 → S2/S1 (theo `gift_key`, idempotent) → xả S2 → journal → replay (ADR-0018) → thoát SAFE MODE khi các chỉ số về ngưỡng; **nối lại TikTok chỉ khi người vận hành bấm "Kết nối"** |
| Tiến trình chết khi đang ở S3/S4 | Quà trong S3 **mất**; số lượng cuối cùng đã được log (stderr/log file nếu ghi được) để đối soát thủ công |

**Kiểm thử:** giả lập lần lượt S1 thất bại, S1 + S2 thất bại, S3 đầy → kiểm: không nhận rồi đánh rơi quà nào (mọi quà đã nhận nằm ở S1/S2/S3 cho đến khi tiến trình chết), INGEST_HALT xảy ra trước khi S3 tràn, cảnh báo đúng mức, khôi phục xả đúng một lần.

## Không tuyên bố
Không tuyên bố "quà không bao giờ mất". Tuyên bố được (sau kiểm thử): quà đã commit `RECEIVED` không bị bỏ và không bị áp dụng hai lần; khi hệ thống còn khả năng tiếp nhận và lưu trữ thì không chủ động bỏ quà (R11); khi hết nơi lưu trữ thì ngừng tiếp nhận có kiểm soát và cảnh báo rõ nguy cơ mất; mọi quà rơi vào đường khẩn cấp hoặc DEAD đều có cảnh báo.

## Kiểm thử
Tải vượt ngưỡng từng bậc (LoadGenerator); giả lập Worker chậm/chết; giả lập ENOSPC/IOERR/BUSY/CORRUPT bằng chế độ fault-injection của PersistenceClient/Worker (chỉ bật trong test); một test đĩa đầy thật trên ổ dung lượng nhỏ (công cụ chỉ dùng trong test, không thuộc build chung; bản Windows ở Windows Validation).
