// Geçmiş & istatistik: maç sonuçlarından seçimleri değerlendirir, ajan bazında isabet ve kâr/zarar hesaplar.
import { db } from './db.js';
import { getCoupon } from './agents/rules.js';
import { r2 } from './agents/rules.js';

/** Skordan otomatik değerlendirilebilen bahisler. Değerlendirilemezse null (elle girilir). */
export function evaluateSelection(bahis, secim, ev, dep) {
  if (ev == null || dep == null) return null;
  const ms = ev > dep ? '1' : ev < dep ? '2' : '0';
  const top = ev + dep;
  if (bahis === 'Maç Sonucu') return secim === ms ? 'tuttu' : 'yatti';
  if (bahis === 'Çifte Şans') return secim.split(' ve ').includes(ms) ? 'tuttu' : 'yatti';
  let m = bahis.match(/^Alt\/Üst (\d+[.,]5)$/);
  if (m) { const l = Number(m[1].replace(',', '.')); return (secim === 'Üst' ? top > l : top < l) ? 'tuttu' : 'yatti'; }
  if (bahis === 'Karşılıklı Gol') { const kg = ev > 0 && dep > 0; return (secim === 'Var') === kg ? 'tuttu' : 'yatti'; }
  if (bahis === 'Tek / Çift') return (secim === 'Tek') === (top % 2 === 1) ? 'tuttu' : 'yatti';
  if (bahis === 'Toplam Gol') {
    const r = top <= 1 ? '0-1 gol' : top <= 3 ? '2-3 gol' : top <= 5 ? '4-5 gol' : '6+ gol';
    return secim === r ? 'tuttu' : 'yatti';
  }
  // Handikaplı bahisler, yarı sonuçları, korner vb. skordan güvenle çıkarılamaz → elle girilir
  m = bahis.match(/^Maç Sonucu ve Karşılıklı Gol$/);
  if (m) { const [a, b] = secim.split(' ve '); return a === ms && (b === 'Var') === (ev > 0 && dep > 0) ? 'tuttu' : 'yatti'; }
  m = bahis.match(/^Maç Sonucu ve Alt\/Üst (\d+[.,]5)$/);
  if (m) { const l = Number(m[1].replace(',', '.')); const [a, b] = secim.split(' ve '); return a === ms && (b === 'Üst' ? top > l : top < l) ? 'tuttu' : 'yatti'; }
  return null;
}

/** Bir maçın skorunu gir → o maçı içeren tüm kupon seçimlerini değerlendir ve kuponları güncelle */
export function enterScore(tarih, macKodu, ev, dep) {
  db.prepare('UPDATE maclar SET skor_ev = ?, skor_dep = ? WHERE mac_kodu = ? AND gun = ?').run(ev, dep, String(macKodu), tarih);
  const sel = db.prepare(`SELECT s.* FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id WHERE k.tarih = ? AND s.mac_kodu = ?`).all(tarih, String(macKodu));
  const elle = [];
  for (const s of sel) {
    const r = evaluateSelection(s.bahis, s.secim, ev, dep);
    if (r) db.prepare('UPDATE kupon_secimleri SET sonuc = ? WHERE id = ?').run(r, s.id);
    else elle.push({ id: s.id, kupon_id: s.kupon_id, bahis: s.bahis, secim: s.secim });
  }
  new Set(sel.map(s => s.kupon_id)).forEach(settleCoupon);
  return { guncellenen: sel.length - elle.length, elle_girilmeli: elle };
}

export function setSelectionResult(secimId, sonuc) {
  if (!['tuttu', 'yatti', 'iade', null].includes(sonuc)) throw new Error('Geçersiz sonuç');
  db.prepare('UPDATE kupon_secimleri SET sonuc = ? WHERE id = ?').run(sonuc, secimId);
  const s = db.prepare('SELECT kupon_id FROM kupon_secimleri WHERE id = ?').get(secimId);
  if (s) settleCoupon(s.kupon_id);
}

export function settleCoupon(kuponId) {
  const k = getCoupon(kuponId);
  if (!k) return;
  const ss = k.secimler;
  let sonuc = null;
  if (ss.some(s => s.sonuc === 'yatti')) sonuc = 'kaybetti';
  else if (ss.every(s => s.sonuc === 'tuttu' || s.sonuc === 'iade')) sonuc = ss.every(s => s.sonuc === 'iade') ? 'iade' : 'kazandi';
  db.prepare('UPDATE kuponlar SET sonuc = ? WHERE id = ?').run(sonuc, kuponId);
}

export const couponPayout = (k) =>
  k.sonuc === 'kazandi' ? r2(k.tutar * k.secimler.filter(s => s.sonuc !== 'iade').reduce((x, s) => x * s.oran, 1))
  : k.sonuc === 'iade' ? k.tutar : 0;

export function history({ gun = 30 } = {}) {
  const ids = db.prepare(`SELECT id FROM kuponlar WHERE durum = 'aktif' AND tarih >= date('now', ?) ORDER BY tarih DESC, id`).all(`-${gun} days`);
  const byDay = {};
  for (const { id } of ids) {
    const k = getCoupon(id);
    k.odeme = couponPayout(k);
    (byDay[k.tarih] ??= []).push(k);
  }
  return Object.entries(byDay).map(([tarih, kuponlar]) => ({ tarih, kuponlar }));
}

export function agentStats() {
  const ids = db.prepare("SELECT id FROM kuponlar WHERE durum = 'aktif'").all();
  const st = {};
  for (const { id } of ids) {
    const k = getCoupon(id);
    const a = (st[k.ajan] ??= { ajan: k.ajan, kupon: 0, sonuclanan: 0, kazanan: 0, harcanan: 0, kazanilan: 0, secim: 0, secimTuttu: 0, puanToplam: 0, puanSayisi: 0 });
    a.kupon++;
    if (k.puan) { a.puanToplam += k.puan; a.puanSayisi++; }
    for (const s of k.secimler) if (s.sonuc === 'tuttu' || s.sonuc === 'yatti') { a.secim++; if (s.sonuc === 'tuttu') a.secimTuttu++; }
    if (k.sonuc) {
      a.sonuclanan++; a.harcanan += k.tutar; a.kazanilan += couponPayout(k);
      if (k.sonuc === 'kazandi') a.kazanan++;
    }
  }
  return Object.values(st).map(a => ({
    ...a, harcanan: r2(a.harcanan), kazanilan: r2(a.kazanilan), net: r2(a.kazanilan - a.harcanan),
    kuponIsabet: a.sonuclanan ? Math.round(100 * a.kazanan / a.sonuclanan) : null,
    secimIsabet: a.secim ? Math.round(100 * a.secimTuttu / a.secim) : null,
    ortPuan: a.puanSayisi ? Math.round(10 * a.puanToplam / a.puanSayisi) / 10 : null,
  }));
}

/** Sonuç bekleyen maçlar (kuponlarda geçen, skoru girilmemiş) */
export function pendingMatches() {
  return db.prepare(`SELECT k.tarih, s.mac_kodu, s.mac_adi, s.lig, s.saat, COUNT(*) secim_sayisi
    FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    WHERE k.durum = 'aktif' AND s.sonuc IS NULL GROUP BY k.tarih, s.mac_kodu ORDER BY k.tarih DESC, s.saat`).all();
}
