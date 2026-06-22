@echo off
chcp 65001 >nul
title Bei GitHub anmelden
set "GH=gh"
where gh >nul 2>nul || set "GH=C:\Program Files\GitHub CLI\gh.exe"

echo ============================================================
echo   Einmalige GitHub-Anmeldung fuer GBR-Immo
echo ============================================================
echo.
echo Es oeffnet sich gleich dein Browser. Ablauf:
echo   1) Der nun angezeigte EINMAL-CODE merken/kopieren.
echo   2) ENTER druecken  -^>  Browser oeffnet sich.
echo   3) Code im Browser eingeben und bestaetigen ("Authorize").
echo.
echo Danach dieses Fenster schliessen und dem Assistenten Bescheid geben.
echo ------------------------------------------------------------
echo.

"%GH%" auth login --hostname github.com --git-protocol https --web

echo.
echo ------------------------------------------------------------
"%GH%" auth status
echo.
echo Wenn oben "Logged in to github.com" steht, hat es geklappt.
pause
