---
description: Bayi ofisinde kupon turunu başlatır (bütçe kontrolü → bülten → ajanlar → eleştiri → revizyon → rapor)
argument-hint: [ek talimat, örn. "Premier Lig ağırlıklı olsun"]
---

Patronun talimatı: Yarın için kuponları hazırla. $ARGUMENTS

Önce abonelik bütçesini ölç ve mcp__bayi__butce_kontrol(asama: "tur_basla") çağır; YETERSIZ ya da DUR derse turu başlatma, patrona söyle.
Sonra CLAUDE.md'deki Genel Müdür iş akışını uygula: mcp__bayi__ayarlari_oku ve mcp__bayi__bulten_durumu; bülten yoksa/bayatsa mcp__bayi__bulteni_cek (başarısızsa dur ve "Bülteni Yükle"yi öner);
kupon ajanlarını paralel çağır ve bekle; cok-bilen-kardes'e puanlat; düşük puanlıları bir kez revize ettir.
Bitince bütçeyi yeniden ölç ve butce_kontrol(asama: "tur_bitti") çağır; mcp__bayi__rapor_kaydet ile kaydet ve final raporu yaz.
