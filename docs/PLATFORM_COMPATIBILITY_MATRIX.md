# PLATFORM COMPATIBILITY MATRIX — NOVA FISHING LIVE 3D (V1)
Phạm vi: ADR-0015 (macOS + Windows). **Windows x64: nền tảng mục tiêu, CHƯA NGHIỆM THU** — cột WIN-1 chờ giai đoạn Windows Validation (ARCHITECTURE §8.2). Cập nhật: 2026-11-24 — **Chưa có kết quả kiểm thử nào (chưa có code).** Mọi ô chỉ được đổi sang ĐẠT/LỖI khi có bằng chứng thực tế (log, ảnh/quay màn hình, lệnh đã chạy).
Ký hiệu: ⬜ chưa kiểm · ✅ đạt · ❌ lỗi · ⚠️ đạt có điều kiện (ghi chú) · ➖ không áp dụng (ghi lý do).

## 1. Máy kiểm thử
| Mã | OS / phiên bản | CPU / kiến trúc | GPU | RAM | Node | OBS | TikTok LIVE Studio | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MAC-1 | macOS 26.7.3 | Apple M1 (arm64) | M1 7 nhân | 8 GB | 26.13.0 (dev) — LTS test: chốt sau | có cài (chưa ghi phiên bản) | có cài (chưa ghi phiên bản) | Máy dev của người dùng |
| WIN-1 | **chưa có máy** — kiểm khi người dùng có máy Windows x64 (Windows Validation) | x64 | | | | | | |
| WIN-CI | GitHub Actions `windows-latest` (nếu A14 được cho phép) | x64 | không GPU | | LTS chốt sau | ➖ | ➖ | Chỉ test tự động/build; **không** tính là nghiệm thu |

## 2. Ma trận kiểm thử
| # | Hạng mục (tiêu chí nghiệm thu) | MAC-1 + OBS | MAC-1 + LIVE Studio | WIN-1 + OBS | WIN-1 + LIVE Studio | Bằng chứng |
|---|---|---|---|---|---|---|
| 1 | Game khởi chạy bằng launcher bấm đúp (TC1/TC2) | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `npm test` đạt | ⬜ (OS) | — | ⬜ (OS) | — | |
| 3 | `check-portability.js` không lỗi (TC6) | ⬜ (OS) | — | ⬜ (OS) | — | |
| 4 | Phần mềm phát có bản cho OS này | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | Thêm được nguồn trang web/Browser Source trỏ /stage | ⬜ | ⬜ | ⬜ | ⬜ | |
| 6 | Lấy được hình ảnh game (TC3) | ⬜ | ⬜ | ⬜ | ⬜ | |
| 7 | WebGL2 khả dụng (renderer GPU, không rơi về phần mềm) | ⬜ | ⬜ | ⬜ | ⬜ | |
| 8 | Khung dọc 1080×1920 đúng tỉ lệ, chữ tiếng Việt đúng font | ⬜ | ⬜ | ⬜ | ⬜ | |
| 9 | Âm thanh phát ra trong luồng phát (TC4) | ⬜ | ⬜ | ⬜ | ⬜ | |
| 10 | WebSocket kết nối ổn định, tự nối lại | ⬜ | ⬜ | ⬜ | ⬜ | |
| 11 | FPS ≥ 30 (preset ghi kèm) | ⬜ | ⬜ | ⬜ | ⬜ | |
| 12 | Comment TikTok được xử lý (TC5) — LIVE thật | ⬜ | ⬜ | ⬜ | ⬜ | |
| 13 | Quà TikTok được xử lý, không trùng/mất (TC5) — LIVE thật | ⬜ | ⬜ | ⬜ | ⬜ | |
| 14 | /control mở trên trình duyệt máy phát | ⬜ (OS) | — | ⬜ (OS) | — | |
| 15 | /control mở từ điện thoại qua LAN (tường lửa OS) | ⬜ (OS) | — | ⬜ (OS) | — | |
| 16 | Thoát an toàn: nút Control, Ctrl+C, đóng cửa sổ — không mất dữ liệu | ⬜ (OS) | — | ⬜ (OS) | — | |
| 17 | Cập nhật bản bằng zip (khoá file Windows) | ⬜ (OS) | — | ⬜ (OS) | — | |
| 18 | Mở lần đầu: Gatekeeper (macOS) / SmartScreen–antivirus (Windows) | ⬜ (OS) | — | ⬜ (OS) | — | |
| 19 | Soak 3 giờ không rò bộ nhớ | ⬜ | ⬜ | ⬜ | ⬜ | |
| 20 | Hướng dẫn cài đặt & vận hành đã thử theo đúng từng bước (TC7) | ⬜ INSTALL_MACOS | | ⬜ INSTALL_WINDOWS | | |
"(OS)" = kiểm theo hệ điều hành, không phụ thuộc phần mềm phát. Mục 2, 3 trên Windows có thể có kết quả sớm từ WIN-CI (ghi "CI" kèm link lần chạy), nhưng vẫn phải kiểm lại trên WIN-1.

## 3. Giới hạn nền tảng đã biết
- TikTok LIVE Studio: chưa xác minh có bản/khả năng Browser Source trên từng OS — không mặc định.
- Phát qua OBS lên TikTok cần quyền stream key của tài khoản (ngoài kiểm soát của game).
- Ngoài phạm vi V1: Linux, Android, iOS, ứng dụng native riêng.

## 4. Nhật ký kiểm thử
(trống)

### 2026-11-25 — Phase 1, MAC-1 (macOS, Apple M1, Node 26.13.0)
- Mục 2 (`npm test`): ✅ 113/113, 6 lần liên tiếp. Mục 3 (`check-portability`): ✅ (P04 không kiểm chứng được trên ổ không phân biệt hoa/thường).
- Mục 1 (launcher): ✅ `launchers/macos/start.command` chạy từ thư mục khác, tắt bằng SIGINT mã 0. Mở bằng bấm đúp Finder + Gatekeeper lần đầu: ⬜ chưa thử.
- Mục 7, 8, 9, 10, 11 trên **trình duyệt trong ứng dụng (Chrome 156), KHÔNG phải OBS**: WebGL2 Apple M1 qua ANGLE/Metal ✅, chữ tiếng Việt ✅, âm thanh `running` ✅, WebSocket ✅, 30/30 FPS ✅.
- **MAC-1 + OBS (mục 4, 5, 6, 9): ⬜ CHƯA CHẠY** — người dùng từ chối cấp quyền điều khiển OBS cho Claude; cần người dùng tự thử (xem docs/HANDOVER_PHASE1.md). Cột LIVE Studio: ⬜.
- Cột Windows: ⬜ toàn bộ (chưa nghiệm thu).
