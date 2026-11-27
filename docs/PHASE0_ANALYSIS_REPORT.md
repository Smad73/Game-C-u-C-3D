# BÁO CÁO GIAI ĐOẠN 1 (ANALYSIS + ARCHITECTURE) — NOVA FISHING LIVE 3D
Gửi: ChatGPT (NOVA Architect & Reviewer) — Người lập: Claude (Lead Developer) — Ngày: 2026-11-24 — Phiên bản: 0.0.3
Trạng thái: **ĐỀ XUẤT, CHƯA ĐƯỢC DUYỆT.** Từ 0.0.4, xem bản tổng hợp mới nhất ở `docs/CHATGPT_REVIEW_PACKAGE_v0.0.6.md` (báo cáo này giữ làm lịch sử khảo sát môi trường). Claude không tự đánh giá chất lượng thay ChatGPT. Báo cáo không chứa bí mật.

## 1. Phạm vi giai đoạn này
- Đã làm: đọc quy chuẩn NOVA v1.0.1 (CLAUDE.md, CORE_RULES, GAME_DEVELOPMENT, CODING_STANDARDS, SECURITY_RULES, TESTING_RULES, UI_UX_RULES, WEB_DEVELOPMENT, PRE_DEVELOPMENT, PROJECT_INITIALIZATION, DEVELOPMENT_WORKFLOW, mẫu tài liệu); khảo sát máy Mac; khảo sát 6 game TikTok LIVE cũ của người dùng; soạn kiến trúc.
- Không làm: không viết code game, không `git init`, không cài thư viện, không sửa `.claude/settings.json`, không đọc `.env`, không ghi đè `PROJECT_BRIEF.md`.
- File tạo/điền: `docs/ARCHITECTURE.md` (trước là mẫu trống), `docs/PROJECT_STATUS.md` (trước là mẫu trống), `docs/PHASE0_ANALYSIS_REPORT.md` (mới), `docs/ADR/0001–0004` (mới).

## 2. Quyết định người dùng đã chốt
| Câu hỏi | Lựa chọn |
|---|---|
| Lối chơi | Mỗi người xem là 1 cần thủ |
| Lối chơi cuối (0.0.3, ChatGPT chốt) | **Phương án B — Continuous Live World**: không có phiên 10 phút, chạy liên tục, không reset điểm cá nhân, AFK 5 phút, BXH LIVE/giờ/ngày/tuần/tổng, tiến trình lâu dài (ADR-0009…0012) |
| Số cần thủ (cập nhật 0.0.2) | **Không giới hạn**; giới hạn vận hành cấu hình được chỉ để bảo vệ máy (ADR-0005) |
| Engine 3D | Three.js trên trình duyệt |
| Công cụ phát / khung | TikTok LIVE Studio, dọc 1080×1920 |
| Phát hành / đồ hoạ | Bán thương mại + model CC0 low-poly (ghi nguồn) |

## 3. Phân tích yêu cầu (đề xuất — cần ChatGPT/người dùng xác nhận)
- **Vòng chơi:** comment `câu`/`câu cá` → tạo hồ sơ cần thủ + vị trí trên bờ hồ sinh thủ tục (không giới hạn số người) → tự quăng → chờ 5–15 s → cá cắn → giật (tự xử lý theo chỉ số) → kéo lên/sổng → hiện cá (loài, kg, bậc) → cộng điểm → quăng lại, liên tục suốt LIVE (0.0.3: không còn phiên/tổng kết định kỳ; xem ARCHITECTURE §0.2, §1).
- **Tương tác:** Like = tăng nhẹ tốc độ cắn toàn hồ; Follow/Share = mồi thường; Quà (cấu hình, nhiều quà/hành động, bật/tắt hiển thị): mồi xịn, cần xịn, gọi BOSS, mưa/bão đổi bảng cá, lưới kéo hàng loạt, cứu cá sổng.
- **Nội dung:** 20–30 loài cá, 5 bậc (Thường → Huyền thoại) + BOSS; thời tiết, ngày/đêm; BXH LIVE/giờ/ngày/tuần/tổng; sổ tay cá, cấp, trang bị, thành tích lưu lâu dài.
- **Phi chức năng:** ổn định ≥ 3 giờ LIVE; 30 FPS ổn định trên M1 8 GB chạy kèm LIVE Studio; chữ tiếng Việt lớn; chừa vùng bình luận TikTok.

## 4. Môi trường Mac (kết quả lệnh thật)
| Mục | Kết quả |
|---|---|
| Máy | Apple M1, GPU 7 nhân (Metal 4), RAM 8 GB, đĩa trống 96 GB, màn 2560×1600 |
| OS | macOS 26.7.3 (25G416), arm64 |
| Node / npm | v26.13.0 / 11.20.0; pnpm không có |
| Python | 3.9.6 |
| git / Homebrew | 2.56.0 / 7.0.11 |
| Xcode, ffmpeg, Blender, Unity, Godot | không có (không cần cho Three.js) |
| Ứng dụng | TikTok LIVE Studio, OBS, Google Chrome |
| Dự án cũ | 6 game LIVE dùng `tiktok-live-connector` 2.5.0 + `ws`; `glass-bridge-live` có kiến trúc và connector đúng luật NOVA |
Lệnh đã chạy: `sw_vers`, `uname -m`, `sysctl`, `system_profiler SPDisplaysDataType`, `<tool> --version`, `ls /Applications`, `df -h`.

## 5. Kiến trúc, thư mục, công nghệ, 8 Phase, rủi ro, đồ hoạ, TikTok
Xem `docs/ARCHITECTURE.md`:
- §1 Tổng quan, máy trạng thái · §2 Công nghệ · §3 Thư mục · §4 DB · §5 API/WS · §6 Giao diện · §7 Bảo mật · §8 Kế hoạch 8 Phase · §9 ADR · §10 Rủi ro
- Phụ lục A: cấu hình đồ hoạ & tối ưu · Phụ lục B: tích hợp TikTok LIVE

## 6. Điểm CHƯA xác định (cần trả lời trước Phase 1)
1. Danh sách lệnh comment; bảng quà → hành động cụ thể. (Độ dài phiên: đã bỏ ở 0.0.3.)
10. ~~Luật AFK~~ — đã chốt 5 phút (0.0.3).
11. ~~Phạm vi BXH~~ — đã chốt LIVE/giờ/ngày/tuần/tổng (0.0.3). Câu hỏi mới 0.0.3: xem PROJECT_STATUS mục "Chặn" (quy tắc buổi LIVE mới, định nghĩa tương tác, điểm BXH, múi giờ, lịch Boss).
12. Mức tải mục tiêu cần kiểm chứng (đề xuất 10/1.000/10.000 người + áp lực 50.000; 1.000 comment/s + 200 quà/s).
2. Bối cảnh/phong cách: hồ làng quê VN, biển, hay nhiều bản đồ? Có skin không (luật: sửa đổi phải áp dụng mọi skin).
3. Có cần TTS đọc tên/quà không (game cũ dùng msedge-tts).
4. Bản quyền/kích hoạt: dùng lại hệ license game cũ (khoá công khai + trial) hay làm mới.
5. Được phép tái dùng/chép logic `TikTokConnector.js`, `GiftManager` từ `glass-bridge-live` không.
6. Bản NOVA áp dụng: v1.0.1 (đang cài tại `~/NOVA_AI_DEVELOPMENT`) hay v1.0.3 (có zip trong thư mục người dùng).
7. Có cần bản Windows song song không.
8. ~~Điền PROJECT_BRIEF~~ — đã điền (0.0.3).
9. Mức hỗ trợ WebGL2 + âm thanh của Browser Source trong LIVE Studio — chưa kiểm được, sẽ kiểm thực tế đầu Phase 1.

## 7. Nội dung đề nghị ChatGPT kiểm duyệt
0a. **(0.0.3)** Continuous Live World: ARCHITECTURE §0.2, §1.1–1.4, §4 (bảng tiến trình, score_ledger, leaderboard_scores), Phụ lục D; ADR-0009…0012 — đặc biệt quy tắc xác định buổi LIVE mới và luồng tắt an toàn.
0. **(0.0.2)** Thiết kế không giới hạn cần thủ: ARCHITECTURE §0, Phụ lục A/B/C, ADR-0005…0008 — đặc biệt chính sách tràn hàng đợi và cách phân biệt giới hạn vận hành với giới hạn gameplay.
1. Lối chơi đề xuất (§3) và cơ chế quà có phù hợp, có rủi ro chính sách TikTok không.
2. Kiến trúc server headless + Three.js client (ARCHITECTURE §1, ADR-0002).
3. Cấu trúc thư mục và schema DB (§3, §4).
4. Thứ tự và tiêu chí xong của 8 Phase (§8).
5. Ngân sách hiệu năng cho M1 8 GB (Phụ lục A) có thực tế không.
6. Luật kết nối TikTok (Phụ lục B) có đủ theo GAME_DEVELOPMENT không.
7. Danh sách rủi ro (§10) còn thiếu gì.

## 8. Test
- Giai đoạn này chỉ có tài liệu, **chưa có code nên chưa có build/unit/e2e**.
- Đã kiểm: tài liệu có đủ 10 mục mẫu ARCHITECTURE; quét chuỗi nhạy cảm trong docs (xem PROJECT_STATUS).

## 9. Xác nhận không có bí mật trong gói bàn giao: ☑ (đã quét bằng grep, chỉ có tên biến/khái niệm, không có giá trị)
