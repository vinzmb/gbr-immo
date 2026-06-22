import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtProzent, fmtDatum, euroZuCent } from '../api.js';
import { Card, Button, Table, Modal, Field, Input, Select, Badge, Hinweis, Erklaerung } from '../ui.jsx';

const jahre = () => { const j = new Date().getFullYear(); return [j, j - 1, j - 2, j - 3, j - 4]; };

export default function Vorsteuer15a() {
  const [jahr, setJahr] = useState(new Date().getFullYear() - 1);
  const [objekte, setObjekte] = useState([]);
  const [liste, setListe] = useState([]);
  const [auswertung, setAuswertung] = useState(null);
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState(null);

  const ladenListe = () => api.get('/berichtigungsobjekte').then(setListe);
  const ladenJahr = () => api.get(`/vst15a/jahr?jahr=${jahr}`).then(setAuswertung);
  useEffect(() => { ladenListe(); api.get('/objekte').then(setObjekte); }, []);
  useEffect(() => { ladenJahr(); }, [jahr, liste]);

  const objektName = (id) => objekte.find((o) => o.id === id)?.name || '–';

  const speichern = async () => {
    const body = {
      bezeichnung: form.bezeichnung,
      objekt_id: form.objekt_id ? Number(form.objekt_id) : null,
      vorsteuer_gesamt: euroZuCent(form.vorsteuer_euro),
      quote_urspruenglich: (Number(String(form.q0_prozent).replace(',', '.')) || 0) / 100,
      beginn: form.beginn || '',
      jahre: Number(form.jahre) || 10,
      notiz: form.notiz || '',
    };
    if (form.id) await api.put(`/berichtigungsobjekte/${form.id}`, body);
    else await api.post('/berichtigungsobjekte', body);
    setForm(null); ladenListe();
  };

  const bearbeiten = (o) => setForm({
    ...o,
    vorsteuer_euro: (o.vorsteuer_gesamt / 100).toString().replace('.', ','),
    q0_prozent: Math.round(o.quote_urspruenglich * 10000) / 100,
  });

  const planZeigen = async (o) => setPlan(await api.get(`/vst15a/plan/${o.id}`));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Vorsteuer-Korrektur (§15a)</h1>
        <p className="text-slate-500 mt-1">Vorsteuerberichtigung bei geänderter Nutzung</p>
      </header>

      <Erklaerung>
        <p>Wenn du beim <strong>Kauf/Bau oder bei großen Maßnahmen</strong> Vorsteuer gezogen hast und sich danach – etwa durch einen Mieterwechsel – die Nutzung von <strong>steuerpflichtig zu steuerfrei</strong> (oder umgekehrt) ändert, musst du einen Teil dieser Vorsteuer anteilig <strong>zurückzahlen</strong> oder bekommst mehr. Das gilt bei Gebäuden <strong>10 Jahre lang</strong>.</p>
        <p>Hinterlege hier einmalig das betroffene <strong>Wirtschaftsgut</strong> (z. B. das Gebäude) mit der damals gezogenen Vorsteuer und der ursprünglichen Quote. Die App berechnet die jährliche Korrektur dann automatisch aus der tatsächlichen Vermietung – inklusive Bagatellgrenzen (§44 UStDV).</p>
      </Erklaerung>

      <Card title="Berichtigung pro Jahr" subtitle="Maßgeblich für die USt-Voranmeldung / Jahreserklärung"
        actions={
          <select value={jahr} onChange={(e) => setJahr(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
            {jahre().map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        }>
        {auswertung && (
          <>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 mb-4">
              <span className="text-sm text-slate-600">{auswertung.summe < 0 ? 'Rückzahlung ans Finanzamt' : auswertung.summe > 0 ? 'Zusätzlicher Vorsteuerabzug' : 'Keine Berichtigung'} {jahr}</span>
              <span className={`text-2xl font-bold tabular-nums ${auswertung.summe < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtEuro(Math.abs(auswertung.summe))}</span>
            </div>
            <Table
              columns={[
                { kopf: 'Wirtschaftsgut', zelle: (r) => <span className="font-medium text-slate-800">{r.bezeichnung}</span> },
                { kopf: 'Quote damals', align: 'right', zelle: (r) => fmtProzent(r.q0) },
                { kopf: `Quote ${jahr}`, align: 'right', zelle: (r) => fmtProzent(r.qn) },
                { kopf: 'Änderung', align: 'right', zelle: (r) => `${r.delta >= 0 ? '+' : ''}${Math.round(r.delta * 10000) / 100} %-Pkt.` },
                { kopf: 'Berichtigung', align: 'right', zelle: (r) => r.anzuwenden ? <span className={r.betrag < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtEuro(r.betrag)}</span> : <Badge color="slate">—</Badge> },
                { kopf: 'Hinweis', zelle: (r) => <span className="text-xs text-slate-500">{r.grund}</span> },
              ]}
              rows={auswertung.zeilen}
              leer="Kein Wirtschaftsgut betrifft dieses Jahr."
            />
          </>
        )}
      </Card>

      <Card title="Wirtschaftsgüter (Berichtigungsobjekte)"
        actions={<Button onClick={() => setForm({ bezeichnung: '', objekt_id: objekte[0]?.id || '', vorsteuer_euro: '', q0_prozent: '', beginn: '', jahre: 10, notiz: '' })}>+ Wirtschaftsgut</Button>}>
        <Table
          columns={[
            { kopf: 'Bezeichnung', zelle: (r) => <span className="font-medium text-slate-800">{r.bezeichnung}</span> },
            { kopf: 'Objekt', zelle: (r) => objektName(r.objekt_id) },
            { kopf: 'Vorsteuer gesamt', align: 'right', zelle: (r) => fmtEuro(r.vorsteuer_gesamt) },
            { kopf: 'Quote damals', align: 'right', zelle: (r) => fmtProzent(r.quote_urspruenglich) },
            { kopf: 'Beginn', zelle: (r) => fmtDatum(r.beginn) },
            { kopf: 'Zeitraum', zelle: (r) => `${r.jahre} J.` },
            { kopf: '', align: 'right', zelle: (r) => (
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => planZeigen(r)}>Plan</Button>
                <Button variant="ghost" onClick={() => bearbeiten(r)}>Bearbeiten</Button>
                <Button variant="danger" onClick={async () => { await api.del(`/berichtigungsobjekte/${r.id}`); ladenListe(); }}>Löschen</Button>
              </div>
            ) },
          ]}
          rows={liste}
          leer="Noch kein Wirtschaftsgut erfasst."
        />
      </Card>

      <Hinweis ton="warn">Die Berechnung unterstützt die Vorbereitung; die §15a-Berichtigung ist mit deinem Steuerberater abzustimmen (z. B. genaue Verwendungsanteile, Maßnahmen-Abgrenzung).</Hinweis>

      {/* Formular */}
      <Modal titel={form?.id ? 'Wirtschaftsgut bearbeiten' : 'Neues Wirtschaftsgut'} offen={!!form} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-4">
            <Field label="Bezeichnung"><Input value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} placeholder="z. B. Gebäude Hauptstraße 1" /></Field>
            <Field label="Objekt" info="Aus diesem Objekt leitet die App die tatsächliche Nutzungsquote je Jahr ab (Flächenstatus der Einheiten).">
              <Select value={form.objekt_id} onChange={(e) => setForm({ ...form, objekt_id: e.target.value })}>
                <option value="">— (ohne automatische Quote) —</option>
                {objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gezogene Vorsteuer gesamt (€)" info="Die gesamte Vorsteuer, die du damals auf Kauf/Bau bzw. die Maßnahme abgezogen hast."><Input value={form.vorsteuer_euro} onChange={(e) => setForm({ ...form, vorsteuer_euro: e.target.value })} placeholder="100.000,00" /></Field>
              <Field label="Ursprüngliche Abzugsquote (%)" info="Mit welchem Prozentsatz wurde die Vorsteuer damals abgezogen? (z. B. 60 %)"><Input value={form.q0_prozent} onChange={(e) => setForm({ ...form, q0_prozent: e.target.value })} placeholder="60" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Erstmalige Verwendung" info="Ab diesem Datum läuft der Berichtigungszeitraum."><Input type="date" value={form.beginn} onChange={(e) => setForm({ ...form, beginn: e.target.value })} /></Field>
              <Field label="Zeitraum (Jahre)" info="Gebäude/Grundstücke 10 Jahre, bewegliche Wirtschaftsgüter 5 Jahre.">
                <Select value={form.jahre} onChange={(e) => setForm({ ...form, jahre: Number(e.target.value) })}>
                  <option value={10}>10 (Gebäude)</option>
                  <option value={5}>5 (beweglich)</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button><Button onClick={speichern}>Speichern</Button></div>
          </div>
        )}
      </Modal>

      {/* Plan über den ganzen Zeitraum */}
      <Modal titel={`Berichtigungsplan: ${plan?.objekt?.bezeichnung || ''}`} offen={!!plan} onClose={() => setPlan(null)} breit>
        {plan && (
          <div className="space-y-3">
            <Hinweis ton="info">Vorsteuer gesamt {fmtEuro(plan.objekt.vorsteuer_gesamt)} · ursprüngliche Quote {fmtProzent(plan.objekt.quote_urspruenglich)} · Jahresanteil {fmtEuro(plan.objekt.vorsteuer_gesamt / plan.objekt.jahre)}</Hinweis>
            <Table
              columns={[
                { kopf: 'Jahr', zelle: (r) => r.jahr },
                { kopf: 'Quote', align: 'right', zelle: (r) => fmtProzent(r.qn) },
                { kopf: 'Änderung', align: 'right', zelle: (r) => `${r.delta >= 0 ? '+' : ''}${Math.round(r.delta * 10000) / 100} %-Pkt.` },
                { kopf: 'Berichtigung', align: 'right', zelle: (r) => r.anzuwenden ? <span className={r.betrag < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtEuro(r.betrag)}</span> : <span className="text-slate-400">—</span> },
                { kopf: 'Hinweis', zelle: (r) => <span className="text-xs text-slate-500">{r.grund}</span> },
              ]}
              rows={plan.zeilen}
            />
            <div className="text-right text-sm text-slate-600">Summe anzuwendender Berichtigungen: <strong className={plan.summe < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtEuro(plan.summe)}</strong></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
