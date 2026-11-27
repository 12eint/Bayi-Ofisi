// iddaa.com sayfasının kendi yüklediği JSON yanıtlarını normalize maç listesine çevirir.
// Gözlemlenen alanlar (sportsbookv2 /events):
//   pai = maç kodu (bültende satır sonunda görünen kod), hn/an = takımlar, ci = lig id,
//   d = başlama (epoch sn), mbc = MBS, m[] = bahisler { t, st, sov, mbc, o[] { n, odd } }
//   Bahis adı: get_market_config.m[`${t}_${st}`].n  ("{0}" yerine sov konur)
//   t=1/2 maç öncesi bahisler, t=4 canlı bahisler (alınmaz). odd <= 1.00 = kapalı.
import { istanbulDate, istanbulTime } from '../db.js';

const FALLBACK_MARKETS = {
  '1_1': 'Maç Sonucu', '2_88': '1. Yarı Sonucu', '2_101': 'Alt/Üst {0}', '2_89': 'Karşılıklı Gol',
  '2_3': 'Çifte Şans', '2_4': 'Toplam Gol Aralığı', '2_7': 'Maç Sonucu ve Alt/Üst {0}',
  '2_866': '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur', '2_861': 'Ev Sahibi Her İki Yarıda da Gol Atar', '2_862': 'Deplasman Her İki Yarıda da Gol Atar',
};

export function extractParts(jsonResponses) {
  const pick = (re) => jsonResponses.filter(r => re.test(r.url)).map(r => r.body?.data ?? r.body);
  const eventsBodies = jsonResponses.filter(r => /\/events\?/.test(r.url) || Array.isArray(r.body?.data?.events) || Array.isArray(r.body?.events));
  const events = [];
  const seen = new Set();
  for (const r of eventsBodies) for (const e of (r.body?.data?.events ?? r.body?.events ?? [])) {
    if (e && !seen.has(e.i)) { seen.add(e.i); events.push(e); }
  }
  const marketConfig = pick(/get_market_config/)[0]?.m ?? {};
  const comps = pick(/\/competitions/)[0] ?? [];
  const competitions = new Map((Array.isArray(comps) ? comps : Object.values(comps)).map(c => [c.i, c]));
  return { events, marketConfig, competitions };
}

export function marketName(cfg, m) {
  const key = `${m.t}_${m.st}`;
  let n = cfg[key]?.n ?? FALLBACK_MARKETS[key] ?? `Bahis ${key}`;
  if (/\{0\}|\{h\}/.test(n)) n = n.replace(/\{0\}|\{h\}/g, m.sov ?? '').replace(/\s+/g, ' ');
  else if (m.sov != null && m.sov !== '') n = `${n} (${m.sov})`;
  return n.trim();
}

/**
 * @param {{url:string, body:any}[]} jsonResponses
 * @param {string|null} targetDate YYYY-MM-DD (İstanbul). null → tüm günler (yeni bülten modeli)
 * @returns {{ matches: object[], errors: {satir:string, neden:string}[], skipped: number }}
 */
export function parseApiResponses(jsonResponses, targetDate) {
  const { events, marketConfig, competitions } = extractParts(jsonResponses);
  const matches = []; const errors = []; let skipped = 0;
  for (const e of events) {
    if (e.sid != null && e.sid !== 1) { skipped++; continue; }            // yalnızca futbol
    const start = e.d ? new Date(e.d * 1000) : null;
    if (!start || (targetDate && istanbulDate(start) !== targetDate)) { skipped++; continue; }
    if (!targetDate && start.getTime() < Date.now() - 3 * 3600000) { skipped++; continue; }   // çoktan oynanmış maç
    const label = `${e.pai ?? '?'} ${e.hn ?? '?'} - ${e.an ?? '?'}`;
    if (!e.hn || !e.an) { errors.push({ satir: label, neden: 'Takım adı eksik' }); continue; }
    if (e.pai == null) { errors.push({ satir: label, neden: 'Maç kodu (pai) yok' }); continue; }
    const comp = competitions.get(e.ci);
    const odds = [];
    for (const m of e.m ?? []) {
      if (m.t === 4) continue;                       // canlı bahis
      if (m.s != null && m.s !== 1 && m.s !== 0) continue;
      const bahis = marketName(marketConfig, m);
      for (const o of m.o ?? []) {
        if (typeof o.odd !== 'number' || o.odd <= 1.0) continue;   // kapalı oran
        odds.push({ bahis, secim: String(o.n).trim(), oran: o.odd, mbs: m.mbc ?? e.mbc ?? 1 });
      }
    }
    if (!odds.length) { errors.push({ satir: label, neden: 'Açık maç öncesi oran yok' }); continue; }
    matches.push({
      mac_kodu: String(e.pai), event_id: String(e.i),
      lig: comp?.n ?? `Lig ${e.ci}`, ev: e.hn.trim(), deplasman: e.an.trim(),
      baslama: start.toISOString(), saat: istanbulTime(start), mbs: e.mbc ?? null, oranlar: odds,
    });
  }
  // aynı kod iki kez gelirse ikinciyi hatalı say
  const codes = new Set(); const uniq = [];
  for (const m of matches) {
    if (codes.has(m.mac_kodu)) errors.push({ satir: `${m.mac_kodu} ${m.ev} - ${m.deplasman}`, neden: 'Yinelenen maç kodu' });
    else { codes.add(m.mac_kodu); uniq.push(m); }
  }
  uniq.sort((a, b) => a.baslama.localeCompare(b.baslama) || a.mac_kodu.localeCompare(b.mac_kodu));
  return { matches: uniq, errors, skipped };
}
