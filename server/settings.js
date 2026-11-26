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
  // Risk kurulu: kupon kaydedilmeden önce KODLA yapılan ek denetim (ajan çağrısı yok, abonelik harcamaz).
  // Değer = model olasılığı × oran − 1. iddaa'da seçim başına tipik değer ≈ −%13 (bayi marjı).
  riskKurulu: {
    aktif: true,
    kotuDeger: -0.20,            // bu değerin altındaki seçim "kötü" sayılır (iki yarı tahminli bahisler hariç)
    maxKotuSecim: 1,             // kuponda en fazla bu kadar kötü seçim olabilir (fazlası ret, tam bu kadarı uyarı)
    retOrtalamaDeger: -0.18,     // seçim başına ortalama değer bunun altındaysa ret
    uyariOrtalamaDeger: -0.15,   // ... bunun altındaysa uyarı
    ligYogunluk: 0.75,           // 3+ maçlı kuponda bir lig maçların bu oranından fazlasıysa uyarı (Avrupa kupası gecelerinde yarı yarıya olağan)
    maxAyniMac: 3,               // aynı maç-aynı seçim o günün aktif kuponlarında en fazla bu kadar kez (fazlası ret)
  },
  ajanlar: {
    'yasli-dayi':    { aktif: true, minOran: 2.0,  maxOran: 5.0,   minMac: 2, maxMac: 4,  tutar: 100, kuponSayisi: 2 },
    'hizli-genc':    { aktif: true, minOran: 300,  maxOran: 800,   minMac: 6, maxMac: 14, tutar: 100, kuponSayisi: 1 },
    'beyaz-hayalci': { aktif: true, minOran: 20,   maxOran: 50,    minMac: 3, maxMac: 7,  tutar: 100, kuponSayisi: 2 },
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
  if (!(next.aboneligeSinirYuzde > 0 && next.aboneligeSinirYuzde <= 100)) throw new Error('Abonelik payı 1-100 arası olmalı');
  db.prepare('INSERT INTO ayarlar(anahtar, deger) VALUES(?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger')
    .run('genel', JSON.stringify(next));
  return next;
}
