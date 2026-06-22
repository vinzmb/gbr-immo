@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GBR-Immo

echo ============================================
echo   GBR-Immo wird gestartet ...
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [Fehler] Node.js wurde nicht gefunden.
  echo Bitte Node.js 22 oder neuer installieren: https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installiere Server-Komponenten ... (einmalig^)
  call npm install
)

if not exist client\node_modules (
  echo Installiere Oberflaechen-Komponenten ... (einmalig^)
  call npm --prefix client install
)

if not exist client\dist (
  echo Baue Oberflaeche ... (einmalig^)
  call npm run build
)

echo.
echo GBR-Immo laeuft. Das Fenster bitte geoeffnet lassen.
echo Der Browser oeffnet sich automatisch. Zum Beenden dieses Fenster schliessen.
echo.
node server/index.js
pause
