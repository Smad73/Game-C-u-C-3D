# ADR-0002: Server Node headless là nguồn sự thật, client 3D chỉ hiển thị vùng quan tâm
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.2, theo ADR-0005) — Trạng thái: Đề xuất
- Bối cảnh: Kết quả câu cá gắn với quà TikTok; số cần thủ không giới hạn; cần chống trùng, khôi phục sau restart, test tự động.
- Quyết định: GameCore chạy trên server, giữ **mọi** người chơi (PlayerRegistry), tiến trình câu theo lịch hẹn giờ (FishingScheduler min-heap), RNG có seed, lưu SQLite theo lô. WebSocket chỉ gửi cho /stage **vùng quan tâm** (camera + spotlight) và số liệu gộp; /stage chỉ diễn hoạt.
- Lý do: test được không cần trình duyệt; chi phí theo số sự kiện chứ không theo số người; nhiều màn hình cùng một trạng thái; công bằng dù người chơi có lên hình hay không.
- Phương án đã loại: logic trong trình duyệt; vòng lặp duyệt mọi người chơi mỗi tick; phát toàn bộ trạng thái qua WS.
- Hệ quả: cần InterestManager, giao thức WS rõ (`src/shared/protocol.js`); mô phỏng cân bằng ở mức 10/1.000/10.000 người.
