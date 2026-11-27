# ADR-0008: Thiết kế sẵn sàng mở rộng ngang
- Ngày: 2026-11-24 — Trạng thái: Đề xuất
- Bối cảnh: Lượng người chơi có thể tăng cao; người dùng yêu cầu kiến trúc mở rộng ngang được.
- Quyết định: Bản 1 chạy **một tiến trình**, nhưng mọi phụ thuộc đi qua interface: `EventBus` (in-process → Redis Streams/NATS), repository (SQLite → Postgres), `LeaderboardStore` (RAM → Redis sorted set), `WsGateway` tách được. Trạng thái người chơi có `partitionKey = hash(userId) % P` (bản 1: P = 1). Sự kiện toàn hồ phát quảng bá tới mọi shard.
- Lý do: không thêm hạ tầng nặng cho máy M1 khi chưa cần, nhưng không phải viết lại khi cần.
- Giới hạn bản chất: một LIVE chỉ có một nguồn sự kiện → Ingest là đơn tiến trình; phần mở rộng được là mô phỏng, BXH, phát WS.
- Điều kiện kích hoạt: số đo ở Phase 8 cho thấy 1 tiến trình không đủ; thay đổi hạ tầng phải xin phép người dùng.
- Phương án đã loại: microservices ngay từ bản 1 (quá nặng cho máy 8 GB và đóng gói bán).
