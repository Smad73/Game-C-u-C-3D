# GÓI KIỂM DUYỆT KIẾN TRÚC CUỐI — NOVA FISHING LIVE 3D v0.0.6
Gửi: ChatGPT (NOVA Architect & Reviewer) — Người lập: Claude (Lead Developer) — Ngày: 2026-11-24
Model đã dùng cho giai đoạn này: Opus 5.5 (kiến trúc, theo NOVA MODEL SELECTION POLICY).
Trạng thái: **CHỜ CHATGPT DUYỆT KIẾN TRÚC CẬP NHẬT (phạm vi V1 macOS + Windows). Chưa viết code; Phase 1 chưa bắt đầu.** Claude không tự đánh giá thay ChatGPT. Gói không chứa bí mật.

## 1. Tài liệu cần duyệt
| Tài liệu | Nội dung chính |
|---|---|
| `docs/ARCHITECTURE.md` (0.0.6) | §0 nguyên tắc (không giới hạn người chơi, thế giới liên tục, **§0.3 phạm vi V1 macOS + Windows**), **§8.1 tiêu chí nghiệm thu V1**, **Phụ lục A2 thiết lập OBS / LIVE Studio** · §1.1–1.4 vòng đời thế giới / cần thủ / buổi LIVE / tắt an toàn · §2 công nghệ · §3 thư mục · §4 DB · §5 API + WS · §6 giao diện · §7 bảo mật · §8 kế hoạch 8 Phase · §9 ADR · §10 rủi ro · Phụ lục A đồ hoạ, B TikTok + đường ống sự kiện, C mở rộng ngang, D tiến trình + Boss |
| `docs/PROJECT_BRIEF.md` | Mục tiêu, chức năng bắt buộc, ngoài phạm vi, ràng buộc, tiêu chí hoàn thành đo được |
| `docs/PROJECT_STATUS.md` | Trạng thái 8 Phase, chuẩn bị Phase 1, danh sách chặn, checklist PRE_DEVELOPMENT |
| `docs/ADR/0001`–`0016` | 16 ADR (0014 đã bị thay thế bởi 0015) |
| `docs/PLATFORM_COMPATIBILITY_MATRIX.md` | **Mới**: máy kiểm thử, ma trận 20 hạng mục × (macOS, Windows) × (OBS, LIVE Studio) — chưa có kết quả |
| `CLAUDE.md` dự án | Phạm vi V1, điều cấm (đường dẫn Mac, lệnh riêng macOS, native), chưa triển khai |
| Quy chuẩn NOVA (cập nhật 0.0.5) | `~/NOVA_AI_DEVELOPMENT/CLAUDE.md` luật 10 + `RULES/CORE_RULES.md` mục "Phạm vi nền tảng" (PLATFORM SCOPE SELECTION POLICY) |

## 2. ADR
| ADR | Quyết định | Thay đổi ở 0.0.4 |
|---|---|---|
| 0001 | Three.js trên trình duyệt | — |
| 0002 | Server headless là nguồn sự thật; client chỉ nhận vùng quan tâm | — |
| 0003 | Adapter TikTok tách biệt + tầng Ingest | 0.0.5: chỉ cài một thư viện TikTok, không adapter thứ hai |
| 0004 | Khung dọc 1080×1920 | 0.0.6: áp dụng OBS + LIVE Studio cả hai OS |
| 0005 | Số cần thủ không giới hạn; tách gameplay khỏi hiển thị | Sửa: tương tác hợp lệ đánh thức AFK = lệnh/quà; like không tính |
| 0006 | Đường ống sự kiện chịu tải | — |
| 0007 | Render đám đông (Instanced, LOD, culling, grid, pool, spotlight) | — |
| 0008 | Sẵn sàng mở rộng ngang | — |
| 0009 | Continuous Live World | Sửa: chỉ TOP LIVE được reset; không giới hạn thời gian hoạt động |
| 0010 | BXH 5 phạm vi trên sổ cái điểm | **Viết lại:** TOP giờ = cửa sổ trượt 60 phút; ngày/tuần giờ VN; điểm + tổng kg; lưu UTC |
| 0011 | Tiến trình lâu dài, registry nóng/lạnh | Sửa: OFFLINE → tầng lưu trữ COLD |
| 0012 | Vòng đời buổi LIVE & tắt an toàn | 0.0.4 viết lại (định danh theo sự kiện thật); 0.0.6: tín hiệu tắt Windows, nút Thoát an toàn là đường chính |
| 0013 | Hệ thống Boss | **Mới** (0.0.4) |
| 0014 | ~~Phạm vi chỉ macOS~~ | **Đã bị thay thế** bởi 0015 |
| 0015 | Phạm vi V1: macOS + Windows, một codebase, OBS cả hai OS, LIVE Studio kiểm riêng | **Mới** (0.0.6) |
| 0016 | Không phụ thuộc native: `node:sqlite`, Node ≥ 22.13 | **Mới** (0.0.6, đề xuất kỹ thuật cần duyệt) |

## 3. Đối chiếu quyết định ChatGPT đã chốt → vị trí trong tài liệu
| Quyết định | Vị trí |
|---|---|
| AFK 5 phút; không xoá; giữ tiến trình; dừng tự quăng; lệnh hợp lệ/quà đánh thức; like không tính | ARCHITECTURE §1.2, Phụ lục B · ADR-0005, 0011 |
| TOP LIVE / 60 phút / ngày VN / tuần VN / tổng; điểm chính, kg phụ; TOP 10/50/100 luân phiên; Control phân trang | ARCHITECTURE §0.2, §4, §5, §6, Phụ lục D · ADR-0010 |
| Buổi LIVE theo sự kiện thật; mất kết nối không tạo buổi mới; phục hồi connector; chỉ reset TOP LIVE khi xác nhận | ARCHITECTURE §1.3, §1.4 · ADR-0012 |
| Asia/Ho_Chi_Minh; ngày 00:00–23:59:59; tuần thứ Hai–Chủ nhật; lưu UTC | ARCHITECTURE §2, §4 · ADR-0010 |
| Boss 30 phút, cấu hình Admin, Boss quà, cảnh báo, không chồng chéo, điều chỉnh theo người chơi/server | ARCHITECTURE Phụ lục D, §5, §6, §8 Phase 4 · ADR-0013 |
| Không phiên 10 phút; không giới hạn thời gian; không reset hồ sơ; chỉ reset TOP LIVE; BXH dài hạn độc lập | ARCHITECTURE §0.2, §1.1 · ADR-0009 |
| **Phạm vi V1 macOS + Windows**; một codebase dùng chung engine/backend/DB/connector/gift; OBS cả hai OS; LIVE Studio kiểm riêng; WebGL2/âm thanh/WS/1080×1920; cấu hình + hướng dẫn riêng từng OS; không đường dẫn Mac, không lệnh/thư viện riêng macOS; Matrix + kiểm thử thực tế; chưa làm Linux/Android/iOS/native | ARCHITECTURE §0.3, §2, §3, §1.4, §8, §8.1, §10, Phụ lục A2 · ADR-0015, 0016, 0004, 0012 · PLATFORM_COMPATIBILITY_MATRIX · CLAUDE.md |
| 7 tiêu chí nghiệm thu V1 | ARCHITECTURE §8.1 · BRIEF · Matrix |

## 4. Danh sách quyết định còn thực sự chưa xác định
### A. Quyết định thực sự chưa xác định
| # | Nội dung | Cần trước | Ảnh hưởng |
|---|---|---|---|
| A1 | Bản NOVA áp dụng: v1.0.1 (đang cài, CLAUDE.md đang trỏ tới) hay v1.0.3 (có zip trong thư mục người dùng) | **Phase 1** | Quy trình, mẫu báo cáo, hook bảo vệ |
| ~~A2~~ | ~~Có cần bản Windows song song không~~ — **đã giải quyết 0.0.6: CÓ, ngay từ V1** (người dùng chỉnh phạm vi, ADR-0015; thay kết luận "không" của 0.0.5) | — | — |
| A3 | Danh sách **lệnh comment hợp lệ** ngoài `câu`/`câu cá` (đề xuất: `hạng`, `top`, `túi`, `sổ tay`) — quyết định luôn cả cái gì đánh thức AFK | Phase 2 | CommentParser, PresenceTracker |
| A4 | Bảng **quà → hành động**: quà nào triệu hồi Boss đặc biệt, quà buff (mồi/cần/lưới/thời tiết), mốc like toàn phòng có kích hoạt giờ vàng không | Phase 4 | GiftRules, WorldEventScheduler |
| A5 | Có được tái dùng/chép logic `TikTokConnector.js`, `GiftManager` từ `glass-bridge-live` không | Phase 2 | Thời gian làm Phase 2 |
| A6 | Mức tải mục tiêu dùng làm tiêu chí nghiệm thu (đề xuất 10 / 1.000 / 10.000 người, áp lực 50.000; 1.000 comment/s + 200 quà/s) | Phase 2 | Tiêu chí test Phase 2–8 |
| A7 | Bối cảnh/phong cách đồ hoạ (hồ làng quê VN, biển, nhiều bản đồ?) và có skin không | Phase 5 | Asset, ShoreGenerator, phạm vi test đa skin |
| A8 | Có cần TTS đọc tên/quà không | Phase 7 | AudioQueue, phụ thuộc thêm |
| A9 | Hệ bản quyền/kích hoạt: dùng lại hệ license game cũ hay làm mới | Phase 8 | License, đóng gói |
| A10 | Điện thoại dùng mở trang Control là iPhone (Safari) hay Android (Chrome) — để kiểm thử đúng trình duyệt trong phạm vi | Phase 7 | Phạm vi kiểm thử /control |
| A11 | **Máy Windows để kiểm thử thực tế** (máy của người dùng hoặc người hỗ trợ): phiên bản Windows, CPU, GPU, RAM; có OBS và TikTok LIVE Studio không. Không có máy Windows thật thì không chứng minh được tiêu chí 2, 3, 4, 6 trên Windows. Máy ảo Windows ARM trên M1 không đại diện GPU/x64 | **Phase 1** | Tiêu chí nghiệm thu V1 |
| A12 | Kiến trúc CPU hỗ trợ: macOS Apple Silicon (arm64) và/hoặc Intel (x64)? Windows x64 (đề xuất) và/hoặc ARM64? | Phase 1 (launcher), Phase 8 (gói) | Gói phát hành, kiểm thử |
| A13 | Cách cung cấp Node cho người dùng cuối: yêu cầu tự cài Node LTS (như game cũ?) hay đóng kèm runtime Node theo OS trong gói | Phase 8 (ảnh hưởng hướng dẫn từ Phase 1) | Dung lượng gói, hướng dẫn cài |
| A14 | Có cho phép tạo repo GitHub (riêng tư) + CI chạy `npm test` trên macOS và Windows không (chỉ kiểm backend, không thay kiểm thử OBS/GPU thật) | Phase 1 | Bằng chứng tiêu chí 6 tự động |
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

## 5. Đề nghị ChatGPT
1. Duyệt (hoặc yêu cầu sửa) kiến trúc cuối 0.0.4.
2. Xác nhận hoặc sửa các diễn giải ở mục B.
3. Trả lời A1 (trước Phase 1) và A11 (máy Windows — cần để đạt tiêu chí Phase 1); xem xét ADR-0016 (đổi DB sang `node:sqlite`) vì là thay đổi kỹ thuật mới; các mục A khác có thể trả lời trước Phase tương ứng.
4. Sau khi duyệt: Claude bắt đầu Phase 1 theo `docs/PROJECT_STATUS.md` → "Chuẩn bị Phase 1", model khuyến nghị **Sonnet 5.5**.

## 6. Kiểm tra đã chạy cho gói này
- Quét `docs/` không còn giới hạn 16 ô, cơ chế phiên 10 phút, thuật ngữ OFFLINE cũ, không còn kết luận "chỉ macOS" ngoài ADR-0014 (đã đánh dấu thay thế); không còn `better-sqlite3`/Node 20 trong kế hoạch; không có kế hoạch Linux/Android/iOS/native.
- Quét chuỗi bí mật trong `docs/`: không có giá trị bí mật.
- Chưa có code nên chưa có build/unit/e2e (đúng phạm vi giai đoạn).
