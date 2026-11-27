#!/bin/bash
# NOVA FISHING LIVE 3D — BẤM ĐÚP TỆP NÀY ĐỂ CHẠY TRÊN macOS.
# Lần đầu macOS có thể chặn ("không xác minh được nhà phát triển"): chuột phải vào tệp → Mở → Mở.
# Tệp này chỉ gọi launcher chính (launchers/macos/start.command), nơi kiểm tra Node.js và báo khi game dừng.
# Giữ tệp này TRONG thư mục game (cạnh thư mục launchers/); muốn để ngoài màn hình nền thì tạo Alias (Make Alias).
cd "$(dirname "$0")" || exit 1
exec /bin/bash "launchers/macos/start.command"
