// Nhân vật cần thủ từ VRoid (.vrm, VRM 1.0): nạp các mẫu MỘT LẦN; mỗi cần thủ là một bản sao có khung xương riêng
// (SkeletonUtils.clone, dùng chung hình học). Nạp lỗi → mảng rỗng, cần thủ tự dùng hình khối cũ (stage không hỏng).
// Danh sách mẫu: public/stage/assets/vrm/models.json (server tự ghi khi khởi động) → thả .vrm mới vào thư mục là có nhân vật mới.
// Biến thể: mỗi mẫu có VARIANTS bộ màu tóc/quần áo (nhân màu vật liệu MToon) → nhiều nhân vật khác nhau từ ít model.
// Tay: giải IK hai đốt (vai–khuỷu–cổ tay) để bàn tay BÁM vào điểm trên cần câu; ngón tay cong để nắm.
import { THREE } from './scene.js';
import { GLTFLoader } from '/vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '/vendor/three/addons/utils/SkeletonUtils.js';
import { VRMLoaderPlugin } from '/vendor/three-vrm/three-vrm.module.js';

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const FINGER_BONES = [];
for (const side of ['left', 'right']) {
  for (const f of FINGERS) for (const j of ['Proximal', 'Intermediate', 'Distal']) FINGER_BONES.push(`${side}${f}${j}`);
  for (const j of ['Metacarpal', 'Proximal', 'Distal']) FINGER_BONES.push(`${side}Thumb${j}`);
}
/** Xương cần điều khiển. */
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg', ...FINGER_BONES];
/** Chiều cao mục tiêu (đơn vị thế giới) để khớp bố cục cầu câu. */
export const TARGET_HEIGHT = 1.45;
/**
 * Tối đa số mẫu nạp mỗi lần chạy (chọn ngẫu nhiên): mỗi mẫu tốn ~40–70 MB bộ nhớ đồ hoạ (texture ≤ 1024) →
 * giữ trần cho máy 8 GB đang chạy kèm OBS/TikTok LIVE Studio. Mỗi lần mở game ra bộ nhân vật khác nhau.
 */
export const MAX_MODELS = 6;
/** Số bộ màu cho mỗi mẫu (0 = màu gốc). */
export const VARIANTS = 6;
const TINTS = [null, 0xffb3b3, 0xb3d1ff, 0xc9f2b0, 0xf2dba0, 0xd9b8f5]; // nhân vào tóc/quần áo (màu sáng → giữ chi tiết texture)
const TINT_MAT = /HAIR|CLOTH|Tops|Bottoms|Shoes|Accessory|Onepiece/i;

/** Mẫu đã nạp xong (rỗng nếu chưa nạp hoặc nạp lỗi). anglers.js đọc trực tiếp mảng này. */
export const CHARACTER_TEMPLATES = [];
let loading = null;

/** Nạp tất cả mẫu một lần (gọi nhiều lần vẫn chỉ nạp một lần). Trả về số mẫu nạp được. */
export function loadCharacters() {
  loading ??= (async () => {
    let names = [];
    try { names = (await (await fetch('/stage/assets/vrm/models.json', { cache: 'no-store' })).json()).models ?? []; } catch (e) { console.warn('[nhân vật] không đọc được models.json', e?.message); }
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    names = names.slice(0, MAX_MODELS);
    const rs = await Promise.allSettled(names.map(loadOne));
    for (const r of rs) {
      if (r.status === 'fulfilled') CHARACTER_TEMPLATES.push(r.value);
      else console.warn('[nhân vật] không nạp được một mẫu VRM', r.reason?.message || r.reason);
    }
    return CHARACTER_TEMPLATES.length;
  })();
  return loading;
}

async function loadOne(name) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(`/stage/assets/vrm/${encodeURIComponent(name)}.vrm`);
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error(`${name}.vrm không phải VRM hợp lệ`);
  vrm.scene.rotation.y = Math.PI; // VRM 1.0 hướng +z; cần thủ hướng -z (về phía hồ)
  // Collider của spring bone (tóc/váy) lỗi shape trong bản này và làm vỡ cập nhật ma trận khi render → bỏ (L-021).
  const dead = [];
  vrm.scene.traverse((o) => { if (o.colliderMatrix !== undefined) dead.push(o); });
  for (const o of dead) o.removeFromParent();
  vrm.userData = { name, tinted: new Map() };
  return vrm;
}

/** Vật liệu đã nhuộm theo biến thể (dùng chung giữa các cần thủ cùng mẫu + cùng biến thể). */
function tintedMaterial(vrm, mat, variant) {
  const key = `${mat.uuid}:${variant}`;
  const cache = vrm.userData.tinted;
  if (!cache.has(key)) {
    const m = mat.clone();
    const tint = new THREE.Color(TINTS[variant]);
    if (m.uniforms?.litFactor) m.uniforms.litFactor.value = m.uniforms.litFactor.value.clone().multiply(tint);
    if (m.uniforms?.shadeColorFactor) m.uniforms.shadeColorFactor.value = m.uniforms.shadeColorFactor.value.clone().multiply(tint);
    if (m.color) m.color.multiply(tint);
    cache.set(key, m);
  }
  return cache.get(key);
}

/** Tạo một bản sao nhân vật có khung xương riêng; trả về {root, bones, name}. */
export function instantiate(vrm, variant = 0) {
  const src = [];
  vrm.scene.traverse((o) => src.push(o));
  const index = new Map(src.map((o, i) => [o, i]));
  const root = cloneSkinned(vrm.scene);
  const dst = [];
  root.traverse((o) => dst.push(o));
  const bones = {};
  for (const name of BONES) {
    const b = vrm.humanoid.getRawBoneNode(name);
    if (b && index.has(b)) bones[name] = dst[index.get(b)];
  }
  const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    if (v > 0) o.material = Array.isArray(o.material) ? o.material.map((m) => (TINT_MAT.test(m.name) ? tintedMaterial(vrm, m, v) : m)) : (TINT_MAT.test(o.material.name) ? tintedMaterial(vrm, o.material, v) : o.material);
  });
  // tư thế nghỉ (chữ T) của từng xương → mọi tư thế tính tương đối từ đây
  const rest = new Map();
  for (const [k, b] of Object.entries(bones)) rest.set(k, b.quaternion.clone());
  if (bones.hips) bones.hipsBaseY = bones.hips.position.y;
  return { root, bones, rest, name: vrm.userData.name, variant: v };
}

/** Co model về TARGET_HEIGHT và đặt chân ngang gốc (gọi trước khi thêm vào cảnh). */
export function fitHeight(root, target = TARGET_HEIGHT) {
  root.scale.setScalar(1);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  // Hộp bao từ hình học các mesh (không dùng Box3.setFromObject: nó duyệt cả collider của VRM và lỗi — L-021).
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  if (box.isEmpty()) return;
  const h = Math.max(0.01, box.max.y - box.min.y);
  const s = target / h;
  root.scale.setScalar(s);
  root.position.y = -box.min.y * s;
}

// ───────── tư thế ─────────
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Đặt xương = tư thế nghỉ ⊗ xoay cục bộ (x,y,z rad). Không có xương → bỏ qua. */
export function poseBone(ch, name, x = 0, y = 0, z = 0) {
  const b = ch.bones[name];
  if (!b) return;
  b.quaternion.copy(ch.rest.get(name)).multiply(_q.setFromEuler(_e.set(x, y, z)));
}

/**
 * Nắm tay: cong các đốt ngón (0 = duỗi, 1 = nắm chặt). Model VRoid nghỉ chữ T với trục xương thẳng theo thế giới:
 * ngón tay phải chỉ −x (cong = xoay +z), ngón tay trái chỉ +x (cong = xoay −z).
 */
export function curlHand(ch, side, amount) {
  const s = side === 'right' ? 1 : -1;
  for (const f of FINGERS) {
    poseBone(ch, `${side}${f}Proximal`, 0, 0, s * 1.25 * amount);
    poseBone(ch, `${side}${f}Intermediate`, 0, 0, s * 1.45 * amount);
    poseBone(ch, `${side}${f}Distal`, 0, 0, s * 1.0 * amount);
  }
  poseBone(ch, `${side}ThumbMetacarpal`, 0, -s * 0.5 * amount, s * 0.2 * amount);
  poseBone(ch, `${side}ThumbProximal`, 0, -s * 0.6 * amount, 0);
  poseBone(ch, `${side}ThumbDistal`, 0, -s * 0.5 * amount, 0);
}

const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3();
const _t = new THREE.Vector3(); const _d = new THREE.Vector3(); const _p = new THREE.Vector3(); const _e2 = new THREE.Vector3();
const _pw = new THREE.Quaternion(); const _bw = new THREE.Quaternion();

/** Xoay `bone` (trong không gian thế giới) đúng bằng phép quay đưa vector `from` về `to`. */
function rotateWorld(bone, from, to) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  bone.getWorldQuaternion(_bw);
  bone.parent.getWorldQuaternion(_pw);
  // world mới = q * world cũ → local = parentWorld⁻¹ * world mới
  _q2.copy(_q).multiply(_bw);
  bone.quaternion.copy(_pw.invert()).multiply(_q2);
  bone.updateWorldMatrix(false, true);
}

/**
 * IK hai đốt (giải tích): đưa cổ tay `hand` tới `target` (thế giới), khuỷu tay quay về phía `pole` (hướng thế giới).
 * upper = cánh tay trên, lower = cẳng tay.
 */
export function solveArm(upper, lower, hand, target, pole) {
  if (!upper || !lower || !hand) return;
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  const la = _a.distanceTo(_b); const lb = _b.distanceTo(_c);
  _t.copy(target).sub(_a);
  const d = Math.min(Math.max(_t.length(), 1e-4), la + lb - 1e-4);
  _d.copy(_t).normalize();
  // vị trí khuỷu mong muốn: trong mặt phẳng (vai→đích, pole)
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  const cosA = Math.min(1, Math.max(-1, (la * la + d * d - lb * lb) / (2 * la * d)));
  _e2.copy(_a).addScaledVector(_d, la * cosA).addScaledVector(_p, la * Math.sqrt(1 - cosA * cosA));
  rotateWorld(upper, _b.clone().sub(_a), _e2.clone().sub(_a));
  lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  rotateWorld(lower, _c.clone().sub(_b), target.clone().sub(_b));
}
