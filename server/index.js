// Bayi Ofisi – yerel sunucu (Express + SSE). Yalnızca localhost'a bağlanır.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, tomorrow, istanbulDate, nowIso, gmDurumu as gmDurumuHam, butceDolu } from './db.js';
import { execFile } from 'node:child_process';
import { getSettings, saveSettings } from './settings.js';
import { bus, startDbRelay, emit } from './events.js';
import { refreshBulletin, importBulletin } from './bulletin/index.js';
import { bulletinStatus, gunBulteni, listMatches, varsayilanGun, bultenGunleri } from './bulletin/store.js';
import { eksikModelleriDoldur } from './model/index.js';
import { runOffice, stopOffice, isBusy, officeMode } from './agents/orchestrator.js';
import { listCoupons, getCoupon } from './agents/rules.js';
import { AGENTS, GM } from './agents/definitions.js';
import { totoProgrami, totoKuponlari, totoSonuclariGuncelle } from './toto.js';
import { enterScore, setSelectionResult, history, agentStats, pendingMatches, sonuclariOtomatikGetir, tutmaKarnesi, eksikBagimsizDoldur, genelIstatistik } from './stats.js';
import { gelenKutusunuIsle, cliDurumu, girisKontrol, durdur as cliDurdur } from './agents/cli-runner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Genel Müdür: localhost, panelden mesaj gelince Claude Code CLI'yi çalıştırır (boşta token harcamaz)
const gmDurumu = () => {
  const g = gmDurumuHam(getSettings().nobetAralikDk);
  const cli = cliDurumu();
  return { ...g, cli, cevrimici: (cli.kurulu && cli.giris) || g.cevrimici, calisiyor: cli.calisiyor };
};
// Ayarlar değişince Claude Code tarafındaki CLAUDE.md ve komutları yeniden üret
const claudeDosyalariniGuncelle = () => execFile(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'scripts/sync-agents.js')], { cwd: ROOT }, () => {});
const app = express();
app.use(express.json({ limit: '25mb' }));
// Arayüz dosyaları önbelleğe alınmasın: güncellemeler sayfa yenilenince hemen görünsün
app.use(express.static(path.join(ROOT, 'public'), { etag: false, lastModified: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));
// 3D görünüm: Three.js yerel paketten (internet gerekmez)
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three'), { maxAge: '7d' }));
app.get('/vendor/html2canvas.min.js', (req, res) => res.sendFile(path.join(ROOT, 'node_modules/html2canvas/dist/html2canvas.min.js')));

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(400).json({ ok: false, hata: e.message }); }
};

app.get('/api/durum', wrap(() => ({
  tarih: varsayilanGun(), bugun: istanbulDate(), yarin: tomorrow(), gunler: bultenGunleri(), mod: officeMode(), gm: gmDurumu(), calisiyor: isBusy(), bulten: bulletinStatus(varsayilanGun()), ayarlar: getSettings(),
  kadro: { 'genel-mudur': GM, ...Object.fromEntries(Object.entries(AGENTS).map(([k, a]) => [k, { ad: a.ad, emoji: a.emoji, unvan: a.unvan, renk: a.renk }])) },
})));

app.get('/api/bulten', wrap((req) => {
  const gun = req.query.tarih || varsayilanGun();
  const b = gunBulteni(gun);
  if (!b) return { bulten: bulletinStatus(gun), maclar: [] };
  const maclar = listMatches(b.id, { gun, lig: req.query.lig || undefined }).map(m => ({
    ...m,
    oranlar: m.oranlar.filter(o => /^(Maç Sonucu|Alt\/Üst 2\.5|Karşılıklı Gol|Çifte Şans)$/.test(o.bahis)),
    bahis_sayisi: m.oranlar.length,
  }));
  return { bulten: bulletinStatus(gun), maclar };
}));
app.get('/api/mac/:kod', wrap((req) => {
  const gun = req.query.tarih || varsayilanGun();
  const b = gunBulteni(gun);
  return b ? listMatches(b.id, { gun, kodlar: [req.params.kod] })[0] ?? null : null;
}));
app.post('/api/bulten/yenile', wrap(async (req) => refreshBulletin({ tarih: req.body?.tarih || varsayilanGun(), force: !!req.body?.zorla })));
app.post('/api/bulten/yukle', wrap((req) => {
  if (!req.body?.icerik) throw new Error('İçerik boş.');
  return importBulletin(req.body.icerik, req.body.tarih || varsayilanGun());
}));

app.get('/api/gm', wrap(() => gmDurumu()));
app.get('/api/ayarlar', wrap(() => getSettings()));
app.put('/api/ayarlar', wrap((req) => { const s = saveSettings(req.body); claudeDosyalariniGuncelle(); return s; }));

app.get('/api/sohbet', wrap(() => db.prepare('SELECT * FROM (SELECT * FROM sohbet ORDER BY id DESC LIMIT 60) ORDER BY id').all()));
app.post('/api/sohbet', wrap((req) => {
  const mesaj = String(req.body?.mesaj ?? '').trim();
  if (!mesaj) throw new Error('Mesaj boş.');
  if (officeMode() === 'claude-code') {
    // Mesaj gelen kutusuna; Claude Code'daki Genel Müdür onu alıp cevaplar
    const zaman = nowIso();
    const { lastInsertRowid } = db.prepare('INSERT INTO gelen_kutusu(zaman, metin) VALUES(?, ?)').run(zaman, mesaj);
    db.prepare('INSERT INTO sohbet(zaman, kim, metin) VALUES(?,?,?)').run(zaman, 'patron', mesaj);
    gelenKutusunuIsle().catch(() => {});   // Genel Müdür'ü hemen uyandır
    return { ok: true, mod: 'claude-code', mesaj_id: Number(lastInsertRowid), gm: gmDurumu(), butce_dolu: butceDolu() };
  }
  if (isBusy()) throw new Error('Ofis şu an çalışıyor; bitmesini bekle ya da durdur.');
  runOffice(mesaj).catch(() => {});   // sonuç SSE ile gelir
  return { ok: true, mod: officeMode() };
}));
app.post('/api/durdur', wrap(() => ({ ok: stopOffice() || cliDurdur() })));

app.get('/api/kuponlar', wrap((req) => listCoupons({
  tarih: req.query.tarih || undefined, minTarih: req.query.min_tarih || undefined, oturumId: req.query.oturum ? Number(req.query.oturum) : undefined,
  durum: req.query.durum === 'hepsi' ? null : (req.query.durum || 'aktif'),
})));
app.get('/api/kupon/:id', wrap((req) => getCoupon(Number(req.params.id))));
app.post('/api/kupon/:id/iptal', wrap((req) => {
  db.prepare("UPDATE kuponlar SET durum = 'iptal' WHERE id = ?").run(Number(req.params.id));
  return { ok: true };
}));

app.get('/api/gecmis', wrap((req) => ({ gunler: history({ gun: Number(req.query.gun) || 60 }), istatistik: agentStats(), bekleyen: pendingMatches(), karne: tutmaKarnesi(), genel: genelIstatistik() })));
app.post('/api/sonuc/skor', wrap((req) => {
  const { tarih, mac_kodu, ev, dep, iy_ev = null, iy_dep = null } = req.body;
  if (!(Number.isInteger(ev) && Number.isInteger(dep) && ev >= 0 && dep >= 0)) throw new Error('Skor geçersiz.');
  const iyVar = Number.isInteger(iy_ev) && Number.isInteger(iy_dep);
  if (iyVar && (iy_ev > ev || iy_dep > dep || iy_ev < 0 || iy_dep < 0)) throw new Error('İlk yarı skoru maç sonu skorundan büyük olamaz.');
  return enterScore(tarih, mac_kodu, ev, dep, iyVar ? iy_ev : null, iyVar ? iy_dep : null);
}));
// Spor Toto: güncel program + bu dönemin önerileri
app.get('/api/toto', wrap(async () => {
  let program = null; try { program = await totoProgrami(); } catch { /* iddaa'ya ulaşılamadı */ }
  return { program, kuponlar: totoKuponlari({ donem: program?.donem }), ayar: getSettings().sporToto };
}));
// ESPN'den sonuçları (ilk yarı dahil) otomatik getir
app.post('/api/sonuc/otomatik', wrap(() => sonuclariOtomatikGetir()));
app.post('/api/sonuc/secim', wrap((req) => { setSelectionResult(Number(req.body.secim_id), req.body.sonuc ?? null); return { ok: true }; }));

// Canlı ofis olayları (Server-Sent Events)
app.get('/api/olaylar', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ tip: 'merhaba', calisiyor: isBusy() })}\n\n`);
  const on = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  bus.on('olay', on);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { bus.off('olay', on); clearInterval(ping); });
});

startDbRelay();   // Claude Code'daki Genel Müdür'ün olaylarını da arayüze taşı

// Açılışta: giriş durumunu kontrol et, sırada bekleyen mesaj varsa işle.
// 10 dakikada bir yalnızca bekleyen mesaj varsa (ör. pay sıfırlandıktan sonra) tekrar dener; boşta model çağrısı yok.
if (officeMode() === 'claude-code') {
  // Önceki çalışma yarıda kaldıysa (sunucu kapandı vb.) alınmış ama cevaplanmamış mesajlar yeniden sıraya
  db.prepare("UPDATE gelen_kutusu SET durum = 'bekliyor' WHERE durum = 'alindi'").run();
  girisKontrol().then((g) => { console.log(`  Claude Code girişi: ${g ? 'var' : 'YOK – terminalde bir kez "claude /login" çalıştır'}`); gelenKutusunuIsle().catch(() => {}); });
  setInterval(() => {
    const n = db.prepare("SELECT COUNT(*) n FROM gelen_kutusu WHERE durum = 'bekliyor'").get().n;
    if (n) gelenKutusunuIsle().catch(() => {});
  }, 10 * 60000);
}

// Saatte bir: biten kupon maçlarının sonucunu ESPN'den getir (sonucu bekleyen yoksa istek atılmaz)
const otoSkor = () => totoSonuclariGuncelle().catch(() => 0).then(n => { if (n) emit('toto', {}); }).then(() => sonuclariOtomatikGetir()).then(r => { if (r.girilen) { console.log(`  Otomatik sonuç: ${r.girilen} maç girildi.`); emit('puan', {}); } }).catch(() => {});
setTimeout(otoSkor, 60000); setInterval(otoSkor, 3600000);
// Eski seçimlere bağımsız model olasılığı (karne için; ESPN puan durumu önbellekte)
setTimeout(() => eksikBagimsizDoldur().then(n => n && console.log(`  Bağımsız olasılık: ${n} eski seçime eklendi.`)).catch(() => {}), 20000);
try { const n = eksikModelleriDoldur(); if (n) console.log(`  Model olasılığı: ${n} eski kupona eklendi.`); }
catch (e) { console.warn('  Model olasılığı eklenemedi:', e.message); }

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  🏪 Bayi Ofisi açık:  http://localhost:${PORT}`);
  const m = officeMode();
  console.log(`  Ofis modu: ${m === 'canli' ? 'CANLI (API anahtarı + Agent SDK)' : m === 'claude-code' ? 'CLAUDE CODE (aboneliğinle; panelden yazınca çalışır, boşta token harcamaz)' : 'DENEME (kural tabanlı)'}`);
  console.log('  Hatırlatma: iddaa.com üyelik/kullanım sözleşmesini kontrol et. Sistem yalnızca öneri üretir.\n');
});
