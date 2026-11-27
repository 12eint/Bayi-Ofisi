// Ofis araçlarının iş mantığı (SDK'dan bağımsız düz fonksiyonlar).
// Hem Agent SDK süreç-içi MCP sunucusu, hem stdio MCP sunucusu (Claude Code terminali), hem demo ofis bunları kullanır.
import { z } from 'zod';
import { db, tomorrow, istanbulDate, kvSet, kvGet, nowIso, butceKontrol, butceDolu, payDurumuSor } from '../db.js';
import { getSettings } from '../settings.js';
import { bulletinStatus, gunBulteni, listMatches, varsayilanGun, bultenGunleri } from '../bulletin/store.js';
import { refreshBulletin } from '../bulletin/index.js';
import { detaylariCek, IKI_YARI_KG } from '../bulletin/detay.js';
import { espnLig, takimFormu } from '../veri/espn.js';
import { tutmaKarnesiYazi } from '../stats.js';
import { tabanPuan, tabanYazi, revioKarnesi, PUAN_ESNEKLIK } from './puan.js';
import { totoProgrami, totoAnaliz, totoAnalizYazi, totoDogrula, totoKaydet, totoKuponlari, totoKuponYazi } from '../toto.js';
import { bagimsizModel, bagimsizYazi, bagimsizHarita } from '../veri/bagimsiz.js';
import { validateCoupon, saveCoupon, listCoupons, couponText, getCoupon, dailyTotal } from './rules.js';
import { AGENTS, KUPON_AJANLARI } from './definitions.js';
import { macModeliGetir, secimModeli, lambdaYazi, yuzde, degerYazi } from '../model/index.js';
import { emit as defaultEmit } from '../events.js';

const detayYazi = (d) => d.hata ? `Maç detayı okunamadı: ${d.hata}`
  : `Maç detayı: ${d.denenen} aday maç denendi, ${d.okunan} maçın detayı okundu, ${d.eklenen_oran} yeni oran eklendi; ${d.iki_yari_kg} maçta "${IKI_YARI_KG}: Evet / Evet" oranı var.` + (d.durdu ? ` DURDU: ${d.durdu}` : '');

const POPULER = [/^Maç Sonucu$/, /^Çifte Şans$/, /^Alt\/Üst (1\.5|2\.5|3\.5)$/, /^Karşılıklı Gol$/, /^1\. Yarı Sonucu$/, /^Handikaplı Maç Sonucu/];
const KISA = { 'Maç Sonucu': 'MS', 'Çifte Şans': 'ÇŞ', 'Karşılıklı Gol': 'KG', '1. Yarı Sonucu': 'İY' };
const kisalt = (b) => KISA[b] ?? b.replace('Alt/Üst ', 'AÜ').replace('Handikaplı Maç Sonucu', 'HMS');

const formCache = new Map();
const text = (s, isError = false) => ({ text: s, isError });

export const AJAN_ENUM = [...Object.keys(AGENTS), 'genel-mudur'];
export const KUPON_AJAN_ENUM = KUPON_AJANLARI;

// Hedef gün: patron hangi günü istediyse o. Verilmezse bugün (başlamamış maç varsa), yoksa bültendeki sonraki gün.
const hedefTarih = (tarih) => tarih || varsayilanGun();
// Risk kurulu mesajlarından sahnedeki balon için kısa etiketler
const RISK_ETIKET = [[/seçimin model değeri|Kötü değerli/, 'kötü seçim'], [/ortalama (model )?değer/i, 'değer düşük'],
  [/Lig yoğunluğu/, 'tek lig'], [/kuponda olabilir/, 'aynı maç çok kuponda'], [/Diğer kuponlarla ortak/, 'ortak maç'], [/çelişiyor/, 'iki model çelişiyor']];
const riskEtiketleri = (mesajlar) => [...new Set(mesajlar.flatMap(m => RISK_ETIKET.filter(([re]) => re.test(m)).map(([, e]) => e)))];
/** Günün maçlarını içeren en son çekim */
const hedefBulten = (tarih) => gunBulteni(hedefTarih(tarih));
const TARIH = z.string().optional().describe('YYYY-MM-DD maç günü – patron hangi günü istediyse (bugün, yarın, cumartesi…). Verilmezse: bugün başlamamış maç varsa bugün, yoksa bültendeki sonraki gün.');
const gunAdi = (g) => {
  const bugun = istanbulDate();
  if (g === bugun) return 'bugün';
  if (g === istanbulDate(new Date(), 1)) return 'yarın';
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'Europe/Istanbul' }).format(new Date(`${g}T12:00:00+03:00`));
};
const gunlerYazi = () => bultenGunleri().map(g => `${g.gun} (${gunAdi(g.gun)}): ${g.baslamamis}/${g.mac_sayisi} maç başlamadı, çekim #${g.bulten_id}`).join('; ') || 'bültende bugünden sonrası için maç yok';

/** Araç şemaları (zod raw shape) + açıklamalar + işleyiciler. ctx: { oturumId, emit } */
export function buildHandlers(ctx = {}) {
  const emit = ctx.emit ?? defaultEmit;
  const oid = () => ctx.oturumId ?? null;

  return {
    ayarlari_oku: {
      desc: 'Güncel ofis ayarlarını (ajan aralıkları, tek maç oran aralığı, MBS kuralı, lig filtreleri, günlük bütçe) döndürür.',
      shape: {},
      readOnly: true,
      run: async () => {
        const s = getSettings();
        const g = hedefTarih();
        return text(JSON.stringify({ ...s, model: undefined, bugun: istanbulDate(), yarin: tomorrow(), varsayilanGun: g, gunlukHarcanan: { [g]: dailyTotal(g) }, bultenGunleri: gunlerYazi() }, null, 1));
      },
    },

    bulten_durumu: {
      desc: 'Bir maç gününün bülten durumunu verir: o günün maçları hangi çekimde, ne zaman çekildi, kaç maç (kaçı başlamadı), lig dağılımı. Bültendeki diğer günleri de listeler.',
      shape: { tarih: TARIH },
      readOnly: true,
      run: async ({ tarih }) => {
        const t = hedefTarih(tarih);
        const st = bulletinStatus(t);
        const diger = `\nBültendeki günler: ${gunlerYazi()}`;
        if (!st.var) return text(`${t} (${gunAdi(t)}) için bültende maç YOK. bulteni_cek ile tarih "${t}" vererek çek.${diger}`);
        const s = getSettings();
        return text(`${t} (${gunAdi(t)}) | çekim #${st.id} | kaynak ${st.kaynak} | çekilme ${st.cekilme_zamani} (${st.yas_saat} saat önce${st.yas_saat > s.bultenMaxYasSaat ? ' – BAYAT' : ''}) | ${st.mac_sayisi} maç, ${st.baslamamis} tanesi başlamadı` +
          (st.baslamamis ? '' : ' – KUPONA UYGUN MAÇ KALMADI') +
          `
İki yarıda KG (Evet / Evet) oranı olan başlamamış maç: ${db.prepare("SELECT COUNT(DISTINCT m.id) n FROM maclar m JOIN oranlar o ON o.mac_id = m.id WHERE m.bulten_id = ? AND m.gun = ? AND o.bahis = ? AND o.secim = 'Evet / Evet' AND (m.baslama IS NULL OR m.baslama > ?)").get(st.id, t, IKI_YARI_KG, new Date().toISOString()).n} (yoksa bulten_detay_cek)` +
          `\nLigler: ${st.ligler.slice(0, 40).map(l => `${l.lig} (${l.n})`).join(', ')}` + (st.not ? `\nNot: ${st.not}` : '') + diger);
      },
    },

    bulteni_cek: {
      desc: 'iddaa.com bültenini Playwright ile yeniden çeker (hız limitli; bot koruması görülürse durur). Sayfada gelen TÜM günlerin maçları kaydedilir; tarih verilen günün sekmesi ayrıca açılmaya çalışılır. Sadece o günün maçı yoksa veya bayatsa kullan.',
      shape: { tarih: TARIH },
      run: async ({ tarih }) => {
        emit('ajan_durum', { ajan: 'genel-mudur', durum: 'bülten çekiliyor...' });
        const r = await refreshBulletin({ tarih: hedefTarih(tarih) });
        emit('bulten', { sonuc: r });
        if (!r.ok) return text(`ÇEKİM BAŞARISIZ: ${r.hata}`, true);
        return text(`Bülten çekildi (#${r.bulten_id}): ${r.mac_sayisi} maç, ${r.hatali} hatalı satır. Günlere göre: ${Object.entries(r.gunler).map(([g, n]) => `${g} ${n}`).join(', ')}.` +
          (r.detay ? `\n${detayYazi(r.detay)}` : '') + (r.uyari ? `\nUYARI: ${r.uyari}` : ''), !r.hedef_gun_mac);
      },
    },

    bulten_detay_cek: {
      desc: 'Genel Müdür içindir: bülten zaten tazeyse (yeniden çekim gerekmiyorsa) ama "1. Yarı ve 2. Yarıda Karşılıklı Gol Olur" gibi detay pazarları eksikse, modele göre en uygun aday maçların detayını iddaa\'dan okur. Aynı gün için saatte en fazla bir kez.',
      shape: { tarih: TARIH },
      run: async ({ tarih }) => {
        const gun = hedefTarih(tarih);
        const b = gunBulteni(gun);
        if (!b) return text(`${gun} için bültende maç yok. Önce bulteni_cek.`, true);
        const anahtar = `detay_son_${gun}`; const son = kvGet(anahtar);
        if (son && Date.now() - new Date(son).getTime() < 60 * 60000) return text(`${gun} için detay ${Math.round((Date.now() - new Date(son).getTime()) / 60000)} dk önce okundu; saatte en fazla bir kez okunur (siteye yük bindirmemek için).`, true);
        kvSet(anahtar, nowIso());
        emit('ajan_durum', { ajan: 'genel-mudur', durum: 'maç detayları okunuyor...' });
        const r = await detaylariCek({ bultenId: b.id, gun });
        emit('bulten', { sonuc: { ok: true, detay: r } });
        return text(detayYazi(r), !!r.durdu && !r.okunan);
      },
    },

    bulten_listele: {
      desc: 'Bültendeki maçları kompakt listeler: "kod | saat | lig | ev - dep | MBS | bahis seçim:oran ...". Varsayılan olarak popüler bahisler (MS, ÇŞ, AÜ1.5/2.5/3.5, KG, İY, handikap) gösterilir; ayarlardaki lig filtreleri uygulanır.',
      shape: {
        lig: z.string().optional().describe('Lig adında geçen metin, örn. "Premier", "Süper Lig"'),
        bahis: z.string().optional().describe('Sadece bu bahis türü (adında geçen metin), örn. "Maç Sonucu"'),
        min_oran: z.number().optional(), max_oran: z.number().optional(),
        tum_bahisler: z.boolean().optional().describe('true ise tüm bahis türleri (uzun çıktı)'),
        limit: z.number().int().optional().describe('En fazla maç sayısı (varsayılan 60)'),
        tarih: TARIH,
      },
      readOnly: true,
      run: async (a) => {
        const gun = hedefTarih(a.tarih);
        const b = gunBulteni(gun);
        if (!b) return text(`${gun} için bültende maç yok. Önce bülten çekilmeli/yüklenmeli.`, true);
        const s = getSettings();
        const rows = listMatches(b.id, { gun, lig: a.lig, bahis: a.bahis, minOran: a.min_oran, maxOran: a.max_oran, ligler: s.ligDahil, haricLigler: s.ligHaric, limit: a.limit ?? 60, baslamamisSonra: Date.now() + 5 * 60000 });
        const lines = rows.map(m => {
          let oranlar = m.oranlar;
          if (!a.tum_bahisler && !a.bahis) oranlar = oranlar.filter(o => POPULER.some(re => re.test(o.bahis)));
          const grp = {};
          for (const o of oranlar) (grp[o.bahis] ??= []).push(`${o.secim}:${o.oran}`);
          const mbs = Math.max(...m.oranlar.map(o => o.mbs || 1));
          return `${m.mac_kodu} | ${m.saat} | ${m.lig} | ${m.ev} - ${m.deplasman} | MBS ${m.mbs ?? mbs} | ${lambdaYazi(m.id)} | ` +
            Object.entries(grp).map(([k, v]) => `${a.tum_bahisler || a.bahis ? k : kisalt(k)} ${v.join(' ')}`).join(' ; ');
        });
        return text(`${gun} (${gunAdi(gun)}) – çekim #${b.id} – ${lines.length} maç. Kısaltmalar: MS=Maç Sonucu, ÇŞ=Çifte Şans, AÜx=Alt/Üst x, KG=Karşılıklı Gol, İY=1. Yarı Sonucu, HMS=Handikaplı Maç Sonucu. λ ev-dep = modelin beklenen golü. Teklifte TAM bahis adını kullan.\n` + lines.join('\n'));
      },
    },

    mac_detay: {
      desc: 'Bir maçın bültendeki TÜM bahis türlerini ve oranlarını (MBS ile) verir.',
      shape: { mac_kodu: z.string(), tarih: TARIH },
      readOnly: true,
      run: async ({ mac_kodu, tarih }) => {
        const gun = hedefTarih(tarih);
        const b = gunBulteni(gun);
        if (!b) return text(`${gun} için bültende maç yok.`, true);
        const [m] = listMatches(b.id, { gun, kodlar: [mac_kodu] });
        if (!m) {
          const baska = db.prepare('SELECT gun FROM maclar WHERE mac_kodu = ? AND gun >= ? ORDER BY bulten_id DESC LIMIT 1').get(String(mac_kodu), istanbulDate());
          return text(`${mac_kodu} ${gun} bülteninde yok.${baska ? ` Bu kod ${baska.gun} gününde var; o güne kupon yapılıyorsa tarih "${baska.gun}" ver.` : ''}`, true);
        }
        const grp = {};
        for (const o of m.oranlar) {
          const md = secimModeli(m.id, o.bahis, o.secim, o.oran);
          (grp[o.bahis] ??= []).push(`${o.secim}:${o.oran}${o.mbs > 1 ? `(MBS${o.mbs})` : ''}${md.model != null ? ` [${yuzde(md.model)} ${degerYazi(md.deger)}${md.yaklasik ? ' ~' : ''}]` : ''}`);
        }
        const { model } = macModeliGetir(m.id);
        const ozet = model ? `Model: λ ev ${model.lh} / dep ${model.la}, beraberlik düzeltmesi ${model.delta}, ilk yarı gol payı ${model.ilkYariPayi}. [olasılık değer] = model tutma olasılığı ve olasılık×oran−1; "~" = iki yarıya bağlı bahis, model burada yaklaşık.` : 'Model kurulamadı (MS oranı eksik).';
        let bag = '';
        try { const bm = await bagimsizModel(m); bag = bm ? `\n${bagimsizYazi(bm)}` : (espnLig(m.lig) ? '\nBağımsız model: takımlar ESPN puan durumunda eşleşmedi.' : ''); } catch { /* ESPN'e ulaşılamadı */ }
        return text(`${m.mac_kodu} | ${m.saat} | ${m.lig} | ${m.ev} - ${m.deplasman}\n${ozet}${bag}\n` + Object.entries(grp).map(([k, v]) => `${k}: ${v.join('  ')}`).join('\n'));
      },
    },

    toto_programi: {
      desc: 'Spor Totocu içindir: haftanın Spor Toto programı (15 maç), halkın oynama yüzdeleri, iddaa MS oranı ve oran modeli, ESPN bağımsız modeli; kolon ücreti ve tutar sınırı.',
      shape: {},
      readOnly: true,
      run: async () => {
        try {
          const p = await totoProgrami();
          return text(totoAnalizYazi(p, await totoAnaliz(p)));
        } catch (e) { return text(`Spor Toto programı okunamadı: ${e.message}`, true); }
      },
    },

    toto_teklif_et: {
      desc: 'Spor Totocu içindir: 15 maçın HEPSİ için tahmin gönderir (secim: "1", "0", "2" ya da sistemli "10", "12", "02", "102"). Sistem kolon sayısını ve tutarı hesaplar; tutar sınırını aşarsa kaydetmez. Revize için revize_edilen_toto_id ver.',
      shape: {
        ajan: z.literal('spor-totocu'),
        secimler: z.array(z.object({ no: z.number().int().min(1).max(15), secim: z.string().describe('"1", "0", "2", "10", "12", "02" ya da "102"'), gerekce: z.string() })).min(1),
        risk: z.string().optional(), aciklama: z.string().describe('1-2 cümle, kendi ağzınla'),
        revize_edilen_toto_id: z.number().int().optional(),
      },
      run: async (p) => {
        let program;
        try { program = await totoProgrami(); } catch (e) { return text(`Spor Toto programı okunamadı: ${e.message}`, true); }
        const v = totoDogrula(p, { program, analiz: await totoAnaliz(program) });
        if (!v.ok) { emit('ajan_durum', { ajan: 'spor-totocu', durum: 'kolon reddedildi, düzeltiyor...' }); return text(`REDDEDİLDİ:\n- ${v.hatalar.join('\n- ')}`, true); }
        const id = totoKaydet(v.kupon, { oturumId: oid() });
        const k = totoKuponlari({ donem: program.donem }).find(x => x.id === id);
        emit('toto', { kupon: k, oturum_id: oid() });
        emit('ajan_durum', { ajan: 'spor-totocu', durum: `toto #${id} teslim edildi` });
        return text(`KABUL: ${totoKuponYazi(k)}`);
      },
    },

    toto_kuponlari: {
      desc: 'Bu haftanın (ya da verilen dönemin) Spor Toto önerilerini listeler: kolon, tutar, tahminler ve biten maçların sonuçları.',
      shape: { donem: z.number().int().optional() },
      readOnly: true,
      run: async ({ donem }) => {
        let d = donem; if (!d) { try { d = (await totoProgrami()).donem; } catch { /* son dönem */ } }
        const ks = totoKuponlari({ donem: d });
        return text(ks.length ? ks.map(totoKuponYazi).join('\n\n') : `${d ?? 'Bu'} dönem için Spor Toto önerisi yok.`);
      },
    },

    revio_karnesi: {
      desc: 'Hakan Revio içindir: kendi geçmişin – verdiğin puanların dağılımı, puana göre tutan kupon sayısı ve "değiştirilmeli" işaretlediğin maçların tutma oranı. Puanlamaya başlamadan önce bir kez çağır.',
      shape: {},
      readOnly: true,
      run: async () => text(revioKarnesi()),
    },

    tutma_karnesi: {
      desc: 'Harambe içindir: sonuçlanan seçimlerde modellerin tahmini ile gerçek tutma oranını ajan, bahis türü ve olasılık dilimine göre verir; oran modeli ile bağımsız modelin isabetini (Brier) kıyaslar. Patron sorarsa ya da raporda performans değerlendirmesi gerekirse kullan.',
      shape: {},
      readOnly: true,
      run: async () => text(tutmaKarnesiYazi()),
    },

    takim_formu: {
      desc: 'Takım formu (ESPN): mac_kodu verirsen o maçın İKİ takımının son 6 maçı (skor, iç/dış saha, puan durumu) ve oranlardan bağımsız güç modeli gelir. Yalnızca takim verirsen lig (bültendeki lig adı) de ver. ESPN\'de olmayan liglerde veri yoktur; o zaman gerekçeni oranlara dayandır ve bunu söyle.',
      shape: { mac_kodu: z.string().optional(), takim: z.string().optional(), lig: z.string().optional().describe('Bültendeki lig adı, ör. "İngiltere Premier Lig"'), tarih: TARIH },
      readOnly: true,
      run: async ({ mac_kodu, takim, lig, tarih }) => text(await takimFormuYazi({ mac_kodu, takim, lig, gun: hedefTarih(tarih) })),
    },

    kupon_teklif_et: {
      desc: 'Kupon teklif eder. Oran yazma; sistem oranı bültenden okur ve tüm kuralları (aralık, MBS, lig, bütçe) kontrol eder. Uygun değilse kaydetmez ve nedenini döner. Revize için revize_edilen_kupon_id ver.',
      shape: {
        ajan: z.enum(KUPON_AJAN_ENUM).describe('Senin kimliğin'),
        secimler: z.array(z.object({
          mac_kodu: z.string(), bahis: z.string().describe('Tam bahis adı, örn. "Maç Sonucu"'),
          secim: z.string().describe('örn. "1", "0", "2", "Üst", "Var", "1 ve 0"'), gerekce: z.string().describe('Kısa gerekçe'),
        })).min(1),
        risk: z.string().describe('düşük / orta / yüksek / çok yüksek'),
        aciklama: z.string().describe('Kuponun 1-2 cümlelik özeti, kendi konuşma tarzınla'),
        revize_edilen_kupon_id: z.number().int().optional(),
        tarih: TARIH,
      },
      run: async (p) => {
        const s = getSettings();
        // Revizyonda tarih verilmezse eski kuponun günü kullanılır
        const eski = !p.tarih && p.revize_edilen_kupon_id ? getCoupon(p.revize_edilen_kupon_id) : null;
        const gun = p.tarih || eski?.tarih || hedefTarih();
        const bulten = gunBulteni(gun);
        const maclar = bulten ? listMatches(bulten.id, { gun, kodlar: (p.secimler ?? []).map(x => String(x.mac_kodu)) }) : [];
        const bagimsiz = await bagimsizHarita(maclar);   // ESPN puan durumu önbellekte; çelişki ve "yalnızca verili" kuralları için
        const v = validateCoupon(p, { bulten, gun, settings: s, oturumId: oid(), bagimsiz });
        if (!v.ok) {
          emit('ajan_durum', { ajan: p.ajan, durum: 'kupon reddedildi, düzeltiyor...' });
          const riskRet = v.hatalar.filter(h => h.startsWith('Nikah Dairesi'));
          if (riskRet.length) emit('risk', { ajan: p.ajan, durum: 'ret', etiketler: riskEtiketleri(riskRet) });
          return text(`REDDEDİLDİ:\n- ${v.hatalar.join('\n- ')}`, true);
        }
        const id = saveCoupon(v.kupon, { oturumId: oid(), risk: p.risk, aciklama: p.aciklama });
        const k = getCoupon(id);
        emit('risk', { ajan: p.ajan, durum: k.risk_uyarilari.length ? 'uyari' : 'onay', kupon_id: id, etiketler: riskEtiketleri(k.risk_uyarilari) });
        emit('kupon', { kupon: k, oturum_id: oid() });
        emit('ajan_durum', { ajan: p.ajan, durum: `kupon #${id} teslim edildi` });
        return text(`KABUL: Kupon #${id} kaydedildi. Toplam oran ${k.toplam_oran}, ${k.tutar} TL → olası ${k.olasi_kazanc} TL.` + (k.revize_of ? ` (#${k.revize_of} yerine)` : '') +
          (k.model_olasilik != null ? `\nModel: tutma olasılığı ${yuzde(k.model_olasilik, 2)}, beklenen getiri ${degerYazi(k.beklenen_getiri)}.` : '') +
          `\nSeçimler: ${k.secimler.map(s => `${s.mac_kodu} ${yuzde(s.model_olasilik)} ${degerYazi(s.deger)}`).join(' · ')}` +
          (k.risk_uyarilari.length ? `\nNikah Dairesi uyarıları (kupon kabul edildi; istersen revize et): ${k.risk_uyarilari.join(' · ')}` : ''));
      },
    },

    deger_listesi: {
      desc: 'Bültendeki seçimleri model DEĞERİNE göre sıralar (değer = model olasılığı × oran − 1; en az negatif / pozitif olanlar üstte). Oran aralığı ve bahis/lig filtresi verilebilir. Kupon seçerken aday bulmak için kullan.',
      shape: {
        min_oran: z.number().optional(), max_oran: z.number().optional(),
        bahis: z.string().optional().describe('Bahis adında geçen metin, örn. "Maç Sonucu", "Alt/Üst"'),
        lig: z.string().optional(),
        limit: z.number().int().optional().describe('Varsayılan 30'),
        verili_ligler: z.boolean().optional().describe('true ise yalnızca bağımsız verisi (ESPN) olabilecek liglerin maçları (Öz23 ve 07 Mal Ahmet için)'),
        yaklasiklar: z.boolean().optional().describe('true ise iki yarıya bağlı bileşik bahisler de (2. Yarı Sonucu, İY/MS, Hangi Yarıda…) listelenir; model bunlarda yaklaşıktır'),
        tarih: TARIH,
      },
      readOnly: true,
      run: async (a) => {
        const gun = hedefTarih(a.tarih);
        const b = gunBulteni(gun);
        if (!b) return text(`${gun} için bültende maç yok.`, true);
        const s = getSettings();
        const minO = a.min_oran ?? s.tekMacMinOran, maxO = a.max_oran ?? s.tekMacMaxOran;
        const rows = listMatches(b.id, { gun, lig: a.lig, bahis: a.bahis, minOran: minO, maxOran: maxO, ligler: s.ligDahil, haricLigler: s.ligHaric, baslamamisSonra: Date.now() + 5 * 60000 })
          .filter(m => !a.verili_ligler || espnLig(m.lig));
        const aday = [];
        for (const m of rows) for (const o of m.oranlar) {
          const md = secimModeli(m.id, o.bahis, o.secim, o.oran);
          if (md.deger == null || (md.yaklasik && !a.yaklasiklar)) continue;
          aday.push({ m, o, md });
        }
        aday.sort((x, y) => y.md.deger - x.md.deger);
        const lim = a.limit ?? 30;
        const lines = aday.slice(0, lim).map(({ m, o, md }) =>
          `${m.mac_kodu} | ${m.saat} | ${m.ev} - ${m.deplasman} (${m.lig}) | MBS ${o.mbs ?? m.mbs ?? 1} | ${o.bahis}: ${o.secim} @ ${o.oran} | model ${yuzde(md.model)} | piyasa ${yuzde(md.piyasa)} | değer ${degerYazi(md.deger)}`);
        return text(`${gun} (${gunAdi(gun)}) – çekim #${b.id} – ${aday.length} modellenebilir seçim, ilk ${Math.min(lim, aday.length)} (oran ${minO}-${maxO}). ` +
          'Not: model yalnızca bülten oranlarından kurulur; iddaa marjı yüzünden değerlerin çoğu negatiftir, önemli olan karşılaştırmadır.\n' + lines.join('\n'));
      },
    },

    kuponlari_getir: {
      desc: 'Bu oturumun (yoksa hedef günün) aktif kuponlarını seçimler, oranlar, gerekçeler ve varsa puan/eleştiri ile listeler.',
      shape: { ajan: z.string().optional(), tarih: TARIH },
      readOnly: true,
      run: async ({ ajan, tarih }) => {
        let ks = oid() && !tarih ? listCoupons({ oturumId: oid(), ajan }) : [];
        if (!ks.length) ks = listCoupons({ tarih: hedefTarih(tarih), ajan });
        if (!ks.length) return text('Aktif kupon yok.');
        const s = getSettings();
        const gunler = [...new Set(ks.map(k => k.tarih))];
        return text(ks.map(k => `[${k.tarih}] ` + couponText(k) + `\n  ${tabanYazi(tabanPuan(k))}`).join('\n\n') + `\n\nGünlük toplam: ${gunler.map(g => `${g}: ${dailyTotal(g)}`).join(', ')} / ${s.gunlukButce} TL`);
      },
    },

    kupon_puanla: {
      desc: 'Çok Bilen Kardeş içindir: bir kupona önce lehte/aleyhte tartışmayı (lehte: kuponun en güçlü savunması, aleyhte: ona cevap ve en büyük risk), sonra 1-10 puan, değiştirilmesi gereken maç kodları ve eleştiri yazar.',
      shape: {
        kupon_id: z.number().int(),
        lehte: z.string().describe('Kuponun lehine EN GÜÇLÜ argüman, 1-2 cümle, veriye dayalı (savunma avukatı gibi)'),
        aleyhte: z.string().describe('Lehteki argümana cevap ve kuponu yakabilecek en büyük risk, 1-2 cümle'),
        puan: z.number().int().min(1).max(10),
        degistirilmeli: z.array(z.string()).describe('Zayıf halka maç kodları (boş olabilir)'),
        elestiri: z.string().describe('2-4 cümle, veriye dayalı; tartışmanın hükmü'),
      },
      run: async ({ kupon_id, lehte, aleyhte, puan, degistirilmeli, elestiri }) => {
        const k = getCoupon(kupon_id);
        if (!k) return text(`#${kupon_id} bulunamadı.`, true);
        if (k.durum !== 'aktif') return text(`#${kupon_id} aktif değil (${k.durum}).`, true);
        // Puan cetveli: taban puan kodla hesaplanır, Revio en fazla ±2 oynatabilir
        const t = tabanPuan(k);
        if (Math.abs(puan - t.puan) > PUAN_ESNEKLIK) {
          return text(`#${kupon_id} için puan ${puan} kabul edilmedi. ${tabanYazi(t)}. Taban puandan sapman en fazla ${PUAN_ESNEKLIK}; daha fazlası gerekiyorsa gerekçeni eleştiriye yaz ve sınırdaki puanı ver.`, true);
        }
        const gecerli = degistirilmeli.filter(c => k.secimler.some(s => s.mac_kodu === String(c)));
        db.prepare('UPDATE kuponlar SET puan = ?, taban_puan = ?, elestiri = ?, degistirilmeli = ?, lehte = ?, aleyhte = ? WHERE id = ?')
          .run(puan, t.puan, elestiri, JSON.stringify(gecerli), lehte ?? null, aleyhte ?? null, kupon_id);
        emit('puan', { kupon: getCoupon(kupon_id), oturum_id: oid() });
        emit('ajan_durum', { ajan: 'cok-bilen-kardes', durum: `#${kupon_id} → ${puan}/10` });
        return text(`#${kupon_id} puanlandı: ${puan}/10.`);
      },
    },

    gelen_mesajlari_al: {
      desc: 'Genel Müdür içindir: patronun bayi ekranındaki sohbet panelinden yazdığı, henüz cevaplanmamış mesajları getirir (ve "çevrimiçiyim" nabzı atar). Boşsa "YOK" döner.',
      shape: {},
      run: async () => {
        kvSet('gm_nabiz', nowIso());
        const rows = db.prepare("SELECT id, zaman, metin FROM gelen_kutusu WHERE durum = 'bekliyor' ORDER BY id").all();
        const dolu = butceDolu();
        const sonKontrol = kvGet('butce_son_kontrol');
        const kontrolZamani = !sonKontrol || Date.now() - new Date(sonKontrol).getTime() > 30 * 60000;
        if (!rows.length) return text(kontrolZamani && !dolu ? 'YOK – BÜTÇE KONTROLÜ ZAMANI' : 'YOK');
        if (dolu) {
          // Bütçe doluyken mesajlar sırada kalır; yalnızca bir kez bilgi verilir
          if (kvGet('butce_bildirildi') !== dolu.sifirlanma) {
            kvSet('butce_bildirildi', dolu.sifirlanma);
            return text(`BÜTÇE DOLU: bu 5 saatlik dilimde ayrılan %${dolu.limit} pay kullanıldı. ${rows.length} mesaj sırada. ` +
              `İŞ YAPMA. Yalnızca cevap_yaz ile (mesaj_id vermeden) patrona şunu bildir: pay doldu, ${dolu.sifirlanma} sonrasında mesajlarına bakılacak. Sonra turu bitir.`);
          }
          return text('YOK');
        }
        db.prepare(`UPDATE gelen_kutusu SET durum = 'alindi' WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map(r => r.id));
        emit('ajan_durum', { ajan: 'genel-mudur', durum: 'patronun mesajını okuyor...', calisiyor: true });
        return text(rows.map(r => `[mesaj_id ${r.id}] ${r.zaman}: ${r.metin}`).join('\n') +
          '\n\nÖNCE bütçeyi ölç (get_usage → butce_kontrol). DEVAM ise her mesajı patronun talimatı say ve gereğini yap; kupon turu başlatacaksan butce_kontrol(asama: "tur_basla") çağır, YETERSIZ/DUR derse turu başlatma ve patrona söyle. ' +
          'Cevabını cevap_yaz ile (mesaj_id vererek) bayi ekranına yaz; kupon turu yaptıysan butce_kontrol(asama: "tur_bitti") sonra final raporu rapor_kaydet ile (mesaj_id vererek) kaydet.');
      },
    },

    butce_kontrol: {
      desc: 'Genel Müdür içindir: Claude aboneliğinin 5 saatlik dilim doluluğunu (mcp__ccd_session_mgmt__get_usage → plan.windows içindeki "5-hour limit": percentUsed ve resetsAt) kaydeder ve bu sistemin payını (Ayarlar → abonelik payı) aşıp aşmadığını söyler. DEVAM / YETERSIZ / DUR döner.',
      shape: {
        yuzde: z.number().optional().describe('5-hour limit percentUsed; verilmezse sistemin son ölçümü kullanılır'),
        sifirlanma: z.string().optional().describe('5-hour limit resetsAt (ISO); verilmezse son ölçüm'),
        asama: z.enum(['kontrol', 'tur_basla', 'tur_bitti']).optional().describe('kupon turundan önce tur_basla, sonra tur_bitti'),
      },
      run: async ({ yuzde, sifirlanma, asama }) => {
        const s = getSettings();
        let b;
        if (yuzde == null || !sifirlanma) {   // panelden tetiklenen mod: sistem kendisi ölçüyor
          b = payDurumuSor({ asama: asama ?? 'kontrol', limit: s.aboneligeSinirYuzde });
          if (!b) return text('Henüz ölçüm yok: bu çalışmada abonelik kullanımı bilgisi gelmedi. Temkinli ol, kupon turu başlatma ve patrona söyle.', true);
        } else b = butceKontrol({ yuzde, sifirlanma, asama: asama ?? 'kontrol', limit: s.aboneligeSinirYuzde });
        emit('butce', { butce: b });
        if (b.durum === 'DEVAM') kvSet('butce_bildirildi', '');
        const ozet = `Pay: ${b.harcanan}/${b.limit} puan kullanıldı, kalan ${b.kalan}. Dilim %${b.dilim_doluluk} dolu, sıfırlanma ${b.sifirlanma}. Bir kupon turu ~${b.tur_tahmini} puan tutuyor.`;
        if (b.durum === 'DUR') return text(`DUR – ${ozet} Bu dilimde başka iş yapma; patrona cevap_yaz ile kısaca bildir.`);
        if (b.durum === 'YETERSIZ') return text(`YETERSIZ – ${ozet} Kupon turunu başlatma; patrona payın yetmediğini ve sıfırlanma saatini söyle (kısa sorulara yine cevap verebilirsin).`);
        return text(`DEVAM – ${ozet}`);
      },
    },

    cevap_yaz: {
      desc: 'Genel Müdür içindir: patrona bayi ekranındaki sohbet panelinden cevap yazar (Markdown). Gelen kutusundan gelen her mesaja bununla ya da rapor_kaydet ile cevap ver.',
      shape: { metin: z.string(), mesaj_id: z.number().int().optional().describe('Cevaplanan gelen kutusu mesajı') },
      run: async ({ metin, mesaj_id }) => {
        kvSet('gm_nabiz', nowIso());
        if (mesaj_id) db.prepare("UPDATE gelen_kutusu SET durum = 'cevaplandi' WHERE id = ?").run(mesaj_id);
        emit('gm_mesaj', { metin, oturum_id: oid() });
        emit('ajan_durum', { ajan: 'genel-mudur', durum: 'masada', calisiyor: false });
        return text('Cevap bayi ekranına yazıldı.');
      },
    },

    rapor_kaydet: {
      desc: 'Genel Müdür içindir: kupon turunun FİNAL RAPORUNU kaydeder; rapor bayi ekranındaki Genel Müdür panelinde görünür. Kupon turunun sonunda bir kez çağır. Tur web panelinden gelen bir mesajla başladıysa mesaj_id ver (talimat tekrar yazılmaz).',
      shape: {
        talimat: z.string().optional().describe('Patronun talimatı (kısa); mesaj_id verildiyse gerekmez'),
        metin: z.string().describe('Final rapor (Markdown)'),
        mesaj_id: z.number().int().optional(),
      },
      run: async ({ talimat, metin, mesaj_id }) => {
        const id = oid();
        if (mesaj_id) {
          const m = db.prepare('SELECT metin FROM gelen_kutusu WHERE id = ?').get(mesaj_id);
          talimat = talimat ?? m?.metin;
          db.prepare("UPDATE gelen_kutusu SET durum = 'cevaplandi' WHERE id = ?").run(mesaj_id);
        }
        talimat = talimat ?? 'Kupon turu';
        if (id) db.prepare("UPDATE oturumlar SET talimat = ?, rapor = ?, durum = 'bitti' WHERE id = ?").run(talimat, metin, id);
        if (!mesaj_id) {   // web panelinden gelmediyse talimatı sohbete de yaz
          db.prepare('INSERT INTO sohbet(zaman, kim, metin, oturum_id) VALUES(?,?,?,?)').run(new Date().toISOString(), 'patron', talimat, id);
          emit('patron_mesaj', { metin: talimat, oturum_id: id });
        }
        emit('rapor', { metin, oturum_id: id, durum: 'bitti' });
        emit('oturum', { oturum_id: id, durum: 'bitti' });
        ctx.oturumuKapat?.();
        return text('Rapor kaydedildi; bayi ekranında görünüyor.');
      },
    },

    ofiste_konus: {
      desc: 'Ofis ekranında konuşma balonu olarak kısa (1-2 cümle) yorum gösterir. Kendi tarzınla konuş.',
      shape: { ajan: z.enum(AJAN_ENUM), mesaj: z.string().max(280) },
      readOnly: true,
      run: async ({ ajan, mesaj }) => {
        emit('balon', { ajan, mesaj, oturum_id: oid() });
        return text('ok');
      },
    },
  };
}

async function takimFormuYazi({ mac_kodu, takim, lig, gun }) {
  let m = null;
  if (mac_kodu) {
    const b = gunBulteni(gun);
    m = b ? listMatches(b.id, { gun, kodlar: [mac_kodu] })[0] : null;
    if (!m) return `${mac_kodu} ${gun} bülteninde yok.`;
    lig = m.lig;
  }
  const slug = espnLig(lig);
  if (!slug) return takim && !mac_kodu ? teamForm(takim) : `Veri yok: "${lig ?? '?'}" ligi ESPN kaynağında yok. Gerekçeni oranlara dayandır ve bunu belirt.`;
  const satir = (f) => !f ? 'ESPN puan durumunda eşleşmedi' : `${f.takim.ad} (${f.takim.sira}. sıra, ${f.takim.o} maç, ${f.takim.g}G ${f.takim.b}B ${f.takim.m}M, gol ${f.takim.ag}-${f.takim.yg}) son maçlar: ` +
    f.maclar.map(x => `${x.s} ${x.a}-${x.y} ${x.ic ? 'ev' : 'dep'} ${x.rakip} (${x.tarih})`).join(' | ');
  try {
    if (m) {
      const [fe, fd, bm] = await Promise.all([takimFormu(slug, m.ev), takimFormu(slug, m.deplasman), bagimsizModel(m)]);
      return `${m.mac_kodu} ${m.ev} - ${m.deplasman} (${m.lig}) [kaynak: ESPN]\nEv: ${satir(fe)}\nDeplasman: ${satir(fd)}` + (bm ? `\n${bagimsizYazi(bm)}` : '');
    }
    return `[kaynak: ESPN] ${satir(await takimFormu(slug, takim))}`;
  } catch (e) { return `ESPN verisine ulaşılamadı (${e.message}). Gerekçeni oranlara dayandır.`; }
}

async function teamForm(takim) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return `Veri yok: istatistik API anahtarı (API_FOOTBALL_KEY) tanımlı değil. Gerekçeni oranlara dayandır ve bunu belirt.`;
  const ck = takim.toLowerCase();
  if (formCache.has(ck)) return formCache.get(ck);
  const h = { 'x-apisports-key': key };
  try {
    const t = await (await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(takim)}`, { headers: h })).json();
    const team = t.response?.[0]?.team;
    if (!team) return `Veri yok: "${takim}" bulunamadı (İngilizce adını dene).`;
    const f = await (await fetch(`https://v3.football.api-sports.io/fixtures?team=${team.id}&last=5`, { headers: h })).json();
    const rows = (f.response ?? []).map(x => {
      const home = x.teams.home.id === team.id;
      const gf = home ? x.goals.home : x.goals.away; const ga = home ? x.goals.away : x.goals.home;
      const r = gf > ga ? 'G' : gf < ga ? 'M' : 'B';
      return `${x.fixture.date.slice(0, 10)} ${x.teams.home.name} ${x.goals.home}-${x.goals.away} ${x.teams.away.name} (${r})`;
    });
    let inj = '';
    try {
      const season = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
      const i = await (await fetch(`https://v3.football.api-sports.io/injuries?team=${team.id}&season=${season}`, { headers: h })).json();
      const recent = (i.response ?? []).filter(x => Date.now() - new Date(x.fixture.date).getTime() < 14 * 86400000);
      if (recent.length) inj = `\nSon 2 haftada sakat/cezalı: ${[...new Set(recent.map(x => `${x.player.name} (${x.player.reason})`))].slice(0, 8).join(', ')}`;
    } catch { /* sakatlık verisi opsiyonel */ }
    const out = `${team.name} son 5 maç (form ${rows.map(r => r.slice(-2, -1)).join('')}):\n${rows.join('\n')}${inj}`;
    formCache.set(ck, out);
    return out;
  } catch (e) {
    return `Veri yok: istatistik API hatası (${e.message}).`;
  }
}

export { istanbulDate, AGENTS };
