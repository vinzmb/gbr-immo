import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtDatum } from '../api.js';
import { Card, Button, Hinweis, Badge, Field } from '../ui.jsx';

export default function Ustva() {
  const [mandant, setMandant] = useState(null);
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [teil, setTeil] = useState('Q2');
  const [daten, setDaten] = useState(null);
  const [meldung, setMeldung] = useState('');

  useEffect(() => { api.get('/mandant').then((m) => { setMandant(m); setTeil(standardTeil(m.voranmeldungszeitraum)); }); }, []);

  const periode = bauePeriode(jahr, teil, mandant?.voranmeldungszeitraum);

  const laden = () => { if (periode) api.get(`/ustva?periode=${periode}`).then(setDaten); };
  useEffect(() => { laden(); }, [periode]);

  const festschreiben = async () => {
    await api.post('/ustva/festschreiben', { periode });
    setMeldung(`Voranmeldung ${periode} festgeschrieben.`);
    setTimeout(() => setMeldung(''), 3000);
  };

  const datevExport = () => { window.open(`/api/export/datev?periode=${periode}`, '_blank'); };
  const elsterExport = () => { window.open(`/api/export/elster?periode=${periode}`, '_blank'); };
  const [importErgebnis, setImportErgebnis] = useState(null);
  const datevImport = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      const res = await api.post('/import/datev', { dateiinhalt: r.result });
      setImportErgebnis(res);
      laden();
    };
    r.readAsText(file, 'utf-8');
  };

  if (!mandant) return <div className="text-slate-400">Lädt …</div>;
  const zr = mandant.voranmeldungszeitraum;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">USt-Voranmeldung</h1>
        <p className="text-slate-500 mt-1">Kennzahlen berechnen, festschreiben und nach DATEV exportieren</p>
      </header>

      <Card title="Zeitraum wählen" subtitle={`Voranmeldungszeitraum laut Stammdaten: ${zr}`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Jahr</span>
            <select value={jahr} onChange={(e) => setJahr(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
              {[0, 1, 2, 3].map((d) => { const j = new Date().getFullYear() - d; return <option key={j} value={j}>{j}</option>; })}
            </select>
          </label>
          {zr !== 'jahr' && (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">{zr === 'monat' ? 'Monat' : 'Quartal'}</span>
              <select value={teil} onChange={(e) => setTeil(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
                {teilOptionen(zr).map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </label>
          )}
          <div className="text-sm text-slate-500">Periode: <strong className="text-slate-700">{periode}</strong></div>
        </div>
      </Card>

      {daten && (
        <>
          <Card title={`Kennzahlen ${daten.periode}`} subtitle={`${fmtDatum(daten.von)} – ${fmtDatum(daten.bis)} · ${daten.anzahl} Buchungen`}>
            <div className="space-y-1">
              <Zeile kz="81" text="Steuerpflichtige Umsätze 19 % (Bemessungsgrundlage, netto)" wert={daten.kz81} />
              <Zeile text="↳ Umsatzsteuer 19 %" wert={daten.ust_19} indent />
              <Zeile kz="86" text="Steuerpflichtige Umsätze 7 % (Bemessungsgrundlage, netto)" wert={daten.kz86} />
              <Zeile text="↳ Umsatzsteuer 7 %" wert={daten.ust_7} indent />
              <Zeile text="Steuerfreie Vermietungsumsätze (§4 Nr.12, nachrichtlich)" wert={daten.steuerfrei} grau />
              <Zeile kz="66" text="Abziehbare Vorsteuerbeträge" wert={daten.kz66} />
              <div className="border-t border-slate-200 mt-2 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge color="slate">Kz 83</Badge>
                    <span className="font-semibold text-slate-800">{daten.kz83 >= 0 ? 'Verbleibende Umsatzsteuer (Zahllast)' : 'Überschuss (Erstattung)'}</span>
                  </div>
                  <span className={`text-2xl font-bold tabular-nums ${daten.kz83 >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtEuro(Math.abs(daten.kz83))}</span>
                </div>
              </div>
            </div>
          </Card>

          {meldung && <Hinweis ton="ok">{meldung}</Hinweis>}

          <div className="flex flex-wrap gap-3">
            <Button onClick={datevExport}>DATEV-Buchungsstapel exportieren</Button>
            <Button onClick={elsterExport}>ELSTER-XML exportieren</Button>
            <Button variant="ghost" onClick={festschreiben}>Voranmeldung festschreiben</Button>
          </div>

          <Hinweis ton="warn">
            <strong>Hinweis:</strong> Die Berechnung unterstützt die Vorbereitung, ersetzt aber keine Steuerberatung.
            Die DATEV-Konten- und BU-Schlüssel sind mit deinem Steuerberater abzustimmen. Die <strong>ELSTER-XML</strong>
            enthält die UStVA-Kennzahlen; der <em>tatsächliche Versand</em> ans Finanzamt erfordert zusätzlich die
            ERiC-Schnittstelle und ein ELSTER-Zertifikat.
          </Hinweis>
        </>
      )}

      <Card title="DATEV-Buchungen importieren" subtitle="Bestehenden DATEV-Buchungsstapel (EXTF-CSV) einlesen und Buchungen ableiten">
        <Field label="DATEV-Datei (.csv)">
          <input type="file" accept=".csv,.txt" onChange={(e) => datevImport(e.target.files[0])} className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
        </Field>
        {importErgebnis && (
          <div className="mt-3">
            <Hinweis ton="ok">{importErgebnis.gefunden} Zeilen erkannt (Jahr {importErgebnis.jahr}) · {importErgebnis.neu} neu importiert · {importErgebnis.duplikate} Duplikate übersprungen.</Hinweis>
          </div>
        )}
      </Card>
    </div>
  );
}

function Zeile({ kz, text, wert, indent, grau }) {
  return (
    <div className={`flex items-center justify-between py-2 ${indent ? 'pl-6' : ''}`}>
      <div className="flex items-center gap-2">
        {kz && <Badge color="slate">Kz {kz}</Badge>}
        <span className={grau ? 'text-slate-400' : 'text-slate-700'}>{text}</span>
      </div>
      <span className={`tabular-nums ${grau ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>{fmtEuro(wert)}</span>
    </div>
  );
}

const standardTeil = (zr) => (zr === 'monat' ? String(new Date().getMonth() + 1).padStart(2, '0') : zr === 'jahr' ? '' : `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`);
const teilOptionen = (zr) =>
  zr === 'monat'
    ? Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1).padStart(2, '0'), l: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][i] }))
    : [1, 2, 3, 4].map((q) => ({ v: `Q${q}`, l: `${q}. Quartal` }));
function bauePeriode(jahr, teil, zr) {
  if (!zr) return null;
  if (zr === 'jahr') return String(jahr);
  if (zr === 'monat') return `${jahr}-${teil}`;
  return `${jahr}-${teil}`;
}
