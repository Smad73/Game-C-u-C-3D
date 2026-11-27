# ADR-0026: Bản đồ rộng nhiều khu câu; quà cắt camera tới khu người tặng
- Ngày: 2026-11-25 — Trạng thái: **Người dùng duyệt** (người dùng bỏ bước ChatGPT duyệt từ 2026-11-25).
- Liên quan: ADR-0005 (không giới hạn cần thủ), ADR-0006 (hàng đợi sự kiện), ADR-0007 (render đám đông), ADR-0018 (quà sau commit).

## Quyết định
1. **4 khu** (`src/game/catalog.js` `ZONES`): Cầu Chính, Bến Đá, Hồ Sâu, Đảo Ngọc. Người mới được chia vào khu vắng nhất.
   Người chơi **tự đổi khu** bằng chat: `khu <số|tên>` hoặc `đổi khu` (sang khu kế tiếp). Khu sống trong RAM (chưa lưu DB).
2. **Server quyết định khu đang lên hình** (`src/game/ZoneDirector.js`, thuần, test tất định) để mọi màn hình (OBS, xem trước) thống nhất:
   - Quà ĐÃ COMMIT (sau ADR-0018) → **cắt ngay** tới khu của người tặng nếu khu hiện tại đã lên hình ≥ 4 s; chưa đủ thì
     xếp hàng (ưu tiên theo kim cương, gộp cùng khu, trần 6). Sau khi cắt vì quà, giữ khu 12 s trước khi được tự chuyển.
   - Khu hiện tại không còn ai đang câu (và hết giữ) → tự sang khu đông nhất.
3. **Ngân sách hiển thị theo khu**: mỗi khu có `detailedSlots` ô riêng; `frame` chỉ gửi người của khu đang lên hình
   (+ `zone`, `zoneName`). Mọi người vẫn được mô phỏng (ADR-0005 không đổi).
4. **Stage**: `public/stage/zones.js` giữ vị trí/phong cảnh theo id khu; đổi khu = **cắt cảnh** (camera nhảy thẳng, chớp đen 0.35 s),
   không bay qua bản đồ, nhân vật không đi bộ. Nắng/bóng và Boss dời theo gốc khu. Banner "CHUYỂN KHU" bỏ qua nếu đã có lệnh khu mới hơn.

## Hệ quả / giới hạn
- Mỗi lúc chỉ vẽ một khu → chi phí render như trước.
- Demo nhiều quà → camera đổi khu khá thường xuyên (tối thiểu 4 s/lần). Thông số ở `ZoneDirector` (chưa đưa lên Control).
- Khu của người chơi mất khi khởi động lại server (được chia lại); muốn giữ cần migration DB — chưa làm.

## Phương án đã loại
Stage tự chọn khu (nhiều màn hình lệch nhau); vẽ cả 4 khu cùng lúc (tốn hiệu năng gấp 4); camera bay qua bản đồ (người dùng chọn cắt nhanh).
