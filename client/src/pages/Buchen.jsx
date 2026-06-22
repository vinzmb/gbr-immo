import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtDatum, euroZuCent, fmtProzent } from '../api.js';
import { Card, Button, Table, Field, Input, Select, Badge, Hinweis, Modal, Erklaerung, InfoTip } from '../ui.jsx';

const heute = () => new Date().toISOString().slice(0, 10);
const MODUS = {
  direkt: 'Direkt einer Einheit',
  flaeche: 'Flächenschlüssel (Gemeinkosten)',
  manuell: 'Manuell auf mehrere Mieter/Einheiten',
  umsatz: 'Umsatzschlüssel',
  anteil: 'Miteigentumsanteil',
  keine: 'Keine Aufteilung (voll abziehbar)',
};
const USTKURZ = { '19': '19 %', '7': '7 %', frei: 'steuerfrei' };

export default function Buchen() {
  const [objekte, setObjekte] = useState([]);
  const [einheiten, setEinheiten] = useState([]);
  const [konten, setKonten] = useState([]);
  const [buchungen, setBuchungen] = useState([]);
  const [vertraege, setVertraege] = useState([]);
  const [mieter, setMieter] = useState([]);
  const [vorschau, setVorschau] = useState(null);
  const [meldung, setMeldung] = useState('');
  const [soll, setSoll] = useState(null);

  const leer = {
    typ: 'ausgabe', datum: heute(), betrag_euro: '', ust_satz: '19', konto: '',
    aufteilung_modus: 'flaeche', objekt_id: '', einheit_id: '', buchungstext: '', manuell: {},
  };
  const [form, setForm] = useState(leer);

  const ladeBuchungen = () => api.get('/buchungen').then(setBuchungen);
  useEffect(() => {
    api.get('/objekte').then(setObjekte);
    api.get('/einheiten').then(setEinheiten);
    api.get('/konten').then(setKonten);
    api.get('/mietvertraege').then(setVertraege);
    api.get('/mieter').then(setMieter);
    ladeBuchungen();
  }, []);

  const mieterFuerEinheit = (einheitId) => {
    const v = vertraege.find((x) => x.einheit_id === einheitId && x.aktiv);
    return v ? mieter.find((m) => m.id === v.mieter_id)?.name : null;
  };
  const manuelleSplits = () =>
    Object.entries(form.manuell || {})
      .filter(([, g]) => Number(String(g).replace(',', '.')) > 0)
      .map(([einheit_id, gewicht]) => ({ einheit_id, gewicht: Number(String(gewicht).replace(',', '.')) }));

  // Vorschau aktualisieren
  useEffect(() => {
    const cent = euroZuCent(form.betrag_euro);
    if (!cent) { setVorschau(null); return; }
    const body = {
      typ: form.typ, datum: form.datum, betrag_brutto: cent, ust_satz: form.ust_satz,
      aufteilung_modus: form.aufteilung_modus, objekt_id: form.objekt_id ? Number(form.objekt_id) : null,
      einheit_id: form.einheit_id ? Number(form.einheit_id) : null,
      manuelle_splits: form.aufteilung_modus === 'manuell' ? manuelleSplits() : null,
    };
    api.post('/buchungen/vorschau', body).then(setVorschau).catch(() => setVorschau(null));
  }, [form.betrag_euro, form.ust_satz, form.aufteilung_modus, form.objekt_id, form.einheit_id, form.typ, form.datum, JSON.stringify(form.manuell)]);

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
      manuelle_splits: form.aufteilung_modus === 'manuell' ? manuelleSplits() : null,
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
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Buchen</h1>
          <p className="text-slate-500 mt-1">Einnahmen und Ausgaben erfassen — mit anteiliger Vorsteuer-Aufteilung</p>
        </div>
        <Button variant="ghost" onClick={() => setSoll({ jahr: new Date().getFullYear(), modus: 'jahr', monat: new Date().getMonth() + 1, ergebnis: null })}>⟳ Sollstellungen erzeugen</Button>
      </header>

      <Erklaerung>
        <p>Hier hältst du fest, was rein- und rausgeht. <strong>Einnahme</strong> = du bekommst Geld (z. B. Miete), <strong>Ausgabe</strong> = du zahlst etwas (z. B. eine Handwerkerrechnung).</p>
        <p>Du gibst nur das <strong>Datum</strong>, den <strong>Brutto-Betrag</strong> (so wie er auf der Rechnung steht) und kurz an, worum es geht. Den Rest – Steueranteil und Verteilung – rechnet die App automatisch und zeigt es rechts in der Vorschau.</p>
      </Erklaerung>

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
              <Field label="Bruttobetrag (€)" info="Der volle Betrag inklusive Mehrwertsteuer – genau so, wie er auf der Rechnung steht."><Input value={form.betrag_euro} onChange={(e) => setForm({ ...form, betrag_euro: e.target.value })} placeholder="1.190,00" /></Field>
            </div>
            <Field label="Mehrwertsteuer-Satz" info="Wie viel Steuer im Betrag steckt. Im Zweifel 19 % – das ist der Normalfall. „steuerfrei“ z. B. bei Wohnungsvermietung.">
              <Select value={form.ust_satz} onChange={(e) => setForm({ ...form, ust_satz: e.target.value })}>
                <option value="19">19 % (Normalfall)</option><option value="7">7 % (ermäßigt)</option><option value="frei">steuerfrei / ohne</option>
              </Select>
            </Field>

            {form.typ === 'ausgabe' && (
              <>
                <Field label="Wie aufteilen?" info="Betrifft die Kosten nur eine Einheit → „Direkt“. Allgemeine Kosten fürs ganze Haus (Dach, Verwaltung) → „nach Fläche“. Eine Rechnung für mehrere Mieter → „Manuell“.">
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
                {form.aufteilung_modus === 'manuell' && (
                  <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="text-sm text-slate-600">Anteil je Einheit / Mieter (%) — leere Felder zählen als 0</div>
                    {einheiten.map((e2) => (
                      <div key={e2.id} className="flex items-center gap-3">
                        <div className="flex-1 text-sm">
                          <span className="font-medium text-slate-800">{e2.bezeichnung}</span>
                          <span className="text-slate-400"> · {mieterFuerEinheit(e2.id) || 'kein Mieter'} · {USTKURZ[e2.ust_status]}</span>
                        </div>
                        <div className="w-24">
                          <Input value={form.manuell?.[e2.id] || ''} onChange={(ev) => setForm({ ...form, manuell: { ...form.manuell, [e2.id]: ev.target.value } })} placeholder="%" />
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-slate-400">Die Summe wird automatisch normiert (z. B. 70 / 30 oder 1 / 1 = 50 / 50).</div>
                  </div>
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
            <Field label="Wofür war das? (kurze Notiz)"><Input value={form.buchungstext} onChange={(e) => setForm({ ...form, buchungstext: e.target.value })} placeholder="z. B. Dachreparatur, Miete Laden …" /></Field>
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500 select-none">Buchhaltungs-Konto (optional – wird sonst automatisch gewählt)</summary>
              <div className="mt-2">
                <Select value={form.konto} onChange={(e) => setForm({ ...form, konto: e.target.value })}>
                  <option value="">Automatisch wählen</option>
                  {kontenGefiltert.map((k) => <option key={k.id} value={k.nummer}>{k.nummer} · {k.bezeichnung}</option>)}
                </Select>
              </div>
            </details>
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
                <KZ label="Netto" info="Der Betrag ohne Steuer." wert={fmtEuro(vorschau.netto)} />
                <KZ label={form.typ === 'einnahme' ? 'Umsatzsteuer' : 'Vorsteuer enthalten'} info={form.typ === 'einnahme' ? 'Diese Steuer gehört dem Finanzamt.' : 'Die Mehrwertsteuer in dieser Ausgabe.'} wert={fmtEuro(vorschau.ustGesamt)} />
                <KZ label="Abziehbar" info="So viel der Steuer holst du dir vom Finanzamt zurück." wert={fmtEuro(vorschau.vorsteuerAbziehbar)} ton="green" />
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

      <Modal titel="Sollstellungen automatisch erzeugen" offen={!!soll} onClose={() => setSoll(null)}>
        {soll && (
          <div className="space-y-4">
            <Hinweis ton="info">Erzeugt für alle aktiven Mietverträge die Miet- und NK-Vorauszahlungs-Einnahmen (je Monat). Bereits vorhandene Sollstellungen werden übersprungen.</Hinweis>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jahr"><Input type="number" value={soll.jahr} onChange={(e) => setSoll({ ...soll, jahr: Number(e.target.value) })} /></Field>
              <Field label="Umfang">
                <Select value={soll.modus} onChange={(e) => setSoll({ ...soll, modus: e.target.value })}>
                  <option value="jahr">ganzes Jahr (12 Monate)</option>
                  <option value="monat">einzelner Monat</option>
                </Select>
              </Field>
            </div>
            {soll.modus === 'monat' && (
              <Field label="Monat"><Input type="number" min="1" max="12" value={soll.monat} onChange={(e) => setSoll({ ...soll, monat: Number(e.target.value) })} /></Field>
            )}
            {soll.ergebnis && <Hinweis ton="ok">{soll.ergebnis.erzeugt} Buchungen erzeugt · {soll.ergebnis.uebersprungen} übersprungen.</Hinweis>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setSoll(null)}>Schließen</Button>
              <Button onClick={async () => {
                const r = await api.post('/sollstellung/erzeugen', { jahr: soll.jahr, modus: soll.modus, monat: soll.monat });
                setSoll({ ...soll, ergebnis: r });
                ladeBuchungen();
              }}>Erzeugen</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function KZ({ label, wert, ton = 'slate', info }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-500 flex items-center">{label}{info && <InfoTip text={info} />}</div>
      <div className={`text-lg font-semibold tabular-nums ${ton === 'green' ? 'text-emerald-600' : 'text-slate-800'}`}>{wert}</div>
    </div>
  );
}
