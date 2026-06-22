import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtDatum } from '../api.js';
import { Card, Button, Table, Modal, Field, Input, Select, Badge, Hinweis } from '../ui.jsx';

export default function Bank() {
  const [konten, setKonten] = useState([]);
  const [umsaetze, setUmsaetze] = useState([]);
  const [filter, setFilter] = useState('offen');
  const [konto, setKonto] = useState(null);
  const [import_, setImport] = useState(false);
  const [verbuchen, setVerbuchen] = useState(null);
  const [skr, setSkr] = useState([]);
  const [einheiten, setEinheiten] = useState([]);
  const [objekte, setObjekte] = useState([]);

  const ladenUmsaetze = () => api.get(`/bank/umsaetze${filter ? `?status=${filter}` : ''}`).then(setUmsaetze);
  const ladenKonten = () => api.get('/bank_konten').then(setKonten);
  useEffect(() => { ladenKonten(); api.get('/konten').then(setSkr); api.get('/einheiten').then(setEinheiten); api.get('/objekte').then(setObjekte); }, []);
  useEffect(() => { ladenUmsaetze(); }, [filter]);

  const setzeStatus = async (u, status) => { await api.put(`/bank/umsaetze/${u.id}`, { status }); ladenUmsaetze(); };

  const offen = umsaetze.filter((u) => u.status === 'offen').length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bank</h1>
          <p className="text-slate-500 mt-1">Kontoumsätze importieren und im Posteingang abarbeiten</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setKonto({ name: '', iban: '' })}>+ Bankkonto</Button>
          <Button onClick={() => setImport(true)}>Umsätze importieren</Button>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        {konten.map((k) => (
          <div key={k.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="text-sm text-slate-500">{k.iban || 'ohne IBAN'}</div>
            <div className="text-lg font-semibold text-slate-800">{k.name}</div>
          </div>
        ))}
        {konten.length === 0 && <Hinweis ton="info">Lege ein Bankkonto an, dann kannst du Umsätze importieren (CSV, CAMT.053 oder MT940).</Hinweis>}
      </div>

      <Card title="Posteingang" subtitle={`${offen} offene Umsätze`}
        actions={
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {[['offen', 'Offen'], ['erledigt', 'Erledigt'], ['', 'Alle']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
        }>
        <Table
          columns={[
            { kopf: 'Datum', zelle: (r) => fmtDatum(r.datum) },
            { kopf: 'Gegenpartei', zelle: (r) => <span className="font-medium text-slate-800">{r.gegenpartei || '–'}</span> },
            { kopf: 'Verwendungszweck', zelle: (r) => <span className="text-slate-600">{(r.verwendungszweck || '').slice(0, 60)}</span> },
            { kopf: 'Status', zelle: (r) => <Badge color={r.status === 'erledigt' ? 'green' : r.status === 'ignoriert' ? 'slate' : 'amber'}>{r.status}</Badge> },
            { kopf: 'Betrag', align: 'right', zelle: (r) => <span className={r.betrag < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtEuro(r.betrag)}</span> },
            {
              kopf: '', align: 'right', zelle: (r) => r.status === 'offen' ? (
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setVerbuchen({ u: r, ust_satz: '19', konto: '', aufteilung_modus: r.betrag >= 0 ? 'direkt' : 'flaeche', einheit_id: '', objekt_id: '' })}>Verbuchen</Button>
                  <Button variant="danger" onClick={() => setzeStatus(r, 'ignoriert')}>Ignorieren</Button>
                </div>
              ) : <span className="text-xs text-slate-400">—</span>,
            },
          ]}
          rows={umsaetze}
          leer="Keine Umsätze in dieser Ansicht."
        />
      </Card>

      {konto && <KontoModal konto={konto} setKonto={setKonto} onFertig={() => { setKonto(null); ladenKonten(); }} />}
      {import_ && <ImportModal konten={konten} onClose={() => setImport(false)} onFertig={() => { setImport(false); ladenUmsaetze(); }} />}
      {verbuchen && <VerbuchenBank v={verbuchen} setV={setVerbuchen} skr={skr} einheiten={einheiten} objekte={objekte} onFertig={() => { setVerbuchen(null); ladenUmsaetze(); }} />}
    </div>
  );
}

function KontoModal({ konto, setKonto, onFertig }) {
  const speichern = async () => { await api.post('/bank_konten', konto); onFertig(); };
  return (
    <Modal titel="Neues Bankkonto" offen onClose={() => setKonto(null)}>
      <div className="space-y-4">
        <Field label="Bezeichnung"><Input value={konto.name} onChange={(e) => setKonto({ ...konto, name: e.target.value })} placeholder="z. B. Geschäftskonto Sparkasse" /></Field>
        <Field label="IBAN"><Input value={konto.iban} onChange={(e) => setKonto({ ...konto, iban: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setKonto(null)}>Abbrechen</Button><Button onClick={speichern}>Speichern</Button></div>
      </div>
    </Modal>
  );
}

function ImportModal({ konten, onClose, onFertig }) {
  const [bankKonto, setBankKonto] = useState(konten[0]?.id || '');
  const [inhalt, setInhalt] = useState('');
  const [name, setName] = useState('');
  const [ergebnis, setErgebnis] = useState(null);
  const [fehler, setFehler] = useState('');

  const dateiWaehlen = (file) => {
    if (!file) return;
    setName(file.name);
    const r = new FileReader();
    r.onload = () => setInhalt(r.result);
    r.readAsText(file, 'utf-8');
  };

  const importieren = async () => {
    setFehler('');
    try {
      const res = await api.post('/bank/import', { bank_konto_id: bankKonto ? Number(bankKonto) : null, dateiinhalt: inhalt, dateiname: name });
      setErgebnis(res);
    } catch (e) { setFehler(e.message); }
  };

  return (
    <Modal titel="Bankumsätze importieren" offen onClose={onClose} breit>
      <div className="space-y-4">
        <Hinweis ton="info">Unterstützt: <strong>CSV</strong> (Sparkasse, VR-Bank u. a.), <strong>CAMT.053</strong> (XML) und <strong>MT940</strong>. Datei auswählen oder Inhalt einfügen.</Hinweis>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bankkonto"><Select value={bankKonto} onChange={(e) => setBankKonto(e.target.value)}><option value="">— ohne —</option>{konten.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Select></Field>
          <Field label="Datei"><input type="file" accept=".csv,.xml,.sta,.txt,.940" onChange={(e) => dateiWaehlen(e.target.files[0])} className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700" /></Field>
        </div>
        <Field label="oder Inhalt einfügen"><textarea value={inhalt} onChange={(e) => setInhalt(e.target.value)} rows={6} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono" placeholder="CSV / XML / MT940 …" /></Field>
        {fehler && <Hinweis ton="warn">{fehler}</Hinweis>}
        {ergebnis && <Hinweis ton="ok">{ergebnis.gefunden} Umsätze erkannt · {ergebnis.neu} neu importiert · {ergebnis.duplikate} Duplikate übersprungen.</Hinweis>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Schließen</Button>
          {ergebnis ? <Button onClick={onFertig}>Fertig</Button> : <Button onClick={importieren} disabled={!inhalt}>Importieren</Button>}
        </div>
      </div>
    </Modal>
  );
}

function VerbuchenBank({ v, setV, skr, einheiten, objekte, onFertig }) {
  const u = v.u;
  const einnahme = u.betrag >= 0;
  const kontenGefiltert = skr.filter((k) => (einnahme ? k.art === 'erloes' : k.art === 'aufwand'));
  const speichern = async () => {
    await api.post(`/bank/umsaetze/${u.id}/verbuchen`, {
      ust_satz: v.ust_satz, konto: v.konto || (kontenGefiltert[0]?.nummer ?? ''),
      aufteilung_modus: einnahme ? 'direkt' : v.aufteilung_modus,
      einheit_id: v.einheit_id ? Number(v.einheit_id) : null,
      objekt_id: v.objekt_id ? Number(v.objekt_id) : null,
    });
    onFertig();
  };
  return (
    <Modal titel={`Umsatz verbuchen · ${fmtEuro(u.betrag)}`} offen onClose={() => setV(null)}>
      <div className="space-y-4">
        <Hinweis ton="info">{fmtDatum(u.datum)} · {u.gegenpartei} · {(u.verwendungszweck || '').slice(0, 80)}</Hinweis>
        <div className="grid grid-cols-2 gap-3">
          <Field label="USt-Satz"><Select value={v.ust_satz} onChange={(e) => setV({ ...v, ust_satz: e.target.value })}><option value="19">19 %</option><option value="7">7 %</option><option value="frei">steuerfrei</option></Select></Field>
          <Field label="Konto"><Select value={v.konto} onChange={(e) => setV({ ...v, konto: e.target.value })}><option value="">— wählen —</option>{kontenGefiltert.map((k) => <option key={k.id} value={k.nummer}>{k.nummer} · {k.bezeichnung}</option>)}</Select></Field>
        </div>
        {einnahme ? (
          <Field label="Einheit"><Select value={v.einheit_id} onChange={(e) => setV({ ...v, einheit_id: e.target.value })}><option value="">— wählen —</option>{einheiten.map((e2) => <option key={e2.id} value={e2.id}>{e2.bezeichnung}</option>)}</Select></Field>
        ) : (
          <>
            <Field label="Aufteilung"><Select value={v.aufteilung_modus} onChange={(e) => setV({ ...v, aufteilung_modus: e.target.value })}><option value="flaeche">Flächenschlüssel</option><option value="direkt">Direkt einer Einheit</option><option value="umsatz">Umsatzschlüssel</option><option value="anteil">Miteigentumsanteil</option><option value="keine">Keine Aufteilung</option></Select></Field>
            {v.aufteilung_modus === 'direkt' ? (
              <Field label="Einheit"><Select value={v.einheit_id} onChange={(e) => setV({ ...v, einheit_id: e.target.value })}><option value="">— wählen —</option>{einheiten.map((e2) => <option key={e2.id} value={e2.id}>{e2.bezeichnung}</option>)}</Select></Field>
            ) : (
              <Field label="Objekt"><Select value={v.objekt_id} onChange={(e) => setV({ ...v, objekt_id: e.target.value })}><option value="">Alle Objekte</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setV(null)}>Abbrechen</Button><Button onClick={speichern}>Verbuchen &amp; erledigen</Button></div>
      </div>
    </Modal>
  );
}
