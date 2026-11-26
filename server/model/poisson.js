// Model olasılığı: bültendeki oranlardan maç başına beklenen gol (λ) çıkaran Poisson modeli.
//
// Yöntem
// 1) Her pazarın (MS, Alt/Üst, KG, takım golleri) oranlarından bayi marjı çıkarılır → "piyasa olasılığı".
// 2) Bu olasılıklara en iyi uyan ev/deplasman beklenen golü (λev, λdep) aranır (bağımsız Poisson).
// 3) Goller iki yarıya ~%45 / %55 bölünür; böylece tek bir tutarlı skor dağılımından
//    yarı sonuçları, handikap, kombine bahisler dahil her seçimin olasılığı hesaplanır.
// 4) Değer = model olasılığı × oran − 1 (pozitifse oran, modele göre cömert).
//
// Sınır: Model yalnızca bülten oranlarına dayanır (form/sakatlık verisi yok). Pazarlar arasındaki
// tutarsızlıkları ve marjın hangi seçimde daha ağır olduğunu gösterir; bağımsız bir "bilgi" değildir.

const MAX_GOL = 10;        // tam maç ızgarası
const YARI_MAX = 7;        // yarı başına takım golü
const ILK_YARI_PAYI = 0.45;

const fakt = [1];
for (let i = 1; i <= 20; i++) fakt[i] = fakt[i - 1] * i;
const pois = (k, l) => Math.exp(-l) * l ** k / fakt[k];
const poisDizi = (l, n) => Array.from({ length: n + 1 }, (_, k) => pois(k, l));

const sayi = (s) => Number(String(s).replace(',', '.'));
const AU = /^(?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/;

/**
 * Bahis + seçim için skor yüklemi döndürür: f(h1, a1, h2, a2) → true/false.
 * h1/a1 = 1. yarı ev/dep golü, h2/a2 = 2. yarı. Desteklenmeyen bahis (korner vb.) → null.
 * ftOnly: yalnızca tam maç skoruna bağlı (model uydurmada kullanılabilir).
 */
export function yuklem(bahis, secim) {
  const ms = (h, a) => (h > a ? '1' : h < a ? '2' : '0');
  const au = (top, cizgi, s) => (s === 'Üst' ? top > cizgi : top < cizgi);
  const ft = (f) => ({ f: (h1, a1, h2, a2) => f(h1 + h2, a1 + a2), ftOnly: true, tur: 'ft' });
  const ht = (f) => ({ f: (h1, a1) => f(h1, a1), ftOnly: false, tur: 'ht' });
  let m;

  if (bahis === 'Maç Sonucu') return ft((h, a) => ms(h, a) === secim);
  if (bahis === 'Çifte Şans') return ft((h, a) => secim.split(' ve ').includes(ms(h, a)));
  if ((m = bahis.match(AU))) return ft((h, a) => au(h + a, sayi(m[1]), secim));
  if (bahis === 'Karşılıklı Gol') return ft((h, a) => (h > 0 && a > 0) === (secim === 'Var'));
  if (bahis === 'Tek / Çift') return ft((h, a) => ((h + a) % 2 === 1) === (secim === 'Tek'));
  if (bahis === 'Toplam Gol') {
    return ft((h, a) => { const t = h + a; return secim === (t <= 1 ? '0-1 gol' : t <= 3 ? '2-3 gol' : t <= 5 ? '4-5 gol' : '6+ gol'); });
  }
  if ((m = bahis.match(/^Ev Sahibi (?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/))) return ft((h) => au(h, sayi(m[1]), secim));
  if ((m = bahis.match(/^Deplasman (?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/))) return ft((h, a) => au(a, sayi(m[1]), secim));
  if ((m = bahis.match(/^Handikaplı Maç Sonucu (-?\d+)$/))) { const n = Number(m[1]); return ft((h, a) => ms(h + n, a) === secim); }
  if (bahis === 'Maç Sonucu ve Karşılıklı Gol') {
    const [s1, s2] = secim.split(' ve ');
    return ft((h, a) => ms(h, a) === s1 && (h > 0 && a > 0) === (s2 === 'Var'));
  }
  if ((m = bahis.match(/^Maç Sonucu ve (?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/))) {
    const [s1, s2] = secim.split(' ve ');
    return ft((h, a) => ms(h, a) === s1 && au(h + a, sayi(m[1]), s2));
  }
  if ((m = bahis.match(/^(?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5) ve Karşılıklı Gol$/))) {
    const [s1, s2] = secim.split(' ve ');
    return ft((h, a) => au(h + a, sayi(m[1]), s1) && (h > 0 && a > 0) === (s2 === 'Var'));
  }

  // 1. yarı
  if (bahis === '1. Yarı Sonucu') return ht((h, a) => ms(h, a) === secim);
  if (bahis === '1. Yarı Çifte Şans') return ht((h, a) => secim.split(' ve ').includes(ms(h, a)));
  if (bahis === '1. Yarı Karşılıklı Gol') return ht((h, a) => (h > 0 && a > 0) === (secim === 'Var'));
  if ((m = bahis.match(/^1\. Yarı (?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/))) return ht((h, a) => au(h + a, sayi(m[1]), secim));
  if ((m = bahis.match(/^Ev Sahibi 1\. Yarı (?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/))) return ht((h) => au(h, sayi(m[1]), secim));
  if ((m = bahis.match(/^Deplasman 1\. Yarı (?:Alt\/Üst|Altı\/Üstü) (\d+[.,]5)$/))) return ht((h, a) => au(a, sayi(m[1]), secim));
  if (bahis === '1. Yarı Sonucu ve İlk Yarı Karşılıklı Gol') {
    const [s1, s2] = secim.split(' ve ');
    return ht((h, a) => ms(h, a) === s1 && (h > 0 && a > 0) === (s2 === 'Var'));
  }

  // İki yarıya bağlı (yarılar arası bağımsızlık varsayımına duyarlı → "yaklaşık")
  const iki = (f) => ({ f, ftOnly: false, tur: 'iki' });
  if (bahis === '2. Yarı Sonucu') return iki((h1, a1, h2, a2) => ms(h2, a2) === secim);
  if (bahis === '1. Yarı / Maç Sonucu') {
    const [s1, s2] = secim.split('/');
    return iki((h1, a1, h2, a2) => ms(h1, a1) === s1 && ms(h1 + h2, a1 + a2) === s2);
  }
  if (bahis === 'Hangi Yarıda Daha Fazla Gol Olur') {
    return iki((h1, a1, h2, a2) => { const x = h1 + a1, y = h2 + a2; return secim === (x > y ? '1.' : x < y ? '2.' : 'Eşit'); });
  }
  if (bahis === 'Ev Sahibi Her İki Yarıyı Kazanır') return iki((h1, a1, h2, a2) => (h1 > a1 && h2 > a2) === (secim === 'Evet'));
  if (bahis === 'Deplasman Her İki Yarıyı Kazanır') return iki((h1, a1, h2, a2) => (a1 > h1 && a2 > h2) === (secim === 'Evet'));

  return null;   // korner, kart vb. – modellenmez
}

/**
 * Bir pazarın oranlarından marjı orantılı olarak çıkarır → { secim: olasılık }, marj.
 * toplam: seçim olasılıklarının gerçek toplamı (Çifte Şans gibi çakışan pazarlarda 2).
 */
export function piyasaOlasiliklari(oranlar, toplam = 1) {
  const ters = oranlar.map(o => 1 / o.oran);
  const top = ters.reduce((x, y) => x + y, 0);
  return { olasilik: Object.fromEntries(oranlar.map((o, i) => [o.secim, ters[i] / top * toplam])), marj: top / toplam - 1 };
}
const pazarToplami = (bahis, n) => (/Çifte Şans$/.test(bahis) && n === 3 ? 2 : 1);

/** Pazarı tamam mı? (MS 3 seçim, diğerleri en az 2) */
const pazarTam = (bahis, ss) => (bahis === 'Maç Sonucu' ? ss.length === 3 : ss.length >= 2);

// Uydurmada kullanılan tam maç pazarları ve ağırlıkları
const UYDURMA = [
  [/^Maç Sonucu$/, 3],
  [/^(?:Alt\/Üst|Altı\/Üstü) 2[.,]5$/, 2],
  [/^Karşılıklı Gol$/, 1],
  [/^(?:Alt\/Üst|Altı\/Üstü) [13][.,]5$/, 1],
  [/^(?:Ev Sahibi|Deplasman) (?:Alt\/Üst|Altı\/Üstü) [012][.,]5$/, 1],
];

const N = MAX_GOL + 1;
/** Tam maç skor matrisi (düz dizi, h*N+a). Beraberlik skorları (1+δ) ile ağırlıklanır (Poisson beraberliği az tahmin eder). */
function ftIzgara(lh, la, delta = 0) {
  const ph = poisDizi(lh, MAX_GOL), pa = poisDizi(la, MAX_GOL);
  const g = new Float64Array(N * N);
  let z = 0;
  for (let h = 0; h < N; h++) for (let a = 0; a < N; a++) { const p = ph[h] * pa[a] * (h === a ? 1 + delta : 1); g[h * N + a] = p; z += p; }
  for (let i = 0; i < g.length; i++) g[i] /= z;
  return g;
}
function maske(f) {
  const m = new Uint8Array(N * N);
  for (let h = 0; h < N; h++) for (let a = 0; a < N; a++) m[h * N + a] = f(h, a, 0, 0) ? 1 : 0;
  return m;
}

/**
 * Maçın tüm oranlarından λev / λdep ve beraberlik düzeltmesi δ uydurur.
 * @param {{bahis:string, secim:string, oran:number}[]} oranlar
 * @returns {null | { lh:number, la:number, delta:number, hata:number, pazarlar:string[] }}
 */
export function uydur(oranlar) {
  const gruplar = {};
  for (const o of oranlar) if (o.oran > 1) (gruplar[o.bahis] ??= []).push(o);
  const msSay = gruplar['Maç Sonucu']?.length ?? 0;
  if (msSay < 2) return null;

  const hedefler = [];   // { m, p, w }
  const pazarlar = [];
  const marjlar = [];
  for (const [bahis, ss] of Object.entries(gruplar)) {
    const w = UYDURMA.find(([re]) => re.test(bahis))?.[1];
    if (!w || !pazarTam(bahis, ss)) continue;
    if (bahis !== 'Maç Sonucu') marjlar.push(piyasaOlasiliklari(ss).marj);
    const { olasilik } = piyasaOlasiliklari(ss);
    let eklendi = false;
    for (const o of ss) {
      const y = yuklem(bahis, o.secim);
      if (!y?.ftOnly) continue;
      hedefler.push({ m: maske(y.f), p: olasilik[o.secim], w });
      eklendi = true;
    }
    if (eklendi) pazarlar.push(bahis);
  }
  // MS'de bir seçim kapalıysa (ör. çok net favoride "1" bültende yok): kalan seçimlerin marjı,
  // diğer pazarların ortalama marjı kadar varsayılarak çıkarılır.
  if (msSay < 3) {
    if (!marjlar.length) return null;
    const marj = marjlar.reduce((x, y) => x + y, 0) / marjlar.length;
    for (const o of gruplar['Maç Sonucu']) hedefler.push({ m: maske(yuklem('Maç Sonucu', o.secim).f), p: 1 / o.oran / (1 + marj), w: 3 });
    pazarlar.push('Maç Sonucu (eksik)');
  }

  const hata = (lh, la, delta) => {
    const g = ftIzgara(lh, la, delta);
    let e = 0;
    for (const t of hedefler) {
      let p = 0; const m = t.m;
      for (let i = 0; i < m.length; i++) if (m[i]) p += g[i];
      const d = p - t.p; e += t.w * d * d;
    }
    return e;
  };
  // 1) kaba λ ızgarası (δ=0) → 2) δ → 3) ince λ ızgarası (δ ile)
  let best = { lh: 1.3, la: 1.1, delta: 0, e: Infinity };
  for (let lh = 0.1; lh <= 4.01; lh += 0.1) for (let la = 0.1; la <= 4.01; la += 0.1) {
    const e = hata(lh, la, 0); if (e < best.e) best = { lh, la, delta: 0, e };
  }
  for (let delta = 0; delta <= 0.401; delta += 0.02) {
    const e = hata(best.lh, best.la, delta); if (e < best.e) best = { ...best, delta, e };
  }
  const { lh: lh0, la: la0, delta } = best;
  for (let lh = Math.max(0.05, lh0 - 0.15); lh <= lh0 + 0.15; lh += 0.01) for (let la = Math.max(0.05, la0 - 0.15); la <= la0 + 0.15; la += 0.01) {
    const e = hata(lh, la, delta); if (e < best.e) best = { lh, la, delta, e };
  }
  const r = (x) => Math.round(x * 100) / 100;
  const ilkYari = ilkYariPayiUydur(gruplar, best.lh, best.la);
  return { lh: r(best.lh), la: r(best.la), delta: r(best.delta), ilkYariPayi: ilkYari.pay, hata: best.e, pazarlar: [...pazarlar, ...ilkYari.pazarlar] };
}

/** İlk yarı pazarlarından (1. Yarı Sonucu / Alt-Üst / takım İY golleri) gollerin ilk yarıya düşen payını uydurur. */
function ilkYariPayiUydur(gruplar, lh, la) {
  const hedefler = [], pazarlar = [];
  for (const [bahis, ss] of Object.entries(gruplar)) {
    if (!/^(1\. Yarı Sonucu|1\. Yarı (?:Alt\/Üst|Altı\/Üstü) [01][.,]5|(?:Ev Sahibi|Deplasman) 1\. Yarı (?:Alt\/Üst|Altı\/Üstü) 0[.,]5)$/.test(bahis)) continue;
    if (!pazarTam(bahis, ss)) continue;
    const { olasilik } = piyasaOlasiliklari(ss);
    for (const o of ss) { const y = yuklem(bahis, o.secim); if (y?.tur === 'ht') hedefler.push({ f: y.f, p: olasilik[o.secim] }); }
    pazarlar.push(bahis);
  }
  if (!hedefler.length) return { pay: ILK_YARI_PAYI, pazarlar };
  let best = { pay: ILK_YARI_PAYI, e: Infinity };
  for (let pay = 0.36; pay <= 0.5001; pay += 0.01) {
    const ph = poisDizi(lh * pay, YARI_MAX), pa = poisDizi(la * pay, YARI_MAX);
    let e = 0;
    for (const t of hedefler) {
      let p = 0;
      for (let h = 0; h <= YARI_MAX; h++) for (let a = 0; a <= YARI_MAX; a++) if (t.f(h, a)) p += ph[h] * pa[a];
      e += (p - t.p) ** 2;
    }
    if (e < best.e) best = { pay, e };
  }
  return { pay: Math.round(best.pay * 100) / 100, pazarlar };
}

/** λ'lardan iki yarılı skor dağılımı: [[h1,a1,h2,a2,p], ...]. Tam maç beraberlikleri (1+δ) ile ağırlıklanır. */
export function dagilim(lh, la, delta = 0, pay = ILK_YARI_PAYI) {
  const h1 = poisDizi(lh * pay, YARI_MAX), a1 = poisDizi(la * pay, YARI_MAX);
  const h2 = poisDizi(lh * (1 - pay), YARI_MAX), a2 = poisDizi(la * (1 - pay), YARI_MAX);
  const out = [];
  let z = 0;
  for (let i = 0; i <= YARI_MAX; i++) for (let j = 0; j <= YARI_MAX; j++) {
    const p1 = h1[i] * a1[j]; if (p1 < 1e-9) continue;
    for (let k = 0; k <= YARI_MAX; k++) for (let l = 0; l <= YARI_MAX; l++) {
      let p = p1 * h2[k] * a2[l];
      if (p < 1e-10) continue;
      if (i + k === j + l) p *= 1 + delta;
      out.push([i, j, k, l, p]); z += p;
    }
  }
  for (const x of out) x[4] /= z;
  return out;
}

/** Maç modeli: { lh, la, pazarlar, olasilik(bahis, secim) } ya da null */
export function macModeli(oranlar) {
  const u = uydur(oranlar);
  if (!u) return null;
  let d = null;
  const cache = new Map();
  return {
    ...u,
    olasilik(bahis, secim) {
      const key = bahis + '|' + secim;
      if (cache.has(key)) return cache.get(key);
      const y = yuklem(bahis, secim);
      let p = null;
      if (y) {
        d ??= dagilim(u.lh, u.la, u.delta, u.ilkYariPayi);
        p = 0;
        for (const [a, b, c, e, q] of d) if (y.f(a, b, c, e)) p += q;
        p = Math.min(1, Math.max(0, p));
      }
      cache.set(key, p);
      return p;
    },
  };
}

/**
 * Bir seçimin model değerlendirmesi.
 * @returns {{ model:number|null, piyasa:number|null, deger:number|null }}
 */
export function secimDegeri(oranlar, model, bahis, secim, oran) {
  const pazar = oranlar.filter(o => o.bahis === bahis && o.oran > 1);
  // Çifte Şans gibi çakışan pazarlar eksik gelirse (3 seçimden az) piyasa olasılığı hesaplanmaz
  const cakisan = /Çifte Şans$/.test(bahis);
  const piyasa = pazar.length >= 2 && (!cakisan || pazar.length === 3)
    ? piyasaOlasiliklari(pazar, pazarToplami(bahis, pazar.length)).olasilik[secim] ?? null : null;
  const p = model?.olasilik(bahis, secim) ?? null;
  const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);
  // yaklasik: iki yarıya bağlı bileşik bahis (yarılar arası bağımsızlık varsayımına duyarlı)
  return { model: r4(p), piyasa: r4(piyasa), deger: p == null ? null : r4(p * oran - 1), yaklasik: yuklem(bahis, secim)?.tur === 'iki' };
}

export const yuzde = (p, basamak = 0) => (p == null ? '–' : `%${(p * 100).toFixed(basamak)}`);
export const degerYazi = (d) => (d == null ? '–' : `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(0)}%`);
