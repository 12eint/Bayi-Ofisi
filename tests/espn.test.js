// ESPN kaynağı (ağa çıkmadan, sahte yanıtlarla): takım eşleştirme, ilk yarı skoru, bağımsız model, otomatik sonuç.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-espn-test-'));
const { db } = await import('../server/db.js');
const { takimBul, espnLig, gunSonuclari, macSonucu } = await import('../server/veri/espn.js');
const { bagimsizModel } = await import('../server/veri/bagimsiz.js');
const { enterScore } = await import('../server/stats.js');

const yanit = (govde) => async () => ({ ok: true, status: 200, json: async () => govde });

test('lig eşleme', () => {
  assert.equal(espnLig('İngiltere Premier Lig'), 'eng.1');
  assert.equal(espnLig('Almanya 2. Bundesliga'), 'ger.2');
  assert.equal(espnLig('UEFA Avrupa Ligi'), 'uefa.europa');
  assert.equal(espnLig('Mısır 2nd Division'), null);
});

test('takım adı eşleştirme: Türkçe/kısaltma eşleşir, yalnızca "Al" ortak diye eşleşmez', () => {
  const tablo = [{ ad: 'Al Hilal' }, { ad: 'Al Ittihad' }, { ad: 'Sønderjyske Fodbold' }, { ad: 'Bayern Munich', kisa: 'Bayern' }, { ad: 'Manchester United', kisa: 'Man Utd' }];
  assert.equal(takimBul('AL Khlood', tablo), null);
  assert.equal(takimBul('AL Ittihad', tablo)?.ad, 'Al Ittihad');
  assert.equal(takimBul('Sonderjyske', tablo)?.ad, 'Sønderjyske Fodbold');
  assert.equal(takimBul('Bayern Münih', tablo)?.ad, 'Bayern Munich');
  assert.equal(takimBul('Man Utd', tablo)?.ad, 'Manchester United');
});

const skorTahtasi = { events: [{ competitions: [{ status: { type: { completed: true } }, competitors: [
  { homeAway: 'home', score: '3', team: { id: '1', displayName: 'Liverpool', shortDisplayName: 'Liverpool' } },
  { homeAway: 'away', score: '1', team: { id: '2', displayName: 'Manchester United', shortDisplayName: 'Man Utd' } }],
  details: [{ scoringPlay: true, clock: { displayValue: "12'" }, team: { id: '1' } }, { scoringPlay: true, clock: { displayValue: "45'+2'" }, team: { id: '2' } },
    { scoringPlay: true, clock: { displayValue: "60'" }, team: { id: '1' } }, { scoringPlay: true, clock: { displayValue: "88'" }, team: { id: '1' } },
    { scoringPlay: false, clock: { displayValue: "30'" }, team: { id: '2' } }] }] }] };

test('sonuç: gol dakikalarından ilk yarı skoru (45+2 ilk yarıdır)', async () => {
  const [s] = await gunSonuclari('eng.1', '2026-01-10', yanit(skorTahtasi));
  assert.deepEqual(s.skor, [3, 1]);
  assert.deepEqual(s.iy, [1, 1]);
  const m = await macSonucu({ lig: 'İngiltere Premier Lig', ev: 'Liverpool', deplasman: 'Man Utd', gun: '2026-01-10' });   // önbellekten
  assert.deepEqual(m.skor, [3, 1]);
});

test('bağımsız model: güçlü hücumlu takım favori, olasılıklar toplamı 1', async () => {
  const st = (id, ad, o, ag, yg) => ({ team: { id, displayName: ad, shortDisplayName: ad }, stats: [{ name: 'gamesPlayed', value: o }, { name: 'pointsFor', value: ag }, { name: 'pointsAgainst', value: yg }, { name: 'rank', value: 1 }] });
  const govde = { children: [{ standings: { entries: [st('1', 'Güçlü', 12, 30, 8), st('2', 'Zayıf', 12, 9, 28), st('3', 'Orta A', 12, 16, 16), st('4', 'Orta B', 12, 17, 15)] } }] };
  const b = await bagimsizModel({ lig: 'İspanya La Liga', ev: 'Güçlü', deplasman: 'Zayıf' }, yanit(govde));
  assert.ok(b.p1 > 0.6 && b.p1 > b.p2, JSON.stringify(b));
  assert.ok(Math.abs(b.p1 + b.p0 + b.p2 - 1) < 1e-3);
  assert.ok(b.ikiYariKg > 0 && b.ikiYariKg < b.kg);
});

test('ilk yarı skoru varsa İY/MS ve iki yarıda KG otomatik değerlendirilir', () => {
  db.prepare("INSERT INTO kuponlar(id, ajan, tarih, olusturma, tutar, toplam_oran, olasi_kazanc, durum) VALUES(1, 'hizli-genc', '2026-01-10', 'x', 100, 50, 5000, 'aktif')").run();
  const ekle = db.prepare("INSERT INTO kupon_secimleri(kupon_id, mac_kodu, mac_adi, bahis, secim, oran) VALUES(1, '77', 'A - B', ?, ?, 2)");
  ekle.run('1. Yarı / Maç Sonucu', '0/1'); ekle.run('1. Yarı ve 2. Yarıda Karşılıklı Gol Olur', 'Evet / Evet'); ekle.run('Maç Sonucu', '1');
  const r = enterScore('2026-01-10', '77', 3, 1, 1, 1);
  assert.equal(r.elle_girilmeli.length, 0);
  const sonuc = Object.fromEntries(db.prepare('SELECT bahis, sonuc FROM kupon_secimleri WHERE kupon_id = 1').all().map(x => [x.bahis, x.sonuc]));
  assert.equal(sonuc['1. Yarı / Maç Sonucu'], 'tuttu');                       // İY 1-1 → 0, MS 3-1 → 1
  assert.equal(sonuc['1. Yarı ve 2. Yarıda Karşılıklı Gol Olur'], 'yatti');    // 2. yarı 2-0 → KG yok
  assert.equal(sonuc['Maç Sonucu'], 'tuttu');
});
