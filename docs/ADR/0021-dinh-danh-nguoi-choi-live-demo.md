# ADR-0021: Định danh người chơi LIVE/DEMO, khoá chính, unique index, migration (R07)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (yêu cầu R07 của ChatGPT) — chờ duyệt

## Bối cảnh
TikTok cung cấp cho mỗi người xem: `userId` (chuỗi số, **ổn định**), `uniqueId` (@handle, **người dùng đổi được**), `nickname` (tên hiển thị, đổi tự do). Chế độ DEMO/Mock/LoadGenerator sinh người chơi giả. Yêu cầu: dữ liệu DEMO **không bao giờ** ghi đè hoặc trộn vào hồ sơ LIVE.

## Quyết định
1. **Tách vật lý theo realm:** hai file DB riêng trong thư mục dữ liệu: `nova-live.db` và `nova-demo.db`. PersistenceWorker mở đúng một file theo chế độ đang chạy; chuyển LIVE ↔ DEMO = đóng file này, mở file kia (tắt an toàn trước). BXH, ledger, journal quà, buổi LIVE… của DEMO nằm hoàn toàn trong `nova-demo.db`. Xoá dữ liệu DEMO = xoá/tạo lại `nova-demo.db` (thao tác nguy hiểm, ADR-0020), không chạm `nova-live.db`.
2. **Realm do nguồn quyết định, không do nội dung sự kiện:** Ingest gắn realm theo **loại connector** (`LiveConnector` → `live`; `MockConnector`/`LoadGenerator` → `demo`). Mock/LoadGenerator **không thể** chạy khi kết nối DB LIVE đang mở (kiểm ở WorldCore + Worker — phòng thủ hai lớp).
3. **Khoá người chơi (phòng thủ thêm, kể cả trong cùng file):**
   - `player_key TEXT PRIMARY KEY` = `"tt:" + userId` (LIVE) hoặc `"demo:" + id sinh ra` (DEMO).
   - `realm TEXT NOT NULL CHECK (realm IN ('live','demo'))`, `external_id TEXT NOT NULL`, `UNIQUE (realm, external_id)`.
   - Ràng buộc nhất quán: `CHECK ((realm='live' AND player_key LIKE 'tt:%') OR (realm='demo' AND player_key LIKE 'demo:%'))`.
   - Worker từ chối ghi dòng có realm khác realm của file đang mở (`nova-live.db` chỉ nhận `live`).
4. **Thuộc tính hiển thị** (`unique_id`, `nickname`, `avatar_url`) là cột thường, cập nhật mỗi khi thấy giá trị mới; **không** dùng làm khoá. Không hỗ trợ gộp tài khoản.
5. **Sự kiện thiếu `userId`:** không tạo/cập nhật hồ sơ; quà vẫn được journal (`player_key = NULL`, status `REJECTED`, lý do `NO_USER_ID`) để không mất dấu; cảnh báo nếu tỉ lệ cao.
6. **Bảng phụ thuộc** (`player_presence`, `player_equipment`, `player_inventory`, `fishdex`, `player_achievements`, `catches`, `score_ledger`, `leaderboard_scores`, `world_event_contrib`, `gift_events.player_key`) dùng `player_key` làm khoá ngoại (`FOREIGN KEY … REFERENCES players(player_key)`), `foreign_keys=ON`.
7. **Migration:** bảng `schema_migrations(version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at_utc INTEGER)`; file `src/data/migrations/NNN_ten.sql` đánh số tăng dần, mỗi migration chạy trong một transaction; checksum sai → dừng, SAFE MODE (không tự sửa). **Backup tự động trước mỗi migration** (ADR-0022). V1 bắt đầu từ `001_init` (chưa có dữ liệu thật nên không có chuyển đổi dữ liệu). Cả hai file DB dùng chung bộ migration.

## Phương án đã loại
Dùng `uniqueId` làm khoá (đổi được → mất hồ sơ); một DB chung với cờ `is_demo` (một lỗi truy vấn là trộn BXH); tiền tố trong cùng bảng mà không tách file.

## Kiểm thử
DEMO không ghi được vào `nova-live.db` (kể cả khi cố gửi op realm `live` từ Mock); hai người cùng `nickname` khác `userId` là hai hồ sơ; đổi `uniqueId` vẫn giữ hồ sơ; migration lỗi giữa chừng rollback; checksum migration sai → SAFE MODE.
