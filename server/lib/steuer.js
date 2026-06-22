// Steuer- und Aufteilungslogik. Alle Beträge in Cent (Integer).

export const SATZ = { '19': 19, '7': 7, 'frei': 0 };

/** USt-/Vorsteuerbetrag, der im Bruttobetrag enthalten ist. */
export function ustAusBrutto(bruttoCent, satz) {
  const s = SATZ[satz] ?? 0;
  if (s === 0) return 0;
  return Math.round((bruttoCent * s) / (100 + s));
}

/** Nettobetrag aus Brutto. */
export function nettoAusBrutto(bruttoCent, satz) {
  return bruttoCent - ustAusBrutto(bruttoCent, satz);
}

/** Eine Einheit ist vorsteuerunschädlich (Eingangsleistung abziehbar),
 *  wenn sie steuerpflichtig vermietet ist (19 % oder 7 %), nicht bei 'frei'. */
export function istSteuerpflichtig(einheit) {
  return einheit.ust_status === '19' || einheit.ust_status === '7';
}

/**
 * Berechnet die Aufteilung einer Ausgaben-Buchung auf die Einheiten und
 * den abziehbaren Vorsteueranteil.
 *
 * @param {object} buchung  { betrag_brutto, ust_satz, aufteilung_modus, einheit_id }
 * @param {Array}  einheiten Einheiten des/der betroffenen Objekte(s)
 * @returns {{ splits: Array, vorsteuerAbziehbar: number, ustGesamt: number }}
 */
export function splitsBerechnen(buchung, einheiten) {
  const brutto = buchung.betrag_brutto;
  const satz = buchung.ust_satz;
  const ustGesamt = ustAusBrutto(brutto, satz);
  const modus = buchung.aufteilung_modus || 'direkt';

  // Keine Aufteilung / nicht gebäudebezogen: Vorsteuer voll abziehbar.
  if (modus === 'keine') {
    return {
      splits: [],
      vorsteuerAbziehbar: ustGesamt,
      ustGesamt,
    };
  }

  // Direkte Zuordnung zu genau einer Einheit.
  if (modus === 'direkt') {
    const e = einheiten.find((x) => x.id === buchung.einheit_id);
    const abziehbar = e && istSteuerpflichtig(e) ? ustGesamt : 0;
    return {
      splits: [
        {
          einheit_id: buchung.einheit_id || null,
          anteil_prozent: 100,
          betrag_brutto: brutto,
          ust_betrag: ustGesamt,
          vorsteuer_abziehbar: abziehbar,
          ust_status: e ? e.ust_status : 'frei',
        },
      ],
      vorsteuerAbziehbar: abziehbar,
      ustGesamt,
    };
  }

  // Schlüsselbasierte Aufteilung (Fläche / Umsatz / Anteil).
  const gewicht = (e) => {
    if (modus === 'flaeche') return Number(e.flaeche) || 0;
    if (modus === 'umsatz') return Number(e.umsatz_gewicht) || 0;
    if (modus === 'anteil') return Number(e.miteigentumsanteil) || 0;
    return 0;
  };

  const summe = einheiten.reduce((acc, e) => acc + gewicht(e), 0);
  if (summe <= 0) {
    // Kein gültiger Schlüssel -> nichts abziehbar, transparent gemeldet.
    return { splits: [], vorsteuerAbziehbar: 0, ustGesamt };
  }

  let restBrutto = brutto;
  let restUst = ustGesamt;
  let abziehbarSumme = 0;
  const splits = [];
  einheiten.forEach((e, i) => {
    const letzte = i === einheiten.length - 1;
    const anteil = gewicht(e) / summe;
    const bBrutto = letzte ? restBrutto : Math.round(brutto * anteil);
    const bUst = letzte ? restUst : Math.round(ustGesamt * anteil);
    restBrutto -= bBrutto;
    restUst -= bUst;
    const abziehbar = istSteuerpflichtig(e) ? bUst : 0;
    abziehbarSumme += abziehbar;
    splits.push({
      einheit_id: e.id,
      anteil_prozent: Math.round(anteil * 10000) / 100,
      betrag_brutto: bBrutto,
      ust_betrag: bUst,
      vorsteuer_abziehbar: abziehbar,
      ust_status: e.ust_status,
    });
  });

  return { splits, vorsteuerAbziehbar: abziehbarSumme, ustGesamt };
}

/** Vorsteuerabzugsquote nach Flächenschlüssel (für Anzeige). */
export function vorsteuerquoteFlaeche(einheiten) {
  const gesamt = einheiten.reduce((a, e) => a + (Number(e.flaeche) || 0), 0);
  if (gesamt <= 0) return 0;
  const steuerpflichtig = einheiten
    .filter(istSteuerpflichtig)
    .reduce((a, e) => a + (Number(e.flaeche) || 0), 0);
  return steuerpflichtig / gesamt;
}

/**
 * Aggregiert Buchungen eines Zeitraums zu UStVA-Kennzahlen.
 * @param {Array} buchungen  bereits gefiltert auf Zeitraum, nicht storniert
 */
export function ustvaBerechnen(buchungen) {
  let kz81 = 0; // BMG 19 % (netto)
  let kz86 = 0; // BMG 7 % (netto)
  let ust19 = 0;
  let ust7 = 0;
  let steuerfrei = 0;
  let kz66 = 0; // abziehbare Vorsteuer

  for (const b of buchungen) {
    if (b.storniert) continue;
    if (b.typ === 'einnahme') {
      const netto = nettoAusBrutto(b.betrag_brutto, b.ust_satz);
      const ust = ustAusBrutto(b.betrag_brutto, b.ust_satz);
      if (b.ust_satz === '19') {
        kz81 += netto;
        ust19 += ust;
      } else if (b.ust_satz === '7') {
        kz86 += netto;
        ust7 += ust;
      } else {
        steuerfrei += netto;
      }
    } else if (b.typ === 'ausgabe') {
      kz66 += b.vorsteuer_abziehbar || 0;
    }
  }

  const kz83 = ust19 + ust7 - kz66; // > 0: Zahllast, < 0: Erstattung
  return { kz81, kz86, ust_19: ust19, ust_7: ust7, kz66, kz83, steuerfrei };
}

/** Periode (z.B. '2026-Q2') -> { von, bis } ISO-Datumsstrings. */
export function periodeGrenzen(periode) {
  const jahr = Number(periode.slice(0, 4));
  if (periode.includes('Q')) {
    const q = Number(periode.split('Q')[1]);
    const startMonat = (q - 1) * 3;
    const von = new Date(Date.UTC(jahr, startMonat, 1));
    const bis = new Date(Date.UTC(jahr, startMonat + 3, 0));
    return { von: iso(von), bis: iso(bis) };
  }
  if (periode.length === 7) {
    // 'YYYY-MM'
    const monat = Number(periode.slice(5, 7)) - 1;
    const von = new Date(Date.UTC(jahr, monat, 1));
    const bis = new Date(Date.UTC(jahr, monat + 1, 0));
    return { von: iso(von), bis: iso(bis) };
  }
  // Jahr
  return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}
