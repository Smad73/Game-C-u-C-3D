# HƯỚNG DẪN CHẠY & VẬN HÀNH — NOVA FISHING LIVE 3D (v0.3.0)
Áp dụng macOS (đã kiểm) và Windows x64 (**mục tiêu, CHƯA NGHIỆM THU**). Cần Node.js ≥ 22.13 (LTS).

## 1. Chạy server
- **Bấm đúp** `launchers/macos/start.command` (macOS) hoặc `launchers/windows/start.bat` (Windows). Lần đầu cài thư viện một lần trong thư mục dự án (launcher **không** tự cài):
  ```bash
  npm ci
  ```
- Hoặc dòng lệnh trong thư mục dự án:
  ```bash
  npm start
  ```
- Cửa sổ khởi chạy in: chế độ (DEMO/LIVE), địa chỉ trang điều khiển, địa chỉ màn hình phát. Trình duyệt tự mở trang điều khiển kèm **mã ghép đôi một lần (hết hạn 2 phút)**. Cần mã mới: gõ `p` rồi Enter trong cửa sổ khởi chạy.
- Tắt an toàn: **Ctrl+C một lần** (hoặc Control → Hệ thống → "Thoát an toàn"). Game ghi nốt cú câu, quà, sự kiện rồi mới thoát.
- Dùng điện thoại điều khiển qua Wi-Fi: chạy `start-dien-thoai.command` / `start-dien-thoai.bat` (bắt buộc đặt mật khẩu Admin ≥ 10 ký tự; kết nối HTTP **không mã hoá** — chỉ dùng mạng tin cậy).

## 2. Mở game (màn hình phát)
- Địa chỉ: `http://127.0.0.1:8787/stage/` (cổng đổi bằng biến môi trường `NOVA_PORT`).
- **OBS:** Sources → + → Browser → URL trên, **Width 1080, Height 1920**, bật "Control audio via OBS". Âm thanh do game tự tổng hợp (không dùng tệp có bản quyền).
- **TikTok LIVE Studio:** thêm nguồn "Link/Web" với URL trên, khung dọc 1080×1920. Kết quả tương thích từng OS phải kiểm thực tế — **chưa kiểm**.
- Kiểm tra máy phát (WebGL2, FPS, âm thanh, chữ tiếng Việt): `http://127.0.0.1:8787/stage/check.html`.
- 1/3 dưới và mép phải để trống cho bình luận/nút TikTok. Bật đường kẻ hướng dẫn: Control → Cài đặt → "Hiện đường kẻ vùng TikTok".

## 3. Trang điều khiển (Control)
`http://127.0.0.1:8787/control/` — cần ghép đôi (mã một lần) hoặc mật khẩu Admin.
| Tab | Làm gì |
|---|---|
| Tổng quan | Trạng thái thế giới, số cần thủ, cá/phút, Boss kế tiếp, tick server; **xem trước stage**; cảnh báo; FPS/âm thanh của máy phát |
| LIVE / Demo | Kết nối/ngắt, **Kết thúc buổi LIVE** (lưu an toàn), chọn chế độ Demo/LIVE + @username + thư viện kết nối, khởi động lại; Demo: thêm người xem ảo, gửi comment/quà thử, chỉnh nhịp giả lập |
| Người chơi | Tìm hồ sơ (toàn bộ, phân trang), xem cấp/xu/trang bị/sổ tay/thành tích/hạng; đánh thức, cho AFK, đưa lên hình |
| Quà | **Gift Mapping**: mỗi quà → nhiều hành động (ném cần, XP, xu, may mắn, lực kéo, cá hiếm lượt sau, Boss, sự kiện, buff cả hồ, điểm), bật/tắt, hiện banner; hệ số thưởng gốc; thưởng like/follow/share |
| Sự kiện | Gọi Boss (chọn cấp), cá hiếm trồi lên, kho báu, giờ vàng, mưa, bão, đêm trăng; xem/huỷ sự kiện đang chạy/chờ |
| BXH | TOP LIVE / 60 phút / ngày / tuần / tổng, xem kỳ cũ, phân trang toàn bộ người chơi |
| Cài đặt | Nhịp Boss, cảnh báo, thời lượng, HP theo người chơi, sự kiện tự động, AFK, ngân sách hiển thị, luân phiên BXH, âm lượng 4 kênh, tên hồ |
| Hệ thống | Số đo, sao lưu/khôi phục, nhật ký, thiết bị đã ghép đôi, thu hồi, thoát an toàn |
Thao tác nguy hiểm (kết thúc LIVE, khôi phục, thu hồi tất cả, thoát) cần gõ `XAC NHAN` + xác thực lại trong 5 phút, có ghi nhật ký audit.

## 4. Chạy Demo (không cần TikTok)
- Mặc định khi chưa cấu hình LIVE, launcher chạy **DEMO**: người xem giả lập comment/quà/like; dữ liệu nằm riêng ở `data/nova-demo.db` (không bao giờ chạm `nova-live.db`).
- Control → LIVE / Demo: "+20 / +200 / +2000 người", gửi comment (`câu`, `kéo`, `nâng cần`, `điểm danh`, `túi`, `hạng`…), gửi quà theo giftId, chỉnh nhịp.

## 5. Người xem chơi thế nào (comment)
`câu` / `câu cá` tham gia · `kéo` giúp kéo cá đang cắn (lực kéo +40%) · `nâng cần|dây|phao|mồi` nâng trang bị bằng xu · `điểm danh` nhận thưởng ngày · `túi` xem hồ sơ · `hạng` xem thứ hạng · `boss` khi có Boss.
Không có tương tác hợp lệ 5 phút → AFK (giữ nguyên hồ sơ). Like không đánh thức AFK. Quà luôn đánh thức.

## 6. Kết nối TikTok LIVE thật — **CHƯA KIỂM CHỨNG trên LIVE thật (chờ quyết định A17)**
Chưa có thư viện nào được cài. Xem `docs/A17_TIKTOK_LIBRARY_DECISION.md` để chọn. Khi đã chọn:
1. Cài đúng gói đã duyệt, ví dụ (chỉ chạy SAU khi người dùng quyết định):
   ```bash
   npm install @tiktool/live@2.20.0
   ```
2. Nếu dùng `tiktool`: đặt khoá API (bí mật) bằng biến môi trường trước khi chạy — **không** ghi vào tệp cấu hình hay mã:
   ```bash
   export NOVA_TIKTOOL_API_KEY="<khoá của bạn>"
   ```
   (Windows: `set NOVA_TIKTOOL_API_KEY=<khoá>` trong cửa sổ chạy `start.bat`.)
3. Control → LIVE / Demo → chế độ **LIVE TikTok**, nhập `@username`, chọn thư viện → Lưu → Khởi động lại.
4. Bắt đầu phát LIVE trên TikTok → Control → **Kết nối**. Cùng room_id = tiếp tục buổi; room_id mới = buổi LIVE mới (TOP LIVE mới).
5. LIVE kết thúc (`streamEnd`) → game tự ngắt, **không tự nối lại/poll**. Mất mạng thoáng qua → nối lại có giới hạn.

## 7. Sao lưu & khôi phục
- Sao lưu: Control → Hệ thống → "Sao lưu ngay" → tệp `data/backups/manual-<realm>-<thời điểm>.db` (bản sao nhất quán bằng `VACUUM INTO`, không ghi đè bản cũ).
- Khôi phục: Control → Hệ thống → bảng sao lưu → "Khôi phục" (gõ `XAC NHAN`). Game lưu an toàn, **chuyển** DB hiện tại vào `data/backups/pre-restore-…/` (không xoá), chép bản sao lưu vào chỗ, rồi tự khởi động lại.
- Sao lưu thủ công khi game đã tắt: chép thư mục `data/` sang nơi khác.

## 8. Giới hạn còn lại (trung thực)
- **TikTok LIVE thật: chưa kết nối, chưa kiểm** (A17: AGPL hoặc dịch vụ trả phí). Ánh xạ sự kiện của cả hai thư viện viết theo tài liệu, chưa kiểm chứng.
- **Windows, OBS, TikTok LIVE Studio: chưa kiểm thực tế** (chỉ kiểm trong Chrome/trình duyệt của app trên macOS).
- FPS 30 ở 1080×1920 kèm phần mềm phát: chưa đo trên máy phát thật kèm OBS; mới quan sát trong trình duyệt.
- HTTPS cho Control qua LAN: chưa có (chờ A16) — chỉ dùng mạng tin cậy.
- Dung lượng DB tăng theo số cú câu (~22 MB/phút ở 10.000 người cùng câu); chưa có nén/gộp catches theo tháng. Có dọn khoá idempotency > 7 ngày.
- Đồ hoạ low-poly tự dựng bằng mã (không có model CC0 nạp ngoài); không có TTS.
- Khôi phục backup cần khởi động lại (tự động).
