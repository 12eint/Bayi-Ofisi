// Canlı skor: başlamış kupon maçlarının skorunu ESPN'den çeker, her seçimin "şu an tutuyor mu" durumunu hesaplar.
// Tamamen kodla çalışır; hiçbir Claude ajanı çağrılmaz (token harcamaz).
import { db, istanbulDate } from './db.js';
import { canliMac } from './veri/espn.js';
import { yuklem } from './model/poisson.js';
import { enterScore } from './stats.js';

const AU = /^(?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/;
let durum = { guncelleme: null, maclar: {}, secimler: {} };
export const canliDurum = () => durum;

/**
 * Seçimin anlık durumu: { tutuyor: bool, kesin: bool } ya da null (değerlendirilemez).
 * m: { skor:[e,d], iy:[e,d]|null, ikinci:[e,d]|null, devre, tamamlandi }
 */
export function secimCanli(bahis, secim, m) {
  const y = yuklem(bahis, secim); if (!y) return null;
  const [e, d] = m.skor;
  let tutuyor;
  if (y.tur === 'ft') tutuyor = y.f(e, d, 0, 0);
  else if (m.iy) tutuyor = y.f(m.iy[0], m.iy[1], m.ikinci[0], m.ikinci[1]);
  else if (y.tur === 'ht' && m.devre <= 1) tutuyor = y.f(e, d, 0, 0);   // 1. yarı sürüyorsa skor = ilk yarı skoru
  else return null;
  let kesin = !!m.tamamlandi || (y.tur === 'ht' && m.devre >= 2 && !!m.iy);
  const au = bahis.match(AU);
  if (au && e + d > Number(au[1].replace(',', '.'))) kesin = true;          // çizgi aşıldı: Üst kesin tuttu, Alt kesin yattı
  if (bahis === 'Karşılıklı Gol' && e > 0 && d > 0) kesin = true;
  return { tutuyor, kesin };
}

/** Takip edilecek maçlar: aktif kuponlarda sonucu girilmemiş, başlamış (son 4 saatte) maçlar */
function takipListesi(simdi = new Date()) {
  const bugun = istanbulDate(simdi), dun = istanbulDate(new Date(simdi.getTime() - 86400000));
  const alt = new Date(simdi.getTime() - 4 * 3600000).toISOString(), ust = simdi.toISOString();
  return db.prepare(`SELECT DISTINCT k.tarih, s.mac_kodu, m.ev, m.deplasman, m.lig, m.gun, m.baslama
    FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    JOIN maclar m ON m.id = (SELECT id FROM maclar WHERE mac_kodu = s.mac_kodu AND gun = k.tarih ORDER BY bulten_id DESC LIMIT 1)
    WHERE k.durum = 'aktif' AND s.sonuc IS NULL AND k.tarih IN (?, ?) AND m.baslama BETWEEN ? AND ?`).all(bugun, dun, alt, ust);
}

/** Bir tur: maçları çek, durumu güncelle, biten maçların sonucunu işle. Dönen: { degisti, biten } */
export async function canliGuncelle({ fetchFn, simdi = new Date() } = {}) {
  const liste = takipListesi(simdi);
  const maclar = {};
  let biten = 0;
  for (const t of liste) {
    let x = null;
    try { x = await canliMac({ lig: t.lig, ev: t.ev, deplasman: t.deplasman, gun: t.gun ?? t.tarih }, fetchFn); } catch { /* ağ hatası: sonraki turda */ }
    const anahtar = `${t.tarih}|${t.mac_kodu}`;
    if (!x) { maclar[anahtar] = { bulunamadi: true }; continue; }
    if (x.durum === 'pre') continue;
    maclar[anahtar] = { durum: x.durum, dk: x.dk, devre: x.devre, skor: x.skor, iy: x.iy, ikinci: x.ikinci, tamamlandi: x.tamamlandi };
    if (x.tamamlandi) { enterScore(t.tarih, t.mac_kodu, x.skor[0], x.skor[1], x.iy?.[0] ?? null, x.iy?.[1] ?? null); biten++; }
  }
  const secimler = {};
  const anahtarlar = Object.keys(maclar).filter(a => !maclar[a].bulunamadi);
  if (anahtarlar.length) {
    const sor = db.prepare(`SELECT s.id, s.bahis, s.secim FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id WHERE k.tarih = ? AND s.mac_kodu = ?`);
    for (const a of anahtarlar) {
      const [tarih, kod] = a.split('|');
      for (const s of sor.all(tarih, kod)) { const c = secimCanli(s.bahis, s.secim, maclar[a]); if (c) secimler[s.id] = c; }
    }
  }
  const yeni = { guncelleme: new Date().toISOString(), maclar, secimler };
  const degisti = JSON.stringify({ m: yeni.maclar, s: yeni.secimler }) !== JSON.stringify({ m: durum.maclar, s: durum.secimler });
  durum = yeni;
  return { degisti, biten, takip: liste.length };
}
