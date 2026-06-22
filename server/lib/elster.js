// ELSTER-XML der Umsatzsteuer-Voranmeldung (Datensatz für ERiC-Übermittlung).
// Hinweis: Der tatsächliche Versand erfordert die ERiC-Bibliothek + Zertifikat.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
const euro = (cent) => (cent / 100).toFixed(2);
const ganzEuro = (cent) => String(Math.round(cent / 100));

// Periode -> ELSTER-Zeitraum-Code (Monat 01-12, Quartal 41-44).
function zeitraumCode(periode) {
  const jahr = periode.slice(0, 4);
  if (periode.includes('Q')) {
    const q = Number(periode.split('Q')[1]);
    return { jahr, code: String(40 + q) };
  }
  if (periode.length === 7) return { jahr, code: periode.slice(5, 7) };
  return { jahr, code: '' };
}

/**
 * Erzeugt die ELSTER-UStVA-XML.
 * @param {object} k    Kennzahlen { kz81, kz86, ust_19, ust_7, kz66, kz83 } (Cent)
 * @param {object} m    Mandant
 * @param {string} periode
 * @param {string} erstellungsdatum  'YYYYMMDD'
 */
export function elsterUStVAXml(k, m, periode, erstellungsdatum) {
  const { jahr, code } = zeitraumCode(periode);
  const kz = [];
  if (k.kz81) kz.push(`        <Kz81>${ganzEuro(k.kz81)}</Kz81>`);
  if (k.kz86) kz.push(`        <Kz86>${ganzEuro(k.kz86)}</Kz86>`);
  if (k.kz66) kz.push(`        <Kz66>${euro(k.kz66)}</Kz66>`);
  kz.push(`        <Kz83>${euro(k.kz83)}</Kz83>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Elster xmlns="http://www.elster.de/elsterxml/schema/v11">
  <TransferHeader version="11">
    <Verfahren>ElsterAnmeldung</Verfahren>
    <DatenArt>UStVA</DatenArt>
    <Vorgang>send-NoSig</Vorgang>
  </TransferHeader>
  <DatenTeil>
    <Nutzdatenblock>
      <NutzdatenHeader version="11">
        <NutzdatenTicket>1</NutzdatenTicket>
        <Empfaenger id="F">${esc(m.finanzamt || '')}</Empfaenger>
      </NutzdatenHeader>
      <Nutzdaten>
        <Anmeldungssteuern art="UStVA" version="${jahr}">
          <DatenLieferant>${esc(m.name || '')}</DatenLieferant>
          <Erstellungsdatum>${erstellungsdatum}</Erstellungsdatum>
          <Steuerfall>
            <Umsatzsteuervoranmeldung>
              <Jahr>${esc(jahr)}</Jahr>
              <Zeitraum>${esc(code)}</Zeitraum>
              <Steuernummer>${esc(m.steuernummer || '')}</Steuernummer>
${kz.join('\n')}
            </Umsatzsteuervoranmeldung>
          </Steuerfall>
        </Anmeldungssteuern>
      </Nutzdaten>
    </Nutzdatenblock>
  </DatenTeil>
</Elster>
`;
}
