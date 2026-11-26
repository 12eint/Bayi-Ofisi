// Kural motoru, ayrıştırıcılar ve sonuç değerlendirme testleri (ayrı geçici veritabanıyla)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-test-'));
const { tomorrow } = await import('../server/db.js');
const { saveBulletin, latestBulletin } = await import('../server/bulletin/store.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { validateCoupon, saveCoupon } = await import('../server/agents/rules.js');
const { parseText } = await import('../server/bulletin/parseText.js');
const { parseApiResponses } = await import('../server/bulletin/parseApi.js');
const { evaluateSelection } = await import('../server/stats.js');

const T = tomorrow();
const mac = (kod, ms1, mbs = 1, lig = 'Test Ligi') => ({
  mac_kodu: kod, lig, ev: `Ev${kod}`, deplasman: `Dep${kod}`, saat: '20:00', baslama: `${T}T20:00:00+03:00`, mbs,
  oranlar: [
    { bahis: 'Maç Sonucu', secim: '1', oran: ms1, mbs }, { bahis: 'Maç Sonucu', secim: '0', oran: 3.4, mbs }, { bahis: 'Maç Sonucu', secim: '2', oran: 4.1, mbs },
    { bahis: 'Alt/Üst 2.5', secim: 'Üst', oran: 1.8, mbs },
  ],
});
saveBulletin({ tarih: T, kaynak: 'test', matches: [mac('101', 1.5), mac('102', 1.6), mac('103', 1.7, 3), mac('104', 1.45), mac('105', 20, 1, 'U19 Ligi')] });
const bulten = latestBulletin(T);
const S = structuredClone(DEFAULT_SETTINGS);
const sec = (kod, secim = '1', bahis = 'Maç Sonucu') => ({ mac_kodu: kod, bahis, secim, gerekce: 'test' });

test('aralık içindeki kupon kabul edilir ve oranı sistem hesaplar', () => {
  const v = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('101'), sec('102')] }, { bulten, settings: S });
  assert.equal(v.ok, true, v.hatalar.join());
  assert.equal(v.kupon.toplam_oran, 2.4);
  assert.equal(v.kupon.olasi_kazanc, 240);
});

test('toplam oran aralık dışıysa reddedilir', () => {
  const v = validateCoupon({ ajan: 'beyaz-hayalci', secimler: [sec('101'), sec('102'), sec('104')] }, { bulten, settings: S });
  assert.equal(v.ok, false);
  assert.match(v.hatalar.join(), /Toplam oran/);
});

test('MBS kuralı: MBS 3 maç 2 maçlık kupona giremez', () => {
  const v = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('101'), sec('103')] }, { bulten, settings: S });
  assert.equal(v.ok, false);
  assert.match(v.hatalar.join(), /MBS/);
});

test('aynı maçtan iki seçim ve bültende olmayan bahis reddedilir', () => {
  const v = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('101'), sec('101', 'Üst', 'Alt/Üst 2.5'), sec('102', 'Var', 'Karşılıklı Gol')] }, { bulten, settings: S });
  assert.equal(v.ok, false);
  assert.match(v.hatalar.join(), /Aynı maçtan/);
  assert.match(v.hatalar.join(), /bültende yok/);
});

test('tek maç oran sınırı ve hariç lig filtresi uygulanır', () => {
  const s = { ...S, ligHaric: ['U19'] };
  const v = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('101'), sec('105')] }, { bulten, settings: s });
  assert.equal(v.ok, false);
  assert.match(v.hatalar.join(), /tek maç aralığı/);
  assert.match(v.hatalar.join(), /hariç/);
});

test('günlük bütçe aşılamaz', () => {
  const s = { ...S, gunlukButce: 150 };
  const v1 = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('101'), sec('102')] }, { bulten, settings: s });
  saveCoupon(v1.kupon, { oturumId: null, risk: 'düşük' });
  const v2 = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('104'), sec('102')] }, { bulten, settings: s });
  assert.equal(v2.ok, false);
  assert.match(v2.hatalar.join(), /bütçe/);
});

test('yapıştırılan bülten metni ayrıştırılır, bozuk satır raporlanır', () => {
  const metin = ['UEFA AVRUPA LİGİ', 'Yarın', '1', '0', '2',
    '20:45', 'Lyon', 'Lillestrom', '1.30', '5.10', '8.00', '1.70', '2.60', '7.00', '0:1', '2.10', '3.60', '2.70', '2.40', '1.50', '1.80', '1.90', '1209',
    '23:00', 'Bozuk', 'Satir', '1.30', '5.10', '999'].join('\n');
  const r = parseText(metin, T);
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].mac_kodu, '1209');
  assert.equal(r.matches[0].oranlar.find(o => o.bahis === 'Maç Sonucu' && o.secim === '1').oran, 1.3);
  assert.equal(r.errors.length, 1);
});

test('iddaa JSON yanıtı ayrıştırılır (pai = maç kodu, kapalı oran ve canlı bahis alınmaz)', () => {
  const d = Math.floor(new Date(`${T}T18:00:00+03:00`).getTime() / 1000);
  const responses = [
    { url: 'x/get_market_config', body: { data: { m: { '1_1': { n: 'Maç Sonucu' }, '2_101': { n: 'Alt/Üst {0}' } } } } },
    { url: 'x/competitions', body: { data: [{ i: 7, n: 'Süper Lig' }] } },
    { url: 'x/events?st=1', body: { data: { events: [{ i: 1, pai: 4321, hn: 'A', an: 'B', sid: 1, ci: 7, d, mbc: 2, m: [
      { t: 1, st: 1, mbc: 2, o: [{ n: '1', odd: 1.0 }, { n: '0', odd: 3.1 }, { n: '2', odd: 2.2 }] },
      { t: 2, st: 101, sov: '2.5', mbc: 1, o: [{ n: 'Alt', odd: 1.9 }, { n: 'Üst', odd: 1.8 }] },
      { t: 4, st: 1, mbc: 1, o: [{ n: '1', odd: 2 }] }] }] } } },
  ];
  const r = parseApiResponses(responses, T);
  assert.equal(r.matches.length, 1);
  const m = r.matches[0];
  assert.equal(m.mac_kodu, '4321'); assert.equal(m.lig, 'Süper Lig'); assert.equal(m.mbs, 2);
  assert.equal(m.oranlar.length, 4); // MS1 kapalı (1.00), canlı bahis yok
  assert.ok(m.oranlar.some(o => o.bahis === 'Alt/Üst 2.5' && o.secim === 'Üst'));
});

test('abonelik payı: taban alınır, sınır aşılınca DUR, yeni dilimde sıfırlanır', async () => {
  const { butceKontrol, butceDolu } = await import('../server/db.js');
  const s1 = new Date(Date.now() + 3 * 3600000).toISOString();
  assert.equal(butceKontrol({ yuzde: 57, sifirlanma: s1, limit: 25 }).durum, 'DEVAM');            // taban 57
  assert.equal(butceKontrol({ yuzde: 70, sifirlanma: s1, asama: 'tur_basla', limit: 25 }).durum, 'DEVAM');
  assert.equal(butceKontrol({ yuzde: 78, sifirlanma: s1, asama: 'tur_bitti', limit: 25 }).kalan, 4);
  assert.equal(butceKontrol({ yuzde: 78, sifirlanma: s1, asama: 'tur_basla', limit: 25 }).durum, 'YETERSIZ');  // tahmini tur > kalan
  assert.equal(butceKontrol({ yuzde: 83, sifirlanma: s1, limit: 25 }).durum, 'DUR');
  assert.ok(butceDolu());
  const s2 = new Date(Date.now() + 8 * 3600000).toISOString();
  const yeni = butceKontrol({ yuzde: 2, sifirlanma: s2, limit: 25 });
  assert.equal(yeni.durum, 'DEVAM'); assert.equal(yeni.harcanan, 0);
  assert.equal(butceDolu(), null);
});

test('panel modu: yalnızca Genel Müdür çalışırken artan yüzde sayılır', async () => {
  const { sistemPayiOlc, sistemCalismaBitti, payDurumuSor } = await import('../server/db.js');
  const s = new Date(Date.now() + 2 * 3600000).toISOString();
  // 1. çalışma: %60 → %66 (6 puan)
  sistemPayiOlc({ yuzde: 60, ilk: 60, sifirlanma: s, limit: 25 });
  assert.equal(sistemPayiOlc({ yuzde: 66, ilk: 60, sifirlanma: s, limit: 25 }).harcanan, 6);
  sistemCalismaBitti();
  // aradaki başka kullanım (%66 → %80) sayılmaz; 2. çalışma: %80 → %84
  assert.equal(sistemPayiOlc({ yuzde: 84, ilk: 80, sifirlanma: s, limit: 25 }).harcanan, 10);
  sistemCalismaBitti();
  assert.equal(payDurumuSor({ limit: 25 }).kalan, 15);
  // 3. çalışma payı aşar
  assert.equal(sistemPayiOlc({ yuzde: 100, ilk: 85, sifirlanma: s, limit: 25 }).durum, 'DUR');
});

test('skordan seçim değerlendirme', () => {
  assert.equal(evaluateSelection('Maç Sonucu', '1', 2, 1), 'tuttu');
  assert.equal(evaluateSelection('Çifte Şans', '0 ve 2', 2, 1), 'yatti');
  assert.equal(evaluateSelection('Alt/Üst 2.5', 'Üst', 2, 1), 'tuttu');
  assert.equal(evaluateSelection('Karşılıklı Gol', 'Var', 1, 0), 'yatti');
  assert.equal(evaluateSelection('Maç Sonucu ve Alt/Üst 2.5', '1 ve Alt', 1, 0), 'tuttu');
  assert.equal(evaluateSelection('1. Yarı Sonucu', '1', 1, 0), null);
});
