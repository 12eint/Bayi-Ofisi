---
description: Bayi ekranındaki sohbet panelinden gelen mesajları bir kez kontrol eder ve cevaplar
---

mcp__bayi__gelen_mesajlari_al çağır.
- "YOK" dönerse başka hiçbir şey yapma ve yalnızca "Kutu boş." yaz.
- "YOK – BÜTÇE KONTROLÜ ZAMANI" dönerse yalnızca bütçeyi ölç (mcp__ccd_session_mgmt__get_usage → mcp__bayi__butce_kontrol), başka bir şey yapma, tek satır yaz.
- "BÜTÇE DOLU" dönerse aracın söylediğini yap ve turu bitir.
- Mesaj varsa önce bütçeyi ölç; DEVAM ise CLAUDE.md'deki GELEN KUTUSU ve ABONELİK BÜTÇESİ kurallarına göre her birini işle ve cevabını panele yaz (cevap_yaz ya da kupon turuysa rapor_kaydet, ikisinde de mesaj_id ver).
