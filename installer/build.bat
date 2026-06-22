@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
echo ============================================
echo   GBR-Immo: Installer-Paket bauen
echo ============================================

echo [1/4] App-Komponenten installieren und Oberflaeche bauen ...
call npm install
call npm --prefix client install
call npm run build

echo [2/4] Build-Ordner vorbereiten ...
set BUILD=installer\_build
if exist "%BUILD%" rmdir /s /q "%BUILD%"
mkdir "%BUILD%\runtime"

echo [3/4] Dateien zusammenstellen ...
robocopy server "%BUILD%\server" /E >nul
robocopy client\dist "%BUILD%\client\dist" /E >nul
robocopy node_modules "%BUILD%\node_modules" /E >nul
copy package.json "%BUILD%\" >nul
copy start.bat "%BUILD%\" >nul
copy update.bat "%BUILD%\" >nul
copy update-apply.bat "%BUILD%\" >nul
copy README.md "%BUILD%\" >nul
copy installer\launch.vbs "%BUILD%\" >nul
copy installer\stop.bat "%BUILD%\" >nul

echo [4/4] Node-Laufzeit herunterladen ...
set NODEVER=v24.16.0
set NODEPKG=node-%NODEVER%-win-x64
powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/%NODEVER%/%NODEPKG%.zip' -OutFile '%TEMP%\gbr-node.zip'"
if errorlevel 1 ( echo [Fehler] Node-Download fehlgeschlagen. & pause & exit /b 1 )
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%TEMP%\gbr-node.zip' -DestinationPath '%TEMP%\gbr-node' -Force"
copy "%TEMP%\gbr-node\%NODEPKG%\node.exe" "%BUILD%\runtime\node.exe" >nul
rmdir /s /q "%TEMP%\gbr-node"
del "%TEMP%\gbr-node.zip"

echo.
echo Fertig: installer\_build enthaelt die komplette App inkl. Node.
echo.
echo Naechster Schritt - Installer erzeugen (Inno Setup noetig):
echo   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\gbr-immo.iss
echo Ergebnis: installer\Output\GBR-Immo-Setup-1.0.0.exe
echo.
echo Fuer ein Auto-Update-Release zusaetzlich installer\_build als ZIP packen
echo und als Release-Asset (z.B. GBR-Immo-1.0.0.zip) auf GitHub hochladen.
endlocal
pause
