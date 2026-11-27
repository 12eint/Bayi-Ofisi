// 3D kıraathane + bayi (Three.js). Pixel sahneyle (iso.js) aynı yerleşim ve aynı API:
// setKadro, setStatus, bubble, printTicket, setTicketCount, setMatches, riskKarar, start, stop.
// Koordinat: pixel sahnedeki karo (x, y) → 3D (x, yükseklik, z=y). Arka duvar z=0, sol duvar x=0. 1 birim ≈ 1 metre.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MASA = 1.4, MASA_Y = 0.75;
// Düzen: arka sıra Öz23 · Hızlı Genç · 07 Mal Ahmet | orta sıra Box23 · Dorasal · Hakan Revio | ön sıra Spor Totocu (ortada)
const KADRO = {
  'genel-mudur':      { yer: [9.45, 4.2], ayakta: true, yon: Math.PI / 4, renk: '#1f1f24', kol: '#2a2a30' },
  'yasli-dayi':       { masa: [1.2, 1.8], renk: '#4a6a45', kol: '#587a52' },
  'hizli-genc':       { masa: [3.7, 1.8], renk: '#b84a3e', kol: '#c45a4d' },
  'beyaz-hayalci':    { masa: [6.2, 1.8], renk: '#8fa8cf', kol: '#a2b8da' },
  'inatci-eniste':    { masa: [1.2, 4.2], renk: '#7a5a8e', kol: '#8a6a9e' },
  'alt-ustcu':        { masa: [3.7, 4.2], renk: '#4f7f5a', kol: '#5e8f69' },
  'cok-bilen-kardes': { masa: [6.2, 4.2], renk: '#7a5a34', kol: '#8a6a42' },
  'spor-totocu':      { masa: [3.7, 6.3], renk: '#3f7590', kol: '#4d86a2' },
};
const yerOf = (k) => { const d = KADRO[k]; return d.ayakta ? d.yer : [d.masa[0] + 0.75, d.masa[1] - 0.15]; };
const KASA = { x: 8.2, z: 3.1, w: 1.0, d: 2.6, h: 0.8 };
// Çaycının yolu: masaların arasındaki düz koridorlar (çay ocağından başlar)
const ÇAYCI_YOL = [[0.6, 1.2], [5.65, 1.2], [5.65, 3.5], [7.9, 3.5], [7.9, 5.75], [3.15, 5.75], [3.15, 3.5], [0.6, 3.5]];
const DURAK = new Set([1, 3, 5]);   // bu noktalarda çay bırakmak için durur
// Gizmo: koridor merkezinden (HUB) her kişiye gider; son nokta duruş yeri, "bak" konuştuğu kişi
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
const GIZMO_LAFLAR = ['Bonjour!', 'Tutarsa küsüratı benim!', 'Başar hocam!', 'Bu 50 lirayı kaç para yapabiliriz?', 'Bugün tıraş yine yok.'];
const RISK_MASA = [8.3, 0.7];
const RISK_YER = [RISK_MASA[0] + 0.75, RISK_MASA[1] - 0.15];
const RISK_RENK = { ret: '#c62828', uyari: '#e08a00', onay: '#1f9d55' };
const TEN = '#f1c27d';

export function createOfis3D(root) {
  root.innerHTML = '<div class="o3-katman"></div><div class="o3-ipucu">Sürükle: döndür · Tekerlek: yakınlaş · Çift tık: sıfırla</div>';
  const katman = root.querySelector('.o3-katman');

  // ---------- sahne, kamera, ışık ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '3D kıraathane ve bayi');
  root.prepend(renderer.domElement);
  const sahne = new THREE.Scene();
  sahne.background = new THREE.Color('#1a1512');
  const kamera = new THREE.PerspectiveCamera(38, 16 / 10, 0.1, 100);
  const HEDEF = new THREE.Vector3(4.8, 0.7, 3.9), BAŞLANGIÇ = new THREE.Vector3(14.5, 8.6, 13.2);
  kamera.position.copy(BAŞLANGIÇ);
  const kontrol = new OrbitControls(kamera, renderer.domElement);
  kontrol.target.copy(HEDEF); kontrol.enableDamping = true; kontrol.enablePan = false;
  kontrol.minDistance = 6; kontrol.maxDistance = 28;
  kontrol.minPolarAngle = 0.35; kontrol.maxPolarAngle = 1.38;
  kontrol.minAzimuthAngle = 0.08; kontrol.maxAzimuthAngle = Math.PI / 2 - 0.08;   // duvarların içinden bakılmasın
  kontrol.update();
  // Dar ekranda oda kadraja sığsın diye kamera ekran oranına göre uzaklaşır (kullanıcı döndürmediyse)
  let elle = false;
  kontrol.addEventListener('start', () => { elle = true; });
  const başlangıcaDön = () => { const yön = BAŞLANGIÇ.clone().sub(HEDEF); yön.multiplyScalar(Math.max(1, 1.6 / kamera.aspect)); kamera.position.copy(HEDEF).add(yön); kontrol.target.copy(HEDEF); kontrol.update(); };
  renderer.domElement.addEventListener('dblclick', () => { elle = false; başlangıcaDön(); });

  sahne.add(new THREE.HemisphereLight('#fff1d6', '#3a2414', 1.6));
  const güneş = new THREE.DirectionalLight('#ffe2b0', 1.9);
  güneş.position.set(9, 12, 9); güneş.target.position.set(4.5, 0, 3.5);
  güneş.castShadow = true; güneş.shadow.mapSize.set(2048, 2048);
  Object.assign(güneş.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  güneş.shadow.bias = -0.0008;
  sahne.add(güneş, güneş.target);
  const lamba = new THREE.PointLight('#ffcf80', 6, 9, 1.6); lamba.position.set(4.8, 3.1, 4); sahne.add(lamba);

  // ---------- yardımcılar ----------
  const malzemeler = new Map();
  const mlz = (renk) => { if (!malzemeler.has(renk)) malzemeler.set(renk, new THREE.MeshLambertMaterial({ color: renk })); return malzemeler.get(renk); };
  const kutuGeo = new THREE.BoxGeometry(1, 1, 1);
  function kutu(ebeveyn, w, h, d, renk, x, y, z, gölge = true) {   // (x, y, z) kutunun ALT orta noktası
    const m = new THREE.Mesh(kutuGeo, typeof renk === 'string' ? mlz(renk) : renk);
    m.scale.set(w, h, d); m.position.set(x, y + h / 2, z);
    m.castShadow = gölge; m.receiveShadow = true;
    ebeveyn.add(m); return m;
  }
  function silindir(ebeveyn, r1, r2, h, renk, x, y, z, seg = 14) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), typeof renk === 'string' ? mlz(renk) : renk);
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; ebeveyn.add(m); return m;
  }
  function yazıDokusu(w, h, çiz) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const g = c.getContext('2d'); const yeniden = () => { çiz(g, w, h); tex.needsUpdate = true; };
    yeniden(); return { tex, yeniden };
  }
  // duvara yapışık yazılı levha: duvar 'arka' (z=0, +z'ye bakar) | 'sol' (x=0, +x'e bakar)
  function levha(duvar, a0, a1, y0, y1, doku, { parlak = false } = {}) {
    const w = a1 - a0, h = y1 - y0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), parlak ? new THREE.MeshBasicMaterial({ map: doku }) : new THREE.MeshLambertMaterial({ map: doku }));
    if (duvar === 'arka') m.position.set(a0 + w / 2, y0 + h / 2, 0.03);
    else { m.rotation.y = Math.PI / 2; m.position.set(0.03, y0 + h / 2, a0 + w / 2); }
    sahne.add(m); return m;
  }
  const yuvarlakYazı = (g, metin, x, y, boyut, renk, font = 'bold') => { g.font = `${font} ${boyut}px "Courier New", monospace`; g.fillStyle = renk; g.fillText(metin, x, y); };

  // ---------- oda ----------
  const zeminDoku = yazıDokusu(64, 64, (g) => {
    g.fillStyle = '#d6c6a2'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c4ae86'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    g.strokeStyle = '#ab9370'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64);
  });
  zeminDoku.tex.wrapS = zeminDoku.tex.wrapT = THREE.RepeatWrapping; zeminDoku.tex.repeat.set(10, 8); zeminDoku.tex.magFilter = THREE.NearestFilter;
  const zemin = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshLambertMaterial({ map: zeminDoku.tex }));
  zemin.rotation.x = -Math.PI / 2; zemin.position.set(5, 0, 4); zemin.receiveShadow = true; sahne.add(zemin);
  const DUVAR_H = 3.7, LAMBRI = 1.3;
  kutu(sahne, 10, LAMBRI, 0.1, '#6b4529', 5, 0, -0.05); kutu(sahne, 10, DUVAR_H - LAMBRI, 0.1, '#c8b88a', 5, LAMBRI, -0.05);
  kutu(sahne, 0.1, LAMBRI, 8, '#5a3a22', -0.05, 0, 4); kutu(sahne, 0.1, DUVAR_H - LAMBRI, 8, '#b7a77a', -0.05, LAMBRI, 4);
  kutu(sahne, 10, 0.06, 0.04, '#432a18', 5, LAMBRI, 0.01, false); kutu(sahne, 0.04, 0.06, 8, '#432a18', 0.01, LAMBRI, 4, false);
  kutu(sahne, 10, 0.12, 0.04, '#2a1a0e', 5, 0, 0.01, false); kutu(sahne, 0.04, 0.12, 8, '#2a1a0e', 0.01, 0, 4, false);
  for (let i = 0.5; i < 10; i += 0.5) kutu(sahne, 0.02, LAMBRI - 0.15, 0.02, '#432a18', i, 0.12, 0.01, false);
  for (let i = 0.5; i < 8; i += 0.5) kutu(sahne, 0.02, LAMBRI - 0.15, 0.02, '#432a18', 0.01, 0.12, i, false);
  // flamalar
  const flamaGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0.18, 0, 0), new THREE.Vector3(0, -0.3, 0)]);
  for (let i = 0; i < 19; i++) {
    const f = new THREE.Mesh(flamaGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#e8e2d0' : '#c62828', side: THREE.DoubleSide }));
    f.position.set(0.5 + i * 0.5, DUVAR_H - 0.12, 0.06); sahne.add(f);
  }
  // duvar saati
  const saat = new THREE.Group(); saat.position.set(9.4, 2.75, 0.04); sahne.add(saat);
  const kadran = silindir(saat, 0.24, 0.24, 0.05, '#f4efe0', 0, -0.025, 0, 24); kadran.rotation.x = Math.PI / 2; kadran.position.set(0, 0, 0.02);
  const çerçeve = silindir(saat, 0.27, 0.27, 0.04, '#2a1a0e', 0, -0.02, 0, 24); çerçeve.rotation.x = Math.PI / 2; çerçeve.position.set(0, 0, 0.0);
  const akrep = kutu(saat, 0.03, 0.13, 0.01, '#111', 0, 0, 0.055, false); const yelkovan = kutu(saat, 0.02, 0.19, 0.01, '#c62828', 0, 0, 0.06, false);
  const ibre = (m, a, boy) => { m.rotation.z = -a; m.position.set(Math.sin(a) * boy / 2, Math.cos(a) * boy / 2, m.position.z); };

  // pencere, kedi, tabelalar
  kutu(sahne, 0.08, 1.6, 3.5, '#3b2c20', 0.04, 1.45, 5.1);
  const cam = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.35), new THREE.MeshBasicMaterial({ color: '#1d3557' }));
  cam.rotation.y = Math.PI / 2; cam.position.set(0.09, 2.15, 5.1); sahne.add(cam);
  kutu(sahne, 0.3, 0.05, 3.5, '#4a3626', 0.15, 1.42, 5.1);
  const kedi = new THREE.Group(); kedi.position.set(0.17, 1.47, 5.9); sahne.add(kedi);
  kutu(kedi, 0.16, 0.12, 0.38, '#d9822b', 0, 0, 0); kutu(kedi, 0.15, 0.13, 0.14, '#d9822b', 0, 0.02, -0.24);
  kutu(kedi, 0.04, 0.05, 0.03, '#d9822b', -0.04, 0.15, -0.26); kutu(kedi, 0.04, 0.05, 0.03, '#d9822b', 0.04, 0.15, -0.26);
  const kuyruk = kutu(kedi, 0.05, 0.04, 0.22, '#d9822b', 0.03, 0, 0.27);
  // Pencere üstündeki neon tabela: "KAZAN dairesi" (yazı, levhaya sığacak boyuta kendiliğinden küçülür)
  const NEON_YAZI = 'KAZAN dairesi';
  const neon = yazıDokusu(1024, 292, (g, w, h) => {
    g.fillStyle = '#10141c'; g.fillRect(0, 0, w, h); g.shadowColor = '#ffcc00'; g.shadowBlur = 28;
    let boy = 150; g.font = `bold ${boy}px "Arial Black", sans-serif`;
    while (g.measureText(NEON_YAZI).width > w * 0.9 && boy > 40) { boy -= 4; g.font = `bold ${boy}px "Arial Black", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd84d'; g.fillText(NEON_YAZI, w / 2, h / 2 + 6);
  });
  const neonLevha = levha('sol', 3.6, 6.6, 2.05, 2.85, neon.tex, { parlak: true }); neonLevha.position.x = 0.12;
  const çayTahta = yazıDokusu(256, 320, (g, w, h) => {
    g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6b4529'; g.lineWidth = 14; g.strokeRect(0, 0, w, h);
    g.textAlign = 'center'; g.fillStyle = '#f3e9d8'; g.font = 'bold 86px "Courier New", monospace'; g.fillText('ÇAY', w / 2, 130);
    g.fillStyle = '#ffd84d'; g.font = 'bold 74px "Courier New", monospace'; g.fillText('10₺', w / 2, 240);
  });
  levha('sol', 1.0, 2.5, 1.7, 2.6, çayTahta.tex);

  // TV'ler (bülten döner)
  let maclar = [], tvSayfa = 0;
  const tvDokular = [0, 1].map(i => yazıDokusu(512, 300, (g, w, h) => {
    g.fillStyle = '#06142b'; g.fillRect(0, 0, w, h);
    const secim = i === 0 ? '1' : '2';
    yuvarlakYazı(g, `KOD · MS${secim}`, 24, 54, 40, '#7ee0ff');
    if (!maclar.length) { yuvarlakYazı(g, 'yükleniyor…', 24, 140, 36, '#ffd84d', 'normal'); return; }
    for (let r = 0; r < 3; r++) {
      const m = maclar[(tvSayfa * 3 + r + i * 3) % maclar.length];
      const o = m.oranlar.find(x => x.bahis === 'Maç Sonucu' && x.secim === secim);
      yuvarlakYazı(g, String(m.mac_kodu), 24, 120 + r * 62, 44, '#e8f4ff');
      g.textAlign = 'right'; yuvarlakYazı(g, o ? o.oran.toFixed(2) : '–', w - 24, 120 + r * 62, 44, '#ffd84d'); g.textAlign = 'left';
    }
  }));
  [[2.9, 5.2], [5.9, 8.2]].forEach(([a, b], i) => {
    kutu(sahne, b - a, 1.35, 0.08, '#141414', (a + b) / 2, 1.6, 0.04);
    const ekran = levha('arka', a + 0.08, b - 0.08, 1.68, 2.87, tvDokular[i].tex, { parlak: true }); ekran.position.z = 0.09;
  });

  // çay ocağı
  kutu(sahne, 2.2, 0.75, 0.8, '#6b4529', 1.25, 0, 0.55); kutu(sahne, 2.2, 0.04, 0.8, '#8a8f96', 1.25, 0.75, 0.55);
  kutu(sahne, 2.2, 0.05, 0.02, '#c9a24a', 1.25, 0.55, 0.96, false);
  silindir(sahne, 0.17, 0.2, 0.3, '#c9cdd2', 0.75, 0.79, 0.55); silindir(sahne, 0.12, 0.14, 0.18, '#c9cdd2', 0.75, 1.09, 0.55);
  silindir(sahne, 0.03, 0.03, 0.05, '#8d9399', 0.75, 1.27, 0.55);
  const buharlar = [0, 1, 2].map(i => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 })); sahne.add(b); return b; });
  kutu(sahne, 0.9, 0.03, 0.55, '#c0c4c9', 1.7, 0.79, 0.57);
  const bardakGeo = new THREE.CylinderGeometry(0.035, 0.028, 0.1, 10), tabakGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14);
  function bardak(eb, x, y, z) {
    const t = new THREE.Mesh(tabakGeo, mlz('#f4f1ea')); t.position.set(x, y + 0.006, z); eb.add(t);
    const b = new THREE.Mesh(bardakGeo, mlz('#a2401c')); b.position.set(x, y + 0.062, z); b.castShadow = true; eb.add(b);
  }
  [[1.45, 0.42], [1.65, 0.42], [1.85, 0.42], [1.55, 0.68], [1.78, 0.68]].forEach(([x, z]) => bardak(sahne, x, 0.82, z));

  function bitki(x, z) {
    silindir(sahne, 0.2, 0.15, 0.4, '#9c5a2e', x, 0, z);
    for (const [dx, dz, h, r] of [[0, 0, 0.8, 0.09], [-0.12, 0.05, 0.6, 0.07], [0.12, -0.04, 0.65, 0.07], [0.04, 0.12, 0.5, 0.06]]) {
      const y = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mlz(h > 0.7 ? '#3f8f3a' : '#5fb34f')); y.position.set(x + dx, 0.4 + h / 2, z + dz); y.castShadow = true; sahne.add(y);
    }
  }
  bitki(9.55, 7.45); bitki(0.55, 7.5);
  // tavan lambası
  silindir(sahne, 0.01, 0.01, 0.55, '#222', 4.8, DUVAR_H - 0.55, 4);
  const abajur = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 16, 1, true), new THREE.MeshLambertMaterial({ color: '#2f6f3e', side: THREE.DoubleSide })); abajur.position.set(4.8, DUVAR_H - 0.62, 4); sahne.add(abajur);
  const ampul = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3c4' })); ampul.position.set(4.8, DUVAR_H - 0.75, 4); sahne.add(ampul);

  // ---------- mobilya ----------
  function masa(x, z, { çuha = false } = {}) {
    const g = new THREE.Group(); sahne.add(g);
    for (const [dx, dz] of [[0.1, 0.1], [MASA - 0.1, 0.1], [0.1, MASA - 0.1], [MASA - 0.1, MASA - 0.1]]) kutu(g, 0.08, MASA_Y - 0.06, 0.08, '#3a2414', x + dx, 0, z + dz);
    kutu(g, MASA, 0.06, MASA, çuha ? '#2f7a46' : '#9a6a3a', x + MASA / 2, MASA_Y - 0.06, z + MASA / 2);
    return g;
  }
  function sandalye(x, z, yön = 0) {   // yön 0: oturan +z'ye bakar, sırtlık arkada (−z)
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yön; sahne.add(g);
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) kutu(g, 0.05, 0.45, 0.05, '#55321a', dx, 0, dz);
    kutu(g, 0.45, 0.05, 0.45, '#7a4a24', 0, 0.45, 0); kutu(g, 0.45, 0.5, 0.05, '#7a4a24', 0, 0.5, -0.21);
  }

  // ---------- insan ----------
  // o: { tip, renk, kol, pantolon, ayakkabı, ayakta, yön }
  function insan(o) {
    const g = new THREE.Group(); sahne.add(g);
    const kalça = o.ayakta ? 0.85 : 0.48;
    const p = { g, kalça, ayakta: !!o.ayakta };
    const pant = o.pantolon ?? '#2a2a30', ayk = o.ayakkabı ?? '#111';
    if (o.ayakta) {
      p.bacakSol = new THREE.Group(); p.bacakSol.position.set(-0.1, kalça, 0); g.add(p.bacakSol);
      p.bacakSağ = new THREE.Group(); p.bacakSağ.position.set(0.1, kalça, 0); g.add(p.bacakSağ);
      for (const b of [p.bacakSol, p.bacakSağ]) { kutu(b, 0.15, kalça - 0.06, 0.17, pant, 0, -kalça + 0.06, 0); kutu(b, 0.16, 0.07, 0.26, ayk, 0, -kalça, 0.04); }
    } else {
      for (const dx of [-0.1, 0.1]) { kutu(g, 0.15, 0.15, 0.45, pant, dx, kalça - 0.02, 0.2); kutu(g, 0.14, kalça - 0.05, 0.15, pant, dx, 0.05, 0.4); kutu(g, 0.15, 0.06, 0.24, ayk, dx, 0, 0.45); }
    }
    kutu(g, 0.46, 0.6, 0.27, o.renk, 0, kalça, 0);                         // gövde
    if (o.yelek) { kutu(g, 0.47, 0.6, 0.1, o.yelek, 0, kalça, 0.1); kutu(g, 0.47, 0.6, 0.1, o.yelek, 0, kalça, -0.1); }
    const omuz = kalça + 0.56;
    p.kolSol = new THREE.Group(); p.kolSol.position.set(-0.3, omuz, 0); g.add(p.kolSol);
    p.kolSağ = new THREE.Group(); p.kolSağ.position.set(0.3, omuz, 0); g.add(p.kolSağ);
    for (const k of [p.kolSol, p.kolSağ]) {
      kutu(k, 0.13, 0.52, 0.15, o.kol, 0, -0.52, 0);
      if (o.kısaKol) kutu(k, 0.14, 0.18, 0.16, o.renk, 0, -0.18, 0);
      kutu(k, 0.12, 0.09, 0.13, TEN, 0, -0.6, 0);
    }
    p.kafa = new THREE.Group(); p.kafa.position.set(0, kalça + 0.62, 0); g.add(p.kafa);
    kutu(p.kafa, 0.32, 0.34, 0.31, TEN, 0, 0, 0);
    p.gözler = [-0.07, 0.07].map(dx => kutu(p.kafa, 0.05, 0.05, 0.01, '#221a14', dx, 0.17, 0.157, false));
    kutu(p.kafa, 0.09, 0.025, 0.01, '#a0523d', 0, 0.075, 0.157, false);
    p.başÜstü = kalça + 0.62 + 0.4;
    süsle(o.tip, p);
    g.position.set(o.x, 0, o.z); g.rotation.y = o.yön ?? 0;
    return p;
  }
  function süsle(tip, p) {
    const k = p.kafa, s = (w, h, d, r, x, y, z) => kutu(k, w, h, d, r, x, y, z, false);
    switch (tip) {
      case 'genel-mudur':
        s(0.34, 0.08, 0.33, '#9a9a9a', 0, 0.32, -0.01); s(0.035, 0.16, 0.25, '#9a9a9a', -0.17, 0.17, -0.03); s(0.035, 0.16, 0.25, '#9a9a9a', 0.17, 0.17, -0.03);
        s(0.16, 0.035, 0.02, '#3a2a1a', 0, 0.1, 0.16);
        kutu(p.g, 0.12, 0.05, 0.02, '#f3e9d8', 0, p.kalça + 0.55, 0.136, false); kutu(p.g, 0.06, 0.4, 0.02, '#c62828', 0, p.kalça + 0.16, 0.137, false); break;
      case 'yasli-dayi':
        s(0.35, 0.07, 0.35, '#6b5b4b', 0, 0.33, -0.01); s(0.3, 0.025, 0.12, '#5a4b3d', 0, 0.33, 0.2);
        s(0.03, 0.12, 0.2, '#d8d8d8', -0.17, 0.15, -0.03); s(0.03, 0.12, 0.2, '#d8d8d8', 0.17, 0.15, -0.03); s(0.17, 0.035, 0.02, '#f2f2f2', 0, 0.1, 0.16);
        p.tespih = new THREE.Group(); p.kolSağ.add(p.tespih); p.tespih.position.set(0, -0.68, 0.04);
        for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), mlz('#7a1c1c')); b.position.set(Math.sin(i) * 0.02, -i * 0.03, 0); p.tespih.add(b); }
        break;
      case 'hizli-genc':
        for (let i = 0; i < 5; i++) s(0.07, 0.12 + (i % 2) * 0.05, 0.25, i % 2 ? '#2a1a10' : '#e0b030', -0.13 + i * 0.065, 0.31, -0.02);
        s(0.36, 0.035, 0.06, '#222', 0, 0.36, 0); s(0.05, 0.12, 0.1, '#222', -0.18, 0.13, 0); s(0.05, 0.12, 0.1, '#222', 0.18, 0.13, 0);
        kutu(p.g, 0.04, 0.6, 0.01, '#ffffff', -0.22, p.kalça, 0.136, false); kutu(p.g, 0.04, 0.6, 0.01, '#ffffff', 0.22, p.kalça, 0.136, false); break;
      case 'beyaz-hayalci': {
        s(0.35, 0.09, 0.34, '#f0e2b6', 0, 0.31, -0.01); s(0.04, 0.16, 0.3, '#f0e2b6', -0.17, 0.16, -0.02); s(0.04, 0.16, 0.3, '#f0e2b6', 0.17, 0.16, -0.02);
        kutu(p.g, 0.18, 0.08, 0.01, '#ffffff', 0, p.kalça + 0.48, 0.137, false);
        p.bulut = new THREE.Group(); p.bulut.position.set(0, 0.75, 0); k.add(p.bulut);
        const bm = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#d9e4f5', emissiveIntensity: 0.4 });
        for (const [x, y, r] of [[-0.14, 0, 0.11], [0, 0.04, 0.14], [0.15, 0, 0.11], [0.05, -0.04, 0.1]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), bm); b.position.set(x, y, 0); p.bulut.add(b); }
        p.hayal = kutu(p.bulut, 0.08, 0.1, 0.02, '#2f8f3a', 0, -0.03, 0.14, false);
        break;
      }
      case 'cok-bilen-kardes':
        s(0.34, 0.08, 0.33, '#2a1a10', 0, 0.32, -0.01); s(0.12, 0.05, 0.05, '#2a1a10', 0.1, 0.27, 0.15);
        s(0.11, 0.08, 0.02, '#111', -0.075, 0.15, 0.165); s(0.11, 0.08, 0.02, '#111', 0.075, 0.15, 0.165); s(0.04, 0.02, 0.02, '#111', 0, 0.17, 0.165);
        s(0.07, 0.04, 0.01, '#bfe3ff', -0.075, 0.17, 0.176); s(0.07, 0.04, 0.01, '#bfe3ff', 0.075, 0.17, 0.176);
        kutu(p.g, 0.12, 0.6, 0.01, '#efe6d0', 0, p.kalça, 0.136, false); kutu(p.g, 0.04, 0.12, 0.01, '#c62828', -0.06, p.kalça + 0.4, 0.14, false); break;
      case 'alt-ustcu':
        s(0.34, 0.08, 0.33, '#5a3a22', 0, 0.32, -0.01); s(0.3, 0.1, 0.05, '#5a3a22', 0, 0.02, 0.15);
        kutu(p.g, 0.05, 0.08, 0.04, '#c0c4c9', 0, p.kalça + 0.3, 0.15, false);
        break;
      case 'spor-totocu':
        s(0.34, 0.06, 0.33, '#b9b9b9', 0, 0.32, -0.01); s(0.03, 0.12, 0.22, '#b9b9b9', -0.17, 0.16, -0.03); s(0.03, 0.12, 0.22, '#b9b9b9', 0.17, 0.16, -0.03);
        s(0.11, 0.06, 0.02, '#3a3a3a', -0.075, 0.15, 0.165); s(0.11, 0.06, 0.02, '#3a3a3a', 0.075, 0.15, 0.165); s(0.15, 0.03, 0.02, '#8a8a8a', 0, 0.09, 0.16);
        s(0.03, 0.03, 0.18, '#ffcc00', 0.18, 0.22, 0.02);
        break;
      case 'amca1':
        s(0.03, 0.14, 0.22, '#cfcfcf', -0.17, 0.14, -0.03); s(0.03, 0.14, 0.22, '#cfcfcf', 0.17, 0.14, -0.03); s(0.17, 0.04, 0.02, '#555', 0, 0.1, 0.16); break;
      case 'amca2':
        s(0.35, 0.08, 0.35, '#3a3a3a', 0, 0.32, -0.01); s(0.3, 0.025, 0.12, '#2a2a2a', 0, 0.32, 0.2); s(0.33, 0.12, 0.05, '#9a9a9a', 0, 0.16, -0.16); break;
      case 'çaycı':
        s(0.34, 0.08, 0.33, '#1a1a1a', 0, 0.32, -0.01); s(0.12, 0.035, 0.02, '#1a1a1a', 0, 0.1, 0.16); break;
      case 'gizmo':
        s(0.35, 0.1, 0.34, '#7a1f0c', 0, 0.31, -0.01); s(0.2, 0.07, 0.04, '#a3341a', -0.06, 0.26, 0.15);
        s(0.05, 0.46, 0.3, '#7a1f0c', -0.18, -0.12, -0.02); s(0.05, 0.46, 0.3, '#5c1608', 0.18, -0.12, -0.02); s(0.34, 0.5, 0.06, '#6b1a0a', 0, -0.16, -0.17);
        p.para = new THREE.Group(); p.kolSağ.add(p.para); p.para.position.set(0, -0.68, 0.05); p.para.visible = false;
        kutu(p.para, 0.26, 0.13, 0.01, '#e3923a', 0.08, 0, 0, false); kutu(p.para, 0.06, 0.06, 0.012, '#a85a14', 0.02, 0.035, 0, false); break;
      case 'inatci-eniste':
        s(0.34, 0.08, 0.33, '#3a2a1e', 0, 0.32, -0.01); s(0.03, 0.14, 0.22, '#9a9a9a', -0.17, 0.16, -0.03); s(0.03, 0.14, 0.22, '#9a9a9a', 0.17, 0.16, -0.03);
        s(0.24, 0.05, 0.03, '#2a1a10', 0, 0.09, 0.16); s(0.04, 0.06, 0.03, '#2a1a10', -0.12, 0.05, 0.16); s(0.04, 0.06, 0.03, '#2a1a10', 0.12, 0.05, 0.16);
        kutu(p.g, 0.5, 0.1, 0.3, '#c62828', 0, p.kalça + 0.52, 0, false); kutu(p.g, 0.1, 0.35, 0.04, '#c62828', 0.12, p.kalça + 0.2, 0.15, false); kutu(p.g, 0.1, 0.06, 0.045, '#f4f1ea', 0.12, p.kalça + 0.3, 0.15, false);
        break;
      case 'risk-kurulu':
        s(0.03, 0.16, 0.24, '#b9b9b9', -0.17, 0.14, -0.03); s(0.03, 0.16, 0.24, '#b9b9b9', 0.17, 0.14, -0.03);
        s(0.13, 0.09, 0.025, '#111', -0.075, 0.15, 0.165); s(0.13, 0.09, 0.025, '#111', 0.075, 0.15, 0.165);
        s(0.08, 0.04, 0.01, '#cfe6ff', -0.075, 0.17, 0.18); s(0.08, 0.04, 0.01, '#cfe6ff', 0.075, 0.17, 0.18);
        kutu(p.g, 0.16, 0.07, 0.03, '#9b1c1c', 0, p.kalça + 0.5, 0.14, false);
        p.damga = new THREE.Group(); p.kolSağ.add(p.damga); p.damga.position.set(0, -0.7, 0);
        kutu(p.damga, 0.05, 0.12, 0.05, '#5a3a22', 0, 0, 0, false); p.damgaUç = kutu(p.damga, 0.12, 0.04, 0.09, '#3a2414', 0, -0.04, 0, false);
        p.damga.visible = false; break;
    }
  }

  // ---------- yerleşim ----------
  const kişiler = {};
  const durum = {};
  for (const [k, d] of Object.entries(KADRO)) {
    const [x, z] = yerOf(k);
    if (d.masa) {
      const [mx, mz] = d.masa; masa(mx, mz); sandalye(x, z - 0.05);
      kutu(sahne, 0.45, 0.01, 0.35, '#fffbe9', mx + 0.6, MASA_Y, mz + 0.55); kutu(sahne, 0.4, 0.015, 0.3, '#efe6c8', mx + 1.05, MASA_Y, mz + 0.95);
      bardak(sahne, mx + 1.15, MASA_Y, mz + 0.35);
      if (k === 'cok-bilen-kardes') bardak(sahne, mx + 0.3, MASA_Y, mz + 1.1);
    }
    kişiler[k] = insan({ tip: k, x, z, ayakta: d.ayakta, yön: d.yon ?? 0, renk: d.renk, kol: d.kol });
  }

  // kasa + yazıcı + fiş yığını
  const kasa = new THREE.Group(); sahne.add(kasa);
  kutu(kasa, KASA.w, KASA.h, KASA.d, '#9b1c1c', KASA.x + KASA.w / 2, 0, KASA.z + KASA.d / 2);
  kutu(kasa, KASA.w + 0.04, 0.04, KASA.d + 0.04, '#3a3a44', KASA.x + KASA.w / 2, KASA.h, KASA.z + KASA.d / 2);
  kutu(kasa, 0.02, 0.1, KASA.d, '#ffcc00', KASA.x + KASA.w + 0.005, 0.45, KASA.z + KASA.d / 2, false);
  kutu(kasa, KASA.w, 0.1, 0.02, '#ffcc00', KASA.x + KASA.w / 2, 0.45, KASA.z + KASA.d + 0.005, false);
  const kuponYazı = yazıDokusu(256, 64, (g, w, h) => { g.fillStyle = '#9b1c1c'; g.fillRect(0, 0, w, h); g.font = 'bold 44px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffcc00'; g.fillText('KUPON', w / 2, h / 2); });
  const kuponLevha = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshLambertMaterial({ map: kuponYazı.tex }));
  kuponLevha.rotation.y = Math.PI / 2; kuponLevha.position.set(KASA.x + KASA.w + 0.02, 0.22, KASA.z + KASA.d / 2); kasa.add(kuponLevha);
  const üst = KASA.h + 0.04;
  kutu(kasa, 0.6, 0.28, 0.7, '#e8e4da', KASA.x + 0.5, üst, KASA.z + 1.3);
  const led = kutu(kasa, 0.05, 0.03, 0.02, '#38e07b', KASA.x + 0.72, üst + 0.2, KASA.z + 1.66, false);
  led.material = new THREE.MeshBasicMaterial({ color: '#38e07b' });
  const baskıKâğıdı = kutu(kasa, 0.32, 0.01, 0.5, '#fbfaf5', KASA.x + 0.5, üst + 0.1, KASA.z + 1.65, false); baskıKâğıdı.visible = false;
  const yığın = new THREE.Group(); kasa.add(yığın);
  kutu(kasa, 0.4, 0.3, 0.35, '#c62828', KASA.x + 0.5, üst, KASA.z + 2.15); kutu(kasa, 0.42, 0.05, 0.37, '#ffe9a8', KASA.x + 0.5, üst + 0.3, KASA.z + 2.15);
  let fişSayısı = 0, baskı = null;
  function yığınıKur() {
    yığın.clear();
    for (let i = 0; i < fişSayısı; i++) kutu(yığın, 0.38, 0.012, 0.38, i % 2 ? '#fbfaf5' : '#efeadf', KASA.x + 0.45, üst + i * 0.012, KASA.z + 0.45, false);
  }

  // çaycı
  const çaycı = { i: 0, x: ÇAYCI_YOL[0][0], z: ÇAYCI_YOL[0][1], bekle: 0 };
  const çaycıK = insan({ tip: 'çaycı', ayakta: true, x: çaycı.x, z: çaycı.z, renk: '#f4f1ea', kol: '#f4f1ea', yelek: '#1a1a1a', pantolon: '#1a1a1a' });
  çaycıK.kolSol.rotation.x = çaycıK.kolSağ.rotation.x = -1.2;
  const tepsi = new THREE.Group(); tepsi.position.set(0, çaycıK.kalça + 0.33, 0.45); çaycıK.g.add(tepsi);
  silindir(tepsi, 0.25, 0.25, 0.02, '#c0c4c9', 0, 0, 0, 20);
  [[-0.1, 0], [0.1, 0], [0, 0.1], [0, -0.1]].forEach(([x, z]) => bardak(tepsi, x, 0.02, z));

  // Gizmo
  const ilk = GIZMO_DURAKLAR[0].yol.at(-1);
  const gizmo = { durak: 0, yol: [], x: ilk[0], z: ilk[1], bekle: 0, laf: 0, konuşuyor: false };
  const gizmoK = insan({ tip: 'gizmo', ayakta: true, x: gizmo.x, z: gizmo.z, renk: '#2f6fd6', kol: TEN, kısaKol: true, pantolon: '#8fb8e0', ayakkabı: '#ffffff' });

  // Risk Kurulu
  masa(RISK_MASA[0], RISK_MASA[1]); sandalye(RISK_YER[0], RISK_YER[1] - 0.05);
  const [rx, rz] = RISK_MASA;
  kutu(sahne, 0.5, 0.12, 0.4, '#e9e4d6', rx + 0.4, MASA_Y, rz + 0.45); kutu(sahne, 0.42, 0.04, 0.32, '#f5d76e', rx + 0.4, MASA_Y + 0.12, rz + 0.45);
  const riskKâğıt = kutu(sahne, 0.4, 0.01, 0.34, '#fffbe9', rx + 1.0, MASA_Y, rz + 0.95);
  const mürekkep = kutu(sahne, 0.16, 0.012, 0.1, '#c62828', rx + 1.0, MASA_Y + 0.005, rz + 0.95, false); mürekkep.visible = false;
  mürekkep.material = new THREE.MeshBasicMaterial({ color: '#c62828' });
  const masaDamgası = new THREE.Group(); sahne.add(masaDamgası); masaDamgası.position.set(rx + 1.15, MASA_Y, rz + 0.35);
  kutu(masaDamgası, 0.12, 0.04, 0.09, '#3a2414', 0, 0, 0); kutu(masaDamgası, 0.05, 0.12, 0.05, '#5a3a22', 0, 0.04, 0);
  bardak(sahne, rx + 0.2, MASA_Y, rz + 1.15);
  const riskLevhaD = yazıDokusu(256, 80, (g, w, h) => { g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, w, h); g.font = 'bold 52px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffcc00'; g.fillText('RİSK', w / 2, h / 2 + 2); });
  const riskLevha = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.19), new THREE.MeshLambertMaterial({ map: riskLevhaD.tex }));
  riskLevha.position.set(rx + 0.7, MASA_Y - 0.15, rz + MASA + 0.005); sahne.add(riskLevha);
  const riskK = insan({ tip: 'risk-kurulu', x: RISK_YER[0], z: RISK_YER[1], renk: '#4a4f58', kol: '#545a64' });
  let riskDamga = null;
  const uçanlar = [];

  // ---------- HTML katmanı: etiketler ve balonlar ----------
  const etiketler = {}, balonlar = {};
  let kadroAdlari = {};
  function etiketYap(k, ad, sınıf = '') {
    const e = etiketler[k] ?? document.createElement('div');
    e.className = `iso-etiket ${sınıf}`; e.innerHTML = `<b></b><span></span>`; e.querySelector('b').textContent = ad;
    katman.appendChild(e); etiketler[k] = e; return e;
  }
  etiketYap('gizmo', 'Gizmo', 'iso-etiket-gizmo');
  const riskEtiket = etiketYap('risk-kurulu', 'Nikah Dairesi', 'iso-etiket-risk');
  const v = new THREE.Vector3();
  const kişiOf = (k) => k === 'gizmo' ? gizmoK : k === 'risk-kurulu' ? riskK : kişiler[k];
  const ekranlar = {};
  function başNoktası(k) {
    const p = kişiOf(k); if (!p) return null;
    v.set(0, p.başÜstü + (k === 'beyaz-hayalci' ? 0.45 : 0.05), 0); p.g.localToWorld(v); v.project(kamera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * genişlik, (1 - v.y) / 2 * yükseklik];
  }
  function katmanıYerleştir() {
    for (const k of Object.keys(etiketler)) {
      const n = başNoktası(k); ekranlar[k] = n; const e = etiketler[k];
      if (!n) { e.style.display = 'none'; continue; }
      e.style.display = ''; e.style.left = `${n[0]}px`; e.style.top = `${n[1]}px`;
    }
    const kutular = [];
    for (const [k, b] of Object.entries(balonlar).sort((a, c) => a[1]._zaman - c[1]._zaman)) {
      const n = ekranlar[k] ?? başNoktası(k); if (!n) { b.style.display = 'none'; continue; }
      b.style.display = '';
      const w = b.offsetWidth, h = b.offsetHeight;
      const x = Math.min(Math.max(n[0], w / 2 + 4), genişlik - w / 2 - 4);
      let alt = n[1] - (etiketler[k]?.offsetHeight ?? 0) - 6;
      for (let i = 0; i < 12; i++) {
        const ç = kutular.find(o => x - w / 2 < o.r + 4 && x + w / 2 > o.l - 4 && alt - h < o.b + 4 && alt > o.t - 4);
        if (!ç) break; alt = ç.t - 6;
      }
      if (alt - h < 2) alt = h + 2;
      kutular.push({ l: x - w / 2, r: x + w / 2, t: alt - h, b: alt });
      b.style.left = `${x}px`; b.style.top = `${alt}px`;
      b.style.setProperty('--ok', `${Math.max(-w / 2 + 10, Math.min(w / 2 - 10, n[0] - x))}px`);
    }
  }
  function kişiBalon(k, mesaj, süre = 9000, sınıf = '') {
    balonlar[k]?.remove();
    const b = document.createElement('div'); b.className = `iso-balon ${sınıf}`; b.textContent = mesaj; b._zaman = performance.now();
    katman.appendChild(b); balonlar[k] = b;
    setTimeout(() => { b.remove(); if (balonlar[k] === b) delete balonlar[k]; }, süre);
  }
  function gizmoDurum(metin) { const e = etiketler.gizmo; e.querySelector('span').textContent = metin; e.classList.toggle('aktif', metin === 'laf atıyor'); }

  // ---------- hareket ----------
  function yürü(o, hedef, hız, dt) {
    const dx = hedef[0] - o.x, dz = hedef[1] - o.z, uz = Math.hypot(dx, dz), adım = hız * dt;
    if (uz <= adım) { o.x = hedef[0]; o.z = hedef[1]; return true; }
    o.x += dx / uz * adım; o.z += dz / uz * adım; o.yön = Math.atan2(dx, dz); return false;
  }
  function yürüyüşAnim(p, t, yürüyor) {
    const a = yürüyor ? Math.sin(t / 110) * 0.55 : 0;
    p.bacakSol.rotation.x = a; p.bacakSağ.rotation.x = -a;
    return a;
  }
  const dön = (p, hedefYön, oran = 0.18) => { let d = hedefYön - p.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); p.g.rotation.y += d * oran; };

  function çaycıAdım(dt, t) {
    let yürüyor = false;
    if (çaycı.bekle > 0) çaycı.bekle -= dt;
    else {
      const h = ÇAYCI_YOL[(çaycı.i + 1) % ÇAYCI_YOL.length];
      yürüyor = true;
      if (yürü(çaycı, h, 0.0011, dt)) { çaycı.i = (çaycı.i + 1) % ÇAYCI_YOL.length; if (DURAK.has(çaycı.i)) çaycı.bekle = 1800; }
    }
    çaycıK.g.position.set(çaycı.x, yürüyor ? Math.abs(Math.sin(t / 110)) * 0.03 : 0, çaycı.z);
    if (çaycı.yön != null) dön(çaycıK, çaycı.yön);
    yürüyüşAnim(çaycıK, t, yürüyor);
  }
  function gizmoAdım(dt, t) {
    let yürüyor = false;
    if (gizmo.bekle > 0) {
      gizmo.bekle -= dt;
      if (gizmo.bekle <= 0) {
        gizmo.konuşuyor = false;
        const şimdiki = GIZMO_DURAKLAR[gizmo.durak];
        gizmo.durak = (gizmo.durak + 1) % GIZMO_DURAKLAR.length;
        gizmo.yol = [...şimdiki.yol.slice(0, -1).reverse(), GIZMO_HUB, ...GIZMO_DURAKLAR[gizmo.durak].yol];
        gizmoDurum('dolaşıyor');
      }
    } else if (!gizmo.yol.length) {
      gizmo.konuşuyor = true; gizmo.bekle = 6000; gizmoDurum('laf atıyor');
      kişiBalon('gizmo', GIZMO_LAFLAR[gizmo.laf++ % GIZMO_LAFLAR.length], 5500, 'iso-balon-gizmo');
    } else { yürüyor = true; if (yürü(gizmo, gizmo.yol[0], 0.0012, dt)) gizmo.yol.shift(); }
    gizmoK.g.position.set(gizmo.x, yürüyor ? Math.abs(Math.sin(t / 110)) * 0.03 : 0, gizmo.z);
    if (gizmo.konuşuyor) { const [bx, bz] = GIZMO_DURAKLAR[gizmo.durak].bak; dön(gizmoK, Math.atan2(bx - gizmo.x, bz - gizmo.z)); }
    else if (gizmo.yön != null) dön(gizmoK, gizmo.yön);
    const a = yürüyüşAnim(gizmoK, t, yürüyor);
    gizmoK.para.visible = gizmo.konuşuyor;
    gizmoK.kolSağ.rotation.x = gizmo.konuşuyor ? -2.7 + Math.sin(t / 150) * 0.15 : a * 0.8;
    gizmoK.kolSağ.rotation.z = gizmo.konuşuyor ? 0.15 : 0;
    gizmoK.kolSol.rotation.x = -a * 0.8;
  }
  function ajanAnim(k, t) {
    const p = kişiler[k], ç = !!durum[k]?.calisiyor;
    p.g.position.y = 0;
    if (k === 'genel-mudur') { p.kolSağ.rotation.x = ç ? -0.9 + Math.sin(t / 180) * 0.2 : 0; return; }
    if (k === 'cok-bilen-kardes' && ç) {         // eleştiriyor: kalemle işaret ediyor
      p.kolSağ.rotation.x = -1.9 + Math.sin(t / 260) * 0.25; p.kolSol.rotation.x = -0.9;
    } else if (ç) {                               // kupon yazıyor
      p.kolSağ.rotation.x = -1.0 + Math.sin(t / 90) * 0.12; p.kolSağ.rotation.z = Math.sin(t / 140) * 0.15; p.kolSol.rotation.x = -0.85;
      if (k === 'hizli-genc') p.g.position.y = Math.abs(Math.sin(t / 150)) * 0.05;
    } else {
      p.kolSağ.rotation.x = -0.75; p.kolSağ.rotation.z = 0; p.kolSol.rotation.x = -0.75;
      if (k === 'yasli-dayi') p.tespih.rotation.z = Math.sin(t / 300) * 0.3;
    }
    if (p.bulut) { p.bulut.position.y = 0.75 + Math.sin(t / 500) * 0.04; p.hayal.visible = Math.floor(t / 1500) % 2 === 1; }
  }
  function göz(p, t, faz) { const kapalı = (Math.floor((t + faz * 700) / 2600) % 6 === 0) && (t % 2600) < 160; p.gözler.forEach(g => { g.scale.y = kapalı ? 0.01 : 0.05; }); }

  function riskAnim(t) {
    riskK.kolSol.rotation.x = -0.8;
    if (!riskDamga) { riskK.kolSağ.rotation.x = -0.8; riskK.damga.visible = false; masaDamgası.visible = true; mürekkep.visible = false; return; }
    const d = (t - riskDamga.t0) / 900;
    if (d < 1) {
      masaDamgası.visible = false; riskK.damga.visible = true;
      riskK.kolSağ.rotation.x = d < 0.45 ? -0.8 - d / 0.45 * 1.5 : -2.3 + Math.min(1, (d - 0.45) / 0.2) * 1.25;
    } else { riskK.kolSağ.rotation.x = -0.8; riskK.damga.visible = false; masaDamgası.visible = true; }
    mürekkep.visible = t - riskDamga.t0 > 700 && t - riskDamga.t0 < 6000;
  }
  const uçanGeo = new THREE.PlaneGeometry(0.28, 0.2);
  function uçanAdım(t) {
    for (let i = uçanlar.length - 1; i >= 0; i--) {
      const u = uçanlar[i], p = (t - u.t0) / 1500;
      u.m.visible = p >= 0;
      if (p < 0) continue;
      if (p >= 1) { sahne.remove(u.m); uçanlar.splice(i, 1); continue; }
      u.m.position.lerpVectors(u.from, u.to, p); u.m.position.y += Math.sin(Math.PI * p) * 1.1;
      u.m.rotation.set(-Math.PI / 2 + Math.sin(t / 90) * 0.4, p * 6, 0);
    }
  }
  function masaNoktası(ajan) {
    const d = KADRO[ajan];
    if (d?.masa) return new THREE.Vector3(d.masa[0] + MASA / 2, MASA_Y + 0.05, d.masa[1] + MASA / 2);
    return new THREE.Vector3(KASA.x + 0.5, üst + 0.35, KASA.z + 1.3);
  }

  // ---------- döngü ----------
  let genişlik = 800, yükseklik = 500, çalışıyor = true, önceki = 0, son = 0, kare = 0;
  function boyutla() {
    genişlik = Math.max(280, root.clientWidth || 800);
    yükseklik = Math.round(Math.min(640, Math.max(300, genişlik * 0.62)));
    renderer.setSize(genişlik, yükseklik); kamera.aspect = genişlik / yükseklik; kamera.updateProjectionMatrix();
    if (!elle) başlangıcaDön();
    root.classList.toggle('dar', genişlik < 640);
  }
  function çiz(t) {
    const dt = önceki ? Math.min(200, t - önceki) : 16; önceki = t; kare++;
    çaycıAdım(dt, t); gizmoAdım(dt, t);
    for (const k of Object.keys(KADRO)) { ajanAnim(k, t); göz(kişiler[k], t, k.length); }
    göz(gizmoK, t, 2); göz(riskK, t, 5);
    riskAnim(t); uçanAdım(t);
    // çay buharı, kedi kuyruğu, neon titreme, saat
    buharlar.forEach((b, i) => { const f = ((t / 1400) + i / 3) % 1; b.position.set(0.75 + Math.sin(t / 300 + i) * 0.04, 1.32 + f * 0.45, 0.55); b.material.opacity = 0.5 * (1 - f); b.scale.setScalar(0.6 + f); });
    kuyruk.rotation.y = Math.sin(t / 700) * 0.4;
    neonLevha.material.color.setScalar(Math.random() < 0.01 ? 0.55 : 1);
    const şimdi = new Date();
    ibre(akrep, ((şimdi.getHours() % 12) / 12 + şimdi.getMinutes() / 720) * Math.PI * 2, 0.13); ibre(yelkovan, şimdi.getMinutes() / 60 * Math.PI * 2, 0.19);
    // yazıcı
    led.material.color.set(baskı || Math.floor(t / 1000) % 2 ? '#38e07b' : '#1d6b3c');
    if (baskı) {
      const p = Math.min(1, (t - baskı.t0) / 1600);
      baskıKâğıdı.visible = true; baskıKâğıdı.scale.z = 0.1 + p * 0.9; baskıKâğıdı.position.z = KASA.z + 1.65 + p * 0.25;
      if (p >= 1 && t - baskı.t0 > 2200) { baskı = null; baskıKâğıdı.visible = false; fişSayısı = Math.min(fişSayısı + 1, 12); yığınıKur(); }
    }
    if (kare % 240 === 0 && maclar.length) { tvSayfa++; tvDokular.forEach(d => d.yeniden()); }
    kontrol.update();
    renderer.render(sahne, kamera);
    katmanıYerleştir();
  }
  function döngü(t) {
    if (!çalışıyor) return;
    requestAnimationFrame(döngü);
    if (t - son < 30) return;    // ~30 fps yeter, işlemciyi yormasın
    son = t; çiz(t);
  }
  new ResizeObserver(boyutla).observe(root);
  boyutla();

  // ---------- dış API (iso.js ile aynı) ----------
  const api = {
    setKadro(kadro) {
      kadroAdlari = Object.fromEntries(Object.entries(kadro ?? {}).map(([k, x]) => [k, x.ad]));
      for (const k of Object.keys(KADRO)) { etiketYap(k, kadro?.[k]?.ad ?? k); api.setStatus(k, durum[k]?.metin ?? 'masada', durum[k]?.calisiyor); }
    },
    setStatus(k, metin, calisiyor) {
      if (!KADRO[k]) return;
      const ç = calisiyor ?? /\.\.\.$/.test(metin);
      durum[k] = { metin, calisiyor: ç };
      const e = etiketler[k];
      if (e) { e.querySelector('span').textContent = String(metin).replace(/\.\.\.$/, '…'); e.classList.toggle('aktif', !!ç); }
    },
    bubble(k, mesaj) { if (KADRO[k]) kişiBalon(k, mesaj); },
    printTicket() { baskı = { t0: performance.now() }; },
    setTicketCount(n) { fişSayısı = Math.min(n, 12); yığınıKur(); },
    setMatches(m) { maclar = (m ?? []).filter(x => x.oranlar?.some(o => o.bahis === 'Maç Sonucu')); tvDokular.forEach(d => d.yeniden()); },
    riskKarar({ durum: drm, ajan, etiketler: et = [], kupon_id }) {
      if (!RISK_RENK[drm]) return;
      const t0 = performance.now();
      riskDamga = { t0, durum: drm }; mürekkep.material.color.set(RISK_RENK[drm]);
      const ad = kadroAdlari[ajan] ?? ajan ?? '', liste = et.join(', ');
      const mesaj = drm === 'ret' ? `RET! ${ad}${liste ? ': ' + liste : ''}. Geri götür, düzelt!`
        : drm === 'uyari' ? `Geçti ama dikkat ${ad}: ${liste}.` : `Onay ✓ ${ad}${kupon_id ? ' · #' + kupon_id : ''}`;
      kişiBalon('risk-kurulu', mesaj, drm === 'onay' ? 4000 : 7000, `iso-balon-risk iso-balon-risk-${drm}`);
      riskEtiket.querySelector('span').textContent = drm === 'ret' ? 'RET' : drm === 'uyari' ? 'uyarı' : 'onay ✓';
      riskEtiket.dataset.durum = drm; riskEtiket.classList.add('aktif');
      clearTimeout(api._riskZaman); api._riskZaman = setTimeout(() => riskEtiket.classList.remove('aktif'), 6000);
      const m = new THREE.Mesh(uçanGeo, new THREE.MeshLambertMaterial({ color: '#fffbe9', side: THREE.DoubleSide, emissive: RISK_RENK[drm], emissiveIntensity: 0.25 }));
      m.visible = false; sahne.add(m);
      uçanlar.push({ m, t0: t0 + 900, from: new THREE.Vector3(rx + 1.0, MASA_Y + 0.05, rz + 0.95), to: drm === 'onay' ? masaNoktası(null) : masaNoktası(ajan) });
    },
    start() { if (!çalışıyor) { çalışıyor = true; önceki = 0; requestAnimationFrame(döngü); } boyutla(); },
    stop() { çalışıyor = false; },
  };
  requestAnimationFrame(döngü);
  return api;
}
