// Automatisches Matching: Bankumsatz <-> bereits erfasster Beleg.
// Bewertet Kandidaten nach Betrag, Datum und Namensähnlichkeit.

function tageDifferenz(a, b) {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 9999;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function tokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function namensAehnlichkeit(bankText, belegPartner) {
  const a = new Set(tokens(bankText));
  const b = tokens(belegPartner);
  if (!b.length || !a.size) return 0;
  const treffer = b.filter((t) => a.has(t)).length;
  return treffer / b.length; // 0..1
}

/**
 * Bewertet einen Beleg gegen einen Bankumsatz. 0..100.
 */
export function bewerteTreffer(umsatz, beleg) {
  const betragUmsatz = Math.abs(umsatz.betrag);
  let score = 0;
  const gruende = [];

  // Betrag (wichtigstes Kriterium)
  if (beleg.betrag_brutto === betragUmsatz) {
    score += 60;
    gruende.push('Betrag exakt');
  } else if (betragUmsatz > 0 && Math.abs(beleg.betrag_brutto - betragUmsatz) / betragUmsatz <= 0.02) {
    score += 35;
    gruende.push('Betrag ~gleich');
  } else {
    return null; // ohne Betragsnähe kein Treffer
  }

  // Datum
  const diff = tageDifferenz(beleg.datum, umsatz.datum);
  if (diff <= 3) { score += 25; gruende.push('Datum sehr nah'); }
  else if (diff <= 10) { score += 15; gruende.push('Datum nah'); }
  else if (diff <= 31) { score += 7; gruende.push('Datum im Monat'); }

  // Name / Verwendungszweck
  const aehnlich = namensAehnlichkeit(`${umsatz.gegenpartei} ${umsatz.verwendungszweck}`, beleg.partner);
  if (aehnlich >= 0.5) { score += 15; gruende.push('Name passt'); }
  else if (aehnlich > 0) { score += 7; gruende.push('Name ähnlich'); }

  return { score: Math.min(score, 100), gruende, diff: Math.round(diff) };
}

/**
 * Findet die besten Beleg-Treffer für einen Bankumsatz.
 * @returns Array<{ beleg, score, gruende, stark }>
 */
export function findeTreffer(umsatz, belege, max = 3) {
  const kandidaten = [];
  for (const beleg of belege) {
    const b = bewerteTreffer(umsatz, beleg);
    if (b) kandidaten.push({ beleg, ...b, stark: b.score >= 80 });
  }
  kandidaten.sort((a, b) => b.score - a.score);
  return kandidaten.slice(0, max);
}
