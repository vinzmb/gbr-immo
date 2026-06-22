import React, { useEffect, useState, useMemo } from 'react';
import { fmtDatum, api } from '../api.js';
import { Card, Button, Table, Modal, Field, Input, Select, Textarea, Badge } from '../ui.jsx';

const KATEGORIEN = ['Mietvertrag', 'Rechnung', 'Grundbuch', 'Versicherung', 'Kaufvertrag', 'Darlehen', 'Nebenkostenabrechnung', 'Korrespondenz', 'sonstiges'];
const KATFARBE = { Mietvertrag: 'green', Rechnung: 'blue', Versicherung: 'amber', Grundbuch: 'slate', Darlehen: 'red' };

const heute = () => new Date().toISOString().slice(0, 10);

export default function Dokumente() {
  const [liste, setListe] = useState([]);
  const [objekte, setObjekte] = useState([]);
  const [mieter, setMieter] = useState([]);
  const [einheiten, setEinheiten] = useState([]);
  const [form, setForm] = useState(null);
  const [suche, setSuche] = useState('');
  const [katFilter, setKatFilter] = useState('');

  const laden = () => api.get('/dokumente').then(setListe);
  useEffect(() => {
    laden();
    api.get('/objekte').then(setObjekte);
    api.get('/mieter').then(setMieter);
    api.get('/einheiten').then(setEinheiten);
  }, []);

  const objektName = (id) => objekte.find((o) => o.id === id)?.name;
  const mieterName = (id) => mieter.find((m) => m.id === id)?.name;
  const einheitName = (id) => einheiten.find((e) => e.id === id)?.bezeichnung;

  const gefiltert = useMemo(() => {
    const q = suche.toLowerCase();
    return liste.filter((d) => {
      if (katFilter && d.kategorie !== katFilter) return false;
      if (!q) return true;
      return [d.titel, d.kategorie, d.notiz, objektName(d.objekt_id), mieterName(d.mieter_id)]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [liste, suche, katFilter, objekte, mieter]);

  const dateiLesen = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  const speichern = async () => {
    const body = {
      titel: form.titel, kategorie: form.kategorie, datum: form.datum || '',
      objekt_id: form.objekt_id ? Number(form.objekt_id) : null,
      mieter_id: form.mieter_id ? Number(form.mieter_id) : null,
      einheit_id: form.einheit_id ? Number(form.einheit_id) : null,
      notiz: form.notiz,
    };
    if (form.datei) { body.datei_base64 = await dateiLesen(form.datei); body.datei_name = form.datei.name; }
    await api.post('/dokumente', body);
    setForm(null); laden();
  };

  const verknuepfung = (d) => {
    const teile = [objektName(d.objekt_id), einheitName(d.einheit_id), mieterName(d.mieter_id)].filter(Boolean);
    return teile.length ? teile.join(' · ') : '–';
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dokumente</h1>
          <p className="text-slate-500 mt-1">Mietverträge, Rechnungen, Grundbuch, Versicherungen &amp; weitere Unterlagen</p>
        </div>
        <Button onClick={() => setForm({ titel: '', kategorie: 'Mietvertrag', datum: heute(), objekt_id: '', mieter_id: '', einheit_id: '', notiz: '', datei: null })}>+ Dokument</Button>
      </header>

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex-1 min-w-48">
            <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen (Titel, Mieter, Notiz …)" />
          </div>
          <Select value={katFilter} onChange={(e) => setKatFilter(e.target.value)}>
            <option value="">Alle Kategorien</option>
            {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
          </Select>
        </div>
        <Table
          columns={[
            { kopf: 'Titel', zelle: (r) => <span className="font-medium text-slate-800">{r.titel}</span> },
            { kopf: 'Kategorie', zelle: (r) => <Badge color={KATFARBE[r.kategorie] || 'slate'}>{r.kategorie}</Badge> },
            { kopf: 'Verknüpfung', zelle: (r) => <span className="text-slate-600">{verknuepfung(r)}</span> },
            { kopf: 'Datum', zelle: (r) => fmtDatum(r.datum) || fmtDatum(r.erstellt_am) },
            { kopf: '', align: 'right', zelle: (r) => (
              <div className="flex gap-3 justify-end items-center">
                {r.datei_pfad && <a className="text-sm text-emerald-600 hover:underline" href={`/api/dokumente/${r.id}/datei`} target="_blank" rel="noreferrer">Öffnen</a>}
                <Button variant="danger" onClick={async () => { await api.del(`/dokumente/${r.id}`); laden(); }}>Löschen</Button>
              </div>
            ) },
          ]}
          rows={gefiltert}
          leer="Keine Dokumente in dieser Ansicht."
        />
      </Card>

      <Modal titel="Dokument hinzufügen" offen={!!form} onClose={() => setForm(null)} breit>
        {form && (
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <Field label="Titel"><Input value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} placeholder="z. B. Mietvertrag Laden EG – Müller GmbH" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kategorie"><Select value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value })}>{KATEGORIEN.map((k) => <option key={k}>{k}</option>)}</Select></Field>
                <Field label="Datum"><Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></Field>
              </div>
              <Field label="Datei"><input type="file" onChange={(e) => setForm({ ...form, datei: e.target.files[0] })} className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700" /></Field>
              <Field label="Notiz"><Textarea value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></Field>
            </div>
            <div className="space-y-4">
              <div className="text-sm font-medium text-slate-600">Verknüpfungen (optional)</div>
              <Field label="Objekt"><Select value={form.objekt_id} onChange={(e) => setForm({ ...form, objekt_id: e.target.value })}><option value="">—</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
              <Field label="Einheit"><Select value={form.einheit_id} onChange={(e) => setForm({ ...form, einheit_id: e.target.value })}><option value="">—</option>{einheiten.map((x) => <option key={x.id} value={x.id}>{x.bezeichnung}</option>)}</Select></Field>
              <Field label="Mieter"><Select value={form.mieter_id} onChange={(e) => setForm({ ...form, mieter_id: e.target.value })}><option value="">—</option>{mieter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            </div>
          </div>
        )}
        {form && (
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button>
            <Button onClick={speichern}>Speichern</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
