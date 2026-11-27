#!/bin/bash
# NOVA FISHING LIVE 3D — chế độ ĐIỆN THOẠI (LAN) trên macOS. Hỏi mật khẩu Admin (không hiện khi gõ) rồi chạy.
# Lưu ý: kết nối LAN hiện là HTTP, KHÔNG mã hoá — chỉ dùng trên mạng nhà tin cậy (xem docs/ADR/0020, 0023).
cd "$(dirname "$0")/../.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js. Tải bản LTS (22.13 trở lên) tại https://nodejs.org rồi bấm đúp lại tệp này."
  read -r -p "Nhấn Enter để đóng..." _
  exit 1
fi
export NOVA_MODE=lan
node server.js
code=$?
if [ "$code" -ne 0 ]; then
  echo
  echo "Game đã dừng với mã $code (0 = tắt an toàn; 3 = tắt nhưng chưa chắc đã lưu đủ; 2 = lỗi cấu hình)."
  read -r -p "Nhấn Enter để đóng..." _
fi
exit "$code"
