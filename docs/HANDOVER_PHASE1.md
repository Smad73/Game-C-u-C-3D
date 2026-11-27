# HANDOVER — PHASE 1 (v0.1.0) — 2026-11-25 — TRẠNG THÁI: HOÀN THÀNH MÃ + TEST; NGHIỆM THU OBS ĐƯỢC NGƯỜI DÙNG MIỄN (chưa kiểm)
**Quyết định người dùng 2026-11-25: "không cần OBS" — bỏ yêu cầu ảnh/video /stage trong OBS cho Phase 1. Đây là MIỄN YÊU CẦU, KHÔNG phải đã kiểm: /stage chưa chạy trong OBS; chỉ đã chạy trong Chrome 156. Cần ChatGPT xác nhận chấp nhận việc miễn.**
Không tự đánh dấu hoàn thành/APPROVED. Model: Sonnet 5.5.

## Đã triển khai (16 nhiệm vụ, trừ nghiệm thu OBS)
Git + tag `phase0-docs-v0.0.9`; package.json ghim express 4.22.3 / ws 8.23.0 / three 0.187.0 (70 gói, không native, audit 0); Node dev 26.13.0 LTS, `engines >=22.13`; `node:sqlite` nạp được, không cảnh báo experimental (stability chính thức chưa tra cứu offline — D4 còn mở); platform.js + config/platform; Logger/Settings/Metrics; shutdown + launcher macOS/Windows; PersistenceClient/Worker; migration 001_init (settings, committed_batches, applied_ops, players, gift_events, admin_devices, admin_audit, db_meta); commit/ACK/NACK/UNKNOWN/RETRYABLE/REJECTED + `status`; khung bảo mật (Host/Origin/CSRF/ghép đôi/phiên/thu hồi/đăng nhập mật khẩu); OverloadController + Alerts; /stage, /control tối giản; check-portability.js; tests/run-tests.js; Matrix.

## Dependency ghim
express 4.22.3 · ws 8.23.0 · three 0.187.0 (tự host public/vendor/three; gói không có bản .min → 2,1 MB không nén, lệch tên tệp ADR-0001: P2).

## Migration
001_init.sql (xem src/data/migrations).

## Kết quả test thật
Xem docs/TEST_REPORT.md: 113/113 đạt (npm test, 6 lần), portability đạt.

## Vấn đề còn tồn tại
- ~~P0: bằng chứng /stage trong OBS macOS~~ — người dùng miễn (chưa kiểm). Hạ xuống P1: rủi ro tương thích Browser Source (WebGL2/âm thanh) chỉ lộ khi chạy thật.
- P1: Windows chưa kiểm (launcher .bat, tín hiệu); chưa có Windows CI (A14); CR1–CR10 (RPO/RTO) chưa chạy (Phase 2/3); fault injection chỉ mô phỏng trạng thái logic; stability chính thức của node:sqlite chưa tra cứu.
- P2: three không có .min; chưa bundle font OFL tiếng Việt; viewKey từ máy khác chỉ kiểm bằng mô phỏng; lệnh `p` cần terminal thật; HTTPS (ADR-0023) chưa làm (chờ A16) — chế độ LAN là HTTP có biểu ngữ cảnh báo; P04 portability chưa kiểm chứng; `revokeAll` không giữ lại phiên hiện tại (ADR coi là tuỳ chọn).

## (Tuỳ chọn, đã được miễn) Cách tự kiểm OBS sau này
1. `npm start` (hoặc bấm đúp launchers/macos/start.command).
2. OBS → Nguồn + → Browser: URL `http://127.0.0.1:8787/stage/` (cổng in ở cửa sổ khởi chạy), 1080×1920, FPS 30, bật "Control audio via OBS".
3. Chụp ảnh OBS thấy trang: phải hiện "ĐẠT: hình + kết nối", WebGL2 CÓ, FPS ≈30; thêm `?beep=1` vào URL để kiểm mức âm trên thanh âm lượng OBS.
4. Làm tương tự với TikTok LIVE Studio và ghi vào Matrix.

## Đề xuất bước tiếp theo
Hoàn tất nghiệm thu OBS → ChatGPT duyệt Phase 1 → Phase 2 (Ingest, GiftJournal, CR1/CR2/CR8–CR10).
