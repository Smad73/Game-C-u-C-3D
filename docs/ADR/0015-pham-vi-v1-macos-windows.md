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
