# ADR-0011: Tiến trình lâu dài & PlayerRegistry nóng/lạnh
- Ngày: 2026-11-24 — Sửa: 2026-11-24 (0.0.4: thuật ngữ COLD, định nghĩa tương tác hợp lệ) — Trạng thái: Đề xuất
- Bối cảnh: Hồ sơ, điểm, cấp, trang bị, sổ tay cá, thành tích phải lưu lâu dài và khôi phục khi người chơi quay lại; số người tích luỹ qua nhiều buổi LIVE không giới hạn, máy chỉ có 8 GB RAM.
- Quyết định:
  1. Dữ liệu lâu dài trong SQLite: `players` (xp, level, total_score…), `player_equipment`, `player_inventory`, `fishdex`, `player_achievements`, `player_presence`.
  2. PlayerRegistry hai tầng: **nóng** (RAM) cho ACTIVE/AFK gần đây; **lạnh/COLD** (chỉ DB) — đây là tầng lưu trữ, không phải trạng thái gameplay (với người chơi vẫn là AFK). Chuyển nóng → lạnh khi AFK quá ngưỡng vận hành (mặc định 30 phút, cấu hình) hoặc khi kết thúc LIVE; lạnh → nóng khi có tương tác hợp lệ (nạp bất đồng bộ, sự kiện của họ chờ trong hàng đợi đến khi nạp xong).
  3. PresenceTracker: `ACTIVE → AFK` sau 5 phút không có tương tác hợp lệ (tạm dừng tự quăng). Tương tác hợp lệ = comment lệnh hợp lệ hoặc gửi quà; like đơn lẻ không tính (ChatGPT chốt).
  4. Ghi liên tục qua write-behind (không chỉ lúc rời), nên "rời đi" không cần tín hiệu từ TikTok. **0.0.8:** ghi đi qua PersistenceWorker (ADR-0017); hồ sơ chỉ được bỏ khỏi RAM (sang COLD) **sau khi** mọi thay đổi của người đó đã được ack; RPO theo ADR-0022 nhóm C2; khoá người chơi `player_key` theo ADR-0021.
  5. Định nghĩa vật phẩm/thành tích/cấp nạp từ `config/*.json` có version; đổi định nghĩa dùng migration, không làm hỏng dữ liệu cũ.
- Phương án đã loại: giữ mọi hồ sơ trong RAM (tràn bộ nhớ khi tích luỹ); chỉ lưu khi kết thúc LIVE (mất dữ liệu khi sập).
- Hệ quả: test rời → quay lại khôi phục đủ trường; test like không đánh thức; test tràn RAM với số hồ sơ lạnh lớn; mô phỏng cân bằng XP chống lạm phát.
