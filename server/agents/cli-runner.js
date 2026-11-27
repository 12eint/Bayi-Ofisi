// Panelden mesaj gelince Claude Code'u (kendi aboneliğinle oturum açılmış resmi CLI) arka planda çalıştırır.
// Boştayken hiçbir şey çalışmaz → sıfır token. Mesaj metni stdin'den verilir (kabuk yok, komut enjeksiyonu yok).
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, kvGet, kvSet, istanbulDate, butceDolu, sistemPayiOlc, sistemCalismaBitti } from '../db.js';
import { getSettings } from '../settings.js';
import { emit } from '../events.js';
import { AGENTS } from './definitions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AJAN_ARACI = new Set(['Agent', 'Task']);

export function claudeYolu() {
  const adaylar = [
    process.env.CLAUDE_CLI_PATH,
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    process.env.HOME && path.join(process.env.HOME, '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
  ].filter(Boolean);
  return adaylar.find(p => fs.existsSync(p)) ?? null;
}

let calisiyor = false; let tekrar = false; let aktifSurec = null;

export const cliMesgul = () => calisiyor;

/** CLI kurulu mu, giriş yapılmış mı (son çalışmadan öğrenilir) */
export function cliDurumu() {
  const yol = claudeYolu();
  return { kurulu: !!yol, giris: kvGet('cli_giris') !== 'yok', calisiyor, son_hata: kvGet('cli_son_hata') || null };
}

/** Giriş durumunu ucuz yoldan kontrol eder (model çağrısı yapmaz) */
export function girisKontrol() {
  const yol = claudeYolu(); if (!yol) return Promise.resolve(false);
  return new Promise((res) => {
    execFile(yol, ['auth', 'status'], { timeout: 20000, windowsHide: true }, (err, out, errOut) => {
      const metin = `${out}\n${errOut}`;
      const girisVar = !err && !/not logged in|login required|no auth/i.test(metin);
      kvSet('cli_giris', girisVar ? 'var' : 'yok');
      res(girisVar);
    });
  });
}

function bekleyenleriAl() {
  const rows = db.prepare("SELECT id, zaman, metin FROM gelen_kutusu WHERE durum = 'bekliyor' ORDER BY id").all();
  if (rows.length) db.prepare(`UPDATE gelen_kutusu SET durum = 'alindi' WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map(r => r.id));
  return rows;
}

function paneleYaz(metin) { emit('gm_mesaj', { metin }); }

/** Gelen kutusunu işler; çalışırken yeni mesaj gelirse bitince tekrar bakar */
export async function gelenKutusunuIsle() {
  if (calisiyor) { tekrar = true; return; }
  const dolu = butceDolu();
  if (dolu) {
    const n = db.prepare("SELECT COUNT(*) n FROM gelen_kutusu WHERE durum = 'bekliyor'").get().n;
    if (n && kvGet('butce_bildirildi') !== dolu.sifirlanma) {
      kvSet('butce_bildirildi', dolu.sifirlanma);
      paneleYaz(`Patron, bu 5 saatlik dilimde ayırdığın %${dolu.limit} Claude payı doldu. Mesajın sırada; ${new Date(dolu.sifirlanma).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })} sonrasında bakacağım.`);
    }
    return;   // sıfırlanınca bir sonraki mesajda ya da zamanlayıcıyla tekrar denenir
  }
  const yol = claudeYolu();
  if (!yol) { paneleYaz('Claude Code komut satırı bulunamadı. Kurulum için README’deki adımlara bak.'); return; }
  const mesajlar = bekleyenleriAl();
  if (!mesajlar.length) return;

  calisiyor = true;
  emit('ajan_durum', { ajan: 'genel-mudur', durum: 'patronun mesajını okuyor...', calisiyor: true });
  try {
    const r = await calistir(yol, mesajlar);
    // Önceki konuşma bu bilgisayarda yoksa (zip'le taşındı vb.) yeni konuşmayla bir kez daha dene
    if (r?.yenidenDene) await calistir(yol, mesajlar, { devamEt: false });
  }
  catch (e) { kvSet('cli_son_hata', e.message); paneleYaz(`Harambe'ye ulaşılamadı: ${e.message}`); }
  finally {
    // cevapsız kalanlar tekrar sıraya (giriş hatası vb. durumda kaybolmasın)
    calisiyor = false; aktifSurec = null;
    emit('ajan_durum', { ajan: 'genel-mudur', durum: 'masada', calisiyor: false });
    for (const k of Object.keys(AGENTS)) emit('ajan_durum', { ajan: k, durum: 'masada', calisiyor: false });
    if (tekrar) { tekrar = false; setTimeout(gelenKutusunuIsle, 500); }
  }
}

function calistir(yol, mesajlar, { devamEt = true } = {}) {
  const s = getSettings();
  const bugun = istanbulDate();
  let onceki = null;
  try { onceki = JSON.parse(kvGet('cli_oturum') || 'null'); } catch { /* bozuk/boş kayıt: yeni konuşma */ }
  // Aynı gün ve AYNI bilgisayarda önceki konuşma devam ettirilir (konuşma kayıtları bilgisayara özeldir)
  const resume = devamEt && onceki?.gun === bugun && onceki?.makine === os.hostname() ? onceki.id : null;

  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--mcp-config', path.join(ROOT, '.mcp.json'), '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--allowedTools', 'mcp__bayi', 'Agent', 'Task',
    '--disallowedTools', 'Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Workflow',
  ];
  if (resume) args.push('--resume', resume);

  const gunYaz = (d) => `${istanbulDate(d)} (${new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'Europe/Istanbul' }).format(d)})`;
  const istem =
`Bugün: ${gunYaz(new Date())}, yarın: ${gunYaz(new Date(Date.now() + 86400000))}. Kupon, patronun istediği güne (bugün/yarın/belirttiği gün) yapılır.
Patron bayi ekranındaki sohbet panelinden yazdı:
${mesajlar.map(m => `[mesaj_id ${m.id}] ${m.metin}`).join('\n')}

CLAUDE.md'deki Genel Müdür kurallarına göre işle. Bu çalışma panel tarafından başlatıldı: gelen_mesajlari_al çağırmana gerek yok, mesajlar yukarıda.
Abonelik payı: mcp__ccd_session_mgmt__get_usage burada YOK; bütçe için mcp__bayi__butce_kontrol aracını yuzde/sifirlanma VERMEDEN çağır (sistem son ölçümü kullanır). Kupon turundan önce asama "tur_basla", sonra "tur_bitti".
Her mesaja cevabını mcp__bayi__cevap_yaz ile (mesaj_id vererek) yaz; kupon turu yaptıysan raporu mcp__bayi__rapor_kaydet ile (mesaj_id vererek) kaydet.`;

  let ilkYuzde = null;   // bu çalışmada görülen ilk 5 saatlik doluluk (payı yalnızca çalışma süresince ölçmek için)
  return new Promise((resolve, reject) => {
    const p = spawn(yol, args, { cwd: ROOT, windowsHide: true, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    aktifSurec = p;
    p.stdin.end(istem);
    const ajanlar = new Map(); let tampon = ''; let sonuc = null; let hataMetni = '';
    const kayit = fs.createWriteStream(path.join(ROOT, 'data', 'cli-son-calisma.jsonl'));   // sorun gidermek için son çalışmanın ham akışı
    p.stdout.on('data', (d) => kayit.write(d));
    p.on('close', () => kayit.end());

    p.stdout.on('data', (d) => {
      tampon += d.toString('utf8');
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const satir = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
        if (!satir) continue;
        let m; try { m = JSON.parse(satir); } catch { continue; }
        try { isle(m, ajanlar); } catch (e) { console.error('Claude akışı işlenemedi:', e.message); }   // sunucu asla çökmesin
        if (m.type === 'result') sonuc = m;
      }
    });
    p.stderr.on('data', (d) => { hataMetni += d.toString('utf8'); });
    p.on('error', reject);
    p.on('close', () => {
      sistemCalismaBitti();
      const metin = String(sonuc?.result ?? '');
      // Devam ettirilecek konuşma bulunamadıysa: kaydı unut, çağıran yeni konuşmayla tekrar dener
      if (resume && (!sonuc || sonuc.is_error) && /no conversation|session|conversation .*not found|bulunamad/i.test(metin + hataMetni)) {
        kvSet('cli_oturum', '');
        return resolve({ yenidenDene: true });
      }
      if (sonuc?.session_id) kvSet('cli_oturum', JSON.stringify({ id: sonuc.session_id, gun: bugun, makine: os.hostname() }));
      if (/not logged in|please run \/login/i.test(metin + hataMetni)) {
        kvSet('cli_giris', 'yok');
        db.prepare(`UPDATE gelen_kutusu SET durum = 'bekliyor' WHERE id IN (${mesajlar.map(() => '?').join(',')})`).run(...mesajlar.map(m => m.id));
        paneleYaz('Claude Code’a giriş yapılmamış. Terminalde bir kez `claude /login` çalıştırıp aboneliğinle giriş yap; mesajın sırada bekliyor.');
        return resolve();
      }
      kvSet('cli_giris', 'var'); kvSet('cli_son_hata', sonuc?.is_error ? metin.slice(0, 300) : '');
      // Genel Müdür cevap_yaz ile cevaplamadığı mesaj kaldıysa son metni panele yaz
      const cevapsiz = db.prepare(`SELECT id FROM gelen_kutusu WHERE durum != 'cevaplandi' AND id IN (${mesajlar.map(() => '?').join(',')})`).all(...mesajlar.map(m => m.id));
      if (cevapsiz.length) {
        db.prepare(`UPDATE gelen_kutusu SET durum = 'cevaplandi' WHERE id IN (${cevapsiz.map(() => '?').join(',')})`).run(...cevapsiz.map(r => r.id));
        paneleYaz(metin.trim() || (sonuc?.is_error ? 'Harambe işi tamamlayamadı.' : 'Tamam patron.'));
      }
      resolve();
    });
  });

  function isle(m, ajanlar) {
    // Abonelik dilimi: CLI her yanıtla birlikte 5 saatlik kullanım oranını bildirir → payı kesin ölç
    // Örnek: {"type":"rate_limit_event","rate_limit_info":{"resetsAt":1795647000,"rateLimitType":"five_hour",
    //          "unifiedWindows":{"five_hour":{"utilization":0.75,...}}}}
    const r = m.type === 'rate_limit_event' ? m.rate_limit_info : null;
    const pencere = r?.unifiedWindows?.five_hour ?? (r?.rateLimitType === 'five_hour' ? r : null);
    const oran = pencere?.utilization ?? (r?.rateLimitType === 'five_hour' ? r?.utilization : null);
    if (r && oran != null) {
      const yuzde = oran <= 1 ? Math.round(oran * 1000) / 10 : oran;
      const zaman = pencere?.resetsAt ?? (r.rateLimitType === 'five_hour' ? r.resetsAt : null);
      const sifirlanma = zaman ? new Date(typeof zaman === 'number' ? zaman * (zaman < 1e12 ? 1000 : 1) : zaman).toISOString() : null;
      if (sifirlanma) {
        if (ilkYuzde == null) ilkYuzde = yuzde;
        const b = sistemPayiOlc({ yuzde, ilk: ilkYuzde, sifirlanma, limit: s.aboneligeSinirYuzde });
        emit('butce', { butce: b });
        if (b.durum === 'DUR' && aktifSurec) { paneleYaz(`Claude payı (%${b.limit}) doldu, iş durduruldu.`); aktifSurec.kill(); }
      }
    }
    if (m.type === 'assistant') {
      const alt = m.parent_tool_use_id;
      for (const b of m.message?.content ?? []) {
        if (b.type === 'tool_use' && AJAN_ARACI.has(b.name)) {
          const ajan = b.input?.subagent_type; ajanlar.set(b.id, ajan);
          emit('ajan_durum', { ajan, durum: ajan === 'cok-bilen-kardes' ? 'eleştiriyor...' : 'kupon yazıyor...', calisiyor: true });
        } else if (b.type === 'tool_use' && alt && ajanlar.get(alt)) {
          const ajan = ajanlar.get(alt); const n = String(b.name).replace('mcp__bayi__', '');
          emit('ajan_durum', { ajan, durum: n === 'kupon_puanla' ? 'puan veriyor...' : n.startsWith('bulten') || n === 'mac_detay' ? 'bülteni inceliyor...' : n === 'kupon_teklif_et' ? 'kupon yazıyor...' : 'çalışıyor...', calisiyor: true });
        } else if (b.type === 'tool_use' && !alt) {
          emit('ajan_durum', { ajan: 'genel-mudur', durum: 'iş başında...', calisiyor: true });
        }
      }
    }
    if (m.type === 'system' && m.subtype === 'task_started' && m.subagent_type) { ajanlar.set(m.task_id, m.subagent_type); if (m.tool_use_id) ajanlar.set(m.tool_use_id, m.subagent_type); }
    if (m.type === 'system' && m.subtype === 'task_notification') {
      const ajan = ajanlar.get(m.task_id) ?? ajanlar.get(m.tool_use_id);
      if (ajan) emit('ajan_durum', { ajan, durum: 'işini bitirdi', calisiyor: false });
    }
  }
}

export function durdur() { if (aktifSurec) { aktifSurec.kill(); return true; } return false; }
