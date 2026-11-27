# GÓI KIỂM DUYỆT KIẾN TRÚC — NOVA FISHING LIVE 3D v0.0.7 (bản gộp một file)
Gửi: ChatGPT (NOVA Architect & Reviewer) — Người lập: Claude (Lead Developer) — Ngày: 2026-11-24
Trạng thái: **CHỜ CHATGPT DUYỆT. Chưa viết code; Phase 1 chưa bắt đầu.** Claude không tự đánh giá thay ChatGPT. Không chứa bí mật.
Quy chuẩn áp dụng: NOVA v1.0.3 (đã cài; selftest 39/39; nova-check hợp lệ; hook 1.0.3 đang hoạt động).
File này là **bản sao nguyên văn** của các tài liệu trong repo, ghép theo thứ tự dưới đây để duyệt một lần. Nguồn chuẩn vẫn là từng file gốc. Thay thế gói `CHATGPT_REVIEW_PACKAGE_v0.0.6.md`.

## Mục lục
1. Trọng tâm kiểm tra → vị trí trong tài liệu
2. `docs/PROJECT_BRIEF.md`
3. `docs/ARCHITECTURE.md` (0.0.7)
4. ADR 0001–0016 (16 file; ADR-0014 đã bị thay thế bởi ADR-0015)
5. `docs/PLATFORM_COMPATIBILITY_MATRIX.md`
6. Quyết định đã chốt / còn mở / diễn giải cần xác nhận (trích `docs/PROJECT_STATUS.md`)

---
## 1. Trọng tâm kiểm tra → vị trí
| Trọng tâm | Vị trí |
|---|---|
| Kiến trúc server và Three.js | ARCHITECTURE §0, §1 (sơ đồ), §2, §3, Phụ lục A; ADR-0001, 0002, 0007 |
| TikTok Connector và Gift Engine | ARCHITECTURE Phụ lục B, §4 (gift_events journal); ADR-0003, 0006 |
| Multiplayer không giới hạn cứng | ARCHITECTURE §0.1, §1.2; ADR-0005, 0007, 0011 |
| Database và WebSocket | ARCHITECTURE §4, §5; ADR-0010, 0016 |
| Khả năng chạy LIVE trên Mac và Windows | ARCHITECTURE §0.3, §1.4, §8 (phạm vi kiểm thử), §8.1, §8.2, Phụ lục A2; ADR-0015, 0016, 0004, 0012; Matrix |
| Bảo mật, hiệu năng, đóng gói thương mại | ARCHITECTURE §7, §10, Phụ lục A, §8 Phase 8; ADR-0008, 0016 |
| Kế hoạch 8 Phase và tiêu chí nghiệm thu | ARCHITECTURE §8, §8.1, §8.2; PROJECT_BRIEF "Tiêu chí" |
| Lối chơi đã chốt (thế giới liên tục, AFK, BXH, LIVE, múi giờ, Boss) | ARCHITECTURE §0.2, §1.1–1.4, Phụ lục D; ADR-0009, 0010, 0012, 0013 |

---
<!-- ===== BẮT ĐẦU docs/PROJECT_BRIEF.md ===== -->
## 2. PROJECT_BRIEF
_Nguồn: `docs/PROJECT_BRIEF.md`_

# PROJECT BRIEF
- Tên dự án / loại: **NOVA FISHING LIVE 3D** — game (tương tác TikTok LIVE)
- Phiên bản mục tiêu: 1.0.0 (bản phát hành đầu tiên sau 8 Phase); tài liệu hiện tại 0.0.7
- Mục tiêu & lý do: game câu cá 3D chạy liên tục suốt buổi livestream TikTok, giúp tăng tương tác (comment, like, quà) và giữ người xem quay lại nhờ tiến trình lâu dài; bán cho các streamer như các game LIVE trước của người dùng.
- **Phạm vi V1 (người dùng chốt, ADR-0015): vận hành và phát TikTok LIVE trên macOS và Windows ngay từ bản đầu.** Một codebase dùng chung gameplay, backend, DB, TikTok connector, hệ thống quà. Phát qua **OBS Browser Source trên cả hai OS**; **TikTok LIVE Studio kiểm tương thích thực tế riêng từng OS**. Hỗ trợ WebGL2, âm thanh, WebSocket, dọc 1080×1920. Cấu hình và hướng dẫn cài đặt riêng cho macOS và Windows. Trang Control mở bằng trình duyệt máy phát/điện thoại qua LAN.
  - **Thứ tự nghiệm thu (0.0.7):** hiện chỉ có máy Mac → macOS phát triển và nghiệm thu trước; code/dependency tương thích **Windows x64** từ đầu; Windows CI nếu khả thi; kiểm thử thực tế Windows/OBS/LIVE Studio trên Windows ở giai đoạn **Windows Validation** khi có máy. **Windows = nền tảng mục tiêu, CHƯA NGHIỆM THU**. Thiếu máy Windows không chặn Phase 1/2.
- Người dùng cuối: (1) streamer TikTok vận hành game trên Mac qua TikTok LIVE Studio, điều khiển bằng điện thoại; (2) người xem TikTok tham gia bằng comment/quà.
- Chức năng bắt buộc:
  - **Continuous Live World** (ChatGPT chốt phương án B): game chạy liên tục suốt buổi LIVE, không có phiên chơi 10 phút, không reset điểm cá nhân theo thời gian.
  - Tham gia bất cứ lúc nào bằng comment `câu` / `câu cá`; **không giới hạn cứng số cần thủ**; mỗi người có hồ sơ riêng.
  - Tự động câu: quăng → chờ → cá cắn → giật → kéo lên / sổng; loài cá, kg, độ hiếm do server quyết định.
  - AFK: 5 phút không có tương tác hợp lệ → tạm dừng tự quăng; không xoá khỏi game; giữ hồ sơ, điểm, cấp, trang bị, thành tích. Comment lệnh hợp lệ hoặc gửi quà → tự đánh thức. Like đơn lẻ không đánh thức (chống spam).
  - Rời đi → lưu hồ sơ, điểm, thành tích; quay lại → khôi phục.
  - Boss chạy liên tục: mặc định 30 phút/lần (cấu hình trong Admin), Boss đặc biệt triệu hồi bằng quà hợp lệ, có cảnh báo trước khi xuất hiện, không chồng chéo ngoài cấu hình, tự điều chỉnh theo lượng người chơi và trạng thái server.
  - BXH: TOP LIVE (reset khi bắt đầu buổi LIVE mới), TOP giờ (60 phút gần nhất), TOP ngày (ngày Việt Nam), TOP tuần (thứ Hai–Chủ nhật, giờ Việt Nam), TOP tổng (tích luỹ). Xếp theo điểm; bằng điểm thì tổng trọng lượng cá cao hơn xếp trên. TOP 10/50/100 luân phiên trên màn LIVE; Control xem đầy đủ và phân trang. **Chỉ TOP LIVE được reset**; BXH dài hạn lưu độc lập, không reset khi kết thúc LIVE.
  - Buổi LIVE xác định bằng sự kiện bắt đầu/kết thúc thực tế; mất kết nối tạm thời không tạo buổi mới; có phục hồi khi connector khởi động lại.
  - Múi giờ Asia/Ho_Chi_Minh (UTC+7); timestamp lưu UTC trong DB, quy đổi khi hiển thị.
  - Lưu lâu dài: sổ tay cá, cấp độ, trang bị, thành tích.
  - Kết thúc LIVE: lưu trạng thái và kết quả trước khi đóng game; không reset hồ sơ hoặc tiến trình người chơi; thế giới không giới hạn thời gian hoạt động.
  - Quà/like/follow/share → hiệu ứng gameplay, bảng Quà → Hành động cấu hình được (nhiều quà/hành động, bật/tắt hiển thị).
  - Đồ hoạ 3D Three.js, khung dọc 1080×1920 cho TikTok LIVE Studio; chữ tiếng Việt.
  - Trang Control trên điện thoại (xem trước, kết nối, gán quà, BXH, cài đặt, cập nhật bản); chế độ Demo/Mock để thử không cần LIVE.
  - Xử lý hàng nghìn comment/quà: chống trùng, giới hạn tốc độ, hàng đợi ưu tiên; quà không bao giờ mất/cộng hai lần.
- Chức năng mong muốn (sau): TTS đọc tên/quà; nhiều bản đồ/skin; khung ngang 16:9; mở rộng ngang nhiều tiến trình/máy. Mở rộng nền tảng ngoài macOS + Windows chỉ khi người dùng đổi phạm vi (ADR mới).
- Ngoài phạm vi V1: Linux, Android, iOS, ứng dụng native riêng (Electron/Tauri/Swift/WinUI…), web game công khai; quy đổi điểm/vật phẩm ra tiền thật; cờ bạc; tài khoản đăng nhập riêng cho người xem; API TikTok chính thức (không có cho loại game này).
- Ràng buộc: máy dev Apple M1, RAM 8 GB, macOS 26; máy phát của người dùng cuối là macOS hoặc Windows (cấu hình tối thiểu sẽ công bố); một codebase; không đường dẫn tuyệt đối máy Mac, không lệnh/thư viện chỉ chạy trên macOS trong build chung, không phụ thuộc native; Node.js ≥ 22.13 LTS (`node:sqlite`); Three.js; model CC0 low-poly có ghi nguồn; thư viện `tiktok-live-connector` không chính thức; không đưa khoá bí mật vào bản bán.
- **Tiêu chí nghiệm thu V1 (người dùng chốt, có bằng chứng thực tế, ghi PLATFORM_COMPATIBILITY_MATRIX):** (1) game khởi chạy trên macOS; (2) game khởi chạy trên Windows; (3) OBS lấy được hình ảnh game trên cả hai; (4) âm thanh hoạt động; (5) comment và quà TikTok được xử lý; (6) không có lỗi phụ thuộc hệ điều hành; (7) có hướng dẫn cài đặt và vận hành cho cả hai OS. TikTok LIVE Studio: kết quả kiểm từng OS được ghi rõ (không mặc định). Phần Windows của các tiêu chí (2, 3, 4–6, 7) chốt ở giai đoạn Windows Validation; V1 chỉ được tuyên bố "đạt trên Windows" sau giai đoạn đó.
- Tiêu chí hoàn thành bổ sung (đo được, trên từng máy kiểm thử):
  - 30 FPS ở 1080×1920 trên M1 8 GB kèm phần mềm phát (máy Windows: đo ở Windows Validation), với 1.000 và 10.000 người trong thế giới (preset Vừa).
  - Tải 1.000 comment/s + 200 quà/s trong 10 phút: 0 quà mất/trùng, độ trễ quà p95 < 1 s.
  - Tick server p95 < 20 ms ở 10.000 người hoạt động.
  - Chạy liên tục 3 giờ (soak test) không rò bộ nhớ, không lỗi console.
  - Kết thúc LIVE / tắt game: 100% điểm, cá, thành tích đã ghi xuống DB (kiểm bằng test khôi phục).
  - BXH 5 phạm vi (gồm cửa sổ trượt 60 phút và tiêu chí phụ tổng kg) đúng khi so với tính lại từ dữ liệu gốc; chuyển ngày/tuần đúng giờ Việt Nam.
  - Like không đánh thức AFK; comment lệnh/quà đánh thức (test tự động).
  - Mất kết nối / khởi động lại connector không tạo buổi LIVE mới (test tự động + kiểm chứng trên LIVE thật).
- Rủi ro đã biết: xem ARCHITECTURE §10 (thư viện TikTok không chính thức; RAM 8 GB; lũ sự kiện; hỗ trợ WebGL2 của LIVE Studio; bản quyền model/âm thanh; chính sách TikTok).
- Điểm chưa rõ cần hỏi: xem PROJECT_STATUS mục "Chặn".
- Người duyệt: ChatGPT (Architect & Reviewer) — Người dùng quyết định cuối
<!-- ===== KẾT THÚC docs/PROJECT_BRIEF.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ARCHITECTURE.md ===== -->
## 3. ARCHITECTURE (0.0.7)
_Nguồn: `docs/ARCHITECTURE.md`_

# ARCHITECTURE — NOVA FISHING LIVE 3D
Phiên bản tài liệu: 0.0.7 (đề xuất cuối) — Ngày: 2026-11-24 — Trạng thái: **CHỜ CHATGPT DUYỆT KIẾN TRÚC CẬP NHẬT** — mục tiêu V1 macOS + Windows; **Windows: nền tảng mục tiêu, CHƯA NGHIỆM THU** (chưa có máy Windows)
Quyết định đã chốt: **Continuous Live World (phương án B, ChatGPT chốt)** · mỗi người xem là 1 cần thủ · **số cần thủ KHÔNG giới hạn** · AFK 5 phút (chỉ lệnh hợp lệ/quà đánh thức) · BXH LIVE / 60 phút gần nhất / ngày VN / tuần VN / tổng (điểm, phụ: tổng kg) · Asia/Ho_Chi_Minh, lưu UTC · Boss 30 phút + Boss quà · tiến trình lâu dài · **Phạm vi V1: phát TikTok LIVE trên macOS + Windows, OBS Browser Source cả hai, TikTok LIVE Studio kiểm riêng từng OS (ADR-0015)** · Three.js trên trình duyệt · TikTok LIVE Studio dọc 1080×1920 · bán thương mại + model CC0 low-poly.
Lịch sử: 0.0.1 (16 ô, phiên 10 phút) → 0.0.2 (không giới hạn cần thủ, ADR-0005…0008) → 0.0.3 (bỏ phiên chơi, thế giới liên tục, ADR-0009…0012) → **0.0.4: chốt AFK, BXH (giờ = cửa sổ trượt 60 phút, tiêu chí phụ tổng kg), định danh buổi LIVE theo sự kiện thật, múi giờ/UTC, hệ thống Boss (ADR-0013)** → 0.0.5: phạm vi TikTok LIVE chỉ macOS (ADR-0014, **đã bị thay thế**) → **0.0.6: người dùng chỉnh phạm vi V1 = macOS + Windows ngay từ bản đầu (ADR-0015), bỏ phụ thuộc native (ADR-0016)**. → 0.0.7: chỉ có máy Mac — macOS nghiệm thu trước; Windows x64 tương thích từ thiết kế + CI nếu khả thi; kiểm thử thực tế Windows chuyển sang giai đoạn Windows Validation (§8.2), không chặn Phase 1/2.

## 0. Nguyên tắc nền
**0.1 Không giới hạn người chơi (ADR-0005)**
1. Không có giới hạn cứng số người chơi trong logic game, DB, API, giao diện, tài liệu.
2. Gameplay ≠ hiển thị: server giữ trạng thái mọi cần thủ; client chỉ vẽ chi tiết người trong vùng camera/khu gameplay. Không được vẽ vẫn câu, vẫn cộng điểm, vẫn lên BXH.
3. Giới hạn vận hành (tốc độ sự kiện, kích thước hàng đợi, ngân sách render, tần suất WS, cỡ lô DB, số hồ sơ giữ "nóng" trong RAM) là **cấu hình bảo vệ máy**. Khi chạm ngưỡng: giảm chất lượng / gộp / trễ / chuyển hồ sơ sang "lạnh" (DB). **Không từ chối người tham gia, không bỏ quà, không xoá người chơi.**
4. Không thay giới hạn 16 cũ bằng bất kỳ con số cứng nào khác.

**0.2 Thế giới liên tục (ADR-0009)**
1. **Không có phiên chơi, không có vòng đếm giờ, không có màn tổng kết định kỳ.** Thế giới câu cá chạy liên tục suốt thời gian LIVE.
2. Người xem tham gia bất cứ lúc nào bằng comment `câu` / `câu cá` (lệnh cấu hình được).
3. **Điểm cá nhân, cấp độ, trang bị, sổ tay cá, thành tích không bao giờ reset theo thời gian.**
4. BXH theo thời gian là **cửa sổ tính trên sổ cái điểm**, không xoá điểm cá nhân: TOP giờ = **60 phút gần nhất (cửa sổ trượt)**; TOP ngày/tuần = kỳ lịch Việt Nam, kỳ cũ được lưu lại.
5. **Dữ liệu duy nhất được reset là TOP LIVE**, và chỉ khi xác nhận buổi LIVE mới (§1.3). Kết thúc LIVE không reset hồ sơ, tiến trình hay bất kỳ BXH dài hạn nào; các BXH dài hạn lưu độc lập.
6. Không giới hạn thời gian hoạt động của thế giới.

**0.3 Phạm vi nền tảng V1 (ADR-0015, người dùng quyết định — thay thế ADR-0014)**
1. Mục tiêu V1: game **vận hành và phát TikTok LIVE được trên macOS và Windows**. Code và dependency **tương thích Windows x64 ngay từ đầu** (không làm Mac-only rồi viết lại). Thứ tự **nghiệm thu**: macOS trước (chỉ có máy Mac); Windows là **nền tảng mục tiêu, CHƯA NGHIỆM THU** cho đến giai đoạn Windows Validation (§8.2). Thiếu máy Windows **không chặn** Phase 1 hay Phase 2 (người dùng chốt).
2. **Một codebase** dùng chung: Gameplay Engine (WorldCore), Backend, Database, TikTok Connector, hệ thống Gift, trang /stage và /control. Khác biệt theo OS chỉ nằm ở: launcher, `config/platform/<os>.json`, hướng dẫn cài đặt, `src/system/platform.js` (mở trình duyệt, thư mục dữ liệu, xử lý tín hiệu tắt).
3. Phát sóng: **OBS Browser Source** là đường phát độc lập phải chạy trên cả macOS và Windows; **TikTok LIVE Studio** được kiểm tra tương thích **riêng từng OS** — không mặc định là có/chạy được trên cả hai.
4. Yêu cầu chung cho mọi đường phát: WebGL2, âm thanh, WebSocket, khung dọc 1080×1920.
5. Cấm trong code và quy trình build chung: đường dẫn tuyệt đối của máy Mac (`/Users/...`), lệnh shell chỉ có trên macOS (`chmod`, `xattr`, `open`, `zip`, `sed -i ''`…), thư viện chỉ chạy trên macOS, phụ thuộc native phải biên dịch theo OS (ADR-0016). Build/đóng gói/test viết bằng Node (`tools/*.js`).
6. **Chưa triển khai:** Linux, Android, iOS, ứng dụng native riêng (Electron/Tauri/Swift/WinUI). Kiến trúc vẫn giữ mở rộng được.
7. Bằng chứng bắt buộc: **Platform Compatibility Matrix** (`docs/PLATFORM_COMPATIBILITY_MATRIX.md`) ghi kết quả kiểm thử **thực tế** từng OS × đường phát. Cột Windows giữ trạng thái "chưa nghiệm thu" đến khi có máy Windows; kết quả CI Windows (nếu có) ghi riêng, **không** thay cho nghiệm thu thực tế.
8. Mở rộng thêm nền tảng = thay đổi phạm vi: người dùng quyết định, ChatGPT duyệt, ADR mới.

## 1. Tổng quan & sơ đồ thành phần
Game câu cá 3D tương tác TikTok LIVE, chạy liên tục. Người xem comment `câu`/`câu cá` để có hồ sơ cần thủ và một vị trí trên bờ hồ (bờ hồ sinh thủ tục, mở rộng theo số người). Quà/like/follow tạo hiệu ứng; Boss và sự kiện thế giới diễn ra liên tục. Server Node chạy toàn bộ luật chơi; trang 3D chỉ hiển thị.

```
 TikTok LIVE ─(tiktok-live-connector)─┐      MockConnector / LoadGenerator ─┐
                                      ▼                                    ▼
                    ┌──────────── INGEST (LiveConnector adapter) ───────────┐
                    │ chuẩn hoá → Dedupe (LRU+TTL, streak) → RateLimiter     │
                    │ → GiftJournal (ghi bền DB TRƯỚC) → EventBus            │
                    └───────────────────────┬────────────────────────────────┘
                                            ▼
                    PriorityEventQueue có giới hạn (P0 hệ thống/streamEnd · P1 quà ·
                    P2 tham gia · P3 lệnh · P4 like/share gộp) → xử lý theo lô, ngân sách ms/tick
     ┌──────────────────────────── WORLD CORE (headless, nguồn sự thật, chạy liên tục) ───────────┐
     │ WorldClock & WorldLifecycle (STOPPED/RUNNING/PAUSED) · LiveSessionManager (buổi LIVE)       │
     │ PlayerRegistry nóng/lạnh: hồ sơ hoạt động trong RAM, hồ sơ cũ ở DB, nạp lại khi quay lại   │
     │ PresenceTracker: ACTIVE → AFK (5 phút, chỉ lệnh/quà đánh thức) · tầng COLD = chỉ ở DB    │
     │ FishingScheduler (min-heap, chi phí theo sự kiện đến hạn) · FishingSim · LootTable · RNG  │
     │ WorldEventScheduler: Boss / mưa / giờ vàng theo LỊCH + theo SỰ KIỆN LIVE (quà, mốc like)  │
     │ Progression: XP/Cấp · Trang bị & túi đồ · Sổ tay cá · Thành tích (đánh giá theo sự kiện) │
     │ ScoreLedger (sổ cái điểm bất biến) → Leaderboards: LIVE · giờ · ngày · tuần · tổng        │
     │ WorldLayout + SpatialIndex · BuffManager · shard-ready (partitionKey = hash(userId))      │
     └──────────────┬──────────────────────────────┬──────────────────────────────┬──────────────┘
                    ▼ write-behind theo lô          ▼ InterestManager              ▼ REST phân trang
          Persistence (SQLite WAL; flush khi    WS Gateway /ws: stage = vùng camera  /api/leaderboard
          kết thúc LIVE / tắt game; repo        + spotlight + số liệu gộp;          /api/players
          interface → Postgres/Redis)           control = tổng quan + metrics
                                                         ▼
   /stage (Three.js, Browser Source LIVE Studio 1080×1920)
   CrowdRenderer: InstancedMesh + LOD 0–3 + Frustum Culling + SpatialGrid + Object Pool
   SpotlightDirector · WorldEvent/Boss view · FX/EventQueue · AudioQueue · HUD/BXH luân phiên
```
Nguyên tắc chung: server quyết định mọi kết quả; tách 5 lớp (vòng lặp · trạng thái · render · âm thanh · nhập liệu); khởi động lại server → khôi phục thế giới từ DB + journal quà.

### 1.1 Vòng đời thế giới
`STOPPED → RUNNING ⇄ PAUSED → STOPPED`
- `RUNNING`: thế giới chạy liên tục; không có pha đếm giờ hay tổng kết.
- `PAUSED` (Control bấm Tạm dừng, hoặc tuỳ chọn tự dừng khi mất kết nối TikTok): đóng băng FishingScheduler và WorldEventScheduler (thời điểm hẹn được dịch theo thời gian dừng), vẫn nhận/journal quà.
- `STOPPED`: chỉ sau khi đã lưu toàn bộ (§1.4).

### 1.2 Vòng đời cần thủ (server)
- Hoạt động câu: `CASTING → WAITING → BITE → FIGHTING → CAUGHT | ESCAPED → CASTING …` — mỗi bước là một mục hẹn giờ trong FishingScheduler.
- Hiện diện (`PresenceTracker`):
  - `ACTIVE`: đang tự quăng.
  - **Tương tác hợp lệ (đã chốt)** = (a) comment là **lệnh hợp lệ** (khớp danh sách lệnh của game, vd `câu`, `câu cá`, `hạng`…; comment thường không phải lệnh không tính) hoặc (b) **gửi quà**. **Like đơn lẻ không tính** (chống spam). Follow/share không nằm trong danh sách đánh thức nên cũng không tính (diễn giải theo quyết định; xem mục "Diễn giải đã áp dụng" trong PROJECT_STATUS).
  - `AFK`: **5 phút** (mặc định, cấu hình) không có tương tác hợp lệ → tạm dừng tự quăng cần. **Không bị xoá khỏi game**; giữ nguyên hồ sơ, điểm, cấp, trang bị, thành tích, vị trí, thứ hạng, buff còn hạn. Tương tác hợp lệ → tự đánh thức → `ACTIVE`.
  - `COLD` (tầng lưu trữ, **không phải trạng thái gameplay**): AFK quá ngưỡng vận hành (cấu hình, mặc định 30 phút) hoặc khi kết thúc LIVE → hồ sơ đã ghi đủ xuống DB được bỏ khỏi RAM, vị trí hiển thị được giải phóng. Với người chơi, đây vẫn là AFK. **Không xoá người chơi.**
  - Đánh thức từ COLD (cùng điều kiện tương tác hợp lệ): nạp hồ sơ từ DB → khôi phục cấp, trang bị, túi đồ, sổ tay, thành tích, điểm → cấp vị trí bờ hồ → `ACTIVE`. Sự kiện của người đó chờ trong hàng đợi đến khi nạp xong.
- TikTok không báo "người xem rời đi" đáng tin cậy, nên "rời đi" được suy ra từ AFK/COLD và kết thúc LIVE. Hồ sơ luôn được ghi xuống DB liên tục (write-behind), không chỉ lúc rời.

### 1.3 Vòng đời buổi LIVE (LiveSessionManager) — định danh theo sự kiện thật (đã chốt)
- Một **buổi LIVE** = một bản ghi `live_sessions` (id, @username, room_id TikTok, started_at, ended_at, status, end_reason). Buổi LIVE được xác định bằng **sự kiện bắt đầu và kết thúc thực tế**, không theo giờ, không theo lần kết nối.
- **Bắt đầu thực tế:** kết nối TikTok thành công vào phòng đang phát với `room_id` **chưa từng gắn với buổi LIVE nào** → tạo buổi mới (TikTok cấp `room_id` mới cho mỗi lần phát). Đây là **xác nhận buổi LIVE mới** → chốt TOP LIVE cũ (snapshot) và mở TOP LIVE mới.
- **Kết thúc thực tế:** sự kiện `streamEnd` từ TikTok (`end_reason = STREAM_END`) hoặc người vận hành bấm "Kết thúc LIVE" trên Control (`MANUAL`) → luồng §1.4.
- **Mất kết nối tạm thời** (rớt mạng, connector khởi động lại, server khởi động lại) **không tạo buổi mới**: kết nối lại cùng `room_id` → tiếp tục buổi đang ACTIVE, TOP LIVE giữ nguyên.
- **Phục hồi khi connector/server khởi động lại:** khi khởi động, nạp buổi `ACTIVE` gần nhất từ DB (trạng thái `RECOVERING`) → kết nối lại:
  - cùng `room_id` → tiếp tục (ACTIVE);
  - `room_id` khác → buổi cũ đóng với `end_reason = INFERRED` (ended_at = thời điểm sự kiện cuối cùng nhận được), rồi tạo buổi mới như "bắt đầu thực tế";
  - streamer không còn phát (không kết nối được vì LIVE đã tắt) → buổi cũ giữ `RECOVERING`, **không poll**; người vận hành bấm "Kết nối" lại khi phát, hoặc bấm "Đóng buổi LIVE cũ".
- Trường hợp không có `room_id` đáng tin (chế độ DEMO, hoặc thư viện không trả về): chỉ tạo buổi mới qua nút **"Bắt đầu buổi LIVE mới"** trên Control (cần `confirm`). DEMO có buổi riêng (`is_demo`), không trộn BXH thật.
- Hành vi `room_id` qua các lần nối lại sẽ được **kiểm chứng thực tế ở Phase 2**; nếu khác giả định, phương án dự phòng là nút xác nhận trên Control (ghi vào sổ bài học).

### 1.4 Kết thúc LIVE & tắt game (ADR-0012)
Kích hoạt bởi: `streamEnd` từ TikTok, nút "Kết thúc LIVE" / "Thoát an toàn" trên Control (**đường chính trên cả hai OS**), hoặc tín hiệu tắt tiến trình: macOS SIGINT/SIGTERM/SIGHUP; Windows Ctrl+C (SIGINT), Ctrl+Break (SIGBREAK), đóng cửa sổ console (SIGHUP — Windows chỉ cho khoảng vài giây trước khi buộc tắt, nên luồng tắt có trần ngắn và dựa vào write-behind ≤ 500 ms để không mất quá một lô).
1. Ngừng nhận sự kiện mới (connector ngắt, **không tự nối lại, không poll**).
2. Xả hàng đợi sự kiện còn lại (trần thời gian cấu hình, mặc định 10 s); quà chưa xử lý vẫn nằm trong journal ở trạng thái RECEIVED và sẽ được áp dụng khi khởi động lần sau — **không mất**.
3. Kết thúc các cú câu đang dở theo luật (đề xuất: cá đang FIGHTING được giải quyết ngay theo RNG đã gieo; WAITING thì huỷ, không mất gì).
4. Flush toàn bộ write-behind trong một giao dịch, rồi chuyển mọi hồ sơ sang tầng COLD (không đổi tiến trình người chơi).
5. Chốt TOP LIVE (snapshot), cập nhật BXH giờ/ngày/tuần/tổng, ghi `live_sessions.ended_at` + tổng kết buổi (số người, số cá, cá hiếm nhất, quà).
6. Thế giới → `STOPPED`; ghi log "đã lưu an toàn" và hiển thị trên Control; chỉ sau đó tiến trình mới thoát.
- Sập đột ngột (mất điện): SQLite WAL + journal quà + write-behind ngắn (≤ 500 ms) → mất tối đa một lô điểm chưa ghi; quà không mất. Lần khởi động sau tự phát hiện buổi LIVE chưa đóng và hỏi tiếp tục/đóng.

## 2. Công nghệ (kèm lý do chọn)
| Thành phần | Chọn | Lý do | Đã loại |
|---|---|---|---|
| Runtime | Node.js **≥ 22.13 LTS** (có `node:sqlite` không cần cờ), ES Modules | Cùng stack game LIVE trước; một runtime cho macOS (arm64, x64) và Windows (x64) | Bun; Node 20 (không có `node:sqlite` ổn định) |
| HTTP/WS | `express@4`, `ws@8` (+ gói nhị phân cho delta nếu đo thấy cần) | Đã chạy ổn định | socket.io |
| TikTok | `tiktok-live-connector@2.5.0` (ghim; thư viện duy nhất được cài) | Bản đang chạy ở game cũ | `@tiktool/live` (chỉ ghi nhận làm phương án nếu thư viện chính hỏng; không cài) |
| DB | **`node:sqlite` (tích hợp sẵn trong Node, WAL, ghi theo lô)**; repository interface (ADR-0016) | Không có module native → cùng một gói chạy trên cả macOS và Windows, không cần biên dịch theo OS | `better-sqlite3` (native, cần bản dựng riêng theo OS/arch) |
| Bus/hàng đợi | Interface `EventBus` + in-process (bản 1) | Không thêm hạ tầng ở bản 1 | Kafka |
| Thời gian | **Lưu timestamp UTC (INTEGER ms) trong DB**; quy đổi `Asia/Ho_Chi_Minh` (UTC+7) bằng `Intl` khi tính kỳ ngày/tuần và khi hiển thị | Không thêm thư viện; không phụ thuộc múi giờ máy | moment; lưu giờ địa phương |
| Font | Font tiếng Việt đi kèm (giấy phép OFL, tự host) | Chữ tiếng Việt hiển thị giống nhau trên macOS/Windows/OBS/LIVE Studio | Font hệ thống (khác nhau theo OS) |
| 3D | `three` (ghim r17x, tự host) + GLTFLoader, meshopt/Draco, InstancedMesh/BatchedMesh | Nhẹ, nhúng Browser Source | Babylon/Godot/Unity |
| Animation đám đông | Vertex animation/pose cho LOD1; AnimationMixer chỉ LOD0 | Hàng nghìn instance rẻ | Skinned mesh cho mọi người |
| Chữ tên | Atlas canvas/SDF dùng pool | Tránh hàng nghìn DOM/texture | CSS2DRenderer |
| Test | `node:test`, `node:assert` + `tools/load-test.js` | Có sẵn | Jest/Vitest |
| Âm thanh | WebAudio, AudioManager tự viết | Ưu tiên, huỷ, trần thời gian | Howler |
| Đóng gói | `tools/pack-release.js` (Node thuần, tạo 2 gói `macos` / `windows` từ cùng mã nguồn; đặt quyền thực thi trong mục zip cho file `.command`), obfuscate tuỳ chọn; launcher `.command` (macOS) + `.bat` (Windows) | Không phụ thuộc lệnh shell riêng OS khi build | Electron/Tauri (app native, ngoài phạm vi); script bash/PowerShell trong quy trình build |

## 3. Cấu trúc thư mục
```
Fishing3D/
├─ server.js                 launcher Node dùng chung (tự khởi động lại khi cập nhật/lỗi; chuyển tiếp tín hiệu tắt để lưu an toàn)
├─ launchers/ macos/ (start.command · start-dien-thoai.command) · windows/ (start.bat · start-dien-thoai.bat) — vỏ mỏng, chỉ gọi `node server.js`
├─ .gitattributes             (`*.bat` CRLF, `*.command` LF — tránh hỏng launcher khi đổi OS)
├─ package.json · package-lock.json · .env.example · .gitignore
├─ config/ default.json (thời gian câu, AFK, ngưỡng vận hành, múi giờ) · platform/darwin.json · platform/win32.json (preset đồ hoạ mặc định, thư mục dữ liệu, mở trình duyệt) · render-presets.json
│          fish.json · equipment.json · achievements.json · levels.json · world-events.json · gifts.default.json
├─ src/
│  ├─ app.js · http.js (Express) · auth.js · shutdown.js (luồng kết thúc an toàn §1.4)
│  ├─ ingest/  LiveConnector.js · MockConnector.js · LoadGenerator.js · Normalizer.js · Dedupe.js · RateLimiter.js · GiftJournal.js
│  ├─ bus/     EventBus.js (interface) · InProcessBus.js · PriorityEventQueue.js
│  ├─ world/   WorldCore.js · WorldLifecycle.js · WorldClock.js · LiveSessionManager.js
│  │           WorldEventScheduler.js (Boss/sự kiện theo lịch + theo LIVE) · BossFight.js · BuffManager.js
│  │           WorldLayout.js (bờ hồ theo số người) · SpatialIndex.js (lưới băm)
│  ├─ players/ PlayerRegistry.js (nóng/lạnh) · PresenceTracker.js (ACTIVE/AFK + tầng COLD) · CommentCommands.js
│  ├─ fishing/ FishingScheduler.js (min-heap) · FishingSim.js · LootTable.js · rng.js
│  ├─ progression/ Leveling.js · Equipment.js · Inventory.js · FishDex.js · Achievements.js
│  ├─ rank/    ScoreLedger.js · Leaderboards.js (LIVE/giờ/ngày/tuần/tổng) · PeriodKeys.js · LeaderboardRepo.js
│  ├─ net/     WsGateway.js · InterestManager.js · codec.js
│  ├─ data/    Db.js · WriteBehind.js · migrations/ · repositories/
│  ├─ system/  Logger.js · Settings.js · Metrics.js · Updater.js (ghi tạm rồi đổi file sau khi khởi động lại — Windows khoá file đang chạy) · License.js · **platform.js** (điểm duy nhất chứa khác biệt OS)
│  └─ shared/  protocol.js
├─ public/
│  ├─ stage/   index.html · main.js · render/ · crowd/ (CrowdRenderer, LodManager, SpatialGrid, InstancePool, NameTagAtlas)
│  │           actors/ · director/ (SpotlightDirector, CameraRig) · events/ (BossView, WeatherFx) · fx/ · hud/ · audio/
│  ├─ control/ index.html · control.js · control.css
│  ├─ shared/  ws-client.js · protocol.js
│  └─ vendor/  three.module.min.js
├─ assets/ models/*.glb (kèm LOD) · textures/ · audio/ · fonts/ · CREDITS.md
├─ tools/  simulate-balance.js · load-test.js · pack-release.js · check-assets.js · verify-leaderboards.js · check-portability.js (quét đường dẫn tuyệt đối, lệnh riêng OS, tên file phân biệt hoa thường)
├─ tests/  unit/ · integration/ · load/ · run-tests.js
├─ data/   (runtime, bỏ qua bởi git) db, backups, logs
└─ docs/   PROJECT_BRIEF · ARCHITECTURE · PROJECT_STATUS · ADR/ · LESSONS.md · **PLATFORM_COMPATIBILITY_MATRIX.md** · **INSTALL_MACOS.md** · **INSTALL_WINDOWS.md** · báo cáo NOVA
```

## 4. Dữ liệu / Database (SQLite WAL, migration đánh số trong `src/data/migrations/`)
Không có cột/ràng buộc nào giới hạn số người chơi. **Mọi timestamp lưu UTC dạng INTEGER (ms)**; trọng lượng lưu `weight_g` INTEGER (gam) để so sánh chính xác. Ghi theo lô (write-behind, mặc định 500 ms / 500 bản ghi); **quà ghi ngay** vào journal; flush toàn bộ khi kết thúc LIVE/tắt game.
| Bảng | Nội dung | Chỉ mục / ràng buộc |
|---|---|---|
| settings | Cấu hình Admin (JSON, có phiên bản) | |
| world_state | Trạng thái thế giới (lifecycle, thời tiết, sự kiện đang chạy, seed, thời điểm hẹn) để khôi phục | 1 dòng |
| live_sessions | Buổi LIVE: username, room_id, started_at, ended_at, status (ACTIVE/RECOVERING/ENDED), end_reason (STREAM_END/MANUAL/INFERRED), last_event_at, is_demo, tổng kết | (status), room_id UNIQUE (trừ DEMO) |
| players | Hồ sơ lâu dài theo `tiktok_user_id` (+is_demo): tên hiển thị, ngoại hình, **xp, level, total_score, total_weight_g**, first_seen, last_seen | PK user_id |
| player_presence | ACTIVE/AFK, vị trí bờ, last_valid_interaction_at (UTC), buổi LIVE gần nhất | PK user_id |
| player_equipment | Cần/mồi/phụ kiện đang trang bị | PK (user_id, slot_type) |
| player_inventory | Túi đồ (vật phẩm, số lượng, hạn dùng) | (user_id), CHECK qty ≥ 0 |
| fishdex | Sổ tay cá: loài đã câu, số lần, kg lớn nhất, lần đầu | PK (user_id, species_id) |
| player_achievements | Thành tích đạt được + thời điểm + tiến độ | PK (user_id, achievement_id) |
| catches | Mỗi lần câu: loài, bậc, kg, điểm, buff, live_session_id, world_event_id, thời điểm | (user_id, caught_at), (live_session_id) |
| score_ledger | Sổ cái điểm **bất biến** (mỗi dòng: user, điểm cộng, weight_g, nguồn, at_utc, live_session_id) — nguồn gốc để tính/khôi phục mọi BXH, kể cả cửa sổ 60 phút | (at_utc), (live_session_id), (user_id, at_utc) |
| leaderboard_scores | Điểm + trọng lượng theo phạm vi kỳ: `scope ∈ {live, day, week, all}`, `period_key` (`live:<id>`, `day:2026-11-24`, `week:2026-W48` theo giờ VN, `all`), cột score, weight_g, reached_at_utc. **TOP giờ không lưu ở đây** (cửa sổ trượt, xem ADR-0010) | PK (scope, period_key, user_id); (scope, period_key, score DESC, weight_g DESC, reached_at_utc ASC) |
| leaderboard_snapshots | Chốt TOP khi đóng kỳ / kết thúc hoặc thay buổi LIVE; TOP giờ chụp mỗi giờ tròn để làm lịch sử | (scope, period_key, rank) |
| world_events | Lịch sử Boss/sự kiện: loại (SCHEDULED_BOSS/GIFT_BOSS/…), nguồn, người triệu hồi, warned_at, started_at, ended_at (UTC), HP gốc, số người ACTIVE lúc bắt đầu, kết quả | (started_at) |
| world_event_contrib | Đóng góp của từng người trong Boss/sự kiện (phần thưởng) | PK (event_id, user_id) |
| fish_species / equipment_defs / achievement_defs | Danh mục nạp từ `config/*.json`, có version | |
| gift_catalog · gift_rules · gift_events (journal: `source_event_id UNIQUE`, RECEIVED → APPLIED / FAILED) | Như 0.0.2 | |
| event_logs / comment_logs | Nhật ký (lấy mẫu khi tải cao), tự dọn 30/7 ngày | |
- Lưu giữ dữ liệu: `score_ledger`, `catches` có thể gộp/nén theo tháng (cấu hình) khi DB lớn; **không** xoá hồ sơ, sổ tay, thành tích, BXH tổng.
- Hướng mở rộng: Postgres (dữ liệu bền) + Redis sorted set (BXH nóng).

## 5. API
Công khai (chỉ đọc): `GET /api/health`, `GET /api/state` (tóm tắt thế giới), WebSocket `/ws?role=stage`.
**BXH (toàn bộ người chơi, phân trang):**
- `GET /api/leaderboard?scope=live|hour|day|week|all&period=<khoá kỳ, mặc định kỳ hiện tại; scope=hour luôn là 60 phút gần nhất>&top=10|50|100`
- `GET /api/leaderboard?scope=…&period=…&cursor=<rank>&limit=<1..200>` (giới hạn trang, không phải giới hạn người chơi)
- `GET /api/leaderboard/rank/:userId?scope=…&period=…` → hạng + điểm + lân cận ±5
- `GET /api/leaderboard/periods?scope=…` → danh sách kỳ đã lưu (lịch sử TOP LIVE, giờ, ngày, tuần)
- `GET /api/players?search=&cursor=&limit=` · `GET /api/players/:userId` (hồ sơ, cấp, trang bị, sổ tay, thành tích)
Admin (header `x-admin-token`; trên chính Mac có thể bỏ mật khẩu; từ LAN bắt buộc mật khẩu + giới hạn tần suất):
- `POST /api/admin/login`
- `POST /api/world/{start|pause|resume|stop}` (stop = luồng lưu an toàn §1.4)
- `POST /api/live/{connect|disconnect|demo}` · `POST /api/live/new-session` (`confirm`, chỉ khi không có room_id đáng tin) · `POST /api/live/end` (luồng §1.4) · `POST /api/live/close-recovering` (`confirm`)
- `POST /api/world-events/{trigger|cancel}` · `GET/PUT /api/world-events/schedule` (chu kỳ Boss, thời gian cảnh báo, số Boss đồng thời tối đa, hệ số theo người chơi)
- `POST /api/demo/{comment|gift|like|bulk-join}` · `POST /api/demo/load {players, eventsPerSec, seconds}` (chỉ DEMO)
- `GET/PUT /api/settings` · `GET/PUT /api/gift-rules` · `POST /api/gifts/sync`
- `GET /api/metrics` · `GET /api/logs` · `POST /api/db/{backup|restore}` · `POST /api/admin/update` (zip)
Lỗi: `{ ok:false, code, message }` (tiếng Việt); thao tác nguy hiểm cần `confirm`.

**WebSocket (InterestManager — không phát toàn bộ người chơi):**
- server → stage: `snapshot` (bố cục bờ hồ + người trong vùng quan tâm + sự kiện thế giới đang chạy), `interest_delta` (10 Hz), `aggregate` (1 Hz: tổng người ACTIVE/AFK, cá/phút, mật độ đoạn bờ), `event` (cá hiếm, quà, lên cấp, thành tích, Boss bắt đầu/máu/kết thúc, thời tiết — có ưu tiên), `top` (khi đổi, theo phạm vi đang luân phiên), `live_status`, `world_status`.
- stage → server: `viewport`.
- control: tổng quan + metrics + BXH theo trang + trạng thái lưu an toàn.

## 6. Giao diện (màn hình, luồng chính)
- **/stage (1080×1920):** hồ 3D chạy liên tục, bờ hồ mở rộng theo số người. SpotlightDirector đưa lên hình người vừa tặng quà, câu cá hiếm, lên cấp, mới vào/quay lại, TOP đầu; đoạn bờ còn lại là đám đông LOD thấp; người AFK có tư thế ngồi nghỉ (LOD1) hoặc ẩn (LOD2/3).
  - Trên cùng: tên thế giới, đồng hồ giờ Việt Nam, thời tiết, **tổng số cần thủ đang hoạt động**, thanh sự kiện/Boss (cảnh báo đếm ngược trước khi Boss xuất hiện, máu, thời gian còn lại).
  - Nửa trên phải: **BXH luân phiên (đã chốt)** qua 5 phạm vi TOP LIVE → TOP 60 phút → TOP ngày → TOP tuần → TOP tổng và 3 cỡ TOP 10 / TOP 50 / TOP 100. TOP 50/100 hiển thị dạng trang 10 dòng tự lật (chữ đủ lớn cho khung dọc). Chu kỳ và bật/tắt từng bảng/cỡ cấu hình ở Control. Xếp theo **điểm**, bằng điểm thì **tổng kg** cao hơn xếp trên.
  - Giữa: banner cá hiếm / quà / lên cấp / thành tích / Boss (EventQueue có ưu tiên và trần thời gian).
  - Comment `hạng`/`top` → banner ngắn: hạng của người đó ở TOP LIVE + TOP tổng, cấp, cá hiếm nhất (gộp khi đông). Comment `túi`/`sổ tay` (tuỳ chọn) → thẻ tóm tắt.
  - Chừa 1/3 dưới và mép phải cho TikTok.
  - **Không có** màn đếm ngược/tổng kết phiên.
- **/control (điện thoại):** kết nối LIVE, **Bắt đầu buổi LIVE mới / Kết thúc LIVE (lưu an toàn)**, Tạm dừng/Tiếp tục thế giới, kích hoạt/huỷ sự kiện, cấu hình Boss (chu kỳ, cảnh báo, số Boss đồng thời, hệ số theo người chơi), xem trước stage, **BXH đầy đủ 5 phạm vi, phân trang toàn bộ người chơi** + tìm người chơi + xem hồ sơ, gán quà, cài đặt (AFK, ngưỡng vận hành, múi giờ, chu kỳ luân phiên BXH), metrics tải, bắn sự kiện thử/tải thử, sao lưu, cập nhật bản.
- Luồng LIVE (cả hai OS): bấm đúp launcher (`start.command` trên macOS / `start.bat` trên Windows) → /control tự mở → thêm Browser Source `http://127.0.0.1:<port>/stage` vào OBS hoặc TikTok LIVE Studio (theo hướng dẫn riêng từng OS) → @username → Kết nối → (room_id mới = buổi LIVE mới, TOP LIVE mới; cùng room_id = tiếp tục) → thế giới RUNNING → người xem comment `câu` bất cứ lúc nào → … → `streamEnd` hoặc bấm Kết thúc → lưu an toàn → "Đã lưu" → đóng game.

## 7. Bảo mật
- Bí mật chỉ trong `.env`; `.env.example` khoá giả; `.env` trong `.gitignore`.
- Server nghe `127.0.0.1` mặc định; chế độ điện thoại `HOST=0.0.0.0` bắt buộc mật khẩu Admin.
- Validate mọi đầu vào (comment, tên người dùng giới hạn độ dài + lọc ký tự điều khiển, zip chống path traversal).
- RateLimiter chống spam (mỗi người) và quá tải (toàn cục); REST có giới hạn tần suất.
- Hồ sơ lâu dài chỉ lưu dữ liệu cần cho game (ID, tên hiển thị, tiến trình); không lưu bình luận đầy đủ lâu dài; có chức năng xoá hồ sơ theo yêu cầu (Admin, cần `confirm`).
- Bản bán chỉ chứa khoá công khai; `npm audit` mỗi lần bàn giao; backup DB tự động trước cập nhật bản.

## 8. Kế hoạch triển khai theo module (8 Phase, mỗi Phase = test thật + PROJECT_STATUS + bàn giao ChatGPT)
**Phạm vi kiểm thử (ADR-0015, cập nhật 0.0.7):**
- **macOS (máy thật MAC-1):** toàn bộ test tự động + kiểm thử thực tế với OBS và TikTok LIVE Studio + nghiệm thu từng Phase.
- **Windows — trước khi có máy:** (a) thiết kế tương thích Windows x64 (ADR-0015/0016); (b) `tools/check-portability.js` chạy mỗi lần test trên Mac; (c) **Windows CI nếu khả thi**: GitHub Actions `windows-latest` (x64) chạy `npm ci`, `npm test`, `check-portability`, `pack-release --target windows` — cần repo GitHub riêng tư (mục A14). CI chỉ chứng minh backend/build không lỗi phụ thuộc OS, **không** chứng minh OBS/LIVE Studio/GPU/âm thanh.
- **Windows — khi có máy:** giai đoạn Windows Validation (§8.2).
- Không kiểm thử Linux/Android/iOS.
Mức tải kiểm thử chuẩn: **10 · 1.000 · 10.000 người**, áp lực **50.000** (đo ngưỡng máy, không đặt giới hạn). Sự kiện: **1.000 comment/s + 200 quà/s** trong 10 phút. Thời gian: mô phỏng thế giới chạy liên tục **3 giờ** (đồng hồ tăng tốc cho test).
| Phase | Nội dung | Phụ thuộc | Tiêu chí xong |
|---|---|---|---|
| 1. Nền tảng | git init, `.gitattributes`, package.json, server Express+WS, config + `config/platform/*`, `platform.js`, Logger, Settings, Metrics, **shutdown.js (khung lưu an toàn, tín hiệu cả hai OS)**, launcher macOS + Windows, test runner, `check-portability.js`, trang thử /stage (WebGL2, âm thanh, WebSocket, 1080×1920), khung PLATFORM_COMPATIBILITY_MATRIX, **workflow Windows CI (nếu A14 được cho phép)** | — | `npm test` + `check-portability` đạt trên macOS; /stage thử được trong **OBS và TikTok LIVE Studio trên macOS**; ghi Matrix; Windows: CI xanh nếu đã thiết lập, nếu chưa ghi "chưa kiểm" — **không chặn Phase 1** |
| 2. Ingest & hàng đợi | LiveConnector, MockConnector, LoadGenerator, Normalizer, Dedupe, RateLimiter, GiftJournal, PriorityEventQueue, EventBus, **LiveSessionManager (định danh theo sự kiện thật, RECOVERING)** | 1 | Trùng msgId, streak, rớt mạng / restart connector / restart server (cùng room_id → tiếp tục, không tạo buổi mới), room_id mới → buổi mới, streamEnd không nối lại; **kiểm chứng room_id thực tế trên LIVE thật**; tải chuẩn: 0 quà mất/trùng, trễ quà p95 < 1 s |
| 3. Thế giới liên tục headless | WorldCore/Lifecycle/Clock, PlayerRegistry nóng/lạnh, PresenceTracker (AFK 5 phút, chỉ lệnh hợp lệ/quà đánh thức, COLD, khôi phục), FishingScheduler, FishingSim, LootTable, ScoreLedger, Leaderboards 5 phạm vi + PeriodKeys, WorldLayout, SpatialIndex, WriteBehind, luồng kết thúc LIVE | 1, 2 | Unit test; `simulate-balance.js` 10/1.000/10.000 người chạy 3 giờ mô phỏng; tick p95 < 20 ms; `verify-leaderboards.js` khớp tính lại từ ledger (kể cả cửa sổ trượt 60 phút và tiêu chí phụ kg); qua 00:00 và thứ Hai giờ VN đúng (test với giờ máy khác múi); timestamp DB đều UTC; test like không đánh thức AFK, lệnh/quà đánh thức; test rời → quay lại khôi phục đủ; test tắt giữa chừng không mất dữ liệu |
| 4. Tiến trình & sự kiện thế giới (headless) | Leveling, Equipment, Inventory, FishDex, Achievements, WorldEventScheduler (Boss 30 phút + Boss quà, cảnh báo trước, chống chồng chéo, điều chỉnh theo người chơi/server), BossFight, BuffManager, gắn quà → hành động | 3 | Unit test; mô phỏng cân bằng XP/cấp & Boss ở 10/1.000/10.000 người; Boss lịch + Boss quà không chồng quá cấu hình; luôn có cảnh báo trước; server quá tải → Boss được hoãn, không mất yêu cầu Boss quà |
| 5. Cảnh 3D cơ bản | Renderer, hồ, nước, trời, ShoreGenerator, camera dọc, preset, HUD FPS | 1 | 30 FPS ở 1080×1920 trên M1 kèm phần mềm phát; preset Tự động sẵn cho GPU Windows (đo ở §8.2) |
| 6. Đám đông, cá, Boss 3D | CrowdRenderer (Instanced + LOD 0–3 + culling + grid + pool), HeroAngler, cần/dây/phao, cá, BossView, SpotlightDirector, NameTagAtlas, InterestManager | 3, 4, 5 | 30 FPS với 1.000 và 10.000 người (preset Vừa); đồng bộ đúng server; không rò bộ nhớ sau 30 phút người vào/ra liên tục |
| 7. Overlay, FX, âm thanh & Control | HUD, BXH luân phiên 5 phạm vi, banner hạng/cấp/thành tích, EventQueue, AudioQueue; Control điện thoại đầy đủ (§6) | 2, 3, 4, 6 | Chồng 1.000 sự kiện/s không vỡ hàng đợi; điều khiển trọn vòng từ điện thoại; phân trang đúng ở 10.000 người |
| 8. Ổn định & phát hành | Bản quyền, `pack-release.js` tạo gói macOS + Windows, quyền file, INSTALL_MACOS (đã thử) + INSTALL_WINDOWS (bản nháp, chưa thử thực tế), soak 3 giờ trên macOS, test mất điện giả lập, đo RAM/CPU, Matrix, Handover | tất cả | PRE_RELEASE checklist đạt trên macOS; tiêu chí nghiệm thu V1 phần macOS có bằng chứng; gói Windows được build (CI nếu có) và **ghi rõ "Windows: mục tiêu, chưa nghiệm thu"** trong Handover/hướng dẫn |
### 8.1 Tiêu chí nghiệm thu V1 (người dùng chốt) — phải có bằng chứng thực tế trên từng OS
1. Game khởi chạy trên macOS. 2. Game khởi chạy trên Windows. 3. OBS lấy được hình ảnh game trên cả hai. 4. Âm thanh hoạt động. 5. Comment và quà TikTok được xử lý. 6. Không có lỗi phụ thuộc hệ điều hành. 7. Có hướng dẫn cài đặt và vận hành cho cả hai hệ điều hành.
Bằng chứng: ảnh chụp/quay màn hình, log, kết quả `npm test` và `check-portability.js` trên từng OS, ghi trong PLATFORM_COMPATIBILITY_MATRIX + TEST_REPORT.
Trạng thái theo OS (0.0.7): tiêu chí 1, 4, 5, 6 (phần macOS), 7 (INSTALL_MACOS) và 3 (phần macOS) nghiệm thu trên macOS trong Phase 1–8. Tiêu chí 2, 3 (Windows), 4–6 (Windows), 7 (INSTALL_WINDOWS đã thử thực tế) **chờ giai đoạn Windows Validation**. V1 chỉ được tuyên bố "đạt trên Windows" sau §8.2.

### 8.2 Giai đoạn Windows Validation (khi người dùng có máy Windows x64)
Không gắn với số Phase; có thể bắt đầu ngay khi có máy, kể cả giữa các Phase.
1. Ghi thông tin máy WIN-1 vào Matrix (Windows, CPU, GPU, driver, RAM, Node, OBS, TikTok LIVE Studio).
2. Chạy danh sách kiểm thử Windows (Matrix mục 1–20 cột WIN-1): cài theo INSTALL_WINDOWS từng bước; launcher `.bat`; `npm test`; `check-portability`; OBS Browser Source (WebGL2, âm thanh, 1080×1920, FPS); TikTok LIVE Studio trên Windows (có bản? nguồn web? WebGL2? âm thanh?); WebSocket; /control từ điện thoại (tường lửa Windows); thoát an toàn (Ctrl+C, đóng console, nút Control); cập nhật zip (khoá file); SmartScreen/antivirus; comment + quà trên LIVE thật; soak 3 giờ.
3. Mỗi lỗi tương thích: ghi vào Matrix + TEST_REPORT + `docs/LESSONS.md` (nguyên nhân, cách sửa), phân loại, sửa trong `platform.js`/launcher/config nếu là khác biệt OS; không tạo nhánh code riêng cho Windows.
4. Chạy lại test hồi quy trên **cả macOS và Windows** sau mỗi sửa.
5. Bàn giao bản vá cho ChatGPT; chỉ khi đủ tiêu chí 2–7 phần Windows mới đổi trạng thái Windows thành "đã nghiệm thu".

Thay đổi so với 0.0.2: tách Phase 4 mới "Tiến trình & sự kiện thế giới"; gộp "Overlay/FX/âm thanh" và "Control & Admin" thành Phase 7 để giữ tổng 8 Phase.

## 9. Quyết định kiến trúc (ADR)
Chi tiết: `docs/ADR/`.
- ADR-0001 – Three.js trên trình duyệt.
- ADR-0002 – Server headless là nguồn sự thật; client chỉ nhận vùng quan tâm.
- ADR-0003 – Adapter TikTok tách biệt, phía sau là Ingest (chờ cho phép tái dùng code glass-bridge).
- ADR-0004 – Khung dọc 1080×1920.
- ADR-0005 – Số cần thủ không giới hạn (sửa 0.0.3/0.0.4: AFK 5 phút, tương tác hợp lệ = lệnh/quà, tầng COLD/khôi phục).
- ADR-0006 – Đường ống sự kiện chịu tải.
- ADR-0007 – Render đám đông.
- ADR-0008 – Sẵn sàng mở rộng ngang.
- **ADR-0009 – Continuous Live World: bỏ phiên chơi 10 phút** (ChatGPT chốt phương án B; 0.0.4: chỉ TOP LIVE được reset).
- **ADR-0010 – BXH 5 phạm vi trên sổ cái điểm bất biến + khoá kỳ.**
- **ADR-0011 – Tiến trình lâu dài & PlayerRegistry nóng/lạnh.**
- **ADR-0012 – Vòng đời buổi LIVE & tắt game an toàn** (sửa 0.0.4: định danh theo sự kiện thật, RECOVERING).
- **ADR-0013 – Hệ thống Boss: lịch 30 phút, Boss quà, cảnh báo, chống chồng chéo, điều chỉnh tải.**
- ~~ADR-0014 – Phạm vi nền tảng: TikTok LIVE chỉ macOS~~ — **đã bị thay thế bởi ADR-0015**.
- **ADR-0015 – Phạm vi V1: macOS + Windows, một codebase, OBS cả hai OS, TikTok LIVE Studio kiểm riêng từng OS.**
- **ADR-0016 – Không dùng phụ thuộc native: `node:sqlite` thay `better-sqlite3`; Node ≥ 22.13.**
- ADR-0015 sửa 0.0.7: macOS nghiệm thu trước; Windows mục tiêu chưa nghiệm thu; Windows CI nếu khả thi; Windows Validation khi có máy.
- ADR-0004 sửa 0.0.6: thiết lập canvas 1080×1920 cho OBS. ADR-0012 sửa 0.0.6: tín hiệu tắt trên Windows.
- ADR-0010 sửa 0.0.4: TOP giờ = cửa sổ trượt 60 phút; ngày/tuần theo giờ VN; tiêu chí phụ tổng kg; lưu UTC. ADR-0005 sửa 0.0.4: định nghĩa tương tác hợp lệ đánh thức AFK.

## 10. Rủi ro & phương án dự phòng
| Rủi ro | Mức | Phương án |
|---|---|---|
| `tiktok-live-connector` không chính thức; TikTok đổi giao thức | Cao | Ghim bản; adapter tách; không poll sau streamEnd; Mock + LoadGenerator |
| RAM 8 GB khi thế giới chạy hàng giờ và người chơi tích luỹ | Cao | PlayerRegistry nóng/lạnh (COLD → chỉ DB); mục tiêu < 1 KB/người nóng; đo ở Phase 3 |
| Mất dữ liệu khi tắt đột ngột | Cao | WAL + journal quà + write-behind ≤ 500 ms + luồng tắt an toàn + backup tự động |
| Xác định sai "buổi LIVE mới" (reset TOP LIVE nhầm hoặc không reset) | Trung | Định danh theo sự kiện thật (room_id mới / streamEnd); RECOVERING khi restart; kiểm chứng room_id ở Phase 2; snapshot TOP LIVE trước khi thay buổi; khôi phục được từ ledger |
| Sai ranh giới ngày/tuần hoặc cửa sổ 60 phút | Trung | Lưu UTC; PeriodKeys quy đổi Asia/Ho_Chi_Minh (00:00–23:59:59, thứ Hai–Chủ nhật); cửa sổ trượt theo bucket phút; test với giờ máy ở múi khác; tính lại được từ ledger |
| Cửa sổ trượt 60 phút tốn CPU khi đông | Trung | Bucket theo phút: mỗi phút chỉ trừ điểm của bucket hết hạn (O(số người có điểm trong phút đó · log n)); đo ở Phase 3 |
| Boss dồn dập (lịch + nhiều quà triệu hồi) | Trung | Số Boss đồng thời cấu hình (mặc định 1), hàng chờ Boss quà, khoảng nghỉ tối thiểu, hoãn khi server quá tải; quà triệu hồi không mất |
| DB phình to sau nhiều tháng | Trung | Gộp/nén ledger & catches theo tháng; chỉ mục đúng; sao lưu định kỳ |
| Lạm phát tiến trình (người cũ quá mạnh, người mới nản) | Trung | Mô phỏng cân bằng Phase 4; BXH giờ/LIVE cho người mới cơ hội; đường cong XP giảm dần |
| FPS tụt khi đông / Boss + quà dồn | Cao | Chỉ vẽ chi tiết vùng camera; LOD; ngân sách render tự điều chỉnh; EventQueue có trần |
| Lũ sự kiện | Cao | Token bucket, hàng đợi ưu tiên có giới hạn, gộp, xử lý theo lô; quà luôn journal trước |
| SQLite một luồng ghi | Trung | WAL + ghi theo lô; repository interface → Postgres |
| WebGL2/âm thanh khác nhau giữa OBS và TikTok LIVE Studio, giữa macOS và Windows (CEF, tăng tốc phần cứng, tự phát âm thanh) | Cao | Kiểm thực tế từ Phase 1 trên cả hai OS; hướng dẫn bật tăng tốc phần cứng Browser Source và "Control audio via OBS"; dự phòng quay cửa sổ trình duyệt; ghi Matrix |
| Chưa có máy Windows thật để kiểm thử (đã biết, người dùng chấp nhận) | **Cao** | Không chặn Phase 1/2; thiết kế tương thích Windows x64; `check-portability.js`; Windows CI nếu khả thi (A14); ghi "Windows: mục tiêu, chưa nghiệm thu" ở mọi báo cáo; giai đoạn Windows Validation §8.2 khi có máy. Rủi ro còn lại: lỗi OBS/GPU/âm thanh/LIVE Studio trên Windows chỉ phát hiện muộn → giữ khác biệt OS tập trung ở `platform.js` để sửa nhanh |
| TikTok LIVE Studio không có hoặc không hỗ trợ Browser Source trên một OS | Trung | Không mặc định; kiểm thực tế; nếu không được, OBS là đường phát chính trên OS đó (ghi Matrix + hướng dẫn) |
| Phát qua OBS cần quyền stream key/RTMP của tài khoản TikTok | Trung | Ngoài kiểm soát của game; tiêu chí nghiệm thu là OBS lấy được hình; hướng dẫn ghi rõ điều kiện tài khoản |
| Khác biệt OS: đường dẫn, hoa/thường tên file, xuống dòng, tên file tiếng Việt trong zip, tín hiệu tắt, khoá file khi cập nhật, tường lửa khi mở chế độ điện thoại | Trung | `platform.js`, `path`, `.gitattributes`, tên file ASCII cho launcher/gói, `check-portability.js`, Updater đổi file sau khởi động lại, hướng dẫn tường lửa từng OS |
| Gatekeeper (macOS) / SmartScreen + antivirus (Windows) chặn launcher chưa ký | Trung | Hướng dẫn mở lần đầu từng OS; cân nhắc ký mã ở Phase 8 (cần người dùng quyết định chi phí) |
| Phần cứng Windows rất đa dạng (GPU yếu, driver cũ) | Trung | Preset Tự động + cấu hình tối thiểu được công bố; đo trên máy kiểm thử |
| Bản quyền model/âm thanh · chính sách TikTok · lộ khoá khi bán | Trung | CC0 + CREDITS; không quy đổi tiền thật; chỉ khoá công khai |

### Phụ lục A — Đồ hoạ & tối ưu đám đông (M1 8 GB, 1080×1920)
| LOD | Ai | Cách vẽ |
|---|---|---|
| LOD0 Hero | Người đang spotlight (quà, cá hiếm, lên cấp, mới vào/quay lại, TOP) | Model đầy đủ, AnimationMixer, cần + dây + phao thật, trang bị hiển thị, tên lớn |
| LOD1 Gần | Trong vùng camera gần | InstancedMesh low-poly, vertex animation/pose (AFK = ngồi nghỉ), tên nhỏ từ atlas |
| LOD2 Xa | Trong khung nhìn ở xa | Impostor/billboard instanced, không tên |
| LOD3 Đám đông | Ngoài khung nhìn hoặc rất xa | Hiệu ứng mật độ theo đoạn bờ (từ `aggregate`) |
- Frustum culling theo ô SpatialGrid; Object Pool cho actor, cần/dây, cá, FX, nhãn tên, Boss; không tạo/huỷ mỗi frame.
- Ngân sách preset Vừa (cấu hình): ≤ 120 draw call, ≤ 300k tam giác, ≤ 64 MB texture. Vượt → giảm LOD0/LOD1 → giảm render scale → hạ preset; **không đụng gameplay**.
- `pixelRatio = 1`, render scale 0.75–1.0, FXAA nhẹ ở Vừa, WebGL2, `powerPreference: high-performance`; khoá 30 FPS; dừng render khi tab ẩn.
- Ánh sáng 1 directional + hemisphere; bóng thật chỉ LOD0 ở Cao; blob shadow cho LOD1. Nước shader tự viết, không phản chiếu thời gian thực.
- Thế giới chạy hàng giờ → bắt buộc giải phóng tài nguyên khi hồ sơ chuyển COLD, đo heap định kỳ (Metrics phía client gửi về Control).
- Preset Thấp / Vừa (mặc định) / Cao / Tự động.

### Phụ lục A2 — Thiết lập phần mềm phát (chi tiết trong INSTALL_MACOS / INSTALL_WINDOWS)
- **OBS (macOS + Windows):** canvas/output 1080×1920 dọc; Browser Source URL `http://127.0.0.1:<port>/stage`, kích thước 1080×1920, FPS 30, bật "Control audio via OBS", bật tăng tốc phần cứng Browser Source (Windows: Settings → Advanced); không bật "Shutdown source when not visible" (thế giới phải chạy liên tục).
- **TikTok LIVE Studio:** kiểm từng OS: có bản cho OS đó không, có nguồn trang web/Browser Source không, WebGL2, âm thanh, khung dọc. Kết quả ghi Matrix; nếu không đạt thì OBS là đường phát trên OS đó.
- /stage tự kiểm và báo về /control: WebGL2 có/không, renderer GPU, FPS, trạng thái âm thanh, WebSocket — để người vận hành thấy ngay nguồn phát có đủ điều kiện không.

### Phụ lục B — Tích hợp TikTok LIVE & đường ống sự kiện
- Kết nối bằng `@username` nhập ở Control. Trạng thái: `DEMO / CONNECTING / CONNECTED / DISCONNECTED / ENDED`.
- Kết nối thành công → LiveSessionManager so `room_id` → cùng = tiếp tục buổi; mới = buổi LIVE mới (TOP LIVE mới) (§1.3).
- **streamEnd → luồng kết thúc LIVE §1.4: lưu an toàn, KHÔNG tự nối lại, KHÔNG poll**; chỉ nối lại khi bấm "Kết nối".
- Rớt mạng khi đang LIVE → nối lại tối đa 5 lần (cấu hình), giãn cách tăng dần; quá hạn → báo Control; buổi LIVE giữ nguyên.
- Sự kiện: `chat`, `gift`, `like`, `follow`, `share`, `member`, `streamEnd`. Chỉ **comment là lệnh hợp lệ** và **quà** là tương tác hợp lệ cho PresenceTracker (đánh thức AFK / nạp từ COLD); like, follow, share, member không đánh thức.
- Dedupe: `M:<msgId>`; streak `S:<user>:<gift>:<groupId>:<repeatCount>` chỉ cộng phần tăng, chốt ở `repeatEnd`; LRU+TTL + `UNIQUE` DB.
- RateLimiter token bucket mỗi người + toàn cục; tham gia không bị bỏ, chỉ trễ.
- PriorityEventQueue có giới hạn: P0 hệ thống · P1 quà · P2 tham gia/quay lại · P3 lệnh · P4 like/share (gộp). Tràn: P4 gộp/lấy mẫu có đếm; P3 giảm tần suất; P2 chỉ trễ; **P1 không bao giờ bỏ**.
- GiftJournal: RECEIVED → APPLIED; khởi động lại xử lý bù RECEIVED.
- Sự kiện LIVE kích hoạt sự kiện thế giới (cấu hình): **quà hợp lệ triệu hồi Boss đặc biệt** (ADR-0013); mốc like toàn phòng (vd mỗi 10.000 like) → giờ vàng; quà cụ thể → mưa/bão. Sự kiện thế giới áp dụng toàn hồ qua BuffManager (O(1), không lặp từng người).

### Phụ lục C — Mở rộng ngang (thiết kế, chưa triển khai ở bản 1)
- Một buổi LIVE có một nguồn sự kiện → Ingest đơn tiến trình ghi vào EventBus.
- Bản 1: 1 tiến trình Node (P = 1). Năng lực **đo** ở Phase 3/8, không giả định.
- Khi cần: EventBus → Redis Streams/NATS; World worker theo `hash(userId) % P`; Leaderboards → Redis sorted set theo `scope:period_key`; Persistence → Postgres; WsGateway nhiều tiến trình; WorldEventScheduler là một tiến trình điều phối phát quảng bá tới mọi shard.
- Điều kiện: số đo Phase 8 cho thấy 1 tiến trình không đủ; thay đổi hạ tầng phải xin phép người dùng.

### Phụ lục D — Hệ thống tiến trình & sự kiện (đề xuất số liệu, chốt sau mô phỏng Phase 4)
- **Điểm (score) — tiêu chí xếp hạng chính (đã chốt):** từ mỗi con cá = f(bậc, kg, buff) (công thức chốt sau mô phỏng Phase 4); ghi vào ScoreLedger kèm `weight_g`; `players.total_score` và `total_weight_g` cộng dồn, không reset. Thứ tự BXH: điểm ↓, tổng kg ↓, rồi ai đạt trước xếp trên (để thứ tự luôn xác định).
- **XP/Cấp:** XP từ cá + sự kiện; đường cong tăng dần; cấp mở khoá trang bị/khu câu (cấu hình `levels.json`).
- **Trang bị:** cần, mồi, phụ kiện — nhận từ cấp, thành tích, Boss, quà; ảnh hưởng tỉ lệ cắn/giữ cá/độ hiếm; có hạn dùng cho vật phẩm từ quà.
- **Sổ tay cá:** loài đã câu, số lần, kg lớn nhất; hoàn thành bộ → thành tích.
- **Thành tích:** đánh giá theo sự kiện (bắt cá X, lên cấp Y, hạ Boss, câu liên tục), lưu tiến độ.
- **Boss (đã chốt, ADR-0013):**
  - Boss lịch: mặc định **30 phút/lần**, chỉnh được trong Admin/Control.
  - Boss đặc biệt: triệu hồi bằng **quà hợp lệ** (bảng quà → hành động).
  - **Cảnh báo trước** khi xuất hiện (mặc định 60 s đếm ngược, cấu hình) trên stage + âm thanh.
  - **Không chồng chéo ngoài cấu hình:** `maxConcurrentBosses` mặc định 1; Boss quà đến khi đang có Boss → xếp hàng (giữ thứ tự, không mất); Boss lịch gặp Boss khác → hoãn đến khi xong + khoảng nghỉ tối thiểu (cấu hình).
  - **Điều chỉnh theo người chơi & server:** HP/thời lượng/phần thưởng co giãn theo số người ACTIVE lúc bắt đầu; 0 người ACTIVE → hoãn Boss lịch; server quá tải (tick, độ sâu hàng đợi, FPS stage báo về) → hoãn bắt đầu và/hoặc giảm hiệu ứng, không huỷ yêu cầu Boss quà.
  - Mọi người ACTIVE góp sát thương bằng cá câu được/quà; phần thưởng theo đóng góp (`world_event_contrib`).
<!-- ===== KẾT THÚC docs/ARCHITECTURE.md ===== -->

---
## 4. ADR 0001–0016

---
<!-- ===== BẮT ĐẦU docs/ADR/0001-threejs-trinh-duyet.md ===== -->
## ADR — 0001-threejs-trinh-duyet.md
_Nguồn: `docs/ADR/0001-threejs-trinh-duyet.md`_

# ADR-0001: Dùng Three.js trên trình duyệt cho đồ hoạ 3D
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (người dùng đã chọn, chờ ChatGPT duyệt)
- Bối cảnh: Cần game 3D chạy trong TikTok LIVE Studio trên Apple M1 RAM 8 GB, cùng stack Node của 6 game LIVE trước.
- Quyết định: Three.js (ghim bản, tự host trong `public/vendor/`), ES modules + import map, không bundler ở bản đầu.
- Lý do: nhẹ; nhúng được làm Browser Source; không phải cài engine; Control điện thoại dễ làm; tái dùng hạ tầng WebSocket.
- Phương án đã loại: Babylon.js (nặng hơn), Godot 4 (phải cài, nhúng LIVE Studio phải quay cửa sổ), Unity (nặng, cần giấy phép).
- Hệ quả: đồ hoạ low-poly có giới hạn; phải tự viết shader nước và tối ưu thủ công; phụ thuộc mức hỗ trợ WebGL2 của LIVE Studio (kiểm ở Phase 1).
<!-- ===== KẾT THÚC docs/ADR/0001-threejs-trinh-duyet.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0002-server-headless-nguon-su-that.md ===== -->
## ADR — 0002-server-headless-nguon-su-that.md
_Nguồn: `docs/ADR/0002-server-headless-nguon-su-that.md`_

# ADR-0002: Server Node headless là nguồn sự thật, client 3D chỉ hiển thị vùng quan tâm
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.2, theo ADR-0005) — Trạng thái: Đề xuất
- Bối cảnh: Kết quả câu cá gắn với quà TikTok; số cần thủ không giới hạn; cần chống trùng, khôi phục sau restart, test tự động.
- Quyết định: GameCore chạy trên server, giữ **mọi** người chơi (PlayerRegistry), tiến trình câu theo lịch hẹn giờ (FishingScheduler min-heap), RNG có seed, lưu SQLite theo lô. WebSocket chỉ gửi cho /stage **vùng quan tâm** (camera + spotlight) và số liệu gộp; /stage chỉ diễn hoạt.
- Lý do: test được không cần trình duyệt; chi phí theo số sự kiện chứ không theo số người; nhiều màn hình cùng một trạng thái; công bằng dù người chơi có lên hình hay không.
- Phương án đã loại: logic trong trình duyệt; vòng lặp duyệt mọi người chơi mỗi tick; phát toàn bộ trạng thái qua WS.
- Hệ quả: cần InterestManager, giao thức WS rõ (`src/shared/protocol.js`); mô phỏng cân bằng ở mức 10/1.000/10.000 người.
<!-- ===== KẾT THÚC docs/ADR/0002-server-headless-nguon-su-that.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0003-adapter-tiktok.md ===== -->
## ADR — 0003-adapter-tiktok.md
_Nguồn: `docs/ADR/0003-adapter-tiktok.md`_

# ADR-0003: Adapter TikTok tách biệt, phía sau là tầng Ingest
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.2, theo ADR-0006) — Trạng thái: Đề xuất — **chờ người dùng cho phép tái dùng code từ dự án cũ**
- Bối cảnh: `tiktok-live-connector` không chính thức, có thể hỏng. `~/Downloads/glass-bridge-live/src/modules/TikTokConnector.js` đã có: streamEnd → ngắt không nối lại; rớt mạng → nối lại có giới hạn; chống trùng msgId; Mock.
- Quyết định: `src/ingest/LiveConnector.js` là adapter duy nhất chạm thư viện, chỉ chuẩn hoá và phát sự kiện. Dedupe, RateLimiter, GiftJournal, hàng đợi nằm ở tầng Ingest/Bus (ADR-0006), không nằm trong adapter. Ghim `tiktok-live-connector@2.5.0`.
- Lý do: thay thư viện (vd `@tiktool/live`) không phải sửa game; MockConnector/LoadGenerator đi cùng đường ống nên test tải sát thực tế.
- Phương án đã loại: gọi thư viện trực tiếp trong GameCore.
- Hệ quả: test riêng cho adapter (trùng, streak, rớt mạng, streamEnd) và cho đường ống (tải). Theo ADR-0014: chỉ cài một thư viện TikTok; `@tiktool/live` chỉ là phương án ghi nhận, không cài, không viết adapter thứ hai.
<!-- ===== KẾT THÚC docs/ADR/0003-adapter-tiktok.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0004-khung-doc-1080x1920.md ===== -->
## ADR — 0004-khung-doc-1080x1920.md
_Nguồn: `docs/ADR/0004-khung-doc-1080x1920.md`_

# ADR-0004: Khung hình dọc 1080×1920 cho phát TikTok LIVE
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.6: áp dụng cho cả OBS và TikTok LIVE Studio trên macOS + Windows, ADR-0015) — Trạng thái: Đề xuất (người dùng đã chọn)
- Bối cảnh: Người xem TikTok chủ yếu trên điện thoại; người dùng phát bằng TikTok LIVE Studio (đã cài).
- Quyết định: /stage thiết kế cho 1080×1920, camera dọc cố định; chừa 1/3 dưới và mép phải cho bình luận/nút TikTok.
- Phương án đã loại: 16:9 ngang ở bản đầu (có thể thêm sau; nếu thêm thì mọi thay đổi phải áp dụng cả hai khung).
- Thiết lập phát: OBS canvas/output 1080×1920 + Browser Source 1080×1920; TikTok LIVE Studio chế độ dọc (kiểm từng OS).
- Hệ quả: bố cục bờ hồ, BXH, banner thiết kế theo chiều dọc; render scale có thể < 1 để giữ 30 FPS.
<!-- ===== KẾT THÚC docs/ADR/0004-khung-doc-1080x1920.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0005-khong-gioi-han-can-thu.md ===== -->
## ADR — 0005-khong-gioi-han-can-thu.md
_Nguồn: `docs/ADR/0005-khong-gioi-han-can-thu.md`_

# ADR-0005: Số cần thủ không giới hạn; tách gameplay khỏi hiển thị
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.3, theo ADR-0009/0011; 0.0.4 theo quyết định AFK của ChatGPT) — Trạng thái: Đề xuất (người dùng quyết định) — **Thay thế** giới hạn "16 ô cần thủ + hàng chờ + thu hồi ô" của ARCHITECTURE 0.0.1
- Bối cảnh: Người dùng yêu cầu mọi người xem comment `câu`/`câu cá` đều có hồ sơ cần thủ, cùng tồn tại trong một buổi LIVE (thế giới liên tục, ADR-0009), không giới hạn cứng.
- Quyết định:
  1. Không có giới hạn số người chơi trong logic, DB, API, giao diện, tài liệu.
  2. Hồ sơ cần thủ (players + session_anglers) độc lập với nhân vật 3D. Server giữ và cập nhật mọi người; client chỉ vẽ chi tiết người trong vùng camera/khu gameplay.
  3. Bỏ "thu hồi ô". **AFK (ChatGPT chốt): 5 phút không có tương tác hợp lệ → tạm dừng tự quăng**; không xoá khỏi game; giữ hồ sơ, điểm, cấp, trang bị, thành tích. Tương tác hợp lệ = comment lệnh hợp lệ hoặc gửi quà; **like đơn lẻ không tính** (chống spam). Sau AFK lâu hơn (ngưỡng vận hành) → tầng COLD: hồ sơ chỉ nằm ở DB để giải phóng RAM, với người chơi vẫn là AFK; đánh thức → khôi phục đầy đủ (ADR-0011).
  4. Chỉ được có **giới hạn vận hành cấu hình được** (tốc độ sự kiện, kích thước hàng đợi, ngân sách render, tần suất WS, cỡ lô DB, số hồ sơ giữ nóng trong RAM). Khi chạm ngưỡng: giảm chất lượng/gộp/trễ, không từ chối người tham gia, không bỏ quà.
  5. Không thay 16 bằng bất kỳ con số cứng nào khác.
- Phương án đã loại: N ô cố định + hàng chờ (0.0.1); chỉ người có quà mới được chơi.
- Hệ quả: cần FishingScheduler theo sự kiện (ADR-0002), BXH có thứ tự + phân trang, đường ống sự kiện (ADR-0006), render đám đông (ADR-0007), thiết kế sẵn mở rộng ngang (ADR-0008); năng lực thực tế trên M1 8 GB phải **đo và báo cáo**, không hứa trước.
<!-- ===== KẾT THÚC docs/ADR/0005-khong-gioi-han-can-thu.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0006-duong-ong-su-kien.md ===== -->
## ADR — 0006-duong-ong-su-kien.md
_Nguồn: `docs/ADR/0006-duong-ong-su-kien.md`_

# ADR-0006: Đường ống sự kiện chịu tải (dedupe, rate limit, hàng đợi ưu tiên, journal quà)
- Ngày: 2026-11-24 — Trạng thái: Đề xuất
- Bối cảnh: LIVE đông có thể có hàng nghìn comment/quà mỗi giây; quà là tiền thật của người xem, không được mất hoặc cộng 2 lần.
- Quyết định: Ingest → Normalizer → Dedupe (LRU+TTL + `UNIQUE` DB; streak chỉ cộng phần tăng) → RateLimiter token bucket (mỗi người + toàn cục) → GiftJournal (ghi RECEIVED trước) → EventBus → PriorityEventQueue có giới hạn (P0 hệ thống, P1 quà, P2 tham gia, P3 lệnh, P4 like/share gộp) → GameCore xử lý theo lô, ngân sách ms/tick.
- Chính sách tràn: P4 gộp/lấy mẫu có đếm; P3 giảm tần suất; P2 chỉ trễ, không bỏ; P1 không bao giờ bỏ (journal xử lý bù).
- Lý do: bảo vệ vòng lặp game và FPS; chống spam; đảm bảo toàn vẹn quà kể cả khi restart.
- Phương án đã loại: xử lý đồng bộ từng sự kiện ngay khi nhận; bỏ quà khi quá tải.
- Hệ quả: cần Metrics (độ sâu hàng đợi, sự kiện/s, gộp/bỏ, trễ p95) và LoadGenerator; tiêu chí Phase 2: 1.000 comment/s + 200 quà/s, 0 quà mất/trùng.
<!-- ===== KẾT THÚC docs/ADR/0006-duong-ong-su-kien.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0007-render-dam-dong.md ===== -->
## ADR — 0007-render-dam-dong.md
_Nguồn: `docs/ADR/0007-render-dam-dong.md`_

# ADR-0007: Render đám đông — Instanced + LOD + Frustum Culling + Spatial Grid + Object Pool + Spotlight
- Ngày: 2026-11-24 — Trạng thái: Đề xuất
- Bối cảnh: Số cần thủ không giới hạn nhưng GPU M1 7 nhân, RAM 8 GB, chạy kèm LIVE Studio, cần 30 FPS ở 1080×1920.
- Quyết định: LOD0 Hero (model đầy đủ, chỉ người được spotlight) · LOD1 InstancedMesh low-poly + vertex animation · LOD2 impostor instanced · LOD3 chỉ hiệu ứng mật độ đám đông. Culling theo ô SpatialGrid; Object Pool cho actor/cần/cá/FX/nhãn; nhãn tên từ atlas. SpotlightDirector chọn người lên hình (quà, cá hiếm, mới vào, TOP) và luân phiên. Bờ hồ sinh thủ tục mở rộng theo số người.
- Số lượng ở mỗi LOD là **ngân sách render theo preset, tự điều chỉnh theo frame time**, không phải giới hạn gameplay.
- Phương án đã loại: mỗi người một skinned mesh; CSS2D label cho mọi người; vẽ tất cả người chơi.
- Hệ quả: cần model có nhiều cấp LOD (CC0) hoặc tự giảm đa giác; tiêu chí Phase 6 (đánh số theo ARCHITECTURE 0.0.3): 30 FPS với 1.000 và 10.000 người trong thế giới.
<!-- ===== KẾT THÚC docs/ADR/0007-render-dam-dong.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0008-mo-rong-ngang.md ===== -->
## ADR — 0008-mo-rong-ngang.md
_Nguồn: `docs/ADR/0008-mo-rong-ngang.md`_

# ADR-0008: Thiết kế sẵn sàng mở rộng ngang
- Ngày: 2026-11-24 — Trạng thái: Đề xuất
- Bối cảnh: Lượng người chơi có thể tăng cao; người dùng yêu cầu kiến trúc mở rộng ngang được.
- Quyết định: Bản 1 chạy **một tiến trình**, nhưng mọi phụ thuộc đi qua interface: `EventBus` (in-process → Redis Streams/NATS), repository (SQLite → Postgres), `LeaderboardStore` (RAM → Redis sorted set), `WsGateway` tách được. Trạng thái người chơi có `partitionKey = hash(userId) % P` (bản 1: P = 1). Sự kiện toàn hồ phát quảng bá tới mọi shard.
- Lý do: không thêm hạ tầng nặng cho máy M1 khi chưa cần, nhưng không phải viết lại khi cần.
- Giới hạn bản chất: một LIVE chỉ có một nguồn sự kiện → Ingest là đơn tiến trình; phần mở rộng được là mô phỏng, BXH, phát WS.
- Điều kiện kích hoạt: số đo ở Phase 8 cho thấy 1 tiến trình không đủ; thay đổi hạ tầng phải xin phép người dùng.
- Phương án đã loại: microservices ngay từ bản 1 (quá nặng cho máy 8 GB và đóng gói bán).
<!-- ===== KẾT THÚC docs/ADR/0008-mo-rong-ngang.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0009-continuous-live-world.md ===== -->
## ADR — 0009-continuous-live-world.md
_Nguồn: `docs/ADR/0009-continuous-live-world.md`_

# ADR-0009: Continuous Live World — bỏ phiên chơi 10 phút
- Ngày: 2026-11-24 — Trạng thái: **Chốt lối chơi** (ChatGPT chọn phương án B, người dùng chuyển giao); kiến trúc chi tiết chờ ChatGPT kiểm duyệt
- **Thay thế:** máy trạng thái phiên `IDLE → LOBBY → FISHING (5–10 phút) → RESULT → LOBBY` của ARCHITECTURE 0.0.1/0.0.2; bảng `game_sessions`; API `open-lobby/start/end` của phiên.
- Bối cảnh: game LIVE cần giữ người xem lâu, cho tham gia bất cứ lúc nào, và tạo lý do quay lại.
- Quyết định:
  1. Thế giới chạy liên tục suốt buổi LIVE: vòng đời `STOPPED → RUNNING ⇄ PAUSED → STOPPED`, không đếm giờ, không tổng kết định kỳ.
  2. Tham gia bất cứ lúc nào bằng comment `câu` / `câu cá`.
  3. Điểm cá nhân, cấp, trang bị, sổ tay, thành tích không reset theo thời gian.
  4. BXH theo thời gian là cửa sổ tính trên sổ cái điểm (ADR-0010). **Chỉ TOP LIVE được reset**, khi xác nhận buổi LIVE mới (ADR-0012). Kết thúc LIVE không reset hồ sơ/tiến trình; BXH dài hạn lưu độc lập.
  6. Không giới hạn thời gian hoạt động.
  5. Boss và sự kiện thế giới chạy liên tục theo lịch hoặc theo sự kiện LIVE (WorldEventScheduler, ADR-0013).
- Phương án đã loại: A — phiên 10 phút có reset điểm (người vào giữa phiên thiệt; người xem không có lý do quay lại).
- Hệ quả: cần lưu trữ lâu dài (ADR-0011), luồng kết thúc LIVE an toàn (ADR-0012), quản lý bộ nhớ khi chạy hàng giờ; kiểm thử phải mô phỏng thế giới chạy 3 giờ; cân bằng tiến trình chống lạm phát.
<!-- ===== KẾT THÚC docs/ADR/0009-continuous-live-world.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0010-leaderboard-5-pham-vi.md ===== -->
## ADR — 0010-leaderboard-5-pham-vi.md
_Nguồn: `docs/ADR/0010-leaderboard-5-pham-vi.md`_

# ADR-0010: BXH 5 phạm vi (LIVE · 60 phút gần nhất · ngày VN · tuần VN · tổng) trên sổ cái điểm bất biến
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4, theo quyết định BXH + múi giờ của ChatGPT) — Trạng thái: Quy tắc nghiệp vụ **đã chốt**; cách triển khai chờ ChatGPT duyệt
- Bối cảnh: Thế giới liên tục, điểm cá nhân không reset; cần BXH ngắn hạn và dài hạn cho số người không giới hạn.
- Quy tắc đã chốt: TOP LIVE reset khi bắt đầu buổi LIVE mới · TOP HOUR = 60 phút gần nhất · TOP DAY = ngày Việt Nam (00:00–23:59:59) · TOP WEEK = tuần Việt Nam (thứ Hai–Chủ nhật) · TOP ALL-TIME tích luỹ · **điểm là tiêu chí chính, tổng trọng lượng cá là tiêu chí phụ** · TOP 10/50/100 luân phiên trên màn LIVE · Control xem đầy đủ, phân trang · múi giờ Asia/Ho_Chi_Minh, **lưu UTC trong DB**.
- Quyết định triển khai:
  1. Mọi điểm cộng ghi vào `score_ledger` (chỉ thêm): user, score, weight_g, at_utc, live_session_id — nguồn gốc duy nhất; mọi BXH tính lại được.
  2. **Kỳ cố định** (live, day, week, all): bộ đếm `leaderboard_scores(scope, period_key, user_id, score, weight_g, reached_at_utc)`. `period_key` tính bằng cách quy đổi `at_utc` sang Asia/Ho_Chi_Minh: `day:YYYY-MM-DD`, `week:YYYY-Www` (ISO, bắt đầu thứ Hai), `live:<id>`, `all`. Hết ngày/tuần không xoá gì; kỳ mới có khoá mới; kỳ cũ chốt snapshot làm lịch sử.
  3. **TOP 60 phút (cửa sổ trượt):** giữ trong RAM các bucket theo phút (mỗi bucket: user → điểm, gam). Mỗi phút trôi qua, bucket cũ hơn 60 phút được trừ khỏi cấu trúc xếp hạng của cửa sổ. Khởi động lại: dựng lại từ `score_ledger` 60 phút gần nhất. Không lưu bảng riêng; chụp snapshot TOP mỗi giờ tròn để làm lịch sử.
  4. Thứ tự: `score DESC, weight_g DESC, reached_at ASC` (tiêu chí thứ ba chỉ để thứ tự luôn xác định).
  5. Kỳ đang chạy giữ cấu trúc có thứ tự trong RAM (TOP N đọc trực tiếp, hạng O(log n)); kỳ đã đóng đọc từ DB qua chỉ mục tương ứng.
  6. API TOP 10/50/100 + phân trang theo hạng + tra hạng cá nhân cho cả 5 phạm vi.
  7. Kết thúc LIVE chỉ chốt TOP LIVE; không chạm ngày/tuần/tổng/60 phút.
- Phương án đã loại: TOP giờ theo giờ tròn (trái quyết định "60 phút gần nhất"); reset bảng điểm theo kỳ (mất dữ liệu); tính BXH bằng truy vấn tổng hợp ledger mỗi lần đọc (chậm khi đông); lưu giờ địa phương trong DB.
- Hệ quả: mỗi lần câu cập nhật 4 bộ đếm kỳ + 1 bucket phút (gộp trong write-behind); `tools/verify-leaderboards.js` đối chiếu với tính lại từ ledger; test qua 00:00 và thứ Hai giờ VN khi máy đặt múi giờ khác; test trượt cửa sổ 60 phút và hoà điểm phân định bằng kg.
<!-- ===== KẾT THÚC docs/ADR/0010-leaderboard-5-pham-vi.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0011-tien-trinh-lau-dai-registry-nong-lanh.md ===== -->
## ADR — 0011-tien-trinh-lau-dai-registry-nong-lanh.md
_Nguồn: `docs/ADR/0011-tien-trinh-lau-dai-registry-nong-lanh.md`_

# ADR-0011: Tiến trình lâu dài & PlayerRegistry nóng/lạnh
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4: thuật ngữ COLD, định nghĩa tương tác hợp lệ) — Trạng thái: Đề xuất
- Bối cảnh: Hồ sơ, điểm, cấp, trang bị, sổ tay cá, thành tích phải lưu lâu dài và khôi phục khi người chơi quay lại; số người tích luỹ qua nhiều buổi LIVE không giới hạn, máy chỉ có 8 GB RAM.
- Quyết định:
  1. Dữ liệu lâu dài trong SQLite: `players` (xp, level, total_score…), `player_equipment`, `player_inventory`, `fishdex`, `player_achievements`, `player_presence`.
  2. PlayerRegistry hai tầng: **nóng** (RAM) cho ACTIVE/AFK gần đây; **lạnh/COLD** (chỉ DB) — đây là tầng lưu trữ, không phải trạng thái gameplay (với người chơi vẫn là AFK). Chuyển nóng → lạnh khi AFK quá ngưỡng vận hành (mặc định 30 phút, cấu hình) hoặc khi kết thúc LIVE; lạnh → nóng khi có tương tác hợp lệ (nạp bất đồng bộ, sự kiện của họ chờ trong hàng đợi đến khi nạp xong).
  3. PresenceTracker: `ACTIVE → AFK` sau 5 phút không có tương tác hợp lệ (tạm dừng tự quăng). Tương tác hợp lệ = comment lệnh hợp lệ hoặc gửi quà; like đơn lẻ không tính (ChatGPT chốt).
  4. Ghi liên tục qua write-behind (không chỉ lúc rời), nên "rời đi" không cần tín hiệu từ TikTok.
  5. Định nghĩa vật phẩm/thành tích/cấp nạp từ `config/*.json` có version; đổi định nghĩa dùng migration, không làm hỏng dữ liệu cũ.
- Phương án đã loại: giữ mọi hồ sơ trong RAM (tràn bộ nhớ khi tích luỹ); chỉ lưu khi kết thúc LIVE (mất dữ liệu khi sập).
- Hệ quả: test rời → quay lại khôi phục đủ trường; test like không đánh thức; test tràn RAM với số hồ sơ lạnh lớn; mô phỏng cân bằng XP chống lạm phát.
<!-- ===== KẾT THÚC docs/ADR/0011-tien-trinh-lau-dai-registry-nong-lanh.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0012-vong-doi-live-tat-an-toan.md ===== -->
## ADR — 0012-vong-doi-live-tat-an-toan.md
_Nguồn: `docs/ADR/0012-vong-doi-live-tat-an-toan.md`_

# ADR-0012: Vòng đời buổi LIVE (định danh theo sự kiện thật) & tắt game an toàn
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4, theo quyết định định danh LIVE của ChatGPT) — Trạng thái: Quy tắc **đã chốt**; triển khai chờ duyệt
- Quy tắc đã chốt: buổi LIVE xác định bằng sự kiện bắt đầu và kết thúc thực tế · mất kết nối tạm thời không tạo buổi mới · có phục hồi khi connector khởi động lại · chỉ reset TOP LIVE khi xác nhận buổi LIVE mới · kết thúc LIVE phải lưu trạng thái và kết quả trước khi đóng game · (luật NOVA) LIVE kết thúc thì tự ngắt, không tự nối lại/poll.
- Quyết định triển khai:
  1. `live_sessions`: room_id (UNIQUE ngoài DEMO), status ACTIVE/RECOVERING/ENDED, end_reason STREAM_END/MANUAL/INFERRED, last_event_at.
  2. **Bắt đầu thực tế** = kết nối thành công vào phòng đang phát có room_id chưa từng gắn buổi nào → buổi mới = xác nhận → chốt TOP LIVE cũ, mở TOP LIVE mới.
  3. **Kết thúc thực tế** = `streamEnd` (STREAM_END) hoặc nút "Kết thúc LIVE" (MANUAL).
  4. **Gián đoạn tạm thời** (rớt mạng, connector/server khởi động lại): buổi ACTIVE → RECOVERING; nối lại cùng room_id → ACTIVE, TOP LIVE giữ nguyên; room_id khác → đóng buổi cũ INFERRED (ended_at = last_event_at) rồi tạo buổi mới; không kết nối được → giữ RECOVERING, không poll, chờ người vận hành.
  5. Không có room_id đáng tin (DEMO/thư viện lỗi) → chỉ tạo buổi mới bằng nút trên Control có `confirm`.
  6. **Luồng kết thúc** (streamEnd, MANUAL, tín hiệu tắt — macOS: SIGINT/SIGTERM/SIGHUP; Windows: SIGINT (Ctrl+C), SIGBREAK, SIGHUP (đóng cửa sổ console, chỉ có vài giây) — nên nút "Thoát an toàn" trên Control là đường chính trên cả hai OS): ngừng nhận → xả hàng đợi (trần 10 s) → giải quyết cú câu dở → mọi người sang COLD → flush DB một giao dịch → chốt TOP LIVE + tổng kết buổi → `STOPPED` → báo "Đã lưu" → mới thoát. Quà chưa xử lý ở lại journal, áp dụng lần sau. SIGINT/SIGTERM khi LIVE vẫn phát → lưu an toàn nhưng buổi để RECOVERING (không phải kết thúc thực tế).
  7. Giả định cần kiểm chứng ở Phase 2: room_id giữ nguyên qua các lần nối lại trong cùng một lần phát và đổi khi phát lần mới. Nếu sai → dùng nút xác nhận trên Control làm đường chính, ghi sổ bài học.
- Phương án đã loại: reset TOP LIVE mỗi lần kết nối; reset theo giờ cố định; tự đồng ý buổi mới sau 30 s (bản 0.0.3).
- Hệ quả: `src/shutdown.js` có từ Phase 1; test giả lập streamEnd, rớt mạng, restart connector, restart server, Ctrl+C, kill giữa chừng; Control hiển thị trạng thái buổi và trạng thái lưu.
<!-- ===== KẾT THÚC docs/ADR/0012-vong-doi-live-tat-an-toan.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0013-he-thong-boss.md ===== -->
## ADR — 0013-he-thong-boss.md
_Nguồn: `docs/ADR/0013-he-thong-boss.md`_

# ADR-0013: Hệ thống Boss — lịch 30 phút, Boss quà, cảnh báo, chống chồng chéo, điều chỉnh tải
- Ngày: 2026-11-24 — Trạng thái: Quy tắc **đã chốt** (ChatGPT); triển khai chờ duyệt; số liệu HP/phần thưởng chốt sau mô phỏng Phase 4
- Quy tắc đã chốt: mặc định 30 phút/lần · cấu hình trong Admin Dashboard · Boss đặc biệt triệu hồi bằng quà hợp lệ · có cảnh báo trước khi xuất hiện · không chồng chéo ngoài cấu hình · điều chỉnh theo lượng người chơi và trạng thái server.
- Quyết định triển khai (WorldEventScheduler + BossFight):
  1. Máy trạng thái Boss: `SCHEDULED/QUEUED → WARNING (đếm ngược, mặc định 60 s) → ACTIVE → DEFEATED | ESCAPED → COOLDOWN`.
  2. Boss lịch: hẹn theo chu kỳ cấu hình (mặc định 30 phút) tính từ lần Boss lịch trước; nếu đến hạn mà đang có Boss → hoãn đến khi xong + khoảng nghỉ tối thiểu (cấu hình).
  3. Boss quà: quà nằm trong bảng quà → hành động "triệu hồi Boss" (qua GiftJournal, không mất) → vào hàng chờ Boss có thứ tự; được xử lý khi còn chỗ theo `maxConcurrentBosses` (mặc định 1).
  4. Co giãn: HP, thời lượng, phần thưởng = f(số người ACTIVE lúc bắt đầu WARNING); 0 người ACTIVE → hoãn Boss lịch.
  5. Bảo vệ server: Metrics (tick p95, độ sâu hàng đợi, FPS stage báo về) vượt ngưỡng → hoãn chuyển sang WARNING và/hoặc giảm hiệu ứng; không huỷ Boss quà.
  6. Sát thương từ cá câu được/quà của người ACTIVE; phần thưởng theo `world_event_contrib`.
  7. Lưu `world_events` (UTC) để khôi phục: restart giữa Boss → tiếp tục từ trạng thái đã lưu (thời gian dịch theo thời gian dừng).
- Phương án đã loại: Boss theo giờ tròn cố định; cho phép nhiều Boss tự do; huỷ Boss quà khi bận (mất quà của người xem).
- Hệ quả: test chồng lịch + nhiều Boss quà, quá tải giả lập, restart giữa Boss; cấu hình trong Control (chu kỳ, cảnh báo, số Boss đồng thời, khoảng nghỉ, hệ số).
<!-- ===== KẾT THÚC docs/ADR/0013-he-thong-boss.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0014-pham-vi-nen-tang-tiktok-live.md ===== -->
## ADR — 0014-pham-vi-nen-tang-tiktok-live.md
_Nguồn: `docs/ADR/0014-pham-vi-nen-tang-tiktok-live.md`_

# ADR-0014: Phạm vi nền tảng — TikTok LIVE (chỉ macOS)
- Ngày: 2026-11-24 — Trạng thái: **ĐÃ BỊ THAY THẾ bởi ADR-0015** (2026-11-24, người dùng chỉnh phạm vi V1 = macOS + Windows). Giữ lại làm lịch sử; không áp dụng.
- Bối cảnh: Quy chuẩn NOVA mới bắt buộc xác định phạm vi nền tảng trước khi phát triển, không tự chọn Full Cross-Platform. Người dùng chọn phạm vi hiện tại: **TikTok LIVE**; không triển khai 5 hệ điều hành.
- Quyết định — trong phạm vi:
  1. Máy phát: **macOS trên Apple Silicon** (máy hiện có: M1, 8 GB, macOS 26), chạy server Node + mở trang /stage.
  2. Phát sóng: **TikTok LIVE Studio** với Browser Source trỏ `http://127.0.0.1:<port>/stage` (khung dọc 1080×1920). Dự phòng trong cùng LIVE Studio: quay cửa sổ Chrome nếu Browser Source không đủ WebGL2/âm thanh.
  3. Vận hành: trang **/control** mở bằng trình duyệt trên Mac và trên điện thoại của người vận hành qua mạng LAN (là một phần của vận hành LIVE theo GAME_DEVELOPMENT.md, không phải ứng dụng mobile).
  4. Nguồn sự kiện: `tiktok-live-connector` (một thư viện duy nhất được cài).
  5. Launcher: chỉ `start.command` / `start-dien-thoai.command` (macOS).
- Ngoài phạm vi (không code, không cài dependency, không kiểm thử): Windows (`.bat`, đường dẫn Windows), Linux, ứng dụng Android/iOS, OBS, web game công khai, Electron/desktop app đóng gói, khung ngang 16:9, thư viện TikTok dự phòng (`@tiktool/live` chỉ được ghi là phương án nếu thư viện chính hỏng, không cài).
- Giữ khả năng mở rộng (bắt buộc theo quy chuẩn):
  - Gameplay headless tách hoàn toàn khỏi giao diện 3D (ADR-0002); backend tách frontend qua HTTP/WS + `protocol.js`.
  - Code server chỉ dùng API Node đa nền tảng (`path`, `os`, `node:sqlite`/`better-sqlite3`), không gọi lệnh/API riêng macOS trong code game; phần riêng macOS chỉ nằm ở launcher.
  - Nguồn sự kiện qua một adapter duy nhất (đã có trong thiết kế, ADR-0003) — không thêm adapter cho nền tảng khác.
  - Interface EventBus/repository giữ ở mức interface + **một** bản triển khai (in-process, SQLite); không viết bản Redis/Postgres khi chưa có quyết định mở rộng (ADR-0008).
- Giới hạn nền tảng ghi nhận: phụ thuộc mức hỗ trợ WebGL2/âm thanh của Browser Source trong LIVE Studio (kiểm Phase 1); phụ thuộc thư viện TikTok không chính thức; bản bán hiện chỉ chạy trên macOS Apple Silicon — **bán cho streamer dùng Windows cần người dùng mở rộng phạm vi** (ADR mới + ChatGPT duyệt).
- Phương án đã loại: Full Cross-Platform; song song Mac + Windows ở bản 1.
- Hệ quả: câu hỏi "có cần bản Windows" được giải quyết (không, trong phạm vi hiện tại); kiểm thử chỉ trên macOS + LIVE Studio + Chrome trên Mac + trình duyệt điện thoại của người vận hành.
<!-- ===== KẾT THÚC docs/ADR/0014-pham-vi-nen-tang-tiktok-live.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0015-pham-vi-v1-macos-windows.md ===== -->
## ADR — 0015-pham-vi-v1-macos-windows.md
_Nguồn: `docs/ADR/0015-pham-vi-v1-macos-windows.md`_

# ADR-0015: Phạm vi V1 — phát TikTok LIVE trên macOS + Windows, một codebase
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.7: thứ tự nghiệm thu) — Trạng thái: **Người dùng quyết định** (PLATFORM SCOPE CORRECTION); kiến trúc triển khai chờ ChatGPT duyệt — **Thay thế ADR-0014**
- Bối cảnh: Người dùng xác nhận V1 phải vận hành và phát TikTok LIVE được trên cả macOS và Windows ngay từ bản đầu; không làm Mac trước rồi để Windows sau.
- Quyết định — trong phạm vi V1:
  1. **Hệ điều hành máy phát:** macOS và Windows. Kiến trúc CPU cụ thể (macOS arm64/x64, Windows x64) chốt theo mục A12 trong PROJECT_STATUS.
  2. **Một codebase chính**, dùng chung: Gameplay Engine (WorldCore), Backend, Database, TikTok Connector, hệ thống Gift, trang /stage, /control.
  3. **Đường phát:** OBS Browser Source — bắt buộc chạy được trên cả hai OS (đường phát độc lập, phải kiểm chứng). TikTok LIVE Studio — kiểm tra tương thích **riêng từng OS**; không mặc định là có/hỗ trợ trên cả hai.
  4. Yêu cầu kỹ thuật chung: WebGL2, âm thanh, WebSocket, khung dọc 1080×1920.
  5. Khác biệt theo OS chỉ ở: launcher (`launchers/macos/*.command`, `launchers/windows/*.bat`), `config/platform/{darwin,win32}.json`, `src/system/platform.js`, `docs/INSTALL_MACOS.md`, `docs/INSTALL_WINDOWS.md`.
  6. Cấm: đường dẫn tuyệt đối máy Mac; lệnh/thư viện chỉ chạy trên macOS trong quy trình build chung; phụ thuộc native biên dịch theo OS (ADR-0016). Build, đóng gói, kiểm thử viết bằng Node; `tools/check-portability.js` kiểm tự động.
  7. **Platform Compatibility Matrix** (`docs/PLATFORM_COMPATIBILITY_MATRIX.md`) ghi kết quả thực tế từng OS × đường phát.
- Ngoài phạm vi V1 (không code, không dependency, không kiểm thử): Linux, Android, iOS, ứng dụng native riêng (Electron, Tauri, Swift, WinUI…).
- Tiêu chí nghiệm thu V1 (người dùng chốt): (1) khởi chạy trên macOS; (2) khởi chạy trên Windows; (3) OBS lấy được hình ảnh game trên cả hai; (4) âm thanh hoạt động; (5) comment và quà TikTok được xử lý; (6) không có lỗi phụ thuộc hệ điều hành; (7) có hướng dẫn cài đặt và vận hành cho cả hai OS.
- Phương án đã loại: chỉ macOS (ADR-0014); Mac trước, Windows sau; hai codebase; Full Cross-Platform.
- **Sửa 0.0.7 (người dùng):** hiện chỉ có máy Mac → macOS phát triển và nghiệm thu trước; code/dependency tương thích Windows x64 từ đầu; Windows CI nếu khả thi; kiểm thử thực tế Windows/OBS/LIVE Studio trên Windows chuyển sang giai đoạn Windows Validation (ARCHITECTURE §8.2) khi có máy; Windows là **nền tảng mục tiêu, chưa nghiệm thu**; không trì hoãn Phase 1/2 vì thiếu máy Windows.
- Hệ quả: test tự động chạy trên macOS mỗi Phase và trên Windows qua CI nếu có; đóng gói tạo 2 gói từ cùng mã nguồn; rủi ro khác biệt CEF/GPU giữa OBS và LIVE Studio, giữa hai OS phải được đo, không giả định.
<!-- ===== KẾT THÚC docs/ADR/0015-pham-vi-v1-macos-windows.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/ADR/0016-khong-phu-thuoc-native.md ===== -->
## ADR — 0016-khong-phu-thuoc-native.md
_Nguồn: `docs/ADR/0016-khong-phu-thuoc-native.md`_

# ADR-0016: Không dùng phụ thuộc native — `node:sqlite` thay `better-sqlite3`
- Ngày: 2026-11-24 — Trạng thái: Đề xuất (hệ quả kỹ thuật của ADR-0015) — chờ ChatGPT duyệt
- Bối cảnh: V1 phải chạy trên macOS và Windows từ một codebase; người dùng cuối không phải gõ lệnh (GAME_DEVELOPMENT). `better-sqlite3` là module native: cần bản dựng riêng theo OS/arch/phiên bản Node, dễ lỗi khi cài trên máy khách, không cho phép một gói dùng chung.
- Quyết định:
  1. DB dùng **`node:sqlite`** (tích hợp trong Node, đồng bộ, WAL) qua repository interface sẵn có. Đã thử trên máy dev: Node 26.13 nạp `node:sqlite` không cần cờ.
  2. Yêu cầu **Node ≥ 22.13 LTS** (`engines`); test trên Node LTS được chốt (đề xuất Node 22 LTS + Node 24 LTS) ở cả hai OS.
  3. Quy tắc phụ thuộc V1: chỉ thư viện JavaScript thuần (`express`, `ws`, `tiktok-live-connector`, `three` tự host…); thêm phụ thuộc native nào cũng phải có ADR.
  4. Cách phân phối Node cho người dùng cuối (cài sẵn hay đóng kèm runtime theo OS) chốt ở mục A13 — không ảnh hưởng mã nguồn.
- Phương án đã loại: `better-sqlite3` (native); file JSON (không đủ cho tiến trình lâu dài và chống trùng quà); DB server (Postgres) cho bản 1.
- Rủi ro: `node:sqlite` mới hơn `better-sqlite3` → kiểm hiệu năng ghi theo lô ở Phase 3 trên cả hai OS; giữ repository interface để đổi nếu cần (cần ADR mới).
- Hệ quả: ARCHITECTURE §2 cập nhật; tiêu chí Phase 1 gồm `npm test` với `node:sqlite` trên cả hai OS.
<!-- ===== KẾT THÚC docs/ADR/0016-khong-phu-thuoc-native.md ===== -->

---
<!-- ===== BẮT ĐẦU docs/PLATFORM_COMPATIBILITY_MATRIX.md ===== -->
## 5. PLATFORM COMPATIBILITY MATRIX
_Nguồn: `docs/PLATFORM_COMPATIBILITY_MATRIX.md`_

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
<!-- ===== KẾT THÚC docs/PLATFORM_COMPATIBILITY_MATRIX.md ===== -->

---
## 6. Quyết định đã chốt / còn mở / diễn giải (trích PROJECT_STATUS)
_Nguồn: `docs/PROJECT_STATUS.md`_

## Chặn (cần quyết định/quyền)
**Đã chốt (không hỏi lại):** bỏ phiên chơi (ADR-0009) · AFK 5 phút, chỉ comment lệnh hợp lệ/quà đánh thức, like không tính · BXH LIVE / 60 phút gần nhất / ngày VN / tuần VN / tổng, điểm chính + tổng kg phụ, TOP 10/50/100 luân phiên, Control phân trang · định danh buổi LIVE theo sự kiện thật, mất kết nối không tạo buổi mới, có phục hồi · Asia/Ho_Chi_Minh, lưu UTC · Boss 30 phút, Boss quà, cảnh báo trước, không chồng chéo ngoài cấu hình, điều chỉnh theo người chơi/server · chỉ TOP LIVE được reset · PROJECT_BRIEF đã điền.

### A. Quyết định thực sự chưa xác định
| # | Nội dung | Cần trước | Ảnh hưởng |
|---|---|---|---|
| ~~A1~~ | ~~Bản NOVA áp dụng~~ — **đã giải quyết: NOVA v1.0.3 đã cài** (2026-11-24). Bản 1.0.1 sao lưu ở `~/NOVA_AI_DEVELOPMENT_v1.0.1_backup`; luật Phạm vi nền tảng đã chuyển sang 1.0.3; `.claude/settings.json` dự án theo mẫu 1.0.3; `nova-selftest` 39/39, `nova-check` hợp lệ. Lỗi đóng gói 1.0.3 cần báo ChatGPT: xem `docs/LESSONS.md` L-002 | — | — |
| ~~A2~~ | ~~Có cần bản Windows song song không~~ — **đã giải quyết 0.0.6: CÓ, ngay từ V1** (người dùng chỉnh phạm vi, ADR-0015; thay kết luận "không" của 0.0.5) | — | — |
| A3 | Danh sách **lệnh comment hợp lệ** ngoài `câu`/`câu cá` (đề xuất: `hạng`, `top`, `túi`, `sổ tay`) — quyết định luôn cả cái gì đánh thức AFK | Phase 2 | CommentParser, PresenceTracker |
| A4 | Bảng **quà → hành động**: quà nào triệu hồi Boss đặc biệt, quà buff (mồi/cần/lưới/thời tiết), mốc like toàn phòng có kích hoạt giờ vàng không | Phase 4 | GiftRules, WorldEventScheduler |
| A5 | Có được tái dùng/chép logic `TikTokConnector.js`, `GiftManager` từ `glass-bridge-live` không | Phase 2 | Thời gian làm Phase 2 |
| A6 | Mức tải mục tiêu dùng làm tiêu chí nghiệm thu (đề xuất 10 / 1.000 / 10.000 người, áp lực 50.000; 1.000 comment/s + 200 quà/s) | Phase 2 | Tiêu chí test Phase 2–8 |
| A7 | Bối cảnh/phong cách đồ hoạ (hồ làng quê VN, biển, nhiều bản đồ?) và có skin không | Phase 5 | Asset, ShoreGenerator, phạm vi test đa skin |
| A8 | Có cần TTS đọc tên/quà không | Phase 7 | AudioQueue, phụ thuộc thêm |
| A9 | Hệ bản quyền/kích hoạt: dùng lại hệ license game cũ hay làm mới | Phase 8 | License, đóng gói |
| A10 | Điện thoại dùng mở trang Control là iPhone (Safari) hay Android (Chrome) — để kiểm thử đúng trình duyệt trong phạm vi | Phase 7 | Phạm vi kiểm thử /control |
| ~~A11~~ | ~~Máy Windows để kiểm thử~~ — **đã giải quyết 0.0.7**: hiện chỉ có máy Mac; không chặn Phase 1/2; kiểm thử thực tế Windows chuyển sang Windows Validation khi người dùng có máy | — | — |
| A12 | Kiến trúc CPU: **Windows = x64 (đã chốt 0.0.7)**. Còn mở: macOS chỉ Apple Silicon (arm64) hay cả Intel (x64)? | Phase 8 (gói) | Gói phát hành, kiểm thử |
| A13 | Cách cung cấp Node cho người dùng cuối: yêu cầu tự cài Node LTS (như game cũ?) hay đóng kèm runtime Node theo OS trong gói | Phase 8 (ảnh hưởng hướng dẫn từ Phase 1) | Dung lượng gói, hướng dẫn cài |
| A14 | **Windows CI (người dùng: "thiết lập nếu khả thi")**: khả thi với GitHub Actions `windows-latest` (x64) nhưng cần một repo GitHub riêng tư và cho phép đẩy code lên đó. Người dùng tạo repo (hoặc cho phép Claude tạo bằng `gh`) và đồng ý push? | Phase 1 (không chặn) | Bằng chứng tự động "không lỗi phụ thuộc OS" cho backend/build |
| A15 | Cấu hình Windows tối thiểu công bố cho người mua (đề xuất: Windows 10/11 64-bit, GPU hỗ trợ WebGL2, 8 GB RAM) | Phase 5 | Ngân sách hiệu năng, hướng dẫn |

### B. Diễn giải đã áp dụng (ChatGPT xác nhận khi duyệt; không hỏi lại người dùng)
| # | Diễn giải | Căn cứ |
|---|---|---|
| B1 | Follow, share, member (vào phòng) **không** đánh thức AFK; comment không phải lệnh cũng không | Quyết định chỉ liệt kê "comment lệnh hợp lệ hoặc gửi quà" |
| B2 | "Tương tác hợp lệ" để tính mốc 5 phút AFK dùng cùng định nghĩa với điều kiện đánh thức | Nhất quán với B1 |
| B3 | Tầng COLD (hồ sơ chỉ nằm ở DB sau 30 phút AFK hoặc khi kết thúc LIVE) là cơ chế tiết kiệm RAM, không phải trạng thái gameplay; với người chơi vẫn là AFK | "AFK không bị xoá khỏi game" + giới hạn RAM 8 GB |
| B4 | Thứ tự BXH: điểm ↓, tổng kg ↓, rồi ai đạt trước xếp trên (tiêu chí thứ ba chỉ để thứ tự luôn xác định) | Quyết định chỉ nêu 2 tiêu chí |
| B5 | Lịch sử TOP 60 phút: chụp snapshot mỗi giờ tròn | TOP giờ là cửa sổ trượt nên không có "kỳ" tự nhiên |
| B6 | "Bắt đầu thực tế" = kết nối vào phòng đang phát có `room_id` mới; `room_id` khác khi đang phục hồi → đóng buổi cũ `INFERRED` | "Xác định bằng sự kiện bắt đầu và kết thúc thực tế" |
| B7 | Tắt game (Ctrl+C) khi LIVE vẫn đang phát → lưu an toàn nhưng buổi để `RECOVERING`, không coi là kết thúc LIVE | Chỉ streamEnd/nút Kết thúc mới là kết thúc thực tế |
| B8 | Boss: cảnh báo mặc định 60 s; `maxConcurrentBosses` mặc định 1; Boss lịch tính chu kỳ từ lần Boss lịch trước, gặp Boss khác thì hoãn; 0 người ACTIVE thì hoãn Boss lịch; Boss quà xếp hàng, không bị huỷ | "Không chồng chéo ngoài cấu hình", "điều chỉnh theo người chơi và server" |
| B9 | TOP 50/100 trên màn LIVE hiển thị dạng trang 10 dòng tự lật | Khung dọc 1080×1920, chữ phải đọc được |
| B10 | Trang Control trên trình duyệt điện thoại qua LAN là thành phần vận hành LIVE (không phải app mobile) — vẫn trong phạm vi V1 dù Android/iOS ngoài phạm vi | GAME_DEVELOPMENT yêu cầu Control từ điện thoại; ADR-0015 chỉ loại app native |
| B12 | "Tối ưu cho môi trường phát" áp dụng cho OBS trên cả hai OS; TikTok LIVE Studio được tối ưu trên OS nào kiểm thực tế đạt | ADR-0015 mục 3 |
| B14 | Kết quả Windows CI chỉ chứng minh backend/build/test tự động không lỗi phụ thuộc OS; **không** được tính là nghiệm thu Windows (OBS, LIVE Studio, GPU, âm thanh, launcher bấm đúp) | Quyết định "Windows là nền tảng mục tiêu chưa được nghiệm thu" |
| B13 | Đổi DB sang `node:sqlite` và Node ≥ 22.13 (ADR-0016) là hệ quả kỹ thuật bắt buộc của "một gói chạy cả hai OS, người dùng không gõ lệnh" | ADR-0015 + GAME_DEVELOPMENT |
| B11 | Giữ interface EventBus/repository (một bản triển khai) và một adapter TikTok — coi là tách lớp cho khả năng mở rộng, không phải "adapter không cần thiết" | Policy mục 4 vs mục 3 |

### C. Số liệu sẽ chốt sau mô phỏng (đề xuất kèm báo cáo mô phỏng, không cần quyết định bây giờ)
Công thức điểm f(bậc, kg, buff) · đường cong XP/cấp · chỉ số trang bị · tỉ lệ loài cá · HP/thời lượng/phần thưởng Boss theo số người ACTIVE · ngưỡng vận hành mặc định (hàng đợi, token bucket, ngân sách render).

### D. Sự kiện kỹ thuật cần kiểm chứng (không phải quyết định)
| # | Kiểm chứng | Khi nào |
|---|---|---|
| D1 | Browser Source của TikTok LIVE Studio hỗ trợ WebGL2 + âm thanh đến đâu (cần người dùng thao tác trên máy) | Phase 1 |
| D2 | `room_id` giữ nguyên qua các lần nối lại trong cùng một lần phát và đổi khi phát lần mới (cần một buổi LIVE thật) | Phase 2 |
| D3 | Năng lực thực của M1 8 GB (số người, sự kiện/s) — đo, không giả định | Phase 3, 6, 8 |
