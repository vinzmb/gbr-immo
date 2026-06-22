import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { writeFileSync, existsSync, readFileSync, readdirSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { getDb, Pfade } from './db.js';
import {
  splitsBerechnen, ustvaBerechnen, periodeGrenzen, vorsteuerquoteFlaeche,
  ustAusBrutto, nettoAusBrutto,
} from './lib/steuer.js';
import { datevBuchungsstapel } from './lib/datev.js';
import { parseBank } from './lib/bankimport.js';
import { belegKlassifizieren, belegAusDateiLesen, nkKlassifizieren } from './lib/ki.js';
import { findeTreffer } from './lib/matching.js';
import { nkBerechnen, monateImZeitraum } from './lib/nebenkosten.js';
import { parseDatev, ustAusBu } from './lib/datevimport.js';
import { elsterUStVAXml } from './lib/elster.js';
import { pruefeUpdate } from './lib/update.js';
import { berichtigungEinJahr, jahreImZeitraum } from './lib/vorsteuer15a.js';

const db = getDb();
const app = Fastify({ logger: false, bodyLimit: 256 * 1024 * 1024 });

// ---------- Hilfsfunktionen ----------
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function mandant() {
  return one('SELECT * FROM mandant WHERE id = 1');
}

// Bankkonto (Gegenkonto) je Kontenrahmen.
function bankKonto() {
  return mandant().kontenrahmen === 'skr03' ? '1200' : '1800';
}

// Automatische Kontoauswahl aus dem aktiven Kontenrahmen (laienfreundlich,
// funktioniert für SKR04 und SKR03 sowie eigene Anpassungen).
function standardKonto(typ, ust) {
  const rahmen = mandant().kontenrahmen;
  const art = typ === 'einnahme' ? 'erloes' : 'aufwand';
  const k = one('SELECT nummer FROM konten WHERE rahmen = ? AND art = ? AND ust_satz = ? ORDER BY nummer LIMIT 1', rahmen, art, ust)
    || one('SELECT nummer FROM konten WHERE rahmen = ? AND art = ? ORDER BY nummer LIMIT 1', rahmen, art);
  return k ? k.nummer : (typ === 'einnahme' ? '8120' : '4210');
}

function periodeFuerDatum(datum, zeitraum) {
  const jahr = datum.slice(0, 4);
  const monat = Number(datum.slice(5, 7));
  if (zeitraum === 'monat') return `${jahr}-${String(monat).padStart(2, '0')}`;
  if (zeitraum === 'jahr') return jahr;
  return `${jahr}-Q${Math.ceil(monat / 3)}`;
}

// Generischer CRUD-Helfer (nur übergebene Felder schreiben, damit DB-Defaults greifen)
function crud(tabelle, felder) {
  app.get(`/api/${tabelle}`, () => all(`SELECT * FROM ${tabelle} ORDER BY id DESC`));
  app.get(`/api/${tabelle}/:id`, (req) =>
    one(`SELECT * FROM ${tabelle} WHERE id = ?`, Number(req.params.id)));
  app.post(`/api/${tabelle}`, (req) => {
    const genutzt = felder.filter((f) => req.body[f] !== undefined && req.body[f] !== null);
    const spalten = genutzt.join(', ');
    const platzhalter = genutzt.map(() => '?').join(', ');
    const werte = genutzt.map((f) => req.body[f]);
    const r = run(`INSERT INTO ${tabelle} (${spalten}) VALUES (${platzhalter})`, ...werte);
    return one(`SELECT * FROM ${tabelle} WHERE id = ?`, r.lastInsertRowid);
  });
  app.put(`/api/${tabelle}/:id`, (req) => {
    const genutzt = felder.filter((f) => req.body[f] !== undefined);
    if (genutzt.length) {
      const set = genutzt.map((f) => `${f} = ?`).join(', ');
      const werte = genutzt.map((f) => req.body[f]);
      run(`UPDATE ${tabelle} SET ${set} WHERE id = ?`, ...werte, Number(req.params.id));
    }
    return one(`SELECT * FROM ${tabelle} WHERE id = ?`, Number(req.params.id));
  });
  app.delete(`/api/${tabelle}/:id`, (req) => {
    run(`DELETE FROM ${tabelle} WHERE id = ?`, Number(req.params.id));
    return { ok: true };
  });
}

crud('objekte', ['name', 'strasse', 'plz', 'ort', 'gesamtflaeche', 'notiz']);
crud('einheiten', ['objekt_id', 'bezeichnung', 'flaeche', 'nutzungsart', 'ust_status', 'miteigentumsanteil', 'notiz']);
crud('mieter', ['name', 'ansprechpartner', 'email', 'telefon', 'debitor_konto', 'notiz']);
crud('mietvertraege', ['einheit_id', 'mieter_id', 'nettomiete', 'ust_satz', 'beginn', 'ende', 'kaution', 'nk_vorauszahlung', 'aktiv']);
crud('bank_konten', ['name', 'iban']);
crud('berichtigungsobjekte', ['bezeichnung', 'objekt_id', 'vorsteuer_gesamt', 'quote_urspruenglich', 'beginn', 'jahre', 'notiz']);
// Dokumente: Liste/Löschen via crud-Stil, Anlegen mit optionalem Datei-Upload.
app.get('/api/dokumente', () => all('SELECT * FROM dokumente ORDER BY id DESC'));
app.delete('/api/dokumente/:id', (req) => { run('DELETE FROM dokumente WHERE id = ?', Number(req.params.id)); return { ok: true }; });
app.post('/api/dokumente', (req) => {
  const b = req.body;
  let datei_pfad = '';
  let datei_hash = '';
  if (b.datei_base64 && b.datei_name) {
    const buf = Buffer.from(b.datei_base64.split(',').pop(), 'base64');
    datei_hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const name = `dok_${Date.now()}_${b.datei_name}`.replace(/[^\w.\-]/g, '_');
    datei_pfad = join('belege', name);
    writeFileSync(join(Pfade.BELEGE_DIR, name), buf);
  }
  const r = run(
    'INSERT INTO dokumente (titel, kategorie, objekt_id, mieter_id, einheit_id, datum, datei_pfad, datei_hash, notiz) VALUES (?,?,?,?,?,?,?,?,?)',
    b.titel || 'Ohne Titel', b.kategorie || 'sonstiges', b.objekt_id || null,
    b.mieter_id || null, b.einheit_id || null, b.datum || '', datei_pfad, datei_hash, b.notiz || ''
  );
  return one('SELECT * FROM dokumente WHERE id = ?', r.lastInsertRowid);
});
app.get('/api/dokumente/:id/datei', (req, reply) => {
  const d = one('SELECT * FROM dokumente WHERE id = ?', Number(req.params.id));
  if (!d || !d.datei_pfad) return reply.code(404).send('keine Datei');
  const pfad = join(Pfade.DATEN_DIR, d.datei_pfad);
  if (!existsSync(pfad)) return reply.code(404).send('Datei fehlt');
  return reply.send(readFileSync(pfad));
});

// ---------- Mandant ----------
app.get('/api/mandant', () => mandant());
app.put('/api/mandant', (req) => {
  const f = ['name', 'steuernummer', 'ust_idnr', 'finanzamt', 'besteuerungsart',
    'voranmeldungszeitraum', 'kontenrahmen', 'ki_aktiv', 'ki_api_key', 'update_repo', 'update_token'];
  const genutzt = f.filter((x) => req.body[x] !== undefined && req.body[x] !== null);
  if (genutzt.length) {
    const set = genutzt.map((x) => `${x} = ?`).join(', ');
    run(`UPDATE mandant SET ${set} WHERE id = 1`, ...genutzt.map((x) => req.body[x]));
  }
  return mandant();
});

// ---------- Konten ----------
app.get('/api/konten', () => all('SELECT * FROM konten WHERE rahmen = ? ORDER BY nummer', mandant().kontenrahmen));

// ---------- Einheiten mit Umsatzgewicht (für Aufteilung) ----------
function einheitenMitGewicht(objektId, datum) {
  const rows = objektId
    ? all('SELECT * FROM einheiten WHERE objekt_id = ?', objektId)
    : all('SELECT * FROM einheiten');
  for (const e of rows) {
    const v = one(
      'SELECT COALESCE(SUM(nettomiete),0) AS s FROM mietvertraege WHERE einheit_id = ? AND aktiv = 1',
      e.id
    );
    e.umsatz_gewicht = v.s;
    // USt-Status zeitabhängig: maßgeblich ist der zum Datum gültige Mietvertrag.
    if (datum) e.ust_status = ustStatusAmDatum(e.id, datum, e.ust_status);
  }
  return rows;
}

/**
 * USt-Status einer Einheit zu einem bestimmten Datum.
 * Entscheidend für den Vorsteuerabzug ist, ob die Einheit am Datum steuerpflichtig
 * (mit Option, 19/7) oder steuerfrei vermietet ist. Maßgeblich ist der an diesem
 * Tag gültige Mietvertrag; bei Leerstand gilt die hinterlegte Standardnutzung der Einheit.
 */
function ustStatusAmDatum(einheitId, datum, fallback) {
  const v = one(
    `SELECT ust_satz FROM mietvertraege
       WHERE einheit_id = ?
         AND (beginn = '' OR beginn <= ?)
         AND (ende = '' OR ende >= ?)
       ORDER BY beginn DESC LIMIT 1`,
    einheitId, datum, datum
  );
  return v ? v.ust_satz : fallback;
}

// Einheiten-Liste passend zum Aufteilungsmodus (inkl. manueller Gewichte),
// mit zeitabhängigem USt-Status zum Buchungsdatum.
function einheitenFuerBuchung(body) {
  const datum = body.datum || null;
  if (body.aufteilung_modus === 'manuell' && Array.isArray(body.manuelle_splits)) {
    const alle = einheitenMitGewicht(null, datum);
    return body.manuelle_splits
      .map((ms) => {
        const e = alle.find((x) => x.id === Number(ms.einheit_id));
        return e ? { ...e, manuell_gewicht: Number(ms.gewicht) || 0 } : null;
      })
      .filter(Boolean);
  }
  return einheitenMitGewicht(body.objekt_id || null, datum);
}

// ---------- Belege ----------
app.get('/api/belege', () => all('SELECT * FROM belege ORDER BY datum DESC, id DESC'));
app.get('/api/belege/:id', (req) => one('SELECT * FROM belege WHERE id = ?', Number(req.params.id)));

app.post('/api/belege', (req) => {
  const b = req.body;
  let datei_pfad = '';
  let datei_hash = '';
  if (b.datei_base64 && b.datei_name) {
    const buf = Buffer.from(b.datei_base64.split(',').pop(), 'base64');
    datei_hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const name = `${Date.now()}_${b.datei_name}`.replace(/[^\w.\-]/g, '_');
    datei_pfad = join('belege', name);
    writeFileSync(join(Pfade.BELEGE_DIR, name), buf);
  }
  const r = run(
    `INSERT INTO belege (art, datum, beleg_nr, partner, betrag_brutto, beschreibung, kategorie, datei_pfad, datei_hash, ocr_text, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    b.art || 'eingang', b.datum, b.beleg_nr || '', b.partner || '',
    b.betrag_brutto || 0, b.beschreibung || '', b.kategorie || '',
    datei_pfad, datei_hash, b.ocr_text || '', 'offen'
  );
  return one('SELECT * FROM belege WHERE id = ?', r.lastInsertRowid);
});

app.put('/api/belege/:id', (req) => {
  const f = ['art', 'datum', 'beleg_nr', 'partner', 'betrag_brutto', 'beschreibung', 'kategorie', 'status'];
  const set = f.map((x) => `${x} = ?`).join(', ');
  run(`UPDATE belege SET ${set} WHERE id = ?`, ...f.map((x) => req.body[x] ?? null), Number(req.params.id));
  return one('SELECT * FROM belege WHERE id = ?', Number(req.params.id));
});

app.delete('/api/belege/:id', (req) => {
  run('DELETE FROM belege WHERE id = ?', Number(req.params.id));
  return { ok: true };
});

app.get('/api/belege/:id/datei', (req, reply) => {
  const b = one('SELECT * FROM belege WHERE id = ?', Number(req.params.id));
  if (!b || !b.datei_pfad) return reply.code(404).send('keine Datei');
  const pfad = join(Pfade.DATEN_DIR, b.datei_pfad);
  if (!existsSync(pfad)) return reply.code(404).send('Datei fehlt');
  return reply.send(readFileSync(pfad));
});

// ---------- Buchungen ----------
function buchungSpeichern(body) {
  const m = mandant();
  const einheiten = einheitenFuerBuchung(body);
  const buchung = {
    betrag_brutto: body.betrag_brutto,
    ust_satz: body.ust_satz,
    aufteilung_modus: body.aufteilung_modus || (body.typ === 'einnahme' ? 'direkt' : 'flaeche'),
    einheit_id: body.einheit_id || null,
  };

  let ust_betrag, vorsteuer_abziehbar, splits;
  if (body.typ === 'einnahme') {
    ust_betrag = ustAusBrutto(body.betrag_brutto, body.ust_satz);
    vorsteuer_abziehbar = 0;
    splits = [];
  } else {
    const res = splitsBerechnen(buchung, einheiten);
    ust_betrag = res.ustGesamt;
    vorsteuer_abziehbar = res.vorsteuerAbziehbar;
    splits = res.splits;
  }

  const periode = periodeFuerDatum(body.datum, m.voranmeldungszeitraum);
  const kontoFinal = body.konto || standardKonto(body.typ, body.ust_satz);
  // Mieterbezug: explizit übergeben oder bei Einnahmen aus dem gültigen Mietvertrag ableiten.
  let mieterId = body.mieter_id || null;
  if (!mieterId && body.typ === 'einnahme' && buchung.einheit_id) {
    const v = one(
      `SELECT mieter_id FROM mietvertraege WHERE einheit_id = ?
         AND (beginn = '' OR beginn <= ?) AND (ende = '' OR ende >= ?) ORDER BY beginn DESC LIMIT 1`,
      buchung.einheit_id, body.datum, body.datum
    );
    if (v) mieterId = v.mieter_id;
  }
  const r = run(
    `INSERT INTO buchungen (datum, beleg_id, typ, konto, gegenkonto, betrag_brutto, ust_satz, ust_betrag, vorsteuer_abziehbar, steuerschluessel, buchungstext, aufteilung_modus, einheit_id, mieter_id, periode, import_hash, herkunft)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    body.datum, body.beleg_id || null, body.typ, kontoFinal, body.gegenkonto || bankKonto(),
    body.betrag_brutto, body.ust_satz, ust_betrag, vorsteuer_abziehbar,
    body.steuerschluessel || '', body.buchungstext || '', buchung.aufteilung_modus,
    buchung.einheit_id, mieterId, periode, body.import_hash || '', body.herkunft || ''
  );
  const id = r.lastInsertRowid;
  for (const s of splits) {
    run(
      `INSERT INTO buchung_splits (buchung_id, einheit_id, anteil_prozent, betrag_brutto, ust_betrag, vorsteuer_abziehbar, ust_status)
       VALUES (?,?,?,?,?,?,?)`,
      id, s.einheit_id, s.anteil_prozent, s.betrag_brutto, s.ust_betrag, s.vorsteuer_abziehbar, s.ust_status
    );
  }
  if (body.beleg_id) run("UPDATE belege SET status = 'gebucht' WHERE id = ?", body.beleg_id);
  return one('SELECT * FROM buchungen WHERE id = ?', id);
}

app.get('/api/buchungen', () => all('SELECT * FROM buchungen ORDER BY datum DESC, id DESC'));
app.get('/api/buchungen/:id', (req) => {
  const b = one('SELECT * FROM buchungen WHERE id = ?', Number(req.params.id));
  if (b) b.splits = all('SELECT * FROM buchung_splits WHERE buchung_id = ?', b.id);
  return b;
});
app.post('/api/buchungen', (req) => buchungSpeichern(req.body));

// Vorschau der Aufteilung ohne Speichern
app.post('/api/buchungen/vorschau', (req) => {
  const body = req.body;
  if (body.typ === 'einnahme') {
    const ust = ustAusBrutto(body.betrag_brutto, body.ust_satz);
    return { ustGesamt: ust, vorsteuerAbziehbar: 0, netto: nettoAusBrutto(body.betrag_brutto, body.ust_satz), splits: [] };
  }
  const einheiten = einheitenFuerBuchung(body);
  const res = splitsBerechnen(
    {
      betrag_brutto: body.betrag_brutto, ust_satz: body.ust_satz,
      aufteilung_modus: body.aufteilung_modus || 'flaeche', einheit_id: body.einheit_id || null,
    },
    einheiten
  );
  return { ...res, netto: nettoAusBrutto(body.betrag_brutto, body.ust_satz), quote: vorsteuerquoteFlaeche(einheiten) };
});

app.post('/api/buchungen/:id/storno', (req) => {
  run('UPDATE buchungen SET storniert = 1 WHERE id = ?', Number(req.params.id));
  return { ok: true };
});

// ---------- Bank ----------
app.post('/api/bank/import', (req) => {
  const { bank_konto_id, dateiinhalt, dateiname } = req.body;
  const umsaetze = parseBank(dateiinhalt, dateiname || '');
  let neu = 0;
  for (const u of umsaetze) {
    try {
      run(
        `INSERT INTO bank_umsaetze (bank_konto_id, datum, betrag, verwendungszweck, gegenpartei, import_hash)
         VALUES (?,?,?,?,?,?)`,
        bank_konto_id || null, u.datum, u.betrag, u.verwendungszweck, u.gegenpartei, u.import_hash
      );
      neu++;
    } catch {
      /* Duplikat (import_hash) übersprungen */
    }
  }
  return { gefunden: umsaetze.length, neu, duplikate: umsaetze.length - neu };
});

app.get('/api/bank/umsaetze', (req) => {
  const status = req.query.status;
  if (status) return all('SELECT * FROM bank_umsaetze WHERE status = ? ORDER BY datum DESC', status);
  return all('SELECT * FROM bank_umsaetze ORDER BY datum DESC');
});

app.put('/api/bank/umsaetze/:id', (req) => {
  const f = ['status', 'buchung_id'];
  run(`UPDATE bank_umsaetze SET ${f.map((x) => `${x} = ?`).join(', ')} WHERE id = ?`,
    ...f.map((x) => req.body[x] ?? null), Number(req.params.id));
  return one('SELECT * FROM bank_umsaetze WHERE id = ?', Number(req.params.id));
});

// Automatisches Matching: passende offene Belege zu einem Bankumsatz
app.get('/api/bank/umsaetze/:id/matches', (req) => {
  const u = one('SELECT * FROM bank_umsaetze WHERE id = ?', Number(req.params.id));
  if (!u) return [];
  const offeneBelege = all("SELECT * FROM belege WHERE status != 'gebucht'");
  return findeTreffer(u, offeneBelege);
});

// Bankumsatz direkt verbuchen + als erledigt markieren (optional mit Beleg-Verknüpfung)
app.post('/api/bank/umsaetze/:id/verbuchen', (req) => {
  const u = one('SELECT * FROM bank_umsaetze WHERE id = ?', Number(req.params.id));
  if (!u) return { error: 'nicht gefunden' };
  const typ = u.betrag >= 0 ? 'einnahme' : 'ausgabe';
  const buchung = buchungSpeichern({
    datum: u.datum, typ, betrag_brutto: Math.abs(u.betrag),
    ust_satz: req.body.ust_satz || '19', konto: req.body.konto || '',
    gegenkonto: bankKonto(), aufteilung_modus: req.body.aufteilung_modus,
    einheit_id: req.body.einheit_id || null, objekt_id: req.body.objekt_id || null,
    manuelle_splits: req.body.manuelle_splits || null,
    beleg_id: req.body.beleg_id || null,
    buchungstext: u.verwendungszweck.slice(0, 60),
  });
  run("UPDATE bank_umsaetze SET status = 'erledigt', buchung_id = ? WHERE id = ?", buchung.id, u.id);
  return buchung;
});

// ---------- UStVA ----------
// Ist die Periode der letzte Voranmeldungszeitraum des Jahres? (Q4 / Dezember / Jahr)
function istLetzterZeitraum(p) {
  return /Q4$/.test(p) || /^\d{4}-12$/.test(p) || /^\d{4}$/.test(p);
}

// Summe der anzuwendenden §15a-Berichtigungen eines Jahres (signiert).
function vst15aJahresbetrag(jahr) {
  let summe = 0;
  for (const o of all('SELECT * FROM berichtigungsobjekte')) {
    if (!jahreImZeitraum(o.beginn, o.jahre).includes(jahr)) continue;
    const qn = o.objekt_id ? quoteFuerObjektImJahr(o.objekt_id, jahr) : o.quote_urspruenglich;
    const b = berichtigungEinJahr(o, qn);
    if (b.anzuwenden) summe += b.betrag;
  }
  return summe;
}

function ustvaFuerPeriode(periode) {
  const { von, bis } = periodeGrenzen(periode);
  const buchungen = all(
    'SELECT * FROM buchungen WHERE datum >= ? AND datum <= ? AND storniert = 0',
    von, bis
  );
  const k = ustvaBerechnen(buchungen);
  // §15a-Berichtigung (Kz 63) nur im letzten Voranmeldungszeitraum des Jahres berücksichtigen.
  const kz63 = istLetzterZeitraum(periode) ? vst15aJahresbetrag(Number(periode.slice(0, 4))) : 0;
  // Kz 63 ist Teil der abziehbaren Vorsteuer (positiv = Mehrabzug, negativ = Rückzahlung).
  const kz83 = k.kz83 - kz63;
  return { periode, von, bis, anzahl: buchungen.length, ...k, kz63, kz83 };
}

app.get('/api/ustva', (req) => ustvaFuerPeriode(req.query.periode));

app.post('/api/ustva/festschreiben', (req) => {
  const r = ustvaFuerPeriode(req.body.periode);
  run(
    `INSERT INTO ustva_meldungen (periode, von, bis, kz81, kz86, ust_19, ust_7, kz66, kz63, kz83, steuerfrei, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'festgeschrieben')
     ON CONFLICT(periode) DO UPDATE SET kz81=excluded.kz81, kz86=excluded.kz86,
       ust_19=excluded.ust_19, ust_7=excluded.ust_7, kz66=excluded.kz66, kz63=excluded.kz63, kz83=excluded.kz83,
       steuerfrei=excluded.steuerfrei, status='festgeschrieben'`,
    r.periode, r.von, r.bis, r.kz81, r.kz86, r.ust_19, r.ust_7, r.kz66, r.kz63, r.kz83, r.steuerfrei
  );
  return r;
});

// ---------- Export DATEV ----------
app.get('/api/export/datev', (req, reply) => {
  const periode = req.query.periode;
  const { von, bis } = periodeGrenzen(periode);
  const buchungen = all(
    'SELECT * FROM buchungen WHERE datum >= ? AND datum <= ? AND storniert = 0 ORDER BY datum',
    von, bis
  );
  // Personenkonto (Debitor) je Mieter für die Subkontierung anhängen.
  const debitorById = new Map(all("SELECT id, debitor_konto FROM mieter WHERE debitor_konto != ''").map((m) => [m.id, m.debitor_konto]));
  for (const b of buchungen) if (b.mieter_id && debitorById.has(b.mieter_id)) b.debitor_konto = debitorById.get(b.mieter_id);
  const csv = datevBuchungsstapel(buchungen, mandant(), { von, bis });
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="DATEV_${periode}.csv"`);
  return reply.send(csv);
});

// ---------- DATEV-Buchungsstapel importieren ----------
app.post('/api/import/datev', (req) => {
  const { jahr, zeilen } = parseDatev(req.body.dateiinhalt || '');
  const m = mandant();
  const kontoMap = new Map(all('SELECT nummer, art, ust_satz FROM konten WHERE rahmen = ?', m.kontenrahmen).map((k) => [k.nummer, k]));
  let neu = 0, dup = 0;
  for (const z of zeilen) {
    if (one('SELECT id FROM buchungen WHERE import_hash = ?', z.import_hash)) { dup++; continue; }
    const kInfo = kontoMap.get(z.konto);
    const gInfo = kontoMap.get(z.gegenkonto);
    let sach = z.konto, typ, sachInfo = kInfo;
    if (kInfo && kInfo.art === 'erloes') typ = 'einnahme';
    else if (kInfo && kInfo.art === 'aufwand') typ = 'ausgabe';
    else if (gInfo && gInfo.art === 'erloes') { typ = 'einnahme'; sach = z.gegenkonto; sachInfo = gInfo; }
    else if (gInfo && gInfo.art === 'aufwand') { typ = 'ausgabe'; sach = z.gegenkonto; sachInfo = gInfo; }
    else typ = z.sollhaben === 'H' ? 'einnahme' : 'ausgabe';
    const ust = ustAusBu(z.bu) || (sachInfo ? sachInfo.ust_satz : '') || 'frei';
    buchungSpeichern({
      datum: z.datum, typ, betrag_brutto: z.umsatz_cent, ust_satz: ust,
      konto: sach, gegenkonto: (sach === z.konto ? z.gegenkonto : z.konto) || bankKonto(),
      aufteilung_modus: 'keine', buchungstext: z.buchungstext || z.belegfeld1,
      import_hash: z.import_hash, herkunft: 'datev',
    });
    neu++;
  }
  return { jahr, gefunden: zeilen.length, neu, duplikate: dup };
});

// ---------- Sollstellungen automatisch erzeugen ----------
const SATZN = { '19': 19, '7': 7, frei: 0 };
function bruttoAusNetto(netto, satz) {
  return netto + Math.round((netto * (SATZN[satz] || 0)) / 100);
}
app.post('/api/sollstellung/erzeugen', (req) => {
  const jahr = Number(req.body.jahr);
  const monate = req.body.modus === 'monat' ? [Number(req.body.monat)] : Array.from({ length: 12 }, (_, i) => i + 1);
  const vertraege = all('SELECT * FROM mietvertraege WHERE aktiv = 1');
  const einheitName = (id) => one('SELECT bezeichnung FROM einheiten WHERE id = ?', id)?.bezeichnung || '';
  let erzeugt = 0, uebersprungen = 0;
  const anlegen = (datum, einheit_id, konto, ust_satz, brutto, text) => {
    if (brutto <= 0) return;
    if (one('SELECT id FROM buchungen WHERE buchungstext = ? AND storniert = 0', text)) { uebersprungen++; return; }
    buchungSpeichern({
      datum, typ: 'einnahme', betrag_brutto: brutto, ust_satz, konto, gegenkonto: bankKonto(),
      aufteilung_modus: 'direkt', einheit_id, buchungstext: text, herkunft: 'sollstellung',
    });
    erzeugt++;
  };
  for (const mo of monate) {
    const mm = String(mo).padStart(2, '0');
    const datum = `${jahr}-${mm}-01`;
    for (const v of vertraege) {
      const en = einheitName(v.einheit_id);
      const kontoErloes = standardKonto('einnahme', v.ust_satz);
      anlegen(datum, v.einheit_id, kontoErloes, v.ust_satz,
        bruttoAusNetto(v.nettomiete, v.ust_satz), `Mietsollstellung ${mm}/${jahr} · ${en}`);
      anlegen(datum, v.einheit_id, kontoErloes, v.ust_satz,
        bruttoAusNetto(v.nk_vorauszahlung || 0, v.ust_satz), `NK-Vorauszahlung ${mm}/${jahr} · ${en}`);
    }
  }
  return { erzeugt, uebersprungen };
});

// ---------- ELSTER-XML der UStVA ----------
app.get('/api/export/elster', (req, reply) => {
  const periode = req.query.periode;
  const r = ustvaFuerPeriode(periode);
  const heute = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const xml = elsterUStVAXml(r, mandant(), periode, heute);
  reply.header('content-type', 'application/xml; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="ELSTER_UStVA_${periode}.xml"`);
  return reply.send(xml);
});

// ---------- KI ----------
app.post('/api/ki/beleg', async (req) => {
  const m = mandant();
  if (!m.ki_aktiv || !m.ki_api_key) return { error: 'KI ist nicht aktiviert. Bitte API-Schlüssel in den Einstellungen hinterlegen.' };
  try {
    const vorschlag = await belegKlassifizieren({
      apiKey: m.ki_api_key,
      text: req.body.text || '',
      art: req.body.art || 'eingang',
      konten: all('SELECT * FROM konten WHERE rahmen = ? ORDER BY nummer', m.kontenrahmen),
      einheiten: all('SELECT * FROM einheiten'),
    });
    return vorschlag;
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

// OCR: Beleg aus Datei (PDF/Bild) auslesen
app.post('/api/ki/beleg-datei', async (req) => {
  const m = mandant();
  if (!m.ki_aktiv || !m.ki_api_key) return { error: 'KI ist nicht aktiviert. Bitte API-Schlüssel in den Einstellungen hinterlegen.' };
  if (!req.body.datei_base64) return { error: 'Keine Datei übergeben.' };
  try {
    return await belegAusDateiLesen({
      apiKey: m.ki_api_key,
      dataUrl: req.body.datei_base64,
      art: req.body.art || 'eingang',
      konten: all('SELECT * FROM konten WHERE rahmen = ? ORDER BY nummer', m.kontenrahmen),
      einheiten: all('SELECT * FROM einheiten'),
    });
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

// ---------- Nebenkosten ----------
// Umlage-Einstufung einer Buchung persistieren
app.put('/api/buchungen/:id/umlage', (req) => {
  run('UPDATE buchungen SET umlagefaehig = ?, nk_art = ?, umlageschluessel = ? WHERE id = ?',
    req.body.umlagefaehig == null ? null : (req.body.umlagefaehig ? 1 : 0),
    req.body.nk_art || '', req.body.umlageschluessel || '', Number(req.params.id));
  return one('SELECT * FROM buchungen WHERE id = ?', Number(req.params.id));
});

// Verbrauchswerte je Einheit/Jahr
app.get('/api/nk/verbrauch', (req) =>
  all('SELECT * FROM nk_verbrauch WHERE jahr = ?', Number(req.query.jahr)));
app.put('/api/nk/verbrauch', (req) => {
  const { einheit_id, jahr, heizung, wasser, personen } = req.body;
  run(`INSERT INTO nk_verbrauch (einheit_id, jahr, heizung, wasser, personen) VALUES (?,?,?,?,?)
       ON CONFLICT(einheit_id, jahr) DO UPDATE SET heizung=excluded.heizung, wasser=excluded.wasser, personen=excluded.personen`,
    Number(einheit_id), Number(jahr), Number(heizung) || 0, Number(wasser) || 0, Number(personen) || 0);
  return { ok: true };
});

// Ausgaben-Buchungen eines Zeitraums (Kandidaten für Umlage)
app.get('/api/nk/kosten', (req) => {
  const { von, bis } = req.query;
  return all(
    "SELECT * FROM buchungen WHERE typ = 'ausgabe' AND storniert = 0 AND datum >= ? AND datum <= ? ORDER BY datum",
    von, bis
  );
});

// KI: Kostenpositionen als umlagefähig einstufen
app.post('/api/nk/klassifizieren', async (req) => {
  const m = mandant();
  if (!m.ki_aktiv || !m.ki_api_key) return { error: 'KI ist nicht aktiviert.' };
  const kontoName = (nr) => one('SELECT bezeichnung FROM konten WHERE nummer = ? AND rahmen = ?', nr, m.kontenrahmen)?.bezeichnung || '';
  try {
    const buchungen = (req.body.buchungen || []).map((b) => ({
      id: b.id,
      text: `${b.buchungstext || ''} | Konto ${b.konto} ${kontoName(b.konto)} | ${(b.betrag_brutto / 100).toFixed(2)} EUR`,
    }));
    return await nkKlassifizieren({ apiKey: m.ki_api_key, buchungen });
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

// Abrechnung berechnen (ohne Speichern)
function nkAbrechnung(objektId, von, bis, vorauszahlungOverride) {
  const einheiten = all('SELECT * FROM einheiten WHERE objekt_id = ? ORDER BY id', objektId);
  const umlage = all(
    "SELECT * FROM buchungen WHERE typ = 'ausgabe' AND storniert = 0 AND umlagefaehig = 1 AND datum >= ? AND datum <= ?",
    von, bis
  );
  // Kosten je Umlageschlüssel gruppieren
  const kostenNachSchluessel = {};
  for (const b of umlage) {
    const s = b.umlageschluessel || 'flaeche';
    kostenNachSchluessel[s] = (kostenNachSchluessel[s] || 0) + b.betrag_brutto;
  }
  const jahr = Number(von.slice(0, 4));
  const verbrauch = {};
  for (const v of all('SELECT * FROM nk_verbrauch WHERE jahr = ?', jahr)) {
    verbrauch[v.einheit_id] = { heizung: v.heizung, wasser: v.wasser, personen: v.personen };
  }
  const vertraege = all('SELECT * FROM mietvertraege WHERE aktiv = 1');
  const mieterName = new Map(all('SELECT id, name FROM mieter').map((m) => [m.id, m.name]));
  const monate = monateImZeitraum(von, bis);
  const res = nkBerechnen({ einheiten, kostenNachSchluessel, verbrauch, vertraege, mieterName, monate, vorauszahlungOverride: vorauszahlungOverride || {} });
  return { objekt_id: objektId, von, bis, monate, positionen: umlage.length, ...res };
}

app.get('/api/nk/abrechnung', (req) =>
  nkAbrechnung(Number(req.query.objekt_id), req.query.von, req.query.bis));

// Abrechnung speichern
app.post('/api/nk/abrechnung', (req) => {
  const { objekt_id, von, bis, daten, gesamtkosten } = req.body;
  const r = run(
    'INSERT INTO nk_abrechnungen (objekt_id, von, bis, gesamtkosten, daten) VALUES (?,?,?,?,?)',
    objekt_id || null, von, bis, gesamtkosten || 0, JSON.stringify(daten || {})
  );
  return one('SELECT * FROM nk_abrechnungen WHERE id = ?', r.lastInsertRowid);
});

app.get('/api/nk/abrechnungen', () => all('SELECT * FROM nk_abrechnungen ORDER BY id DESC'));
app.delete('/api/nk/abrechnungen/:id', (req) => {
  run('DELETE FROM nk_abrechnungen WHERE id = ?', Number(req.params.id));
  return { ok: true };
});

// Druckansicht (HTML, je Mieter eine Seite)
app.get('/api/nk/abrechnungen/:id/druck', (req, reply) => {
  const a = one('SELECT * FROM nk_abrechnungen WHERE id = ?', Number(req.params.id));
  if (!a) return reply.code(404).send('nicht gefunden');
  const objekt = a.objekt_id ? one('SELECT * FROM objekte WHERE id = ?', a.objekt_id) : null;
  const m = mandant();
  const daten = JSON.parse(a.daten || '{}');
  reply.header('content-type', 'text/html; charset=utf-8');
  return reply.send(druckHtml(a, daten, objekt, m));
});

// ---------- Vorsteuerberichtigung §15a ----------
// Tatsächliche Abzugsquote eines Objekts in einem Jahr (Flächenstatus zum Jahresende).
function quoteFuerObjektImJahr(objektId, jahr) {
  const einheiten = einheitenMitGewicht(objektId, `${jahr}-12-31`);
  return vorsteuerquoteFlaeche(einheiten);
}

// Voller Berichtigungsplan eines Objekts über den Zeitraum.
app.get('/api/vst15a/plan/:id', (req) => {
  const o = one('SELECT * FROM berichtigungsobjekte WHERE id = ?', Number(req.params.id));
  if (!o) return { error: 'nicht gefunden' };
  const zeilen = jahreImZeitraum(o.beginn, o.jahre).map((jahr) => {
    const qn = o.objekt_id ? quoteFuerObjektImJahr(o.objekt_id, jahr) : o.quote_urspruenglich;
    return { jahr, qn, ...berichtigungEinJahr(o, qn) };
  });
  const summe = zeilen.reduce((a, z) => a + (z.anzuwenden ? z.betrag : 0), 0);
  return { objekt: o, zeilen, summe };
});

// Berichtigungsbeträge aller Objekte für ein bestimmtes Jahr.
app.get('/api/vst15a/jahr', (req) => {
  const jahr = Number(req.query.jahr);
  const zeilen = [];
  for (const o of all('SELECT * FROM berichtigungsobjekte ORDER BY id')) {
    if (!jahreImZeitraum(o.beginn, o.jahre).includes(jahr)) continue;
    const qn = o.objekt_id ? quoteFuerObjektImJahr(o.objekt_id, jahr) : o.quote_urspruenglich;
    const b = berichtigungEinJahr(o, qn);
    zeilen.push({ id: o.id, bezeichnung: o.bezeichnung, qn, q0: o.quote_urspruenglich, ...b });
  }
  const summe = zeilen.reduce((a, z) => a + (z.anzuwenden ? z.betrag : 0), 0);
  return { jahr, zeilen, summe };
});

// ---------- Mieterkonten (Personenkonten / Subkontierung) ----------
// Freie Personenkonto-Nummern automatisch vergeben (fortlaufend ab 10000).
app.post('/api/mieterkonten/vergeben', () => {
  let max = 9999;
  for (const m of all("SELECT debitor_konto FROM mieter WHERE debitor_konto != ''")) {
    const n = parseInt(m.debitor_konto, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let vergeben = 0;
  for (const m of all("SELECT id FROM mieter WHERE debitor_konto = '' ORDER BY id")) {
    max += 1;
    run('UPDATE mieter SET debitor_konto = ? WHERE id = ?', String(max), m.id);
    vergeben++;
  }
  return { vergeben };
});

function monateAktivImJahr(v, jahr) {
  let n = 0;
  for (let mo = 1; mo <= 12; mo++) {
    const mm = String(mo).padStart(2, '0');
    const start = `${jahr}-${mm}-01`;
    const ende = `${jahr}-${mm}-28`;
    if ((!v.beginn || v.beginn <= ende) && (!v.ende || v.ende >= start)) n++;
  }
  return n;
}

// Soll (laut Vertrag) / Ist (tatsächlich eingegangen) / offen je Mieter.
app.get('/api/mieterkonten', (req) => {
  const jahr = Number(req.query.jahr) || new Date().getFullYear();
  const vertraege = all('SELECT * FROM mietvertraege');
  const zeilen = all('SELECT * FROM mieter ORDER BY name').map((mi) => {
    let soll = 0;
    for (const v of vertraege.filter((x) => x.mieter_id === mi.id)) {
      const monate = monateAktivImJahr(v, jahr);
      soll += (bruttoAusNetto(v.nettomiete, v.ust_satz) + bruttoAusNetto(v.nk_vorauszahlung || 0, v.ust_satz)) * monate;
    }
    const ist = one(
      "SELECT COALESCE(SUM(betrag_brutto),0) AS s FROM buchungen WHERE typ='einnahme' AND storniert=0 AND mieter_id=? AND datum>=? AND datum<=?",
      mi.id, `${jahr}-01-01`, `${jahr}-12-31`
    ).s;
    return { id: mi.id, name: mi.name, debitor_konto: mi.debitor_konto, soll, ist, offen: soll - ist };
  });
  const summe = zeilen.reduce((a, z) => ({ soll: a.soll + z.soll, ist: a.ist + z.ist, offen: a.offen + z.offen }), { soll: 0, ist: 0, offen: 0 });
  return { jahr, zeilen, summe };
});

// ---------- Dashboard ----------
app.get('/api/dashboard', () => {
  const m = mandant();
  const jahr = new Date().getFullYear();
  const periode = periodeFuerDatum(`${jahr}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, m.voranmeldungszeitraum);
  const aktuelleUstva = ustvaFuerPeriode(periode);
  return {
    objekte: one('SELECT COUNT(*) n FROM objekte').n,
    einheiten: one('SELECT COUNT(*) n FROM einheiten').n,
    mieter: one('SELECT COUNT(*) n FROM mieter').n,
    belege_offen: one("SELECT COUNT(*) n FROM belege WHERE status = 'offen'").n,
    bank_offen: one("SELECT COUNT(*) n FROM bank_umsaetze WHERE status = 'offen'").n,
    buchungen: one('SELECT COUNT(*) n FROM buchungen WHERE storniert = 0').n,
    quote: vorsteuerquoteFlaeche(einheitenMitGewicht(null, new Date().toISOString().slice(0, 10))),
    aktuelleUstva,
    mandant: m,
  };
});

function eur(cent) {
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function deDatum(s) {
  const t = (s || '').slice(0, 10).split('-');
  return t.length === 3 ? `${t[2]}.${t[1]}.${t[0]}` : s;
}

function druckHtml(a, daten, objekt, m) {
  const zeilen = daten.zeilen || [];
  const seiten = zeilen.map((z) => {
    const nachzahlung = z.saldo < 0;
    return `
    <section class="seite">
      <header>
        <div class="absender">${esc(m.name)}${m.steuernummer ? ' · St-Nr. ' + esc(m.steuernummer) : ''}</div>
        <h1>Nebenkostenabrechnung</h1>
        <div class="zeitraum">Abrechnungszeitraum: ${deDatum(a.von)} – ${deDatum(a.bis)}</div>
      </header>
      <div class="empfaenger">
        <strong>${esc(z.mieter)}</strong><br>
        Mieteinheit: ${esc(z.einheit)}${objekt ? ' · ' + esc(objekt.name) : ''}
      </div>
      <table>
        <tr><td>Umlagefähige Gesamtkosten</td><td class="r">${eur(a.gesamtkosten)}</td></tr>
        <tr><td>Verteilerschlüssel</td><td class="r">Wohn-/Nutzfläche</td></tr>
        <tr><td>Ihre Fläche / Gesamtfläche</td><td class="r">${z.flaeche} m² / ${daten.gesamtflaeche} m² (${z.anteil_prozent} %)</td></tr>
        <tr class="sum"><td>Ihr Kostenanteil</td><td class="r">${eur(z.kostenanteil)}</td></tr>
        <tr><td>Geleistete Vorauszahlungen (${z.monate} Monate)</td><td class="r">− ${eur(z.vorauszahlung)}</td></tr>
        <tr class="ergebnis"><td>${nachzahlung ? 'Nachzahlung' : 'Guthaben'}</td><td class="r">${eur(Math.abs(z.saldo))}</td></tr>
      </table>
      <p class="hinweis">${nachzahlung
        ? 'Bitte überweisen Sie den Nachzahlungsbetrag innerhalb von 30 Tagen.'
        : 'Das Guthaben wird Ihnen erstattet bzw. verrechnet.'}</p>
      <p class="fuss">Erstellt mit GBR-Immo · ${deDatum(a.erstellt_am)} · Angaben ohne Gewähr.</p>
    </section>`;
  }).join('');

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Nebenkostenabrechnung</title>
  <style>
    body{font-family:'Segoe UI',system-ui,sans-serif;color:#0f172a;margin:0;background:#fff}
    .seite{max-width:720px;margin:0 auto;padding:48px;page-break-after:always}
    header{border-bottom:2px solid #059669;padding-bottom:12px;margin-bottom:24px}
    .absender{font-size:12px;color:#64748b}
    h1{font-size:22px;margin:8px 0 4px}
    .zeitraum{color:#475569;font-size:14px}
    .empfaenger{margin:24px 0;font-size:15px;line-height:1.5}
    table{width:100%;border-collapse:collapse;font-size:14px}
    td{padding:10px 4px;border-bottom:1px solid #e2e8f0}
    .r{text-align:right;font-variant-numeric:tabular-nums}
    .sum td{font-weight:600;border-top:1px solid #cbd5e1}
    .ergebnis td{font-weight:700;font-size:17px;border-top:2px solid #059669;border-bottom:none;color:#059669}
    .hinweis{font-size:13px;color:#475569;margin-top:20px}
    .fuss{font-size:11px;color:#94a3b8;margin-top:40px}
    @media print{.noprint{display:none}}
    .noprint{position:fixed;top:16px;right:16px}
    button{background:#059669;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-size:14px;cursor:pointer}
  </style></head><body>
  <div class="noprint"><button onclick="window.print()">Drucken / als PDF speichern</button></div>
  ${seiten || '<section class="seite"><p>Keine Mieter mit Abrechnung.</p></section>'}
  </body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- Version & Datensicherung / Synchronisierung ----------
function appVersion() {
  try {
    return JSON.parse(readFileSync(join(Pfade.ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
app.get('/api/version', () => ({ version: appVersion() }));

// Auf Updates prüfen (GitHub Releases)
app.get('/api/update/check', async () => {
  const m = mandant();
  try {
    return await pruefeUpdate({ repo: m.update_repo, token: m.update_token, aktuelleVersion: appVersion() });
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

// Update herunterladen, austauschen und App neu starten
app.post('/api/update/install', async (req) => {
  const m = mandant();
  try {
    const info = await pruefeUpdate({ repo: m.update_repo, token: m.update_token, aktuelleVersion: appVersion() });
    if (info.error) return info;
    if (!info.updateVerfuegbar) return { error: 'Es ist bereits die neueste Version installiert.' };
    if (!info.asset) return { error: 'Im Release ist keine .zip-Datei zum automatischen Installieren hinterlegt.' };

    const headers = { 'User-Agent': 'GBR-Immo-Updater', Accept: 'application/octet-stream' };
    if (m.update_token) headers.Authorization = `Bearer ${m.update_token}`;
    const dl = await fetch(info.asset.url, { headers, redirect: 'follow' });
    if (!dl.ok) return { error: `Download fehlgeschlagen (${dl.status}).` };
    const buf = Buffer.from(await dl.arrayBuffer());

    const tmp = join(tmpdir(), `gbr-update-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const zipPfad = join(tmp, 'update.zip');
    writeFileSync(zipPfad, buf);
    const ziel = join(tmp, 'entpackt');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${zipPfad}' -DestinationPath '${ziel}' -Force"`);

    // Falls das Zip einen einzelnen Wurzelordner enthält, in diesen wechseln.
    let quelle = ziel;
    const eintraege = readdirSync(ziel);
    if (eintraege.length === 1 && statSync(join(ziel, eintraege[0])).isDirectory()) quelle = join(ziel, eintraege[0]);

    const applyBat = join(Pfade.ROOT, 'update-apply.bat');
    if (!existsSync(applyBat)) return { error: 'update-apply.bat fehlt im Installationsordner.' };
    spawn('cmd', ['/c', 'start', '""', applyBat, quelle, Pfade.ROOT], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setTimeout(() => process.exit(0), 600);
    return { ok: true, neueste: info.neueste };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

// Tabellen in FK-sicherer Reihenfolge (Eltern vor Kindern).
const SYNC_TABELLEN = [
  'mandant', 'konten', 'objekte', 'mieter', 'einheiten', 'mietvertraege',
  'bank_konten', 'belege', 'buchungen', 'buchung_splits', 'bank_umsaetze',
  'ustva_meldungen', 'dokumente', 'nk_verbrauch', 'nk_abrechnungen', 'berichtigungsobjekte',
];

// Kompletten Datenstand als eine Datei exportieren (Sicherung / Weitergabe).
app.get('/api/sync/export', (req, reply) => {
  const tabellen = {};
  for (const t of SYNC_TABELLEN) tabellen[t] = all(`SELECT * FROM ${t}`);
  const dateien = [];
  if (existsSync(Pfade.BELEGE_DIR)) {
    for (const name of readdirSync(Pfade.BELEGE_DIR)) {
      try { dateien.push({ name, base64: readFileSync(join(Pfade.BELEGE_DIR, name)).toString('base64') }); } catch { /* skip */ }
    }
  }
  const paket = { app: 'GBR-Immo', format: 1, version: appVersion(), exportiert_am: new Date().toISOString(), mandant: mandant().name, tabellen, dateien };
  const datum = new Date().toISOString().slice(0, 10);
  reply.header('content-type', 'application/json; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="GBR-Immo-Daten-${datum}.gbr"`);
  return reply.send(JSON.stringify(paket));
});

// Datenstand aus einer Datei importieren (ersetzt die aktuellen Daten, mit Sicherung).
app.post('/api/sync/import', (req) => {
  const paket = req.body;
  if (!paket || paket.app !== 'GBR-Immo' || !paket.tabellen) return { error: 'Das ist keine gültige GBR-Immo-Sicherungsdatei.' };
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(Pfade.DB_PFAD, join(Pfade.BACKUP_DIR, `vor-import-${stamp}.db`));
  } catch { /* best effort */ }

  db.exec('PRAGMA foreign_keys = OFF;');
  for (const t of [...SYNC_TABELLEN].reverse()) { try { run(`DELETE FROM ${t}`); } catch { /* skip */ } }
  let zeilen = 0;
  for (const t of SYNC_TABELLEN) {
    for (const row of paket.tabellen[t] || []) {
      const cols = Object.keys(row);
      if (!cols.length) continue;
      const platz = cols.map(() => '?').join(',');
      try { run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${platz})`, ...cols.map((c) => row[c])); zeilen++; } catch { /* skip */ }
    }
  }
  db.exec('PRAGMA foreign_keys = ON;');

  let dateien = 0;
  for (const f of paket.dateien || []) {
    try { writeFileSync(join(Pfade.BELEGE_DIR, f.name), Buffer.from(f.base64, 'base64')); dateien++; } catch { /* skip */ }
  }
  return { ok: true, zeilen, dateien, exportiert_am: paket.exportiert_am };
});

// ---------- Statisches Frontend ----------
const clientDist = join(Pfade.ROOT, 'client', 'dist');
if (existsSync(clientDist)) {
  app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
}

const PORT = process.env.PORT || 3000;
app.listen({ port: PORT, host: '127.0.0.1' }).then(() => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  GBR-Immo läuft auf ${url}\n`);
  if (process.platform === 'win32' && process.env.NODE_ENV !== 'test') {
    import('node:child_process').then(({ exec }) => exec(`start ${url}`));
  }
});
