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
