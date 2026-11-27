# ADR-0022: Phân loại dữ liệu, RPO/RTO, giới hạn write-behind, backup & kiểm thử crash recovery (R08)
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.9 theo R14: RPO thực tế chỉ từ crash test, bộ chỉ số mới; thêm CR8–CR10 cho R09, R13, R11) — Trạng thái: Đề xuất (yêu cầu R08, R14 của ChatGPT) — chờ duyệt
- Liên quan: ADR-0017 (Worker, `synchronous=FULL`), ADR-0018 (quà), ADR-0019 (lỗi lưu trữ), ADR-0021 (migration).

## Định nghĩa
- **RPO** (mất tối đa): khoảng dữ liệu có thể mất khi tiến trình chết đột ngột hoặc mất điện, tính đến commit đã ack gần nhất.
- **RTO** (thời gian phục hồi): từ lúc khởi động lại đến khi thế giới RUNNING lại (không tính thời gian người dùng mở máy).
- Tất cả số dưới đây là **mục tiêu thiết kế**; số đo thực tế ghi vào TEST_REPORT ở Phase 2/3/8. Chưa đo thì không tuyên bố.

## Phân loại dữ liệu
| Nhóm | Dữ liệu | Có tái tạo được? | RPO mục tiêu | RTO mục tiêu | Chiến lược |
|---|---|---|---|---|---|
| C1 Quà (quan trọng nhất) | `gift_events` journal; hiệu ứng từ quà (ledger nguồn quà, túi đồ từ quà, buff, hàng chờ Boss quà) | Không (TikTok không phát lại) | **0** với quà đã ack `RECEIVED`; quà chưa commit: ≈ thời gian chờ + 50 ms → **có thể mất** (ADR-0018 G3) | ≤ 60 s (gồm replay journal) | Group commit 50 ms, `synchronous=FULL`, hiệu ứng + APPLIED cùng transaction, replay khi khởi động |
| C2 Tiến trình | `score_ledger`, `catches`, `players` (xp, level, total_score, total_weight_g), trang bị, túi đồ, `fishdex`, thành tích, `leaderboard_scores` | Một phần (BXH tính lại từ ledger; ledger thì không) | Mục tiêu ≈ chu kỳ flush (500 ms) + batch đang bay; **không phải bảo đảm** — RPO thực đo theo mục R14 | ≤ 60 s | Batch `progress`; mọi ghi của một cú câu trong một transaction; thành tích mở khoá idempotent theo khoá |
| C3 Trạng thái thế giới | `world_state`, `live_sessions`, `player_presence`, trạng thái Boss | Một phần | ≤ 5 s | ≤ 60 s, thế giới khôi phục ở PAUSED/RESTORING | Snapshot `state` 5 s + khi đổi trạng thái quan trọng |
| C4 Dữ liệu dẫn xuất | Cấu trúc BXH trong RAM, bucket 60 phút, chỉ mục không gian, vùng quan tâm, metrics | **Có** | Không áp dụng | Dựng lại khi khởi động (tính vào RTO) | Không lưu, hoặc lưu snapshot chỉ để tham khảo (snapshot lịch sử BXH là C2) |
| C5 Nhật ký | `event_logs`, `comment_logs`, log file | Không cần | Best effort | — | Bỏ đầu tiên khi áp lực (ADR-0019) |
| C6 Cấu hình | `settings`, `gift_rules`, lịch Boss, `admin_audit` | Không | 0 (ghi đồng bộ, ack sau commit mới báo thành công ở Control) | ≤ 60 s | Commit ngay khi Admin lưu |

## Giới hạn write-behind 500 ms (làm rõ)
- 500 ms là **chu kỳ gom batch**, **không** phải cam kết "mất tối đa 500 ms".
- ~~RPO thực = `persist.unackedAgeMs`~~ (0.0.8) — **không đủ** (R14): chỉ số đó chỉ đo batch đã gửi, bỏ sót dữ liệu còn trong RAM, WriteBuffer, và thay đổi chưa thành op.

## 0.0.9 — R14: RPO thực tế được xác định thế nào
1. **Chỉ số vận hành (cảnh báo, KHÔNG phải cam kết):** `persist.oldestUnpersistedEventAgeMs`, `persist.oldestUnackedBatchAgeMs`, `persist.unpersistedByType{…}`, `persist.ramDirtyNotEnqueued{count, oldestAgeMs}`, `persist.writeBufferOps`, `persist.inFlightBatches` (định nghĩa ở ADR-0017 mục R14). Ngưỡng cảnh báo / bậc quá tải ở ADR-0019. Các chỉ số này cho người vận hành biết **hiện tại** có bao nhiêu dữ liệu đang ở trạng thái có thể mất.
2. **RPO thực tế chỉ được công bố khi đã đo bằng crash test:** trong CR1/CR2, ngay trước mỗi lần kill, ghi lại ảnh chụp các chỉ số trên + danh sách sự kiện đã sinh (nhật ký kiểm thử riêng của test harness, nằm ngoài tiến trình bị kill); sau khởi động, đối chiếu với DB để đếm **chính xác** những gì đã mất theo loại. Báo cáo trong TEST_REPORT: phân phối (p50/p95/max) của **thời gian mất** và **số sự kiện mất** theo loại, ở từng mức tải; và độ lệch giữa chỉ số cảnh báo lúc kill với số mất thực tế (để biết chỉ số có đánh giá đúng không).
3. Bảng RPO "mục tiêu" ở trên chỉ là mục tiêu thiết kế cho đến khi có số đo; số đo không đạt mục tiêu thì báo cáo nguyên trạng, không làm tròn.
- Với `synchronous=FULL`, commit đã ack được SQLite bảo đảm bền khi mất điện **trong giới hạn phần cứng/hệ điều hành** (ổ đĩa có cache ghi nói dối fsync thì không bảo đảm được — rủi ro ngoài kiểm soát, ghi nhận).

## Backup & khôi phục
- `VACUUM INTO` (chạy trong Worker, không chặn luồng chính) tạo bản sao nhất quán: khi kết thúc LIVE, mỗi 6 giờ (cấu hình), **trước mỗi migration**, **trước mỗi lần cập nhật bản**. Giữ N bản gần nhất (mặc định 10) + 1 bản/ngày trong 7 ngày; thư mục `data/backups/`.
- Khôi phục: thao tác nguy hiểm trên Control (ADR-0020) → tắt an toàn → thay file → `quick_check` → mở lại. Dữ liệu sau thời điểm backup mất (RPO khi khôi phục = tuổi bản backup). RTO khôi phục mục tiêu ≤ 5 phút.
- Kiểm tra tính toàn vẹn sau khôi phục: tổng ledger khớp `players.total_score`; `leaderboard_scores` tính lại khớp.

## Bất biến kiểm tra sau mọi lần phục hồi (tool `verify-integrity.js`)
I1 không `gift_key` nào có hiệu ứng > 1 lần · I2 không còn `RECEIVED/FAILED` sau RTO (trừ DEAD có cảnh báo) · I3 điểm từ quà trong ledger = tổng theo `gift_events APPLIED` · I4 `players.total_score` = tổng ledger theo người · I5 mọi `leaderboard_scores` (live/day/week/all) = tính lại từ ledger · I6 cửa sổ 60 phút dựng lại = tính trực tiếp từ ledger · I7 không có dòng realm sai file (ADR-0021) · I8 `PRAGMA quick_check` = ok · **I9 (0.0.9)** trạng thái RAM của WorldCore sau khởi động/phục hồi = trạng thái dựng lại từ DB (không có hiệu ứng quà chưa commit) · **I10 (0.0.9)** mỗi `op_key` trong `applied_ops` tương ứng đúng một lần thay đổi tích luỹ; gửi lại batch không đổi hash trạng thái.

## Kiểm thử crash recovery (bắt buộc trước khi tuyên bố bất kỳ RPO/RTO nào)
| Mã | Kịch bản | OS |
|---|---|---|
| CR1 | Kill tiến trình (SIGKILL) ngẫu nhiên 50 lần khi tải 1.000 comment/s + 200 quà/s → khởi động lại → kiểm I1–I8, đo RPO (thay đổi mất) và RTO | macOS (Phase 2–3); Windows `taskkill /F` ở Windows Validation |
| CR2 | Kill Worker giữa batch `critical` và giữa batch `progress` | macOS; Windows sau |
| CR3 | Tắt an toàn bằng nút Control / Ctrl+C / đóng cửa sổ console khi đang tải | macOS; Windows sau |
| CR4 | Giả lập ENOSPC, IOERR, BUSY, CORRUPT (fault injection) | macOS; Windows sau |
| CR5 | Đĩa đầy thật trên ổ nhỏ (chỉ công cụ test, không thuộc build) | macOS; Windows sau |
| CR6 | Khôi phục từ backup + kiểm I4–I8 | macOS; Windows sau |
| CR7 | Mất điện thật: **không tự động hoá được** — ghi rõ là chưa chứng minh; chỉ suy ra từ bảo đảm của SQLite + CR1 | — |
| CR8 (0.0.9, R09) | Chèn lỗi tại từng ranh giới GB0–GB8 của luồng quà (ADR-0018); kiểm RAM sau khởi động = trạng thái dựng từ DB, không áp dụng hai lần | macOS; Windows sau |
| CR9 (0.0.9, R13) | Worker commit xong rồi bị giết trước khi gửi ack (W1–W5, ADR-0017) → gửi lại → hash trạng thái DB không đổi | macOS; Windows sau |
| CR10 (0.0.9, R11) | S1 thất bại → S1+S2 thất bại → S3 đầy (ADR-0019): không nhận rồi đánh rơi; INGEST_HALT trước khi tràn; cảnh báo đúng | macOS; Windows sau |
Kết quả mỗi kịch bản ghi TEST_REPORT + Matrix (mục thoát an toàn). Kịch bản nào chưa chạy được ghi "chưa chứng minh".
