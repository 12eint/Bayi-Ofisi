@echo off
rem Masaustune "Bayi Ofisi" kisayolu olusturur (baslat.cmd'yi pixel simgeyle acar).
rem Proje klasorunu tasirsan bu dosyayi yeni yerinden bir kez daha calistir.
cd /d "%~dp0"
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $l=Join-Path $d 'Bayi Ofisi.lnk'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath='%~dp0baslat.cmd'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0public\bayi.ico,0'; $s.Description='Bayi Ofisi - kupon oneri sistemi (localhost:3000)'; $s.WindowStyle=7; $s.Save(); Write-Output ('Kisayol olusturuldu: ' + $l)"
