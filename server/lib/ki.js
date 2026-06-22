// KI-Belegzuordnung & OCR über die Anthropic-API (eigener API-Schlüssel des Nutzers).
// Opt-in: Belegdaten verlassen das Gerät nur, wenn ki_aktiv gesetzt ist.

const MODELL = 'claude-sonnet-4-6';
const API = 'https://api.anthropic.com/v1/messages';

function systemPrompt(konten, einheiten) {
  const kontenliste = konten.map((k) => `${k.nummer} = ${k.bezeichnung} (USt ${k.ust_satz || '-'})`).join('\n');
  const einheitenliste = einheiten.map((e) => `#${e.id} = ${e.bezeichnung} (${e.flaeche} m², USt-Status ${e.ust_status})`).join('\n');
  return `Du bist Buchhaltungs-Assistent für eine deutsche Grundstücks-GbR (Vermietung).
Analysiere den Beleg und ordne ihn einer Buchung zu. Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Erklärung.

Verfügbare Konten (SKR04):
${kontenliste}

Mieteinheiten:
${einheitenliste}

JSON-Schema:
{
  "partner": string,            // Lieferant oder Mieter
  "datum": "YYYY-MM-DD",
  "beleg_nr": string,
  "betrag_brutto_euro": number, // Bruttobetrag in Euro
  "ust_satz": "19" | "7" | "frei",
  "konto": string,              // Kontonummer aus der Liste
  "typ": "einnahme" | "ausgabe",
  "aufteilung_modus": "direkt" | "flaeche" | "umsatz" | "anteil" | "manuell" | "keine",
  "einheit_id": number | null,  // nur bei "direkt"
  "kategorie": string,
  "beschreibung": string,
  "volltext": string,           // erkannter Belegtext (OCR)
  "konfidenz": number           // 0..1
}

Regeln: Gemeinkosten (Dach, Fassade, Verwaltung) -> "flaeche". Eindeutig einer Einheit zuordenbare Kosten -> "direkt" mit einheit_id. Betrifft eine Rechnung mehrere konkrete Einheiten/Mieter -> "manuell". Mieteinnahmen -> typ "einnahme".`;
}

async function ruf(apiKey, system, content) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODELL, max_tokens: 1500, system, messages: [{ role: 'user', content }] }),
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

/** Klassifiziert einen Beleg anhand von Text. */
export async function belegKlassifizieren({ apiKey, text, konten, einheiten, art }) {
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt.');
  return ruf(apiKey, systemPrompt(konten, einheiten), [
    { type: 'text', text: `Belegart: ${art}\n\nBelegtext:\n${text}` },
  ]);
}

/**
 * Liest einen Beleg direkt aus Datei (PDF/Bild) per Vision-OCR und extrahiert die Felder.
 * @param {object} p { apiKey, dataUrl, konten, einheiten, art }
 */
export async function belegAusDateiLesen({ apiKey, dataUrl, konten, einheiten, art }) {
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt.');
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/s);
  const mediaType = m ? m[1] : 'application/octet-stream';
  const data = m ? m[2] : dataUrl;

  let block;
  if (mediaType === 'application/pdf') {
    block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  } else if (mediaType.startsWith('image/')) {
    block = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  } else {
    throw new Error('Nicht unterstütztes Dateiformat (nur PDF oder Bild).');
  }

  return ruf(apiKey, systemPrompt(konten, einheiten), [
    block,
    { type: 'text', text: `Belegart: ${art}. Lies den Beleg vollständig aus und gib das JSON zurück.` },
  ]);
}

const NK_ARTEN = 'Grundsteuer, Wasser/Abwasser, Heizung/Warmwasser, Aufzug, Müllabfuhr, Straßenreinigung, Gebäudereinigung, Gartenpflege, Allgemeinstrom/Beleuchtung, Schornsteinreinigung, Sach-/Haftpflichtversicherung, Hauswart/Hausmeister, Antenne/Kabel, Sonstige Betriebskosten';

/**
 * Stuft Ausgaben-Buchungen als umlagefähig (Betriebskosten nach BetrKV) ein.
 * @param {object} p { apiKey, buchungen: [{id, text}] }
 * @returns {Promise<Array<{id, umlagefaehig:boolean, art:string, begruendung:string}>>}
 */
export async function nkKlassifizieren({ apiKey, buchungen }) {
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt.');
  const system = `Du bist Buchhaltungs-Assistent für eine deutsche Vermietung. Beurteile je Kostenposition,
ob sie nach Betriebskostenverordnung (BetrKV) auf Mieter umlagefähig ist.

Umlagefähig sind laufende Betriebskosten: ${NK_ARTEN}.
NICHT umlagefähig sind u.a.: Instandhaltung/Reparaturen, Verwaltungskosten, Bank-/Kontoführung,
Abschreibungen (AfA), Finanzierungskosten, einmalige Anschaffungen.

Antworte AUSSCHLIESSLICH mit einem JSON-Array, ein Objekt je Position:
[{ "id": number, "umlagefaehig": boolean, "art": string, "schluessel": string, "begruendung": string }]
"art" ist eine der genannten Betriebskostenarten (oder "" wenn nicht umlagefähig).
"schluessel" ist der Umlageschlüssel: "verbrauch_heiz" bei Heizung/Warmwasser,
"verbrauch_wasser" bei Wasser/Abwasser, sonst "flaeche".`;

  const liste = buchungen.map((b) => `id ${b.id}: ${b.text}`).join('\n');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODELL, max_tokens: 2000, system, messages: [{ role: 'user', content: `Positionen:\n${liste}` }] }),
  });
  if (!res.ok) throw new Error(`KI-Fehler ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const inhalt = (data.content || []).map((c) => c.text || '').join('');
  const json = inhalt.match(/\[[\s\S]*\]/);
  if (!json) throw new Error('KI-Antwort enthielt kein JSON-Array.');
  return JSON.parse(json[0]);
}
