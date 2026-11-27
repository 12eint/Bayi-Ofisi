// SQLite katmanı – Node'un yerleşik node:sqlite modülü (native derleme gerektirmez)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.BAYI_DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'bayi.db'));
// busy_timeout: bayi sunucusu ve Genel Müdür'ün MCP sunucusu aynı dosyaya yazar; kilitte hemen hata vermek yerine 10 sn bekle.
db.exec(`PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

db.exec(`
CREATE TABLE IF NOT EXISTS bultenler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tarih TEXT NOT NULL,              -- maç günü (YYYY-MM-DD, İstanbul)
  kaynak TEXT NOT NULL,             -- iddaa.com | metin | html | json | demo
  cekilme_zamani TEXT NOT NULL,     -- ISO
  mac_sayisi INTEGER DEFAULT 0,
  hatali_satir_sayisi INTEGER DEFAULT 0,
  not_ TEXT
);
CREATE TABLE IF NOT EXISTS maclar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bulten_id INTEGER NOT NULL REFERENCES bultenler(id) ON DELETE CASCADE,
  mac_kodu TEXT NOT NULL,
  event_id TEXT,
  lig TEXT,
  ev TEXT NOT NULL,
  deplasman TEXT NOT NULL,
  baslama TEXT,                     -- ISO
  saat TEXT,                        -- HH:MM (İstanbul)
  mbs INTEGER,                      -- maçın genel MBS'si (varsa)
  skor_ev INTEGER, skor_dep INTEGER, -- sonuç girildiğinde
  UNIQUE(bulten_id, mac_kodu)
);
CREATE TABLE IF NOT EXISTS oranlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mac_id INTEGER NOT NULL REFERENCES maclar(id) ON DELETE CASCADE,
  bahis TEXT NOT NULL,              -- Maç Sonucu, Alt/Üst 2,5, KG ...
  secim TEXT NOT NULL,              -- 1, X, 2, Üst, Alt, Var, Yok ...
  oran REAL NOT NULL,
  mbs INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_oran_mac ON oranlar(mac_id);
CREATE TABLE IF NOT EXISTS hatali_satirlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bulten_id INTEGER NOT NULL REFERENCES bultenler(id) ON DELETE CASCADE,
  satir TEXT, neden TEXT
);
CREATE TABLE IF NOT EXISTS cekim_kaydi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zaman TEXT NOT NULL, sonuc TEXT NOT NULL, detay TEXT
);
CREATE TABLE IF NOT EXISTS oturumlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baslangic TEXT NOT NULL,
  talimat TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'calisiyor',  -- calisiyor | bitti | hata
  rapor TEXT,
  maliyet_usd REAL,
  sdk_session_id TEXT
);
CREATE TABLE IF NOT EXISTS kuponlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oturum_id INTEGER REFERENCES oturumlar(id),
  bulten_id INTEGER REFERENCES bultenler(id),
  ajan TEXT NOT NULL,
  tarih TEXT NOT NULL,              -- maç günü
  olusturma TEXT NOT NULL,
  tutar REAL NOT NULL,
  toplam_oran REAL NOT NULL,
  olasi_kazanc REAL NOT NULL,
  risk TEXT,
  aciklama TEXT,
  durum TEXT NOT NULL DEFAULT 'aktif',   -- aktif | revize_edildi | iptal
  revize_of INTEGER REFERENCES kuponlar(id),
  puan INTEGER,
  elestiri TEXT,
  degistirilmeli TEXT,              -- JSON maç kodu listesi
  sonuc TEXT                        -- null | kazandi | kaybetti | iade
);
CREATE TABLE IF NOT EXISTS kupon_secimleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kupon_id INTEGER NOT NULL REFERENCES kuponlar(id) ON DELETE CASCADE,
  mac_kodu TEXT NOT NULL,
  mac_adi TEXT,
  lig TEXT,
  saat TEXT,
  bahis TEXT NOT NULL,
  secim TEXT NOT NULL,
  oran REAL NOT NULL,
  mbs INTEGER,
  gerekce TEXT,
  sonuc TEXT                        -- null | tuttu | yatti | iade
);
CREATE TABLE IF NOT EXISTS ayarlar (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sohbet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zaman TEXT NOT NULL, kim TEXT NOT NULL, metin TEXT NOT NULL, oturum_id INTEGER
);
-- Web panelinden Claude Code'daki Genel Müdür'e giden mesajlar
CREATE TABLE IF NOT EXISTS gelen_kutusu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zaman TEXT NOT NULL, metin TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'bekliyor'   -- bekliyor | alindi | cevaplandi
);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
`);

// Sonradan eklenen kolonlar (eski veritabanları için)
function kolonEkle(tablo, kolon, tip) {
  if (!db.prepare(`PRAGMA table_info(${tablo})`).all().some(c => c.name === kolon)) db.exec(`ALTER TABLE ${tablo} ADD COLUMN ${kolon} ${tip}`);
}
kolonEkle('kupon_secimleri', 'model_olasilik', 'REAL');   // Poisson modeline göre tutma olasılığı
kolonEkle('kupon_secimleri', 'piyasa_olasilik', 'REAL');  // marjı çıkarılmış oran olasılığı
kolonEkle('kupon_secimleri', 'deger', 'REAL');            // model × oran − 1
kolonEkle('kuponlar', 'model_olasilik', 'REAL');          // seçimlerin çarpımı (maçlar bağımsız varsayılır)
kolonEkle('kuponlar', 'beklenen_getiri', 'REAL');         // model_olasilik × toplam oran − 1
kolonEkle('kuponlar', 'risk_uyarilari', 'TEXT');          // risk kurulu uyarıları (JSON dizi)
kolonEkle('kuponlar', 'lehte', 'TEXT');                   // Kardeş'in kupon lehine en güçlü argümanı
kolonEkle('kuponlar', 'aleyhte', 'TEXT');                 // ... ve ona cevabı / en büyük risk
kolonEkle('kuponlar', 'taban_ek', 'TEXT');                // taban puan için ESPN ek verisi önbelleği (form, istatistik)
kolonEkle('kuponlar', 'yedekler', 'TEXT');                // Revio'nun değiştirilmeli dediği maçlar için kodun önerdiği yedek seçimler (JSON)
kolonEkle('kuponlar', 'taban_puan', 'INTEGER');            // Hakan Revio'nun puan cetvelinden kodla hesaplanan taban puan
kolonEkle('kupon_secimleri', 'bagimsiz_olasilik', 'REAL');  // ESPN puan durumundan bağımsız güç modeli olasılığı (karne ve çelişki kuralı için)
kolonEkle('maclar', 'iy_ev', 'INTEGER');                 // ilk yarı skoru (ESPN gol dakikalarından ya da elle)
kolonEkle('maclar', 'iy_dep', 'INTEGER');
kolonEkle('maclar', 'gun', 'TEXT');                      // maçın İstanbul günü (YYYY-MM-DD); bülten artık tek güne bağlı değil
{
  const eksik = db.prepare('SELECT m.id, m.baslama, b.tarih FROM maclar m JOIN bultenler b ON b.id = m.bulten_id WHERE m.gun IS NULL').all();
  if (eksik.length) {
    const up = db.prepare('UPDATE maclar SET gun = ? WHERE id = ?');
    db.exec('BEGIN');
    for (const r of eksik) up.run(r.baslama ? istanbulDate(new Date(r.baslama)) : r.tarih, r.id);
    db.exec('COMMIT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS ix_maclar_gun ON maclar(gun, bulten_id)');
}

export const kvGet = (k) => db.prepare('SELECT v FROM kv WHERE k = ?').get(k)?.v ?? null;
export const kvSet = (k, v) => db.prepare('INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v));

/** Claude Code'daki Genel Müdür yakın zamanda gelen kutusuna baktıysa "çevrimiçi" (nöbet aralığı + pay) */
export function gmDurumu(aralikDk = 5) {
  const son = kvGet('gm_nabiz');
  const bekleyen = db.prepare("SELECT COUNT(*) n FROM gelen_kutusu WHERE durum != 'cevaplandi'").get().n;
  return {
    cevrimici: !!son && Date.now() - new Date(son).getTime() < (aralikDk + 3) * 60000,
    son_nabiz: son, bekleyen, aralik_dk: aralikDk,
    butce: butceGuncel(),
  };
}

/** Ayarlardaki abonelik payı (settings.js'i içe aktarmadan; döngüsel bağımlılık olmasın) */
function ayarliPay() {
  try { return JSON.parse(db.prepare("SELECT deger FROM ayarlar WHERE anahtar = 'genel'").get()?.deger ?? '{}').aboneligeSinirYuzde ?? 25; }
  catch { return 25; }
}

/**
 * Son bütçe ölçümünü bugünün gerçeğine göre düzeltir:
 * - 5 saatlik dilimin sıfırlanma saati geçtiyse harcanan 0 sayılır (yeni dilimin ölçümü gelene kadar),
 * - pay ayarı değiştiyse kalan/durum güncel paya göre hesaplanır.
 */
export function butceGuncel(limit = ayarliPay()) {
  const b = JSON.parse(kvGet('butce_durum') ?? 'null');
  if (!b) return null;
  const gecti = !!b.sifirlanma && Date.now() >= new Date(b.sifirlanma).getTime();
  const harcanan = gecti ? 0 : b.harcanan;
  const kalan = Math.round((limit - harcanan) * 10) / 10;
  return {
    ...b, limit, harcanan, kalan,
    durum: kalan <= 0 ? 'DUR' : b.durum === 'YETERSIZ' && !gecti && kalan < b.tur_tahmini ? 'YETERSIZ' : 'DEVAM',
    ...(gecti ? { sifirlandi: true, dilim_doluluk: null, sifirlanma: null, tur_baslangic: null } : {}),
  };
}

/**
 * Abonelik bütçesi: 5 saatlik dilimde bu sistemin kullanabileceği pay (puan).
 * Dilimin başında (ya da ilk ölçümde) taban alınır; o andan sonraki TÜM artış sisteme yazılır (temkinli).
 * @param {number} yuzde   5 saatlik dilimin şu anki doluluk yüzdesi
 * @param {string} sifirlanma dilimin sıfırlanma zamanı (ISO)
 * @param {'kontrol'|'tur_basla'|'tur_bitti'} asama
 */
export function butceKontrol({ yuzde, sifirlanma, asama = 'kontrol', limit = 25, varsayilanTur = 8 }) {
  let pencere = JSON.parse(kvGet('butce_pencere') ?? 'null');
  const yeniDilim = !pencere || Math.abs(new Date(pencere.sifirlanma).getTime() - new Date(sifirlanma).getTime()) > 10 * 60000;
  if (yeniDilim) pencere = { sifirlanma, taban: yuzde, turBaslangic: null };
  const turTahmini = Number(kvGet('tur_tahmini') ?? varsayilanTur);
  if (asama === 'tur_basla') pencere.turBaslangic = yuzde;
  if (asama === 'tur_bitti' && pencere.turBaslangic != null) {
    const fark = Math.max(0, yuzde - pencere.turBaslangic);
    kvSet('tur_tahmini', Math.round((turTahmini + fark) / 2 * 10) / 10 || fark);   // basit ortalama
    pencere.turBaslangic = null;
  }
  kvSet('butce_pencere', JSON.stringify(pencere));
  const harcanan = Math.max(0, yuzde - pencere.taban);
  const kalan = Math.round((limit - harcanan) * 10) / 10;
  const durum = kalan <= 0 ? 'DUR' : (asama === 'tur_basla' && kalan < turTahmini ? 'YETERSIZ' : 'DEVAM');
  const sonuc = { durum, limit, harcanan, kalan, dilim_doluluk: yuzde, taban: pencere.taban, sifirlanma: pencere.sifirlanma, tur_tahmini: Number(kvGet('tur_tahmini') ?? varsayilanTur), guncelleme: new Date().toISOString() };
  kvSet('butce_durum', JSON.stringify(sonuc));
  kvSet('butce_son_kontrol', sonuc.guncelleme);
  return sonuc;
}

/**
 * Komut satırı (panelden tetiklenen) modu: yalnızca Genel Müdür ÇALIŞIRKEN artan yüzde sisteme yazılır.
 * Senin başka Claude kullanımın bu sistemin payından düşmez.
 * @param {number} yuzde  şu anki 5 saatlik dilim doluluğu
 * @param {number} ilk    bu çalışmada görülen ilk doluluk
 */
export function sistemPayiOlc({ yuzde, ilk, sifirlanma, limit = 25 }) {
  let p = JSON.parse(kvGet('sistem_pay') ?? 'null');
  if (!p || Math.abs(new Date(p.sifirlanma).getTime() - new Date(sifirlanma).getTime()) > 10 * 60000) p = { sifirlanma, biriken: 0, bu: 0 };
  p.bu = Math.max(0, yuzde - ilk);
  kvSet('sistem_pay', JSON.stringify(p));
  return payDurumuYaz({ harcanan: Math.round((p.biriken + p.bu) * 10) / 10, limit, yuzde, sifirlanma });
}
/** Çalışma bitince o çalışmanın harcamasını biriktir */
export function sistemCalismaBitti() {
  const p = JSON.parse(kvGet('sistem_pay') ?? 'null'); if (!p) return;
  p.biriken = Math.round((p.biriken + p.bu) * 10) / 10; p.bu = 0;
  kvSet('sistem_pay', JSON.stringify(p));
}
function payDurumuYaz({ harcanan, limit, yuzde, sifirlanma, asama = 'kontrol' }) {
  const onceki = JSON.parse(kvGet('butce_durum') ?? 'null');
  const turTahmini = Number(kvGet('tur_tahmini') ?? 8);
  const kalan = Math.round((limit - harcanan) * 10) / 10;
  const durum = kalan <= 0 ? 'DUR' : (asama === 'tur_basla' && kalan < turTahmini ? 'YETERSIZ' : 'DEVAM');
  const sonuc = { durum, limit, harcanan, kalan, dilim_doluluk: yuzde, sifirlanma, tur_tahmini: turTahmini, guncelleme: new Date().toISOString(), tur_baslangic: onceki?.tur_baslangic ?? null };
  kvSet('butce_durum', JSON.stringify(sonuc)); kvSet('butce_son_kontrol', sonuc.guncelleme);
  return sonuc;
}
/** Genel Müdür'ün parametresiz bütçe sorgusu (son ölçüm + kupon turu tahmini) */
export function payDurumuSor({ asama = 'kontrol', limit = ayarliPay() } = {}) {
  const s = butceGuncel(limit); if (!s) return null;
  if (s.sifirlandi) kvSet('sistem_pay', 'null');   // eski dilimin birikimi yeni dilime taşınmasın
  if (asama === 'tur_basla') { s.tur_baslangic = s.harcanan; kvSet('butce_durum', JSON.stringify(s)); }
  if (asama === 'tur_bitti' && s.tur_baslangic != null) {
    const fark = Math.max(0, s.harcanan - s.tur_baslangic);
    const eski = Number(kvGet('tur_tahmini') ?? 8);
    kvSet('tur_tahmini', Math.round(((eski + fark) / 2) * 10) / 10);
    s.tur_baslangic = null; kvSet('butce_durum', JSON.stringify(s));
  }
  return payDurumuYaz({ harcanan: s.harcanan, limit, yuzde: s.dilim_doluluk, sifirlanma: s.sifirlanma, asama });
}

/** Bütçe son ölçüme göre dolmuş mu (ve dilim henüz sıfırlanmadı mı)? */
export function butceDolu() {
  const b = butceGuncel();
  return b?.durum === 'DUR' ? b : null;
}

export const nowIso = () => new Date().toISOString();

/** İstanbul saat diliminde YYYY-MM-DD */
export function istanbulDate(d = new Date(), addDays = 0) {
  const x = new Date(d.getTime() + addDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
}
export function istanbulTime(d) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
export const tomorrow = () => istanbulDate(new Date(), 1);

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
