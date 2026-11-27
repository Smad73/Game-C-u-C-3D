#!/bin/bash
# NOVA FISHING LIVE 3D — khởi chạy trên macOS (bấm đúp). Chỉ là vỏ mỏng: mọi logic nằm trong server.js.
cd "$(dirname "$0")/../.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js. Tải bản LTS (22.13 trở lên) tại https://nodejs.org rồi bấm đúp lại tệp này."
  read -r -p "Nhấn Enter để đóng..." _
  exit 1
fi
node server.js
code=$?
if [ "$code" -ne 0 ]; then
  echo
  echo "Game đã dừng với mã $code (0 = tắt an toàn; 3 = tắt nhưng chưa chắc đã lưu đủ; 2 = lỗi cấu hình)."
  read -r -p "Nhấn Enter để đóng..." _
fi
exit "$code"
