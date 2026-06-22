import { nkBerechnen } from './nebenkosten.js';
import { parseDatev, ustAusBu } from './datevimport.js';

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(ist)}${ok ? '' : ' (erwartet ' + JSON.stringify(soll) + ')'}`);
};

// --- NK mit zwei Schlüsseln (Fläche + Verbrauch Heizung) ---
const einheiten = [
  { id: 1, bezeichnung: 'Laden', flaeche: 120, miteigentumsanteil: 0 },
  { id: 2, bezeichnung: 'Praxis', flaeche: 80, miteigentumsanteil: 0 },
];
const verbrauch = { 1: { heizung: 300 }, 2: { heizung: 100 } };
const vertraege = [
  { einheit_id: 1, mieter_id: 1, nk_vorauszahlung: 8000, aktiv: 1 },
  { einheit_id: 2, mieter_id: 2, nk_vorauszahlung: 5000, aktiv: 1 },
];
const mieterName = new Map([[1, 'Müller'], [2, 'Schmidt']]);
const res = nkBerechnen({
  einheiten,
  kostenNachSchluessel: { flaeche: 100000, verbrauch_heiz: 40000 },
  verbrauch, vertraege, mieterName, monate: 12,
});
pruefe('NK gesamtkosten', res.gesamtkosten, 140000);
pruefe('NK Laden Kostenanteil (600+300=900€)', res.zeilen[0].kostenanteil, 90000);
pruefe('NK Praxis Kostenanteil (400+100=500€)', res.zeilen[1].kostenanteil, 50000);
pruefe('NK Laden Saldo (960-900=60€ Guthaben)', res.zeilen[0].saldo, 6000);
pruefe('NK Praxis Saldo (600-500=100€ Guthaben)', res.zeilen[1].saldo, 10000);

// --- Verbrauch fehlt -> Auffangschlüssel Fläche ---
const res2 = nkBerechnen({
  einheiten, kostenNachSchluessel: { verbrauch_wasser: 100000 }, verbrauch: {},
  vertraege, mieterName, monate: 12,
});
pruefe('Verbrauch fehlt -> Fläche (Laden 60%)', res2.zeilen[0].kostenanteil, 60000);

// --- DATEV Round-Trip ---
const extf = [
  'EXTF;700;21;Buchungsstapel;13;20250630000000000;;;;;;;20250101;4;20250301;20250630;Test;;1;0;0;EUR;;;;;;;;;',
  'Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;Belegfeld 1;Buchungstext',
  '119,00;H;EUR;4860;1800;3;0103;;Miete Laden',
  '238,00;S;EUR;6310;1800;9;1503;;Reparatur',
].join('\r\n');
const dp = parseDatev(extf);
pruefe('DATEV Jahr', dp.jahr, 2025);
pruefe('DATEV Anzahl', dp.zeilen.length, 2);
pruefe('DATEV Zeile1 Betrag', dp.zeilen[0].umsatz_cent, 11900);
pruefe('DATEV Zeile1 Datum (DDMM 0103)', dp.zeilen[0].datum, '2025-03-01');
pruefe('DATEV Zeile1 SH', dp.zeilen[0].sollhaben, 'H');
pruefe('DATEV BU 3 -> 19%', ustAusBu('3'), '19');
pruefe('DATEV BU 9 -> 19%', ustAusBu('9'), '19');

console.log(fehler === 0 ? '\nAlle Tests bestanden.' : `\n${fehler} Test(s) fehlgeschlagen.`);
process.exit(fehler ? 1 : 0);
