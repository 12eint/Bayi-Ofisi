// Arayüzden değiştirilebilen ayarlar (SQLite 'ayarlar' tablosunda JSON olarak tutulur)
import { db } from './db.js';

export const DEFAULT_SETTINGS = {
  gunlukButce: 500,              // TL – o günün tüm aktif kuponlarının toplamı aşamaz
  tekMacMinOran: 1.20,
  tekMacMaxOran: 15.00,
  mbsKurali: true,               // kupondaki maç sayısı >= her seçimin MBS değeri
  ligDahil: [],                  // boşsa tüm ligler
  ligHaric: [],
  bultenMaxYasSaat: 12,          // bundan eski bülten "bayat" sayılır
  cekimMinAralikDk: 120,         // iddaa.com'a iki çekim arası en az
  cekimGunlukLimit: 4,
  model: 'claude-opus-5-5',
  ofisModu: 'otomatik',          // otomatik | canli | demo (demo: API anahtarsız kural tabanlı deneme ofisi)
  oturumButceUsd: 5,             // tek bir ofis oturumunun Claude API harcama tavanı
  aboneligeSinirYuzde: 25,       // Claude aboneliğinin 5 saatlik diliminden bu sistemin kullanabileceği en fazla pay (puan)
  nobetAralikDk: 5,              // Genel Müdür'ün gelen kutusuna bakma aralığı
  // Maç detayı: program sayfasında olmayan pazarlar (ör. "1. Yarı ve 2. Yarıda Karşılıklı Gol Olur") için her çekimde
  // modele göre en uygun aday maçların detayı okunur. Siteye yük bindirmemek için az maç ve istekler arası bekleme.
  // Token tasarrufu (Ayarlar'dan geri alınabilir): alt ajanların modeli ve aday paketi/kısa maç detayı.
  // Eski davranış: ajanModeli.varsayilan = 'inherit' (Harambe ile aynı model), tokenTasarrufu.aktif = false.
  ajanModeli: { varsayilan: 'sonnet' },
  tokenTasarrufu: { aktif: true, adaySayisi: 15 },
  // Spor Toto: haftalık 15 maç, sistemli kolon önerisi. Tutar = kolon × kolon ücreti; maxTutar'ı aşan öneri kaydedilmez.
  sporToto: { aktif: true, maxTutar: 500, kolonUcreti: 10 },
  detayCekim: { aktif: true, macSayisi: 15, aralikMs: 1500 },
  // Risk kurulu: kupon kaydedilmeden önce KODLA yapılan ek denetim (ajan çağrısı yok, abonelik harcamaz).
  // Değer = model olasılığı × oran − 1. iddaa'da seçim başına tipik değer ≈ −%13 (bayi marjı).
  riskKurulu: {
    aktif: true,
    kotuDeger: -0.20,            // bu değerin altındaki seçim "kötü" sayılır (iki yarı tahminli bahisler hariç)
    maxKotuSecim: 1,             // kuponda en fazla bu kadar kötü seçim olabilir (fazlası ret, tam bu kadarı uyarı)
    retOrtalamaDeger: -0.18,     // seçim başına ortalama değer bunun altındaysa ret
    uyariOrtalamaDeger: -0.15,   // ... bunun altındaysa uyarı
    ligYogunluk: 0.75,           // 3+ maçlı kuponda bir lig maçların bu oranından fazlasıysa uyarı (Avrupa kupası gecelerinde yarı yarıya olağan)
    celiskiUyari: 0.10,          // oran modeli bağımsız modelden (ESPN) bu kadar puan yüksekse uyarı
    celiskiRet: 0.15,            // ... bu kadar yüksekse ret (iki kaynak da onaylamayan seçim kupona girmez)
    maxAyniMac: 3,               // aynı maç-aynı seçim o günün aktif kuponlarında en fazla bu kadar kez (fazlası ret)
  },
  ajanlar: {
    // yalnizcaVerili: yalnızca bağımsız verisi (ESPN puan durumu) olan maçlar
    'yasli-dayi':    { aktif: true, minOran: 2.0,  maxOran: 5.0,   minMac: 2, maxMac: 4,  tutar: 100, kuponSayisi: 2, yalnizcaVerili: true },
    'hizli-genc':    { aktif: true, minOran: 300,  maxOran: 800,   minMac: 6, maxMac: 14, tutar: 100, kuponSayisi: 1 },
    'beyaz-hayalci': { aktif: true, minOran: 20,   maxOran: 50,    minMac: 3, maxMac: 7,  tutar: 100, kuponSayisi: 2, yalnizcaVerili: true },
    // Yalnızca '1. Yarı ve 2. Yarıda Karşılıklı Gol Olur: Evet / Evet' oynar (MBS 2 → en az 2 maç; tek maç oranı gollü maçta ~6-9, kısır maçta 25+)
    // Yalnızca Alt/Üst; istatistik (gol, şut, ceza sahası içi şut) ESPN'den → yalnızca verili maçlar
    'alt-ustcu':     { aktif: true, minOran: 2,    maxOran: 8,     minMac: 2, maxMac: 4,  tutar: 100, kuponSayisi: 2, yalnizcaVerili: true },
    'inatci-eniste': { aktif: true, minOran: 30,   maxOran: 1000,  minMac: 2, maxMac: 3,  tutar: 100, kuponSayisi: 2 },
  },
};

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}

export function getSettings() {
  const row = db.prepare('SELECT deger FROM ayarlar WHERE anahtar = ?').get('genel');
  return merge(DEFAULT_SETTINGS, row ? JSON.parse(row.deger) : {});
}

export function saveSettings(patch) {
  const next = merge(getSettings(), patch);
  // basit doğrulama
  for (const [name, a] of Object.entries(next.ajanlar)) {
    if (!(a.minOran >= 1 && a.maxOran >= a.minOran)) throw new Error(`${name}: oran aralığı geçersiz`);
    if (!(a.minMac >= 1 && a.maxMac >= a.minMac)) throw new Error(`${name}: maç sayısı aralığı geçersiz`);
    if (!(a.tutar > 0)) throw new Error(`${name}: tutar pozitif olmalı`);
  }
  if (!(next.tekMacMaxOran >= next.tekMacMinOran)) throw new Error('Tek maç oran aralığı geçersiz');
  if (!(next.gunlukButce > 0)) throw new Error('Günlük bütçe pozitif olmalı');
  if (!(next.sporToto?.maxTutar > 0 && next.sporToto?.kolonUcreti > 0)) throw new Error('Spor Toto tutar sınırı ve kolon ücreti pozitif olmalı');
  if (next.sporToto.maxTutar < next.sporToto.kolonUcreti) throw new Error('Spor Toto tutar sınırı en az bir kolon ücreti kadar olmalı');
  if (!(next.aboneligeSinirYuzde > 0 && next.aboneligeSinirYuzde <= 100)) throw new Error('Abonelik payı 1-100 arası olmalı');
  db.prepare('INSERT INTO ayarlar(anahtar, deger) VALUES(?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger')
    .run('genel', JSON.stringify(next));
  return next;
}
