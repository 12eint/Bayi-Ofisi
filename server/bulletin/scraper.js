// iddaa.com bülten okuyucu (Playwright, headless).
// Kurallar: giriş yok, hesap yok, kupon sepetine dokunma yok, hız limiti, CAPTCHA'da DUR.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { db, nowIso, istanbulDate, DATA_DIR } from '../db.js';
import { getSettings } from '../settings.js';

export const BULTEN_URL = 'https://www.iddaa.com/program/futbol';

export class BotKorumasiHatasi extends Error {
  constructor(msg) { super(msg); this.name = 'BotKorumasiHatasi'; this.yedekYontem = true; }
}
export class HizLimitiHatasi extends Error {
  constructor(msg) { super(msg); this.name = 'HizLimitiHatasi'; }
}

function logAttempt(sonuc, detay = '') {
  db.prepare('INSERT INTO cekim_kaydi(zaman, sonuc, detay) VALUES(?,?,?)').run(nowIso(), sonuc, String(detay).slice(0, 500));
}

/** Son iddaa çekimi (cekim kaydı ile en yakın bülten) hedef günü içeriyor mu? İçermiyorsa başka günün çekimidir. */
const FARKLI_GUN_ARALIK_DK = 15;
function sonCekimGunuIceriyor(targetDate) {
  const son = db.prepare("SELECT id FROM bultenler WHERE kaynak LIKE 'iddaa.com%' ORDER BY id DESC LIMIT 1").get();
  if (!son) return false;
  return !!db.prepare('SELECT 1 FROM maclar WHERE bulten_id = ? AND gun = ? LIMIT 1').get(son.id, targetDate);
}

/**
 * Siteye yük bindirmemek için: iki çekim arası min aralık + günlük limit.
 * Son çekim hedef günü getirmediyse (ör. yarını çektin, şimdi bugün lazım) kısa aralık yeter.
 */
export function checkRateLimit(settings = getSettings(), targetDate = null) {
  const today = istanbulDate();
  const rows = db.prepare("SELECT zaman, sonuc FROM cekim_kaydi WHERE sonuc != 'engellendi-limit' ORDER BY id DESC LIMIT 50").all();
  const todays = rows.filter(r => istanbulDate(new Date(r.zaman)) === today);
  if (todays.length >= settings.cekimGunlukLimit) {
    throw new HizLimitiHatasi(`Bugün ${todays.length} kez çekim yapıldı (limit ${settings.cekimGunlukLimit}). Yarın tekrar dene ya da "Bülteni Yükle" yöntemini kullan.`);
  }
  if (rows[0]) {
    const diffMin = (Date.now() - new Date(rows[0].zaman).getTime()) / 60000;
    const farkliGun = rows[0].sonuc === 'basarili' && targetDate && !sonCekimGunuIceriyor(targetDate);
    const aralik = farkliGun ? Math.min(FARKLI_GUN_ARALIK_DK, settings.cekimMinAralikDk) : settings.cekimMinAralikDk;
    if (diffMin < aralik) {
      const kalan = Math.ceil(aralik - diffMin);
      throw new HizLimitiHatasi(`Son çekimden bu yana ${Math.floor(diffMin)} dk geçti. Siteye yük bindirmemek için ${kalan} dk daha beklenmeli.`
        + (farkliGun ? ` (Son çekim ${targetDate} gününü getirmediği için kısa bekleme uygulanıyor.)` : ''));
    }
  }
}

const CAPTCHA_SIGNS = [
  /captcha/i, /hcaptcha/i, /recaptcha/i, /turnstile/i, /cf-challenge/i, /challenge-platform/i,
  /just a moment/i, /checking your browser/i, /access denied/i, /robot olmad/i, /bot olmad/i,
  /güvenlik doğrulama/i, /request blocked/i, /attention required/i,
];

// Not: iddaa.com giriş formunda görünmez bir reCAPTCHA iframe'i her zaman yüklü; bu tek başına
// engel değildir. Bülten içeriği görünmüyorsa VE bir koruma işareti varsa engel kabul edilir.
async function detectBotProtection(page, mainStatus, hasEventData = false) {
  if (mainStatus === 403 || mainStatus === 429 || mainStatus === 503) return `Sunucu ${mainStatus} döndü`;
  const title = await page.title().catch(() => '');
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 20000) || '').catch(() => '');
  const bultenGorunuyor = hasEventData || /Maç Sonucu/i.test(bodyText) || /\b\d{1,2}\.\d{2}\b[\s\S]{0,40}\b\d{1,2}\.\d{2}\b/.test(bodyText);
  // Tam sayfa challenge / görünür captcha kutusu
  const visibleChallenge = await page.locator('iframe[src*="challenge"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[src*="recaptcha/api2/bframe"]:visible, #challenge-form, .cf-browser-verification')
    .count().catch(() => 0);
  if (visibleChallenge && !bultenGorunuyor) return 'Görünür doğrulama (CAPTCHA) kutusu';
  for (const re of CAPTCHA_SIGNS) {
    if (re.test(title)) return `Bot koruması işareti (başlık): ${re}`;
    if (!bultenGorunuyor && re.test(bodyText)) return `Bot koruması işareti (sayfa): ${re}`;
  }
  if (!bultenGorunuyor && bodyText.length < 500) return 'Sayfa boş geldi (olası bot koruması)';
  return null;
}

/**
 * Sayfayı normal bir ziyaretçi gibi yükler. Sayfanın kendi yüklediği JSON yanıtlarını dinler,
 * ertesi günün sekmesini seçmeyi dener ve ham veriyi döndürür.
 * @returns {{ jsonResponses: {url:string, body:any}[], html: string, domText: string, snapshotDir?: string }}
 */
export async function loadBulletinPage({ targetDate, saveSnapshot = false, skipRateLimit = false, timeoutMs = 45000 } = {}) {
  if (!skipRateLimit) checkRateLimit(getSettings(), targetDate);
  const browser = await chromium.launch({ headless: true });
  const jsonResponses = [];
  try {
    const context = await browser.newContext({
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    // Sepet / giriş / ödeme uçlarına hiçbir istek gitmesin
    await page.route(/(login|signin|kupon-oyna|coupon\/play|basket|sepet|payment|odeme)/i, r => r.abort());

    page.on('response', async (res) => {
      const url = res.url();
      const ct = res.headers()['content-type'] || '';
      if (!/iddaa\.com/.test(url) || !ct.includes('json')) return;
      try { jsonResponses.push({ url, body: await res.json() }); } catch { /* gövdesiz yanıt */ }
    });

    const resp = await page.goto(BULTEN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if ([403, 429, 503].includes(resp?.status())) {
      const s = `Sunucu ${resp.status()} döndü`; logAttempt('bot-korumasi', s); throw new BotKorumasiHatasi(s);
    }

    // Oranların yüklenmesini bekle: maç öncesi event JSON'u gelene kadar
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (jsonResponses.some(r => looksLikeEvents(r.body) && !/live=true/.test(r.url))) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(2500); // geç gelen yanıtlar için kısa ek bekleme

    // Hedef günün sekmesini seçmeyi dene; sayfanın yüklediği tüm günlerin maçları kaydedilir
    if (targetDate) await trySelectDate(page, targetDate);

    const botSign2 = await detectBotProtection(page, 200, jsonResponses.some(r => looksLikeEvents(r.body)));
    if (botSign2) { logAttempt('bot-korumasi', botSign2); throw new BotKorumasiHatasi(botSign2); }

    const html = await page.content();
    const domText = await page.evaluate(() => document.body?.innerText || '');
    let snapshotDir;
    if (saveSnapshot) {
      snapshotDir = path.join(DATA_DIR, 'snapshots', new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(snapshotDir, { recursive: true });
      fs.writeFileSync(path.join(snapshotDir, 'page.html'), html);
      fs.writeFileSync(path.join(snapshotDir, 'page.txt'), domText);
      fs.writeFileSync(path.join(snapshotDir, 'responses.json'), JSON.stringify(jsonResponses, null, 1));
      await page.screenshot({ path: path.join(snapshotDir, 'screenshot.png'), fullPage: false }).catch(() => {});
    }
    logAttempt('basarili', `${jsonResponses.length} JSON yanıtı`);
    return { jsonResponses, html, domText, snapshotDir };
  } catch (e) {
    if (!(e instanceof BotKorumasiHatasi)) logAttempt('hata', e.message);
    throw e;
  } finally {
    await browser.close();
  }
}

export function looksLikeEvents(body) {
  const ev = body?.data?.events ?? body?.events;
  return Array.isArray(ev) && ev.length > 0;
}

async function trySelectDate(page, targetDate) {
  const [y, m, d] = targetDate.split('-');
  const bugun = istanbulDate();
  if (targetDate === bugun) return false;   // sayfa zaten bugünü açar; diğer günler de JSON'da geliyorsa kaydedilir
  const candidates = [
    `${d}.${m}.${y}`, `${d}.${m}`, `${Number(d)} ${trMonth(Number(m))}`,
    new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'Europe/Istanbul' }).format(new Date(`${targetDate}T12:00:00+03:00`)),
    ...(targetDate === istanbulDate(new Date(), 1) ? ['Yarın'] : []),
  ];
  for (const text of candidates) {
    const loc = page.getByText(text, { exact: false }).first();
    try {
      if (await loc.isVisible({ timeout: 500 })) {
        await loc.click({ timeout: 2000 });
        await page.waitForTimeout(2500);
        return true;
      }
    } catch { /* sıradaki aday */ }
  }
  return false;
}
const trMonth = (m) => ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][m - 1];
