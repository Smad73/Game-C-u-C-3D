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
