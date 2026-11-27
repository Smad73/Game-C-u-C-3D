# ADR-0010: BXH 5 phạm vi (LIVE · 60 phút gần nhất · ngày VN · tuần VN · tổng) trên sổ cái điểm bất biến
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4, theo quyết định BXH + múi giờ của ChatGPT; **0.0.8 theo R03**: thiết kế chi tiết cửa sổ 60 phút, tách snapshot lịch sử, số nguyên; **0.0.9 theo R10**: định nghĩa chính xác reached_at) — Trạng thái: Quy tắc nghiệp vụ **đã chốt**; cách triển khai chờ ChatGPT duyệt
- Bối cảnh: Thế giới liên tục, điểm cá nhân không reset; cần BXH ngắn hạn và dài hạn cho số người không giới hạn.
- Quy tắc đã chốt: TOP LIVE reset khi bắt đầu buổi LIVE mới · TOP HOUR = 60 phút gần nhất · TOP DAY = ngày Việt Nam (00:00–23:59:59) · TOP WEEK = tuần Việt Nam (thứ Hai–Chủ nhật) · TOP ALL-TIME tích luỹ · **điểm là tiêu chí chính, tổng trọng lượng cá là tiêu chí phụ** · TOP 10/50/100 luân phiên trên màn LIVE · Control xem đầy đủ, phân trang · múi giờ Asia/Ho_Chi_Minh, **lưu UTC trong DB**.
- Quyết định triển khai:
  1. Mọi điểm cộng ghi vào `score_ledger` (chỉ thêm): `ledger_id`, `player_key`, `score` (INTEGER), `weight_g` (INTEGER, gam), `at_utc` (INTEGER ms), `minute_utc` (= floor(at_utc/60000), có chỉ mục), `live_session_id`, `source_key` (UNIQUE với `effect_seq`, ADR-0018) — nguồn gốc duy nhất; mọi BXH tính lại được. Điều chỉnh điểm (nếu Admin thu hồi) là dòng bù âm, không sửa dòng cũ.
  2. **Kỳ cố định** (live, day, week, all): bộ đếm `leaderboard_scores(scope, period_key, player_key, score, weight_g, reached_at_utc)` (khoá người chơi theo ADR-0021), cập nhật trong cùng transaction với ledger. `period_key` tính bằng cách quy đổi `at_utc` sang Asia/Ho_Chi_Minh: `day:YYYY-MM-DD`, `week:YYYY-Www` (ISO, bắt đầu thứ Hai), `live:<id>`, `all`. Hết ngày/tuần không xoá gì; kỳ mới có khoá mới; kỳ cũ chốt snapshot làm lịch sử.
  3. **TOP 60 phút (cửa sổ trượt) — thiết kế chi tiết ở mục "R03" bên dưới.**
  4. Thứ tự: `score DESC, weight_g DESC, reached_at ASC` — quy tắc nghiệp vụ giữ nguyên: điểm giảm dần, tổng kg giảm dần, **người đạt kết quả hiện tại trước xếp trên**. Định nghĩa chính xác `reached_at` và tiêu chí cuối cùng: mục "R10" bên dưới (0.0.9).
  5. Kỳ đang chạy giữ cấu trúc có thứ tự trong RAM (TOP N đọc trực tiếp, hạng O(log n)); kỳ đã đóng đọc từ DB qua chỉ mục tương ứng.
  6. API TOP 10/50/100 + phân trang theo hạng + tra hạng cá nhân cho cả 5 phạm vi.
  7. Kết thúc LIVE chỉ chốt TOP LIVE; không chạm ngày/tuần/tổng/60 phút.
## R03 — Cửa sổ trượt 60 phút (0.0.8)
**Định nghĩa chính xác:** tại thời điểm `t`, với `m(t) = floor(t/60000)`, cửa sổ gồm mọi dòng ledger có `minute_utc ∈ [m(t) − 59, m(t)]` — tức **60 bucket phút**, gồm cả phút hiện tại đang chạy. Độ dài thực tế của cửa sổ nằm trong **[59 phút, 60 phút)**; sai số tối đa < 1 phút ở mép cũ. Đây là độ chính xác được công bố (hiển thị "60 phút gần nhất").

**Cấu trúc RAM (HourWindow):**
- `buckets: Map<minute_utc, Map<player_key, {score, weight_g, lastEventAt}>>` — tối đa 60 bucket đang hiệu lực; `lastEventAt` = `at_utc` (ms) lớn nhất của người đó **trong bucket** (giữ thời điểm từng sự kiện, không làm tròn về phút).
- `totals: Map<player_key, {score, weight_g, reachedAt}>` — tổng trong cửa sổ và thời điểm hình thành tổng đó (định nghĩa R10).
- `ranked`: cấu trúc có thứ tự theo khoá `(−score, −weight_g, reachedAt, player_key)` (cây/skip-list cân bằng) → TOP N O(N), hạng O(log n), cập nhật O(log n).
- ~~`lastAt` = thời điểm sự kiện mới nhất = thời điểm đạt tổng hiện tại~~ — **sai ở 0.0.8** (ChatGPT R10): khi bucket cũ hết hạn, tổng thay đổi mà không có sự kiện mới. Thay bằng định nghĩa R10.

## R10 — Định nghĩa chính xác `reached_at` (0.0.9)
**Nguyên tắc:** `reached_at` = **thời điểm tổng hiện tại (score, weight_g) của người chơi trong phạm vi đó được hình thành**, tức thời điểm gần nhất mà tổng của họ **thay đổi**. Mọi thời điểm là thời điểm logic tính từ ledger (`at_utc` của sự kiện, ranh giới phút), **không** phải thời điểm máy xử lý — nên tính lại từ ledger luôn ra cùng kết quả.

**Các trường hợp:**
1. **Tổng được hình thành bởi sự kiện mới** (cộng điểm, kể cả dòng điều chỉnh âm): `reached_at = at_utc` của sự kiện đó.
2. **Bucket cũ hết hạn làm tổng thay đổi** (chỉ cửa sổ 60 phút): bucket phút `b` rời cửa sổ tại ranh giới `expiry(b) = (b + 60) × 60000` ms. Nếu người chơi có điểm trong bucket `b` và **vẫn còn** điểm trong cửa sổ sau khi trừ, tổng của họ thay đổi tại `expiry(b)` → `reached_at = expiry(b)`. Dùng ranh giới logic `expiry(b)` kể cả khi bộ hẹn giờ chạy trễ (bắt kịp). Người không có điểm trong bucket hết hạn: `reached_at` không đổi.
3. **Nhiều sự kiện trong cùng bucket:** mỗi sự kiện giữ `at_utc` riêng (độ phân giải ms); trường hợp 1 áp dụng với sự kiện **muộn nhất** làm thay đổi tổng. Gộp bucket không làm mất thời điểm.
4. **Công thức đóng:** với người chơi `p` tại thời điểm `t`:
   `reached_at(p, t) = max( max{ at_utc(e) : e ∈ ledger(p), minute(e) ∈ [m(t)−59, m(t)] },  max{ expiry(b) : b là bucket của p, b < m(t)−59, expiry(b) ≤ t } )`
   (vế thứ hai chỉ xét khi `p` còn điểm trong cửa sổ). Với kỳ cố định (LIVE, ngày, tuần, tổng) không có hết hạn → chỉ vế thứ nhất = thời điểm sự kiện cuối cùng làm thay đổi tổng trong kỳ.
5. **Hai người hoà cả score, weight_g và reached_at** (ví dụ cả hai bị bucket hết hạn tại cùng ranh giới phút): xếp theo `player_key` tăng dần. Đây là tiêu chí **kỹ thuật cuối cùng** để thứ tự luôn xác định và ổn định giữa các lần tính; **không phải luật chơi** và được ghi rõ trong tài liệu hiển thị cho người vận hành.
6. **Người tổng về 0** (mọi bucket hết hạn): rời bảng 60 phút.

**Cập nhật cấu trúc:** HourWindow giữ thêm `player → danh sách minute có điểm` để tính vế thứ hai khi trượt. Khi trượt bucket `b`: với mỗi `p` có điểm trong `b` → trừ → nếu còn điểm thì `reachedAt = max(reachedAt, expiry(b))` (thực chất = `expiry(b)` vì là thay đổi mới nhất) → định vị lại trong `ranked`.

**Kiểm thử đối chiếu (bắt buộc):** `verify-leaderboards.js` tính **trực tiếp từ ScoreLedger** theo công thức đóng ở mục 4 tại nhiều thời điểm `t` (gồm ngay trước/sau ranh giới phút, sau bộ hẹn giờ trễ) và so **toàn bộ thứ tự** (không chỉ tổng) với HourWindow. Bộ dữ liệu bắt buộc: hai người hoà score; hoà score + weight_g với reached_at khác nhau; hoà cả ba (phân định `player_key`); nhiều sự kiện cùng bucket; bucket hết hạn làm thay đổi thứ tự; dòng điều chỉnh âm; điểm đến muộn. Kỳ cố định (live/day/week/all) cũng đối chiếu với tính trực tiếp.

**Cập nhật:** mỗi điểm mới (sau khi commit thành công — BXH chỉ phản ánh dữ liệu đã bền): cộng vào bucket `minute_utc` của nó và `totals`, định vị lại trong `ranked`. Điểm có `minute_utc < m(t) − 59` (đến muộn) chỉ vào ledger, không vào cửa sổ.

**Trượt:** bộ hẹn giờ theo **đồng hồ đơn điệu** kích hoạt ở mỗi ranh giới phút; xử lý **mọi** bucket có `minute_utc < m(t) − 59` (bắt kịp nếu bộ hẹn giờ trễ hoặc máy ngủ): với mỗi người trong bucket hết hạn → trừ `score`, `weight_g` khỏi `totals`; nếu tổng về 0 → xoá khỏi `ranked`; nếu không → `reachedAt = expiry(bucket)` theo R10 (thay cách tính `lastAt` của 0.0.8), định vị lại. Chi phí mỗi phút = O(số người có điểm trong phút hết hạn × log n) — không lặp toàn bộ người chơi.

**Đồng hồ:** bucket theo **giờ UTC thực** (`Date.now()`), lịch trượt theo đồng hồ đơn điệu. Nếu giờ hệ thống bị chỉnh lùi: sự kiện mới gắn vào phút sớm hơn nhưng vẫn trong cửa sổ; nếu chỉnh tiến xa: mọi bucket cũ hết hạn ngay. Ghi log `CLOCK_JUMP` khi lệch > 2 s giữa hai đồng hồ.

**Số liệu chính xác:** `score` và `weight_g` là số nguyên ở mọi tầng (DB, RAM, WS); kg chỉ đổi ra số thập phân khi **hiển thị** (`weight_g / 1000`, làm tròn hiển thị 1–2 chữ số, quy tắc làm tròn cố định). Không dùng float để cộng dồn hay so sánh.

**Dựng lại từ ScoreLedger:** khi khởi động (C4, ADR-0022) và khi `verify-leaderboards.js` chạy: `SELECT player_key, minute_utc, SUM(score), SUM(weight_g), MAX(at_utc) FROM score_ledger WHERE minute_utc >= :m-59 GROUP BY player_key, minute_utc` (qua ReadWorker/Worker, không chặn luồng chính) → nạp lại bucket. **0.0.9 (R10):** thêm truy vấn `SELECT player_key, MAX(minute_utc) FROM score_ledger WHERE minute_utc BETWEEN :m-119 AND :m-60 GROUP BY player_key` để tính vế "hết hạn" của `reached_at` (bucket cũ hơn `m−119` hết hạn trước mọi sự kiện còn trong cửa sổ nên không ảnh hưởng). Bất biến I6: cửa sổ dựng lại = cửa sổ đang chạy, **gồm cả thứ tự**.

**Tách snapshot lịch sử khỏi TOP 60 phút hiện tại:**
- TOP hiện tại: **chỉ** từ HourWindow trong RAM; API `GET /api/leaderboard?scope=hour` — **không có** tham số `period`.
- Lịch sử: bảng riêng `hour_window_snapshots(snapshot_at_utc, window_from_minute, window_to_minute, rank, player_key, score, weight_g)` chụp ở mỗi giờ tròn (TOP 100, cấu hình); API riêng `GET /api/leaderboard/hour-history?at=<giờ tròn UTC>`.
- Giao diện ghi nhãn khác nhau: "TOP 60 PHÚT (đang chạy)" và "TOP 60 phút lúc HH:00 (lịch sử)". Stage chỉ hiển thị bảng đang chạy.
- Snapshot **không bao giờ** được dùng để dựng lại cửa sổ hiện tại.

**Kiểm thử:** cửa sổ trượt qua 60+ phút với dữ liệu tổng hợp so với tính trực tiếp; các ca hoà theo R10 (kg → `reached_at` → `player_key`); bộ hẹn giờ trễ 5 phút (bắt kịp); giờ hệ thống chỉnh lùi/tiến; restart giữa chừng dựng lại khớp; điểm đến muộn; 10.000 người có điểm trong cùng một phút (đo chi phí trượt).

- Phương án đã loại: TOP giờ theo giờ tròn (trái quyết định "60 phút gần nhất"); reset bảng điểm theo kỳ (mất dữ liệu); tính BXH bằng truy vấn tổng hợp ledger mỗi lần đọc (chậm khi đông); lưu giờ địa phương trong DB.
- Hệ quả: mỗi lần câu cập nhật 4 bộ đếm kỳ trong DB (cùng transaction với ledger) + 1 bucket phút trong RAM (sau khi commit); `tools/verify-leaderboards.js` đối chiếu với tính lại từ ledger; test qua 00:00 và thứ Hai giờ VN khi máy đặt múi giờ khác; test trượt cửa sổ 60 phút và hoà điểm phân định bằng kg.
