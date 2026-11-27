# A17 — Chọn thư viện/dịch vụ kết nối TikTok LIVE (hồ sơ quyết định)
Ngày tra: 2026-11-25 · Người quyết định: **người dùng** (chi phí + pháp lý) · Duyệt kiến trúc: ChatGPT · Trạng thái: **ĐÃ CHỐT 2026-11-25 — phương án (a) `tiktok-live-connector@2.5.0`, như các game trước; đã cài (ghim chính xác). Xem ADR-0025.**
Đây là thông tin tra được, **không phải ý kiến pháp lý**. Nguồn: npm registry (`npm view`), README gói, trang tik.tools (/terms cập nhật 15/11/2026, /privacy, /pricing).

## 1. Bối cảnh
- TikTok không có API chính thức cho loại game này (BRIEF). Mọi lựa chọn dưới đây đều **không chính thức**, có thể hỏng khi TikTok đổi giao thức.
- Sản phẩm dự định **bán** cho streamer → giấy phép mã nguồn và điều khoản dịch vụ bên thứ ba phải cho phép.
- Mã game đã có cổng cắm sẵn (`src/ingest/LiveConnector.js`, `PROVIDERS`): đổi thư viện không phải sửa gameplay. Khoá API đọc từ biến môi trường `NOVA_TIKTOOL_API_KEY`, không ghi vào mã/cấu hình/log/bản phát hành.

## 2. Ứng viên đã tra
| Gói (bản) | Giấy phép gói | Phụ thuộc đáng chú ý | Cách hoạt động | Ghi chú |
|---|---|---|---|---|
| `tiktok-live-connector` 2.5.0 | **AGPL-3.0-only** | `tiktok-live-proto` 0.2.4 (**AGPL-3.0-only**), `tiktok-live-api-sdk` 0.4.0-beta1 (MIT, SDK của Euler Stream) | Ký kết nối qua dịch vụ Euler Stream (bên thứ ba) | Kiến trúc ghim ban đầu (ADR-0003); AGPL áp dụng cả khi dùng qua mạng |
| `@tiktool/live` 2.20.0 | **MIT** | chỉ `ws` (MIT) | **Bắt buộc API key** tik.tools (B4Battle LLC); chế độ direct: kết nối WebSocket từ máy chạy game | Đã viết adapter `provider: 'tiktool'` (chưa cài, chưa kiểm) |
| `tiktok-live-events` 1.4.0 | MIT | `ws` | Cùng nhà cung cấp tik.tools, cần API key | Không chọn (trùng chức năng với @tiktool/live) |
| `tiktok-livestream-chat-connector` 0.9.16 | MIT | `axios` 0.25, `protobufjs` 6, `websocket` | Thư viện cũ (cùng tác giả bản AGPL) | Phụ thuộc cũ; **không kiểm** còn hoạt động hay không — rủi ro cao |

## 3. Điều khoản tik.tools (tóm tắt, cần người dùng/luật sư đọc lại bản gốc tại https://tik.tools/terms)
- Không liên kết với TikTok; dữ liệu "không được TikTok hỗ trợ chính thức"; dùng "at your own risk"; trách nhiệm tối đa = phí 3 tháng hoặc 100 USD; TikTok có thể chặn bất kỳ lúc nào, không hoàn tiền.
- Giấy phép dùng cho **hoạt động nội bộ của chính khách hàng**; cấm bán lại/cấp phép lại dịch vụ hoặc dữ liệu khi chưa có văn bản cho phép; một tài khoản cho một tổ chức.
- **Gói Sandbox (dùng thử 7 ngày) cấm dùng cho sản phẩm trả phí hoặc phục vụ người khác.**
- Giá (trang pricing, 11/2026): Basic 19 USD/tháng (20 WS, 8 giờ/phiên) · Pro 49 USD/tháng · Ultra 149 USD/tháng; gói trả phí không hoàn tiền.
- **Hệ quả cho sản phẩm bán:** không được nhúng khoá của nhà phát triển vào bản bán. Cách khả thi duy nhất (cần xác nhận bằng văn bản với tik.tools) là **mỗi streamer tự mua tài khoản/khoá riêng** cho buổi LIVE của chính họ và nhập vào máy của họ.

## 4. Phương án
| Phương án | Ưu | Nhược / rủi ro | Chi phí | Thay đổi kiến trúc |
|---|---|---|---|---|
| **(a) Chấp nhận AGPL** (`tiktok-live-connector`) | Phổ biến, cộng đồng lớn, không phí dịch vụ trực tiếp | Phải công bố **toàn bộ mã nguồn** cho người dùng (kể cả qua mạng) — mâu thuẫn mục tiêu bán mã đóng; phụ thuộc Euler Stream | 0 (+ có thể phí Euler) | Không |
| **(b) Xin giấy phép thương mại** (tác giả AGPL / Euler Stream) hoặc ý kiến luật sư | Giữ thư viện quen thuộc, hợp pháp hoá | Chưa biết có bán hay giá; thời gian chờ | Chưa biết | Không |
| **(c) `@tiktool/live` (MIT) + khoá riêng của từng streamer** | Mã MIT, phụ thuộc tối thiểu; adapter đã viết sẵn | Phụ thuộc dịch vụ trả phí bên thứ ba; điều khoản cấm bán lại → phải để streamer tự đăng ký; cần xác nhận bằng văn bản; chưa kiểm trên LIVE thật | 19+ USD/tháng **mỗi streamer** | Không (ADR mới ghi nhận nhà cung cấp) |
| (d) Thư viện MIT cũ | Không phí | Có thể đã hỏng; không bảo trì | 0 | Không |
| (e) Tự viết kết nối (clean-room) | Toàn quyền | Rất tốn công; giao thức/ký thay đổi liên tục; rủi ro điều khoản TikTok | Công sức lớn | Có |

## 5. Khuyến nghị (chỉ đề xuất — người dùng quyết định)
1. Ngắn hạn để kiểm thử Module 10 trên LIVE của chính người dùng (không bán): có thể cân nhắc **Sandbox tik.tools** (7 ngày; điều khoản 4.3 cấm phục vụ người khác — một buổi LIVE có người xem tương tác có thể bị coi là vi phạm, cần người dùng đọc kỹ hoặc hỏi tik.tools; an toàn hơn là gói Basic cho buổi thử) **hoặc** `tiktok-live-connector` trong môi trường thử nội bộ (không phân phối) — cả hai đều cần người dùng đồng ý cài.
2. Cho bản bán: **(c)** nếu tik.tools xác nhận bằng văn bản mô hình "mỗi streamer tự mua khoá"; nếu không, **(b)**. Không chọn (a) trừ khi người dùng chấp nhận công bố mã nguồn.
3. Dù chọn gì: ghi ADR mới thay phần "ghim thư viện" của ADR-0003; hướng dẫn cài cho người mua; không bao giờ đóng gói khoá API.

## 6. Cần người dùng trả lời
- Chọn (a) / (b) / (c) / khác.
- Cho phép cài gói tương ứng (`npm install …@<bản>`) và — nếu (c) — tự đăng ký tik.tools và đặt `NOVA_TIKTOOL_API_KEY` trên máy phát.
- Có liên hệ tik.tools / tác giả AGPL để xin xác nhận bằng văn bản không.
