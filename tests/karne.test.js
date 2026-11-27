// İki model çelişki kuralı, "yalnızca verili maç" kuralı ve tutma karnesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-karne-test-'));
const { db, istanbulDate } = await import('../server/db.js');
const { saveBulletin } = await import('../server/bulletin/store.js');
const { validateCoupon, riskKurulu } = await import('../server/agents/rules.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { tutmaKarnesi, bahisGrubu } = await import('../server/stats.js');
const { secimOlasiligi } = await import('../server/veri/bagimsiz.js');

const S = structuredClone(DEFAULT_SETTINGS);
const sec = (o = {}) => ({ mac_kodu: String(Math.random()).slice(2, 7), bahis: 'Maç Sonucu', secim: '1', oran: 1.6, lig: `L${Math.random()}`, deger: -0.12, yaklasik: false, ...o });

test('iki model çelişkisi: 10-15 puan uyarı, 15 üstü ret, bağımsız yoksa sessiz', () => {
  const r1 = riskKurulu([sec({ model_olasilik: 0.62, bagimsiz_olasilik: 0.50 }), sec()], { gun: '2030-01-01', settings: S });
  assert.match(r1.uyarilar.join(), /Şüpheli seçim/);
  assert.equal(r1.hatalar.length, 0);
  const r2 = riskKurulu([sec({ model_olasilik: 0.70, bagimsiz_olasilik: 0.45 }), sec()], { gun: '2030-01-01', settings: S });
  assert.match(r2.hatalar.join(), /iki model çelişiyor/);
  const r3 = riskKurulu([sec({ model_olasilik: 0.40, bagimsiz_olasilik: 0.70 }), sec({ model_olasilik: 0.7 })], { gun: '2030-01-01', settings: S });
  assert.equal(r3.hatalar.length + r3.uyarilar.filter(u => /çelişiyor/.test(u)).length, 0);   // bağımsız model daha iyimserse sorun yok
});

test('bağımsız modelin seçim olasılığı', () => {
  const b = { p1: 0.5, p0: 0.3, p2: 0.2, ust25: 0.6, kg: 0.55, ikiYariKg: 0.08 };
  assert.equal(secimOlasiligi(b, 'Çifte Şans', '1 ve 0'), 0.8);
  assert.equal(secimOlasiligi(b, 'Alt/Üst 2.5', 'Alt'), 0.4);
  assert.equal(secimOlasiligi(b, '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur', 'Evet / Evet'), 0.08);
  assert.equal(secimOlasiligi(b, 'Handikaplı Maç Sonucu -1', '1'), null);
});

test('Öz23 yalnızca bağımsız verisi olan maçları oynar; araç bilgi vermezse kural uygulanmaz', () => {
  const YARIN = istanbulDate(new Date(), 1);
  const mac = (kod, o1) => ({ mac_kodu: kod, lig: 'Lig', ev: `E${kod}`, deplasman: `D${kod}`, saat: '20:00', baslama: `${YARIN}T20:00:00+03:00`, mbs: 1,
    oranlar: [{ bahis: 'Maç Sonucu', secim: '1', oran: o1 }, { bahis: 'Maç Sonucu', secim: '0', oran: 4 }, { bahis: 'Maç Sonucu', secim: '2', oran: 6 }] });
  const bid = saveBulletin({ tarih: YARIN, kaynak: 'test', matches: [mac('11', 1.5), mac('12', 1.6)] });
  const bulten = db.prepare('SELECT * FROM bultenler WHERE id = ?').get(bid);
  const p = { ajan: 'yasli-dayi', secimler: [{ mac_kodu: '11', bahis: 'Maç Sonucu', secim: '1' }, { mac_kodu: '12', bahis: 'Maç Sonucu', secim: '1' }] };
  const yok = validateCoupon(p, { bulten, gun: YARIN, settings: S, bagimsiz: { 11: { verili: true, model: { p1: 0.66, p0: 0.2, p2: 0.14, ust25: 0.5, kg: 0.5, ikiYariKg: 0.05 } }, 12: { verili: false, model: null } } });
  assert.match(yok.hatalar.join(), /12: .*bağımsız veri .*yok/);
  const bilgisiz = validateCoupon(p, { bulten, gun: YARIN, settings: S });
  assert.ok(bilgisiz.ok, bilgisiz.hatalar.join(' | '));
  const genc = validateCoupon({ ...p, ajan: 'hizli-genc' }, { bulten, gun: YARIN, settings: { ...S, ajanlar: { ...S.ajanlar, 'hizli-genc': { ...S.ajanlar['hizli-genc'], minOran: 1, minMac: 2 } } }, bagimsiz: { 12: { verili: false } } });
  assert.doesNotMatch(genc.hatalar.join(), /bağımsız veri/);   // kural yalnızca yalnizcaVerili ajanlar için
});

test('tutma karnesi: ajan, bahis grubu, dilim ve model kıyası', () => {
  db.prepare("INSERT INTO kuponlar(id, ajan, tarih, olusturma, tutar, toplam_oran, olasi_kazanc, durum) VALUES(500, 'yasli-dayi', '2030-01-01', 'x', 100, 2, 200, 'aktif')").run();
  const ekle = db.prepare('INSERT INTO kupon_secimleri(kupon_id, mac_kodu, mac_adi, bahis, secim, oran, model_olasilik, bagimsiz_olasilik, sonuc) VALUES(500, ?, ?, ?, ?, ?, ?, ?, ?)');
  ekle.run('1', 'A-B', 'Maç Sonucu', '1', 1.4, 0.72, 0.80, 'tuttu');
  ekle.run('2', 'C-D', 'Maç Sonucu', '1', 1.5, 0.66, 0.40, 'yatti');
  ekle.run('3', 'E-F', 'Çifte Şans', '1 ve 0', 1.2, 0.80, null, 'tuttu');
  const k = tutmaKarnesi();
  assert.equal(k.toplam, 3);
  const dayi = k.ajanlar.find(a => a.ad === 'yasli-dayi');
  assert.equal(dayi.tutma, 66.7);
  assert.equal(dayi.nBag, 2);
  assert.equal(k.kiyas.n, 2);
  assert.ok(k.kiyas.bagimsizModel < k.kiyas.oranModeli);   // bu örnekte bağımsız model daha isabetli
  assert.deepEqual(k.dilimler.map(d => d.ad), ['%55-70', '%70-85']);
  assert.equal(bahisGrubu('1. Yarı / Maç Sonucu'), 'İY/MS');
  assert.equal(bahisGrubu('Alt/Üst 2.5'), 'Alt/Üst');
});
