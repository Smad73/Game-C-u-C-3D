# ADR-0003: Adapter TikTok tách biệt, phía sau là tầng Ingest
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.2, theo ADR-0006) — Trạng thái: Đề xuất — **chờ người dùng cho phép tái dùng code từ dự án cũ**
- Bối cảnh: `tiktok-live-connector` không chính thức, có thể hỏng. `~/Downloads/glass-bridge-live/src/modules/TikTokConnector.js` đã có: streamEnd → ngắt không nối lại; rớt mạng → nối lại có giới hạn; chống trùng msgId; Mock.
- Quyết định: `src/ingest/LiveConnector.js` là adapter duy nhất chạm thư viện, chỉ chuẩn hoá và phát sự kiện. Dedupe, RateLimiter, GiftJournal, hàng đợi nằm ở tầng Ingest/Bus (ADR-0006), không nằm trong adapter. Ghim `tiktok-live-connector@2.5.0`.
- Lý do: thay thư viện (vd `@tiktool/live`) không phải sửa game; MockConnector/LoadGenerator đi cùng đường ống nên test tải sát thực tế.
- Phương án đã loại: gọi thư viện trực tiếp trong GameCore.
- Hệ quả: test riêng cho adapter (trùng, streak, rớt mạng, streamEnd) và cho đường ống (tải). Theo ADR-0014: chỉ cài một thư viện TikTok; `@tiktool/live` chỉ là phương án ghi nhận, không cài, không viết adapter thứ hai.
