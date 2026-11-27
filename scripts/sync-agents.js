// server/agents/definitions.js → Claude Code dosyaları:
//   .claude/agents/*.md            alt agent'lar (Yaşlı Dayı, Hızlı Genç, Beyaz Hayalci, Çok Bilen Kardeş)
//   CLAUDE.md                       Claude Code oturumunun Genel Müdür rolü
//   .claude/commands/*.md           /kuponlar, /gelen-kutusu, /nobet
// Kişilikleri ya da ayarları değiştirdikten sonra: npm run agents:sync
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, agentMarkdown, gmSystemPrompt } from '../server/agents/definitions.js';
import { getSettings } from '../server/settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
  console.log('yazıldı:', rel);
};
const S = getSettings();

for (const name of Object.keys(AGENTS)) write(path.join('.claude', 'agents', `${name}.md`), agentMarkdown(name));

write('CLAUDE.md', `# Bayi Ofisi – Genel Müdür

Bu klasörde açılan Claude Code oturumu, bayi ofisinin **Genel Müdürü Harambe**'dir. Kullanıcı "patron"dur.
Kuponlar ve rapor, bayi ekranında (\`npm start\` → http://localhost:3000) canlı görünür.

ÖNEMLİ FARKLAR (Claude Code içinde çalışırken):
- Aşağıdaki aralıklar varsayılandır; patron Ayarlar sekmesinden değiştirmiş olabilir. İşe başlamadan önce **mcp__bayi__ayarlari_oku** ile güncel aralıkları oku ve ajanlara onları ilet.
- Ajanları Agent aracıyla \`subagent_type\` = ${Object.keys(AGENTS).join(" / ")} olarak çağır.
- Kupon turunun SONUNDA final raporu **mcp__bayi__rapor_kaydet** ile kaydet (talimat + rapor), sonra aynı raporu patrona yaz.
- Bu ofiste dosya düzenleme, kabuk komutu veya web araması gerekmez; yalnızca mcp__bayi__* araçlarını ve alt agent'ları kullan. Proje kodunu değiştirmen istenirse bu ayrı bir iştir.

GELEN KUTUSU (bayi ekranındaki sohbet paneli):
- Patron bayi ekranındaki sohbet panelinden de yazar. Bu mesajlar gelen kutusuna düşer; **mcp__bayi__gelen_mesajlari_al** ile alırsın (bu çağrı aynı zamanda "çevrimiçiyim" nabzıdır).
- "YOK" dönerse hiçbir şey yazma, başka araç çağırma; turu tek satırla bitir ("Kutu boş.").
- Mesaj varsa her birini patronun talimatı say: kupon isterse tam iş akışını uygula ve raporu **mcp__bayi__rapor_kaydet** ile (mesaj_id vererek) kaydet; başka bir şey sorarsa kısa cevabını **mcp__bayi__cevap_yaz** ile (mesaj_id vererek) panele yaz. Panelden gelen hiçbir mesaj cevapsız kalmasın (bütçe doluysa sırada bekler).
- **/nobet** komutu, gelen kutusunu ${S.nobetAralikDk} dakikada bir kontrol eden döngüyü başlatır; **/gelen-kutusu** tek seferlik kontrol yapar.

ABONELİK BÜTÇESİ (patronun kuralı: bu sistem Claude aboneliğinin 5 saatlik diliminin en fazla %${S.aboneligeSinirYuzde}'ini kullanır):
- Ölçüm: **mcp__ccd_session_mgmt__get_usage** (gerekirse önce ToolSearch ile yükle) → \`plan.windows\` içindeki "5-hour limit" kaydının \`percentUsed\` ve \`resetsAt\` değerleri → **mcp__bayi__butce_kontrol**(yuzde, sifirlanma, asama).
- Ne zaman ölçülür: gelen kutusunda mesaj varsa işe başlamadan önce; gelen_mesajlari_al "BÜTÇE KONTROLÜ ZAMANI" derse; kupon turundan hemen önce (asama: "tur_basla") ve hemen sonra (asama: "tur_bitti"). /kuponlar ile doğrudan istenen turlar da buna dahildir.
- **DUR**: o dilimde hiçbir iş yapma (ajan çağırma, kupon yazdırma yok); gerekiyorsa cevap_yaz ile tek cümleyle bildir. **YETERSIZ**: kupon turu başlatma, sıfırlanma saatini söyle. **DEVAM**: normal çalış.
- get_usage kullanılamıyorsa ya da "unavailable" dönerse temkinli ol: kupon turu başlatma, patrona ölçüm yapılamadığını söyle.
- Kupon turunda maliyeti düşük tut: her ajana tek görev, gereksiz takim_formu / mac_detay çağrısı yok, revizyon yalnızca gerçekten düşük puanlı kuponlar için.

---

${gmSystemPrompt(S)}
`);

write(path.join('.claude', 'commands', 'gelen-kutusu.md'), `---
description: Bayi ekranındaki sohbet panelinden gelen mesajları bir kez kontrol eder ve cevaplar
---

mcp__bayi__gelen_mesajlari_al çağır.
- "YOK" dönerse başka hiçbir şey yapma ve yalnızca "Kutu boş." yaz.
- "YOK – BÜTÇE KONTROLÜ ZAMANI" dönerse yalnızca bütçeyi ölç (mcp__ccd_session_mgmt__get_usage → mcp__bayi__butce_kontrol), başka bir şey yapma, tek satır yaz.
- "BÜTÇE DOLU" dönerse aracın söylediğini yap ve turu bitir.
- Mesaj varsa önce bütçeyi ölç; DEVAM ise CLAUDE.md'deki GELEN KUTUSU ve ABONELİK BÜTÇESİ kurallarına göre her birini işle ve cevabını panele yaz (cevap_yaz ya da kupon turuysa rapor_kaydet, ikisinde de mesaj_id ver).
`);

write(path.join('.claude', 'commands', 'nobet.md'), `---
description: Genel Müdür nöbeti – bayi ekranındaki sohbet panelini düzenli kontrol eden döngüyü başlatır
---

Patron, bayi ekranındaki sohbet panelinin sürekli yapay zekâya bağlı kalmasını ve bu sistemin aboneliğin 5 saatlik diliminin en fazla %${S.aboneligeSinirYuzde}'ini kullanmasını istiyor.
1. Bu oturumda zaten çalışan bir /gelen-kutusu döngüsü varsa yenisini kurma.
2. "loop" becerisini (Skill aracı) args = "${S.nobetAralikDk}m /gelen-kutusu" ile çağırarak döngüyü başlat.
3. Bütçeyi hemen ölç (mcp__ccd_session_mgmt__get_usage → mcp__bayi__butce_kontrol), ilk kontrolü yap (mcp__bayi__gelen_mesajlari_al) ve patrona tek satırla "Nöbetteyim patron, panel bağlı. Pay: X/${S.aboneligeSinirYuzde}." yaz.
`);

write(path.join('.claude', 'commands', 'kuponlar.md'), `---
description: Bayi ofisinde kupon turunu başlatır (bütçe kontrolü → bülten → ajanlar → eleştiri → revizyon → rapor)
argument-hint: [ek talimat, örn. "Premier Lig ağırlıklı olsun"]
---

Patronun talimatı: Yarın için kuponları hazırla. $ARGUMENTS

Önce abonelik bütçesini ölç ve mcp__bayi__butce_kontrol(asama: "tur_basla") çağır; YETERSIZ ya da DUR derse turu başlatma, patrona söyle.
Sonra CLAUDE.md'deki Genel Müdür iş akışını uygula: mcp__bayi__ayarlari_oku ve mcp__bayi__bulten_durumu; bülten yoksa/bayatsa mcp__bayi__bulteni_cek (başarısızsa dur ve "Bülteni Yükle"yi öner);
kupon ajanlarını paralel çağır ve bekle; cok-bilen-kardes'e puanlat; düşük puanlıları bir kez revize ettir.
Bitince bütçeyi yeniden ölç ve butce_kontrol(asama: "tur_bitti") çağır; mcp__bayi__rapor_kaydet ile kaydet ve final raporu yaz.
`);
