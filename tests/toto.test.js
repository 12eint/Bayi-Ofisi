// Spor Toto: kolon hesabı, tutar sınırı, 15 maç zorunluluğu, kayıt ve sonuç değerlendirmesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BAYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bayi-toto-test-'));
const { DEFAULT_SETTINGS } = await import('../server/settings.js');
const { totoDogrula, totoKaydet, totoKuponlari, totoProgrami, totoSonuclariGuncelle } = await import('../server/toto.js');
const { KUPON_AJANLARI, AGENTS } = await import('../server/agents/definitions.js');

const S = { ...structuredClone(DEFAULT_SETTINGS), sporToto: { aktif: true, maxTutar: 500, kolonUcreti: 10 } };
const ileri = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 19);
const gecmis = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 19);
const program = (bitis = ileri, tarih = ileri) => ({ donem: 999, bitis, maclar: Array.from({ length: 15 }, (_, i) => ({ no: i + 1, ev: `E${i + 1}`, dep: `D${i + 1}`, lig: 'Lig', tarih, halk: { 1: 50, 0: 30, 2: 20 }, sonuc: null })) });
const analiz = (p) => p.maclar.map(m => ({ ...m, model: { 1: 0.5, 0: 0.3, 2: 0.2 }, bag: null }));
const teklif = (ozel = {}) => ({ ajan: 'spor-totocu', secimler: Array.from({ length: 15 }, (_, i) => ({ no: i + 1, secim: ozel[i + 1] ?? '1', gerekce: 'test' })) });

test('Spor Totocu normal kupon ajanı değil, kadroda var', () => {
  assert.ok(AGENTS['spor-totocu']?.toto);
  assert.ok(!KUPON_AJANLARI.includes('spor-totocu'));
});

test('kolon = işaret sayılarının çarpımı, tutar = kolon × ücret', () => {
  const p = program();
  const v = totoDogrula(teklif({ 1: '10', 2: '02', 3: '102' }), { program: p, analiz: analiz(p), settings: S });
  assert.ok(v.ok, v.hatalar.join(' | '));
  assert.equal(v.kupon.kolon, 12);
  assert.equal(v.kupon.tutar, 120);
  assert.equal(v.kupon.secimler[0].secim, '10');
  // 15/15 olasılığı: 1. maç 0,8 · 2. maç 0,5 · 3. maç 1 · kalan 12 maç 0,5
  assert.ok(Math.abs(v.kupon.model_olasilik - 0.8 * 0.5 * 1 * 0.5 ** 12) < 1e-9);
});

test('tutar sınırı aşılırsa ret', () => {
  const p = program();
  const v = totoDogrula(teklif({ 1: '102', 2: '102', 3: '102', 4: '102' }), { program: p, analiz: analiz(p), settings: S });   // 81 kolon = 810 TL
  assert.match(v.hatalar.join(), /810 TL; sınır 500 TL \(en fazla 50 kolon\)/);
});

test('15 maçın hepsi gerekir; geçersiz seçim ve kapanmış dönem reddedilir', () => {
  const p = program();
  const eksik = teklif(); eksik.secimler.pop();
  assert.match(totoDogrula(eksik, { program: p, analiz: analiz(p), settings: S }).hatalar.join(), /eksik maç no: 15/);
  assert.match(totoDogrula(teklif({ 5: '11' }), { program: p, analiz: analiz(p), settings: S }).hatalar.join(), /5\. maç: "11" geçersiz/);
  const kapali = program(gecmis);
  assert.match(totoDogrula(teklif(), { program: kapali, analiz: analiz(kapali), settings: S }).hatalar.join(), /kapandı/);
});

test('kayıt ve Spor Toto sonucuyla değerlendirme', async () => {
  const p = program(ileri, gecmis);
  const v = totoDogrula(teklif({ 1: '10' }), { program: p, analiz: analiz(p), settings: S });
  const id = totoKaydet(v.kupon);
  assert.equal(totoKuponlari({ donem: 999 })[0].id, id);
  // Programı önbelleğe sonuçlarıyla koy: 1. maç beraberlik (0), diğerleri ev sahibi (1) – 2. maç deplasman (2)
  const sonuclu = { ...p, maclar: p.maclar.map(m => ({ ...m, sonuc: m.no === 1 ? 'X' : m.no === 2 ? '2' : '1' })) };
  const sahte = async () => ({ ok: true, json: async () => ({ data: { gameCycleNo: 999, payinBeginDate: gecmis, payinEndDate: ileri, events: sonuclu.maclar.map(m => ({ eventNo: m.no, eventName: `${m.ev}-${m.dep}`, competitionName: 'X', eventDate: m.tarih, winner: m.sonuc, homePercentage: 50, drawPercentage: 30, awayPercentage: 20 })) } }) });
  await totoProgrami({ fetchFn: sahte, tazelikDk: 0 });
  const n = await totoSonuclariGuncelle({ fetchFn: sahte });
  assert.equal(n, 15);
  const k = totoKuponlari({ donem: 999 })[0];
  assert.equal(k.sonuclanan, 15);
  assert.equal(k.dogru, 14);   // 1. maç "10" içinde 0 var → tuttu; 2. maç 1 yazıldı, sonuç 2 → yattı
});
