@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GBR-Immo aktualisieren

echo ============================================
echo   GBR-Immo wird aktualisiert
echo   Deine Daten im Ordner "daten" bleiben erhalten.
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [Fehler] Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
  echo.
  pause
  exit /b 1
)

echo Aktualisiere Komponenten ...
call npm install
call npm --prefix client install

echo Baue Oberflaeche neu ...
if exist client\dist rmdir /s /q client\dist
call npm run build

echo.
echo Fertig. Starte die App jetzt mit start.bat.
pause
