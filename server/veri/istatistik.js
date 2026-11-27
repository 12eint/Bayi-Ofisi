// Maç istatistikleri (ESPN maç özeti): gol, şut, isabetli şut, CEZA SAHASI İÇİ ŞUT (maç anlatımından), korner, topa sahip olma.
// "Rakip ceza sahasında topla buluşma" verisi erişilebilir kaynaklarda yok (FBref/FotMob bu ağdan engelli);
// yerine en yakın ölçü olarak ceza sahası içinden atılan şut sayısı kullanılır.
// Biten maçın istatistiği değişmez: özet bir kez indirilir, yalnızca çıkarılan küçük özet saklanır.
import { db } from '../db.js';
import { espnLig, takimFormu, takimBul } from './espn.js';

db.exec(`CREATE TABLE IF NOT EXISTS mac_istatistik (event_id TEXT PRIMARY KEY, slug TEXT, veri TEXT NOT NULL)`);
const BASLIK = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' };
const KUTU_ICI = /(centre of the box|left side of the box|right side of the box|six yard box|very close range|from close range)/i;
const KUTU_DISI = /(outside the box|long range|more than \d+ yards|from a direct free kick)/i;

/**
 * Maç anlatımındaki şut satırlarından takım başına ceza sahası içi / dışı şut sayısı.
 * takimlar: [{ ad, kisa }] – anlatımda takım adı kısaltılmış olabilir ("Freiburg" ↔ "SC Freiburg"), benzerlikle eşlenir.
 * Anlatımda hiç şut satırı yoksa null döner (veri yok ≠ 0 şut).
 */
export function kutuSutlari(yorumlar, takimlar) {
  const say = Object.fromEntries(takimlar.map(t => [t.ad, { ic: 0, dis: 0 }]));
  const eslesme = new Map();
  let sutSatiri = 0;
  for (const y of yorumlar ?? []) {
    const m = String(y.text ?? '');
    if (!/^(Attempt|Goal!)/.test(m) || !/(shot|header)/i.test(m)) continue;
    const parantez = m.match(/\(([^)]+)\)/)?.[1];
    if (!parantez) continue;
    if (!eslesme.has(parantez)) eslesme.set(parantez, takimBul(parantez, takimlar)?.ad ?? null);
    const takim = eslesme.get(parantez);
    if (!takim) continue;
    sutSatiri++;
    if (KUTU_ICI.test(m)) say[takim].ic++; else if (KUTU_DISI.test(m)) say[takim].dis++;
  }
  return sutSatiri ? say : null;
}

/** Tek maçın takım istatistikleri (önbellekli) → { ev, dep } her biri { ad, gol, sut, isabetli, kutuIci, kutuDisi, korner, topa } */
export async function macIstatistik(slug, eventId, fetchFn = fetch) {
  const kayit = db.prepare('SELECT veri FROM mac_istatistik WHERE event_id = ?').get(String(eventId));
  if (kayit) return JSON.parse(kayit.veri);
  const y = await fetchFn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(eventId)}`, { headers: BASLIK, signal: AbortSignal.timeout(25000) });
  if (!y.ok) throw new Error(`ESPN özet ${y.status}`);
  const j = await y.json();
  const tak = j.boxscore?.teams ?? [];
  const yarisanlar = j.header?.competitions?.[0]?.competitors ?? [];
  if (tak.length !== 2 || !j.header?.competitions?.[0]?.status?.type?.completed) return null;   // bitmemiş maç saklanmaz
  const kutu = kutuSutlari(j.commentary, tak.map(t => ({ ad: t.team.displayName, kisa: t.team.shortDisplayName })));
  const ozet = {};
  for (const t of tak) {
    const s = Object.fromEntries((t.statistics ?? []).map(x => [x.name, Number(x.displayValue)]));
    const yar = yarisanlar.find(c => String(c.team?.id) === String(t.team.id));
    const taraf = yar?.homeAway === 'away' ? 'dep' : 'ev';
    ozet[taraf] = { id: t.team.id, ad: t.team.displayName, gol: Number(yar?.score ?? NaN), sut: s.totalShots ?? null, isabetli: s.shotsOnTarget ?? null,
      kutuIci: kutu ? kutu[t.team.displayName].ic : null, kutuDisi: kutu ? kutu[t.team.displayName].dis : null, korner: s.wonCorners ?? null, topa: s.possessionPct ?? null };
  }
  if (!ozet.ev || !ozet.dep) return null;
  db.prepare('INSERT OR REPLACE INTO mac_istatistik(event_id, slug, veri) VALUES(?,?,?)').run(String(eventId), slug, JSON.stringify(ozet));
  return ozet;
}

const ort = (a) => { const x = a.filter(v => Number.isFinite(v)); return x.length ? x.reduce((t, v) => t + v, 0) / x.length : null; };
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

/** Takımın son n maçının ortalamaları: attığı/yediği gol, şut, isabetli, kutu içi şut (kendi ve rakibin), korner, maçlarda 2.5 üstü oranı */
export async function takimIstatistik(slug, takimAdi, { n = 5, fetchFn } = {}) {
  const f = await takimFormu(slug, takimAdi, { n, fetchFn });
  if (!f) return null;
  const maclar = [];
  for (const m of f.maclar) {
    let s = null;
    try { s = await macIstatistik(slug, m.id, fetchFn); } catch { /* tek maç eksik kalabilir */ }
    if (!s) continue;
    const ben = String(s.ev.id) === String(f.takim.id) ? s.ev : s.dep, o = ben === s.ev ? s.dep : s.ev;
    maclar.push({ tarih: m.tarih, rakip: m.rakip, ic: m.ic, ben, o });
  }
  const al = (fn) => r2(ort(maclar.map(fn)));
  return {
    takim: f.takim, maclar: maclar.length,
    attigi: al(m => m.ben.gol), yedigi: al(m => m.o.gol),
    sut: al(m => m.ben.sut), isabetli: al(m => m.ben.isabetli), kutuIci: al(m => m.ben.kutuIci),
    rakipSut: al(m => m.o.sut), rakipKutuIci: al(m => m.o.kutuIci), korner: al(m => m.ben.korner), topa: al(m => m.ben.topa),
    ust25: maclar.length ? r2(maclar.filter(m => m.ben.gol + m.o.gol > 2.5).length / maclar.length) : null,
    sonMaclar: maclar.map(m => `${m.ben.gol}-${m.o.gol} ${m.ic ? 'ev' : 'dep'} ${m.rakip} (şut ${m.ben.sut}/${m.o.sut}, kutu içi ${m.ben.kutuIci}/${m.o.kutuIci})`),
  };
}

// Kaba gol beklentisi: ceza sahası içi şut ~0,12 gol, dışı ~0,03 gol (yaygın şut-kalitesi ortalamaları).
const XG_IC = 0.12, XG_DIS = 0.03;
const poi = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const ustOlasiligi = (l, cizgi) => { let alt = 0; for (let k = 0; k <= Math.floor(cizgi); k++) alt += poi(l, k); return 1 - alt; };

/**
 * İstatistik modeli (iddaa oranı kullanmaz): her takımın beklenen golü = kendi gol/şut üretimi ile rakibin yediği gol/izin verdiği şutların ortalaması.
 * @returns { ev, dep, lev, ldep, toplam, ust: { '1.5','2.5','3.5' } }
 */
export async function altUstModeli(mac, fetchFn) {
  const slug = espnLig(mac.lig); if (!slug) return null;
  const [ev, dep] = await Promise.all([takimIstatistik(slug, mac.ev, { fetchFn }), takimIstatistik(slug, mac.deplasman, { fetchFn })]);
  if (!ev || !dep || !ev.maclar || !dep.maclar) return { ev, dep, model: null };
  const uretim = (t) => (t.kutuIci != null ? t.kutuIci * XG_IC + Math.max(0, (t.sut ?? 0) - t.kutuIci) * XG_DIS : null);
  const izin = (t) => (t.rakipKutuIci != null ? t.rakipKutuIci * XG_IC + Math.max(0, (t.rakipSut ?? 0) - t.rakipKutuIci) * XG_DIS : null);
  const lev = ort([ev.attigi, dep.yedigi, uretim(ev), izin(dep)]) * 1.06;   // hafif ev sahibi avantajı
  const ldep = ort([dep.attigi, ev.yedigi, uretim(dep), izin(ev)]) * 0.94;
  const toplam = lev + ldep;
  return { ev, dep, model: { lev: r2(lev), ldep: r2(ldep), toplam: r2(toplam), ust: Object.fromEntries(['0.5', '1.5', '2.5', '3.5', '4.5'].map(c => [c, r2(ustOlasiligi(toplam, Number(c)))])) } };
}

const yz = (p) => (p == null ? '–' : `%${Math.round(p * 100)}`);
export function altUstYazi(a) {
  const t = (x, rol) => !x ? `${rol}: ESPN'de eşleşmedi` : `${rol}: ${x.takim.ad} – son ${x.maclar} maç ort.: attığı ${x.attigi}, yediği ${x.yedigi} | şut ${x.sut} (isabetli ${x.isabetli}), ceza sahası içi şut ${x.kutuIci} | rakibe izin: şut ${x.rakipSut}, kutu içi ${x.rakipKutuIci} | korner ${x.korner}, topa sahip olma %${x.topa} | maçlarında 2.5 üstü ${yz(x.ust25)}\n    ${x.sonMaclar.join(' · ')}`;
  return `${t(a.ev, 'Ev')}\n${t(a.dep, 'Deplasman')}` + (a.model
    ? `\nİstatistik modeli (iddaa oranı kullanmadan; gol + şut + ceza sahası içi şut): beklenen gol ev ${a.model.lev} – dep ${a.model.ldep}, toplam ${a.model.toplam} | Üst 0.5 ${yz(a.model.ust['0.5'])} · Üst 1.5 ${yz(a.model.ust['1.5'])} · Üst 2.5 ${yz(a.model.ust['2.5'])} · Üst 3.5 ${yz(a.model.ust['3.5'])} · Üst 4.5 ${yz(a.model.ust['4.5'])} (Alt = 100 − Üst)`
    : '\nİstatistik modeli kurulamadı (takımlardan biri için maç verisi yok).');
}
