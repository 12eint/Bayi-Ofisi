// İzometrik pixel art: mahalle kıraathanesi + bayi. Harici görsel yok, her şey kodla piksel piksel çizilir.
// Düşük çözünürlükte (320x240) çizilip büyütülür; isim etiketleri ve konuşma balonları HTML katmanında.

const W = 320, H = 240, TW = 16, TH = 8;
const OX = 144, OY = 84;
const P = (x, y, z = 0) => [OX + (x - y) * TW, OY + (x + y) * TH - z];

const PAL = {
  karo1: '#c4ae86', karo2: '#d6c6a2', karoDerz: '#ab9370',
  duvarÜstSol: '#b7a77a', duvarÜstSag: '#c8b88a', lambriSol: '#5a3a22', lambriSag: '#6b4529', lambriÇizgi: '#432a18', süpürgelik: '#2a1a0e',
  masaÜst: '#9a6a3a', masaKenar: '#6e4826', masaKoyu: '#4f321a', ayak: '#3a2414', çuha: '#2f7a46', çuhaKoyu: '#215a33',
  sandalye: '#7a4a24', sandalyeKoyu: '#55321a',
  tvÇerçeve: '#141414', tvEkran: '#06142b', tvYazı: '#ffd84d', tvBaşlık: '#7ee0ff',
  tezgâhÜst: '#3a3a44', tezgâhSol: '#9b1c1c', tezgâhSag: '#7a1414', şerit: '#ffcc00',
  yazıcı: '#e8e4da', yazıcıKoyu: '#b9b3a6', kâğıt: '#fbfaf5',
  ten: '#f1c27d', tenGölge: '#d9a066', göz: '#221a14', ağız: '#a0523d',
  çay: '#a2401c', çayAçık: '#d9773f', tabak: '#f4f1ea', çaydanlık: '#c9cdd2', çaydanlıkKoyu: '#8d9399',
  neon: '#ffcc00', neonKoyu: '#7a6200', cam: '#1d3557', camParıltı: '#3e6a9e',
  saksı: '#9c5a2e', yaprak: '#3f8f3a', yaprakAçık: '#5fb34f',
};

const FONT = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], '.': ['000', '000', '000', '000', '010'], ':': ['000', '010', '000', '010', '000'],
  '-': ['000', '000', '111', '000', '000'], ' ': ['000', '000', '000', '000', '000'], '/': ['001', '001', '010', '100', '100'],
  '₺': ['011', '110', '011', '110', '010'],
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  Ç: ['011', '100', '100', '011', '010'], D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'], G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], İ: ['010', '000', '111', '010', '111'], K: ['101', '110', '100', '110', '101'],
  L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], Ş: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], Ü: ['101', '000', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
};

// ---- Yerleşim (tile koordinatı) ----
// Ajanlar kupon masalarında oturur; Genel Müdür kasanın (tezgâh) başında ayakta durur.
const MASA = 1.4, MASA_H = 11;
// Düzen: arka sıra Öz23 · Hızlı Genç · 07 Mal Ahmet | orta sıra Box23 · Dorasal · Hakan Revio | ön sıra Spor Totocu (ortada)
const KADRO = {
  'genel-mudur':      { yer: [9.45, 4.2], ayakta: true, renk: '#1f1f24', renkKoyu: '#111114', kol: '#2a2a30' },
  'yasli-dayi':       { masa: [1.2, 1.8], renk: '#4a6a45', renkKoyu: '#36502f', kol: '#587a52' },
  'hizli-genc':       { masa: [3.7, 1.8], renk: '#b84a3e', renkKoyu: '#8f382f', kol: '#c45a4d' },
  'beyaz-hayalci':    { masa: [6.2, 1.8], renk: '#8fa8cf', renkKoyu: '#6e88b0', kol: '#a2b8da' },
  'inatci-eniste':    { masa: [1.2, 4.2], renk: '#7a5a8e', renkKoyu: '#5d4470', kol: '#8a6a9e' },
  'alt-ustcu':        { masa: [3.7, 4.2], renk: '#4f7f5a', renkKoyu: '#3c6346', kol: '#5e8f69' },
  'cok-bilen-kardes': { masa: [6.2, 4.2], renk: '#7a5a34', renkKoyu: '#5c4326', kol: '#8a6a42' },
  'spor-totocu':      { masa: [3.7, 6.3], renk: '#3f7590', renkKoyu: '#2f5a6f', kol: '#4d86a2' },
};
const yerOf = (k) => { const d = KADRO[k]; return d.ayakta ? d.yer : [d.masa[0] + 0.75, d.masa[1] - 0.15]; };
const KASA = { x: 8.2, y: 3.1, w: 1.0, d: 2.6 };
// Çaycının yolu: masaların arasındaki düz koridorlar (çay ocağından başlar)
const ÇAYCI_YOL = [[0.6, 1.2], [5.65, 1.2], [5.65, 3.5], [7.9, 3.5], [7.9, 5.75], [3.15, 5.75], [3.15, 3.5], [0.6, 3.5]];
const DURAK = new Set([1, 3, 5]);   // bu noktalarda çay bırakmak için durur
// Gizmo: koridor merkezinden (HUB) her kişiye gider; son nokta duruş yeri, "bak" konuştuğu kişi
// Gizmo şimdilik yedekte: geri getirmek için true yap (ofis3d.js'te de aynı anahtar var)
const GIZMO_AKTIF = false;
const GIZMO_HUB = [7.9, 3.5];
const GIZMO_DURAKLAR = [
  { kime: 'genel-mudur',      yol: [[7.9, 4.3]],                                bak: [9.45, 4.2] },
  { kime: 'cok-bilen-kardes', yol: [[7.9, 3.95]],                               bak: [6.95, 4.05] },
  { kime: 'beyaz-hayalci',    yol: [[7.9, 1.9]],                                bak: [6.95, 1.65] },
  { kime: 'hizli-genc',       yol: [[5.65, 3.5], [5.65, 1.8]],                  bak: [4.45, 1.65] },
  { kime: 'yasli-dayi',       yol: [[5.65, 3.5], [3.15, 3.5], [3.15, 1.8]],     bak: [1.95, 1.65] },
  { kime: 'inatci-eniste',    yol: [[5.65, 3.5], [3.15, 3.5], [3.15, 4.1]],     bak: [1.95, 4.05] },
  { kime: 'alt-ustcu',        yol: [[5.65, 3.5], [5.65, 4.1]],                  bak: [4.45, 4.05] },
  { kime: 'spor-totocu',      yol: [[7.9, 5.75], [5.65, 5.75], [5.65, 6.2]],    bak: [4.45, 6.15] },
];
// Risk Kurulu: sağ arka köşedeki denetim masası. Kupon kaydedilmeden önceki kod denetiminin sahnedeki yüzü.
const RISK_MASA = [8.3, 0.7];
const RISK_YER = [RISK_MASA[0] + 0.75, RISK_MASA[1] - 0.15];
const RISK_RENK = { ret: '#c62828', uyari: '#e08a00', onay: '#1f9d55' };
const GIZMO_LAFLAR =['Bonjour!', 'Tutarsa küsüratı benim!', 'Başar hocam!', 'Bu 50 lirayı kaç para yapabiliriz?', 'Bugün tıraş yine yok.'];

export function createIsoOffice(root) {
  root.innerHTML = '<canvas width="320" height="240" aria-label="İzometrik pixel kıraathane ve bayi"></canvas><div class="iso-katman"></div>';
  const cv = root.querySelector('canvas');
  const katman = root.querySelector('.iso-katman');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const durum = {}; const etiketler = {}; const balonlar = {};
  let maclar = []; let tvSayfa = 0;
  let baski = null; let fisYigini = 0;
  let olcek = 2; let kare = 0; let son = 0; let calisiyorMu = true;
  const çaycı = { i: 0, p: 0, bekle: 0, x: ÇAYCI_YOL[0][0], y: ÇAYCI_YOL[0][1], yön: 1 };
  const ilkDurak = GIZMO_DURAKLAR[0].yol.at(-1);
  const gizmo = { durak: 0, yol: [], x: ilkDurak[0], y: ilkDurak[1], bekle: 0, laf: 0, konuşuyor: false };
  let riskDamga = null;      // { t0, durum } – damga vurma ve masadaki mürekkep izi
  const uçanKâğıtlar = [];   // { from:[sx,sy], to:[sx,sy], t0, renk }
  let kadroAdlari = {};

  // ---------- çizim yardımcıları ----------
  function fillPoly(pts, color) {
    ctx.fillStyle = color;
    const ys = pts.map(p => p[1]);
    const minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y < maxY; y++) {
      const yc = y + 0.5; const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + (yc - y1) * (x2 - x1) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.round(xs[k]), b = Math.round(xs[k + 1]);
        if (b > a) ctx.fillRect(a, y, b - a, 1);
      }
    }
  }
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  function kutu(x, y, z, w, d, h, renk) {
    fillPoly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], renk.sol);
    fillPoly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], renk.sag);
    fillPoly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], renk.üst);
  }
  function yazı(str, x0, y0, color, eğim = 0) {
    let cx = 0;
    for (const ch of str.toLocaleUpperCase('tr-TR')) {
      const g = FONT[ch] ?? FONT[' '];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (g[r][c] === '1') { const xx = cx + c; px(x0 + xx, y0 + r + Math.floor(xx * eğim), 1, 1, color); }
      }
      cx += 4;
    }
    return cx;
  }
  function bardak(x, y, z, t, buhar = true) {      // ince belli çay bardağı + tabak
    const [sx, sy] = P(x, y, z);
    px(sx - 2, sy - 1, 5, 1, PAL.tabak);
    px(sx - 1, sy - 4, 3, 3, PAL.çay); px(sx, sy - 3, 1, 1, '#7a2c10');
    px(sx - 1, sy - 5, 3, 1, PAL.çayAçık);
    if (buhar) { const f = Math.floor(t / 300) % 3; px(sx + (f === 1 ? 1 : 0), sy - 7 - f, 1, 1, 'rgba(255,255,255,.55)'); }
  }

  // ---------- oda ----------
  function zemin() {
    for (let x = 0; x < 10; x++) for (let y = 0; y < 8; y++) {
      fillPoly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], PAL.karoDerz);
      for (const [dx, dy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
        const c = ((x * 2 + dx * 2) + (y * 2 + dy * 2)) % 2 ? PAL.karo1 : PAL.karo2;
        fillPoly([P(x + dx + 0.03, y + dy + 0.03), P(x + dx + 0.5, y + dy + 0.03), P(x + dx + 0.5, y + dy + 0.5), P(x + dx + 0.03, y + dy + 0.5)], c);
      }
    }
  }

  function duvarlar(t) {
    const h = 74, l = 26;
    fillPoly([P(0, 0, 0), P(0, 8, 0), P(0, 8, h), P(0, 0, h)], PAL.duvarÜstSol);
    fillPoly([P(0, 0, 0), P(10, 0, 0), P(10, 0, h), P(0, 0, h)], PAL.duvarÜstSag);
    fillPoly([P(0, 0, 0), P(0, 8, 0), P(0, 8, l), P(0, 0, l)], PAL.lambriSol);
    fillPoly([P(0, 0, 0), P(10, 0, 0), P(10, 0, l), P(0, 0, l)], PAL.lambriSag);
    for (let i = 0.5; i < 10; i += 0.5) fillPoly([P(i, 0, 3), P(i + 0.03, 0, 3), P(i + 0.03, 0, l), P(i, 0, l)], PAL.lambriÇizgi);
    for (let i = 0.5; i < 8; i += 0.5) fillPoly([P(0, i, 3), P(0, i + 0.03, 3), P(0, i + 0.03, l), P(0, i, l)], PAL.lambriÇizgi);
    fillPoly([P(0, 0, l), P(10, 0, l), P(10, 0, l + 2), P(0, 0, l + 2)], PAL.lambriÇizgi);
    fillPoly([P(0, 0, l), P(0, 8, l), P(0, 8, l + 2), P(0, 0, l + 2)], PAL.lambriÇizgi);
    fillPoly([P(0, 0, 0), P(10, 0, 0), P(10, 0, 3), P(0, 0, 3)], PAL.süpürgelik);
    fillPoly([P(0, 0, 0), P(0, 8, 0), P(0, 8, 3), P(0, 0, 3)], PAL.süpürgelik);
    // flamalar (sağ duvar boyunca kırmızı-beyaz üçgenler)
    for (let i = 0; i < 19; i++) {
      const x0 = 0.3 + i * 0.5; const [a, b] = [P(x0, 0, 72), P(x0 + 0.4, 0, 72)]; const [m] = [P(x0 + 0.2, 0, 66)];
      fillPoly([a, b, m], i % 2 ? '#e8e2d0' : '#c62828');
    }
    // duvar saati
    const [cx, cy] = P(9.4, 0, 52);
    px(cx - 4, cy - 4, 9, 9, '#2a1a0e'); px(cx - 3, cy - 3, 7, 7, '#f4efe0');
    const d = new Date(); const ang = ((d.getHours() % 12) / 12 + d.getMinutes() / 720) * Math.PI * 2; const ma = d.getMinutes() / 60 * Math.PI * 2;
    for (let r = 1; r <= 2; r++) px(cx + Math.round(Math.sin(ang) * r), cy - Math.round(Math.cos(ang) * r), 1, 1, '#111');
    for (let r = 1; r <= 3; r++) px(cx + Math.round(Math.sin(ma) * r), cy - Math.round(Math.cos(ma) * r), 1, 1, '#c62828');
    px(cx, cy, 1, 1, '#111');
  }

  function pencereVeTabela(t) {
    fillPoly([P(0, 3.4, 30), P(0, 6.8, 30), P(0, 6.8, 60), P(0, 3.4, 60)], '#3b2c20');
    fillPoly([P(0, 3.55, 32), P(0, 6.65, 32), P(0, 6.65, 58), P(0, 3.55, 58)], PAL.cam);
    fillPoly([P(0, 3.8, 34), P(0, 4.1, 34), P(0, 5.2, 56), P(0, 4.9, 56)], PAL.camParıltı);
    // pencere pervazında uyuyan kedi
    const [kx, ky] = P(0.15, 5.8, 31);
    px(kx - 4, ky - 3, 8, 3, '#d9822b'); px(kx - 5, ky - 4, 3, 3, '#d9822b'); px(kx - 5, ky - 5, 1, 1, '#d9822b'); px(kx - 3, ky - 5, 1, 1, '#d9822b');
    px(kx - 2, ky - 3, 1, 3, '#a85f18'); px(kx + 1, ky - 3, 1, 3, '#a85f18');
    px(kx + 4, ky - 2 - (Math.floor(t / 1200) % 2), 2, 1, '#d9822b');
    // tabela zeminleri (yazılar okunaklı olsun diye HTML katmanında, duvar açısıyla eğik çizilir)
    fillPoly([P(0, 1.0, 34), P(0, 2.5, 34), P(0, 2.5, 52), P(0, 1.0, 52)], '#1c1c1c');
    fillPoly([P(0, 1.05, 34.6), P(0, 2.45, 34.6), P(0, 2.45, 35.2), P(0, 1.05, 35.2)], '#6b4529');
  }

  const TV_YER = [[2.9, 5.2], [5.9, 8.2]];
  function tvler(t) {
    TV_YER.forEach(([x0, x1]) => {
      fillPoly([P(x0, 0, 34), P(x1, 0, 34), P(x1, 0, 60), P(x0, 0, 60)], PAL.tvÇerçeve);
      fillPoly([P(x0 + 0.1, 0, 36), P(x1 - 0.1, 0, 36), P(x1 - 0.1, 0, 58), P(x0 + 0.1, 0, 58)], PAL.tvEkran);
      // ekran parıltısı (yazılar HTML katmanında)
      if (Math.floor(t / 4000) % 2) fillPoly([P(x0 + 0.1, 0, 56), P(x1 - 0.1, 0, 56), P(x1 - 0.1, 0, 58), P(x0 + 0.1, 0, 58)], '#0d2347');
    });
  }
  function tvMetni(i) {
    if (!maclar.length) return '<b>BÜLTEN</b><span>yükleniyor…</span>';
    const secim = i === 0 ? '1' : '2';
    const satirlar = [0, 1, 2].map(r => {
      const m = maclar[(tvSayfa * 3 + r + i * 3) % maclar.length];
      const o = m.oranlar.find(o => o.bahis === 'Maç Sonucu' && o.secim === secim);
      return `<span><i>${esc(String(m.mac_kodu))}</i><em>${o ? o.oran.toFixed(2) : '–'}</em></span>`;
    });
    return `<b>KOD · MS${secim}</b>${satirlar.join('')}`;
  }

  function çayOcağı(t) {
    // arka köşede çay ocağı tezgâhı, üstünde çift demlik ve bardak tepsisi
    kutu(0.15, 0.15, 0, 2.2, 0.8, 15, { üst: '#8a8f96', sol: '#6b4529', sag: '#55361f' });
    fillPoly([P(0.15, 0.95, 11), P(2.35, 0.95, 11), P(2.35, 0.95, 12), P(0.15, 0.95, 12)], '#c9a24a');
    // ocak + çaydanlık
    kutu(0.5, 0.3, 15, 0.5, 0.5, 2, { üst: '#222', sol: '#333', sag: '#2a2a2a' });
    kutu(0.55, 0.35, 17, 0.4, 0.4, 7, { üst: PAL.çaydanlıkKoyu, sol: PAL.çaydanlık, sag: PAL.çaydanlıkKoyu });
    kutu(0.62, 0.42, 24, 0.26, 0.26, 4, { üst: PAL.çaydanlıkKoyu, sol: PAL.çaydanlık, sag: PAL.çaydanlıkKoyu });
    const [bx, by] = P(0.75, 0.55, 29);
    for (let i = 0; i < 3; i++) { const f = (Math.floor(t / 250) + i) % 4; px(bx + (i - 1) + (f % 2), by - 2 - f * 2 - i, 1, 1, 'rgba(255,255,255,.6)'); }
    // bardak tepsisi
    kutu(1.25, 0.3, 15, 0.9, 0.55, 1, { üst: '#c0c4c9', sol: '#9aa0a6', sag: '#8a9096' });
    for (const [dx, dy] of [[1.4, 0.45], [1.65, 0.45], [1.9, 0.45], [1.5, 0.7], [1.78, 0.7]]) bardak(dx, dy, 16, t, false);
  }

  function bitki(x, y) {
    kutu(x, y, 0, 0.45, 0.45, 8, { üst: '#6e3d1f', sol: PAL.saksı, sag: '#7d4523' });
    const [sx, sy] = P(x + 0.22, y + 0.22, 8);
    [[0, -14, 3, 14], [-5, -10, 4, 8], [4, -11, 4, 9], [-3, -18, 3, 7], [2, -17, 3, 6]]
      .forEach(([dx, dy, w, h], i) => px(sx + dx - 1, sy + dy, w, h, i % 2 ? PAL.yaprakAçık : PAL.yaprak));
  }

  // ---------- mobilya ----------
  function masa(x, y, t, { çuha = false, eşya = null } = {}) {
    for (const [dx, dy] of [[0.08, 0.08], [MASA - 0.16, 0.08], [0.08, MASA - 0.16], [MASA - 0.16, MASA - 0.16]]) {
      kutu(x + dx, y + dy, 0, 0.08, 0.08, MASA_H - 2, { üst: PAL.ayak, sol: PAL.ayak, sag: PAL.ayak });
    }
    kutu(x, y, MASA_H - 2, MASA, MASA, 2, { üst: çuha ? PAL.çuha : PAL.masaÜst, sol: PAL.masaKenar, sag: PAL.masaKoyu });
    if (eşya) eşya(t);
  }
  function sandalye(x, y, önde = false) {   // önde: izleyiciye yakın taraf (sırtı bize dönük kişi için)
    kutu(x, y, 0, 0.45, 0.45, 7, { üst: PAL.sandalye, sol: PAL.sandalyeKoyu, sag: PAL.sandalyeKoyu });
    if (önde) kutu(x, y + 0.4, 7, 0.45, 0.06, 10, { üst: PAL.sandalye, sol: PAL.sandalye, sag: PAL.sandalyeKoyu });
  }

  function kuponMasası(k, t) {
    const [x, y] = KADRO[k].masa; const ç = durum[k]?.calisiyor;
    masa(x, y, t, {
      eşya: () => {
        // kupon kâğıtları + kalem + çay
        kutu(x + 0.35, y + 0.35, MASA_H, 0.45, 0.35, 0.5, { üst: '#fffbe9', sol: '#e6dfc6', sag: '#d9d1b6' });
        if (ç) { const [sx, sy] = P(x + 0.5, y + 0.5, MASA_H + 1); px(sx - 2 + (Math.floor(t / 140) % 4), sy - 1, 2, 1, '#2a2a2a'); }
        kutu(x + 0.85, y + 0.75, MASA_H, 0.35, 0.3, 0.5, { üst: '#efe6c8', sol: '#d6cba8', sag: '#c8bc97' });   // bülten gazetesi
        bardak(x + 1.1, y + 0.4, MASA_H, t);
        if (k === 'cok-bilen-kardes') bardak(x + 0.3, y + 1.05, MASA_H, t, false);
      },
    });
  }

  // ---------- insan ----------
  // o: { renk, renkKoyu, kol, tip, ayakta, arka, ç (çalışıyor), eleştiri, tepsi }
  function insan(ax, ay, o, t) {
    const nefes = !o.ç && !o.yürü && Math.floor(t / 900 + (o.faz ?? 0)) % 2 ? 1 : 0;
    const zıpla = o.ç && o.tip === 'hizli-genc' ? (Math.floor(t / 150) % 2) : 0;
    const by = (o.ayakta ? ay - 27 : ay - 30) + nefes - zıpla;
    const bx = ax - 5;
    if (!o.ayakta && !o.arka) px(bx - 1, by + 4, 12, 12, PAL.sandalyeKoyu);    // sandalye sırtı
    if (o.ayakta) {                                                         // bacaklar
      const a = o.yürü ? (Math.floor(t / 160) % 2) : 0;
      px(bx + 1, by + 17, 3, 10 - a, o.pantolon ?? '#2a2a30'); px(bx + 6, by + 17, 3, 9 + a, o.pantolon ?? '#2a2a30');
      const ayk = o.ayakkabı ?? '#111';
      px(bx + 1, by + 26 - a, 3, 1, ayk); px(bx + 6, by + 26 + a - 1, 3, 1, ayk);
      if (o.ayakkabı) { px(bx, by + 26 - a, 1, 1, ayk); px(bx + 9, by + 26 + a - 1, 1, 1, ayk); px(bx + 1, by + 25 - a, 3, 1, '#d9dde2'); px(bx + 6, by + 25 + a - 1, 3, 1, '#d9dde2'); }
      if (o.kot) { px(bx + 4, by + 17, 2, 2, o.pantolon); px(bx + 3, by + 18, 1, 6 - a, o.kot); px(bx + 6, by + 18, 1, 5 + a, o.kot); }
    }
    px(bx, by + 6, 10, 11, o.renk); px(bx + 7, by + 6, 3, 11, o.renkKoyu);
    if (o.yelek) { px(bx, by + 6, 3, 11, o.yelek); px(bx + 7, by + 6, 3, 11, o.yelek); }
    if (!o.arka) {
      if (o.tip === 'genel-mudur') { px(bx + 4, by + 6, 2, 1, '#f3e9d8'); px(bx + 4, by + 7, 2, 6, '#c62828'); }
      if (o.tip === 'cok-bilen-kardes') { px(bx + 4, by + 6, 2, 11, '#efe6d0'); px(bx + 3, by + 7, 1, 2, '#c62828'); }
      if (o.tip === 'beyaz-hayalci') px(bx + 3, by + 6, 4, 2, '#ffffff');
    }
    // kollar
    if (o.tepsi) {
      px(bx - 2, by + 8, 3, 6, o.kol); px(bx + 9, by + 8, 3, 6, o.kol);
      px(bx - 4, by + 13, 18, 1, '#c0c4c9'); px(bx - 3, by + 14, 16, 1, '#8a9096');
      [-2, 2, 6, 10].forEach(dx => { px(bx + dx, by + 10, 2, 3, PAL.çay); px(bx + dx, by + 9, 2, 1, PAL.çayAçık); });
    } else if (o.eleştiri) {
      px(bx - 1, by + 10, 12, 3, o.kol); px(bx - 1, by + 12, 12, 1, o.renkKoyu);
      if (Math.floor(t / 400) % 2) px(bx + 10, by + 8, 1, 4, '#c62828');
    } else if (o.ç) {                                 // kupon yazıyor: sağ el kalemle gidip geliyor
      const f = Math.floor(t / 140) % 4;
      px(bx - 2, by + 8, 3, 8, o.kol); px(bx - 2, by + 16, 3, 2, PAL.ten);
      px(bx + 7 - f, by + 12, 4, 3, o.kol); px(bx + 6 - f, by + 15, 3, 2, PAL.ten); px(bx + 5 - f, by + 14, 1, 2, '#ffcc00');
    } else if (o.damga != null) {                     // damga vuruyor: kol kalkar, iner (o.damga 0..1)
      const yukarı = o.damga < 0.45;
      px(bx - 2, by + 8, 3, 8, o.kol); px(bx - 2, by + 16, 3, 2, PAL.ten);
      if (yukarı) { px(bx + 9, by + 1, 3, 9, o.kol); px(bx + 9, by - 2, 3, 3, '#5a3a22'); px(bx + 8, by - 4, 5, 2, o.damgaRenk); }
      else { px(bx + 9, by + 8, 3, 7, o.kol); px(bx + 9, by + 15, 3, 2, '#5a3a22'); px(bx + 8, by + 17, 5, 1, o.damgaRenk); }
    } else if (o.para) {                              // elinde 50 lira sallıyor
      const f = Math.floor(t / 220) % 2;
      px(bx - 2, by + 8, 3, 8, o.kol); px(bx - 2, by + 16, 3, 2, PAL.ten);
      px(bx + 9, by + 3, 3, 7, o.kol); px(bx + 9, by + 1, 3, 2, PAL.ten);
      px(bx + 9 + f, by - 3, 7, 4, '#e3923a'); px(bx + 10 + f, by - 2, 2, 2, '#a85a14'); px(bx + 13 + f, by - 2, 2, 1, '#fff3d6');
    } else if (o.tavla) {
      const f = Math.floor(t / 700 + (o.faz ?? 0)) % 3 === 0 ? 1 : 0;
      px(bx - 2, by + 8, 3, 8, o.kol); px(bx + 9, by + 8 + f, 3, 8, o.kol); px(bx + 9, by + 16 + f, 3, 2, PAL.ten);
    } else {
      px(bx - 2, by + 8, 3, 8, o.kol); px(bx + 9, by + 8, 3, 8, o.kol);
    }
    if (o.kısaKol) { px(bx - 2, by + 7, 3, 3, o.renk); px(bx + 9, by + 7, 3, 3, o.renkKoyu); }   // tişört kolları
    // kafa
    const hx = bx + 1, hy = by - 3;
    px(hx, hy, 8, 9, PAL.ten); px(hx + 6, hy, 2, 9, PAL.tenGölge);
    if (o.arka) { px(hx, hy - 1, 8, 7, o.saç ?? '#2a1a10'); }
    else {
      const göz = Math.floor((t + (o.faz ?? 0) * 700) / 2600) % 6 === 0 && (t % 2600) < 160;
      if (!göz) { px(hx + 2, hy + 4, 1, 1, PAL.göz); px(hx + 5, hy + 4, 1, 1, PAL.göz); }
      else { px(hx + 1, hy + 4, 2, 1, PAL.göz); px(hx + 4, hy + 4, 2, 1, PAL.göz); }
      px(hx + 3, hy + 7, 2, 1, PAL.ağız);
    }
    aksesuar(o, hx, hy, t);
  }

  function aksesuar(o, hx, hy, t) {
    switch (o.tip) {
      case 'genel-mudur':   // bayi sahibi: kır saç, kalın bıyık, gözlük boynunda
        px(hx - 1, hy - 2, 10, 3, '#9a9a9a'); px(hx - 1, hy + 1, 1, 3, '#9a9a9a'); px(hx + 8, hy + 1, 1, 3, '#9a9a9a');
        px(hx + 1, hy + 6, 6, 1, '#3a2a1a'); break;
      case 'yasli-dayi':    // kasket, beyaz bıyık, kır favori, tespih
        px(hx - 1, hy - 2, 9, 3, '#6b5b4b'); px(hx + 5, hy - 1, 5, 2, '#5a4b3d');
        px(hx - 1, hy + 2, 1, 4, '#d8d8d8'); px(hx + 8, hy + 2, 1, 4, '#d8d8d8'); px(hx + 1, hy + 6, 6, 1, '#f2f2f2');
        if (!o.ç) { const f = Math.floor(t / 300) % 4; px(hx + 10, hy + 18 + f, 1, 1, '#7a1c1c'); px(hx + 10, hy + 22, 1, 3, '#7a1c1c'); }
        break;
      case 'hizli-genc':    // jöleli diken saç, kulaklık, eşofman şeridi
        for (let i = 0; i < 4; i++) px(hx + i * 2, hy - 3 + (i % 2), 2, 3, i % 2 ? '#2a1a10' : '#e0b030');
        px(hx - 1, hy + 2, 1, 4, '#222'); px(hx + 8, hy + 2, 1, 4, '#222'); px(hx - 1, hy - 1, 10, 1, '#222');
        if (o.ç && Math.floor(t / 200) % 2) { px(hx + 11, hy - 4, 1, 4, '#ffcc00'); px(hx + 11, hy + 1, 1, 1, '#ffcc00'); }
        break;
      case 'beyaz-hayalci': {   // dalgalı saç + hayal bulutu
        px(hx - 1, hy - 2, 10, 3, '#f0e2b6'); px(hx - 1, hy + 1, 1, 3, '#f0e2b6');
        const by2 = hy - 12 + Math.round(Math.sin(t / 500) * 1.5);
        px(hx - 2, by2 + 1, 12, 3, '#ffffff'); px(hx, by2, 4, 1, '#ffffff'); px(hx + 5, by2 - 1, 4, 2, '#ffffff'); px(hx - 2, by2 + 4, 12, 1, '#d9e4f5');
        if (Math.floor(t / 1500) % 2) { px(hx + 3, by2 + 1, 1, 2, '#2f8f3a'); px(hx + 4, by2 + 1, 1, 1, '#2f8f3a'); px(hx + 3, by2 + 2, 2, 1, '#2f8f3a'); }  // ₺ hayali
        if (o.ç) { const s = Math.floor(t / 250) % 3; px(hx + 12, by2 + s, 1, 1, '#ffe680'); px(hx - 4, by2 + 3 - s, 1, 1, '#ffe680'); }
        break;
      }
      case 'cok-bilen-kardes':  // yatık saç + gözlük
        px(hx - 1, hy - 2, 10, 3, '#2a1a10'); px(hx + 6, hy + 1, 3, 1, '#2a1a10');
        px(hx + 1, hy + 3, 3, 3, '#111'); px(hx + 4, hy + 3, 3, 3, '#111');
        px(hx + 2, hy + 4, 1, 1, '#bfe3ff'); px(hx + 5, hy + 4, 1, 1, '#bfe3ff');
        if (o.eleştiri) px(hx + 3, hy + 7, 3, 1, PAL.göz);
        break;
      case 'alt-ustcu':     // kısa kahverengi saç, sakal, kulağında kalem yok; boynunda düdük (eski antrenör)
        px(hx - 1, hy - 2, 10, 3, '#5a3a22'); if (!o.arka) { px(hx, hy + 5, 8, 3, '#5a3a22'); px(hx + 3, hy + 7, 2, 1, PAL.ağız); }
        px(hx + 3, hy + 10, 2, 3, '#c0c4c9'); px(hx + 2, hy + 13, 4, 1, '#8a9096');
        break;
      case 'spor-totocu':   // kır saç, ince çerçeveli gözlük, kulağında kalem, gri bıyık
        px(hx - 1, hy - 2, 10, 2, '#b9b9b9'); px(hx - 1, hy, 1, 3, '#b9b9b9'); px(hx + 8, hy, 1, 3, '#b9b9b9');
        if (!o.arka) { px(hx + 1, hy + 3, 3, 2, '#3a3a3a'); px(hx + 4, hy + 3, 3, 2, '#3a3a3a'); px(hx + 2, hy + 3, 1, 1, '#d9ecff'); px(hx + 5, hy + 3, 1, 1, '#d9ecff'); px(hx + 1, hy + 6, 6, 1, '#8a8a8a'); }
        px(hx + 8, hy - 1, 1, 4, '#ffcc00'); px(hx + 8, hy - 2, 1, 1, '#c62828');
        break;
      case 'amca1':   // kel, kır yan saç, kalın bıyık
        px(hx - 1, hy + 1, 1, 4, '#cfcfcf'); px(hx + 8, hy + 1, 1, 4, '#cfcfcf'); px(hx + 1, hy + 6, 6, 1, '#555'); break;
      case 'amca2':   // arkası dönük, kasketli
        px(hx - 1, hy - 2, 10, 3, '#3a3a3a'); break;
      case 'çaycı':   // siyah saç, bıyık
        px(hx - 1, hy - 2, 10, 3, '#1a1a1a'); if (!o.arka) px(hx + 2, hy + 6, 4, 1, '#1a1a1a'); break;
      case 'inatci-eniste':   // geriye taranmış koyu saç, kır şakaklar, kalın pala bıyık, boynunda şans atkısı
        px(hx - 1, hy - 2, 10, 3, '#3a2a1e'); px(hx - 1, hy + 1, 1, 3, '#9a9a9a'); px(hx + 8, hy + 1, 1, 3, '#9a9a9a');
        if (!o.arka) { px(hx, hy + 6, 8, 2, '#2a1a10'); px(hx - 1, hy + 7, 1, 1, '#2a1a10'); px(hx + 8, hy + 7, 1, 1, '#2a1a10'); }
        px(hx - 1, hy + 9, 10, 2, '#c62828'); px(hx + 1, hy + 9, 2, 2, '#f4f1ea'); px(hx + 5, hy + 9, 2, 2, '#f4f1ea');
        break;
      case 'risk-kurulu':   // denetçi: tepesi açık, kır yan saç, kalın siyah çerçeveli gözlük, papyon
        px(hx - 1, hy - 1, 1, 5, '#b9b9b9'); px(hx + 8, hy - 1, 1, 5, '#b9b9b9'); px(hx + 1, hy - 2, 6, 1, '#d9a066');
        px(hx, hy + 3, 4, 2, '#111'); px(hx + 4, hy + 3, 4, 2, '#111'); px(hx + 1, hy + 3, 2, 1, '#cfe6ff'); px(hx + 5, hy + 3, 2, 1, '#cfe6ff');
        if (!o.arka) { px(hx + 2, hy + 9, 4, 2, '#7a1414'); px(hx + 3, hy + 9, 2, 2, '#9b1c1c'); }
        break;
      case 'gizmo': { // uzun, dalgalı koyu kızıl saç, perçem
        const sal = o.yürü ? Math.floor(t / 160) % 2 : 0;
        px(hx - 1, hy - 3, 10, 4, '#7a1f0c'); px(hx + 1, hy - 3, 4, 1, '#a3341a'); px(hx, hy + 1, 3, 1, '#7a1f0c');
        px(hx - 2, hy - 1, 2, 12 + sal, '#7a1f0c'); px(hx + 8, hy - 1, 2, 12 - sal, '#5c1608');
        px(hx - 2, hy + 3, 1, 3, '#a3341a'); px(hx - 3, hy + 8, 1, 3, '#7a1f0c');
        break;
      }
    }
  }

  function ajan(k, t) {
    const d = KADRO[k]; const [cx, cy] = yerOf(k); const [ax, ay] = P(cx, cy, 0);
    const ç = !!durum[k]?.calisiyor;
    insan(ax, ay, { ...d, tip: k, ç: ç && k !== 'cok-bilen-kardes', eleştiri: ç && k === 'cok-bilen-kardes', faz: k.length }, t);
  }


  function çaycıYürü(dt) {
    if (çaycı.bekle > 0) { çaycı.bekle -= dt; return; }
    const [hx, hy] = ÇAYCI_YOL[(çaycı.i + 1) % ÇAYCI_YOL.length];
    const dx = hx - çaycı.x, dy = hy - çaycı.y; const dist = Math.hypot(dx, dy); const hız = 0.0011 * dt;
    if (dist <= hız) {
      çaycı.x = hx; çaycı.y = hy; çaycı.i = (çaycı.i + 1) % ÇAYCI_YOL.length;
      if (DURAK.has(çaycı.i)) çaycı.bekle = 1800;
    } else { çaycı.x += dx / dist * hız; çaycı.y += dy / dist * hız; }
  }

  // ---------- risk kurulu ----------
  function riskMasası(t) {
    const [x, y] = RISK_MASA;
    masa(x, y, t, {
      eşya: () => {
        kutu(x + 0.25, y + 0.3, MASA_H, 0.5, 0.4, 2, { üst: '#e9e4d6', sol: '#c9c2b0', sag: '#bab29e' });          // dosya yığını
        kutu(x + 0.3, y + 0.35, MASA_H + 2, 0.4, 0.3, 1, { üst: '#f5d76e', sol: '#c9a83a', sag: '#b39432' });      // sarı klasör
        kutu(x + 0.85, y + 0.75, MASA_H, 0.4, 0.35, 0.5, { üst: '#fffbe9', sol: '#e6dfc6', sag: '#d9d1b6' });     // incelenen kupon
        if (!riskDamga || t - riskDamga.t0 < 400) {                                                              // masada duran damga
          kutu(x + 1.05, y + 0.25, MASA_H, 0.18, 0.18, 2, { üst: '#3a2414', sol: '#2a1a0e', sag: '#1f130a' });
          kutu(x + 1.1, y + 0.3, MASA_H + 2, 0.08, 0.08, 3, { üst: '#5a3a22', sol: '#4a2e1a', sag: '#3a2414' });
        }
        if (riskDamga && t - riskDamga.t0 > 700 && t - riskDamga.t0 < 6000) {                                    // kupondaki mürekkep izi
          const [sx, sy] = P(x + 1.05, y + 0.92, MASA_H + 0.5);
          px(sx - 3, sy - 2, 7, 3, RISK_RENK[riskDamga.durum]); px(sx - 2, sy - 1, 5, 1, '#fffbe9');
        }
        bardak(x + 0.15, y + 1.1, MASA_H, t, false);
      },
    });
    // masanın önünde küçük levha
    fillPoly([P(x + 0.3, y + MASA, 4), P(x + 1.1, y + MASA, 4), P(x + 1.1, y + MASA, 8), P(x + 0.3, y + MASA, 8)], '#1c1c1c');
    const [lx, ly] = P(x + 0.38, y + MASA, 7.6);
    yazı('RİSK', lx, ly, '#ffcc00', 0.5);
  }
  function riskKişi(t) {
    const [ax, ay] = P(...RISK_YER);
    const d = riskDamga ? (t - riskDamga.t0) / 900 : null;
    insan(ax, ay, { tip: 'risk-kurulu', renk: '#4a4f58', renkKoyu: '#353a42', kol: '#545a64', faz: 5,
      damga: d != null && d < 1 ? d : null, damgaRenk: riskDamga ? RISK_RENK[riskDamga.durum] : null }, t);
  }
  function kâğıtlarıÇiz(t) {
    for (let i = uçanKâğıtlar.length - 1; i >= 0; i--) {
      const k = uçanKâğıtlar[i]; const p = (t - k.t0) / 1500;
      if (p < 0) continue;
      if (p >= 1) { uçanKâğıtlar.splice(i, 1); continue; }
      const x = k.from[0] + (k.to[0] - k.from[0]) * p;
      const y = k.from[1] + (k.to[1] - k.from[1]) * p - Math.sin(Math.PI * p) * 28;
      const salın = Math.floor(t / 120) % 2;
      px(x - 3, y - 2 + salın, 7, 5, '#fffbe9'); px(x - 3, y - 2 + salın, 7, 1, k.renk); px(x - 2, y + salın, 5, 1, '#b9b3a6');
    }
  }
  function masaNoktası(ajan) {
    if (KADRO[ajan]?.masa) { const [x, y] = KADRO[ajan].masa; return P(x + MASA / 2, y + MASA / 2, MASA_H + 2); }
    return P(KASA.x + 0.5, KASA.y + 1.3, 18);
  }

  function gizmoYürü(dt) {
    if (gizmo.bekle > 0) {
      gizmo.bekle -= dt;
      if (gizmo.bekle <= 0) {
        gizmo.konuşuyor = false;
        const şimdiki = GIZMO_DURAKLAR[gizmo.durak];
        gizmo.durak = (gizmo.durak + 1) % GIZMO_DURAKLAR.length;
        // geri dönüş: bulunduğu duraktan merkeze, oradan sıradaki kişiye
        gizmo.yol = [...şimdiki.yol.slice(0, -1).reverse(), GIZMO_HUB, ...GIZMO_DURAKLAR[gizmo.durak].yol];
        gizmoDurum('dolaşıyor');
      }
      return;
    }
    if (!gizmo.yol.length) {                     // vardı: laf at
      gizmo.konuşuyor = true; gizmo.bekle = 6000;
      gizmoDurum('laf atıyor');
      gizmoBalon(GIZMO_LAFLAR[gizmo.laf++ % GIZMO_LAFLAR.length]);
      return;
    }
    const [hx, hy] = gizmo.yol[0];
    const dx = hx - gizmo.x, dy = hy - gizmo.y; const dist = Math.hypot(dx, dy); const hız = 0.0012 * dt;
    if (dist <= hız) { gizmo.x = hx; gizmo.y = hy; gizmo.yol.shift(); }
    else { gizmo.x += dx / dist * hız; gizmo.y += dy / dist * hız; }
  }

  // ---------- tezgâh (kasa) ve yazıcı ----------
  function tezgâh(t) {
    const { x, y, w, d } = KASA;
    kutu(x, y, 0, w, d, 16, { üst: PAL.tezgâhÜst, sol: PAL.tezgâhSol, sag: PAL.tezgâhSag });
    fillPoly([P(x, y + d, 9), P(x + w, y + d, 9), P(x + w, y + d, 11), P(x, y + d, 11)], PAL.şerit);
    fillPoly([P(x + w, y, 9), P(x + w, y + d, 9), P(x + w, y + d, 11), P(x + w, y, 11)], PAL.şerit);
    // yazıcı
    kutu(x + 0.15, y + 0.9, 16, 0.7, 0.8, 6, { üst: PAL.yazıcı, sol: PAL.yazıcıKoyu, sag: '#a49d8f' });
    const yeşil = baski || (Math.floor(t / 1000) % 2);
    fillPoly([P(x + 0.85, y + 1.0, 19), P(x + 0.85, y + 1.1, 19), P(x + 0.85, y + 1.1, 20), P(x + 0.85, y + 1.0, 20)], yeşil ? '#38e07b' : '#1d6b3c');
    if (baski) {
      const p = Math.min(1, (t - baski.t0) / 1600); const L = 0.15 + p * 0.8;
      fillPoly([P(x + 0.3, y + 1.7, 19), P(x + 0.7, y + 1.7, 19), P(x + 0.7, y + 1.7 + L, 19 - p * 4), P(x + 0.3, y + 1.7 + L, 19 - p * 4)], PAL.kâğıt);
      if (p >= 1 && t - baski.t0 > 2200) { baski = null; fisYigini = Math.min(fisYigini + 1, 12); }
    }
    for (let i = 0; i < fisYigini; i++) kutu(x + 0.2, y + 0.2, 16 + i, 0.5, 0.5, 1, { üst: i % 2 ? PAL.kâğıt : '#efeadf', sol: '#d9d3c4', sag: '#cfc8b7' });
    // kupon standı
    kutu(x + 0.25, y + 2.0, 16, 0.5, 0.4, 5, { üst: '#ffe9a8', sol: '#c62828', sag: '#9b1c1c' });
  }

  // ---------- kare ----------
  let önceki = 0;
  function çiz(t) {
    const dt = önceki ? Math.min(200, t - önceki) : 66; önceki = t;
    çaycıYürü(dt); if (GIZMO_AKTIF) gizmoYürü(dt);
    ctx.fillStyle = '#1a1512'; ctx.fillRect(0, 0, W, H);
    duvarlar(t); pencereVeTabela(t); tvler(t); zemin();
    const n = [];
    n.push({ key: 0.15 + 0.15 + 2, f: () => çayOcağı(t) });
    for (const k of Object.keys(KADRO)) {
      const [cx, cy] = yerOf(k);
      // Genel Müdür kasanın önündeki tarafta durur; derinlik sırası tezgâhtan sonra olmalı
      n.push({ key: k === 'genel-mudur' ? KASA.x + KASA.y + KASA.w + KASA.d : cx + cy, f: () => ajan(k, t) });
      if (KADRO[k].masa) { const [x, y] = KADRO[k].masa; n.push({ key: x + y + MASA * 2 - 0.6, f: () => kuponMasası(k, t) }); }
    }
    n.push({ key: çaycı.x + çaycı.y, f: () => { const [a, b] = P(çaycı.x, çaycı.y); insan(a, b, { tip: 'çaycı', ayakta: true, yürü: çaycı.bekle <= 0, tepsi: true, renk: '#f4f1ea', renkKoyu: '#d9d3c4', kol: '#f4f1ea', yelek: '#1a1a1a', pantolon: '#1a1a1a' }, t); } });
    n.push({ key: RISK_YER[0] + RISK_YER[1], f: () => riskKişi(t) });
    n.push({ key: RISK_MASA[0] + RISK_MASA[1] + MASA * 2 - 0.6, f: () => riskMasası(t) });
    if (GIZMO_AKTIF) n.push({ key: gizmo.x + gizmo.y, f: () => { const [a, b] = P(gizmo.x, gizmo.y); insan(a, b, { tip: 'gizmo', ayakta: true, yürü: !gizmo.konuşuyor && gizmo.bekle <= 0, para: gizmo.konuşuyor, renk: '#2f6fd6', renkKoyu: '#2254a8', kol: PAL.ten, kısaKol: true, pantolon: '#8fb8e0', kot: '#6f9ccc', ayakkabı: '#ffffff', faz: 2 }, t); } });
    n.push({ key: KASA.x + KASA.y + KASA.w + KASA.d - 0.3, f: () => tezgâh(t) });
    n.push({ key: 9.6 + 7.2, f: () => bitki(9.3, 7.2) });
    n.push({ key: 0.3 + 7.5, f: () => bitki(0.3, 7.3) });
    n.sort((a, b) => a.key - b.key).forEach(o => o.f());
    kâğıtlarıÇiz(t);
  }

  function döngü(now) {
    if (!calisiyorMu) return;
    requestAnimationFrame(döngü);
    if (now - son < 66) return;
    son = now; kare++;
    if (kare % 60 === 0 && maclar.length) { tvSayfa++; tvGuncelle(); }
    çiz(now);
    yerleştirEtiket('gizmo');
    if (balonlar.gizmo) balonlariYerlestir();
  }

  // ---------- HTML katmanı ----------
  // Duvar yazıları: tuvalde 3x5 piksel harfler eğik duvarda okunmuyordu; HTML ile duvarın açısında (±26.57°) çizilir.
  const EGIM = Math.atan(TH / TW) * 180 / Math.PI;   // 26.57°
  // duvar: 'sag' (y=0 düzlemi, sağa doğru iner) | 'sol' (x sabit düzlem, sağa doğru yükselir)
  const LEVHALAR = [
    { id: 'neon', duvar: 'sol', x: 0, y0: 3.55, y1: 6.65, z0: 42, z1: 55, html: 'KAZAN dairesi', font: 5.4 },
    { id: 'cay', duvar: 'sol', x: 0, y0: 1.0, y1: 2.5, z0: 35, z1: 52, html: '<span>ÇAY</span><b>10₺</b>', font: 5.2 },
    { id: 'tv0', duvar: 'sag', y: 0, x0: 3.05, x1: 5.05, z0: 37, z1: 57, html: '', font: 3.6, tv: 0 },
    { id: 'tv1', duvar: 'sag', y: 0, x0: 6.05, x1: 8.05, z0: 37, z1: 57, html: '', font: 3.6, tv: 1 },
    { id: 'kupon', duvar: 'sol', x: KASA.x + KASA.w, y0: KASA.y + 0.35, y1: KASA.y + KASA.d - 0.35, z0: 2.5, z1: 8.5, html: 'KUPON', font: 4.4 },
  ];
  const levhaEl = {};
  for (const l of LEVHALAR) {
    const e = document.createElement('div');
    e.className = `iso-levha iso-levha-${l.id}`; e.innerHTML = l.html;
    katman.appendChild(e); levhaEl[l.id] = e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function tvGuncelle() { for (const l of LEVHALAR) if (l.tv != null) levhaEl[l.id].innerHTML = tvMetni(l.tv); }

  function levhalariYerlestir() {
    for (const l of LEVHALAR) {
      const e = levhaEl[l.id];
      // sol üst köşe: sağ duvarda en küçük x, sol duvarda en büyük y (ekranda en soldaki uç)
      const [sx, sy] = l.duvar === 'sag' ? P(l.x0, l.y, l.z1) : P(l.x, l.y1, l.z1);
      const yatay = (l.duvar === 'sag' ? l.x1 - l.x0 : l.y1 - l.y0) * TW;
      Object.assign(e.style, {
        left: `${sx * olcek}px`, top: `${sy * olcek}px`, width: `${yatay * olcek}px`, height: `${(l.z1 - l.z0) * olcek}px`,
        fontSize: `${l.font * olcek}px`, transform: `skewY(${l.duvar === 'sag' ? EGIM : -EGIM}deg)`,
      });
    }
  }

  function ölçekle() {
    const genişlik = root.clientWidth || W;
    olcek = genişlik / W >= 2 ? Math.floor(genişlik / W) : genişlik / W;
    root.classList.toggle('dar', olcek < 2);
    cv.style.width = `${W * olcek}px`; cv.style.height = `${H * olcek}px`;
    katman.style.width = cv.style.width; katman.style.height = cv.style.height;
    levhalariYerlestir();
    for (const k of Object.keys(KADRO)) yerleştirEtiket(k);
    yerleştirEtiket('risk-kurulu');
    balonlariYerlestir();
  }
  function başNoktası(k) {
    if (k === 'gizmo') return P(gizmo.x, gizmo.y, 38).map(v => v * olcek);
    if (k === 'risk-kurulu') return P(...RISK_YER, 37).map(v => v * olcek);
    const [cx, cy] = yerOf(k);
    const başÜstü = k === 'beyaz-hayalci' ? 44 : k === 'genel-mudur' ? 36 : 37;
    return P(cx, cy, başÜstü).map(v => v * olcek);
  }
  function yerleştirEtiket(k) {
    const e = etiketler[k]; if (!e) return;
    const [sx, sy] = başNoktası(k);
    e.style.left = `${sx}px`; e.style.top = `${sy}px`;
  }
  // Balonlar: etiketin üstünde; birbirine ve sahne kenarına çarpmasın diye kaydırılır
  function balonlariYerlestir() {
    const Wpx = W * olcek; const kutular = [];
    const sirali = Object.entries(balonlar).sort((a, b) => a[1]._zaman - b[1]._zaman);
    for (const [k, b] of sirali) {
      const e = etiketler[k]; const [sx, sy] = başNoktası(k);
      const w = b.offsetWidth, h = b.offsetHeight;
      let x = Math.min(Math.max(sx, w / 2 + 4), Wpx - w / 2 - 4);
      let alt = sy - (e?.offsetHeight ?? 0) - 6;          // balonun alt kenarı
      for (let deneme = 0; deneme < 12; deneme++) {
        const kutu = { l: x - w / 2, r: x + w / 2, t: alt - h, b: alt };
        const çakışan = kutular.find(o => kutu.l < o.r + 4 && kutu.r > o.l - 4 && kutu.t < o.b + 4 && kutu.b > o.t - 4);
        if (!çakışan) break;
        alt = çakışan.t - 6;                                  // üstüne çık
      }
      if (alt - h < 2) alt = h + 2;                           // sahnenin üstünden taşmasın
      kutular.push({ l: x - w / 2, r: x + w / 2, t: alt - h, b: alt });
      b.style.left = `${x}px`; b.style.top = `${alt}px`;
      b.style.setProperty('--ok', `${Math.max(-w / 2 + 10, Math.min(w / 2 - 10, sx - x))}px`);   // kuyruk karaktere baksın
    }
  }

  // Gizmo'nun etiketi ve balonu (kadroda değil, kendi kendine dolaşır)
  const gizmoEtiket = document.createElement('div');
  gizmoEtiket.className = 'iso-etiket iso-etiket-gizmo';
  gizmoEtiket.innerHTML = '<b>Gizmo</b><span></span>';
  katman.appendChild(gizmoEtiket); etiketler.gizmo = gizmoEtiket;
  if (!GIZMO_AKTIF) gizmoEtiket.style.display = 'none';
  function gizmoDurum(metin) {
    gizmoEtiket.querySelector('span').textContent = metin;
    gizmoEtiket.classList.toggle('aktif', metin === 'laf atıyor');
  }
  function kişiBalon(k, mesaj, süre, sınıf) {
    balonlar[k]?.remove();
    const b = document.createElement('div'); b.className = `iso-balon ${sınıf}`; b.textContent = mesaj; b._zaman = performance.now();
    katman.appendChild(b); balonlar[k] = b; balonlariYerlestir();
    setTimeout(() => { b.remove(); if (balonlar[k] === b) delete balonlar[k]; balonlariYerlestir(); }, süre);
  }
  const gizmoBalon = (mesaj) => kişiBalon('gizmo', mesaj, 5500, 'iso-balon-gizmo');

  // Risk Kurulu etiketi
  const riskEtiket = document.createElement('div');
  riskEtiket.className = 'iso-etiket iso-etiket-risk';
  riskEtiket.innerHTML = '<b>Nikah Dairesi</b><span></span>';
  katman.appendChild(riskEtiket); etiketler['risk-kurulu'] = riskEtiket;
  let riskZaman = null;
  function riskKarar({ durum, ajan, etiketler: et = [], kupon_id }) {
    if (!RISK_RENK[durum]) return;
    const t0 = performance.now();
    riskDamga = { t0, durum };
    const ad = kadroAdlari[ajan] ?? ajan ?? '';
    const liste = et.join(', ');
    const mesaj = durum === 'ret' ? `RET! ${ad}${liste ? ': ' + liste : ''}. Geri götür, düzelt!`
      : durum === 'uyari' ? `Geçti ama dikkat ${ad}: ${liste}.`
      : `Onay ✓ ${ad}${kupon_id ? ' · #' + kupon_id : ''}`;
    kişiBalon('risk-kurulu', mesaj, durum === 'onay' ? 4000 : 7000, `iso-balon-risk iso-balon-risk-${durum}`);
    riskEtiket.querySelector('span').textContent = durum === 'ret' ? 'RET' : durum === 'uyari' ? 'uyarı' : 'onay ✓';
    riskEtiket.dataset.durum = durum; riskEtiket.classList.add('aktif');
    clearTimeout(riskZaman); riskZaman = setTimeout(() => riskEtiket.classList.remove('aktif'), 6000);
    // damga indikten sonra kâğıt uçar: ret/uyarı → ajanın masasına geri, onay → kasaya (yazıcıya)
    const [fx, fy] = P(RISK_MASA[0] + 1.0, RISK_MASA[1] + 0.9, MASA_H + 1);
    const hedef = durum === 'onay' ? P(KASA.x + 0.5, KASA.y + 1.3, 20) : masaNoktası(ajan);
    uçanKâğıtlar.push({ from: [fx, fy], to: hedef, t0: t0 + 900, renk: RISK_RENK[durum] });
  }

  const api = {
    riskKarar,
    setKadro(kadro) {
      kadroAdlari = Object.fromEntries(Object.entries(kadro ?? {}).map(([k, v]) => [k, v.ad]));
      for (const k of Object.keys(KADRO)) {
        const e = etiketler[k] ?? document.createElement('div');
        e.className = 'iso-etiket';
        e.innerHTML = `<b>${esc(kadro[k]?.ad ?? k)}</b><span></span>`;
        katman.appendChild(e); etiketler[k] = e;
        api.setStatus(k, durum[k]?.metin ?? 'masada', durum[k]?.calisiyor);
      }
      ölçekle();
    },
    setStatus(k, metin, calisiyor) {
      if (!KADRO[k]) return;
      const ç = calisiyor ?? /\.\.\.$/.test(metin);
      durum[k] = { metin, calisiyor: ç };
      const e = etiketler[k];
      if (e) { e.querySelector('span').textContent = String(metin).replace(/\.\.\.$/, '…'); e.classList.toggle('aktif', !!ç); }
    },
    bubble(k, mesaj) {
      if (!KADRO[k]) return;
      balonlar[k]?.remove();
      const b = document.createElement('div'); b.className = 'iso-balon'; b.textContent = mesaj; b._zaman = performance.now();
      katman.appendChild(b); balonlar[k] = b; balonlariYerlestir();
      setTimeout(() => { b.remove(); if (balonlar[k] === b) delete balonlar[k]; balonlariYerlestir(); }, 9000);
    },
    printTicket() { baski = { t0: performance.now() }; },
    setTicketCount(n) { fisYigini = Math.min(n, 12); },
    setMatches(m) { maclar = (m ?? []).filter(x => x.oranlar?.some(o => o.bahis === 'Maç Sonucu')); tvGuncelle(); },
    start() { if (!calisiyorMu) { calisiyorMu = true; requestAnimationFrame(döngü); } ölçekle(); },
    stop() { calisiyorMu = false; },
  };

  new ResizeObserver(ölçekle).observe(root);
  requestAnimationFrame(döngü);
  return api;
}
