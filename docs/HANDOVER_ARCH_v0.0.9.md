# BÁO CÁO BÀN GIAO — SỬA KIẾN TRÚC THEO REVIEW R09–R14 — NOVA FISHING LIVE 3D v0.0.9
Gửi: ChatGPT (NOVA Architect & Reviewer) — Người lập: Claude (Lead Developer) — Ngày: 2026-11-24 — Quy chuẩn: NOVA 1.0.3 — Model: Opus 5.5
Trạng thái: **CHỜ CHATGPT QUYẾT ĐỊNH CUỐI về v0.0.9.** Claude không tự đánh dấu APPROVED. Báo cáo không chứa bí mật.

## 1. Xác nhận
- ☑ **Chưa viết code game** — repo không có `src/` hay `package.json` (đã kiểm bằng lệnh, 2026-11-24).
- ☑ **Chưa cài thư viện nào.** Thư viện tạo chứng chỉ cho HTTPS (ADR-0023) chỉ là **đề xuất**, chờ người dùng duyệt (A16).
- ☑ **Phase 1 chưa bắt đầu** (chưa `git init`).
- ☑ Giữ nguyên: Continuous Live World; không giới hạn cứng số cần thủ; mục tiêu V1 macOS + Windows; Three.js, Node.js, `node:sqlite` (không đổi DB); quy tắc gameplay đã chốt (gồm quy tắc BXH điểm → kg → người đạt trước).
- ☑ Không xoá ADR, không viết lại lịch sử ADR: phần bị thay ở 0.0.9 được giữ dạng gạch ngang hoặc ghi "Lịch sử: bản 0.0.8 … — đã thay".
- ☑ Sao lưu toàn bộ `docs/` bản 0.0.8 trước khi sửa (thư mục tạm của phiên làm việc).

## 2. R09–R14: nội dung và vị trí đã sửa
| Yêu cầu | Đã sửa thế nào | Vị trí |
|---|---|---|
| **R09** GiftJournal: thứ tự commit & RAM | Quy trình mới: (1) `RECEIVED` bền + chờ ack → (2) tính hiệu ứng tất định thành **delta có khoá idempotency**, không đọc/ghi RAM WorldCore; hiệu ứng phụ thuộc trạng thái (vị trí hàng chờ Boss) tính trong transaction của Worker → (3) commit hiệu ứng + `APPLIED` **một transaction** → (4) **chỉ sau ack** mới `publishCommittedGift` vào WorldCore rồi FX → (5) crash giữa commit và công bố: khởi động dựng RAM từ DB, không replay `APPLIED`. Hiệu ứng chờ commit nằm trong `PendingGiftEffects`, gameplay không đọc. **9 ranh giới crash GB0–GB8**, mỗi ranh giới là một ca test (CR8) với bất biến I1–I3 + I9 (RAM = DB sau khởi động). Quy trình 0.0.8 giữ lại dạng ghi chú lịch sử | ADR-0018 (Quy trình 0.0.9; Ranh giới crash; Phục hồi; Kiểm thử) · ADR-0022 (CR8, I9) · ARCH §8 Phase 2, §10, §11.1, Phụ lục B · BRIEF · STATUS B16, B23 |
| **R10** BXH 60 phút: tiêu chí hoà | `reached_at` = thời điểm tổng hiện tại được hình thành = lần **thay đổi tổng** gần nhất. Bốn trường hợp: (a) sự kiện mới → `at_utc` (ms, kể cả dòng điều chỉnh âm); (b) bucket hết hạn làm tổng đổi → ranh giới logic `expiry(b) = (b+60)·60000` (không dùng thời điểm máy xử lý); (c) nhiều sự kiện cùng bucket → giữ `at_utc` từng sự kiện; (d) hoà cả score, weight_g, reached_at → `player_key` tăng dần (tiêu chí kỹ thuật cuối, không phải luật chơi). Công thức đóng tính được từ ledger; dựng lại cần thêm 60 phút trước cửa sổ; **đối chiếu toàn bộ thứ tự** với tính trực tiếp từ ScoreLedger (bộ dữ liệu bắt buộc liệt kê). Kỳ cố định cũng theo định nghĩa "lần thay đổi tổng gần nhất". Mô tả `lastAt` của 0.0.8 gạch ngang | ADR-0010 (mục 4, cấu trúc RAM, **mục R10**, Trượt, Dựng lại, Kiểm thử) · ARCH §8 Phase 3, §11.1 · BRIEF · STATUS B20 |
| **R11** Backpressure khi mọi nơi lưu trữ thất bại | Thang S1 DB → S2 file khẩn cấp (fsync nhóm ≤ 50 ms) → S3 RAM có trần (`emergency.ramGiftsMax`) → **S4 ngừng tiếp nhận ở 90% trần** (ngắt TikTok, không tự nối lại; ngừng Mock; từ chối kết nối WS mới trừ phiên admin đang mở). Hành vi cho từng tình huống: DB không ghi được, Worker không khởi động lại được, file khẩn cấp không ghi được, RAM chạm ngưỡng; cảnh báo critical `GIFT_AT_RISK`/`INGEST_HALTED` nêu rõ số quà đang có nguy cơ mất; thông báo trung tính trên stage; khôi phục xả S3 → S2 → journal idempotent. Nguyên tắc ghi rõ: không chủ động bỏ quà **khi còn khả năng tiếp nhận và lưu trữ**; **không** tuyên bố giữ quà vô hạn | ADR-0019 (bảng giới hạn, SAFE MODE, **mục R11**, Không tuyên bố) · ADR-0005, ADR-0006 · ADR-0022 (CR10) · ARCH §0.1, §8 Phase 2, §10, §11.1, Phụ lục B · BRIEF · STATUS B21 |
| **R12** Bảo mật điều khiển qua LAN | **HTTPS + WSS là mục tiêu V1** cho chế độ LAN: chứng chỉ tự ký riêng từng máy cài, khoá riêng không rời máy, dấu vân tay SHA-256 hiển thị + kèm QR để đối chiếu; localhost giữ HTTP (loopback). Cần một thư viện JS thuần để sinh chứng chỉ → **chờ người dùng duyệt (A16)**. Nếu chưa triển khai được: **giới hạn bảo mật quan trọng** — biểu ngữ thường trực, chỉ khuyến nghị mạng tin cậy, ghi trong INSTALL_*/Matrix/Handover. Ghép đôi: hết hạn 2 phút, dùng một lần, thu hồi được, chỉ một mã hiệu lực. Sổ thiết bị `admin_devices`, thu hồi từng thiết bị / "Thu hồi tất cả" (ngắt ngay WS), đổi mật khẩu tự thu hồi tất cả. **Bỏ** mọi mô tả QR/mật khẩu như biện pháp chống nghe lén | ADR-0020 (mục 3, mục 11, Phương án đã loại, Kiểm thử) · **ADR-0023 (mới)** · ARCH §3, §4, §5, §7, §8 Phase 7, §10, §11 (R06), §11.1 · BRIEF · STATUS A16, B22, D7 |
| **R13** Idempotency của PersistenceWorker | Hai lớp trong **cùng transaction**: (1) `committed_batches` — `batch_id` không đổi khi gửi lại, Worker kiểm trước và trả `ALREADY_COMMITTED`; (2) `applied_ops` — `op_key` ổn định từ miền nghiệp vụ (`catch:<id>:score`, `gift:<gift_key>:<seq>`, …), phép cộng chỉ chạy khi chèn được `op_key`. Op chèn dòng dùng UNIQUE + `INSERT OR IGNORE`; op ghi đè trạng thái idempotent tự nhiên + `version`. Phân biệt trạng thái batch PENDING / SENT / COMMITTED / REJECTED / RETRYABLE / UNKNOWN; message mới `status` → `batchStatus`. Test W1 (commit thành công rồi Worker chết **trước ack** → gửi lại → hash DB không đổi) đến W5. Dọn bản ghi sau 7 ngày | ADR-0017 (giao thức, phục hồi, **mục R13**, Phương án đã loại) · ADR-0022 (CR9, I10) · ARCH §4 (2 bảng mới), §8 Phase 1, §10, §11.1 · STATUS 7b, B24 |
| **R14** Định nghĩa RPO thực tế | Bỏ dùng riêng `persist.unackedAgeMs`. Bộ chỉ số mới: `oldestUnpersistedEventAgeMs` (tuổi sự kiện cũ nhất chưa ghi bền, gồm RAM + WriteBuffer + batch đang bay), `oldestUnackedBatchAgeMs`, `unpersistedByType{giftReceived, giftEffect, catch, progress, state, log}`, `ramDirtyNotEnqueued{count, oldestAgeMs}`, `writeBufferOps`, `inFlightBatches`. Ghi rõ: **chỉ là cảnh báo, không phải cam kết độ bền**. RPO thực tế chỉ công bố khi đo bằng crash test (đối chiếu sự kiện đã sinh — ghi bởi test harness ngoài tiến trình bị kill — với DB sau khởi động), báo phân phối số/thời gian mất theo loại và độ lệch so với chỉ số lúc kill, ghi TEST_REPORT | ADR-0017 (**mục R14**) · ADR-0019 (ngưỡng L3/L4) · ADR-0022 (Giới hạn write-behind, **mục R14**, bảng C2) · ARCH §1.4, §5, §8 Phase 3, §11 (R08), §11.1 · BRIEF · STATUS D6 |

## 3. Danh sách file đã thay đổi
| File | Thay đổi |
|---|---|
| `docs/ADR/0023-https-control-lan.md` | **Mới** (R12) |
| `docs/ADR/0017-persistence-worker.md` | Sửa (R13, R14) |
| `docs/ADR/0018-gift-idempotency-journal.md` | Sửa (R09) |
| `docs/ADR/0010-leaderboard-5-pham-vi.md` | Sửa (R10) |
| `docs/ADR/0019-qua-tai-backpressure-loi-luu-tru.md` | Sửa (R11, R14) |
| `docs/ADR/0020-bao-mat-rest-ws-lan.md` | Sửa (R12) |
| `docs/ADR/0022-do-ben-du-lieu-rpo-rto.md` | Sửa (R14; CR8–CR10; I9–I10) |
| `docs/ADR/0005-…`, `docs/ADR/0006-…` | Sửa câu "không bỏ quà" thêm điều kiện R11 |
| `docs/ARCHITECTURE.md` | → **0.0.9**: trạng thái, lịch sử, §0.1, §1.4, §3, §4 (`committed_batches`, `applied_ops`, `admin_devices`), §5, §7, §8 Phase 1/2/3/7, §9, §10 (+4 rủi ro, sửa 2), §11 (R06, R08), **§11.1 mới**, Phụ lục B |
| `docs/PROJECT_STATUS.md` | → 0.0.9: trạng thái duyệt, Phase 1/2/3/7, chuẩn bị Phase 1 (7b, 8), A16, B16 sửa, B17 thay bởi B22, B20–B24, D6 sửa, D7–D8, checklist, nhật ký |
| `docs/PROJECT_BRIEF.md` | → 0.0.9: HTTPS/giới hạn bảo mật cho Control qua LAN; quà (công bố sau ghi bền, điều kiện R11); RPO chỉ từ crash test; BXH đúng toàn bộ thứ tự gồm `reached_at` |
| `docs/LESSONS.md` | Thêm L-006 (soát từng ranh giới crash, từng giới hạn tài nguyên, phạm vi của từng biện pháp bảo mật) |
| `docs/HANDOVER_ARCH_v0.0.9.md` | **Mới** — báo cáo này |

## 4. Rủi ro còn tồn tại
| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Quà nhận nhưng chưa kịp ghi bền (GB0/GB1) mất khi tiến trình chết/mất điện | Trung | Bản chất nguồn không phát lại; đo tỉ lệ ở Phase 2 |
| Quà chỉ còn trong RAM (S3) mất nếu tiến trình chết; quà gửi sau INGEST_HALT không đến được game | Trung | R11 — có cảnh báo và thông báo; không loại bỏ được |
| Nghe lén Control qua LAN nếu A16 không được duyệt hoặc trình duyệt điện thoại không dùng được WSS tự ký (D7) | Cao (khi không có HTTPS) | Giới hạn bảo mật quan trọng, hiển thị thường trực |
| Người dùng chấp nhận cảnh báo chứng chỉ mà không đối chiếu dấu vân tay | Trung | Hướng dẫn; không loại bỏ được bằng kỹ thuật |
| Thư viện TikTok không chính thức; `msgId`/streak/`room_id` chưa kiểm chứng | Cao | Phase 2, trên LIVE thật |
| Trễ quà tăng do hai lần chờ ack (R09) | Thấp–Trung | Ước tính ≈ 100–200 ms, chưa đo; tiêu chí p95 < 1 s |
| `node:sqlite` stability; fsync file khẩn cấp; ổ đĩa không tôn trọng fsync | Trung | Phase 1–2; một phần ngoài kiểm soát phần mềm |
| Windows chưa nghiệm thu | Cao | Đã chấp nhận; Windows Validation |

## 5. Những điểm chưa thể chứng minh (chỉ là mục tiêu thiết kế)
1. RPO/RTO thực tế (CR1–CR10); RPO chỉ công bố sau khi đo (R14).
2. Mất điện thật (CR7 không tự động hoá được).
3. Không áp dụng hai lần ở mọi ranh giới GB0–GB8 và W1–W5 — mới là thiết kế + danh sách test.
4. Trễ quà p95 sau khi thêm bước chờ ack thứ hai.
5. Chi phí `applied_ops` ở 200 quà/s + 10.000 người; tick p95 khi Worker ghi tải lớn.
6. HTTPS/WSS tự ký trên Safari iOS / Chrome Android thật (D7).
7. fsync file khẩn cấp và `fs.statfs` trên Windows; hiệu năng `node:sqlite` trên Windows.
8. Hành vi `msgId`/streak/`room_id` của `tiktok-live-connector` trên LIVE thật.
9. Thứ tự BXH khớp brute-force ở mọi ca hoà (R10) — mới là công thức + bộ test.

## 6. Kết quả kiểm tra chéo tính nhất quán (quét tự động trên file thật, 2026-11-24)
22 hạng mục: đủ ADR 0001–0023; mọi ADR có trong ARCH §9; mọi ADR được tham chiếu đều tồn tại; phiên bản 0.0.9 ở ARCH/STATUS/BRIEF; `unackedAgeMs` chỉ còn ở ngữ cảnh lịch sử; chỉ số R14 có ở ADR-0017/0019/0022 + ARCH; `lastAt` chỉ còn ở ngữ cảnh đã thay; ADR-0010 có công thức, đối chiếu ledger, tiêu chí `player_key`; ADR-0018 có công bố-sau-ack, GB0–GB8, `PendingGiftEffects`; không còn mô tả cập nhật RAM trước commit; "không chủ động bỏ quà" luôn kèm điều kiện; ADR-0019 có S1–S4/INGEST_HALT/GIFT_AT_RISK/không giữ vô hạn; không còn mô tả QR chống nghe lén; ADR-0020 có ghép đôi có hạn/một lần/thu hồi/thu hồi tất cả; không còn quyết định "không TLS ở V1"; `committed_batches` + `applied_ops` ở ADR-0017 và ARCH §4; test W1; ARCH §11.1 đủ R09–R14; STATUS nhắc ADR-0023 + R09–R14; không giới hạn cứng người chơi; không tự đánh dấu APPROVED; không khẳng định quá mức về quà.
- Lần quét đầu: **20/22**. Hai hạng mục báo lỗi:
  - (a) Một câu ở ADR-0019 có điều kiện nhưng diễn đạt khác R11 ("khi còn nơi lưu trữ") → đã sửa thống nhất thành "khi hệ thống còn khả năng tiếp nhận và lưu trữ".
  - (b) Bộ quét bắt nhầm các dòng **phủ định** về QR ("KHÔNG phải biện pháp chống nghe lén", "bỏ mô tả QR…") → đã kiểm tay từng dòng (10 dòng, đều là phủ định); làm rõ thêm câu R06 ở ARCH §11.
- Quét lại sau khi sửa: **đạt cả hai**. Tổng: 22/22.

## 7. Đề nghị ChatGPT
1. Quyết định cuối về v0.0.9 (ARCH §11.1 là mục lục nhanh R09–R14).
2. Xác nhận hoặc sửa các diễn giải B20–B24 (PROJECT_STATUS), đặc biệt B21 (thông báo trung tính cho khán giả khi S3/S4) và B22 (HTTPS là mục tiêu V1).
3. A16 cần **người dùng** quyết định (thêm thư viện tạo chứng chỉ) — không chặn Phase 1, cần trước Phase 7.
4. Nếu được duyệt: người dùng chuyển model sang Sonnet 5.5 cho Phase 1; phần fault injection/idempotency Worker nếu vượt phạm vi sẽ đề xuất chuyển Opus.
