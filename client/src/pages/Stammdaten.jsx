import React, { useEffect, useState } from 'react';
import { api, fmtEuro, euroZuCent } from '../api.js';
import { Card, Button, Table, Modal, Field, Input, Select, Textarea, Badge, Hinweis } from '../ui.jsx';

const TABS = [
  { id: 'objekte', label: 'Objekte' },
  { id: 'einheiten', label: 'Mieteinheiten' },
  { id: 'mieter', label: 'Mieter' },
  { id: 'vertraege', label: 'Mietverträge' },
];

const USTLABEL = { '19': '19 % (Option §9)', '7': '7 % (ermäßigt)', frei: 'steuerfrei (§4 Nr.12)' };
const USTFARBE = { '19': 'green', '7': 'blue', frei: 'amber' };

export default function Stammdaten() {
  const [tab, setTab] = useState('objekte');
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Objekte &amp; Mieter</h1>
        <p className="text-slate-500 mt-1">Stammdaten: Gebäude, Flächen, Mieter und Verträge</p>
      </header>
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'objekte' && <Objekte />}
      {tab === 'einheiten' && <Einheiten />}
      {tab === 'mieter' && <Mieter />}
      {tab === 'vertraege' && <Vertraege />}
    </div>
  );
}

function useListe(pfad) {
  const [liste, setListe] = useState([]);
  const laden = () => api.get(pfad).then(setListe).catch(() => {});
  useEffect(() => { laden(); }, [pfad]);
  return [liste, laden];
}

// ---------- Objekte ----------
function Objekte() {
  const [liste, laden] = useListe('/objekte');
  const [form, setForm] = useState(null);

  const speichern = async () => {
    const body = { ...form, gesamtflaeche: Number(form.gesamtflaeche) || 0 };
    if (form.id) await api.put(`/objekte/${form.id}`, body);
    else await api.post('/objekte', body);
    setForm(null);
    laden();
  };

  return (
    <Card title="Objekte" subtitle="Gebäude / Grundstücke" actions={<Button onClick={() => setForm({ name: '', gesamtflaeche: '' })}>+ Objekt</Button>}>
      <Table
        columns={[
          { kopf: 'Name', zelle: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
          { kopf: 'Adresse', zelle: (r) => [r.strasse, [r.plz, r.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–' },
          { kopf: 'Gesamtfläche', align: 'right', zelle: (r) => `${r.gesamtflaeche} m²` },
          { kopf: '', align: 'right', zelle: (r) => <Button variant="ghost" onClick={() => setForm(r)}>Bearbeiten</Button> },
        ]}
        rows={liste}
        leer="Noch kein Objekt angelegt."
      />
      <Modal titel={form?.id ? 'Objekt bearbeiten' : 'Neues Objekt'} offen={!!form} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-4">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Geschäftshaus Hauptstraße 1" /></Field>
            <Field label="Straße"><Input value={form.strasse || ''} onChange={(e) => setForm({ ...form, strasse: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PLZ"><Input value={form.plz || ''} onChange={(e) => setForm({ ...form, plz: e.target.value })} /></Field>
              <Field label="Ort"><Input value={form.ort || ''} onChange={(e) => setForm({ ...form, ort: e.target.value })} /></Field>
            </div>
            <Field label="Gesamtfläche (m²)" hint="Wird auch aus den Einheiten ersichtlich; hier als Soll-Wert.">
              <Input type="number" value={form.gesamtflaeche} onChange={(e) => setForm({ ...form, gesamtflaeche: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button><Button onClick={speichern}>Speichern</Button></div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ---------- Einheiten ----------
function Einheiten() {
  const [objekte] = useListe('/objekte');
  const [liste, laden] = useListe('/einheiten');
  const [form, setForm] = useState(null);
  const objektName = (id) => objekte.find((o) => o.id === id)?.name || '–';

  const speichern = async () => {
    const body = { ...form, flaeche: Number(form.flaeche) || 0, objekt_id: Number(form.objekt_id), miteigentumsanteil: Number(form.miteigentumsanteil) || 0 };
    if (form.id) await api.put(`/einheiten/${form.id}`, body);
    else await api.post('/einheiten', body);
    setForm(null);
    laden();
  };

  return (
    <div className="space-y-4">
      {objekte.length === 0 && <Hinweis ton="warn">Lege zuerst ein Objekt an, um Einheiten zuzuordnen.</Hinweis>}
      <Card title="Mieteinheiten" subtitle="Fläche und USt-Status je Einheit"
        actions={<Button disabled={objekte.length === 0} onClick={() => setForm({ objekt_id: objekte[0]?.id, bezeichnung: '', flaeche: '', nutzungsart: 'gewerbe', ust_status: '19', miteigentumsanteil: '' })}>+ Einheit</Button>}>
        <Table
          columns={[
            { kopf: 'Bezeichnung', zelle: (r) => <span className="font-medium text-slate-800">{r.bezeichnung}</span> },
            { kopf: 'Objekt', zelle: (r) => objektName(r.objekt_id) },
            { kopf: 'Nutzung', zelle: (r) => (r.nutzungsart === 'gewerbe' ? 'Gewerbe' : 'Wohnen') },
            { kopf: 'USt-Status', zelle: (r) => <Badge color={USTFARBE[r.ust_status]}>{USTLABEL[r.ust_status]}</Badge> },
            { kopf: 'Fläche', align: 'right', zelle: (r) => `${r.flaeche} m²` },
            { kopf: '', align: 'right', zelle: (r) => <Button variant="ghost" onClick={() => setForm(r)}>Bearbeiten</Button> },
          ]}
          rows={liste}
          leer="Noch keine Einheit angelegt."
        />
      </Card>
      <Modal titel={form?.id ? 'Einheit bearbeiten' : 'Neue Einheit'} offen={!!form} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-4">
            <Field label="Objekt">
              <Select value={form.objekt_id} onChange={(e) => setForm({ ...form, objekt_id: e.target.value })}>
                {objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="Bezeichnung"><Input value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} placeholder="z. B. Ladenlokal EG" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fläche (m²)"><Input type="number" value={form.flaeche} onChange={(e) => setForm({ ...form, flaeche: e.target.value })} /></Field>
              <Field label="Nutzungsart">
                <Select value={form.nutzungsart} onChange={(e) => setForm({ ...form, nutzungsart: e.target.value })}>
                  <option value="gewerbe">Gewerbe</option>
                  <option value="wohnen">Wohnen</option>
                </Select>
              </Field>
            </div>
            <Field label="Vermietest du mit oder ohne Umsatzsteuer?" info="Vermietest du an ein Gewerbe mit Umsatzsteuer (z. B. Laden), wähle 19 %. Vermietest du ohne (z. B. Wohnung, Arztpraxis), wähle „ohne“. Das entscheidet, ob du Vorsteuer aus Kosten dieser Einheit zurückbekommst.">
              <Select value={form.ust_status} onChange={(e) => setForm({ ...form, ust_status: e.target.value })}>
                <option value="19">mit 19 % Umsatzsteuer (z. B. Gewerbe/Laden)</option>
                <option value="7">mit 7 % Umsatzsteuer (ermäßigt)</option>
                <option value="frei">ohne Umsatzsteuer (z. B. Wohnung, Arztpraxis)</option>
              </Select>
            </Field>
            <Field label="Miteigentumsanteil (optional)" hint="Nur nötig, wenn nach Anteil aufgeteilt werden soll.">
              <Input type="number" value={form.miteigentumsanteil} onChange={(e) => setForm({ ...form, miteigentumsanteil: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button><Button onClick={speichern}>Speichern</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Mieter ----------
function Mieter() {
  const [liste, laden] = useListe('/mieter');
  const [form, setForm] = useState(null);
  const speichern = async () => {
    if (form.id) await api.put(`/mieter/${form.id}`, form);
    else await api.post('/mieter', form);
    setForm(null);
    laden();
  };
  return (
    <Card title="Mieter" actions={<Button onClick={() => setForm({ name: '' })}>+ Mieter</Button>}>
      <Table
        columns={[
          { kopf: 'Name', zelle: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
          { kopf: 'Ansprechpartner', zelle: (r) => r.ansprechpartner || '–' },
          { kopf: 'E-Mail', zelle: (r) => r.email || '–' },
          { kopf: 'Telefon', zelle: (r) => r.telefon || '–' },
          { kopf: '', align: 'right', zelle: (r) => <Button variant="ghost" onClick={() => setForm(r)}>Bearbeiten</Button> },
        ]}
        rows={liste}
        leer="Noch kein Mieter angelegt."
      />
      <Modal titel={form?.id ? 'Mieter bearbeiten' : 'Neuer Mieter'} offen={!!form} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-4">
            <Field label="Name / Firma"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Ansprechpartner"><Input value={form.ansprechpartner || ''} onChange={(e) => setForm({ ...form, ansprechpartner: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-Mail"><Input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Telefon"><Input value={form.telefon || ''} onChange={(e) => setForm({ ...form, telefon: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button><Button onClick={speichern}>Speichern</Button></div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ---------- Verträge ----------
function Vertraege() {
  const [einheiten] = useListe('/einheiten');
  const [mieter] = useListe('/mieter');
  const [liste, laden] = useListe('/mietvertraege');
  const [form, setForm] = useState(null);
  const einheitName = (id) => einheiten.find((e) => e.id === id)?.bezeichnung || '–';
  const mieterName = (id) => mieter.find((m) => m.id === id)?.name || '–';

  const speichern = async () => {
    const body = {
      einheit_id: Number(form.einheit_id), mieter_id: Number(form.mieter_id),
      nettomiete: euroZuCent(form.nettomiete_euro), ust_satz: form.ust_satz,
      beginn: form.beginn || '', ende: form.ende || '', kaution: euroZuCent(form.kaution_euro),
      nk_vorauszahlung: euroZuCent(form.nk_vorauszahlung_euro), aktiv: 1,
    };
    if (form.id) await api.put(`/mietvertraege/${form.id}`, body);
    else await api.post('/mietvertraege', body);
    setForm(null);
    laden();
  };

  const bereit = einheiten.length && mieter.length;
  return (
    <div className="space-y-4">
      {!bereit && <Hinweis ton="warn">Lege zuerst Einheiten und Mieter an, um Verträge zu erfassen.</Hinweis>}
      <Card title="Mietverträge" subtitle="Verknüpft Einheit, Mieter und Nettomiete"
        actions={<Button disabled={!bereit} onClick={() => setForm({ einheit_id: einheiten[0]?.id, mieter_id: mieter[0]?.id, nettomiete_euro: '', ust_satz: '19', kaution_euro: '', nk_vorauszahlung_euro: '' })}>+ Vertrag</Button>}>
        <Table
          columns={[
            { kopf: 'Einheit', zelle: (r) => <span className="font-medium text-slate-800">{einheitName(r.einheit_id)}</span> },
            { kopf: 'Mieter', zelle: (r) => mieterName(r.mieter_id) },
            { kopf: 'USt', zelle: (r) => <Badge color={USTFARBE[r.ust_satz]}>{USTLABEL[r.ust_satz]}</Badge> },
            { kopf: 'Nettomiete/Monat', align: 'right', zelle: (r) => fmtEuro(r.nettomiete) },
            { kopf: '', align: 'right', zelle: (r) => <Button variant="ghost" onClick={() => setForm({ ...r, nettomiete_euro: (r.nettomiete / 100).toString().replace('.', ','), kaution_euro: (r.kaution / 100).toString().replace('.', ','), nk_vorauszahlung_euro: ((r.nk_vorauszahlung || 0) / 100).toString().replace('.', ',') })}>Bearbeiten</Button> },
          ]}
          rows={liste}
          leer="Noch kein Vertrag angelegt."
        />
      </Card>
      <Modal titel={form?.id ? 'Vertrag bearbeiten' : 'Neuer Mietvertrag'} offen={!!form} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Einheit"><Select value={form.einheit_id} onChange={(e) => setForm({ ...form, einheit_id: e.target.value })}>{einheiten.map((x) => <option key={x.id} value={x.id}>{x.bezeichnung}</option>)}</Select></Field>
              <Field label="Mieter"><Select value={form.mieter_id} onChange={(e) => setForm({ ...form, mieter_id: e.target.value })}>{mieter.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nettomiete / Monat (€)"><Input value={form.nettomiete_euro} onChange={(e) => setForm({ ...form, nettomiete_euro: e.target.value })} placeholder="1.500,00" /></Field>
              <Field label="USt-Satz">
                <Select value={form.ust_satz} onChange={(e) => setForm({ ...form, ust_satz: e.target.value })}>
                  <option value="19">19 %</option><option value="7">7 %</option><option value="frei">steuerfrei</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Beginn"><Input type="date" value={form.beginn || ''} onChange={(e) => setForm({ ...form, beginn: e.target.value })} /></Field>
              <Field label="Ende (optional)"><Input type="date" value={form.ende || ''} onChange={(e) => setForm({ ...form, ende: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kaution (€)"><Input value={form.kaution_euro} onChange={(e) => setForm({ ...form, kaution_euro: e.target.value })} /></Field>
              <Field label="Nebenkosten-Vorauszahlung / Monat (€)" hint="Für die NK-Abrechnung"><Input value={form.nk_vorauszahlung_euro} onChange={(e) => setForm({ ...form, nk_vorauszahlung_euro: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button><Button onClick={speichern}>Speichern</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
