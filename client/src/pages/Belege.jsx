import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtDatum, euroZuCent } from '../api.js';
import { Card, Button, Table, Modal, Field, Input, Select, Textarea, Badge, Hinweis } from '../ui.jsx';

const heute = () => new Date().toISOString().slice(0, 10);

export default function Belege() {
  const [liste, setListe] = useState([]);
  const [konten, setKonten] = useState([]);
  const [einheiten, setEinheiten] = useState([]);
  const [objekte, setObjekte] = useState([]);
  const [form, setForm] = useState(null);
  const [buchen, setBuchen] = useState(null);

  const laden = () => api.get('/belege').then(setListe);
  useEffect(() => {
    laden();
    api.get('/konten').then(setKonten);
    api.get('/einheiten').then(setEinheiten);
    api.get('/objekte').then(setObjekte);
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Belege</h1>
          <p className="text-slate-500 mt-1">Rechnungen &amp; Quittungen erfassen, archivieren und verbuchen</p>
        </div>
        <Button onClick={() => setForm({ art: 'eingang', datum: heute(), partner: '', betrag_euro: '', beschreibung: '', kategorie: '', ocr_text: '' })}>
          + Beleg erfassen
        </Button>
      </header>

      <Card>
        <Table
          columns={[
            { kopf: 'Datum', zelle: (r) => fmtDatum(r.datum) },
            { kopf: 'Partner', zelle: (r) => <span className="font-medium text-slate-800">{r.partner || '–'}</span> },
            { kopf: 'Beschreibung', zelle: (r) => r.beschreibung || '–' },
            { kopf: 'Art', zelle: (r) => <Badge color={r.art === 'eingang' ? 'slate' : 'green'}>{r.art === 'eingang' ? 'Eingang' : 'Ausgang'}</Badge> },
            { kopf: 'Status', zelle: (r) => <Badge color={r.status === 'gebucht' ? 'green' : 'amber'}>{r.status === 'gebucht' ? 'gebucht' : 'offen'}</Badge> },
            { kopf: 'Betrag', align: 'right', zelle: (r) => fmtEuro(r.betrag_brutto) },
            {
              kopf: '', align: 'right', zelle: (r) => (
                <div className="flex gap-2 justify-end">
                  {r.datei_pfad && <a className="text-sm text-emerald-600 hover:underline" href={`/api/belege/${r.id}/datei`} target="_blank" rel="noreferrer">Datei</a>}
                  {r.status !== 'gebucht' && <Button variant="ghost" onClick={() => setBuchen({ beleg: r, ust_satz: '19', konto: '', aufteilung_modus: 'flaeche', objekt_id: '', einheit_id: '', typ: r.art === 'ausgang' ? 'einnahme' : 'ausgabe' })}>Verbuchen</Button>}
                </div>
              ),
            },
          ]}
          rows={liste}
          leer="Noch keine Belege erfasst."
        />
      </Card>

      {form && <BelegFormular form={form} setForm={setForm} onClose={() => setForm(null)} onGespeichert={() => { setForm(null); laden(); }} />}
      {buchen && <VerbuchenModal buchen={buchen} setBuchen={setBuchen} konten={konten} einheiten={einheiten} objekte={objekte} onFertig={() => { setBuchen(null); laden(); }} />}
    </div>
  );
}

function BelegFormular({ form, setForm, onClose, onGespeichert }) {
  const [datei, setDatei] = useState(null);
  const [kiLaedt, setKiLaedt] = useState(false);
  const [kiFehler, setKiFehler] = useState('');

  const dateiLesen = (file) => new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(file);
  });

  const speichern = async () => {
    const body = {
      art: form.art, datum: form.datum, partner: form.partner, beleg_nr: form.beleg_nr || '',
      betrag_brutto: euroZuCent(form.betrag_euro), beschreibung: form.beschreibung,
      kategorie: form.kategorie, ocr_text: form.ocr_text || '',
    };
    if (datei) {
      body.datei_base64 = await dateiLesen(datei);
      body.datei_name = datei.name;
    }
    await api.post('/belege', body);
    onGespeichert();
  };

  const kiVorschlag = async () => {
    setKiLaedt(true); setKiFehler('');
    try {
      const text = form.ocr_text || `${form.partner} ${form.beschreibung} ${form.betrag_euro}`;
      const v = await api.post('/ki/beleg', { text, art: form.art });
      if (v.error) { setKiFehler(v.error); }
      else {
        setForm((f) => ({
          ...f,
          partner: v.partner || f.partner,
          datum: v.datum || f.datum,
          betrag_euro: v.betrag_brutto ? (v.betrag_brutto / 100).toString().replace('.', ',') : f.betrag_euro,
          beschreibung: v.beschreibung || f.beschreibung,
          kategorie: v.kategorie || f.kategorie,
        }));
      }
    } catch (e) { setKiFehler(e.message); }
    setKiLaedt(false);
  };

  return (
    <Modal titel="Beleg erfassen" offen onClose={onClose} breit>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Field label="Belegart">
            <Select value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>
              <option value="eingang">Eingang (Kosten / Lieferantenrechnung)</option>
              <option value="ausgang">Ausgang (eigene Rechnung / Erlös)</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum"><Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></Field>
            <Field label="Betrag brutto (€)"><Input value={form.betrag_euro} onChange={(e) => setForm({ ...form, betrag_euro: e.target.value })} /></Field>
          </div>
          <Field label="Partner (Lieferant / Mieter)"><Input value={form.partner} onChange={(e) => setForm({ ...form, partner: e.target.value })} /></Field>
          <Field label="Beschreibung"><Input value={form.beschreibung} onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Belegnummer"><Input value={form.beleg_nr || ''} onChange={(e) => setForm({ ...form, beleg_nr: e.target.value })} /></Field>
            <Field label="Kategorie"><Input value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value })} /></Field>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Belegdatei (PDF/Bild)" hint="Wird unveränderbar im lokalen Archiv abgelegt.">
            <input type="file" accept=".pdf,image/*" onChange={(e) => setDatei(e.target.files[0])} className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
          </Field>
          <Field label="Belegtext (für KI / Notiz)" hint="Text aus dem Beleg einfügen — die KI macht daraus einen Buchungsvorschlag.">
            <Textarea value={form.ocr_text || ''} onChange={(e) => setForm({ ...form, ocr_text: e.target.value })} rows={5} />
          </Field>
          <div className="flex items-center gap-2">
            <Button variant="subtle" onClick={kiVorschlag} disabled={kiLaedt}>{kiLaedt ? 'KI denkt …' : '✨ KI-Vorschlag'}</Button>
            <span className="text-xs text-slate-400">Optional · benötigt API-Schlüssel</span>
          </div>
          {kiFehler && <Hinweis ton="warn">{kiFehler}</Hinweis>}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
        <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button onClick={speichern}>Beleg speichern</Button>
      </div>
    </Modal>
  );
}

function VerbuchenModal({ buchen, setBuchen, konten, einheiten, objekte, onFertig }) {
  const b = buchen.beleg;
  const kontenGefiltert = konten.filter((k) => (buchen.typ === 'einnahme' ? k.art === 'erloes' : k.art === 'aufwand'));
  const einheitenGefiltert = buchen.objekt_id ? einheiten.filter((e) => e.objekt_id === Number(buchen.objekt_id)) : einheiten;

  const speichern = async () => {
    await api.post('/buchungen', {
      typ: buchen.typ, datum: b.datum, beleg_id: b.id, betrag_brutto: b.betrag_brutto,
      ust_satz: buchen.ust_satz, konto: buchen.konto || (kontenGefiltert[0]?.nummer ?? ''), gegenkonto: '1800',
      aufteilung_modus: buchen.typ === 'einnahme' ? 'direkt' : buchen.aufteilung_modus,
      objekt_id: buchen.objekt_id ? Number(buchen.objekt_id) : null,
      einheit_id: buchen.einheit_id ? Number(buchen.einheit_id) : null,
      buchungstext: b.beschreibung || b.partner,
    });
    onFertig();
  };

  return (
    <Modal titel={`Beleg verbuchen · ${fmtEuro(b.betrag_brutto)}`} offen onClose={() => setBuchen(null)}>
      <div className="space-y-4">
        <Hinweis ton="info">{b.partner} · {fmtDatum(b.datum)} · {b.beschreibung}</Hinweis>
        <div className="grid grid-cols-2 gap-3">
          <Field label="USt-Satz">
            <Select value={buchen.ust_satz} onChange={(e) => setBuchen({ ...buchen, ust_satz: e.target.value })}>
              <option value="19">19 %</option><option value="7">7 %</option><option value="frei">steuerfrei</option>
            </Select>
          </Field>
          <Field label="Konto">
            <Select value={buchen.konto} onChange={(e) => setBuchen({ ...buchen, konto: e.target.value })}>
              <option value="">— wählen —</option>
              {kontenGefiltert.map((k) => <option key={k.id} value={k.nummer}>{k.nummer} · {k.bezeichnung}</option>)}
            </Select>
          </Field>
        </div>
        {buchen.typ === 'ausgabe' ? (
          <>
            <Field label="Aufteilung">
              <Select value={buchen.aufteilung_modus} onChange={(e) => setBuchen({ ...buchen, aufteilung_modus: e.target.value })}>
                <option value="flaeche">Flächenschlüssel (Gemeinkosten)</option>
                <option value="direkt">Direkt einer Einheit</option>
                <option value="umsatz">Umsatzschlüssel</option>
                <option value="anteil">Miteigentumsanteil</option>
                <option value="keine">Keine Aufteilung</option>
              </Select>
            </Field>
            {buchen.aufteilung_modus === 'direkt' ? (
              <Field label="Einheit">
                <Select value={buchen.einheit_id} onChange={(e) => setBuchen({ ...buchen, einheit_id: e.target.value })}>
                  <option value="">— wählen —</option>
                  {einheiten.map((e2) => <option key={e2.id} value={e2.id}>{e2.bezeichnung}</option>)}
                </Select>
              </Field>
            ) : (
              <Field label="Objekt (für Schlüssel)">
                <Select value={buchen.objekt_id} onChange={(e) => setBuchen({ ...buchen, objekt_id: e.target.value })}>
                  <option value="">Alle Objekte</option>
                  {objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </Field>
            )}
          </>
        ) : (
          <Field label="Einheit">
            <Select value={buchen.einheit_id} onChange={(e) => setBuchen({ ...buchen, einheit_id: e.target.value })}>
              <option value="">— wählen —</option>
              {einheitenGefiltert.map((e2) => <option key={e2.id} value={e2.id}>{e2.bezeichnung}</option>)}
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setBuchen(null)}>Abbrechen</Button><Button onClick={speichern}>Verbuchen</Button></div>
      </div>
    </Modal>
  );
}
