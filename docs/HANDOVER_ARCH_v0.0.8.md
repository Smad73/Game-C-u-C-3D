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
