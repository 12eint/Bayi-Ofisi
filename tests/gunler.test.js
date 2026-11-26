// Gün bağımsız bülten modeli: bir çekimde birden çok gün, kupon istenen güne yapılır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-gun-test-'));
const { istanbulDate } = await import('../server/db.js');
const { saveBulletin, gunBulteni, listMatches, bultenGunleri, varsayilanGun, bulletinStatus } = await import('../server/bulletin/store.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { validateCoupon } = await import('../server/agents/rules.js');
const { buildHandlers } = await import('../server/agents/handlers.js');

const BUGUN = istanbulDate(), YARIN = istanbulDate(new Date(), 1), OBUR = istanbulDate(new Date(), 2);
const saatSonra = (s) => new Date(Date.now() + s * 3600000).toISOString();
const mac = (kod, baslama, ms1 = 1.5) => ({
  mac_kodu: kod, lig: 'Test Ligi', ev: `Ev${kod}`, deplasman: `Dep${kod}`, saat: '20:00', baslama, mbs: 1,
  oranlar: [{ bahis: 'Maç Sonucu', secim: '1', oran: ms1, mbs: 1 }, { bahis: 'Maç Sonucu', secim: '0', oran: 3.6, mbs: 1 }, { bahis: 'Maç Sonucu', secim: '2', oran: 5.5, mbs: 1 }],
});
// Bugün için gece yarısına kalan saat (testin bugün içinde kalması için en fazla 1 dk sonrası değil, bugünün son saatleri)
const bugunGec = `${BUGUN}T23:30:00+03:00`;
const ok = new Date(bugunGec).getTime() > Date.now() + 15 * 60000;   // gece çok geçse bugün maçı başlamış sayılır

// Tek çekimde üç günün maçları
saveBulletin({ tarih: YARIN, kaynak: 'test', matches: [
  mac('201', bugunGec), mac('202', bugunGec, 1.6),
  mac('301', `${YARIN}T20:00:00+03:00`), mac('302', `${YARIN}T21:00:00+03:00`, 1.7),
  mac('401', `${OBUR}T19:00:00+03:00`),
] });
const S = structuredClone(DEFAULT_SETTINGS);
const sec = (kod) => ({ mac_kodu: kod, bahis: 'Maç Sonucu', secim: '1', gerekce: 'test' });

test('bir çekimdeki maçlar kendi günlerine dağılır', () => {
  const gunler = bultenGunleri().map(g => [g.gun, g.mac_sayisi]);
  assert.deepEqual(gunler, [[BUGUN, 2], [YARIN, 2], [OBUR, 1]]);
  const b = gunBulteni(YARIN);
  assert.deepEqual(listMatches(b.id, { gun: YARIN }).map(m => m.mac_kodu), ['301', '302']);
  assert.equal(bulletinStatus(OBUR).mac_sayisi, 1);
});

test('varsayılan gün: bugün başlamamış maç varsa bugün', () => {
  assert.equal(varsayilanGun(), ok ? BUGUN : YARIN);
});

test('kupon istenen güne yazılır, başka günün maçı reddedilir', () => {
  const v = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('301'), sec('302')] }, { bulten: gunBulteni(YARIN), gun: YARIN, settings: S });
  assert.equal(v.ok, true, v.hatalar.join());
  assert.equal(v.kupon.tarih, YARIN);
  const r = validateCoupon({ ajan: 'yasli-dayi', secimler: [sec('301'), sec('401')] }, { bulten: gunBulteni(YARIN), gun: YARIN, settings: S });
  assert.equal(r.ok, false);
  assert.match(r.hatalar.join(), /401: bu maç .* gününde/);
});

test('daha yeni çekim, o günün oranlarını günceller; diğer günler eski çekimden okunur', () => {
  saveBulletin({ tarih: OBUR, kaynak: 'test2', matches: [mac('401', `${OBUR}T19:00:00+03:00`, 1.9)] });
  assert.equal(gunBulteni(OBUR).kaynak, 'test2');
  assert.equal(gunBulteni(YARIN).kaynak, 'test');
});

test('araçlar tarih parametresiyle doğru günü listeler', async () => {
  const h = buildHandlers({ emit: () => {} });
  const t = (await h.bulten_listele.run({ tarih: OBUR })).text;
  assert.match(t, /401/);
  assert.doesNotMatch(t, /\b301\b/);
  const d = (await h.mac_detay.run({ mac_kodu: '301', tarih: OBUR })).text;
  assert.match(d, new RegExp(`${YARIN} gününde var`));
});
