import React, { useState } from 'react';
import { Card } from '../ui.jsx';

const THEMEN = [
  {
    titel: 'Die wichtigsten Begriffe',
    eintraege: [
      ['Umsatzsteuer (USt) / Mehrwertsteuer', 'Die Steuer, die auf Mieten und Rechnungen aufgeschlagen wird – meist 19 %. Wenn du Miete mit Umsatzsteuer kassierst, gehört dieser Anteil dem Finanzamt, nicht dir.'],
      ['Vorsteuer', 'Die Umsatzsteuer, die in deinen Ausgaben steckt (z. B. in der Handwerkerrechnung). Diese kannst du dir vom Finanzamt zurückholen – aber nur, soweit du selbst mit Umsatzsteuer vermietest.'],
      ['Brutto / Netto', 'Brutto = der Betrag inklusive Umsatzsteuer (das, was tatsächlich gezahlt wird). Netto = ohne Umsatzsteuer. Du gibst in der App immer den Brutto-Betrag ein, den Rest rechnet sie aus.'],
      ['Beleg', 'Eine Rechnung oder Quittung – der Nachweis für eine Einnahme oder Ausgabe. Belege solltest du aufbewahren; die App archiviert sie für dich.'],
      ['Buchung', 'Das Festhalten einer Einnahme oder Ausgabe in der App. Aus allen Buchungen entstehen die Auswertungen und die Steuer-Meldungen.'],
    ],
  },
  {
    titel: 'Umsatzsteuer-Voranmeldung',
    eintraege: [
      ['USt-Voranmeldung', 'Eine regelmäßige Meldung ans Finanzamt (meist je Quartal): Wie viel Umsatzsteuer hast du eingenommen, wie viel Vorsteuer hattest du? Die Differenz zahlst du – oder bekommst sie zurück.'],
      ['Zahllast', 'Der Betrag, den du ans Finanzamt überweisen musst (eingenommene USt minus deine Vorsteuer). Ist die Vorsteuer höher, bekommst du Geld zurück (Erstattung).'],
      ['Bemessungsgrundlage', 'Der Netto-Umsatz, auf den die Steuer berechnet wird. In der Meldung steht z. B. „Kz 81" für die mit 19 % besteuerten Netto-Umsätze.'],
      ['Kennzahlen (Kz 81, 86, 66, 83)', 'Nummerierte Felder im amtlichen Formular. Du musst sie nicht auswendig kennen – die App füllt sie automatisch und zeigt daneben, was sie bedeuten.'],
    ],
  },
  {
    titel: 'Aufteilung & Vorsteuerquote',
    eintraege: [
      ['Warum aufteilen?', 'Wenn dein Gebäude teils mit Umsatzsteuer (z. B. an einen Laden) und teils ohne (z. B. an eine Arztpraxis) vermietet ist, darfst du die Vorsteuer aus allgemeinen Kosten nur anteilig abziehen.'],
      ['Vorsteuerquote', 'Der Anteil der Fläche, der mit Umsatzsteuer vermietet ist. Beispiel: 120 m² von 200 m² → 60 %. Dann sind 60 % der Vorsteuer aus gemeinsamen Kosten abziehbar.'],
      ['Aufteilungsschlüssel', 'Die Regel, nach der Kosten verteilt werden: meist nach Fläche. Bei einer Rechnung, die nur eine Einheit betrifft, wählst du „direkt". Betrifft sie mehrere Mieter, kannst du „manuell" eigene Anteile vergeben.'],
      ['Mieterwechsel', 'Wechselt der Mieter einer Einheit, trägst du beim alten Vertrag ein Ende-Datum ein und legst einen neuen Vertrag an. Die App bestimmt die Vorsteuerabzugsberechtigung automatisch nach dem zum Buchungsdatum gültigen Vertrag – Kosten vor und nach dem Wechsel werden korrekt unterschiedlich behandelt.'],
      ['Vorsteuerberichtigung (§15a UStG)', 'Hast du beim Kauf/Bau oder bei großen Maßnahmen Vorsteuer gezogen und ändert sich danach innerhalb von 10 Jahren die Nutzung (z. B. von steuerpflichtiger zu steuerfreier Vermietung wegen Mieterwechsel), musst du einen Teil der Vorsteuer anteilig zurückzahlen – oder bekommst mehr. Das betrifft die Gebäude-Vorsteuer und ist mit dem Steuerberater abzustimmen.'],
    ],
  },
  {
    titel: 'Nebenkosten',
    eintraege: [
      ['Nebenkostenabrechnung', 'Die jährliche Abrechnung der Betriebskosten mit deinen Mietern: Wer hat welchen Anteil getragen, was wurde schon vorausgezahlt, wer zahlt nach oder bekommt etwas zurück.'],
      ['Umlagefähig', 'Kosten, die du auf die Mieter umlegen (weiterberechnen) darfst – z. B. Grundsteuer, Versicherung, Müll, Heizung. Nicht umlagefähig sind z. B. Reparaturen und Verwaltungskosten.'],
      ['Vorauszahlung', 'Der monatliche Betrag, den Mieter zusätzlich zur Miete für Nebenkosten zahlen. Am Jahresende wird mit den echten Kosten verglichen.'],
      ['Verteilungsschlüssel', 'Wie Nebenkosten verteilt werden: meist nach Fläche, bei Heizung/Wasser oft nach Verbrauch (Zählerstände).'],
    ],
  },
  {
    titel: 'Schnittstellen & Automatik',
    eintraege: [
      ['DATEV', 'Eine in Deutschland weit verbreitete Buchhaltungssoftware, die viele Steuerberater nutzen. Die App kann Buchungen als DATEV-Datei ausgeben (für den Steuerberater) und vorhandene DATEV-Dateien einlesen.'],
      ['ELSTER', 'Das offizielle Online-Portal des Finanzamts. Die App erzeugt die passende Datei; der eigentliche Versand über ELSTER ist ein späterer Ausbauschritt.'],
      ['Sollstellung', 'Das automatische Erfassen der erwarteten Miet- und Nebenkosten-Einnahmen für jeden Monat – damit du sie nicht von Hand eintippen musst.'],
      ['Bankimport & Abgleich', 'Du lädst deine Kontoumsätze hoch; die App schlägt automatisch die passende Buchung oder den passenden Beleg vor.'],
      ['OCR', 'Automatisches Auslesen: Lädst du einen Beleg als Foto/PDF hoch, liest die App Betrag, Datum und Lieferant heraus, damit du nichts abtippen musst.'],
    ],
  },
  {
    titel: 'Einstellungen verstehen',
    eintraege: [
      ['Ist- / Soll-Versteuerung', 'Ist: Die Umsatzsteuer wird fällig, wenn das Geld eingeht (meist passend für Vermietung). Soll: schon bei Rechnungsstellung. Im Zweifel „Ist" lassen.'],
      ['Voranmeldungszeitraum', 'Wie oft du die Umsatzsteuer meldest: monatlich, je Quartal oder jährlich. Das gibt dir das Finanzamt vor.'],
      ['Kontenrahmen (SKR 04)', 'Ein standardisiertes Nummernsystem für Buchhaltungskonten. Du musst dich nicht darum kümmern – die App wählt die Konten automatisch.'],
    ],
  },
];

export default function Hilfe() {
  const [suche, setSuche] = useState('');
  const q = suche.toLowerCase();
  const themen = THEMEN.map((t) => ({
    ...t,
    eintraege: t.eintraege.filter(([k, v]) => !q || (k + ' ' + v).toLowerCase().includes(q)),
  })).filter((t) => t.eintraege.length);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Hilfe &amp; Lexikon</h1>
        <p className="text-slate-500 mt-1">Alle Fachbegriffe einfach erklärt — keine Vorkenntnisse nötig</p>
      </header>

      <input
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder="Begriff suchen (z. B. Vorsteuer, umlagefähig, ELSTER) …"
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />

      {themen.map((t) => (
        <Card key={t.titel} title={t.titel}>
          <dl className="space-y-4">
            {t.eintraege.map(([begriff, erklaerung]) => (
              <div key={begriff}>
                <dt className="font-semibold text-slate-800">{begriff}</dt>
                <dd className="text-sm text-slate-600 mt-0.5 leading-relaxed">{erklaerung}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
      {themen.length === 0 && <p className="text-slate-400">Kein Treffer. Versuche einen anderen Begriff.</p>}
    </div>
  );
}
