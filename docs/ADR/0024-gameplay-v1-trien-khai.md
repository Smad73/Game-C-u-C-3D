# ADR-0024: Quyết định triển khai gameplay V1 (WorldCore, sự kiện, thưởng quà, chế độ chạy)
- Ngày: 2026-11-25 — Trạng thái: **Đề xuất — chờ ChatGPT duyệt** (đã triển khai theo yêu cầu "tự triển khai" của người dùng; không thay ADR nào đã duyệt).
- Liên quan: ADR-0005, 0006, 0009, 0010, 0013, 0017, 0018, 0021.

## Quyết định
1. **Mô phỏng có thẩm quyền trên server** (`src/game/WorldCore.js`, tick 100 ms): mọi cần thủ ACTIVE đều được mô phỏng (không giới hạn số người); stage chỉ nhận người trong **ngân sách hiển thị** (`detailedSlots`, mặc định 16) + số tổng. Kéo cá: lực cá dao động vs lực kéo (cần, buff, lệnh `kéo`), nguy cơ đứt dây theo bình phương phần căng vượt 0.6 (đã cân bằng bằng mô phỏng).
2. **Tiến trình từ mô phỏng** (cú câu, thành tích, sát thương Boss): RAM trước + write-behind 500 ms (lớp `progress`), mỗi op có khoá idempotency (`catch_id`, `applied_ops`, UNIQUE source_key). **Nâng cấp, điểm danh, thưởng follow/share**: ack-trước (đợi kết quả Worker rồi mới đổi RAM).
3. **Hiệu ứng quà**: cùng transaction với APPLIED (ADR-0018); thưởng gốc = √kim cương × hệ số (tránh quà rất đắt phá cân bằng cấp).
4. **Sự kiện thế giới**: Boss chiếm kênh lớn (≤ `maxConcurrentBoss`), sự kiện nhỏ mỗi loại một; sự kiện quà cùng loại **gộp/gia hạn** thay vì xếp hàng vô hạn (xem phiếu đối chiếu ADR-0018 mục 5).
5. **BXH** đọc điểm đã commit qua Worker 3 s/lần; TOP 60 phút tính trực tiếp từ `score_ledger` (cửa sổ trượt), các kỳ khác từ `leaderboard_scores` cập nhật cùng transaction với sổ cái.
6. **Chế độ chạy** (Demo/LIVE/tắt) lưu ở `data/run-mode.json` (không chứa bí mật); đổi chế độ / khôi phục backup = **khởi động lại trong cùng tiến trình** (mã thoát nội bộ 75) do `server.js` điều phối. Không có cấu hình nào → Demo.
7. **Âm thanh tổng hợp bằng WebAudio**, đồ hoạ low-poly dựng bằng mã → không có tài nguyên bản quyền bên ngoài.

## Phương án đã loại
Mô phỏng ở client (mất thẩm quyền, gian lận); giới hạn số người chơi để giữ FPS (vi phạm ADR-0005); xếp hàng mọi sự kiện quà (hàng đợi hàng giờ); cộng RAM trước cho nâng cấp (trừ xu sai khi DB từ chối).

## Hệ quả
DB tăng ~22 MB/phút ở 10.000 người cùng câu (bench) — cần nén/gộp `catches` theo tháng ở bản sau. Bằng chứng: `tests/game.test.js`, `tests/game-http.test.js`, `docs/evidence/game-bench-10000.json`.
