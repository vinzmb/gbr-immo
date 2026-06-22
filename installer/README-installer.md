# GBR-Immo — Installer bauen & Updates veröffentlichen

Die App bleibt browserbasiert; der Installer richtet alles ein (inkl. mitgeliefertem
Node) und legt Verknüpfungen an. Die Daten liegen unter `%APPDATA%\GBR-Immo` und
bleiben bei Updates/Deinstallation erhalten.

## Einmalig: Werkzeuge
- **Node.js** (zum Bauen): https://nodejs.org
- **Inno Setup 6** (für den Installer): https://jrsoftware.org/isdl.php

## Installer erzeugen
1. `installer\build.bat` ausführen. Das baut die Oberfläche, sammelt alle Dateien in
   `installer\_build` und lädt die Node-Laufzeit dazu.
2. `installer\gbr-immo.iss` mit Inno Setup übersetzen:
   ```
   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\gbr-immo.iss
   ```
   Ergebnis: `installer\Output\GBR-Immo-Setup-1.0.0.exe` — diese Datei weitergeben.

Beim Ausführen installiert sie ohne Adminrechte ins Benutzerprofil und legt
Startmenü-/Desktop-Verknüpfungen an. Start = Verknüpfung anklicken (kein Konsolenfenster).

## Auto-Update veröffentlichen (GitHub Releases)
Die App prüft `https://api.github.com/repos/<benutzer>/<projekt>/releases/latest` und
installiert das `.zip`-Asset selbst (Einstellungen → Version & Updates).

Für ein neues Update:
1. Version in `package.json` erhöhen (z. B. `1.0.1`) und in `installer\gbr-immo.iss`.
2. `installer\build.bat` neu ausführen.
3. Den Inhalt von `installer\_build` als **ZIP** packen, z. B. `GBR-Immo-1.0.1.zip`.
4. Auf GitHub ein **Release** mit Tag `v1.0.1` anlegen und das ZIP als Asset anhängen.

Die App vergleicht die Versionsnummer, lädt das ZIP, tauscht die Programmdateien
(über `update-apply.bat`) und startet neu — der Datenordner bleibt unberührt.

> Hinweis: Ohne kostenpflichtige Code-Signatur zeigt Windows beim ersten Start ggf.
> eine SmartScreen-Warnung („unbekannter Herausgeber"). Das ist normal und lässt sich
> später mit einem Signaturzertifikat entfernen.
