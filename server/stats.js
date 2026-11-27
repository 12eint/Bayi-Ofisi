// Geçmiş & istatistik: maç sonuçlarından seçimleri değerlendirir, ajan bazında isabet ve kâr/zarar hesaplar.
import { db } from './db.js';
import { getCoupon } from './agents/rules.js';
import { r2 } from './agents/rules.js';
import { yuklem } from './model/poisson.js';
import { macSonucu, espnLig } from './veri/espn.js';
import { bagimsizModel, secimOlasiligi } from './veri/bagimsiz.js';

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
export function enterScore(tarih, macKodu, ev, dep, iyEv = null, iyDep = null) {
  db.prepare('UPDATE maclar SET skor_ev = ?, skor_dep = ?, iy_ev = COALESCE(?, iy_ev), iy_dep = COALESCE(?, iy_dep) WHERE mac_kodu = ? AND gun = ?')
    .run(ev, dep, iyEv, iyDep, String(macKodu), tarih);
  const sel = db.prepare(`SELECT s.* FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id WHERE k.tarih = ? AND s.mac_kodu = ?`).all(tarih, String(macKodu));
  const elle = [];
  for (const s of sel) {
    let r = evaluateSelection(s.bahis, s.secim, ev, dep);
    // İlk yarı skoru biliniyorsa yarı bahisleri (İY, İY/MS, 2. yarı, iki yarıda KG...) modelin yüklemiyle değerlendirilir
    if (!r && iyEv != null && iyDep != null && ev >= iyEv && dep >= iyDep) {
      const y = yuklem(s.bahis, s.secim);
      if (y) r = y.f(iyEv, iyDep, ev - iyEv, dep - iyDep) ? 'tuttu' : 'yatti';
    }
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
/**
 * Sonucu girilmemiş kupon maçlarını ESPN'den bulup skorları (ilk yarı dahil) otomatik girer.
 * Yalnızca başlamasının üzerinden 2,5 saat geçmiş maçlara bakılır. ESPN'de olmayan lig/takım atlanır (elle girilir).
 */
export async function sonuclariOtomatikGetir({ fetchFn } = {}) {
  const sinir = new Date(Date.now() - 2.5 * 3600000).toISOString();
  const bekleyen = pendingMatches();
  const sonuc = { bakilan: 0, girilen: 0, iy_ile: 0, bulunamayan: [] };
  for (const p of bekleyen) {
    const m = db.prepare('SELECT * FROM maclar WHERE mac_kodu = ? AND gun = ? ORDER BY bulten_id DESC LIMIT 1').get(String(p.mac_kodu), p.tarih);
    if (!m || !m.baslama || m.baslama > sinir) continue;
    sonuc.bakilan++;
    let s = null;
    try { s = await macSonucu(m, fetchFn); } catch { /* ağ hatası: sonra tekrar denenir */ }
    if (!s) { sonuc.bulunamayan.push(`${m.mac_kodu} ${m.ev} - ${m.deplasman}`); continue; }
    enterScore(p.tarih, p.mac_kodu, s.skor[0], s.skor[1], s.iy?.[0] ?? null, s.iy?.[1] ?? null);
    sonuc.girilen++; if (s.iy) sonuc.iy_ile++;
  }
  return sonuc;
}

// ---------------- Genel istatistik: bahisçi başına verilen maç / tutan / yatan ----------------
// Yalnızca geçerli kuponlar sayılır (revize edilip yerine yenisi yazılan ve iptal edilen kuponlar hariç).
export function genelIstatistik() {
  const satirlar = db.prepare(`SELECT k.ajan,
      COUNT(DISTINCT k.id) kupon,
      COUNT(DISTINCT CASE WHEN k.sonuc = 'kazandi' THEN k.id END) kupon_kazanan,
      COUNT(DISTINCT CASE WHEN k.sonuc = 'kaybetti' THEN k.id END) kupon_kaybeden,
      COUNT(s.id) mac,
      SUM(s.sonuc = 'tuttu') tuttu, SUM(s.sonuc = 'yatti') yatti, SUM(s.sonuc = 'iade') iade, SUM(s.sonuc IS NULL) bekleyen,
      MIN(k.tarih) ilk_gun, MAX(k.tarih) son_gun
    FROM kuponlar k JOIN kupon_secimleri s ON s.kupon_id = k.id
    WHERE k.durum = 'aktif' GROUP BY k.ajan`).all();
  const oran = (t, y) => (t + y ? Math.round(t / (t + y) * 1000) / 10 : null);
  const ajanlar = satirlar.map(r => ({ ...r, isabet: oran(r.tuttu, r.yatti), kupon_isabet: oran(r.kupon_kazanan, r.kupon_kaybeden) }))
    .sort((a, b) => b.mac - a.mac);
  const top = (alan) => ajanlar.reduce((t, a) => t + (a[alan] ?? 0), 0);
  const toplam = { ajan: 'TOPLAM', kupon: top('kupon'), kupon_kazanan: top('kupon_kazanan'), kupon_kaybeden: top('kupon_kaybeden'), mac: top('mac'),
    tuttu: top('tuttu'), yatti: top('yatti'), iade: top('iade'), bekleyen: top('bekleyen'),
    ilk_gun: ajanlar.map(a => a.ilk_gun).sort()[0] ?? null, son_gun: ajanlar.map(a => a.son_gun).sort().at(-1) ?? null };
  toplam.isabet = oran(toplam.tuttu, toplam.yatti); toplam.kupon_isabet = oran(toplam.kupon_kazanan, toplam.kupon_kaybeden);
  return { ajanlar, toplam };
}

// ---------------- Tutma karnesi (kalibrasyon) ----------------
// Sonuçlanan seçimlerde: modeller "%X tutar" dediğinde gerçekte yüzde kaç tuttu? Brier skoru: (olasılık − sonuç)², düşük = daha isabetli.
export function bahisGrubu(bahis) {
  if (bahis === 'Maç Sonucu') return 'Maç Sonucu';
  if (bahis === 'Çifte Şans') return 'Çifte Şans';
  if (/^(Alt\/Üst|Altı\/Üstü) \d/.test(bahis)) return 'Alt/Üst';
  if (bahis === 'Karşılıklı Gol') return 'KG';
  if (bahis === '1. Yarı / Maç Sonucu') return 'İY/MS';
  if (bahis === '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur') return 'İki yarıda KG';
  if (/^1\. Yarı|^İlk Yarı/.test(bahis)) return 'İlk yarı';
  if (/ ve /.test(bahis)) return 'Kombine (MS+KG vb.)';
  return 'Diğer';
}
const DILIMLER = [[0, 0.4, '%0-40'], [0.4, 0.55, '%40-55'], [0.55, 0.7, '%55-70'], [0.7, 0.85, '%70-85'], [0.85, 1.01, '%85-100']];
const yuz = (x) => (x == null ? null : Math.round(x * 1000) / 10);

export function tutmaKarnesi() {
  const rows = db.prepare(`SELECT s.bahis, s.oran, s.model_olasilik, s.piyasa_olasilik, s.bagimsiz_olasilik, s.sonuc, s.lig, k.ajan
    FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    WHERE s.sonuc IN ('tuttu', 'yatti') AND k.durum != 'iptal'`).all();
  const grupla = (anahtar) => {
    const m = new Map();
    for (const r of rows) {
      const k = anahtar(r); if (k == null) continue;
      const g = m.get(k) ?? { ad: k, n: 0, tuttu: 0, pOran: [], pBag: [], brierOran: [], brierBag: [], brierPiyasa: [] };
      const y = r.sonuc === 'tuttu' ? 1 : 0;
      g.n++; g.tuttu += y;
      const piyasa = r.piyasa_olasilik ?? (r.oran ? 1 / r.oran : null);
      if (r.model_olasilik != null) { g.pOran.push(r.model_olasilik); g.brierOran.push((r.model_olasilik - y) ** 2); }
      if (piyasa != null) g.brierPiyasa.push((piyasa - y) ** 2);
      if (r.bagimsiz_olasilik != null) { g.pBag.push(r.bagimsiz_olasilik); g.brierBag.push((r.bagimsiz_olasilik - y) ** 2); }
      m.set(k, g);
    }
    const ort = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
    return [...m.values()].map(g => ({
      ad: g.ad, n: g.n, tutma: yuz(g.tuttu / g.n), tahminOran: yuz(ort(g.pOran)), tahminBag: yuz(ort(g.pBag)), nBag: g.pBag.length,
      brierOran: ort(g.brierOran) == null ? null : Math.round(ort(g.brierOran) * 1000) / 1000,
      brierBag: ort(g.brierBag) == null ? null : Math.round(ort(g.brierBag) * 1000) / 1000,
    })).sort((a, b) => b.n - a.n);
  };
  const dilim = (p) => (p == null ? null : DILIMLER.find(([a, b]) => p >= a && p < b)?.[2]);
  // İki modeli adil kıyaslamak için yalnızca İKİSİNİN de olasılık verdiği seçimler
  const ortak = rows.filter(r => r.model_olasilik != null && r.bagimsiz_olasilik != null);
  const brier = (f) => (ortak.length ? Math.round(ortak.reduce((t, r) => t + (f(r) - (r.sonuc === 'tuttu' ? 1 : 0)) ** 2, 0) / ortak.length * 1000) / 1000 : null);
  return {
    toplam: rows.length,
    ajanlar: grupla(r => r.ajan),
    bahisler: grupla(r => bahisGrubu(r.bahis)),
    dilimler: grupla(r => dilim(r.model_olasilik)).sort((a, b) => DILIMLER.findIndex(d => d[2] === a.ad) - DILIMLER.findIndex(d => d[2] === b.ad)),
    kiyas: { n: ortak.length, oranModeli: brier(r => r.model_olasilik), bagimsizModel: brier(r => r.bagimsiz_olasilik), karisik: brier(r => (r.model_olasilik + r.bagimsiz_olasilik) / 2) },
  };
}

/** Bağımsız olasılığı olmayan (eski) seçimleri ESPN puan durumundan doldurur. Not: güncel puan durumu kullanılır. */
export async function eksikBagimsizDoldur({ fetchFn } = {}) {
  const rows = db.prepare(`SELECT s.id, s.mac_kodu, s.bahis, s.secim, k.tarih FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    WHERE s.bagimsiz_olasilik IS NULL AND k.durum != 'iptal'`).all();
  const macGetir = db.prepare('SELECT * FROM maclar WHERE mac_kodu = ? AND gun = ? ORDER BY bulten_id DESC LIMIT 1');
  const yaz = db.prepare('UPDATE kupon_secimleri SET bagimsiz_olasilik = ? WHERE id = ?');
  const modeller = new Map(); let n = 0;
  for (const r of rows) {
    if (secimOlasiligi({ p1: 0, p0: 0, p2: 0, ust25: 0, kg: 0, ikiYariKg: 0 }, r.bahis, r.secim) == null) continue;   // model bu bahsi kapsamıyor
    const m = macGetir.get(String(r.mac_kodu), r.tarih); if (!m || !espnLig(m.lig)) continue;
    const anahtar = `${m.lig}|${m.ev}|${m.deplasman}`;
    if (!modeller.has(anahtar)) { try { modeller.set(anahtar, await bagimsizModel(m, fetchFn)); } catch { modeller.set(anahtar, null); } }
    const p = secimOlasiligi(modeller.get(anahtar), r.bahis, r.secim);
    if (p != null) { yaz.run(p, r.id); n++; }
  }
  return n;
}

export function tutmaKarnesiYazi(k = tutmaKarnesi()) {
  if (!k.toplam) return 'Henüz sonuçlanmış seçim yok; karne sonuçlar geldikçe dolar.';
  const satir = (g) => `${g.ad}: ${g.n} seçim, tuttu %${g.tutma}` + (g.tahminOran != null ? ` (oran modeli %${g.tahminOran} demişti` + (g.tahminBag != null ? `, bağımsız model %${g.tahminBag} [${g.nBag}]` : '') + ')' : '');
  const kv = k.kiyas;
  return `TUTMA KARNESİ (${k.toplam} sonuçlanmış seçim; az veride sonuçlar yanıltıcı olabilir)\n` +
    `Ajanlar:\n  ${k.ajanlar.map(satir).join('\n  ')}\nBahis türleri:\n  ${k.bahisler.map(satir).join('\n  ')}\n` +
    `Olasılık dilimleri (oran modeli → gerçek):\n  ${k.dilimler.map(g => `${g.ad}: ${g.n} seçim, model ort. %${g.tahminOran}, tuttu %${g.tutma}`).join('\n  ')}\n` +
    (kv.n ? `Model kıyası (iki modelin de olasılık verdiği ${kv.n} seçim, Brier – düşük daha iyi): oran ${kv.oranModeli}, bağımsız ${kv.bagimsizModel}, ikisinin ortalaması ${kv.karisik}` : 'Model kıyası: bağımsız olasılığı olan sonuçlanmış seçim henüz yok.');
}

export function pendingMatches() {
  return db.prepare(`SELECT k.tarih, s.mac_kodu, s.mac_adi, s.lig, s.saat, COUNT(*) secim_sayisi
    FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    WHERE k.durum = 'aktif' AND s.sonuc IS NULL GROUP BY k.tarih, s.mac_kodu ORDER BY k.tarih DESC, s.saat`).all();
}
