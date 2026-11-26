---
description: Genel Müdür nöbeti – bayi ekranındaki sohbet panelini düzenli kontrol eden döngüyü başlatır
---

Patron, bayi ekranındaki sohbet panelinin sürekli yapay zekâya bağlı kalmasını ve bu sistemin aboneliğin 5 saatlik diliminin en fazla %35'ini kullanmasını istiyor.
1. Bu oturumda zaten çalışan bir /gelen-kutusu döngüsü varsa yenisini kurma.
2. "loop" becerisini (Skill aracı) args = "5m /gelen-kutusu" ile çağırarak döngüyü başlat.
3. Bütçeyi hemen ölç (mcp__ccd_session_mgmt__get_usage → mcp__bayi__butce_kontrol), ilk kontrolü yap (mcp__bayi__gelen_mesajlari_al) ve patrona tek satırla "Nöbetteyim patron, panel bağlı. Pay: X/35." yaz.
