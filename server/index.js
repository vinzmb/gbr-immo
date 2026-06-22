import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getDb, Pfade } from './db.js';
import {
  splitsBerechnen, ustvaBerechnen, periodeGrenzen, vorsteuerquoteFlaeche,
  ustAusBrutto, nettoAusBrutto,
} from './lib/steuer.js';
import { datevBuchungsstapel } from './lib/datev.js';
import { parseBank } from './lib/bankimport.js';
import { belegKlassifizieren, belegAusDateiLesen } from './lib/ki.js';
import { findeTreffer } from './lib/matching.js';

const db = getDb();
const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });

// ---------- Hilfsfunktionen ----------
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function mandant() {
  return one('SELECT * FROM mandant WHERE id = 1');
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
crud('mieter', ['name', 'ansprechpartner', 'email', 'telefon', 'notiz']);
crud('mietvertraege', ['einheit_id', 'mieter_id', 'nettomiete', 'ust_satz', 'beginn', 'ende', 'kaution', 'aktiv']);
crud('bank_konten', ['name', 'iban']);
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
    'voranmeldungszeitraum', 'kontenrahmen', 'ki_aktiv', 'ki_api_key'];
  const set = f.map((x) => `${x} = ?`).join(', ');
  run(`UPDATE mandant SET ${set} WHERE id = 1`, ...f.map((x) => req.body[x] ?? null));
  return mandant();
});

// ---------- Konten ----------
app.get('/api/konten', () => all('SELECT * FROM konten ORDER BY nummer'));

// ---------- Einheiten mit Umsatzgewicht (für Aufteilung) ----------
function einheitenMitGewicht(objektId) {
  const rows = objektId
    ? all('SELECT * FROM einheiten WHERE objekt_id = ?', objektId)
    : all('SELECT * FROM einheiten');
  for (const e of rows) {
    const v = one(
      'SELECT COALESCE(SUM(nettomiete),0) AS s FROM mietvertraege WHERE einheit_id = ? AND aktiv = 1',
      e.id
    );
    e.umsatz_gewicht = v.s;
  }
  return rows;
}

// Einheiten-Liste passend zum Aufteilungsmodus (inkl. manueller Gewichte).
function einheitenFuerBuchung(body) {
  if (body.aufteilung_modus === 'manuell' && Array.isArray(body.manuelle_splits)) {
    const alle = einheitenMitGewicht(null);
    return body.manuelle_splits
      .map((ms) => {
        const e = alle.find((x) => x.id === Number(ms.einheit_id));
        return e ? { ...e, manuell_gewicht: Number(ms.gewicht) || 0 } : null;
      })
      .filter(Boolean);
  }
  return einheitenMitGewicht(body.objekt_id || null);
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
  const r = run(
    `INSERT INTO buchungen (datum, beleg_id, typ, konto, gegenkonto, betrag_brutto, ust_satz, ust_betrag, vorsteuer_abziehbar, steuerschluessel, buchungstext, aufteilung_modus, einheit_id, periode)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    body.datum, body.beleg_id || null, body.typ, body.konto || '', body.gegenkonto || '1800',
    body.betrag_brutto, body.ust_satz, ust_betrag, vorsteuer_abziehbar,
    body.steuerschluessel || '', body.buchungstext || '', buchung.aufteilung_modus,
    buchung.einheit_id, periode
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
    gegenkonto: '1800', aufteilung_modus: req.body.aufteilung_modus,
    einheit_id: req.body.einheit_id || null, objekt_id: req.body.objekt_id || null,
    manuelle_splits: req.body.manuelle_splits || null,
    beleg_id: req.body.beleg_id || null,
    buchungstext: u.verwendungszweck.slice(0, 60),
  });
  run("UPDATE bank_umsaetze SET status = 'erledigt', buchung_id = ? WHERE id = ?", buchung.id, u.id);
  return buchung;
});

// ---------- UStVA ----------
function ustvaFuerPeriode(periode) {
  const { von, bis } = periodeGrenzen(periode);
  const buchungen = all(
    'SELECT * FROM buchungen WHERE datum >= ? AND datum <= ? AND storniert = 0',
    von, bis
  );
  const k = ustvaBerechnen(buchungen);
  return { periode, von, bis, anzahl: buchungen.length, ...k };
}

app.get('/api/ustva', (req) => ustvaFuerPeriode(req.query.periode));

app.post('/api/ustva/festschreiben', (req) => {
  const r = ustvaFuerPeriode(req.body.periode);
  run(
    `INSERT INTO ustva_meldungen (periode, von, bis, kz81, kz86, ust_19, ust_7, kz66, kz83, steuerfrei, status)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'festgeschrieben')
     ON CONFLICT(periode) DO UPDATE SET kz81=excluded.kz81, kz86=excluded.kz86,
       ust_19=excluded.ust_19, ust_7=excluded.ust_7, kz66=excluded.kz66, kz83=excluded.kz83,
       steuerfrei=excluded.steuerfrei, status='festgeschrieben'`,
    r.periode, r.von, r.bis, r.kz81, r.kz86, r.ust_19, r.ust_7, r.kz66, r.kz83, r.steuerfrei
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
  const csv = datevBuchungsstapel(buchungen, mandant(), { von, bis });
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="DATEV_${periode}.csv"`);
  return reply.send(csv);
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
      konten: all('SELECT * FROM konten ORDER BY nummer'),
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
      konten: all('SELECT * FROM konten ORDER BY nummer'),
      einheiten: all('SELECT * FROM einheiten'),
    });
  } catch (e) {
    return { error: String(e.message || e) };
  }
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
    quote: vorsteuerquoteFlaeche(all('SELECT * FROM einheiten')),
    aktuelleUstva,
    mandant: m,
  };
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
