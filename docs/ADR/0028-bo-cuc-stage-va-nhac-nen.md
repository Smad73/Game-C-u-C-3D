# ADR-0028: Bố cục màn hình phát chỉnh trong Control + nhạc nền (tệp trên máy / YouTube)
- Ngày: 2026-11-25 — Trạng thái: **Người dùng duyệt** (chọn "Làm cả hai" cho nhạc nền).

## Quyết định
1. **Bố cục**: `game.config.layout` cho từng bảng (top, eventbar, feed, lb, banner, ticker, yt): `show`, `dx`, `dy` (px khung 1080×1920),
   `scale` 0.3–2, `opacity` 0–1, `hideOnClose` (tự ẩn khi camera cận cảnh/dưới nước). Mặc định giữ vị trí cũ; Diễn biến + TOP tự ẩn khi cận cảnh.
   Stage bọc mỗi bảng trong lớp `.lay` phủ cả khung và dịch/co giãn lớp bọc (không đụng animation/transform của bảng; chạy trên Chromium cũ của OBS).
   Control: tab **Màn hình phát** (xem trước + thanh trượt, tự lưu, gộp sâu từng bảng; nút "Mặc định tất cả", "Gọn").
2. **Nhạc nền** `game.config.music`: `synth` (nhạc tổng hợp sẵn), `files` (tệp trong `public/stage/assets/music`, danh sách qua `GET /api/music/tracks`
   công khai chỉ tên tệp), `youtube` (khung `youtube-nocookie.com` luôn hiện, ≥ 200×200, sandbox), `off`. Lệnh ▶/⏸/⏮/⏭: `POST /api/music/cmd` (Admin).
3. **CSP**: chỉ trang `/stage` thêm `frame-src 'self' https://www.youtube-nocookie.com`; không mở script/khung youtube.com; Control không nhúng YouTube.

## Rủi ro đã chấp nhận / ghi rõ cho người dùng
- Nhạc YouTube phần lớn có bản quyền → TikTok có thể tắt tiếng/dừng LIVE; điều khoản YouTube cấm phát kiểu ẩn trình phát. Không tải/tách tiếng YouTube.
- Âm lượng YouTube không chỉnh từ game (không nạp IFrame API để giữ CSP chặt) → chỉnh trong OBS/LIVE Studio.
- Trình duyệt thường có thể chặn tự phát nhạc cho tới khi bấm vào trang; OBS Browser Source không chặn.
