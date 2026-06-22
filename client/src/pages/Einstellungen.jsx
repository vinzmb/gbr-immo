import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, Button, Field, Input, Select, Hinweis, Textarea } from '../ui.jsx';

export default function Einstellungen() {
  const [m, setM] = useState(null);
  const [meldung, setMeldung] = useState('');

  useEffect(() => { api.get('/mandant').then(setM); }, []);
  if (!m) return <div className="text-slate-400">Lädt …</div>;

  const speichern = async () => {
    await api.put('/mandant', {
      name: m.name, steuernummer: m.steuernummer, ust_idnr: m.ust_idnr, finanzamt: m.finanzamt,
      besteuerungsart: m.besteuerungsart, voranmeldungszeitraum: m.voranmeldungszeitraum,
      kontenrahmen: m.kontenrahmen, ki_aktiv: m.ki_aktiv ? 1 : 0, ki_api_key: m.ki_api_key,
    });
    setMeldung('Einstellungen gespeichert.');
    setTimeout(() => setMeldung(''), 2500);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Einstellungen</h1>
        <p className="text-slate-500 mt-1">Mandantendaten, Besteuerung und KI-Assistent</p>
      </header>

      <Card title="GbR / Mandant">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Name der GbR"><Input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
          <Field label="Finanzamt"><Input value={m.finanzamt} onChange={(e) => setM({ ...m, finanzamt: e.target.value })} /></Field>
          <Field label="Steuernummer"><Input value={m.steuernummer} onChange={(e) => setM({ ...m, steuernummer: e.target.value })} /></Field>
          <Field label="USt-IdNr."><Input value={m.ust_idnr} onChange={(e) => setM({ ...m, ust_idnr: e.target.value })} /></Field>
        </div>
      </Card>

      <Card title="Besteuerung">
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Wann wird die Steuer fällig?" info="„Bei Zahlung“ (Ist) ist für Vermietung der Normalfall: Die Steuer entsteht erst, wenn das Geld eingeht. Im Zweifel so lassen.">
            <Select value={m.besteuerungsart} onChange={(e) => setM({ ...m, besteuerungsart: e.target.value })}>
              <option value="ist">bei Zahlung (Ist-Versteuerung, Normalfall)</option>
              <option value="soll">bei Rechnung (Soll-Versteuerung)</option>
            </Select>
          </Field>
          <Field label="Wie oft melden?" info="Wie oft du die Umsatzsteuer ans Finanzamt meldest. Das schreibt dir das Finanzamt vor – meist quartalsweise.">
            <Select value={m.voranmeldungszeitraum} onChange={(e) => setM({ ...m, voranmeldungszeitraum: e.target.value })}>
              <option value="monat">monatlich</option>
              <option value="quartal">quartalsweise</option>
              <option value="jahr">jährlich</option>
            </Select>
          </Field>
          <Field label="Kontenrahmen" info="Ein Nummernsystem für Buchhaltungskonten. Musst du nicht verstehen – die App nutzt es automatisch im Hintergrund. SKR 04 ist Standard.">
            <Select value={m.kontenrahmen} onChange={(e) => setM({ ...m, kontenrahmen: e.target.value })}>
              <option value="skr04">SKR 04 (Standard)</option>
              <option value="skr03">SKR 03</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card title="KI-Belegassistent" subtitle="Optionaler Vorschlag für Belegzuordnungen">
        <div className="space-y-4">
          <Hinweis ton="info">
            Aktiviere den Assistenten und hinterlege deinen <strong>Anthropic-API-Schlüssel</strong>. Belegtext wird nur dann
            zur Klassifizierung an die KI gesendet, wenn du in einem Beleg auf „KI-Vorschlag" klickst.
          </Hinweis>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={!!m.ki_aktiv} onChange={(e) => setM({ ...m, ki_aktiv: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
            <span className="text-sm font-medium text-slate-700">KI-Assistent aktivieren</span>
          </label>
          <Field label="Anthropic API-Schlüssel" hint="Wird ausschließlich lokal in der Datenbank gespeichert.">
            <Input type="password" value={m.ki_api_key} onChange={(e) => setM({ ...m, ki_api_key: e.target.value })} placeholder="sk-ant-…" />
          </Field>
        </div>
      </Card>

      {meldung && <Hinweis ton="ok">{meldung}</Hinweis>}
      <div className="flex justify-end"><Button onClick={speichern}>Speichern</Button></div>
    </div>
  );
}
