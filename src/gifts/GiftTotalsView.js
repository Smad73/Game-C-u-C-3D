// GiftTotalsView — trạng thái RAM về quà theo người chơi, CHỈ từ hiệu ứng đã commit (ADR-0018 bước 5).
// Phase 2 dùng nó làm consumer chuẩn của publishCommittedGift (WorldCore thay thế/đăng ký thêm ở Phase 3).
// Khởi động: dựng lại từ DB TRƯỚC (rebuild) rồi mới nhận replay → RAM = DB (bất biến I9).
export class GiftTotalsView {
  constructor() { this.byPlayer = new Map(); this.version = 0; }

  async rebuild(persistence) {
    this.byPlayer.clear();
    for (const r of await persistence.read('gift_totals')) this.byPlayer.set(r.player_key, { coins: r.gift_coins_total, qty: r.gift_count_total });
    this.version++;
    return this.byPlayer.size;
  }

  /** Consumer của GiftJournal.onCommittedGift — nhận delta ĐÃ COMMIT. */
  apply = ({ player_key, qty, coins }) => {
    const cur = this.byPlayer.get(player_key) || { coins: 0, qty: 0 };
    cur.coins += coins; cur.qty += qty;
    this.byPlayer.set(player_key, cur);
  };

  get(playerKey) { return this.byPlayer.get(playerKey) || { coins: 0, qty: 0 }; }

  /** Dạng so sánh được với truy vấn DB `gift_totals` (test I9). */
  toRows() {
    return [...this.byPlayer.entries()].filter(([, v]) => v.qty > 0 || v.coins > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([player_key, v]) => ({ player_key, gift_coins_total: v.coins, gift_count_total: v.qty }));
  }

  top(n = 10) { return [...this.byPlayer.entries()].sort((a, b) => b[1].coins - a[1].coins).slice(0, n).map(([player_key, v]) => ({ player_key, ...v })); }
}
