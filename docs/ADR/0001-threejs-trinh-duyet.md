# ADR-0001: Dùng Three.js trên trình duyệt cho đồ hoạ 3D
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (người dùng đã chọn, chờ ChatGPT duyệt)
- Bối cảnh: Cần game 3D chạy trong TikTok LIVE Studio trên Apple M1 RAM 8 GB, cùng stack Node của 6 game LIVE trước.
- Quyết định: Three.js (ghim bản, tự host trong `public/vendor/`), ES modules + import map, không bundler ở bản đầu.
- Lý do: nhẹ; nhúng được làm Browser Source; không phải cài engine; Control điện thoại dễ làm; tái dùng hạ tầng WebSocket.
- Phương án đã loại: Babylon.js (nặng hơn), Godot 4 (phải cài, nhúng LIVE Studio phải quay cửa sổ), Unity (nặng, cần giấy phép).
- Hệ quả: đồ hoạ low-poly có giới hạn; phải tự viết shader nước và tối ưu thủ công; phụ thuộc mức hỗ trợ WebGL2 của LIVE Studio (kiểm ở Phase 1).
