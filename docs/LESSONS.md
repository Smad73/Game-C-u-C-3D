# SỔ BÀI HỌC — NOVA FISHING LIVE 3D
Mỗi mục: ngày · sự cố · nguyên nhân · cách sửa · cách phòng tránh.

## L-001 — 2026-11-24 — Tự khoá hook bảo vệ khi nâng cấp NOVA 1.0.1 → 1.0.3
- **Sự cố:** Sau khi đổi tên `~/NOVA_AI_DEVELOPMENT` thành bản sao lưu, mọi lệnh Bash/Write/Edit của Claude bị chặn: hook của dự án gọi `~/NOVA_AI_DEVELOPMENT/SCRIPTS/nova-guard.py` không còn tồn tại → python3 thoát mã 2 → Claude Code chặn. Claude không thể tự chạy `install.sh`; người dùng phải chạy tay trong Terminal.
- **Nguyên nhân:** Đổi tên thư mục và cài bản mới được thực hiện ở hai lệnh riêng; giữa hai lệnh, đường dẫn hook bị đứt.
- **Cách sửa:** Người dùng chạy `install.sh` của 1.0.3 → đường dẫn guard có lại → hook hoạt động.
- **Phòng tránh:** Khi thay thứ mà hook đang trỏ tới (thư mục NOVA, file guard, settings): (1) chuẩn bị bản mới ở chỗ khác trước; (2) đổi tên + cài trong **cùng một lệnh** (hoặc cài bản mới trước rồi mới đổi đường dẫn); (3) kiểm tra file guard tồn tại trước khi kết thúc lệnh; (4) luôn có lệnh hoàn tác soạn sẵn cho người dùng.

## L-002 — 2026-11-24 — Bộ cài NOVA 1.0.3 không đặt quyền thực thi cho `SECURITY_TESTS/interactive/*.sh`
- **Sự cố:** `nova-selftest.sh` sau khi cài: PASS=38 FAIL=1 (quyền sai: `nova-interactive-kit.sh`, `nova-interactive-verify.sh` là 644).
- **Nguyên nhân:** `install.sh` và `fix-permissions.sh` của 1.0.3 chỉ `chmod 755` cho `SCRIPTS/*`, `SECURITY_TESTS/run.sh`, `SECURITY_TESTS/runtime/*.sh` — bỏ sót thư mục `interactive/`.
- **Cách sửa:** `chmod 755` đúng hai file → selftest PASS=39 FAIL=0.
- **Phòng tránh:** Báo ChatGPT (người duy trì NOVA) sửa `install.sh` + `fix-permissions.sh` thêm `SECURITY_TESTS/interactive/*.sh`. Sau mỗi lần cài NOVA, chạy `nova-selftest.sh` trước khi dùng.

## L-003 — 2026-11-24 — Guard 1.0.3 chặn thử nghiệm guard bằng pipe vào bash
- **Sự cố:** Lệnh `printf '<json>' | bash nova-guard.sh` để thử guard bị chặn ("không cho pipe nội dung vào shell").
- **Cách làm đúng:** Không lách; dùng `nova-selftest.sh` (đã có ca kiểm guard + launcher fail-closed) làm bằng chứng.

## L-004 — 2026-11-24 — Guard 1.0.3 chặn nhầm lệnh Bash vì từ khoá nằm trong NỘI DUNG văn bản
- **Sự cố:** (a) Mẫu grep quét bí mật có chuỗi tên file môi trường → bị chặn "chạm tới file môi trường". (b) Script Python sửa ADR chứa từ "shutdown" trong văn bản tiếng Việt → bị chặn "lệnh quyền hệ thống".
- **Nguyên nhân:** Guard phân tích chuỗi lệnh Bash (kể cả heredoc), không phân biệt dữ liệu văn bản với lệnh thật.
- **Cách sửa:** (a) Bỏ chuỗi đó khỏi mẫu quét (không cần nhắc tới file môi trường). (b) Sửa tài liệu bằng công cụ Edit/Write (công cụ chuyên dụng sửa file, vẫn đi qua hook) thay vì script Bash.
- **Phòng tránh:** Sửa tài liệu Markdown dài bằng Edit/Write; chỉ dùng Bash cho lệnh thật. Không bao giờ diễn đạt lại lệnh để né guard. Báo ChatGPT các ca chặn nhầm để cân nhắc tinh chỉnh guard (không tự sửa guard).

## L-005 — 2026-11-24 — Tài liệu kiến trúc từng khẳng định quá mức về độ bền ("quà không bao giờ mất", "mất tối đa 500 ms")
- **Sự cố:** ChatGPT review v0.0.7 (R02, R05, R08) chỉ ra các khẳng định không có cơ chế và kiểm thử chứng minh.
- **Nguyên nhân:** Mô tả mục tiêu thiết kế như thể là bảo đảm; nhầm chu kỳ gom batch với RPO.
- **Cách sửa (0.0.8):** Viết rõ phạm vi bảo đảm (ADR-0018 G1–G3), RPO/RTO là mục tiêu kèm kịch bản đo (ADR-0022), danh sách "chưa chứng minh" (ARCHITECTURE §11).
- **Phòng tránh:** Mọi câu về độ bền/an toàn phải ghi kèm cơ chế + kiểm thử chứng minh; chưa đo thì ghi "mục tiêu, chưa chứng minh".

## L-006 — 2026-11-24 — Lỗi thiết kế tinh vi chỉ lộ ra khi soát từng ranh giới (review v0.0.8, R09–R14)
- **Sự cố:** Bản 0.0.8 có: (a) cập nhật RAM trước khi commit hiệu ứng quà; (b) coi "sự kiện mới nhất" là "thời điểm đạt tổng" dù cửa sổ trượt làm tổng thay đổi khi không có sự kiện; (c) chỉ dựa `UNIQUE` bảng đích, không chặn được phép **cộng** lặp khi batch đã commit nhưng mất ack; (d) mô tả QR như biện pháp chống nghe lén; (e) "không bỏ quà" mà mọi bộ đệm đều có trần; (f) một chỉ số đo batch được dùng như RPO.
- **Nguyên nhân:** Mô tả luồng ở mức "các bước" thay vì soát **mỗi ranh giới giữa hai bước** (crash ở đây thì sao?) và **mỗi giới hạn tài nguyên** (đầy thì sao?).
- **Cách sửa (0.0.9):** Bảng ranh giới crash GB0–GB8; định nghĩa `reached_at` bằng công thức đóng + đối chiếu brute-force; idempotency hai lớp; thang lưu trữ S1–S4 có điểm ngừng tiếp nhận; tách "biện pháp xác thực" khỏi "biện pháp mã hoá"; tách "chỉ số cảnh báo" khỏi "RPO đo được".
- **Phòng tránh:** Với mọi luồng ghi dữ liệu quan trọng: liệt kê từng ranh giới và ghi kết quả mong đợi khi crash tại đó; với mọi bộ đệm: ghi rõ hành vi khi đầy; với mọi biện pháp bảo mật: ghi rõ nó chống mối đe doạ nào và **không** chống mối nào; mọi định nghĩa thời điểm/thứ tự phải có công thức kiểm được từ dữ liệu gốc.

## L-007 — 2026-11-25 — Test tự động không thay được trình duyệt thật (Phase 1)
- **Sự cố:** Mở /stage trên trình duyệt thật lộ 2 lỗi mà 113 test không thấy: (a) CSP chứa `ws://[::1]:PORT` (IPv6 không hợp lệ trong CSP → trình duyệt bỏ qua + báo lỗi); (b) tab ẩn làm requestAnimationFrame ~1 Hz nên trang kết luận "FPS THẤP" sai.
- **Nguyên nhân:** Test chỉ kiểm chuỗi header, không có bộ phân tích CSP; không mô phỏng tab ẩn.
- **Cách sửa:** Lọc nguồn IPv6 khỏi CSP (+ test); trang nhận biết `document.hidden`.
- **Phòng tránh:** Mỗi thay đổi giao diện/CSP phải được mở trong trình duyệt thật và đọc console trước khi coi là xong.

## L-008 — 2026-11-25 — Công cụ kiểm tra phải được kiểm tra
- **Sự cố:** check-portability báo "sạch" lần đầu sẽ chẳng chứng minh gì nếu chưa biết nó bắt được lỗi. Thực tế nó bắt 1 vi phạm thật của chính mã mình (process.platform ngoài platform.js).
- **Phòng tránh:** Mọi công cụ kiểm tra có test dùng dự án giả chứa từng loại lỗi; ghi rõ luật nào không kiểm chứng được trên máy hiện tại (P04 trên ổ không phân biệt hoa/thường).

## L-009 — 2026-11-25 — Test sai kỳ vọng so với thiết kế (4 lần trong Phase 1)
- Ví dụ: kỳ vọng tổng điểm cộng nhầm; rate-limit đăng nhập quên rằng đăng nhập đúng đặt lại bộ đếm; chặn event loop ngay sau khi tạo bộ đo (Node bỏ qua lần đo đầu).
- **Phòng tránh:** Khi test đỏ, đọc thiết kế trước; sửa test chỉ khi chứng minh được kỳ vọng sai, và ghi lý do.

## L-010 — 2026-11-25 — Công cụ ghi tệp biến chuỗi escape `\uXXXX` thành ký tự thật (Phase 2)
- **Sự cố:** Regex làm sạch ký tự điều khiển/bidi trong `Normalizer.js` và một dòng test Unicode được ghi ra tệp với ký tự vô hình THẬT (U+200B, U+202E…) thay vì chuỗi escape — code vẫn chạy nhưng không đọc/review được, dễ bị sửa hỏng mà không thấy.
- **Nguyên nhân:** Nội dung truyền qua công cụ ghi tệp bị giải mã `\uXXXX` trước khi ghi.
- **Cách sửa:** Ghi lại các dòng đó bằng mã sinh chuỗi (`chr(92) + 'u…'`); quét toàn bộ `src/` + `tests/` tìm ký tự vô hình/điều khiển (còn 0).
- **Phòng tránh:** Sau khi ghi mã có regex/chuỗi Unicode: quét ký tự vô hình (U+200B–U+206F, U+FEFF, C0/C1). Không dán ký tự vô hình vào mã nguồn.

## L-011 — 2026-11-25 — Kỳ vọng test sai về Unicode NFC
- **Sự cố:** Test `cleanText('Cá' + dấu huyền tổ hợp)` kỳ vọng ra 'Cà' và đỏ. Mã đúng: 'á' + dấu huyền không có dạng NFC gộp được.
- **Cách sửa:** Đầu vào đúng là 'a' + U+0300. Sửa test, không sửa mã (theo L-009: đọc thiết kế/chuẩn trước khi sửa).

## L-012 — 2026-11-25 — `else` lơ lửng trong vòng for một dòng (GiftJournal)
- **Sự cố:** `if (res.results) for (...) if (...) x; else for (...)` — `else` gắn vào `if` BÊN TRONG vòng lặp, nên nhánh "batch đã commit nhưng mất ACK → đọc DB" sẽ chạy sai chỗ. Phát hiện khi tự rà mã, trước khi chạy.
- **Cách sửa:** Luôn dùng khối `{ }` cho if/else có vòng lặp lồng. Ca W1 (mất ACK batch RECEIVED) có test riêng trong `tests/gift-journal.test.js`.

## L-013 — 2026-11-25 — Kiểm tra giấy phép dependency TRƯỚC khi ghim vào kiến trúc
- **Sự cố:** `tiktok-live-connector@2.5.0` (được ADR-0003 ghim) có giấy phép **AGPL-3.0-only** (kèm `tiktok-live-proto` AGPL) và bản 2.x đi qua dịch vụ ký bên thứ ba Euler Stream — kiến trúc chưa ghi nhận, trong khi sản phẩm dự định bán.
- **Cách xử lý:** Chưa cài; adapter thiết kế độc lập thư viện (nạp trễ) nên mọi phần khác của Phase 2 vẫn làm được; ghi P0 chờ người dùng quyết định.
- **Phòng tránh:** Mỗi dependency mới: `npm view <pkg>@<ver> license dependencies` + kiểm dịch vụ ngoài mà nó gọi, ghi vào ADR trước khi ghim.

## L-014 — 2026-11-25 — `.gitignore` `data/` nuốt luôn `src/data/` → lớp lưu trữ Phase 1 CHƯA BAO GIỜ được commit
- **Sự cố:** Mẫu `data/` (không neo gốc) khớp mọi thư mục tên `data`, kể cả `src/data/`. Commit "module 9-12" chỉ có giao thức + test; `PersistenceWorker.js`, `PersistenceClient.js`, `migrate.js`, `001_init.sql` không có trong git → clone mới không chạy được. Phát hiện ở Phase 2 khi `git status` không hiện tệp vừa sửa.
- **Cách sửa:** Đổi thành `/data/` (chỉ thư mục dữ liệu ở gốc). Tệp `src/data/` giờ hiện là chưa theo dõi — cần commit (chờ người dùng yêu cầu).
- **Phòng tránh:** Sau mỗi commit module: `git ls-files <thư-mục-module>` phải liệt kê đủ tệp; mẫu ignore thư mục luôn neo gốc (`/data/`).

## L-015 — 2026-11-25 — Streak không có groupId: hai mục tiêu xung đột (tách hai lần gửi vs. chống gửi lại)
- **Phát hiện (P2 review, tests/streak-review.test.js 9/9):** để tách hai lần gửi không groupId (E2) khoá H phải chứa msgId/createTime; nhưng nếu TikTok gửi lại sự kiện repeatEnd với msgId/createTime khác thì sẽ bị tính hai lần. Không có dữ liệu nào phân biệt được hai trường hợp này.
- **Xử lý:** giữ thiết kế hiện tại (ưu tiên không bỏ quà thật), ghi rõ rủi ro; cờ WEAK_GIFT_KEY + đếm tỉ lệ. Quyết định cuối phụ thuộc dữ liệu LIVE thật (Module 10).
- **Phòng tránh:** mọi suy luận về hành vi connector phải ghi "chưa kiểm chứng" cho tới khi có log LIVE thật.

## L-016 — 2026-11-25 — Sự kiện do quà xếp hàng không giới hạn
- **Sự cố:** benchmark 1.000 người / 20 quà/s → 289 sự kiện thế giới xếp hàng trong 30 giây (mỗi sự kiện 90–180 s ⇒ tồn đọng hàng giờ).
- **Nguyên nhân:** mỗi quà có hành động "sự kiện" tạo một dòng QUEUED riêng, không gộp.
- **Sửa:** EventDirector gộp sự kiện cùng loại (gia hạn có trần 3×), Boss quà gộp thành một Boss cấp cao hơn; dòng bị gộp ghi DONE `MERGED:<id>`. Test: game.test.js "sự kiện từ quà: cùng loại thì GỘP".
- **Phòng tránh:** mọi hàng đợi sinh từ hành vi người xem phải có chính sách gộp/trần và được đo bằng benchmark tải.

## L-017 — 2026-11-25 — API Demo báo "ok" khi nguồn giả lập chưa kết nối
- **Sự cố:** test HTTP Demo chỉ hỏng khi chạy sau test khác (máy "ấm" → request đến trước khi Mock kết nối); sự kiện bị bỏ âm thầm (`droppedNotConnected`) nhưng API trả ok.
- **Sửa:** route Demo trả 409 `NOT_CONNECTED` khi connector chưa CONNECTED; test chờ kết nối.
- **Phòng tránh:** API thao tác phải phản ánh kết quả thật của tầng dưới, không trả ok mặc định.

## L-018 — 2026-11-25 — Guard chặn lệnh sửa tệp có chuỗi trùng tên lệnh hệ thống
- **Sự cố:** NOVA Guard chặn một lệnh Bash chỉ vì nội dung sửa regex trong Logger.js có từ trùng tên lệnh hệ thống.
- **Xử lý:** không lách guard; đổi cách làm (thêm regex riêng, không chạm dòng đó).
- **Phòng tránh:** khi sửa mã có từ khoá nhạy cảm với guard, ưu tiên thay đổi không cần nhắc lại từ đó.

## L-019 — 2026-11-25 — Backtick trong chuỗi template JS làm hỏng cú pháp → 9 test lỗi
- **Sự cố:** sửa thông báo lỗi trong `LiveConnector.js` thành "(chạy `npm ci` …)" bên trong một template literal; dấu backtick đóng chuỗi sớm → SyntaxError, server không khởi động, 9 tệp/test lỗi.
- **Xử lý:** đổi thành dấu nháy kép; `node --check` + `npm test` 184/184.
- **Phòng tránh:** sau mọi sửa chuỗi bằng script, chạy `node --check <tệp>` trước; không dùng backtick markdown trong chuỗi template JS.

## L-020 — 2026-11-25 — Texture nhúng trong VRM không hiện: CSP chặn blob: URL của GLTFLoader
- **Sự cố:** nhân vật VRoid nạp được nhưng toàn trắng; `material.map` rỗng với mọi mesh. Không có lỗi nào hiện ra.
- **Nguyên nhân:** GLTFLoader tạo ảnh nhúng dưới dạng `blob:`; CSP stage (`default-src 'self'`, `img-src 'self' data:`) chặn `blob:`.
- **Xử lý:** `tools/prepare-vrm.js` (`npm run prepare:vrm`) tách ảnh ra tệp cạnh model; không nới CSP.
- **Phòng tránh:** khi model thiếu texture trên stage, kiểm `read_console_messages` và `fetch` ảnh trước; đừng nới CSP để chữa triệu chứng.

## L-021 — 2026-11-25 — Spring bone collider của VRM làm vỡ cập nhật ma trận khi render
- **Sự cố:** `VRMSpringBoneCollider.updateWorldMatrix` lỗi `reading 'offset'` mỗi khung hình.
- **Xử lý:** bỏ các collider khỏi mẫu trước khi clone (`characters.js`). Đánh đổi: tóc/váy không dao động vật lý.
- **Phòng tránh:** kiểm lỗi console sau mỗi lần nạp model mới; ghi nhận đánh đổi trong tài liệu.

## L-022 — 2026-11-25 — `lsof -ti tcp:PORT` trả cả kết nối client → dừng nhầm tiến trình
- **Sự cố:** để dừng server Demo, đã `kill` PID đầu tiên của `lsof -ti tcp:8787`; đó không phải server (server cũ vẫn chạy, giữ cổng).
  PID bị dừng có thể là một tiến trình client đang kết nối cổng đó.
- **Xử lý:** dùng `lsof -nP -iTCP:8787 -sTCP:LISTEN` + `ps` xác nhận đúng `node server.js` do phiên mình khởi động rồi mới dừng.
- **Phòng tránh:** luôn lọc `-sTCP:LISTEN` và kiểm `ps` (lệnh, giờ khởi động) trước khi dừng tiến trình.

## L-023 — 2026-11-25 — Chạy bản mới khi bản cũ còn mở: cổng bận, báo lỗi khó hiểu, và đã mở DB trước khi biết cổng bận
- **Sự cố:** người dùng giải nén 0.4.1 rồi chạy trong khi 0.4.0 vẫn mở → "Cổng 8787 đang được chương trình khác dùng", mã 2 ("lỗi cấu hình"); log cho thấy bản mới đã mở lớp ghi dữ liệu rồi mới phát hiện cổng bận.
- **Xử lý:** launcher kiểm tra cổng TRƯỚC khi mở dữ liệu (`src/system/instanceProbe.js`); nếu là bản NOVA → báo phiên bản, hỏi c/k; c = tắt an toàn bản cũ qua API cùng máy (ADR-0027) rồi chạy bản này. Bản cũ hơn 0.4.1 → hướng dẫn đóng tay.
- **Phòng tránh:** mọi thứ có thể xung đột tài nguyên (cổng, tệp khoá) kiểm TRƯỚC khi mở DB; thông báo lỗi phải nói người dùng làm gì.

## L-024 — 2026-11-25 — Đóng cửa sổ Terminal → server chạy ngầm 100% CPU, giữ cổng, không tắt được
- **Sự cố:** khi terminal mất (đóng cửa sổ), ghi ra màn hình lỗi EIO/EPIPE → uncaughtException → `console.error` lại lỗi → vòng lặp vô hạn; lệnh tắt an toàn (SIGHUP/SIGTERM) không bao giờ chạy xong. Có từ trước, lộ ra khi thử launcher bằng terminal giả.
- **Xử lý:** `server.js` nuốt lỗi EIO/EPIPE/ENXIO/EBADF trên stdin/stdout/stderr và trong trình bắt lỗi chung, coi là "cửa sổ đã đóng" → tắt an toàn một lần. Kiểm lại: đóng terminal giả → tiến trình tự thoát sau vài giây, log "tắt an toàn (SIGHUP)".
- **Phòng tránh:** trình bắt lỗi chung không được tự gây lỗi cùng loại; thử kịch bản mất terminal cho mọi launcher.

## L-025 — 2026-11-25 — Test tiến trình thật treo bộ test 2 giờ khi assert lỗi
- **Sự cố:** test "cổng bận" assert lỗi (thông báo đổi) TRƯỚC khi dừng tiến trình con → con sống mãi → `npm test` không bao giờ xong; lệnh nối sau `npm test` vẫn chạy (đóng gói zip sớm).
- **Xử lý:** dừng tiến trình con trong `finally`; chạy `npm test` có giới hạn thời gian; chỉ đóng gói khi test ĐẠT (dùng `&&`, không nối bằng `;`).
