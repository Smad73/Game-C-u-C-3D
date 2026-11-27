# ADR-0013: Hệ thống Boss — lịch 30 phút, Boss quà, cảnh báo, chống chồng chéo, điều chỉnh tải
- Ngày: 2026-11-24 — Trạng thái: Quy tắc **đã chốt** (ChatGPT); triển khai chờ duyệt; số liệu HP/phần thưởng chốt sau mô phỏng Phase 4
- Quy tắc đã chốt: mặc định 30 phút/lần · cấu hình trong Admin Dashboard · Boss đặc biệt triệu hồi bằng quà hợp lệ · có cảnh báo trước khi xuất hiện · không chồng chéo ngoài cấu hình · điều chỉnh theo lượng người chơi và trạng thái server.
- Quyết định triển khai (WorldEventScheduler + BossFight):
  1. Máy trạng thái Boss: `SCHEDULED/QUEUED → WARNING (đếm ngược, mặc định 60 s) → ACTIVE → DEFEATED | ESCAPED → COOLDOWN`.
  2. Boss lịch: hẹn theo chu kỳ cấu hình (mặc định 30 phút) tính từ lần Boss lịch trước; nếu đến hạn mà đang có Boss → hoãn đến khi xong + khoảng nghỉ tối thiểu (cấu hình).
  3. Boss quà: quà nằm trong bảng quà → hành động "triệu hồi Boss" (qua GiftJournal; mục hàng chờ `world_events QUEUED` ghi **trong cùng transaction** với `APPLIED` — ADR-0018) → vào hàng chờ Boss có thứ tự, bền qua restart; được xử lý khi còn chỗ theo `maxConcurrentBosses` (mặc định 1).
  4. Co giãn: HP, thời lượng, phần thưởng = f(số người ACTIVE lúc bắt đầu WARNING); 0 người ACTIVE → hoãn Boss lịch.
  5. Bảo vệ server: Metrics (tick p95, độ sâu hàng đợi, FPS stage báo về) vượt ngưỡng → hoãn chuyển sang WARNING và/hoặc giảm hiệu ứng; không huỷ Boss quà.
  6. Sát thương từ cá câu được/quà của người ACTIVE; phần thưởng theo `world_event_contrib`.
  7. Lưu `world_events` (UTC) để khôi phục: restart giữa Boss → tiếp tục từ trạng thái đã lưu (thời gian dịch theo thời gian dừng).
- Phương án đã loại: Boss theo giờ tròn cố định; cho phép nhiều Boss tự do; huỷ Boss quà khi bận (mất quà của người xem).
- Hệ quả: test chồng lịch + nhiều Boss quà, quá tải giả lập, restart giữa Boss; cấu hình trong Control (chu kỳ, cảnh báo, số Boss đồng thời, khoảng nghỉ, hệ số).
