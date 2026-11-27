# ADR-0020: Bảo mật REST/WebSocket cho mô hình máy phát + LAN (R06)
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.9 theo R12: HTTPS cho Control qua LAN — ADR-0023; ghép đôi có hạn/một lần/thu hồi được; sổ thiết bị + thu hồi toàn bộ; bỏ mô tả QR/mật khẩu như biện pháp chống nghe lén) — Trạng thái: Đề xuất (yêu cầu R06, R12 của ChatGPT) — chờ duyệt
- **Thay** mô tả cũ trong ARCHITECTURE §5/§7 "trên chính Mac chưa đặt mật khẩu thì vào thẳng" — mô tả đó không an toàn: mọi trang web mở trong trình duyệt của máy phát đều có thể gửi request tới `127.0.0.1` (CSRF, DNS rebinding).

## Mô hình đe doạ
| # | Kẻ tấn công | Đường tấn công |
|---|---|---|
| T1 | Trang web độc hại mở trên máy phát | Gửi POST/WS tới `http://127.0.0.1:<port>` (CSRF); DNS rebinding đổi tên miền sang 127.0.0.1 |
| T2 | Thiết bị khác cùng Wi-Fi/LAN | Truy cập trực tiếp cổng khi bật chế độ điện thoại; dò mật khẩu |
| T3 | Nghe lén LAN (HTTP thuần) | Bắt cookie/mật khẩu khi đăng nhập từ điện thoại |
| T4 | Gói cập nhật giả mạo | Zip chứa mã độc / path traversal / zip bomb |
| T5 | Dữ liệu từ TikTok (tên, comment) | XSS khi hiển thị ở stage/control |

## Quyết định
1. **Bind:** mặc định `127.0.0.1`. Chế độ điện thoại (launcher riêng) bind **địa chỉ LAN đã chọn** (không mặc định `0.0.0.0` trừ khi người dùng chọn), và **không khởi động** nếu chưa đặt mật khẩu Admin (tối thiểu 10 ký tự).
2. **Vai trò:** `stage` (chỉ đọc, không có dữ liệu bí mật) và `admin` (Control). Không có vai trò nào khác.
3. **Xác thực admin — áp dụng cả trên localhost:**
   - **Ghép đôi máy phát:** launcher mở `/control#pair=<mã một lần>` (mã ngẫu nhiên 128 bit, hết hạn 2 phút, dùng 1 lần; nằm sau `#` nên không gửi lên server trong request ban đầu và không vào log). Trang gửi mã qua `POST /api/admin/pair` → nhận phiên.
   - **Điện thoại:** đăng nhập bằng mật khẩu Admin, **hoặc** quét QR ghép đôi hiển thị trên Control của máy phát. QR/mật khẩu là cách **xác thực**, **không phải** biện pháp chống nghe lén (R12): trên HTTP thuần, mã ghép đôi, mật khẩu và cookie phiên đều có thể bị bắt trên đường truyền. Chống nghe lén chỉ có ở HTTPS (ADR-0023).
   - **Mã ghép đôi (máy phát và QR) — 0.0.9:** ngẫu nhiên 128 bit; **hết hạn sau 2 phút**; **dùng một lần** (đổi lấy phiên xong là vô hiệu); **thu hồi được** (nút "Huỷ mã đang hiển thị"; tạo mã mới tự huỷ mã cũ); chỉ một mã hiệu lực tại một thời điểm.
   - **Sổ thiết bị (0.0.9):** mỗi lần ghép đôi/đăng nhập tạo một thiết bị trong bảng `admin_devices` (device_id, tên do người dùng đặt, nền tảng/trình duyệt, paired_at_utc, last_seen_utc, revoked_at_utc). Phiên gắn với thiết bị. Control liệt kê thiết bị; **thu hồi từng thiết bị** (mọi phiên của thiết bị đó vô hiệu ngay, kể cả WS đang mở bị ngắt) và **"Thu hồi tất cả"** (mọi phiên + mọi thiết bị + mã ghép đôi đang hiệu lực, trừ phiên đang thao tác nếu người dùng chọn giữ). Đổi mật khẩu Admin → tự thu hồi tất cả.
   - **Phiên:** token ngẫu nhiên 256 bit trong cookie `HttpOnly; SameSite=Strict; Path=/` (+ `Secure` khi chạy HTTPS); server chỉ lưu hash; hết hạn khi không hoạt động 12 giờ (cấu hình); "Đăng xuất" (phiên hiện tại) và "Thu hồi tất cả" như trên. Restart server → phiên mất, ghép đôi lại; thiết bị đã thu hồi vẫn bị chặn.
   - **Mật khẩu Admin:** lấy từ biến môi trường do người dùng tự đặt (không đọc/ghi hộ), server chỉ giữ hash scrypt trong RAM; không log; giới hạn đăng nhập 5 lần/phút/IP + khoá tạm tăng dần.
4. **CSRF:** mọi request thay đổi trạng thái (POST/PUT/DELETE) phải có header `X-Nova-CSRF` khớp token CSRF của phiên (trang Control lấy qua `GET /api/admin/session`) **và** `Origin` khớp đúng origin của server. Không bật CORS (không gửi `Access-Control-Allow-Origin`).
5. **Chống DNS rebinding:** kiểm tra header `Host` thuộc danh sách cho phép (`127.0.0.1:<port>`, `localhost:<port>`, `<IP LAN đã chọn>:<port>`); sai → 421.
6. **WebSocket:**
   - Upgrade kiểm `Host` (như trên) và `Origin`.
   - `role=admin`: bắt buộc cookie phiên hợp lệ + Origin cùng origin.
   - `role=stage`: chỉ đọc; Browser Source của OBS/LIVE Studio có thể gửi Origin rỗng/`null` → **cho phép từ localhost**; từ LAN cần `viewKey` (`/stage?k=…`, tạo trong Control, đổi được).
   - Mọi message: schema hợp lệ, kích thước ≤ 16 KB, giới hạn tần suất theo kết nối; stage gửi lên server chỉ `viewport`/`metrics`.
7. **Thao tác nguy hiểm** (kết thúc LIVE, buổi LIVE mới, đóng buổi RECOVERING, reset, khôi phục DB, xoá hồ sơ, xoá dữ liệu DEMO, cập nhật bản, xuất dữ liệu): bắt buộc (a) xác nhận bằng chuỗi gõ tay (vd `XAC NHAN`), (b) phiên đã xác thực lại trong 5 phút gần nhất (mật khẩu hoặc ghép đôi), (c) ghi `admin_audit` (ai/thiết bị, IP, thao tác, thời điểm UTC, kết quả) — không ghi token.
8. **Header HTTP:** CSP chặt (`default-src 'self'`, không script inline, `connect-src 'self' ws:` đúng host), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` cho /control.
9. **XSS (T5):** tên/comment TikTok chỉ hiển thị qua `textContent`/texture canvas, không `innerHTML`; giới hạn độ dài, lọc ký tự điều khiển.
10. **Cập nhật bản (T4):** chỉ nhận gói **có chữ ký** bằng khoá công khai NOVA nhúng trong bản bán (khoá bí mật không bao giờ nằm trong gói); kiểm path traversal, giới hạn kích thước giải nén, số file; backup DB tự động trước khi áp dụng.
11. **Nghe lén LAN (T3) — 0.0.9 theo R12:** ~~không có TLS ở V1; ưu tiên ghép đôi QR thay vì gõ mật khẩu~~ (mô tả 0.0.8 sai: QR không chống nghe lén). **Thay bằng ADR-0023: Control qua LAN dùng HTTPS** (chứng chỉ tự ký riêng cho từng máy cài). Localhost vẫn dùng HTTP (lưu lượng loopback không đi ra mạng).
    - Nếu HTTPS **chưa** triển khai được trong V1 (người dùng không duyệt thư viện tạo chứng chỉ, hoặc thiết bị/trình duyệt không dùng được — xem ADR-0023): chế độ LAN chạy HTTP với **giới hạn bảo mật quan trọng** được ghi rõ ở Control (biểu ngữ thường trực "Kết nối KHÔNG mã hoá — mật khẩu và phiên có thể bị nghe lén trên mạng này"), INSTALL_*, Matrix và Handover; **chỉ khuyến nghị dùng trên mạng tin cậy** (mạng nhà riêng; không dùng Wi-Fi công cộng/quán/khách sạn); ghép đôi có hạn/một lần/thu hồi được; thu hồi toàn bộ phiên và thiết bị; tự tắt chế độ LAN khi không có phiên điện thoại trong N phút (cấu hình).

## Phương án đã loại
Không xác thực trên localhost; token trong URL query (lọt log/lịch sử); CORS mở; bind 0.0.0.0 mặc định. (Bản 0.0.8 loại "TLS tự ký bắt buộc ở V1"; **0.0.9 đổi lại**: HTTPS là mục tiêu V1 cho chế độ LAN theo R12 — ADR-0023.)

## Kiểm thử
Request từ origin lạ (CSRF) bị chặn; Host lạ (rebinding) bị 421; WS admin không cookie bị từ chối; stage từ LAN không viewKey bị từ chối; brute-force đăng nhập bị khoá; thao tác nguy hiểm thiếu xác nhận/xác thực lại bị từ chối; zip không chữ ký / path traversal bị từ chối; tên chứa `<script>` hiển thị dạng chữ. **0.0.9:** mã ghép đôi hết hạn sau 2 phút bị từ chối; mã đã dùng bị từ chối; mã bị huỷ bị từ chối; thu hồi một thiết bị ngắt ngay WS của thiết bị đó; "Thu hồi tất cả" vô hiệu mọi phiên; đổi mật khẩu thu hồi tất cả; chế độ LAN qua HTTPS: cookie có `Secure`, HTTP trên cổng LAN bị từ chối/chuyển hướng.
