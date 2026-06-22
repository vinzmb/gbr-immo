import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtDatum, euroZuCent } from '../api.js';
import { Card, Button, Table, Field, Input, Select, Badge, Hinweis } from '../ui.jsx';

export default function Nebenkosten() {
  const [wizard, setWizard] = useState(false);
  const [abrechnungen, setAbrechnungen] = useState([]);
  const [objekte, setObjekte] = useState([]);

  const laden = () => api.get('/nk/abrechnungen').then(setAbrechnungen);
  useEffect(() => { laden(); api.get('/objekte').then(setObjekte); }, []);
  const objektName = (id) => objekte.find((o) => o.id === id)?.name || '–';

  if (wizard) return <NkWizard onClose={() => { setWizard(false); laden(); }} objekte={objekte} />;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nebenkosten</h1>
          <p className="text-slate-500 mt-1">Betriebskosten je Mieter abrechnen — geführt &amp; KI-gestützt</p>
        </div>
        <Button onClick={() => setWizard(true)}>+ Neue Abrechnung</Button>
      </header>
      <Card title="Gespeicherte Abrechnungen">
        <Table
          columns={[
            { kopf: 'Zeitraum', zelle: (r) => `${fmtDatum(r.von)} – ${fmtDatum(r.bis)}` },
            { kopf: 'Objekt', zelle: (r) => objektName(r.objekt_id) },
            { kopf: 'Umlagefähige Kosten', align: 'right', zelle: (r) => fmtEuro(r.gesamtkosten) },
            { kopf: 'Erstellt', zelle: (r) => fmtDatum(r.erstellt_am) },
            { kopf: '', align: 'right', zelle: (r) => (
              <div className="flex gap-3 justify-end items-center">
                <a className="text-sm text-emerald-600 hover:underline" href={`/api/nk/abrechnungen/${r.id}/druck`} target="_blank" rel="noreferrer">Drucken / PDF</a>
                <Button variant="danger" onClick={async () => { await api.del(`/nk/abrechnungen/${r.id}`); laden(); }}>Löschen</Button>
              </div>
            ) },
          ]}
          rows={abrechnungen}
          leer={'Noch keine Abrechnung erstellt. Starte oben mit „Neue Abrechnung".'}
        />
      </Card>
    </div>
  );
}

const SCHRITTE = ['Zeitraum & Objekt', 'Umlagefähige Kosten', 'Vorauszahlungen', 'Ergebnis'];
const jahre = () => { const j = new Date().getFullYear(); return [j, j - 1, j - 2, j - 3]; };

function NkWizard({ onClose, objekte }) {
  const [schritt, setSchritt] = useState(0);
  const [jahr, setJahr] = useState(new Date().getFullYear() - 1);
  const [objektId, setObjektId] = useState(objekte[0]?.id || '');
  const [kosten, setKosten] = useState([]);
  const [kiLaedt, setKiLaedt] = useState(false);
  const [kiAktiv, setKiAktiv] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [abr, setAbr] = useState(null);
  const [gespeichertId, setGespeichertId] = useState(null);
  const [einheiten, setEinheiten] = useState([]);
  const [verbrauch, setVerbrauch] = useState({});

  const von = `${jahr}-01-01`;
  const bis = `${jahr}-12-31`;

  useEffect(() => { api.get('/mandant').then((m) => setKiAktiv(!!m.ki_aktiv)); }, []);

  const ladeKosten = async () => {
    const rows = await api.get(`/nk/kosten?von=${von}&bis=${bis}`);
    setKosten(rows.map((r) => ({ ...r, umlagefaehig: r.umlagefaehig === 1, nk_art: r.nk_art || '', umlageschluessel: r.umlageschluessel || 'flaeche' })));
    const eh = (await api.get('/einheiten')).filter((e) => e.objekt_id === Number(objektId));
    setEinheiten(eh);
    const vb = await api.get(`/nk/verbrauch?jahr=${jahr}`);
    const map = {};
    eh.forEach((e) => { const v = vb.find((x) => x.einheit_id === e.id); map[e.id] = { heizung: v?.heizung || '', wasser: v?.wasser || '', personen: v?.personen || '' }; });
    setVerbrauch(map);
  };

  const setUmlage = async (k, umlagefaehig, nk_art, umlageschluessel) => {
    const art = nk_art ?? k.nk_art;
    const schl = umlageschluessel ?? k.umlageschluessel ?? 'flaeche';
    setKosten((list) => list.map((x) => (x.id === k.id ? { ...x, umlagefaehig, nk_art: art, umlageschluessel: schl } : x)));
    await api.put(`/buchungen/${k.id}/umlage`, { umlagefaehig, nk_art: art, umlageschluessel: schl });
  };

  const setVerbrauchWert = (einheitId, feld, wert) =>
    setVerbrauch((v) => ({ ...v, [einheitId]: { ...v[einheitId], [feld]: wert } }));
  const verbrauchSpeichern = async () => {
    for (const e of einheiten) {
      const v = verbrauch[e.id] || {};
      await api.put('/nk/verbrauch', { einheit_id: e.id, jahr, heizung: v.heizung || 0, wasser: v.wasser || 0, personen: v.personen || 0 });
    }
  };
  const brauchtVerbrauch = kosten.some((k) => k.umlagefaehig && ['verbrauch_heiz', 'verbrauch_wasser', 'personen'].includes(k.umlageschluessel));

  const kiEinstufen = async () => {
    setKiLaedt(true); setMeldung('');
    try {
      const res = await api.post('/nk/klassifizieren', { buchungen: kosten });
      if (res.error) { setMeldung(res.error); }
      else {
        for (const v of res) {
          const k = kosten.find((x) => x.id === v.id);
          if (k) await api.put(`/buchungen/${k.id}/umlage`, { umlagefaehig: !!v.umlagefaehig, nk_art: v.art || '', umlageschluessel: v.schluessel || 'flaeche' });
        }
        setKosten((list) => list.map((k) => {
          const v = res.find((x) => x.id === k.id);
          return v ? { ...k, umlagefaehig: !!v.umlagefaehig, nk_art: v.art || '', umlageschluessel: v.schluessel || 'flaeche' } : k;
        }));
        setMeldung('KI-Einstufung übernommen — bitte prüfen.');
      }
    } catch (e) { setMeldung(e.message); }
    setKiLaedt(false);
  };

  const ladeAbrechnung = () => api.get(`/nk/abrechnung?objekt_id=${objektId}&von=${von}&bis=${bis}`).then(setAbr);

  const summeUmlage = kosten.filter((k) => k.umlagefaehig).reduce((a, k) => a + k.betrag_brutto, 0);

  const weiter = async () => {
    if (schritt === 0) { await ladeKosten(); }
    if (schritt === 1) { await verbrauchSpeichern(); await ladeAbrechnung(); }
    setSchritt((s) => s + 1);
  };
  const zurueck = () => setSchritt((s) => Math.max(0, s - 1));

  const setVoraus = (einheitId, euro) => {
    setAbr((a) => ({
      ...a,
      zeilen: a.zeilen.map((z) => z.einheit_id === einheitId
        ? { ...z, vorauszahlung: euroZuCent(euro), saldo: euroZuCent(euro) - z.kostenanteil, _euro: euro }
        : z),
    }));
  };

  const speichern = async () => {
    const gespeichert = await api.post('/nk/abrechnung', {
      objekt_id: Number(objektId), von, bis, gesamtkosten: abr.gesamtkosten,
      daten: { gesamtflaeche: abr.gesamtflaeche, monate: abr.monate, zeilen: abr.zeilen },
    });
    setGespeichertId(gespeichert.id);
    setMeldung('Abrechnung gespeichert.');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nebenkosten-Assistent</h1>
          <p className="text-slate-500 mt-1">Schritt {schritt + 1} von {SCHRITTE.length} · {SCHRITTE[schritt]}</p>
        </div>
        <Button variant="ghost" onClick={onClose}>Schließen</Button>
      </header>

      <div className="flex items-center gap-1.5">
        {SCHRITTE.map((s, i) => <div key={i} className="flex-1"><div className={`h-1.5 rounded-full ${i <= schritt ? 'bg-emerald-500' : 'bg-slate-200'}`} /></div>)}
      </div>

      {/* Schritt 1 */}
      {schritt === 0 && (
        <Card title="Zeitraum & Objekt">
          <div className="flex flex-wrap gap-4">
            <Field label="Abrechnungsjahr">
              <Select value={jahr} onChange={(e) => setJahr(Number(e.target.value))}>{jahre().map((j) => <option key={j} value={j}>{j}</option>)}</Select>
            </Field>
            <Field label="Objekt">
              <Select value={objektId} onChange={(e) => setObjektId(e.target.value)}>{objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
            </Field>
          </div>
          <Hinweis ton="info" >Zeitraum: {fmtDatum(von)} – {fmtDatum(bis)}. Verteilung nach Wohn-/Nutzfläche (§556a BGB).</Hinweis>
        </Card>
      )}

      {/* Schritt 2 */}
      {schritt === 1 && (
        <Card title="Umlagefähige Kosten bestimmen" subtitle={`Umlagefähig markiert: ${fmtEuro(summeUmlage)}`}
          actions={kiAktiv ? <Button variant="subtle" onClick={kiEinstufen} disabled={kiLaedt}>{kiLaedt ? 'KI prüft …' : '✨ Kosten automatisch einstufen'}</Button> : null}>
          {meldung && <div className="mb-3"><Hinweis ton="ok">{meldung}</Hinweis></div>}
          <Table
            columns={[
              { kopf: 'Datum', zelle: (r) => fmtDatum(r.datum) },
              { kopf: 'Text', zelle: (r) => <span className="text-slate-700">{r.buchungstext || '–'}</span> },
              { kopf: 'Konto', zelle: (r) => r.konto },
              { kopf: 'Betrag', align: 'right', zelle: (r) => fmtEuro(r.betrag_brutto) },
              { kopf: 'Betriebskostenart', zelle: (r) => r.umlagefaehig
                ? <Input value={r.nk_art} onChange={(e) => setUmlage(r, true, e.target.value)} placeholder="z. B. Grundsteuer" />
                : <span className="text-slate-300 text-sm">—</span> },
              { kopf: 'Verteilung', zelle: (r) => r.umlagefaehig
                ? <Select value={r.umlageschluessel} onChange={(e) => setUmlage(r, true, undefined, e.target.value)}>
                    <option value="flaeche">nach Fläche</option>
                    <option value="verbrauch_heiz">Verbrauch Heizung</option>
                    <option value="verbrauch_wasser">Verbrauch Wasser</option>
                    <option value="personen">nach Personen</option>
                    <option value="anteil">Miteigentumsanteil</option>
                  </Select>
                : <span className="text-slate-300 text-sm">—</span> },
              { kopf: 'Umlagefähig', align: 'right', zelle: (r) => (
                <button onClick={() => setUmlage(r, !r.umlagefaehig)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium ${r.umlagefaehig ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {r.umlagefaehig ? 'Ja' : 'Nein'}
                </button>
              ) },
            ]}
            rows={kosten}
            leer="Keine Ausgaben in diesem Zeitraum gebucht."
          />
          {brauchtVerbrauch && (
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-700 mb-1">Zählerstände / Verbrauch je Einheit ({jahr})</div>
              <p className="text-xs text-slate-400 mb-3">Für verbrauchsabhängige Posten. Ohne Werte wird ersatzweise nach Fläche verteilt.</p>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-slate-500 px-1">
                  <div className="col-span-6">Einheit</div><div className="col-span-2">Heizung</div><div className="col-span-2">Wasser (m³)</div><div className="col-span-2">Personen</div>
                </div>
                {einheiten.map((e) => (
                  <div key={e.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 text-sm text-slate-700">{e.bezeichnung}</div>
                    <div className="col-span-2"><Input value={verbrauch[e.id]?.heizung ?? ''} onChange={(ev) => setVerbrauchWert(e.id, 'heizung', ev.target.value)} /></div>
                    <div className="col-span-2"><Input value={verbrauch[e.id]?.wasser ?? ''} onChange={(ev) => setVerbrauchWert(e.id, 'wasser', ev.target.value)} /></div>
                    <div className="col-span-2"><Input value={verbrauch[e.id]?.personen ?? ''} onChange={(ev) => setVerbrauchWert(e.id, 'personen', ev.target.value)} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Schritt 3 */}
      {schritt === 2 && abr && (
        <Card title="Vorauszahlungen je Mieter" subtitle={`Umlagefähige Gesamtkosten: ${fmtEuro(abr.gesamtkosten)} · ${abr.monate} Monate`}>
          <Hinweis ton="info">Vorbefüllt aus der vereinbarten NK-Vorauszahlung × {abr.monate} Monate. Bei Bedarf je Mieter anpassen.</Hinweis>
          <div className="mt-3">
            <Table
              columns={[
                { kopf: 'Mieter / Einheit', zelle: (r) => <span><strong className="text-slate-800">{r.mieter}</strong><span className="text-slate-400"> · {r.einheit}</span></span> },
                { kopf: 'Fläche', align: 'right', zelle: (r) => `${r.flaeche} m² (${r.anteil_prozent} %)` },
                { kopf: 'Kostenanteil', align: 'right', zelle: (r) => fmtEuro(r.kostenanteil) },
                { kopf: 'Vorauszahlung (€)', align: 'right', zelle: (r) => (
                  <div className="w-32 ml-auto"><Input value={r._euro != null ? r._euro : (r.vorauszahlung / 100).toString().replace('.', ',')} onChange={(e) => setVoraus(r.einheit_id, e.target.value)} /></div>
                ) },
              ]}
              rows={abr.zeilen}
            />
          </div>
        </Card>
      )}

      {/* Schritt 4 */}
      {schritt === 3 && abr && (
        <>
          <Card title="Ergebnis der Abrechnung" subtitle={`${fmtDatum(von)} – ${fmtDatum(bis)} · umlagefähig ${fmtEuro(abr.gesamtkosten)}`}>
            <Table
              columns={[
                { kopf: 'Mieter', zelle: (r) => <strong className="text-slate-800">{r.mieter}</strong> },
                { kopf: 'Einheit', zelle: (r) => r.einheit },
                { kopf: 'Kostenanteil', align: 'right', zelle: (r) => fmtEuro(r.kostenanteil) },
                { kopf: 'Vorauszahlung', align: 'right', zelle: (r) => fmtEuro(r.vorauszahlung) },
                { kopf: 'Ergebnis', align: 'right', zelle: (r) => (
                  <Badge color={r.saldo < 0 ? 'red' : 'green'}>{r.saldo < 0 ? 'Nachzahlung ' : 'Guthaben '}{fmtEuro(Math.abs(r.saldo))}</Badge>
                ) },
              ]}
              rows={abr.zeilen}
            />
          </Card>
          {meldung && <Hinweis ton="ok">{meldung}</Hinweis>}
          <div className="flex flex-wrap gap-3">
            {!gespeichertId ? (
              <Button onClick={speichern}>Abrechnung speichern</Button>
            ) : (
              <>
                <a href={`/api/nk/abrechnungen/${gespeichertId}/druck`} target="_blank" rel="noreferrer">
                  <Button>Abrechnungen drucken / als PDF</Button>
                </a>
                <Button variant="ghost" onClick={onClose}>Fertig</Button>
              </>
            )}
          </div>
        </>
      )}

      {/* Navigation */}
      {schritt < 3 && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={zurueck} disabled={schritt === 0}>Zurück</Button>
          <Button onClick={weiter} disabled={schritt === 0 && !objektId}>Weiter</Button>
        </div>
      )}
    </div>
  );
}
