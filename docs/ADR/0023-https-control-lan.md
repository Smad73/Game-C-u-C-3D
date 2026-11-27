# ADR-0023: HTTPS cho Control qua LAN (R12)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (yêu cầu R12 của ChatGPT) — chờ duyệt; **cần người dùng duyệt thêm một thư viện** (mục A16 trong PROJECT_STATUS) trước khi triển khai ở Phase 7
- Liên quan: ADR-0020 (bảo mật REST/WS), ADR-0015/0016 (macOS + Windows, không phụ thuộc native).

## Bối cảnh
HTTP thuần trên LAN để lộ mật khẩu, mã ghép đôi và cookie phiên admin cho người nghe lén cùng mạng (R12). QR/mật khẩu không chống được nghe lén. Localhost (loopback) không đi ra mạng nên không thuộc phạm vi này.

## Quyết định
1. **Chế độ LAN (điện thoại) chạy HTTPS + WSS** trên cổng LAN; chế độ máy phát (`127.0.0.1`) giữ HTTP. Cổng LAN **không** phục vụ HTTP thuần (chỉ trả trang chuyển hướng sang HTTPS, không đặt cookie).
2. **Chứng chỉ tự ký riêng cho mỗi máy cài:** sinh lần đầu bật chế độ LAN (khoá ECDSA P-256 hoặc RSA 2048, hiệu lực ≤ 397 ngày, SAN gồm IP LAN đã chọn); lưu trong thư mục dữ liệu với quyền chỉ chủ sở hữu đọc (macOS: 0600; Windows: ACL người dùng hiện tại — qua `platform.js`); **khoá riêng không bao giờ rời máy, không nằm trong gói bán**. Đổi IP LAN → sinh lại. Có nút "Tạo lại chứng chỉ" (thao tác nguy hiểm → thu hồi mọi phiên).
3. **Xác minh danh tính máy chủ:** Control trên máy phát hiển thị **dấu vân tay SHA-256** của chứng chỉ (dạng nhóm ký tự dễ đọc); QR ghép đôi kèm dấu vân tay để người dùng đối chiếu trên trang cảnh báo chứng chỉ của trình duyệt điện thoại. Trang /control (sau khi vào) hiển thị lại dấu vân tay để đối chiếu lần nữa. Ghi rõ: trình duyệt sẽ cảnh báo "không riêng tư" lần đầu — đây là hệ quả của chứng chỉ tự ký, hướng dẫn trong INSTALL_*.
4. **Cách sinh chứng chỉ:** Node không có API tạo chứng chỉ X.509; không được dùng `openssl` hệ thống (không có sẵn trên Windows, vi phạm ADR-0015). Đề xuất một thư viện **JavaScript thuần** (ứng viên: `selfsigned` / `node-forge` — chốt khi đánh giá ở Phase 7: bảo trì, giấy phép, `npm audit`). Đây là phụ thuộc mới → **cần người dùng duyệt** (A16) và ghi ADR khi chốt.
5. **Cookie** `Secure` trên HTTPS; HSTS **không** bật (chứng chỉ tự ký, IP thay đổi — HSTS gây khoá truy cập khó gỡ).

## Phương án dự phòng (nếu HTTPS chưa triển khai được trong V1)
Lý do có thể: người dùng không duyệt A16; trình duyệt điện thoại từ chối WSS với chứng chỉ tự ký dù đã chấp nhận trang (cần kiểm chứng — D7). Khi đó áp dụng ADR-0020 mục 11: HTTP với **giới hạn bảo mật quan trọng** được hiển thị thường trực, chỉ khuyến nghị mạng tin cậy, ghép đôi có hạn/một lần/thu hồi được, thu hồi toàn bộ phiên/thiết bị, tự tắt chế độ LAN. Quyết định dùng dự phòng phải được người dùng và ChatGPT duyệt, ghi ADR.

## Phương án đã loại
- CA cục bộ cài lên điện thoại (an toàn hơn nhưng quá phức tạp cho người vận hành; có thể xem xét sau V1).
- Chứng chỉ công khai (Let's Encrypt) — cần tên miền + truy cập Internet vào máy phát; không phù hợp IP LAN.
- `openssl` hệ thống — không có trên Windows mặc định.
- Dùng QR/mật khẩu thay cho mã hoá (không chống nghe lén).

## Rủi ro & kiểm thử
- Rủi ro: cảnh báo chứng chỉ làm người vận hành bối rối; người dùng bấm "chấp nhận" mà không đối chiếu dấu vân tay (giảm thiểu bằng hướng dẫn, không loại bỏ được); Safari/Chrome trên điện thoại xử lý WSS tự ký khác nhau (D7).
- Kiểm thử (Phase 7, trên điện thoại thật theo A10): vào /control qua HTTPS; WSS hoạt động; cookie có `Secure`; cổng LAN không phục vụ HTTP thuần; dấu vân tay hiển thị khớp; tạo lại chứng chỉ thu hồi phiên; khoá riêng có quyền đúng trên macOS (Windows ở Windows Validation).
