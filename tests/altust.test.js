// Alt-Üstçü: yalnızca Alt/Üst bahis kuralı, ceza sahası içi şut sayımı ve istatistik modeli (ağa çıkmadan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-altust-test-'));
const { db, istanbulDate } = await import('../server/db.js');
const { saveBulletin } = await import('../server/bulletin/store.js');
const { validateCoupon } = await import('../server/agents/rules.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { kutuSutlari, macIstatistik } = await import('../server/veri/istatistik.js');
const { KUPON_AJANLARI } = await import('../server/agents/definitions.js');

const YARIN = istanbulDate(new Date(), 1);
const S = structuredClone(DEFAULT_SETTINGS);
const oranlar = [
  { bahis: 'Maç Sonucu', secim: '1', oran: 2 }, { bahis: 'Maç Sonucu', secim: '0', oran: 3.4 }, { bahis: 'Maç Sonucu', secim: '2', oran: 3.6 },
  { bahis: 'Alt/Üst 2.5', secim: 'Üst', oran: 1.7 }, { bahis: 'Alt/Üst 2.5', secim: 'Alt', oran: 2.1 },
  { bahis: '1. Yarı Alt/Üst 0.5', secim: 'Üst', oran: 1.3 }, { bahis: 'Maç Sonucu ve Alt/Üst 2.5', secim: '1 ve Üst', oran: 3.5 },
];
const mac = (kod) => ({ mac_kodu: kod, lig: 'Lig', ev: `E${kod}`, deplasman: `D${kod}`, saat: '20:00', baslama: `${YARIN}T20:00:00+03:00`, mbs: 1, oranlar });
const bid = saveBulletin({ tarih: YARIN, kaynak: 'test', matches: [mac('81'), mac('82')] });
const bulten = db.prepare('SELECT * FROM bultenler WHERE id = ?').get(bid);
const ayar = { ...S, ajanlar: { ...S.ajanlar, 'alt-ustcu': { ...S.ajanlar['alt-ustcu'], minOran: 1.5, maxOran: 10 } } };

test('Alt-Üstçü kupon ajanı', () => assert.ok(KUPON_AJANLARI.includes('alt-ustcu')));

test('yalnızca Alt/Üst: maç ve ilk yarı çizgisi geçer, kombine ve MS reddedilir', () => {
  const iyi = validateCoupon({ ajan: 'alt-ustcu', secimler: [{ mac_kodu: '81', bahis: 'Alt/Üst 2.5', secim: 'Üst' }, { mac_kodu: '82', bahis: '1. Yarı Alt/Üst 0.5', secim: 'Üst' }] }, { bulten, gun: YARIN, settings: ayar });
  assert.ok(iyi.ok, iyi.hatalar.join(' | '));
  const ms = validateCoupon({ ajan: 'alt-ustcu', secimler: [{ mac_kodu: '81', bahis: 'Maç Sonucu', secim: '1' }, { mac_kodu: '82', bahis: 'Alt/Üst 2.5', secim: 'Alt' }] }, { bulten, gun: YARIN, settings: ayar });
  assert.match(ms.hatalar.join(), /81: "Maç Sonucu" senin bahsin değil/);
  const kombine = validateCoupon({ ajan: 'alt-ustcu', secimler: [{ mac_kodu: '81', bahis: 'Maç Sonucu ve Alt/Üst 2.5', secim: '1 ve Üst' }, { mac_kodu: '82', bahis: 'Alt/Üst 2.5', secim: 'Alt' }] }, { bulten, gun: YARIN, settings: ayar });
  assert.match(kombine.hatalar.join(), /senin bahsin değil/);
});

test('ceza sahası içi şut: kısaltılmış takım adı eşleşir, anlatım yoksa null', () => {
  const y = [
    { text: 'Attempt saved. A (Freiburg) right footed shot from the centre of the box is saved.' },
    { text: 'Attempt missed. B (Freiburg) header from very close range misses.' },
    { text: 'Attempt blocked. C (RB Leipzig) left footed shot from outside the box is blocked.' },
    { text: 'Goal! Freiburg 1, RB Leipzig 0. D (Freiburg) right footed shot from the left side of the box.' },
    { text: 'Corner, RB Leipzig. Conceded by E.' },
  ];
  const s = kutuSutlari(y, [{ ad: 'SC Freiburg', kisa: 'Freiburg' }, { ad: 'RB Leipzig', kisa: 'Leipzig' }]);
  assert.deepEqual(s['SC Freiburg'], { ic: 3, dis: 0 });
  assert.deepEqual(s['RB Leipzig'], { ic: 0, dis: 1 });
  assert.equal(kutuSutlari([], [{ ad: 'X' }]), null);
});

test('maç istatistiği: kutu skoru + anlatım özetlenir ve önbelleğe alınır', async () => {
  let istek = 0;
  const govde = { header: { competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: 'home', score: '2', team: { id: '1' } }, { homeAway: 'away', score: '1', team: { id: '2' } }] }] },
    boxscore: { teams: [
      { team: { id: '1', displayName: 'Ev FC', shortDisplayName: 'Ev' }, statistics: [{ name: 'totalShots', displayValue: '15' }, { name: 'shotsOnTarget', displayValue: '6' }, { name: 'wonCorners', displayValue: '7' }, { name: 'possessionPct', displayValue: '55' }] },
      { team: { id: '2', displayName: 'Dep SK', shortDisplayName: 'Dep' }, statistics: [{ name: 'totalShots', displayValue: '8' }, { name: 'shotsOnTarget', displayValue: '2' }] }] },
    commentary: [{ text: 'Attempt saved. X (Ev) shot from the centre of the box.' }, { text: 'Attempt missed. Y (Dep SK) shot from outside the box.' }] };
  const sahte = async () => { istek++; return { ok: true, json: async () => govde }; };
  const s = await macIstatistik('eng.1', 'e1', sahte);
  assert.equal(s.ev.sut, 15); assert.equal(s.ev.isabetli, 6); assert.equal(s.ev.kutuIci, 1); assert.equal(s.dep.kutuDisi, 1); assert.equal(s.ev.gol, 2);
  await macIstatistik('eng.1', 'e1', sahte);
  assert.equal(istek, 1);   // ikinci çağrı önbellekten
});
