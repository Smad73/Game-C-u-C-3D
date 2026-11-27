# ADR-0018: Idempotency quà & GiftJournal phục hồi sau crash (R02)
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.9 theo R09: commit trước, công bố RAM sau; ranh giới crash GB0–GB8; R13 idempotency batch ở ADR-0017) — Trạng thái: Đề xuất (yêu cầu R02, R09 của ChatGPT) — chờ duyệt
- Liên quan: ADR-0006 (đường ống), ADR-0017 (Worker, transaction), ADR-0019 (lỗi lưu trữ), ADR-0022 (RPO).

## Phạm vi bảo đảm (nói thẳng, không phóng đại)
- **KHÔNG** tuyên bố "exactly-once" đầu–cuối. Lý do: (a) TikTok/`tiktok-live-connector` không cho phát lại sự kiện đã lỡ; (b) độ ổn định của `msgId` và cách thư viện báo streak (`repeatCount`, `repeatEnd`, `groupId`) **chưa được kiểm chứng trên LIVE thật**; (c) có khoảng thời gian giữa lúc nhận từ socket và lúc ghi bền.
- Bảo đảm **mục tiêu thiết kế** (sẽ được kiểm thử, chưa chứng minh):
  - **G1 — Không áp dụng hai lần:** hiệu ứng **được lưu bền** của một khoá idempotency được áp dụng **tối đa một lần**, kể cả sau crash và phát lại batch.
  - **G2 — Không bỏ sót sau khi đã ghi bền:** mọi quà đã có dòng `RECEIVED` được commit (đã ack) sẽ kết thúc ở `APPLIED`, `REJECTED` hoặc `DEAD` (có cảnh báo cho người vận hành) — không có trạng thái treo vĩnh viễn.
  - **G3 — Khoảng có thể mất:** quà nhận được nhưng **chưa** commit `RECEIVED` (tối đa ≈ thời gian chờ hàng đợi + group commit 50 ms, khi bình thường) **có thể mất** nếu tiến trình chết/mất điện trong khoảng đó. Quà mà thư viện không nhận được thì game không thể biết.
  - Hiệu ứng **chỉ hiển thị** (banner, âm thanh, FX) **có thể lặp** hoặc đã hiện trước khi crash — không ảnh hưởng trạng thái.

## Khoá idempotency
- Quà thường: `gift_key = "M:" + msgId`.
- Quà streak: mỗi cập nhật streak có khoá `"S:" + userKey + ":" + giftId + ":" + groupId + ":" + repeatCount`; số lượng áp dụng = `repeatCount − max(repeatCount đã ghi cho cùng streak)` (chỉ phần tăng, ≥ 0). Streak chốt khi `repeatEnd`.
- Nếu thiếu `msgId`/`groupId` (thư viện không cung cấp): khoá dự phòng `"H:" + hash(userKey, giftId, repeatCount, createTime)` + ghi cảnh báo `WEAK_KEY` (rủi ro trùng/thiếu ghi trong Matrix và báo cáo).
- `gift_events.gift_key` **UNIQUE**; mọi bảng nhận hiệu ứng từ quà có cột `source_key` với **UNIQUE (source_key, effect_seq)**.

## Máy trạng thái journal
`RECEIVED → APPLIED` · `RECEIVED → REJECTED` (quà không gán hành động/bị tắt — vẫn lưu, vẫn tính BXH xu nếu có) · `RECEIVED → FAILED (attempts++) → … → DEAD` (quá N lần, cảnh báo Control, xử lý tay) — không có xoá.

## Quy trình (mỗi quà) — **0.0.9, theo R09: commit trước, công bố RAM sau**
> Lịch sử: bản 0.0.8 cập nhật trạng thái RAM ở bước "Áp dụng" **trước** khi commit hiệu ứng + APPLIED (WorldCore có thể dùng hiệu ứng chưa bền). ChatGPT yêu cầu đổi (R09). Quy trình dưới đây **thay thế** quy trình 0.0.8.

1. **Nhận** (Ingest, luồng chính): chuẩn hoá → dedupe RAM (LRU) → tính `gift_key`, `effect_params` (**mọi tham số phụ thuộc thời gian/ngẫu nhiên được chốt tại đây**: `received_at_utc`, thời lượng buff → `expires_at_utc`, giá trị RNG nếu có).
2. **Ghi bền RECEIVED** (batch `critical`, ≤ 50 ms): `INSERT OR IGNORE gift_events(gift_key, …, status='RECEIVED', effect_params)`; **chờ ack**. Bị IGNORE (đã có) → dừng, đây là trùng. Ingest phải `RECEIVED`-ack xong mới chuyển bước 3.
3. **Tính hiệu ứng tất định** (luồng chính, **không chạm RAM của WorldCore**): từ `effect_params` sinh danh sách op hiệu ứng. Mọi op hiệu ứng được viết dưới dạng **delta tương đối có khoá idempotency** (ví dụ `+score`, `+qty`, `buff(expires_at_utc)`, `enqueueBoss(gift_key)`), **không** dựa trên giá trị đọc từ RAM (tránh tính trên trạng thái chưa bền). Hiệu ứng cần giá trị phụ thuộc trạng thái (ví dụ vị trí trong hàng chờ Boss) được **tính trong transaction của Worker** và trả về trong ack.
   - Hiệu ứng đang chờ commit nằm trong `PendingGiftEffects` (chỉ để theo dõi/metrics), **vô hình với gameplay**: FishingSim, Leaderboards, BuffManager, WorldEventScheduler không đọc nó.
4. **Commit một transaction** (batch `critical`): tất cả op hiệu ứng (ledger, `leaderboard_scores`, `players` counters, túi đồ, buff, `world_events QUEUED`, đóng góp Boss) + op khoá idempotency (ADR-0017 R13) + `UPDATE gift_events SET status='APPLIED', applied_at_utc=… WHERE gift_key=? AND status IN ('RECEIVED','FAILED')`. Hiệu ứng và `APPLIED` **cùng có hoặc cùng không**.
5. **Chỉ sau ack commit**: áp các delta đã commit (và giá trị Worker trả về) vào RAM của WorldCore (`publishCommittedGift`) → rồi mới phát FX/banner/âm thanh. Nack/không ack → không công bố gì; xử lý theo ADR-0017 (trạng thái batch).
6. Hiệu ứng quà tác động lên cú câu (buff tăng tỉ lệ…) chỉ có hiệu lực từ thời điểm được công bố ở bước 5.

**Phạm vi của quy tắc "commit trước, công bố sau":** áp dụng cho **hiệu ứng quà** (C1, ADR-0022). Tiến trình thường do mô phỏng sinh ra (cú câu, XP) vẫn theo mô hình RAM-trước + write-behind (C2), có RPO đo được — nhưng **BXH chỉ phản ánh điểm đã commit** (ADR-0010) cho cả hai loại.

## Ranh giới crash (0.0.9 — thay bảng 0.0.8) — mỗi dòng là một ca kiểm thử bắt buộc
Bất biến sau mọi ca: I1 (không áp dụng hai lần), I2 (không treo), I3 (điểm từ quà khớp), và **RAM sau khởi động = trạng thái dựng từ DB**.
| Mã | Crash tại ranh giới | DB sau khởi động | Phục hồi | Kết quả mong đợi |
|---|---|---|---|---|
| GB0 | Sau khi connector phát sự kiện, trước khi gửi batch `RECEIVED` | Không có dòng | Không có gì để phục hồi | Quà mất (G3), đếm vào chỉ số chưa ghi bền |
| GB1 | Batch `RECEIVED` đang ghi, chưa commit | Không có dòng | Như GB0 | Như GB0 |
| GB2 | `RECEIVED` đã commit, Worker chết trước ack | `RECEIVED` | Replay bước 3–5 | Áp dụng đúng 1 lần |
| GB3 | Sau ack `RECEIVED`, trong lúc tính hiệu ứng (bước 3) | `RECEIVED` | Replay | Áp dụng đúng 1 lần |
| GB4 | Batch hiệu ứng đã gửi, chưa commit | `RECEIVED`, không hiệu ứng | Replay | Áp dụng đúng 1 lần |
| GB5 | Batch hiệu ứng **đã commit**, Worker chết **trước ack** | `APPLIED` + hiệu ứng | Không replay; batch gửi lại (nếu tiến trình còn) bị nhận diện là đã commit (ADR-0017 R13) | Không trùng; RAM dựng từ DB có hiệu ứng |
| GB6 | Đã nhận ack, tiến trình chết **trước** `publishCommittedGift` | `APPLIED` + hiệu ứng | Khởi động: dựng RAM từ DB (hiệu ứng có sẵn), không replay | Không trùng; FX không hiện (chấp nhận) |
| GB7 | Đã công bố RAM, chết trước/giữa FX | `APPLIED` | Như GB6 | FX có thể không hiện hoặc đã hiện một phần |
| GB8 | Tiến trình còn sống, Worker chết giữa batch hiệu ứng | `RECEIVED` hoặc `APPLIED` | Worker khởi động lại → hỏi trạng thái batch → gửi lại hoặc xác nhận đã commit → công bố RAM **đúng một lần** | Không trùng trong RAM lẫn DB |
Kiểm thử bằng điểm chèn lỗi (fault injection hook) tại đúng từng ranh giới GB0–GB8, chạy lặp ở tải 200 quà/s; so sánh trạng thái DB + RAM với trạng thái tính lại từ journal.

## Phục hồi khi khởi động
Sau Worker `ready`: **dựng RAM từ DB trước** (hiệu ứng đã `APPLIED` đều có trong DB) → đọc `gift_events WHERE status IN ('RECEIVED','FAILED')` theo `received_at_utc` → replay bước 3–5 **trước** khi thế giới RUNNING (thế giới ở trạng thái RESTORING). Lỗi áp dụng: `FAILED` + `attempts++`; quá `maxGiftAttempts` (mặc định 5) → `DEAD` + cảnh báo Control. Thời gian replay đo và báo cáo (RTO, ADR-0022).

## Hiệu ứng phụ thuộc trạng thái thế giới
Ví dụ Boss quà khi đang có Boss: quà vào hàng chờ Boss (bảng `world_events` status `QUEUED`, `source_key = gift_key`) trong cùng transaction APPLIED → hàng chờ cũng bền và idempotent. Buff có hạn: lưu `expires_at_utc` tính từ `received_at_utc`, nên replay muộn không kéo dài buff sai.

## Kiểm thử bắt buộc (Phase 2–3)
Fault injection: **các ca GB0–GB8 ở trên** (điểm chèn lỗi tại đúng từng ranh giới); kill tiến trình (macOS: SIGKILL) ngẫu nhiên khi đang tải 200 quà/s; kill Worker giữa batch và **sau commit trước ack** (R13); gửi lại batch; trùng `msgId`; streak tăng/giảm/không theo thứ tự; thiếu `msgId`; kiểm WorldCore không bao giờ đọc `PendingGiftEffects`. Bất biến kiểm sau mỗi lần: (I1) không `gift_key` nào có hiệu ứng > 1 lần; (I2) mọi `RECEIVED` cuối cùng thành APPLIED/REJECTED/DEAD; (I3) tổng điểm từ quà trong ledger = tổng từ `gift_events APPLIED`. Kết quả ghi TEST_REPORT; chưa có kết quả thì không tuyên bố.

## Phương án đã loại
Cập nhật RAM trước khi commit hiệu ứng (bản 0.0.8 — R09); áp dụng trước rồi mới ghi journal (crash → mất dấu, có thể áp dụng lại); hai transaction riêng cho hiệu ứng và APPLIED (crash ở giữa → trùng hoặc lệch); tuyên bố exactly-once.
