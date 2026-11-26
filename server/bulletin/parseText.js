// "Bülteni Yükle" yedek yöntemi: yapıştırılan metin, kaydedilmiş HTML sayfası veya JSON.
import * as cheerio from 'cheerio';
import { istanbulDate } from '../db.js';
import { parseApiResponses } from './parseApi.js';

// iddaa.com liste görünümündeki sabit sütunlar (sayfa başlığındaki sıra)
const COLUMNS = [
  { bahis: 'Maç Sonucu', secimler: ['1', '0', '2'] },
  { bahis: '1. Yarı Sonucu', secimler: ['1', '0', '2'] },
  { bahis: 'Handikaplı Maç Sonucu', secimler: ['1', '0', '2'], handikap: true },
  { bahis: 'Alt/Üst 2.5', secimler: ['Alt', 'Üst'] },
  { bahis: 'Karşılıklı Gol', secimler: ['Var', 'Yok'] },
];

const ODD_RE = /^(\d{1,3}[.,]\d{1,2}|-)$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const CODE_RE = /^\d{3,6}$/;
const HCP_RE = /^\d{1,2}:\d{1,2}$/;
const toNum = (s) => (s === '-' ? null : Number(s.replace(',', '.')));

function dayLabelToDate(label) {
  if (!label) return null;
  const l = label.toLocaleLowerCase('tr-TR');
  if (l.includes('bugün')) return istanbulDate();
  if (l.includes('yarın')) return istanbulDate(new Date(), 1);
  const m = label.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : istanbulDate().slice(0, 4);
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function buildOdds(tokens) {
  // tokens: oran / '-' / handikap ('0:3') karışık; 3+3+(1+3)+2+2 = 14 bekleniyor
  const odds = []; let i = 0;
  for (const col of COLUMNS) {
    let bahis = col.bahis;
    if (col.handikap) {
      if (!HCP_RE.test(tokens[i] ?? '')) return null;
      bahis = `Handikaplı Maç Sonucu (${tokens[i]})`; i++;
    }
    for (const s of col.secimler) {
      const t = tokens[i++];
      if (t === undefined || !ODD_RE.test(t)) return null;
      const v = toNum(t);
      if (v && v > 1) odds.push({ bahis, secim: s, oran: v, mbs: null });
    }
  }
  return i === tokens.length ? odds : null;
}

/** iddaa.com bülten sayfasından kopyalanan düz metin */
export function parseText(text, targetDate) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const matches = []; const errors = []; let skipped = 0;
  let lig = null, dayLabel = null;
  const isUpperHeader = (s) => s.length > 3 && s === s.toLocaleUpperCase('tr-TR') && /[A-ZÇĞİÖŞÜ]{3}/.test(s) && !ODD_RE.test(s);
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    const DAY_RE = /^(bugün|yarın|\d{1,2}[./]\d{1,2}|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar)/i;
    if (isUpperHeader(s) && (lines[i + 1] === '1' || (DAY_RE.test(lines[i + 1] ?? '') && lines[i + 2] === '1'))) { lig = s; continue; }
    if (DAY_RE.test(s) && !TIME_RE.test(s)) { dayLabel = s; continue; }
    if (!TIME_RE.test(s)) continue;
    if (/^(sırala|filtrele)$/i.test(lines[i + 1] ?? '')) continue;   // sayfa saati
    // maç satırı: SAAT, takım(lar), oranlar..., KOD
    const saat = s; const teams = []; const tokens = []; let j = i + 1; let code = null;
    while (j < lines.length && teams.length < 2 && !ODD_RE.test(lines[j]) || (lines[j] === '-' && teams.length === 1 && !ODD_RE.test(lines[j + 1] ?? ''))) {
      if (lines[j] !== '-') teams.push(lines[j]);
      j++;
      if (j - i > 5) break;
    }
    while (j < lines.length && (ODD_RE.test(lines[j]) || HCP_RE.test(lines[j]))) tokens.push(lines[j++]);
    if (j < lines.length && CODE_RE.test(lines[j])) code = lines[j++];
    const raw = [saat, ...teams, ...tokens, code ?? ''].join(' ');
    i = j - 1;
    const date = dayLabelToDate(dayLabel) ?? targetDate;   // gün etiketi yoksa seçilen gün
    if (teams.length !== 2) { errors.push({ satir: raw, neden: 'Takımlar okunamadı' }); continue; }
    if (!code) { errors.push({ satir: raw, neden: 'Maç kodu bulunamadı' }); continue; }
    const odds = buildOdds(tokens);
    if (!odds) { errors.push({ satir: raw, neden: `Oran sütunları beklenen düzende değil (${tokens.length} değer)` }); continue; }
    if (!odds.length) { errors.push({ satir: raw, neden: 'Açık oran yok' }); continue; }
    matches.push({ mac_kodu: code, lig: lig ?? 'Bilinmeyen lig', ev: teams[0], deplasman: teams[1], saat, baslama: `${date}T${saat}:00+03:00`, mbs: null, oranlar: odds });
  }
  return { matches, errors, skipped, not_: 'Metin kaynağında MBS görünmez; MBS 1 varsayıldı. Mümkünse "Farklı Kaydet > Web sayfası, tam" ile HTML yükleyin.' };
}

/** Tarayıcıdan "Farklı kaydet" ile alınmış iddaa.com bülten HTML'i */
export function parseHtml(html, targetDate) {
  const $ = cheerio.load(html);
  const matches = []; const errors = []; let skipped = 0;
  $('[data-comp="match-group-item"]').each((_, el) => {
    const row = $(el);
    const group = row.prevAll().filter((_, p) => $(p).find('[data-lh]').length || $(p).is('[data-lh]')).first();
    const lig = (group.find('[data-lh]').first().text() || row.parent().find('[data-lh]').first().text() || '').trim() || 'Bilinmeyen lig';
    const teams = row.find('span[title]').map((_, t) => $(t).attr('title')).get().slice(0, 2);
    const timeCell = row.find('li').filter((_, li) => TIME_RE.test($(li).text().replace(/^\D+/, '').trim())).first();
    const dayLabel = timeCell.find('span').first().text().trim();
    const saat = timeCell.text().replace(dayLabel, '').trim();
    const mbsAttr = row.find('[data-c]').first().attr('data-c');
    const code = row.find('span[data-total]').first().text().trim();
    const tokens = row.find('ul[data-w] li').map((_, li) => $(li).text().trim()).get();
    const raw = [saat, ...teams, ...tokens, code].join(' ');
    const date = dayLabelToDate(dayLabel) ?? targetDate;
    if (teams.length !== 2) { errors.push({ satir: raw, neden: 'Takımlar okunamadı' }); return; }
    if (!CODE_RE.test(code)) { errors.push({ satir: raw, neden: 'Maç kodu bulunamadı' }); return; }
    const odds = buildOdds(tokens);
    if (!odds?.length) { errors.push({ satir: raw, neden: 'Oran sütunları okunamadı' }); return; }
    const mbs = mbsAttr ? Number(mbsAttr) : null;
    odds.forEach(o => { o.mbs = mbs ?? 1; });
    matches.push({ mac_kodu: code, lig, ev: teams[0], deplasman: teams[1], saat, baslama: `${date}T${saat}:00+03:00`, mbs, oranlar: odds });
  });
  return { matches, errors, skipped };
}

/** Kaynağı otomatik tanı: JSON (events yanıtı / snapshot responses.json), HTML veya düz metin */
export function parseUpload(content, targetDate) {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const responses = Array.isArray(parsed) && parsed[0]?.url ? parsed : [{ url: 'upload/events?', body: parsed }];
    return { kaynak: 'json', ...parseApiResponses(responses, null) };   // JSON'da her maçın tarihi var → tüm günler
  }
  if (/<html|<div|data-comp=/i.test(trimmed.slice(0, 5000)) || /data-comp="match-group-item"/.test(trimmed)) {
    return { kaynak: 'html', ...parseHtml(trimmed, targetDate) };
  }
  return { kaynak: 'metin', ...parseText(trimmed, targetDate) };
}
