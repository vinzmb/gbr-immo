import React, { useEffect, useState } from 'react';
import { api, fmtProzent, euroZuCent, fmtEuro } from '../api.js';
import { Button, Field, Input, Select, Badge, Hinweis } from '../ui.jsx';

const SCHRITTE = ['Willkommen', 'GbR-Daten', 'Objekt', 'Einheiten', 'Mieter & Verträge', 'KI-Assistent', 'Fertig'];

export default function SetupWizard({ onClose, onFertig, gehe }) {
  const [schritt, setSchritt] = useState(0);
  const [mandant, setMandant] = useState(null);
  const [objekt, setObjekt] = useState({ name: '', strasse: '', plz: '', ort: '', gesamtflaeche: '' });
  const [objektId, setObjektId] = useState(null);
  const [einheiten, setEinheiten] = useState([]);
  const [mieter, setMieter] = useState([]);
  const [vertraege, setVertraege] = useState([]);

  useEffect(() => { api.get('/mandant').then(setMandant); }, []);

  const weiter = () => setSchritt((s) => Math.min(s + 1, SCHRITTE.length - 1));
  const zurueck = () => setSchritt((s) => Math.max(s - 1, 0));

  // Speicherfunktionen je Schritt
  const speichereMandant = async () => { await api.put('/mandant', mandant); };
  const speichereObjekt = async () => {
    const body = { ...objekt, gesamtflaeche: Number(objekt.gesamtflaeche) || 0 };
    if (objektId) { await api.put(`/objekte/${objektId}`, body); }
    else { const o = await api.post('/objekte', body); setObjektId(o.id); }
  };

  const gesamtflaeche = einheiten.reduce((a, e) => a + (Number(e.flaeche) || 0), 0);
  const stpflFlaeche = einheiten.filter((e) => e.ust_status !== 'frei').reduce((a, e) => a + (Number(e.flaeche) || 0), 0);
  const quote = gesamtflaeche ? stpflFlaeche / gesamtflaeche : 0;

  if (!mandant) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Kopf mit Stepper */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800 text-lg">Einrichtungs-Assistent</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">Später</button>
          </div>
          <div className="flex items-center gap-1.5">
            {SCHRITTE.map((s, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1.5 rounded-full ${i <= schritt ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500 mt-2">Schritt {schritt + 1} von {SCHRITTE.length} · {SCHRITTE[schritt]}</div>
        </div>

        {/* Inhalt */}
        <div className="px-6 py-6 overflow-y-auto flex-1">
          {schritt === 0 && (
            <div className="space-y-4 text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-2xl font-bold mx-auto">GB</div>
              <h3 className="text-xl font-bold text-slate-800">Willkommen bei GBR-Immo</h3>
              <p className="text-slate-500 max-w-md mx-auto">
                Dieser Assistent richtet deine Grundstücks-GbR in wenigen Minuten ein: Stammdaten, dein Objekt,
                die Mieteinheiten mit Flächen und USt-Status sowie optional Mieter und den KI-Assistenten.
                Anschließend kannst du direkt mit dem Buchen starten.
              </p>
            </div>
          )}

          {schritt === 1 && (
            <div className="space-y-4">
              <Hinweis ton="info">Diese Angaben erscheinen auf Auswertungen und im DATEV-/Steuer-Export. Du kannst sie später jederzeit ändern.</Hinweis>
              <Field label="Name der GbR"><Input value={mandant.name} onChange={(e) => setMandant({ ...mandant, name: e.target.value })} placeholder="z. B. Grundstücksgemeinschaft Mustermann GbR" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Finanzamt"><Input value={mandant.finanzamt} onChange={(e) => setMandant({ ...mandant, finanzamt: e.target.value })} /></Field>
                <Field label="Steuernummer"><Input value={mandant.steuernummer} onChange={(e) => setMandant({ ...mandant, steuernummer: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="USt-IdNr."><Input value={mandant.ust_idnr} onChange={(e) => setMandant({ ...mandant, ust_idnr: e.target.value })} /></Field>
                <Field label="Besteuerung" hint="Standard: Ist">
                  <Select value={mandant.besteuerungsart} onChange={(e) => setMandant({ ...mandant, besteuerungsart: e.target.value })}>
                    <option value="ist">Ist (§20)</option><option value="soll">Soll</option>
                  </Select>
                </Field>
                <Field label="Voranmeldung">
                  <Select value={mandant.voranmeldungszeitraum} onChange={(e) => setMandant({ ...mandant, voranmeldungszeitraum: e.target.value })}>
                    <option value="monat">monatlich</option><option value="quartal">quartalsweise</option><option value="jahr">jährlich</option>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {schritt === 2 && (
            <div className="space-y-4">
              <Hinweis ton="info">Lege dein erstes Objekt (Gebäude/Grundstück) an. Weitere Objekte kannst du später unter „Objekte &amp; Mieter" ergänzen.</Hinweis>
              <Field label="Bezeichnung"><Input value={objekt.name} onChange={(e) => setObjekt({ ...objekt, name: e.target.value })} placeholder="z. B. Geschäftshaus Hauptstraße 1" /></Field>
              <Field label="Straße"><Input value={objekt.strasse} onChange={(e) => setObjekt({ ...objekt, strasse: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="PLZ"><Input value={objekt.plz} onChange={(e) => setObjekt({ ...objekt, plz: e.target.value })} /></Field>
                <Field label="Ort"><Input value={objekt.ort} onChange={(e) => setObjekt({ ...objekt, ort: e.target.value })} /></Field>
              </div>
            </div>
          )}

          {schritt === 3 && (
            <EinheitenSchritt objektId={objektId} einheiten={einheiten} setEinheiten={setEinheiten} quote={quote} gesamtflaeche={gesamtflaeche} />
          )}

          {schritt === 4 && (
            <MieterSchritt einheiten={einheiten} mieter={mieter} setMieter={setMieter} vertraege={vertraege} setVertraege={setVertraege} />
          )}

          {schritt === 5 && (
            <div className="space-y-4">
              <Hinweis ton="info">Optional: Mit dem KI-Assistenten schlägt die App beim Erfassen von Belegen automatisch Konto, USt-Satz und Aufteilung vor. Belegtext wird nur auf deinen Klick hin gesendet.</Hinweis>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={!!mandant.ki_aktiv} onChange={(e) => setMandant({ ...mandant, ki_aktiv: e.target.checked ? 1 : 0 })} className="w-4 h-4 accent-emerald-600" />
                <span className="text-sm font-medium text-slate-700">KI-Assistent aktivieren</span>
              </label>
              {mandant.ki_aktiv ? (
                <Field label="Anthropic API-Schlüssel" hint="Wird nur lokal gespeichert."><Input type="password" value={mandant.ki_api_key} onChange={(e) => setMandant({ ...mandant, ki_api_key: e.target.value })} placeholder="sk-ant-…" /></Field>
              ) : null}
            </div>
          )}

          {schritt === 6 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto">✓</div>
              <h3 className="text-xl font-bold text-slate-800">Einrichtung abgeschlossen</h3>
              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
                <Zus label="Einheiten" wert={einheiten.length} />
                <Zus label="Gesamtfläche" wert={`${gesamtflaeche} m²`} />
                <Zus label="Vorsteuerquote" wert={fmtProzent(quote)} />
              </div>
              <p className="text-slate-500 max-w-md mx-auto pt-2">
                Alles bereit. Du kannst nun Belege erfassen, Bankumsätze importieren — oder direkt den
                Buchungsstapel-Assistenten starten, der dich durch die offenen Buchungen führt.
              </p>
            </div>
          )}
        </div>

        {/* Fuß */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <Button variant="ghost" onClick={zurueck} disabled={schritt === 0}>Zurück</Button>
          {schritt < 6 ? (
            <Button onClick={async () => {
              if (schritt === 1) await speichereMandant();
              if (schritt === 2) { if (!objekt.name) { alert('Bitte eine Bezeichnung für das Objekt eingeben.'); return; } await speichereObjekt(); }
              if (schritt === 5) await speichereMandant();
              weiter();
            }} disabled={schritt === 2 && !objekt.name}>
              {schritt === 0 ? 'Los geht’s' : 'Weiter'}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { onFertig(); gehe('dashboard'); }}>Zur Übersicht</Button>
              <Button onClick={() => { onFertig(); gehe('assistent', 'stapel'); }}>Buchungsstapel starten →</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Zus({ label, wert }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-800">{wert}</div>
    </div>
  );
}

function EinheitenSchritt({ objektId, einheiten, setEinheiten, quote, gesamtflaeche }) {
  const [form, setForm] = useState({ bezeichnung: '', flaeche: '', nutzungsart: 'gewerbe', ust_status: '19' });
  const hinzufuegen = async () => {
    if (!form.bezeichnung || !form.flaeche) return;
    const body = { objekt_id: objektId, bezeichnung: form.bezeichnung, flaeche: Number(form.flaeche), nutzungsart: form.nutzungsart, ust_status: form.ust_status };
    const e = await api.post('/einheiten', body);
    setEinheiten([...einheiten, e]);
    setForm({ bezeichnung: '', flaeche: '', nutzungsart: 'gewerbe', ust_status: '19' });
  };
  const entfernen = async (id) => { await api.del(`/einheiten/${id}`); setEinheiten(einheiten.filter((e) => e.id !== id)); };
  const USTLABEL = { '19': '19 %', '7': '7 %', frei: 'steuerfrei' };
  const USTFARBE = { '19': 'green', '7': 'blue', frei: 'amber' };

  return (
    <div className="space-y-4">
      <Hinweis ton="info">Trage jede Mieteinheit mit Fläche und USt-Status ein. Der <strong>USt-Status</strong> bestimmt, ob Vorsteuer aus zugeordneten Kosten abziehbar ist — daraus ergibt sich die Vorsteuerquote.</Hinweis>
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-4"><Field label="Bezeichnung"><Input value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} placeholder="Laden EG" /></Field></div>
        <div className="col-span-2"><Field label="Fläche m²"><Input type="number" value={form.flaeche} onChange={(e) => setForm({ ...form, flaeche: e.target.value })} /></Field></div>
        <div className="col-span-3"><Field label="Nutzung"><Select value={form.nutzungsart} onChange={(e) => setForm({ ...form, nutzungsart: e.target.value })}><option value="gewerbe">Gewerbe</option><option value="wohnen">Wohnen</option></Select></Field></div>
        <div className="col-span-3"><Field label="USt-Status"><Select value={form.ust_status} onChange={(e) => setForm({ ...form, ust_status: e.target.value })}><option value="19">19 % Option</option><option value="7">7 %</option><option value="frei">steuerfrei</option></Select></Field></div>
      </div>
      <Button variant="subtle" onClick={hinzufuegen} disabled={!objektId}>+ Einheit hinzufügen</Button>
      {!objektId && <Hinweis ton="warn">Bitte zuerst im vorigen Schritt das Objekt speichern.</Hinweis>}

      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {einheiten.length === 0 && <div className="px-4 py-6 text-center text-slate-400 text-sm">Noch keine Einheit erfasst.</div>}
        {einheiten.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="font-medium text-slate-800">{e.bezeichnung}</span>
              <span className="text-sm text-slate-500">{e.flaeche} m²</span>
              <Badge color={USTFARBE[e.ust_status]}>{USTLABEL[e.ust_status]}</Badge>
            </div>
            <button onClick={() => entfernen(e.id)} className="text-red-500 hover:text-red-700 text-sm">Entfernen</button>
          </div>
        ))}
      </div>
      {einheiten.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <span className="text-sm text-emerald-800">Gesamtfläche <strong>{gesamtflaeche} m²</strong></span>
          <span className="text-sm text-emerald-800">Vorsteuerquote nach Fläche: <strong>{fmtProzent(quote)}</strong></span>
        </div>
      )}
    </div>
  );
}

function MieterSchritt({ einheiten, mieter, setMieter, vertraege, setVertraege }) {
  const [mName, setMName] = useState('');
  const [v, setV] = useState({ einheit_id: '', mieter_id: '', nettomiete_euro: '', ust_satz: '19' });

  const mieterAdd = async () => {
    if (!mName) return;
    const m = await api.post('/mieter', { name: mName });
    setMieter([...mieter, m]); setMName('');
    if (!v.mieter_id) setV({ ...v, mieter_id: m.id });
  };
  const vertragAdd = async () => {
    if (!v.einheit_id || !v.mieter_id) return;
    const neu = await api.post('/mietvertraege', { einheit_id: Number(v.einheit_id), mieter_id: Number(v.mieter_id), nettomiete: euroZuCent(v.nettomiete_euro), ust_satz: v.ust_satz, aktiv: 1 });
    setVertraege([...vertraege, neu]);
    setV({ ...v, nettomiete_euro: '' });
  };
  const mieterName = (id) => mieter.find((m) => m.id === Number(id))?.name || '';
  const einheitName = (id) => einheiten.find((e) => e.id === Number(id))?.bezeichnung || '';

  return (
    <div className="space-y-5">
      <Hinweis ton="info">Optional — kann auch übersprungen werden. Mieter und Verträge liefern später den Umsatzschlüssel und die Mietenliste.</Hinweis>
      <div>
        <div className="text-sm font-medium text-slate-600 mb-2">Mieter anlegen</div>
        <div className="flex gap-2">
          <Input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Name / Firma" />
          <Button variant="subtle" onClick={mieterAdd}>+ Mieter</Button>
        </div>
        {mieter.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{mieter.map((m) => <Badge key={m.id} color="slate">{m.name}</Badge>)}</div>}
      </div>
      <div>
        <div className="text-sm font-medium text-slate-600 mb-2">Mietvertrag zuordnen</div>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-4"><Field label="Einheit"><Select value={v.einheit_id} onChange={(e) => setV({ ...v, einheit_id: e.target.value })}><option value="">—</option>{einheiten.map((e) => <option key={e.id} value={e.id}>{e.bezeichnung}</option>)}</Select></Field></div>
          <div className="col-span-3"><Field label="Mieter"><Select value={v.mieter_id} onChange={(e) => setV({ ...v, mieter_id: e.target.value })}><option value="">—</option>{mieter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field></div>
          <div className="col-span-3"><Field label="Nettomiete €"><Input value={v.nettomiete_euro} onChange={(e) => setV({ ...v, nettomiete_euro: e.target.value })} /></Field></div>
          <div className="col-span-2"><Field label="USt"><Select value={v.ust_satz} onChange={(e) => setV({ ...v, ust_satz: e.target.value })}><option value="19">19 %</option><option value="7">7 %</option><option value="frei">frei</option></Select></Field></div>
        </div>
        <Button variant="subtle" className="mt-2" onClick={vertragAdd} disabled={!v.einheit_id || !v.mieter_id}>+ Vertrag</Button>
        {vertraege.length > 0 && (
          <div className="mt-2 space-y-1">
            {vertraege.map((x) => <div key={x.id} className="text-sm text-slate-600">{einheitName(x.einheit_id)} → {mieterName(x.mieter_id)} · {fmtEuro(x.nettomiete)}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
