// Kupon kural motoru – agent'ların aralık dışına çıkmasını KOD düzeyinde engeller.
import { db, istanbulDate } from '../db.js';
import { findOdd } from '../bulletin/store.js';
import { secimModeli, yuzde, degerYazi } from '../model/index.js';
import { AGENTS } from './definitions.js';
import { secimOlasiligi } from '../veri/bagimsiz.js';

export const r2 = (x) => Math.round(x * 100) / 100;
const norm = (s) => (s || '').toLocaleLowerCase('tr-TR');

/** O gün için aktif kuponların toplam tutarı (hariç tutulacak kupon id'si verilebilir) */
export function dailyTotal(tarih, haricId = null) {
  const row = db.prepare("SELECT COALESCE(SUM(tutar),0) t FROM kuponlar WHERE tarih = ? AND durum = 'aktif' AND id IS NOT ?").get(tarih, haricId);
  return row.t;
}

/**
 * @param {object} p  { ajan, secimler:[{mac_kodu,bahis,secim,gerekce}], revize_edilen_kupon_id? }
 * @param {object} ctx { bulten, gun, settings, oturumId } – gun: kuponun maç günü (verilmezse bülten.tarih)
 * @returns {{ ok:boolean, hatalar:string[], kupon?:object }}
 */
export function validateCoupon(p, { bulten, gun, settings, oturumId, bagimsiz }) {
  gun ??= bulten?.tarih;
  const hatalar = [];
  const a = settings.ajanlar[p.ajan];
  if (!a) return { ok: false, hatalar: [`Bilinmeyen kupon ajanı: ${p.ajan}`] };
  if (!a.aktif) return { ok: false, hatalar: [`${p.ajan} şu an ayarlardan pasif.`] };
  if (!bulten) return { ok: false, hatalar: [`${gun ?? 'Bu gün'} için bültende maç yok. Önce bülten çekilmeli/yüklenmeli.`] };

  let revize = null;
  if (p.revize_edilen_kupon_id) {
    revize = db.prepare('SELECT * FROM kuponlar WHERE id = ?').get(p.revize_edilen_kupon_id);
    if (!revize || revize.ajan !== p.ajan) hatalar.push('Revize edilecek kupon bulunamadı veya başka ajana ait.');
    else if (revize.durum !== 'aktif') hatalar.push(`#${revize.id} zaten ${revize.durum}.`);
  } else if (oturumId) {
    const n = db.prepare("SELECT COUNT(*) n FROM kuponlar WHERE oturum_id = ? AND ajan = ? AND durum = 'aktif'").get(oturumId, p.ajan).n;
    if (n >= a.kuponSayisi) hatalar.push(`Bu oturumda en fazla ${a.kuponSayisi} kupon hakkın var (şu an ${n}). Yeni kupon yerine revize et.`);
  }

  const secimler = p.secimler ?? [];
  if (secimler.length < a.minMac || secimler.length > a.maxMac) {
    hatalar.push(`Maç sayısı ${secimler.length}; senin aralığın ${a.minMac}-${a.maxMac}.`);
  }
  const kodlar = secimler.map(s => String(s.mac_kodu));
  const dup = kodlar.filter((k, i) => kodlar.indexOf(k) !== i);
  if (dup.length) hatalar.push(`Aynı maçtan birden fazla seçim olamaz: ${[...new Set(dup)].join(', ')}`);

  const detay = [];
  for (const s of secimler) {
    const f = findOdd(bulten.id, s.mac_kodu, s.bahis, s.secim);
    if (!f.mac) { hatalar.push(`${s.mac_kodu}: bu kod bültende yok.`); continue; }
    if (!f.oran) {
      hatalar.push(`${s.mac_kodu}: "${s.bahis}" / "${s.secim}" bültende yok. ` +
        (f.secenekler?.length ? `Geçerli seçimler: ${f.secenekler.join(', ')}` : `Mevcut bahisler: ${f.bahisler.slice(0, 12).join(' | ')}`));
      continue;
    }
    const m = f.mac; const o = f.oran;
    // Bazı ajanlar yalnızca belirli bahis/seçimleri oynar (ör. İnatçı Enişte: iki yarıda KG → Evet / Evet)
    const izinli = AGENTS[p.ajan]?.bahisler, izinliSecim = AGENTS[p.ajan]?.secimler;
    if (izinli && !izinli.includes(o.bahis)) { hatalar.push(`${s.mac_kodu}: "${o.bahis}" senin bahsin değil; yalnızca şunu oynayabilirsin: ${izinli.join(', ')}${izinliSecim ? ' → ' + izinliSecim.join(', ') : ''}.`); continue; }
    if (izinliSecim && !izinliSecim.includes(o.secim)) { hatalar.push(`${s.mac_kodu}: "${o.secim}" seçimi senin değil; yalnızca ${izinliSecim.join(', ')} oynayabilirsin.`); continue; }
    if (m.gun && m.gun !== gun) hatalar.push(`${s.mac_kodu}: bu maç ${m.gun} gününde; kupon ${gun} günü için. Yalnızca o günün maçlarını seç.`);
    if (m.baslama && new Date(m.baslama).getTime() < Date.now() + 5 * 60000) hatalar.push(`${s.mac_kodu}: maç başlamış ya da başlamak üzere.`);
    if (o.oran < settings.tekMacMinOran || o.oran > settings.tekMacMaxOran) {
      hatalar.push(`${s.mac_kodu}: oran ${o.oran} tek maç aralığı dışında (${settings.tekMacMinOran}-${settings.tekMacMaxOran}).`);
    }
    if (settings.ligDahil?.length && !settings.ligDahil.some(l => norm(m.lig).includes(norm(l)))) hatalar.push(`${s.mac_kodu}: ${m.lig} dahil ligler listesinde değil.`);
    if (settings.ligHaric?.some(l => norm(m.lig).includes(norm(l)))) hatalar.push(`${s.mac_kodu}: ${m.lig} hariç tutulan ligde.`);
    const md = secimModeli(m.id, o.bahis, o.secim, o.oran);
    // Bağımsız güç modeli (ESPN): bagimsiz[kod] = { verili, model? } – çağıran (araç) önceden hesaplar; verilmezse kontrol yapılmaz
    const bg = bagimsiz?.[String(m.mac_kodu)];
    if (a.yalnizcaVerili && bg && !bg.verili) hatalar.push(`${s.mac_kodu}: ${m.lig} / ${m.ev} - ${m.deplasman} için bağımsız veri (ESPN puan durumu) yok; sen yalnızca verisi olan maçları oynayabilirsin (mac_detay'da "Bağımsız güç modeli" satırı olanlar).`);
    detay.push({ mac_kodu: m.mac_kodu, mac_adi: `${m.ev} - ${m.deplasman}`, lig: m.lig, saat: m.saat, bahis: o.bahis, secim: o.secim, oran: o.oran, mbs: o.mbs ?? 1, gerekce: s.gerekce ?? '',
      model_olasilik: md.model, piyasa_olasilik: md.piyasa, deger: md.deger, yaklasik: !!md.yaklasik,
      bagimsiz_olasilik: bg?.verili ? secimOlasiligi(bg.model, o.bahis, o.secim) : null });
  }

  if (settings.mbsKurali && detay.length) {
    const maxMbs = Math.max(...detay.map(d => d.mbs || 1));
    if (detay.length < maxMbs) {
      const bozan = detay.filter(d => d.mbs > detay.length).map(d => `${d.mac_kodu}(MBS ${d.mbs})`).join(', ');
      hatalar.push(`MBS kuralı: kuponda ${detay.length} maç var, ${bozan} için en az ${maxMbs} maç gerekir.`);
    }
  }

  const toplamOran = r2(detay.reduce((x, d) => x * d.oran, 1));
  if (detay.length === secimler.length && (toplamOran < a.minOran || toplamOran > a.maxOran)) {
    hatalar.push(`Toplam oran ${toplamOran}; senin aralığın ${a.minOran}-${a.maxOran}.`);
  }

  const tutar = a.tutar;
  const gunToplam = dailyTotal(gun, revize?.id ?? null);
  if (gunToplam + tutar > settings.gunlukButce) {
    hatalar.push(`Günlük bütçe aşılır: mevcut ${gunToplam} TL + ${tutar} TL > ${settings.gunlukButce} TL.`);
  }

  if (hatalar.length) return { ok: false, hatalar };
  // Kuponun model olasılığı: seçimler farklı maçlardan olduğundan bağımsız varsayılır (çarpım)
  const modelVar = detay.every(d => d.model_olasilik != null);
  const modelOlasilik = modelVar ? detay.reduce((x, d) => x * d.model_olasilik, 1) : null;

  const rk = riskKurulu(detay, { gun, settings, haricId: revize?.id ?? null });
  if (rk.hatalar.length) return { ok: false, hatalar: rk.hatalar };
  return {
    ok: true, hatalar: [],
    kupon: { risk_uyarilari: rk.uyarilar, ajan: p.ajan, tarih: gun, bulten_id: bulten.id, tutar, toplam_oran: toplamOran, olasi_kazanc: r2(tutar * toplamOran), secimler: detay, revize_of: revize?.id ?? null,
      model_olasilik: modelOlasilik == null ? null : Math.round(modelOlasilik * 1e6) / 1e6,
      beklenen_getiri: modelOlasilik == null ? null : Math.round((modelOlasilik * toplamOran - 1) * 1e4) / 1e4 },
  };
}

const yz = (x) => `%${(x * 100).toFixed(0)}`;
/**
 * Risk kurulu: temel kurallardan geçen kuponu model değeri, lig yoğunluğu ve o günün diğer kuponlarıyla
 * çakışma açısından denetler. Ağır durumlar ret (hatalar), sınırdakiler uyarı olarak kupona yazılır.
 */
export function riskKurulu(detay, { gun, settings, haricId = null }) {
  const r = settings.riskKurulu;
  const hatalar = [], uyarilar = [];
  if (!r?.aktif || !detay.length) return { hatalar, uyarilar };

  // 1) Kötü değerli seçimler (iki yarı tahminli "yaklaşık" bahisler sayılmaz)
  const kotu = detay.filter(d => d.deger != null && !d.yaklasik && d.deger < r.kotuDeger);
  const kotuYazi = kotu.map(d => `${d.mac_kodu} ${d.bahis}: ${d.secim} (${degerYazi(d.deger)})`).join(', ');
  if (kotu.length > r.maxKotuSecim) hatalar.push(`Nikah Dairesi (risk kurulu): ${kotu.length} seçimin model değeri ${yz(r.kotuDeger)}'nin altında (en fazla ${r.maxKotuSecim}): ${kotuYazi}. Bunları değiştir.`);
  else if (kotu.length) uyarilar.push(`Kötü değerli seçim: ${kotuYazi}`);

  // 2) Seçim başına ortalama değer (geometrik): kupon genelinde marjın üstünde kayıp var mı?
  const degerli = detay.filter(d => d.deger != null && !d.yaklasik);
  if (degerli.length) {
    const ort = Math.pow(degerli.reduce((x, d) => x * (1 + d.deger), 1), 1 / degerli.length) - 1;
    if (ort < r.retOrtalamaDeger) hatalar.push(`Nikah Dairesi (risk kurulu): seçim başına ortalama model değeri ${degerYazi(ort)}; sınır ${yz(r.retOrtalamaDeger)}. Bültenin olağan marjından kötü seçimler var, daha değerli seçimlere geç (deger_listesi).`);
    else if (ort < r.uyariOrtalamaDeger) uyarilar.push(`Seçim başına ortalama değer ${degerYazi(ort)} (olağan marjın altında)`);
  }

  // 3) Lig yoğunluğu: tek ligin sürprizi kuponu toptan yakar
  if (detay.length >= 3) {
    const sayac = {};
    for (const d of detay) sayac[d.lig] = (sayac[d.lig] ?? 0) + 1;
    for (const [lig, n] of Object.entries(sayac)) if (n / detay.length > r.ligYogunluk) uyarilar.push(`Lig yoğunluğu: ${detay.length} maçın ${n}'i ${lig}`);
  }

  // 4b) İki model çelişkisi: oran modeli seçimi destekliyor ama bağımsız güç modeli (ESPN) belirgin şekilde daha düşük veriyor
  if (r.celiskiUyari != null) {
    for (const d of detay) {
      if (d.bagimsiz_olasilik == null || d.model_olasilik == null) continue;
      const fark = d.model_olasilik - d.bagimsiz_olasilik;
      if (fark <= r.celiskiUyari) continue;
      const yazi = `${d.mac_kodu} ${d.bahis}: ${d.secim} → oran modeli ${yz(d.model_olasilik)}, bağımsız model ${yz(d.bagimsiz_olasilik)}`;
      if (r.celiskiRet != null && fark > r.celiskiRet) hatalar.push(`Nikah Dairesi (risk kurulu): iki model çelişiyor (${yazi}). Sahadaki güç bu seçimi desteklemiyor; başka maç seç.`);
      else uyarilar.push(`İki model çelişiyor: ${yazi}`);
    }
  }

  // 4) O günün diğer aktif kuponlarıyla çakışma (aynı maç, aynı seçim): tek sonuç birden çok kuponu yakar
  const ayni = db.prepare(`SELECT s.kupon_id, k.ajan FROM kupon_secimleri s JOIN kuponlar k ON k.id = s.kupon_id
    WHERE k.tarih = ? AND k.durum = 'aktif' AND k.id IS NOT ? AND s.mac_kodu = ? AND s.bahis = ? AND s.secim = ?`);
  for (const d of detay) {
    const rows = ayni.all(gun, haricId, d.mac_kodu, d.bahis, d.secim);
    if (!rows.length) continue;
    const yazi = `${d.mac_kodu} ${d.bahis}: ${d.secim} → ${rows.map(x => `#${x.kupon_id}`).join(', ')}`;
    if (rows.length + 1 > r.maxAyniMac) hatalar.push(`Nikah Dairesi (risk kurulu): ${yazi} kuponlarında da var; aynı seçim bugün en fazla ${r.maxAyniMac} kuponda olabilir. Başka maç seç.`);
    else uyarilar.push(`Diğer kuponlarla ortak: ${yazi}`);
  }
  return { hatalar, uyarilar };
}

export function saveCoupon(k, { oturumId, risk, aciklama }) {
  db.exec('BEGIN');
  try {
    if (k.revize_of) db.prepare("UPDATE kuponlar SET durum = 'revize_edildi' WHERE id = ?").run(k.revize_of);
    const { lastInsertRowid: id } = db.prepare(`INSERT INTO kuponlar(oturum_id, bulten_id, ajan, tarih, olusturma, tutar, toplam_oran, olasi_kazanc, risk, aciklama, revize_of, model_olasilik, beklenen_getiri, risk_uyarilari)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(oturumId ?? null, k.bulten_id, k.ajan, k.tarih, new Date().toISOString(), k.tutar, k.toplam_oran, k.olasi_kazanc, risk ?? null, aciklama ?? null, k.revize_of,
      k.model_olasilik ?? null, k.beklenen_getiri ?? null, k.risk_uyarilari?.length ? JSON.stringify(k.risk_uyarilari) : null);
    const ins = db.prepare('INSERT INTO kupon_secimleri(kupon_id, mac_kodu, mac_adi, lig, saat, bahis, secim, oran, mbs, gerekce, model_olasilik, piyasa_olasilik, deger, bagimsiz_olasilik) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const s of k.secimler) ins.run(id, s.mac_kodu, s.mac_adi, s.lig, s.saat, s.bahis, s.secim, s.oran, s.mbs, s.gerekce, s.model_olasilik ?? null, s.piyasa_olasilik ?? null, s.deger ?? null, s.bagimsiz_olasilik ?? null);
    db.exec('COMMIT');
    return Number(id);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function getCoupon(id) {
  const k = db.prepare('SELECT * FROM kuponlar WHERE id = ?').get(id);
  if (!k) return null;
  k.secimler = db.prepare('SELECT * FROM kupon_secimleri WHERE kupon_id = ? ORDER BY saat, id').all(id);
  k.degistirilmeli = k.degistirilmeli ? JSON.parse(k.degistirilmeli) : [];
  k.risk_uyarilari = k.risk_uyarilari ? JSON.parse(k.risk_uyarilari) : [];
  return k;
}

export function listCoupons({ oturumId, tarih, minTarih, durum = 'aktif', ajan } = {}) {
  const w = []; const v = [];
  if (oturumId) { w.push('oturum_id = ?'); v.push(oturumId); }
  if (tarih) { w.push('tarih = ?'); v.push(tarih); }
  if (minTarih) { w.push('tarih >= ?'); v.push(minTarih); }
  if (durum) { w.push('durum = ?'); v.push(durum); }
  if (ajan) { w.push('ajan = ?'); v.push(ajan); }
  const ids = db.prepare(`SELECT id FROM kuponlar ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id`).all(...v);
  return ids.map(r => getCoupon(r.id));
}

export function couponText(k) {
  const lines = k.secimler.map(s => `  ${s.mac_kodu} | ${s.saat ?? ''} | ${s.mac_adi} (${s.lig}) | ${s.bahis}: ${s.secim} @ ${s.oran} | MBS ${s.mbs}` +
    (s.model_olasilik != null ? ` | model ${yuzde(s.model_olasilik)} değer ${degerYazi(s.deger)}` : '') + (s.gerekce ? ` | gerekçe: ${s.gerekce}` : ''));
  return `Kupon #${k.id} [${k.ajan}] toplam oran ${k.toplam_oran}, ${k.tutar} TL → olası ${k.olasi_kazanc} TL, risk: ${k.risk ?? '-'}` +
    (k.model_olasilik != null ? `, model tutma ${yuzde(k.model_olasilik, 2)}, beklenen getiri ${degerYazi(k.beklenen_getiri)}` : '') +
    (k.puan ? `, puan ${k.puan}/10` : '') + `\n${lines.join('\n')}` +
    (k.risk_uyarilari?.length ? `\n  Nikah Dairesi uyarıları: ${k.risk_uyarilari.join(' · ')}` : '') +
    (k.lehte ? `\n  Lehte: ${k.lehte}` : '') + (k.aleyhte ? `\n  Aleyhte: ${k.aleyhte}` : '') +
    (k.elestiri ? `\n  Eleştiri: ${k.elestiri}` : '');
}

export { istanbulDate };
