// Datenbank-Setup mit dem eingebauten node:sqlite (Node >= 22.5).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATEN_DIR = join(ROOT, 'daten');
const BELEGE_DIR = join(DATEN_DIR, 'belege');
const BACKUP_DIR = join(DATEN_DIR, 'backups');
const DB_PFAD = join(DATEN_DIR, 'gbr-immo.db');

export const Pfade = { ROOT, DATEN_DIR, BELEGE_DIR, BACKUP_DIR, DB_PFAD };

function ordnerSicherstellen() {
  for (const d of [DATEN_DIR, BELEGE_DIR, BACKUP_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

function backupAnlegen() {
  if (!existsSync(DB_PFAD)) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const ziel = join(BACKUP_DIR, `gbr-immo-${stamp}.db`);
  try {
    copyFileSync(DB_PFAD, ziel);
  } catch {
    /* Backup ist best-effort */
  }
}

let db;

export function getDb() {
  if (db) return db;
  ordnerSicherstellen();
  backupAnlegen();
  db = new DatabaseSync(DB_PFAD);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migriere(db);
  seed(db);
  return db;
}

// Sanfte Migrationen für bestehende Datenbanken (Spalten nachrüsten).
function migriere(db) {
  const spalten = (tabelle) => db.prepare(`PRAGMA table_info(${tabelle})`).all().map((r) => r.name);
  const ergaenze = (tabelle, spalte, definition) => {
    if (!spalten(tabelle).includes(spalte)) {
      db.exec(`ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${definition}`);
    }
  };
  ergaenze('dokumente', 'mieter_id', 'INTEGER');
  ergaenze('dokumente', 'einheit_id', 'INTEGER');
  ergaenze('dokumente', 'datum', "TEXT NOT NULL DEFAULT ''");
  ergaenze('mietvertraege', 'nk_vorauszahlung', 'INTEGER NOT NULL DEFAULT 0');
  ergaenze('buchungen', 'umlagefaehig', 'INTEGER');
  ergaenze('buchungen', 'nk_art', "TEXT NOT NULL DEFAULT ''");
}

function seed(db) {
  // Mandant-Grunddatensatz
  const m = db.prepare('SELECT COUNT(*) AS n FROM mandant').get();
  if (m.n === 0) {
    db.prepare('INSERT INTO mandant (id, name) VALUES (1, ?)').run('Meine Grundstücks-GbR');
  }
  // SKR04-Standardkonten (Auswahl für Vermietung)
  const k = db.prepare('SELECT COUNT(*) AS n FROM konten').get();
  if (k.n === 0) {
    const insert = db.prepare(
      'INSERT INTO konten (nummer, bezeichnung, art, ust_satz, rahmen) VALUES (?, ?, ?, ?, ?)'
    );
    for (const row of SKR04_KONTEN) insert.run(row[0], row[1], row[2], row[3], 'skr04');
  }
}

// Auswahl gängiger SKR04-Konten für eine vermietende GbR
const SKR04_KONTEN = [
  // Erlöse
  ['4860', 'Grundstückserträge (Vermietung) 19% USt', 'erloes', '19'],
  ['4861', 'Grundstückserträge (Vermietung) 7% USt', 'erloes', '7'],
  ['4862', 'Grundstückserträge (Vermietung) steuerfrei §4 Nr.12', 'erloes', 'frei'],
  ['4863', 'Umlagen / Nebenkosten 19% USt', 'erloes', '19'],
  ['4865', 'Umlagen / Nebenkosten steuerfrei', 'erloes', 'frei'],
  // Aufwendungen Grundstück
  ['6300', 'Grundstücksaufwendungen (allgemein)', 'aufwand', '19'],
  ['6310', 'Instandhaltung Gebäude', 'aufwand', '19'],
  ['6320', 'Heizung / Energie', 'aufwand', '19'],
  ['6330', 'Wasser / Abwasser', 'aufwand', '7'],
  ['6340', 'Versicherungen Gebäude', 'aufwand', 'frei'],
  ['6345', 'Grundsteuer', 'aufwand', 'frei'],
  ['6350', 'Verwaltungskosten / Hausverwaltung', 'aufwand', '19'],
  ['6390', 'Sonstige Grundstücksaufwendungen', 'aufwand', '19'],
  ['6420', 'Abschreibungen Gebäude (AfA)', 'aufwand', 'frei'],
  // Geld / Bestand
  ['1800', 'Bank', 'geld', ''],
  ['1600', 'Kasse', 'geld', ''],
  ['1576', 'Abziehbare Vorsteuer 19%', 'bestand', ''],
  ['1571', 'Abziehbare Vorsteuer 7%', 'bestand', ''],
  ['3806', 'Umsatzsteuer 19%', 'bestand', ''],
  ['3801', 'Umsatzsteuer 7%', 'bestand', ''],
];
