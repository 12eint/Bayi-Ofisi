// Hız limiti: başka günün çekiminden sonra hedef gün için kısa bekleme yeter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-hiz-test-'));
const { db, istanbulDate } = await import('../server/db.js');
const { saveBulletin } = await import('../server/bulletin/store.js');
const { checkRateLimit, HizLimitiHatasi } = await import('../server/bulletin/scraper.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');

const BUGUN = istanbulDate(), YARIN = istanbulDate(new Date(), 1);
const S = { ...structuredClone(DEFAULT_SETTINGS), cekimMinAralikDk: 120, cekimGunlukLimit: 4 };
const cekim = (dkOnce) => {
  db.prepare('DELETE FROM cekim_kaydi').run();
  db.prepare("INSERT INTO cekim_kaydi(zaman, sonuc, detay) VALUES(?, 'basarili', 'test')").run(new Date(Date.now() - dkOnce * 60000).toISOString());
};

// Son iddaa çekimi yalnızca yarının maçlarını getirdi
saveBulletin({ tarih: YARIN, kaynak: 'iddaa.com', matches: [{
  mac_kodu: '501', lig: 'L', ev: 'A', deplasman: 'B', saat: '20:00', baslama: `${YARIN}T20:00:00+03:00`, mbs: 1,
  oranlar: [{ bahis: 'Maç Sonucu', secim: '1', oran: 1.5, mbs: 1 }],
}] });

test('aynı gün için tam aralık beklenir', () => {
  cekim(30);
  assert.throws(() => checkRateLimit(S, YARIN), HizLimitiHatasi);
  assert.throws(() => checkRateLimit(S), HizLimitiHatasi);
});

test('son çekim hedef günü getirmediyse 15 dk yeter', () => {
  cekim(5);
  assert.throws(() => checkRateLimit(S, BUGUN), /kısa bekleme/);
  cekim(20);
  assert.doesNotThrow(() => checkRateLimit(S, BUGUN));
});

test('günlük limit her durumda geçerli', () => {
  db.prepare('DELETE FROM cekim_kaydi').run();
  for (let i = 0; i < 4; i++) {
    db.prepare("INSERT INTO cekim_kaydi(zaman, sonuc, detay) VALUES(?, 'basarili', 'test')").run(new Date(Date.now() - (300 + i) * 60000).toISOString());
  }
  // Gece yarısına yakınsa çekimler dünde kalabilir; yalnızca hepsi bugünse dene
  const hepsiBugun = db.prepare('SELECT zaman FROM cekim_kaydi').all().every(r => istanbulDate(new Date(r.zaman)) === BUGUN);
  if (hepsiBugun) assert.throws(() => checkRateLimit(S, BUGUN), /limit/);
});
