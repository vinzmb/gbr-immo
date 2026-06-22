// Nebenkostenabrechnung: Verteilung umlagefähiger Kosten nach Fläche je Mieter.

/** Anzahl angefangener Monate im Zeitraum (für Vorauszahlungs-Hochrechnung). */
export function monateImZeitraum(von, bis) {
  const a = new Date(von);
  const b = new Date(bis);
  if (Number.isNaN(a) || Number.isNaN(b)) return 12;
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(1, Math.min(12, m));
}

/**
 * Berechnet die Nebenkostenabrechnung.
 * @param {object} p
 * @param {Array}  p.einheiten   Einheiten des Objekts
 * @param {number} p.gesamtkosten umlagefähige Kosten (Cent, brutto)
 * @param {Array}  p.vertraege   aktive Mietverträge (mit nk_vorauszahlung)
 * @param {Map}    p.mieterName  id -> Name
 * @param {number} p.monate
 * @param {object} p.vorauszahlungOverride  optional: einheit_id -> Cent (Gesamtzeitraum)
 */
export function nkBerechnen({ einheiten, gesamtkosten, vertraege, mieterName, monate, vorauszahlungOverride = {} }) {
  const gesamtflaeche = einheiten.reduce((a, e) => a + (Number(e.flaeche) || 0), 0);
  let restKosten = gesamtkosten;
  const zeilen = einheiten.map((e, i) => {
    const letzte = i === einheiten.length - 1;
    const anteil = gesamtflaeche > 0 ? (Number(e.flaeche) || 0) / gesamtflaeche : 0;
    const kostenanteil = letzte ? restKosten : Math.round(gesamtkosten * anteil);
    restKosten -= kostenanteil;
    const vertrag = vertraege.find((v) => v.einheit_id === e.id && v.aktiv);
    const vorausStandard = vertrag ? (vertrag.nk_vorauszahlung || 0) * monate : 0;
    const vorauszahlung = vorauszahlungOverride[e.id] != null ? vorauszahlungOverride[e.id] : vorausStandard;
    return {
      einheit_id: e.id,
      einheit: e.bezeichnung,
      flaeche: Number(e.flaeche) || 0,
      mieter_id: vertrag ? vertrag.mieter_id : null,
      mieter: vertrag ? mieterName.get(vertrag.mieter_id) || '–' : 'kein Mieter',
      anteil_prozent: Math.round(anteil * 10000) / 100,
      kostenanteil,
      monate,
      vorauszahlung,
      saldo: vorauszahlung - kostenanteil, // >0 Guthaben, <0 Nachzahlung
    };
  });
  return { gesamtkosten, gesamtflaeche, zeilen };
}
