// DATEV-Buchungsstapel (EXTF, Format 700, Kategorie 21) Export.
// Hinweis: Konten-/BU-Schlüssel-Belegung mit dem Steuerberater abstimmen.

const BU_SCHLUESSEL = { '19': '', '7': '', frei: '' };
// DATEV-BU für Vorsteuer/USt-Automatik (gängige Werte; konfigurierbar halten)
const BU_VORSTEUER = { '19': '9', '7': '8', frei: '' };
const BU_UMSATZSTEUER = { '19': '3', '7': '2', frei: '' };

function zahl(cent) {
  return (cent / 100).toFixed(2).replace('.', ',');
}

function feld(v) {
  if (v == null) return '';
  const s = String(v);
  return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Erzeugt den Inhalt einer DATEV-EXTF-Buchungsstapel-CSV.
 * @param {Array} buchungen
 * @param {object} mandant   { beraternummer?, mandantennummer?, name }
 * @param {object} zeitraum  { von:'YYYY-MM-DD', bis:'YYYY-MM-DD' }
 */
export function datevBuchungsstapel(buchungen, mandant, zeitraum) {
  const jahr = zeitraum.von.slice(0, 4);
  const wjBeginn = `${jahr}0101`;
  const datumVon = zeitraum.von.replace(/-/g, '');
  const datumBis = zeitraum.bis.replace(/-/g, '');
  const stamp = zeitraum.bis.replace(/-/g, '') + '000000000';

  // Kopfzeile (Header-Metadaten, 31 Felder gem. EXTF v7)
  const header = [
    'EXTF', '700', '21', 'Buchungsstapel', '13', stamp, '', '', '', '',
    mandant.beraternummer || '', mandant.mandantennummer || '', wjBeginn, '4',
    datumVon, datumBis, 'GBR-Immo Export', '', '1', '0', '0', 'EUR',
    '', '', '', '', '', '', '', '', '',
  ].map(feld).join(';');

  // Spaltenüberschriften (Auszug der wichtigsten Felder)
  const spalten = [
    'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz',
    'Konto', 'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum',
    'Belegfeld 1', 'Buchungstext',
  ].map(feld).join(';');

  const zeilen = buchungen
    .filter((b) => !b.storniert)
    .map((b) => {
      const istEinnahme = b.typ === 'einnahme';
      const sachkonto = b.konto;        // Erlös- bzw. Aufwandskonto
      // Bei Mieteinnahmen über das Personenkonto (Debitor) des Mieters buchen.
      const gegenkonto = (istEinnahme && b.debitor_konto) ? b.debitor_konto : (b.gegenkonto || '1800');
      const sh = istEinnahme ? 'H' : 'S';
      const bu = istEinnahme ? BU_UMSATZSTEUER[b.ust_satz] : BU_VORSTEUER[b.ust_satz];
      const [, mm, dd] = b.datum.split('-'); // YYYY-MM-DD
      const datum = `${dd}${mm}`; // DATEV-Belegdatum: TTMM
      return [
        zahl(b.betrag_brutto), sh, 'EUR', sachkonto, gegenkonto, bu || '',
        datum, b.beleg_nr || b.beleg_id || '', b.buchungstext || '',
      ].map(feld).join(';');
    });

  return [header, spalten, ...zeilen].join('\r\n') + '\r\n';
}
