// Hakan Revio'nun puan cetveli: taban puan kodla hesaplanır, Revio en fazla ±2 sapabilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-puan-test-'));
const { db } = await import('../server/db.js');
const { tabanPuan, revioKarnesi } = await import('../server/agents/puan.js');
const { buildHandlers } = await import('../server/agents/handlers.js');
const { getCoupon } = await import('../server/agents/rules.js');

const sec = (o = {}) => ({ bahis: 'Maç Sonucu', secim: '1', deger: -0.13, model_olasilik: 0.6, bagimsiz_olasilik: 0.6, ...o });
const kupon = (o = {}) => ({ ajan: 'yasli-dayi', toplam_oran: 2.5, model_olasilik: 0.35, risk_uyarilari: [], secimler: [sec(), sec()], ...o });

test('iyi kupon yüksek, kötü kupon düşük taban puan alır (aralık açılır)', () => {
  const iyi = tabanPuan(kupon({ model_olasilik: 0.47, secimler: [sec({ deger: -0.06, bagimsiz_olasilik: 0.7 }), sec({ deger: -0.08, bagimsiz_olasilik: 0.65 })] }));
  const kotu = tabanPuan(kupon({ model_olasilik: 0.25, risk_uyarilari: ['a', 'b', 'c'], secimler: [sec({ deger: -0.25, bagimsiz_olasilik: 0.3 }), sec({ deger: -0.2, bagimsiz_olasilik: null })] }));
  assert.ok(iyi.puan >= 8, JSON.stringify(iyi));
  assert.ok(kotu.puan <= 3, JSON.stringify(kotu));
});

test('yüksek oranlı kupon oranından dolayı cezalandırılmaz (tipik kupona göre ölçülür)', () => {
  // 6 maç, oran 400: tipik tutma = 0,87^6/400; tam tipik olasılık → olasılık bileşeni 1,5
  const p = Math.pow(0.87, 6) / 400;
  const t = tabanPuan(kupon({ ajan: 'hizli-genc', toplam_oran: 400, model_olasilik: p, secimler: Array.from({ length: 6 }, () => sec()) }));
  assert.equal(t.olasilik, 1.5);
});

test('kupon_puanla: taban ±2 dışını reddeder, içini kaydeder', async () => {
  db.prepare("INSERT INTO kuponlar(id, ajan, tarih, olusturma, tutar, toplam_oran, olasi_kazanc, durum, model_olasilik) VALUES(9, 'yasli-dayi', '2030-01-01', 'x', 100, 2.5, 250, 'aktif', 0.35)").run();
  db.prepare("INSERT INTO kupon_secimleri(kupon_id, mac_kodu, mac_adi, bahis, secim, oran, deger, model_olasilik, bagimsiz_olasilik) VALUES(9, '1', 'A-B', 'Maç Sonucu', '1', 1.6, -0.13, 0.6, 0.6)").run();
  const t = tabanPuan(getCoupon(9));
  const h = buildHandlers({ oturumId: null, emit: () => {} });
  const arg = { kupon_id: 9, lehte: 'x', aleyhte: 'y', degistirilmeli: [], elestiri: 'z' };
  const uzak = await h.kupon_puanla.run({ ...arg, puan: t.puan + 3 > 10 ? t.puan - 3 : t.puan + 3 });
  assert.ok(uzak.isError);
  assert.match(uzak.text, /TABAN PUAN/);
  const yakin = await h.kupon_puanla.run({ ...arg, puan: Math.min(10, t.puan + 2) });
  assert.ok(!yakin.isError, yakin.text);
  assert.equal(getCoupon(9).taban_puan, t.puan);
});

test('Revio karnesi: sıkışık puan uyarısı ve işaretleme isabeti', () => {
  db.prepare("UPDATE kuponlar SET degistirilmeli = '[\"1\"]', sonuc = 'kaybetti' WHERE id = 9").run();
  db.prepare("UPDATE kupon_secimleri SET sonuc = 'yatti' WHERE kupon_id = 9").run();
  const yazi = revioKarnesi();
  assert.match(yazi, /HAKAN REVIO KARNESİ \(1 puanlı kupon\)/);
  assert.match(yazi, /işaretlediğin maçlar %0 \(0\/1\)/);
});
