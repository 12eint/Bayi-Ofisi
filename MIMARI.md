# Bayi Ofisi – Mimari Plan

> Bu sistem yalnızca kupon **önerisi** üretir. Bahis oynamaz, hiçbir siteye giriş yapmaz, para işlemi yapmaz.

## Genel bakış

```
 Tarayıcı (localhost:3000)                Node.js sunucu (Express)
 ┌──────────────────────────┐   REST    ┌────────────────────────────────────────┐
 │ TV bülten panosu         │◄────────► │ /api/bulten  /api/ayarlar  /api/kupon  │
 │ Ofis (agent masaları)    │   SSE     │ /api/gecmis  /api/sohbet  /api/olaylar │
 │ Termal fişler            │◄───────── │                                        │
 │ Genel Müdür sohbeti      │           │  Bülten modülü ── Playwright (headless)│──► iddaa.com/program/futbol
 │ Geçmiş / istatistik      │           │       └─ yedek: metin / HTML / JSON    │
 └──────────────────────────┘           │  Ofis modülü ── Claude Agent SDK       │──► Claude API
                                        │    Genel Müdür (ana agent, query())    │
                                        │     ├─ yasli-dayi        (subagent)    │
                                        │     ├─ hizli-genc        (subagent)    │
                                        │     ├─ beyaz-hayalci     (subagent)    │
                                        │     └─ cok-bilen-kardes  (subagent)    │
                                        │    "bayi" MCP araçları (süreç içi)     │
                                        │  Kural motoru (kod ile, LLM'e bırakılmaz)│
                                        │  SQLite (node:sqlite) data/bayi.db     │
                                        └────────────────────────────────────────┘
```

## Temel tasarım kararları

1. **Sade frontend**: Derleme adımı olmayan HTML + CSS + vanilla JS. Express aynı porttan sunar. Tek komut: `npm start`.
2. **Veritabanı**: Node 24'ün yerleşik `node:sqlite` modülü — native derleme yok, Windows'ta sorunsuz.
3. **Kurallar kodda**: Agent'lar oran yazamaz. Kupon teklif aracına sadece `maç kodu + bahis + seçim` gönderirler; oranı sunucu bültenden okur, toplam oranı hesaplar ve şu kuralları kontrol eder:
   - maç bültende var mı, oran hâlâ geçerli mi
   - tek maç min/max oranı, agent'ın toplam oran ve maç sayısı aralığı
   - lig filtresi (dahil/hariç)
   - **MBS**: kupondaki maç sayısı ≥ seçilen her bahsin MBS değeri
   - aynı maçtan iki seçim yok
   - günlük bütçe: o günün aktif kuponlarının toplam tutarı limiti aşamaz
   Kurala uymayan teklif reddedilir, gerekçesi agent'a döner (Genel Müdür'ün "reddetmesi" kod düzeyinde garanti).
4. **Agent'lar**: Kişilikler `server/agents/definitions.js` içinde tek kaynak. Aynı tanımlar `npm run agents:sync` ile `.claude/agents/*.md` dosyalarına yazılır (Claude Code terminalinden çağırmak için).
5. **Araçlar** (`mcp__bayi__*`, süreç içi MCP sunucusu):
   | Araç | Kim kullanır | Ne yapar |
   |---|---|---|
   | `bulten_durumu` | Genel Müdür | Son bülten zamanı, maç sayısı, tazelik |
   | `bulteni_cek` | Genel Müdür | Playwright ile çekim (hız limitli; CAPTCHA'da durur) |
   | `bulten_listele` | Tüm agent'lar | Filtreli maç/oran listesi (lig, oran aralığı, bahis türü) |
   | `takim_formu` | Tüm agent'lar | (İsteğe bağlı) İstatistik API'sinden form/sakatlık |
   | `kupon_teklif_et` | Kupon agent'ları | Kuralları doğrular, kaydeder, fiş no döner |
   | `kuponlari_getir` | Genel Müdür, Kardeş | O turun kuponları |
   | `kupon_puanla` | Çok Bilen Kardeş | 1-10 puan + "değiştirilmeli" maçlar |
   | `ofiste_konus` | Herkes | Arayüzdeki konuşma balonu |
6. **Canlı ofis**: SDK mesaj akışından `Agent` tool çağrıları ve `parent_tool_use_id` izlenir → SSE ile "kupon yazıyor… / eleştiriyor…" durumları arayüze gider.
7. **Bülten okuma**: Playwright sayfayı normal ziyaretçi gibi açar; sayfanın kendi yüklediği JSON yanıtlarını dinler (en sağlam yöntem), olmazsa DOM'dan okur. Ertesi günün tarihi seçilir, maçlar İstanbul saatine göre filtrelenir. Kurallar: giriş yok, sepete ekleme yok, minimum 2 saat aralık, günde en fazla 4 çekim, CAPTCHA/bot koruması görülürse **durur** ve "Bülteni Yükle"yi önerir.
8. **Demo modu**: API anahtarı yoksa "Deneme ofisi" kural tabanlı basit seçimlerle aynı araç zincirini çalıştırır; arayüz ve veritabanı anahtarsız da test edilebilir.

## Klasör yapısı

```
bayi-ofisi/
├─ package.json            npm start | npm run setup | bulten:cek | ofis
├─ .env.example            ANTHROPIC_API_KEY, API_FOOTBALL_KEY, PORT, MODEL
├─ MIMARI.md / README.md
├─ .claude/agents/         yasli-dayi.md, hizli-genc.md, beyaz-hayalci.md, cok-bilen-kardes.md
├─ server/
│  ├─ index.js             Express, REST, SSE
│  ├─ db.js                SQLite şema + yardımcılar
│  ├─ settings.js          varsayılan ayarlar
│  ├─ events.js            SSE yayın kanalı
│  ├─ stats.js             isabet / kâr-zarar
│  ├─ bulletin/
│  │  ├─ scraper.js        Playwright çekici (+ hız limiti, CAPTCHA tespiti)
│  │  ├─ parseApi.js       yakalanan JSON → normalize maç
│  │  ├─ parseText.js      yapıştırılan metin / kayıtlı HTML ayrıştırıcı
│  │  └─ store.js          bülteni DB'ye yazar
│  └─ agents/
│     ├─ definitions.js    kişilikler (tek kaynak)
│     ├─ rules.js          kupon doğrulama (saf fonksiyon)
│     ├─ tools.js          MCP araçları
│     ├─ orchestrator.js   Genel Müdür (Agent SDK query)
│     └─ demo.js           anahtarsız deneme ofisi
├─ scripts/                fetch-bulletin, parse-snapshot, office-cli, sync-agents
├─ public/                 index.html, styles.css, app.js
├─ tests/                  kural motoru ve ayrıştırıcı testleri
└─ data/                   bayi.db, snapshots/ (yerel, paylaşılmaz)
```

## Veritabanı (özet)

- `bultenler` (id, tarih, kaynak, cekilme_zamani, mac_sayisi, hatali_satir_sayisi)
- `maclar` (bulten_id, mac_kodu, event_id, lig, ev, deplasman, baslama, durum)
- `oranlar` (mac_id, bahis, secim, oran, mbs)
- `hatali_satirlar` (bulten_id, satir, neden)
- `oturumlar` (talimat, durum, rapor, maliyet)
- `kuponlar` (oturum_id, ajan, tarih, tutar, toplam_oran, olasi_kazanc, durum, puan, elestiri, risk, revize_of)
- `kupon_secimleri` (kupon_id, mac_kodu, bahis, secim, oran, mbs, gerekce, sonuc)
- `ayarlar` (anahtar, deger JSON)

## Önerilen istatistik API'si (isteğe bağlı)

**API-Football (api-sports.io)** — ücretsiz katmanı günde 100 istek; form, sakatlık, son maçlar, H2H uçları var. Anahtar `.env` içinde `API_FOOTBALL_KEY`. Anahtar yoksa `takim_formu` aracı "veri yok" döner ve agent'lar gerekçelerini yalnızca oran/lig bilgisine dayandırır (bunu açıkça yazarlar).
