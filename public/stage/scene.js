// Cảnh 3D: trời, hồ (shader sóng), bờ & cầu câu, đảo/núi xa, cá bơi (InstancedMesh), Boss, thời tiết, hạt hiệu ứng.
// Tối ưu: hình học/vật liệu dùng chung, cá trang trí 1 draw call, hạt 1 draw call/loại, bóng chỉ cho vùng cầu câu.
import * as THREE from '/vendor/three/three.module.js';
import { buildZones, zoneOrigin } from './zones.js';

export const W = 1080;
export const H = 1920;
const WATER_Y = 0;
const UW_COLOR = new THREE.Color(0x1d6672); // màu nước khi camera ở dưới mặt nước (góc 3)

// ───────── tiện ích dựng hình ─────────
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, flatShading: true, ...o });

export function hashRand(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Mô hình cá theo kiểu dáng (dùng cho cá mắc câu dưới nước, cá kéo lên, Boss). Đầu hướng −x, đuôi +x.
 * Thân tròn trơn (Lathe) tô màu theo đỉnh: lưng đậm → bụng sáng, ánh vảy nhẹ; koi có đốm. Đuôi/vây dạng tấm mỏng theo loài.
 * Hình học lưu đệm theo (kiểu dáng, màu) → nhiều cá cùng loài dùng chung.
 */
const FISH_SHAPES = {
  fish: { long: 1.3, flat: 0.56, wide: 0.36, tail: 'fork', dorsal: 0.3, belly: 0.55 },
  koi: { long: 1.35, flat: 0.5, wide: 0.42, tail: 'fan', dorsal: 0.26, belly: 0.35, spots: true },
  eel: { long: 2.4, flat: 0.3, wide: 0.26, tail: 'round', dorsal: 0.1, belly: 0.4, slim: true },
  shark: { long: 1.8, flat: 0.5, wide: 0.44, tail: 'shark', dorsal: 0.62, belly: 0.85, pointy: true },
  whale: { long: 1.7, flat: 0.78, wide: 0.78, tail: 'whale', dorsal: 0.14, belly: 0.6 },
  ray: { long: 1.0, flat: 0.22, wide: 1.5, tail: 'whip', dorsal: 0, belly: 0.7, flatBody: true }
};
const TAIL_PTS = {
  fork: [[0, 0.06], [0.44, 0.36], [0.3, 0], [0.44, -0.36], [0, -0.06]],
  fan: [[0, 0.07], [0.5, 0.4], [0.6, 0.12], [0.46, 0], [0.6, -0.12], [0.5, -0.4], [0, -0.07]],
  shark: [[0, 0.06], [0.4, 0.55], [0.32, 0.05], [0.3, -0.04], [0.24, -0.28], [0, -0.06]],
  round: [[0, 0.1], [0.3, 0.13], [0.42, 0], [0.3, -0.13], [0, -0.1]],
  whale: [[0, 0.08], [0.25, 0.45], [0.42, 0.42], [0.3, 0], [0.42, -0.42], [0.25, -0.45], [0, -0.08]]
};
const fishGeoCache = new Map();
const finMatCache = new Map();
const FISH_BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.22 });
const EYE_WHITE = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.3 });
const EYE_PUPIL = new THREE.MeshBasicMaterial({ color: 0x0b0b0b });
const finMat = (hex) => {
  if (!finMatCache.has(hex)) finMatCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }));
  return finMatCache.get(hex);
};
const shapeGeo = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); return new THREE.ShapeGeometry(s); };

function fishGeometry(shape, color) {
  const S = FISH_SHAPES[shape] ?? FISH_SHAPES.fish;
  const base = new THREE.Color(color);
  const back = base.clone().multiplyScalar(0.5);
  const belly = base.clone().lerp(new THREE.Color(0xffffff), S.belly);
  let body;
  if (S.flatBody) body = new THREE.SphereGeometry(0.5, 18, 10).scale(S.long, S.flat, S.wide);
  else {
    // mặt cắt dọc thân: mũi tròn (hoặc nhọn với cá mập), phình ở 1/3 đầu, thon về cuống đuôi
    const pts = [];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let r = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.12 + 0.02)), S.pointy ? 1.1 : 0.75) * (1 - 0.62 * t);
      if (S.slim) r = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.03)), 0.5) * (1 - 0.3 * t);
      pts.push(new THREE.Vector2(Math.max(0.012, r * 0.5), (0.5 - t) * S.long));
    }
    body = new THREE.LatheGeometry(pts, 16).rotateZ(Math.PI / 2).scale(1, S.flat, S.wide);
  }
  // màu theo đỉnh
  const pos = body.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const ny = Math.max(-1, Math.min(1, y / (0.5 * S.flat)));
    if (ny > 0) c.copy(base).lerp(back, Math.pow(ny, 0.8)); else c.copy(base).lerp(belly, Math.pow(-ny, 0.7));
    const shimmer = 0.94 + 0.06 * Math.sin(x * 38) * Math.sin(z * 31 + y * 17); // ánh vảy
    c.multiplyScalar(shimmer);
    if (S.spots && Math.sin(x * 7.3 + 1.1) * Math.sin(z * 8.9 + 0.4) * Math.cos(y * 6.1 - x * 2.3) > 0.18) c.setHex(0xfff6ea);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  body.computeVertexNormals();
  const g = { body, S, finHex: base.clone().multiplyScalar(0.72).getHex() };
  if (S.tail === 'whip') g.tail = new THREE.CylinderGeometry(0.015, 0.035, 1.1, 5).rotateZ(Math.PI / 2).translate(0.55, 0, 0);
  else { g.tail = shapeGeo(TAIL_PTS[S.tail]); if (S.tail === 'whale') g.tail.rotateX(Math.PI / 2); }
  if (S.dorsal > 0) g.dorsal = shapeGeo([[-0.28, 0], [-0.02, S.dorsal], [0.1, S.dorsal * 0.75], [0.26, 0]]);
  g.pect = new THREE.CircleGeometry(0.16, 8).scale(1.4, 0.6, 1);
  g.eyeW = new THREE.SphereGeometry(0.075, 10, 8);
  g.eyeP = new THREE.SphereGeometry(0.042, 8, 6);
  return g;
}

export function makeFish(shape, color, scale = 1) {
  const g = new THREE.Group();
  if (shape === 'chest') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), mat(0x8a5a2a)); g.add(b);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8, 1, false, 0, Math.PI), mat(0xc8902a, { metalness: 0.5, roughness: 0.4 })); l.rotation.z = Math.PI / 2; l.rotation.y = Math.PI / 2; l.position.y = 0.35; g.add(l);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 })); gl.position.y = 0.4; g.add(gl);
    g.scale.setScalar(scale);
    return g;
  }
  const key = `${shape}:${new THREE.Color(color).getHexString()}`;
  if (!fishGeoCache.has(key)) fishGeoCache.set(key, fishGeometry(shape, color));
  const G = fishGeoCache.get(key);
  const S = G.S;
  const fin = finMat(G.finHex);
  g.add(new THREE.Mesh(G.body, FISH_BODY_MAT));
  // đuôi: gốc ở cuống đuôi, quay quanh trục y để quẫy (Boss/anglers dùng userData.tail)
  const tailPivot = new THREE.Group();
  tailPivot.position.x = S.long * 0.5 - 0.05;
  tailPivot.add(new THREE.Mesh(G.tail, S.tail === 'whip' ? finMat(0x333333) : fin));
  g.add(tailPivot);
  g.userData.tail = tailPivot;
  if (G.dorsal) { const d = new THREE.Mesh(G.dorsal, fin); d.position.set(0, S.flat * 0.45, 0); g.add(d); }
  if (!S.flatBody) {
    for (const z of [-1, 1]) {
      const p = new THREE.Mesh(G.pect, fin);
      p.position.set(-S.long * 0.16, -S.flat * 0.18, z * S.wide * 0.45);
      p.rotation.set(Math.PI / 2 + z * 0.5, z * 0.4, -0.5);
      g.add(p);
    }
  }
  const ex = -S.long * (S.flatBody ? 0.3 : 0.34); const ey = S.flat * (S.flatBody ? 0.35 : 0.14);
  const ez = S.flatBody ? 0.22 : S.wide * 0.34;
  for (const z of [-1, 1]) {
    const w = new THREE.Mesh(G.eyeW, EYE_WHITE); w.position.set(ex, ey, z * ez); g.add(w);
    const p = new THREE.Mesh(G.eyeP, EYE_PUPIL); p.position.set(ex - 0.03, ey + 0.005, z * (ez + 0.045)); g.add(p);
  }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ───────── shader nước ─────────
const waterVert = `
uniform float uTime;
varying vec3 vWorld; varying vec3 vNormal2; varying float vWave;
float wave(vec2 p, vec2 d, float f, float a, float s) { return a * sin(dot(p, d) * f + uTime * s); }
float height(vec2 p) {
  return wave(p, normalize(vec2(1.0, 0.3)), 0.35, 0.12, 1.3) + wave(p, normalize(vec2(-0.4, 1.0)), 0.55, 0.07, 1.9)
       + wave(p, normalize(vec2(0.7, -0.8)), 1.3, 0.03, 2.7) + wave(p, normalize(vec2(-1.0, -0.2)), 2.1, 0.015, 3.5);
}
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float h = height(wp.xz);
  wp.y += h;
  float e = 0.08;
  float hx = height(wp.xz + vec2(e, 0.0)) - h; float hz = height(wp.xz + vec2(0.0, e)) - h;
  vNormal2 = normalize(vec3(-hx / e, 1.0, -hz / e));
  vWorld = wp.xyz; vWave = h;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const waterFrag = `
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uTime; uniform vec3 uCam;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uGlow;
varying vec3 vWorld; varying vec3 vNormal2; varying float vWave;
void main() {
  vec3 V = normalize(uCam - vWorld);
  vec3 N = normalize(vNormal2 + vec3(0.04 * sin(vWorld.x * 3.1 + uTime * 2.0), 0.0, 0.04 * cos(vWorld.z * 2.7 + uTime * 1.7)));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float depthT = smoothstep(4.0, 40.0, length(vWorld.xz - vec2(0.0, 6.0)));
  vec3 base = mix(uShallow, uDeep, depthT);
  vec3 col = mix(base, uSky, clamp(fres * 0.85, 0.0, 0.85));
  vec3 R = reflect(-uSunDir, N);
  float spec = pow(max(dot(R, V), 0.0), 120.0);
  col += uSun * spec * 1.6;
  col += vec3(0.9, 0.95, 1.0) * smoothstep(0.1, 0.18, vWave) * 0.25;
  col += uGlow * vec3(1.0, 0.8, 0.3) * 0.12;
  float d = length(uCam - vWorld);
  float f = smoothstep(uFogNear, uFogFar, d);
  gl_FragColor = vec4(mix(col, uFogColor, f), 0.9 - fres * 0.15);
}`;

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform float uStars; uniform float uTime;
varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
void main(){
  float y = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(y, 0.55));
  float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  col += uSunCol * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25);
  if (uStars > 0.0) { vec3 q = floor(vDir * 300.0); float st = step(0.997, h(q)) * y; col += vec3(st) * uStars * (0.6 + 0.4 * sin(uTime * 3.0 + h(q) * 20.0)); }
  gl_FragColor = vec4(col, 1.0);
}`;

const WEATHER = {
  clear: { top: 0x3b7fd8, horizon: 0xbfe3ff, sun: 0xfff2d0, deep: 0x0d4a6e, shallow: 0x2aa3a8, fog: 0xbfdcef, hemi: 1.0, dir: 1.6, stars: 0 },
  rain: { top: 0x4a5a6c, horizon: 0x9aa7b4, sun: 0x8899aa, deep: 0x163c50, shallow: 0x3b7a82, fog: 0x8e9aa6, hemi: 0.75, dir: 0.6, stars: 0 },
  storm: { top: 0x1f2633, horizon: 0x56606e, sun: 0x556677, deep: 0x0c2433, shallow: 0x24525a, fog: 0x4d5764, hemi: 0.55, dir: 0.4, stars: 0 },
  night: { top: 0x050b24, horizon: 0x223366, sun: 0xb8d0ff, deep: 0x061a2e, shallow: 0x123c55, fog: 0x1a2748, hemi: 0.45, dir: 0.55, stars: 1 },
  golden: { top: 0x5a6fc0, horizon: 0xffc48a, sun: 0xffb060, deep: 0x16405e, shallow: 0x3a8f8a, fog: 0xf0c8a0, hemi: 0.95, dir: 1.5, stars: 0 }
};

export class Scene3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 600);
    // Góc 1 (tổng quan): từ trên cao, nhìn xuống cầu câu — thấy mọi cần thủ (stage dọc 1080×1920).
    this.camBase = new THREE.Vector3(0, 30, 8);
    this.camLook = new THREE.Vector3(0, 0, -7);
    this.shot = null; // góc mục tiêu do main.js đặt (cận cảnh); null = tổng quan
    this.zoneOrigin = new THREE.Vector3(); // gốc của khu đang lên hình (camera/nắng/Boss tính theo gốc này)
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLook);
    this.clock = 0;
    this.weather = 'clear';
    this.wcur = { ...WEATHER.clear };
    this.focus = null; // {pos, until}
    this.shake = 0;
    this.#lights();
    this.#sky();
    this.#water();
    this.#land();
    buildZones(this.scene); // các khu câu khác trên bản đồ rộng (ADR-0026)
    this.#decoFish();
    this.#particles();
    this.#rain();
    this.ripples = [];
    this.flying = []; // cá bay lên
    this.boss = null;
  }

  #lights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a5a2a, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    this.sun.position.set(-18, 26, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 20; sc.bottom = -20; sc.near = 5; sc.far = 90;
    this.sun.target.position.set(0, 0, -3);
    this.scene.add(this.sun, this.sun.target);
    this.flash = new THREE.PointLight(0xccddff, 0, 200);
    this.flash.position.set(0, 40, -40);
    this.scene.add(this.flash);
  }

  #sky() {
    this.skyU = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(-0.5, 0.45, -1) }, uStars: { value: 0 }, uTime: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(sky);
    this.sky = sky;
    this.scene.fog = new THREE.Fog(0xbfdcef, 60, 260);
    // mặt trăng (hiện khi đêm)
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f1d8, fog: false }));
    this.moon.position.set(40, 90, -260);
    this.moon.visible = false;
    this.scene.add(this.moon);
  }

  #water() {
    this.waterU = {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(-0.5, 0.6, 0.4).normalize() }, uCam: { value: this.camera.position }, uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 60 }, uFogFar: { value: 260 }, uGlow: { value: 0 }
    };
    const geo = new THREE.PlaneGeometry(420, 420, 180, 180).rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.waterU, vertexShader: waterVert, fragmentShader: waterFrag, transparent: true, side: THREE.DoubleSide }));
    this.water.position.set(0, WATER_Y, -150);
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    // đáy hồ (cho cá trang trí có nền)
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(200, 120).rotateX(-Math.PI / 2), mat(0x1d4a40));
    bed.position.set(0, -3.2, -40);
    this.scene.add(bed);
  }

  #land() {
    const r = hashRand(11);
    // bờ phía trước (gần camera)
    const shoreGeo = new THREE.PlaneGeometry(120, 30, 60, 15).rotateX(-Math.PI / 2);
    const pos = shoreGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setY(i, 0.35 + Math.max(0, z) * 0.05 + (r() - 0.5) * 0.18 - (z < -8 ? (-8 - z) * 0.4 : 0));
    }
    shoreGeo.computeVertexNormals();
    const shore = new THREE.Mesh(shoreGeo, mat(0x5f9a3a));
    shore.position.set(0, 0, 25);
    shore.receiveShadow = true;
    this.scene.add(shore);
    // dải cát
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(120, 4).rotateX(-Math.PI / 2), mat(0xd8c08a));
    sand.position.set(0, 0.12, 12.4);
    sand.receiveShadow = true;
    this.scene.add(sand);
    // cầu câu gỗ: một cầu dài vươn ra hồ (hợp khung dọc), cần thủ đứng hai bên (anglers.js slotPos)
    const m = new THREE.Matrix4();
    const plank = new THREE.BoxGeometry(2.6, 0.14, 0.55);
    const wood = mat(0x9b6b3d);
    const NP = 62;
    const dock = new THREE.InstancedMesh(plank, wood, NP);
    for (let i = 0; i < NP; i++) { m.makeRotationY((r() - 0.5) * 0.03); m.setPosition((r() - 0.5) * 0.05, 0.42, 13 - i * 0.56); dock.setMatrixAt(i, m); dock.setColorAt(i, new THREE.Color(0x9b6b3d).multiplyScalar(0.85 + r() * 0.3)); }
    dock.receiveShadow = true; dock.castShadow = true;
    const NPOST = 24;
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.15, 2.6, 6), mat(0x6b4526), NPOST);
    for (let i = 0; i < NPOST; i++) { m.makeTranslation(i % 2 ? 1.25 : -1.25, -0.6, 12 - Math.floor(i / 2) * 2.95); post.setMatrixAt(i, m); }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 34), mat(0x7b5534));
    this.scene.add(dock, post);
    for (const x of [-1.27, 1.27]) { const rr = rail.clone(); rr.position.set(x, 0.62, -4); this.scene.add(rr); }
    // cây, đá, lau sậy
    const trunk = new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6);
    const crown = new THREE.ConeGeometry(1.2, 2.8, 7);
    const crown2 = new THREE.IcosahedronGeometry(1.3, 0);
    const tMat = mat(0x6b4a2a); const gMat = mat(0x2f7a3a); const g2Mat = mat(0x4f9a3a);
    const addTree = (x, z, s, round) => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(trunk, tMat); t.position.y = 0.8; g.add(t);
      const c = new THREE.Mesh(round ? crown2 : crown, round ? g2Mat : gMat); c.position.y = round ? 2.4 : 2.7; g.add(c);
      g.position.set(x, 0.3, z); g.scale.setScalar(s);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(g);
    };
    for (let i = 0; i < 26; i++) { const side = i % 2 ? 1 : -1; addTree(side * (5 + r() * 30), 15 + r() * 12, 0.8 + r() * 0.9, r() < 0.4); }
    const rock = new THREE.DodecahedronGeometry(0.6, 0);
    const rMat = mat(0x8a8f94);
    for (let i = 0; i < 18; i++) { const k = new THREE.Mesh(rock, rMat); k.position.set((r() < 0.5 ? -1 : 1) * (2.5 + r() * 25), 0.15, 12 + r() * 3); k.scale.set(0.6 + r(), 0.4 + r() * 0.5, 0.6 + r()); k.rotation.y = r() * 6; k.castShadow = true; this.scene.add(k); }
    const reedGeo = new THREE.ConeGeometry(0.05, 1.6, 3);
    const reeds = new THREE.InstancedMesh(reedGeo, mat(0x7a9a3a), 260);
    for (let i = 0; i < 260; i++) { const side = r() < 0.5 ? -1 : 1; m.makeRotationZ((r() - 0.5) * 0.4); m.setPosition(side * (2 + r() * 40), 0.6, 11 + r() * 2.5); reeds.setMatrixAt(i, m); }
    this.scene.add(reeds);
    this.reeds = reeds;
    // đảo & núi xa
    const isl = (x, z, s, c) => {
      const g = new THREE.Mesh(new THREE.ConeGeometry(6 * s, 2.4 * s, 9), mat(c)); g.position.set(x, 0.2, z); g.scale.y = 0.6; this.scene.add(g);
      for (let i = 0; i < 4 + s * 3; i++) addTree(x + (r() - 0.5) * 7 * s, z + (r() - 0.5) * 4 * s, 0.9 + r() * 0.7, r() < 0.5);
    };
    isl(-24, -46, 1.4, 0x5d8a3a); isl(30, -70, 1.8, 0x557f36); isl(-6, -95, 1.2, 0x4f7a34);
    const mtn = new THREE.ConeGeometry(30, 34, 6);
    for (let i = 0; i < 9; i++) {
      const k = new THREE.Mesh(mtn, mat(i % 2 ? 0x5b7a8e : 0x6c8c9c)); k.position.set(-150 + i * 38 + r() * 12, 8 + r() * 6, -210 - r() * 40); k.scale.setScalar(0.7 + r() * 0.8); this.scene.add(k);
    }
    // cột đèn lồng cho đêm
    this.lanterns = [];
    for (const zz of [10, 2, -6, -14]) {
      const x = 1.32;
      const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), mat(0x3a2a1a)); lp.position.set(x, 1.5, zz); this.scene.add(lp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc86a })); bulb.position.set(x, 2.8, zz); this.scene.add(bulb);
      const pl = new THREE.PointLight(0xffb060, 0, 9); pl.position.copy(bulb.position); this.scene.add(pl);
      this.lanterns.push(pl);
    }
  }

  #decoFish() {
    const geo = new THREE.SphereGeometry(0.5, 7, 5).scale(1.6, 0.5, 0.45);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true, transparent: true, opacity: 0.85 });
    this.deco = new THREE.InstancedMesh(geo, m, 90);
    this.deco.renderOrder = 1;
    const r = hashRand(5);
    const cols = [0xd08a3c, 0x9fb3c8, 0x8a9a5b, 0xffcc33, 0x6d7d8c, 0xe05a5a, 0xc9cfd6];
    this.decoState = [];
    for (let i = 0; i < 90; i++) {
      this.deco.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      this.decoState.push({ cx: (r() - 0.5) * 22, cz: 6 - r() * 40, rad: 2 + r() * 7, sp: (0.2 + r() * 0.5) * (r() < 0.5 ? -1 : 1), ph: r() * 6.28, y: -0.6 - r() * 1.8, s: 0.6 + r() * 0.9 });
    }
    this.scene.add(this.deco);
    this.decoTarget = null; // cá kéo về phía bobber khi cắn
  }

  #particles() {
    const N = 1500;
    this.pN = N;
    this.pPos = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pNext = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);
    for (let i = 0; i < N; i++) this.pPos[i * 3 + 1] = -999;
  }

  /** Phát hạt: kind splash | sparkle | confetti | gold. */
  burst(pos, kind = 'splash', n = 30, color = 0xffffff) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.pNext; this.pNext = (this.pNext + 1) % this.pN;
      this.pPos[i * 3] = pos.x + (Math.random() - 0.5) * 0.4; this.pPos[i * 3 + 1] = pos.y + 0.05; this.pPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.4;
      const a = Math.random() * Math.PI * 2; const sp = kind === 'splash' ? 1.5 + Math.random() * 2 : 2 + Math.random() * 4;
      this.pVel[i * 3] = Math.cos(a) * sp * (kind === 'splash' ? 0.5 : 1); this.pVel[i * 3 + 1] = (kind === 'splash' ? 3 : 4) + Math.random() * 4; this.pVel[i * 3 + 2] = Math.sin(a) * sp * (kind === 'splash' ? 0.5 : 1);
      this.pLife[i] = kind === 'splash' ? 0.8 + Math.random() * 0.4 : 1.4 + Math.random() * 0.8;
      const cc = kind === 'confetti' ? new THREE.Color().setHSL(Math.random(), 0.9, 0.6) : kind === 'splash' ? new THREE.Color(0xdff4ff) : c;
      this.pCol[i * 3] = cc.r; this.pCol[i * 3 + 1] = cc.g; this.pCol[i * 3 + 2] = cc.b;
    }
  }

  #rain() {
    const N = 2200;
    this.rainPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.rainPos[i * 3] = (Math.random() - 0.5) * 60; this.rainPos[i * 3 + 1] = Math.random() * 30; this.rainPos[i * 3 + 2] = 18 - Math.random() * 60; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaac4dd, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    // đom đóm (đêm)
    const F = 120;
    this.ffPos = new Float32Array(F * 3);
    this.ffSeed = new Float32Array(F);
    for (let i = 0; i < F; i++) { this.ffPos[i * 3] = (Math.random() - 0.5) * 50; this.ffPos[i * 3 + 1] = 0.6 + Math.random() * 3; this.ffPos[i * 3 + 2] = 12 - Math.random() * 30; this.ffSeed[i] = Math.random() * 100; }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.ffPos, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xfff08a, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fireflies.visible = false;
    this.scene.add(this.fireflies);
  }

  ripple(pos, color = 0xffffff, maxR = 1.6) {
    let r = this.ripples.find((x) => !x.mesh.visible);
    if (!r) {
      if (this.ripples.length >= 40) return;
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      r = { mesh };
      this.ripples.push(r);
    }
    r.mesh.visible = true; r.mesh.material.color.set(color); r.mesh.position.set(pos.x, WATER_Y + 0.06, pos.z); r.t = 0; r.max = maxR;
  }

  /** Cá bay từ mặt nước về tay cần thủ (hiệu ứng bắt cá). */
  flyFish(from, to, species, rarityColor) {
    const big = species.tier >= 5 ? 1.25 : species.tier >= 3 ? 0.95 : 0.7;
    const fish = makeFish(species.shape, species.color, big * (species.shape === 'whale' ? 0.8 : 1));
    fish.position.copy(from);
    this.scene.add(fish);
    let glow = null;
    if (species.tier >= 3) {
      glow = new THREE.Mesh(new THREE.SphereGeometry(1.1 * big, 12, 8), new THREE.MeshBasicMaterial({ color: rarityColor, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
      fish.add(glow);
    }
    this.flying.push({ obj: fish, from: from.clone(), to: to.clone(), t: 0, dur: 1.3, hold: species.tier >= 4 ? 1.6 : 0.9, color: rarityColor, tier: species.tier });
    this.burst(from, 'splash', 40);
    this.ripple(from, 0xffffff, 2.5);
  }

  // ───────── Boss ─────────
  bossShow(level) {
    if (this.boss) return;
    const gold = level >= 5;
    const g = makeFish('whale', gold ? 0xffcf3a : 0x6a2fa0, 4.2);
    g.rotation.y = Math.PI / 2;
    // vật liệu riêng có phát sáng để Boss nổi bật cả ban đêm/bão
    g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(gold ? 0x7a5200 : 0x3a0a6a); o.material.emissiveIntensity = 0.9; } });
    const eyeGlow = new THREE.PointLight(level >= 5 ? 0xffe28a : 0xff3355, 3, 30);
    eyeGlow.position.set(-4, 2, 0);
    g.add(eyeGlow);
    g.position.set(this.zoneOrigin.x - 3.8, -6, this.zoneOrigin.z - 13);
    this.scene.add(g);
    this.boss = { g, t: 0, hpFrac: 1, hit: 0, leaving: 0 };
    this.shake = 0.6;
    for (let i = 0; i < 6; i++) setTimeout(() => this.ripple(new THREE.Vector3(-3.8 + (Math.random() - 0.5) * 6, 0, -13 + (Math.random() - 0.5) * 5), 0xffffff, 6), i * 220);
  }
  bossHit(frac) {
    if (!this.boss) return;
    this.boss.hpFrac = frac; this.boss.hit = 0.25;
    const p = this.boss.g.position.clone(); p.y = 0.5;
    this.burst(p.add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 3)), 'sparkle', 18, 0xff8844);
  }
  bossLeave(killed) {
    if (!this.boss) return;
    this.boss.leaving = killed ? 1 : -1;
    const p = this.boss.g.position.clone(); p.y = 1;
    if (killed) { this.burst(p, 'confetti', 220); this.burst(p, 'gold', 120, 0xffd84a); this.shake = 0.8; }
  }

  setWeather(w, golden = false) {
    this.weather = golden && w === 'clear' ? 'golden' : w;
  }

  /**
   * Chuyển khu (ADR-0026): đổi gốc camera/nắng/Boss. cut=true → camera nhảy thẳng tới góc tổng quan của khu mới
   * (cắt cảnh, không bay qua bản đồ).
   */
  setZone(id, { cut = true } = {}) {
    const o = zoneOrigin(id);
    this.zoneOrigin.copy(o);
    this.sun.position.set(-18 + o.x, 26, 14 + o.z);
    this.sun.target.position.set(o.x, 0, o.z - 3);
    this.shot = null;
    if (cut) {
      this.camera.position.copy(this.camBase).add(o);
      this.curLook = this.camLook.clone().add(o);
      this.camera.lookAt(this.curLook);
      this.focus = null;
    }
  }

  /** Đặt góc camera mục tiêu: {pos, look} (Vector3) hoặc null để về góc tổng quan mặc định. */
  setShot(shot, { cut = false } = {}) {
    this.shot = shot ? { pos: shot.pos.clone(), look: shot.look.clone() } : null;
    if (cut && shot) { // cắt cảnh: nhảy thẳng, không trượt qua mặt nước
      this.camera.position.copy(shot.pos);
      this.curLook = shot.look.clone();
      this.camera.lookAt(this.curLook);
    }
  }

  focusOn(pos, ms = 2500) { this.focus = { pos: pos.clone(), until: performance.now() + ms }; }

  /** Cập nhật mỗi khung (dt giây). */
  update(dt) {
    this.clock += dt;
    const t = this.clock;
    this.waterU.uTime.value = t;
    this.skyU.uTime.value = t;
    // nội suy màu thời tiết
    const target = WEATHER[this.weather] || WEATHER.clear;
    const k = Math.min(1, dt * 0.8);
    for (const key of ['top', 'horizon', 'sun', 'deep', 'shallow', 'fog']) {
      const a = new THREE.Color(this.wcur[key]); a.lerp(new THREE.Color(target[key]), k); this.wcur[key] = a.getHex();
    }
    for (const key of ['hemi', 'dir', 'stars']) this.wcur[key] += (target[key] - this.wcur[key]) * k;
    this.skyU.uTop.value.set(this.wcur.top); this.skyU.uHorizon.value.set(this.wcur.horizon); this.skyU.uSunCol.value.set(this.wcur.sun); this.skyU.uStars.value = this.wcur.stars;
    this.waterU.uDeep.value.set(this.wcur.deep); this.waterU.uShallow.value.set(this.wcur.shallow); this.waterU.uSky.value.set(this.wcur.horizon); this.waterU.uSun.value.set(this.wcur.sun);
    this.waterU.uFogColor.value.set(this.wcur.fog); this.scene.fog.color.set(this.wcur.fog);
    this.waterU.uGlow.value = this.weather === 'golden' ? 1 : 0;
    this.hemi.intensity = this.wcur.hemi; this.sun.intensity = this.wcur.dir;
    const night = this.wcur.stars;
    this.moon.visible = night > 0.3;
    for (const l of this.lanterns) l.intensity = night * 6;
    this.rain.visible = this.weather === 'rain' || this.weather === 'storm';
    this.fireflies.visible = night > 0.5;
    if (this.rain.visible) {
      const fall = this.weather === 'storm' ? 34 : 24;
      for (let i = 0; i < this.rainPos.length; i += 3) { this.rainPos[i + 1] -= fall * dt; this.rainPos[i] += (this.weather === 'storm' ? -6 : -1) * dt; if (this.rainPos[i + 1] < 0) { this.rainPos[i + 1] = 25 + Math.random() * 5; this.rainPos[i] = (Math.random() - 0.5) * 60; if (Math.random() < 0.02) this.ripple({ x: this.rainPos[i], z: this.rainPos[i + 2] }, 0xcfe3f5, 0.6); } }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.weather === 'storm' && Math.random() < dt * 0.12) { this.flash.intensity = 900; this.lightningAt = t; this.onLightning?.(); }
    this.flash.intensity *= Math.pow(0.02, dt);
    if (this.fireflies.visible) {
      for (let i = 0; i < this.ffSeed.length; i++) { const s = this.ffSeed[i]; this.ffPos[i * 3] += Math.sin(t * 0.7 + s) * dt * 0.4; this.ffPos[i * 3 + 1] = 0.8 + Math.sin(t * 0.9 + s * 2) * 0.8 + 1; }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      this.fireflies.material.opacity = 0.5 + 0.4 * Math.sin(t * 3);
    }
    // cá trang trí
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const v = new THREE.Vector3(); const s = new THREE.Vector3();
    this.decoState.forEach((f, i) => {
      const a = f.ph + t * f.sp;
      v.set(f.cx + Math.cos(a) * f.rad, f.y + Math.sin(t * 2 + i) * 0.08, f.cz + Math.sin(a) * f.rad);
      e.set(0, -a + (f.sp > 0 ? 0 : Math.PI) + Math.sin(t * 6 + i) * 0.15, 0);
      q.setFromEuler(e); s.setScalar(f.s);
      m.compose(v, q, s);
      this.deco.setMatrixAt(i, m);
    });
    this.deco.instanceMatrix.needsUpdate = true;
    // hạt
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -999; continue; }
      this.pVel[i * 3 + 1] -= 9.8 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pPos[i * 3 + 1] < -0.2) this.pLife[i] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    // gợn nước
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const p = r.t / 1.2;
      if (p >= 1) { r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(0.2 + p * r.max);
      r.mesh.material.opacity = 0.7 * (1 - p);
    }
    // cá bay
    this.flying = this.flying.filter((f) => {
      f.t += dt;
      const p = Math.min(1, f.t / f.dur);
      const ease = 1 - Math.pow(1 - p, 3);
      f.obj.position.lerpVectors(f.from, f.to, ease);
      f.obj.position.y += Math.sin(p * Math.PI) * 3.2;
      f.obj.rotation.z = Math.sin(t * 18) * 0.35 * (1 - p * 0.5);
      f.obj.rotation.y = Math.PI / 2 + Math.sin(t * 9) * 0.2;
      if (f.obj.userData.tail) f.obj.userData.tail.rotation.y = Math.sin(t * 30) * 0.6;
      if (p >= 1 && f.t > f.dur + f.hold) {
        if (f.tier >= 3) this.burst(f.obj.position, 'sparkle', 30, f.color);
        this.scene.remove(f.obj);
        return false;
      }
      if (p >= 1 && f.tier >= 4 && Math.random() < dt * 8) this.burst(f.obj.position, 'sparkle', 3, f.color);
      return true;
    });
    // Boss
    if (this.boss) {
      const b = this.boss;
      b.t += dt;
      const rise = Math.min(1, b.t / 2.5);
      let y = -6 + rise * 6.2 + Math.sin(t * 1.3) * 0.4;
      if (b.leaving) { b.leavingT = (b.leavingT || 0) + dt; y -= b.leavingT * 3; if (b.leavingT > 3) { this.scene.remove(b.g); this.boss = null; } }
      if (this.boss) {
        b.g.position.y = y;
        b.g.position.x = this.zoneOrigin.x - 3.8 + Math.sin(t * 0.35) * 0.9;
        b.g.position.z = this.zoneOrigin.z - 13;
        b.g.rotation.z = Math.sin(t * 0.9) * 0.08;
        if (b.g.userData.tail) b.g.userData.tail.rotation.y = Math.sin(t * 3) * 0.5;
        b.hit = Math.max(0, b.hit - dt);
        b.g.scale.setScalar(4.2 * (1 + b.hit * 0.25));
        if (Math.random() < dt * 1.5) this.ripple({ x: b.g.position.x + (Math.random() - 0.5) * 8, z: b.g.position.z + (Math.random() - 0.5) * 3 }, 0xffffff, 4);
      }
    }
    // camera
    const now = performance.now();
    const shot = this.shot ?? { pos: this.camBase.clone().add(this.zoneOrigin), look: this.camLook.clone().add(this.zoneOrigin) };
    const cam = shot.pos.clone();
    const look = shot.look.clone();
    if (!this.shot) { cam.x += Math.sin(t * 0.13) * 0.8; cam.y += Math.sin(t * 0.21) * 0.25; } // lắc nhẹ chỉ ở góc tổng quan
    if (this.boss) { cam.z -= 1; cam.x -= 0.8; look.x -= 1; }
    if (this.focus && now < this.focus.until) { cam.lerp(new THREE.Vector3(this.focus.pos.x * 0.5, 6, this.focus.pos.z + 12), 0.4); look.lerp(this.focus.pos, 0.45); }
    this.shake = Math.max(0, this.shake - dt * 0.6);
    if (this.shake > 0) { cam.x += (Math.random() - 0.5) * this.shake * 0.6; cam.y += (Math.random() - 0.5) * this.shake * 0.6; }
    this.camera.position.lerp(cam, Math.min(1, dt * 1.6));
    this.curLook ??= look.clone();
    this.curLook.lerp(look, Math.min(1, dt * 1.6));
    this.camera.lookAt(this.curLook);
    // Dưới mặt nước (góc 3): sương xanh dày, nhìn gần → cảm giác nước; trên mặt nước trả lại sương thường.
    this.underwater = this.camera.position.y < WATER_Y - 0.02;
    const uw = this.underwater;
    if (uw) {
      this.scene.fog.color.setHex(0x1d6672); this.scene.fog.near = 0.5; this.scene.fog.far = 16;
      this.waterU.uFogColor.value.setHex(0x1d6672); this.waterU.uFogNear.value = 0.5; this.waterU.uFogFar.value = 16;
    } else {
      this.scene.fog.near = 60; this.scene.fog.far = 260; this.waterU.uFogNear.value = 60; this.waterU.uFogFar.value = 260;
    }
    this.scene.background = uw ? UW_COLOR : null;
    this.sky.visible = !uw;                 // dưới nước không thấy trời
    this.points.visible = !uw;              // bọt bắn trên mặt nước nhìn từ dưới thành ô vuông lớn → ẩn
    if (this.rain) this.rain.visible = this.rain.visible && !uw;
  }

  render() { this.renderer.render(this.scene, this.camera); }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, visible: p.z < 1 };
  }
}

export { THREE };
