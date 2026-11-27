// Aday paketi (token tasarrufu): bir ajanın kurallarına uyan en iyi seçim adaylarını KODLA süzer ve kısa bir tabloyla verir.
// Ajan bülteni tek tek taramak yerine tek çağrıyla başlar; analiz (karakter, karar) yine ajanın kendisindedir.
// Süzgeçler: başlamamış maç, lig filtreleri, "yalnızca verili" (ESPN), ajanın bahis kısıtı, seçim başına oran aralığı,
// Nikah Dairesi çelişki kuralı (bağımsız model oran modelinden çok düşükse aday gösterilmez).
import { getSettings } from '../settings.js';
import { gunBulteni, listMatches } from '../bulletin/store.js';
import { secimModeli } from '../model/index.js';
import { espnLig } from '../veri/espn.js';
import { bagimsizModel, secimOlasiligi } from '../veri/bagimsiz.js';
import { AGENTS } from './definitions.js';

const yz = (p) => (p == null ? '–' : `%${Math.round(p * 100)}`);
const dg = (d) => (d == null ? '–' : `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))}%`);

/** Ajanın kupon aralığından tek seçim için makul oran aralığı (ör. Öz23 2-5 oran, 2-4 maç → 1,19-2,24) */
export function secimOranAraligi(a, settings) {
  const alt = Math.max(settings.tekMacMinOran, Math.pow(a.minOran, 1 / a.maxMac));
  const ust = Math.min(settings.tekMacMaxOran, Math.pow(a.maxOran, 1 / a.minMac));
  return [Math.round(alt * 100) / 100, Math.round(ust * 100) / 100];
}

export async function adayPaketi(ajan, gun, { settings = getSettings(), adet, fetchFn } = {}) {
  const a = settings.ajanlar?.[ajan], A = AGENTS[ajan];
  if (!a || !A) return { hata: `${ajan} için kupon ayarı yok.` };
  const b = gunBulteni(gun);
  if (!b) return { hata: `${gun} için bültende maç yok.` };
  adet ??= settings.tokenTasarrufu?.adaySayisi ?? 15;
  const [lo, hi] = secimOranAraligi(a, settings);
  const desen = A.bahisDeseni ? new RegExp(A.bahisDeseni) : null;
  const kisitli = !!(A.bahisler || desen);
  const yaklasikSerbest = kisitli || ajan === 'hizli-genc';
  let maclar = listMatches(b.id, { gun, ligler: settings.ligDahil, haricLigler: settings.ligHaric, baslamamisSonra: Date.now() + 10 * 60000 });
  if (a.yalnizcaVerili) maclar = maclar.filter(m => espnLig(m.lig));

  const adaylar = [];
  for (const m of maclar) {
    let en = null;
    for (const o of m.oranlar) {
      if (o.oran < lo || o.oran > hi) continue;
      if (A.bahisler && !A.bahisler.includes(o.bahis)) continue;
      if (A.secimler && !A.secimler.includes(o.secim)) continue;
      if (desen && !desen.test(o.bahis)) continue;
      const md = secimModeli(m.id, o.bahis, o.secim, o.oran);
      if (md.deger == null || (md.yaklasik && !yaklasikSerbest)) continue;
      if (A.adayMinOlasilik && (md.model ?? 0) < A.adayMinOlasilik) continue;   // ör. Öz23: son parayı basacak kadar olası
      if (!en || md.deger > en.md.deger) en = { o, md };
    }
    if (en) adaylar.push({ m, ...en });
  }
  adaylar.sort((x, y) => y.md.deger - x.md.deger);

  // Bağımsız model yalnızca öndeki adaylar için (ESPN puan durumu önbellekli); çelişen aday elenir
  const celiskiRet = settings.riskKurulu?.celiskiRet;
  const secilen = [];
  for (const x of adaylar.slice(0, adet * 3)) {
    let bag = null, verili = false;
    if (espnLig(x.m.lig)) { try { const bm = await bagimsizModel(x.m, fetchFn); verili = !!bm; bag = bm ? secimOlasiligi(bm, x.o.bahis, x.o.secim) : null; } catch { /* ESPN yok */ } }
    if (a.yalnizcaVerili && !verili) continue;
    if (bag != null && celiskiRet != null && x.md.model - bag > celiskiRet) continue;
    secilen.push({ ...x, bag });
    if (secilen.length >= adet * 2) break;
  }
  // İki modelin de desteklediği seçimler öne: bağımsız model kapsıyorsa küçük, oran modelinden iyimserse ek puan
  const puan = (x) => x.md.deger + (x.bag != null ? 0.02 : 0) + (x.bag != null && x.bag >= x.md.model ? 0.02 : 0);
  secilen.sort((x, y) => puan(y) - puan(x)).splice(adet);
  return { gun, lo, hi, toplamMac: maclar.length, adaylar: secilen };
}

export function adayYazi(ajan, p) {
  if (p.hata) return p.hata;
  if (!p.adaylar.length) return `${p.gun}: kurallarına uyan aday bulunamadı (seçim başına oran ${p.lo}-${p.hi}, ${p.toplamMac} uygun maç).` +
    (AGENTS[ajan].bahisler ? ' Senin bahsin bir detay pazarı: o gün için maç detayları henüz okunmamış olabilir; Harambe’ye bulten_detay_cek gerektiğini söyle.' : ' deger_listesi ile genişleterek ara ya da Harambe’ye söyle.');
  return `ADAY PAKETİ – ${AGENTS[ajan].ad} | ${p.gun} | seçim başına oran ${p.lo}-${p.hi} | ${p.toplamMac} maç tarandı, en iyi ${p.adaylar.length} aday (değere göre; Nikah Dairesi çelişkisi olanlar elendi)\n` +
    'kod | saat | lig | maç | bahis: seçim @oran | oran modeli · değer | bağımsız model\n' +
    p.adaylar.map(x => `${x.m.mac_kodu} | ${x.m.saat} | ${x.m.lig} | ${x.m.ev} - ${x.m.deplasman} | ${x.o.bahis}: ${x.o.secim} @${x.o.oran}${x.o.mbs > 1 ? ` (MBS${x.o.mbs})` : ''} | ${yz(x.md.model)}${x.md.yaklasik ? '~' : ''} · ${dg(x.md.deger)} | ${x.bag == null ? '–' : yz(x.bag)}`).join('\n') +
    '\nNot: her maç için yalnızca en değerli seçim gösterildi; aynı maçın başka bahsi için mac_detay (bahis filtresiyle).';
}
