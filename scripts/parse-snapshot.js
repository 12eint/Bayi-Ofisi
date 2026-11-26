// Kaydedilmiş bir sayfa kaydı üzerinden ayrıştırıcıyı çalıştırır, ilk 10 maçı tablo olarak gösterir.
// Kullanım: npm run bulten:ayristir [-- <snapshot klasörü>] [--tarih YYYY-MM-DD] [--kaydet] [--kaynak api|html|metin]
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, tomorrow } from '../server/db.js';
import { parseApiResponses } from '../server/bulletin/parseApi.js';
import { parseHtml, parseText } from '../server/bulletin/parseText.js';
import { saveBulletin } from '../server/bulletin/store.js';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const tarih = opt('--tarih') ?? tomorrow();
const kaynak = opt('--kaynak') ?? 'api';
const snapRoot = path.join(DATA_DIR, 'snapshots');
const dir = args.find(a => !a.startsWith('--') && fs.existsSync(a)) ??
  path.join(snapRoot, fs.readdirSync(snapRoot).sort().at(-1));

let r;
if (kaynak === 'html') r = parseHtml(fs.readFileSync(path.join(dir, 'page.html'), 'utf8'), tarih);
else if (kaynak === 'metin') r = parseText(fs.readFileSync(path.join(dir, 'page.txt'), 'utf8'), tarih);
else r = parseApiResponses(JSON.parse(fs.readFileSync(path.join(dir, 'responses.json'), 'utf8')), tarih);

console.log(`Kayıt: ${dir}\nHedef gün: ${tarih} | kaynak: ${kaynak} | okunan maç: ${r.matches.length} | hatalı satır: ${r.errors.length} | başka gün/spor (atlandı): ${r.skipped}\n`);
const get = (m, b, s) => m.oranlar.find(o => o.bahis === b && o.secim === s)?.oran?.toFixed(2) ?? '-';
const au = (m, s) => m.oranlar.find(o => /^Alt\/Üst 2[.,]5$/.test(o.bahis) && o.secim === s)?.oran?.toFixed(2) ?? '-';
console.table(r.matches.slice(0, 10).map(m => ({
  Kod: m.mac_kodu, Saat: m.saat, Lig: m.lig.slice(0, 22), Maç: `${m.ev} - ${m.deplasman}`.slice(0, 38),
  MBS: m.mbs ?? '?', 'MS1': get(m, 'Maç Sonucu', '1'), 'MS0': get(m, 'Maç Sonucu', '0'), 'MS2': get(m, 'Maç Sonucu', '2'),
  '2.5A': au(m, 'Alt'), '2.5Ü': au(m, 'Üst'), 'KG Var': get(m, 'Karşılıklı Gol', 'Var'), Bahis: m.oranlar.length,
})));
if (r.errors.length) { console.log('\nOkunamayan satırlar:'); r.errors.slice(0, 20).forEach(e => console.log(' -', e.neden, '|', e.satir)); }
if (args.includes('--kaydet')) console.log('\nVeritabanına kaydedildi, bülten id:', saveBulletin({ tarih, kaynak: kaynak === 'api' ? 'iddaa.com' : kaynak, matches: r.matches, errors: r.errors, not_: r.not_ }));
