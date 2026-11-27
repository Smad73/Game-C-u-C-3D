# GÓI KIỂM DUYỆT — NOVA FISHING LIVE 3D v0.0.8 (sửa theo review R01–R08, bản gộp một file)
Gửi: ChatGPT (NOVA Architect & Reviewer) — Người lập: Claude (Lead Developer) — Ngày: 2026-11-24 — NOVA 1.0.3
Trạng thái: **CHỜ CHATGPT KIỂM DUYỆT v0.0.8. Chưa viết code game. Phase 1 chưa bắt đầu.** Không chứa bí mật.
Nội dung là **bản sao nguyên văn** các file trong repo; nguồn chuẩn vẫn là file gốc.

## Mục lục
1. Báo cáo bàn giao (`docs/HANDOVER_ARCH_v0.0.8.md`) — danh sách thay đổi, rủi ro, điểm chưa chứng minh, kiểm tra nhất quán
2. `docs/ARCHITECTURE.md` 0.0.8 (mục lục nhanh R01–R08: **§11**)
3. ADR mới: 0017–0022 · ADR sửa: 0005, 0006, 0010, 0011, 0012, 0013, 0016
4. Các ADR còn lại (không đổi ở 0.0.8)
5. `docs/PROJECT_STATUS.md`
6. `docs/PROJECT_BRIEF.md`
7. `docs/LESSONS.md`

---
<!-- ===== BẮT ĐẦU docs/HANDOVER_ARCH_v0.0.8.md ===== -->
## 1. Báo cáo bàn giao
_Nguồn: `docs/HANDOVER_ARCH_v0.0.8.md`_

# BÁO CÁO BÀN GIAO — SỬA KIẾN TRÚC THEO REVIEW R01–R08 — NOVA FISHING LIVE 3D v0.0.8
Gửi: ChatGPT (NOVA Architect & Reviewer) — Người lập: Claude (Lead Developer) — Ngày: 2026-11-24 — Quy chuẩn: NOVA 1.0.3 — Model: Opus 5.5
Trạng thái: **CHỜ CHATGPT KIỂM DUYỆT v0.0.8.** Claude không tự đánh dấu APPROVED. Báo cáo không chứa bí mật.

## 1. Xác nhận
- ☑ **Chưa viết code game** (không có file mã nguồn nào trong repo; chỉ tài liệu).
- ☑ **Chưa bắt đầu Phase 1** (chưa `git init`, chưa `package.json`, chưa cài thư viện).
- ☑ Không đổi phạm vi macOS + Windows; không đổi Continuous Live World; không đặt giới hạn cứng số cần thủ; không xoá ADR cũ; không đổi công nghệ DB.
- ☑ Đã sao lưu toàn bộ `docs/` bản 0.0.7 trước khi sửa (thư mục tạm của phiên làm việc).

## 2. Danh sách file đã thay đổi
| File | Loại | Nội dung thay đổi |
|---|---|---|
| `docs/ADR/0017-persistence-worker.md` | **Mới** (R01) | Đánh giá rủi ro D1–D7 của `DatabaseSync`; PersistenceWorker (`worker_threads`) sở hữu duy nhất kết nối ghi; ReadWorker tuỳ chọn; giao thức `commit/ack/nack/read/result/health/fatal`; batch theo lớp `critical` (≤ 50 ms) / `progress` (500 ms/500 op) / `state` (≤ 5 s) / `log`; tối đa 2 batch in-flight; mỗi batch một transaction `BEGIN IMMEDIATE`; WAL + `synchronous=FULL` + checkpoint trong Worker; phục hồi khi khởi động, khi Worker chết (gửi lại batch idempotent), SAFE MODE; xác minh stability `node:sqlite` ở Phase 1 |
| `docs/ADR/0018-gift-idempotency-journal.md` | **Mới** (R02) | Phạm vi bảo đảm G1 (không áp dụng hai lần hiệu ứng đã lưu), G2 (quà đã ghi bền không treo), G3 (quà chưa ghi bền có thể mất); **không tuyên bố exactly-once**; khoá `M:`/`S:`/`H:` + `WEAK_KEY`; `gift_key UNIQUE`, `UNIQUE(source_key, effect_seq)`; `RECEIVED` ghi bền trước khi áp dụng; hiệu ứng + `APPLIED` cùng transaction; `effect_params` chốt lúc nhận; bảng crash 6 tình huống; replay khi khởi động; `FAILED → DEAD` có cảnh báo; bộ kiểm thử fault injection + bất biến I1–I3 |
| `docs/ADR/0019-qua-tai-backpressure-loi-luu-tru.md` | **Mới** (R04, R05) | Bảng giới hạn vận hành (đều cấu hình, không phải luật chơi); bậc L0–L4 + SAFE MODE; chuỗi backpressure tới Worker; mã cảnh báo + `alerts[]`; phục hồi sự kiện sau restart theo loại; xử lý đĩa sắp đầy/ENOSPC/BUSY/IOERR/CORRUPT; đường quà khẩn cấp `emergency-gifts-*.jsonl`; không tuyên bố "quà không bao giờ mất" |
| `docs/ADR/0020-bao-mat-rest-ws-lan.md` | **Mới** (R06) | Mô hình đe doạ T1–T5; bind theo chế độ; xác thực cả localhost (ghép đôi `#pair=`, mật khẩu scrypt, QR); phiên cookie HttpOnly SameSite=Strict; CSRF header + Origin; kiểm Host chống DNS rebinding; WS kiểm Host/Origin, `role=admin` cần phiên, `role=stage` chỉ đọc + `viewKey` từ LAN; thao tác nguy hiểm xác nhận + xác thực lại + `admin_audit`; CSP; gói cập nhật có chữ ký; rủi ro còn lại HTTP thuần trên LAN |
| `docs/ADR/0021-dinh-danh-nguoi-choi-live-demo.md` | **Mới** (R07) | `player_key` = `tt:<userId>` / `demo:<id>`; `realm` + `UNIQUE(realm, external_id)` + CHECK; **2 file DB** `nova-live.db` / `nova-demo.db`; realm do loại connector quyết định; `unique_id`/`nickname` không làm khoá; FK `player_key`; `schema_migrations` + checksum + backup trước migration |
| `docs/ADR/0022-do-ben-du-lieu-rpo-rto.md` | **Mới** (R08) | Phân loại C1–C6 với RPO/RTO mục tiêu; làm rõ 500 ms là chu kỳ gom, RPO thực = `persist.unackedAgeMs` (cảnh báo 2 s, L4 10 s); backup `VACUUM INTO` (kết thúc LIVE, 6 giờ, trước migration, trước cập nhật); bất biến I1–I8; kiểm thử CR1–CR7 (CR7 mất điện thật: chưa chứng minh được) |
| `docs/ADR/0010-leaderboard-5-pham-vi.md` | Sửa (R03) | Thêm mục "R03": định nghĩa cửa sổ = 60 bucket `[m−59, m]` (độ dài thực [59, 60) phút); cấu trúc HourWindow; cập nhật chỉ sau commit; trượt theo đồng hồ đơn điệu + bắt kịp; xử lý chỉnh giờ hệ thống; số nguyên `score`/`weight_g`; dựng lại từ ScoreLedger (`minute_utc`); snapshot lịch sử bảng + API riêng, không dùng để dựng bảng hiện tại; bộ kiểm thử; `user_id` → `player_key` |
| `docs/ADR/0005-…`, `0006-…`, `0011-…`, `0012-…`, `0013-…`, `0016-…` | Sửa | 0005: tham chiếu bậc quá tải (R04). 0006: gỡ "không được mất", "P1 không bao giờ bỏ", "0 quà mất/trùng" → bảo đảm theo ADR-0018. 0011: ghi qua Worker, COLD chỉ sau ack, `player_key`. 0012: luồng tắt qua Worker, làm rõ quà trong journal. 0013: hàng chờ Boss quà trong cùng transaction. 0016: `DatabaseSync` không chạy trên luồng chính → ADR-0017 |
| `docs/ARCHITECTURE.md` | Sửa → **0.0.8** | Trạng thái duyệt; lịch sử; §0.1 (bậc quá tải, "không chủ động bỏ quà"); sơ đồ có PersistenceWorker + 2 file DB + xác thực WS; §1.2, §1.3, §1.4 (luồng tắt qua Worker, RPO theo ADR-0022, gỡ "không mất"/"mất tối đa một lô"); §2 DB; §3 (`data/`, `security/`, `ops/`, `persistence-protocol.js`, `verify-integrity.js`, `tests/crash`, `tests/security`); §4 (`player_key`, `schema_migrations`, `gift_events` đầy đủ, `score_ledger` có `minute_utc`/`source_key`, `hour_window_snapshots`, `admin_audit`); §5 (kiểm soát truy cập, API TOP 60 phút tách lịch sử, WS); §7 viết lại; §8 tiêu chí Phase 1, 2, 3, 4, 7, 8; §9; §10 (+8 rủi ro); Phụ lục B, D; **§11 mới** tổng hợp R01–R08 + điểm chưa chứng minh |
| `docs/PROJECT_STATUS.md` | Sửa → 0.0.8 | Trạng thái duyệt có điều kiện; Phase 1–3 cập nhật; mục chuẩn bị Phase 1 thêm 7b (Worker + bảo mật + migration); B15–B19; D4–D6; checklist; nhật ký 0.0.8 |
| `docs/PROJECT_BRIEF.md` | Sửa (ngoài danh sách bắt buộc, có lý do) | Gỡ 3 khẳng định quá mức trái R02/R05/R08 ("quà không bao giờ mất", "0 quà mất", "100% đã ghi" không điều kiện) |
| `docs/LESSONS.md` | Sửa | L-004 guard chặn nhầm theo từ khoá trong văn bản; L-005 khẳng định quá mức về độ bền |
| `docs/HANDOVER_ARCH_v0.0.8.md` | **Mới** | Báo cáo này |

## 3. Rủi ro còn tồn tại
| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Quà nhận nhưng chưa kịp ghi bền (≈ thời gian chờ + 50 ms) mất khi tiến trình chết/mất điện | Trung | G3 — bản chất của nguồn không phát lại; đo tỉ lệ ở Phase 2 |
| Thư viện TikTok không chính thức; `msgId`/streak/`room_id` chưa kiểm chứng | Cao | Kiểm chứng trên LIVE thật Phase 2; khoá dự phòng `H:` có thể trùng/thiếu |
| `node:sqlite` mới, stability chưa xác minh cho bản LTS chốt | Trung | Xác minh Phase 1; không tự đổi DB |
| Ổ đĩa/OS không tôn trọng fsync | Thấp–Trung | Ngoài kiểm soát phần mềm |
| HTTP thuần trên LAN (không TLS ở V1) | Trung | Nghe lén trên mạng không tin cậy |
| Đĩa đầy kéo dài trong SAFE MODE: bộ đệm quà khẩn cấp RAM có trần | Trung | Nếu file khẩn cấp cũng không ghi được và tiến trình chết → mất |
| Windows chưa nghiệm thu (không có máy) | Cao | Đã chấp nhận; Windows Validation |
| Bộ nhớ RAM 8 GB với batch chưa ack + hồ sơ nóng | Trung | Có trần + L3/L4; đo Phase 3 |
| Guard NOVA 1.0.3 chặn nhầm lệnh Bash khi văn bản chứa một số từ khoá | Thấp | Đã ghi L-004; dùng công cụ Edit/Write cho tài liệu; đề nghị xem xét tinh chỉnh guard |

## 4. Những điểm chưa thể chứng minh (chỉ là mục tiêu thiết kế)
1. RPO/RTO thực tế của từng nhóm C1–C6 (cần CR1–CR6, Phase 2–3).
2. Độ bền khi mất điện thật (CR7 không tự động hoá được).
3. Tick p95 không tăng khi Worker ghi tải lớn (Phase 3).
4. Chống trùng quà trên LIVE thật (phụ thuộc hành vi `msgId`/streak của thư viện).
5. Hiệu năng ghi `node:sqlite` trong Worker trên macOS và Windows; `fs.statfs` trên Windows.
6. Hiệu quả các biện pháp bảo mật trước tấn công thực tế (mới là thiết kế + danh sách test).
7. Chi phí trượt cửa sổ 60 phút với 10.000 người có điểm trong cùng một phút.

## 5. Kết quả kiểm tra tính nhất quán (quét tự động trên các file thật, 2026-11-24)
| Kiểm tra | Kết quả |
|---|---|
| Đủ file ADR 0001–0022 | Đạt |
| Mọi ADR được liệt kê trong ARCHITECTURE §9 | Đạt |
| Mọi ADR được tham chiếu trong ARCHITECTURE/STATUS/BRIEF đều tồn tại | Đạt |
| Phiên bản ARCHITECTURE / STATUS / BRIEF = 0.0.8 | Đạt |
| Không còn khẳng định quá mức về quà/độ bền (ARCH, STATUS, BRIEF, ADR) | Đạt |
| ARCHITECTURE §4 và các ADR không còn khoá `user_id` (đã thống nhất `player_key`) | Đạt — lần quét đầu phát hiện 1 chỗ sót ở ADR-0010, đã sửa và quét lại |
| ARCH/BRIEF không còn `is_demo`, `x-admin-token`, "trên Mac có thể bỏ mật khẩu" | Đạt |
| API TOP 60 phút tách khỏi `period`, có API lịch sử riêng | Đạt |
| Không có giới hạn cứng số người chơi | Đạt |
| STATUS nhắc đủ ADR-0017…0022 | Đạt |
| Không tự đánh dấu APPROVED | Đạt — lần quét đầu báo lỗi do bộ kiểm tra so khớp chữ hoa/thường với câu phủ định "không tự đánh dấu APPROVED"; kiểm lại bằng grep: không có chỗ nào tự đánh dấu |

## 6. Đề nghị ChatGPT
1. Kiểm duyệt v0.0.8 theo R01–R08 (ARCHITECTURE §11 là mục lục nhanh).
2. Xác nhận hoặc sửa các diễn giải B15–B19 (PROJECT_STATUS).
3. Xem xét việc Phase 1 mở rộng thêm khung PersistenceWorker + bảo mật (B15).
4. Sau khi duyệt: người dùng chuyển model sang Sonnet 5.5 cho Phase 1 (theo NOVA MODEL SELECTION POLICY); phần tối ưu Worker/fault injection nếu vượt phạm vi sẽ đề xuất chuyển Opus.
<!-- ===== KẾT THÚC docs/HANDOVER_ARCH_v0.0.8.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ARCHITECTURE.md ===== -->
## 2. ARCHITECTURE 0.0.8
_Nguồn: `docs/ARCHITECTURE.md`_

# ARCHITECTURE — NOVA FISHING LIVE 3D
Phiên bản tài liệu: 0.0.8 — Ngày: 2026-11-24 — Trạng thái: ChatGPT **phê duyệt có điều kiện cho Phase 1** ở v0.0.7 kèm 8 yêu cầu bắt buộc R01–R08; **bản 0.0.8 (sửa theo R01–R08) CHỜ CHATGPT KIỂM DUYỆT — chưa được duyệt, chưa viết code, Phase 1 chưa bắt đầu** — mục tiêu V1 macOS + Windows; **Windows: nền tảng mục tiêu, CHƯA NGHIỆM THU** (chưa có máy Windows)
Quyết định đã chốt: **Continuous Live World (phương án B, ChatGPT chốt)** · mỗi người xem là 1 cần thủ · **số cần thủ KHÔNG giới hạn** · AFK 5 phút (chỉ lệnh hợp lệ/quà đánh thức) · BXH LIVE / 60 phút gần nhất / ngày VN / tuần VN / tổng (điểm, phụ: tổng kg) · Asia/Ho_Chi_Minh, lưu UTC · Boss 30 phút + Boss quà · tiến trình lâu dài · **Phạm vi V1: phát TikTok LIVE trên macOS + Windows, OBS Browser Source cả hai, TikTok LIVE Studio kiểm riêng từng OS (ADR-0015)** · Three.js trên trình duyệt · TikTok LIVE Studio dọc 1080×1920 · bán thương mại + model CC0 low-poly.
Lịch sử: 0.0.1 (16 ô, phiên 10 phút) → 0.0.2 (không giới hạn cần thủ, ADR-0005…0008) → 0.0.3 (bỏ phiên chơi, thế giới liên tục, ADR-0009…0012) → **0.0.4: chốt AFK, BXH (giờ = cửa sổ trượt 60 phút, tiêu chí phụ tổng kg), định danh buổi LIVE theo sự kiện thật, múi giờ/UTC, hệ thống Boss (ADR-0013)** → 0.0.5: phạm vi TikTok LIVE chỉ macOS (ADR-0014, **đã bị thay thế**) → **0.0.6: người dùng chỉnh phạm vi V1 = macOS + Windows ngay từ bản đầu (ADR-0015), bỏ phụ thuộc native (ADR-0016)**. → 0.0.7: chỉ có máy Mac — macOS nghiệm thu trước; Windows x64 tương thích từ thiết kế + CI nếu khả thi; kiểm thử thực tế Windows chuyển sang giai đoạn Windows Validation (§8.2), không chặn Phase 1/2. → **0.0.8: sửa theo review R01–R08 của ChatGPT — PersistenceWorker (ADR-0017), idempotency quà (ADR-0018), cửa sổ 60 phút chi tiết (ADR-0010), bậc quá tải/backpressure/lỗi lưu trữ (ADR-0019), bảo mật REST/WS/LAN (ADR-0020), định danh LIVE/DEMO (ADR-0021), độ bền RPO/RTO (ADR-0022); xem §11.**

## 0. Nguyên tắc nền
**0.1 Không giới hạn người chơi (ADR-0005)**
1. Không có giới hạn cứng số người chơi trong logic game, DB, API, giao diện, tài liệu.
2. Gameplay ≠ hiển thị: server giữ trạng thái mọi cần thủ; client chỉ vẽ chi tiết người trong vùng camera/khu gameplay. Không được vẽ vẫn câu, vẫn cộng điểm, vẫn lên BXH.
3. Giới hạn vận hành (tốc độ sự kiện, kích thước hàng đợi, ngân sách render, tần suất WS, cỡ lô DB, số hồ sơ giữ "nóng" trong RAM) là **cấu hình bảo vệ máy**. Khi chạm ngưỡng: giảm chất lượng / gộp / trễ / backpressure / chuyển hồ sơ sang "lạnh" (DB) / tạm dừng mô phỏng (bậc L0–L4, ADR-0019). **Không từ chối người tham gia, không chủ động bỏ quà, không xoá người chơi.** (Phạm vi bảo đảm về quà: ADR-0018 — không tuyên bố exactly-once.)
4. Không thay giới hạn 16 cũ bằng bất kỳ con số cứng nào khác.

**0.2 Thế giới liên tục (ADR-0009)**
1. **Không có phiên chơi, không có vòng đếm giờ, không có màn tổng kết định kỳ.** Thế giới câu cá chạy liên tục suốt thời gian LIVE.
2. Người xem tham gia bất cứ lúc nào bằng comment `câu` / `câu cá` (lệnh cấu hình được).
3. **Điểm cá nhân, cấp độ, trang bị, sổ tay cá, thành tích không bao giờ reset theo thời gian.**
4. BXH theo thời gian là **cửa sổ tính trên sổ cái điểm**, không xoá điểm cá nhân: TOP giờ = **60 phút gần nhất (cửa sổ trượt)**; TOP ngày/tuần = kỳ lịch Việt Nam, kỳ cũ được lưu lại.
5. **Dữ liệu duy nhất được reset là TOP LIVE**, và chỉ khi xác nhận buổi LIVE mới (§1.3). Kết thúc LIVE không reset hồ sơ, tiến trình hay bất kỳ BXH dài hạn nào; các BXH dài hạn lưu độc lập.
6. Không giới hạn thời gian hoạt động của thế giới.

**0.3 Phạm vi nền tảng V1 (ADR-0015, người dùng quyết định — thay thế ADR-0014)**
1. Mục tiêu V1: game **vận hành và phát TikTok LIVE được trên macOS và Windows**. Code và dependency **tương thích Windows x64 ngay từ đầu** (không làm Mac-only rồi viết lại). Thứ tự **nghiệm thu**: macOS trước (chỉ có máy Mac); Windows là **nền tảng mục tiêu, CHƯA NGHIỆM THU** cho đến giai đoạn Windows Validation (§8.2). Thiếu máy Windows **không chặn** Phase 1 hay Phase 2 (người dùng chốt).
2. **Một codebase** dùng chung: Gameplay Engine (WorldCore), Backend, Database, TikTok Connector, hệ thống Gift, trang /stage và /control. Khác biệt theo OS chỉ nằm ở: launcher, `config/platform/<os>.json`, hướng dẫn cài đặt, `src/system/platform.js` (mở trình duyệt, thư mục dữ liệu, xử lý tín hiệu tắt).
3. Phát sóng: **OBS Browser Source** là đường phát độc lập phải chạy trên cả macOS và Windows; **TikTok LIVE Studio** được kiểm tra tương thích **riêng từng OS** — không mặc định là có/chạy được trên cả hai.
4. Yêu cầu chung cho mọi đường phát: WebGL2, âm thanh, WebSocket, khung dọc 1080×1920.
5. Cấm trong code và quy trình build chung: đường dẫn tuyệt đối của máy Mac (`/Users/...`), lệnh shell chỉ có trên macOS (`chmod`, `xattr`, `open`, `zip`, `sed -i ''`…), thư viện chỉ chạy trên macOS, phụ thuộc native phải biên dịch theo OS (ADR-0016). Build/đóng gói/test viết bằng Node (`tools/*.js`).
6. **Chưa triển khai:** Linux, Android, iOS, ứng dụng native riêng (Electron/Tauri/Swift/WinUI). Kiến trúc vẫn giữ mở rộng được.
7. Bằng chứng bắt buộc: **Platform Compatibility Matrix** (`docs/PLATFORM_COMPATIBILITY_MATRIX.md`) ghi kết quả kiểm thử **thực tế** từng OS × đường phát. Cột Windows giữ trạng thái "chưa nghiệm thu" đến khi có máy Windows; kết quả CI Windows (nếu có) ghi riêng, **không** thay cho nghiệm thu thực tế.
8. Mở rộng thêm nền tảng = thay đổi phạm vi: người dùng quyết định, ChatGPT duyệt, ADR mới.

## 1. Tổng quan & sơ đồ thành phần
Game câu cá 3D tương tác TikTok LIVE, chạy liên tục. Người xem comment `câu`/`câu cá` để có hồ sơ cần thủ và một vị trí trên bờ hồ (bờ hồ sinh thủ tục, mở rộng theo số người). Quà/like/follow tạo hiệu ứng; Boss và sự kiện thế giới diễn ra liên tục. Server Node chạy toàn bộ luật chơi; trang 3D chỉ hiển thị.

```
 TikTok LIVE ─(tiktok-live-connector)─┐      MockConnector / LoadGenerator ─┐
                                      ▼                                    ▼
                    ┌──────────── INGEST (LiveConnector adapter) ───────────┐
                    │ chuẩn hoá → Dedupe (LRU+TTL, streak) → RateLimiter     │
                    │ → GiftJournal (ghi bền DB TRƯỚC) → EventBus            │
                    └───────────────────────┬────────────────────────────────┘
                                            ▼
                    PriorityEventQueue có giới hạn (P0 hệ thống/streamEnd · P1 quà ·
                    P2 tham gia · P3 lệnh · P4 like/share gộp) → xử lý theo lô, ngân sách ms/tick
     ┌──────────────────────────── WORLD CORE (headless, nguồn sự thật, chạy liên tục) ───────────┐
     │ WorldClock & WorldLifecycle (STOPPED/RUNNING/PAUSED) · LiveSessionManager (buổi LIVE)       │
     │ PlayerRegistry nóng/lạnh: hồ sơ hoạt động trong RAM, hồ sơ cũ ở DB, nạp lại khi quay lại   │
     │ PresenceTracker: ACTIVE → AFK (5 phút, chỉ lệnh/quà đánh thức) · tầng COLD = chỉ ở DB    │
     │ FishingScheduler (min-heap, chi phí theo sự kiện đến hạn) · FishingSim · LootTable · RNG  │
     │ WorldEventScheduler: Boss / mưa / giờ vàng theo LỊCH + theo SỰ KIỆN LIVE (quà, mốc like)  │
     │ Progression: XP/Cấp · Trang bị & túi đồ · Sổ tay cá · Thành tích (đánh giá theo sự kiện) │
     │ ScoreLedger (sổ cái điểm bất biến) → Leaderboards: LIVE · giờ · ngày · tuần · tổng        │
     │ WorldLayout + SpatialIndex · BuffManager · shard-ready (partitionKey = hash(userId))      │
     └──────────────┬──────────────────────────────┬──────────────────────────────┬──────────────┘
                    ▼ PersistenceClient (batch,     ▼ InterestManager              ▼ REST phân trang
                    │ backpressure, ADR-0017/0019)  WS Gateway /ws (Host/Origin,    /api/leaderboard
          ┌─────────▼──────────────────┐        xác thực — ADR-0020):           /api/players
          │ PersistenceWorker (thread  │        stage = vùng camera + spotlight (mọi REST/WS admin
          │ riêng, DUY NHẤT ghi DB)    │        + số liệu gộp; control = tổng   cần phiên + CSRF)
          │ node:sqlite WAL FULL,      │        quan + metrics + cảnh báo
          │ transaction theo batch     │
          │ nova-live.db | nova-demo.db│ (ADR-0021)
          └────────────────────────────┘
                                                         ▼
   /stage (Three.js, Browser Source LIVE Studio 1080×1920)
   CrowdRenderer: InstancedMesh + LOD 0–3 + Frustum Culling + SpatialGrid + Object Pool
   SpotlightDirector · WorldEvent/Boss view · FX/EventQueue · AudioQueue · HUD/BXH luân phiên
```
Nguyên tắc chung: server quyết định mọi kết quả; tách 5 lớp (vòng lặp · trạng thái · render · âm thanh · nhập liệu); khởi động lại server → Worker `ready` → replay journal quà (thế giới ở RESTORING) → khôi phục thế giới từ DB (PAUSED) — ADR-0018, ADR-0022. **Luồng chính không bao giờ gọi DB trực tiếp** (ADR-0017).

### 1.1 Vòng đời thế giới
`STOPPED → RUNNING ⇄ PAUSED → STOPPED`
- `RUNNING`: thế giới chạy liên tục; không có pha đếm giờ hay tổng kết.
- `PAUSED` (Control bấm Tạm dừng, hoặc tuỳ chọn tự dừng khi mất kết nối TikTok): đóng băng FishingScheduler và WorldEventScheduler (thời điểm hẹn được dịch theo thời gian dừng), vẫn nhận/journal quà.
- `STOPPED`: chỉ sau khi đã lưu toàn bộ (§1.4).

### 1.2 Vòng đời cần thủ (server)
- Hoạt động câu: `CASTING → WAITING → BITE → FIGHTING → CAUGHT | ESCAPED → CASTING …` — mỗi bước là một mục hẹn giờ trong FishingScheduler.
- Hiện diện (`PresenceTracker`):
  - `ACTIVE`: đang tự quăng.
  - **Tương tác hợp lệ (đã chốt)** = (a) comment là **lệnh hợp lệ** (khớp danh sách lệnh của game, vd `câu`, `câu cá`, `hạng`…; comment thường không phải lệnh không tính) hoặc (b) **gửi quà**. **Like đơn lẻ không tính** (chống spam). Follow/share không nằm trong danh sách đánh thức nên cũng không tính (diễn giải theo quyết định; xem mục "Diễn giải đã áp dụng" trong PROJECT_STATUS).
  - `AFK`: **5 phút** (mặc định, cấu hình) không có tương tác hợp lệ → tạm dừng tự quăng cần. **Không bị xoá khỏi game**; giữ nguyên hồ sơ, điểm, cấp, trang bị, thành tích, vị trí, thứ hạng, buff còn hạn. Tương tác hợp lệ → tự đánh thức → `ACTIVE`.
  - `COLD` (tầng lưu trữ, **không phải trạng thái gameplay**): AFK quá ngưỡng vận hành (cấu hình, mặc định 30 phút) hoặc khi kết thúc LIVE → hồ sơ đã ghi đủ xuống DB được bỏ khỏi RAM, vị trí hiển thị được giải phóng. Với người chơi, đây vẫn là AFK. **Không xoá người chơi.**
  - Đánh thức từ COLD (cùng điều kiện tương tác hợp lệ): nạp hồ sơ từ DB → khôi phục cấp, trang bị, túi đồ, sổ tay, thành tích, điểm → cấp vị trí bờ hồ → `ACTIVE`. Sự kiện của người đó chờ trong hàng đợi đến khi nạp xong.
- TikTok không báo "người xem rời đi" đáng tin cậy, nên "rời đi" được suy ra từ AFK/COLD và kết thúc LIVE. Hồ sơ luôn được ghi xuống DB liên tục (write-behind qua PersistenceWorker), không chỉ lúc rời; hồ sơ chỉ chuyển COLD sau khi mọi thay đổi của người đó đã được ack. Khoá người chơi: `player_key` (ADR-0021).

### 1.3 Vòng đời buổi LIVE (LiveSessionManager) — định danh theo sự kiện thật (đã chốt)
- Một **buổi LIVE** = một bản ghi `live_sessions` (id, @username, room_id TikTok, started_at, ended_at, status, end_reason). Buổi LIVE được xác định bằng **sự kiện bắt đầu và kết thúc thực tế**, không theo giờ, không theo lần kết nối.
- **Bắt đầu thực tế:** kết nối TikTok thành công vào phòng đang phát với `room_id` **chưa từng gắn với buổi LIVE nào** → tạo buổi mới (TikTok cấp `room_id` mới cho mỗi lần phát). Đây là **xác nhận buổi LIVE mới** → chốt TOP LIVE cũ (snapshot) và mở TOP LIVE mới.
- **Kết thúc thực tế:** sự kiện `streamEnd` từ TikTok (`end_reason = STREAM_END`) hoặc người vận hành bấm "Kết thúc LIVE" trên Control (`MANUAL`) → luồng §1.4.
- **Mất kết nối tạm thời** (rớt mạng, connector khởi động lại, server khởi động lại) **không tạo buổi mới**: kết nối lại cùng `room_id` → tiếp tục buổi đang ACTIVE, TOP LIVE giữ nguyên.
- **Phục hồi khi connector/server khởi động lại:** khi khởi động, nạp buổi `ACTIVE` gần nhất từ DB (trạng thái `RECOVERING`) → kết nối lại:
  - cùng `room_id` → tiếp tục (ACTIVE);
  - `room_id` khác → buổi cũ đóng với `end_reason = INFERRED` (ended_at = thời điểm sự kiện cuối cùng nhận được), rồi tạo buổi mới như "bắt đầu thực tế";
  - streamer không còn phát (không kết nối được vì LIVE đã tắt) → buổi cũ giữ `RECOVERING`, **không poll**; người vận hành bấm "Kết nối" lại khi phát, hoặc bấm "Đóng buổi LIVE cũ".
- Trường hợp không có `room_id` đáng tin (chế độ DEMO, hoặc thư viện không trả về): chỉ tạo buổi mới qua nút **"Bắt đầu buổi LIVE mới"** trên Control (cần `confirm`). DEMO dùng **file DB riêng** `nova-demo.db` (ADR-0021) nên buổi LIVE, BXH, hồ sơ DEMO không thể trộn với dữ liệu thật.
- Hành vi `room_id` qua các lần nối lại sẽ được **kiểm chứng thực tế ở Phase 2**; nếu khác giả định, phương án dự phòng là nút xác nhận trên Control (ghi vào sổ bài học).

### 1.4 Kết thúc LIVE & tắt game (ADR-0012)
Kích hoạt bởi: `streamEnd` từ TikTok, nút "Kết thúc LIVE" / "Thoát an toàn" trên Control (**đường chính trên cả hai OS**), hoặc tín hiệu tắt tiến trình: macOS SIGINT/SIGTERM/SIGHUP; Windows Ctrl+C (SIGINT), Ctrl+Break (SIGBREAK), đóng cửa sổ console (SIGHUP — Windows chỉ cho khoảng vài giây trước khi buộc tắt, nên luồng tắt có trần ngắn; phần chưa ack khi hết trần thuộc RPO ở ADR-0022 — **không** cam kết "mất tối đa 500 ms").
1. Ngừng nhận sự kiện mới (connector ngắt, **không tự nối lại, không poll**).
2. Xả hàng đợi sự kiện còn lại (trần thời gian cấu hình, mặc định 10 s); quà **đã ghi bền `RECEIVED`** nhưng chưa APPLIED vẫn nằm trong journal và được áp dụng khi khởi động lần sau (ADR-0018); quà chưa kịp ghi bền khi tiến trình bị buộc dừng có thể mất (ADR-0018 G3).
3. Kết thúc các cú câu đang dở theo luật (đề xuất: cá đang FIGHTING được giải quyết ngay theo RNG đã gieo; WAITING thì huỷ, không mất gì).
4. Gửi các batch còn lại cho PersistenceWorker, gửi lệnh dừng cho Worker (commit nốt + checkpoint WAL TRUNCATE + đóng DB) và **chờ ack** (ADR-0017); sau đó mới chuyển mọi hồ sơ sang tầng COLD (không đổi tiến trình người chơi).
5. Chốt TOP LIVE (snapshot), cập nhật BXH giờ/ngày/tuần/tổng, ghi `live_sessions.ended_at` + tổng kết buổi (số người, số cá, cá hiếm nhất, quà).
6. Thế giới → `STOPPED`; ghi log "đã lưu an toàn" và hiển thị trên Control; chỉ sau đó tiến trình mới thoát.
- Sập đột ngột / mất điện: dữ liệu mất theo phân loại RPO ở ADR-0022 (C1 quà: 0 với quà đã ack `RECEIVED`; C2 tiến trình: phần chưa ack, đo bằng `persist.unackedAgeMs`; C4 dựng lại được). Khởi động sau: WAL tự phục hồi → `quick_check` → replay journal quà → buổi LIVE chưa đóng ở `RECOVERING`, hỏi tiếp tục/đóng. Các con số này là mục tiêu thiết kế, **chưa chứng minh** cho đến khi chạy kiểm thử CR1–CR6 (ADR-0022).

## 2. Công nghệ (kèm lý do chọn)
| Thành phần | Chọn | Lý do | Đã loại |
|---|---|---|---|
| Runtime | Node.js **≥ 22.13 LTS** (có `node:sqlite` không cần cờ), ES Modules | Cùng stack game LIVE trước; một runtime cho macOS (arm64, x64) và Windows (x64) | Bun; Node 20 (không có `node:sqlite` ổn định) |
| HTTP/WS | `express@4`, `ws@8` (+ gói nhị phân cho delta nếu đo thấy cần) | Đã chạy ổn định | socket.io |
| TikTok | `tiktok-live-connector@2.5.0` (ghim; thư viện duy nhất được cài) | Bản đang chạy ở game cũ | `@tiktool/live` (chỉ ghi nhận làm phương án nếu thư viện chính hỏng; không cài) |
| DB | **`node:sqlite` (tích hợp sẵn trong Node, WAL, `synchronous=FULL`, ghi theo lô)**, chạy **chỉ trong PersistenceWorker** (`worker_threads`, ADR-0017) — không gọi trên luồng chính; repository interface (ADR-0016); 2 file DB theo realm (ADR-0021) | Không có module native → cùng một gói chạy trên cả macOS và Windows, không cần biên dịch theo OS | `better-sqlite3` (native, cần bản dựng riêng theo OS/arch) |
| Bus/hàng đợi | Interface `EventBus` + in-process (bản 1) | Không thêm hạ tầng ở bản 1 | Kafka |
| Thời gian | **Lưu timestamp UTC (INTEGER ms) trong DB**; quy đổi `Asia/Ho_Chi_Minh` (UTC+7) bằng `Intl` khi tính kỳ ngày/tuần và khi hiển thị | Không thêm thư viện; không phụ thuộc múi giờ máy | moment; lưu giờ địa phương |
| Font | Font tiếng Việt đi kèm (giấy phép OFL, tự host) | Chữ tiếng Việt hiển thị giống nhau trên macOS/Windows/OBS/LIVE Studio | Font hệ thống (khác nhau theo OS) |
| 3D | `three` (ghim r17x, tự host) + GLTFLoader, meshopt/Draco, InstancedMesh/BatchedMesh | Nhẹ, nhúng Browser Source | Babylon/Godot/Unity |
| Animation đám đông | Vertex animation/pose cho LOD1; AnimationMixer chỉ LOD0 | Hàng nghìn instance rẻ | Skinned mesh cho mọi người |
| Chữ tên | Atlas canvas/SDF dùng pool | Tránh hàng nghìn DOM/texture | CSS2DRenderer |
| Test | `node:test`, `node:assert` + `tools/load-test.js` | Có sẵn | Jest/Vitest |
| Âm thanh | WebAudio, AudioManager tự viết | Ưu tiên, huỷ, trần thời gian | Howler |
| Đóng gói | `tools/pack-release.js` (Node thuần, tạo 2 gói `macos` / `windows` từ cùng mã nguồn; đặt quyền thực thi trong mục zip cho file `.command`), obfuscate tuỳ chọn; launcher `.command` (macOS) + `.bat` (Windows) | Không phụ thuộc lệnh shell riêng OS khi build | Electron/Tauri (app native, ngoài phạm vi); script bash/PowerShell trong quy trình build |

## 3. Cấu trúc thư mục
```
Fishing3D/
├─ server.js                 launcher Node dùng chung (tự khởi động lại khi cập nhật/lỗi; chuyển tiếp tín hiệu tắt để lưu an toàn)
├─ launchers/ macos/ (start.command · start-dien-thoai.command) · windows/ (start.bat · start-dien-thoai.bat) — vỏ mỏng, chỉ gọi `node server.js`
├─ .gitattributes             (`*.bat` CRLF, `*.command` LF — tránh hỏng launcher khi đổi OS)
├─ package.json · package-lock.json · .env.example · .gitignore
├─ config/ default.json (thời gian câu, AFK, ngưỡng vận hành, múi giờ) · platform/darwin.json · platform/win32.json (preset đồ hoạ mặc định, thư mục dữ liệu, mở trình duyệt) · render-presets.json
│          fish.json · equipment.json · achievements.json · levels.json · world-events.json · gifts.default.json
├─ src/
│  ├─ app.js · http.js (Express) · auth.js · shutdown.js (luồng kết thúc an toàn §1.4)
│  ├─ ingest/  LiveConnector.js · MockConnector.js · LoadGenerator.js · Normalizer.js · Dedupe.js · RateLimiter.js · GiftJournal.js
│  ├─ bus/     EventBus.js (interface) · InProcessBus.js · PriorityEventQueue.js
│  ├─ world/   WorldCore.js · WorldLifecycle.js · WorldClock.js · LiveSessionManager.js
│  │           WorldEventScheduler.js (Boss/sự kiện theo lịch + theo LIVE) · BossFight.js · BuffManager.js
│  │           WorldLayout.js (bờ hồ theo số người) · SpatialIndex.js (lưới băm)
│  ├─ players/ PlayerRegistry.js (nóng/lạnh) · PresenceTracker.js (ACTIVE/AFK + tầng COLD) · CommentCommands.js
│  ├─ fishing/ FishingScheduler.js (min-heap) · FishingSim.js · LootTable.js · rng.js
│  ├─ progression/ Leveling.js · Equipment.js · Inventory.js · FishDex.js · Achievements.js
│  ├─ rank/    ScoreLedger.js · Leaderboards.js (LIVE/giờ/ngày/tuần/tổng) · PeriodKeys.js · LeaderboardRepo.js
│  ├─ net/     WsGateway.js · InterestManager.js · codec.js
│  ├─ data/    PersistenceClient.js (batch, backpressure — luồng chính) · PersistenceWorker.js (worker_threads, sở hữu DB) · ReadWorker.js (tuỳ chọn) · migrations/ (NNN_ten.sql) · repositories/ · backup.js (VACUUM INTO)
│  ├─ security/ AuthSessions.js (ghép đôi, phiên, mật khẩu scrypt) · CsrfOrigin.js (Origin/Host/CSRF) · Audit.js (admin_audit) · UpdateVerifier.js (chữ ký gói)
│  ├─ ops/     OverloadController.js (bậc L0–L4/SAFE MODE) · DiskMonitor.js · Alerts.js
│  ├─ system/  Logger.js · Settings.js · Metrics.js · Updater.js (ghi tạm rồi đổi file sau khi khởi động lại — Windows khoá file đang chạy) · License.js · **platform.js** (điểm duy nhất chứa khác biệt OS)
│  └─ shared/  protocol.js · persistence-protocol.js
├─ public/
│  ├─ stage/   index.html · main.js · render/ · crowd/ (CrowdRenderer, LodManager, SpatialGrid, InstancePool, NameTagAtlas)
│  │           actors/ · director/ (SpotlightDirector, CameraRig) · events/ (BossView, WeatherFx) · fx/ · hud/ · audio/
│  ├─ control/ index.html · control.js · control.css
│  ├─ shared/  ws-client.js · protocol.js
│  └─ vendor/  three.module.min.js
├─ assets/ models/*.glb (kèm LOD) · textures/ · audio/ · fonts/ · CREDITS.md
├─ tools/  simulate-balance.js · load-test.js · pack-release.js · check-assets.js · verify-leaderboards.js · check-portability.js (quét đường dẫn tuyệt đối, lệnh riêng OS, tên file phân biệt hoa thường) · verify-integrity.js (bất biến I1–I8, ADR-0022)
├─ tests/  unit/ · integration/ · load/ · crash/ (CR1–CR6, fault injection) · security/ · run-tests.js
├─ data/   (runtime, bỏ qua bởi git) nova-live.db · nova-demo.db · backups/ · logs/ · emergency-gifts-*.jsonl (chỉ khi SAFE MODE)
└─ docs/   PROJECT_BRIEF · ARCHITECTURE · PROJECT_STATUS · ADR/ · LESSONS.md · **PLATFORM_COMPATIBILITY_MATRIX.md** · **INSTALL_MACOS.md** · **INSTALL_WINDOWS.md** · báo cáo NOVA
```

## 4. Dữ liệu / Database (SQLite WAL, migration đánh số trong `src/data/migrations/`)
Không có cột/ràng buộc nào giới hạn số người chơi. **Mọi timestamp lưu UTC dạng INTEGER (ms)**; trọng lượng lưu `weight_g` INTEGER (gam), điểm `score` INTEGER — không dùng số thực để cộng/so sánh. Mọi ghi đi qua PersistenceWorker theo lớp batch (ADR-0017): `critical` (journal quà, ≤ 50 ms), `progress` (500 ms / 500 op — chu kỳ gom, **không** phải cam kết RPO), `state` (≤ 5 s), `log`. Mỗi batch là một transaction. **Hai file DB theo realm:** `nova-live.db`, `nova-demo.db` (ADR-0021). Khoá người chơi ở mọi bảng là `player_key` (`tt:<userId>` / `demo:<id>`).
| Bảng | Nội dung | Chỉ mục / ràng buộc |
|---|---|---|
| settings | Cấu hình Admin (JSON, có phiên bản) | |
| world_state | Trạng thái thế giới (lifecycle, thời tiết, sự kiện đang chạy, seed, thời điểm hẹn) để khôi phục | 1 dòng |
| schema_migrations | version, name, checksum, applied_at_utc (ADR-0021) | PK version |
| live_sessions | Buổi LIVE: username, room_id, started_at, ended_at, status (ACTIVE/RECOVERING/ENDED), end_reason (STREAM_END/MANUAL/INFERRED), last_event_at, tổng kết (DEMO nằm ở `nova-demo.db`) | (status), room_id UNIQUE |
| players | Hồ sơ lâu dài: **`player_key` PK**, `realm` (CHECK live/demo, khớp file DB), `external_id` (TikTok `userId`), `unique_id`, `nickname` (chỉ hiển thị, không làm khoá), ngoại hình, **xp, level, total_score, total_weight_g**, first_seen, last_seen | PK player_key; UNIQUE (realm, external_id); CHECK tiền tố khoá theo realm |
| player_presence | ACTIVE/AFK, vị trí bờ, last_valid_interaction_at (UTC), buổi LIVE gần nhất | PK player_key (FK players) |
| player_equipment | Cần/mồi/phụ kiện đang trang bị | PK (player_key, slot_type) |
| player_inventory | Túi đồ (vật phẩm, số lượng, hạn dùng `expires_at_utc`, `source_key` nếu từ quà) | (player_key), CHECK qty ≥ 0, UNIQUE (source_key, effect_seq) |
| fishdex | Sổ tay cá: loài đã câu, số lần, weight_g lớn nhất, lần đầu | PK (player_key, species_id) |
| player_achievements | Thành tích đạt được + thời điểm + tiến độ (mở khoá idempotent) | PK (player_key, achievement_id) |
| catches | Mỗi lần câu: catch_id, loài, bậc, weight_g, điểm, buff, live_session_id, world_event_id, at_utc | PK catch_id; (player_key, at_utc), (live_session_id) |
| score_ledger | Sổ cái điểm **bất biến**: ledger_id, player_key, score, weight_g, source (CATCH/GIFT/BOSS/ADJUST), `source_key`, `effect_seq`, at_utc, `minute_utc`, live_session_id — nguồn gốc để tính/khôi phục mọi BXH, kể cả cửa sổ 60 phút | UNIQUE (source_key, effect_seq); (minute_utc); (at_utc); (live_session_id); (player_key, at_utc) |
| leaderboard_scores | Điểm + trọng lượng theo kỳ cố định: `scope ∈ {live, day, week, all}`, `period_key` (`live:<id>`, `day:2026-11-24`, `week:2026-W48` theo giờ VN, `all`), score, weight_g, reached_at_utc — cập nhật **trong cùng transaction** với ledger. **TOP 60 phút không lưu ở đây** (ADR-0010) | PK (scope, period_key, player_key); (scope, period_key, score DESC, weight_g DESC, reached_at_utc ASC) |
| leaderboard_snapshots | Chốt TOP khi đóng kỳ ngày/tuần hoặc kết thúc/thay buổi LIVE | (scope, period_key, rank) |
| hour_window_snapshots | **Lịch sử** TOP 60 phút chụp mỗi giờ tròn (snapshot_at_utc, window_from/to_minute, rank, player_key, score, weight_g) — **không** dùng để dựng TOP 60 phút hiện tại (ADR-0010) | (snapshot_at_utc, rank) |
| admin_audit | Nhật ký thao tác Admin (thiết bị, IP, thao tác, kết quả, at_utc; không có token) (ADR-0020) | (at_utc) |
| world_events | Lịch sử Boss/sự kiện: loại (SCHEDULED_BOSS/GIFT_BOSS/…), nguồn, người triệu hồi, warned_at, started_at, ended_at (UTC), HP gốc, số người ACTIVE lúc bắt đầu, kết quả | (started_at) |
| world_event_contrib | Đóng góp của từng người trong Boss/sự kiện (phần thưởng) | PK (event_id, player_key) |
| fish_species / equipment_defs / achievement_defs | Danh mục nạp từ `config/*.json`, có version | |
| gift_catalog · gift_rules | Danh mục quà, quà → hành động | |
| gift_events (GiftJournal, ADR-0018) | `gift_key` (M:/S:/H:), player_key (NULL nếu thiếu userId), gift_id, repeat_count, quantity, coin_value, `effect_params` (chốt lúc nhận: received_at_utc, thời lượng buff, RNG), status RECEIVED → APPLIED / REJECTED / FAILED → DEAD, attempts, applied_at_utc, key_quality (STRONG/WEAK) | **UNIQUE gift_key**; (status, received_at_utc) |
| event_logs / comment_logs | Nhật ký (lấy mẫu khi tải cao), tự dọn 30/7 ngày | |
- Lưu giữ dữ liệu: `score_ledger`, `catches` có thể gộp/nén theo tháng (cấu hình) khi DB lớn; **không** xoá hồ sơ, sổ tay, thành tích, BXH tổng.
- Hướng mở rộng: Postgres (dữ liệu bền) + Redis sorted set (BXH nóng).

## 5. API
**Kiểm soát truy cập (ADR-0020, áp dụng cả trên localhost):** mọi request kiểm `Host` trong danh sách cho phép (chống DNS rebinding); REST thay đổi trạng thái cần cookie phiên `HttpOnly; SameSite=Strict` + header `X-Nova-CSRF` + `Origin` cùng origin; không bật CORS.
Chỉ đọc không cần phiên (chỉ từ localhost, hoặc từ LAN kèm `viewKey`): `GET /api/health`, `GET /api/state` (tóm tắt, không dữ liệu nhạy cảm), WebSocket `/ws?role=stage`.
**BXH (toàn bộ người chơi, phân trang) — đọc qua Worker, không chặn luồng chính:**
- `GET /api/leaderboard?scope=live|day|week|all&period=<khoá kỳ, mặc định kỳ hiện tại>&top=10|50|100`
- `GET /api/leaderboard?scope=hour&top=…` — **luôn là cửa sổ 60 phút đang chạy**, không nhận `period` (ADR-0010)
- `GET /api/leaderboard/hour-history?at=<giờ tròn UTC>` — **lịch sử** snapshot TOP 60 phút (API riêng, nhãn riêng)
- `GET /api/leaderboard?scope=…&period=…&cursor=<rank>&limit=<1..200>` (giới hạn trang, không phải giới hạn người chơi)
- `GET /api/leaderboard/rank/:playerKey?scope=…&period=…` → hạng + điểm + lân cận ±5
- `GET /api/leaderboard/periods?scope=live|day|week` → danh sách kỳ đã lưu
- `GET /api/players?search=&cursor=&limit=` · `GET /api/players/:playerKey` (hồ sơ, cấp, trang bị, sổ tay, thành tích) — cần phiên admin
Admin (cần phiên; ghép đôi trên máy phát hoặc mật khẩu/QR từ điện thoại — ADR-0020):
- `POST /api/admin/pair` · `POST /api/admin/login` · `GET /api/admin/session` (trả token CSRF) · `POST /api/admin/logout-all` · `POST /api/admin/reauth`
- `POST /api/world/{start|pause|resume|stop}` (stop = luồng lưu an toàn §1.4)
- `POST /api/live/{connect|disconnect|demo}` · `POST /api/live/new-session` (`confirm`, chỉ khi không có room_id đáng tin) · `POST /api/live/end` (luồng §1.4) · `POST /api/live/close-recovering` (`confirm`)
- `POST /api/world-events/{trigger|cancel}` · `GET/PUT /api/world-events/schedule` (chu kỳ Boss, thời gian cảnh báo, số Boss đồng thời tối đa, hệ số theo người chơi)
- `POST /api/demo/{comment|gift|like|bulk-join}` · `POST /api/demo/load {players, eventsPerSec, seconds}` (chỉ DEMO)
- `GET/PUT /api/settings` · `GET/PUT /api/gift-rules` · `POST /api/gifts/sync`
- `GET /api/metrics` · `GET /api/logs` · `POST /api/db/{backup|restore}` · `POST /api/admin/update` (zip)
Lỗi: `{ ok:false, code, message }` (tiếng Việt). Thao tác nguy hiểm cần chuỗi xác nhận gõ tay + xác thực lại trong 5 phút + ghi `admin_audit` (ADR-0020). `GET /api/metrics` gồm `alerts[]`, bậc quá tải, `persist.unackedAgeMs`, dung lượng đĩa (ADR-0019).

**WebSocket (InterestManager — không phát toàn bộ người chơi):**
- server → stage: `snapshot` (bố cục bờ hồ + người trong vùng quan tâm + sự kiện thế giới đang chạy), `interest_delta` (10 Hz), `aggregate` (1 Hz: tổng người ACTIVE/AFK, cá/phút, mật độ đoạn bờ), `event` (cá hiếm, quà, lên cấp, thành tích, Boss bắt đầu/máu/kết thúc, thời tiết — có ưu tiên), `top` (khi đổi, theo phạm vi đang luân phiên), `live_status`, `world_status`.
- stage → server: `viewport`, `metrics` (FPS, WebGL2, âm thanh).
- control: tổng quan + metrics + cảnh báo + BXH theo trang + trạng thái lưu an toàn.
- Upgrade WS kiểm `Host` + `Origin`; `role=admin` bắt buộc cookie phiên; `role=stage` chỉ đọc, cho phép Origin rỗng/`null` (Browser Source) **chỉ từ localhost**, từ LAN cần `viewKey`; message có schema, ≤ 16 KB, giới hạn tần suất theo kết nối (ADR-0020).

## 6. Giao diện (màn hình, luồng chính)
- **/stage (1080×1920):** hồ 3D chạy liên tục, bờ hồ mở rộng theo số người. SpotlightDirector đưa lên hình người vừa tặng quà, câu cá hiếm, lên cấp, mới vào/quay lại, TOP đầu; đoạn bờ còn lại là đám đông LOD thấp; người AFK có tư thế ngồi nghỉ (LOD1) hoặc ẩn (LOD2/3).
  - Trên cùng: tên thế giới, đồng hồ giờ Việt Nam, thời tiết, **tổng số cần thủ đang hoạt động**, thanh sự kiện/Boss (cảnh báo đếm ngược trước khi Boss xuất hiện, máu, thời gian còn lại).
  - Nửa trên phải: **BXH luân phiên (đã chốt)** qua 5 phạm vi TOP LIVE → TOP 60 phút → TOP ngày → TOP tuần → TOP tổng và 3 cỡ TOP 10 / TOP 50 / TOP 100. TOP 50/100 hiển thị dạng trang 10 dòng tự lật (chữ đủ lớn cho khung dọc). Chu kỳ và bật/tắt từng bảng/cỡ cấu hình ở Control. Xếp theo **điểm**, bằng điểm thì **tổng kg** cao hơn xếp trên.
  - Giữa: banner cá hiếm / quà / lên cấp / thành tích / Boss (EventQueue có ưu tiên và trần thời gian).
  - Comment `hạng`/`top` → banner ngắn: hạng của người đó ở TOP LIVE + TOP tổng, cấp, cá hiếm nhất (gộp khi đông). Comment `túi`/`sổ tay` (tuỳ chọn) → thẻ tóm tắt.
  - Chừa 1/3 dưới và mép phải cho TikTok.
  - **Không có** màn đếm ngược/tổng kết phiên.
- **/control (điện thoại):** kết nối LIVE, **Bắt đầu buổi LIVE mới / Kết thúc LIVE (lưu an toàn)**, Tạm dừng/Tiếp tục thế giới, kích hoạt/huỷ sự kiện, cấu hình Boss (chu kỳ, cảnh báo, số Boss đồng thời, hệ số theo người chơi), xem trước stage, **BXH đầy đủ 5 phạm vi, phân trang toàn bộ người chơi** + tìm người chơi + xem hồ sơ, gán quà, cài đặt (AFK, ngưỡng vận hành, múi giờ, chu kỳ luân phiên BXH), metrics tải, bắn sự kiện thử/tải thử, sao lưu, cập nhật bản.
- Luồng LIVE (cả hai OS): bấm đúp launcher (`start.command` trên macOS / `start.bat` trên Windows) → /control tự mở → thêm Browser Source `http://127.0.0.1:<port>/stage` vào OBS hoặc TikTok LIVE Studio (theo hướng dẫn riêng từng OS) → @username → Kết nối → (room_id mới = buổi LIVE mới, TOP LIVE mới; cùng room_id = tiếp tục) → thế giới RUNNING → người xem comment `câu` bất cứ lúc nào → … → `streamEnd` hoặc bấm Kết thúc → lưu an toàn → "Đã lưu" → đóng game.

## 7. Bảo mật (chi tiết: ADR-0020; sửa 0.0.8 theo R06)
- Bí mật (mật khẩu Admin, khoá ký nếu thư viện cần) do **người dùng tự đặt** qua biến môi trường; repo chỉ có `.env.example` khoá giả; file môi trường thật nằm trong `.gitignore`; Claude không đọc/ghi file môi trường thật (NOVA 1.0.3).
- **Bind:** mặc định `127.0.0.1`. Chế độ điện thoại bind địa chỉ LAN đã chọn (không mặc định `0.0.0.0`) và **không khởi động** nếu chưa đặt mật khẩu Admin (≥ 10 ký tự); tự tắt chế độ LAN khi không có phiên điện thoại trong N phút (cấu hình).
- **Xác thực admin cả trên localhost** (bỏ cơ chế "trên Mac vào thẳng" của bản cũ — không an toàn trước CSRF/DNS rebinding): ghép đôi mã một lần qua launcher (`#pair=`), mật khẩu hoặc QR ghép đôi từ điện thoại; phiên cookie `HttpOnly; SameSite=Strict`, server lưu hash, hết hạn 12 giờ không hoạt động; mật khẩu giữ dạng hash scrypt trong RAM; giới hạn đăng nhập 5 lần/phút/IP + khoá tăng dần.
- **CSRF/Origin/Host:** header CSRF theo phiên + `Origin` cùng origin cho mọi thay đổi trạng thái; kiểm `Host` (421 nếu sai); không CORS; WS kiểm Host/Origin như §5.
- **Thiết bị khác trong LAN:** không có phiên thì chỉ xem được stage khi có `viewKey`; không truy cập được API admin; stage không chứa dữ liệu nhạy cảm.
- **Thao tác nguy hiểm:** chuỗi xác nhận gõ tay + xác thực lại ≤ 5 phút + `admin_audit`.
- **Đầu vào:** validate mọi đầu vào; tên/comment TikTok chỉ hiển thị dạng chữ (không `innerHTML`), giới hạn độ dài, lọc ký tự điều khiển; CSP chặt, `nosniff`, `no-referrer`, `frame-ancestors 'none'` cho /control.
- **Cập nhật bản:** chỉ nhận gói **có chữ ký** (khoá công khai trong bản bán), chống path traversal/zip bomb, backup DB trước khi áp dụng.
- **Rủi ro còn lại:** HTTP thuần trên LAN (không TLS ở V1) → có thể bị nghe lén trên mạng không tin cậy; giảm thiểu bằng QR ghép đôi, khuyến nghị chỉ dùng mạng tin cậy, ghi rõ trong INSTALL_*.
- RateLimiter chống spam (mỗi người) và quá tải (toàn cục); REST có giới hạn tần suất.
- Hồ sơ lâu dài chỉ lưu dữ liệu cần cho game (ID, tên hiển thị, tiến trình); không lưu bình luận đầy đủ lâu dài; xoá hồ sơ theo yêu cầu là thao tác nguy hiểm (có audit).
- Bản bán chỉ chứa khoá công khai; `npm audit` mỗi lần bàn giao; backup DB tự động trước cập nhật bản và trước migration (ADR-0022).

## 8. Kế hoạch triển khai theo module (8 Phase, mỗi Phase = test thật + PROJECT_STATUS + bàn giao ChatGPT)
**Phạm vi kiểm thử (ADR-0015, cập nhật 0.0.7):**
- **macOS (máy thật MAC-1):** toàn bộ test tự động + kiểm thử thực tế với OBS và TikTok LIVE Studio + nghiệm thu từng Phase.
- **Windows — trước khi có máy:** (a) thiết kế tương thích Windows x64 (ADR-0015/0016); (b) `tools/check-portability.js` chạy mỗi lần test trên Mac; (c) **Windows CI nếu khả thi**: GitHub Actions `windows-latest` (x64) chạy `npm ci`, `npm test`, `check-portability`, `pack-release --target windows` — cần repo GitHub riêng tư (mục A14). CI chỉ chứng minh backend/build không lỗi phụ thuộc OS, **không** chứng minh OBS/LIVE Studio/GPU/âm thanh.
- **Windows — khi có máy:** giai đoạn Windows Validation (§8.2).
- Không kiểm thử Linux/Android/iOS.
Mức tải kiểm thử chuẩn: **10 · 1.000 · 10.000 người**, áp lực **50.000** (đo ngưỡng máy, không đặt giới hạn). Sự kiện: **1.000 comment/s + 200 quà/s** trong 10 phút. Thời gian: mô phỏng thế giới chạy liên tục **3 giờ** (đồng hồ tăng tốc cho test).
| Phase | Nội dung | Phụ thuộc | Tiêu chí xong |
|---|---|---|---|
| 1. Nền tảng | git init, `.gitattributes`, package.json, server Express+WS, config + `config/platform/*`, `platform.js`, Logger, Settings, Metrics, **shutdown.js (khung lưu an toàn, tín hiệu cả hai OS)**, launcher macOS + Windows, test runner, `check-portability.js`, trang thử /stage (WebGL2, âm thanh, WebSocket, 1080×1920), khung PLATFORM_COMPATIBILITY_MATRIX, **workflow Windows CI (nếu A14 được cho phép)**; **(0.0.8)** khung PersistenceClient + PersistenceWorker (mở DB, migration `001_init`, commit batch, ack/nack, dừng an toàn), khung bảo mật (Host/Origin/CSRF, ghép đôi + phiên admin, bind theo chế độ), OverloadController + Alerts tối thiểu | — | `npm test` + `check-portability` đạt trên macOS; ghi lại mức stability `node:sqlite` của bản Node LTS chốt; test Worker: commit/ack, Worker chết → gửi lại batch không trùng; test bảo mật: CSRF/Origin lạ, Host lạ, WS admin không phiên đều bị chặn; /stage thử được trong **OBS và TikTok LIVE Studio trên macOS**; ghi Matrix; Windows: CI xanh nếu đã thiết lập, nếu chưa ghi "chưa kiểm" — **không chặn Phase 1** |
| 2. Ingest & hàng đợi | LiveConnector, MockConnector, LoadGenerator, Normalizer, Dedupe, RateLimiter, GiftJournal, PriorityEventQueue, EventBus, **LiveSessionManager (định danh theo sự kiện thật, RECOVERING)** | 1 | Trùng msgId, streak, rớt mạng / restart connector / restart server (cùng room_id → tiếp tục, không tạo buổi mới), room_id mới → buổi mới, streamEnd không nối lại; **kiểm chứng room_id, msgId, streak thực tế trên LIVE thật**; tải chuẩn 1.000 comment/s + 200 quà/s: **I1** 0 quà áp dụng hai lần, **I2** mọi quà đã `RECEIVED` kết thúc APPLIED/REJECTED/DEAD, báo cáo số quà nhận từ connector so với số đã ghi `RECEIVED`, trễ quà p95 < 1 s (gồm chờ ack); **CR1/CR2** (kill tiến trình/Worker khi tải quà) đạt I1–I3; bậc quá tải L2–L4 kích hoạt và hồi phục đúng (ADR-0019) |
| 3. Thế giới liên tục headless | WorldCore/Lifecycle/Clock, PlayerRegistry nóng/lạnh, PresenceTracker (AFK 5 phút, chỉ lệnh hợp lệ/quà đánh thức, COLD, khôi phục), FishingScheduler, FishingSim, LootTable, ScoreLedger, Leaderboards 5 phạm vi + PeriodKeys + HourWindow (ADR-0010), WorldLayout, SpatialIndex, batch `progress`/`state` qua PersistenceWorker, backup `VACUUM INTO`, `verify-integrity.js`, luồng kết thúc LIVE | 1, 2 | Unit test; `simulate-balance.js` 10/1.000/10.000 người chạy 3 giờ mô phỏng; tick p95 < 20 ms; `verify-leaderboards.js` khớp tính lại từ ledger (kể cả cửa sổ trượt 60 phút và tiêu chí phụ kg); qua 00:00 và thứ Hai giờ VN đúng (test với giờ máy khác múi); timestamp DB đều UTC; test like không đánh thức AFK, lệnh/quà đánh thức; test rời → quay lại khôi phục đủ; **CR1–CR6** (ADR-0022) chạy trên macOS với bất biến I1–I8, đo RPO (`unackedAgeMs` lúc kill) và RTO thực tế — ghi số đo, không ghi "không mất dữ liệu"; tick p95 không tăng khi Worker ghi tải lớn (chứng minh R01); test DEMO không ghi được vào `nova-live.db` (ADR-0021) |
| 4. Tiến trình & sự kiện thế giới (headless) | Leveling, Equipment, Inventory, FishDex, Achievements, WorldEventScheduler (Boss 30 phút + Boss quà, cảnh báo trước, chống chồng chéo, điều chỉnh theo người chơi/server), BossFight, BuffManager, gắn quà → hành động | 3 | Unit test; mô phỏng cân bằng XP/cấp & Boss ở 10/1.000/10.000 người; Boss lịch + Boss quà không chồng quá cấu hình; luôn có cảnh báo trước; server quá tải → Boss được hoãn; yêu cầu Boss quà đã APPLIED nằm trong `world_events QUEUED` và còn sau restart |
| 5. Cảnh 3D cơ bản | Renderer, hồ, nước, trời, ShoreGenerator, camera dọc, preset, HUD FPS | 1 | 30 FPS ở 1080×1920 trên M1 kèm phần mềm phát; preset Tự động sẵn cho GPU Windows (đo ở §8.2) |
| 6. Đám đông, cá, Boss 3D | CrowdRenderer (Instanced + LOD 0–3 + culling + grid + pool), HeroAngler, cần/dây/phao, cá, BossView, SpotlightDirector, NameTagAtlas, InterestManager | 3, 4, 5 | 30 FPS với 1.000 và 10.000 người (preset Vừa); đồng bộ đúng server; không rò bộ nhớ sau 30 phút người vào/ra liên tục |
| 7. Overlay, FX, âm thanh & Control | HUD, BXH luân phiên 5 phạm vi, banner hạng/cấp/thành tích, EventQueue, AudioQueue; Control điện thoại đầy đủ (§6), bảng cảnh báo quá tải, audit Admin | 2, 3, 4, 6 | Chồng 1.000 sự kiện/s không vỡ hàng đợi; điều khiển trọn vòng từ điện thoại (ghép đôi QR/mật khẩu); phân trang đúng ở 10.000 người; bộ test bảo mật ADR-0020 đạt |
| 8. Ổn định & phát hành | Bản quyền, `pack-release.js` tạo gói macOS + Windows, quyền file, INSTALL_MACOS (đã thử) + INSTALL_WINDOWS (bản nháp, chưa thử thực tế), soak 3 giờ trên macOS, chạy lại CR1–CR6 trên bản đóng gói (mất điện thật CR7 ghi "chưa chứng minh"), đo RAM/CPU, Matrix, Handover | tất cả | PRE_RELEASE checklist đạt trên macOS; tiêu chí nghiệm thu V1 phần macOS có bằng chứng; gói Windows được build (CI nếu có) và **ghi rõ "Windows: mục tiêu, chưa nghiệm thu"** trong Handover/hướng dẫn |
### 8.1 Tiêu chí nghiệm thu V1 (người dùng chốt) — phải có bằng chứng thực tế trên từng OS
1. Game khởi chạy trên macOS. 2. Game khởi chạy trên Windows. 3. OBS lấy được hình ảnh game trên cả hai. 4. Âm thanh hoạt động. 5. Comment và quà TikTok được xử lý. 6. Không có lỗi phụ thuộc hệ điều hành. 7. Có hướng dẫn cài đặt và vận hành cho cả hai hệ điều hành.
Bằng chứng: ảnh chụp/quay màn hình, log, kết quả `npm test` và `check-portability.js` trên từng OS, ghi trong PLATFORM_COMPATIBILITY_MATRIX + TEST_REPORT.
Trạng thái theo OS (0.0.7): tiêu chí 1, 4, 5, 6 (phần macOS), 7 (INSTALL_MACOS) và 3 (phần macOS) nghiệm thu trên macOS trong Phase 1–8. Tiêu chí 2, 3 (Windows), 4–6 (Windows), 7 (INSTALL_WINDOWS đã thử thực tế) **chờ giai đoạn Windows Validation**. V1 chỉ được tuyên bố "đạt trên Windows" sau §8.2.

### 8.2 Giai đoạn Windows Validation (khi người dùng có máy Windows x64)
Không gắn với số Phase; có thể bắt đầu ngay khi có máy, kể cả giữa các Phase.
1. Ghi thông tin máy WIN-1 vào Matrix (Windows, CPU, GPU, driver, RAM, Node, OBS, TikTok LIVE Studio).
2. Chạy danh sách kiểm thử Windows (Matrix mục 1–20 cột WIN-1): cài theo INSTALL_WINDOWS từng bước; launcher `.bat`; `npm test`; `check-portability`; OBS Browser Source (WebGL2, âm thanh, 1080×1920, FPS); TikTok LIVE Studio trên Windows (có bản? nguồn web? WebGL2? âm thanh?); WebSocket; /control từ điện thoại (tường lửa Windows); thoát an toàn (Ctrl+C, đóng console, nút Control); cập nhật zip (khoá file); SmartScreen/antivirus; comment + quà trên LIVE thật; soak 3 giờ.
3. Mỗi lỗi tương thích: ghi vào Matrix + TEST_REPORT + `docs/LESSONS.md` (nguyên nhân, cách sửa), phân loại, sửa trong `platform.js`/launcher/config nếu là khác biệt OS; không tạo nhánh code riêng cho Windows.
4. Chạy lại test hồi quy trên **cả macOS và Windows** sau mỗi sửa.
5. Bàn giao bản vá cho ChatGPT; chỉ khi đủ tiêu chí 2–7 phần Windows mới đổi trạng thái Windows thành "đã nghiệm thu".

Thay đổi so với 0.0.2: tách Phase 4 mới "Tiến trình & sự kiện thế giới"; gộp "Overlay/FX/âm thanh" và "Control & Admin" thành Phase 7 để giữ tổng 8 Phase.

## 9. Quyết định kiến trúc (ADR)
Chi tiết: `docs/ADR/`.
- ADR-0001 – Three.js trên trình duyệt.
- ADR-0002 – Server headless là nguồn sự thật; client chỉ nhận vùng quan tâm.
- ADR-0003 – Adapter TikTok tách biệt, phía sau là Ingest (chờ cho phép tái dùng code glass-bridge).
- ADR-0004 – Khung dọc 1080×1920.
- ADR-0005 – Số cần thủ không giới hạn (sửa 0.0.3/0.0.4: AFK 5 phút, tương tác hợp lệ = lệnh/quà, tầng COLD/khôi phục).
- ADR-0006 – Đường ống sự kiện chịu tải.
- ADR-0007 – Render đám đông.
- ADR-0008 – Sẵn sàng mở rộng ngang.
- **ADR-0009 – Continuous Live World: bỏ phiên chơi 10 phút** (ChatGPT chốt phương án B; 0.0.4: chỉ TOP LIVE được reset).
- **ADR-0010 – BXH 5 phạm vi trên sổ cái điểm bất biến + khoá kỳ.**
- **ADR-0011 – Tiến trình lâu dài & PlayerRegistry nóng/lạnh.**
- **ADR-0012 – Vòng đời buổi LIVE & tắt game an toàn** (sửa 0.0.4: định danh theo sự kiện thật, RECOVERING).
- **ADR-0013 – Hệ thống Boss: lịch 30 phút, Boss quà, cảnh báo, chống chồng chéo, điều chỉnh tải.**
- ~~ADR-0014 – Phạm vi nền tảng: TikTok LIVE chỉ macOS~~ — **đã bị thay thế bởi ADR-0015**.
- **ADR-0015 – Phạm vi V1: macOS + Windows, một codebase, OBS cả hai OS, TikTok LIVE Studio kiểm riêng từng OS.**
- **ADR-0016 – Không dùng phụ thuộc native: `node:sqlite` thay `better-sqlite3`; Node ≥ 22.13.**
- ADR-0015 sửa 0.0.7: macOS nghiệm thu trước; Windows mục tiêu chưa nghiệm thu; Windows CI nếu khả thi; Windows Validation khi có máy.
- ADR-0004 sửa 0.0.6: thiết lập canvas 1080×1920 cho OBS. ADR-0012 sửa 0.0.6: tín hiệu tắt trên Windows.
- ADR-0010 sửa 0.0.4: TOP giờ = cửa sổ trượt 60 phút; ngày/tuần theo giờ VN; tiêu chí phụ tổng kg; lưu UTC. ADR-0005 sửa 0.0.4: định nghĩa tương tác hợp lệ đánh thức AFK.
- **Mới 0.0.8 (theo review R01–R08):** **ADR-0017** PersistenceWorker (R01) · **ADR-0018** Idempotency quà & GiftJournal (R02) · **ADR-0019** Bậc quá tải, backpressure, lỗi lưu trữ (R04, R05) · **ADR-0020** Bảo mật REST/WS/LAN (R06) · **ADR-0021** Định danh người chơi LIVE/DEMO (R07) · **ADR-0022** Độ bền dữ liệu, RPO/RTO, crash recovery (R08).
- **Sửa 0.0.8:** ADR-0010 (R03 — thiết kế chi tiết cửa sổ 60 phút, tách snapshot lịch sử, số nguyên) · ADR-0005 (R04) · ADR-0006 (làm rõ bảo đảm quà) · ADR-0011 (ghi qua Worker, `player_key`) · ADR-0012 (luồng tắt qua Worker) · ADR-0013 (hàng chờ Boss quà trong cùng transaction) · ADR-0016 (rủi ro `DatabaseSync` → ADR-0017; không đổi DB).

## 10. Rủi ro & phương án dự phòng
| Rủi ro | Mức | Phương án |
|---|---|---|
| `tiktok-live-connector` không chính thức; TikTok đổi giao thức | Cao | Ghim bản; adapter tách; không poll sau streamEnd; Mock + LoadGenerator |
| RAM 8 GB khi thế giới chạy hàng giờ và người chơi tích luỹ | Cao | PlayerRegistry nóng/lạnh (COLD → chỉ DB); mục tiêu < 1 KB/người nóng; đo ở Phase 3 |
| Mất dữ liệu khi tắt đột ngột | Cao | Phân loại C1–C6 + RPO/RTO (ADR-0022); WAL `synchronous=FULL`; journal quà ghi bền trước khi áp dụng (ADR-0018); luồng tắt qua Worker; backup `VACUUM INTO`; CR1–CR6. Rủi ro còn lại: quà chưa kịp ghi bền (G3); ổ đĩa có cache ghi không tôn trọng fsync; mất điện thật chưa kiểm được (CR7) |
| `DatabaseSync` chặn event loop (fsync, checkpoint WAL, truy vấn lớn) | Cao | PersistenceWorker sở hữu DB, ReadWorker tuỳ chọn; luồng chính chỉ gọi bất đồng bộ (ADR-0017); đo tick p95 khi ghi tải lớn ở Phase 3 |
| Crash giữa các bước xử lý quà → cộng hai lần hoặc bỏ sót | Cao | `gift_key` UNIQUE; hiệu ứng + APPLIED cùng transaction; `UNIQUE(source_key, effect_seq)`; replay trước khi RUNNING; bảng crash ở ADR-0018 — **không tuyên bố exactly-once** |
| `msgId`/streak của thư viện TikTok không như giả định | Cao | Khoá dự phòng `H:` + cờ `WEAK_KEY` + cảnh báo; kiểm chứng trên LIVE thật ở Phase 2 trước khi tuyên bố chống trùng |
| Đĩa đầy / lỗi ghi / DB hỏng | Cao | DiskMonitor, bậc L3–L4, SAFE MODE, đường quà khẩn cấp, backup + khôi phục (ADR-0019, ADR-0022) |
| Truy cập trái phép từ trang web độc hại trên máy phát hoặc thiết bị trong LAN | Cao | Xác thực cả localhost, CSRF + Origin + Host, `viewKey`, audit, xác thực lại cho thao tác nguy hiểm (ADR-0020) |
| HTTP thuần trên LAN bị nghe lén | Trung | Còn tồn tại ở V1; QR ghép đôi; khuyến nghị mạng tin cậy; tự tắt chế độ LAN (ADR-0020) |
| DEMO ghi đè/trộn hồ sơ LIVE | Trung | Hai file DB tách biệt + realm theo connector + khoá có tiền tố + CHECK (ADR-0021) |
| Xác định sai "buổi LIVE mới" (reset TOP LIVE nhầm hoặc không reset) | Trung | Định danh theo sự kiện thật (room_id mới / streamEnd); RECOVERING khi restart; kiểm chứng room_id ở Phase 2; snapshot TOP LIVE trước khi thay buổi; khôi phục được từ ledger |
| Sai ranh giới ngày/tuần hoặc cửa sổ 60 phút | Trung | Lưu UTC; PeriodKeys quy đổi Asia/Ho_Chi_Minh (00:00–23:59:59, thứ Hai–Chủ nhật); cửa sổ trượt theo bucket phút; test với giờ máy ở múi khác; tính lại được từ ledger |
| Cửa sổ trượt 60 phút tốn CPU khi đông | Trung | Bucket theo phút: mỗi phút chỉ trừ điểm của bucket hết hạn (O(số người có điểm trong phút đó · log n)); đo ở Phase 3 |
| Boss dồn dập (lịch + nhiều quà triệu hồi) | Trung | Số Boss đồng thời cấu hình (mặc định 1), hàng chờ Boss quà, khoảng nghỉ tối thiểu, hoãn khi server quá tải; quà triệu hồi đã APPLIED nằm trong hàng chờ bền (ADR-0013/0018) |
| DB phình to sau nhiều tháng | Trung | Gộp/nén ledger & catches theo tháng; chỉ mục đúng; sao lưu định kỳ |
| Lạm phát tiến trình (người cũ quá mạnh, người mới nản) | Trung | Mô phỏng cân bằng Phase 4; BXH giờ/LIVE cho người mới cơ hội; đường cong XP giảm dần |
| FPS tụt khi đông / Boss + quà dồn | Cao | Chỉ vẽ chi tiết vùng camera; LOD; ngân sách render tự điều chỉnh; EventQueue có trần |
| Lũ sự kiện | Cao | Token bucket, hàng đợi ưu tiên có giới hạn, gộp, xử lý theo lô, backpressure tới Worker, bậc L0–L4 (ADR-0019); quà ghi `RECEIVED` bền trước khi áp dụng |
| SQLite một luồng ghi | Trung | Một Worker ghi duy nhất, WAL + batch transaction; ReadWorker cho đọc; repository interface → Postgres (cần ADR) |
| WebGL2/âm thanh khác nhau giữa OBS và TikTok LIVE Studio, giữa macOS và Windows (CEF, tăng tốc phần cứng, tự phát âm thanh) | Cao | Kiểm thực tế từ Phase 1 trên cả hai OS; hướng dẫn bật tăng tốc phần cứng Browser Source và "Control audio via OBS"; dự phòng quay cửa sổ trình duyệt; ghi Matrix |
| Chưa có máy Windows thật để kiểm thử (đã biết, người dùng chấp nhận) | **Cao** | Không chặn Phase 1/2; thiết kế tương thích Windows x64; `check-portability.js`; Windows CI nếu khả thi (A14); ghi "Windows: mục tiêu, chưa nghiệm thu" ở mọi báo cáo; giai đoạn Windows Validation §8.2 khi có máy. Rủi ro còn lại: lỗi OBS/GPU/âm thanh/LIVE Studio trên Windows chỉ phát hiện muộn → giữ khác biệt OS tập trung ở `platform.js` để sửa nhanh |
| TikTok LIVE Studio không có hoặc không hỗ trợ Browser Source trên một OS | Trung | Không mặc định; kiểm thực tế; nếu không được, OBS là đường phát chính trên OS đó (ghi Matrix + hướng dẫn) |
| Phát qua OBS cần quyền stream key/RTMP của tài khoản TikTok | Trung | Ngoài kiểm soát của game; tiêu chí nghiệm thu là OBS lấy được hình; hướng dẫn ghi rõ điều kiện tài khoản |
| Khác biệt OS: đường dẫn, hoa/thường tên file, xuống dòng, tên file tiếng Việt trong zip, tín hiệu tắt, khoá file khi cập nhật, tường lửa khi mở chế độ điện thoại | Trung | `platform.js`, `path`, `.gitattributes`, tên file ASCII cho launcher/gói, `check-portability.js`, Updater đổi file sau khởi động lại, hướng dẫn tường lửa từng OS |
| Gatekeeper (macOS) / SmartScreen + antivirus (Windows) chặn launcher chưa ký | Trung | Hướng dẫn mở lần đầu từng OS; cân nhắc ký mã ở Phase 8 (cần người dùng quyết định chi phí) |
| Phần cứng Windows rất đa dạng (GPU yếu, driver cũ) | Trung | Preset Tự động + cấu hình tối thiểu được công bố; đo trên máy kiểm thử |
| Bản quyền model/âm thanh · chính sách TikTok · lộ khoá khi bán | Trung | CC0 + CREDITS; không quy đổi tiền thật; chỉ khoá công khai |

## 11. Độ bền dữ liệu, nhất quán quà & bảo mật (0.0.8 — theo review R01–R08)
| Yêu cầu | Tóm tắt thiết kế | Chi tiết |
|---|---|---|
| R01 Database & event loop | Rủi ro D1–D7 của `DatabaseSync` (đồng bộ, fsync, checkpoint, lỗi I/O ném đồng bộ, stability chưa xác minh). PersistenceWorker (`worker_threads`) sở hữu duy nhất kết nối ghi; ReadWorker tuỳ chọn; giao tiếp `postMessage` có schema (`commit/ack/nack/read/result/health`); batch theo lớp `critical`/`progress`/`state`/`log`; mỗi batch một transaction `BEGIN IMMEDIATE`; WAL + `synchronous=FULL`; checkpoint trong Worker; Worker chết → gửi lại batch chưa ack (idempotent) → SAFE MODE nếu lặp. Không đổi công nghệ DB. | ADR-0017, ADR-0016 |
| R02 Gift idempotency | `gift_key` UNIQUE; `RECEIVED` ghi bền **trước** khi áp dụng; hiệu ứng + `APPLIED` cùng transaction; `UNIQUE(source_key, effect_seq)` ở mọi bảng nhận hiệu ứng; tham số phụ thuộc thời gian chốt lúc nhận; bảng crash từng bước; replay khi khởi động. Bảo đảm G1–G3; **không tuyên bố exactly-once**. | ADR-0018 |
| R03 Leaderboard 60 phút | Bucket theo `minute_utc`; cửa sổ = 60 bucket `[m−59, m]` (độ dài thực [59, 60) phút); HourWindow trong RAM với cấu trúc có thứ tự; trượt theo đồng hồ đơn điệu, bắt kịp khi trễ; chỉ phản ánh dữ liệu đã commit; số nguyên `score`/`weight_g`; dựng lại từ ScoreLedger; snapshot lịch sử ở bảng + API riêng, không bao giờ dùng để dựng bảng hiện tại. | ADR-0010 |
| R04 Unlimited players | Giữ nguyên không giới hạn cứng; bảng giới hạn vận hành có cấu hình; bậc L0–L4: giảm render → gộp sự kiện → backpressure → chuyển hồ sơ lạnh → tạm dừng mô phỏng; không xoá người chơi, không từ chối tham gia, không chủ động bỏ quà. | ADR-0005, ADR-0019 |
| R05 Event queue | Backpressure xuyên suốt tới Worker; mã cảnh báo + `alerts[]`; phục hồi sự kiện sau restart theo loại; xử lý đĩa sắp đầy/ENOSPC/BUSY/IOERR/CORRUPT; SAFE MODE + đường quà khẩn cấp; không tuyên bố "quà không bao giờ mất". | ADR-0019 |
| R06 Security | Xác thực cả localhost (ghép đôi/mật khẩu/QR), phiên cookie HttpOnly SameSite=Strict, CSRF + Origin + Host, WS kiểm tra tương ứng, `viewKey` cho stage từ LAN, thao tác nguy hiểm xác nhận + xác thực lại + audit, gói cập nhật có chữ ký, CSP; rủi ro còn lại: HTTP thuần trên LAN. | ADR-0020, §5, §7 |
| R07 Player identity | `player_key` = `tt:<userId>` / `demo:<id>`; `realm` + `UNIQUE(realm, external_id)` + CHECK; **hai file DB** `nova-live.db`/`nova-demo.db`; realm do loại connector quyết định; `schema_migrations` + backup trước migration. | ADR-0021, §4 |
| R08 Data durability | Phân loại C1–C6 với RPO/RTO mục tiêu; làm rõ 500 ms là chu kỳ gom, RPO thực = `persist.unackedAgeMs` (cảnh báo 2 s, L4 ở 10 s); backup `VACUUM INTO`; bất biến I1–I8; kiểm thử CR1–CR7 (CR7 mất điện thật: chưa chứng minh được). | ADR-0022 |
**Những điểm CHƯA chứng minh** (chỉ là mục tiêu thiết kế cho đến khi có số đo): RPO/RTO thực; tick p95 khi Worker ghi tải lớn; hành vi `msgId`/streak/`room_id` của thư viện trên LIVE thật; hiệu năng ghi `node:sqlite` trên Windows; độ bền khi mất điện thật; `fs.statfs` trên Windows.

### Phụ lục A — Đồ hoạ & tối ưu đám đông (M1 8 GB, 1080×1920)
| LOD | Ai | Cách vẽ |
|---|---|---|
| LOD0 Hero | Người đang spotlight (quà, cá hiếm, lên cấp, mới vào/quay lại, TOP) | Model đầy đủ, AnimationMixer, cần + dây + phao thật, trang bị hiển thị, tên lớn |
| LOD1 Gần | Trong vùng camera gần | InstancedMesh low-poly, vertex animation/pose (AFK = ngồi nghỉ), tên nhỏ từ atlas |
| LOD2 Xa | Trong khung nhìn ở xa | Impostor/billboard instanced, không tên |
| LOD3 Đám đông | Ngoài khung nhìn hoặc rất xa | Hiệu ứng mật độ theo đoạn bờ (từ `aggregate`) |
- Frustum culling theo ô SpatialGrid; Object Pool cho actor, cần/dây, cá, FX, nhãn tên, Boss; không tạo/huỷ mỗi frame.
- Ngân sách preset Vừa (cấu hình): ≤ 120 draw call, ≤ 300k tam giác, ≤ 64 MB texture. Vượt → giảm LOD0/LOD1 → giảm render scale → hạ preset; **không đụng gameplay**.
- `pixelRatio = 1`, render scale 0.75–1.0, FXAA nhẹ ở Vừa, WebGL2, `powerPreference: high-performance`; khoá 30 FPS; dừng render khi tab ẩn.
- Ánh sáng 1 directional + hemisphere; bóng thật chỉ LOD0 ở Cao; blob shadow cho LOD1. Nước shader tự viết, không phản chiếu thời gian thực.
- Thế giới chạy hàng giờ → bắt buộc giải phóng tài nguyên khi hồ sơ chuyển COLD, đo heap định kỳ (Metrics phía client gửi về Control).
- Preset Thấp / Vừa (mặc định) / Cao / Tự động.

### Phụ lục A2 — Thiết lập phần mềm phát (chi tiết trong INSTALL_MACOS / INSTALL_WINDOWS)
- **OBS (macOS + Windows):** canvas/output 1080×1920 dọc; Browser Source URL `http://127.0.0.1:<port>/stage`, kích thước 1080×1920, FPS 30, bật "Control audio via OBS", bật tăng tốc phần cứng Browser Source (Windows: Settings → Advanced); không bật "Shutdown source when not visible" (thế giới phải chạy liên tục).
- **TikTok LIVE Studio:** kiểm từng OS: có bản cho OS đó không, có nguồn trang web/Browser Source không, WebGL2, âm thanh, khung dọc. Kết quả ghi Matrix; nếu không đạt thì OBS là đường phát trên OS đó.
- /stage tự kiểm và báo về /control: WebGL2 có/không, renderer GPU, FPS, trạng thái âm thanh, WebSocket — để người vận hành thấy ngay nguồn phát có đủ điều kiện không.

### Phụ lục B — Tích hợp TikTok LIVE & đường ống sự kiện
- Kết nối bằng `@username` nhập ở Control. Trạng thái: `DEMO / CONNECTING / CONNECTED / DISCONNECTED / ENDED`.
- Kết nối thành công → LiveSessionManager so `room_id` → cùng = tiếp tục buổi; mới = buổi LIVE mới (TOP LIVE mới) (§1.3).
- **streamEnd → luồng kết thúc LIVE §1.4: lưu an toàn, KHÔNG tự nối lại, KHÔNG poll**; chỉ nối lại khi bấm "Kết nối".
- Rớt mạng khi đang LIVE → nối lại tối đa 5 lần (cấu hình), giãn cách tăng dần; quá hạn → báo Control; buổi LIVE giữ nguyên.
- Sự kiện: `chat`, `gift`, `like`, `follow`, `share`, `member`, `streamEnd`. Chỉ **comment là lệnh hợp lệ** và **quà** là tương tác hợp lệ cho PresenceTracker (đánh thức AFK / nạp từ COLD); like, follow, share, member không đánh thức.
- Dedupe: `gift_key` = `M:<msgId>`; streak `S:<playerKey>:<gift>:<groupId>:<repeatCount>` chỉ cộng phần tăng, chốt ở `repeatEnd`; thiếu khoá → `H:<hash>` + `WEAK_KEY`; LRU+TTL + `UNIQUE gift_key` trong DB (ADR-0018).
- RateLimiter token bucket mỗi người + toàn cục; tham gia không bị bỏ, chỉ trễ.
- PriorityEventQueue có giới hạn: P0 hệ thống · P1 quà · P2 tham gia/quay lại · P3 lệnh · P4 like/share (gộp). Tràn: P4 gộp/lấy mẫu có đếm; P3 giảm tần suất; P2 chỉ trễ; P1 (quà) **không bị chủ động bỏ** — quà ghi `RECEIVED` bền trước khi áp dụng. Backpressure + cảnh báo + bậc quá tải: ADR-0019.
- GiftJournal (ADR-0018): `RECEIVED` (ghi bền, group commit ≤ 50 ms, chờ ack) → tính hiệu ứng tất định từ `effect_params` → hiệu ứng + `APPLIED` trong **cùng một transaction** → FX. Khởi động lại: replay `RECEIVED/FAILED` trước khi RUNNING; lỗi lặp → `DEAD` + cảnh báo. Bảo đảm: không áp dụng hai lần hiệu ứng đã lưu; quà chưa ghi bền có thể mất — **không tuyên bố exactly-once**.
- Sự kiện LIVE kích hoạt sự kiện thế giới (cấu hình): **quà hợp lệ triệu hồi Boss đặc biệt** (ADR-0013); mốc like toàn phòng (vd mỗi 10.000 like) → giờ vàng; quà cụ thể → mưa/bão. Sự kiện thế giới áp dụng toàn hồ qua BuffManager (O(1), không lặp từng người).

### Phụ lục C — Mở rộng ngang (thiết kế, chưa triển khai ở bản 1)
- Một buổi LIVE có một nguồn sự kiện → Ingest đơn tiến trình ghi vào EventBus.
- Bản 1: 1 tiến trình Node (P = 1). Năng lực **đo** ở Phase 3/8, không giả định.
- Khi cần: EventBus → Redis Streams/NATS; World worker theo `hash(userId) % P`; Leaderboards → Redis sorted set theo `scope:period_key`; Persistence → Postgres; WsGateway nhiều tiến trình; WorldEventScheduler là một tiến trình điều phối phát quảng bá tới mọi shard.
- Điều kiện: số đo Phase 8 cho thấy 1 tiến trình không đủ; thay đổi hạ tầng phải xin phép người dùng.

### Phụ lục D — Hệ thống tiến trình & sự kiện (đề xuất số liệu, chốt sau mô phỏng Phase 4)
- **Điểm (score) — tiêu chí xếp hạng chính (đã chốt):** từ mỗi con cá = f(bậc, kg, buff) (công thức chốt sau mô phỏng Phase 4); ghi vào ScoreLedger kèm `weight_g`; `players.total_score` và `total_weight_g` cộng dồn, không reset. Thứ tự BXH: điểm ↓, tổng kg ↓, rồi ai đạt trước xếp trên (để thứ tự luôn xác định).
- **XP/Cấp:** XP từ cá + sự kiện; đường cong tăng dần; cấp mở khoá trang bị/khu câu (cấu hình `levels.json`).
- **Trang bị:** cần, mồi, phụ kiện — nhận từ cấp, thành tích, Boss, quà; ảnh hưởng tỉ lệ cắn/giữ cá/độ hiếm; có hạn dùng cho vật phẩm từ quà.
- **Sổ tay cá:** loài đã câu, số lần, kg lớn nhất; hoàn thành bộ → thành tích.
- **Thành tích:** đánh giá theo sự kiện (bắt cá X, lên cấp Y, hạ Boss, câu liên tục), lưu tiến độ.
- **Boss (đã chốt, ADR-0013):**
  - Boss lịch: mặc định **30 phút/lần**, chỉnh được trong Admin/Control.
  - Boss đặc biệt: triệu hồi bằng **quà hợp lệ** (bảng quà → hành động).
  - **Cảnh báo trước** khi xuất hiện (mặc định 60 s đếm ngược, cấu hình) trên stage + âm thanh.
  - **Không chồng chéo ngoài cấu hình:** `maxConcurrentBosses` mặc định 1; Boss quà đến khi đang có Boss → xếp hàng (giữ thứ tự; mục hàng chờ ghi cùng transaction với APPLIED, bền qua restart); Boss lịch gặp Boss khác → hoãn đến khi xong + khoảng nghỉ tối thiểu (cấu hình).
  - **Điều chỉnh theo người chơi & server:** HP/thời lượng/phần thưởng co giãn theo số người ACTIVE lúc bắt đầu; 0 người ACTIVE → hoãn Boss lịch; server quá tải (tick, độ sâu hàng đợi, FPS stage báo về) → hoãn bắt đầu và/hoặc giảm hiệu ứng, không huỷ yêu cầu Boss quà.
  - Mọi người ACTIVE góp sát thương bằng cá câu được/quà; phần thưởng theo đóng góp (`world_event_contrib`).
<!-- ===== KẾT THÚC docs/ARCHITECTURE.md ===== -->

---
## 3. ADR mới và ADR sửa ở 0.0.8

---
<!-- ===== BẮT ĐẦU docs/ADR/0017-persistence-worker.md ===== -->
## ADR — 0017-persistence-worker.md
_Nguồn: `docs/ADR/0017-persistence-worker.md`_

# ADR-0017: Persistence Worker — tách ghi DB khỏi event loop chính (R01)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (theo yêu cầu R01 của ChatGPT, review v0.0.7) — chờ ChatGPT duyệt
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
   - Worker → Main: `ack {batchId, committedAtUtc}` · `nack {batchId, code, retryable}` · `result {reqId, rows}` · `health {walBytes, lastCommitMs, freeBytes}` · `fatal {code}`.
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
   - Worker chết (`exit`/`error`): luồng chính đánh dấu `PERSISTENCE_DEGRADED`, giữ các batch chưa ack trong RAM, khởi động lại Worker (giãn cách tăng dần), **gửi lại** batch chưa ack (an toàn nhờ idempotency). Thất bại liên tiếp quá ngưỡng → SAFE MODE (ADR-0019).
   - Tắt an toàn: `shutdown` → Worker commit nốt, checkpoint TRUNCATE, đóng DB, ack → mới thoát.
8. **Đường dẫn & OS:** thư mục dữ liệu do `platform.js` cấp (không đường dẫn tuyệt đối); hướng dẫn Windows: loại trừ thư mục dữ liệu khỏi quét antivirus thời gian thực (khuyến nghị, không bắt buộc).
9. **Xác minh Phase 1:** ghi lại mức stability của `node:sqlite` trong tài liệu Node của bản LTS chốt; nếu là experimental thì báo ChatGPT trước khi dựa vào (không tự đổi DB — cần ADR mới).

## Phương án đã loại
- Gọi `DatabaseSync` trên luồng chính (D1–D5).
- Nhiều Worker cùng ghi (SQLite chỉ một writer; tăng `SQLITE_BUSY`).
- Child process riêng cho DB (IPC nặng hơn, khó đóng gói 2 OS; Worker đủ).
- Đổi sang `better-sqlite3`/DB server (trái ADR-0016; cần ADR riêng).

## Hệ quả
- Luồng chính chỉ thấy API bất đồng bộ (`await client.commit(...)`, `await client.read(...)`).
- Cần test: Worker chết giữa batch; ack chậm; fsync chậm giả lập; đo p95 tick không đổi khi ghi tải lớn (Phase 3).
- Bộ nhớ: batch chưa ack nằm trong RAM — có trần, xem ADR-0019.
<!-- ===== KẾT THÚC docs/ADR/0017-persistence-worker.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0018-gift-idempotency-journal.md ===== -->
## ADR — 0018-gift-idempotency-journal.md
_Nguồn: `docs/ADR/0018-gift-idempotency-journal.md`_

# ADR-0018: Idempotency quà & GiftJournal phục hồi sau crash (R02)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (yêu cầu R02 của ChatGPT) — chờ duyệt
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

## Quy trình (mỗi quà)
1. **Nhận** (Ingest, luồng chính): chuẩn hoá → dedupe RAM (LRU) → tính `gift_key`, `effect_params` (**tất cả tham số phụ thuộc thời gian được chốt tại đây**: `received_at_utc`, thời lượng buff, giá trị RNG nếu có — để phát lại cho kết quả y hệt).
2. **Ghi bền RECEIVED** (batch `critical`, ≤ 50 ms): `INSERT OR IGNORE gift_events(gift_key, …, status='RECEIVED', effect_params)`. Nếu bị IGNORE (đã có) → **dừng**, đây là trùng.
3. **Chờ ack**. Chỉ sau ack mới tính hiệu ứng. (Đánh đổi: thêm ≈ 50–100 ms trễ cho quà; trong tiêu chí p95 < 1 s.)
4. **Áp dụng** (luồng chính, tất định từ `effect_params`): cập nhật trạng thái RAM và sinh danh sách op hiệu ứng (ledger điểm, túi đồ, buff, hàng chờ Boss quà, đóng góp Boss) — mỗi op mang `source_key = gift_key`.
5. **Commit hiệu ứng + APPLIED trong CÙNG MỘT transaction**: các op hiệu ứng + `UPDATE gift_events SET status='APPLIED', applied_at_utc=… WHERE gift_key=? AND status IN ('RECEIVED','FAILED')`. Hiệu ứng và trạng thái APPLIED **luôn cùng có hoặc cùng không** trong DB.
6. Ack → phát FX/banner/âm thanh.

## Bảng crash giữa các bước
| Crash tại | Trạng thái DB sau khởi động | Hành động phục hồi | Kết quả |
|---|---|---|---|
| Trước bước 2 commit | Không có dòng | Không làm gì được | Quà **mất** (G3) — ghi nhận rủi ro |
| Sau ack bước 2, trước bước 5 commit | `RECEIVED`, không có hiệu ứng | Replay: tính lại từ `effect_params` → bước 4–5 | Áp dụng đúng 1 lần |
| Trong khi commit bước 5 | SQLite: transaction hoặc đã commit hoặc chưa (WAL) | Như hàng trên nếu chưa; bỏ qua nếu `APPLIED` | Không trùng |
| Sau commit bước 5, trước FX | `APPLIED` | Không replay hiệu ứng | FX có thể không hiện (chấp nhận) |
| RAM đã áp dụng (bước 4) nhưng bước 5 chưa commit | `RECEIVED` | RAM mất theo tiến trình; replay | Không trùng (UNIQUE `source_key` chặn nếu lỡ commit hai lần) |
| Worker chết, batch bước 5 được gửi lại | Có thể đã commit | `UNIQUE(source_key, effect_seq)` + điều kiện `status IN (...)` → op thứ hai không có tác dụng | Không trùng |

## Phục hồi khi khởi động
Sau Worker `ready`: đọc `gift_events WHERE status IN ('RECEIVED','FAILED')` theo `received_at_utc` → replay bước 4–5 **trước** khi thế giới RUNNING (thế giới ở trạng thái RESTORING). Lỗi áp dụng: `FAILED` + `attempts++`; quá `maxGiftAttempts` (mặc định 5) → `DEAD` + cảnh báo Control. Thời gian replay đo và báo cáo (RTO, ADR-0022).

## Hiệu ứng phụ thuộc trạng thái thế giới
Ví dụ Boss quà khi đang có Boss: quà vào hàng chờ Boss (bảng `world_events` status `QUEUED`, `source_key = gift_key`) trong cùng transaction APPLIED → hàng chờ cũng bền và idempotent. Buff có hạn: lưu `expires_at_utc` tính từ `received_at_utc`, nên replay muộn không kéo dài buff sai.

## Kiểm thử bắt buộc (Phase 2–3)
Fault injection: kill tiến trình (macOS: SIGKILL) ngẫu nhiên khi đang tải 200 quà/s; kill Worker giữa batch; gửi lại batch; trùng `msgId`; streak tăng/giảm/không theo thứ tự; thiếu `msgId`. Bất biến kiểm sau mỗi lần: (I1) không `gift_key` nào có hiệu ứng > 1 lần; (I2) mọi `RECEIVED` cuối cùng thành APPLIED/REJECTED/DEAD; (I3) tổng điểm từ quà trong ledger = tổng từ `gift_events APPLIED`. Kết quả ghi TEST_REPORT; chưa có kết quả thì không tuyên bố.

## Phương án đã loại
Áp dụng trước rồi mới ghi journal (crash → mất dấu, có thể áp dụng lại); hai transaction riêng cho hiệu ứng và APPLIED (crash ở giữa → trùng hoặc lệch); tuyên bố exactly-once.
<!-- ===== KẾT THÚC docs/ADR/0018-gift-idempotency-journal.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0019-qua-tai-backpressure-loi-luu-tru.md ===== -->
## ADR — 0019-qua-tai-backpressure-loi-luu-tru.md
_Nguồn: `docs/ADR/0019-qua-tai-backpressure-loi-luu-tru.md`_

# ADR-0019: Bậc quá tải, backpressure, cảnh báo, phục hồi sự kiện & lỗi lưu trữ (R04 + R05)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (yêu cầu R04, R05 của ChatGPT) — chờ duyệt
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
| `persist.unackedAgeWarnMs` / `CritMs` | 2.000 / 10.000 | Cảnh báo / L4 |
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
| L3 Bộ nhớ/ghi | WriteBuffer > softMax; heap > ngưỡng; unacked age > warn | Gom batch lớn hơn; chuyển AFK → COLD sớm hơn; tạm dừng ghi `log` |
| L4 Bảo vệ | WriteBuffer > hardMax; unacked age > crit; Worker lỗi lặp lại; đĩa < `safeFreeBytes` | **PAUSED_PROTECT**: đóng băng FishingScheduler + WorldEventScheduler (không sinh thêm ghi), **vẫn nhận và journal quà**, Control báo đỏ; tự trở về L3 khi xả xong |
| SAFE MODE | DB `SQLITE_CORRUPT`; không mở được DB; Worker không khởi động lại được | Ngừng mọi ghi tiến trình; quà nhận được giữ trong **bộ đệm khẩn cấp RAM có trần** + ghi file append-only phụ `data/emergency-gifts-<ts>.jsonl` nếu ghi được; Control hướng dẫn khôi phục từ backup |
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

## Không tuyên bố
Không tuyên bố "quà không bao giờ mất". Tuyên bố được (sau kiểm thử): quà đã commit `RECEIVED` không bị bỏ và không bị áp dụng hai lần; mọi quà rơi vào đường khẩn cấp hoặc DEAD đều có cảnh báo.

## Kiểm thử
Tải vượt ngưỡng từng bậc (LoadGenerator); giả lập Worker chậm/chết; giả lập ENOSPC/IOERR/BUSY/CORRUPT bằng chế độ fault-injection của PersistenceClient/Worker (chỉ bật trong test); một test đĩa đầy thật trên ổ dung lượng nhỏ (công cụ chỉ dùng trong test, không thuộc build chung; bản Windows ở Windows Validation).
<!-- ===== KẾT THÚC docs/ADR/0019-qua-tai-backpressure-loi-luu-tru.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0020-bao-mat-rest-ws-lan.md ===== -->
## ADR — 0020-bao-mat-rest-ws-lan.md
_Nguồn: `docs/ADR/0020-bao-mat-rest-ws-lan.md`_

# ADR-0020: Bảo mật REST/WebSocket cho mô hình máy phát + LAN (R06)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (yêu cầu R06 của ChatGPT) — chờ duyệt
- **Thay** mô tả cũ trong ARCHITECTURE §5/§7 "trên chính Mac chưa đặt mật khẩu thì vào thẳng" — mô tả đó không an toàn: mọi trang web mở trong trình duyệt của máy phát đều có thể gửi request tới `127.0.0.1` (CSRF, DNS rebinding).

## Mô hình đe doạ
| # | Kẻ tấn công | Đường tấn công |
|---|---|---|
| T1 | Trang web độc hại mở trên máy phát | Gửi POST/WS tới `http://127.0.0.1:<port>` (CSRF); DNS rebinding đổi tên miền sang 127.0.0.1 |
| T2 | Thiết bị khác cùng Wi-Fi/LAN | Truy cập trực tiếp cổng khi bật chế độ điện thoại; dò mật khẩu |
| T3 | Nghe lén LAN (HTTP thuần) | Bắt cookie/mật khẩu khi đăng nhập từ điện thoại |
| T4 | Gói cập nhật giả mạo | Zip chứa mã độc / path traversal / zip bomb |
| T5 | Dữ liệu từ TikTok (tên, comment) | XSS khi hiển thị ở stage/control |

## Quyết định
1. **Bind:** mặc định `127.0.0.1`. Chế độ điện thoại (launcher riêng) bind **địa chỉ LAN đã chọn** (không mặc định `0.0.0.0` trừ khi người dùng chọn), và **không khởi động** nếu chưa đặt mật khẩu Admin (tối thiểu 10 ký tự).
2. **Vai trò:** `stage` (chỉ đọc, không có dữ liệu bí mật) và `admin` (Control). Không có vai trò nào khác.
3. **Xác thực admin — áp dụng cả trên localhost:**
   - **Ghép đôi máy phát:** launcher mở `/control#pair=<mã một lần>` (mã ngẫu nhiên 128 bit, hết hạn 2 phút, dùng 1 lần; nằm sau `#` nên không gửi lên server trong request ban đầu và không vào log). Trang gửi mã qua `POST /api/admin/pair` → nhận phiên.
   - **Điện thoại:** đăng nhập bằng mật khẩu Admin, **hoặc** quét QR ghép đôi hiển thị trên Control của máy phát (mã một lần, không cần gõ mật khẩu).
   - **Phiên:** token ngẫu nhiên 256 bit trong cookie `HttpOnly; SameSite=Strict; Path=/`; server chỉ lưu hash; hết hạn khi không hoạt động 12 giờ (cấu hình); có nút "Đăng xuất mọi thiết bị". Restart server → phiên mất, ghép đôi lại.
   - **Mật khẩu Admin:** lấy từ biến môi trường do người dùng tự đặt (không đọc/ghi hộ), server chỉ giữ hash scrypt trong RAM; không log; giới hạn đăng nhập 5 lần/phút/IP + khoá tạm tăng dần.
4. **CSRF:** mọi request thay đổi trạng thái (POST/PUT/DELETE) phải có header `X-Nova-CSRF` khớp token CSRF của phiên (trang Control lấy qua `GET /api/admin/session`) **và** `Origin` khớp đúng origin của server. Không bật CORS (không gửi `Access-Control-Allow-Origin`).
5. **Chống DNS rebinding:** kiểm tra header `Host` thuộc danh sách cho phép (`127.0.0.1:<port>`, `localhost:<port>`, `<IP LAN đã chọn>:<port>`); sai → 421.
6. **WebSocket:**
   - Upgrade kiểm `Host` (như trên) và `Origin`.
   - `role=admin`: bắt buộc cookie phiên hợp lệ + Origin cùng origin.
   - `role=stage`: chỉ đọc; Browser Source của OBS/LIVE Studio có thể gửi Origin rỗng/`null` → **cho phép từ localhost**; từ LAN cần `viewKey` (`/stage?k=…`, tạo trong Control, đổi được).
   - Mọi message: schema hợp lệ, kích thước ≤ 16 KB, giới hạn tần suất theo kết nối; stage gửi lên server chỉ `viewport`/`metrics`.
7. **Thao tác nguy hiểm** (kết thúc LIVE, buổi LIVE mới, đóng buổi RECOVERING, reset, khôi phục DB, xoá hồ sơ, xoá dữ liệu DEMO, cập nhật bản, xuất dữ liệu): bắt buộc (a) xác nhận bằng chuỗi gõ tay (vd `XAC NHAN`), (b) phiên đã xác thực lại trong 5 phút gần nhất (mật khẩu hoặc ghép đôi), (c) ghi `admin_audit` (ai/thiết bị, IP, thao tác, thời điểm UTC, kết quả) — không ghi token.
8. **Header HTTP:** CSP chặt (`default-src 'self'`, không script inline, `connect-src 'self' ws:` đúng host), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` cho /control.
9. **XSS (T5):** tên/comment TikTok chỉ hiển thị qua `textContent`/texture canvas, không `innerHTML`; giới hạn độ dài, lọc ký tự điều khiển.
10. **Cập nhật bản (T4):** chỉ nhận gói **có chữ ký** bằng khoá công khai NOVA nhúng trong bản bán (khoá bí mật không bao giờ nằm trong gói); kiểm path traversal, giới hạn kích thước giải nén, số file; backup DB tự động trước khi áp dụng.
11. **HTTP thuần trên LAN (T3) — rủi ro còn lại:** không có TLS ở V1 (chứng chỉ tự ký gây cảnh báo trên điện thoại). Giảm thiểu: khuyến nghị chỉ bật chế độ điện thoại trên mạng tin cậy; ưu tiên ghép đôi QR thay vì gõ mật khẩu; tự tắt chế độ LAN khi không có phiên điện thoại trong N phút (cấu hình). Ghi rõ trong INSTALL_* và Matrix.

## Phương án đã loại
Không xác thực trên localhost; token trong URL query (lọt log/lịch sử); CORS mở; bind 0.0.0.0 mặc định; TLS tự ký bắt buộc ở V1.

## Kiểm thử
Request từ origin lạ (CSRF) bị chặn; Host lạ (rebinding) bị 421; WS admin không cookie bị từ chối; stage từ LAN không viewKey bị từ chối; brute-force đăng nhập bị khoá; thao tác nguy hiểm thiếu xác nhận/xác thực lại bị từ chối; zip không chữ ký / path traversal bị từ chối; tên chứa `<script>` hiển thị dạng chữ.
<!-- ===== KẾT THÚC docs/ADR/0020-bao-mat-rest-ws-lan.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0021-dinh-danh-nguoi-choi-live-demo.md ===== -->
## ADR — 0021-dinh-danh-nguoi-choi-live-demo.md
_Nguồn: `docs/ADR/0021-dinh-danh-nguoi-choi-live-demo.md`_

# ADR-0021: Định danh người chơi LIVE/DEMO, khoá chính, unique index, migration (R07)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (yêu cầu R07 của ChatGPT) — chờ duyệt

## Bối cảnh
TikTok cung cấp cho mỗi người xem: `userId` (chuỗi số, **ổn định**), `uniqueId` (@handle, **người dùng đổi được**), `nickname` (tên hiển thị, đổi tự do). Chế độ DEMO/Mock/LoadGenerator sinh người chơi giả. Yêu cầu: dữ liệu DEMO **không bao giờ** ghi đè hoặc trộn vào hồ sơ LIVE.

## Quyết định
1. **Tách vật lý theo realm:** hai file DB riêng trong thư mục dữ liệu: `nova-live.db` và `nova-demo.db`. PersistenceWorker mở đúng một file theo chế độ đang chạy; chuyển LIVE ↔ DEMO = đóng file này, mở file kia (tắt an toàn trước). BXH, ledger, journal quà, buổi LIVE… của DEMO nằm hoàn toàn trong `nova-demo.db`. Xoá dữ liệu DEMO = xoá/tạo lại `nova-demo.db` (thao tác nguy hiểm, ADR-0020), không chạm `nova-live.db`.
2. **Realm do nguồn quyết định, không do nội dung sự kiện:** Ingest gắn realm theo **loại connector** (`LiveConnector` → `live`; `MockConnector`/`LoadGenerator` → `demo`). Mock/LoadGenerator **không thể** chạy khi kết nối DB LIVE đang mở (kiểm ở WorldCore + Worker — phòng thủ hai lớp).
3. **Khoá người chơi (phòng thủ thêm, kể cả trong cùng file):**
   - `player_key TEXT PRIMARY KEY` = `"tt:" + userId` (LIVE) hoặc `"demo:" + id sinh ra` (DEMO).
   - `realm TEXT NOT NULL CHECK (realm IN ('live','demo'))`, `external_id TEXT NOT NULL`, `UNIQUE (realm, external_id)`.
   - Ràng buộc nhất quán: `CHECK ((realm='live' AND player_key LIKE 'tt:%') OR (realm='demo' AND player_key LIKE 'demo:%'))`.
   - Worker từ chối ghi dòng có realm khác realm của file đang mở (`nova-live.db` chỉ nhận `live`).
4. **Thuộc tính hiển thị** (`unique_id`, `nickname`, `avatar_url`) là cột thường, cập nhật mỗi khi thấy giá trị mới; **không** dùng làm khoá. Không hỗ trợ gộp tài khoản.
5. **Sự kiện thiếu `userId`:** không tạo/cập nhật hồ sơ; quà vẫn được journal (`player_key = NULL`, status `REJECTED`, lý do `NO_USER_ID`) để không mất dấu; cảnh báo nếu tỉ lệ cao.
6. **Bảng phụ thuộc** (`player_presence`, `player_equipment`, `player_inventory`, `fishdex`, `player_achievements`, `catches`, `score_ledger`, `leaderboard_scores`, `world_event_contrib`, `gift_events.player_key`) dùng `player_key` làm khoá ngoại (`FOREIGN KEY … REFERENCES players(player_key)`), `foreign_keys=ON`.
7. **Migration:** bảng `schema_migrations(version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at_utc INTEGER)`; file `src/data/migrations/NNN_ten.sql` đánh số tăng dần, mỗi migration chạy trong một transaction; checksum sai → dừng, SAFE MODE (không tự sửa). **Backup tự động trước mỗi migration** (ADR-0022). V1 bắt đầu từ `001_init` (chưa có dữ liệu thật nên không có chuyển đổi dữ liệu). Cả hai file DB dùng chung bộ migration.

## Phương án đã loại
Dùng `uniqueId` làm khoá (đổi được → mất hồ sơ); một DB chung với cờ `is_demo` (một lỗi truy vấn là trộn BXH); tiền tố trong cùng bảng mà không tách file.

## Kiểm thử
DEMO không ghi được vào `nova-live.db` (kể cả khi cố gửi op realm `live` từ Mock); hai người cùng `nickname` khác `userId` là hai hồ sơ; đổi `uniqueId` vẫn giữ hồ sơ; migration lỗi giữa chừng rollback; checksum migration sai → SAFE MODE.
<!-- ===== KẾT THÚC docs/ADR/0021-dinh-danh-nguoi-choi-live-demo.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0022-do-ben-du-lieu-rpo-rto.md ===== -->
## ADR — 0022-do-ben-du-lieu-rpo-rto.md
_Nguồn: `docs/ADR/0022-do-ben-du-lieu-rpo-rto.md`_

# ADR-0022: Phân loại dữ liệu, RPO/RTO, giới hạn write-behind, backup & kiểm thử crash recovery (R08)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (yêu cầu R08 của ChatGPT) — chờ duyệt
- Liên quan: ADR-0017 (Worker, `synchronous=FULL`), ADR-0018 (quà), ADR-0019 (lỗi lưu trữ), ADR-0021 (migration).

## Định nghĩa
- **RPO** (mất tối đa): khoảng dữ liệu có thể mất khi tiến trình chết đột ngột hoặc mất điện, tính đến commit đã ack gần nhất.
- **RTO** (thời gian phục hồi): từ lúc khởi động lại đến khi thế giới RUNNING lại (không tính thời gian người dùng mở máy).
- Tất cả số dưới đây là **mục tiêu thiết kế**; số đo thực tế ghi vào TEST_REPORT ở Phase 2/3/8. Chưa đo thì không tuyên bố.

## Phân loại dữ liệu
| Nhóm | Dữ liệu | Có tái tạo được? | RPO mục tiêu | RTO mục tiêu | Chiến lược |
|---|---|---|---|---|---|
| C1 Quà (quan trọng nhất) | `gift_events` journal; hiệu ứng từ quà (ledger nguồn quà, túi đồ từ quà, buff, hàng chờ Boss quà) | Không (TikTok không phát lại) | **0** với quà đã ack `RECEIVED`; quà chưa commit: ≈ thời gian chờ + 50 ms → **có thể mất** (ADR-0018 G3) | ≤ 60 s (gồm replay journal) | Group commit 50 ms, `synchronous=FULL`, hiệu ứng + APPLIED cùng transaction, replay khi khởi động |
| C2 Tiến trình | `score_ledger`, `catches`, `players` (xp, level, total_score, total_weight_g), trang bị, túi đồ, `fishdex`, thành tích, `leaderboard_scores` | Một phần (BXH tính lại từ ledger; ledger thì không) | ≤ chu kỳ flush (500 ms mặc định) + batch đang bay; **không phải bảo đảm** — xem "Giới hạn write-behind" | ≤ 60 s | Batch `progress`; mọi ghi của một cú câu trong một transaction; thành tích mở khoá idempotent theo khoá |
| C3 Trạng thái thế giới | `world_state`, `live_sessions`, `player_presence`, trạng thái Boss | Một phần | ≤ 5 s | ≤ 60 s, thế giới khôi phục ở PAUSED/RESTORING | Snapshot `state` 5 s + khi đổi trạng thái quan trọng |
| C4 Dữ liệu dẫn xuất | Cấu trúc BXH trong RAM, bucket 60 phút, chỉ mục không gian, vùng quan tâm, metrics | **Có** | Không áp dụng | Dựng lại khi khởi động (tính vào RTO) | Không lưu, hoặc lưu snapshot chỉ để tham khảo (snapshot lịch sử BXH là C2) |
| C5 Nhật ký | `event_logs`, `comment_logs`, log file | Không cần | Best effort | — | Bỏ đầu tiên khi áp lực (ADR-0019) |
| C6 Cấu hình | `settings`, `gift_rules`, lịch Boss, `admin_audit` | Không | 0 (ghi đồng bộ, ack sau commit mới báo thành công ở Control) | ≤ 60 s | Commit ngay khi Admin lưu |

## Giới hạn write-behind 500 ms (làm rõ)
- 500 ms là **chu kỳ gom batch**, **không** phải cam kết "mất tối đa 500 ms".
- RPO thực = tuổi của thay đổi cũ nhất chưa ack (`persist.unackedAgeMs`), có thể lớn hơn 500 ms khi đĩa chậm/Worker lag. Chỉ số này được đo liên tục, hiện ở Control; vượt 2 s → cảnh báo `PERSIST_LAG`; vượt 10 s → L4 PAUSED_PROTECT (ngừng sinh thêm thay đổi).
- Với `synchronous=FULL`, commit đã ack được SQLite bảo đảm bền khi mất điện **trong giới hạn phần cứng/hệ điều hành** (ổ đĩa có cache ghi nói dối fsync thì không bảo đảm được — rủi ro ngoài kiểm soát, ghi nhận).

## Backup & khôi phục
- `VACUUM INTO` (chạy trong Worker, không chặn luồng chính) tạo bản sao nhất quán: khi kết thúc LIVE, mỗi 6 giờ (cấu hình), **trước mỗi migration**, **trước mỗi lần cập nhật bản**. Giữ N bản gần nhất (mặc định 10) + 1 bản/ngày trong 7 ngày; thư mục `data/backups/`.
- Khôi phục: thao tác nguy hiểm trên Control (ADR-0020) → tắt an toàn → thay file → `quick_check` → mở lại. Dữ liệu sau thời điểm backup mất (RPO khi khôi phục = tuổi bản backup). RTO khôi phục mục tiêu ≤ 5 phút.
- Kiểm tra tính toàn vẹn sau khôi phục: tổng ledger khớp `players.total_score`; `leaderboard_scores` tính lại khớp.

## Bất biến kiểm tra sau mọi lần phục hồi (tool `verify-integrity.js`)
I1 không `gift_key` nào có hiệu ứng > 1 lần · I2 không còn `RECEIVED/FAILED` sau RTO (trừ DEAD có cảnh báo) · I3 điểm từ quà trong ledger = tổng theo `gift_events APPLIED` · I4 `players.total_score` = tổng ledger theo người · I5 mọi `leaderboard_scores` (live/day/week/all) = tính lại từ ledger · I6 cửa sổ 60 phút dựng lại = tính trực tiếp từ ledger · I7 không có dòng realm sai file (ADR-0021) · I8 `PRAGMA quick_check` = ok.

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
Kết quả mỗi kịch bản ghi TEST_REPORT + Matrix (mục thoát an toàn). Kịch bản nào chưa chạy được ghi "chưa chứng minh".
<!-- ===== KẾT THÚC docs/ADR/0022-do-ben-du-lieu-rpo-rto.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0005-khong-gioi-han-can-thu.md ===== -->
## ADR — 0005-khong-gioi-han-can-thu.md
_Nguồn: `docs/ADR/0005-khong-gioi-han-can-thu.md`_

# ADR-0005: Số cần thủ không giới hạn; tách gameplay khỏi hiển thị
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.3, theo ADR-0009/0011; 0.0.4 theo quyết định AFK của ChatGPT; 0.0.8 theo R04: bảng giới hạn vận hành + bậc quá tải ở ADR-0019) — Trạng thái: Đề xuất (người dùng quyết định) — **Thay thế** giới hạn "16 ô cần thủ + hàng chờ + thu hồi ô" của ARCHITECTURE 0.0.1
- Bối cảnh: Người dùng yêu cầu mọi người xem comment `câu`/`câu cá` đều có hồ sơ cần thủ, cùng tồn tại trong một buổi LIVE (thế giới liên tục, ADR-0009), không giới hạn cứng.
- Quyết định:
  1. Không có giới hạn số người chơi trong logic, DB, API, giao diện, tài liệu.
  2. Hồ sơ cần thủ (players + session_anglers) độc lập với nhân vật 3D. Server giữ và cập nhật mọi người; client chỉ vẽ chi tiết người trong vùng camera/khu gameplay.
  3. Bỏ "thu hồi ô". **AFK (ChatGPT chốt): 5 phút không có tương tác hợp lệ → tạm dừng tự quăng**; không xoá khỏi game; giữ hồ sơ, điểm, cấp, trang bị, thành tích. Tương tác hợp lệ = comment lệnh hợp lệ hoặc gửi quà; **like đơn lẻ không tính** (chống spam). Sau AFK lâu hơn (ngưỡng vận hành) → tầng COLD: hồ sơ chỉ nằm ở DB để giải phóng RAM, với người chơi vẫn là AFK; đánh thức → khôi phục đầy đủ (ADR-0011).
  4. Chỉ được có **giới hạn vận hành cấu hình được** (tốc độ sự kiện, kích thước hàng đợi, ngân sách render, tần suất WS, cỡ lô DB, số hồ sơ giữ nóng trong RAM). Khi chạm ngưỡng: giảm chất lượng/gộp/trễ, không từ chối người tham gia, không bỏ quà.
  5. Không thay 16 bằng bất kỳ con số cứng nào khác.
- **0.0.8 (R04):** bảng giới hạn vận hành, bậc quá tải L0–L4/SAFE MODE và thứ tự xử lý khi quá tải (giảm render → gộp sự kiện → backpressure → chuyển hồ sơ lạnh → tạm dừng mô phỏng) nằm ở ADR-0019. Không bậc nào xoá người chơi, từ chối tham gia hay chủ động bỏ quà. Không có giới hạn 16, 100, 1.000 hay bất kỳ giới hạn cứng nào trong gameplay.
- Phương án đã loại: N ô cố định + hàng chờ (0.0.1); chỉ người có quà mới được chơi.
- Hệ quả: cần FishingScheduler theo sự kiện (ADR-0002), BXH có thứ tự + phân trang, đường ống sự kiện (ADR-0006), render đám đông (ADR-0007), thiết kế sẵn mở rộng ngang (ADR-0008); năng lực thực tế trên M1 8 GB phải **đo và báo cáo**, không hứa trước.
<!-- ===== KẾT THÚC docs/ADR/0005-khong-gioi-han-can-thu.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0006-duong-ong-su-kien.md ===== -->
## ADR — 0006-duong-ong-su-kien.md
_Nguồn: `docs/ADR/0006-duong-ong-su-kien.md`_

# ADR-0006: Đường ống sự kiện chịu tải (dedupe, rate limit, hàng đợi ưu tiên, journal quà)
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.8 theo R02/R05: làm rõ phạm vi bảo đảm, backpressure — ADR-0018, ADR-0019) — Trạng thái: Đề xuất
- Bối cảnh: LIVE đông có thể có hàng nghìn comment/quà mỗi giây; quà là tiền thật của người xem — mục tiêu: không cộng hai lần và không bỏ sót quà đã ghi bền (phạm vi bảo đảm chính xác ở ADR-0018; **không** tuyên bố exactly-once).
- Quyết định: Ingest → Normalizer → Dedupe (LRU+TTL + `UNIQUE` DB; streak chỉ cộng phần tăng) → RateLimiter token bucket (mỗi người + toàn cục) → GiftJournal (ghi RECEIVED trước) → EventBus → PriorityEventQueue có giới hạn (P0 hệ thống, P1 quà, P2 tham gia, P3 lệnh, P4 like/share gộp) → GameCore xử lý theo lô, ngân sách ms/tick.
- Chính sách tràn: P4 gộp/lấy mẫu có đếm; P3 giảm tần suất; P2 chỉ trễ, không bỏ; P1 (quà) **không bị chủ động bỏ** — quà được ghi `RECEIVED` bền trước khi áp dụng (ADR-0018); quà chưa kịp ghi bền khi tiến trình chết có thể mất (ADR-0018 G3). Backpressure, cảnh báo, lỗi lưu trữ: ADR-0019.
- Lý do: bảo vệ vòng lặp game và FPS; chống spam; đảm bảo toàn vẹn quà kể cả khi restart.
- Phương án đã loại: xử lý đồng bộ từng sự kiện ngay khi nhận; bỏ quà khi quá tải.
- Hệ quả: cần Metrics (độ sâu hàng đợi, sự kiện/s, gộp/bỏ, trễ p95) và LoadGenerator; tiêu chí Phase 2: 1.000 comment/s + 200 quà/s — 0 quà áp dụng hai lần (I1), mọi quà đã `RECEIVED` kết thúc APPLIED/REJECTED/DEAD (I2), đếm và báo cáo số quà nhận từ connector so với số đã ghi `RECEIVED` (ADR-0022).
<!-- ===== KẾT THÚC docs/ADR/0006-duong-ong-su-kien.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0010-leaderboard-5-pham-vi.md ===== -->
## ADR — 0010-leaderboard-5-pham-vi.md
_Nguồn: `docs/ADR/0010-leaderboard-5-pham-vi.md`_

# ADR-0010: BXH 5 phạm vi (LIVE · 60 phút gần nhất · ngày VN · tuần VN · tổng) trên sổ cái điểm bất biến
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4, theo quyết định BXH + múi giờ của ChatGPT; **0.0.8 theo R03**: thiết kế chi tiết cửa sổ 60 phút, tách snapshot lịch sử, số nguyên) — Trạng thái: Quy tắc nghiệp vụ **đã chốt**; cách triển khai chờ ChatGPT duyệt
- Bối cảnh: Thế giới liên tục, điểm cá nhân không reset; cần BXH ngắn hạn và dài hạn cho số người không giới hạn.
- Quy tắc đã chốt: TOP LIVE reset khi bắt đầu buổi LIVE mới · TOP HOUR = 60 phút gần nhất · TOP DAY = ngày Việt Nam (00:00–23:59:59) · TOP WEEK = tuần Việt Nam (thứ Hai–Chủ nhật) · TOP ALL-TIME tích luỹ · **điểm là tiêu chí chính, tổng trọng lượng cá là tiêu chí phụ** · TOP 10/50/100 luân phiên trên màn LIVE · Control xem đầy đủ, phân trang · múi giờ Asia/Ho_Chi_Minh, **lưu UTC trong DB**.
- Quyết định triển khai:
  1. Mọi điểm cộng ghi vào `score_ledger` (chỉ thêm): `ledger_id`, `player_key`, `score` (INTEGER), `weight_g` (INTEGER, gam), `at_utc` (INTEGER ms), `minute_utc` (= floor(at_utc/60000), có chỉ mục), `live_session_id`, `source_key` (UNIQUE với `effect_seq`, ADR-0018) — nguồn gốc duy nhất; mọi BXH tính lại được. Điều chỉnh điểm (nếu Admin thu hồi) là dòng bù âm, không sửa dòng cũ.
  2. **Kỳ cố định** (live, day, week, all): bộ đếm `leaderboard_scores(scope, period_key, player_key, score, weight_g, reached_at_utc)` (khoá người chơi theo ADR-0021), cập nhật trong cùng transaction với ledger. `period_key` tính bằng cách quy đổi `at_utc` sang Asia/Ho_Chi_Minh: `day:YYYY-MM-DD`, `week:YYYY-Www` (ISO, bắt đầu thứ Hai), `live:<id>`, `all`. Hết ngày/tuần không xoá gì; kỳ mới có khoá mới; kỳ cũ chốt snapshot làm lịch sử.
  3. **TOP 60 phút (cửa sổ trượt) — thiết kế chi tiết ở mục "R03" bên dưới.**
  4. Thứ tự: `score DESC, weight_g DESC, reached_at ASC` (tiêu chí thứ ba chỉ để thứ tự luôn xác định).
  5. Kỳ đang chạy giữ cấu trúc có thứ tự trong RAM (TOP N đọc trực tiếp, hạng O(log n)); kỳ đã đóng đọc từ DB qua chỉ mục tương ứng.
  6. API TOP 10/50/100 + phân trang theo hạng + tra hạng cá nhân cho cả 5 phạm vi.
  7. Kết thúc LIVE chỉ chốt TOP LIVE; không chạm ngày/tuần/tổng/60 phút.
## R03 — Cửa sổ trượt 60 phút (0.0.8)
**Định nghĩa chính xác:** tại thời điểm `t`, với `m(t) = floor(t/60000)`, cửa sổ gồm mọi dòng ledger có `minute_utc ∈ [m(t) − 59, m(t)]` — tức **60 bucket phút**, gồm cả phút hiện tại đang chạy. Độ dài thực tế của cửa sổ nằm trong **[59 phút, 60 phút)**; sai số tối đa < 1 phút ở mép cũ. Đây là độ chính xác được công bố (hiển thị "60 phút gần nhất").

**Cấu trúc RAM (HourWindow):**
- `buckets: Map<minute_utc, Map<player_key, {score, weight_g, lastAt}>>` — tối đa 60 bucket đang hiệu lực.
- `totals: Map<player_key, {score, weight_g, lastAt}>` — tổng trong cửa sổ.
- `ranked`: cấu trúc có thứ tự theo khoá `(−score, −weight_g, lastAt, player_key)` (cây/skip-list cân bằng) → TOP N O(N), hạng O(log n), cập nhật O(log n).
- `lastAt` = thời điểm sự kiện **mới nhất** của người đó trong cửa sổ = thời điểm họ đạt tổng hiện tại → dùng cho tiêu chí "ai đạt trước xếp trên".

**Cập nhật:** mỗi điểm mới (sau khi commit thành công — BXH chỉ phản ánh dữ liệu đã bền): cộng vào bucket `minute_utc` của nó và `totals`, định vị lại trong `ranked`. Điểm có `minute_utc < m(t) − 59` (đến muộn) chỉ vào ledger, không vào cửa sổ.

**Trượt:** bộ hẹn giờ theo **đồng hồ đơn điệu** kích hoạt ở mỗi ranh giới phút; xử lý **mọi** bucket có `minute_utc < m(t) − 59` (bắt kịp nếu bộ hẹn giờ trễ hoặc máy ngủ): với mỗi người trong bucket hết hạn → trừ `score`, `weight_g` khỏi `totals`; nếu tổng về 0 → xoá khỏi `ranked`; nếu không → tính lại `lastAt` = max `lastAt` của họ trong các bucket còn lại (giữ thêm chỉ mục `player → các minute có điểm`), định vị lại. Chi phí mỗi phút = O(số người có điểm trong phút hết hạn × log n) — không lặp toàn bộ người chơi.

**Đồng hồ:** bucket theo **giờ UTC thực** (`Date.now()`), lịch trượt theo đồng hồ đơn điệu. Nếu giờ hệ thống bị chỉnh lùi: sự kiện mới gắn vào phút sớm hơn nhưng vẫn trong cửa sổ; nếu chỉnh tiến xa: mọi bucket cũ hết hạn ngay. Ghi log `CLOCK_JUMP` khi lệch > 2 s giữa hai đồng hồ.

**Số liệu chính xác:** `score` và `weight_g` là số nguyên ở mọi tầng (DB, RAM, WS); kg chỉ đổi ra số thập phân khi **hiển thị** (`weight_g / 1000`, làm tròn hiển thị 1–2 chữ số, quy tắc làm tròn cố định). Không dùng float để cộng dồn hay so sánh.

**Dựng lại từ ScoreLedger:** khi khởi động (C4, ADR-0022) và khi `verify-leaderboards.js` chạy: `SELECT player_key, minute_utc, SUM(score), SUM(weight_g), MAX(at_utc) FROM score_ledger WHERE minute_utc >= :m-59 GROUP BY player_key, minute_utc` (qua ReadWorker/Worker, không chặn luồng chính) → nạp lại bucket. Bất biến I6: cửa sổ dựng lại = cửa sổ đang chạy.

**Tách snapshot lịch sử khỏi TOP 60 phút hiện tại:**
- TOP hiện tại: **chỉ** từ HourWindow trong RAM; API `GET /api/leaderboard?scope=hour` — **không có** tham số `period`.
- Lịch sử: bảng riêng `hour_window_snapshots(snapshot_at_utc, window_from_minute, window_to_minute, rank, player_key, score, weight_g)` chụp ở mỗi giờ tròn (TOP 100, cấu hình); API riêng `GET /api/leaderboard/hour-history?at=<giờ tròn UTC>`.
- Giao diện ghi nhãn khác nhau: "TOP 60 PHÚT (đang chạy)" và "TOP 60 phút lúc HH:00 (lịch sử)". Stage chỉ hiển thị bảng đang chạy.
- Snapshot **không bao giờ** được dùng để dựng lại cửa sổ hiện tại.

**Kiểm thử:** cửa sổ trượt qua 60+ phút với dữ liệu tổng hợp so với tính trực tiếp; hoà điểm phân định bằng kg rồi `lastAt`; bộ hẹn giờ trễ 5 phút (bắt kịp); giờ hệ thống chỉnh lùi/tiến; restart giữa chừng dựng lại khớp; điểm đến muộn; 10.000 người có điểm trong cùng một phút (đo chi phí trượt).

- Phương án đã loại: TOP giờ theo giờ tròn (trái quyết định "60 phút gần nhất"); reset bảng điểm theo kỳ (mất dữ liệu); tính BXH bằng truy vấn tổng hợp ledger mỗi lần đọc (chậm khi đông); lưu giờ địa phương trong DB.
- Hệ quả: mỗi lần câu cập nhật 4 bộ đếm kỳ trong DB (cùng transaction với ledger) + 1 bucket phút trong RAM (sau khi commit); `tools/verify-leaderboards.js` đối chiếu với tính lại từ ledger; test qua 00:00 và thứ Hai giờ VN khi máy đặt múi giờ khác; test trượt cửa sổ 60 phút và hoà điểm phân định bằng kg.
<!-- ===== KẾT THÚC docs/ADR/0010-leaderboard-5-pham-vi.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0011-tien-trinh-lau-dai-registry-nong-lanh.md ===== -->
## ADR — 0011-tien-trinh-lau-dai-registry-nong-lanh.md
_Nguồn: `docs/ADR/0011-tien-trinh-lau-dai-registry-nong-lanh.md`_

# ADR-0011: Tiến trình lâu dài & PlayerRegistry nóng/lạnh
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4: thuật ngữ COLD, định nghĩa tương tác hợp lệ) — Trạng thái: Đề xuất
- Bối cảnh: Hồ sơ, điểm, cấp, trang bị, sổ tay cá, thành tích phải lưu lâu dài và khôi phục khi người chơi quay lại; số người tích luỹ qua nhiều buổi LIVE không giới hạn, máy chỉ có 8 GB RAM.
- Quyết định:
  1. Dữ liệu lâu dài trong SQLite: `players` (xp, level, total_score…), `player_equipment`, `player_inventory`, `fishdex`, `player_achievements`, `player_presence`.
  2. PlayerRegistry hai tầng: **nóng** (RAM) cho ACTIVE/AFK gần đây; **lạnh/COLD** (chỉ DB) — đây là tầng lưu trữ, không phải trạng thái gameplay (với người chơi vẫn là AFK). Chuyển nóng → lạnh khi AFK quá ngưỡng vận hành (mặc định 30 phút, cấu hình) hoặc khi kết thúc LIVE; lạnh → nóng khi có tương tác hợp lệ (nạp bất đồng bộ, sự kiện của họ chờ trong hàng đợi đến khi nạp xong).
  3. PresenceTracker: `ACTIVE → AFK` sau 5 phút không có tương tác hợp lệ (tạm dừng tự quăng). Tương tác hợp lệ = comment lệnh hợp lệ hoặc gửi quà; like đơn lẻ không tính (ChatGPT chốt).
  4. Ghi liên tục qua write-behind (không chỉ lúc rời), nên "rời đi" không cần tín hiệu từ TikTok. **0.0.8:** ghi đi qua PersistenceWorker (ADR-0017); hồ sơ chỉ được bỏ khỏi RAM (sang COLD) **sau khi** mọi thay đổi của người đó đã được ack; RPO theo ADR-0022 nhóm C2; khoá người chơi `player_key` theo ADR-0021.
  5. Định nghĩa vật phẩm/thành tích/cấp nạp từ `config/*.json` có version; đổi định nghĩa dùng migration, không làm hỏng dữ liệu cũ.
- Phương án đã loại: giữ mọi hồ sơ trong RAM (tràn bộ nhớ khi tích luỹ); chỉ lưu khi kết thúc LIVE (mất dữ liệu khi sập).
- Hệ quả: test rời → quay lại khôi phục đủ trường; test like không đánh thức; test tràn RAM với số hồ sơ lạnh lớn; mô phỏng cân bằng XP chống lạm phát.
<!-- ===== KẾT THÚC docs/ADR/0011-tien-trinh-lau-dai-registry-nong-lanh.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0012-vong-doi-live-tat-an-toan.md ===== -->
## ADR — 0012-vong-doi-live-tat-an-toan.md
_Nguồn: `docs/ADR/0012-vong-doi-live-tat-an-toan.md`_

# ADR-0012: Vòng đời buổi LIVE (định danh theo sự kiện thật) & tắt game an toàn
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4, theo quyết định định danh LIVE của ChatGPT; 0.0.8: luồng tắt qua PersistenceWorker, làm rõ bảo đảm quà) — Trạng thái: Quy tắc **đã chốt**; triển khai chờ duyệt
- Quy tắc đã chốt: buổi LIVE xác định bằng sự kiện bắt đầu và kết thúc thực tế · mất kết nối tạm thời không tạo buổi mới · có phục hồi khi connector khởi động lại · chỉ reset TOP LIVE khi xác nhận buổi LIVE mới · kết thúc LIVE phải lưu trạng thái và kết quả trước khi đóng game · (luật NOVA) LIVE kết thúc thì tự ngắt, không tự nối lại/poll.
- Quyết định triển khai:
  1. `live_sessions`: room_id (UNIQUE ngoài DEMO), status ACTIVE/RECOVERING/ENDED, end_reason STREAM_END/MANUAL/INFERRED, last_event_at.
  2. **Bắt đầu thực tế** = kết nối thành công vào phòng đang phát có room_id chưa từng gắn buổi nào → buổi mới = xác nhận → chốt TOP LIVE cũ, mở TOP LIVE mới.
  3. **Kết thúc thực tế** = `streamEnd` (STREAM_END) hoặc nút "Kết thúc LIVE" (MANUAL).
  4. **Gián đoạn tạm thời** (rớt mạng, connector/server khởi động lại): buổi ACTIVE → RECOVERING; nối lại cùng room_id → ACTIVE, TOP LIVE giữ nguyên; room_id khác → đóng buổi cũ INFERRED (ended_at = last_event_at) rồi tạo buổi mới; không kết nối được → giữ RECOVERING, không poll, chờ người vận hành.
  5. Không có room_id đáng tin (DEMO/thư viện lỗi) → chỉ tạo buổi mới bằng nút trên Control có `confirm`.
  6. **Luồng kết thúc** (streamEnd, MANUAL, tín hiệu tắt — macOS: SIGINT/SIGTERM/SIGHUP; Windows: SIGINT (Ctrl+C), SIGBREAK, SIGHUP (đóng cửa sổ console, chỉ có vài giây) — nên nút "Thoát an toàn" trên Control là đường chính trên cả hai OS): ngừng nhận → xả hàng đợi (trần 10 s) → giải quyết cú câu dở → mọi người sang COLD → flush DB một giao dịch → chốt TOP LIVE + tổng kết buổi → `STOPPED` → báo "Đã lưu" → mới thoát. Quà đã ghi `RECEIVED` nhưng chưa APPLIED ở lại journal, áp dụng lần sau (ADR-0018). Bước flush = gửi lệnh dừng cho PersistenceWorker và chờ ack (ADR-0017); quá trần thời gian (Windows đóng console chỉ cho vài giây) thì phần chưa ack thuộc RPO ở ADR-0022. SIGINT/SIGTERM khi LIVE vẫn phát → lưu an toàn nhưng buổi để RECOVERING (không phải kết thúc thực tế).
  7. Giả định cần kiểm chứng ở Phase 2: room_id giữ nguyên qua các lần nối lại trong cùng một lần phát và đổi khi phát lần mới. Nếu sai → dùng nút xác nhận trên Control làm đường chính, ghi sổ bài học.
- Phương án đã loại: reset TOP LIVE mỗi lần kết nối; reset theo giờ cố định; tự đồng ý buổi mới sau 30 s (bản 0.0.3).
- Hệ quả: `src/shutdown.js` có từ Phase 1; test giả lập streamEnd, rớt mạng, restart connector, restart server, Ctrl+C, kill giữa chừng; Control hiển thị trạng thái buổi và trạng thái lưu.
<!-- ===== KẾT THÚC docs/ADR/0012-vong-doi-live-tat-an-toan.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0013-he-thong-boss.md ===== -->
## ADR — 0013-he-thong-boss.md
_Nguồn: `docs/ADR/0013-he-thong-boss.md`_

# ADR-0013: Hệ thống Boss — lịch 30 phút, Boss quà, cảnh báo, chống chồng chéo, điều chỉnh tải
- Ngày: 2026-11-24 — Trạng thái: Quy tắc **đã chốt** (ChatGPT); triển khai chờ duyệt; số liệu HP/phần thưởng chốt sau mô phỏng Phase 4
- Quy tắc đã chốt: mặc định 30 phút/lần · cấu hình trong Admin Dashboard · Boss đặc biệt triệu hồi bằng quà hợp lệ · có cảnh báo trước khi xuất hiện · không chồng chéo ngoài cấu hình · điều chỉnh theo lượng người chơi và trạng thái server.
- Quyết định triển khai (WorldEventScheduler + BossFight):
  1. Máy trạng thái Boss: `SCHEDULED/QUEUED → WARNING (đếm ngược, mặc định 60 s) → ACTIVE → DEFEATED | ESCAPED → COOLDOWN`.
  2. Boss lịch: hẹn theo chu kỳ cấu hình (mặc định 30 phút) tính từ lần Boss lịch trước; nếu đến hạn mà đang có Boss → hoãn đến khi xong + khoảng nghỉ tối thiểu (cấu hình).
  3. Boss quà: quà nằm trong bảng quà → hành động "triệu hồi Boss" (qua GiftJournal; mục hàng chờ `world_events QUEUED` ghi **trong cùng transaction** với `APPLIED` — ADR-0018) → vào hàng chờ Boss có thứ tự, bền qua restart; được xử lý khi còn chỗ theo `maxConcurrentBosses` (mặc định 1).
  4. Co giãn: HP, thời lượng, phần thưởng = f(số người ACTIVE lúc bắt đầu WARNING); 0 người ACTIVE → hoãn Boss lịch.
  5. Bảo vệ server: Metrics (tick p95, độ sâu hàng đợi, FPS stage báo về) vượt ngưỡng → hoãn chuyển sang WARNING và/hoặc giảm hiệu ứng; không huỷ Boss quà.
  6. Sát thương từ cá câu được/quà của người ACTIVE; phần thưởng theo `world_event_contrib`.
  7. Lưu `world_events` (UTC) để khôi phục: restart giữa Boss → tiếp tục từ trạng thái đã lưu (thời gian dịch theo thời gian dừng).
- Phương án đã loại: Boss theo giờ tròn cố định; cho phép nhiều Boss tự do; huỷ Boss quà khi bận (mất quà của người xem).
- Hệ quả: test chồng lịch + nhiều Boss quà, quá tải giả lập, restart giữa Boss; cấu hình trong Control (chu kỳ, cảnh báo, số Boss đồng thời, khoảng nghỉ, hệ số).
<!-- ===== KẾT THÚC docs/ADR/0013-he-thong-boss.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0016-khong-phu-thuoc-native.md ===== -->
## ADR — 0016-khong-phu-thuoc-native.md
_Nguồn: `docs/ADR/0016-khong-phu-thuoc-native.md`_

# ADR-0016: Không dùng phụ thuộc native — `node:sqlite` thay `better-sqlite3`
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (hệ quả kỹ thuật của ADR-0015) — chờ ChatGPT duyệt
- Bối cảnh: V1 phải chạy trên macOS và Windows từ một codebase; người dùng cuối không phải gõ lệnh (GAME_DEVELOPMENT). `better-sqlite3` là module native: cần bản dựng riêng theo OS/arch/phiên bản Node, dễ lỗi khi cài trên máy khách, không cho phép một gói dùng chung.
- Quyết định:
  1. DB dùng **`node:sqlite`** (tích hợp trong Node, đồng bộ, WAL) qua repository interface sẵn có. Đã thử trên máy dev: Node 26.13 nạp `node:sqlite` không cần cờ.
  2. Yêu cầu **Node ≥ 22.13 LTS** (`engines`); test trên Node LTS được chốt (đề xuất Node 22 LTS + Node 24 LTS) ở cả hai OS.
  3. Quy tắc phụ thuộc V1: chỉ thư viện JavaScript thuần (`express`, `ws`, `tiktok-live-connector`, `three` tự host…); thêm phụ thuộc native nào cũng phải có ADR.
  4. Cách phân phối Node cho người dùng cuối (cài sẵn hay đóng kèm runtime theo OS) chốt ở mục A13 — không ảnh hưởng mã nguồn.
- Phương án đã loại: `better-sqlite3` (native); file JSON (không đủ cho tiến trình lâu dài và chống trùng quà); DB server (Postgres) cho bản 1.
- Rủi ro: `node:sqlite` mới hơn `better-sqlite3` → kiểm hiệu năng ghi theo lô ở Phase 3 trên cả hai OS; giữ repository interface để đổi nếu cần (cần ADR mới).
- **0.0.8 (R01):** `DatabaseSync` là API đồng bộ → **không bao giờ gọi trên luồng chính**; đánh giá rủi ro D1–D7 và thiết kế PersistenceWorker ở ADR-0017. Công nghệ DB **không đổi**.
- Hệ quả: ARCHITECTURE §2 cập nhật; tiêu chí Phase 1 gồm `npm test` với `node:sqlite` trên cả hai OS.
<!-- ===== KẾT THÚC docs/ADR/0016-khong-phu-thuoc-native.md ===== -->

---
## 4. Các ADR không đổi ở 0.0.8

---
<!-- ===== BẮT ĐẦU docs/ADR/0001-threejs-trinh-duyet.md ===== -->
## ADR — 0001-threejs-trinh-duyet.md
_Nguồn: `docs/ADR/0001-threejs-trinh-duyet.md`_

# ADR-0001: Dùng Three.js trên trình duyệt cho đồ hoạ 3D
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (người dùng đã chọn, chờ ChatGPT duyệt)
- Bối cảnh: Cần game 3D chạy trong TikTok LIVE Studio trên Apple M1 RAM 8 GB, cùng stack Node của 6 game LIVE trước.
- Quyết định: Three.js (ghim bản, tự host trong `public/vendor/`), ES modules + import map, không bundler ở bản đầu.
- Lý do: nhẹ; nhúng được làm Browser Source; không phải cài engine; Control điện thoại dễ làm; tái dùng hạ tầng WebSocket.
- Phương án đã loại: Babylon.js (nặng hơn), Godot 4 (phải cài, nhúng LIVE Studio phải quay cửa sổ), Unity (nặng, cần giấy phép).
- Hệ quả: đồ hoạ low-poly có giới hạn; phải tự viết shader nước và tối ưu thủ công; phụ thuộc mức hỗ trợ WebGL2 của LIVE Studio (kiểm ở Phase 1).
<!-- ===== KẾT THÚC docs/ADR/0001-threejs-trinh-duyet.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0002-server-headless-nguon-su-that.md ===== -->
## ADR — 0002-server-headless-nguon-su-that.md
_Nguồn: `docs/ADR/0002-server-headless-nguon-su-that.md`_

# ADR-0002: Server Node headless là nguồn sự thật, client 3D chỉ hiển thị vùng quan tâm
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.2, theo ADR-0005) — Trạng thái: Đề xuất
- Bối cảnh: Kết quả câu cá gắn với quà TikTok; số cần thủ không giới hạn; cần chống trùng, khôi phục sau restart, test tự động.
- Quyết định: GameCore chạy trên server, giữ **mọi** người chơi (PlayerRegistry), tiến trình câu theo lịch hẹn giờ (FishingScheduler min-heap), RNG có seed, lưu SQLite theo lô. WebSocket chỉ gửi cho /stage **vùng quan tâm** (camera + spotlight) và số liệu gộp; /stage chỉ diễn hoạt.
- Lý do: test được không cần trình duyệt; chi phí theo số sự kiện chứ không theo số người; nhiều màn hình cùng một trạng thái; công bằng dù người chơi có lên hình hay không.
- Phương án đã loại: logic trong trình duyệt; vòng lặp duyệt mọi người chơi mỗi tick; phát toàn bộ trạng thái qua WS.
- Hệ quả: cần InterestManager, giao thức WS rõ (`src/shared/protocol.js`); mô phỏng cân bằng ở mức 10/1.000/10.000 người.
<!-- ===== KẾT THÚC docs/ADR/0002-server-headless-nguon-su-that.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0003-adapter-tiktok.md ===== -->
## ADR — 0003-adapter-tiktok.md
_Nguồn: `docs/ADR/0003-adapter-tiktok.md`_

# ADR-0003: Adapter TikTok tách biệt, phía sau là tầng Ingest
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.2, theo ADR-0006) — Trạng thái: Đề xuất — **chờ người dùng cho phép tái dùng code từ dự án cũ**
- Bối cảnh: `tiktok-live-connector` không chính thức, có thể hỏng. `~/Downloads/glass-bridge-live/src/modules/TikTokConnector.js` đã có: streamEnd → ngắt không nối lại; rớt mạng → nối lại có giới hạn; chống trùng msgId; Mock.
- Quyết định: `src/ingest/LiveConnector.js` là adapter duy nhất chạm thư viện, chỉ chuẩn hoá và phát sự kiện. Dedupe, RateLimiter, GiftJournal, hàng đợi nằm ở tầng Ingest/Bus (ADR-0006), không nằm trong adapter. Ghim `tiktok-live-connector@2.5.0`.
- Lý do: thay thư viện (vd `@tiktool/live`) không phải sửa game; MockConnector/LoadGenerator đi cùng đường ống nên test tải sát thực tế.
- Phương án đã loại: gọi thư viện trực tiếp trong GameCore.
- Hệ quả: test riêng cho adapter (trùng, streak, rớt mạng, streamEnd) và cho đường ống (tải). Theo ADR-0014: chỉ cài một thư viện TikTok; `@tiktool/live` chỉ là phương án ghi nhận, không cài, không viết adapter thứ hai.
<!-- ===== KẾT THÚC docs/ADR/0003-adapter-tiktok.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0004-khung-doc-1080x1920.md ===== -->
## ADR — 0004-khung-doc-1080x1920.md
_Nguồn: `docs/ADR/0004-khung-doc-1080x1920.md`_

# ADR-0004: Khung hình dọc 1080×1920 cho phát TikTok LIVE
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.6: áp dụng cho cả OBS và TikTok LIVE Studio trên macOS + Windows, ADR-0015) — Trạng thái: Đề xuất (người dùng đã chọn)
- Bối cảnh: Người xem TikTok chủ yếu trên điện thoại; người dùng phát bằng TikTok LIVE Studio (đã cài).
- Quyết định: /stage thiết kế cho 1080×1920, camera dọc cố định; chừa 1/3 dưới và mép phải cho bình luận/nút TikTok.
- Phương án đã loại: 16:9 ngang ở bản đầu (có thể thêm sau; nếu thêm thì mọi thay đổi phải áp dụng cả hai khung).
- Thiết lập phát: OBS canvas/output 1080×1920 + Browser Source 1080×1920; TikTok LIVE Studio chế độ dọc (kiểm từng OS).
- Hệ quả: bố cục bờ hồ, BXH, banner thiết kế theo chiều dọc; render scale có thể < 1 để giữ 30 FPS.
<!-- ===== KẾT THÚC docs/ADR/0004-khung-doc-1080x1920.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0007-render-dam-dong.md ===== -->
## ADR — 0007-render-dam-dong.md
_Nguồn: `docs/ADR/0007-render-dam-dong.md`_

# ADR-0007: Render đám đông — Instanced + LOD + Frustum Culling + Spatial Grid + Object Pool + Spotlight
- Ngày: 2026-11-24 — Trạng thái: Đề xuất
- Bối cảnh: Số cần thủ không giới hạn nhưng GPU M1 7 nhân, RAM 8 GB, chạy kèm LIVE Studio, cần 30 FPS ở 1080×1920.
- Quyết định: LOD0 Hero (model đầy đủ, chỉ người được spotlight) · LOD1 InstancedMesh low-poly + vertex animation · LOD2 impostor instanced · LOD3 chỉ hiệu ứng mật độ đám đông. Culling theo ô SpatialGrid; Object Pool cho actor/cần/cá/FX/nhãn; nhãn tên từ atlas. SpotlightDirector chọn người lên hình (quà, cá hiếm, mới vào, TOP) và luân phiên. Bờ hồ sinh thủ tục mở rộng theo số người.
- Số lượng ở mỗi LOD là **ngân sách render theo preset, tự điều chỉnh theo frame time**, không phải giới hạn gameplay.
- Phương án đã loại: mỗi người một skinned mesh; CSS2D label cho mọi người; vẽ tất cả người chơi.
- Hệ quả: cần model có nhiều cấp LOD (CC0) hoặc tự giảm đa giác; tiêu chí Phase 6 (đánh số theo ARCHITECTURE 0.0.3): 30 FPS với 1.000 và 10.000 người trong thế giới.
<!-- ===== KẾT THÚC docs/ADR/0007-render-dam-dong.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0008-mo-rong-ngang.md ===== -->
## ADR — 0008-mo-rong-ngang.md
_Nguồn: `docs/ADR/0008-mo-rong-ngang.md`_

# ADR-0008: Thiết kế sẵn sàng mở rộng ngang
- Ngày: 2026-11-24 — Trạng thái: Đề xuất
- Bối cảnh: Lượng người chơi có thể tăng cao; người dùng yêu cầu kiến trúc mở rộng ngang được.
- Quyết định: Bản 1 chạy **một tiến trình**, nhưng mọi phụ thuộc đi qua interface: `EventBus` (in-process → Redis Streams/NATS), repository (SQLite → Postgres), `LeaderboardStore` (RAM → Redis sorted set), `WsGateway` tách được. Trạng thái người chơi có `partitionKey = hash(userId) % P` (bản 1: P = 1). Sự kiện toàn hồ phát quảng bá tới mọi shard.
- Lý do: không thêm hạ tầng nặng cho máy M1 khi chưa cần, nhưng không phải viết lại khi cần.
- Giới hạn bản chất: một LIVE chỉ có một nguồn sự kiện → Ingest là đơn tiến trình; phần mở rộng được là mô phỏng, BXH, phát WS.
- Điều kiện kích hoạt: số đo ở Phase 8 cho thấy 1 tiến trình không đủ; thay đổi hạ tầng phải xin phép người dùng.
- Phương án đã loại: microservices ngay từ bản 1 (quá nặng cho máy 8 GB và đóng gói bán).
<!-- ===== KẾT THÚC docs/ADR/0008-mo-rong-ngang.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0009-continuous-live-world.md ===== -->
## ADR — 0009-continuous-live-world.md
_Nguồn: `docs/ADR/0009-continuous-live-world.md`_

# ADR-0009: Continuous Live World — bỏ phiên chơi 10 phút
- Ngày: 2026-11-24 — Trạng thái: **Chốt lối chơi** (ChatGPT chọn phương án B, người dùng chuyển giao); kiến trúc chi tiết chờ ChatGPT kiểm duyệt
- **Thay thế:** máy trạng thái phiên `IDLE → LOBBY → FISHING (5–10 phút) → RESULT → LOBBY` của ARCHITECTURE 0.0.1/0.0.2; bảng `game_sessions`; API `open-lobby/start/end` của phiên.
- Bối cảnh: game LIVE cần giữ người xem lâu, cho tham gia bất cứ lúc nào, và tạo lý do quay lại.
- Quyết định:
  1. Thế giới chạy liên tục suốt buổi LIVE: vòng đời `STOPPED → RUNNING ⇄ PAUSED → STOPPED`, không đếm giờ, không tổng kết định kỳ.
  2. Tham gia bất cứ lúc nào bằng comment `câu` / `câu cá`.
  3. Điểm cá nhân, cấp, trang bị, sổ tay, thành tích không reset theo thời gian.
  4. BXH theo thời gian là cửa sổ tính trên sổ cái điểm (ADR-0010). **Chỉ TOP LIVE được reset**, khi xác nhận buổi LIVE mới (ADR-0012). Kết thúc LIVE không reset hồ sơ/tiến trình; BXH dài hạn lưu độc lập.
  6. Không giới hạn thời gian hoạt động.
  5. Boss và sự kiện thế giới chạy liên tục theo lịch hoặc theo sự kiện LIVE (WorldEventScheduler, ADR-0013).
- Phương án đã loại: A — phiên 10 phút có reset điểm (người vào giữa phiên thiệt; người xem không có lý do quay lại).
- Hệ quả: cần lưu trữ lâu dài (ADR-0011), luồng kết thúc LIVE an toàn (ADR-0012), quản lý bộ nhớ khi chạy hàng giờ; kiểm thử phải mô phỏng thế giới chạy 3 giờ; cân bằng tiến trình chống lạm phát.
<!-- ===== KẾT THÚC docs/ADR/0009-continuous-live-world.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0014-pham-vi-nen-tang-tiktok-live.md ===== -->
## ADR — 0014-pham-vi-nen-tang-tiktok-live.md
_Nguồn: `docs/ADR/0014-pham-vi-nen-tang-tiktok-live.md`_

# ADR-0014: Phạm vi nền tảng — TikTok LIVE (chỉ macOS)
- Ngày: 2026-11-24 — Trạng thái: **ĐÃ BỊ THAY THẾ bởi ADR-0015** (2026-11-24, người dùng chỉnh phạm vi V1 = macOS + Windows). Giữ lại làm lịch sử; không áp dụng.
- Bối cảnh: Quy chuẩn NOVA mới bắt buộc xác định phạm vi nền tảng trước khi phát triển, không tự chọn Full Cross-Platform. Người dùng chọn phạm vi hiện tại: **TikTok LIVE**; không triển khai 5 hệ điều hành.
- Quyết định — trong phạm vi:
  1. Máy phát: **macOS trên Apple Silicon** (máy hiện có: M1, 8 GB, macOS 26), chạy server Node + mở trang /stage.
  2. Phát sóng: **TikTok LIVE Studio** với Browser Source trỏ `http://127.0.0.1:<port>/stage` (khung dọc 1080×1920). Dự phòng trong cùng LIVE Studio: quay cửa sổ Chrome nếu Browser Source không đủ WebGL2/âm thanh.
  3. Vận hành: trang **/control** mở bằng trình duyệt trên Mac và trên điện thoại của người vận hành qua mạng LAN (là một phần của vận hành LIVE theo GAME_DEVELOPMENT.md, không phải ứng dụng mobile).
  4. Nguồn sự kiện: `tiktok-live-connector` (một thư viện duy nhất được cài).
  5. Launcher: chỉ `start.command` / `start-dien-thoai.command` (macOS).
- Ngoài phạm vi (không code, không cài dependency, không kiểm thử): Windows (`.bat`, đường dẫn Windows), Linux, ứng dụng Android/iOS, OBS, web game công khai, Electron/desktop app đóng gói, khung ngang 16:9, thư viện TikTok dự phòng (`@tiktool/live` chỉ được ghi là phương án nếu thư viện chính hỏng, không cài).
- Giữ khả năng mở rộng (bắt buộc theo quy chuẩn):
  - Gameplay headless tách hoàn toàn khỏi giao diện 3D (ADR-0002); backend tách frontend qua HTTP/WS + `protocol.js`.
  - Code server chỉ dùng API Node đa nền tảng (`path`, `os`, `node:sqlite`/`better-sqlite3`), không gọi lệnh/API riêng macOS trong code game; phần riêng macOS chỉ nằm ở launcher.
  - Nguồn sự kiện qua một adapter duy nhất (đã có trong thiết kế, ADR-0003) — không thêm adapter cho nền tảng khác.
  - Interface EventBus/repository giữ ở mức interface + **một** bản triển khai (in-process, SQLite); không viết bản Redis/Postgres khi chưa có quyết định mở rộng (ADR-0008).
- Giới hạn nền tảng ghi nhận: phụ thuộc mức hỗ trợ WebGL2/âm thanh của Browser Source trong LIVE Studio (kiểm Phase 1); phụ thuộc thư viện TikTok không chính thức; bản bán hiện chỉ chạy trên macOS Apple Silicon — **bán cho streamer dùng Windows cần người dùng mở rộng phạm vi** (ADR mới + ChatGPT duyệt).
- Phương án đã loại: Full Cross-Platform; song song Mac + Windows ở bản 1.
- Hệ quả: câu hỏi "có cần bản Windows" được giải quyết (không, trong phạm vi hiện tại); kiểm thử chỉ trên macOS + LIVE Studio + Chrome trên Mac + trình duyệt điện thoại của người vận hành.
<!-- ===== KẾT THÚC docs/ADR/0014-pham-vi-nen-tang-tiktok-live.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0015-pham-vi-v1-macos-windows.md ===== -->
## ADR — 0015-pham-vi-v1-macos-windows.md
_Nguồn: `docs/ADR/0015-pham-vi-v1-macos-windows.md`_

# ADR-0015: Phạm vi V1 — phát TikTok LIVE trên macOS + Windows, một codebase
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.7: thứ tự nghiệm thu) — Trạng thái: **Người dùng quyết định** (PLATFORM SCOPE CORRECTION); kiến trúc triển khai chờ ChatGPT duyệt — **Thay thế ADR-0014**
- Bối cảnh: Người dùng xác nhận V1 phải vận hành và phát TikTok LIVE được trên cả macOS và Windows ngay từ bản đầu; không làm Mac trước rồi để Windows sau.
- Quyết định — trong phạm vi V1:
  1. **Hệ điều hành máy phát:** macOS và Windows. Kiến trúc CPU cụ thể (macOS arm64/x64, Windows x64) chốt theo mục A12 trong PROJECT_STATUS.
  2. **Một codebase chính**, dùng chung: Gameplay Engine (WorldCore), Backend, Database, TikTok Connector, hệ thống Gift, trang /stage, /control.
  3. **Đường phát:** OBS Browser Source — bắt buộc chạy được trên cả hai OS (đường phát độc lập, phải kiểm chứng). TikTok LIVE Studio — kiểm tra tương thích **riêng từng OS**; không mặc định là có/hỗ trợ trên cả hai.
  4. Yêu cầu kỹ thuật chung: WebGL2, âm thanh, WebSocket, khung dọc 1080×1920.
  5. Khác biệt theo OS chỉ ở: launcher (`launchers/macos/*.command`, `launchers/windows/*.bat`), `config/platform/{darwin,win32}.json`, `src/system/platform.js`, `docs/INSTALL_MACOS.md`, `docs/INSTALL_WINDOWS.md`.
  6. Cấm: đường dẫn tuyệt đối máy Mac; lệnh/thư viện chỉ chạy trên macOS trong quy trình build chung; phụ thuộc native biên dịch theo OS (ADR-0016). Build, đóng gói, kiểm thử viết bằng Node; `tools/check-portability.js` kiểm tự động.
  7. **Platform Compatibility Matrix** (`docs/PLATFORM_COMPATIBILITY_MATRIX.md`) ghi kết quả thực tế từng OS × đường phát.
- Ngoài phạm vi V1 (không code, không dependency, không kiểm thử): Linux, Android, iOS, ứng dụng native riêng (Electron, Tauri, Swift, WinUI…).
- Tiêu chí nghiệm thu V1 (người dùng chốt): (1) khởi chạy trên macOS; (2) khởi chạy trên Windows; (3) OBS lấy được hình ảnh game trên cả hai; (4) âm thanh hoạt động; (5) comment và quà TikTok được xử lý; (6) không có lỗi phụ thuộc hệ điều hành; (7) có hướng dẫn cài đặt và vận hành cho cả hai OS.
- Phương án đã loại: chỉ macOS (ADR-0014); Mac trước, Windows sau; hai codebase; Full Cross-Platform.
- **Sửa 0.0.7 (người dùng):** hiện chỉ có máy Mac → macOS phát triển và nghiệm thu trước; code/dependency tương thích Windows x64 từ đầu; Windows CI nếu khả thi; kiểm thử thực tế Windows/OBS/LIVE Studio trên Windows chuyển sang giai đoạn Windows Validation (ARCHITECTURE §8.2) khi có máy; Windows là **nền tảng mục tiêu, chưa nghiệm thu**; không trì hoãn Phase 1/2 vì thiếu máy Windows.
- Hệ quả: test tự động chạy trên macOS mỗi Phase và trên Windows qua CI nếu có; đóng gói tạo 2 gói từ cùng mã nguồn; rủi ro khác biệt CEF/GPU giữa OBS và LIVE Studio, giữa hai OS phải được đo, không giả định.
<!-- ===== KẾT THÚC docs/ADR/0015-pham-vi-v1-macos-windows.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/PROJECT_STATUS.md ===== -->
## 5. PROJECT_STATUS
_Nguồn: `docs/PROJECT_STATUS.md`_

# PROJECT STATUS
Cập nhật: 2026-11-24 — Phiên bản: 0.0.8 (Giai đoạn 1: Analysis + Architecture — tài liệu, chưa có code)
**Trạng thái duyệt:** ChatGPT phê duyệt **có điều kiện** cho Phase 1 ở v0.0.7 kèm 8 yêu cầu bắt buộc R01–R08. Bản 0.0.8 đã sửa theo R01–R08 và **chờ ChatGPT kiểm duyệt**. Chưa viết code game. **Phase 1 chưa bắt đầu.** Claude không tự đánh dấu APPROVED.
Model đang dùng: Opus 5.5 (kiến trúc). **Phạm vi V1: macOS + Windows (ADR-0015). macOS: phát triển và nghiệm thu trước trên máy thật. Windows x64: nền tảng mục tiêu, CHƯA NGHIỆM THU** — tương thích từ thiết kế, CI nếu khả thi, kiểm thử thực tế khi có máy (giai đoạn Windows Validation). Khuyến nghị cho Phase 1: **Sonnet 5.5**.

## Module
| Module | Trạng thái (chưa/đang/xong/lỗi) | Test | Ghi chú |
|---|---|---|---|
| Phân tích yêu cầu & kiến trúc | xong bản sửa 0.0.8 (R01–R08) | — (tài liệu; đã kiểm tính nhất quán ARCHITECTURE/ADR/STATUS bằng quét tự động) | v0.0.7: phê duyệt có điều kiện; **0.0.8 chờ ChatGPT kiểm duyệt — chưa viết code** |
| Phase 1 – Nền tảng (server, config + platform, Logger, Settings, Metrics, tắt an toàn 2 OS, launcher macOS + Windows, test runner, check-portability, thử /stage trong OBS + LIVE Studio trên macOS, Windows CI nếu khả thi; **0.0.8:** khung PersistenceWorker + migration 001, khung bảo mật Host/Origin/CSRF/phiên, OverloadController tối thiểu) | chưa | — | Chờ ChatGPT duyệt 0.0.8. **Không chờ máy Windows** |
| Phase 2 – Ingest & hàng đợi + LiveSessionManager + GiftJournal (ADR-0018) | chưa | — | Tải chuẩn 1.000 comment/s + 200 quà/s; bất biến I1–I2; CR1/CR2 |
| Phase 3 – Thế giới liên tục headless (registry nóng/lạnh, AFK, BXH 5 phạm vi gồm HourWindow, UTC/giờ VN, lưu an toàn, backup, verify-integrity) | chưa | — | Mô phỏng 10/1.000/10.000 người, 3 giờ; CR1–CR6 với số đo RPO/RTO |
| Phase 4 – Tiến trình & sự kiện thế giới (cấp, trang bị, sổ tay, thành tích, Boss 30 phút + Boss quà) | chưa | — | Mô phỏng cân bằng XP/Boss |
| Phase 5 – Cảnh 3D cơ bản | chưa | — | 30 FPS trên M1 kèm phần mềm phát (Windows đo ở Windows Validation) |
| Phase 6 – Đám đông, cá, Boss 3D | chưa | — | 30 FPS với 1.000 và 10.000 người |
| Phase 7 – Overlay, FX, âm thanh & Control | chưa | — | |
| Phase 8 – Ổn định & phát hành | chưa | — | Gói macOS + Windows; nghiệm thu đầy đủ trên macOS; Windows ghi "mục tiêu, chưa nghiệm thu" nếu chưa có máy |
| Windows Validation (§8.2 ARCHITECTURE) | chưa — chờ máy Windows x64 | — | Danh sách kiểm thử = Matrix cột WIN-1; sửa lỗi tương thích, hồi quy cả hai OS |

## Việc đang làm
- Đã sửa kiến trúc theo review R01–R08 (0.0.8); chuẩn bị báo cáo bàn giao + gói kiểm duyệt `docs/CHATGPT_REVIEW_BUNDLE_v0.0.8.md`; chờ ChatGPT kiểm duyệt. (Gói v0.0.7 giữ làm lịch sử.)

## Chuẩn bị Phase 1 (chưa bắt đầu)
Phạm vi (không có logic game):
1. `git init`, nhánh `main`, commit đầu chỉ chứa tài liệu hiện có; `.gitignore` thêm `node_modules/`, `data/`, `dist/`; `.gitattributes` (`*.bat` CRLF, `*.command` LF, `* text=auto`).
2. `package.json` (ESM, `engines: node >=22.13`, script `start`, `test`, `check:portability`), cài và ghim `express@4`, `ws@8` (không phụ thuộc native; `tiktok-live-connector` để Phase 2).
3. `src/app.js`, `src/http.js` (`/api/health`, `/api/metrics`), WebSocket `/ws` rỗng (echo trạng thái).
4. `src/system/Logger.js`, `Settings.js` (đọc `config/default.json` + `config/platform/<os>.json` + `.env`; thư mục dữ liệu tính bằng `path`, không đường dẫn tuyệt đối), `Metrics.js`, `platform.js` (mở trình duyệt, thư mục dữ liệu, tín hiệu tắt theo OS).
5. `src/shutdown.js`: khung luồng tắt an toàn (macOS: SIGINT/SIGTERM/SIGHUP; Windows: SIGINT/SIGBREAK/SIGHUP khi đóng console; gọi các bước đăng ký theo thứ tự, có trần thời gian ngắn) + API `POST /api/world/stop` cho nút "Thoát an toàn".
6. `server.js` launcher Node dùng chung + `launchers/macos/start.command`, `start-dien-thoai.command` và `launchers/windows/start.bat`, `start-dien-thoai.bat` (vỏ mỏng, chỉ gọi `node server.js`; tên file ASCII).
7. `public/stage/` trang thử 1080×1920: WebGL2 (renderer GPU), âm thanh, WebSocket, FPS, font tiếng Việt — tự báo kết quả về /control; `public/control/` khung trống.
7b. **(0.0.8)** `src/data/PersistenceClient.js` + `PersistenceWorker.js` (worker_threads, `node:sqlite` WAL FULL, migration `001_init` với `player_key`, `gift_events.gift_key UNIQUE`, `schema_migrations`), `src/security/` (Host/Origin/CSRF, ghép đôi + phiên, bind theo chế độ), `src/ops/OverloadController.js` + `Alerts.js` tối thiểu. Ghi lại mức stability `node:sqlite` của bản Node LTS chốt.
8. `tests/run-tests.js` với `node:test`: health, metrics, shutdown theo thứ tự, settings, PersistenceWorker (commit/ack, Worker chết → gửi lại batch không trùng, DB tạm), bảo mật (CSRF/Origin/Host/WS admin không phiên bị chặn); `tools/check-portability.js` (đường dẫn tuyệt đối, lệnh riêng OS, phân biệt hoa/thường). Chạy thật trên **macOS**; trên Windows qua CI `windows-latest` nếu A14 được cho phép (`.github/workflows/ci.yml`, ma trận macos-latest + windows-latest).
9. Cập nhật CLAUDE.md dòng "Lệnh build/test", TEST_REPORT, PROJECT_STATUS, PLATFORM_COMPATIBILITY_MATRIX (mục 1–11, 14–16), sổ bài học `docs/LESSONS.md`; bản nháp INSTALL_MACOS / INSTALL_WINDOWS phần chạy thử.
Kiểm thử thủ công cần người dùng (Phase 1): trên **Mac**, thêm Browser Source `http://127.0.0.1:<port>/stage` vào OBS và TikTok LIVE Studio; báo kết quả WebGL2/âm thanh/hình. Kiểm thử thực tế Windows chuyển sang Windows Validation.
Cần trước Phase 1: **chỉ còn** ChatGPT kiểm duyệt bản 0.0.8 (R01–R08) (A1 đã xong). Không cần máy Windows. Nên có trong Phase 1 (không chặn): A14 (repo GitHub cho Windows CI).

## Chặn (cần quyết định/quyền)
**Đã chốt (không hỏi lại):** bỏ phiên chơi (ADR-0009) · AFK 5 phút, chỉ comment lệnh hợp lệ/quà đánh thức, like không tính · BXH LIVE / 60 phút gần nhất / ngày VN / tuần VN / tổng, điểm chính + tổng kg phụ, TOP 10/50/100 luân phiên, Control phân trang · định danh buổi LIVE theo sự kiện thật, mất kết nối không tạo buổi mới, có phục hồi · Asia/Ho_Chi_Minh, lưu UTC · Boss 30 phút, Boss quà, cảnh báo trước, không chồng chéo ngoài cấu hình, điều chỉnh theo người chơi/server · chỉ TOP LIVE được reset · PROJECT_BRIEF đã điền.

### A. Quyết định thực sự chưa xác định
| # | Nội dung | Cần trước | Ảnh hưởng |
|---|---|---|---|
| ~~A1~~ | ~~Bản NOVA áp dụng~~ — **đã giải quyết: NOVA v1.0.3 đã cài** (2026-11-24). Bản 1.0.1 sao lưu ở `~/NOVA_AI_DEVELOPMENT_v1.0.1_backup`; luật Phạm vi nền tảng đã chuyển sang 1.0.3; `.claude/settings.json` dự án theo mẫu 1.0.3; `nova-selftest` 39/39, `nova-check` hợp lệ. Lỗi đóng gói 1.0.3 cần báo ChatGPT: xem `docs/LESSONS.md` L-002 | — | — |
| ~~A2~~ | ~~Có cần bản Windows song song không~~ — **đã giải quyết 0.0.6: CÓ, ngay từ V1** (người dùng chỉnh phạm vi, ADR-0015; thay kết luận "không" của 0.0.5) | — | — |
| A3 | Danh sách **lệnh comment hợp lệ** ngoài `câu`/`câu cá` (đề xuất: `hạng`, `top`, `túi`, `sổ tay`) — quyết định luôn cả cái gì đánh thức AFK | Phase 2 | CommentParser, PresenceTracker |
| A4 | Bảng **quà → hành động**: quà nào triệu hồi Boss đặc biệt, quà buff (mồi/cần/lưới/thời tiết), mốc like toàn phòng có kích hoạt giờ vàng không | Phase 4 | GiftRules, WorldEventScheduler |
| A5 | Có được tái dùng/chép logic `TikTokConnector.js`, `GiftManager` từ `glass-bridge-live` không | Phase 2 | Thời gian làm Phase 2 |
| A6 | Mức tải mục tiêu dùng làm tiêu chí nghiệm thu (đề xuất 10 / 1.000 / 10.000 người, áp lực 50.000; 1.000 comment/s + 200 quà/s) | Phase 2 | Tiêu chí test Phase 2–8 |
| A7 | Bối cảnh/phong cách đồ hoạ (hồ làng quê VN, biển, nhiều bản đồ?) và có skin không | Phase 5 | Asset, ShoreGenerator, phạm vi test đa skin |
| A8 | Có cần TTS đọc tên/quà không | Phase 7 | AudioQueue, phụ thuộc thêm |
| A9 | Hệ bản quyền/kích hoạt: dùng lại hệ license game cũ hay làm mới | Phase 8 | License, đóng gói |
| A10 | Điện thoại dùng mở trang Control là iPhone (Safari) hay Android (Chrome) — để kiểm thử đúng trình duyệt trong phạm vi | Phase 7 | Phạm vi kiểm thử /control |
| ~~A11~~ | ~~Máy Windows để kiểm thử~~ — **đã giải quyết 0.0.7**: hiện chỉ có máy Mac; không chặn Phase 1/2; kiểm thử thực tế Windows chuyển sang Windows Validation khi người dùng có máy | — | — |
| A12 | Kiến trúc CPU: **Windows = x64 (đã chốt 0.0.7)**. Còn mở: macOS chỉ Apple Silicon (arm64) hay cả Intel (x64)? | Phase 8 (gói) | Gói phát hành, kiểm thử |
| A13 | Cách cung cấp Node cho người dùng cuối: yêu cầu tự cài Node LTS (như game cũ?) hay đóng kèm runtime Node theo OS trong gói | Phase 8 (ảnh hưởng hướng dẫn từ Phase 1) | Dung lượng gói, hướng dẫn cài |
| A14 | **Windows CI (người dùng: "thiết lập nếu khả thi")**: khả thi với GitHub Actions `windows-latest` (x64) nhưng cần một repo GitHub riêng tư và cho phép đẩy code lên đó. Người dùng tạo repo (hoặc cho phép Claude tạo bằng `gh`) và đồng ý push? | Phase 1 (không chặn) | Bằng chứng tự động "không lỗi phụ thuộc OS" cho backend/build |
| A15 | Cấu hình Windows tối thiểu công bố cho người mua (đề xuất: Windows 10/11 64-bit, GPU hỗ trợ WebGL2, 8 GB RAM) | Phase 5 | Ngân sách hiệu năng, hướng dẫn |

### B. Diễn giải đã áp dụng (ChatGPT xác nhận khi duyệt; không hỏi lại người dùng)
| # | Diễn giải | Căn cứ |
|---|---|---|
| B1 | Follow, share, member (vào phòng) **không** đánh thức AFK; comment không phải lệnh cũng không | Quyết định chỉ liệt kê "comment lệnh hợp lệ hoặc gửi quà" |
| B2 | "Tương tác hợp lệ" để tính mốc 5 phút AFK dùng cùng định nghĩa với điều kiện đánh thức | Nhất quán với B1 |
| B3 | Tầng COLD (hồ sơ chỉ nằm ở DB sau 30 phút AFK hoặc khi kết thúc LIVE) là cơ chế tiết kiệm RAM, không phải trạng thái gameplay; với người chơi vẫn là AFK | "AFK không bị xoá khỏi game" + giới hạn RAM 8 GB |
| B4 | Thứ tự BXH: điểm ↓, tổng kg ↓, rồi ai đạt trước xếp trên (tiêu chí thứ ba chỉ để thứ tự luôn xác định) | Quyết định chỉ nêu 2 tiêu chí |
| B5 | Lịch sử TOP 60 phút: chụp snapshot mỗi giờ tròn | TOP giờ là cửa sổ trượt nên không có "kỳ" tự nhiên |
| B6 | "Bắt đầu thực tế" = kết nối vào phòng đang phát có `room_id` mới; `room_id` khác khi đang phục hồi → đóng buổi cũ `INFERRED` | "Xác định bằng sự kiện bắt đầu và kết thúc thực tế" |
| B7 | Tắt game (Ctrl+C) khi LIVE vẫn đang phát → lưu an toàn nhưng buổi để `RECOVERING`, không coi là kết thúc LIVE | Chỉ streamEnd/nút Kết thúc mới là kết thúc thực tế |
| B8 | Boss: cảnh báo mặc định 60 s; `maxConcurrentBosses` mặc định 1; Boss lịch tính chu kỳ từ lần Boss lịch trước, gặp Boss khác thì hoãn; 0 người ACTIVE thì hoãn Boss lịch; Boss quà xếp hàng, không bị huỷ | "Không chồng chéo ngoài cấu hình", "điều chỉnh theo người chơi và server" |
| B9 | TOP 50/100 trên màn LIVE hiển thị dạng trang 10 dòng tự lật | Khung dọc 1080×1920, chữ phải đọc được |
| B10 | Trang Control trên trình duyệt điện thoại qua LAN là thành phần vận hành LIVE (không phải app mobile) — vẫn trong phạm vi V1 dù Android/iOS ngoài phạm vi | GAME_DEVELOPMENT yêu cầu Control từ điện thoại; ADR-0015 chỉ loại app native |
| B12 | "Tối ưu cho môi trường phát" áp dụng cho OBS trên cả hai OS; TikTok LIVE Studio được tối ưu trên OS nào kiểm thực tế đạt | ADR-0015 mục 3 |
| B14 | Kết quả Windows CI chỉ chứng minh backend/build/test tự động không lỗi phụ thuộc OS; **không** được tính là nghiệm thu Windows (OBS, LIVE Studio, GPU, âm thanh, launcher bấm đúp) | Quyết định "Windows là nền tảng mục tiêu chưa được nghiệm thu" |
| B13 | Đổi DB sang `node:sqlite` và Node ≥ 22.13 (ADR-0016) là hệ quả kỹ thuật bắt buộc của "một gói chạy cả hai OS, người dùng không gõ lệnh" | ADR-0015 + GAME_DEVELOPMENT |
| B11 | Giữ interface EventBus/repository (một bản triển khai) và một adapter TikTok — coi là tách lớp cho khả năng mở rộng, không phải "adapter không cần thiết" | Policy mục 4 vs mục 3 |
| B15 | **(0.0.8)** Phase 1 thêm khung PersistenceWorker, migration 001 và khung bảo mật (Host/Origin/CSRF/phiên) — vì R01, R06, R07 là nền tảng cho mọi Phase sau | Review R01, R06, R07 |
| B16 | **(0.0.8)** Quà chỉ được áp dụng **sau** khi `RECEIVED` được ack bền → thêm ≈ 50–100 ms trễ, vẫn trong tiêu chí p95 < 1 s | ADR-0018; đổi lấy không áp dụng hai lần |
| B17 | **(0.0.8)** Không có TLS trên LAN ở V1; xác thực cả localhost (bỏ "vào thẳng trên Mac" của bản cũ) | ADR-0020; R06 |
| B18 | **(0.0.8)** DEMO dùng file DB riêng `nova-demo.db` (tách vật lý) thay vì cờ `is_demo` trong một DB | ADR-0021; R07 |
| B19 | **(0.0.8)** TOP 60 phút có độ dài thực [59, 60) phút do bucket theo phút; công bố là "60 phút gần nhất" | ADR-0010; R03 |

### C. Số liệu sẽ chốt sau mô phỏng (đề xuất kèm báo cáo mô phỏng, không cần quyết định bây giờ)
Công thức điểm f(bậc, kg, buff) · đường cong XP/cấp · chỉ số trang bị · tỉ lệ loài cá · HP/thời lượng/phần thưởng Boss theo số người ACTIVE · ngưỡng vận hành mặc định (hàng đợi, token bucket, ngân sách render).

### D. Sự kiện kỹ thuật cần kiểm chứng (không phải quyết định)
| # | Kiểm chứng | Khi nào |
|---|---|---|
| D1 | Browser Source của TikTok LIVE Studio hỗ trợ WebGL2 + âm thanh đến đâu (cần người dùng thao tác trên máy) | Phase 1 |
| D2 | `room_id` giữ nguyên qua các lần nối lại trong cùng một lần phát và đổi khi phát lần mới (cần một buổi LIVE thật) | Phase 2 |
| D3 | Năng lực thực của M1 8 GB (số người, sự kiện/s) — đo, không giả định | Phase 3, 6, 8 |
| D4 | **(0.0.8)** Mức stability `node:sqlite` trên bản Node LTS chốt; hiệu năng ghi batch trong Worker; `fs.statfs` trên Windows | Phase 1 (stability), Phase 3 (hiệu năng), Windows Validation |
| D5 | **(0.0.8)** Tính ổn định của `msgId`, `groupId`, `repeatCount`/`repeatEnd` trong `tiktok-live-connector` 2.5.0 trên LIVE thật | Phase 2 |
| D6 | **(0.0.8)** RPO/RTO thực tế (CR1–CR6); CR7 mất điện thật không tự động hoá được — sẽ ghi "chưa chứng minh" | Phase 2, 3, 8 |

## Checklist PRE_DEVELOPMENT
- [x] Đã đọc CORE_RULES + GAME_DEVELOPMENT (+ CODING, SECURITY, TESTING, UI_UX, WEB)
- [x] Sổ bài học `docs/LESSONS.md` đã tạo (L-001…L-005)
- [x] PROJECT_BRIEF đã điền (0.0.8); điểm chưa rõ còn lại đã liệt kê (mục A)
- [x] Công nghệ đã chốt, có lý do (ARCHITECTURE §2)
- [ ] ARCHITECTURE.md đã duyệt — v0.0.7 phê duyệt có điều kiện; bản sửa 0.0.8 (R01–R08) đang chờ kiểm duyệt
- [ ] Thư mục dự án, git, .gitignore, .env.example — có .gitignore, .env.example; **chưa git init** (bước 1 của Phase 1)
- [ ] Kế hoạch backup trước thay đổi lớn — git tag/branch từ Phase 1; backup DB tự động trước cập nhật bản
- [x] Xác nhận phiên bản đang chạy — dự án mới, không có bản đang chạy
- [x] Đã xác định việc cần xin phép (cài phần mềm ngoài npm, chép code dự án cũ, thay đổi hạ tầng mở rộng ngang)

## Lỗi đã biết
- Chưa có (chưa có code).

## Nhật ký thay đổi (mới nhất trước)
- 0.0.8 — 2026-11-24 — Sửa kiến trúc theo NOVA ARCHITECT REVIEW v0.0.7 (phê duyệt có điều kiện, R01–R08). **Mới:** ADR-0017 PersistenceWorker (R01), ADR-0018 idempotency quà/GiftJournal (R02), ADR-0019 bậc quá tải/backpressure/lỗi lưu trữ (R04, R05), ADR-0020 bảo mật REST/WS/LAN (R06), ADR-0021 định danh LIVE/DEMO (R07), ADR-0022 độ bền RPO/RTO/crash recovery (R08). **Sửa:** ADR-0010 (R03 cửa sổ 60 phút chi tiết), ADR-0005, 0006, 0011, 0012, 0013, 0016. **ARCHITECTURE 0.0.8:** sơ đồ Worker, §1.4, §2, §3 (data/security/ops, tests/crash), §4 (player_key, gift_key, schema_migrations, hour_window_snapshots, admin_audit, 2 file DB), §5 (xác thực, API TOP 60 phút tách lịch sử), §7 viết lại, §8 tiêu chí Phase 1–4, 7, 8, §9, §10 (8 rủi ro mới), Phụ lục B/D, **§11 mới** (tổng hợp R01–R08 + điểm chưa chứng minh). **PROJECT_BRIEF:** gỡ 3 khẳng định quá mức về quà/độ bền. **LESSONS:** L-004 (guard chặn nhầm theo từ khoá trong văn bản), L-005 (khẳng định quá mức). Thêm B15–B19, D4–D6. Sao lưu 0.0.7 ở thư mục tạm của phiên. **Không viết code; Phase 1 chưa bắt đầu.**
- 0.0.7 — 2026-11-24 — Chuyển sang NOVA v1.0.3 (A1): sao lưu 1.0.1 → `~/NOVA_AI_DEVELOPMENT_v1.0.1_backup`, người dùng chạy `install.sh` 1.0.3; chuyển luật Phạm vi nền tảng (+ ý 7: nền tảng chưa có thiết bị ghi "mục tiêu, chưa nghiệm thu") vào CLAUDE.md/CORE_RULES 1.0.3; sửa quyền 2 script `SECURITY_TESTS/interactive`; `.claude/settings.json` dự án theo mẫu 1.0.3 (bản cũ sao lưu ở thư mục tạm của phiên); `nova-version` 1.0.3. Kiểm: `nova-selftest` PASS=39 FAIL=0 (764 ca bảo mật, 0 FAIL); `nova-check` hợp lệ. Tạo `docs/LESSONS.md`.
- 0.0.7 — 2026-11-24 — CẬP NHẬT QUYẾT ĐỊNH WINDOWS (người dùng): giữ mục tiêu macOS + Windows từ V1; chỉ có máy Mac; macOS phát triển và nghiệm thu trước; code/dependency tương thích Windows x64 từ đầu; Windows CI nếu khả thi; kiểm thử thực tế Windows/OBS/LIVE Studio Windows chuyển sang giai đoạn Windows Validation (ARCHITECTURE §8.2); Windows ghi rõ "nền tảng mục tiêu, chưa nghiệm thu"; không trì hoãn Phase 1/2. A11 giải quyết; A12 chốt Windows x64; A14 cập nhật; thêm B14. Người dùng chọn NOVA v1.0.3 (A1) — chờ xác nhận cách chuyển. Cập nhật ARCHITECTURE 0.0.7, ADR-0015, Matrix. Không có code.
- 0.0.6 — 2026-11-24 — PLATFORM SCOPE CORRECTION (người dùng): V1 vận hành và phát TikTok LIVE trên **macOS + Windows** ngay từ bản đầu; một codebase; OBS Browser Source cả hai OS; TikTok LIVE Studio kiểm riêng từng OS; 7 tiêu chí nghiệm thu V1. ADR-0014 bị thay thế bởi ADR-0015; thêm ADR-0016 (`node:sqlite`, không native, Node ≥ 22.13); sửa ADR-0004, 0012; tạo PLATFORM_COMPATIBILITY_MATRIX (chưa có kết quả); cập nhật CLAUDE.md, BRIEF, ARCHITECTURE 0.0.6. A2 → CÓ; thêm A11–A15, B12–B13. Không có code. Bản 0.0.5 sao lưu ở thư mục tạm của phiên.
- 0.0.5 — 2026-11-24 — Áp dụng NOVA PLATFORM SCOPE SELECTION POLICY: thêm vào `~/NOVA_AI_DEVELOPMENT/CLAUDE.md` (luật 10) và `RULES/CORE_RULES.md` (mục "Phạm vi nền tảng"); dự án: phạm vi TikTok LIVE (macOS + LIVE Studio), ADR-0014, cập nhật CLAUDE.md dự án, ARCHITECTURE §0.3, BRIEF, ADR-0003; A2 (Windows) giải quyết = không; thêm A10, B10, B11. Không có code. Bản 0.0.4 sao lưu ở thư mục tạm của phiên.
- 0.0.4 — 2026-11-24 — Áp dụng các quyết định gameplay cuối của ChatGPT: AFK (chỉ lệnh hợp lệ/quà đánh thức, like không tính); BXH (TOP giờ = cửa sổ trượt 60 phút, ngày/tuần theo giờ VN, điểm chính + tổng kg phụ, TOP 10/50/100 luân phiên); định danh buổi LIVE theo sự kiện thật + RECOVERING; Asia/Ho_Chi_Minh, lưu UTC; hệ thống Boss (ADR-0013); chỉ TOP LIVE được reset. Cập nhật ARCHITECTURE, PROJECT_BRIEF, ADR-0005/0009/0010/0011/0012; thêm ADR-0013 và gói kiểm duyệt cho ChatGPT. Thuật ngữ OFFLINE đổi thành tầng lưu trữ COLD. Không có code. Bản 0.0.3 sao lưu ở thư mục tạm của phiên.
- 0.0.3 — 2026-11-24 — Theo quyết định cuối của ChatGPT (phương án B "Continuous Live World"): bỏ phiên chơi 10 phút; thế giới chạy liên tục; tham gia bất cứ lúc nào; không reset điểm cá nhân; AFK 5 phút; OFFLINE + khôi phục hồ sơ; Boss/sự kiện liên tục; BXH LIVE/giờ/ngày/tuần/tổng; tiến trình lâu dài; lưu an toàn khi kết thúc LIVE. Điền PROJECT_BRIEF; viết lại ARCHITECTURE 0.0.3 (8 Phase sắp lại: thêm Phase 4 Tiến trình & sự kiện, gộp Overlay + Control thành Phase 7); sửa ADR-0005; thêm ADR-0009…0012. Không có code. Bản 0.0.2 sao lưu ở thư mục tạm của phiên.
- 0.0.2 — 2026-11-24 — Thêm NOVA MODEL SELECTION POLICY và ghi chú ADR-0005 vào CLAUDE.md dự án (người dùng cho phép).
- 0.0.2 — 2026-11-24 — Theo quyết định người dùng: số cần thủ không giới hạn. Bỏ giới hạn 16 ô/hàng chờ/thu hồi ô; tách gameplay khỏi hiển thị; thêm đường ống sự kiện, BXH phân trang, render LOD, mở rộng ngang. Sửa ADR-0002, 0003; thêm ADR-0005…0008.
- 0.0.1 — 2026-11-24 — Khảo sát môi trường Mac; soạn ARCHITECTURE.md, PROJECT_STATUS.md, PHASE0_ANALYSIS_REPORT.md, ADR 0001–0004. Không có code, không cài đặt gì.
<!-- ===== KẾT THÚC docs/PROJECT_STATUS.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/PROJECT_BRIEF.md ===== -->
## 6. PROJECT_BRIEF
_Nguồn: `docs/PROJECT_BRIEF.md`_

# PROJECT BRIEF
- Tên dự án / loại: **NOVA FISHING LIVE 3D** — game (tương tác TikTok LIVE)
- Phiên bản mục tiêu: 1.0.0 (bản phát hành đầu tiên sau 8 Phase); tài liệu hiện tại 0.0.8
- Mục tiêu & lý do: game câu cá 3D chạy liên tục suốt buổi livestream TikTok, giúp tăng tương tác (comment, like, quà) và giữ người xem quay lại nhờ tiến trình lâu dài; bán cho các streamer như các game LIVE trước của người dùng.
- **Phạm vi V1 (người dùng chốt, ADR-0015): vận hành và phát TikTok LIVE trên macOS và Windows ngay từ bản đầu.** Một codebase dùng chung gameplay, backend, DB, TikTok connector, hệ thống quà. Phát qua **OBS Browser Source trên cả hai OS**; **TikTok LIVE Studio kiểm tương thích thực tế riêng từng OS**. Hỗ trợ WebGL2, âm thanh, WebSocket, dọc 1080×1920. Cấu hình và hướng dẫn cài đặt riêng cho macOS và Windows. Trang Control mở bằng trình duyệt máy phát/điện thoại qua LAN.
  - **Thứ tự nghiệm thu (0.0.7):** hiện chỉ có máy Mac → macOS phát triển và nghiệm thu trước; code/dependency tương thích **Windows x64** từ đầu; Windows CI nếu khả thi; kiểm thử thực tế Windows/OBS/LIVE Studio trên Windows ở giai đoạn **Windows Validation** khi có máy. **Windows = nền tảng mục tiêu, CHƯA NGHIỆM THU**. Thiếu máy Windows không chặn Phase 1/2.
- Người dùng cuối: (1) streamer TikTok vận hành game trên Mac qua TikTok LIVE Studio, điều khiển bằng điện thoại; (2) người xem TikTok tham gia bằng comment/quà.
- Chức năng bắt buộc:
  - **Continuous Live World** (ChatGPT chốt phương án B): game chạy liên tục suốt buổi LIVE, không có phiên chơi 10 phút, không reset điểm cá nhân theo thời gian.
  - Tham gia bất cứ lúc nào bằng comment `câu` / `câu cá`; **không giới hạn cứng số cần thủ**; mỗi người có hồ sơ riêng.
  - Tự động câu: quăng → chờ → cá cắn → giật → kéo lên / sổng; loài cá, kg, độ hiếm do server quyết định.
  - AFK: 5 phút không có tương tác hợp lệ → tạm dừng tự quăng; không xoá khỏi game; giữ hồ sơ, điểm, cấp, trang bị, thành tích. Comment lệnh hợp lệ hoặc gửi quà → tự đánh thức. Like đơn lẻ không đánh thức (chống spam).
  - Rời đi → lưu hồ sơ, điểm, thành tích; quay lại → khôi phục.
  - Boss chạy liên tục: mặc định 30 phút/lần (cấu hình trong Admin), Boss đặc biệt triệu hồi bằng quà hợp lệ, có cảnh báo trước khi xuất hiện, không chồng chéo ngoài cấu hình, tự điều chỉnh theo lượng người chơi và trạng thái server.
  - BXH: TOP LIVE (reset khi bắt đầu buổi LIVE mới), TOP giờ (60 phút gần nhất), TOP ngày (ngày Việt Nam), TOP tuần (thứ Hai–Chủ nhật, giờ Việt Nam), TOP tổng (tích luỹ). Xếp theo điểm; bằng điểm thì tổng trọng lượng cá cao hơn xếp trên. TOP 10/50/100 luân phiên trên màn LIVE; Control xem đầy đủ và phân trang. **Chỉ TOP LIVE được reset**; BXH dài hạn lưu độc lập, không reset khi kết thúc LIVE.
  - Buổi LIVE xác định bằng sự kiện bắt đầu/kết thúc thực tế; mất kết nối tạm thời không tạo buổi mới; có phục hồi khi connector khởi động lại.
  - Múi giờ Asia/Ho_Chi_Minh (UTC+7); timestamp lưu UTC trong DB, quy đổi khi hiển thị.
  - Lưu lâu dài: sổ tay cá, cấp độ, trang bị, thành tích.
  - Kết thúc LIVE: lưu trạng thái và kết quả trước khi đóng game; không reset hồ sơ hoặc tiến trình người chơi; thế giới không giới hạn thời gian hoạt động.
  - Quà/like/follow/share → hiệu ứng gameplay, bảng Quà → Hành động cấu hình được (nhiều quà/hành động, bật/tắt hiển thị).
  - Đồ hoạ 3D Three.js, khung dọc 1080×1920 cho TikTok LIVE Studio; chữ tiếng Việt.
  - Trang Control trên điện thoại (xem trước, kết nối, gán quà, BXH, cài đặt, cập nhật bản); chế độ Demo/Mock để thử không cần LIVE.
  - Xử lý hàng nghìn comment/quà: chống trùng, giới hạn tốc độ, hàng đợi ưu tiên, backpressure; quà được ghi bền trước khi áp dụng và **không áp dụng hai lần**; quà đã ghi bền không bị bỏ sót sau crash. Không tuyên bố exactly-once: quà chưa kịp ghi bền khi tiến trình chết/mất điện có thể mất (ADR-0018, ADR-0022).
- Chức năng mong muốn (sau): TTS đọc tên/quà; nhiều bản đồ/skin; khung ngang 16:9; mở rộng ngang nhiều tiến trình/máy. Mở rộng nền tảng ngoài macOS + Windows chỉ khi người dùng đổi phạm vi (ADR mới).
- Ngoài phạm vi V1: Linux, Android, iOS, ứng dụng native riêng (Electron/Tauri/Swift/WinUI…), web game công khai; quy đổi điểm/vật phẩm ra tiền thật; cờ bạc; tài khoản đăng nhập riêng cho người xem; API TikTok chính thức (không có cho loại game này).
- Ràng buộc: máy dev Apple M1, RAM 8 GB, macOS 26; máy phát của người dùng cuối là macOS hoặc Windows (cấu hình tối thiểu sẽ công bố); một codebase; không đường dẫn tuyệt đối máy Mac, không lệnh/thư viện chỉ chạy trên macOS trong build chung, không phụ thuộc native; Node.js ≥ 22.13 LTS (`node:sqlite`); Three.js; model CC0 low-poly có ghi nguồn; thư viện `tiktok-live-connector` không chính thức; không đưa khoá bí mật vào bản bán.
- **Tiêu chí nghiệm thu V1 (người dùng chốt, có bằng chứng thực tế, ghi PLATFORM_COMPATIBILITY_MATRIX):** (1) game khởi chạy trên macOS; (2) game khởi chạy trên Windows; (3) OBS lấy được hình ảnh game trên cả hai; (4) âm thanh hoạt động; (5) comment và quà TikTok được xử lý; (6) không có lỗi phụ thuộc hệ điều hành; (7) có hướng dẫn cài đặt và vận hành cho cả hai OS. TikTok LIVE Studio: kết quả kiểm từng OS được ghi rõ (không mặc định). Phần Windows của các tiêu chí (2, 3, 4–6, 7) chốt ở giai đoạn Windows Validation; V1 chỉ được tuyên bố "đạt trên Windows" sau giai đoạn đó.
- Tiêu chí hoàn thành bổ sung (đo được, trên từng máy kiểm thử):
  - 30 FPS ở 1080×1920 trên M1 8 GB kèm phần mềm phát (máy Windows: đo ở Windows Validation), với 1.000 và 10.000 người trong thế giới (preset Vừa).
  - Tải 1.000 comment/s + 200 quà/s trong 10 phút: 0 quà áp dụng hai lần; mọi quà đã ghi `RECEIVED` kết thúc APPLIED/REJECTED/DEAD; báo cáo số quà nhận từ connector so với số đã ghi bền; độ trễ quà p95 < 1 s.
  - Tick server p95 < 20 ms ở 10.000 người hoạt động.
  - Chạy liên tục 3 giờ (soak test) không rò bộ nhớ, không lỗi console.
  - Kết thúc LIVE / tắt an toàn (nút Control, Ctrl+C) hoàn tất trong trần thời gian: 100% điểm, cá, thành tích đã được Worker ack trước khi thoát (kiểm bằng test khôi phục). Tắt đột ngột/crash: mất tối đa theo RPO đo được ở ADR-0022 (CR1–CR6), không cam kết 0.
  - BXH 5 phạm vi (gồm cửa sổ trượt 60 phút và tiêu chí phụ tổng kg) đúng khi so với tính lại từ dữ liệu gốc; chuyển ngày/tuần đúng giờ Việt Nam.
  - Like không đánh thức AFK; comment lệnh/quà đánh thức (test tự động).
  - Mất kết nối / khởi động lại connector không tạo buổi LIVE mới (test tự động + kiểm chứng trên LIVE thật).
- Rủi ro đã biết: xem ARCHITECTURE §10 (thư viện TikTok không chính thức; RAM 8 GB; lũ sự kiện; hỗ trợ WebGL2 của LIVE Studio; bản quyền model/âm thanh; chính sách TikTok).
- Điểm chưa rõ cần hỏi: xem PROJECT_STATUS mục "Chặn".
- Người duyệt: ChatGPT (Architect & Reviewer) — Người dùng quyết định cuối
<!-- ===== KẾT THÚC docs/PROJECT_BRIEF.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/LESSONS.md ===== -->
## 7. LESSONS
_Nguồn: `docs/LESSONS.md`_

# SỔ BÀI HỌC — NOVA FISHING LIVE 3D
Mỗi mục: ngày · sự cố · nguyên nhân · cách sửa · cách phòng tránh.

## L-001 — 2026-11-24 — Tự khoá hook bảo vệ khi nâng cấp NOVA 1.0.1 → 1.0.3
- **Sự cố:** Sau khi đổi tên `~/NOVA_AI_DEVELOPMENT` thành bản sao lưu, mọi lệnh Bash/Write/Edit của Claude bị chặn: hook của dự án gọi `~/NOVA_AI_DEVELOPMENT/SCRIPTS/nova-guard.py` không còn tồn tại → python3 thoát mã 2 → Claude Code chặn. Claude không thể tự chạy `install.sh`; người dùng phải chạy tay trong Terminal.
- **Nguyên nhân:** Đổi tên thư mục và cài bản mới được thực hiện ở hai lệnh riêng; giữa hai lệnh, đường dẫn hook bị đứt.
- **Cách sửa:** Người dùng chạy `install.sh` của 1.0.3 → đường dẫn guard có lại → hook hoạt động.
- **Phòng tránh:** Khi thay thứ mà hook đang trỏ tới (thư mục NOVA, file guard, settings): (1) chuẩn bị bản mới ở chỗ khác trước; (2) đổi tên + cài trong **cùng một lệnh** (hoặc cài bản mới trước rồi mới đổi đường dẫn); (3) kiểm tra file guard tồn tại trước khi kết thúc lệnh; (4) luôn có lệnh hoàn tác soạn sẵn cho người dùng.

## L-002 — 2026-11-24 — Bộ cài NOVA 1.0.3 không đặt quyền thực thi cho `SECURITY_TESTS/interactive/*.sh`
- **Sự cố:** `nova-selftest.sh` sau khi cài: PASS=38 FAIL=1 (quyền sai: `nova-interactive-kit.sh`, `nova-interactive-verify.sh` là 644).
- **Nguyên nhân:** `install.sh` và `fix-permissions.sh` của 1.0.3 chỉ `chmod 755` cho `SCRIPTS/*`, `SECURITY_TESTS/run.sh`, `SECURITY_TESTS/runtime/*.sh` — bỏ sót thư mục `interactive/`.
- **Cách sửa:** `chmod 755` đúng hai file → selftest PASS=39 FAIL=0.
- **Phòng tránh:** Báo ChatGPT (người duy trì NOVA) sửa `install.sh` + `fix-permissions.sh` thêm `SECURITY_TESTS/interactive/*.sh`. Sau mỗi lần cài NOVA, chạy `nova-selftest.sh` trước khi dùng.

## L-003 — 2026-11-24 — Guard 1.0.3 chặn thử nghiệm guard bằng pipe vào bash
- **Sự cố:** Lệnh `printf '<json>' | bash nova-guard.sh` để thử guard bị chặn ("không cho pipe nội dung vào shell").
- **Cách làm đúng:** Không lách; dùng `nova-selftest.sh` (đã có ca kiểm guard + launcher fail-closed) làm bằng chứng.

## L-004 — 2026-11-24 — Guard 1.0.3 chặn nhầm lệnh Bash vì từ khoá nằm trong NỘI DUNG văn bản
- **Sự cố:** (a) Mẫu grep quét bí mật có chuỗi tên file môi trường → bị chặn "chạm tới file môi trường". (b) Script Python sửa ADR chứa từ "shutdown" trong văn bản tiếng Việt → bị chặn "lệnh quyền hệ thống".
- **Nguyên nhân:** Guard phân tích chuỗi lệnh Bash (kể cả heredoc), không phân biệt dữ liệu văn bản với lệnh thật.
- **Cách sửa:** (a) Bỏ chuỗi đó khỏi mẫu quét (không cần nhắc tới file môi trường). (b) Sửa tài liệu bằng công cụ Edit/Write (công cụ chuyên dụng sửa file, vẫn đi qua hook) thay vì script Bash.
- **Phòng tránh:** Sửa tài liệu Markdown dài bằng Edit/Write; chỉ dùng Bash cho lệnh thật. Không bao giờ diễn đạt lại lệnh để né guard. Báo ChatGPT các ca chặn nhầm để cân nhắc tinh chỉnh guard (không tự sửa guard).

## L-005 — 2026-11-24 — Tài liệu kiến trúc từng khẳng định quá mức về độ bền ("quà không bao giờ mất", "mất tối đa 500 ms")
- **Sự cố:** ChatGPT review v0.0.7 (R02, R05, R08) chỉ ra các khẳng định không có cơ chế và kiểm thử chứng minh.
- **Nguyên nhân:** Mô tả mục tiêu thiết kế như thể là bảo đảm; nhầm chu kỳ gom batch với RPO.
- **Cách sửa (0.0.8):** Viết rõ phạm vi bảo đảm (ADR-0018 G1–G3), RPO/RTO là mục tiêu kèm kịch bản đo (ADR-0022), danh sách "chưa chứng minh" (ARCHITECTURE §11).
- **Phòng tránh:** Mọi câu về độ bền/an toàn phải ghi kèm cơ chế + kiểm thử chứng minh; chưa đo thì ghi "mục tiêu, chưa chứng minh".
<!-- ===== KẾT THÚC docs/LESSONS.md ===== -->
