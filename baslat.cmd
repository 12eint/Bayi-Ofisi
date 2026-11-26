@echo off
rem ============================================================
rem  Bayi Ofisi - tek tikla baslat (Windows)
rem  - Ilk calistirmada gerekli paketleri kurar
rem  - Zaten aciksa ikinci kez baslatmaz, sadece tarayiciyi acar
rem  - Bu pencere acik kaldigi surece bayi acik kalir; kapatinca durur
rem ============================================================
title Bayi Ofisi - bu pencereyi kapatma (kapatirsan bayi kapanir)
cd /d "%~dp0"

rem Zaten calisiyor mu?
curl.exe -s -o nul -m 2 http://localhost:3000/api/gm
if %errorlevel%==0 (
  echo Bayi Ofisi zaten acik, tarayici aciliyor...
  start "" http://localhost:3000
  timeout /t 2 >nul
  exit /b
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden Node.js 22 veya ustunu kur.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Ilk kurulum yapiliyor, birkac dakika surebilir...
  call npm install || goto :hata
)
rem Bulten okuyucunun tarayicisi klasorun disinda (kullanici klasorunde) durur; yeni bilgisayarda yoksa kur
node -e "process.exit(require('fs').existsSync(require('playwright').chromium.executablePath())?0:1)" >nul 2>nul
if errorlevel 1 (
  echo Bulten okuyucu icin tarayici bileseni kuruluyor...
  call npx playwright install chromium || goto :hata
)
if not exist .env copy .env.example .env >nul

where claude >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Uyari] Claude Code komut satiri bulunamadi; yapay zeka calismaz.
  echo         Kurmak icin:  npm.cmd install -g @anthropic-ai/claude-code
  echo         Giris icin:   claude.cmd /login
  echo.
)

rem Sunucu hazir olunca tarayiciyi ac (arka planda bekler)
start "" /min cmd /c "for /l %%i in (1,1,30) do (curl.exe -s -o nul -m 1 http://localhost:3000/api/gm && (start "" http://localhost:3000 & exit) & timeout /t 1 >nul)"

echo.
echo  Bayi Ofisi baslatiliyor: http://localhost:3000
echo  Kapatmak icin bu pencereyi kapat.
echo.
call npm start
goto :eof

:hata
echo Kurulum basarisiz. Node.js 22.13+ kurulu mu, internet baglantisi var mi?
pause
