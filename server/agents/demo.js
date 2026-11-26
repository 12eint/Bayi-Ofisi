// "Deneme ofisi": API anahtarı olmadan aynı araç zincirini (kural motoru, DB, olaylar) kural tabanlı seçimlerle çalıştırır.
// Amaç arayüzü ve kuralları test etmektir; gerçek analiz yapmaz ve bunu raporunda açıkça söyler.
import { tomorrow, istanbulDate } from '../db.js';
import { getSettings } from '../settings.js';
import { gunBulteni, listMatches, varsayilanGun } from '../bulletin/store.js';
import { refreshBulletin } from '../bulletin/index.js';
import { buildHandlers } from './handlers.js';
import { listCoupons, getCoupon } from './rules.js';
import { emit } from '../events.js';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const say = (h, ajan, mesaj) => h.ofiste_konus.run({ ajan, mesaj });

const PROFIL = {
  'yasli-dayi': { bahisler: ['Çifte Şans', 'Maç Sonucu', 'Alt/Üst 1.5'], min: 1.25, max: 1.75, risk: 'düşük',
    sozler: ['Hey gidi günler... Favoriden şaşma evladım, gerisi Allah kerim.', 'Acele işe şeytan karışır yavrum. Bizim zamanımızda böyle kupon mu yazılırdı, ah ah.'] },
  'beyaz-hayalci': { bahisler: ['Maç Sonucu', 'Karşılıklı Gol', 'Alt/Üst 2.5'], min: 1.55, max: 2.40, risk: 'orta',
    sozler: ['Abicim bi düşünsene yaaa, bu tutarsa anneme bulaşık makinesi alıcam.', 'İçimde bi his var, inşallah bu sefer... Hayal etmesi bedava abicim.'] },
  'hizli-genc': { bahisler: ['Maç Sonucu', 'Karşılıklı Gol', 'Alt/Üst 2.5', 'Alt/Üst 3.5'], min: 1.9, max: 4.2, risk: 'çok yüksek',
    sozler: ['Aga bak yazıyorum buraya, kasa dönüyo! Gelirse mahalleye kahve benden.', 'Kanka sürpriz yoksa heyecan da yok, yatarsa yatsın reis!'] },
};

function candidates(bultenId, gun, ajan, talimat, settings, used) {
  const p = PROFIL[ajan];
  const lo = (s) => s.toLocaleLowerCase('tr-TR');
  const kelimeler = lo(talimat).split(/[^a-zçğıöşü0-9]+/i).filter(w => w.length > 3 && !['için', 'yarın', 'kuponları', 'hazırla', 'ağırlıklı', 'olsun', 'bugün'].includes(w));
  const ligVurgu = kelimeler.find(w => listMatches(bultenId, { gun }).some(m => lo(m.lig).includes(w.slice(0, 6))))?.slice(0, 6);
  const now = Date.now() + 10 * 60000;
  const rows = listMatches(bultenId, { gun, ligler: settings.ligDahil, haricLigler: settings.ligHaric })
    .filter(m => !m.baslama || new Date(m.baslama).getTime() > now);
  const out = [];
  for (const m of rows) {
    if (used.has(m.mac_kodu)) continue;
    const opts = m.oranlar.filter(o => p.bahisler.includes(o.bahis) && o.oran >= Math.max(p.min, settings.tekMacMinOran) && o.oran <= Math.min(p.max, settings.tekMacMaxOran));
    if (!opts.length) continue;
    opts.sort((a, b) => ajan === 'yasli-dayi' ? a.oran - b.oran : b.oran - a.oran);
    const o = ajan === 'hizli-genc' ? opts[Math.floor(Math.random() * opts.length)] : opts[0];
    const bonus = ligVurgu && m.lig.toLocaleLowerCase('tr-TR').includes(ligVurgu.toLocaleLowerCase('tr-TR')) ? -100 : 0;
    out.push({ m, o, skor: bonus + (ajan === 'yasli-dayi' ? o.oran : Math.random()) });
  }
  return out.sort((a, b) => a.skor - b.skor);
}

/** Aralığa uyan bir seçim seti kur (açgözlü + MBS'ye saygılı) */
function buildSlip(cands, a) {
  const picks = []; let prod = 1;
  for (const c of cands) {
    if (picks.length >= a.maxMac) break;
    const next = prod * c.o.oran;
    if (next > a.maxOran) continue;
    picks.push(c); prod = next;
    const maxMbs = Math.max(...picks.map(p => p.o.mbs || 1));
    if (picks.length >= a.minMac && prod >= a.minOran && picks.length >= maxMbs) break;
  }
  return picks;
}

function gerekce(ajan, c) {
  const { o, m } = c;
  const ihtimal = Math.round(100 / o.oran);
  if (ajan === 'yasli-dayi') return `${o.oran} oran, piyasanın ima ettiği ihtimal ~%${ihtimal}. Favori tarafta kalmak ${m.lig} için mantıklı. (Deneme modu: form verisi kullanılmadı)`;
  if (ajan === 'hizli-genc') return `Oran ${o.oran}, ~%${ihtimal} ihtimal ama kasa bunu sever. (Deneme modu: kural tabanlı seçim)`;
  return `${o.oran} oranla dengeli bir seçim (~%${ihtimal}). (Deneme modu: kural tabanlı seçim)`;
}

async function agentWork(h, ajan, talimat, settings, bulten, revizeKupon = null) {
  const a = settings.ajanlar[ajan];
  emit('ajan_durum', { ajan, durum: revizeKupon ? 'kuponu revize ediyor...' : 'kupon yazıyor...', calisiyor: true });
  await say(h, ajan, PROFIL[ajan].sozler[revizeKupon ? 1 : 0]);
  await wait(900);
  const used = new Set();
  // diğer aktif kuponlardaki maçları bu ajan kendi kuponları arasında tekrar etmesin
  const adet = revizeKupon ? 1 : a.kuponSayisi;
  const sonuc = [];
  for (let i = 0; i < adet; i++) {
    let ok = false;
    for (let deneme = 0; deneme < 6 && !ok; deneme++) {
      const blocked = new Set([...used, ...(revizeKupon?.degistirilmeli ?? [])]);
      const picks = buildSlip(candidates(bulten.id, bulten.gun, ajan, talimat, settings, blocked), a);
      if (picks.length < a.minMac) break;
      const r = await h.kupon_teklif_et.run({
        ajan, risk: PROFIL[ajan].risk, tarih: bulten.gun,
        aciklama: revizeKupon ? `Kardeş'in işaretlediği maçları çıkardım.` : PROFIL[ajan].sozler[0],
        secimler: picks.map(c => ({ mac_kodu: c.m.mac_kodu, bahis: c.o.bahis, secim: c.o.secim, gerekce: gerekce(ajan, c) })),
        revize_edilen_kupon_id: revizeKupon?.id,
      });
      if (!r.isError) { ok = true; picks.forEach(c => used.add(c.m.mac_kodu)); sonuc.push(r.text); }
      else { picks.slice(-1).forEach(c => used.add(c.m.mac_kodu)); sonuc.push(r.text); }
      await wait(400);
    }
  }
  emit('ajan_durum', { ajan, durum: 'işini bitirdi', calisiyor: false });
  return sonuc;
}

async function critic(h, oturumId) {
  emit('ajan_durum', { ajan: 'cok-bilen-kardes', durum: 'eleştiriyor...', calisiyor: true });
  await say(h, 'cok-bilen-kardes', 'Yeğen bak şimdi, getir şu kuponları. Ben bu işleri bilirim, otur bi dinle.');
  for (const k of listCoupons({ oturumId }).filter(k => k.puan == null)) {
    await wait(500);
    const zayif = [...k.secimler].sort((a, b) => b.oran - a.oran)[0];
    const ayniLig = k.secimler.length - new Set(k.secimler.map(s => s.lig)).size;
    const hedef = { 'yasli-dayi': 7, 'beyaz-hayalci': 6, 'hizli-genc': 4 }[k.ajan] ?? 5;
    const puan = Math.max(1, Math.min(10, hedef - (ayniLig > 1 ? 1 : 0) - (zayif.oran > 3 ? 2 : 0) + (k.revize_of ? 1 : 0)));
    const isaret = puan < 5 ? [zayif.mac_kodu] : [];
    await h.kupon_puanla.run({
      kupon_id: k.id, puan, degistirilmeli: isaret,
      lehte: `En düşük oranlı seçim ${[...k.secimler].sort((a, b) => a.oran - b.oran)[0].oran}; kuponun omurgası favorilerden.`,
      aleyhte: `Ama ${zayif.mac_kodu} @ ${zayif.oran} tek başına kuponu yakabilir.` + (k.risk_uyarilari?.length ? ` Risk kurulu da uyarmış: ${k.risk_uyarilari[0]}.` : ''),
      elestiri: `Zayıf halka ${zayif.mac_kodu} (${zayif.mac_adi}, ${zayif.oran}): ima edilen ihtimal ~%${Math.round(100 / zayif.oran)}.` +
        (ayniLig > 1 ? ` Aynı ligden ${ayniLig + 1} seçim var, sonuçlar birbirine bağımlı olabilir.` : '') +
        ` (Deneme modu: puan kural tabanlıdır, gerçek analiz değildir.)`,
    });
  }
  await say(h, 'cok-bilen-kardes', 'Ben söyleyeceğimi söyledim, sonra ben demedi deme.');
  emit('ajan_durum', { ajan: 'cok-bilen-kardes', durum: 'işini bitirdi', calisiyor: false });
}

export async function runDemoOffice(talimat, { oturumId, log = () => {} }) {
  const settings = getSettings();
  const h = buildHandlers({ oturumId, emit });
  emit('ajan_durum', { ajan: 'genel-mudur', durum: 'bülteni kontrol ediyor...', calisiyor: true });
  await say(h, 'genel-mudur', 'Tamam patron, bülteni kontrol ediyorum. (Deneme ofisi: API anahtarı yok, kural tabanlı çalışıyoruz.)');
  // Hedef gün talimattan: "bugün/bu akşam" → bugün, "yarın" → yarın, yoksa varsayılan gün
  const lo = talimat.toLocaleLowerCase('tr-TR');
  const gun = /yarın/.test(lo) ? tomorrow() : /bugün|bu akşam|bu gece/.test(lo) ? istanbulDate() : varsayilanGun();
  let bulten = gunBulteni(gun);
  if (!bulten) {
    const r = await refreshBulletin({ tarih: gun });
    bulten = r.ok ? gunBulteni(gun) : null;
    if (!bulten) {
      return `**${gun} için bülten yok, iş durdu.**\n\n${r.hata ?? r.uyari ?? ''}\n\nO günün bültenini "Bülteni Yükle" alanından yükle, sonra tekrar söyle patron.`;
    }
  }
  bulten = { ...bulten, gun, mac_sayisi: listMatches(bulten.id, { gun }).length };
  log(`${gun} – çekim #${bulten.id}: ${bulten.mac_sayisi} maç`);
  const aktifAjanlar = Object.entries(settings.ajanlar).filter(([, a]) => a.aktif).map(([k]) => k);
  emit('ajan_durum', { ajan: 'genel-mudur', durum: 'işi dağıttı, bekliyor...', calisiyor: true });
  await Promise.all(aktifAjanlar.map(k => agentWork(h, k, talimat, settings, bulten)));
  await critic(h, oturumId);

  // Bir tur revize
  const dusuk = listCoupons({ oturumId }).filter(k => k.puan != null && (k.puan < 5 || k.degistirilmeli.length));
  if (dusuk.length) {
    await say(h, 'genel-mudur', `${dusuk.length} kupon revizyona gidiyor.`);
    await Promise.all(dusuk.map(k => agentWork(h, k.ajan, talimat, settings, bulten, k)));
    await critic(h, oturumId);
  }
  emit('ajan_durum', { ajan: 'genel-mudur', durum: 'rapor yazıyor...', calisiyor: true });
  const ks = listCoupons({ oturumId });
  const toplam = ks.reduce((x, k) => x + k.tutar, 0);
  const rows = ks.map(k => `| #${k.id} | ${k.ajan} | ${k.secimler.length} | ${k.toplam_oran} | ${k.tutar} TL | ${k.olasi_kazanc} TL | ${k.risk ?? '-'} | ${k.puan ?? '-'}/10 |`);
  return `**Final rapor (DENEME OFİSİ)** – ${bulten.gun} maçları, ${bulten.mac_sayisi} maç.\n\n` +
    `| Fiş | Ajan | Maç | Oran | Tutar | Olası kazanç | Risk | Puan |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n` +
    `Toplam: ${toplam} TL / günlük bütçe ${settings.gunlukButce} TL.\n\n` +
    `Not: Bu tur API anahtarı olmadan kural tabanlı deneme modunda yapıldı; seçimler gerçek analiz değildir. Gerçek ofis için .env'e ANTHROPIC_API_KEY ekle.\n\n` +
    `_Bunlar öneridir; bahis risk içerir, bütçeyi aşma._`;
}
