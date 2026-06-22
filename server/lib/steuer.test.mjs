import { splitsBerechnen, ustvaBerechnen, ustAusBrutto, nettoAusBrutto, vorsteuerquoteFlaeche, periodeGrenzen } from './steuer.js';

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(ist)}${ok ? '' : ' (erwartet ' + JSON.stringify(soll) + ')'}`);
};

pruefe('USt 19% aus 11900', ustAusBrutto(11900, '19'), 1900);
pruefe('Netto 19% aus 11900', nettoAusBrutto(11900, '19'), 10000);
pruefe('USt 7% aus 10700', ustAusBrutto(10700, '7'), 700);
pruefe('USt frei', ustAusBrutto(50000, 'frei'), 0);

const einheiten = [
  { id: 1, flaeche: 100, ust_status: '19', miteigentumsanteil: 1 },
  { id: 2, flaeche: 100, ust_status: 'frei', miteigentumsanteil: 1 },
];
pruefe('Vorsteuerquote Fläche', vorsteuerquoteFlaeche(einheiten), 0.5);

const flaeche = splitsBerechnen({ betrag_brutto: 1190, ust_satz: '19', aufteilung_modus: 'flaeche' }, einheiten);
pruefe('Gemeinkosten abziehbar (50%)', flaeche.vorsteuerAbziehbar, 95);
pruefe('Gemeinkosten USt gesamt', flaeche.ustGesamt, 190);

pruefe('Direkt steuerpflichtig', splitsBerechnen({ betrag_brutto: 1190, ust_satz: '19', aufteilung_modus: 'direkt', einheit_id: 1 }, einheiten).vorsteuerAbziehbar, 190);
pruefe('Direkt steuerfrei', splitsBerechnen({ betrag_brutto: 1190, ust_satz: '19', aufteilung_modus: 'direkt', einheit_id: 2 }, einheiten).vorsteuerAbziehbar, 0);

const buchungen = [
  { typ: 'einnahme', betrag_brutto: 11900, ust_satz: '19', storniert: 0 },
  { typ: 'einnahme', betrag_brutto: 10700, ust_satz: '7', storniert: 0 },
  { typ: 'einnahme', betrag_brutto: 50000, ust_satz: 'frei', storniert: 0 },
  { typ: 'ausgabe', betrag_brutto: 1190, ust_satz: '19', vorsteuer_abziehbar: 95, storniert: 0 },
];
pruefe('UStVA', ustvaBerechnen(buchungen), { kz81: 10000, kz86: 10000, ust_19: 1900, ust_7: 700, kz66: 95, kz83: 2505, steuerfrei: 50000 });
pruefe('Periode 2026-Q2', periodeGrenzen('2026-Q2'), { von: '2026-04-01', bis: '2026-06-30' });

console.log(fehler === 0 ? '\nAlle Tests bestanden.' : `\n${fehler} Test(s) fehlgeschlagen.`);
process.exit(fehler ? 1 : 0);
