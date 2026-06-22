-- GBR-Immo Datenbank-Schema (SQLite)
-- Alle Beträge in Cent (Integer) speichern, um Rundungsfehler zu vermeiden.

PRAGMA foreign_keys = ON;

-- Mandant / GbR (genau ein Datensatz)
CREATE TABLE IF NOT EXISTS mandant (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  name                 TEXT    NOT NULL DEFAULT '',
  steuernummer         TEXT    NOT NULL DEFAULT '',
  ust_idnr             TEXT    NOT NULL DEFAULT '',
  finanzamt            TEXT    NOT NULL DEFAULT '',
  besteuerungsart      TEXT    NOT NULL DEFAULT 'ist',      -- 'ist' | 'soll'
  voranmeldungszeitraum TEXT   NOT NULL DEFAULT 'quartal',  -- 'monat' | 'quartal' | 'jahr'
  kontenrahmen         TEXT    NOT NULL DEFAULT 'skr04',    -- 'skr04' | 'skr03'
  ki_aktiv             INTEGER NOT NULL DEFAULT 0,
  ki_api_key           TEXT    NOT NULL DEFAULT '',
  erstellt_am          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Objekte (Gebäude / Grundstück)
CREATE TABLE IF NOT EXISTS objekte (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  strasse       TEXT    NOT NULL DEFAULT '',
  plz           TEXT    NOT NULL DEFAULT '',
  ort           TEXT    NOT NULL DEFAULT '',
  gesamtflaeche REAL    NOT NULL DEFAULT 0,  -- m², kann aus Einheiten errechnet werden
  notiz         TEXT    NOT NULL DEFAULT '',
  erstellt_am   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Mieteinheiten
CREATE TABLE IF NOT EXISTS einheiten (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id   INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
  bezeichnung TEXT    NOT NULL,
  flaeche     REAL    NOT NULL DEFAULT 0,        -- m²
  nutzungsart TEXT    NOT NULL DEFAULT 'gewerbe', -- 'gewerbe' | 'wohnen'
  ust_status  TEXT    NOT NULL DEFAULT '19',      -- '19' | '7' | 'frei'
  miteigentumsanteil REAL NOT NULL DEFAULT 0,     -- optionaler Anteilsschlüssel
  notiz       TEXT    NOT NULL DEFAULT '',
  erstellt_am TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Mieter
CREATE TABLE IF NOT EXISTS mieter (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  ansprechpartner TEXT NOT NULL DEFAULT '',
  email       TEXT    NOT NULL DEFAULT '',
  telefon     TEXT    NOT NULL DEFAULT '',
  notiz       TEXT    NOT NULL DEFAULT '',
  erstellt_am TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Mietverträge
CREATE TABLE IF NOT EXISTS mietvertraege (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  einheit_id  INTEGER NOT NULL REFERENCES einheiten(id) ON DELETE CASCADE,
  mieter_id   INTEGER NOT NULL REFERENCES mieter(id) ON DELETE CASCADE,
  nettomiete  INTEGER NOT NULL DEFAULT 0,   -- Cent / Monat
  ust_satz    TEXT    NOT NULL DEFAULT '19', -- '19' | '7' | 'frei'
  beginn      TEXT    NOT NULL DEFAULT '',
  ende        TEXT    NOT NULL DEFAULT '',
  kaution     INTEGER NOT NULL DEFAULT 0,
  aktiv       INTEGER NOT NULL DEFAULT 1,
  erstellt_am TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Kontenrahmen (Konten)
CREATE TABLE IF NOT EXISTS konten (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nummer      TEXT    NOT NULL,
  bezeichnung TEXT    NOT NULL,
  art         TEXT    NOT NULL DEFAULT 'aufwand', -- 'erloes' | 'aufwand' | 'bestand' | 'geld'
  ust_satz    TEXT    NOT NULL DEFAULT '',        -- '', '19', '7', 'frei'
  rahmen      TEXT    NOT NULL DEFAULT 'skr04',
  UNIQUE(nummer, rahmen)
);

-- Belege (Rechnungen/Quittungen, Eingang & Ausgang)
CREATE TABLE IF NOT EXISTS belege (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  art           TEXT    NOT NULL DEFAULT 'eingang', -- 'eingang' (Kosten) | 'ausgang' (Erlös)
  datum         TEXT    NOT NULL,
  beleg_nr      TEXT    NOT NULL DEFAULT '',
  partner       TEXT    NOT NULL DEFAULT '',        -- Lieferant / Mieter
  betrag_brutto INTEGER NOT NULL DEFAULT 0,         -- Cent
  beschreibung  TEXT    NOT NULL DEFAULT '',
  kategorie     TEXT    NOT NULL DEFAULT '',
  datei_pfad    TEXT    NOT NULL DEFAULT '',
  datei_hash    TEXT    NOT NULL DEFAULT '',
  ocr_text      TEXT    NOT NULL DEFAULT '',
  status        TEXT    NOT NULL DEFAULT 'offen',    -- 'offen' | 'gebucht'
  erstellt_am   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Buchungen
CREATE TABLE IF NOT EXISTS buchungen (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  datum           TEXT    NOT NULL,
  beleg_id        INTEGER REFERENCES belege(id) ON DELETE SET NULL,
  typ             TEXT    NOT NULL,             -- 'einnahme' | 'ausgabe'
  konto           TEXT    NOT NULL DEFAULT '',  -- SKR-Konto (Erlös/Aufwand)
  gegenkonto      TEXT    NOT NULL DEFAULT '',  -- z.B. Bank
  betrag_brutto   INTEGER NOT NULL DEFAULT 0,   -- Cent
  ust_satz        TEXT    NOT NULL DEFAULT '19',-- '19' | '7' | 'frei'
  ust_betrag      INTEGER NOT NULL DEFAULT 0,   -- Cent (USt bzw. Vorsteuer gesamt)
  vorsteuer_abziehbar INTEGER NOT NULL DEFAULT 0, -- Cent (nur Ausgaben)
  steuerschluessel TEXT   NOT NULL DEFAULT '',
  buchungstext    TEXT    NOT NULL DEFAULT '',
  aufteilung_modus TEXT   NOT NULL DEFAULT 'direkt', -- 'direkt' | 'flaeche' | 'umsatz' | 'anteil' | 'keine'
  einheit_id      INTEGER REFERENCES einheiten(id) ON DELETE SET NULL, -- bei 'direkt'
  periode         TEXT    NOT NULL DEFAULT '',  -- z.B. '2026-Q2'
  storniert       INTEGER NOT NULL DEFAULT 0,
  festgeschrieben INTEGER NOT NULL DEFAULT 0,
  erstellt_am     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Aufteilungs-Splits einer Buchung auf Einheiten
CREATE TABLE IF NOT EXISTS buchung_splits (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  buchung_id          INTEGER NOT NULL REFERENCES buchungen(id) ON DELETE CASCADE,
  einheit_id          INTEGER REFERENCES einheiten(id) ON DELETE SET NULL,
  anteil_prozent      REAL    NOT NULL DEFAULT 0,
  betrag_brutto       INTEGER NOT NULL DEFAULT 0,
  ust_betrag          INTEGER NOT NULL DEFAULT 0,
  vorsteuer_abziehbar INTEGER NOT NULL DEFAULT 0,
  ust_status          TEXT    NOT NULL DEFAULT '19'
);

-- Bankkonten
CREATE TABLE IF NOT EXISTS bank_konten (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  iban        TEXT    NOT NULL DEFAULT '',
  erstellt_am TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Bankumsätze (importiert)
CREATE TABLE IF NOT EXISTS bank_umsaetze (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_konto_id   INTEGER REFERENCES bank_konten(id) ON DELETE CASCADE,
  datum           TEXT    NOT NULL,
  betrag          INTEGER NOT NULL DEFAULT 0,  -- Cent, negativ = Ausgang
  verwendungszweck TEXT   NOT NULL DEFAULT '',
  gegenpartei     TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'offen', -- 'offen' | 'erledigt' | 'ignoriert'
  buchung_id      INTEGER REFERENCES buchungen(id) ON DELETE SET NULL,
  import_hash     TEXT    NOT NULL DEFAULT '',
  erstellt_am     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(import_hash)
);

-- USt-Voranmeldungen (festgeschriebene Meldungen)
CREATE TABLE IF NOT EXISTS ustva_meldungen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  periode       TEXT    NOT NULL,  -- '2026-Q2' / '2026-03' / '2026'
  von           TEXT    NOT NULL,
  bis           TEXT    NOT NULL,
  kz81          INTEGER NOT NULL DEFAULT 0, -- BMG 19%
  kz86          INTEGER NOT NULL DEFAULT 0, -- BMG 7%
  ust_19        INTEGER NOT NULL DEFAULT 0,
  ust_7         INTEGER NOT NULL DEFAULT 0,
  kz66          INTEGER NOT NULL DEFAULT 0, -- Vorsteuer
  kz83          INTEGER NOT NULL DEFAULT 0, -- Zahllast/Überschuss
  steuerfrei    INTEGER NOT NULL DEFAULT 0, -- nachrichtlich
  status        TEXT    NOT NULL DEFAULT 'entwurf', -- 'entwurf' | 'festgeschrieben'
  erstellt_am   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(periode)
);

-- Dokumentenarchiv (Verträge, Grundbuch, Versicherungen ...)
CREATE TABLE IF NOT EXISTS dokumente (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  titel       TEXT    NOT NULL,
  kategorie   TEXT    NOT NULL DEFAULT 'sonstiges',
  objekt_id   INTEGER REFERENCES objekte(id) ON DELETE SET NULL,
  datei_pfad  TEXT    NOT NULL DEFAULT '',
  datei_hash  TEXT    NOT NULL DEFAULT '',
  notiz       TEXT    NOT NULL DEFAULT '',
  erstellt_am TEXT    NOT NULL DEFAULT (datetime('now'))
);
