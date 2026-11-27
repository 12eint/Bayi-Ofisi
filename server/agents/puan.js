// Hakan Revio'nun puan cetveli: her kupona KODLA hesaplanan bir taban puan (1-10). Revio bunu gerekçesiyle en fazla ±2 oynatabilir.
// Amaç: puanların hep 5-7'ye sıkışmaması ve her kuponun aynı ölçüyle değerlendirilmesi.
//   olasılık (0-3): kuponun tutma olasılığı, aynı oran ve maç sayısındaki tipik kupona göre
//   değer    (0-2): en zayıf halkanın (en kötü seçimin) değeri
//   uyum     (0-2): oran modeli ile bağımsız kaynak aynı şeyi mi söylüyor (Alt/Üst'te Dorasal'ın istatistik modeli, diğerlerinde ESPN güç modeli)
//   veri     (0-1): seçimlerin ne kadarında bağımsız veri var
//   form     (0-1): seçimin desteklediği takım son 5 maçta rakibinden formda mı (ESPN)
//   uyarı    (−)  : Nikah Dairesi uyarıları (her biri −0,5; en fazla −2)
import { db } from '../db.js';
import { getSettings } from '../settings.js';
import { espnLig, takimFormu } from '../veri/espn.js';
import { altUstModeli } from '../veri/istatistik.js';
import { tutmaKarnesi } from '../stats.js';

export const PUAN_ESNEKLIK = 2;
const sinirla = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

/** Maç toplamı Alt/Üst seçimi için Dorasal'ın istatistik modelinin olasılığı (yoksa null) */
const istatistikOlasiligi = (model, bahis, secim) => {
  const m = bahis.match(/^(?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/);
  const p = m && model?.ust?.[m[1].replace(',', '.')];
  return p == null ? null : secim === 'Üst' ? p : secim === 'Alt' ? 1 - p : null;
};
/** Seçim hangi takımı destekliyor: 'ev' | 'dep' | null (Alt/Üst, KG vb. yönsüz) */
const yon = (bahis, secim) => {
  if (!/^(Maç Sonucu|Çifte Şans)$/.test(bahis)) return null;
  const s = secim.replace(/\s/g, '');
  if (s === '1' || s === '1ve0') return 'ev';
  if (s === '2' || s === '0ve2') return 'dep';
  return null;
};
const puanOrt = (f) => (f?.maclar?.length ? f.maclar.reduce((t, x) => t + (x.s === 'G' ? 3 : x.s === 'B' ? 1 : 0), 0) / f.maclar.length : null);

/**
 * Taban puan için ESPN'den ek veri (önbellekli): seçim başına istatistik olasılığı (Alt/Üst) ve form puanı (0-1).
 * @returns {{ istat: Object<number, number>, form: Object<number, number> }}  anahtar: seçimin kupondaki sırası
 */
export async function tabanEk(k, { fetchFn, onbellek = true } = {}) {
  // Kupon başına 6 saatlik önbellek (ESPN istatistiği ilk seferde yavaş: maç başına birkaç özet indirilir)
  if (onbellek && k.id) {
    const r = db.prepare('SELECT taban_ek FROM kuponlar WHERE id = ?').get(k.id);
    const kayit = r?.taban_ek ? JSON.parse(r.taban_ek) : null;
    if (kayit && Date.now() - kayit.zaman < 6 * 3600000) return kayit.ek;
  }
  const ek = await tabanEkHesapla(k, fetchFn);
  if (onbellek && k.id) db.prepare('UPDATE kuponlar SET taban_ek = ? WHERE id = ?').run(JSON.stringify({ zaman: Date.now(), ek }), k.id);
  return ek;
}
async function tabanEkHesapla(k, fetchFn) {
  const ek = { istat: {}, form: {} };
  const macGetir = db.prepare('SELECT * FROM maclar WHERE mac_kodu = ? AND gun = ? ORDER BY bulten_id DESC LIMIT 1');
  for (const [i, s] of (k.secimler ?? []).entries()) {
    const m = macGetir.get(String(s.mac_kodu), k.tarih);
    const slug = m && espnLig(m.lig);
    if (!slug) continue;
    try {
      if (/(Alt\/Üst|Altı\/Üstü) \d/.test(s.bahis)) {
        const a = await altUstModeli(m, fetchFn);
        const p = istatistikOlasiligi(a?.model, s.bahis, s.secim);
        if (p != null) ek.istat[i] = p;
      }
      const y = yon(s.bahis, s.secim);
      if (y) {
        const [fe, fd] = await Promise.all([takimFormu(slug, m.ev, { fetchFn }), takimFormu(slug, m.deplasman, { fetchFn })]);
        const [pe, pd] = [puanOrt(fe), puanOrt(fd)];
        if (pe != null && pd != null) { const fark = y === 'ev' ? pe - pd : pd - pe; ek.form[i] = fark >= 0.5 ? 1 : fark >= -0.3 ? 0.5 : 0; }
      }
    } catch { /* ESPN'e ulaşılamadı: bu seçim için ek veri yok */ }
  }
  return ek;
}
/** Ek veriyle birlikte tam taban puan */
export async function tabanPuanTam(k, opts) { return tabanPuan(k, getSettings(), await tabanEk(k, opts)); }

export function tabanPuan(k, settings = getSettings(), ek = { istat: {}, form: {} }) {
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
  // uyum: seçim başına; bağımsız kaynak (Alt/Üst'te istatistik modeli, yoksa ESPN güç modeli) oran modeli kadar ya da daha iyimser → 2, ≤10 puan geride → 1, daha fazla → 0
  const bag = (s, i) => ek.istat?.[i] ?? s.bagimsiz_olasilik;
  const ikili = sec.map((s, i) => [s, bag(s, i)]).filter(([s, b]) => s.model_olasilik != null && b != null);
  const uyum = ikili.length ? ikili.reduce((t, [s, b]) => { const f = s.model_olasilik - b; return t + (f <= 0.02 ? 2 : f <= 0.10 ? 1 : 0); }, 0) / ikili.length : 1;
  const veri = sec.length ? sec.filter((s, i) => bag(s, i) != null).length / sec.length : 0;
  // form: yalnızca takım destekleyen seçimler (MS / Çifte Şans); veri yoksa nötr 0,5
  const formlar = Object.values(ek.form ?? {});
  const form = formlar.length ? formlar.reduce((t, x) => t + x, 0) / formlar.length : 0.5;
  const uyari = -Math.min(2, 0.5 * (k.risk_uyarilari?.length ?? 0));
  const ham = 1 + olasilik + deger + uyum + veri + form + uyari;
  return { puan: sinirla(Math.round(ham), 1, 10), ham: r1(ham), olasilik: r1(olasilik), deger: r1(deger), uyum: r1(uyum), veri: r1(veri), form: r1(form), uyari: r1(uyari) };
}

export const tabanYazi = (t) => `TABAN PUAN ${t.puan}/10 (olasılık ${t.olasilik}/3, değer ${t.deger}/2, iki model uyumu ${t.uyum}/2, bağımsız veri ${t.veri}/1, form ${t.form}/1, uyarı ${t.uyari}) → senin puanın ${Math.max(1, t.puan - PUAN_ESNEKLIK)}-${Math.min(10, t.puan + PUAN_ESNEKLIK)} arasında olmalı`;

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

// ---------------- Ders notları (karneden, kodla; token harcamaz) ----------------
// Yeterli sonuç biriken yerlerde modelin nerede yanıldığını kısa cümlelerle söyler. Revio puanlarken, ajanlar aday paketinde görür.
export function dersNotlari({ ajan } = {}) {
  const k = tutmaKarnesi();
  const notlar = [];
  const fark = (g) => (g.tahminOran == null ? null : Math.round((g.tutma - g.tahminOran) * 10) / 10);
  for (const g of k.bahisler) {
    const d = fark(g);
    if (g.n >= 12 && d != null && Math.abs(d) >= 8) notlar.push(`"${g.ad}" seçimleri modelin dediğinden ${Math.abs(d)} puan ${d < 0 ? 'AZ' : 'fazla'} tuttu (${g.n} seçim: model %${g.tahminOran}, gerçek %${g.tutma})${d < 0 ? ' → bu bahiste modele fazla güvenme' : ''}.`);
  }
  for (const g of k.dilimler) {
    const d = fark(g);
    if (g.n >= 8 && d != null && Math.abs(d) >= 10) notlar.push(`Oran modeli ${g.ad} olasılık verdiğinde gerçekte %${g.tutma} tuttu (${g.n} seçim, model ort. %${g.tahminOran}).`);
  }
  if (ajan) {
    const a = k.ajanlar.find(x => x.ad === ajan), d = a && fark(a);
    if (a && a.n >= 10 && d != null && Math.abs(d) >= 8) notlar.push(`Senin seçimlerin modelin dediğinden ${Math.abs(d)} puan ${d < 0 ? 'az' : 'fazla'} tuttu (${a.n} seçim: model %${a.tahminOran}, gerçek %${a.tutma}).`);
  }
  const kv = k.kiyas;
  if (kv.n >= 30 && kv.oranModeli != null && kv.bagimsizModel != null && Math.abs(kv.oranModeli - kv.bagimsizModel) >= 0.005) {
    notlar.push(`${kv.n} seçimde ${kv.bagimsizModel < kv.oranModeli ? 'bağımsız model' : 'oran modeli'} daha isabetli çıktı (Brier ${Math.min(kv.oranModeli, kv.bagimsizModel)} – ${Math.max(kv.oranModeli, kv.bagimsizModel)}).`);
  }
  const isaret = db.prepare(`SELECT k.degistirilmeli, s.mac_kodu, s.sonuc FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    WHERE s.sonuc IN ('tuttu','yatti') AND k.puan IS NOT NULL`).all().reduce((t, r) => {
    const g = JSON.parse(r.degistirilmeli || '[]').includes(r.mac_kodu) ? t.i : t.d; g[0]++; if (r.sonuc === 'tuttu') g[1]++; return t;
  }, { i: [0, 0], d: [0, 0] });
  if (isaret.i[0] >= 10 && isaret.d[0] >= 10) {
    const [pi, pd] = [isaret.i[1] / isaret.i[0], isaret.d[1] / isaret.d[0]];
    if (Math.abs(pi - pd) >= 0.1) notlar.push(`Hakan Revio'nun "değiştirilmeli" dediği maçlar %${Math.round(pi * 100)}, demedikleri %${Math.round(pd * 100)} tuttu${pi < pd ? ' → işaretlenen maçı kupondan çıkarmak işe yarıyor' : ''}.`);
  }
  return notlar.slice(0, 6);
}
export const dersYazi = (notlar) => (notlar.length ? `DERS NOTLARI (sonuçlardan, kodla):\n- ${notlar.join('\n- ')}` : '');
