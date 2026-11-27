# HƯỚNG DẪN TIẾP TỤC CHO PHIÊN CLAUDE CODE MỚI — NOVA FISHING LIVE 3D
Cập nhật: checkpoint 2026-11-25. **2026-11-25: người dùng đã cho phép chuyển sang PHASE 2 (TikTok Ingest & GiftJournal)** — trạng thái phiên: docs/CURRENT_SESSION.md; khôi phục tự động: `python3 ~/NOVA_AI_DEVELOPMENT/SCRIPTS/nova-checkpoint.py recover .`. File này giữ làm bản đồ mã nguồn/mẹo vận hành.

## 0. Bối cảnh một đoạn
Dự án game câu cá 3D tương tác TikTok LIVE (Node ≥22.13, Three.js, `node:sqlite` qua PersistenceWorker, macOS + Windows x64). Kiến trúc **v0.0.9 đã duyệt cho Phase 1** (docs/ARCHITECTURE.md + ADR 0001–0023). Phase 1 đã code + test nhưng **chưa được tuyên bố hoàn thành** (xem docs/PROJECT_STATUS.md, mục CHECKPOINT).

## 1. Đọc trước khi làm gì (theo thứ tự)
1. `CLAUDE.md` (quy tắc dự án + chính sách chọn model: Sonnet 5.5 cho code, Opus 5.5 cho kiến trúc/bảo mật/hiệu năng).
2. `docs/PROJECT_STATUS.md` → mục CHECKPOINT (tiến độ từng module, việc tồn đọng).
3. `docs/HANDOVER_PHASE1.md`, `docs/TEST_REPORT.md`, `docs/LESSONS.md`.
4. `docs/ARCHITECTURE.md` (§8 Phase 1, §11.1) và ADR liên quan khi đụng module đó (0017 Worker, 0018 quà, 0020 bảo mật, 0021 định danh, 0022 độ bền).
Báo model đang dùng (get_session) ở đầu phiên.

## 2. Xác minh trạng thái (không sửa gì)
```bash
git status --short          # phải sạch, trừ docs/PROJECT_STATUS.md và docs/RESUME_GUIDE.md (checkpoint chưa commit)
git log --oneline | head -12   # đầu là 609a9e5
npm ci
npm test                    # kỳ vọng: 113 test · 113 đạt · portability ĐẠT
```
Nếu `npm test` không đạt: dừng, báo cáo bằng chứng, KHÔNG sửa test cho "qua" (TESTING_RULES).

## 3. Công việc dang dở (chọn theo yêu cầu người dùng, hỏi nếu chưa rõ)
- **Chốt Phase 1:** chờ ChatGPT duyệt + xác nhận việc miễn OBS (người dùng đã nói "không cần OBS"; ghi rõ là *miễn*, chưa kiểm).
- **Việc nhỏ còn mở của Phase 1 (cần người dùng đồng ý trước khi làm):** mở `/control` trong trình duyệt thật và đọc console (chỉ /stage đã được mở); mở lại `/stage` sau 2 lần sửa (CSP IPv6, FPS tab ẩn); tra stability chính thức của `node:sqlite` cho Node LTS chốt (D4).
- **Phase 2** (chỉ khi được phép): Ingest + GiftJournal (ADR-0018: commit trước, công bố RAM sau), thang lưu trữ S1–S4 (ADR-0019), CR1/CR2/CR8–CR10. Cần A5 (được tái dùng code glass-bridge?) và thư viện `tiktok-live-connector@2.5.0` (chưa cài).

## 4. Bản đồ mã nguồn
`server.js` (launcher) → `src/app.js` (ráp) · `src/http.js` · `src/net/WsGateway.js` · `src/data/{PersistenceClient,PersistenceWorker,migrate}.js` + `migrations/001_init.sql` · `src/security/*` · `src/ops/*` · `src/system/*` (platform.js là nơi DUY NHẤT biết khác biệt OS) · `src/shutdown.js` · `public/{stage,control,vendor}` · `tools/{check-portability,vendor-three}.js` · `tests/*.test.js` + `run-tests.js` · `launchers/{macos,windows}`. **Phase 2:** `src/ingest/{events,ConnectorBase,MockConnector,LiveConnector,Normalizer,PriorityEventQueue,IngestPipeline,LiveSessionManager}.js` · `src/gifts/{GiftJournal,GiftTotalsView}.js` · `src/data/migrations/002_ingest.sql` · `tools/{load-generator,crash-suite,crash-child}.js` (`npm run load`, `npm run test:crash`).

## 5. Quy tắc cứng (đừng vi phạm)
- Không đặt giới hạn cứng số người chơi; không đổi Continuous Live World; giữ macOS + Windows; không đổi công nghệ DB/ADR mà không xin duyệt.
- Mọi thao tác DB chỉ qua PersistenceWorker. Không đường dẫn tuyệt đối máy Mac; chỉ `platform.js` được kiểm tra OS (check-portability sẽ bắt).
- Không đọc/ghi file môi trường thật; không bí mật trong repo/log.
- Hook NOVA guard 1.0.3 chặn cả khi từ khoá nằm trong *nội dung* lệnh Bash (ví dụ từ "shutdown", chuỗi chạm tới file môi trường). Không lách: dùng Edit/Write cho tài liệu/mã; đặt tên test là `exit-flow.test.js`.
- Không commit/push/reset/xoá khi chưa được người dùng yêu cầu. Commit (khi được yêu cầu) kèm dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, tránh từ bị guard chặn trong thông điệp.
- Không ghi PASS khi chưa chạy; ghi rõ mô phỏng vs thực tế; không tự đánh dấu APPROVED.

## 6. Mẹo vận hành đã học
- Chạy từng tệp test: `node --test --test-timeout=60000 tests/<tệp>.test.js` (macOS không có lệnh `timeout`).
- Chạy server tay: `NOVA_NO_BROWSER=1 NOVA_PORT=8787 NOVA_DATA_DIR=<thư mục tạm> node server.js`; URL ghép đôi in ra màn hình (không vào log). Dừng bằng Ctrl+C/SIGINT, không SIGKILL (trừ khi cố ý kiểm crash).
- Thư mục tạm của phiên trước (có thể đã mất): `/private/tmp/claude-501/-Users-maihoangdat-Projects-Fishing3D/.../scratchpad`; không có dữ liệu quan trọng ở đó (bản sao lưu docs cũ chỉ để tham khảo).
- Test timing: ack-timeout, hết hạn mã ghép đôi dùng thời gian thật/đồng hồ giả — nếu lỗi chập chờn, chạy lại 3 lần trước khi kết luận.
