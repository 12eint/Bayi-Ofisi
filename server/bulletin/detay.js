// Maç detayı: iddaa program sayfası her maç için yalnızca temel bahisleri verir. "1. Yarı ve 2. Yarıda Karşılıklı
// Gol Olur" gibi pazarlar maçın detayında gelir (sportsbook/event/{id}). Siteye yük bindirmemek için TÜM maçların
// değil, modele göre bu bahsin en olası olduğu birkaç aday maçın detayı okunur; istekler arasında beklenir,
// sunucu reddederse (403/429/503) hemen durulur. Giriş yok, sepet yok, yalnızca herkese açık oran verisi.
import { db, kvGet, kvSet } from '../db.js';
import { getSettings } from '../settings.js';
import { listMatches } from './store.js';
import { marketName } from './parseApi.js';
import { secimModeli, modelOnbellekSil } from '../model/index.js';

/** Çekimde gelen pazar adlarını sakla: sonradan (yeni sayfa yüklemeden) detay okunabilsin */
export function pazarAdlariniSakla(marketConfig) {
  const adlar = Object.fromEntries(Object.entries(marketConfig ?? {}).filter(([, v]) => v?.n).map(([k, v]) => [k, { n: v.n }]));
  if (Object.keys(adlar).length) kvSet('pazar_adlari', JSON.stringify(adlar));
}
const saklıPazarAdlari = () => { try { return JSON.parse(kvGet('pazar_adlari') ?? '{}'); } catch { return {}; } };

export const IKI_YARI_KG = '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur';
const DETAY_URL = (id) => `https://sportsbookv2.iddaa.com/sportsbook/event/${encodeURIComponent(id)}`;
const BASLIK = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  Accept: 'application/json', 'Accept-Language': 'tr-TR,tr;q=0.9', Origin: 'https://www.iddaa.com', Referer: 'https://www.iddaa.com/',
};
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

/** Modele göre "iki yarıda da KG" olasılığı en yüksek, henüz başlamamış maçlar (detayı daha önce okunmamış olanlar önce) */
export function detayAdaylari(bultenId, gun, adet) {
  const maclar = listMatches(bultenId, { gun, baslamamisSonra: Date.now() + 30 * 60000 }).filter(m => m.event_id);
  const puanli = maclar.map(m => ({ m, p: secimModeli(m.id, IKI_YARI_KG, 'Evet / Evet', 1).model ?? 0 }));
  return puanli.filter(x => x.p > 0).sort((a, b) => b.p - a.p).slice(0, adet);
}

/** Tek maçın detay pazarlarını okur → [{ bahis, secim, oran, mbs }] */
export function detayOranlari(govde, marketConfig) {
  const e = govde?.data?.events?.[0] ?? govde?.data ?? govde;
  const out = [];
  for (const m of e?.m ?? []) {
    if (m.t === 4) continue;                                   // canlı
    if (m.s != null && m.s !== 1 && m.s !== 0) continue;       // kapalı pazar
    const bahis = marketName(Object.keys(marketConfig ?? {}).length ? marketConfig : saklıPazarAdlari(), m);
    if (/^Bahis \d+_\d+$/.test(bahis)) continue;               // adı bilinmeyen pazar
    for (const o of m.o ?? []) if (typeof o.odd === 'number' && o.odd > 1) out.push({ bahis, secim: String(o.n).trim(), oran: o.odd, mbs: m.mbc ?? e.mbc ?? 1 });
  }
  return out;
}

/**
 * Aday maçların detayını okuyup eksik pazarları bültene ekler.
 * @returns {{ denenen:number, okunan:number, eklenen_oran:number, iki_yari_kg:number, durdu?:string }}
 */
export async function detaylariCek({ bultenId, gun, marketConfig, settings = getSettings(), fetchFn = fetch }) {
  const ayar = settings.detayCekim ?? {};
  const sonuc = { denenen: 0, okunan: 0, eklenen_oran: 0, iki_yari_kg: 0 };
  if (ayar.aktif === false) return sonuc;
  const adaylar = detayAdaylari(bultenId, gun, ayar.macSayisi ?? 15);
  const var_ = db.prepare('SELECT 1 FROM oranlar WHERE mac_id = ? AND bahis = ? AND secim = ?');
  const ekle = db.prepare('INSERT INTO oranlar(mac_id, bahis, secim, oran, mbs) VALUES(?,?,?,?,?)');
  for (const [i, { m }] of adaylar.entries()) {
    if (i) await bekle((ayar.aralikMs ?? 1500) + Math.random() * 700);
    sonuc.denenen++;
    let yanit;
    try { yanit = await fetchFn(DETAY_URL(m.event_id), { headers: BASLIK, signal: AbortSignal.timeout(15000) }); }
    catch (e) { sonuc.durdu = `bağlantı hatası: ${e.message}`; break; }
    if ([403, 429, 503].includes(yanit.status)) { sonuc.durdu = `iddaa ${yanit.status} döndü; detay okuma durduruldu (siteye yük bindirilmedi)`; break; }
    if (!yanit.ok) continue;
    let govde; try { govde = await yanit.json(); } catch { continue; }
    const oranlar = detayOranlari(govde, marketConfig);
    if (!oranlar.length) continue;
    sonuc.okunan++;
    db.exec('BEGIN');
    try {
      for (const o of oranlar) {
        if (var_.get(m.id, o.bahis, o.secim)) continue;
        ekle.run(m.id, o.bahis, o.secim, o.oran, o.mbs); sonuc.eklenen_oran++;
        if (o.bahis === IKI_YARI_KG && o.secim === 'Evet / Evet') sonuc.iki_yari_kg++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    modelOnbellekSil(m.id);
  }
  return sonuc;
}
