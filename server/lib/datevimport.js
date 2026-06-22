// DATEV-Buchungsstapel (EXTF) einlesen und in Roh-Buchungszeilen umwandeln.
import { createHash } from 'node:crypto';

function splitCsv(text) {
  return text.split(/\r?\n/).filter((z) => z.trim() !== '').map((zeile) => {
    const felder = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < zeile.length; i++) {
      const c = zeile[i];
      if (inQ) {
        if (c === '"' && zeile[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ';') { felder.push(cur); cur = ''; }
      else cur += c;
    }
    felder.push(cur);
    return felder;
  });
}

function cent(str) {
  const n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function findeSpalte(header, kandidaten) {
  const low = header.map((h) => h.toLowerCase().trim());
  // Zuerst exakter Spaltenanfang (DATEV-Namen referenzieren sich gegenseitig,
  // z.B. "Gegenkonto (ohne BU-Schlüssel)" oder "Umsatz (ohne Soll/Haben-Kz)").
  for (const k of kandidaten) {
    const idx = low.findIndex((h) => h.startsWith(k));
    if (idx >= 0) return idx;
  }
  for (const k of kandidaten) {
    const idx = low.findIndex((h) => h.includes(k));
    if (idx >= 0) return idx;
  }
  return -1;
}

function datumIso(roh, jahr) {
  const s = String(roh).replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`; // DDMMYYYY
  if (s.length === 4) return `${jahr}-${s.slice(2, 4)}-${s.slice(0, 2)}`;           // DDMM
  return `${jahr}-01-01`;
}

/**
 * Parst einen DATEV-EXTF-Buchungsstapel.
 * @returns {{ jahr:number, zeilen:Array }}
 */
export function parseDatev(text) {
  const rows = splitCsv(text);
  if (!rows.length) return { jahr: new Date().getUTCFullYear(), zeilen: [] };

  let jahr = new Date().getUTCFullYear();
  let start = 0;
  const istHeader = (rows[0][0] || '').toUpperCase() === 'EXTF' || (rows[0][0] || '').toUpperCase() === 'DTVF';
  if (istHeader) {
    const wj = rows[0][12] || '';            // WJ-Beginn YYYYMMDD
    if (/^\d{4}/.test(wj)) jahr = Number(wj.slice(0, 4));
    start = 1;
  }
  // Spaltenüberschrift-Zeile finden
  let header = rows[start] || [];
  if (header.some((h) => /umsatz|konto|buchungstext/i.test(h))) start += 1;
  else header = [];

  const iUmsatz = header.length ? findeSpalte(header, ['umsatz']) : 0;
  const iSH = header.length ? findeSpalte(header, ['soll/haben', 'soll-haben', 's/h']) : 1;
  const iKonto = header.length ? findeSpalte(header, ['konto']) : 3;
  const iGegen = header.length ? findeSpalte(header, ['gegenkonto']) : 4;
  const iBu = header.length ? findeSpalte(header, ['bu-schl', 'buschl', 'bu ']) : 5;
  const iDatum = header.length ? findeSpalte(header, ['belegdatum', 'datum']) : 6;
  const iBeleg = header.length ? findeSpalte(header, ['belegfeld 1', 'belegfeld1']) : 7;
  const iText = header.length ? findeSpalte(header, ['buchungstext']) : 8;

  const zeilen = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    const umsatz = cent(row[iUmsatz] || '0');
    if (!umsatz) continue;
    const konto = (row[iKonto] || '').trim();
    const gegenkonto = (row[iGegen] || '').trim();
    if (!konto && !gegenkonto) continue;
    const datum = datumIso(row[iDatum] || '', jahr);
    const buchungstext = (iText >= 0 ? row[iText] : '') || '';
    zeilen.push({
      umsatz_cent: umsatz,
      sollhaben: ((row[iSH] || 'S').trim().toUpperCase().startsWith('H') ? 'H' : 'S'),
      konto, gegenkonto,
      bu: (iBu >= 0 ? row[iBu] : '').trim(),
      datum, belegfeld1: (iBeleg >= 0 ? row[iBeleg] : '') || '', buchungstext,
      import_hash: createHash('sha1').update([datum, umsatz, konto, gegenkonto, buchungstext].join('|')).digest('hex').slice(0, 16),
    });
  }
  return { jahr, zeilen };
}

// BU-Schlüssel (wie vom eigenen Export erzeugt) -> USt-Satz.
const BU_SATZ = { '3': '19', '2': '7', '9': '19', '8': '7' };
export function ustAusBu(bu) {
  return BU_SATZ[String(bu).trim()] || null;
}
