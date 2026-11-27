// Chọn góc camera theo pha câu (hàm thuần, không import Three.js → test được bằng Node).
// 'overview': góc 1 — nhìn từ trên cao, thấy mọi cần thủ trong khu (mặc định).
// 'close'   : góc 2 — cận cảnh cần thủ khi cá cắn (bite) và lúc kéo cá lên (result).
// 'under'   : góc 3 — dưới nước nhìn con cá khi đang giằng co (fight).
// Quy tắc: ưu tiên người đang giằng hơn người mới cắn; đang theo một cần thủ thì giữ qua bite → fight → result
// (không nhảy sang người khác giữa chừng); hết result → về tổng quan nếu không còn ai cắn/giằng.

const modeFor = (ph) => (ph === 'fight' ? 'under' : 'close');

/**
 * @param {Array<{slot:number, ph:string, phaseStart:number}>} list  trạng thái cần thủ hiện tại
 * @param {{mode:string, slot:number|null, since:number}|null} prev  lựa chọn trước đó
 * @param {number} now  mốc thời gian (ms)
 * @returns {{mode:'overview'|'close'|'under', slot:number|null, since:number}}
 */
export function pickShot(list, prev, now) {
  if (prev && prev.mode !== 'overview') {
    const cur = list.find((a) => a.slot === prev.slot);
    if (cur && (cur.ph === 'bite' || cur.ph === 'fight' || cur.ph === 'result')) {
      const mode = modeFor(cur.ph);
      return mode === prev.mode ? prev : { mode, slot: prev.slot, since: now };
    }
  }
  const hot = list.filter((a) => a.ph === 'fight' || a.ph === 'bite');
  if (hot.length) {
    hot.sort((a, b) => (b.ph === 'fight') - (a.ph === 'fight') || a.phaseStart - b.phaseStart);
    return { mode: modeFor(hot[0].ph), slot: hot[0].slot, since: now };
  }
  if (prev?.mode === 'overview') return prev;
  return { mode: 'overview', slot: null, since: now };
}
