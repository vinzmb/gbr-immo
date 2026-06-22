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
- **Manuell** → eine Rechnung (z. B. Handwerker) gezielt mit eigenen Anteilen auf
  mehrere Einheiten/Mieter verteilen (Mietername wird angezeigt).
- **Umsatz-** und **Anteilsschlüssel** zusätzlich verfügbar.

## KI & OCR (optional, eigener Anthropic-API-Schlüssel)

- **OCR / Beleg auslesen:** Beim Erfassen eines Belegs die hochgeladene Datei
  (PDF/Bild) automatisch auslesen lassen — Partner, Datum, Betrag, USt, Konto und
  Aufteilung werden vorgeschlagen.
- **KI-Vorschlag aus Text** und **Matching-Vorschläge** im Buchungsstapel.
- Aktivierung in den Einstellungen; Belegdaten werden nur auf Klick gesendet.

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

## Automatisierung

- **DATEV-Buchungen importieren** (UStVA-Seite): bestehenden EXTF-Buchungsstapel
  einlesen; Typ/USt/Vorsteuer werden aus Konto und BU-Schlüssel abgeleitet.
- **Sollstellungen erzeugen** (Buchen-Seite): Miete + NK-Vorauszahlung je aktivem
  Vertrag automatisch als Einnahmen buchen (mit Dedup).
- **Verbrauchsabhängige Umlage** (NK-Assistent): je Kostenposition Schlüssel wählbar
  (Fläche / Verbrauch Heizung / Verbrauch Wasser / Personen / Anteil), Zählerstände je Einheit.
- **ELSTER-XML-Export** der UStVA. Der tatsächliche Versand erfordert zusätzlich die
  ERiC-Bibliothek + ELSTER-Zertifikat (noch nicht enthalten).

## Status & nächste Stufen

Umgesetzt: Stammdaten, Belege (+OCR), Buchen mit Aufteilung (inkl. manuell/mehrere Mieter),
Bankimport + Matching, KI-Assistent, UStVA + DATEV/ELSTER-Export, DATEV-Import,
Sollstellungen, Nebenkostenabrechnung (verbrauchsabhängig), Dokumentenarchiv.

Geplant: tatsächlicher **ELSTER-Versand** (ERiC + Zertifikat), Steuererklärungs-Reports.

> Hinweis: Die App unterstützt die Vorbereitung, ersetzt aber keine Steuerberatung.
> DATEV-Konten und BU-Schlüssel sind mit dem Steuerberater abzustimmen.
