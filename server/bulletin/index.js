// Bülten modülünün dış yüzü: iddaa.com'dan çek veya yedek yöntemle yükle.
// Çekim sayfada gelen TÜM günlerin maçlarını kaydeder; "tarih" yalnızca açılmaya çalışılan gün sekmesidir.
import { istanbulDate } from '../db.js';
import { loadBulletinPage, BotKorumasiHatasi, HizLimitiHatasi } from './scraper.js';
import { parseApiResponses } from './parseApi.js';
import { parseHtml, parseUpload } from './parseText.js';
import { saveBulletin, bulletinStatus, varsayilanGun } from './store.js';

let running = null;

const gunSayilari = (matches) => {
  const g = {};
  for (const m of matches) { const d = m.baslama ? istanbulDate(new Date(m.baslama)) : '?'; g[d] = (g[d] ?? 0) + 1; }
  return g;
};

export async function refreshBulletin({ tarih = varsayilanGun(), force = false } = {}) {
  if (running) return running;                 // aynı anda iki çekim yok
  running = (async () => {
    try {
      const page = await loadBulletinPage({ targetDate: tarih, skipRateLimit: force });
      let r = parseApiResponses(page.jsonResponses, null);
      let kaynak = 'iddaa.com';
      if (!r.matches.length) {                   // JSON yakalanamadıysa sayfadan oku (sayfa yalnızca açık günü gösterir)
        const h = parseHtml(page.html, tarih);
        if (h.matches.length) { r = h; kaynak = 'iddaa.com (sayfa)'; }
      }
      if (!r.matches.length) {
        return { ok: false, hata: `Bültenden maç okunamadı. Sayfa yapısı değişmiş olabilir. "Bülteni Yükle" ile yedek yöntemi kullan.`, yedekYontem: true };
      }
      const id = saveBulletin({ tarih, kaynak, matches: r.matches, errors: r.errors });
      const gunler = gunSayilari(r.matches);
      const hedef = gunler[tarih] ?? 0;
      return {
        ok: true, bulten_id: id, mac_sayisi: r.matches.length, hatali: r.errors.length, gunler,
        hedef_gun: tarih, hedef_gun_mac: hedef,
        uyari: hedef ? null : `${tarih} için maç gelmedi (bülten o gün için henüz açılmamış olabilir). Gelen günler: ${Object.keys(gunler).join(', ')}.`,
        durum: bulletinStatus(tarih),
      };
    } catch (e) {
      if (e instanceof BotKorumasiHatasi) {
        return { ok: false, hata: `Bot koruması/CAPTCHA algılandı (${e.message}). Aşmaya çalışılmadı, işlem durduruldu. Lütfen "Bülteni Yükle" yedek yöntemini kullan.`, yedekYontem: true };
      }
      if (e instanceof HizLimitiHatasi) return { ok: false, hata: e.message, hizLimiti: true, yedekYontem: true };
      return { ok: false, hata: `Bülten çekilemedi: ${e.message}. "Bülteni Yükle" yedek yöntemini kullanabilirsin.`, yedekYontem: true };
    } finally { running = null; }
  })();
  return running;
}

/** Yedek yöntem. tarih: gün bilgisi olmayan satırlar (düz metin) için varsayılan gün. JSON yüklemesinde tüm günler alınır. */
export function importBulletin(content, tarih = varsayilanGun()) {
  const r = parseUpload(content, tarih);
  if (!r.matches.length) {
    return { ok: false, hata: `Okunabilen maç bulunamadı.`, hatalar: r.errors.slice(0, 50), atlanan: r.skipped };
  }
  const id = saveBulletin({ tarih, kaynak: r.kaynak, matches: r.matches, errors: r.errors, not_: r.not_ });
  return { ok: true, bulten_id: id, kaynak: r.kaynak, mac_sayisi: r.matches.length, gunler: gunSayilari(r.matches), hatali: r.errors.length, atlanan: r.skipped, durum: bulletinStatus(tarih) };
}
