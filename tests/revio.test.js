// Hakan Revio geliştirmeleri: taban puanda form ve istatistik uyumu, ders notları, yedek önerilerin yazımı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-revio-test-'));
const { db } = await import('../server/db.js');
const { tabanPuan, dersNotlari } = await import('../server/agents/puan.js');
const { yedekSatiri, couponText, getCoupon } = await import('../server/agents/rules.js');

const sec = (o = {}) => ({ mac_kodu: '1', bahis: 'Maç Sonucu', secim: '1', deger: -0.13, model_olasilik: 0.6, bagimsiz_olasilik: null, ...o });
const kupon = (secimler) => ({ ajan: 'yasli-dayi', toplam_oran: 2.5, model_olasilik: 0.36, risk_uyarilari: [], secimler });

test('form bileşeni: formdaki takımı destekleyen kupon daha yüksek taban puan alır', () => {
  const k = kupon([sec(), sec({ mac_kodu: '2' })]);
  const formda = tabanPuan(k, undefined, { istat: {}, form: { 0: 1, 1: 1 } });
  const formsuz = tabanPuan(k, undefined, { istat: {}, form: { 0: 0, 1: 0 } });
  assert.equal(formda.form, 1); assert.equal(formsuz.form, 0);
  assert.equal(formda.ham - formsuz.ham, 1);
  assert.equal(tabanPuan(k).form, 0.5);   // veri yoksa nötr
});

test('Alt/Üst seçiminde uyum Dorasal\'ın istatistik modeline göre hesaplanır', () => {
  const k = kupon([sec({ bahis: 'Alt/Üst 2.5', secim: 'Üst', model_olasilik: 0.62 })]);
  assert.equal(tabanPuan(k, undefined, { istat: { 0: 0.66 }, form: {} }).uyum, 2);   // istatistik daha iyimser
  assert.equal(tabanPuan(k, undefined, { istat: { 0: 0.45 }, form: {} }).uyum, 0);   // 17 puan geride
  assert.equal(tabanPuan(k, undefined, { istat: { 0: 0.45 }, form: {} }).veri, 1);
});

test('ders notları: yeterli veri yokken boş, model yanılınca not düşer', () => {
  assert.deepEqual(dersNotlari(), []);
  db.prepare("INSERT INTO kuponlar(id, ajan, tarih, olusturma, tutar, toplam_oran, olasi_kazanc, durum, puan) VALUES(1, 'yasli-dayi', '2030-01-01', 'x', 100, 2, 200, 'aktif', 6)").run();
  const ekle = db.prepare("INSERT INTO kupon_secimleri(kupon_id, mac_kodu, mac_adi, bahis, secim, oran, model_olasilik, sonuc) VALUES(1, ?, 'A-B', 'Karşılıklı Gol', 'Var', 1.7, 0.6, ?)");
  for (let i = 0; i < 14; i++) ekle.run(String(i), i < 5 ? 'tuttu' : 'yatti');   // model %60 dedi, %36 tuttu
  const notlar = dersNotlari();
  assert.ok(notlar.some(n => /"KG" seçimleri modelin dediğinden 24\.3 puan AZ tuttu/.test(n)), notlar.join(' | '));
});

test('yedek öneriler kupon yazısında görünür', () => {
  const y = { mac_kodu: '77', mac_adi: 'X - Y', bahis: 'Maç Sonucu', secim: '1', oran: 1.85, model: 0.58, deger: 0.07, bag: 0.61 };
  assert.equal(yedekSatiri(y), '77 X - Y Maç Sonucu: 1 @1.85 (model %58 +7%, bağımsız %61)');
  db.prepare('UPDATE kuponlar SET yedekler = ? WHERE id = 1').run(JSON.stringify([y]));
  assert.match(couponText(getCoupon(1)), /Yedek öneriler \(değiştirilmeli maçların yerine\): 77 X - Y/);
});
