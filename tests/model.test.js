// Poisson model olasılığı testleri (veritabanı gerektirmez)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yuklem, piyasaOlasiliklari, uydur, macModeli, secimDegeri, dagilim } from '../server/model/poisson.js';

// Bilinen λ'dan "adil" oranlar üret → model aynı λ'yı geri bulmalı
const LH = 1.6, LA = 0.9;
const d = dagilim(LH, LA);
const p = (bahis, secim) => { const y = yuklem(bahis, secim); return d.reduce((x, [a, b, c, e, q]) => x + (y.f(a, b, c, e) ? q : 0), 0); };
const adil = (bahis, secimler, marj = 0) => secimler.map(s => ({ bahis, secim: s, oran: Math.round(100 / (p(bahis, s) * (1 + marj))) / 100 }));
const ORANLAR = [
  ...adil('Maç Sonucu', ['1', '0', '2'], 0.12),
  ...adil('Alt/Üst 2.5', ['Alt', 'Üst'], 0.12),
  ...adil('Karşılıklı Gol', ['Var', 'Yok'], 0.12),
  ...adil('1. Yarı Sonucu', ['1', '0', '2'], 0.12),
  { bahis: 'Toplam Korner Sayısı Alt/Üst 9.5', secim: 'Üst', oran: 1.8 },
];

test('olasılıklar toplamı 1 ve tamamlayıcı seçimler tutarlı', () => {
  assert.ok(Math.abs(d.reduce((x, r) => x + r[4], 0) - 1) < 1e-9);
  assert.ok(Math.abs(p('Maç Sonucu', '1') + p('Maç Sonucu', '0') + p('Maç Sonucu', '2') - 1) < 1e-9);
  assert.ok(Math.abs(p('Çifte Şans', '1 ve 0') - p('Maç Sonucu', '1') - p('Maç Sonucu', '0')) < 1e-9);
  assert.ok(Math.abs(p('1. Yarı / Maç Sonucu', '1/1') + p('1. Yarı / Maç Sonucu', '0/1') + p('1. Yarı / Maç Sonucu', '2/1') - p('Maç Sonucu', '1')) < 1e-9);
  // Handikap: ev +1 → ev kazanır = ev kazanır ya da berabere
  assert.ok(Math.abs(p('Handikaplı Maç Sonucu 1', '1') - p('Çifte Şans', '1 ve 0')) < 1e-9);
});

test('marj orantılı olarak çıkarılır', () => {
  const { olasilik, marj } = piyasaOlasiliklari([{ secim: 'A', oran: 1.8 }, { secim: 'B', oran: 1.8 }]);
  assert.ok(Math.abs(olasilik.A - 0.5) < 1e-9);
  assert.ok(Math.abs(marj - (2 / 1.8 - 1)) < 1e-9);
  // Çifte Şans: olasılıklar toplamı 2
  const cs = adil('Çifte Şans', ['1 ve 0', '1 ve 2', '0 ve 2'], 0.1);
  const v = secimDegeri(cs, null, 'Çifte Şans', '1 ve 0', cs[0].oran);
  assert.ok(Math.abs(v.piyasa - p('Çifte Şans', '1 ve 0')) < 0.01, `ÇŞ piyasa ${v.piyasa}`);
});

test('oranlardan beklenen goller geri bulunur', () => {
  const u = uydur(ORANLAR);
  assert.ok(u, 'model kurulmalı');
  assert.ok(Math.abs(u.lh - LH) < 0.08, `λev ${u.lh}`);
  assert.ok(Math.abs(u.la - LA) < 0.08, `λdep ${u.la}`);
  assert.ok(Math.abs(u.ilkYariPayi - 0.45) <= 0.01, `ilk yarı payı ${u.ilkYariPayi}`);
});

test('değer = model × oran − 1; korner ve MS’siz maç modellenmez', () => {
  const m = macModeli(ORANLAR);
  const o = ORANLAR.find(x => x.bahis === 'Maç Sonucu' && x.secim === '1');
  const v = secimDegeri(ORANLAR, m, o.bahis, o.secim, o.oran);
  assert.ok(Math.abs(v.deger - (v.model * o.oran - 1)) < 1e-3);
  assert.ok(v.deger < 0 && v.deger > -0.2, `marjlı oranda değer hafif negatif olmalı: ${v.deger}`);
  // Yarı sonucu uydurulmadığı hâlde piyasayla tutarlı
  const iy = secimDegeri(ORANLAR, m, '1. Yarı Sonucu', '0', ORANLAR.find(x => x.bahis === '1. Yarı Sonucu' && x.secim === '0').oran);
  assert.ok(Math.abs(iy.model - iy.piyasa) < 0.03);
  assert.equal(m.olasilik('Toplam Korner Sayısı Alt/Üst 9.5', 'Üst'), null);
  assert.equal(macModeli(ORANLAR.filter(x => x.bahis !== 'Maç Sonucu')), null);
});

test('MS\'de bir seçim kapalıysa model yine kurulur', () => {
  const u = uydur(ORANLAR.filter(x => !(x.bahis === 'Maç Sonucu' && x.secim === '1')));
  assert.ok(u, 'model kurulmalı');
  assert.ok(Math.abs(u.lh - LH) < 0.15 && Math.abs(u.la - LA) < 0.15, `λ ${u.lh}-${u.la}`);
});
