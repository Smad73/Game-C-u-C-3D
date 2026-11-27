<!-- nova-home: /Users/maihoangdat/NOVA_AI_DEVELOPMENT -->
<!-- nova-version: 1.0.3 -->
# Dự án theo NOVA AI DEVELOPMENT PROTOCOL (loại: game)
@/Users/maihoangdat/NOVA_AI_DEVELOPMENT/CLAUDE.md
@/Users/maihoangdat/NOVA_AI_DEVELOPMENT/RULES/CORE_RULES.md
@/Users/maihoangdat/NOVA_AI_DEVELOPMENT/RULES/GAME_DEVELOPMENT.md
@/Users/maihoangdat/NOVA_AI_DEVELOPMENT/PROFILES/GAME_LITE.md

## Riêng dự án này
- Brief: docs/PROJECT_BRIEF.md — Kiến trúc: docs/ARCHITECTURE.md — Trạng thái: docs/PROJECT_STATUS.md
- Phiên làm việc (NOVA Context Management, một nguồn): docs/CURRENT_SESSION.md + docs/HANDOVER.md + docs/DEVELOPMENT_LOG.md. Đầu phiên mới: `python3 /Users/maihoangdat/NOVA_AI_DEVELOPMENT/SCRIPTS/nova-checkpoint.py recover .` → báo cáo ngắn → tiếp tục đúng việc. (Guard có thể hỏi xác nhận khi chạy script này — không lách; nếu bị chặn thì đọc trực tiếp PROJECT_STATUS → CURRENT_SESSION → HANDOVER + `git log -1` + `git status`.) Sau mỗi module/lỗi nghiêm trọng/test quan trọng/trước khi kết thúc: cập nhật phần viết tay của CURRENT_SESSION rồi `... nova-checkpoint.py write .` (không tự commit). `docs/RESUME_GUIDE.md` giữ làm bản đồ mã nguồn + mẹo vận hành (không nhân đôi trạng thái).
- Lệnh build/test: `npm ci` · `npm test` (portability + toàn bộ node:test, ~10 s) · `npm run check:portability` · chạy: `npm start` hoặc bấm đúp `launchers/macos/start.command` / `launchers/windows/start.bat`
- Quyết định cốt lõi: số cần thủ KHÔNG giới hạn (ADR-0005) — không thêm giới hạn cứng số người chơi ở bất kỳ tầng nào.
- **Phạm vi V1 (ADR-0015, thay ADR-0014): phát TikTok LIVE trên macOS + Windows ngay từ bản đầu** — một codebase dùng chung (gameplay, backend, DB, TikTok connector, gift); OBS Browser Source chạy trên cả hai OS; TikTok LIVE Studio kiểm tra thực tế riêng từng OS (không mặc định là có); WebGL2, âm thanh, WebSocket, dọc 1080×1920. Khác biệt OS chỉ ở launcher, `config/platform/*`, `src/system/platform.js`, INSTALL_MACOS/INSTALL_WINDOWS.
- **Cấm:** đường dẫn tuyệt đối máy Mac; lệnh/thư viện chỉ chạy trên macOS trong build chung; phụ thuộc native (ADR-0016: dùng `node:sqlite`, Node ≥ 22.13). Build/đóng gói/test viết bằng Node. Test tự động chạy thật trên macOS; trên Windows qua CI nếu đã thiết lập. **Windows x64 = nền tảng mục tiêu, CHƯA NGHIỆM THU** (chỉ có máy Mac) — kiểm thử thực tế ở giai đoạn Windows Validation (ARCHITECTURE §8.2); thiếu máy Windows không chặn Phase 1/2. Kết quả thực tế ghi `docs/PLATFORM_COMPATIBILITY_MATRIX.md`.
- **Chưa triển khai:** Linux, Android, iOS, ứng dụng native riêng — không code, không dependency, không kiểm thử cho các nền tảng này.

## NOVA MODEL SELECTION POLICY (người dùng áp dụng 2026-11-24)
1. **Opus 5.5**: kiến trúc hệ thống, thiết kế kỹ thuật phức tạp, phân tích lỗi nghiêm trọng, bảo mật, tối ưu hiệu năng, quyết định ảnh hưởng nhiều module.
2. **Sonnet 5.5**: lập trình tính năng theo đặc tả đã duyệt, giao diện, Three.js, animation, API, unit test, sửa lỗi thông thường, tài liệu.
3. Không dùng Opus cho tác vụ đơn giản không cần suy luận sâu.
4. Đang ở Sonnet mà gặp vấn đề vượt phạm vi xử lý thông thường → dừng, phân tích, đề xuất chuyển sang Opus.
5. Không tự ý thay đổi kiến trúc đã được ChatGPT phê duyệt.
6. Báo cáo model đang sử dụng (kiểm tra thực tế, không đoán) khi bắt đầu mỗi giai đoạn quan trọng; đổi model do người dùng thực hiện trong bộ chọn model của app.
