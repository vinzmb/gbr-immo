import { berichtigungEinJahr, jahreImZeitraum } from './vorsteuer15a.js';

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(ist)}${ok ? '' : ' (erwartet ' + JSON.stringify(soll) + ')'}`);
};

// Gebäude: Vorsteuer 100.000 € (10.000.000 Cent), q0 = 60 %, 10 Jahre -> Jahresanteil 10.000 €
const geb = { vorsteuer_gesamt: 10000000, quote_urspruenglich: 0.60, jahre: 10 };

// Jahr komplett steuerfrei (qn=0): Δ=-0.60 -> -6.000 €, anzuwenden
let r = berichtigungEinJahr(geb, 0);
pruefe('qn=0 Betrag (-6000€)', r.betrag, -600000);
pruefe('qn=0 anzuwenden', r.anzuwenden, true);

// qn=0.55: Δ=-0.05 (<10pp), Betrag -500€ (<=1000€) -> keine Berichtigung
r = berichtigungEinJahr(geb, 0.55);
pruefe('qn=0.55 Betrag 0 (Bagatelle)', r.betrag, 0);
pruefe('qn=0.55 nicht anzuwenden', r.anzuwenden, false);

// qn=0.45: Δ=-0.15 (>=10pp) -> -1.500 €, anzuwenden
r = berichtigungEinJahr(geb, 0.45);
pruefe('qn=0.45 Betrag (-1500€)', r.betrag, -150000);
pruefe('qn=0.45 anzuwenden', r.anzuwenden, true);

// qn=1.0 (voll steuerpflichtig): Δ=+0.40 -> +4.000 € zusätzlicher Abzug
r = berichtigungEinJahr(geb, 1.0);
pruefe('qn=1.0 Betrag (+4000€)', r.betrag, 400000);

// Kleines WG: Vorsteuer 800 € -> §44 Abs.1, nie Berichtigung
const klein = { vorsteuer_gesamt: 80000, quote_urspruenglich: 0.60, jahre: 10 };
pruefe('kleines WG immer 0', berichtigungEinJahr(klein, 0).betrag, 0);

// Δ knapp unter Schwelle aber Betrag > 1000€ (Abs.2 Ausnahme):
// V=300.000€, q0=0.50, qn=0.42 -> Δ=-0.08 (<10pp), Jahresanteil 30.000€, Betrag -2.400€ (>1000€) -> anzuwenden
const gross = { vorsteuer_gesamt: 30000000, quote_urspruenglich: 0.50, jahre: 10 };
r = berichtigungEinJahr(gross, 0.42);
pruefe('großes WG Δ<10pp aber Betrag>1000€ anzuwenden', r.anzuwenden, true);
pruefe('großes WG Betrag (-2400€)', r.betrag, -240000);

pruefe('Jahre 2024..2033', jahreImZeitraum('2024-05-01', 10), [2024,2025,2026,2027,2028,2029,2030,2031,2032,2033]);

console.log(fehler === 0 ? '\nAlle Tests bestanden.' : `\n${fehler} Test(s) fehlgeschlagen.`);
process.exit(fehler ? 1 : 0);
