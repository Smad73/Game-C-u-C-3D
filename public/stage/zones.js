// Bản đồ rộng (ADR-0026): vị trí và phong cảnh các khu câu. Mỗi khu có một "cầu" cùng bố cục ô như cầu chính
// (anglers.js slotPos: x ±0.92, z từ +4.5 lùi dần) đặt quanh `origin`, nên camera/cần thủ chỉ cần cộng gốc của khu.
// Danh sách/tên khu do server quyết định (src/game/catalog.js ZONES); file này chỉ là phần hình ảnh theo id.
import * as THREE from '/vendor/three/three.module.js';

export const ZONE_LAYOUT = Object.freeze({
  cau: { origin: [0, 0, 0], kind: 'builtin' },   // cầu gỗ chính (dựng sẵn trong scene.js)
  ben: { origin: [30, 0, -50], kind: 'stone' },   // cầu đá dẫn ra đảo phải
  sau: { origin: [-50, 0, -30], kind: 'raft' },   // bè nổi giữa hồ sâu
  dao: { origin: [-6, 0, -76], kind: 'wood' }     // cầu gỗ sáng màu ra đảo xa
});

/** Gốc toạ độ của khu (Vector3); khu lạ → gốc cầu chính. */
export function zoneOrigin(id) {
  const o = (ZONE_LAYOUT[id] ?? ZONE_LAYOUT.cau).origin;
  return new THREE.Vector3(o[0], o[1], o[2]);
}

const M = new Map();
const mat = (c) => { if (!M.has(c)) M.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true })); return M.get(c); };

/** Dựng phong cảnh cho các khu (trừ cầu chính). Gọi một lần khi tạo cảnh. */
export function buildZones(scene) {
  for (const [id, z] of Object.entries(ZONE_LAYOUT)) {
    if (z.kind === 'builtin') continue;
    const o = zoneOrigin(id);
    const g = new THREE.Group();
    g.position.copy(o);
    g.name = `zone-${id}`;
    if (z.kind === 'stone') stonePier(g);
    else if (z.kind === 'raft') raft(g);
    else woodPier(g, 0xc89a62, 0x8a6236);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(g);
  }
}

// Mặt sàn cao ~0.49 (cần thủ đứng ở y 0.5 như cầu chính). Chiều dài phủ z +6.5 … −16.
function woodPier(g, plankColor, postColor) {
  const m = new THREE.Matrix4();
  const N = 40;
  const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.14, 0.55), mat(plankColor), N);
  for (let i = 0; i < N; i++) {
    m.makeRotationY(((i * 37) % 7 - 3) * 0.006);
    m.setPosition(0, 0.42, 6.5 - i * 0.56);
    planks.setMatrixAt(i, m);
    planks.setColorAt(i, new THREE.Color(plankColor).multiplyScalar(0.85 + ((i * 13) % 10) * 0.03));
  }
  g.add(planks);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.15, 2.6, 6), mat(postColor), 16);
  for (let i = 0; i < 16; i++) { m.makeTranslation(i % 2 ? 1.25 : -1.25, -0.6, 6 - Math.floor(i / 2) * 2.95); posts.setMatrixAt(i, m); }
  g.add(posts);
  for (const x of [-1.27, 1.27]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 22), mat(postColor));
    rail.position.set(x, 0.62, -4.7);
    g.add(rail);
  }
}

function stonePier(g) {
  const m = new THREE.Matrix4();
  const N = 18;
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 0.5, 1.2), mat(0x9aa0a6), N);
  for (let i = 0; i < N; i++) {
    m.makeRotationY(((i * 29) % 5 - 2) * 0.02);
    m.setPosition(((i * 17) % 5 - 2) * 0.02, 0.24, 6.3 - i * 1.25);
    slabs.setMatrixAt(i, m);
    slabs.setColorAt(i, new THREE.Color(0x9aa0a6).multiplyScalar(0.8 + ((i * 7) % 10) * 0.04));
  }
  g.add(slabs);
  // đá viền hai bên
  const rock = new THREE.DodecahedronGeometry(0.45, 0);
  const rocks = new THREE.InstancedMesh(rock, mat(0x7d838a), 24);
  for (let i = 0; i < 24; i++) {
    const s = 0.7 + ((i * 11) % 6) * 0.1;
    m.makeScale(s, s * 0.7, s);
    m.setPosition(i % 2 ? 1.55 : -1.55, 0.05, 6 - Math.floor(i / 2) * 1.85);
    rocks.setMatrixAt(i, m);
  }
  g.add(rocks);
}

function raft(g) {
  const m = new THREE.Matrix4();
  // khúc gỗ nằm ngang, ghép thành bè dài
  const N = 44;
  const logs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.26, 0.26, 2.8, 8).rotateZ(Math.PI / 2), mat(0x7a5232), N);
  for (let i = 0; i < N; i++) {
    m.makeTranslation(((i * 23) % 5 - 2) * 0.03, 0.22, 6.6 - i * 0.52);
    logs.setMatrixAt(i, m);
    logs.setColorAt(i, new THREE.Color(0x7a5232).multiplyScalar(0.85 + ((i * 9) % 10) * 0.03));
  }
  g.add(logs);
  // thùng phao hai bên
  const barrel = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10);
  const barrels = new THREE.InstancedMesh(barrel, mat(0x2f6f9a), 12);
  for (let i = 0; i < 12; i++) { m.makeTranslation(i % 2 ? 1.7 : -1.7, 0.05, 5.5 - Math.floor(i / 2) * 3.8); barrels.setMatrixAt(i, m); }
  g.add(barrels);
  // cột cờ ở đầu bè
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), mat(0x5a3a22));
  pole.position.set(1.1, 1.9, 6.4);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: 0xe04a4a, side: THREE.DoubleSide }));
  flag.position.set(1.55, 3.1, 6.4);
  g.add(pole, flag);
}
