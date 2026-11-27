// ESPN açık veri (site.api.espn.com): puan durumu, takım fikstürü/formu ve maç sonuçları (gol dakikalarıyla → ilk yarı skoru).
// Bu ağda football-data.co.uk ve ClubElo erişilemediği, Understat/FBref/Sofascore engellediği için tek dış kaynak ESPN.
// Kurallar: yalnızca herkese açık okuma uçları, her yanıt önbelleğe alınır (aynı adrese tekrar tekrar gidilmez).
import { db, istanbulDate } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS dis_onbellek (url TEXT PRIMARY KEY, zaman INTEGER NOT NULL, govde TEXT NOT NULL)`);

const KOK = 'https://site.api.espn.com/apis';
const BASLIK = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' };
const SAAT = 3600000;

/** iddaa lig adı → ESPN lig kodu. Sıra önemli: özel olan önce. ESPN'de olmayan ligler eşleşmez (veri yok). */
const LIGLER = [
  [/^İngiltere Premier Lig$/, 'eng.1'], [/^İngiltere Championship$/, 'eng.2'], [/^İngiltere 1\. Lig$/, 'eng.3'], [/^İngiltere 2\. Lig$/, 'eng.4'],
  [/^İngiltere Ulusal Lig$/, 'eng.5'], [/^İngiltere FA Cup|^İngiltere Federasyon Kupası/, 'eng.fa'], [/^İngiltere Lig Kupası/, 'eng.league_cup'],
  [/^İspanya La Liga$/, 'esp.1'], [/^İspanya La Liga 2$/, 'esp.2'], [/^İspanya Kral Kupası/, 'esp.copa_del_rey'],
  [/^Almanya Bundesliga$/, 'ger.1'], [/^Almanya 2\. Bundesliga$/, 'ger.2'], [/^Almanya Kupası/, 'ger.dfb_pokal'],
  [/^İtalya Serie A$/, 'ita.1'], [/^İtalya Serie B$/, 'ita.2'], [/^İtalya Kupası/, 'ita.coppa_italia'],
  [/^Fransa Ligue 1$/, 'fra.1'], [/^Fransa Ligue 2$/, 'fra.2'], [/^Fransa Kupası/, 'fra.coupe_de_france'],
  [/^Hollanda Eredivisie$/, 'ned.1'], [/^Hollanda 1\. Lig$/, 'ned.2'], [/^Portekiz Premier Lig$/, 'por.1'],
  [/^Türkiye Süper Lig$/, 'tur.1'], [/^Belçika Pro Lig$/, 'bel.1'], [/^İskoçya Premiership$/, 'sco.1'], [/^İskoçya Championship$/, 'sco.2'],
  [/^İskoçya Kupası/, 'sco.tennents'], [/^Avusturya Bundesliga$/, 'aut.1'], [/^İsviçre Süper Lig$/, 'sui.1'], [/^Danimarka Süper Lig$/, 'den.1'],
  [/^Norveç Eliteserien$/, 'nor.1'], [/^İsveç Allsvenskan$/, 'swe.1'], [/^Yunanistan Süper Lig$/, 'gre.1'], [/^Rusya Premier Lig$/, 'rus.1'],
  [/^Suudi Arabistan Pro Lig$/, 'ksa.1'], [/^ABD Major Lig|^ABD MLS/, 'usa.1'], [/^Brezilya Serie A$/, 'bra.1'], [/^Arjantin Primera/, 'arg.1'],
  [/^Meksika Primera Ligi/, 'mex.1'], [/^Japonya J\.Lig$/, 'jpn.1'], [/^Şili Premier Lig$/, 'chi.1'],
  [/^UEFA Şampiyonlar Ligi/, 'uefa.champions'], [/^UEFA Avrupa Ligi/, 'uefa.europa'], [/^UEFA Konferans Ligi/, 'uefa.europa.conf'],
];
export const espnLig = (lig) => LIGLER.find(([re]) => re.test(String(lig ?? '').trim()))?.[1] ?? null;

async function getir(yol, tazelikMs, fetchFn = fetch) {
  const url = `${KOK}/${yol}`;
  const kayit = db.prepare('SELECT zaman, govde FROM dis_onbellek WHERE url = ?').get(url);
  if (kayit && Date.now() - kayit.zaman < tazelikMs) return JSON.parse(kayit.govde);
  const y = await fetchFn(url, { headers: BASLIK, signal: AbortSignal.timeout(20000) });
  if (!y.ok) { if (kayit) return JSON.parse(kayit.govde); throw new Error(`ESPN ${y.status}`); }
  const govde = await y.json();
  db.prepare('INSERT INTO dis_onbellek(url, zaman, govde) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET zaman = excluded.zaman, govde = excluded.govde')
    .run(url, Date.now(), JSON.stringify(govde));
  return govde;
}

// ---- takım adı eşleştirme (iddaa Türkçe/kısaltmalı adlar ↔ ESPN İngilizce adlar) ----
const DOLGU = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'sk', 'fk', 'cd', 'ud', 'sd', 'rc', 'as', 'ss', 'us', 'club', 'de', 'the', 'calcio', 'football', 'futbol', 'kulubu', 'spor', 'a.s', 'jk', 'if', 'bk', 'vfl', 'vfb', 'tsg', 'sv', '1.']);
const ESANLAM = { 'munih': 'munich', 'koln': 'cologne', 'kopenhag': 'copenhagen', 'lizbon': 'lisbon', 'roma': 'roma', 'milan': 'milan', 'inter': 'internazionale', 'betis': 'betis', 'brugge': 'brugge', 'bruges': 'brugge', 'atletico': 'atletico', 'man': 'manchester', 'utd': 'united', 'wolves': 'wolverhampton', 'spurs': 'tottenham', 'psg': 'paris', 'nottm': 'nottingham', 'mg': 'mineiro', 'moskova': 'moscow', 'kizil': 'red', 'yildiz': 'star', 'belgrad': 'belgrade', 'prag': 'prague', 'varsova': 'warsaw', 'kiev': 'kyiv' };
export function normal(ad) {
  return String(ad ?? '').toLocaleLowerCase('tr-TR').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/[đð]/g, 'd').replace(/ł/g, 'l').replace(/['’`]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
    .map(k => ESANLAM[k] ?? k).filter(k => !DOLGU.has(k) && !/^u\d\d$/.test(k)).join(' ');
}
// Ayırt etmeyen sık kelimeler: yalnızca bunlar ortak diye iki takım eşleşmesin (Al Khlood ≠ Al Hilal)
const GENEL = new Set(['al', 'el', 'la', 'le', 'los', 'real', 'sporting', 'athletic', 'atletico', 'united', 'city', 'town', 'rovers', 'county', 'union', 'deportivo', 'sport', 'racing', 'olympique', 'st', 'saint', 'nk', 'ks', 'cs', 'fk', 'dinamo', 'dynamo', 'young', 'boys']);
function benzerlik(a, b) {
  const A = normal(a), B = normal(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.9;
  const ayirt = (x) => { const k = x.split(' ').filter(t => !GENEL.has(t)); return k.length ? k : x.split(' '); };
  const ka = ayirt(A), kb = ayirt(B);
  let ortak = 0;
  for (const x of ka) if (kb.some(y => y === x || (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4)))))) ortak++;
  return ortak / Math.max(ka.length, kb.length);
}
/** adaylar: [{ ad, kisa?, ... }] → en iyi eşleşme (eşik 0.5) */
export function takimBul(ad, adaylar) {
  let en = null, puan = 0;
  for (const t of adaylar) {
    const p = Math.max(benzerlik(ad, t.ad), t.kisa ? benzerlik(ad, t.kisa) : 0);
    if (p > puan) { puan = p; en = t; }
  }
  return puan >= 0.5 ? en : null;
}

// ---- puan durumu ----
export async function puanDurumu(slug, fetchFn) {
  const j = await getir(`v2/sports/soccer/${slug}/standings`, 12 * SAAT, fetchFn);
  const gruplar = j.children?.length ? j.children : [j];
  const out = [];
  for (const g of gruplar) for (const e of g.standings?.entries ?? []) {
    const s = Object.fromEntries((e.stats ?? []).map(x => [x.name, x.value]));
    out.push({ id: e.team.id, ad: e.team.displayName, kisa: e.team.shortDisplayName, sira: s.rank, o: s.gamesPlayed ?? 0, g: s.wins, b: s.ties, m: s.losses, ag: s.pointsFor ?? 0, yg: s.pointsAgainst ?? 0, puan: s.points });
  }
  return out;
}

// ---- takım formu: son maçlar ----
function macOzeti(e, takimId) {
  const c = e.competitions?.[0]; if (!c?.status?.type?.completed) return null;
  const ben = c.competitors.find(t => String(t.team.id) === String(takimId)); const o = c.competitors.find(t => t !== ben);
  if (!ben || !o) return null;
  const sk = (t) => Number(t.score?.value ?? t.score?.displayValue ?? t.score);
  const a = sk(ben), y = sk(o);
  return { tarih: e.date?.slice(0, 10), rakip: o.team.displayName, ic: ben.homeAway === 'home', a, y, s: a > y ? 'G' : a < y ? 'M' : 'B' };
}
export async function takimFormu(slug, takimAdi, { n = 6, fetchFn } = {}) {
  const tablo = await puanDurumu(slug, fetchFn);
  const t = takimBul(takimAdi, tablo);
  if (!t) return null;
  const j = await getir(`site/v2/sports/soccer/${slug}/teams/${t.id}/schedule`, 6 * SAAT, fetchFn);
  const maclar = (j.events ?? []).map(e => macOzeti(e, t.id)).filter(Boolean).sort((a, b) => a.tarih.localeCompare(b.tarih)).slice(-n);
  return { takim: t, maclar };
}

// ---- maç sonucu: tam skor + ilk yarı skoru (gol dakikalarından) ----
const ilkYari = (dk) => { const m = String(dk ?? '').match(/^(\d+)'?(?:\+(\d+))?/); return m ? Number(m[1]) <= 45 : false; };
export async function gunSonuclari(slug, gun, fetchFn) {
  const tazelik = gun < istanbulDate() ? 7 * 24 * SAAT : 20 * 60000;
  const j = await getir(`site/v2/sports/soccer/${slug}/scoreboard?dates=${gun.replaceAll('-', '')}`, tazelik, fetchFn);
  const out = [];
  for (const e of j.events ?? []) {
    const c = e.competitions?.[0]; if (!c?.status?.type?.completed) continue;
    const ev = c.competitors.find(t => t.homeAway === 'home'), dep = c.competitors.find(t => t.homeAway === 'away');
    if (!ev || !dep) continue;
    const goller = (c.details ?? []).filter(d => d.scoringPlay);
    const say = (id, iy) => goller.filter(d => String(d.team?.id) === String(id) && (!iy || ilkYari(d.clock?.displayValue))).length;
    const ft = [Number(ev.score), Number(dep.score)];
    // gol listesi tam skorla tutuyorsa ilk yarı skoru güvenilir; tutmuyorsa (eksik detay) ilk yarı bilinmez
    const tamMi = say(ev.team.id) === ft[0] && say(dep.team.id) === ft[1];
    out.push({ ev: ev.team.displayName, dep: dep.team.displayName, evKisa: ev.team.shortDisplayName, depKisa: dep.team.shortDisplayName,
      skor: ft, iy: tamMi ? [say(ev.team.id, true), say(dep.team.id, true)] : null });
  }
  return out;
}
/** iddaa maçını (lig, ev, dep, gün) ESPN sonucuyla eşleştirir */
export async function macSonucu({ lig, ev, deplasman, gun }, fetchFn) {
  const slug = espnLig(lig); if (!slug) return null;
  // ESPN günleri ABD saatine göre: İstanbul'da gece oynanan maç ESPN'de bir önceki gündedir → iki güne bak
  const dun = new Date(new Date(`${gun}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const liste = [...await gunSonuclari(slug, gun, fetchFn), ...await gunSonuclari(slug, dun, fetchFn)];
  const evT = takimBul(ev, liste.map(x => ({ ad: x.ev, kisa: x.evKisa, x })));
  const depT = takimBul(deplasman, liste.map(x => ({ ad: x.dep, kisa: x.depKisa, x })));
  return evT && depT && evT.x === depT.x ? evT.x : null;
}
