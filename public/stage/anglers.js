// Cần thủ low-poly trên cầu câu: dựng theo `appearance` (màu áo, mũ, da), hoạt ảnh theo pha server gửi (cast/wait/bite/fight/result/afk).
// Dây câu cong (12 điểm) từ đầu cần tới phao; phao nhấp nhô/chìm khi cá cắn. Chỉ vẽ người trong ngân sách hiển thị (slots).
import { THREE, hashRand, makeFish } from './scene.js';

/** Danh mục loài (id → {shape, color, …}) do main.js nạp từ server; dùng để vẽ cá mắc câu dưới nước. */
let SPECIES = new Map();
export function setSpeciesCatalog(map) { SPECIES = map; }
const BUBBLE_GEO = new THREE.SphereGeometry(0.035, 6, 4);
// Cần câu của nhân vật VRoid: đuôi cần trước bụng (toạ độ của nhóm cần thủ, mặt hướng −z, bên phải là +x).
const ROD_BUTT = Object.freeze({ x: 0.1, y: 0.82, z: -0.15 });
const ROD_GRIP = 0.1;  // điểm tay phải nắm (tính dọc cần từ đuôi)
const ROD_REEL = 0.3;  // điểm tay trái giữ máy quay
const _gripV = new THREE.Vector3(); const _reelV = new THREE.Vector3();
const _poleR = new THREE.Vector3(); const _poleL = new THREE.Vector3();
const BUBBLE_MAT = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.55, depthWrite: false });
import { CHARACTER_TEMPLATES, VARIANTS, instantiate, fitHeight, poseBone, curlHand, solveArm } from './characters.js';

const SHIRTS = [0xe04a4a, 0x3a7bd5, 0xf2b134, 0x2fb37a, 0x9b59b6, 0xff7f50, 0x1abc9c, 0xe84393, 0x34495e, 0xf39c12];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0xffdbac, 0x8d5524];
const HATS = [0xf4e1a1, 0x2d3436, 0xd63031, 0x0984e3, 0xfdcb6e, 0x6c5ce7];
const ROD_TIER = [0x8b5a2b, 0x8b5a2b, 0x9aa4ad, 0xb87333, 0xc0c0c0, 0xffd700, 0xe5e4e2, 0x7fdbff, 0xb56cff, 0xff4d6d];

const G = {
  leg: new THREE.BoxGeometry(0.17, 0.7, 0.2),
  body: new THREE.CylinderGeometry(0.26, 0.3, 0.75, 8),
  head: new THREE.SphereGeometry(0.23, 10, 8),
  hat: new THREE.CylinderGeometry(0.34, 0.34, 0.05, 10),
  hatTop: new THREE.CylinderGeometry(0.17, 0.21, 0.2, 10),
  arm: new THREE.BoxGeometry(0.12, 0.55, 0.12),
  rod: new THREE.CylinderGeometry(0.018, 0.04, 2.6, 5),
  bobber: new THREE.SphereGeometry(0.11, 8, 6),
  stool: new THREE.BoxGeometry(0.5, 0.3, 0.5)
};
const M = new Map();
const mat = (c) => { if (!M.has(c)) M.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true })); return M.get(c); };

/** Vị trí cố định của ô hiển thị i trên cầu câu (2 bên, xa dần vào hồ). */
export function slotPos(i) {
  const side = i % 2 ? 1 : -1;
  const row = Math.floor(i / 2);
  return { side, x: side * 0.92, z: 4.5 - row * 2.7, row };
}

export class Angler {
  /** origin: gốc của khu (ADR-0026) — ô slotPos tính tương đối với gốc này. */
  constructor(scene, slot, data, origin = null) {
    this.scene = scene;
    this.slot = slot;
    this.key = data.k;
    const r = hashRand(data.app + 7);
    const g = new THREE.Group();
    const ox = origin?.x ?? 0; const oz = origin?.z ?? 0;
    const s0 = slotPos(slot);
    const sp = { ...s0, x: s0.x + ox, z: s0.z + oz };
    this.sp = sp;
    g.position.set(sp.x, 0.5, sp.z);
    g.rotation.y = sp.side > 0 ? -Math.PI / 2 : Math.PI / 2; // quay mặt ra hồ
    const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
    const skin = SKINS[Math.floor(r() * SKINS.length)];
    const hatC = HATS[Math.floor(r() * HATS.length)];
    const pants = r() < 0.5 ? 0x2c3e50 : 0x5d4037;
    const hip = new THREE.Group(); hip.position.y = 0.7; g.add(hip);
    for (const x of [-0.1, 0.1]) { const l = new THREE.Mesh(G.leg, mat(pants)); l.position.set(x, -0.35, 0); g.add(l); (this.legs ??= []).push(l); }
    const body = new THREE.Mesh(G.body, mat(shirt)); body.position.y = 0.38; hip.add(body);
    const head = new THREE.Mesh(G.head, mat(skin)); head.position.y = 0.98; hip.add(head);
    const hat = new THREE.Mesh(G.hat, mat(hatC)); hat.position.y = 1.17; hip.add(hat);
    const ht = new THREE.Mesh(G.hatTop, mat(hatC)); ht.position.y = 1.27; hip.add(ht);
    const armPivot = new THREE.Group(); armPivot.position.set(0, 0.68, -0.05); hip.add(armPivot);
    for (const x of [-0.3, 0.3]) { const a = new THREE.Mesh(G.arm, mat(shirt)); a.position.set(x, -0.2, -0.15); a.rotation.x = -0.9; armPivot.add(a); }
    const rodPivot = new THREE.Group(); rodPivot.position.set(0.05, -0.32, -0.42); armPivot.add(rodPivot);
    const rod = new THREE.Mesh(G.rod, mat(ROD_TIER[Math.min(9, (data.rod || 1) - 1)])); rod.position.y = 1.3; rodPivot.add(rod);
    const tip = new THREE.Object3D(); tip.position.y = 2.6; rodPivot.add(tip);
    rodPivot.rotation.x = -0.9;
    const stool = new THREE.Mesh(G.stool, mat(0x7a5230)); stool.position.set(0, -0.35, 0.45); stool.visible = false; g.add(stool);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // Nhân vật VRoid (khi đã nạp mẫu): thay thân hình khối. Cần câu cố định trước bụng; hai tay bám vào cần bằng IK.
    const tpl = CHARACTER_TEMPLATES.length ? CHARACTER_TEMPLATES[Math.floor(r() * CHARACTER_TEMPLATES.length)] : null;
    if (tpl) {
      const ch = instantiate(tpl, Math.floor(r() * VARIANTS));
      fitHeight(ch.root);
      g.add(ch.root);
      this.ch = ch;
      hip.visible = false;
      for (const l of this.legs) l.visible = false;
      g.add(rodPivot);
      rodPivot.position.set(ROD_BUTT.x, ROD_BUTT.y, ROD_BUTT.z);
    }
    this.g = g; this.hip = hip; this.armPivot = armPivot; this.rodPivot = rodPivot; this.tip = tip; this.rod = rod; this.stool = stool;
    this.head = this.ch?.bones.head ?? head; // nhãn tên bám theo đầu thật (VRM nếu có)
    scene.add(g);
    // phao + dây
    this.bobber = new THREE.Mesh(G.bobber, new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.5 }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.111, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    this.bobber.add(cap);
    this.bobber.visible = false;
    scene.add(this.bobber);
    this.lineGeo = new THREE.BufferGeometry();
    this.linePts = new Float32Array(13 * 3);
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
    const rr = hashRand(data.app * 3 + slot);
    this.cast = new THREE.Vector3(ox + sp.side * (3.2 + rr() * 1.8), 0, sp.z + (rr() - 0.5) * 1.4);
    this.data = data;
    this.phase = null;
    this.phaseStart = 0;
    this.leaving = 0;
    this.rodLevel = data.rod || 1;
  }

  update(data, now) {
    if (data.ph !== this.phase) { this.prev = this.phase; this.phase = data.ph; this.phaseStart = now - (data.pt || 0); this.onPhase?.(this, data.ph, this.prev); }
    if ((data.rod || 1) !== this.rodLevel) { this.rodLevel = data.rod || 1; this.rod.material = mat(ROD_TIER[Math.min(9, this.rodLevel - 1)]); }
    this.data = data;
  }

  tipWorld() { const v = new THREE.Vector3(); this.tip.getWorldPosition(v); return v; }
  headWorld() { const v = new THREE.Vector3(); this.head.getWorldPosition(v); v.y += 0.6; return v; }

  /** Hoạt ảnh mỗi khung. */
  animate(t, dt) {
    const d = this.data;
    const pt = (performance.now() - this.phaseStart) / 1000;
    let rodX = -0.9; let rodZ = 0; let hipY = 0.7; let lean = 0;
    let bob = null; // vị trí phao
    const castP = this.cast;
    const sit = d.ph === 'afk';
    this.stool.visible = sit;
    switch (d.ph) {
      case 'cast': {
        const p = Math.min(1, pt / 1.3);
        rodX = p < 0.45 ? -0.9 + (p / 0.45) * 1.9 : 1.0 - ((p - 0.45) / 0.55) * 2.0;
        if (p > 0.55) { const q = (p - 0.55) / 0.45; const tip = this.tipWorld(); bob = tip.clone().lerp(castP, q); bob.y = tip.y * (1 - q) + Math.sin(q * Math.PI) * 2.4; }
        break;
      }
      case 'wait': rodX = -1.0 + Math.sin(t * 1.4 + this.slot) * 0.04; bob = castP.clone(); bob.y = 0.04 + Math.sin(t * 2.2 + this.slot) * 0.05; break;
      case 'bite': rodX = -1.0 + Math.sin(t * 30) * 0.12; bob = castP.clone(); bob.y = -0.12 + Math.sin(t * 25) * 0.1; break;
      case 'fight': {
        const te = d.te ?? 0.5;
        rodX = -0.35 + te * 0.4 + Math.sin(t * (12 + te * 20)) * 0.05 * (1 + te);
        rodZ = Math.sin(t * 3 + this.slot) * 0.25 * te;
        lean = 0.18 + te * 0.15;
        const pr = d.pr ?? 0;
        bob = castP.clone().lerp(new THREE.Vector3(this.sp.x + this.sp.side * 1.2, 0, this.sp.z), pr * 0.85);
        bob.x += Math.sin(t * 5 + this.slot) * 0.35 * (d.big || 1) * 0.5; bob.z += Math.cos(t * 4.3) * 0.3;
        bob.y = -0.05;
        break;
      }
      case 'result':
        rodX = d.res === 'caught' ? Math.min(0.6, -0.9 + pt * 3) : -1.3;
        lean = d.res === 'escaped' ? -0.15 : 0;
        hipY = d.res === 'caught' ? 0.7 + Math.max(0, Math.sin(pt * 9)) * 0.12 : 0.7;
        break;
      case 'afk': rodX = -1.45; hipY = 0.42; lean = 0.12; break;
      default: rodX = -0.9; break;
    }
    this.rodPivot.rotation.x += (rodX - this.rodPivot.rotation.x) * Math.min(1, dt * 12);
    this.rodPivot.rotation.z += (rodZ - this.rodPivot.rotation.z) * Math.min(1, dt * 8);
    this.hip.position.y += (hipY - this.hip.position.y) * Math.min(1, dt * 8);
    this.hip.rotation.x += (-lean - this.hip.rotation.x) * Math.min(1, dt * 6);
    this.hip.rotation.y = d.as ? Math.sin(t * 18) * 0.08 : 0;
    if (!this.ch) for (const l of this.legs) l.visible = true;
    if (this.ch) this.poseCharacter({ hipY, lean, sit, t, ph: d.ph, te: d.te ?? 0 });
    if (bob) {
      this.bobber.visible = true;
      this.bobber.position.copy(bob);
      const tip = this.tipWorld();
      const sag = d.ph === 'fight' ? 0.05 : d.ph === 'wait' ? 0.6 : 0.3;
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const x = tip.x + (bob.x - tip.x) * u; const z = tip.z + (bob.z - tip.z) * u;
        const y = tip.y + (bob.y - tip.y) * u - Math.sin(u * Math.PI) * sag;
        this.linePts[i * 3] = x; this.linePts[i * 3 + 1] = y; this.linePts[i * 3 + 2] = z;
      }
      this.lineGeo.attributes.position.needsUpdate = true;
      this.line.visible = true;
      const te = d.te ?? 0;
      this.line.material.color.setRGB(1, 1 - Math.max(0, te - 0.6) * 2, 1 - Math.max(0, te - 0.6) * 2);
    } else { this.bobber.visible = false; this.line.visible = false; }
    this.hookedFish(d, bob, t, dt);
    if (this.leaving) { this.leaving -= dt; this.g.position.y = 0.5 - (1 - Math.max(0, this.leaving)) * 0.3; }
  }

  /** Tư thế nhân vật VRoid theo pha: thân nghiêng theo lean, tay phải đưa cần theo rodX, ngồi khi afk; cần câu bám tay phải. */
  /**
   * Tư thế nhân vật VRoid theo pha. Thân/đầu/chân: xoay tương đối tư thế nghỉ (chữ T). Hai tay: IK bám vào cần câu —
   * tay phải nắm cán (gần đuôi cần), tay trái giữ máy quay; lúc giằng co tay trái quay máy theo vòng tròn.
   */
  poseCharacter({ hipY, lean, sit, t, ph, te }) {
    const ch = this.ch; const b = ch.bones;
    const fight = ph === 'fight';
    // thân: hơi ngả về sau khi kéo cá (lean > 0), thở nhẹ; đầu cúi nhìn mặt nước
    poseBone(ch, 'spine', -lean * 0.5 + Math.sin(t * 1.6 + this.slot) * 0.015);
    poseBone(ch, 'chest', -lean * 0.3);
    poseBone(ch, 'neck', 0.08);
    poseBone(ch, 'head', 0.14 + (ph === 'bite' ? Math.sin(t * 20) * 0.02 : 0), fight ? Math.sin(t * 2.2) * 0.12 : 0, 0);
    // chân: đứng thẳng; AFK thì ngồi (đùi đưa ra trước, gối gập)
    for (const sd of ['left', 'right']) {
      poseBone(ch, `${sd}UpperLeg`, sit ? -1.45 : 0, 0, 0);
      poseBone(ch, `${sd}LowerLeg`, sit ? 1.5 : 0, 0, 0);
    }
    if (b.hips && b.hipsBaseY !== undefined) b.hips.position.y = b.hipsBaseY + (hipY - 0.7) * 1.2;
    // tay về tư thế nghỉ rồi giải IK tới điểm bám trên cần
    for (const k of ['leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand']) poseBone(ch, k);
    this.g.updateMatrixWorld(true);
    const grip = this.rodPivot.localToWorld(_gripV.set(0, ROD_GRIP, 0));
    const crank = fight ? t * (10 + te * 14) : 0;
    const reel = this.rodPivot.localToWorld(_reelV.set(Math.sin(crank) * 0.05, ROD_REEL, Math.cos(crank) * 0.05 - 0.02));
    solveArm(b.rightUpperArm, b.rightLowerArm, b.rightHand, grip, _poleR.set(1, -1, 0.7).transformDirection(this.g.matrixWorld));
    solveArm(b.leftUpperArm, b.leftLowerArm, b.leftHand, reel, _poleL.set(-1, -1, 0.7).transformDirection(this.g.matrixWorld));
    curlHand(ch, 'right', 0.95);
    curlHand(ch, 'left', fight ? 0.75 + Math.sin(crank) * 0.1 : 0.8);
  }

  /**
   * Cá mắc câu dưới nước (pha bite/fight): quay đầu kéo ra xa cần thủ, quẫy theo độ căng, dây phụ từ phao xuống miệng, bọt khí.
   * Công bố this.hookPos (toạ độ thế giới) cho camera góc 3; null khi không có cá.
   */
  hookedFish(d, bob, t, dt) {
    const on = bob && (d.ph === 'fight' || d.ph === 'bite');
    if (!on) { this.#dropFish(); this.hookPos = null; return; }
    const id = d.fs ?? 0;
    if (!this.hooked || this.hookedId !== id) {
      this.#dropFish();
      const sp = SPECIES.get(id);
      const big = d.big ?? 1;
      this.hooked = makeFish(sp?.shape ?? 'fish', sp?.color ?? '#7f9a8a', 0.5 + Math.min(3, big) * 0.22);
      this.hookedId = id;
      this.scene.add(this.hooked);
      this.subGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      this.subLine = new THREE.Line(this.subGeo, new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.7 }));
      this.subLine.frustumCulled = false;
      this.scene.add(this.subLine);
      this.bubbles = Array.from({ length: 6 }, (_, i) => { const b = new THREE.Mesh(BUBBLE_GEO, BUBBLE_MAT); b.userData.k = i / 6; this.scene.add(b); return b; });
    }
    const fight = d.ph === 'fight';
    const te = d.te ?? 0.3;
    const f = this.hooked;
    // hướng kéo: từ cần thủ ra phao
    const dx = bob.x - this.sp.x; const dz = bob.z - this.sp.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len; const uz = dz / len;
    const depth = fight ? 0.75 + (1 - (d.pr ?? 0)) * 0.35 : 0.9;
    const wob = fight ? (0.12 + te * 0.25) : 0.05;
    f.position.set(bob.x + ux * 0.6 + Math.sin(t * 6.3 + this.slot) * wob, -depth + Math.sin(t * 4.1) * wob * 0.6, bob.z + uz * 0.6 + Math.cos(t * 5.2) * wob);
    f.rotation.set(fight ? Math.sin(t * 9) * 0.25 * te : 0, Math.atan2(uz, -ux) + Math.sin(t * (fight ? 7 : 2)) * (fight ? 0.35 : 0.1), fight ? Math.sin(t * 11) * 0.15 : 0);
    if (f.userData.tail) f.userData.tail.rotation.y = Math.sin(t * (fight ? 16 + te * 18 : 5)) * (fight ? 0.7 : 0.3);
    // miệng cá (đầu hướng −x cục bộ)
    const mouth = new THREE.Vector3(-0.5 * f.scale.x * 1.2, 0, 0).applyEuler(f.rotation).add(f.position);
    const a = this.subGeo.attributes.position;
    a.setXYZ(0, bob.x, bob.y, bob.z); a.setXYZ(1, mouth.x, mouth.y, mouth.z); a.needsUpdate = true;
    for (const b of this.bubbles) {
      b.userData.k = (b.userData.k + dt * (fight ? 0.9 : 0.35)) % 1;
      const k = b.userData.k;
      b.position.set(f.position.x + Math.sin(k * 9 + b.id) * 0.15, f.position.y + k * (depth + 0.05), f.position.z + Math.cos(k * 7 + b.id) * 0.15);
      b.visible = fight || k < 0.5;
    }
    this.hookPos = f.position;
  }

  #dropFish() {
    if (!this.hooked) return;
    this.scene.remove(this.hooked, this.subLine, ...this.bubbles);
    this.subGeo.dispose();
    this.hooked = null; this.hookedId = null; this.bubbles = [];
  }

  dispose() {
    this.#dropFish();
    this.scene.remove(this.g, this.bobber, this.line);
    this.lineGeo.dispose();
  }
}
