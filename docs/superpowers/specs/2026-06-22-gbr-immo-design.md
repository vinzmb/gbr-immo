# GBR-Immo — Design & Spezifikation

**Datum:** 2026-06-22
**Status:** freigegeben (Konzept), Umsetzung Stufe 1 begonnen

## Zweck

Lokale Web-App zur Verwaltung einer deutschen Grundstücks-GbR mit Schwerpunkt
Finanzbuchhaltung. Kernaufgabe ist die **Umsatzsteuer-Voranmeldung (UStVA)** für
Gewerbegebäude mit mehreren Mietern und unterschiedlichen USt-Sätzen, inklusive
**anteiliger Aufteilung von Belegen** auf die Mieteinheiten (Vorsteuerabzugsquote).
Ergänzend: Beleg- und Dokumentenverwaltung, Steuer-Auswertungen, **KI-gestützte
Belegzuordnung**, **Bankumsatz-Import mit Abarbeiten-Workflow**, Export nach **DATEV**
und perspektivisch **ELSTER**.

## Rahmenentscheidungen (mit dem Nutzer abgestimmt)

- **Plattform:** Lokale Web-App auf Windows-PC, Bedienung im Browser unter `localhost`.
  Alle Daten bleiben lokal (Datei-Datenbank). Start per `start.bat`.
- **Nutzer:** Einzelnutzer, kein Login-/Rechtesystem nötig.
- **DATEV:** Export als DATEV-Buchungsstapel (EXTF-CSV) — sofort.
- **ELSTER:** Direktversand gewünscht, aber als **letzte Stufe** (ERiC/Zertifikat).
  UStVA-Kennzahlen werden so erzeugt, dass daraus später die ELSTER-XML entsteht.
- **USt-Sätze Einnahmen:** 19 % (gewerblich mit Option §9 UStG), 7 % (ermäßigt),
  steuerfrei (§4 Nr. 12 UStG).
- **Aufteilung:** direkte Zuordnung zu einer Einheit, Flächenschlüssel für Gemeinkosten,
  zusätzlich Umsatz- und Anteilsschlüssel.
- **Besteuerungsart:** konfigurierbar, Standard **Ist-Versteuerung (§20 UStG)**.
- **Voranmeldungszeitraum:** frei wählbar (Monat / Quartal / Jahr).
- **Kontenrahmen:** SKR 04 als Standard, konfigurierbar.

## Technische Architektur

- **Backend:** Node.js (Fastify) + eingebautes `node:sqlite` (keine nativen Zusatzdeps).
- **Frontend:** React + TypeScript + Vite + Tailwind CSS, handgefertigte Komponenten,
  deutschsprachig, professionell und selbsterklärend.
- **Datenablage:** Ordner `daten/` mit SQLite-DB (`gbr-immo.db`) und Belegdateien
  (`daten/belege/`). GoBD-Gedanke: Belegdateien werden unveränderbar abgelegt
  (Hash, Zeitstempel), Buchungen erhalten Storno statt Löschung.
- **Start:** `start.bat` → `node server/index.js`; Server liefert gebautes Frontend
  und API unter `http://localhost:3000`, öffnet den Browser.
- **Backup:** automatische Kopie der DB beim Start nach `daten/backups/`.

## Module

### 1. Stammdaten
- **Mandant/GbR:** Name, Steuernummer, USt-IdNr., Finanzamt, Besteuerungsart
  (Soll/Ist), Voranmeldungszeitraum, Kontenrahmen.
- **Objekte:** Gebäude/Grundstück, Adresse, Gesamtfläche (m²).
- **Mieteinheiten:** Bezeichnung, Fläche (m²), Nutzungsart (Gewerbe/Wohnen),
  USt-Status (19 % Option / 7 % / steuerfrei).
- **Mieter & Mietverträge:** Mieter, Einheit, Nettomiete, USt-Satz, Zeitraum, Kaution.

### 2. Belege & Dokumente
- Upload (PDF/Bild), unveränderbares Archiv (Hash, Zeitstempel), Kategorien.
- Verknüpfung Beleg ↔ Buchung. OCR-Textauslesung als Komfortstufe.
- Dokumentenarchiv (Verträge, Grundbuch, Versicherungen) mit Kategorien.

### 3. Buchhaltung
- Kontenrahmen SKR 04 (Default), Konten, Steuerschlüssel (BU).
- Buchungen: Einnahmen (Miete + USt), Ausgaben (Beleg + Vorsteuer).
- Storno statt Löschung; Belegnummernkreis.

### 4. Aufteilungs-Engine (Kernstück)
Pro Beleg wählbarer Aufteilungsmodus:
- **Direkte Zuordnung** zu einer Einheit → Vorsteuer 100 % / 0 % je USt-Status.
- **Flächenschlüssel** (Gemeinkosten) → abziehbare Vorsteuerquote =
  steuerpflichtig vermietete Fläche ÷ Gesamtfläche.
- **Umsatzschlüssel** und **Miteigentumsanteil** als weitere Optionen.
Engine zeigt transparent je Beleg: Bruttobetrag, enthaltene USt, abziehbare
Vorsteuer, Aufteilung pro Einheit.

### 5. USt-Voranmeldung
- Zeitraum frei wählbar (Monat/Quartal/Jahr).
- Automatische Kennzahlen: Kz 81 (19 %), Kz 86 (7 %), steuerfreie Umsätze,
  Vorsteuer Kz 66, Zahllast Kz 83.
- Vorschau, Plausibilitätsprüfung, Festschreibung je Zeitraum.

### 6. Steuer & Auswertungen
- V+V-Überschussrechnung pro Objekt/Einheit, Mietenliste, offene Posten,
  Jahresdaten für die Steuererklärung.

### 7. KI-Belegzuordnung
- Opt-in mit eigenem API-Schlüssel (Anthropic). Belegtext (aus PDF/OCR) wird zur
  Klassifizierung gesendet; KI schlägt Konto, USt-Satz, Aufteilungsmodus, Einheit
  und Betrag vor. Nutzer bestätigt/korrigiert. Vorschläge werden protokolliert.

### 8. Bankumsatz-Import & Abarbeiten
- Import von Kontoumsätzen: CSV (universell), CAMT.053 (SEPA-XML), MT940.
- „Posteingang": offene Umsätze werden Belegen/Buchungen zugeordnet (KI schlägt
  Matching vor), als erledigt markiert. Statusverfolgung (offen/erledigt).

### 9. Export/Schnittstellen
- DATEV-Buchungsstapel (EXTF-CSV) — Stufe 1.
- ELSTER-Direktversand — Stufe 3.
- PDF-Reports.

## Datenfluss

Beleg erfassen (manuell oder Bankimport) → KI-Vorschlag → Buchung mit
Aufteilungs-Splits → Engine berechnet abziehbare Vorsteuer → Aggregation pro
Zeitraum → UStVA-Kennzahlen → Export (DATEV jetzt / ELSTER später).

## Umsetzung in Stufen

- **Stufe 1:** Stammdaten + Belege + Buchung + Aufteilungs-Engine +
  UStVA-Berechnung + Bankimport + KI-Belegzuordnung + DATEV-Export + Oberfläche.
- **Stufe 2:** Dokumentenarchiv (erweitert), Steuererklärungs-Reports, OCR.
- **Stufe 3:** ELSTER-Direktversand.

## Nicht-Ziele (vorerst)

- Mehrbenutzer/Rechte, Cloud-Hosting.
- Vollständige doppelte Buchführung mit Bilanz (V+V = Überschussrechnung).
- Lohnbuchhaltung, Mahnwesen.

## Risiken

- **ELSTER/ERiC:** hoher Aufwand, daher letzte Stufe.
- **DATEV-Format:** exakte Feldbelegung (Steuerschlüssel/BU) muss zum
  Mandanten-Setup des Steuerberaters passen — konfigurierbar halten.
- **Steuerliche Korrektheit:** App unterstützt, ersetzt aber keine
  Steuerberatung; Berechnungen transparent und nachvollziehbar darstellen.
