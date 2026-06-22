import React, { useEffect, useState } from 'react';
import { fmtDatum, api } from '../api.js';
import { Card, Button, Table, Modal, Field, Input, Select, Textarea, Badge } from '../ui.jsx';

const KATEGORIEN = ['Mietvertrag', 'Grundbuch', 'Versicherung', 'Kaufvertrag', 'Darlehen', 'Korrespondenz', 'sonstiges'];

export default function Dokumente() {
  const [liste, setListe] = useState([]);
  const [objekte, setObjekte] = useState([]);
  const [form, setForm] = useState(null);
  const laden = () => api.get('/dokumente').then(setListe);
  useEffect(() => { laden(); api.get('/objekte').then(setObjekte); }, []);

  const objektName = (id) => objekte.find((o) => o.id === id)?.name || '–';

  const dateiLesen = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  const speichern = async () => {
    const body = { titel: form.titel, kategorie: form.kategorie, objekt_id: form.objekt_id ? Number(form.objekt_id) : null, notiz: form.notiz };
    if (form.datei) { body.datei_base64 = await dateiLesen(form.datei); body.datei_name = form.datei.name; }
    await api.post('/dokumente', body);
    setForm(null); laden();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dokumente</h1>
          <p className="text-slate-500 mt-1">Verträge, Grundbuch, Versicherungen &amp; weitere Unterlagen</p>
        </div>
        <Button onClick={() => setForm({ titel: '', kategorie: 'Mietvertrag', objekt_id: '', notiz: '', datei: null })}>+ Dokument</Button>
      </header>
      <Card>
        <Table
          columns={[
            { kopf: 'Titel', zelle: (r) => <span className="font-medium text-slate-800">{r.titel}</span> },
            { kopf: 'Kategorie', zelle: (r) => <Badge color="blue">{r.kategorie}</Badge> },
            { kopf: 'Objekt', zelle: (r) => objektName(r.objekt_id) },
            { kopf: 'Angelegt', zelle: (r) => fmtDatum(r.erstellt_am) },
            { kopf: '', align: 'right', zelle: (r) => (
              <div className="flex gap-3 justify-end items-center">
                {r.datei_pfad && <a className="text-sm text-emerald-600 hover:underline" href={`/api/dokumente/${r.id}/datei`} target="_blank" rel="noreferrer">Öffnen</a>}
                <Button variant="danger" onClick={async () => { await api.del(`/dokumente/${r.id}`); laden(); }}>Löschen</Button>
              </div>
            ) },
          ]}
          rows={liste}
          leer="Noch keine Dokumente abgelegt."
        />
      </Card>
      <Modal titel="Dokument hinzufügen" offen={!!form} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-4">
            <Field label="Titel"><Input value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kategorie"><Select value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value })}>{KATEGORIEN.map((k) => <option key={k}>{k}</option>)}</Select></Field>
              <Field label="Objekt (optional)"><Select value={form.objekt_id} onChange={(e) => setForm({ ...form, objekt_id: e.target.value })}><option value="">—</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
            </div>
            <Field label="Datei"><input type="file" onChange={(e) => setForm({ ...form, datei: e.target.files[0] })} className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700" /></Field>
            <Field label="Notiz"><Textarea value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button><Button onClick={speichern}>Speichern</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
