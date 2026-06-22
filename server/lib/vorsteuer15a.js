// Vorsteuerberichtigung nach §15a UStG (Beträge in Cent).
// Ändert sich innerhalb des Berichtigungszeitraums (Gebäude 10 Jahre) die
// Verwendung eines Wirtschaftsguts, wird der ursprüngliche Vorsteuerabzug
// anteilig je Jahr berichtigt. Bagatellgrenzen nach §44 UStDV.

const GRENZE = 100000; // 1.000 € in Cent

/**
 * Berichtigungsbetrag eines einzelnen Jahres.
 * @param {object} obj { vorsteuer_gesamt, quote_urspruenglich (q0, 0..1), jahre }
 * @param {number} qn  tatsächliche Abzugsquote des Jahres (0..1)
 * @returns {{ betrag:number, anzuwenden:boolean, grund:string, rohbetrag:number, delta:number, jahresanteil:number }}
 *   betrag < 0 = Rückzahlung ans Finanzamt; > 0 = zusätzlicher Vorsteuerabzug.
 */
export function berichtigungEinJahr(obj, qn) {
  const V = obj.vorsteuer_gesamt || 0;
  const q0 = obj.quote_urspruenglich || 0;
  const jahre = obj.jahre || 10;
  const jahresanteil = V / jahre;
  const delta = qn - q0; // > 0: mehr abzugsberechtigt, < 0: weniger
  const rohbetrag = Math.round(jahresanteil * delta);

  // §44 Abs. 1 UStDV: keine Berichtigung, wenn Vorsteuer auf das WG ≤ 1.000 €.
  if (V <= GRENZE) {
    return { betrag: 0, anzuwenden: false, grund: 'Vorsteuer auf das Objekt ≤ 1.000 € (§44 Abs. 1 UStDV)', rohbetrag, delta, jahresanteil };
  }
  // §44 Abs. 2 UStDV: keine Berichtigung, wenn Änderung < 10 %-Punkte UND Betrag ≤ 1.000 €.
  const aenderungGenug = Math.abs(delta) >= 0.10;
  const betragGenug = Math.abs(rohbetrag) > GRENZE;
  if (!aenderungGenug && !betragGenug) {
    return { betrag: 0, anzuwenden: false, grund: 'Änderung < 10 %-Punkte und Betrag ≤ 1.000 € (§44 Abs. 2 UStDV)', rohbetrag, delta, jahresanteil };
  }
  return {
    betrag: rohbetrag,
    anzuwenden: true,
    grund: aenderungGenug ? 'Änderung ≥ 10 %-Punkte' : 'Berichtigungsbetrag > 1.000 €',
    rohbetrag, delta, jahresanteil,
  };
}

/** Liste der Kalenderjahre des Berichtigungszeitraums. */
export function jahreImZeitraum(beginn, jahre) {
  const start = Number(String(beginn || '').slice(0, 4));
  if (!start) return [];
  return Array.from({ length: jahre || 10 }, (_, i) => start + i);
}
