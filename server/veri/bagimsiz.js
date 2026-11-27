// Bağımsız güç modeli: iddaa oranlarını HİÇ kullanmadan, ESPN puan durumundaki atılan/yenilen gollerden
// her takımın hücum/savunma gücünü çıkarır ve Poisson ile maç olasılıklarını hesaplar (ClubElo'nun yerini tutar).
// Oran modeliyle (server/model) karşılaştırınca "iddaa ne diyor, sahadaki güç ne diyor" farkı görünür.
import { espnLig, puanDurumu, takimBul } from './espn.js';

const EV_AVANTAJI = 1.12, DEP_CARPAN = 0.89, ILK_YARI_PAYI = 0.45, KUCULTME = 6;   // KUCULTME: az maçlı takımı lig ortalamasına çeker

const poi = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };

export function olasiliklar(lh, la) {
  let p1 = 0, p0 = 0, p2 = 0, ust25 = 0, kg = 0;
  for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) {
    const p = poi(lh, h) * poi(la, a);
    if (h > a) p1 += p; else if (h === a) p0 += p; else p2 += p;
    if (h + a > 2.5) ust25 += p;
    if (h > 0 && a > 0) kg += p;
  }
  const yariKg = (pay) => (1 - Math.exp(-lh * pay)) * (1 - Math.exp(-la * pay));
  return { p1, p0, p2, ust25, kg, ikiYariKg: yariKg(ILK_YARI_PAYI) * yariKg(1 - ILK_YARI_PAYI) };
}

/** mac: { lig, ev, deplasman } → { lh, la, ...olasılıklar, ev, dep (eşleşen ESPN takımları) } ya da null */
export async function bagimsizModel(mac, fetchFn) {
  const slug = espnLig(mac.lig); if (!slug) return null;
  const tablo = (await puanDurumu(slug, fetchFn)).filter(t => t.o > 0);
  if (tablo.length < 4) return null;
  const ev = takimBul(mac.ev, tablo), dep = takimBul(mac.deplasman, tablo);
  if (!ev || !dep || ev === dep) return null;
  const ort = tablo.reduce((x, t) => x + t.ag, 0) / tablo.reduce((x, t) => x + t.o, 0);   // takım başına maç başı gol
  const guc = (t) => {
    const w = t.o / (t.o + KUCULTME);
    return { hucum: w * (t.ag / t.o / ort) + (1 - w), savunma: w * (t.yg / t.o / ort) + (1 - w) };
  };
  const g1 = guc(ev), g2 = guc(dep);
  const lh = ort * g1.hucum * g2.savunma * EV_AVANTAJI, la = ort * g2.hucum * g1.savunma * DEP_CARPAN;
  return { slug, ev, dep, lh, la, ...olasiliklar(lh, la) };
}

/** Bağımsız modelin bir seçime verdiği olasılık (yalnızca modelin kapsadığı bahisler; diğerleri null) */
export function secimOlasiligi(b, bahis, secim) {
  if (!b) return null;
  const ms = { 1: b.p1, 0: b.p0, 2: b.p2 };
  if (bahis === 'Maç Sonucu') return ms[secim] ?? null;
  if (bahis === 'Çifte Şans') { const p = secim.split(' ve ').map(x => ms[x.trim()]); return p.every(x => x != null) ? p.reduce((t, x) => t + x, 0) : null; }
  if (bahis === 'Alt/Üst 2.5') return secim === 'Üst' ? b.ust25 : secim === 'Alt' ? 1 - b.ust25 : null;
  if (bahis === 'Karşılıklı Gol') return secim === 'Var' ? b.kg : secim === 'Yok' ? 1 - b.kg : null;
  if (bahis === '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur' && secim === 'Evet / Evet') return b.ikiYariKg;
  return null;
}

/** Kupon araçları için: maç kodu → { verili, model } (ESPN'e ulaşılamazsa o maç atlanır, kural uygulanmaz) */
export async function bagimsizHarita(maclar, fetchFn) {
  const out = {};
  for (const m of maclar) {
    try { const b = await bagimsizModel(m, fetchFn); out[String(m.mac_kodu)] = { verili: !!b, model: b }; } catch { /* ağ hatası */ }
  }
  return out;
}

const y = (p) =>`%${(p * 100).toFixed(p < 0.1 ? 1 : 0)}`;
export function bagimsizYazi(b) {
  return `Bağımsız güç modeli (ESPN puan durumu, iddaa oranı kullanılmadan): λ ${b.lh.toFixed(2)}-${b.la.toFixed(2)} | ` +
    `1 ${y(b.p1)} · 0 ${y(b.p0)} · 2 ${y(b.p2)} | Üst 2.5 ${y(b.ust25)} | KG Var ${y(b.kg)} | İki yarıda KG ${y(b.ikiYariKg)}` +
    ` [${b.ev.ad} ${b.ev.sira}. sıra ${b.ev.o} maç ${b.ev.ag}-${b.ev.yg} gol; ${b.dep.ad} ${b.dep.sira}. sıra ${b.dep.o} maç ${b.dep.ag}-${b.dep.yg} gol]`;
}
