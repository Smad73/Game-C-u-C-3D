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
- **0.0.8 (R01):** `DatabaseSync` là API đồng bộ → **không bao giờ gọi trên luồng chính**; đánh giá rủi ro D1–D7 và thiết kế PersistenceWorker ở ADR-0017. Công nghệ DB **không đổi**.
- Hệ quả: ARCHITECTURE §2 cập nhật; tiêu chí Phase 1 gồm `npm test` với `node:sqlite` trên cả hai OS.
