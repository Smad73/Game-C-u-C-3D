// Stage: nhận trạng thái có thẩm quyền từ server (WS /ws?role=stage) và CHỈ vẽ. Không có logic gameplay ở client.
// Chữ/hiệu ứng/âm thanh của banner gắn vào lúc banner thật sự hiện (hàng đợi ưu tiên, có huỷ, có trần thời gian).
import { Scene3D, THREE, W, H } from './scene.js';
import { Angler, slotPos, setSpeciesCatalog } from './anglers.js';
import { pickShot } from './shotPicker.js';
import { loadCharacters } from './characters.js';
import { zoneOrigin } from './zones.js';
import { applyLayout, MusicPlayer } from './overlay.js';
import { AudioEngine } from './audio.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const TARGET_FPS = Number(params.get('fps')) || 30;
const PREVIEW = params.get('mute') === '1'; // xem trước trong Control: không phát âm, không gửi báo cáo stage (không che số đo của máy phát)
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

let catalog = null; let speciesById = new Map(); let rarity = new Map();
let config = { lbRotateSec: 12, lbPageSec: 4, volumes: {}, worldName: 'Hồ NOVA', showGuides: false };
const audio = new AudioEngine();
const music = new MusicPlayer(audio);

// ───────── khung 1080×1920 co giãn ─────────
const frame = $('frame');
function fit() { const s = Math.min(window.innerWidth / W, window.innerHeight / H); frame.style.transform = `scale(${s})`; }
window.addEventListener('resize', fit);
fit();

// ───────── cảnh 3D ─────────
let scene3d = null;
try { scene3d = new Scene3D($('gl')); } catch (e) { $('nogl').hidden = false; console.error(e); }
if (scene3d) scene3d.onLightning = () => audio.thunder();
const anglers = new Map(); // slot → Angler
const labels = new Map(); // slot → {root, nm, bars...}
if (params.get('debug') === '1') window.__nova = { get scene3d() { return scene3d; }, anglers }; // chỉ để chỉnh bố cục khi phát triển

function labelFor(slot) {
  let L = labels.get(slot);
  if (L) return L;
  const root = el('div', 'lab');
  const nm = el('span', 'nm');
  const lv = el('span', 'lv'); const name = el('span'); const ic = el('span', 'ic');
  nm.append(lv, name, ic);
  const bars = el('div', 'bars');
  const ten = el('div', 'bar ten'); const teni = el('i'); ten.append(teni);
  const pro = el('div', 'bar pro'); const proi = el('i'); pro.append(proi);
  bars.append(ten, pro);
  root.append(nm, bars);
  $('labels').append(root);
  L = { root, lv, name, ic, teni, proi };
  labels.set(slot, L);
  return L;
}
function popLabel(slot, text, color) {
  const L = labels.get(slot); if (!L) return;
  const p = el('span', 'pop', text); p.style.color = color;
  L.root.append(p); setTimeout(() => p.remove(), 2000);
}

function onPhase(a, ph, prev) {
  const pos = a.cast.clone();
  if (ph === 'cast') audio.play('cast');
  if (ph === 'wait' && prev === 'cast') { audio.play('plop'); scene3d.ripple(pos, 0xffffff, 1.2); }
  if (ph === 'bite') { audio.play('bite'); scene3d.ripple(pos, 0xffe680, 1.8); scene3d.burst(pos, 'splash', 10); }
  if (ph === 'result') {
    const d = a.data;
    const from = a.bobber.visible ? a.bobber.position.clone() : pos;
    if (d.res === 'caught' && d.sp) {
      const sp = speciesById.get(d.sp);
      if (sp) {
        const rc = rarity.get(sp.tier)?.color ?? '#ffffff';
        scene3d.flyFish(from, a.headWorld(), sp, new THREE.Color(rc).getHex());
        audio.play('splash');
        popLabel(a.slot, `${sp.name} ${(d.w / 1000).toFixed(d.w >= 10000 ? 0 : 1)}kg`, rc);
        if (sp.tier >= 5) scene3d.focusOn(a.g.position, 3000);
      }
    } else if (d.res === 'escaped') { scene3d.burst(from, 'splash', 25); popLabel(a.slot, 'Sổng mất!', '#ff8a8a'); audio.play('escape'); }
    else if (d.res === 'boss') { popLabel(a.slot, 'Trúng Boss!', '#ffb02e'); }
  }
}

// Nạp nhân vật VRoid một lần; cần thủ được tạo sau khi nạp xong (lỗi nạp → vẫn tạo bằng hình khối cũ).
let charsReady = false;
loadCharacters().then((n) => { charsReady = true; console.info(`[nhân vật] đã nạp ${n} mẫu VRoid`); });
// ───────── khu đang lên hình (ADR-0026): server quyết định; đổi khu = cắt cảnh nhanh ─────────
let currentZone = null;
let lastZoneAnnounced = null; // khu mới nhất server báo (feed 'zone' có thể tới trước frame)
let zoneName = '';
function switchZone(zone, name) {
  for (const a of anglers.values()) a.dispose();
  anglers.clear();
  for (const L of labels.values()) L.root.hidden = true;
  currentZone = zone; zoneName = name || zone;
  shotState = null;
  scene3d?.setZone(zone, { cut: true });
  $('sub').textContent = `${config.worldName || 'Hồ NOVA'} · ${zoneName}`;
  const c = $('cut'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); // chớp chuyển cảnh
}

function applyFrame(f) {
  if (f.zone && f.zone !== currentZone) switchZone(f.zone, f.zoneName);
  const seen = new Set();
  const now = performance.now();
  for (const d of f.anglers) {
    seen.add(d.s);
    let a = anglers.get(d.s);
    if (a && a.key !== d.k) { a.dispose(); anglers.delete(d.s); a = null; }
    if (!a && scene3d && charsReady) { a = new Angler(scene3d.scene, d.s, d, zoneOrigin(currentZone)); a.onPhase = onPhase; anglers.set(d.s, a); }
    a?.update(d, now);
    const L = labelFor(d.s);
    L.lv.textContent = `Lv${d.l}`;
    if (L.name.textContent !== d.n) L.name.textContent = d.n;
    L.ic.textContent = `${d.lk ? '🍀' : ''}${d.pw ? '💪' : ''}${d.as ? '🔥' : ''}`;
    L.root.classList.toggle('fight', d.ph === 'fight' || d.ph === 'bite');
    L.root.classList.toggle('afk', d.ph === 'afk');
    L.root.classList.toggle('far', slotPos(d.s).row >= 4);
    L.teni.style.width = `${Math.round(Math.min(1, d.te ?? 0) * 100)}%`;
    L.proi.style.width = `${Math.round((d.pr ?? 0) * 100)}%`;
    L.root.hidden = false;
  }
  for (const [slot, a] of anglers) if (!seen.has(slot)) { a.dispose(); anglers.delete(slot); }
  for (const [slot, L] of labels) if (!seen.has(slot)) L.root.hidden = true;
  activeCount = f.counts.active;
  $('active').textContent = String(f.counts.active);
  $('fpm').textContent = String(f.fpm);
  setWeather(f.weather);
  reelers = f.anglers.filter((x) => x.ph === 'fight').length;
}
let reelers = 0;
let activeCount = 0;

// ───────── thời tiết / đồng hồ ─────────
const WEATHER_TXT = { clear: ['☀️', 'Trời quang'], rain: ['🌧️', 'Mưa rào'], storm: ['⛈️', 'Bão'], night: ['🌙', 'Đêm trăng'] };
let curWeather = null; let golden = false;
function setWeather(w) {
  const key = `${w}|${golden}`;
  if (key === curWeather) return;
  curWeather = key;
  const [ic, txt] = WEATHER_TXT[w] || WEATHER_TXT.clear;
  $('weather').textContent = golden && w === 'clear' ? '🌅' : ic;
  $('weather-lbl').textContent = golden && w === 'clear' ? 'Giờ vàng' : txt;
  scene3d?.setWeather(w, golden);
  audio.setWeather(w);
}
function tickClock() {
  const d = new Date(Date.now() + 7 * 3600000);
  $('clock').textContent = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
setInterval(tickClock, 5000); tickClock();

// ───────── sự kiện / Boss ─────────
let bossState = null;
function applyEvents(e) {
  const boss = e.active.find((x) => x.kind === 'BOSS');
  const box = $('boss');
  if (boss) {
    box.hidden = false;
    box.classList.toggle('warn', boss.status === 'WARNING');
    $('boss-name').textContent = boss.status === 'WARNING' ? `⚠️ BOSS sắp xuất hiện (cấp ${boss.level})` : `🐉 BOSS cấp ${boss.level}${boss.source === 'GIFT' && boss.summonerName ? ` — ${boss.summonerName}` : ''}`;
    const left = Math.max(0, Math.round(((boss.status === 'WARNING' ? boss.warnUntilUtc : boss.endsAtUtc) - Date.now()) / 1000));
    $('boss-time').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const frac = boss.hpMax ? boss.hp / boss.hpMax : 1;
    $('boss-hp').style.width = `${Math.round(frac * 100)}%`;
    $('boss-hp-txt').textContent = boss.hpMax ? `${boss.hp.toLocaleString('vi-VN')} / ${boss.hpMax.toLocaleString('vi-VN')} HP` : 'Đang trồi lên…';
    if (boss.status === 'ACTIVE' && scene3d && !scene3d.boss) scene3d.bossShow(boss.level);
    if (boss.status === 'ACTIVE') scene3d?.bossHit(frac);
    audio.mood = 'boss';
  } else { box.hidden = true; if (audio.mood === 'boss') audio.mood = 'calm'; }
  frame.classList.toggle('boss-on', Boolean(boss && boss.status === 'ACTIVE'));
  bossState = boss || null;
  golden = e.active.some((x) => x.kind === 'GOLDEN_HOUR' && x.status === 'ACTIVE');
  const chips = $('chips');
  chips.replaceChildren();
  for (const x of e.active.filter((x) => x.kind !== 'BOSS')) {
    const left = Math.max(0, Math.round((x.endsAtUtc - Date.now()) / 1000));
    chips.append(el('span', 'chip', `${x.name} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`));
  }
  for (const x of e.queued.slice(0, 3)) chips.append(el('span', 'chip queued', `⏳ ${x.name}`));
  if (!boss && e.nextBossAtUtc) {
    const m = Math.max(0, Math.round((e.nextBossAtUtc - Date.now()) / 60000));
    chips.append(el('span', 'chip queued', `Boss tiếp theo ~${m} phút`));
  }
}

// ───────── BXH luân phiên: 5 phạm vi × TOP 10/50/100 (trang 10 dòng tự lật) ─────────
const SCOPES = [['live', 'TOP LIVE'], ['hour', 'TOP 60 phút'], ['day', 'TOP ngày'], ['week', 'TOP tuần'], ['all', 'TOP tổng']];
let top = {}; let labelsTop = {};
let lbIdx = 0; let lbSize = 10; let lbPage = 0; let lbShownAt = 0;
function renderLb() {
  const [scope, title] = SCOPES[lbIdx % SCOPES.length];
  const data = top[scope];
  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.min(lbSize / 10, Math.ceil(rows.length / 10)));
  $('lb-title').textContent = `${title}${lbSize > 10 ? ` ${lbSize}` : ''}`;
  $('lb-sub').textContent = scope === 'day' ? (labelsTop.day ?? '') : scope === 'week' ? (labelsTop.week ?? '') : `${data?.total ?? 0} người`;
  const list = $('lb-list');
  list.replaceChildren();
  const slice = rows.slice(lbPage * 10, lbPage * 10 + 10);
  if (!slice.length) list.append(el('li', 'empty', 'Chưa có ai — comment "câu" để lên bảng!'));
  for (const r of slice) {
    const li = el('li', r.r <= 3 ? `r${r.r}` : '');
    li.append(el('span', 'rk', r.r <= 3 ? ['🥇', '🥈', '🥉'][r.r - 1] : String(r.r)), el('span', 'nm', `${r.n}`), el('span', 'sc', r.s.toLocaleString('vi-VN')));
    list.append(li);
  }
  $('lb-page').textContent = pages > 1 ? `trang ${lbPage + 1}/${pages}` : '';
  return pages;
}
function lbTick() {
  const now = performance.now();
  const [scope] = SCOPES[lbIdx % SCOPES.length];
  const rows = top[scope]?.rows?.length ?? 0;
  const pages = Math.max(1, Math.min(lbSize / 10, Math.ceil(rows / 10)));
  const pageMs = config.lbPageSec * 1000;
  if (lbSize > 10 && lbPage < pages - 1 && now - lbShownAt > pageMs) { lbPage++; lbShownAt = now; renderLb(); return; }
  if (now - lbShownAt > (lbSize > 10 ? pageMs : config.lbRotateSec * 1000)) {
    lbPage = 0; lbShownAt = now;
    lbIdx++;
    if (lbIdx % SCOPES.length === 0) lbSize = lbSize === 10 ? 50 : lbSize === 50 ? 100 : 10;
    // bỏ qua bảng trống (trừ khi mọi bảng đều trống)
    for (let k = 0; k < SCOPES.length && !(top[SCOPES[lbIdx % SCOPES.length][0]]?.rows?.length) && Object.values(top).some((x) => x.rows.length); k++) lbIdx++;
    renderLb();
  }
}
setInterval(lbTick, 500);

// ───────── nguồn sự kiện: feed bên trái + banner giữa (hàng đợi ưu tiên) ─────────
const feedList = $('feed-list');
function feedLine(text, color) {
  const li = el('li', '', text);
  if (color) li.style.color = color;
  feedList.prepend(li);
  while (feedList.children.length > 9) feedList.lastChild.remove();
}
const bannerQ = [];
let bannerCur = null; let bannerTimer = null;
function banner(b) {
  // b: {prio, kicker, main, sub, cls, sfx, ms, key, zone}
  if (b.key) { // cùng key: banner mới thay banner cũ (không hiện thông tin đã lỗi thời)
    for (let i = bannerQ.length - 1; i >= 0; i--) if (bannerQ[i].key === b.key) bannerQ.splice(i, 1);
    if (bannerCur?.key === b.key) { clearTimeout(bannerTimer); showBanner(b); return; }
  }
  if (bannerCur && b.prio > bannerCur.prio + 20) { clearTimeout(bannerTimer); bannerQ.unshift(bannerCur); showBanner(b); return; } // huỷ banner kém quan trọng
  bannerQ.push(b);
  bannerQ.sort((x, y) => y.prio - x.prio);
  if (bannerQ.length > 12) bannerQ.length = 12; // trần hàng đợi: bỏ mục ít quan trọng nhất
  if (!bannerCur) nextBanner();
}
function nextBanner() {
  const b = bannerQ.shift();
  if (!b) { bannerCur = null; $('banner').hidden = true; return; }
  if (Date.now() - b.at > 20000) { nextBanner(); return; } // quá hạn: bỏ (trần thời gian)
  if (b.zone && b.zone !== lastZoneAnnounced) { nextBanner(); return; } // đã có lệnh chuyển khu mới hơn: bỏ banner khu cũ
  showBanner(b);
}
function showBanner(b) {
  bannerCur = b;
  const box = $('banner');
  box.className = `banner ${b.cls || ''}`;
  $('banner-kicker').textContent = b.kicker || '';
  $('banner-main').textContent = b.main || '';
  $('banner-sub').textContent = b.sub || '';
  box.hidden = false;
  if (b.sfx) audio.play(b.sfx, b.sfxOpt); // âm phát ĐÚNG lúc chữ hiện
  bannerTimer = setTimeout(nextBanner, b.ms || 2800);
}

const kg = (g) => (g >= 10000 ? `${Math.round(g / 1000).toLocaleString('vi-VN')} kg` : `${(g / 1000).toFixed(1)} kg`);
function onFeed(it) {
  const name = it.player?.name ?? '';
  switch (it.type) {
    case 'catch': {
      const sp = speciesById.get(it.speciesId); const r = rarity.get(it.tier);
      if (!sp) break;
      if (it.tier >= (activeCount < 100 ? 2 : activeCount < 1000 ? 3 : 4)) feedLine(`🐟 ${name}: ${sp.name} ${kg(it.weightG)} (+${it.score})`, r?.color);
      // Ngưỡng banner tự nâng theo đám đông (không để banner dồn dập khi hàng trăm người câu).
      const minTier = activeCount < 40 ? 4 : activeCount < 300 ? 5 : 6;
      if (it.tier >= minTier || (it.newDex && it.tier >= minTier - 1 && activeCount < 40)) {
        banner({ prio: 40 + it.tier * 10, at: Date.now(), cls: `t${it.tier}`, kicker: `${r?.name?.toUpperCase()}${it.newDex ? ' · LOÀI MỚI' : ''}`, main: `${name} câu được ${sp.name}!`, sub: `${kg(it.weightG)} · +${it.score} điểm · +${it.coins} xu`, sfx: 'catch', sfxOpt: { tier: it.tier }, ms: it.tier >= 5 ? 4200 : 3000 });
      } else if (anglerVisible(it.player?.key)) audio.play('catch', { tier: it.tier });
      break;
    }
    case 'escape': if (it.tier >= 4) feedLine(`💨 ${name} để sổng cá ${rarity.get(it.tier)?.name}!`, '#ff9a9a'); break;
    case 'gift': {
      feedLine(`🎁 ${name} tặng ${it.giftName ?? 'quà'} ×${it.qty}`, '#ff9ee8');
      const fx = (it.effects || []).filter((x) => !['xpcoins'].includes(x));
      // Đông người: quà nhỏ chỉ vào dòng diễn biến; quà lớn/sự kiện vẫn có banner.
      const value = it.coins || 0;
      const minValue = activeCount < 50 ? 0 : activeCount < 300 ? 10 : 50;
      if (value < minValue && !fx.includes('world_event')) { if (anglerVisible(it.player?.key)) audio.play('gift'); break; }
      banner({ prio: 70 + Math.min(20, Math.log2(1 + (it.coins || 0) * it.qty)), at: Date.now(), cls: 'gift', kicker: 'QUÀ TẶNG', main: `${name} tặng ${it.giftName ?? 'quà'} ×${it.qty}`, sub: fx.length ? fx.map(fxName).join(' · ') : 'Cảm ơn bạn!', sfx: 'gift', ms: 3000 });
      break;
    }
    case 'levelup': feedLine(`⬆️ ${name} lên cấp ${it.level}`, '#7ff6ff'); if (it.level % 5 === 0) banner({ prio: 50, at: Date.now(), kicker: 'LÊN CẤP', main: `${name} đạt cấp ${it.level}!`, sfx: 'levelup' }); else if (anglerVisible(it.player?.key)) audio.play('levelup'); break;
    case 'achievement': feedLine(`🏆 ${name}: ${it.name}`, '#ffd700'); banner({ prio: 55, at: Date.now(), kicker: 'THÀNH TÍCH', main: `${name} — ${it.name}`, sub: `+${it.reward} xu`, sfx: 'achievement' }); break;
    case 'join': if (!it.returning) feedLine(`👋 ${name} vào hồ câu`, '#a9d4ff'); else feedLine(`🔁 ${name} quay lại`, '#a9d4ff'); break;
    case 'welcome': feedLine(`✨ Chào mừng ${name} (Lv${it.player.level})`, '#a9d4ff'); break;
    case 'daily': feedLine(`📅 ${name} điểm danh ngày ${it.streak} (+${it.coins} xu)`, '#9ef0a0'); banner({ prio: 30, at: Date.now(), kicker: 'ĐIỂM DANH', main: `${name} — chuỗi ${it.streak} ngày`, sub: `+${it.coins} xu · +${it.xp} XP`, sfx: 'notify', ms: 2200 }); break;
    case 'upgrade': feedLine(`🔧 ${name} nâng ${slotName(it.slot)} lên cấp ${it.level}`, '#ffe680'); banner({ prio: 35, at: Date.now(), kicker: 'NÂNG CẤP', main: `${name}: ${slotName(it.slot)} cấp ${it.level}`, sub: `-${it.cost} xu`, sfx: 'notify', ms: 2200 }); break;
    case 'follow': feedLine(`➕ ${name} theo dõi (+${it.coins} xu)`, '#9ef0a0'); break;
    case 'share': feedLine(`🔗 ${name} chia sẻ (+${it.coins} xu)`, '#9ef0a0'); break;
    case 'notice': feedLine(`ℹ️ ${name}: ${it.text}`, '#cfd8e3'); break;
    case 'zone':
      lastZoneAnnounced = it.zone;
      feedLine(`📍 Camera sang ${it.name}${it.reason === 'gift' && name ? ` — quà của ${name}` : ''}`, '#ffd37a');
      banner({ prio: 55, at: Date.now(), key: 'zone', zone: it.zone, kicker: '📍 CHUYỂN KHU', main: it.name, sub: it.reason === 'gift' && name ? `Quà của ${name}` : 'Khu đang sôi động', sfx: 'notify', ms: 2000 });
      break;
    case 'zone_move': feedLine(`🚶 ${name} sang ${it.name}`, '#a9d4ff'); break;
    case 'card': showCard(it); break;
    case 'boss_warning': audio.play('warning'); banner({ prio: 100, at: Date.now(), cls: 'boss', kicker: 'CẢNH BÁO', main: `BOSS cấp ${it.level} sắp xuất hiện!`, sub: it.source === 'GIFT' ? 'Được triệu hồi bằng quà' : 'Chuẩn bị cần câu!', ms: 3500 }); break;
    case 'boss_start': banner({ prio: 100, at: Date.now(), cls: 'boss', kicker: 'BOSS XUẤT HIỆN', main: 'Cả hồ cùng câu hạ Boss!', sub: `${(it.hpMax ?? 0).toLocaleString('vi-VN')} HP`, sfx: 'roar', ms: 3800 }); scene3d?.bossShow(it.level); break;
    case 'boss_hit': if (Math.random() < 0.5) audio.play('hit'); break;
    case 'boss_end': scene3d?.bossLeave(it.result === 'killed'); break;
    case 'boss_reward': banner({ prio: 100, at: Date.now(), cls: 'boss', kicker: it.killed ? 'HẠ BOSS!' : 'BOSS ĐÃ BỎ CHẠY', main: it.killed ? `MVP: ${it.mvp?.name ?? '—'}` : 'Lần sau cố lên!', sub: it.top?.slice(0, 3).map((x, i) => `${i + 1}. ${x.name} (${x.damage})`).join('  ') ?? '', sfx: it.killed ? 'victory' : 'fail', ms: 5000 }); break;
    case 'event_start': feedLine(`🌟 Sự kiện: ${it.name}`, '#ffe680'); banner({ prio: 60, at: Date.now(), kicker: 'SỰ KIỆN', main: it.name, sub: it.source === 'GIFT' ? 'Kích hoạt bằng quà' : '', sfx: 'notify' }); break;
    case 'event_merged': feedLine(it.note === 'boss_level_up' ? `🐉 Boss quà được nâng lên cấp ${it.into?.level}` : `⏫ ${it.into?.name ?? 'Sự kiện'} được gia hạn`, '#ffe680'); break;
    case 'event_end': feedLine(`⌛ Hết sự kiện: ${it.name}`, '#a9d4ff'); break;
    case 'live': if (it.state === 'ENDED') banner({ prio: 90, at: Date.now(), kicker: 'LIVE', main: 'Buổi LIVE đã kết thúc', sub: 'Cảm ơn mọi người! Tiến trình đã được lưu.', ms: 6000 }); break;
    default: break;
  }
}
function anglerVisible(key) { for (const a of anglers.values()) if (a.key === key) return true; return false; }
function slotName(s) { return ({ rod: 'cần câu', line: 'dây câu', bobber: 'phao', bait: 'mồi' })[s] ?? s; }
function fxName(t) { return ({ cast: 'Ném cần ngay', luck: '🍀 May mắn', power: '💪 Lực kéo', rare_next: '✨ Cá hiếm', world_event: '🌟 Sự kiện', score: '⭐ Điểm', boss: '🐉 Boss' })[t] ?? t; }
function showCard(it) {
  const name = it.player?.name ?? '';
  const c = it.card || {};
  if (it.kind === 'rank') {
    banner({ prio: 25, at: Date.now(), kicker: 'XẾP HẠNG', main: `${name} — Lv${c.level}`, sub: `TOP LIVE: ${it.live?.rank ? `#${it.live.rank}` : '—'} · TOP tổng: ${it.all?.rank ? `#${it.all.rank}` : '—'}`, sfx: 'notify', ms: 2600 });
  } else {
    const best = c.best ? speciesById.get(c.best.speciesId) : null;
    banner({ prio: 25, at: Date.now(), kicker: 'TÚI ĐỒ', main: `${name} — Lv${c.level} · ${c.coins?.toLocaleString('vi-VN')} xu`, sub: `Sổ tay ${c.dex}/${c.dexTotal} · Cần ${c.equip?.rod} · Dây ${c.equip?.line} · Phao ${c.equip?.bobber} · Mồi ${c.equip?.bait}${best ? ` · Hiếm nhất: ${best.name}` : ''}`, sfx: 'notify', ms: 3200 });
  }
}

// ───────── WebSocket ─────────
let ws = null; let backoff = 1000; let lastMsgAt = 0;
function connect() {
  const k = params.get('k');
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=stage${k ? `&k=${encodeURIComponent(k)}` : ''}`);
  ws.onopen = () => { backoff = 1000; $('conn').hidden = true; };
  ws.onmessage = (e) => {
    lastMsgAt = Date.now();
    let m; try { m = JSON.parse(e.data); } catch { return; }
    switch (m.type) {
      case 'init':
        catalog = m.catalog;
        speciesById = new Map(catalog.species.map((s) => [s.id, s]));
        setSpeciesCatalog(speciesById);
        rarity = new Map(catalog.rarities.map((r) => [r.tier, r]));
        applyConfig(m.config);
        if (m.top) { top = m.top; renderLb(); }
        if (m.events) applyEvents(m.events);
        break;
      case 'frame': if (catalog) applyFrame(m); break;
      case 'feed': for (const it of m.items) onFeed(it); break;
      case 'events': applyEvents(m); break;
      case 'top': top = m.top; labelsTop = m.labels || {}; if (!lbShownAt) renderLb(); else { const pages = renderLb(); if (lbPage >= pages) lbPage = 0; } break;
      case 'config': applyConfig(m.config); break;
      case 'music': music.cmd(m.cmd); break;
      case 'pong': if (Number.isFinite(m.t)) report.ws.rttMs = Math.round(performance.now() - m.t); break;
      default: break;
    }
  };
  ws.onclose = () => { $('conn').hidden = false; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 10000); };
  ws.onerror = () => {};
}
function applyConfig(c) {
  config = { ...config, ...c };
  $('sub').textContent = `${config.worldName || 'Hồ NOVA'}${zoneName ? ` · ${zoneName}` : ''}`;
  audio.applyVolumes(config.volumes);
  $('guides').hidden = !(config.showGuides || params.get('guides') === '1');
  applyLayout(config.layout);
  music.apply(config.music, config.volumes || {});
}

// ───────── vòng vẽ (khoá FPS) + báo cáo về server ─────────
const report = { webgl2: Boolean(scene3d), renderer: null, vendor: null, maxTextureSize: null, fps: 0, canvas: { w: W, h: H }, viewport: { w: 0, h: 0 }, devicePixelRatio: window.devicePixelRatio || 1,
  audio: { ok: false, state: 'chưa kiểm' }, ws: { rttMs: null }, three: { ok: Boolean(scene3d), revision: THREE.REVISION }, font: { vietnameseOk: true }, userAgent: navigator.userAgent };
if (scene3d) {
  const gl = scene3d.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  report.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  report.vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
  report.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
}
let frames = 0; let fpsStart = performance.now(); let last = 0; let lastT = performance.now();
const tmp = new THREE.Vector3();
/** Góc cận cảnh cần thủ (góc 2): cần thủ quay mặt ra hồ nên camera đứng phía hồ, nhìn vào người và đầu cần. */
function closeShot(a) {
  if (!a) return null;
  const sp = a.sp;
  return { pos: new THREE.Vector3(sp.x + sp.side * 3.4, 2.2, sp.z + 0.6), look: new THREE.Vector3(sp.x + sp.side * 0.3, 1.2, sp.z) };
}
/**
 * Góc 3 (dưới nước): camera ngang thân cá, lệch sang bên hướng kéo, hơi thấp hơn cá để thấy dây đi lên mặt nước.
 * Chưa có vị trí cá → dùng cận cảnh cần thủ.
 */
function underShot(a) {
  if (!a?.hookPos) return closeShot(a);
  const h = a.hookPos;
  let dx = h.x - a.sp.x; let dz = h.z - a.sp.z;
  const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  let px = -dz; let pz = dx;
  if (pz < 0) { px = -px; pz = -pz; } // luôn nhìn từ phía khán giả (+z)
  // khung dọc 1080×1920 rất hẹp ngang (~0.45 × khoảng cách) → lùi xa theo chiều dài cá để cả con cá nằm trong khung
  const fishLen = 1.5 * (a.hooked?.scale.x ?? 1);
  const d = Math.max(3.2, fishLen * 4);
  return { pos: new THREE.Vector3(h.x + px * d, Math.min(-0.45, h.y - 0.1), h.z + pz * d), look: new THREE.Vector3(h.x, h.y + 0.15, h.z) };
}
let shotState = null;
function loop(t) {
  requestAnimationFrame(loop);
  if (!scene3d || t - last < 1000 / TARGET_FPS - 2) return;
  last = t;
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  // chọn góc: tổng quan (mặc định) hoặc cận cảnh cần thủ đang cắn/giằng
  const prevMode = shotState?.mode;
  shotState = pickShot([...anglers.values()].map((a) => ({ slot: a.slot, ph: a.phase, phaseStart: a.phaseStart })), shotState, performance.now());
  const target = shotState.slot !== null ? anglers.get(shotState.slot) : null;
  const shot = shotState.mode === 'close' ? closeShot(target) : shotState.mode === 'under' ? underShot(target) : null;
  // vào/ra dưới nước: cắt nhanh (không trượt xuyên mặt nước)
  scene3d.setShot(shot, { cut: prevMode !== shotState.mode && (shotState.mode === 'under' || prevMode === 'under') });
  frame.classList.toggle('underwater', Boolean(scene3d.underwater));
  frame.classList.toggle('closeup', shotState.mode !== 'overview'); // bảng có hideOnClose tự ẩn để không che người chơi
  scene3d.update(dt);
  for (const a of anglers.values()) a.animate(scene3d.clock, dt);
  scene3d.render();
  // nhãn bám theo đầu cần thủ (chiếu 3D → 2D)
  for (const [slot, a] of anglers) {
    const L = labels.get(slot); if (!L) continue;
    a.head.getWorldPosition(tmp); tmp.y += 0.55;
    const p = scene3d.project(tmp);
    L.root.style.left = `${p.x.toFixed(1)}px`; L.root.style.top = `${p.y.toFixed(1)}px`;
    L.root.style.display = p.visible && p.y > 600 && p.y < 1300 ? '' : 'none';
  }
  audio.reel(reelers);
  frames++;
  if (t - fpsStart >= 1000) { report.fps = Math.round((frames * 1000 / (t - fpsStart)) * 10) / 10; frames = 0; fpsStart = t; }
}
requestAnimationFrame(loop);
document.addEventListener('visibilitychange', () => { frames = 0; fpsStart = performance.now(); });

setInterval(() => {
  if (!ws || ws.readyState !== 1) return;
  report.viewport = { w: window.innerWidth, h: window.innerHeight };
  report.audio = { ok: audio.state === 'running', state: audio.state };
  report.hidden = document.hidden;
  ws.send(JSON.stringify({ type: 'ping', t: Math.round(performance.now()) }));
  if (!PREVIEW) ws.send(JSON.stringify({ type: 'metrics', report }));
}, 2000);
setInterval(() => { if (ws?.readyState === 1 && Date.now() - lastMsgAt > 8000) ws.close(); }, 4000); // server im lặng quá lâu → nối lại

// ───────── âm thanh: OBS/LIVE Studio thường cho tự phát; trình duyệt cần một lần bấm ─────────
if (!PREVIEW) {
  audio.resume().then((s) => { if (s !== 'running') $('audio-btn').hidden = false; });
  $('audio-btn').addEventListener('click', async () => { await audio.resume(); music.resume(); $('audio-btn').hidden = audio.state === 'running'; });
  window.addEventListener('pointerdown', () => audio.resume().then(() => { music.resume(); $('audio-btn').hidden = audio.state === 'running'; }), { once: true });
}

connect();
