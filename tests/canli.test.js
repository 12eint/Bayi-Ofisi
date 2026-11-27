// Canlı skor: ESPN skor tablosu ayrıştırma ve seçimin anlık durumu (ağ yok, sahte fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-canli-test-'));
const { gunSkorlari } = await import('../server/veri/espn.js');
const { secimCanli } = await import('../server/canli.js');

const gol = (takim, dk) => ({ scoringPlay: true, team: { id: takim }, clock: { displayValue: dk } });
const tablo = {
  events: [{
    competitions: [{
      status: { period: 2, displayClock: "63'", type: { state: 'in', completed: false, shortDetail: "63'" } },
      competitors: [
        { homeAway: 'home', score: '2', team: { id: 1, displayName: 'Lyon', shortDisplayName: 'Lyon' } },
        { homeAway: 'away', score: '1', team: { id: 2, displayName: 'AS Monaco', shortDisplayName: 'Monaco' } },
      ],
      details: [gol(1, "12'"), gol(2, "45'+2'"), gol(1, "58'")],
    }],
  }],
};
const sahteFetch = async () => ({ ok: true, json: async () => tablo });

test('oynanan maç: dakika, skor ve yarı ayrımı gol dakikalarından çıkar', async () => {
  const [m] = await gunSkorlari('fra.1', '2030-05-01', sahteFetch);
  assert.equal(m.durum, 'in'); assert.equal(m.dk, "63'"); assert.equal(m.tamamlandi, false);
  assert.deepEqual(m.skor, [2, 1]); assert.deepEqual(m.iy, [1, 1]); assert.deepEqual(m.ikinci, [1, 0]);
});

test('seçimin anlık durumu', () => {
  const m = { skor: [2, 1], iy: [1, 1], ikinci: [1, 0], devre: 2, tamamlandi: false };
  assert.deepEqual(secimCanli('Maç Sonucu', '1', m), { tutuyor: true, kesin: false });
  assert.deepEqual(secimCanli('Alt/Üst 2,5', 'Üst', m), { tutuyor: true, kesin: true });    // çizgi aşıldı
  assert.deepEqual(secimCanli('Alt/Üst 2,5', 'Alt', m), { tutuyor: false, kesin: true });
  assert.deepEqual(secimCanli('Karşılıklı Gol', 'Var', m), { tutuyor: true, kesin: true });
  assert.deepEqual(secimCanli('1. Yarı Sonucu', '0', m), { tutuyor: true, kesin: true });    // ilk yarı bitti
  assert.deepEqual(secimCanli('1. Yarı ve 2. Yarıda Karşılıklı Gol Olur', 'Evet / Evet', m), { tutuyor: false, kesin: false });
  assert.equal(secimCanli('Korner Alt/Üst 9,5', 'Üst', m), null);
  // ilk yarı sürerken gol listesi eksikse: yarı bahsi skordan, iki yarılık bahis değerlendirilemez
  const iyde = { skor: [0, 1], iy: null, ikinci: null, devre: 1 };
  assert.deepEqual(secimCanli('1. Yarı Sonucu', '2', iyde), { tutuyor: true, kesin: false });
  assert.equal(secimCanli('1. Yarı / Maç Sonucu', '2/2', iyde), null);
});
