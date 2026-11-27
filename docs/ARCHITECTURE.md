# ARCHITECTURE — NOVA FISHING LIVE 3D
Phiên bản tài liệu: 0.0.9 — Ngày: 2026-11-24 — Trạng thái: v0.0.7 phê duyệt có điều kiện (R01–R08); v0.0.8 **chưa được phê duyệt**, ChatGPT yêu cầu thêm R09–R14; **bản 0.0.9 (sửa theo R09–R14) CHỜ CHATGPT QUYẾT ĐỊNH CUỐI — chưa được duyệt, chưa viết code, chưa cài thư viện, Phase 1 chưa bắt đầu** — mục tiêu V1 macOS + Windows; **Windows: nền tảng mục tiêu, CHƯA NGHIỆM THU** (chưa có máy Windows)
Quyết định đã chốt: **Continuous Live World (phương án B, ChatGPT chốt)** · mỗi người xem là 1 cần thủ · **số cần thủ KHÔNG giới hạn** · AFK 5 phút (chỉ lệnh hợp lệ/quà đánh thức) · BXH LIVE / 60 phút gần nhất / ngày VN / tuần VN / tổng (điểm, phụ: tổng kg) · Asia/Ho_Chi_Minh, lưu UTC · Boss 30 phút + Boss quà · tiến trình lâu dài · **Phạm vi V1: phát TikTok LIVE trên macOS + Windows, OBS Browser Source cả hai, TikTok LIVE Studio kiểm riêng từng OS (ADR-0015)** · Three.js trên trình duyệt · TikTok LIVE Studio dọc 1080×1920 · bán thương mại + model CC0 low-poly.
Lịch sử: 0.0.1 (16 ô, phiên 10 phút) → 0.0.2 (không giới hạn cần thủ, ADR-0005…0008) → 0.0.3 (bỏ phiên chơi, thế giới liên tục, ADR-0009…0012) → **0.0.4: chốt AFK, BXH (giờ = cửa sổ trượt 60 phút, tiêu chí phụ tổng kg), định danh buổi LIVE theo sự kiện thật, múi giờ/UTC, hệ thống Boss (ADR-0013)** → 0.0.5: phạm vi TikTok LIVE chỉ macOS (ADR-0014, **đã bị thay thế**) → **0.0.6: người dùng chỉnh phạm vi V1 = macOS + Windows ngay từ bản đầu (ADR-0015), bỏ phụ thuộc native (ADR-0016)**. → 0.0.7: chỉ có máy Mac — macOS nghiệm thu trước; Windows x64 tương thích từ thiết kế + CI nếu khả thi; kiểm thử thực tế Windows chuyển sang giai đoạn Windows Validation (§8.2), không chặn Phase 1/2. → **0.0.8: sửa theo review R01–R08 của ChatGPT — PersistenceWorker (ADR-0017), idempotency quà (ADR-0018), cửa sổ 60 phút chi tiết (ADR-0010), bậc quá tải/backpressure/lỗi lưu trữ (ADR-0019), bảo mật REST/WS/LAN (ADR-0020), định danh LIVE/DEMO (ADR-0021), độ bền RPO/RTO (ADR-0022); xem §11.** → **0.0.9: sửa theo R09–R14 — commit trước/công bố RAM sau cho hiệu ứng quà + ranh giới crash GB0–GB8 (ADR-0018), định nghĩa `reached_at` (ADR-0010), thang lưu trữ khẩn cấp S1–S4 + ngừng tiếp nhận có kiểm soát (ADR-0019), HTTPS cho Control qua LAN + sổ thiết bị/thu hồi (ADR-0020, ADR-0023 mới), idempotency batch/op của Worker (ADR-0017), chỉ số RPO + RPO chỉ từ crash test (ADR-0017, ADR-0022); xem §11.1.**

## 0. Nguyên tắc nền
**0.1 Không giới hạn người chơi (ADR-0005)**
1. Không có giới hạn cứng số người chơi trong logic game, DB, API, giao diện, tài liệu.
2. Gameplay ≠ hiển thị: server giữ trạng thái mọi cần thủ; client chỉ vẽ chi tiết người trong vùng camera/khu gameplay. Không được vẽ vẫn câu, vẫn cộng điểm, vẫn lên BXH.
3. Giới hạn vận hành (tốc độ sự kiện, kích thước hàng đợi, ngân sách render, tần suất WS, cỡ lô DB, số hồ sơ giữ "nóng" trong RAM) là **cấu hình bảo vệ máy**. Khi chạm ngưỡng: giảm chất lượng / gộp / trễ / backpressure / chuyển hồ sơ sang "lạnh" (DB) / tạm dừng mô phỏng (bậc L0–L4, ADR-0019). **Không từ chối người tham gia, không chủ động bỏ quà khi hệ thống còn khả năng tiếp nhận và lưu trữ, không xoá người chơi.** Khi mọi nơi lưu trữ đều thất bại: ngừng tiếp nhận có kiểm soát + cảnh báo nguy cơ mất (ADR-0019 R11). (Phạm vi bảo đảm về quà: ADR-0018 — không tuyên bố exactly-once.)
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
                    ▼ PersistenceClient (batch,     ▼ InterestManager              ▼ REST phân trang
                    │ backpressure, ADR-0017/0019)  WS Gateway /ws (Host/Origin,    /api/leaderboard
          ┌─────────▼──────────────────┐        xác thực — ADR-0020):           /api/players
          │ PersistenceWorker (thread  │        stage = vùng camera + spotlight (mọi REST/WS admin
          │ riêng, DUY NHẤT ghi DB)    │        + số liệu gộp; control = tổng   cần phiên + CSRF)
          │ node:sqlite WAL FULL,      │        quan + metrics + cảnh báo
          │ transaction theo batch     │
          │ nova-live.db | nova-demo.db│ (ADR-0021)
          └────────────────────────────┘
                                                         ▼
   /stage (Three.js, Browser Source LIVE Studio 1080×1920)
   CrowdRenderer: InstancedMesh + LOD 0–3 + Frustum Culling + SpatialGrid + Object Pool
   SpotlightDirector · WorldEvent/Boss view · FX/EventQueue · AudioQueue · HUD/BXH luân phiên
```
Nguyên tắc chung: server quyết định mọi kết quả; tách 5 lớp (vòng lặp · trạng thái · render · âm thanh · nhập liệu); khởi động lại server → Worker `ready` → replay journal quà (thế giới ở RESTORING) → khôi phục thế giới từ DB (PAUSED) — ADR-0018, ADR-0022. **Luồng chính không bao giờ gọi DB trực tiếp** (ADR-0017).

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
- TikTok không báo "người xem rời đi" đáng tin cậy, nên "rời đi" được suy ra từ AFK/COLD và kết thúc LIVE. Hồ sơ luôn được ghi xuống DB liên tục (write-behind qua PersistenceWorker), không chỉ lúc rời; hồ sơ chỉ chuyển COLD sau khi mọi thay đổi của người đó đã được ack. Khoá người chơi: `player_key` (ADR-0021).

### 1.3 Vòng đời buổi LIVE (LiveSessionManager) — định danh theo sự kiện thật (đã chốt)
- Một **buổi LIVE** = một bản ghi `live_sessions` (id, @username, room_id TikTok, started_at, ended_at, status, end_reason). Buổi LIVE được xác định bằng **sự kiện bắt đầu và kết thúc thực tế**, không theo giờ, không theo lần kết nối.
- **Bắt đầu thực tế:** kết nối TikTok thành công vào phòng đang phát với `room_id` **chưa từng gắn với buổi LIVE nào** → tạo buổi mới (TikTok cấp `room_id` mới cho mỗi lần phát). Đây là **xác nhận buổi LIVE mới** → chốt TOP LIVE cũ (snapshot) và mở TOP LIVE mới.
- **Kết thúc thực tế:** sự kiện `streamEnd` từ TikTok (`end_reason = STREAM_END`) hoặc người vận hành bấm "Kết thúc LIVE" trên Control (`MANUAL`) → luồng §1.4.
- **Mất kết nối tạm thời** (rớt mạng, connector khởi động lại, server khởi động lại) **không tạo buổi mới**: kết nối lại cùng `room_id` → tiếp tục buổi đang ACTIVE, TOP LIVE giữ nguyên.
- **Phục hồi khi connector/server khởi động lại:** khi khởi động, nạp buổi `ACTIVE` gần nhất từ DB (trạng thái `RECOVERING`) → kết nối lại:
  - cùng `room_id` → tiếp tục (ACTIVE);
  - `room_id` khác → buổi cũ đóng với `end_reason = INFERRED` (ended_at = thời điểm sự kiện cuối cùng nhận được), rồi tạo buổi mới như "bắt đầu thực tế";
  - streamer không còn phát (không kết nối được vì LIVE đã tắt) → buổi cũ giữ `RECOVERING`, **không poll**; người vận hành bấm "Kết nối" lại khi phát, hoặc bấm "Đóng buổi LIVE cũ".
- Trường hợp không có `room_id` đáng tin (chế độ DEMO, hoặc thư viện không trả về): chỉ tạo buổi mới qua nút **"Bắt đầu buổi LIVE mới"** trên Control (cần `confirm`). DEMO dùng **file DB riêng** `nova-demo.db` (ADR-0021) nên buổi LIVE, BXH, hồ sơ DEMO không thể trộn với dữ liệu thật.
- Hành vi `room_id` qua các lần nối lại sẽ được **kiểm chứng thực tế ở Phase 2**; nếu khác giả định, phương án dự phòng là nút xác nhận trên Control (ghi vào sổ bài học).

### 1.4 Kết thúc LIVE & tắt game (ADR-0012)
Kích hoạt bởi: `streamEnd` từ TikTok, nút "Kết thúc LIVE" / "Thoát an toàn" trên Control (**đường chính trên cả hai OS**), hoặc tín hiệu tắt tiến trình: macOS SIGINT/SIGTERM/SIGHUP; Windows Ctrl+C (SIGINT), Ctrl+Break (SIGBREAK), đóng cửa sổ console (SIGHUP — Windows chỉ cho khoảng vài giây trước khi buộc tắt, nên luồng tắt có trần ngắn; phần chưa ack khi hết trần thuộc RPO ở ADR-0022 — **không** cam kết "mất tối đa 500 ms").
1. Ngừng nhận sự kiện mới (connector ngắt, **không tự nối lại, không poll**).
2. Xả hàng đợi sự kiện còn lại (trần thời gian cấu hình, mặc định 10 s); quà **đã ghi bền `RECEIVED`** nhưng chưa APPLIED vẫn nằm trong journal và được áp dụng khi khởi động lần sau (ADR-0018); quà chưa kịp ghi bền khi tiến trình bị buộc dừng có thể mất (ADR-0018 G3).
3. Kết thúc các cú câu đang dở theo luật (đề xuất: cá đang FIGHTING được giải quyết ngay theo RNG đã gieo; WAITING thì huỷ, không mất gì).
4. Gửi các batch còn lại cho PersistenceWorker, gửi lệnh dừng cho Worker (commit nốt + checkpoint WAL TRUNCATE + đóng DB) và **chờ ack** (ADR-0017); sau đó mới chuyển mọi hồ sơ sang tầng COLD (không đổi tiến trình người chơi).
5. Chốt TOP LIVE (snapshot), cập nhật BXH giờ/ngày/tuần/tổng, ghi `live_sessions.ended_at` + tổng kết buổi (số người, số cá, cá hiếm nhất, quà).
6. Thế giới → `STOPPED`; ghi log "đã lưu an toàn" và hiển thị trên Control; chỉ sau đó tiến trình mới thoát.
- Sập đột ngột / mất điện: dữ liệu mất theo phân loại RPO ở ADR-0022 (C1 quà: 0 với quà đã ack `RECEIVED`; C2 tiến trình: phần chưa ghi bền — gồm RAM chưa thành op, WriteBuffer và batch chưa ack, theo dõi bằng bộ chỉ số R14 (ADR-0017); C4 dựng lại được). Khởi động sau: WAL tự phục hồi → `quick_check` → **dựng RAM từ DB** → replay journal quà → buổi LIVE chưa đóng ở `RECOVERING`, hỏi tiếp tục/đóng. Các con số là mục tiêu thiết kế; **RPO thực tế chỉ được công bố khi đã đo bằng crash test** (CR1–CR10, ADR-0022) và ghi TEST_REPORT.

## 2. Công nghệ (kèm lý do chọn)
| Thành phần | Chọn | Lý do | Đã loại |
|---|---|---|---|
| Runtime | Node.js **≥ 22.13 LTS** (có `node:sqlite` không cần cờ), ES Modules | Cùng stack game LIVE trước; một runtime cho macOS (arm64, x64) và Windows (x64) | Bun; Node 20 (không có `node:sqlite` ổn định) |
| HTTP/WS | `express@4`, `ws@8` (+ gói nhị phân cho delta nếu đo thấy cần) | Đã chạy ổn định | socket.io |
| TikTok | `tiktok-live-connector@2.5.0` (ghim; thư viện duy nhất được cài) | Bản đang chạy ở game cũ | `@tiktool/live` (chỉ ghi nhận làm phương án nếu thư viện chính hỏng; không cài) |
| DB | **`node:sqlite` (tích hợp sẵn trong Node, WAL, `synchronous=FULL`, ghi theo lô)**, chạy **chỉ trong PersistenceWorker** (`worker_threads`, ADR-0017) — không gọi trên luồng chính; repository interface (ADR-0016); 2 file DB theo realm (ADR-0021) | Không có module native → cùng một gói chạy trên cả macOS và Windows, không cần biên dịch theo OS | `better-sqlite3` (native, cần bản dựng riêng theo OS/arch) |
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
│  ├─ data/    PersistenceClient.js (batch, backpressure — luồng chính) · PersistenceWorker.js (worker_threads, sở hữu DB) · ReadWorker.js (tuỳ chọn) · migrations/ (NNN_ten.sql) · repositories/ · backup.js (VACUUM INTO)
│  ├─ security/ AuthSessions.js (ghép đôi có hạn/một lần/thu hồi được, phiên, mật khẩu scrypt) · DeviceRegistry.js (sổ thiết bị, thu hồi) · TlsManager.js (chứng chỉ tự ký cho chế độ LAN, ADR-0023) · CsrfOrigin.js (Origin/Host/CSRF) · Audit.js (admin_audit) · UpdateVerifier.js (chữ ký gói)
│  ├─ ops/     OverloadController.js (bậc L0–L4/SAFE MODE) · DiskMonitor.js · Alerts.js
│  ├─ system/  Logger.js · Settings.js · Metrics.js · Updater.js (ghi tạm rồi đổi file sau khi khởi động lại — Windows khoá file đang chạy) · License.js · **platform.js** (điểm duy nhất chứa khác biệt OS)
│  └─ shared/  protocol.js · persistence-protocol.js
├─ public/
│  ├─ stage/   index.html · main.js · render/ · crowd/ (CrowdRenderer, LodManager, SpatialGrid, InstancePool, NameTagAtlas)
│  │           actors/ · director/ (SpotlightDirector, CameraRig) · events/ (BossView, WeatherFx) · fx/ · hud/ · audio/
│  ├─ control/ index.html · control.js · control.css
│  ├─ shared/  ws-client.js · protocol.js
│  └─ vendor/  three.module.min.js
├─ assets/ models/*.glb (kèm LOD) · textures/ · audio/ · fonts/ · CREDITS.md
├─ tools/  simulate-balance.js · load-test.js · pack-release.js · check-assets.js · verify-leaderboards.js · check-portability.js (quét đường dẫn tuyệt đối, lệnh riêng OS, tên file phân biệt hoa thường) · verify-integrity.js (bất biến I1–I8, ADR-0022)
├─ tests/  unit/ · integration/ · load/ · crash/ (CR1–CR6, fault injection) · security/ · run-tests.js
├─ data/   (runtime, bỏ qua bởi git) nova-live.db · nova-demo.db · backups/ · logs/ · emergency-gifts-*.jsonl (chỉ khi SAFE MODE)
└─ docs/   PROJECT_BRIEF · ARCHITECTURE · PROJECT_STATUS · ADR/ · LESSONS.md · **PLATFORM_COMPATIBILITY_MATRIX.md** · **INSTALL_MACOS.md** · **INSTALL_WINDOWS.md** · báo cáo NOVA
```

## 4. Dữ liệu / Database (SQLite WAL, migration đánh số trong `src/data/migrations/`)
Không có cột/ràng buộc nào giới hạn số người chơi. **Mọi timestamp lưu UTC dạng INTEGER (ms)**; trọng lượng lưu `weight_g` INTEGER (gam), điểm `score` INTEGER — không dùng số thực để cộng/so sánh. Mọi ghi đi qua PersistenceWorker theo lớp batch (ADR-0017): `critical` (journal quà, ≤ 50 ms), `progress` (500 ms / 500 op — chu kỳ gom, **không** phải cam kết RPO), `state` (≤ 5 s), `log`. Mỗi batch là một transaction. **Hai file DB theo realm:** `nova-live.db`, `nova-demo.db` (ADR-0021). Khoá người chơi ở mọi bảng là `player_key` (`tt:<userId>` / `demo:<id>`).
| Bảng | Nội dung | Chỉ mục / ràng buộc |
|---|---|---|
| settings | Cấu hình Admin (JSON, có phiên bản) | |
| world_state | Trạng thái thế giới (lifecycle, thời tiết, sự kiện đang chạy, seed, thời điểm hẹn) để khôi phục | 1 dòng |
| schema_migrations | version, name, checksum, applied_at_utc (ADR-0021) | PK version |
| live_sessions | Buổi LIVE: username, room_id, started_at, ended_at, status (ACTIVE/RECOVERING/ENDED), end_reason (STREAM_END/MANUAL/INFERRED), last_event_at, tổng kết (DEMO nằm ở `nova-demo.db`) | (status), room_id UNIQUE |
| players | Hồ sơ lâu dài: **`player_key` PK**, `realm` (CHECK live/demo, khớp file DB), `external_id` (TikTok `userId`), `unique_id`, `nickname` (chỉ hiển thị, không làm khoá), ngoại hình, **xp, level, total_score, total_weight_g**, first_seen, last_seen | PK player_key; UNIQUE (realm, external_id); CHECK tiền tố khoá theo realm |
| player_presence | ACTIVE/AFK, vị trí bờ, last_valid_interaction_at (UTC), buổi LIVE gần nhất | PK player_key (FK players) |
| player_equipment | Cần/mồi/phụ kiện đang trang bị | PK (player_key, slot_type) |
| player_inventory | Túi đồ (vật phẩm, số lượng, hạn dùng `expires_at_utc`, `source_key` nếu từ quà) | (player_key), CHECK qty ≥ 0, UNIQUE (source_key, effect_seq) |
| fishdex | Sổ tay cá: loài đã câu, số lần, weight_g lớn nhất, lần đầu | PK (player_key, species_id) |
| player_achievements | Thành tích đạt được + thời điểm + tiến độ (mở khoá idempotent) | PK (player_key, achievement_id) |
| catches | Mỗi lần câu: catch_id, loài, bậc, weight_g, điểm, buff, live_session_id, world_event_id, at_utc | PK catch_id; (player_key, at_utc), (live_session_id) |
| score_ledger | Sổ cái điểm **bất biến**: ledger_id, player_key, score, weight_g, source (CATCH/GIFT/BOSS/ADJUST), `source_key`, `effect_seq`, at_utc, `minute_utc`, live_session_id — nguồn gốc để tính/khôi phục mọi BXH, kể cả cửa sổ 60 phút | UNIQUE (source_key, effect_seq); (minute_utc); (at_utc); (live_session_id); (player_key, at_utc) |
| leaderboard_scores | Điểm + trọng lượng theo kỳ cố định: `scope ∈ {live, day, week, all}`, `period_key` (`live:<id>`, `day:2026-11-24`, `week:2026-W48` theo giờ VN, `all`), score, weight_g, reached_at_utc — cập nhật **trong cùng transaction** với ledger. **TOP 60 phút không lưu ở đây** (ADR-0010) | PK (scope, period_key, player_key); (scope, period_key, score DESC, weight_g DESC, reached_at_utc ASC) |
| leaderboard_snapshots | Chốt TOP khi đóng kỳ ngày/tuần hoặc kết thúc/thay buổi LIVE | (scope, period_key, rank) |
| hour_window_snapshots | **Lịch sử** TOP 60 phút chụp mỗi giờ tròn (snapshot_at_utc, window_from/to_minute, rank, player_key, score, weight_g) — **không** dùng để dựng TOP 60 phút hiện tại (ADR-0010) | (snapshot_at_utc, rank) |
| committed_batches (0.0.9, R13) | batch_id, committed_at_utc, op_count, checksum — ghi trong cùng transaction của batch; nhận diện batch đã commit nhưng mất ack; dọn sau 7 ngày | PK batch_id |
| applied_ops (0.0.9, R13) | op_key (khoá idempotency ổn định từ miền nghiệp vụ), batch_id, at_utc — chặn thực hiện lần hai các phép cộng điểm/vật phẩm/buff/tiến trình; dọn sau 7 ngày | PK op_key |
| admin_devices (0.0.9, R12) | device_id, tên, nền tảng/trình duyệt, paired_at_utc, last_seen_utc, revoked_at_utc — thu hồi từng thiết bị/tất cả | PK device_id |
| admin_audit | Nhật ký thao tác Admin (thiết bị, IP, thao tác, kết quả, at_utc; không có token) (ADR-0020) | (at_utc) |
| world_events | Lịch sử Boss/sự kiện: loại (SCHEDULED_BOSS/GIFT_BOSS/…), nguồn, người triệu hồi, warned_at, started_at, ended_at (UTC), HP gốc, số người ACTIVE lúc bắt đầu, kết quả | (started_at) |
| world_event_contrib | Đóng góp của từng người trong Boss/sự kiện (phần thưởng) | PK (event_id, player_key) |
| fish_species / equipment_defs / achievement_defs | Danh mục nạp từ `config/*.json`, có version | |
| gift_catalog · gift_rules | Danh mục quà, quà → hành động | |
| gift_events (GiftJournal, ADR-0018) | `gift_key` (M:/S:/H:), player_key (NULL nếu thiếu userId), gift_id, repeat_count, quantity, coin_value, `effect_params` (chốt lúc nhận: received_at_utc, thời lượng buff, RNG), status RECEIVED → APPLIED / REJECTED / FAILED → DEAD, attempts, applied_at_utc, key_quality (STRONG/WEAK) | **UNIQUE gift_key**; (status, received_at_utc) |
| event_logs / comment_logs | Nhật ký (lấy mẫu khi tải cao), tự dọn 30/7 ngày | |
- Lưu giữ dữ liệu: `score_ledger`, `catches` có thể gộp/nén theo tháng (cấu hình) khi DB lớn; **không** xoá hồ sơ, sổ tay, thành tích, BXH tổng.
- Hướng mở rộng: Postgres (dữ liệu bền) + Redis sorted set (BXH nóng).

## 5. API
**Kiểm soát truy cập (ADR-0020, áp dụng cả trên localhost):** mọi request kiểm `Host` trong danh sách cho phép (chống DNS rebinding); REST thay đổi trạng thái cần cookie phiên `HttpOnly; SameSite=Strict` + header `X-Nova-CSRF` + `Origin` cùng origin; không bật CORS.
Chỉ đọc không cần phiên (chỉ từ localhost, hoặc từ LAN kèm `viewKey`): `GET /api/health`, `GET /api/state` (tóm tắt, không dữ liệu nhạy cảm), WebSocket `/ws?role=stage`.
**BXH (toàn bộ người chơi, phân trang) — đọc qua Worker, không chặn luồng chính:**
- `GET /api/leaderboard?scope=live|day|week|all&period=<khoá kỳ, mặc định kỳ hiện tại>&top=10|50|100`
- `GET /api/leaderboard?scope=hour&top=…` — **luôn là cửa sổ 60 phút đang chạy**, không nhận `period` (ADR-0010)
- `GET /api/leaderboard/hour-history?at=<giờ tròn UTC>` — **lịch sử** snapshot TOP 60 phút (API riêng, nhãn riêng)
- `GET /api/leaderboard?scope=…&period=…&cursor=<rank>&limit=<1..200>` (giới hạn trang, không phải giới hạn người chơi)
- `GET /api/leaderboard/rank/:playerKey?scope=…&period=…` → hạng + điểm + lân cận ±5
- `GET /api/leaderboard/periods?scope=live|day|week` → danh sách kỳ đã lưu
- `GET /api/players?search=&cursor=&limit=` · `GET /api/players/:playerKey` (hồ sơ, cấp, trang bị, sổ tay, thành tích) — cần phiên admin
Admin (cần phiên; ghép đôi trên máy phát hoặc mật khẩu/QR từ điện thoại — ADR-0020):
- (0.0.9) `POST /api/admin/pair-code` (tạo mã, huỷ mã cũ) · `DELETE /api/admin/pair-code` (huỷ mã đang hiển thị) · `GET /api/admin/devices` · `POST /api/admin/devices/:id/revoke` · `POST /api/admin/revoke-all` (thao tác nguy hiểm)
- `POST /api/admin/pair` · `POST /api/admin/login` · `GET /api/admin/session` (trả token CSRF) · `POST /api/admin/logout-all` · `POST /api/admin/reauth`
- `POST /api/world/{start|pause|resume|stop}` (stop = luồng lưu an toàn §1.4)
- `POST /api/live/{connect|disconnect|demo}` · `POST /api/live/new-session` (`confirm`, chỉ khi không có room_id đáng tin) · `POST /api/live/end` (luồng §1.4) · `POST /api/live/close-recovering` (`confirm`)
- `POST /api/world-events/{trigger|cancel}` · `GET/PUT /api/world-events/schedule` (chu kỳ Boss, thời gian cảnh báo, số Boss đồng thời tối đa, hệ số theo người chơi)
- `POST /api/demo/{comment|gift|like|bulk-join}` · `POST /api/demo/load {players, eventsPerSec, seconds}` (chỉ DEMO)
- `GET/PUT /api/settings` · `GET/PUT /api/gift-rules` · `POST /api/gifts/sync`
- `GET /api/metrics` · `GET /api/logs` · `POST /api/db/{backup|restore}` · `POST /api/admin/update` (zip)
Lỗi: `{ ok:false, code, message }` (tiếng Việt). Thao tác nguy hiểm cần chuỗi xác nhận gõ tay + xác thực lại trong 5 phút + ghi `admin_audit` (ADR-0020). `GET /api/metrics` gồm `alerts[]`, bậc quá tải, bộ chỉ số dữ liệu chưa ghi bền R14 (`persist.oldestUnpersistedEventAgeMs`, `oldestUnackedBatchAgeMs`, `unpersistedByType`, `ramDirtyNotEnqueued`, `writeBufferOps`, `inFlightBatches` — ADR-0017), tầng lưu trữ quà đang dùng S1–S4 (ADR-0019), dung lượng đĩa.

**WebSocket (InterestManager — không phát toàn bộ người chơi):**
- server → stage: `snapshot` (bố cục bờ hồ + người trong vùng quan tâm + sự kiện thế giới đang chạy), `interest_delta` (10 Hz), `aggregate` (1 Hz: tổng người ACTIVE/AFK, cá/phút, mật độ đoạn bờ), `event` (cá hiếm, quà, lên cấp, thành tích, Boss bắt đầu/máu/kết thúc, thời tiết — có ưu tiên), `top` (khi đổi, theo phạm vi đang luân phiên), `live_status`, `world_status`.
- stage → server: `viewport`, `metrics` (FPS, WebGL2, âm thanh).
- control: tổng quan + metrics + cảnh báo + BXH theo trang + trạng thái lưu an toàn.
- Upgrade WS kiểm `Host` + `Origin`; `role=admin` bắt buộc cookie phiên; `role=stage` chỉ đọc, cho phép Origin rỗng/`null` (Browser Source) **chỉ từ localhost**, từ LAN cần `viewKey`; message có schema, ≤ 16 KB, giới hạn tần suất theo kết nối (ADR-0020).

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

## 7. Bảo mật (chi tiết: ADR-0020, ADR-0023; sửa 0.0.8 theo R06, 0.0.9 theo R12)
- Bí mật (mật khẩu Admin, khoá ký nếu thư viện cần) do **người dùng tự đặt** qua biến môi trường; repo chỉ có `.env.example` khoá giả; file môi trường thật nằm trong `.gitignore`; Claude không đọc/ghi file môi trường thật (NOVA 1.0.3).
- **Bind:** mặc định `127.0.0.1`. Chế độ điện thoại bind địa chỉ LAN đã chọn (không mặc định `0.0.0.0`) và **không khởi động** nếu chưa đặt mật khẩu Admin (≥ 10 ký tự); tự tắt chế độ LAN khi không có phiên điện thoại trong N phút (cấu hình).
- **Xác thực admin cả trên localhost** (bỏ cơ chế "trên Mac vào thẳng" của bản cũ — không an toàn trước CSRF/DNS rebinding): ghép đôi qua launcher (`#pair=`), mật khẩu hoặc QR từ điện thoại; **mã ghép đôi hết hạn 2 phút, dùng một lần, thu hồi được** (R12); **sổ thiết bị** + thu hồi từng thiết bị / "Thu hồi tất cả" (ngắt ngay WS đang mở; đổi mật khẩu tự thu hồi tất cả); phiên cookie `HttpOnly; SameSite=Strict` (+ `Secure` trên HTTPS), server lưu hash, hết hạn 12 giờ không hoạt động; mật khẩu giữ dạng hash scrypt trong RAM; giới hạn đăng nhập 5 lần/phút/IP + khoá tăng dần.
- **CSRF/Origin/Host:** header CSRF theo phiên + `Origin` cùng origin cho mọi thay đổi trạng thái; kiểm `Host` (421 nếu sai); không CORS; WS kiểm Host/Origin như §5.
- **Thiết bị khác trong LAN:** không có phiên thì chỉ xem được stage khi có `viewKey`; không truy cập được API admin; stage không chứa dữ liệu nhạy cảm.
- **Thao tác nguy hiểm:** chuỗi xác nhận gõ tay + xác thực lại ≤ 5 phút + `admin_audit`.
- **Đầu vào:** validate mọi đầu vào; tên/comment TikTok chỉ hiển thị dạng chữ (không `innerHTML`), giới hạn độ dài, lọc ký tự điều khiển; CSP chặt, `nosniff`, `no-referrer`, `frame-ancestors 'none'` cho /control.
- **Cập nhật bản:** chỉ nhận gói **có chữ ký** (khoá công khai trong bản bán), chống path traversal/zip bomb, backup DB trước khi áp dụng.
- **Chống nghe lén LAN (0.0.9, R12 — thay mô tả 0.0.8):** Control qua LAN dùng **HTTPS + WSS** với chứng chỉ tự ký riêng từng máy cài, dấu vân tay hiển thị để đối chiếu (ADR-0023; cần người dùng duyệt thư viện tạo chứng chỉ — A16). Localhost giữ HTTP (loopback). **QR và mật khẩu là cách xác thực, KHÔNG phải biện pháp chống nghe lén.** Nếu HTTPS chưa triển khai được trong V1: đây là **giới hạn bảo mật quan trọng** — biểu ngữ thường trực "Kết nối KHÔNG mã hoá" trên Control, chỉ khuyến nghị dùng trên mạng tin cậy, ghi rõ trong INSTALL_*, Matrix, Handover (ADR-0020 mục 11).
- RateLimiter chống spam (mỗi người) và quá tải (toàn cục); REST có giới hạn tần suất.
- Hồ sơ lâu dài chỉ lưu dữ liệu cần cho game (ID, tên hiển thị, tiến trình); không lưu bình luận đầy đủ lâu dài; xoá hồ sơ theo yêu cầu là thao tác nguy hiểm (có audit).
- Bản bán chỉ chứa khoá công khai; `npm audit` mỗi lần bàn giao; backup DB tự động trước cập nhật bản và trước migration (ADR-0022).

## 8. Kế hoạch triển khai theo module (8 Phase, mỗi Phase = test thật + PROJECT_STATUS + bàn giao ChatGPT)
**Phạm vi kiểm thử (ADR-0015, cập nhật 0.0.7):**
- **macOS (máy thật MAC-1):** toàn bộ test tự động + kiểm thử thực tế với OBS và TikTok LIVE Studio + nghiệm thu từng Phase.
- **Windows — trước khi có máy:** (a) thiết kế tương thích Windows x64 (ADR-0015/0016); (b) `tools/check-portability.js` chạy mỗi lần test trên Mac; (c) **Windows CI nếu khả thi**: GitHub Actions `windows-latest` (x64) chạy `npm ci`, `npm test`, `check-portability`, `pack-release --target windows` — cần repo GitHub riêng tư (mục A14). CI chỉ chứng minh backend/build không lỗi phụ thuộc OS, **không** chứng minh OBS/LIVE Studio/GPU/âm thanh.
- **Windows — khi có máy:** giai đoạn Windows Validation (§8.2).
- Không kiểm thử Linux/Android/iOS.
Mức tải kiểm thử chuẩn: **10 · 1.000 · 10.000 người**, áp lực **50.000** (đo ngưỡng máy, không đặt giới hạn). Sự kiện: **1.000 comment/s + 200 quà/s** trong 10 phút. Thời gian: mô phỏng thế giới chạy liên tục **3 giờ** (đồng hồ tăng tốc cho test).
| Phase | Nội dung | Phụ thuộc | Tiêu chí xong |
|---|---|---|---|
| 1. Nền tảng | git init, `.gitattributes`, package.json, server Express+WS, config + `config/platform/*`, `platform.js`, Logger, Settings, Metrics, **shutdown.js (khung lưu an toàn, tín hiệu cả hai OS)**, launcher macOS + Windows, test runner, `check-portability.js`, trang thử /stage (WebGL2, âm thanh, WebSocket, 1080×1920), khung PLATFORM_COMPATIBILITY_MATRIX, **workflow Windows CI (nếu A14 được cho phép)**; **(0.0.8)** khung PersistenceClient + PersistenceWorker (mở DB, migration `001_init`, commit batch, ack/nack, dừng an toàn), khung bảo mật (Host/Origin/CSRF, ghép đôi + phiên admin, bind theo chế độ), OverloadController + Alerts tối thiểu | — | `npm test` + `check-portability` đạt trên macOS; ghi lại mức stability `node:sqlite` của bản Node LTS chốt; test Worker: commit/ack, Worker chết → gửi lại batch không trùng, **W1 (commit xong, chết trước ack → gửi lại không đổi hash DB), W2–W5** (ADR-0017 R13), `committed_batches`/`applied_ops` trong migration `001_init`; test bảo mật: mã ghép đôi hết hạn/đã dùng/đã huỷ bị từ chối, thu hồi thiết bị, CSRF/Origin lạ, Host lạ, WS admin không phiên đều bị chặn; /stage thử được trong **OBS và TikTok LIVE Studio trên macOS**; ghi Matrix; Windows: CI xanh nếu đã thiết lập, nếu chưa ghi "chưa kiểm" — **không chặn Phase 1** |
| 2. Ingest & hàng đợi | LiveConnector, MockConnector, LoadGenerator, Normalizer, Dedupe, RateLimiter, GiftJournal, PriorityEventQueue, EventBus, **LiveSessionManager (định danh theo sự kiện thật, RECOVERING)** | 1 | Trùng msgId, streak, rớt mạng / restart connector / restart server (cùng room_id → tiếp tục, không tạo buổi mới), room_id mới → buổi mới, streamEnd không nối lại; **kiểm chứng room_id, msgId, streak thực tế trên LIVE thật**; tải chuẩn 1.000 comment/s + 200 quà/s: **I1** 0 quà áp dụng hai lần, **I2** mọi quà đã `RECEIVED` kết thúc APPLIED/REJECTED/DEAD, báo cáo số quà nhận từ connector so với số đã ghi `RECEIVED`, trễ quà p95 < 1 s (gồm chờ ack); **CR1/CR2** (kill tiến trình/Worker khi tải quà) đạt I1–I3; **CR8: chèn lỗi tại từng ranh giới GB0–GB8** (ADR-0018 R09) đạt I1–I3 + I9 (RAM = DB sau khởi động) và WorldCore không đọc hiệu ứng chưa commit; **CR9** (R13); **CR10: thang lưu trữ S1–S4** — không nhận rồi đánh rơi, INGEST_HALT trước khi tràn (ADR-0019 R11); bậc quá tải L2–L4 kích hoạt và hồi phục đúng |
| 3. Thế giới liên tục headless | WorldCore/Lifecycle/Clock, PlayerRegistry nóng/lạnh, PresenceTracker (AFK 5 phút, chỉ lệnh hợp lệ/quà đánh thức, COLD, khôi phục), FishingScheduler, FishingSim, LootTable, ScoreLedger, Leaderboards 5 phạm vi + PeriodKeys + HourWindow (ADR-0010), WorldLayout, SpatialIndex, batch `progress`/`state` qua PersistenceWorker, backup `VACUUM INTO`, `verify-integrity.js`, luồng kết thúc LIVE | 1, 2 | Unit test; `simulate-balance.js` 10/1.000/10.000 người chạy 3 giờ mô phỏng; tick p95 < 20 ms; `verify-leaderboards.js` khớp tính lại từ ledger **về toàn bộ thứ tự** (kể cả cửa sổ trượt 60 phút, tiêu chí phụ kg và `reached_at` theo công thức R10 — các ca hoà, nhiều sự kiện cùng bucket, bucket hết hạn đổi thứ tự); qua 00:00 và thứ Hai giờ VN đúng (test với giờ máy khác múi); timestamp DB đều UTC; test like không đánh thức AFK, lệnh/quà đánh thức; test rời → quay lại khôi phục đủ; **CR1–CR6** (ADR-0022) chạy trên macOS với bất biến I1–I10; **RPO thực tế đo theo ADR-0022 mục R14** (đối chiếu sự kiện đã sinh với DB sau khởi động, báo phân phối số/thời gian mất theo loại, và độ lệch so với chỉ số cảnh báo lúc kill) và RTO — ghi số đo vào TEST_REPORT, không ghi "không mất dữ liệu"; tick p95 không tăng khi Worker ghi tải lớn (chứng minh R01); test DEMO không ghi được vào `nova-live.db` (ADR-0021) |
| 4. Tiến trình & sự kiện thế giới (headless) | Leveling, Equipment, Inventory, FishDex, Achievements, WorldEventScheduler (Boss 30 phút + Boss quà, cảnh báo trước, chống chồng chéo, điều chỉnh theo người chơi/server), BossFight, BuffManager, gắn quà → hành động | 3 | Unit test; mô phỏng cân bằng XP/cấp & Boss ở 10/1.000/10.000 người; Boss lịch + Boss quà không chồng quá cấu hình; luôn có cảnh báo trước; server quá tải → Boss được hoãn; yêu cầu Boss quà đã APPLIED nằm trong `world_events QUEUED` và còn sau restart |
| 5. Cảnh 3D cơ bản | Renderer, hồ, nước, trời, ShoreGenerator, camera dọc, preset, HUD FPS | 1 | 30 FPS ở 1080×1920 trên M1 kèm phần mềm phát; preset Tự động sẵn cho GPU Windows (đo ở §8.2) |
| 6. Đám đông, cá, Boss 3D | CrowdRenderer (Instanced + LOD 0–3 + culling + grid + pool), HeroAngler, cần/dây/phao, cá, BossView, SpotlightDirector, NameTagAtlas, InterestManager | 3, 4, 5 | 30 FPS với 1.000 và 10.000 người (preset Vừa); đồng bộ đúng server; không rò bộ nhớ sau 30 phút người vào/ra liên tục |
| 7. Overlay, FX, âm thanh & Control | HUD, BXH luân phiên 5 phạm vi, banner hạng/cấp/thành tích, EventQueue, AudioQueue; Control điện thoại đầy đủ (§6), bảng cảnh báo quá tải, audit Admin | 2, 3, 4, 6 | Chồng 1.000 sự kiện/s không vỡ hàng đợi; điều khiển trọn vòng từ điện thoại (ghép đôi QR/mật khẩu); **Control qua LAN chạy HTTPS + WSS trên điện thoại thật (ADR-0023, sau khi A16 được duyệt) — hoặc, nếu chưa được, biểu ngữ giới hạn bảo mật hiển thị đúng**; sổ thiết bị + thu hồi hoạt động; phân trang đúng ở 10.000 người; bộ test bảo mật ADR-0020/0023 đạt |
| 8. Ổn định & phát hành | Bản quyền, `pack-release.js` tạo gói macOS + Windows, quyền file, INSTALL_MACOS (đã thử) + INSTALL_WINDOWS (bản nháp, chưa thử thực tế), soak 3 giờ trên macOS, chạy lại CR1–CR6 trên bản đóng gói (mất điện thật CR7 ghi "chưa chứng minh"), đo RAM/CPU, Matrix, Handover | tất cả | PRE_RELEASE checklist đạt trên macOS; tiêu chí nghiệm thu V1 phần macOS có bằng chứng; gói Windows được build (CI nếu có) và **ghi rõ "Windows: mục tiêu, chưa nghiệm thu"** trong Handover/hướng dẫn |
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
- **Mới 0.0.8 (theo review R01–R08):** **ADR-0017** PersistenceWorker (R01) · **ADR-0018** Idempotency quà & GiftJournal (R02) · **ADR-0019** Bậc quá tải, backpressure, lỗi lưu trữ (R04, R05) · **ADR-0020** Bảo mật REST/WS/LAN (R06) · **ADR-0021** Định danh người chơi LIVE/DEMO (R07) · **ADR-0022** Độ bền dữ liệu, RPO/RTO, crash recovery (R08).
- **Mới 0.0.9:** **ADR-0023** HTTPS cho Control qua LAN (R12).
- **Sửa 0.0.9 (theo review R09–R14; phần bị thay đều được đánh dấu, không xoá lịch sử):** ADR-0018 (R09 commit trước/công bố RAM sau, GB0–GB8) · ADR-0010 (R10 `reached_at`) · ADR-0019 (R11 thang S1–S4; R14 ngưỡng) · ADR-0020 (R12 ghép đôi/thu hồi, bỏ mô tả QR chống nghe lén) · ADR-0017 (R13 idempotency batch/op; R14 chỉ số) · ADR-0022 (R14 RPO chỉ từ crash test; CR8–CR10; I9–I10).
- **Sửa 0.0.8:** ADR-0010 (R03 — thiết kế chi tiết cửa sổ 60 phút, tách snapshot lịch sử, số nguyên) · ADR-0005 (R04) · ADR-0006 (làm rõ bảo đảm quà) · ADR-0011 (ghi qua Worker, `player_key`) · ADR-0012 (luồng tắt qua Worker) · ADR-0013 (hàng chờ Boss quà trong cùng transaction) · ADR-0016 (rủi ro `DatabaseSync` → ADR-0017; không đổi DB).

## 10. Rủi ro & phương án dự phòng
| Rủi ro | Mức | Phương án |
|---|---|---|
| `tiktok-live-connector` không chính thức; TikTok đổi giao thức | Cao | Ghim bản; adapter tách; không poll sau streamEnd; Mock + LoadGenerator |
| RAM 8 GB khi thế giới chạy hàng giờ và người chơi tích luỹ | Cao | PlayerRegistry nóng/lạnh (COLD → chỉ DB); mục tiêu < 1 KB/người nóng; đo ở Phase 3 |
| Mất dữ liệu khi tắt đột ngột | Cao | Phân loại C1–C6 + RPO/RTO (ADR-0022); WAL `synchronous=FULL`; journal quà ghi bền trước khi áp dụng (ADR-0018); luồng tắt qua Worker; backup `VACUUM INTO`; CR1–CR6. Rủi ro còn lại: quà chưa kịp ghi bền (G3); ổ đĩa có cache ghi không tôn trọng fsync; mất điện thật chưa kiểm được (CR7) |
| `DatabaseSync` chặn event loop (fsync, checkpoint WAL, truy vấn lớn) | Cao | PersistenceWorker sở hữu DB, ReadWorker tuỳ chọn; luồng chính chỉ gọi bất đồng bộ (ADR-0017); đo tick p95 khi ghi tải lớn ở Phase 3 |
| Crash giữa các bước xử lý quà → cộng hai lần hoặc bỏ sót | Cao | `gift_key` UNIQUE; hiệu ứng + APPLIED cùng transaction; **RAM chỉ được công bố sau ack commit** (R09); idempotency hai lớp `committed_batches` + `applied_ops` (R13); replay trước khi RUNNING; ranh giới crash GB0–GB8 ở ADR-0018 — **không tuyên bố exactly-once** |
| `msgId`/streak của thư viện TikTok không như giả định | Cao | Khoá dự phòng `H:` + cờ `WEAK_KEY` + cảnh báo; kiểm chứng trên LIVE thật ở Phase 2 trước khi tuyên bố chống trùng |
| Đĩa đầy / lỗi ghi / DB hỏng | Cao | DiskMonitor, bậc L3–L4, SAFE MODE, đường quà khẩn cấp, backup + khôi phục (ADR-0019, ADR-0022) |
| Truy cập trái phép từ trang web độc hại trên máy phát hoặc thiết bị trong LAN | Cao | Xác thực cả localhost, CSRF + Origin + Host, `viewKey`, audit, xác thực lại cho thao tác nguy hiểm (ADR-0020) |
| Nghe lén Control qua LAN | **Cao** (nếu chưa có HTTPS) / Trung (có HTTPS tự ký) | HTTPS + WSS tự ký, dấu vân tay để đối chiếu (ADR-0023, cần duyệt A16). Rủi ro còn lại có HTTPS: người dùng bấm chấp nhận cảnh báo chứng chỉ mà không đối chiếu; trình duyệt điện thoại xử lý WSS tự ký khác nhau (D7). Nếu chưa có HTTPS: giới hạn bảo mật quan trọng, biểu ngữ thường trực, chỉ mạng tin cậy, ghép đôi có hạn/một lần/thu hồi, thu hồi toàn bộ (ADR-0020 mục 11) |
| Hết mọi nơi lưu trữ quà (DB + file khẩn cấp + RAM) | Trung | Thang S1–S4: ngừng tiếp nhận có kiểm soát trước khi tràn, cảnh báo nguy cơ mất, thông báo trung tính trên stage (ADR-0019 R11). Rủi ro còn lại: quà trong S3 mất nếu tiến trình chết; quà gửi sau INGEST_HALT không đến được game |
| Hiệu ứng quà công bố muộn hơn (chờ 2 lần ack) | Thấp | Đánh đổi có chủ ý để WorldCore không dùng hiệu ứng chưa bền (R09); vẫn trong tiêu chí trễ quà p95 < 1 s — đo ở Phase 2 |
| Bảng `applied_ops`/`committed_batches` phình to | Thấp | Dọn sau 7 ngày (cấu hình), không dọn khi có batch đang chờ (ADR-0017 R13) |
| DEMO ghi đè/trộn hồ sơ LIVE | Trung | Hai file DB tách biệt + realm theo connector + khoá có tiền tố + CHECK (ADR-0021) |
| Xác định sai "buổi LIVE mới" (reset TOP LIVE nhầm hoặc không reset) | Trung | Định danh theo sự kiện thật (room_id mới / streamEnd); RECOVERING khi restart; kiểm chứng room_id ở Phase 2; snapshot TOP LIVE trước khi thay buổi; khôi phục được từ ledger |
| Sai ranh giới ngày/tuần hoặc cửa sổ 60 phút | Trung | Lưu UTC; PeriodKeys quy đổi Asia/Ho_Chi_Minh (00:00–23:59:59, thứ Hai–Chủ nhật); cửa sổ trượt theo bucket phút; test với giờ máy ở múi khác; tính lại được từ ledger |
| Cửa sổ trượt 60 phút tốn CPU khi đông | Trung | Bucket theo phút: mỗi phút chỉ trừ điểm của bucket hết hạn (O(số người có điểm trong phút đó · log n)); đo ở Phase 3 |
| Boss dồn dập (lịch + nhiều quà triệu hồi) | Trung | Số Boss đồng thời cấu hình (mặc định 1), hàng chờ Boss quà, khoảng nghỉ tối thiểu, hoãn khi server quá tải; quà triệu hồi đã APPLIED nằm trong hàng chờ bền (ADR-0013/0018) |
| DB phình to sau nhiều tháng | Trung | Gộp/nén ledger & catches theo tháng; chỉ mục đúng; sao lưu định kỳ |
| Lạm phát tiến trình (người cũ quá mạnh, người mới nản) | Trung | Mô phỏng cân bằng Phase 4; BXH giờ/LIVE cho người mới cơ hội; đường cong XP giảm dần |
| FPS tụt khi đông / Boss + quà dồn | Cao | Chỉ vẽ chi tiết vùng camera; LOD; ngân sách render tự điều chỉnh; EventQueue có trần |
| Lũ sự kiện | Cao | Token bucket, hàng đợi ưu tiên có giới hạn, gộp, xử lý theo lô, backpressure tới Worker, bậc L0–L4 (ADR-0019); quà ghi `RECEIVED` bền trước khi áp dụng |
| SQLite một luồng ghi | Trung | Một Worker ghi duy nhất, WAL + batch transaction; ReadWorker cho đọc; repository interface → Postgres (cần ADR) |
| WebGL2/âm thanh khác nhau giữa OBS và TikTok LIVE Studio, giữa macOS và Windows (CEF, tăng tốc phần cứng, tự phát âm thanh) | Cao | Kiểm thực tế từ Phase 1 trên cả hai OS; hướng dẫn bật tăng tốc phần cứng Browser Source và "Control audio via OBS"; dự phòng quay cửa sổ trình duyệt; ghi Matrix |
| Chưa có máy Windows thật để kiểm thử (đã biết, người dùng chấp nhận) | **Cao** | Không chặn Phase 1/2; thiết kế tương thích Windows x64; `check-portability.js`; Windows CI nếu khả thi (A14); ghi "Windows: mục tiêu, chưa nghiệm thu" ở mọi báo cáo; giai đoạn Windows Validation §8.2 khi có máy. Rủi ro còn lại: lỗi OBS/GPU/âm thanh/LIVE Studio trên Windows chỉ phát hiện muộn → giữ khác biệt OS tập trung ở `platform.js` để sửa nhanh |
| TikTok LIVE Studio không có hoặc không hỗ trợ Browser Source trên một OS | Trung | Không mặc định; kiểm thực tế; nếu không được, OBS là đường phát chính trên OS đó (ghi Matrix + hướng dẫn) |
| Phát qua OBS cần quyền stream key/RTMP của tài khoản TikTok | Trung | Ngoài kiểm soát của game; tiêu chí nghiệm thu là OBS lấy được hình; hướng dẫn ghi rõ điều kiện tài khoản |
| Khác biệt OS: đường dẫn, hoa/thường tên file, xuống dòng, tên file tiếng Việt trong zip, tín hiệu tắt, khoá file khi cập nhật, tường lửa khi mở chế độ điện thoại | Trung | `platform.js`, `path`, `.gitattributes`, tên file ASCII cho launcher/gói, `check-portability.js`, Updater đổi file sau khởi động lại, hướng dẫn tường lửa từng OS |
| Gatekeeper (macOS) / SmartScreen + antivirus (Windows) chặn launcher chưa ký | Trung | Hướng dẫn mở lần đầu từng OS; cân nhắc ký mã ở Phase 8 (cần người dùng quyết định chi phí) |
| Phần cứng Windows rất đa dạng (GPU yếu, driver cũ) | Trung | Preset Tự động + cấu hình tối thiểu được công bố; đo trên máy kiểm thử |
| Bản quyền model/âm thanh · chính sách TikTok · lộ khoá khi bán | Trung | CC0 + CREDITS; không quy đổi tiền thật; chỉ khoá công khai |

## 11. Độ bền dữ liệu, nhất quán quà & bảo mật (0.0.8 — theo review R01–R08)
| Yêu cầu | Tóm tắt thiết kế | Chi tiết |
|---|---|---|
| R01 Database & event loop | Rủi ro D1–D7 của `DatabaseSync` (đồng bộ, fsync, checkpoint, lỗi I/O ném đồng bộ, stability chưa xác minh). PersistenceWorker (`worker_threads`) sở hữu duy nhất kết nối ghi; ReadWorker tuỳ chọn; giao tiếp `postMessage` có schema (`commit/ack/nack/read/result/health`); batch theo lớp `critical`/`progress`/`state`/`log`; mỗi batch một transaction `BEGIN IMMEDIATE`; WAL + `synchronous=FULL`; checkpoint trong Worker; Worker chết → gửi lại batch chưa ack (idempotent) → SAFE MODE nếu lặp. Không đổi công nghệ DB. | ADR-0017, ADR-0016 |
| R02 Gift idempotency | `gift_key` UNIQUE; `RECEIVED` ghi bền **trước** khi áp dụng; hiệu ứng + `APPLIED` cùng transaction; `UNIQUE(source_key, effect_seq)` ở mọi bảng nhận hiệu ứng; tham số phụ thuộc thời gian chốt lúc nhận; bảng crash từng bước; replay khi khởi động. Bảo đảm G1–G3; **không tuyên bố exactly-once**. | ADR-0018 |
| R03 Leaderboard 60 phút | Bucket theo `minute_utc`; cửa sổ = 60 bucket `[m−59, m]` (độ dài thực [59, 60) phút); HourWindow trong RAM với cấu trúc có thứ tự; trượt theo đồng hồ đơn điệu, bắt kịp khi trễ; chỉ phản ánh dữ liệu đã commit; số nguyên `score`/`weight_g`; dựng lại từ ScoreLedger; snapshot lịch sử ở bảng + API riêng, không bao giờ dùng để dựng bảng hiện tại. | ADR-0010 |
| R04 Unlimited players | Giữ nguyên không giới hạn cứng; bảng giới hạn vận hành có cấu hình; bậc L0–L4: giảm render → gộp sự kiện → backpressure → chuyển hồ sơ lạnh → tạm dừng mô phỏng; không xoá người chơi, không từ chối tham gia, không chủ động bỏ quà. | ADR-0005, ADR-0019 |
| R05 Event queue | Backpressure xuyên suốt tới Worker; mã cảnh báo + `alerts[]`; phục hồi sự kiện sau restart theo loại; xử lý đĩa sắp đầy/ENOSPC/BUSY/IOERR/CORRUPT; SAFE MODE + đường quà khẩn cấp; không tuyên bố "quà không bao giờ mất". | ADR-0019 |
| R06 Security | Xác thực cả localhost (ghép đôi/mật khẩu/QR), phiên cookie HttpOnly SameSite=Strict, CSRF + Origin + Host, WS kiểm tra tương ứng, `viewKey` cho stage từ LAN, thao tác nguy hiểm xác nhận + xác thực lại + audit, gói cập nhật có chữ ký, CSP. QR/mật khẩu chỉ là xác thực, **không** chống nghe lén — chống nghe lén LAN: xem R12 (0.0.9). | ADR-0020, §5, §7 |
| R07 Player identity | `player_key` = `tt:<userId>` / `demo:<id>`; `realm` + `UNIQUE(realm, external_id)` + CHECK; **hai file DB** `nova-live.db`/`nova-demo.db`; realm do loại connector quyết định; `schema_migrations` + backup trước migration. | ADR-0021, §4 |
| R08 Data durability | Phân loại C1–C6 với RPO/RTO mục tiêu; làm rõ 500 ms là chu kỳ gom; backup `VACUUM INTO`; bất biến I1–I10; kiểm thử CR1–CR10 (CR7 mất điện thật: chưa chứng minh được). Cách đo RPO thực tế: xem R14 (0.0.9) — bản 0.0.8 dùng riêng `persist.unackedAgeMs`, đã thay. | ADR-0022 |

### 11.1 Bổ sung 0.0.9 — theo review R09–R14
| Yêu cầu | Tóm tắt thiết kế | Vị trí đã sửa |
|---|---|---|
| R09 GiftJournal: thứ tự commit & RAM | `RECEIVED` bền → tính hiệu ứng tất định thành **delta có khoá idempotency**, không đọc RAM của WorldCore → commit hiệu ứng + `APPLIED` một transaction → **chỉ sau ack** mới công bố vào WorldCore (`publishCommittedGift`) rồi FX. Hiệu ứng chờ commit nằm trong `PendingGiftEffects` vô hình với gameplay. Khởi động: dựng RAM từ DB trước rồi mới replay. 9 ranh giới crash GB0–GB8, mỗi ranh giới là một ca test (CR8). | ADR-0018 (Quy trình 0.0.9, Ranh giới crash), ADR-0022 (CR8, I9), §8 Phase 2, §10, Phụ lục B |
| R10 BXH 60 phút: tiêu chí hoà | `reached_at` = thời điểm tổng hiện tại được hình thành = lần thay đổi tổng gần nhất: sự kiện mới (`at_utc`, độ phân giải ms, kể cả nhiều sự kiện cùng bucket) hoặc bucket hết hạn tại ranh giới logic `expiry(b)`; công thức đóng; hoà cả ba → `player_key` (tiêu chí kỹ thuật cuối, không phải luật chơi); đối chiếu toàn bộ thứ tự với tính trực tiếp từ ScoreLedger. | ADR-0010 (mục R10, dựng lại), §8 Phase 3 |
| R11 Hết nơi lưu trữ | Thang S1 DB → S2 file khẩn cấp (fsync) → S3 RAM có trần → **S4 ngừng tiếp nhận ở 90%** (ngắt TikTok, không tự nối lại; từ chối kết nối mới trừ phiên admin); cảnh báo `GIFT_AT_RISK`/`INGEST_HALTED` nêu rõ nguy cơ mất; thông báo trung tính trên stage; không tuyên bố giữ quà vô hạn. | ADR-0019 (mục R11), ADR-0022 (CR10), §8 Phase 2, §10 |
| R12 Bảo mật LAN | HTTPS + WSS cho chế độ LAN với chứng chỉ tự ký từng máy + dấu vân tay (ADR-0023, cần duyệt thư viện A16); ghép đôi hết hạn 2 phút/một lần/thu hồi được; sổ thiết bị + thu hồi từng/tất cả; bỏ mô tả QR/mật khẩu như biện pháp chống nghe lén; nếu chưa có HTTPS → giới hạn bảo mật quan trọng, hiển thị thường trực, chỉ mạng tin cậy. | ADR-0020, **ADR-0023 (mới)**, §3, §4 (`admin_devices`), §5, §7, §8 Phase 7, §10 |
| R13 Idempotency Worker | `committed_batches` (lớp batch, `batch_id` không đổi khi gửi lại) + `applied_ops` (lớp op, `op_key` ổn định từ miền nghiệp vụ, chỉ cộng khi chèn được) trong **cùng transaction**; trạng thái batch PENDING/SENT/COMMITTED/REJECTED/RETRYABLE/UNKNOWN + message `status`; test W1 (commit rồi chết trước ack) – W5. | ADR-0017 (mục R13), ADR-0022 (CR9, I10), §4, §8 Phase 1 |
| R14 RPO thực tế | Bộ chỉ số `oldestUnpersistedEventAgeMs`, `oldestUnackedBatchAgeMs`, `unpersistedByType`, `ramDirtyNotEnqueued`, … chỉ là **cảnh báo**; RPO thực tế chỉ công bố khi đo bằng crash test (đối chiếu sự kiện đã sinh với DB), ghi TEST_REPORT kèm độ lệch so với chỉ số. | ADR-0017 (mục R14), ADR-0019 (ngưỡng), ADR-0022 (mục R14), §1.4, §5, §8 Phase 3 |

**Những điểm CHƯA chứng minh** (chỉ là mục tiêu thiết kế cho đến khi có số đo): RPO/RTO thực; tick p95 khi Worker ghi tải lớn; trễ quà p95 sau khi thêm bước chờ ack thứ hai (R09); hành vi `msgId`/streak/`room_id` của thư viện trên LIVE thật; hiệu năng ghi `node:sqlite` trên Windows; độ bền khi mất điện thật; `fs.statfs` trên Windows; HTTPS/WSS tự ký trên trình duyệt điện thoại thật (D7); fsync của file khẩn cấp trên từng OS; chi phí `applied_ops` ở tải 200 quà/s + 10.000 người.

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
- Dedupe: `gift_key` = `M:<msgId>`; streak `S:<playerKey>:<gift>:<groupId>:<repeatCount>` chỉ cộng phần tăng, chốt ở `repeatEnd`; thiếu khoá → `H:<hash>` + `WEAK_KEY`; LRU+TTL + `UNIQUE gift_key` trong DB (ADR-0018).
- RateLimiter token bucket mỗi người + toàn cục; tham gia không bị bỏ, chỉ trễ.
- PriorityEventQueue có giới hạn: P0 hệ thống · P1 quà · P2 tham gia/quay lại · P3 lệnh · P4 like/share (gộp). Tràn: P4 gộp/lấy mẫu có đếm; P3 giảm tần suất; P2 chỉ trễ; P1 (quà) **không bị chủ động bỏ** — quà ghi `RECEIVED` bền trước khi áp dụng. Backpressure + cảnh báo + bậc quá tải: ADR-0019.
- GiftJournal (ADR-0018, sửa 0.0.9 theo R09): `RECEIVED` (ghi bền, group commit ≤ 50 ms, chờ ack) → tính hiệu ứng tất định từ `effect_params` thành delta có khoá idempotency (**không chạm RAM của WorldCore**) → hiệu ứng + `APPLIED` trong **cùng một transaction** → **chờ ack** → công bố vào WorldCore → FX. Khi hết nơi lưu trữ: thang S1–S4 (ADR-0019 R11). Khởi động lại: replay `RECEIVED/FAILED` trước khi RUNNING; lỗi lặp → `DEAD` + cảnh báo. Bảo đảm: không áp dụng hai lần hiệu ứng đã lưu; quà chưa ghi bền có thể mất — **không tuyên bố exactly-once**.
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
  - **Không chồng chéo ngoài cấu hình:** `maxConcurrentBosses` mặc định 1; Boss quà đến khi đang có Boss → xếp hàng (giữ thứ tự; mục hàng chờ ghi cùng transaction với APPLIED, bền qua restart); Boss lịch gặp Boss khác → hoãn đến khi xong + khoảng nghỉ tối thiểu (cấu hình).
  - **Điều chỉnh theo người chơi & server:** HP/thời lượng/phần thưởng co giãn theo số người ACTIVE lúc bắt đầu; 0 người ACTIVE → hoãn Boss lịch; server quá tải (tick, độ sâu hàng đợi, FPS stage báo về) → hoãn bắt đầu và/hoặc giảm hiệu ứng, không huỷ yêu cầu Boss quà.
  - Mọi người ACTIVE góp sát thương bằng cá câu được/quà; phần thưởng theo đóng góp (`world_event_contrib`).
