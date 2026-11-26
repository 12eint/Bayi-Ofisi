// Risk kurulu: kötü değerli seçim, ortalama değer, lig yoğunluğu ve kuponlar arası çakışma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-risk-test-'));
const { db } = await import('../server/db.js');
const { riskKurulu, getCoupon } = await import('../server/agents/rules.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { buildHandlers } = await import('../server/agents/handlers.js');

const S = structuredClone(DEFAULT_SETTINGS);
const GUN = '2030-01-15';
let kod = 100;
const sec = (deger, o = {}) => ({ mac_kodu: String(++kod), bahis: 'Maç Sonucu', secim: '1', oran: 1.8, lig: `Lig ${kod}`, deger, yaklasik: false, ...o });

test('olağan marjdaki kupon temiz geçer', () => {
  const r = riskKurulu([sec(-0.13), sec(-0.12), sec(-0.14)], { gun: GUN, settings: S });
  assert.deepEqual(r, { hatalar: [], uyarilar: [] });
});

test('tek kötü seçim uyarı, iki kötü seçim ret', () => {
  const bir = riskKurulu([sec(-0.25), sec(-0.10), sec(-0.10)], { gun: GUN, settings: S });
  assert.equal(bir.hatalar.length, 0);
  assert.match(bir.uyarilar.join(), /Kötü değerli seçim/);
  const iki = riskKurulu([sec(-0.25), sec(-0.22), sec(-0.05)], { gun: GUN, settings: S });
  assert.match(iki.hatalar.join(), /2 seçimin model değeri/);
});

test('yaklaşık (iki yarı) bahisler kötü seçim sayılmaz', () => {
  const r = riskKurulu([sec(-0.30, { yaklasik: true }), sec(-0.25, { yaklasik: true }), sec(-0.12)], { gun: GUN, settings: S });
  assert.equal(r.hatalar.length, 0);
});

test('ortalama değer: −%16 uyarı, −%19 ret', () => {
  const uyari = riskKurulu([sec(-0.16), sec(-0.16), sec(-0.16)], { gun: GUN, settings: S });
  assert.equal(uyari.hatalar.length, 0);
  assert.match(uyari.uyarilar.join(), /ortalama değer/);
  const ret = riskKurulu([sec(-0.19), sec(-0.19), sec(-0.19)], { gun: GUN, settings: S });
  assert.match(ret.hatalar.join(), /ortalama model değeri/);
});

test('tek lige yığılma uyarısı', () => {
  const sl = { lig: 'Süper Lig' };
  assert.deepEqual(riskKurulu([sec(-0.13, sl), sec(-0.13, sl), sec(-0.13)], { gun: GUN, settings: S }).uyarilar, []);
  const r = riskKurulu([sec(-0.13, sl), sec(-0.13, sl), sec(-0.13, sl), sec(-0.13, sl)], { gun: GUN, settings: S });
  assert.match(r.uyarilar.join(), /Lig yoğunluğu: 4 maçın 4'i Süper Lig/);
});

test('aynı seçim diğer kuponlarda: uyarı, sınır aşılırsa ret; pasif kurul hiçbir şey demez', () => {
  const ekle = (id) => {
    db.prepare("INSERT INTO kuponlar(id, ajan, tarih, olusturma, tutar, toplam_oran, olasi_kazanc, durum) VALUES(?, 'yasli-dayi', ?, 'x', 100, 2, 200, 'aktif')").run(id, GUN);
    db.prepare("INSERT INTO kupon_secimleri(kupon_id, mac_kodu, mac_adi, bahis, secim, oran) VALUES(?, '999', 'A - B', 'Maç Sonucu', '1', 1.5)").run(id);
  };
  ekle(1);
  const ortak = sec(-0.12, { mac_kodu: '999' });
  assert.match(riskKurulu([ortak, sec(-0.12)], { gun: GUN, settings: S }).uyarilar.join(), /Diğer kuponlarla ortak: 999 .* #1/);
  ekle(2); ekle(3);
  assert.match(riskKurulu([ortak, sec(-0.12)], { gun: GUN, settings: S }).hatalar.join(), /en fazla 3 kuponda/);
  // revize edilen kupon sayılmaz
  assert.equal(riskKurulu([ortak, sec(-0.12)], { gun: GUN, settings: S, haricId: 3 }).hatalar.length, 0);
  const pasif = { ...S, riskKurulu: { ...S.riskKurulu, aktif: false } };
  assert.deepEqual(riskKurulu([ortak, sec(-0.5), sec(-0.5)], { gun: GUN, settings: pasif }), { hatalar: [], uyarilar: [] });
});

test('kupon_puanla lehte/aleyhte alanlarını kaydeder', async () => {
  const h = buildHandlers({ oturumId: null, emit: () => {} });
  const r = await h.kupon_puanla.run({ kupon_id: 1, lehte: 'Favori ağırlıklı.', aleyhte: 'Ama 999 herkeste var.', puan: 6, degistirilmeli: ['999'], elestiri: 'Hüküm: orta.' });
  assert.ok(!r.isError, r.text);
  const k = getCoupon(1);
  assert.equal(k.lehte, 'Favori ağırlıklı.');
  assert.equal(k.aleyhte, 'Ama 999 herkeste var.');
  assert.deepEqual(k.degistirilmeli, ['999']);
});
