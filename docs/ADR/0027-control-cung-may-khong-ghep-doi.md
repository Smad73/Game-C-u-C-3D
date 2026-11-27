# ADR-0027: Trang Control trên máy chạy game vào thẳng, không cần mã ghép đôi
- Ngày: 2026-11-25 — Trạng thái: **Người dùng duyệt** ("bỏ mã ghép đôi"). Sửa một phần ADR-0020 (bảo mật REST/WS).

## Quyết định
1. `POST /api/admin/local` mở phiên Admin **không cần mã** khi và chỉ khi kết nối là **loopback** (`127.0.0.1`, `::1`) —
   tức chính máy đang chạy game. Mỗi lần vào đều ghi `admin_audit` (`local_login`, kể cả lần bị từ chối).
2. Xác thực lại cho thao tác nguy hiểm: `POST /api/admin/reauth {local:true}` chỉ có hiệu lực với kết nối loopback.
3. Điện thoại / máy khác trong LAN **vẫn** phải dùng mã ghép đôi (hoặc mật khẩu Admin) như ADR-0020.
4. Trang Control tự gọi đường vào thẳng khi chưa có phiên; màn hình "Chưa ghép đôi" chỉ còn hiện trên thiết bị khác.

## Vì sao không bỏ hẳn cho mọi thiết bị
Bỏ hẳn thì bất kỳ ai cùng mạng wifi (chế độ LAN) đều điều khiển/đóng game được. Giới hạn theo loopback giữ nguyên trải nghiệm
"bấm là vào" cho người vận hành mà không mở cửa cho người lạ.

## Giữ nguyên lớp bảo vệ
- `hostGuard` (chống DNS rebinding) và `originGuard` (POST phải cùng origin) chạy TRƯỚC endpoint này → trang web lạ mở trong
  trình duyệt của người dùng không tự tạo phiên được. Cookie HttpOnly + SameSite=Strict; mọi API admin vẫn cần CSRF.
- Giới hạn: phần mềm khác chạy trên cùng máy có thể gọi endpoint này (như mọi ứng dụng localhost). Chấp nhận vì máy phát là máy tin cậy.
