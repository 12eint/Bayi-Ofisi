// Spor Toto: haftalık 15 maçlık program (iddaa'nın Spor Toto sayfasının kullandığı açık uç), sistemli kolon önerisi,
// tutar limiti ve sonuç değerlendirmesi. Ofis yalnızca ÖNERİ üretir; kupon oynanmaz.
// Kolon sayısı = her maçta işaretlenen sonuç sayılarının çarpımı; tutar = kolon × kolon ücreti (Ayarlar → Spor Toto).
import { db, nowIso } from './db.js';
import { getSettings } from './settings.js';
import { gunBulteni, listMatches } from './bulletin/store.js';
import { secimModeli } from './model/index.js';
import { takimBul, macSonucu } from './veri/espn.js';
import { bagimsizModel } from './veri/bagimsiz.js';

db.exec(`
CREATE TABLE IF NOT EXISTS toto_program (donem INTEGER PRIMARY KEY, zaman INTEGER NOT NULL, veri TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS toto_kuponlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, oturum_id INTEGER, ajan TEXT NOT NULL, donem INTEGER NOT NULL, olusturma TEXT NOT NULL,
  kolon INTEGER NOT NULL, tutar REAL NOT NULL, risk TEXT, aciklama TEXT, model_olasilik REAL, durum TEXT DEFAULT 'aktif',
  revize_of INTEGER, dogru INTEGER, sonuclanan INTEGER);
CREATE TABLE IF NOT EXISTS toto_secimleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT, toto_id INTEGER NOT NULL REFERENCES toto_kuponlar(id) ON DELETE CASCADE,
  mac_no INTEGER NOT NULL, mac_adi TEXT, lig TEXT, tarih TEXT, secim TEXT NOT NULL, gerekce TEXT, sonuc TEXT, tuttu INTEGER);
`);

const URL_TOTO = 'https://sportotov2.iddaa.com/SporToto';
const BASLIK = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json', Origin: 'https://www.iddaa.com', Referer: 'https://www.iddaa.com/' };
// Spor Toto lig kısaltması → bültendeki / ESPN eşlemesindeki lig adı
const LIG = { 'SÜPL': 'Türkiye Süper Lig', 'TFF1': 'Türkiye 1. Lig', 'ALBU': 'Almanya Bundesliga', 'FR1': 'Fransa Ligue 1', 'İNP': 'İngiltere Premier Lig',
  'İSPL1': 'İspanya La Liga', 'İTA1': 'İtalya Serie A', 'İTSA': 'İtalya Serie A', 'HOL1': 'Hollanda Eredivisie', 'POR1': 'Portekiz Premier Lig', 'İNC': 'İngiltere Championship' };
export const totoLig = (kisa) => LIG[kisa] ?? kisa;
const temizAd = (s) => s.replace(/\bA\.?Ş\.?/gi, '').replace(/\s+/g, ' ').trim();
const takimlar = (ad) => { const i = ad.indexOf('-'); return i < 0 ? [ad, ''] : [temizAd(ad.slice(0, i)), temizAd(ad.slice(i + 1))]; };

/** Güncel program (30 dk önbellek). Dönem bilgisi + 15 maç. */
export async function totoProgrami({ fetchFn = fetch, tazelikDk = 30 } = {}) {
  const son = db.prepare('SELECT * FROM toto_program ORDER BY donem DESC LIMIT 1').get();
  if (son && Date.now() - son.zaman < tazelikDk * 60000) return JSON.parse(son.veri);
  try {
    const y = await fetchFn(URL_TOTO, { headers: BASLIK, signal: AbortSignal.timeout(20000) });
    if (!y.ok) throw new Error(`Spor Toto ${y.status}`);
    const d = (await y.json()).data;
    const p = {
      donem: d.gameCycleNo, ad: d.programName ?? null, baslangic: d.payinBeginDate, bitis: d.payinEndDate,
      maclar: (d.events ?? []).map(e => {
        const [ev, dep] = takimlar(e.eventName);
        return { no: e.eventNo, ad: e.eventName, ev, dep, lig: totoLig(e.competitionName), ligKisa: e.competitionName, tarih: e.eventDate,
          halk: { 1: e.homePercentage, 0: e.drawPercentage, 2: e.awayPercentage }, sonuc: e.winner ?? null };
      }).sort((a, b) => a.no - b.no),
    };
    db.prepare('INSERT INTO toto_program(donem, zaman, veri) VALUES(?,?,?) ON CONFLICT(donem) DO UPDATE SET zaman = excluded.zaman, veri = excluded.veri').run(p.donem, Date.now(), JSON.stringify(p));
    return p;
  } catch (e) {
    if (son) return JSON.parse(son.veri);
    throw e;
  }
}
export const donemProgrami = (donem) => { const r = db.prepare('SELECT veri FROM toto_program WHERE donem = ?').get(donem); return r ? JSON.parse(r.veri) : null; };

/** Programdaki maçları bültendeki maçlarla eşleştirip oran modeli + bağımsız model olasılıklarını ekler */
export async function totoAnaliz(p, { fetchFn } = {}) {
  const out = [];
  for (const m of p.maclar) {
    const gun = m.tarih?.slice(0, 10);
    const b = gun ? gunBulteni(gun) : null;
    let bm = null, oran = null, model = null, bag = null;
    if (b) {
      const adaylar = listMatches(b.id, { gun }).map(x => ({ ad: x.ev, x }));
      const ev = takimBul(m.ev, adaylar);
      const depAdaylar = listMatches(b.id, { gun }).map(x => ({ ad: x.deplasman, x }));
      const dep = takimBul(m.dep, depAdaylar);
      if (ev && dep && ev.x.id === dep.x.id) bm = ev.x;
    }
    if (bm) {
      oran = Object.fromEntries(['1', '0', '2'].map(s => [s, bm.oranlar.find(o => o.bahis === 'Maç Sonucu' && o.secim === s)?.oran ?? null]));
      model = Object.fromEntries(['1', '0', '2'].map(s => [s, oran[s] ? secimModeli(bm.id, 'Maç Sonucu', s, oran[s]).model : null]));
    }
    try { const x = await bagimsizModel({ lig: m.lig, ev: m.ev, deplasman: m.dep }, fetchFn); if (x) bag = { 1: x.p1, 0: x.p0, 2: x.p2 }; } catch { /* ESPN yok */ }
    out.push({ ...m, iddaaKod: bm?.mac_kodu ?? null, oran, model, bag });
  }
  return out;
}

const yz = (p) => (p == null ? '–' : `%${Math.round(p * 100)}`);
export function totoAnalizYazi(p, analiz, settings = getSettings()) {
  const t = settings.sporToto;
  return `SPOR TOTO ${p.donem}. dönem | oyun kapanışı ${p.bitis} | kolon ücreti ${t.kolonUcreti} TL, tutar sınırı ${t.maxTutar} TL (en fazla ${Math.floor(t.maxTutar / t.kolonUcreti)} kolon)\n` +
    analiz.map(m => `${m.no}. ${m.tarih?.slice(0, 16).replace('T', ' ')} ${m.lig} | ${m.ev} - ${m.dep}` +
      ` | halk 1:%${m.halk[1]} 0:%${m.halk[0]} 2:%${m.halk[2]}` +
      (m.oran ? ` | iddaa MS ${m.oran[1] ?? '–'}/${m.oran[0] ?? '–'}/${m.oran[2] ?? '–'} (kod ${m.iddaaKod}) oran modeli 1 ${yz(m.model[1])} 0 ${yz(m.model[0])} 2 ${yz(m.model[2])}` : ' | iddaa bülteninde eşleşmedi') +
      (m.bag ? ` | bağımsız model 1 ${yz(m.bag[1])} 0 ${yz(m.bag[0])} 2 ${yz(m.bag[2])}` : '')).join('\n');
}

/** Bir maç için seçimin tutma olasılığı: oran modeli > bağımsız model > halk yüzdesi */
const secimOlasiligi = (m, secim) => {
  const kaynak = m.model && Object.values(m.model).every(x => x != null) ? m.model : m.bag ?? { 1: m.halk[1] / 100, 0: m.halk[0] / 100, 2: m.halk[2] / 100 };
  return [...secim].reduce((t, s) => t + (kaynak[s] ?? 0), 0);
};

/**
 * Teklif doğrulama. p: { ajan, secimler:[{no, secim:"1"|"0"|"2"|"10"|"12"|"02"|"102", gerekce}], risk, aciklama, revize_edilen_toto_id? }
 * @returns {{ ok, hatalar, kupon? }}
 */
export function totoDogrula(p, { program, analiz, settings = getSettings() }) {
  const t = settings.sporToto; const hatalar = [];
  if (!t?.aktif) return { ok: false, hatalar: ['Spor Toto ayarlardan kapalı.'] };
  if (new Date(program.bitis + '+03:00').getTime() < Date.now()) hatalar.push(`${program.donem}. dönemin oyun süresi ${program.bitis} itibarıyla kapandı.`);
  const secimler = p.secimler ?? [];
  const nolar = secimler.map(s => Number(s.no));
  const eksik = program.maclar.filter(m => !nolar.includes(m.no)).map(m => m.no);
  if (eksik.length) hatalar.push(`Her 15 maç için tahmin gerekir; eksik maç no: ${eksik.join(', ')}.`);
  const tekrar = nolar.filter((n, i) => nolar.indexOf(n) !== i);
  if (tekrar.length) hatalar.push(`Aynı maç birden fazla yazılmış: ${[...new Set(tekrar)].join(', ')}.`);
  let kolon = 1;
  for (const s of secimler) {
    const secim = String(s.secim ?? '').replace(/[^102]/g, '');
    const harfler = [...new Set(secim)];
    if (!harfler.length || harfler.length !== secim.length) hatalar.push(`${s.no}. maç: "${s.secim}" geçersiz; 1, 0, 2 ya da bunların birleşimi (ör. "10", "102") yaz.`);
    kolon *= harfler.length || 1;
  }
  const tutar = kolon * t.kolonUcreti;
  if (tutar > t.maxTutar) hatalar.push(`Kolon sayısı ${kolon} → ${tutar} TL; sınır ${t.maxTutar} TL (en fazla ${Math.floor(t.maxTutar / t.kolonUcreti)} kolon). Bazı maçlarda işareti azalt.`);
  if (hatalar.length) return { ok: false, hatalar };
  const analizNo = new Map(analiz.map(m => [m.no, m]));
  const detay = secimler.map(s => { const m = analizNo.get(Number(s.no)); return { mac_no: m.no, mac_adi: `${m.ev} - ${m.dep}`, lig: m.lig, tarih: m.tarih, secim: [...new Set(String(s.secim).replace(/[^102]/g, ''))].sort((a, b) => '102'.indexOf(a) - '102'.indexOf(b)).join(''), gerekce: s.gerekce ?? '', p: secimOlasiligi(m, String(s.secim)) }; })
    .sort((a, b) => a.mac_no - b.mac_no);
  const model_olasilik = detay.reduce((x, d) => x * d.p, 1);
  return { ok: true, hatalar: [], kupon: { ajan: p.ajan, donem: program.donem, kolon, tutar, risk: p.risk ?? null, aciklama: p.aciklama ?? null, model_olasilik, secimler: detay, revize_of: p.revize_edilen_toto_id ?? null } };
}

export function totoKaydet(k, { oturumId } = {}) {
  db.exec('BEGIN');
  try {
    if (k.revize_of) db.prepare("UPDATE toto_kuponlar SET durum = 'revize_edildi' WHERE id = ?").run(k.revize_of);
    const { lastInsertRowid: id } = db.prepare('INSERT INTO toto_kuponlar(oturum_id, ajan, donem, olusturma, kolon, tutar, risk, aciklama, model_olasilik, revize_of) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(oturumId ?? null, k.ajan, k.donem, nowIso(), k.kolon, k.tutar, k.risk, k.aciklama, k.model_olasilik, k.revize_of);
    const ins = db.prepare('INSERT INTO toto_secimleri(toto_id, mac_no, mac_adi, lig, tarih, secim, gerekce) VALUES(?,?,?,?,?,?,?)');
    for (const s of k.secimler) ins.run(id, s.mac_no, s.mac_adi, s.lig, s.tarih, s.secim, s.gerekce);
    db.exec('COMMIT');
    return Number(id);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function totoKuponlari({ donem, durum = 'aktif' } = {}) {
  const w = [], v = [];
  if (donem) { w.push('donem = ?'); v.push(donem); }
  if (durum) { w.push('durum = ?'); v.push(durum); }
  return db.prepare(`SELECT * FROM toto_kuponlar ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC`).all(...v)
    .map(k => ({ ...k, secimler: db.prepare('SELECT * FROM toto_secimleri WHERE toto_id = ? ORDER BY mac_no').all(k.id) }));
}

/** Biten maçları değerlendirir: önce Spor Toto'nun kendi sonucu (winner), yoksa ESPN. Doğru sayısını günceller. */
export async function totoSonuclariGuncelle({ fetchFn } = {}) {
  const bekleyen = db.prepare(`SELECT s.*, k.donem FROM toto_secimleri s JOIN toto_kuponlar k ON k.id = s.toto_id WHERE s.sonuc IS NULL AND k.durum = 'aktif' AND s.tarih < ?`)
    .all(new Date(Date.now() - 2.5 * 3600000 + 3 * 3600000).toISOString().slice(0, 19));
  if (!bekleyen.length) return 0;
  let program = null; try { program = await totoProgrami({ fetchFn }); } catch { /* ağ yok */ }
  let n = 0; const onbellek = new Map();
  for (const s of bekleyen) {
    const pm = (program?.donem === s.donem ? program : donemProgrami(s.donem))?.maclar.find(m => m.no === s.mac_no);
    let sonuc = pm?.sonuc != null ? String(pm.sonuc).replace(/^X$/i, '0') : null;
    if (!['1', '0', '2'].includes(sonuc)) sonuc = null;
    if (!sonuc && pm) {
      const anahtar = `${pm.lig}|${pm.ev}|${pm.dep}`;
      if (!onbellek.has(anahtar)) { try { onbellek.set(anahtar, await macSonucu({ lig: pm.lig, ev: pm.ev, deplasman: pm.dep, gun: pm.tarih.slice(0, 10) }, fetchFn)); } catch { onbellek.set(anahtar, null); } }
      const r = onbellek.get(anahtar);
      if (r) sonuc = r.skor[0] > r.skor[1] ? '1' : r.skor[0] < r.skor[1] ? '2' : '0';
    }
    if (!sonuc) continue;
    db.prepare('UPDATE toto_secimleri SET sonuc = ?, tuttu = ? WHERE id = ?').run(sonuc, s.secim.includes(sonuc) ? 1 : 0, s.id); n++;
  }
  db.prepare(`UPDATE toto_kuponlar SET dogru = (SELECT SUM(tuttu) FROM toto_secimleri WHERE toto_id = toto_kuponlar.id),
    sonuclanan = (SELECT COUNT(sonuc) FROM toto_secimleri WHERE toto_id = toto_kuponlar.id) WHERE durum = 'aktif'`).run();
  return n;
}

export function totoKuponYazi(k) {
  return `Spor Toto #${k.id} [${k.ajan}] ${k.donem}. dönem | ${k.kolon} kolon, ${k.tutar} TL | 15/15 model olasılığı ${k.model_olasilik == null ? '–' : `%${(k.model_olasilik * 100).toFixed(4)}`}` +
    (k.sonuclanan ? ` | doğru ${k.dogru}/${k.sonuclanan}` : '') + `\n` + k.secimler.map(s => `  ${s.mac_no}. ${s.mac_adi}: ${s.secim}${s.sonuc ? ` (sonuç ${s.sonuc} ${s.tuttu ? '✓' : '✗'})` : ''}${s.gerekce ? ` – ${s.gerekce}` : ''}`).join('\n');
}
