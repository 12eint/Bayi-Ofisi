@echo off
rem ============================================================
rem  Bayi Ofisi'ni baska bilgisayara goturmek icin masaustune zip hazirlar.
rem  Dahil: kod, ayarlar, kupon gecmisi (data\bayi.db), Claude Code dosyalari (.claude, .mcp.json, CLAUDE.md)
rem  Haric: node_modules (diger bilgisayarda kendiliginden kurulur), .env, gecici kayitlar
rem ============================================================
cd /d "%~dp0"

rem Bayi aciksa (tarayici kapali olsa bile sunucu arka planda calisiyor olabilir) veritabani kopyalanmadan once kapatilmali
curl.exe -s -o nul -m 2 http://localhost:3000/api/gm
if %errorlevel%==0 (
  echo Bayi Ofisi sunucusu su an calisiyor - tarayiciyi kapatmak sunucuyu kapatmaz.
  choice /c EH /m "Kapatip paketlemeye devam edeyim mi"
  if errorlevel 2 exit /b 1
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>nul
  timeout /t 2 >nul
)

set "GECICI=%TEMP%\BayiOfisi-paket"
if exist "%GECICI%" rmdir /s /q "%GECICI%"
robocopy "%~dp0." "%GECICI%\BayiOfisi" /E /XD node_modules snapshots .git /XF .env cli-son-calisma.jsonl *.zip /NFL /NDL /NJH /NJS /NP >nul
powershell -NoProfile -Command "$z = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BayiOfisi-paket.zip'; if (Test-Path $z) { Remove-Item $z }; Compress-Archive -Path '%GECICI%\BayiOfisi' -DestinationPath $z; Write-Output ('Hazir: ' + $z + '  (' + [math]::Round((Get-Item $z).Length / 1MB, 1) + ' MB)')"
rmdir /s /q "%GECICI%"
echo.
echo Diger bilgisayarda: zip'i ac, BayiOfisi klasorunde once kisayol-olustur.cmd, sonra masaustundeki Bayi Ofisi simgesi.
echo Ayrinti: README.md icinde "Baska bilgisayarda kullanma" bolumu
pause
