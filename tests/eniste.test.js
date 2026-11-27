// İnatçı Enişte: yalnızca "1. Yarı ve 2. Yarıda Karşılıklı Gol Olur: Evet / Evet"; detay pazarlarının okunması ve modeli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-eniste-test-'));
const { db, istanbulDate } = await import('../server/db.js');
const { saveBulletin } = await import('../server/bulletin/store.js');
const { validateCoupon } = await import('../server/agents/rules.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { detaylariCek, detayOranlari, IKI_YARI_KG } = await import('../server/bulletin/detay.js');
const { yuklem } = await import('../server/model/poisson.js');
const { KUPON_AJANLARI } = await import('../server/agents/definitions.js');

const YARIN = istanbulDate(new Date(), 1);
const S = structuredClone(DEFAULT_SETTINGS);
const temel = (o1, o0, o2) => [
  { bahis: 'Maç Sonucu', secim: '1', oran: o1 }, { bahis: 'Maç Sonucu', secim: '0', oran: o0 }, { bahis: 'Maç Sonucu', secim: '2', oran: o2 },
  { bahis: 'Alt/Üst 2.5', secim: 'Alt', oran: 2.3 }, { bahis: 'Alt/Üst 2.5', secim: 'Üst', oran: 1.55 },
  { bahis: 'Karşılıklı Gol', secim: 'Var', oran: 1.5 }, { bahis: 'Karşılıklı Gol', secim: 'Yok', oran: 2.4 },
  { bahis: '1. Yarı Sonucu', secim: '1', oran: 2.9 }, { bahis: '1. Yarı Sonucu', secim: '0', oran: 2.3 }, { bahis: '1. Yarı Sonucu', secim: '2', oran: 3.6 },
  { bahis: IKI_YARI_KG, secim: 'Evet / Evet', oran: 7.5, mbs: 2 }, { bahis: IKI_YARI_KG, secim: 'Hayır / Hayır', oran: 1.4, mbs: 2 },
];
const mac = (kod, saat, ...o) => ({ mac_kodu: kod, event_id: `e${kod}`, lig: `Lig ${kod}`, ev: `Ev${kod}`, deplasman: `Dep${kod}`, saat, baslama: `${YARIN}T${saat}:00+03:00`, mbs: 1, oranlar: temel(...o) });
const bid = saveBulletin({ tarih: YARIN, kaynak: 'test', matches: [mac('701', '20:00', 2.1, 3.6, 3.3), mac('702', '21:00', 2.3, 3.5, 3.0), mac('703', '22:00', 1.9, 3.8, 3.9)] });
const bulten = db.prepare('SELECT * FROM bultenler WHERE id = ?').get(bid);
const sec = (kod, bahis = IKI_YARI_KG, secim = 'Evet / Evet') => ({ mac_kodu: kod, bahis, secim, gerekce: 'test' });

test('Enişte kupon ajanları arasında', () => {
  assert.ok(KUPON_AJANLARI.includes('inatci-eniste'));
  assert.ok(S.ajanlar['inatci-eniste'].aktif);
});

test('Enişte yalnızca Evet / Evet oynar; başka bahis ve seçim reddedilir', () => {
  const iyi = validateCoupon({ ajan: 'inatci-eniste', secimler: [sec('701'), sec('702')] }, { bulten, gun: YARIN, settings: S });
  assert.ok(iyi.ok, iyi.hatalar.join(' | '));
  assert.equal(iyi.kupon.toplam_oran, 56.25);
  const baskaBahis = validateCoupon({ ajan: 'inatci-eniste', secimler: [sec('701'), sec('702', 'Karşılıklı Gol', 'Var')] }, { bulten, gun: YARIN, settings: S });
  assert.match(baskaBahis.hatalar.join(), /senin bahsin değil/);
  const baskaSecim = validateCoupon({ ajan: 'inatci-eniste', secimler: [sec('701'), sec('702', IKI_YARI_KG, 'Hayır / Hayır')] }, { bulten, gun: YARIN, settings: S });
  assert.match(baskaSecim.hatalar.join(), /seçimi senin değil/);
});

test('MBS 2: tek maçlık Enişte kuponu reddedilir', () => {
  const tek = validateCoupon({ ajan: 'inatci-eniste', secimler: [sec('701')] }, { bulten, gun: YARIN, settings: { ...S, ajanlar: { ...S.ajanlar, 'inatci-eniste': { ...S.ajanlar['inatci-eniste'], minMac: 1, minOran: 1 } } } });
  assert.match(tek.hatalar.join(), /MBS/);
});

test('diğer ajanlar bu bahsi yine oynayabilir (kısıt yalnızca Enişte için)', () => {
  const genc = { ...S, ajanlar: { ...S.ajanlar, 'hizli-genc': { ...S.ajanlar['hizli-genc'], minOran: 10, maxOran: 1000, minMac: 2 } } };
  const r = validateCoupon({ ajan: 'hizli-genc', secimler: [sec('701'), sec('703')] }, { bulten, gun: YARIN, settings: genc });
  assert.ok(r.ok, r.hatalar.join(' | '));
});

test('model: iki yarıda KG yüklemi', () => {
  const y = yuklem(IKI_YARI_KG, 'Evet / Hayır');
  assert.equal(y.tur, 'iki');
  assert.equal(y.f(1, 1, 0, 2), true);    // 1. yarı 1-1 (KG), 2. yarı 0-2 (KG yok)
  assert.equal(y.f(1, 1, 1, 1), false);
  assert.equal(yuklem(IKI_YARI_KG, 'Evet / Evet').f(1, 2, 1, 1), true);
  assert.equal(yuklem('Deplasman Her İki Yarıda da Gol Atar', 'Evet').f(0, 1, 2, 1), true);
});

test('detay: adaylar okunur, eksik pazarlar eklenir, 429 gelince durur', async () => {
  const istekler = [];
  const govde = (id) => ({ isSuccess: true, data: { i: id, mbc: 1, m: [
    { t: 2, st: 866, s: 1, mbc: 2, o: [{ n: 'Evet / Evet', odd: 8.1 }, { n: 'Hayır / Hayır', odd: 1.3 }] },
    { t: 2, st: 861, s: 1, mbc: 2, o: [{ n: 'Evet', odd: 3.1 }, { n: 'Hayır', odd: 1.3 }] },
    { t: 4, st: 1, s: 1, o: [{ n: '1', odd: 2 }] },
  ] } });
  const sahteFetch = async (url) => {
    istekler.push(url);
    if (istekler.length === 3) return { ok: false, status: 429 };
    return { ok: true, status: 200, json: async () => govde(url.split('/').pop()) };
  };
  const ayar = { ...S, detayCekim: { aktif: true, macSayisi: 3, aralikMs: 0 } };
  const r = await detaylariCek({ bultenId: bid, gun: YARIN, marketConfig: {}, settings: ayar, fetchFn: sahteFetch });
  assert.equal(r.denenen, 3);
  assert.equal(r.okunan, 2);
  assert.match(r.durdu, /429/);
  assert.ok(istekler.every(u => u.startsWith('https://sportsbookv2.iddaa.com/sportsbook/event/e70')));
  // 866 zaten vardı (aynı seçim tekrar eklenmez); 861 yeni eklenir; canlı pazar (t=4) alınmaz
  const n = db.prepare("SELECT COUNT(*) n FROM oranlar WHERE bahis = 'Ev Sahibi Her İki Yarıda da Gol Atar'").get().n;
  assert.equal(n, 4);
  assert.equal(r.iki_yari_kg, 0);
  assert.deepEqual(detayOranlari(govde('x'), {}).map(o => o.bahis).sort(), ['1. Yarı ve 2. Yarıda Karşılıklı Gol Olur', '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur', 'Ev Sahibi Her İki Yarıda da Gol Atar', 'Ev Sahibi Her İki Yarıda da Gol Atar']);
});
