# ADR-0007: Render đám đông — Instanced + LOD + Frustum Culling + Spatial Grid + Object Pool + Spotlight
- Ngày: 2026-11-24 — Trạng thái: Đề xuất
- Bối cảnh: Số cần thủ không giới hạn nhưng GPU M1 7 nhân, RAM 8 GB, chạy kèm LIVE Studio, cần 30 FPS ở 1080×1920.
- Quyết định: LOD0 Hero (model đầy đủ, chỉ người được spotlight) · LOD1 InstancedMesh low-poly + vertex animation · LOD2 impostor instanced · LOD3 chỉ hiệu ứng mật độ đám đông. Culling theo ô SpatialGrid; Object Pool cho actor/cần/cá/FX/nhãn; nhãn tên từ atlas. SpotlightDirector chọn người lên hình (quà, cá hiếm, mới vào, TOP) và luân phiên. Bờ hồ sinh thủ tục mở rộng theo số người.
- Số lượng ở mỗi LOD là **ngân sách render theo preset, tự điều chỉnh theo frame time**, không phải giới hạn gameplay.
- Phương án đã loại: mỗi người một skinned mesh; CSS2D label cho mọi người; vẽ tất cả người chơi.
- Hệ quả: cần model có nhiều cấp LOD (CC0) hoặc tự giảm đa giác; tiêu chí Phase 6 (đánh số theo ARCHITECTURE 0.0.3): 30 FPS với 1.000 và 10.000 người trong thế giới.
