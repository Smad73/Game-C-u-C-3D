# PROJECT STATUS
**CHECKPOINT GAMEPLAY V1 (v0.3.0) — 2026-11-25 — HEAD a96f968, CHƯA commit/push (theo yêu cầu).**
**Tóm tắt:** game chơi được đầy đủ qua **Demo**: cần thủ tự câu (quăng/chờ/cắn/kéo, căng dây, sổng), 23 loài + cá đặc biệt, 6 bậc hiếm, Fishdex, cấp/XP/xu, 4 trang bị nâng cấp, 19 thành tích, điểm danh, Boss định kỳ + Boss quà, 6 sự kiện thời tiết/kho báu/giờ vàng, BXH 5 phạm vi, Gift Mapping sửa được, stage 3D + âm thanh tổng hợp, Control đầy đủ, sao lưu/khôi phục. `npm test` 184/184; bench 10.000 người tick p95 7,2 ms.
**Chặn / chờ:** Module 10 cần buổi LIVE thử của người dùng (A17 đã chốt 2026-11-25: `tiktok-live-connector@2.5.0`, ADR-0025) · ChatGPT duyệt **ADR-0025** · ChatGPT duyệt **ADR-0024** + phiếu `docs/REVIEW_GIFTJOURNAL_vs_ADR-0018.md` · người dùng cho phép commit · OBS/LIVE Studio/Windows chưa kiểm.
Hướng dẫn chạy & vận hành: `docs/HUONG_DAN_VAN_HANH.md` · Test: `docs/TEST_REPORT.md` (mục Gameplay V1).
| Điều kiện hoàn thành (yêu cầu người dùng) | Trạng thái |
|---|---|
| 1 Server ổn định · 2 Game 3D trong browser · 3 Tham gia & câu · 4 Cá có hành vi/độ hiếm | Đạt (Demo, macOS, trình duyệt) |
| 5 Quà tạo tác động · 6 Không áp dụng trùng (đã kiểm) · 7 Lưu dữ liệu · 8 Fishdex/tiến trình · 9 Boss/Event · 10 BXH · 11 Control · 12 Demo độc lập · 13 Test tự động | Đạt (bằng chứng TEST_REPORT) |
| 14 Không P0 mở | **CHƯA** — P0 Module 10 chưa kiểm trên LIVE thật |
| 15 Hướng dẫn chạy/vận hành | Đạt (HUONG_DAN_VAN_HANH.md) |
| TikTok LIVE thật · OBS · LIVE Studio · Windows | **CHƯA KIỂM** |

**CHECKPOINT PHASE 2 — 2026-11-25 — KẾT THÚC PHIÊN, bàn giao phiên mới (HEAD a96f968, chưa push; 32 mục CHƯA commit — danh sách: docs/HANDOVER.md mục 5).**
**Tóm tắt:** Module 01–09 HOÀN THÀNH theo báo cáo hiện tại · Module 10 ĐANG LÀM (thư viện đã cài; chờ LIVE thử) · 2 điểm GiftJournal lệch ADR-0018 chờ ChatGPT review: (a) khoá `H:` băm thêm msgId + cờ repeatEnd; (b) streak thiếu groupId chỉ tính ở repeatEnd (thiếu cả hai → 0) · Việc tiếp theo: docs/CURRENT_SESSION.md.
Báo cáo: docs/PHASE_2_FINAL_REPORT.md · Test: docs/TEST_REPORT.md (mục Phase 2).
| # | Module Phase 2 | Trạng thái | Bằng chứng |
|---|---|---|---|
| 01 | TikTok Ingest Adapter | Khung + adapter xong; **gắn thư viện thật: CHỜ P0** | ingest 14/14, pipeline (thư viện giả) |
| 02 | Mock Connector | Xong | ingest 14/14 |
| 03 | Event Normalizer | Xong | ingest 14/14 |
| 04 | LIVE/DEMO | Xong | gift-journal (REALM_MISMATCH), pipeline (app DEMO không tạo nova-live.db) |
| 05 | GiftJournal + idempotency + streak | Xong | gift-journal 14/14, tải 10 phút I1–I3 |
| 06 | PersistenceWorker integration | Xong | gift-journal (GB8, W1, BUSY), CR2 |
| 07 | Queue & backpressure, S1–S4 | Xong một phần (thiếu từ chối WS + thông báo stage ở S4) | pipeline 12/12 (CR10a/b/c) |
| 08 | Recovery & crash tests | Xong | crash 8/8 (GB0–GB7), CR1×50, CR2×10, CR8×16 |
| 09 | LoadGenerator | Xong | docs/evidence/phase2-load-10min.json |
| 10 | TikTok LIVE thật | **CHƯA — P0** | — |
| + | LiveSessionManager | Xong (room_id thật chưa kiểm) | pipeline |
**P0:** `tiktok-live-connector@2.5.0` AGPL-3.0-only (+ `tiktok-live-proto` AGPL) mâu thuẫn mục tiêu bán; 2.x dùng dịch vụ ký Euler Stream (bên thứ ba) → người dùng chấp nhận như các game trước (A17 → (a), ADR-0025); đã cài 2.5.0 ghim chính xác. Còn mở: chưa kiểm trên LIVE thật.
**P1:** `src/data/*` của Phase 1 chưa từng commit (.gitignore `data/`, L-014 — đã sửa thành `/data/`, chờ commit); DB tăng ~25 MB/phút ở tải chuẩn (chưa dọn applied_ops/committed_batches); S4 chưa từ chối WS mới/chưa thông báo stage.
**Đóng:** A5 — không tái dùng mã glass-bridge (viết mới).
`npm test` 170/170 · portability ĐẠT. P2 REVIEW streak (A–F2): 9/9 đạt — xem TEST_REPORT; lệch khoá H so với ADR-0018 + rủi ro L-015 chờ ChatGPT.

**CHECKPOINT PHASE 1 — 2026-11-25 (v0.1.0, commit 609a9e5, tag gốc phase0-docs-v0.0.9). Phase 1 CHƯA được tuyên bố hoàn thành.**
Lý do chưa hoàn thành: (1) ChatGPT chưa duyệt Phase 1 và chưa xác nhận việc người dùng miễn nghiệm thu OBS; (2) `/stage` chưa chạy trong OBS (chỉ Chrome 156); (3) trang `/control` chưa từng mở trong trình duyệt thật (chỉ test API/WS); (4) Windows chưa kiểm; (5) CR1–CR10 chưa chạy.
Kết quả test thật lúc checkpoint: `npm test` = 113/113 PASS (8 tệp), portability PASS; exit-flow 9/9, http 18/18, ops 7/7, persistence 28/28, portability 14/14, process 6/6, security 17/17, system 14/14. Git: working tree sạch trước checkpoint; file mới/sửa trong checkpoint này (docs/PROJECT_STATUS.md, docs/RESUME_GUIDE.md) CHƯA commit theo yêu cầu.
Hướng dẫn tiếp tục: docs/RESUME_GUIDE.md. Báo cáo: docs/HANDOVER_PHASE1.md, docs/TEST_REPORT.md.

### Tiến độ từng module Phase 1 (thực tế)
| # | Module | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|---|
| 1 | Git + cấu trúc | Xong | commit 2064449; chưa push |
| 2 | package.json, lock, pin | Xong | 70 gói, không native, audit 0 |
| 3 | Node LTS + node:sqlite | Xong một phần | Node 26.13.0 LTS; nạp được, không cảnh báo; stability chính thức chưa tra (D4) |
| 4 | Pin express/ws/three | Xong | 4.22.3 / 8.23.0 / 0.187.0; three không có .min (P2) |
| 5 | Server Express + WS | Xong | http 18/18 |
| 6 | platform.js + config | Xong (macOS) | Windows chưa kiểm |
| 7 | Logger/Settings/Metrics | Xong | system 14/14 |
| 8 | shutdown + launcher | Xong (macOS) | process 6/6, exit-flow 9/9; `.bat` chưa chạy thử |
| 9–12 | PersistenceClient/Worker, migration 001, committed_batches/applied_ops, ACK/NACK/UNKNOWN | Xong | persistence 28/28; fault injection chỉ mô phỏng logic |
| **13** | **Security (Host/Origin/CSRF/pairing/session/revoke)** | **Xong phần lõi, có giới hạn** | security 17/17 + http 18/18 + process 6/6. Đã kiểm: Host 421, Origin thiếu/lạ/null, CSRF, mã ghép đôi (một lần/hết hạn/huỷ/thay thế/rate-limit), phiên (idle), thu hồi thiết bị (WS bị ngắt, bền qua restart) và thu hồi tất cả, đăng nhập scrypt + rate-limit + khoá tăng dần, reauth, thao tác nguy hiểm + audit, WS admin cần phiên + Origin. **Chưa kiểm/chưa làm:** HTTPS (ADR-0023, chờ A16); UI /control chưa mở trình duyệt thật; viewKey từ máy khác chỉ mô phỏng; lệnh `p` cần TTY thật; cookie Secure chỉ khi có TLS; `revokeAll` không giữ lại phiên hiện tại; chưa có kiểm thử xuyên tấn công thực tế/ pentest |
| 14 | OverloadController + Alerts | Xong | ops 7/7; chưa nối FPS stage/hàng đợi (Phase sau) |
| 15 | /stage | Xong, kiểm Chrome | OBS miễn (chưa kiểm) |
| 16 | test runner + portability + Matrix | Xong | P04 chưa kiểm chứng trên ổ không phân biệt hoa/thường |

### Vấn đề & quyết định tồn đọng
- Quyết định chờ người dùng/ChatGPT: duyệt Phase 1; xác nhận miễn OBS; A14 (repo GitHub → Windows CI); A16 (thư viện chứng chỉ HTTPS); A12/A13/A15.
- P1: Windows; CR1–CR10; fault injection mô phỏng; /control chưa kiểm trình duyệt; stability node:sqlite.
- P2: three .min; font OFL tiếng Việt; viewKey LAN thật; lệnh `p`; P04.
- Lỗi đã sửa trong Phase 1: Logger.child, Metrics warm-up (test), Client commit trước start() treo, CSP IPv6, FPS khi tab ẩn, process.platform ngoài platform.js (xem docs/LESSONS.md L-007…L-009).
> **PHẦN DƯỚI ĐÂY LÀ LỊCH SỬ KẾ HOẠCH TẠI v0.0.9 — ĐÃ LỖI THỜI.** Trạng thái hiện hành = khối CHECKPOINT PHASE 1 và bảng tiến độ ở đầu file (sửa 2026-11-25 sau khi phiên khôi phục phát hiện mâu thuẫn).
Cập nhật gốc: 2026-11-24 — Phiên bản: 0.0.9 (Giai đoạn 1: Analysis + Architecture — tài liệu, chưa có code)
**Trạng thái duyệt:** v0.0.7 phê duyệt có điều kiện (R01–R08) → v0.0.8 **chưa được phê duyệt**, ChatGPT yêu cầu thêm R09–R14 → bản **0.0.9 đã sửa theo R09–R14, chờ ChatGPT quyết định cuối**. Chưa viết code game, chưa cài thư viện. (lúc đó) Phase 1 chưa bắt đầu — nay đã xong mã+test, xem CHECKPOINT. Claude không tự đánh dấu APPROVED.
Model đang dùng: Opus 5.5 (kiến trúc). **Phạm vi V1: macOS + Windows (ADR-0015). macOS: phát triển và nghiệm thu trước trên máy thật. Windows x64: nền tảng mục tiêu, CHƯA NGHIỆM THU** — tương thích từ thiết kế, CI nếu khả thi, kiểm thử thực tế khi có máy (giai đoạn Windows Validation). Khuyến nghị cho Phase 1: **Sonnet 5.5**.

## Module
| Module | Trạng thái (chưa/đang/xong/lỗi) | Test | Ghi chú |
|---|---|---|---|
| Phân tích yêu cầu & kiến trúc | xong bản sửa 0.0.9 (R09–R14) | — (tài liệu; đã kiểm chéo ARCHITECTURE/ADR/STATUS/BRIEF bằng quét tự động) | v0.0.8 chưa được phê duyệt; **0.0.9 chờ ChatGPT quyết định cuối — chưa viết code** |
| Phase 1 – Nền tảng (server, config + platform, Logger, Settings, Metrics, tắt an toàn 2 OS, launcher macOS + Windows, test runner, check-portability, thử /stage trong OBS + LIVE Studio trên macOS, Windows CI nếu khả thi; **0.0.8:** khung PersistenceWorker + migration 001, khung bảo mật Host/Origin/CSRF/phiên, OverloadController tối thiểu; **0.0.9:** `committed_batches`/`applied_ops` + test W1–W5, sổ thiết bị + ghép đôi có hạn/thu hồi) | **xong mã + test (v0.1.0)** — xem CHECKPOINT đầu file; chưa được ChatGPT duyệt | npm test 113/113 | (lịch sử: chờ ChatGPT quyết định 0.0.9). **Không chờ máy Windows** |
| Phase 2 – Ingest & hàng đợi + LiveSessionManager + GiftJournal (ADR-0018, commit trước/công bố RAM sau) + thang lưu trữ S1–S4 | chưa | — | Tải chuẩn 1.000 comment/s + 200 quà/s; bất biến I1–I2, I9; CR1/CR2, CR8 (GB0–GB8), CR9, CR10 |
| Phase 3 – Thế giới liên tục headless (registry nóng/lạnh, AFK, BXH 5 phạm vi gồm HourWindow + `reached_at` R10, UTC/giờ VN, lưu an toàn, backup, verify-integrity) | chưa | — | Mô phỏng 10/1.000/10.000 người, 3 giờ; CR1–CR6; RPO thực tế đo theo R14 → TEST_REPORT |
| Phase 4 – Tiến trình & sự kiện thế giới (cấp, trang bị, sổ tay, thành tích, Boss 30 phút + Boss quà) | chưa | — | Mô phỏng cân bằng XP/Boss |
| Phase 5 – Cảnh 3D cơ bản | chưa | — | 30 FPS trên M1 kèm phần mềm phát (Windows đo ở Windows Validation) |
| Phase 6 – Đám đông, cá, Boss 3D | chưa | — | 30 FPS với 1.000 và 10.000 người |
| Phase 7 – Overlay, FX, âm thanh & Control (+ HTTPS cho Control qua LAN — ADR-0023, cần A16) | chưa | — | Kiểm HTTPS/WSS trên điện thoại thật (A10, D7) |
| Phase 8 – Ổn định & phát hành | chưa | — | Gói macOS + Windows; nghiệm thu đầy đủ trên macOS; Windows ghi "mục tiêu, chưa nghiệm thu" nếu chưa có máy |
| Windows Validation (§8.2 ARCHITECTURE) | chưa — chờ máy Windows x64 | — | Danh sách kiểm thử = Matrix cột WIN-1; sửa lỗi tương thích, hồi quy cả hai OS |

## Việc đang làm
- Đã sửa kiến trúc theo review R09–R14 (0.0.9); báo cáo bàn giao `docs/HANDOVER_ARCH_v0.0.9.md` + gói kiểm duyệt `docs/CHATGPT_REVIEW_BUNDLE_v0.0.9.md`; chờ ChatGPT quyết định cuối. (Gói v0.0.7, v0.0.8 giữ làm lịch sử.)

## Chuẩn bị Phase 1 (lịch sử — đã thực hiện xong ở v0.1.0)
Phạm vi (không có logic game):
1. `git init`, nhánh `main`, commit đầu chỉ chứa tài liệu hiện có; `.gitignore` thêm `node_modules/`, `data/`, `dist/`; `.gitattributes` (`*.bat` CRLF, `*.command` LF, `* text=auto`).
2. `package.json` (ESM, `engines: node >=22.13`, script `start`, `test`, `check:portability`), cài và ghim `express@4`, `ws@8` (không phụ thuộc native; `tiktok-live-connector` để Phase 2).
3. `src/app.js`, `src/http.js` (`/api/health`, `/api/metrics`), WebSocket `/ws` rỗng (echo trạng thái).
4. `src/system/Logger.js`, `Settings.js` (đọc `config/default.json` + `config/platform/<os>.json` + `.env`; thư mục dữ liệu tính bằng `path`, không đường dẫn tuyệt đối), `Metrics.js`, `platform.js` (mở trình duyệt, thư mục dữ liệu, tín hiệu tắt theo OS).
5. `src/shutdown.js`: khung luồng tắt an toàn (macOS: SIGINT/SIGTERM/SIGHUP; Windows: SIGINT/SIGBREAK/SIGHUP khi đóng console; gọi các bước đăng ký theo thứ tự, có trần thời gian ngắn) + API `POST /api/world/stop` cho nút "Thoát an toàn".
6. `server.js` launcher Node dùng chung + `launchers/macos/start.command`, `start-dien-thoai.command` và `launchers/windows/start.bat`, `start-dien-thoai.bat` (vỏ mỏng, chỉ gọi `node server.js`; tên file ASCII).
7. `public/stage/` trang thử 1080×1920: WebGL2 (renderer GPU), âm thanh, WebSocket, FPS, font tiếng Việt — tự báo kết quả về /control; `public/control/` khung trống.
7b. **(0.0.8)** `src/data/PersistenceClient.js` + `PersistenceWorker.js` (worker_threads, `node:sqlite` WAL FULL, migration `001_init` với `player_key`, `gift_events.gift_key UNIQUE`, `schema_migrations`), `src/security/` (Host/Origin/CSRF, ghép đôi + phiên, bind theo chế độ), `src/ops/OverloadController.js` + `Alerts.js` tối thiểu. Ghi lại mức stability `node:sqlite` của bản Node LTS chốt. **(0.0.9)** migration `001_init` thêm `committed_batches`, `applied_ops`, `admin_devices`; PersistenceClient theo dõi trạng thái batch (PENDING/SENT/COMMITTED/REJECTED/RETRYABLE/UNKNOWN) + message `status`; Metrics có bộ chỉ số R14; điểm chèn lỗi (fault injection hook) cho test, chỉ bật trong môi trường test.
8. `tests/run-tests.js` với `node:test`: health, metrics, shutdown theo thứ tự, settings, PersistenceWorker (commit/ack, Worker chết → gửi lại batch không trùng, **W1–W5** của ADR-0017, DB tạm), bảo mật (CSRF/Origin/Host/WS admin không phiên bị chặn; mã ghép đôi hết hạn/đã dùng/đã huỷ bị từ chối; thu hồi thiết bị); `tools/check-portability.js` (đường dẫn tuyệt đối, lệnh riêng OS, phân biệt hoa/thường). Chạy thật trên **macOS**; trên Windows qua CI `windows-latest` nếu A14 được cho phép (`.github/workflows/ci.yml`, ma trận macos-latest + windows-latest).
9. Cập nhật CLAUDE.md dòng "Lệnh build/test", TEST_REPORT, PROJECT_STATUS, PLATFORM_COMPATIBILITY_MATRIX (mục 1–11, 14–16), sổ bài học `docs/LESSONS.md`; bản nháp INSTALL_MACOS / INSTALL_WINDOWS phần chạy thử.
Kiểm thử thủ công cần người dùng (Phase 1): trên **Mac**, thêm Browser Source `http://127.0.0.1:<port>/stage` vào OBS và TikTok LIVE Studio; báo kết quả WebGL2/âm thanh/hình. Kiểm thử thực tế Windows chuyển sang Windows Validation.
Cần trước Phase 1: **chỉ còn** ChatGPT quyết định cuối về bản 0.0.9 (R09–R14) (A1 đã xong). Không cần máy Windows. Nên có trong Phase 1 (không chặn): A14 (repo GitHub cho Windows CI).

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
| A16 | **(0.0.9, R12)** Cho phép thêm **một thư viện JavaScript thuần** để sinh chứng chỉ tự ký cho HTTPS chế độ LAN (ứng viên `selfsigned`/`node-forge`, chốt sau khi đánh giá bảo trì, giấy phép, `npm audit`)? Không duyệt → V1 dùng phương án dự phòng HTTP với **giới hạn bảo mật quan trọng** (ADR-0023) | Phase 7 | Chống nghe lén Control qua LAN |

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
| B16 | **(0.0.8, sửa 0.0.9)** Quà chỉ được tính hiệu ứng sau khi `RECEIVED` được ack bền, **và** hiệu ứng chỉ có mặt trong game sau ack commit thứ hai (R09) → hai lần chờ ack, trễ thêm ước tính ≈ 100–200 ms (chưa đo), mục tiêu vẫn p95 < 1 s | ADR-0018; đổi lấy không áp dụng hai lần và WorldCore không dùng hiệu ứng chưa bền |
| ~~B17~~ | ~~**(0.0.8)** Không có TLS trên LAN ở V1~~ — **thay bởi B22 (0.0.9)**. Phần "xác thực cả localhost" giữ nguyên | ADR-0020; R06 |
| B18 | **(0.0.8)** DEMO dùng file DB riêng `nova-demo.db` (tách vật lý) thay vì cờ `is_demo` trong một DB | ADR-0021; R07 |
| B19 | **(0.0.8)** TOP 60 phút có độ dài thực [59, 60) phút do bucket theo phút; công bố là "60 phút gần nhất" | ADR-0010; R03 |
| B20 | **(0.0.9, R10)** Khi hoà cả score, weight_g và `reached_at`, xếp theo `player_key` tăng dần — tiêu chí kỹ thuật cuối để thứ tự xác định, **không phải luật chơi**; `reached_at` khi bucket hết hạn = ranh giới logic `expiry(b)` | ADR-0010 R10; giữ nguyên quy tắc nghiệp vụ đã chốt |
| B21 | **(0.0.9, R11)** Khi hệ thống ở S3/S4 (quà chỉ còn trong RAM hoặc đã ngừng tiếp nhận), stage hiện thông báo trung tính "Hệ thống đang bảo trì — quà tạm thời chưa được ghi nhận" (bật mặc định, Admin tắt được) để khán giả không tặng quà khi game không ghi nhận được | ADR-0019 R11; bảo vệ người xem |
| B22 | **(0.0.9, R12)** HTTPS cho chế độ LAN là **mục tiêu V1** (chứng chỉ tự ký từng máy), không phải để sau; phụ thuộc A16 | ADR-0023; R12 "ưu tiên HTTPS" |
| B23 | **(0.0.9, R09)** Hiệu ứng quà được biểu diễn thành **delta tương đối có khoá idempotency**; hiệu ứng phụ thuộc trạng thái (vị trí hàng chờ Boss) tính trong transaction của Worker | ADR-0018 R09 |
| B24 | **(0.0.9, R13)** `applied_ops`/`committed_batches` dọn sau 7 ngày — an toàn vì cửa sổ gửi lại batch chỉ tính bằng giây–phút và replay quà dựa trên `gift_events.status` | ADR-0017 R13 |

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
| D6 | **(0.0.8, sửa 0.0.9)** RPO/RTO thực tế (CR1–CR10, đo theo ADR-0022 mục R14); CR7 mất điện thật không tự động hoá được — sẽ ghi "chưa chứng minh" | Phase 2, 3, 8 |
| D7 | **(0.0.9)** Safari (iOS) / Chrome (Android) có cho WSS hoạt động với chứng chỉ tự ký sau khi người dùng chấp nhận trang HTTPS không | Phase 7 |
| D8 | **(0.0.9)** fsync của file khẩn cấp `emergency-gifts-*.jsonl` trên macOS và Windows; chi phí `applied_ops` ở tải 200 quà/s; trễ quà p95 sau khi thêm lần chờ ack thứ hai | Phase 2 (macOS), Windows Validation |

## Checklist PRE_DEVELOPMENT
- [x] Đã đọc CORE_RULES + GAME_DEVELOPMENT (+ CODING, SECURITY, TESTING, UI_UX, WEB)
- [x] Sổ bài học `docs/LESSONS.md` đã tạo (L-001…L-006)
- [x] PROJECT_BRIEF đã điền (0.0.9); điểm chưa rõ còn lại đã liệt kê (mục A)
- [x] Công nghệ đã chốt, có lý do (ARCHITECTURE §2)
- [ ] ARCHITECTURE.md đã duyệt — v0.0.8 chưa được phê duyệt; bản sửa 0.0.9 (R09–R14) chờ ChatGPT quyết định cuối
- [ ] Thư mục dự án, git, .gitignore, .env.example — có .gitignore, .env.example; **chưa git init** (bước 1 của Phase 1)
- [ ] Kế hoạch backup trước thay đổi lớn — git tag/branch từ Phase 1; backup DB tự động trước cập nhật bản
- [x] Xác nhận phiên bản đang chạy — dự án mới, không có bản đang chạy
- [x] Đã xác định việc cần xin phép (cài phần mềm ngoài npm, chép code dự án cũ, thay đổi hạ tầng mở rộng ngang)

## Lỗi đã biết
- Chưa có (chưa có code).

## Nhật ký thay đổi (mới nhất trước)
- 0.0.9 — 2026-11-24 — Sửa theo NOVA ARCHITECT REVIEW v0.0.8 (chưa phê duyệt, R09–R14). **Mới:** ADR-0023 HTTPS cho Control qua LAN (R12). **Sửa (đánh dấu phần bị thay, không xoá lịch sử):** ADR-0018 (R09 commit trước/công bố RAM sau, GB0–GB8), ADR-0010 (R10 `reached_at`), ADR-0019 (R11 thang S1–S4; R14 ngưỡng), ADR-0020 (R12 ghép đôi/thu hồi, bỏ QR như biện pháp chống nghe lén), ADR-0017 (R13 `committed_batches` + `applied_ops`, trạng thái batch; R14 chỉ số), ADR-0022 (R14 RPO chỉ từ crash test; CR8–CR10; I9–I10), ADR-0005, ADR-0006 (điều kiện "còn khả năng lưu trữ"). **ARCHITECTURE 0.0.9:** §0.1, §1.4, §3, §4 (3 bảng mới), §5, §7, §8 Phase 1/2/3/7, §9, §10 (+4 rủi ro, sửa 2), §11 (sửa R06, R08) + **§11.1 mới** R09–R14, Phụ lục B. **BRIEF**, **LESSONS** L-006. Thêm A16, B20–B24, D7–D8; B16 sửa, B17 thay bởi B22. Sao lưu 0.0.8 ở thư mục tạm của phiên. **Không viết code, không cài thư viện; Phase 1 chưa bắt đầu.**
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
