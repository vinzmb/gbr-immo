// Parser für Bankumsätze: CSV (universell), CAMT.053 (SEPA-XML), MT940.
import { createHash } from 'node:crypto';

function hash(...teile) {
  return createHash('sha1').update(teile.join('|')).digest('hex').slice(0, 16);
}

function centAusBetrag(str) {
  if (typeof str === 'number') return Math.round(str * 100);
  let s = String(str).trim().replace(/\s/g, '');
  // deutsches Format 1.234,56 -> 1234.56
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function csvZeilen(text) {
  const sep = (text.match(/;/g) || []).length >= (text.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let feldArr = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { feldArr.push(cur); cur = ''; }
    else if (c === '\n') { feldArr.push(cur); rows.push(feldArr); feldArr = []; cur = ''; }
    else if (c === '\r') { /* skip */ }
    else cur += c;
  }
  if (cur.length || feldArr.length) { feldArr.push(cur); rows.push(feldArr); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function findeSpalte(header, kandidaten) {
  const low = header.map((h) => h.toLowerCase().trim());
  for (const k of kandidaten) {
    const idx = low.findIndex((h) => h.includes(k));
    if (idx >= 0) return idx;
  }
  return -1;
}

function normDatum(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (m) {
    const jahr = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${jahr}-${m[2]}-${m[1]}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/); // YYMMDD (MT940)
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  return s;
}

export function parseCsv(text) {
  const rows = csvZeilen(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  const iDatum = findeSpalte(header, ['buchungstag', 'buchungsdatum', 'datum', 'valuta', 'date']);
  const iBetrag = findeSpalte(header, ['betrag', 'umsatz', 'amount']);
  const iZweck = findeSpalte(header, ['verwendungszweck', 'buchungstext', 'vorgang', 'zweck', 'description', 'reference']);
  const iPartner = findeSpalte(header, ['auftraggeber', 'empfänger', 'empfaenger', 'beguenstigter', 'name', 'zahlungsbeteiligter', 'partner']);
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (iDatum < 0 || iBetrag < 0) break;
    const datum = normDatum(row[iDatum] || '');
    const betrag = centAusBetrag(row[iBetrag] || '0');
    if (!datum || betrag === 0) continue;
    const verwendungszweck = (iZweck >= 0 ? row[iZweck] : '') || '';
    const gegenpartei = (iPartner >= 0 ? row[iPartner] : '') || '';
    out.push({
      datum, betrag, verwendungszweck: verwendungszweck.trim(), gegenpartei: gegenpartei.trim(),
      import_hash: hash(datum, betrag, verwendungszweck, gegenpartei),
    });
  }
  return out;
}

export function parseCamt(xml) {
  const out = [];
  const entries = xml.split(/<Ntry>/).slice(1);
  for (const e of entries) {
    const betragRaw = (e.match(/<Amt[^>]*>([\d.,]+)<\/Amt>/) || [])[1] || '0';
    const cdtDbt = (e.match(/<CdtDbtInd>(\w+)<\/CdtDbtInd>/) || [])[1] || 'CRDT';
    const datum = (e.match(/<BookgDt>[\s\S]*?<Dt>([\d-]+)<\/Dt>/) || [])[1]
      || (e.match(/<ValDt>[\s\S]*?<Dt>([\d-]+)<\/Dt>/) || [])[1] || '';
    const zweck = (e.match(/<Ustrd>([\s\S]*?)<\/Ustrd>/) || [])[1] || '';
    const partner = (e.match(/<RltdPties>[\s\S]*?<Nm>([\s\S]*?)<\/Nm>/) || [])[1] || '';
    let betrag = centAusBetrag(betragRaw);
    if (cdtDbt === 'DBIT') betrag = -betrag;
    if (!datum) continue;
    out.push({
      datum: normDatum(datum), betrag,
      verwendungszweck: zweck.trim(), gegenpartei: partner.trim(),
      import_hash: hash(datum, betrag, zweck, partner),
    });
  }
  return out;
}

export function parseMt940(text) {
  const out = [];
  const blocks = text.split(/(?=:61:)/).slice(1);
  for (const b of blocks) {
    const m61 = b.match(/:61:(\d{6})(\d{4})?(C|D|RC|RD)([\d.,]+)/);
    if (!m61) continue;
    const datum = normDatum(m61[1]);
    const vz = (b.match(/:86:([\s\S]*?)(?=\n:|$)/) || [])[1] || '';
    let betrag = centAusBetrag(m61[4]);
    if (m61[3].includes('D')) betrag = -betrag;
    out.push({
      datum, betrag, verwendungszweck: vz.replace(/\n/g, ' ').trim(), gegenpartei: '',
      import_hash: hash(datum, betrag, vz),
    });
  }
  return out;
}

export function parseBank(text, dateiname = '') {
  const t = text.trim();
  if (t.startsWith('<') || /<Document[\s>]/.test(t)) return parseCamt(text);
  if (/:61:/.test(t)) return parseMt940(text);
  return parseCsv(text);
}
