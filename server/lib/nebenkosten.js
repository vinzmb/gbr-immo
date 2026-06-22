// Nebenkostenabrechnung: Verteilung umlagefähiger Kosten je Umlageschlüssel.

export function monateImZeitraum(von, bis) {
  const a = new Date(von);
  const b = new Date(bis);
  if (Number.isNaN(a) || Number.isNaN(b)) return 12;
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(1, Math.min(12, m));
}

// Gewicht einer Einheit für einen Umlageschlüssel.
function gewichtFuer(schluessel, e, verbrauch) {
  const v = verbrauch[e.id] || {};
  switch (schluessel) {
    case 'verbrauch_heiz': return Number(v.heizung) || 0;
    case 'verbrauch_wasser': return Number(v.wasser) || 0;
    case 'personen': return Number(v.personen) || 0;
    case 'anteil': return Number(e.miteigentumsanteil) || 0;
    case 'flaeche':
    default: return Number(e.flaeche) || 0;
  }
}

// Verteilt einen Kostenbetrag nach Schlüssel auf die Einheiten -> Map einheit_id -> cent.
function verteile(betrag, schluessel, einheiten, verbrauch) {
  const summe = einheiten.reduce((a, e) => a + gewichtFuer(schluessel, e, verbrauch), 0);
  const ergebnis = {};
  if (summe <= 0) {
    // Auffangschlüssel Fläche, falls kein Verbrauch hinterlegt
    if (schluessel !== 'flaeche') return verteile(betrag, 'flaeche', einheiten, verbrauch);
    einheiten.forEach((e) => { ergebnis[e.id] = 0; });
    return ergebnis;
  }
  let rest = betrag;
  einheiten.forEach((e, i) => {
    const letzte = i === einheiten.length - 1;
    const anteil = gewichtFuer(schluessel, e, verbrauch) / summe;
    const b = letzte ? rest : Math.round(betrag * anteil);
    rest -= b;
    ergebnis[e.id] = b;
  });
  return ergebnis;
}

/**
 * Berechnet die Nebenkostenabrechnung mit mehreren Umlageschlüsseln.
 * @param {object} p
 * @param {Array}  p.einheiten
 * @param {object} p.kostenNachSchluessel  { flaeche: cent, verbrauch_heiz: cent, ... }
 * @param {object} p.verbrauch  { einheit_id: { heizung, wasser, personen } }
 * @param {Array}  p.vertraege  aktive Verträge (nk_vorauszahlung)
 * @param {Map}    p.mieterName
 * @param {number} p.monate
 * @param {object} p.vorauszahlungOverride
 */
export function nkBerechnen({ einheiten, kostenNachSchluessel, verbrauch = {}, vertraege, mieterName, monate, vorauszahlungOverride = {} }) {
  const gesamtflaeche = einheiten.reduce((a, e) => a + (Number(e.flaeche) || 0), 0);
  const gesamtkosten = Object.values(kostenNachSchluessel).reduce((a, b) => a + b, 0);

  // Pro Einheit den Kostenanteil über alle Schlüssel summieren.
  const anteilProEinheit = {};
  einheiten.forEach((e) => { anteilProEinheit[e.id] = 0; });
  const schluesselDetails = {};
  for (const [schluessel, betrag] of Object.entries(kostenNachSchluessel)) {
    if (!betrag) continue;
    const verteilung = verteile(betrag, schluessel, einheiten, verbrauch);
    schluesselDetails[schluessel] = { betrag, verteilung };
    for (const e of einheiten) anteilProEinheit[e.id] += verteilung[e.id] || 0;
  }

  const zeilen = einheiten.map((e) => {
    const vertrag = vertraege.find((v) => v.einheit_id === e.id && v.aktiv);
    const vorausStandard = vertrag ? (vertrag.nk_vorauszahlung || 0) * monate : 0;
    const vorauszahlung = vorauszahlungOverride[e.id] != null ? vorauszahlungOverride[e.id] : vorausStandard;
    const kostenanteil = anteilProEinheit[e.id];
    return {
      einheit_id: e.id,
      einheit: e.bezeichnung,
      flaeche: Number(e.flaeche) || 0,
      mieter_id: vertrag ? vertrag.mieter_id : null,
      mieter: vertrag ? mieterName.get(vertrag.mieter_id) || '–' : 'kein Mieter',
      anteil_prozent: gesamtkosten > 0 ? Math.round((kostenanteil / gesamtkosten) * 10000) / 100 : 0,
      kostenanteil,
      monate,
      vorauszahlung,
      saldo: vorauszahlung - kostenanteil,
    };
  });

  return { gesamtkosten, gesamtflaeche, zeilen, schluessel: schluesselDetails };
}
