@echo off
REM Wird von der App beim Auto-Update gestartet.
REM %1 = entpacktes Update (Quelle), %2 = Installationsordner (Ziel)
chcp 65001 >nul
title GBR-Immo Update

REM Kurz warten, bis sich die App beendet hat und Dateien frei sind.
timeout /t 2 /nobreak >nul

REM Programmdateien ersetzen; der Datenordner (daten) bleibt unberuehrt.
robocopy "%~1" "%~2" /E /XD daten /R:3 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP >nul

REM App neu starten (installierte Variante bevorzugt den eigenen Starter).
if exist "%~2\launch.vbs" (
  start "" wscript "%~2\launch.vbs"
) else (
  start "" "%~2\start.bat"
)
exit
