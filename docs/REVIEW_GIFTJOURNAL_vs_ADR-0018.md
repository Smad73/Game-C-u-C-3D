# Phiếu đối chiếu GiftJournal ↔ ADR-0018 (gửi ChatGPT review) — 2026-11-25
Đối chiếu mã thực tế: `src/ingest/Normalizer.js` (`giftKeyFor`), `src/gifts/GiftJournal.js`, `src/data/PersistenceWorker.js` (`giftApply`), `src/data/gameOps.js` (`giftEffects`). Không đổi kiến trúc; các điểm dưới đây chờ duyệt.

| # | ADR-0018 quy định | Mã thực tế | Loại | Đề xuất bổ sung ADR |
|---|---|---|---|---|
| 1 | Quà thường thiếu `msgId`: `H:hash(userKey, giftId, repeatCount, createTime)` | Giống hệt (`reason NO_MSG_ID`, WEAK) | Khớp | — |
| 2a | (như trên cho mọi khoá H) | Quà **streak thiếu groupId**: `H:hash(…, createTime, 'end'|'mid', msgId)` | **Lệch** | Ghi rõ: khoá H của streak thêm cờ repeatEnd + msgId để tách hai lần gửi (ca E2) |
| 2b | ADR không quy định streak thiếu groupId | Mốc giữa chừng → journal **REJECTED** `STREAK_NO_GROUP_INTERMEDIATE`; chỉ sự kiện repeatEnd được tính (quantity = repeatCount); thiếu cả groupId lẫn repeatEnd → **0** (mọi sự kiện REJECTED để đối soát) | **Bổ sung** | Thêm ca này vào ADR; giới hạn đã biết |
| 3 | Hiệu ứng quà commit cùng transaction với APPLIED; công bố RAM sau ack | Giữ nguyên; hiệu ứng gameplay (XP, xu, buff, sự kiện thế giới, điểm BXH) nằm trong `giftApply` → `gameOps.giftEffects` cùng transaction; kết quả lưu `gift_events.applied_effects` để GB8 (mất ACK) công bố đúng từ DB | Khớp (mở rộng) | Ghi nhận cột `applied_effects` |
| 4 | Tham số phụ thuộc thời gian chốt lúc nhận (`effect_params`) | `effect_params` v2 chốt thêm **hành động Gift Mapping tại lúc nhận** (actions, thưởng gốc, trần buff) → đổi luật quà sau đó không ảnh hưởng quà đã nhận/replay; `expires_at` buff tính từ `received_at_utc` | Khớp (mở rộng) | Ghi nhận effect_params v2 |
| 5 | Boss quà vào hàng chờ bền (`world_events QUEUED`, `source_key = gift_key`) | Đúng; thêm **gộp**: sự kiện nhỏ cùng loại đang chạy/chờ → gia hạn (trần 3× thời lượng); Boss quà khi đã có Boss quà chờ → gộp thành một Boss cấp max+1 (≤10); dòng bị gộp ghi DONE `MERGED:<id>` | **Bổ sung** (ADR-0024) | Lý do: benchmark thấy 289 sự kiện xếp hàng / 30 giây ở 20 quà/s |

**Rủi ro còn lại (L-015):** streak không groupId — nếu TikTok gửi lại repeatEnd với msgId/createTime khác thì bị tính hai lần; không có dữ liệu nào phân biệt được với hai lần gửi thật. Quyết định cuối phụ thuộc log LIVE thật (Module 10, chờ A17).
**Bằng chứng:** `tests/streak-review.test.js` 9/9 (A–F2), `tests/gift-journal.test.js`, `tests/game.test.js` ("quà: hiệu ứng … chỉ vào RAM SAU commit", "Gift Mapping: luật bị tắt…", "sự kiện từ quà: cùng loại thì GỘP…").
