// Hakan Revio'nun puan cetveli: her kupona KODLA hesaplanan bir taban puan (1-10). Revio bunu gerekçesiyle en fazla ±2 oynatabilir.
// Amaç: puanların hep 5-7'ye sıkışmaması ve her kuponun aynı ölçüyle değerlendirilmesi.
//   olasılık (0-3): kuponun tutma olasılığı, aynı oran ve maç sayısındaki tipik kupona göre
//   değer    (0-2): en zayıf halkanın (en kötü seçimin) değeri
//   uyum     (0-2): oran modeli ile bağımsız güç modeli (ESPN) aynı şeyi mi söylüyor
//   veri     (0-2): seçimlerin ne kadarında bağımsız veri (puan durumu) var
//   uyarı    (−)  : Nikah Dairesi uyarıları (her biri −0,5; en fazla −2)
import { db } from '../db.js';
import { getSettings } from '../settings.js';

export const PUAN_ESNEKLIK = 2;
const sinirla = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

export function tabanPuan(k, settings = getSettings()) {
  const sec = k.secimler ?? [];
  // olasılık (0-3): kuponun tutma olasılığı, AYNI oran ve maç sayısındaki tipik kupona göre (iddaa marjı seçim başına ~%13).
  // oran × model olasılığı / 0,87^maç: 1 = tipik (1,5 puan), 0,85 ve altı = 0, 1,15 ve üstü = 3
  let olasilik = 1.5;
  if (k.model_olasilik > 0 && k.toplam_oran > 0 && sec.length) {
    const oranTipik = (k.model_olasilik * k.toplam_oran) / Math.pow(0.87, sec.length);
    olasilik = sinirla(3 * (oranTipik - 0.85) / 0.30, 0, 3);
  }
  // değer (0-2): EN ZAYIF halka; en kötü seçimin değeri −%10 ve üstü → 2, −%22 ve altı → 0 (iki yarıya bağlı "yaklaşık" bahisler hariç)
  let deger = 1;
  const dl = sec.filter(s => s.deger != null && !['1. Yarı / Maç Sonucu', '2. Yarı Sonucu', 'Hangi Yarıda Daha Fazla Gol Olur', '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur'].includes(s.bahis));
  if (dl.length) deger = sinirla(2 * (Math.min(...dl.map(s => s.deger)) + 0.22) / 0.12, 0, 2);
  // uyum: seçim başına; bağımsız model oran modeli kadar ya da daha iyimser → 2, ≤10 puan geride → 1, daha fazla → 0
  const ikili = sec.filter(s => s.model_olasilik != null && s.bagimsiz_olasilik != null);
  const uyum = ikili.length ? ikili.reduce((t, s) => { const f = s.model_olasilik - s.bagimsiz_olasilik; return t + (f <= 0.02 ? 2 : f <= 0.10 ? 1 : 0); }, 0) / ikili.length : 1;
  const veri = sec.length ? 2 * sec.filter(s => s.bagimsiz_olasilik != null).length / sec.length : 0;
  const uyari = -Math.min(2, 0.5 * (k.risk_uyarilari?.length ?? 0));
  const ham = 1 + olasilik + deger + uyum + veri + uyari;
  return { puan: sinirla(Math.round(ham), 1, 10), ham: r1(ham), olasilik: r1(olasilik), deger: r1(deger), uyum: r1(uyum), veri: r1(veri), uyari: r1(uyari) };
}

export const tabanYazi = (t) => `TABAN PUAN ${t.puan}/10 (olasılık ${t.olasilik}/3, değer ${t.deger}/2, iki model uyumu ${t.uyum}/2, bağımsız veri ${t.veri}/2, uyarı ${t.uyari}) → senin puanın ${Math.max(1, t.puan - PUAN_ESNEKLIK)}-${Math.min(10, t.puan + PUAN_ESNEKLIK)} arasında olmalı`;

/** Revio'nun kendi geçmişi: verdiği puanlar ne kadar isabetli, işaretlediği maçlar ne kadar tuttu */
export function revioKarnesi() {
  const puanlar = db.prepare(`SELECT puan, COUNT(*) n, SUM(sonuc = 'kazandi') kaz, SUM(sonuc IN ('kazandi','kaybetti')) biten
    FROM kuponlar WHERE puan IS NOT NULL AND durum != 'iptal' GROUP BY puan ORDER BY puan`).all();
  const secimler = db.prepare(`SELECT k.degistirilmeli, s.mac_kodu, s.sonuc FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    WHERE s.sonuc IN ('tuttu','yatti') AND k.puan IS NOT NULL`).all();
  const isaret = { i: [0, 0], d: [0, 0] };
  for (const r of secimler) { const g = JSON.parse(r.degistirilmeli || '[]').includes(r.mac_kodu) ? isaret.i : isaret.d; g[0]++; if (r.sonuc === 'tuttu') g[1]++; }
  const yz = ([n, t]) => (n ? `%${Math.round(t / n * 100)} (${t}/${n})` : '–');
  const toplam = puanlar.reduce((t, p) => t + p.n, 0);
  if (!toplam) return 'HAKAN REVIO KARNESİ: henüz puanlanmış kupon yok.';
  return `HAKAN REVIO KARNESİ (${toplam} puanlı kupon)\n` +
    `Verdiğin puanların dağılımı: ${puanlar.map(p => `${p.puan}→${p.n}`).join(', ')}` +
    `${puanlar.every(p => p.puan >= 4 && p.puan <= 7) ? ' — DİKKAT: hep 4-7 arası puan vermişsin; iyi kuponu 8+, kötüyü 3- ile ayır.' : ''}\n` +
    `Sonuçlanan kuponlar puana göre (kazanan/biten): ${puanlar.filter(p => p.biten).map(p => `${p.puan}: ${p.kaz}/${p.biten}`).join(', ') || 'henüz yok'}\n` +
    `"Değiştirilmeli" işaretlediğin maçlar ${yz(isaret.i)} tuttu, işaretlemediklerin ${yz(isaret.d)} — işaretleme ${isaret.i[0] && isaret.d[0] && isaret.i[1] / isaret.i[0] < isaret.d[1] / isaret.d[0] ? 'işe yarıyor, sürdür' : 'henüz fark yaratmıyor'}.`;
}
