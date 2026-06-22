@echo off
REM Beendet die im Hintergrund laufende GBR-Immo-App.
chcp 65001 >nul
title GBR-Immo beenden
echo Beende GBR-Immo ...
taskkill /F /IM node.exe >nul 2>nul
echo Erledigt.
timeout /t 1 /nobreak >nul
