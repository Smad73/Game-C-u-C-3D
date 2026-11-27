# ADR-0025: A17 — Thư viện kết nối TikTok LIVE: `tiktok-live-connector@2.5.0`
- Ngày: 2026-11-25 — Trạng thái: **Người dùng đã chốt — chờ ChatGPT duyệt** · Thay phần "ghim thư viện" của ADR-0003 (xác nhận lại, không đổi kiến trúc).
- Hồ sơ tra cứu: `docs/A17_TIKTOK_LIBRARY_DECISION.md`.

## Quyết định
1. Chọn phương án **(a)**: `tiktok-live-connector` **2.5.0, ghim chính xác** (`--save-exact`), giống các game LIVE trước của người dùng (người dùng: "A17 như những game trước").
2. Là provider mặc định của `src/ingest/LiveConnector.js`; adapter `@tiktool/live` giữ làm **dự phòng**, CHƯA cài.
3. Không đổi gameplay, DB, kiến trúc; gói thuần JS (không native) → vẫn đúng ADR-0016 và chạy macOS + Windows.

## Hệ quả / rủi ro đã chấp nhận
- **Giấy phép AGPL-3.0-only** (kèm `tiktok-live-proto` AGPL): nếu phân phối/bán, phải cung cấp mã nguồn tương ứng cho người nhận. Người dùng chấp nhận như các game trước. Không phải ý kiến pháp lý.
- Thư viện **không chính thức**, ký kết nối qua dịch vụ **Euler Stream** (bên thứ ba): có thể hỏng khi TikTok đổi giao thức hoặc Euler giới hạn.
- Ánh xạ sự kiện đã đối chiếu README/mã 2.5.0 (`user.uniqueId`, `giftDetails.giftType`, `repeatEnd`, tên sự kiện `chat/gift/like/follow/share/member/streamEnd`) nhưng **CHƯA KIỂM CHỨNG trên LIVE thật** → Module 10.
- LIVE kết thúc (`streamEnd`) → tự ngắt, không tự nối lại (GAME_DEVELOPMENT).
