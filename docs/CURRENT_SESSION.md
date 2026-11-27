# CURRENT SESSION
Trạng thái PHIÊN HIỆN TẠI — ngắn, ghi đè mỗi lần checkpoint. Bảng tiến độ ở PROJECT_STATUS.md.
**Phiên 2026-11-25 (lần 2) — người dùng giao "AUTONOMOUS FULL GAME DEVELOPMENT". Không còn thao tác dở dang trong mã.**

## Đang làm
- Gameplay V1 (v0.3.0) hoàn tất ở mức chơi được qua Demo. A17 ĐÃ CHỐT 2026-11-25 = (a) `tiktok-live-connector@2.5.0` như các game trước (ADR-0025); đã cài, adapter đối chiếu khớp 2.5.0. Đang: Module 10 — cần người dùng mở LIVE thử.
- Đồ hoạ/camera (chưa commit, 198/198 test): góc 1 tổng quan trên cao + góc 2 cận cảnh khi cắn/giằng (`shotPicker.js`); nhân vật VRoid cho cần thủ (`characters.js`, `@pixiv/three-vrm@3.6.0`, texture tách bằng `npm run prepare:vrm` vì CSP chặn blob — L-020); bản đồ rộng 4 khu + quà cắt camera tới khu người tặng + lệnh chat `khu` (ADR-0026, `ZoneDirector.js`, `zones.js`).
- v0.4.0 (2026-11-25, chưa commit, 199/199 test): cá mới (thân thuôn, lưng đậm bụng sáng, đuôi/vây theo loài, koi có đốm); cá mắc câu hiện dưới nước lúc cắn/giằng (frame gửi `fs`); góc 3 dưới nước khi giằng co, góc 2 khi cắn và kéo lên (cắt nhanh khi vào/ra nước). Gói thử: `dist/NovaFishing3D-0.4.0-test.zip` (41 MB, kèm node_modules, đã chạy thử độc lập).
- Sau v0.4.0 (2026-11-25, 203 test): Control vào thẳng trên máy chạy game (ADR-0027); nhịp Demo mặc định Chậm (server.js DEMO_MOCK) + nút Chậm/Vừa/Nhanh; tay VRoid nắm cần bằng IK + ngón cong; 6 biến thể màu/mẫu; server tự chuẩn bị .vrm + models.json khi khởi động (src/assets/prepareVrm.js).
- v0.4.2–0.4.3 (2026-11-25, 209 test): launcher phát hiện bản đang chạy (c/k, tắt an toàn bản cũ); đóng Terminal → tắt an toàn (hết 100% CPU, L-024); tab Control "Màn hình phát": bố cục từng bảng + tự ẩn khi cận cảnh; nhạc nền files/YouTube/synth (ADR-0028). Người dùng TỪ CHỐI cấp quyền VRoid Studio → chưa tạo nhân vật mới.
- v0.4.4 (2026-11-25): 6 nhân vật VRoid mới tạo qua computer-use (NovaCauThu01–06), texture ≤1024, nạp ngẫu nhiên tối đa 6 mẫu/lần.
- Chưa làm: tinh chỉnh tư thế VRM, lưu khu vào DB, thông số ZoneDirector trên Control; quyết định Git LFS cho ~47 MB model; xác nhận quyền dùng thương mại model VRoid.

## Đã xong trong phiên này
- `src/game/*` (catalog, progression, GameConfig/Gift Mapping, WorldCore, EventDirector, Leaderboards, publicCatalog), `src/data/gameOps.js` + migration `003_game.sql`, `src/gameRoutes.js` (API Control), hiệu ứng quà gameplay trong `giftApply` (cùng transaction), `effect_params` v2.
- Stage 3D mới (`public/stage/{scene,anglers,audio,main}.js`), trang kiểm tra cũ → `/stage/check.html`; Control đầy đủ 8 tab.
- `server.js`: chế độ chạy (run-mode.json, mặc định Demo), khởi động lại trong tiến trình (mã 75), khôi phục backup đã lên lịch.
- LiveConnector: thêm nhà cung cấp `tiktool` (@tiktool/live, MIT, cần API key qua env) — CHƯA cài gói nào.
- P1 đã làm: dọn applied_ops/committed_batches/buff hết hạn > 7 ngày (op RETENTION, 6 giờ/lần).
- Tài liệu: HUONG_DAN_VAN_HANH, A17_TIKTOK_LIBRARY_DECISION, REVIEW_GIFTJOURNAL_vs_ADR-0018, ADR-0024, LESSONS L-016…L-018.

## Test (kết quả thật)
- `npm test` → **184/184**, portability ĐẠT (15 tệp).
- `node tools/game-bench.js --players 10000 --seconds 90 --gifts 50` → tick p95 7,2 ms, bất biến đúng (docs/evidence/game-bench-10000.json).
- Kiểm tay /stage + /control trong trình duyệt của app (macOS). CHƯA: TikTok thật, OBS, LIVE Studio, Windows, soak 3 giờ, CR1 có WorldCore.

## Lỗi chưa giải quyết
- **P0:** Module 10 chưa kiểm trên LIVE thật. (A17 đã chốt; rủi ro AGPL/Euler Stream người dùng đã chấp nhận — ADR-0025.)
- **P1:** toàn bộ chưa commit; DB ~22 MB/phút ở 10.000 người (chưa nén catches); S4 chưa chặn WS mới/thông báo stage.

## Quyết định đang chờ
1. **Người dùng:** mở LIVE thử + cho username TikTok để chạy Module 10.
2. **Người dùng:** cho phép commit.
3. **ChatGPT:** duyệt ADR-0024 + phiếu đối chiếu GiftJournal/ADR-0018 (2 điểm lệch cũ + gộp sự kiện quà).

## Việc tiếp theo (đúng thứ tự)
1. Khôi phục: `nova-checkpoint.py recover .` → `npm test` (kỳ vọng 184/184).
2. (Đã xong) A17 chốt; người dùng cho phép commit 2026-11-25.
3. Module 10 trên LIVE thử của người dùng → ghi PLATFORM_COMPATIBILITY_MATRIX + TEST_REPORT.
4. Song song: kiểm OBS/LIVE Studio trên Mac của người dùng; soak 3 giờ (`npm start` Demo + theo dõi Control → Hệ thống); crash-suite có WorldCore; nén catches cũ.

<!-- NOVA:AUTO:BEGIN -->
<!-- Khối này do nova-checkpoint ghi; KHÔNG sửa tay. Phần ngoài marker là của người/Claude. -->
**Checkpoint tự động** — 2026-11-25 07:22:36Z · nova-checkpoint 0.2.0
- Dự án: Fishing3D · Nhánh: `main` · HEAD: `4cd21f42f32b` — feat(v0.3.0): gameplay V1 qua Demo + lop luu tru Phase 1; A17 chot tiktok-live-connector@2.5.0
- head=4cd21f42f32b
- File thay đổi chưa commit: 47 (chưa theo dõi: 22)
  - `M` .gitattributes
  - `M` docs/CURRENT_SESSION.md
  - `M` docs/HANDOVER.md
  - `M` docs/LESSONS.md
  - `M` package-lock.json
  - `M` package.json
  - `M` public/control/control.css
  - `M` public/control/control.js
  - `M` public/control/index.html
  - `M` public/stage/anglers.js
  - `M` public/stage/audio.js
  - `M` public/stage/index.html
  - `M` public/stage/main.js
  - `M` public/stage/scene.js
  - `M` public/stage/stage.css
  - `M` server.js
  - `M` src/app.js
  - `M` src/game/GameConfig.js
  - `M` src/game/WorldCore.js
  - `M` src/game/catalog.js
  - `M` src/gameRoutes.js
  - `M` src/http.js
  - `M` src/security/AuthSessions.js
  - `M` tests/http.test.js
  - `M` tests/process.test.js
  - `??` CHAY-GAME-MAC.command
  - `??` docs/ADR/0026-ban-do-rong-khu-cau.md
  - `??` docs/ADR/0027-control-cung-may-khong-ghep-doi.md
  - `??` docs/ADR/0028-bo-cuc-stage-va-nhac-nen.md
  - `??` docs/ASSETS_STAGE.md
  - … và 17 file nữa
- TEST_REPORT cũ hơn thay đổi mã gần nhất (2026-11-25 07:22:03Z) → kết quả test có thể LỖI THỜI, chạy lại trước khi tuyên bố đạt
- Context Window: không đo được ở đây (hook không có số liệu) — checkpoint theo đơn vị công việc
<!-- NOVA:AUTO:END -->
