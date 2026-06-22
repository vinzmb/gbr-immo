// KI-Belegzuordnung über die Anthropic-API (eigener API-Schlüssel des Nutzers).
// Opt-in: Belegtext verlässt das Gerät nur, wenn ki_aktiv gesetzt ist.

const MODELL = 'claude-sonnet-4-6';

/**
 * Schlägt eine Buchung für einen Belegtext vor.
 * @param {object} p { apiKey, text, konten, einheiten, art }
 * @returns {Promise<object>} Vorschlag
 */
export async function belegKlassifizieren({ apiKey, text, konten, einheiten, art }) {
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt.');

  const kontenliste = konten
    .map((k) => `${k.nummer} = ${k.bezeichnung} (USt ${k.ust_satz || '-'})`)
    .join('\n');
  const einheitenliste = einheiten
    .map((e) => `#${e.id} = ${e.bezeichnung} (${e.flaeche} m², USt-Status ${e.ust_status})`)
    .join('\n');

  const system = `Du bist Buchhaltungs-Assistent für eine deutsche Grundstücks-GbR (Vermietung).
Ordne den folgenden Beleg einer Buchung zu. Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Erklärung.

Verfügbare Konten (SKR04):
${kontenliste}

Mieteinheiten:
${einheitenliste}

JSON-Schema:
{
  "partner": string,            // Lieferant oder Mieter
  "datum": "YYYY-MM-DD",
  "betrag_brutto_euro": number, // Bruttobetrag in Euro
  "ust_satz": "19" | "7" | "frei",
  "konto": string,              // Kontonummer aus der Liste
  "typ": "einnahme" | "ausgabe",
  "aufteilung_modus": "direkt" | "flaeche" | "umsatz" | "anteil" | "keine",
  "einheit_id": number | null,  // nur bei "direkt"
  "kategorie": string,
  "beschreibung": string,
  "konfidenz": number           // 0..1
}

Regeln: Gemeinkosten (Dach, Fassade, Verwaltung) -> "flaeche". Eindeutig einer Einheit zuordenbare Kosten -> "direkt" mit einheit_id. Mieteinnahmen -> typ "einnahme".`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: `Belegart: ${art}\n\nBelegtext:\n${text}` }],
    }),
  });

  if (!res.ok) {
    const fehler = await res.text();
    throw new Error(`KI-Fehler ${res.status}: ${fehler.slice(0, 300)}`);
  }
  const data = await res.json();
  const inhalt = (data.content || []).map((c) => c.text || '').join('');
  const json = inhalt.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('KI-Antwort enthielt kein JSON.');
  const vorschlag = JSON.parse(json[0]);
  vorschlag.betrag_brutto = Math.round((vorschlag.betrag_brutto_euro || 0) * 100);
  return vorschlag;
}
