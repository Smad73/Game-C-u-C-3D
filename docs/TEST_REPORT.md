# TEST REPORT — NOVA FISHING LIVE 3D
Môi trường mọi lần chạy: macOS (darwin/arm64), Apple M1 8 GB, Node v26.13.0, SQLite 3.54.1 (node:sqlite). Windows: **CHƯA KIỂM THỬ**.

## GAMEPLAY V1 (v0.3.0) — 2026-11-25 (chưa đề xuất nghiệm thu)
| Loại | Lệnh thực tế | Kết quả | Đạt? |
|---|---|---|---|
| Toàn bộ (hồi quy Phase 1 + 2 + gameplay) | `npm test` | 184 test · 184 đạt · 0 lỗi · 15 tệp; portability ĐẠT | Đạt |
| Gameplay lõi (Worker + SQLite thật, đồng hồ giả) | `tests/game.test.js` | 10/10 — lệnh comment có/không dấu; công thức cấp/may mắn/giờ VN (đổi ngày 17:00 UTC, tuần T2–CN); tham gia → câu → ghi bền → BXH 5 phạm vi = điểm RAM, sổ cái = BXH tổng = điểm người chơi; AFK + like không đánh thức + lệnh đánh thức; quà: hiệu ứng chỉ vào RAM sau commit, khớp DB, gửi lại = DUPLICATE, cá hiếm lượt sau; nâng cấp trừ xu/chặn thiếu xu; điểm danh 1 lần/ngày; Boss cảnh báo → xuất hiện → bị hạ → thưởng ghi bền; luật quà tắt; gộp sự kiện quà; **mọi op gameplay idempotent** khi gửi lại + Worker chết sau commit trước ACK | Đạt |
| API gameplay + WS stage (server thật) | `tests/game-http.test.js` | 4/4 — cần phiên, CSRF, làm sạch cấu hình/Gift Mapping, lưu bền; Demo bơm comment/quà → câu được, BXH/hồ sơ/sự kiện/sao lưu, khôi phục cần XAC NHAN, nhật ký không lộ mã ghép đôi/CSRF; run-mode không lưu khoá API, demo API bị chặn ở LIVE; WS stage init + khung ~10 Hz, chỉ người trong ngân sách hiển thị | Đạt |
| Benchmark 1.000 người, 30 s, 20 quà/s | `node tools/game-bench.js --players 1000 --seconds 30 --gifts 20` | tick p95 1,4 ms; BXH làm mới p95 7 ms; bất biến điểm + quà đúng | Đạt |
| **Benchmark 10.000 người, 90 s, 50 quà/s** | `node tools/game-bench.js --players 10000 --seconds 90 --gifts 50 --out docs/evidence/game-bench-10000.json` | tick p50 2,4 · **p95 7,2** · max 11 ms (mục tiêu < 20 ms); event loop p99 16 ms; 28.928 cá/phút; 4.470 quà áp dụng; BXH p95 52 ms; khung stage ~2 KB; heap 20–50 MB ổn định; batch chưa ACK luôn 0; bất biến điểm/quà đúng; DB 33,7 MB sau ~90 s | Đạt (DB lớn — xem giới hạn) |
| Kiểm tay trong trình duyệt (Claude Browser, macOS) | `npm start` (Demo) → /stage, /control | Stage 3D: 16 cần thủ trên cầu câu, phao/dây/kéo cá, cá bay lên, Boss nổi lên + thanh HP, bão/đêm trăng, BXH luân phiên, banner; Control: ghép đôi, tổng quan, Gift Mapping, gọi Boss/sự kiện | Đạt (quan sát; không phải OBS) |
**CHƯA KIỂM:** TikTok LIVE thật (A17) · OBS / TikTok LIVE Studio · Windows · FPS 30 kèm phần mềm phát · âm thanh trong OBS · soak 3 giờ · crash-suite CR1 có gameplay (đã có test idempotency op + after_commit_before_ack, chưa SIGKILL tiến trình có WorldCore).

## PHASE 2 — TikTok Ingest & GiftJournal (2026-11-25, bản đang làm, chưa đề xuất nghiệm thu)
| Loại | Lệnh thực tế | Kết quả | Đạt? |
|---|---|---|---|
| Toàn bộ (hồi quy Phase 1 + Phase 2) | `npm test` | 161 test · 161 đạt · 0 lỗi · 12 tệp; portability ĐẠT | Đạt |
| Connector/Mock/Normalizer (M01–03) | `tests/ingest.test.js` | 14/14 — kết nối không trùng, backoff có trần, quá số lần → FAILED (không poll), phòng không phát → ENDED, rớt mạng → nối lại cùng roomId, streamEnd → không nối lại; schema 3 mốc thời gian, lỗi có mã (thiếu trường/sai kiểu/loại lạ/payload quá lớn/userId lạ), timestamp bất thường, Unicode NFC + bỏ ký tự điều khiển/bidi, gift_key M/S/H | Đạt |
| GiftJournal/idempotency/streak/realm (M04–06) | `tests/gift-journal.test.js` | 14/14 — RECEIVED→APPLIED, công bố SAU commit, trùng msgId (LRU + DB), streak 1·2·5·10 = 10, sai thứ tự + trùng, 2 streak khác groupId, thiếu repeatEnd, thiếu groupId (chỉ tính ở repeatEnd), restart giữa streak, thiếu userId → REJECTED, DEMO không ghi được vào nova-live.db (và ngược lại), một quà lỗi không kéo cả nhóm, GB8/CR9 (commit xong chết trước ACK, tiến trình sống), W1 cho batch RECEIVED, BUSY → gửi lại cùng batch_id, FAILED → DEAD + GIFT_DEAD | Đạt |
| Hàng đợi/quá tải/S1–S4/buổi LIVE/app DEMO (M07) | `tests/pipeline.test.js` | 12/12 — ưu tiên + gộp like, đầy hàng đợi (đếm), L2/L3/L4 + QUEUE_HIGH, CR10a/b/c, INGEST_HALT ngắt connector + chặn nối lại, room_id mới/cùng/khác/streamEnd/restart, LiveConnector với thư viện GIẢ, app DEMO không tạo nova-live.db | Đạt |
| CR8 GB0–GB7 (M08) | `tests/crash.test.js` | 8/8 — mỗi ranh giới đúng bảng ADR-0018 + I1, I2, I3, I9 | Đạt |
| **CR1** — SIGKILL tiến trình thật × 50, tải 1.000 comment/s + 200 lượt quà/s (+200 like/s) | `node tools/crash-suite.js --kills 50 --cr2 10 --cr8 16` | 50/50 kill, 0 lỗi khởi chạy; **I1, I2, I3, I9 đạt cả 50 lần**. Quà mất mỗi lần kill (cửa sổ G3 — chưa ghi bền RECEIVED): p50 15 · p95 31 · max 42 (tổng 866); tuổi quà mất tính tới lúc kill: p50 26 ms · p95 50 ms · max 55 ms. RTO (mở DB + nhập khẩn cấp + replay): p50 119 ms · p95 169 ms · max 177 ms. Chỉ số cảnh báo `unpersisted` lúc kill lệch số mất thực tế: trung bình −1,5, lệch lớn nhất 31 | Đạt (số đo, không phải "không mất") |
| **CR2** — giết Worker thật (`worker.terminate`) × 10 giữa batch critical + progress | như trên | 10 lần giết, 10 lần tự khởi động lại; điểm progress kỳ vọng 11.200 = thực tế 11.200 (không cộng hai lần); 3.736 quà phát ra, **0 thiếu trong DB**; I1, I2, I3, I9 đạt | Đạt |
| **CR8 dưới tải** — 16 lần, 8 loại ranh giới (GB0, GB3, GB6, GB7, receive/apply × before_commit/after_commit_before_ack), 200 lượt quà/s | như trên | 16/16 crash thật sự xảy ra; I1, I2, I3, I9 đạt cả 16 | Đạt |
| **Tải chuẩn 10 phút** (M09) | `node tools/load-generator.js --comments 1000 --gifts 200 --likes 300 --duration 600` | 1.030.883 sự kiện (1.718/s); 334.373 sự kiện quà từ connector = 287.957 RECEIVED + 46.416 DUPLICATE (khớp 100%); 287.957 APPLIED; **I1, I2, I3 đạt**; trễ quà nhận→công bố p50 90 · p95 140 · max 161 ms (mẫu 5.000 quà gần nhất); sự kiện thường p95 7 ms; hàng đợi tối đa 68; 0 bị bỏ; 0 batch bị từ chối/thử lại; Worker commit chậm nhất 35,6 ms; RSS tối đa 173 MB; CPU 196 s/600 s (~33% một nhân); **DB 252 MB sau 10 phút** | Đạt (xem lưu ý DB) |
Bằng chứng: `docs/evidence/phase2-crash-suite.json`, `docs/evidence/phase2-load-10min.json` (log `.log` cùng tên bị `.gitignore` *.log).

**Loại kiểm thử — không thay thế nhau:** fault injection mô phỏng ranh giới logic (CR8) · Worker crash thật bằng terminate (CR2, CR8) · process crash thật SIGKILL (CR1) · crash khi đang ghi DB (CR1 xảy ra ngẫu nhiên giữa các commit, không điều khiển được thời điểm chính xác trong fsync) · **mất điện thật: KHÔNG kiểm (CR7)**.
**Lưu ý tải:** "200 quà/s" của Mock = 200 lượt tặng/s; quà streak sinh nhiều sự kiện (≈ 560 sự kiện quà/s thực tế) → nặng hơn tiêu chí.

### P2 REVIEW — Gift Streak (2026-11-25) · `node --test tests/streak-review.test.js` → **9/9 đạt** (Worker + SQLite thật; mỗi ca kiểm I1, I2, I3, I9)
| Ca | Kết quả thực tế |
|---|---|
| A groupId + repeatEnd (1..5, end 5) | 5; repeatEnd cùng mốc = DUPLICATE |
| B groupId, thiếu repeatEnd (1..4) | 4 |
| C thiếu groupId, có repeatEnd (1,2,3 rồi end 6) | mốc giữa REJECTED ×3, end → 6 |
| D thiếu cả hai (1,2,3) | **0 — giới hạn**: không phân biệt được streak, journal REJECTED ×3 để đối soát |
| E1 hai streak cùng user/giftId, khác groupId, chồng lấn | 3 + 4 = 7, không gộp |
| E2 hai lần gửi không groupId, mỗi lần có repeatEnd, msgId khác | 3 + 3 = 6, không coi là trùng |
| E3 hai user cùng groupId | tính riêng (khoá có player_key) |
| F trùng + sai thứ tự (10,3,10,1,7,3, end 10) | 10; 3 DUPLICATE |
| F2 repeatEnd không groupId gửi lại cùng msgId | DUPLICATE, không cộng |
**Đối chiếu ADR-0018:** khoá `M:msgId` và `S:<player>:<giftId>:<groupId>:<repeatCount>` (cộng phần tăng) đúng ADR. **Lệch có chủ đích (cần ChatGPT duyệt, không đổi kiến trúc):** khoá dự phòng `H:` hash thêm `msgId` và cờ end (ADR: userKey, giftId, repeatCount, createTime) để tách hai lần gửi không groupId (E2); quà streak thiếu groupId chỉ tính ở repeatEnd (ADR chưa quy định).
**Rủi ro còn lại (chưa kiểm được, cần LIVE thật):** (1) giả định groupId duy nhất cho mỗi lần gửi; (2) repeatEnd không groupId bị TikTok gửi lại với msgId/createTime KHÁC → sẽ bị tính hai lần (không phân biệt được với E2).

### CHƯA kiểm thử / giới hạn (Phase 2)
- **TikTok LIVE thật (Module 10): CHƯA** — thư viện `tiktok-live-connector` chưa cài (P0 giấy phép AGPL + dịch vụ ký Euler, chờ quyết định). msgId/groupId/repeatCount/repeatEnd/room_id thực tế CHƯA xác minh; ánh xạ trường chỉ thử với thư viện giả.
- Windows (taskkill /F, đường dẫn): chưa.
- API HTTP `/api/ingest*`: chưa có test HTTP riêng (chỉ test qua đối tượng app).
- Từ chối WebSocket mới khi S4 và thông báo "đang bảo trì" trên stage (ADR-0019 R11): **chưa làm**.
- Dọn `committed_batches`/`applied_ops` > 7 ngày (ADR-0017): chưa làm → DB tăng ~25 MB/phút ở tải chuẩn (P1).
- Đĩa đầy thật (CR5), khôi phục từ backup (CR6): thuộc Phase 3 theo ADR-0022.

---

## PHASE 1 (v0.1.0) — 2026-11-25
Môi trường: macOS (darwin/arm64), Apple M1 8 GB, Node v26.13.0 (LTS "Lithium"), npm 11.20.0, SQLite 3.54.1 (node:sqlite, không cảnh báo experimental).
Windows: **CHƯA KIỂM THỬ** (không có máy Windows; nền tảng mục tiêu, chưa nghiệm thu).

| Loại | Lệnh đã chạy | Kết quả thực tế | Đạt? |
|---|---|---|---|
| Toàn bộ | `npm test` (chạy 6 lần liên tiếp) | 113 test · 113 đạt · 0 lỗi · ~9,6 s; ổn định cả 6 lần | Đạt |
| Portability | `node tools/check-portability.js` | 47 tệp văn bản + node_modules (mã native): sạch. Lần đầu bắt 1 vi phạm thật (process.platform trong src/app.js) — đã sửa | Đạt |
| Portability (chính công cụ) | `tests/portability.test.js` | 14/14: mỗi luật P01–P11 bắt được lỗi trên dự án giả. **P04 (trùng hoa/thường) KHÔNG kiểm chứng được** trên ổ macOS không phân biệt hoa/thường | Đạt, trừ P04 |
| Hệ thống | `tests/system.test.js` | 14/14 (platform, Settings, Logger, Metrics) | Đạt |
| Persistence | `tests/persistence.test.js` | 28/28 (Worker + SQLite thật) | Đạt |
| Bảo mật (đơn vị) | `tests/security.test.js` | 17/17 | Đạt |
| Quá tải/cảnh báo | `tests/ops.test.js` | 7/7 | Đạt |
| HTTP/WS tích hợp | `tests/http.test.js` | 18/18 (server thật, cổng ngẫu nhiên) | Đạt |
| Tiến trình thật | `tests/process.test.js` | 6/6: SIGINT→mã 0; SIGKILL→lần sau phát hiện tắt đột ngột, DB nguyên vẹn; tắt qua API mã 0; cổng bận mã 2; LAN thiếu mật khẩu; cấu hình sai | Đạt |
| Khung tắt + nhập mật khẩu | `tests/exit-flow.test.js` | 9/9 | Đạt |
| Trình duyệt thật (không phải OBS) | mở `/stage/` trong Browser pane (Chrome 156) | WebGL2 (Apple M1/ANGLE Metal), Three.js r187, 30/30 FPS, WS kết nối, WebAudio running, chữ tiếng Việt OK. Phát hiện 2 lỗi (CSP IPv6; FPS sai khi tab ẩn) — đã sửa, test tự động đạt lại; **chưa mở lại trình duyệt sau khi sửa** | Đạt một phần |
| **/stage trong OBS (macOS)** | — | **CHƯA CHẠY** (bắt buộc cho nghiệm thu Phase 1) | Chưa |
| Hiệu năng | — | Chưa đo (ngoài phạm vi Phase 1) | — |

## Bằng chứng cho các test bắt buộc
- Worker commit thành công; Worker chết **trước ACK** (commit xong, chết, khởi động lại, nhận diện bằng `status`, không áp dụng hai lần); chết **trước commit** (NOT_FOUND → gửi lại → áp dụng một lần); ACK muộn → UNKNOWN.
- Gửi lại cùng `batch_id` → `ALREADY_COMMITTED`, hash trạng thái toàn bộ bảng không đổi.
- Cùng `op_key` ở hai batch khác nhau → áp dụng một lần (`skipped=1`).
- REJECTED: batch có op sai → rollback toàn bộ, hash DB không đổi, batch được cách ly, có cảnh báo.
- Migration: checksum sửa → dừng; migration mới trên DB có dữ liệu → backup tự động; migration lỗi → rollback; DB mới hơn ứng dụng → từ chối; khởi động lại DB giữ dữ liệu.
- Ghép đôi: hết hạn / đã dùng / đã huỷ / sai / rate-limit; thu hồi thiết bị (phiên + WS bị ngắt ngay); thu hồi tất cả.
- CSRF, Origin (thiếu/lạ/null), Host lạ (421); WS admin không phiên/Origin lạ bị từ chối.
- Khởi động và tắt an toàn: SIGINT thật, API thật, mã thoát 0/2/3.

## Fault injection — giới hạn trung thực
Điểm chèn lỗi (`before_commit`, `after_commit_before_ack`, `slow_ack`, `busy_once`) mô phỏng **trạng thái logic** khi Worker chết (đóng DB rồi dừng luồng). Crash thật ở mức tệp chỉ được kiểm bằng SIGKILL tiến trình (tests/process.test.js), chưa có kịch bản kill giữa lúc ghi dưới tải. CR1–CR10 của ADR-0022 (RPO/RTO) **chưa chạy** — thuộc Phase 2/3.

## Chưa kiểm thử được (và cách tự kiểm)
- `/stage` trong OBS macOS: thêm Browser Source `http://127.0.0.1:8787/stage/` 1080×1920 (chạy `node server.js`), chụp màn hình.
- Launcher `.bat`, tín hiệu Ctrl+C/Break trên Windows: Windows Validation.
- Lệnh `p`+Enter ở cửa sổ khởi chạy: cần terminal tương tác.
- viewKey từ máy khác trong LAN: mới kiểm bằng mô phỏng `isSelf`.
- HTTPS (ADR-0023): chưa làm (chờ A16).

## Lỗi phát hiện trong Phase 1
Xem docs/LESSONS.md (L-007…).
