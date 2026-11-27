# 🏪 Bayi Ofisi

İddaa bayisi görünümlü, yerel çalışan, çok agent'lı **kupon ÖNERİSİ** sistemi.
Sen yalnızca **Genel Müdür** ile konuşursun; o işi ofisteki ajanlara dağıtır, eleştirtir, revize ettirir ve sana rapor verir.

> **Bu sistem yalnızca öneri üretir.** Bahis oynamaz, hiçbir siteye giriş yapmaz, kupon sepetine bir şey eklemez, para işlemi yapmaz.
> Bahis risk içerir; belirlediğin bütçeyi aşma.

> ⚠️ **Kurulumdan önce:** iddaa.com üyelik / kullanım sözleşmesini oku ve otomatik okumanın sana uygun olup olmadığını kontrol et.
> Uygun değilse otomatik çekimi hiç kullanma; yalnızca **"Bülteni Yükle"** yedek yöntemiyle çalış.

---

## Kurulum ve çalıştırma

Gereken: **Node.js 22.13 veya üstü** (Node 24 önerilir – yerleşik SQLite kullanılır, ek derleme gerekmez).

**Windows'ta tek tık:** Masaüstündeki **Bayi Ofisi** simgesine çift tıkla (yoksa `kisayol-olustur.cmd` bir kez çalıştırınca oluşur). Kısayol `baslat.cmd`'yi çalıştırır:
- İlk seferde bağımlılıkları ve Playwright tarayıcısını kurar, `.env` dosyasını oluşturur.
- Sunucuyu başlatır, hazır olunca tarayıcıda `http://localhost:3000`'ü açar.
- Bayi zaten açıksa ikinci kez başlatmaz, sadece tarayıcıyı açar.
- Görev çubuğunda küçültülmüş bir "Bayi Ofisi" penceresi açılır; **o pencere açık kaldıkça bayi açıktır**, kapatınca durur.
- Proje klasörünü taşırsan `kisayol-olustur.cmd`'yi yeni yerinden bir kez daha çalıştır.

**Ya da terminalden:**

```bash
npm run setup
```

```bash
npm start
```

Sonra tarayıcıda `http://localhost:3000` adresini aç. Sunucu yalnızca bu bilgisayardan erişilebilir (127.0.0.1).

### Başka bilgisayarda kullanma

1. Bu bilgisayarda bayiyi kapat, **`paketle.cmd`**'ye çift tıkla → masaüstüne `BayiOfisi-paket.zip` gelir (kod + ayarlar + kupon geçmişi; `node_modules` hariç).
2. Diğer bilgisayarda:
   - **Node.js 22.13+** kur (https://nodejs.org, LTS).
   - Zip'i OneDrive ile eşitlenmeyen bir yere aç, örn. `C:\Users\<kullanıcı>\BayiOfisi`.
   - Claude Code'u kur ve **kendi hesabınla** bir kez giriş yap: `npm.cmd install -g @anthropic-ai/claude-code`, sonra `claude.cmd /login`.
   - Klasördeki **`kisayol-olustur.cmd`**'yi bir kez çalıştır → masaüstüne **Bayi Ofisi** simgesi gelir.
   - Simgeye çift tıkla. İlk açılışta paketler ve tarayıcı bileşeni kurulur (birkaç dakika), sonra bayi açılır.

Notlar:
- Aynı Claude hesabını iki bilgisayarda kullanabilirsin; abonelik limitleri hesap başınadır ve iki bilgisayar arasında **ortaktır**. Ayarlar'daki abonelik payı (şu an %35) her bilgisayarda ayrı sayılır, yani ikisini aynı anda yoğun kullanırsan toplamda bu payı geçebilir.
- Kupon geçmişi her bilgisayarda ayrı tutulur (kendiliğinden eşitlenmez); taşımak için tekrar paketle.
- Hesabını ya da kurulu sistemi başkasının kullanımına açma: abonelik girişi yalnızca senin kişisel kullanımın içindir.

### Yapay zekâ: kendi Claude aboneliğinle, sadece sen yazınca (önerilen)

API anahtarı gerekmez. Localhost açıkken bayi ekranındaki **Genel Müdür paneline yazdığın anda** sunucu, resmi **Claude Code** komut satırını kendi aboneliğinle arka planda çalıştırır. Genel Müdür ve ajanlar işini yapar, cevap panele düşer, Claude Code kapanır. **Sen yazmadıkça token harcanmaz.**

Bir kereye mahsus kurulum (Windows'ta PowerShell betikleri kapalıysa `.cmd` sürümlerini kullan):

```bash
npm.cmd install -g @anthropic-ai/claude-code
```

```bash
claude.cmd /login
```

Sonra her seferinde sadece `baslat.cmd` (ya da `npm start`). Sağ üstteki rozet **"● Genel Müdür hazır (Claude)"** yazar; girişin yoksa **"○ Claude girişi yok"** der.

- **Abonelik payı:** Sistem, Claude aboneliğinin 5 saatlik diliminden en fazla ayarlanan payı kullanır (varsayılan **%25**, Ayarlar'dan değişir). Yalnızca Genel Müdür çalışırken artan yüzde sayılır; senin başka Claude kullanımın bu paydan düşmez. Pay dolunca iş durur, mesajlar sırada bekler, dilim sıfırlanınca kendiliğinden işlenir. Rozet: **"Claude payı: X/25"**.
- **Hafıza:** Aynı gün içinde Genel Müdür önceki konuşmaları hatırlar; her yeni gün temiz başlar.
- **Güvenlik:** Mesajın komut satırına değil standart girişe verilir; Genel Müdür'ün dosya, kabuk ve web araçları kapalıdır, yalnızca bayi araçlarını ve ajanları kullanır.
- **Sorun giderme:** Son çalışmanın ham çıktısı `data/cli-son-calisma.jsonl` dosyasındadır.

İstersen aynı ofisi doğrudan Claude Code içinden de kullanabilirsin: proje klasörünü Claude Code'da aç ve **`/kuponlar Premier Lig ağırlıklı olsun`** yaz (`CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.mcp.json` hazır).

### İsteğe bağlı anahtarlar (`.env`)

`.env.example` dosyasını `.env` olarak kopyala:

| Değişken | Ne için | Zorunlu mu |
|---|---|---|
| `API_FOOTBALL_KEY` | Takım formu, son maçlar, sakatlık ([API-Football](https://www.api-football.com/)) | Hayır |
| `ANTHROPIC_API_KEY` | Alternatif: bayi ekranındaki sohbet panelinin de gerçek ofisi (Claude Agent SDK) çalıştırması. Ayrı, kullandıkça ödenen API hesabı gerekir | Hayır |
| `PORT` | Sunucu portu (varsayılan 3000) | Hayır |

**Deneme modu:** Bayi ekranının sohbet paneli, API anahtarı yoksa aynı kural motoru, veritabanı ve arayüzle *kural tabanlı* seçimler yapar. Seçimler gerçek analiz değildir ve fişlerde bu yazar.

**API anahtarıyla maliyet:** Her panel oturumunun harcaması ayarlardaki *Oturum başı Claude bütçesi* (varsayılan 5 USD) ile sınırlıdır.

---

## Kullanım

1. **Bülten**: Bülten tek bir güne bağlı değildir; her çekimde sayfada gelen tüm günlerin maçları kendi günüyle kaydedilir. TV'nin üstündeki gün düğmeleriyle (Bugün, Yarın, sonraki günler) istediğin günün maçlarına bakarsın; *Bülteni Yenile* seçili günün sekmesini de açmaya çalışır. Genel Müdür, istenen gün için maç yoksa/bayatsa kendisi çektirir.
   Kuponu hangi güne istersen ("bu akşam için…", "yarın için…", "cumartesi için…") o günün maçlarından hazırlanır; gün söylemezsen bugün (başlamamış maç kaldıysa), yoksa sonraki gün.
2. **Talimat**: Claude Code'da `/kuponlar Premier Lig ağırlıklı olsun` yaz (API anahtarı varsa sağdaki panelden de olur).
3. **Ofis**: Ajan masalarında canlı durum ("kupon yazıyor…", "eleştiriyor…") ve konuşma balonları görünür. Görünüm üç türlü seçilir: **Düz** (kartlar), **Pixel** (izometrik kıraathane) ve **3D** (Three.js; fareyle sürükleyip döndür, tekerlekle yakınlaş, çift tıkla sıfırla). 3D'de de aynı olaylar oynar: ajan durumları, Risk Kurulu damgası, yazıcıdan çıkan fişler. 3D, tarayıcıda WebGL gerektirir; açılmazsa Pixel kullan.
4. **Fişler**: Her kupon termal fiş olarak basılır; Çok Bilen Kardeş'in puanı damga olarak görünür, "değiştirilmeli" maçlar taralıdır. Fişler ajana göre sekmelere ayrılır (Tümü, Yaşlı Dayı, Hızlı Genç, Beyaz Hayalci), her sekmede güne göre gruplanır. **Resim (PNG)** veya **PDF / Yazdır** ile indirilebilir.
5. **Geçmiş**: Maç skorlarını gir; Maç Sonucu, Çifte Şans, Alt/Üst, KG, Tek/Çift, Toplam Gol ve kombinasyonları otomatik değerlendirilir. Diğer bahisleri satırdan elle işaretle. Ajan karnesi isabet oranını ve (varsayımsal) kâr/zararı gösterir.

### Bülten okuma nasıl çalışır?

- Playwright arka planda (headless) bir Chromium açar ve `https://www.iddaa.com/program/futbol` sayfasını normal bir ziyaretçi gibi yükler.
- Sayfanın **kendi yüklediği** bülten verisini (JSON) dinler; maç kodu, takımlar, lig, saat, tüm maç öncesi bahisler, oranlar ve MBS buradan okunur. Bu başarısız olursa sayfanın HTML'inden okur.
- Yarının tarihi seçilmeye çalışılır; ayrıca maçlar İstanbul saatine göre yarına filtrelenir.
- **Kurallar:** giriş yok, hesap yok, sepete ekleme yok (giriş/sepet/ödeme adreslerine giden istekler engellenir). İki çekim arasında en az **2 saat**, günde en fazla **4** çekim.
- **Maç detayı:** Program sayfası her maç için yalnızca temel bahisleri verir. "1. Yarı ve 2. Yarıda Karşılıklı Gol Olur" gibi pazarlar maçın detayındadır. Her çekimden sonra model bu bahsin en olası olduğu **15 aday maçı** seçer ve yalnızca onların detayını okur (istekler arası ~1,5-2 sn; iddaa 403/429/503 dönerse hemen durur). Bülten tazeyken detay eksikse Genel Müdür `bulten_detay_cek` aracıyla (gün başına saatte en fazla bir kez) okur. Ayar: `settings.js` → `detayCekim`.
- **Bot koruması / CAPTCHA** görülürse aşmaya çalışılmaz: işlem durur ve "Bülteni Yükle" önerilir.
- Okunamayan satırlar *Bülten* sekmesinde nedenleriyle listelenir.

### Dış veri: ESPN (form, bağımsız güç modeli, otomatik sonuç)

- Kaynak: ESPN'in herkese açık veri adresi (`site.api.espn.com`). Yanıtlar `dis_onbellek` tablosunda önbelleklenir (puan durumu 12 saat, takım fikstürü 6 saat, biten günün sonuçları 7 gün).
- **Bağımsız güç modeli:** Puan durumundaki atılan/yenilen gollerden, iddaa oranı kullanılmadan maç olasılıkları (1/0/2, Üst 2.5, KG, iki yarıda KG). Ajanlar bunu `mac_detay` içinde görür ve oran modeliyle karşılaştırır.
- **Takım formu:** `takim_formu` aracı iki takımın puan durumu ve son 6 maçını verir.
- **Otomatik sonuç:** Saatte bir (ve Geçmiş sekmesindeki **Sonuçları ESPN'den getir** düğmesiyle) biten kupon maçlarının skoru **ilk yarı dahil** girilir; İY, İY/MS, 2. yarı ve iki yarıda KG bahisleri de otomatik değerlendirilir. Elle skor girerken ilk yarıyı da yazabilirsin.
- Kapsam: büyük Avrupa ligleri, Türkiye, UEFA kupaları, MLS, Brezilya, Meksika vb. (`server/veri/espn.js` → `LIGLER`). Alt ve egzotik liglerde veri yoktur.
- Not: Bu ağdan football-data.co.uk (erişim engeli), ClubElo veri adresi (zaman aşımı), Understat (hata sayfası), FBref ve Sofascore (403) kullanılamadı.

### Bülteni Yükle (yedek yöntem)

*Bülten* sekmesinde:
- **Kopyala-yapıştır:** iddaa.com bülten sayfasında `Ctrl+A`, `Ctrl+C` → metin alanına yapıştır. (Bu yöntemde MBS görünmez, 1 varsayılır.)
- **Kaydedilmiş sayfa (önerilen):** Tarayıcıda *Farklı kaydet → Web sayfası, tam* → `.html` dosyasını seç. MBS bilgisi dahil okunur.
- **JSON:** Tarayıcı geliştirici araçlarından `sportsbook/events` yanıtını kaydedip seç.

---

## Ofis kadrosu

| | Ajan | Görev | Varsayılan aralık |
|---|---|---|---|
| 🎩 | **Genel Müdür** | Talimatı yorumlar, bülteni kontrol eder, işi dağıtır, eleştirtir, revize ettirir, rapor verir | – |
| 👴 | **Yaşlı Dayı** | Cebindeki son parayı basacak kadar güvendiği maçlar; az maç, net favori | oran 2.00–5.00, 2–4 maç |
| ⚡ | **Hızlı Genç** | Tek hayali zengin olmak; garip bahisler (İY/MS dönüşü, MS+KG, iki yarıda KG...) | oran 300–800, 6–14 maç |
| ☁️ | **Beyaz Hayalci** | Gözden çıkardığı parayla oynar ama kazanmak zorunda: hedef orana en az maçla, en olası sonuçlarla | oran 20–50, 3–7 maç |
| 🎯 | **İnatçı Enişte** | Yalnızca "1. Yarı ve 2. Yarıda Karşılıklı Gol Olur: Evet / Evet" (kodla zorunlu; MBS 2 → en az 2 maç) | oran 30–1000, 2–3 maç |
| 📊 | **Dorasal** (Alt-Üstçü) | Yalnızca Alt/Üst; ESPN'den gol atma/yeme, şut, isabetli şut ve ceza sahası içi şut istatistiğiyle gol beklentisi | oran 2–8, 2–4 maç |
| 🎟️ | **Spor Totocu** | Haftalık 15 maçlık Spor Toto sistemli kolon önerisi; Ayarlar'daki tutar sınırı ve kolon ücretiyle | tutar sınırı (Ayarlar) |
| 🧐 | **Çok Bilen Kardeş** | Eleştirmen; 1–10 puan, "değiştirilmeli" işaretler | – |

Tüm aralıklar, tutarlar, kupon sayıları, tek maç oran sınırı, lig filtreleri, MBS kuralı ve günlük bütçe **Ayarlar** sekmesinden değiştirilir.

**Kurallar kodla uygulanır** (`server/agents/rules.js`): ajanlar oran yazamaz, sadece maç kodu + bahis + seçim gönderir; oranı sistem bültenden okur. Aralık dışı, MBS'ye aykırı (kupondaki maç sayısı < seçimin MBS'si), aynı maçtan iki seçimli, hariç ligden, başlamış maçlı veya günlük bütçeyi aşan kupon **kaydedilmez**.

### Claude Code dosyaları

Ajan kişilikleri ve Genel Müdür talimatı `server/agents/definitions.js` içinde tek kaynaktır. Değiştirdikten sonra `npm run agents:sync` çalıştır; `.claude/agents/*.md`, `CLAUDE.md` ve `.claude/commands/kuponlar.md` yeniden üretilir. Tek bir ajanı da doğrudan çağırabilirsin: *"yasli-dayi ajanıyla yarın için bir kupon hazırla"*.

### Terminal komutları

| Komut | Ne yapar |
|---|---|
| `npm start` | Arayüzü başlatır |
| `npm run ofis -- "Yarın için kuponları hazırla"` | Ofisi arayüzsüz çalıştırır, raporu terminale yazar |
| `npm run bulten:cek` | Bülteni çeker, ilk 10 maçı tablo olarak gösterir (hız limitli) |
| `npm run bulten:kaydet` | Sayfayı bir kez yükleyip ham kaydı `data/snapshots/` altına yazar |
| `npm run bulten:ayristir` | Son kayıt üzerinden ayrıştırıcıyı çalıştırır (`-- --kaynak html\|metin`, `--tarih`, `--kaydet`) |
| `npm test` | Kural motoru, ayrıştırıcı ve sonuç değerlendirme testleri |

---

## Mimari

Ayrıntılı plan ve klasör yapısı: [MIMARI.md](MIMARI.md).

```
public/            arayüz (HTML/CSS/JS, derleme yok)
server/index.js    Express + SSE
server/bulletin/   Playwright okuyucu, JSON/HTML/metin ayrıştırıcılar, SQLite kayıt
server/agents/     kişilikler, kural motoru, araçlar, Genel Müdür (Agent SDK), deneme ofisi
server/stats.js    sonuç değerlendirme, ajan karnesi
data/bayi.db       tüm bülten, kupon, sonuç ve sohbet kayıtları (yerel)
```

### Sorun giderme

- **"Bot koruması algılandı" / "hız limiti"** → Bülten sekmesinden *Bülteni Yükle* ile devam et.
- **Claude Code `mcp__bayi__*` araçlarını görmüyor** → klasörü Claude Code'da açtığından ve `.mcp.json` sunucusunu onayladığından emin ol; `npm install` yapılmış olmalı. Claude Code'u yeniden başlat.
- **Bayi ekranı Claude Code'daki işi göstermiyor** → `npm start` açık olmalı (aynı `data/bayi.db` kullanılır).
- **"Claude'a bağlanılamadı"** (yalnızca API anahtarı modunda) → `.env` içindeki `ANTHROPIC_API_KEY` değerini kontrol et.
- **Site yapısı değişti, maç okunamıyor** → `npm run bulten:kaydet` ile yeni kayıt al, `npm run bulten:ayristir` ile hangi alanların değiştiğine bak (`server/bulletin/parseApi.js`).
- **Sıfırdan başlamak** → sunucuyu durdurup `data/bayi.db` dosyasını sil.
