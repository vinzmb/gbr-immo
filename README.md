# GBR-Immo

Lokale Verwaltung einer deutschen Grundstücks-GbR mit Schwerpunkt **Finanzbuchhaltung**
und **Umsatzsteuer-Voranmeldung** — inklusive anteiliger Beleg-Aufteilung (Vorsteuerquote),
Belegarchiv, Bankimport, KI-Belegassistent und DATEV-Export.

Alle Daten bleiben **lokal auf diesem PC** (Ordner `daten/`).

## Starten

Doppelklick auf **`start.bat`**. Beim ersten Start werden Komponenten installiert und die
Oberfläche gebaut (dauert einen Moment). Danach öffnet sich der Browser automatisch unter
`http://localhost:3000`. Das Konsolenfenster bitte geöffnet lassen, solange du arbeitest.

Voraussetzung: [Node.js](https://nodejs.org) Version 22 oder neuer.

## Erste Schritte

1. **Einstellungen** → GbR-Daten, Besteuerungsart (Ist/Soll), Voranmeldungszeitraum.
2. **Objekte & Mieter** → Gebäude, Mieteinheiten (Fläche + USt-Status), Mieter, Verträge.
3. **Belege** erfassen (mit Datei-Upload und optionalem KI-Vorschlag) und verbuchen.
4. **Bank** → Kontoumsätze importieren (CSV / CAMT.053 / MT940) und im Posteingang abarbeiten.
5. **Buchen** → Ausgaben/Einnahmen mit Live-Aufteilung der Vorsteuer.
6. **USt-Voranmeldung** → Kennzahlen prüfen, festschreiben, DATEV-Buchungsstapel exportieren.

## Die Aufteilungs-Logik (Kern)

- **Direkte Zuordnung** zu einer Einheit → Vorsteuer 100 % / 0 % je nach USt-Status.
- **Flächenschlüssel** für Gemeinkosten → abziehbare Vorsteuer = steuerpflichtig
  vermietete Fläche ÷ Gesamtfläche.
- **Umsatz-** und **Anteilsschlüssel** zusätzlich verfügbar.

## Projektstruktur

```
server/           Backend (Fastify + node:sqlite)
  index.js        API
  db.js           Datenbank & SKR04-Konten
  schema.sql      Tabellen
  lib/steuer.js   USt-/Aufteilungs-Engine  (+ steuer.test.mjs)
  lib/datev.js    DATEV-Export
  lib/bankimport.js  CSV/CAMT/MT940-Parser
  lib/ki.js       KI-Belegklassifizierung (Anthropic-API)
client/           Oberfläche (React + Vite + Tailwind)
daten/            lokale Datenbank, Belege, Backups (nicht im Git)
docs/             Design-Spezifikation
```

## Tests

```
node server/lib/steuer.test.mjs
```

## Status & nächste Stufen

Stufe 1 (umgesetzt): Stammdaten, Belege, Buchen mit Aufteilung, Bankimport,
KI-Assistent, UStVA-Berechnung, DATEV-Export, Dokumentenarchiv.

Geplant: erweiterte Steuererklärungs-Reports, OCR-Auslesung, **ELSTER-Direktversand**.

> Hinweis: Die App unterstützt die Vorbereitung, ersetzt aber keine Steuerberatung.
> DATEV-Konten und BU-Schlüssel sind mit dem Steuerberater abzustimmen.
