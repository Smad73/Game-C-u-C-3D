# Tài nguyên stage (nhân vật VRoid)

- Mẫu: `public/stage/assets/vrm/NovaBaBa01.vrm`, `NovaBoy01.vrm`, `NovaGirl01.vrm` (VRM 1.0, ~11–12 MB mỗi tệp).
- Nguồn: sao chép từ dự án `le-thanh-hon-live` của người dùng (thư mục `public/3d-co-trang/assets/3d/`).
- Giấy phép trong metadata: chuẩn VRM 1.0 (`https://vrm.dev/licenses/1.0/`); **không ghi tên tác giả** trong file.
  Trước khi bán/phân phối cần người dùng xác nhận quyền dùng thương mại của các model này.
- Ảnh texture đã tách ra thư mục cạnh model (`public/stage/assets/vrm/<tên>/tex*.png`) bằng `npm run prepare:vrm` (xem L-020). Chạy lại không ảnh hưởng.
- Thư viện nạp: `@pixiv/three-vrm@3.6.0` (MIT), vendor vào `public/vendor/three-vrm/` bằng `npm run vendor:vrm`.
- Dung lượng: ~47 MB trong repo; cân nhắc Git LFS trước khi commit.

## Thêm nhân vật mới (không cần gõ lệnh)
1. Trong VRoid Studio: mở/tạo nhân vật → **Xuất (Export) VRM** (VRM 1.0).
2. Đặt tên tệp **không dấu**, chỉ chữ/số/`-`/`_` (ví dụ `CauThu04.vrm`), chép vào `public/stage/assets/vrm/`.
3. Khởi động lại game. Server tự tách texture và thêm tên vào `models.json`; tệp hỏng/tên có dấu bị bỏ qua (ghi cảnh báo trong log).
4. Mỗi mẫu tự có 6 bộ màu tóc/quần áo (0 = gốc) → nhiều cần thủ trông khác nhau.
- Trước khi dùng model tải từ nơi khác (VRoid Hub, mẫu có sẵn của VRoid Studio…): kiểm tra giấy phép của model đó có cho phép dùng thương mại/phát LIVE.
- Tay cầm cần: IK hai đốt trong `characters.js` (`solveArm`, `curlHand`); vị trí cần ở `anglers.js` (`ROD_BUTT`, `ROD_GRIP`, `ROD_REEL`).

## Nhân vật tạo mới trong VRoid Studio (2026-11-25)
- `NovaCauThu01`–`NovaCauThu06`: tạo trên máy người dùng từ preset của VRoid Studio 2.16 (khuôn mặt/tóc/trang phục), xuất VRM 1.0,
  tác giả `NOVA`, giấy phép trong file: thương mại cho cá nhân (personalProfit), cấm phân phối lại, cấm chỉnh sửa, chỉ tác giả dùng avatar.
  Bản gốc giữ ở `~/Downloads/NovaCauThu0N.vrm`.
- Texture lớn hơn 1024 px đã thu nhỏ còn 1024 (một lần, bằng `sips` trên máy phát triển) → toàn bộ 9 mẫu ~580 MB bộ nhớ đồ hoạ thay vì ~1,3 GB.
  Model mới người dùng tự thêm KHÔNG tự thu nhỏ (bước chuẩn bị chạy trên cả Windows, không dùng lệnh riêng macOS).
- Stage chỉ nạp ngẫu nhiên tối đa `MAX_MODELS` = 6 mẫu mỗi lần chạy (`characters.js`) để giữ trần bộ nhớ.
