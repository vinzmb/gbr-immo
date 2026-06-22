import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtDatum, euroZuCent, fmtProzent } from '../api.js';
import { Card, Button, Table, Field, Input, Select, Badge, Hinweis } from '../ui.jsx';

const heute = () => new Date().toISOString().slice(0, 10);
const MODUS = {
  direkt: 'Direkt einer Einheit',
  flaeche: 'Flächenschlüssel (Gemeinkosten)',
  umsatz: 'Umsatzschlüssel',
  anteil: 'Miteigentumsanteil',
  keine: 'Keine Aufteilung (voll abziehbar)',
};

export default function Buchen() {
  const [objekte, setObjekte] = useState([]);
  const [einheiten, setEinheiten] = useState([]);
  const [konten, setKonten] = useState([]);
  const [buchungen, setBuchungen] = useState([]);
  const [vorschau, setVorschau] = useState(null);
  const [meldung, setMeldung] = useState('');

  const leer = {
    typ: 'ausgabe', datum: heute(), betrag_euro: '', ust_satz: '19', konto: '',
    aufteilung_modus: 'flaeche', objekt_id: '', einheit_id: '', buchungstext: '',
  };
  const [form, setForm] = useState(leer);

  const ladeBuchungen = () => api.get('/buchungen').then(setBuchungen);
  useEffect(() => {
    api.get('/objekte').then(setObjekte);
    api.get('/einheiten').then(setEinheiten);
    api.get('/konten').then(setKonten);
    ladeBuchungen();
  }, []);

  // Vorschau aktualisieren
  useEffect(() => {
    const cent = euroZuCent(form.betrag_euro);
    if (!cent) { setVorschau(null); return; }
    const body = {
      typ: form.typ, betrag_brutto: cent, ust_satz: form.ust_satz,
      aufteilung_modus: form.aufteilung_modus, objekt_id: form.objekt_id ? Number(form.objekt_id) : null,
      einheit_id: form.einheit_id ? Number(form.einheit_id) : null,
    };
    api.post('/buchungen/vorschau', body).then(setVorschau).catch(() => setVorschau(null));
  }, [form.betrag_euro, form.ust_satz, form.aufteilung_modus, form.objekt_id, form.einheit_id, form.typ]);

  const einheitenGefiltert = form.objekt_id ? einheiten.filter((e) => e.objekt_id === Number(form.objekt_id)) : einheiten;
  const kontenGefiltert = konten.filter((k) => (form.typ === 'einnahme' ? k.art === 'erloes' : k.art === 'aufwand'));
  const einheitName = (id) => einheiten.find((e) => e.id === id)?.bezeichnung || '–';

  const speichern = async () => {
    const cent = euroZuCent(form.betrag_euro);
    if (!cent) { setMeldung('Bitte einen Betrag eingeben.'); return; }
    await api.post('/buchungen', {
      typ: form.typ, datum: form.datum, betrag_brutto: cent, ust_satz: form.ust_satz,
      konto: form.konto || (kontenGefiltert[0]?.nummer ?? ''), gegenkonto: '1800',
      aufteilung_modus: form.aufteilung_modus,
      objekt_id: form.objekt_id ? Number(form.objekt_id) : null,
      einheit_id: form.einheit_id ? Number(form.einheit_id) : null,
      buchungstext: form.buchungstext,
    });
    setForm({ ...leer, typ: form.typ });
    setMeldung('Buchung gespeichert.');
    ladeBuchungen();
    setTimeout(() => setMeldung(''), 2500);
  };

  const storno = async (id) => { await api.post(`/buchungen/${id}/storno`, {}); ladeBuchungen(); };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Buchen</h1>
        <p className="text-slate-500 mt-1">Einnahmen und Ausgaben erfassen — mit anteiliger Vorsteuer-Aufteilung</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Neue Buchung">
          <div className="space-y-4">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {['ausgabe', 'einnahme'].map((t) => (
                <button key={t} onClick={() => setForm({ ...form, typ: t, aufteilung_modus: t === 'einnahme' ? 'direkt' : 'flaeche', konto: '' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${form.typ === t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                  {t === 'ausgabe' ? 'Ausgabe (Kosten)' : 'Einnahme (Erlös)'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Datum"><Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></Field>
              <Field label="Bruttobetrag (€)"><Input value={form.betrag_euro} onChange={(e) => setForm({ ...form, betrag_euro: e.target.value })} placeholder="1.190,00" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="USt-Satz">
                <Select value={form.ust_satz} onChange={(e) => setForm({ ...form, ust_satz: e.target.value })}>
                  <option value="19">19 %</option><option value="7">7 %</option><option value="frei">steuerfrei</option>
                </Select>
              </Field>
              <Field label="Konto (SKR04)">
                <Select value={form.konto} onChange={(e) => setForm({ ...form, konto: e.target.value })}>
                  <option value="">— wählen —</option>
                  {kontenGefiltert.map((k) => <option key={k.id} value={k.nummer}>{k.nummer} · {k.bezeichnung}</option>)}
                </Select>
              </Field>
            </div>

            {form.typ === 'ausgabe' && (
              <>
                <Field label="Aufteilung">
                  <Select value={form.aufteilung_modus} onChange={(e) => setForm({ ...form, aufteilung_modus: e.target.value })}>
                    {Object.entries(MODUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                {(form.aufteilung_modus === 'flaeche' || form.aufteilung_modus === 'umsatz' || form.aufteilung_modus === 'anteil') && (
                  <Field label="Objekt (für Schlüssel)" hint="Leer = alle Einheiten aller Objekte.">
                    <Select value={form.objekt_id} onChange={(e) => setForm({ ...form, objekt_id: e.target.value })}>
                      <option value="">Alle Objekte</option>
                      {objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </Select>
                  </Field>
                )}
              </>
            )}
            {(form.aufteilung_modus === 'direkt' || form.typ === 'einnahme') && (
              <Field label="Einheit">
                <Select value={form.einheit_id} onChange={(e) => setForm({ ...form, einheit_id: e.target.value })}>
                  <option value="">— wählen —</option>
                  {einheitenGefiltert.map((e2) => <option key={e2.id} value={e2.id}>{e2.bezeichnung}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Buchungstext"><Input value={form.buchungstext} onChange={(e) => setForm({ ...form, buchungstext: e.target.value })} placeholder="z. B. Dachreparatur" /></Field>
            {meldung && <Hinweis ton="ok">{meldung}</Hinweis>}
            <div className="flex justify-end"><Button onClick={speichern}>Buchung speichern</Button></div>
          </div>
        </Card>

        <Card title="Vorschau & Aufteilung" subtitle="Live-Berechnung vor dem Speichern">
          {!vorschau ? (
            <div className="text-slate-400 text-sm py-8 text-center">Betrag eingeben, um die Aufteilung zu sehen.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <KZ label="Netto" wert={fmtEuro(vorschau.netto)} />
                <KZ label={form.typ === 'einnahme' ? 'Umsatzsteuer' : 'Vorsteuer enthalten'} wert={fmtEuro(vorschau.ustGesamt)} />
                <KZ label="Abziehbar" wert={fmtEuro(vorschau.vorsteuerAbziehbar)} ton="green" />
              </div>
              {form.typ === 'ausgabe' && vorschau.quote != null && (form.aufteilung_modus === 'flaeche') && (
                <Hinweis ton="info">Abziehbare Vorsteuerquote nach Fläche: <strong>{fmtProzent(vorschau.quote)}</strong></Hinweis>
              )}
              {vorschau.splits?.length > 0 && (
                <Table
                  columns={[
                    { kopf: 'Einheit', zelle: (r) => einheitName(r.einheit_id) },
                    { kopf: 'Anteil', align: 'right', zelle: (r) => `${r.anteil_prozent} %` },
                    { kopf: 'Brutto', align: 'right', zelle: (r) => fmtEuro(r.betrag_brutto) },
                    { kopf: 'VSt abziehbar', align: 'right', zelle: (r) => fmtEuro(r.vorsteuer_abziehbar) },
                  ]}
                  rows={vorschau.splits}
                />
              )}
              {form.typ === 'ausgabe' && vorschau.vorsteuerAbziehbar === 0 && vorschau.ustGesamt > 0 && (
                <Hinweis ton="warn">Keine Vorsteuer abziehbar — Kosten entfallen auf steuerfrei vermietete Flächen oder es fehlt ein gültiger Schlüssel.</Hinweis>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title="Buchungen" subtitle="zuletzt erfasst">
        <Table
          columns={[
            { kopf: 'Datum', zelle: (r) => fmtDatum(r.datum) },
            { kopf: 'Text', zelle: (r) => <span className={r.storniert ? 'line-through text-slate-400' : ''}>{r.buchungstext || '–'}</span> },
            { kopf: 'Typ', zelle: (r) => <Badge color={r.typ === 'einnahme' ? 'green' : 'slate'}>{r.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe'}</Badge> },
            { kopf: 'Konto', zelle: (r) => r.konto },
            { kopf: 'Periode', zelle: (r) => r.periode },
            { kopf: 'Brutto', align: 'right', zelle: (r) => fmtEuro(r.betrag_brutto) },
            { kopf: 'VSt abz.', align: 'right', zelle: (r) => (r.typ === 'ausgabe' ? fmtEuro(r.vorsteuer_abziehbar) : '–') },
            { kopf: '', align: 'right', zelle: (r) => (r.storniert ? <Badge color="red">storniert</Badge> : <Button variant="danger" onClick={() => storno(r.id)}>Storno</Button>) },
          ]}
          rows={buchungen}
          leer="Noch keine Buchung erfasst."
        />
      </Card>
    </div>
  );
}

function KZ({ label, wert, ton = 'slate' }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${ton === 'green' ? 'text-emerald-600' : 'text-slate-800'}`}>{wert}</div>
    </div>
  );
}
