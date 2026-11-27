// Bayi Ofisi arayüzü – derleme adımı olmayan vanilla JS
import { createIsoOffice } from './iso.js';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = (n) => `${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;
const api = async (url, opt = {}) => {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || r.statusText);
  return j;
};

const S = { durum: null, kadro: {}, maclar: [], kuponlar: [], calisiyor: false, tvSayfa: 0, tvSayfalar: [], canli: { maclar: {}, secimler: {} } };
const AJAN_SIRA = ['genel-mudur', 'yasli-dayi', 'hizli-genc', 'beyaz-hayalci', 'inatci-eniste', 'alt-ustcu', 'spor-totocu', 'cok-bilen-kardes'];

/* ---------------- Sekmeler ---------------- */
function sekmeAc(ad) {
  $$('.sekme').forEach(b => b.classList.toggle('aktif', b.dataset.sekme === ad));
  $$('.sekme-icerik').forEach(s => s.classList.toggle('aktif', s.id === `sekme-${ad}`));
  if (ad === 'bulten') bultenSekmesi();
  if (ad === 'ayarlar') ayarFormuDoldur();
  if (ad === 'gecmis') gecmisYukle();
}
$$('.sekme').forEach(b => b.addEventListener('click', () => sekmeAc(b.dataset.sekme)));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-git]'); if (g) sekmeAc(g.dataset.git); });

/* ---------------- Saat ---------------- */
setInterval(() => { $('#saat').textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }, 1000);

/* ---------------- Durum ---------------- */
async function durumYukle() {
  S.durum = await api('/api/durum');
  S.kadro = S.durum.kadro;
  S.calisiyor = S.durum.calisiyor;
  modRozeti(S.durum.mod, S.durum.gm);
  gunSeciciCiz();
  ofisCiz();
  calismaDurumu(S.calisiyor);
}

let butceZamanlayici = null;
function butceRozeti(b) {
  const r = $('#butceRozet');
  clearTimeout(butceZamanlayici);
  if (!b) { r.hidden = true; return; }
  // Sıfırlanma saati geçtiyse yeni dilim başlamıştır: sayfa açıkken de rozeti sıfırla
  const sifir = b.sifirlanma ? new Date(b.sifirlanma).getTime() : null;
  if (sifir && Date.now() >= sifir) b = { ...b, harcanan: 0, kalan: b.limit, durum: 'DEVAM', sifirlandi: true, sifirlanma: null, dilim_doluluk: null };
  else if (sifir) butceZamanlayici = setTimeout(() => butceRozeti(b), Math.min(sifir - Date.now() + 1000, 2 ** 31 - 1));
  r.hidden = false;
  r.textContent = `Claude payı: ${b.harcanan}/${b.limit}`;
  r.className = 'rozet ' + (b.durum === 'DUR' ? 'kotu' : b.kalan < b.limit * 0.3 ? 'uyari' : 'iyi');
  r.title = b.sifirlandi
    ? `5 saatlik dilim sıfırlandı: bu dilimde sistem henüz pay kullanmadı (sınır ${b.limit}). Harambe bir sonraki işte yeni dilimi ölçer.`
    : `Bu 5 saatlik dilimde sistemin kullandığı pay: ${b.harcanan} puan (sınır ${b.limit}). Dilim %${b.dilim_doluluk} dolu, ${new Date(b.sifirlanma).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'te sıfırlanır. ` +
      `Son ölçüm: ${new Date(b.guncelleme).toLocaleTimeString('tr-TR')}. Bir kupon turu ~${b.tur_tahmini} puan.` + (b.durum === 'DUR' ? ' PAY DOLDU: yeni işler sıfırlanmaya kadar bekler.' : '');
}

function modRozeti(modAdi, gm) {
  const mod = $('#modRozet');
  butceRozeti(modAdi === 'claude-code' ? gm?.butce : null);
  if (modAdi === 'claude-code') {
    const girisYok = gm?.cli?.kurulu && !gm.cli.giris;
    mod.textContent = girisYok ? '○ Claude girişi yok' : gm?.calisiyor ? '● Harambe çalışıyor' : gm?.cevrimici ? '● Harambe hazır (Claude)' : '○ Harambe çevrimdışı';
    mod.className = 'rozet ' + (gm?.cevrimici && !girisYok ? 'iyi' : 'kotu');
    mod.title = girisYok
      ? 'Claude Code komut satırına giriş yapılmamış: terminalde bir kez "claude /login" çalıştır.'
      : gm?.cevrimici
        ? 'Panelden yazınca localhost, Claude Code’u kendi aboneliğinle hemen çalıştırır. Sen yazmadıkça token harcanmaz.'
        : 'Claude Code komut satırı bulunamadı. README’deki kurulum adımlarına bak.';
  } else {
    mod.textContent = modAdi === 'canli' ? 'Ofis: CANLI (API)' : 'Ofis: DENEME modu';
    mod.className = 'rozet ' + (modAdi === 'canli' ? 'iyi' : 'uyari');
    mod.title = modAdi === 'canli' ? 'Claude Agent SDK + API anahtarı ile çalışıyor' : 'Kural tabanlı deneme ofisi (Ayarlar’dan değiştirilebilir).';
  }
}
setInterval(async () => {
  if (S.durum?.mod !== 'claude-code') return;
  try { S.durum.gm = await api('/api/gm'); modRozeti('claude-code', S.durum.gm); } catch { /* sunucu yeniden başlıyor olabilir */ }
}, 20000);

/* ---------- Günler: bülten tek güne bağlı değil; TV ve durum seçili günü gösterir ---------- */
function gunEtiketi(g) {
  if (g === S.durum?.bugun) return 'Bugün';
  if (g === S.durum?.yarin) return 'Yarın';
  const d = new Date(`${g}T12:00:00+03:00`);
  return d.toLocaleDateString('tr-TR', { weekday: 'long', timeZone: 'Europe/Istanbul' }).replace(/^./, c => c.toLocaleUpperCase('tr-TR'));
}
const kisaTarih = (g) => g.slice(8, 10) + '.' + g.slice(5, 7);
/** Seçilebilir günler: bugün, yarın ve bültende maçı olan sonraki günler */
function secilebilirGunler() {
  const m = new Map((S.durum?.gunler ?? []).map(g => [g.gun, g]));
  for (const g of [S.durum?.bugun, S.durum?.yarin]) if (g && !m.has(g)) m.set(g, { gun: g, mac_sayisi: 0, baslamamis: 0 });
  return [...m.values()].sort((a, b) => a.gun.localeCompare(b.gun));
}
function gunSeciciCiz() {
  if (!S.gun || S.gun < S.durum?.bugun) S.gun = S.durum?.tarih;   // geçmişte kalan gün seçili kalmasın
  $('#gunSecici').innerHTML = secilebilirGunler().map(g => `<button type="button" class="gun-btn${g.gun === S.gun ? ' aktif' : ''}" data-gun="${g.gun}" aria-pressed="${g.gun === S.gun}"
      title="${g.mac_sayisi ? `${g.mac_sayisi} maç, ${g.baslamamis} tanesi başlamadı` : 'Bu gün için bültende maç yok – Bülteni Yenile ile çek'}">
      <b>${esc(gunEtiketi(g.gun))}</b><small>${kisaTarih(g.gun)} · ${g.mac_sayisi ? `${g.baslamamis}/${g.mac_sayisi} maç` : 'bülten yok'}</small></button>`).join('');
  const gunler = (S.durum?.gunler ?? []).filter(g => g.mac_sayisi);
  const r = $('#bultenRozet');
  r.textContent = gunler.length ? `bülten · ${gunler.length} gün · ${gunler.reduce((x, g) => x + g.baslamamis, 0)} maç` : 'bülten yok';
  r.className = 'rozet ' + (gunler.length ? 'iyi' : 'kotu');
  r.title = gunler.map(g => `${gunEtiketi(g.gun)} ${g.gun}: ${g.baslamamis}/${g.mac_sayisi} maç`).join('\n');
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-gun]'); if (!b) return;
  S.gun = b.dataset.gun; gunSeciciCiz(); await bultenYukle();
  if ($('#sekme-bulten').classList.contains('aktif')) bultenSekmesi();
});

function bultenRozeti(b) {
  const bayat = b?.var && b.yas_saat > (S.durum?.ayarlar?.bultenMaxYasSaat ?? 12);
  const t = $('#tvDurum');
  const etiket = `${esc(gunEtiketi(b?.tarih ?? S.gun))} · ${esc(b?.tarih ?? S.gun ?? '')}`;
  if (!b?.var) { t.innerHTML = `Maç günü: <b>${etiket}</b><br><span class="kotu">Bu gün için bültende maç yok.</span><br>“Bülteni Yenile” ile iddaa.com’dan çek ya da “Bülteni Yükle” ile yedek yöntemi kullan.`; return; }
  t.innerHTML = `Maç günü: <b>${etiket}</b><br>` +
    `Maç: <b>${b.mac_sayisi}</b> (${b.baslamamis} tanesi başlamadı)${b.baslamamis ? '' : ' <span class="kotu">– kupona uygun maç kalmadı</span>'}<br>` +
    `Çekim #${b.id} · <b>${esc(b.kaynak)}</b><br>Son çekilme: <b>${new Date(b.cekilme_zamani).toLocaleString('tr-TR')}</b>` +
    `${bayat ? ' <span class="kotu">BAYAT</span>' : ''}<br>` +
    `Hatalı satır: <b class="${b.hatali_satir_sayisi ? 'kotu' : ''}">${b.hatali_satir_sayisi}</b>` +
    (b.son_cekim && b.son_cekim.sonuc !== 'basarili' ? `<br><span class="kotu">Son çekim denemesi: ${esc(b.son_cekim.sonuc)}</span>` : '');
}

/* ---------------- TV panosu ---------------- */
async function bultenYukle() {
  const r = await api(`/api/bulten?tarih=${encodeURIComponent(S.gun ?? '')}`);
  S.maclar = r.maclar;
  S.bulten = r.bulten;
  bultenRozeti(r.bulten);
  const sayfalar = []; const SATIR = 15; let sayfa = []; let lig = null; let n = 0;
  for (const m of S.maclar) {
    if (m.lig !== lig) { if (n >= SATIR - 2) { sayfalar.push(sayfa); sayfa = []; n = 0; } sayfa.push({ lig: m.lig }); lig = m.lig; n++; }
    sayfa.push(m); n++;
    if (n >= SATIR) { sayfalar.push(sayfa); sayfa = []; n = 0; lig = null; }
  }
  if (sayfa.length) sayfalar.push(sayfa);
  S.tvSayfalar = sayfalar; S.tvSayfa = 0;
  tvCiz();
  sahne('setMatches', S.maclar);
}
function oran(m, bahis, secim) { const o = m.oranlar.find(x => x.bahis === bahis && x.secim === secim); return o ? o.oran.toFixed(2) : '–'; }
function tvCiz() {
  const g = $('#tvGovde');
  if (!S.tvSayfalar.length) {
    $('#tvBaslik').textContent = `BÜLTEN · ${S.gun ? `${gunEtiketi(S.gun).toLocaleUpperCase('tr-TR')} ${kisaTarih(S.gun)}` : ''}`;
    g.innerHTML = '<tr><td colspan="10" class="tv-bos">Bu gün için bültende maç yok</td></tr>'; $('#tvSayfa').textContent = ''; return;
  }
  const p = S.tvSayfalar[S.tvSayfa % S.tvSayfalar.length];
  $('#tvBaslik').textContent = `BÜLTEN · ${S.gun ? `${gunEtiketi(S.gun).toLocaleUpperCase('tr-TR')} ${kisaTarih(S.gun)}` : ''}`;
  $('#tvSayfa').textContent = `${(S.tvSayfa % S.tvSayfalar.length) + 1}/${S.tvSayfalar.length}`;
  g.innerHTML = p.map(m => m.lig !== undefined && !m.mac_kodu
    ? `<tr class="lig"><td colspan="10">${esc(m.lig)}</td></tr>`
    : `<tr><td>${esc(m.mac_kodu)}</td><td>${esc(m.saat)}</td><td class="mac">${esc(m.ev)} - ${esc(m.deplasman)}</td><td>${m.mbs ?? '-'}</td>` +
      `<td class="oran">${oran(m, 'Maç Sonucu', '1')}</td><td class="oran">${oran(m, 'Maç Sonucu', '0')}</td><td class="oran">${oran(m, 'Maç Sonucu', '2')}</td>` +
      `<td class="oran">${oran(m, 'Alt/Üst 2.5', 'Alt')}</td><td class="oran">${oran(m, 'Alt/Üst 2.5', 'Üst')}</td><td class="oran">${oran(m, 'Karşılıklı Gol', 'Var')}</td></tr>`).join('');
}
setInterval(() => { if (S.tvSayfalar.length > 1) { S.tvSayfa++; tvCiz(); } }, 9000);

async function bultenYenile(btn) {
  btn.disabled = true; const eski = btn.textContent; btn.textContent = 'Çekiliyor…';
  try {
    const r = await api('/api/bulten/yenile', { method: 'POST', body: { tarih: S.gun } });
    if (r.ok) {
      const gunler = Object.entries(r.gunler ?? {}).map(([g, n]) => `${gunEtiketi(g)} ${n}`).join(', ');
      sistemMesaji(`Bülten çekildi: ${r.mac_sayisi} maç (${gunler}), ${r.hatali} hatalı satır.` + (r.uyari ? ` ${r.uyari}` : ''), !!r.uyari);
      await durumYukle(); await bultenYukle();
    }
    else { sistemMesaji(r.hata, true); if (r.yedekYontem) sekmeAc('bulten'); }
  } catch (e) { sistemMesaji(e.message, true); }
  finally { btn.disabled = false; btn.textContent = eski; }
}
$('#btnYenile').addEventListener('click', (e) => bultenYenile(e.currentTarget));
$('#btnYenile2').addEventListener('click', (e) => bultenYenile(e.currentTarget));

/* ---------------- Ofis ---------------- */
function aralikYazi(k) {
  const a = S.durum?.ayarlar?.ajanlar?.[k];
  if (k === 'spor-totocu') { const t = S.durum?.ayarlar?.sporToto; return t ? `${t.aktif === false ? 'PASİF · ' : ''}Spor Toto · en fazla ${t.maxTutar} TL · kolon ${t.kolonUcreti} TL` : 'Spor Toto'; }
  if (!a) return k === 'cok-bilen-kardes' ? 'eleştirmen · 1-10 puan' : 'ofis şefi';
  return `${a.aktif ? '' : 'PASİF · '}oran ${a.minOran}-${a.maxOran} · ${a.minMac}-${a.maxMac} maç · ${a.tutar} TL`;
}
function ofisCiz() {
  $('#ofis').innerHTML = AJAN_SIRA.map(k => {
    const a = S.kadro[k] ?? { ad: k, emoji: '🙂', unvan: '' };
    return `<div class="masa" id="masa-${k}" style="--renk:${a.renk ?? '#444'}">
      <div class="avatar">${a.emoji}</div>
      <div class="ad">${esc(a.ad)}</div><div class="unvan">${esc(a.unvan)}</div>
      <div class="durum">masada</div><div class="aralik">${esc(aralikYazi(k))}</div></div>`;
  }).join('');
}
/* ---------- Görünüm: Düz / Pixel / 3D ---------- */
let iso = null, o3d = null, o3dYukleniyor = null;
// Ofis olayları açık olan tüm sahnelere gider (pixel ve 3D aynı API'yi kullanır)
const sahne = (m, ...a) => { iso?.[m]?.(...a); o3d?.[m]?.(...a); };
const gorunumOku = () => { try { return localStorage.getItem('ofisGorunum') || 'pixel'; } catch { return 'pixel'; } };
async function gorunumUygula(g) {
  if (!['duz', 'pixel', '3d'].includes(g)) g = 'pixel';
  try { localStorage.setItem('ofisGorunum', g); } catch { /* depolama kapalı olabilir */ }
  $$('[data-gorunum]').forEach(b => b.classList.toggle('aktif', b.dataset.gorunum === g));
  $('#ofis').hidden = g !== 'duz';
  $('#isoOfis').hidden = g !== 'pixel';
  $('#ofis3d').hidden = g !== '3d';
  if (g === 'pixel') {
    if (!iso) { iso = createIsoOffice($('#isoOfis')); iso.setKadro(S.kadro); iso.setMatches(S.maclar); iso.setTicketCount(S.kuponlar.length); window.bayiIso = iso; }
    iso.start();
  } else iso?.stop();
  if (g === '3d') {
    try {
      if (!o3d) {
        // Three.js yalnızca 3D seçilince yüklenir
        o3dYukleniyor ??= import('./ofis3d.js').then(({ createOfis3D }) => {
          const o = createOfis3D($('#ofis3d')); o.setKadro(S.kadro); o.setMatches(S.maclar); o.setTicketCount(S.kuponlar.length);
          return o;
        });
        o3d = await o3dYukleniyor; window.bayi3d = o3d;
      }
      if (gorunumOku() === '3d') o3d.start();
    } catch (e) {
      console.error('3D görünüm açılamadı', e);
      $('#ofis3d').innerHTML = '<p class="bos">3D görünüm bu tarayıcıda açılamadı (WebGL kapalı olabilir). Pixel görünümü kullan.</p>';
    }
  } else o3d?.stop();
}
$$('[data-gorunum]').forEach(b => b.addEventListener('click', () => gorunumUygula(b.dataset.gorunum)));

function masaDurum(ajan, durum, calisiyor) {
  sahne('setStatus', ajan, durum, calisiyor);
  const m = $(`#masa-${ajan}`); if (!m) return;
  $('.durum', m).textContent = String(durum).replace(/\.\.\.$/, '');
  if (calisiyor !== undefined) m.classList.toggle('calisiyor', !!calisiyor);
  else m.classList.toggle('calisiyor', /\.\.\.$/.test(durum));
  if (ajan === 'genel-mudur') $('#gmDurum').textContent = durum;
}
const balonZaman = {};
function balon(ajan, mesaj) {
  sahne('bubble', ajan, mesaj);
  const m = $(`#masa-${ajan}`); if (!m) return;
  $('.balon', m)?.remove();
  const b = document.createElement('div'); b.className = 'balon'; b.textContent = mesaj; m.appendChild(b);
  clearTimeout(balonZaman[ajan]); balonZaman[ajan] = setTimeout(() => b.remove(), 9000);
}

/* ---------------- Fişler ---------------- */
/* ---------------- Spor Toto ---------------- */
async function totoYukle() {
  const kap = $('#toto'); if (!kap) return;
  let r; try { r = await api('/api/toto'); } catch (e) { kap.innerHTML = `<p class="bos">Spor Toto okunamadı: ${esc(e.message)}</p>`; return; }
  const p = r.program;
  if (!p) { kap.innerHTML = '<p class="bos">Spor Toto programına ulaşılamadı.</p>'; $('#totoOzet').textContent = ''; return; }
  const kapanis = new Date(p.bitis + '+03:00');
  $('#totoOzet').textContent = `${p.donem}. dönem · kapanış ${kapanis.toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · sınır ${tl(r.ayar.maxTutar)} (kolon ${tl(r.ayar.kolonUcreti)})`;
  if (!r.kuponlar.length) {
    kap.innerHTML = `<p class="bos">Bu dönem için Spor Toto önerisi yok. Harambe'ye "Spor Toto kuponu hazırla" de.${kapanis < new Date() ? ' (Bu dönemin oyun süresi kapandı; yeni program açılınca hazırlanabilir.)' : ''}</p>`;
    return;
  }
  const kutu = (secim, harf, sonuc) => `<span class="toto-kutu${secim.includes(harf) ? ' isaretli' : ''}${sonuc === harf ? ' sonuc' : ''}">${harf}</span>`;
  kap.innerHTML = r.kuponlar.map(k => {
    const tur = (n) => k.secimler.filter(s => s.secim.length === n).length;
    const satirlar = k.secimler.map(s => {
      const pm = p.maclar.find(m => m.no === s.mac_no);
      return `<tr class="${s.sonuc ? (s.tuttu ? 'tuttu' : 'yatti') : ''}" title="${esc(s.gerekce ?? '')}"><td>${s.mac_no}</td><td>${esc(s.mac_adi)}<small>${esc(s.lig ?? '')}</small></td>
        <td class="toto-kutular">${['1', '0', '2'].map(h => kutu(s.secim, h, s.sonuc)).join('')}</td><td class="num">${pm ? `${pm.halk[1]}/${pm.halk[0]}/${pm.halk[2]}` : '–'}</td></tr>`;
    }).join('');
    return `<div class="toto-fis">
      <div class="toto-ust"><b>🎟️ SPOR TOTO · #${k.id}</b><span>${k.donem}. dönem</span></div>
      <table class="toto-tablo"><tr><th>No</th><th>Maç</th><th>1 0 2</th><th>Halk %</th></tr>${satirlar}</table>
      <div class="toto-alt"><span>Banko ${tur(1)} · Çifte ${tur(2)} · Üçlü ${tur(3)}</span><span><b>${k.kolon} kolon · ${tl(k.tutar)}</b></span></div>
      <div class="toto-alt"><span>15/15 model olasılığı</span><span>${k.model_olasilik == null ? '–' : '%' + (k.model_olasilik * 100).toFixed(4)}</span></div>
      ${k.sonuclanan ? `<div class="toto-alt"><span>Biten maçlar</span><span><b>${k.dogru}/${k.sonuclanan} doğru</b></span></div>` : ''}
      ${k.aciklama ? `<div class="aciklama">“${esc(k.aciklama)}”</div>` : ''}
      <div class="alt">YALNIZCA ÖNERİDİR · OYNANMIŞ KUPON DEĞİLDİR</div></div>`;
  }).join('');
}
async function kuponlariYukle() {
  // Bugün ve sonraki günlerin aktif fişleri (geçmiş günler Geçmiş sekmesinde)
  S.kuponlar = await api(`/api/kuponlar?min_tarih=${S.durum?.bugun ?? ''}`);
  sahne('setTicketCount', S.kuponlar.length);
  fisleriCiz();
}
/* Canlı skor (sunucu ESPN'den 90 sn'de bir çeker; ajan/token yok) */
async function canliYukle() {
  try { S.canli = await api('/api/canli'); } catch { return; }
  if (S.kuponlar.length) fisleriCiz();
}
function canliMacOf(k, s) { return S.canli?.maclar?.[`${k.tarih}|${s.mac_kodu}`] ?? null; }
function canliSatir(k, s) {
  if (s.sonuc) return '';
  const m = canliMacOf(k, s); if (!m) return '';
  if (m.bulunamadi) return '<div class="canli-satir canli-yok">canlı skor yok</div>';
  const c = S.canli.secimler?.[s.id];
  const dk = m.tamamlandi ? 'MS' : (m.dk || '');
  const iy = m.iy && m.devre >= 2 ? ` <small>(İY ${m.iy[0]}-${m.iy[1]})</small>` : '';
  const ne = !c ? 'değerlendirilemiyor' : c.kesin ? (c.tutuyor ? 'TUTTU' : 'YATTI') : (c.tutuyor ? 'şu an tutuyor' : 'şu an tutmuyor');
  const sinif = !c ? '' : c.tutuyor ? (c.kesin ? 'kesin-tuttu' : 'tutuyor') : (c.kesin ? 'kesin-yatti' : 'tutmuyor');
  return `<div class="canli-satir ${sinif}"><span>${m.tamamlandi ? '' : '<i class="canli-nokta"></i>'}${esc(dk)} · <b>${m.skor[0]}-${m.skor[1]}</b>${iy}</span><span>${ne}</span></div>`;
}
function canliOzet(k) {
  let canli = 0, tutan = 0;
  for (const s of k.secimler) {
    if (s.sonuc) continue;
    const c = S.canli?.secimler?.[s.id]; if (!c) continue;
    canli++; if (c.tutuyor) tutan++;
  }
  return canli ? { canli, tutan } : null;
}
// Model olasılığı gösterimi: küçük olasılıklarda ondalık basamak artar (%0.42 gibi)
function yuzdeYaz(p) {
  if (p == null) return '–';
  const x = p * 100;
  return '%' + (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)).replace('.', ',');
}
function degerYaz(d) { return d == null ? '–' : `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(0)}%`; }
function degerSinif(d) { return d == null ? '' : d >= 0 ? 'deger-iyi' : d < -0.2 ? 'deger-kotu' : 'deger-orta'; }
function puanRenk(p) { return p == null ? '#777' : p >= 7 ? '#0a7a3e' : p >= 5 ? '#b26a00' : '#c62828'; }
function fisHtml(k) {
  const kadro = S.kadro[k.ajan] ?? { ad: k.ajan, emoji: '' };
  const isaret = new Set(k.degistirilmeli ?? []);
  return `<div class="fis${k.durum !== 'aktif' ? ' revize' : ''}" id="fis-${k.id}">
    <div class="ust"><strong>BAYİ OFİSİ</strong><br>KUPON ÖNERİSİ · FİŞ #${k.id}<br>${esc(kadro.emoji)} ${esc(kadro.ad)}<br>
      ${new Date(k.olusturma).toLocaleString('tr-TR')}<br>Maç günü: ${esc(k.tarih)}${k.revize_of ? `<br>(#${k.revize_of} revizyonu)` : ''}${k.durum !== 'aktif' ? `<br>[${esc(k.durum)}]` : ''}</div>
    ${k.puan != null ? `<div class="damga" style="--d:${puanRenk(k.puan)}"><div><b>${k.puan}</b><small>/10 REVİO</small></div></div>` : ''}
    ${k.secimler.map(s => `<div class="secim${isaret.has(s.mac_kodu) ? ' isaretli' : ''}${s.sonuc ? ' ' + s.sonuc : ''}">
        <div class="s1"><span>${esc(s.mac_kodu)} · ${esc(s.saat ?? '')}</span><span>MBS ${s.mbs ?? 1}</span></div>
        <div>${esc(s.mac_adi)}</div>
        <div class="s2"><span>${esc(s.bahis)}: <b>${esc(s.secim)}</b></span><span>${Number(s.oran).toFixed(2)}</span></div>
        ${canliSatir(k, s)}
        ${s.model_olasilik != null ? `<div class="s3"><span>Model ${yuzdeYaz(s.model_olasilik)}</span><span class="${degerSinif(s.deger)}">değer ${degerYaz(s.deger)}</span></div>` : ''}
        ${s.gerekce ? `<div class="grc">${esc(s.gerekce)}</div>` : ''}</div>`).join('')}
    <div class="toplam">
      <div><span>Maç sayısı</span><span>${k.secimler.length}</span></div>
      <div><span>Toplam oran</span><span>${Number(k.toplam_oran).toFixed(2)}</span></div>
      <div><span>Tutar</span><span>${tl(k.tutar)}</span></div>
      <div class="buyuk"><span>Olası kazanç</span><span>${tl(k.olasi_kazanc)}</span></div>
      <div><span>Risk</span><span>${esc(k.risk ?? '-')}</span></div>
      ${k.model_olasilik != null ? `<div><span>Model tutma</span><span>${yuzdeYaz(k.model_olasilik)}</span></div>
      <div><span>Beklenen getiri</span><span class="${degerSinif(k.beklenen_getiri)}">${degerYaz(k.beklenen_getiri)}</span></div>` : ''}
      ${k.taban_puan != null ? `<div title="Puan cetvelinden kodla hesaplanan taban puan; Hakan Revio en fazla ±2 oynatabilir"><span>Taban puan → Revio</span><span>${k.taban_puan} → ${k.puan ?? '–'}</span></div>` : ''}
    </div>
    ${k.aciklama ? `<div class="aciklama">“${esc(k.aciklama)}”</div>` : ''}
    ${k.risk_uyarilari?.length ? `<div class="risk-kurulu"><b>⚠ Nikah Dairesi</b>${k.risk_uyarilari.map(u => `<div>• ${esc(u)}</div>`).join('')}</div>` : ''}
    ${k.lehte || k.aleyhte ? `<div class="tartisma">
      ${k.lehte ? `<div class="lehte"><b>Lehte:</b> ${esc(k.lehte)}</div>` : ''}
      ${k.aleyhte ? `<div class="aleyhte"><b>Aleyhte:</b> ${esc(k.aleyhte)}</div>` : ''}</div>` : ''}
    ${k.elestiri ? `<div class="elestiri"><b>Hakan Revio${k.lehte ? ' (hüküm)' : ''}:</b> ${esc(k.elestiri)}</div>` : ''}
    <div class="barkod"></div>
    <div class="alt">YALNIZCA ÖNERİDİR · OYNANMIŞ KUPON DEĞİLDİR<br>Bahis risk içerir; bütçeni aşma.</div>
  </div>`;
}
// Fişler kısa özet kartı; tıklayınca termal fişin tamamı pencerede açılır (açık pencere yenilemede güncellenir)
let acikFis = null;   // fiş penceresinde açık olan kupon
function fisOzetHtml(k) {
  const kadro = S.kadro[k.ajan] ?? { ad: k.ajan, emoji: '' };
  return `<button type="button" class="fis-ozet" data-fis-ac="${k.id}" aria-haspopup="dialog">
      <span class="fo-ust"><span class="fo-ajan">${esc(kadro.emoji)} ${esc(kadro.ad)}</span>
        <span>${k.puan != null ? `<span class="fo-puan" style="--d:${puanRenk(k.puan)}" title="Hakan Revio puanı">${k.puan}/10</span>` : ''}<span class="fo-no">#${k.id}</span></span></span>
      <span class="fo-satir"><span>Maç</span><b>${k.secimler.length}</b></span>
      <span class="fo-satir"><span>Oran</span><b>${Number(k.toplam_oran).toFixed(2)}</b></span>
      <span class="fo-satir"><span>Tutar</span><b>${tl(k.tutar)}</b></span>
      <span class="fo-satir fo-kazanc"><span>Olası kazanç</span><b>${tl(k.olasi_kazanc)}</b></span>
      ${k.model_olasilik != null ? `<span class="fo-satir" title="Poisson modeline göre kuponun tutma olasılığı (oranlardan hesaplanır)"><span>Model tutma</span><b>${yuzdeYaz(k.model_olasilik)}</b></span>` : ''}
      ${(() => { const o = canliOzet(k); return o ? `<span class="fo-canli${o.tutan === o.canli ? ' iyi' : ''}"><i class="canli-nokta"></i>Canlı: ${o.tutan}/${o.canli} maç şu an tutuyor</span>` : ''; })()}
      ${k.risk_uyarilari?.length ? `<span class="fo-risk" title="${esc(k.risk_uyarilari.join(' · '))}">⚠ Nikah Dairesi: ${k.risk_uyarilari.length} uyarı</span>` : ''}
      <span class="fo-ac">Fişi aç ▸</span>
    </button>`;
}
/* Fiş sekmeleri: Tümü + her kupon ajanı. Seçim tarayıcıda hatırlanır. */
const FIS_AJANLARI = ['yasli-dayi', 'hizli-genc', 'beyaz-hayalci', 'inatci-eniste', 'alt-ustcu'];
let fisSekme = (() => { try { return localStorage.getItem('fisSekme') || 'hepsi'; } catch { return 'hepsi'; } })();
function fisSekmeleriCiz() {
  const say = (a) => S.kuponlar.filter(k => a === 'hepsi' || k.ajan === a).length;
  const ajanlar = [...FIS_AJANLARI, ...new Set(S.kuponlar.map(k => k.ajan).filter(a => !FIS_AJANLARI.includes(a)))];
  if (fisSekme !== 'hepsi' && !ajanlar.includes(fisSekme)) fisSekme = 'hepsi';
  $('#fisSekmeler').innerHTML = ['hepsi', ...ajanlar].map(a => {
    const k = S.kadro[a] ?? { ad: a, emoji: '' };
    const ad = a === 'hepsi' ? 'Tümü' : `${k.emoji ?? ''} ${k.ad}`;
    return `<button type="button" role="tab" class="fis-sekme${fisSekme === a ? ' aktif' : ''}" data-fis-sekme="${a}" aria-selected="${fisSekme === a}"
      ${a !== 'hepsi' && k.renk ? `style="--renk:${k.renk}"` : ''}>${esc(ad)} <span class="sayi">${say(a)}</span></button>`;
  }).join('');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fis-sekme]'); if (!b) return;
  fisSekme = b.dataset.fisSekme;
  try { localStorage.setItem('fisSekme', fisSekme); } catch { /* depolama kapalı olabilir */ }
  fisleriCiz();
});

function fisleriCiz() {
  fisSekmeleriCiz();
  const aktif = S.kuponlar.filter(k => fisSekme === 'hepsi' || k.ajan === fisSekme);
  const el = $('#fisler');
  if (!aktif.length) {
    el.innerHTML = `<p class="bos">${S.kuponlar.length ? 'Bu ajanın bugün ve sonrası için fişi yok.' : 'Henüz fiş yok. Sağdaki panelden Harambe’ye talimat ver.'}</p>`;
    $('#fisOzet').textContent = ''; return;
  }
  const butce = S.durum?.ayarlar?.gunlukButce ?? 0;
  const gunler = [...new Set(aktif.map(k => k.tarih))].sort();
  const gunEtiket = (g) => `${gunEtiketi(g)} · ${kisaTarih(g)}`;
  const kart = (k) => `<div class="fis-kap${acikFis === k.id ? ' acik' : ''}">${fisOzetHtml(k)}</div>`;
  el.innerHTML = gunler.map(g => {
    const ks = aktif.filter(k => k.tarih === g);
    const toplam = ks.reduce((x, k) => x + k.tutar, 0);
    const gunToplam = S.kuponlar.filter(k => k.tarih === g).reduce((x, k) => x + k.tutar, 0);   // bütçe günlük ve tüm ajanlar için
    return `<div class="fis-gun"><h3 class="fis-gun-baslik">${esc(gunEtiket(g))} <small>${ks.length} fiş · ${tl(toplam)}${fisSekme === 'hepsi' ? '' : ` (gün toplamı ${tl(gunToplam)})`} / ${tl(butce)}</small></h3>
      <div class="fis-gun-liste">${ks.map(kart).join('')}</div></div>`;
  }).join('');
  $('#fisOzet').textContent = `${aktif.length} fiş · ayrıntı için fişe tıkla`;
  if (acikFis != null) fisPenceresiDoldur();   // açık fiş yenilenen veriyle güncellensin (puan, eleştiri...)
}

/* Fiş penceresi: fişin tamamı listenin üstünde açılır; arkadaki dizilim hiç kaymaz. */
function fisPenceresi() {
  let d = $('#fisPencere');
  if (d) return d;
  d = document.createElement('dialog');
  d.id = 'fisPencere'; d.className = 'fis-pencere'; d.setAttribute('aria-label', 'Fiş ayrıntısı');
  d.innerHTML = '<button type="button" class="fis-pencere-kapat" aria-label="Kapat" data-fis-kapat>✕</button><div class="fis-pencere-ic"></div>';
  document.body.appendChild(d);
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fis-kapat]')) d.close(); });   // boşluğa tıklayınca kapanır
  d.addEventListener('close', () => { acikFis = null; $$('.fis-kap.acik').forEach(x => x.classList.remove('acik')); });
  return d;
}
function fisPenceresiDoldur() {
  const d = fisPenceresi(); const k = S.kuponlar.find(x => x.id === acikFis);
  if (!k) { if (d.open) d.close(); return; }
  const ic = $('.fis-pencere-ic', d); const kaydir = ic.scrollTop;
  ic.innerHTML = `${fisHtml(k)}
    <div class="fis-butonlar"><button class="btn kucuk" data-png="${k.id}">Resim (PNG)</button><button class="btn kucuk" data-pdf="${k.id}">PDF / Yazdır</button></div>`;
  ic.scrollTop = kaydir;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fis-ac]'); if (!b) return;
  acikFis = Number(b.dataset.fisAc);
  $$('.fis-kap.acik').forEach(x => x.classList.remove('acik')); b.parentElement.classList.add('acik');
  fisPenceresiDoldur();
  const d = fisPenceresi(); if (!d.open) d.showModal();
  $('.fis-pencere-ic', d).scrollTop = 0;
});
document.addEventListener('click', async (e) => {
  const png = e.target.closest('[data-png]'); const pdf = e.target.closest('[data-pdf]');
  if (png) {
    const el = $(`#fis-${png.dataset.png}`);
    if (!window.html2canvas) return alert('Resim kütüphanesi yüklenemedi.');
    const c = await window.html2canvas(el, { backgroundColor: '#fbfaf5', scale: 2 });
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `fis-${png.dataset.png}.png`; a.click();
  }
  if (pdf) {
    const el = $(`#fis-${pdf.dataset.pdf}`);
    el.classList.add('yazdir'); window.print(); el.classList.remove('yazdir');
  }
});

/* Toplu indirme: görünen fişlerin hepsi tek PDF'te, her fiş ayrı sayfada (yazdır penceresinde "PDF olarak kaydet") */
function topluYazdir(html) {
  const kap = document.createElement('div'); kap.id = 'topluBaski'; kap.innerHTML = html;
  document.body.appendChild(kap); document.body.classList.add('toplu-baski');
  const temizle = () => { kap.remove(); document.body.classList.remove('toplu-baski'); window.removeEventListener('afterprint', temizle); };
  window.addEventListener('afterprint', temizle);
  window.print();
  setTimeout(temizle, 1000);   // afterprint gelmeyen tarayıcılar için
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-toplu]'); if (!b) return;
  if (b.dataset.toplu === 'fis') {
    const ks = S.kuponlar.filter(k => fisSekme === 'hepsi' || k.ajan === fisSekme)
      .sort((a, c) => a.tarih.localeCompare(c.tarih) || a.id - c.id);
    if (!ks.length) return alert('İndirilecek fiş yok.');
    topluYazdir(ks.map(k => `<div class="toplu-sayfa">${fisHtml(k).replace(/ id="fis-\d+"/, '')}</div>`).join(''));
  } else {
    const fisler = $$('#toto .toto-fis');
    if (!fisler.length) return alert('İndirilecek Spor Toto önerisi yok.');
    topluYazdir(fisler.map(f => `<div class="toplu-sayfa">${f.outerHTML}</div>`).join(''));
  }
});

/* Spor Toto bölümü açılır kapanır; durum tarayıcıda hatırlanır */
{
  const d = $('#totoKutu');
  if (d) {
    try { d.open = localStorage.getItem('totoAcik') === '1'; } catch { /* depolama kapalı olabilir */ }
    d.addEventListener('toggle', () => { try { localStorage.setItem('totoAcik', d.open ? '1' : '0'); } catch { /* yok say */ } });
  }
}

/* ---------------- Sohbet ---------------- */
function md(t) {
  // küçük ve güvenli markdown: önce kaçış, sonra biçim
  const lines = esc(t).split('\n'); const out = []; let i = 0;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const row = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = row(l); i += 2; const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(row(lines[i++]));
      out.push(`<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`);
      continue;
    }
    if (/^#{1,4}\s/.test(l)) { out.push(`<h3>${inline(l.replace(/^#+\s/, ''))}</h3>`); i++; continue; }
    if (/^\s*[-*]\s/.test(l)) { const it = []; while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) it.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s/, ''))}</li>`); out.push(`<ul>${it.join('')}</ul>`); continue; }
    if (/^\s*\d+\.\s/.test(l)) { const it = []; while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) it.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s/, ''))}</li>`); out.push(`<ol>${it.join('')}</ol>`); continue; }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join('');
}
function mesajEkle(kim, metin, ek = '') {
  const s = $('#sohbet');
  $('.yaziyor-mesaj', s)?.remove();
  const d = document.createElement('div');
  d.className = `mesaj ${kim === 'patron' ? 'patron' : kim === 'sistem' ? 'sistem' : 'gm'} ${ek}`;
  d.innerHTML = kim === 'patron' || kim === 'sistem' ? esc(metin) : md(metin);
  s.appendChild(d);
  if (S.calisiyor || (S.bekliyor && kim === 'patron')) yaziyorGoster();
  s.scrollTop = s.scrollHeight;
}
const sistemMesaji = (m, hata = false) => mesajEkle(hata ? 'gm' : 'sistem', m, hata ? 'hata' : '');
function yaziyorGoster(etiket = 'ofis çalışıyor') {
  const s = $('#sohbet'); if ($('.yaziyor-mesaj', s)) return;
  const d = document.createElement('div'); d.className = 'mesaj gm yaziyor-mesaj';
  d.innerHTML = `<span class="yaziyor"><i></i><i></i><i></i></span> ${esc(etiket)}`;
  s.appendChild(d); s.scrollTop = s.scrollHeight;
}
function calismaDurumu(c) {
  S.calisiyor = c;
  $('#btnDurdur').hidden = !c;
  $('#sohbetForm button[type=submit]').disabled = c;
  if (c) yaziyorGoster(); else $('.yaziyor-mesaj')?.remove();
  $('#ofisDurum').textContent = c ? '— çalışıyor' : '';
}
async function sohbetYukle() {
  const ms = await api('/api/sohbet');
  $('#sohbet').innerHTML = '';
  if (!ms.length) mesajEkle('gm', 'Hoş geldin patron. Ne hazırlayalım? Örnek: **“Yarın için kuponları hazırla, Premier Lig ağırlıklı olsun.”**');
  if (S.durum?.mod === 'claude-code') mesajEkle('sistem', S.durum.gm?.cevrimici
    ? 'Harambe hazır: yazdığın anda aboneliğinle çalışan Claude Code devreye girer; yazmadığın sürece token harcanmaz.'
    : 'Harambe şu an hazır değil. Yazabilirsin; mesajın sırada bekler.');
  else if (S.durum?.mod === 'demo') mesajEkle('sistem', 'Bu panel deneme modunda (kural tabanlı). Ayarlar’dan “Claude Code” moduna alabilirsin.');
  ms.forEach(m => mesajEkle(m.kim === 'patron' ? 'patron' : 'gm', m.metin));
}
$('#sohbetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = $('#sohbetGirdi'); const mesaj = g.value.trim(); if (!mesaj || S.calisiyor) return;
  mesajEkle('patron', mesaj); g.value = '';
  try {
    const r = await api('/api/sohbet', { method: 'POST', body: { mesaj } });
    if (r.mod === 'claude-code') {
      S.bekliyor = true;
      if (r.butce_dolu) sistemMesaji(`Bu 5 saatlik dilimde Claude payı (%${r.butce_dolu.limit}) doldu. Mesajın sırada; ${new Date(r.butce_dolu.sifirlanma).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} sonrasında cevaplanacak.`);
      else if (r.gm?.cli?.kurulu && !r.gm.cli.giris) sistemMesaji('Claude Code’a giriş yapılmamış; terminalde bir kez "claude /login" çalıştır. Mesajın sırada.');
      else if (!r.gm?.cevrimici) sistemMesaji('Harambe şu an çevrimdışı; mesajın sırada.');
      yaziyorGoster('Harambe’ye iletildi');
      masaDurum('genel-mudur', 'mesajın iletildi...', true);
    } else calismaDurumu(true);
  } catch (err) { sistemMesaji(err.message, true); }
});
$('#sohbetGirdi').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#sohbetForm').requestSubmit(); } });
$$('[data-hizli]').forEach(b => b.addEventListener('click', () => { $('#sohbetGirdi').value = b.dataset.hizli; $('#sohbetGirdi').focus(); }));
$('#btnDurdur').addEventListener('click', () => api('/api/durdur', { method: 'POST' }).catch(() => {}));

/* ---------------- Canlı olaylar ---------------- */
function olaylariDinle() {
  const es = new EventSource('/api/olaylar');
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    switch (e.tip) {
      case 'merhaba': calismaDurumu(e.calisiyor); break;
      case 'ajan_durum': masaDurum(e.ajan, e.durum, e.calisiyor); break;
      case 'balon': balon(e.ajan, e.mesaj); break;
      case 'risk': sahne('riskKarar', e); break;
      case 'kupon': sahne('printTicket'); kuponlariYukle(); break;
      case 'toto': sahne('printTicket'); totoYukle(); break;
      case 'puan': kuponlariYukle(); break;
      case 'canli': canliYukle(); break;
      case 'bulten': bultenYukle(); durumYukle(); break;
      case 'oturum':
        if (e.mod === 'claude-code') masaDurum('genel-mudur', 'Claude Code’da çalışıyor...', true);
        else if (e.durum === 'basladi') { calismaDurumu(true); masaDurum('genel-mudur', 'talimatı okuyor...', true); }
        if (e.durum !== 'basladi') { calismaDurumu(false); kuponlariYukle(); durumYukle(); }
        break;
      case 'patron_mesaj': mesajEkle('patron', `${e.metin}  (Claude Code)`); break;
      case 'butce': if (S.durum?.gm) S.durum.gm.butce = e.butce; butceRozeti(e.butce); break;
      case 'gm_mesaj': S.bekliyor = false; mesajEkle('gm', e.metin || ''); break;
      case 'rapor': S.bekliyor = false; mesajEkle('gm', e.metin || '(rapor boş)', e.durum === 'hata' ? 'hata' : ''); break;
    }
  };
  es.onerror = () => { /* tarayıcı otomatik yeniden bağlanır */ };
}

/* ---------------- Bülten sekmesi ---------------- */
async function bultenSekmesi() {
  const r = await api(`/api/bulten?tarih=${encodeURIComponent(S.gun ?? '')}`); const b = r.bulten;
  $('#yukleTarih').value ||= S.gun ?? '';
  const gunTablo = (b.gunler ?? []).length
    ? `<table class="liste"><tr><th>Gün</th><th>Maç</th><th>Başlamamış</th><th>Çekim</th><th>Çekilme</th></tr>${b.gunler.map(g => `<tr${g.gun === S.gun ? ' class="secili"' : ''}><td>${esc(gunEtiketi(g.gun))} · ${esc(g.gun)}</td><td class="num">${g.mac_sayisi}</td><td class="num">${g.baslamamis}</td><td>#${g.bulten_id}</td><td>${new Date(g.cekilme_zamani).toLocaleString('tr-TR')}</td></tr>`).join('')}</table>`
    : '<p>Bültende bugünden sonrası için maç yok.</p>';
  $('#bultenDetay').innerHTML = `<p class="ipucu">Bülten tek güne bağlı değil: her çekimde sayfada gelen tüm günlerin maçları kaydedilir; her gün için o günü içeren en son çekim kullanılır. Yenile, seçili günün (${esc(gunEtiketi(S.gun))}) sekmesini de açmaya çalışır.</p>` + gunTablo +
    (!b.var ? `<p><b>${esc(gunEtiketi(S.gun))} · ${esc(S.gun)}</b> için bültende maç yok.</p>` :
    `<p>Seçili gün <b>${esc(gunEtiketi(b.tarih))} · ${esc(b.tarih)}</b> · çekim #${b.id} · kaynak <b>${esc(b.kaynak)}</b> · ${new Date(b.cekilme_zamani).toLocaleString('tr-TR')} (${b.yas_saat} saat önce) · <b>${b.mac_sayisi}</b> maç · <b>${b.hatali_satir_sayisi}</b> hatalı satır (çekimin tamamında)</p>`) +
    (b.not ? `<p class="uyari-kucuk">${esc(b.not)}</p>` : '') +
    (b.son_cekim ? `<p class="ipucu">Son çekim denemesi: ${new Date(b.son_cekim.zaman).toLocaleString('tr-TR')} – ${esc(b.son_cekim.sonuc)} ${esc(b.son_cekim.detay ?? '')}</p>` : '');
  $('#hataliSatirlar').innerHTML = b.hatalar?.length
    ? `<table class="liste"><tr><th>Neden</th><th>Satır</th></tr>${b.hatalar.map(h => `<tr><td>${esc(h.neden)}</td><td><code>${esc(h.satir)}</code></td></tr>`).join('')}</table>` : 'Okunamayan satır yok.';
  bultenListesi();
}
function bultenListesi() {
  const q = $('#bultenAra').value.toLocaleLowerCase('tr-TR');
  const rows = S.maclar.filter(m => !q || `${m.mac_kodu} ${m.lig} ${m.ev} ${m.deplasman}`.toLocaleLowerCase('tr-TR').includes(q));
  $('#bultenListe').innerHTML = `<tr><th>Kod</th><th>Saat</th><th>Lig</th><th>Maç</th><th>MBS</th><th>MS 1/0/2</th><th>2.5 A/Ü</th><th>KG V/Y</th><th>Bahis</th></tr>` +
    rows.map(m => `<tr><td>${esc(m.mac_kodu)}</td><td>${esc(m.saat)}</td><td>${esc(m.lig)}</td><td>${esc(m.ev)} - ${esc(m.deplasman)}</td><td>${m.mbs ?? '-'}</td>` +
      `<td class="num">${oran(m, 'Maç Sonucu', '1')} / ${oran(m, 'Maç Sonucu', '0')} / ${oran(m, 'Maç Sonucu', '2')}</td>` +
      `<td class="num">${oran(m, 'Alt/Üst 2.5', 'Alt')} / ${oran(m, 'Alt/Üst 2.5', 'Üst')}</td><td class="num">${oran(m, 'Karşılıklı Gol', 'Var')} / ${oran(m, 'Karşılıklı Gol', 'Yok')}</td><td class="num">${m.bahis_sayisi}</td></tr>`).join('');
}
$('#bultenAra').addEventListener('input', bultenListesi);
$('#yukleDosya').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  $('#yukleMetin').value = await f.text();
  $('#yukleSonuc').textContent = `${f.name} okundu (${Math.round(f.size / 1024)} KB). “Yükle ve ayrıştır”a bas.`;
});
$('#btnYukle').addEventListener('click', async (e) => {
  const icerik = $('#yukleMetin').value; if (!icerik.trim()) return;
  e.currentTarget.disabled = true; $('#yukleSonuc').textContent = 'Ayrıştırılıyor…';
  try {
    const r = await api('/api/bulten/yukle', { method: 'POST', body: { icerik, tarih: $('#yukleTarih').value } });
    if (r.ok) {
      const gunler = Object.entries(r.gunler ?? {}).map(([g, n]) => `${g} ${n}`).join(', ');
      $('#yukleSonuc').textContent = `✓ ${r.kaynak}: ${r.mac_sayisi} maç okundu (${gunler}), ${r.hatali} hatalı satır, ${r.atlanan} başka spor/oynanmış maç atlandı.`;
      $('#yukleMetin').value = ''; await durumYukle(); await bultenYukle(); bultenSekmesi();
    } else {
      $('#yukleSonuc').textContent = `✗ ${r.hata}`;
      if (r.hatalar?.length) $('#hataliSatirlar').innerHTML = `<table class="liste"><tr><th>Neden</th><th>Satır</th></tr>${r.hatalar.map(h => `<tr><td>${esc(h.neden)}</td><td><code>${esc(h.satir)}</code></td></tr>`).join('')}</table>`;
    }
  } catch (err) { $('#yukleSonuc').textContent = `✗ ${err.message}`; }
  finally { e.currentTarget.disabled = false; }
});

/* ---------------- Ayarlar ---------------- */
const AJAN_ALANLAR = [['minOran', 'Min toplam oran', 0.01], ['maxOran', 'Max toplam oran', 0.01], ['minMac', 'Min maç', 1], ['maxMac', 'Max maç', 1], ['tutar', 'Kupon başı tutar (TL)', 1], ['kuponSayisi', 'Kupon sayısı (1-3)', 1]];
async function ayarFormuDoldur() {
  const a = await api('/api/ayarlar'); const f = $('#ayarForm');
  for (const k of ['gunlukButce', 'tekMacMinOran', 'tekMacMaxOran', 'bultenMaxYasSaat', 'ofisModu', 'oturumButceUsd', 'aboneligeSinirYuzde', 'nobetAralikDk']) f.elements[k].value = a[k];
  f.elements.mbsKurali.checked = !!a.mbsKurali;
  f.elements.totoMaxTutar.value = a.sporToto?.maxTutar ?? ''; f.elements.totoKolonUcreti.value = a.sporToto?.kolonUcreti ?? ''; f.elements.totoAktif.checked = a.sporToto?.aktif !== false;
  f.elements.ajanModeli.value = a.ajanModeli?.varsayilan ?? 'inherit'; f.elements.tokenTasarrufu.checked = !!a.tokenTasarrufu?.aktif;
  f.elements.ligDahil.value = a.ligDahil.join(', '); f.elements.ligHaric.value = a.ligHaric.join(', ');
  $('#ajanAyarlari').innerHTML = Object.entries(a.ajanlar).map(([k, x]) => `<div class="ajan-ayar" data-ajan="${k}">
    <h3>${esc(S.kadro[k]?.emoji ?? '')} ${esc(S.kadro[k]?.ad ?? k)}</h3>
    ${AJAN_ALANLAR.map(([n, l, st]) => `<label>${l}<input type="number" step="${st}" min="${n === 'kuponSayisi' ? 1 : 0}" ${n === 'kuponSayisi' ? 'max="3"' : ''} name="${n}" value="${x[n]}"></label>`).join('')}
    <label class="onay"><input type="checkbox" name="aktif" ${x.aktif ? 'checked' : ''}> Aktif</label></div>`).join('');
}
$('#ayarForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  const liste = (s) => s.split(',').map(x => x.trim()).filter(Boolean);
  const body = {
    gunlukButce: +f.elements.gunlukButce.value, tekMacMinOran: +f.elements.tekMacMinOran.value, tekMacMaxOran: +f.elements.tekMacMaxOran.value,
    bultenMaxYasSaat: +f.elements.bultenMaxYasSaat.value, ofisModu: f.elements.ofisModu.value, oturumButceUsd: +f.elements.oturumButceUsd.value,
    aboneligeSinirYuzde: +f.elements.aboneligeSinirYuzde.value, nobetAralikDk: +f.elements.nobetAralikDk.value,
    mbsKurali: f.elements.mbsKurali.checked, ligDahil: liste(f.elements.ligDahil.value), ligHaric: liste(f.elements.ligHaric.value), ajanlar: {},
    ajanModeli: { varsayilan: f.elements.ajanModeli.value }, tokenTasarrufu: { aktif: f.elements.tokenTasarrufu.checked },
    sporToto: { maxTutar: +f.elements.totoMaxTutar.value, kolonUcreti: +f.elements.totoKolonUcreti.value, aktif: f.elements.totoAktif.checked },
  };
  $$('.ajan-ayar').forEach(d => {
    const o = { aktif: $('[name=aktif]', d).checked };
    AJAN_ALANLAR.forEach(([n]) => { o[n] = +$(`[name=${n}]`, d).value; });
    o.kuponSayisi = Math.min(3, Math.max(1, Math.round(o.kuponSayisi)));
    body.ajanlar[d.dataset.ajan] = o;
  });
  try { await api('/api/ayarlar', { method: 'PUT', body }); $('#ayarSonuc').textContent = '✓ Kaydedildi'; await durumYukle(); }
  catch (err) { $('#ayarSonuc').textContent = `✗ ${err.message}`; }
});

/* ---------------- Geçmiş ---------------- */
function genelIstatistikCiz(g, ad) {
  const t = $('#genelIstatistik'); if (!t || !g) return;
  if (!g.ajanlar.length) { t.innerHTML = '<tr><td>Henüz kupon yok.</td></tr>'; $('#genelOzet').textContent = ''; return; }
  const gun = (x) => (x ? kisaTarih(x) : '–');
  $('#genelOzet').textContent = `${gun(g.toplam.ilk_gun)} – ${gun(g.toplam.son_gun)}`;
  const yz = (x) => (x == null ? '–' : `%${x}`);
  const satir = (a, toplam = false) => `<tr${toplam ? ' class="toplam-satir"' : ''}><td>${toplam ? '<b>TOPLAM</b>' : esc(ad(a.ajan))}</td>
    <td class="num">${a.mac}</td><td class="num pos">${a.tuttu ?? 0}</td><td class="num neg">${a.yatti ?? 0}</td><td class="num">${a.iade ?? 0}</td><td class="num">${a.bekleyen ?? 0}</td>
    <td class="num"><b>${yz(a.isabet)}</b></td><td class="num">${a.kupon}</td><td class="num">${a.kupon_kazanan}/${a.kupon_kazanan + a.kupon_kaybeden}</td><td class="num">${yz(a.kupon_isabet)}</td></tr>`;
  t.innerHTML = `<tr><th>Bahisçi</th><th>Verilen maç</th><th>Tuttu</th><th>Yattı</th><th>İade</th><th>Bekleyen</th><th>Maç isabeti</th><th>Kupon</th><th>Tutan kupon</th><th>Kupon isabeti</th></tr>` +
    g.ajanlar.map(a => satir(a)).join('') + satir(g.toplam, true);
}
function tutmaKarnesiCiz(k, ad) {
  const kap = $('#tutmaKarnesi'); if (!kap) return;
  if (!k?.toplam) { kap.innerHTML = '<p class="bos">Henüz sonuçlanmış seçim yok; karne sonuçlar geldikçe dolar.</p>'; $('#tutmaOzet').textContent = ''; return; }
  $('#tutmaOzet').textContent = `${k.toplam} sonuçlanmış seçim`;
  const yz = (x) => (x == null ? '–' : `%${x}`);
  // tahmin ile gerçek arasındaki fark: 5 puandan az yeşil, 5-15 sarı, fazlası kırmızı
  const fark = (t, g) => (t == null ? '' : Math.abs(t - g) < 5 ? 'pos' : Math.abs(t - g) < 15 ? '' : 'neg');
  const tablo = (baslik, satirlar, adFn = (x) => x) => `<h3 class="gun-baslik">${baslik}</h3><div class="tablo-kap"><table class="liste">
    <tr><th></th><th>Seçim</th><th>Tuttu</th><th>Oran modeli dedi</th><th>Bağımsız model dedi</th><th>Brier (oran)</th><th>Brier (bağımsız)</th></tr>
    ${satirlar.map(g => `<tr><td>${esc(adFn(g.ad))}</td><td class="num">${g.n}</td><td class="num"><b>${yz(g.tutma)}</b></td>
      <td class="num ${fark(g.tahminOran, g.tutma)}">${yz(g.tahminOran)}</td><td class="num ${fark(g.tahminBag, g.tutma)}">${yz(g.tahminBag)}${g.nBag && g.nBag < g.n ? ` <small>(${g.nBag})</small>` : ''}</td>
      <td class="num">${g.brierOran ?? '–'}</td><td class="num">${g.brierBag ?? '–'}</td></tr>`).join('')}</table></div>`;
  const kv = k.kiyas;
  const kazanan = kv.n ? [['Oran modeli', kv.oranModeli], ['Bağımsız model', kv.bagimsizModel], ['İkisinin ortalaması', kv.karisik]].sort((a, b) => a[1] - b[1])[0][0] : null;
  kap.innerHTML = tablo('Ajanlara göre', k.ajanlar, ad) + tablo('Bahis türüne göre', k.bahisler) + tablo('Oran modelinin olasılık dilimine göre', k.dilimler) +
    `<p class="ipucu">${kv.n ? `Model kıyası (iki modelin de olasılık verdiği ${kv.n} seçim, Brier): oran modeli <b>${kv.oranModeli}</b> · bağımsız model <b>${kv.bagimsizModel}</b> · ikisinin ortalaması <b>${kv.karisik}</b> → şimdilik en isabetli: <b>${kazanan}</b>.` : 'Model kıyası için iki modelin de olasılık verdiği sonuçlanmış seçim henüz yok.'}</p>`;
}
async function gecmisYukle() {
  const g = await api('/api/gecmis');
  const ad = (k) => `${S.kadro[k]?.emoji ?? ''} ${S.kadro[k]?.ad ?? k}`;
  $('#karne').innerHTML = `<tr><th>Ajan</th><th>Kupon</th><th>Sonuçlanan</th><th>Kazanan</th><th>Kupon isabet</th><th>Seçim isabet</th><th>Ort. puan</th><th>Harcanan</th><th>Kazanılan</th><th>Kâr/Zarar</th></tr>` +
    (g.istatistik.length ? g.istatistik.map(a => `<tr><td>${esc(ad(a.ajan))}</td><td class="num">${a.kupon}</td><td class="num">${a.sonuclanan}</td><td class="num">${a.kazanan}</td>
      <td class="num">${a.kuponIsabet == null ? '-' : a.kuponIsabet + '%'}</td><td class="num">${a.secimIsabet == null ? '-' : a.secimIsabet + '%'}</td><td class="num">${a.ortPuan ?? '-'}</td>
      <td class="num">${tl(a.harcanan)}</td><td class="num">${tl(a.kazanilan)}</td><td class="num ${a.net >= 0 ? 'pos' : 'neg'}">${tl(a.net)}</td></tr>`).join('')
      : '<tr><td colspan="10">Henüz kupon yok.</td></tr>') +
    `<tr><td colspan="10" class="ipucu">Not: Kâr/zarar, önerilerin oynanmış olsaydı ne getireceğini gösteren varsayımsal bir hesaptır.</td></tr>`;
  genelIstatistikCiz(g.genel, ad);
  tutmaKarnesiCiz(g.karne, ad);
  $('#bekleyen').innerHTML = `<tr><th>Gün</th><th>Kod</th><th>Saat</th><th>Maç</th><th>Lig</th><th>Skor (ev - dep)</th><th>İlk yarı (isteğe bağlı)</th><th></th></tr>` +
    (g.bekleyen.length ? g.bekleyen.map((m, i) => `<tr><td>${esc(m.tarih)}</td><td>${esc(m.mac_kodu)}</td><td>${esc(m.saat ?? '')}</td><td>${esc(m.mac_adi)}</td><td>${esc(m.lig)}</td>
      <td><input type="number" min="0" style="width:56px" id="sev-${i}"> - <input type="number" min="0" style="width:56px" id="sdep-${i}"></td>
      <td><input type="number" min="0" style="width:48px" id="siyev-${i}"> - <input type="number" min="0" style="width:48px" id="siydep-${i}"></td>
      <td><button class="btn kucuk sari" data-skor="${i}" data-tarih="${esc(m.tarih)}" data-kod="${esc(m.mac_kodu)}">Kaydet</button></td></tr>`).join('')
      : '<tr><td colspan="8">Sonuç bekleyen maç yok.</td></tr>');
  $('#gecmisGunler').innerHTML = g.gunler.map(d => `<h3 class="gun-baslik">${esc(d.tarih)} — ${d.kuponlar.length} kupon</h3>
    <div class="kart"><table class="liste"><tr><th>Fiş</th><th>Ajan</th><th>Oran</th><th>Tutar</th><th>Puan</th><th>Sonuç</th><th>Ödeme</th><th>Seçimler</th></tr>
    ${d.kuponlar.map(k => `<tr><td>#${k.id}</td><td>${esc(ad(k.ajan))}</td><td class="num">${k.toplam_oran}</td><td class="num">${tl(k.tutar)}</td><td class="num">${k.puan ?? '-'}</td>
      <td class="${k.sonuc === 'kazandi' ? 'pos' : k.sonuc === 'kaybetti' ? 'neg' : ''}">${esc(k.sonuc ?? 'bekliyor')}</td><td class="num">${tl(k.odeme)}</td>
      <td>${k.secimler.map(s => `<div>${esc(s.mac_kodu)} ${esc(s.mac_adi)} · ${esc(s.bahis)}: <b>${esc(s.secim)}</b> @${s.oran}
        <select data-secim="${s.id}"><option value="">?</option>${['tuttu', 'yatti', 'iade'].map(v => `<option ${s.sonuc === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')}</td></tr>`).join('')}
    </table></div>`).join('');
}
// Tablo içeriği her değiştiğinde (geçmiş, bülten, karne…) sayı sütunu başlıklarını yeniden hizala
let hizalaBekliyor = false;
new MutationObserver(() => {
  if (hizalaBekliyor) return; hizalaBekliyor = true;
  requestAnimationFrame(() => { hizalaBekliyor = false; sutunHizala(); });
}).observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });
/** Tablolarda sayı sütunlarının başlığını da sayılar gibi sağa yaslar (başlık ile değer aynı hizada dursun) */
function sutunHizala(kok = document) {
  for (const t of kok.querySelectorAll('table.liste')) {
    const satirlar = [...t.rows];
    const baslik = satirlar.find(r => r.querySelector('th')); if (!baslik) continue;
    [...baslik.cells].forEach((th, i) => {
      const hucreler = satirlar.filter(r => r !== baslik && r.cells.length === baslik.cells.length).map(r => r.cells[i]);
      th.classList.toggle('num', hucreler.length > 0 && hucreler.every(c => c.classList.contains('num')));
    });
  }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-skor]'); if (!b) return;
  const i = b.dataset.skor; const ev = parseInt($(`#sev-${i}`).value, 10); const dep = parseInt($(`#sdep-${i}`).value, 10);
  if (Number.isNaN(ev) || Number.isNaN(dep)) return alert('Skoru gir.');
  const iyEv = parseInt($(`#siyev-${i}`).value, 10), iyDep = parseInt($(`#siydep-${i}`).value, 10);
  const iy = Number.isNaN(iyEv) || Number.isNaN(iyDep) ? {} : { iy_ev: iyEv, iy_dep: iyDep };
  const r = await api('/api/sonuc/skor', { method: 'POST', body: { tarih: b.dataset.tarih, mac_kodu: b.dataset.kod, ev, dep, ...iy } });
  if (r.elle_girilmeli?.length) alert(`${r.elle_girilmeli.length} seçim skordan değerlendirilemedi (ör. ${r.elle_girilmeli[0].bahis}). Aşağıdaki listeden elle işaretle.`);
  gecmisYukle();
});
$('#btnOtoSonuc')?.addEventListener('click', async (e) => {
  const b = e.currentTarget; b.disabled = true; $('#otoSonucDurum').textContent = 'ESPN’e bakılıyor…';
  try {
    const r = await api('/api/sonuc/otomatik', { method: 'POST' });
    $('#otoSonucDurum').textContent = `${r.bakilan} maça bakıldı, ${r.girilen} sonuç girildi (${r.iy_ile} tanesi ilk yarı skoruyla).` + (r.bulunamayan.length ? ` ESPN'de bulunamayan: ${r.bulunamayan.length} (elle gir).` : '');
    gecmisYukle();
  } catch (err) { $('#otoSonucDurum').textContent = `Hata: ${err.message}`; } finally { b.disabled = false; }
});
document.addEventListener('change', async (e) => {
  const s = e.target.closest('[data-secim]'); if (!s) return;
  await api('/api/sonuc/secim', { method: 'POST', body: { secim_id: +s.dataset.secim, sonuc: s.value || null } });
  gecmisYukle();
});

/* ---------------- Başlat ---------------- */
(async () => {
  try {
    await durumYukle();
    await Promise.all([bultenYukle(), kuponlariYukle(), sohbetYukle(), totoYukle(), canliYukle()]);
    gorunumUygula(gorunumOku());
  } catch (e) { sistemMesaji(`Sunucuya bağlanılamadı: ${e.message}`, true); }
  olaylariDinle();
})();
