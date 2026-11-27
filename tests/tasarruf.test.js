// Token tasarrufu: ajan modeli ve tasarruf talimatı ayarla açılıp kapanır (eski davranışa dönüş), aday paketi kurallara uyar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-tasarruf-test-'));
const { istanbulDate } = await import('../server/db.js');
const { saveBulletin } = await import('../server/bulletin/store.js');
const { agentMarkdown, AGENTS } = await import('../server/agents/definitions.js');
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { adayPaketi, secimOranAraligi } = await import('../server/agents/aday.js');

test('varsayılan: ajanlar Sonnet ve tasarruf talimatlı; eski ayarla Harambe ile aynı model ve talimatsız', () => {
  const yeni = agentMarkdown('yasli-dayi', DEFAULT_SETTINGS);
  assert.match(yeni, /^model: sonnet$/m);
  assert.match(yeni, /TOKEN TASARRUFU/);
  const eski = agentMarkdown('yasli-dayi', { ...DEFAULT_SETTINGS, ajanModeli: { varsayilan: 'inherit' }, tokenTasarrufu: { aktif: false } });
  assert.match(eski, /^model: inherit$/m);
  assert.doesNotMatch(eski, /TOKEN TASARRUFU/);
  assert.ok(eski.includes(AGENTS['yasli-dayi'].prompt.trim()));   // karakter ve kurallar aynen duruyor
  assert.match(agentMarkdown('yasli-dayi', { ajanModeli: { varsayilan: 'gecersiz' } }), /^model: inherit$/m);
});

test('seçim başına oran aralığı kupon aralığından çıkar', () => {
  assert.deepEqual(secimOranAraligi({ minOran: 2, maxOran: 5, minMac: 2, maxMac: 4 }, { tekMacMinOran: 1.1, tekMacMaxOran: 150 }), [1.19, 2.24]);
});

test('aday paketi: Alt-Üstçü yalnızca Alt/Üst, Öz23 yalnızca yüksek olasılıklı seçim alır', async () => {
  const YARIN = istanbulDate(new Date(), 1);
  const mac = (kod, o1) => ({ mac_kodu: kod, lig: 'Egzotik Lig', ev: `E${kod}`, deplasman: `D${kod}`, saat: '20:00', baslama: `${YARIN}T20:00:00+03:00`, mbs: 1,
    oranlar: [{ bahis: 'Maç Sonucu', secim: '1', oran: o1 }, { bahis: 'Maç Sonucu', secim: '0', oran: 4.2 }, { bahis: 'Maç Sonucu', secim: '2', oran: 6.5 },
      { bahis: 'Alt/Üst 2.5', secim: 'Üst', oran: 1.75 }, { bahis: 'Alt/Üst 2.5', secim: 'Alt', oran: 2.0 },
      { bahis: 'Karşılıklı Gol', secim: 'Var', oran: 1.8 }, { bahis: 'Karşılıklı Gol', secim: 'Yok', oran: 1.95 }] });
  saveBulletin({ tarih: YARIN, kaynak: 'test', matches: [mac('91', 1.45), mac('92', 1.6)] });
  const S = { ...structuredClone(DEFAULT_SETTINGS), ajanlar: { ...DEFAULT_SETTINGS.ajanlar, 'alt-ustcu': { ...DEFAULT_SETTINGS.ajanlar['alt-ustcu'], yalnizcaVerili: false } } };
  const au = await adayPaketi('alt-ustcu', YARIN, { settings: S, adet: 5 });
  assert.ok(au.adaylar.length > 0);
  assert.ok(au.adaylar.every(x => /Alt\/Üst/.test(x.o.bahis)), JSON.stringify(au.adaylar.map(x => x.o.bahis)));
  const dayi = await adayPaketi('yasli-dayi', YARIN, { settings: S, adet: 5 });
  assert.ok(dayi.adaylar.length === 0);   // yalnızca verili lig (Egzotik Lig ESPN'de yok) → aday yok
});
