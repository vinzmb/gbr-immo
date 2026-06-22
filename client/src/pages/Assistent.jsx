import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtDatum } from '../api.js';
import { Card, Button, Field, Input, Select, Badge, Hinweis } from '../ui.jsx';

export default function Assistent({ gehe, startModus, oeffneSetup }) {
  const [modus, setModus] = useState(startModus || 'hub');
  useEffect(() => { if (startModus) setModus(startModus); }, [startModus]);

  if (modus === 'stapel') return <Buchungsstapel zurueck={() => setModus('hub')} gehe={gehe} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Assistent</h1>
        <p className="text-slate-500 mt-1">Geführte Einrichtung und Abarbeitung der offenen Buchungen</p>
      </header>
      <div className="grid md:grid-cols-2 gap-6">
        <HubKarte
          titel="Ersteinrichtung"
          text="Richte GbR-Daten, dein Objekt, die Mieteinheiten mit Flächen und USt-Status sowie Mieter Schritt für Schritt ein."
          knopf="Einrichtung starten"
          onClick={oeffneSetup}
          icon="M4 21V7l8-4 8 4v14M9 21v-6h6v6"
        />
        <HubKarte
          titel="Buchungsstapel abarbeiten"
          text="Gehe offene Bankumsätze und Belege einzeln durch — mit Buchungsvorschlag (optional per KI), bestätigen und weiter."
          knopf="Stapel starten"
          onClick={() => setModus('stapel')}
          icon="M4 6h16M4 12h16M4 18h10"
        />
      </div>
    </div>
  );
}

function HubKarte({ titel, text, knopf, onClick, icon }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
      <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </div>
      <h3 className="font-semibold text-slate-800 text-lg">{titel}</h3>
      <p className="text-sm text-slate-500 mt-1 flex-1">{text}</p>
      <div className="mt-4"><Button onClick={onClick}>{knopf} →</Button></div>
    </div>
  );
}

// ---------- Buchungsstapel ----------
function Buchungsstapel({ zurueck, gehe }) {
  const [queue, setQueue] = useState(null);
  const [idx, setIdx] = useState(0);
  const [konten, setKonten] = useState([]);
  const [einheiten, setEinheiten] = useState([]);
  const [objekte, setObjekte] = useState([]);
  const [kiAktiv, setKiAktiv] = useState(false);
  const [form, setForm] = useState(null);
  const [kiLaedt, setKiLaedt] = useState(false);
  const [kiFehler, setKiFehler] = useState('');
  const [matches, setMatches] = useState([]);
  const [verbrauchteBelege, setVerbrauchteBelege] = useState([]);
  const [zaehler, setZaehler] = useState({ gebucht: 0, uebersprungen: 0, ignoriert: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/bank/umsaetze?status=offen'),
      api.get('/belege'),
      api.get('/konten'),
      api.get('/einheiten'),
      api.get('/objekte'),
      api.get('/mandant'),
    ]).then(([bank, belege, k, e, o, m]) => {
      const offeneBelege = belege.filter((b) => b.status !== 'gebucht');
      const q = [
        ...bank.map((b) => ({ kind: 'bank', data: b })),
        ...offeneBelege.map((b) => ({ kind: 'beleg', data: b })),
      ];
      setQueue(q); setKonten(k); setEinheiten(e); setObjekte(o); setKiAktiv(!!m.ki_aktiv);
    });
  }, []);

  // Formular für aktuelles Element vorbereiten
  useEffect(() => {
    if (!queue || idx >= queue.length) return;
    const it = queue[idx];
    // Bereits über ein Bank-Match mitgebuchten Beleg automatisch überspringen.
    if (it.kind === 'beleg' && verbrauchteBelege.includes(it.data.id)) { setIdx((i) => i + 1); return; }
    const einnahme = it.kind === 'bank' ? it.data.betrag >= 0 : it.data.art === 'ausgang';
    setForm({
      typ: einnahme ? 'einnahme' : 'ausgabe',
      ust_satz: '19', konto: '',
      aufteilung_modus: einnahme ? 'direkt' : 'flaeche',
      einheit_id: '', objekt_id: '', beleg_id: null,
    });
    setKiFehler('');
    setMatches([]);
    if (it.kind === 'bank') {
      api.get(`/bank/umsaetze/${it.data.id}/matches`).then((m) => setMatches(m.filter((x) => !verbrauchteBelege.includes(x.beleg.id)))).catch(() => {});
    }
  }, [queue, idx, verbrauchteBelege]);

  if (!queue) return <div className="text-slate-400">Lädt …</div>;

  const fertig = idx >= queue.length;
  if (fertig) {
    return (
      <div className="space-y-6">
        <header><h1 className="text-2xl font-bold text-slate-800">Buchungsstapel</h1></header>
        <Card>
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto">✓</div>
            <h3 className="text-xl font-bold text-slate-800">Stapel abgearbeitet</h3>
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              <Zus label="Gebucht" wert={zaehler.gebucht} />
              <Zus label="Übersprungen" wert={zaehler.uebersprungen} />
              <Zus label="Ignoriert" wert={zaehler.ignoriert} />
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="ghost" onClick={() => gehe('dashboard')}>Zur Übersicht</Button>
              <Button onClick={() => gehe('ustva')}>Zur USt-Voranmeldung →</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const it = queue[idx];
  const d = it.data;
  const einnahme = form?.typ === 'einnahme';
  const kontenGefiltert = konten.filter((k) => (einnahme ? k.art === 'erloes' : k.art === 'aufwand'));
  const betrag = it.kind === 'bank' ? Math.abs(d.betrag) : d.betrag_brutto;

  const weiter = (statusFeld) => {
    setZaehler((z) => ({ ...z, [statusFeld]: z[statusFeld] + 1 }));
    setIdx((i) => i + 1);
  };

  const buchen = async () => {
    const konto = form.konto || (kontenGefiltert[0]?.nummer ?? '');
    if (it.kind === 'bank') {
      await api.post(`/bank/umsaetze/${d.id}/verbuchen`, {
        ust_satz: form.ust_satz, konto,
        aufteilung_modus: einnahme ? 'direkt' : form.aufteilung_modus,
        einheit_id: form.einheit_id ? Number(form.einheit_id) : null,
        objekt_id: form.objekt_id ? Number(form.objekt_id) : null,
        beleg_id: form.beleg_id || null,
      });
      if (form.beleg_id) setVerbrauchteBelege((v) => [...v, form.beleg_id]);
    } else {
      await api.post('/buchungen', {
        typ: form.typ, datum: d.datum, beleg_id: d.id, betrag_brutto: d.betrag_brutto,
        ust_satz: form.ust_satz, konto, gegenkonto: '1800',
        aufteilung_modus: einnahme ? 'direkt' : form.aufteilung_modus,
        einheit_id: form.einheit_id ? Number(form.einheit_id) : null,
        objekt_id: form.objekt_id ? Number(form.objekt_id) : null,
        buchungstext: d.beschreibung || d.partner || '',
      });
    }
    weiter('gebucht');
  };

  const ignorieren = async () => {
    if (it.kind === 'bank') await api.put(`/bank/umsaetze/${d.id}`, { status: 'ignoriert' });
    weiter('ignoriert');
  };

  const kiVorschlag = async () => {
    setKiLaedt(true); setKiFehler('');
    try {
      const text = it.kind === 'bank'
        ? `${d.gegenpartei} ${d.verwendungszweck} Betrag ${(d.betrag / 100).toFixed(2)} EUR Datum ${d.datum}`
        : `${d.partner} ${d.beschreibung} Betrag ${(d.betrag_brutto / 100).toFixed(2)} EUR Datum ${d.datum}`;
      const v = await api.post('/ki/beleg', { text, art: einnahme ? 'ausgang' : 'eingang' });
      if (v.error) setKiFehler(v.error);
      else setForm((f) => ({
        ...f,
        ust_satz: v.ust_satz || f.ust_satz,
        konto: v.konto || f.konto,
        aufteilung_modus: v.aufteilung_modus || f.aufteilung_modus,
        einheit_id: v.einheit_id || f.einheit_id,
      }));
    } catch (e) { setKiFehler(e.message); }
    setKiLaedt(false);
  };

  if (!form) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Buchungsstapel</h1>
          <p className="text-slate-500 mt-1">Position {idx + 1} von {queue.length}</p>
        </div>
        <Button variant="ghost" onClick={zurueck}>Beenden</Button>
      </header>

      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Beleg-/Umsatzkarte */}
        <Card title={it.kind === 'bank' ? 'Bankumsatz' : 'Beleg'}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge color={it.kind === 'bank' ? 'blue' : 'slate'}>{it.kind === 'bank' ? 'Konto' : (d.art === 'ausgang' ? 'Ausgang' : 'Eingang')}</Badge>
              <span className={`text-2xl font-bold tabular-nums ${einnahme ? 'text-emerald-600' : 'text-slate-800'}`}>{fmtEuro(betrag)}</span>
            </div>
            <Detail label="Datum" wert={fmtDatum(d.datum)} />
            <Detail label={it.kind === 'bank' ? 'Gegenpartei' : 'Partner'} wert={(it.kind === 'bank' ? d.gegenpartei : d.partner) || '–'} />
            <Detail label={it.kind === 'bank' ? 'Verwendungszweck' : 'Beschreibung'} wert={(it.kind === 'bank' ? d.verwendungszweck : d.beschreibung) || '–'} />
            {it.kind === 'beleg' && d.datei_pfad && (
              <a className="text-sm text-emerald-600 hover:underline" href={`/api/belege/${d.id}/datei`} target="_blank" rel="noreferrer">Belegdatei öffnen</a>
            )}

            {it.kind === 'bank' && matches.length > 0 && (
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                  <span>🔗</span> Passender Beleg gefunden
                </div>
                {matches.map((m) => (
                  <div key={m.beleg.id} className="flex items-center justify-between bg-white rounded-lg border border-emerald-100 px-3 py-2">
                    <div className="text-sm">
                      <div className="font-medium text-slate-800">{m.beleg.partner || m.beleg.beschreibung || 'Beleg'} · {fmtEuro(m.beleg.betrag_brutto)}</div>
                      <div className="text-xs text-slate-500">{fmtDatum(m.beleg.datum)} · {m.gruende.join(', ')} · {m.score}%</div>
                    </div>
                    <button
                      onClick={() => setForm((f) => ({ ...f, beleg_id: f.beleg_id === m.beleg.id ? null : m.beleg.id }))}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg ${form.beleg_id === m.beleg.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      {form.beleg_id === m.beleg.id ? 'verknüpft ✓' : 'Übernehmen'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Buchungsvorschlag */}
        <Card title="Buchungsvorschlag" actions={kiAktiv ? <Button variant="subtle" onClick={kiVorschlag} disabled={kiLaedt}>{kiLaedt ? 'KI …' : '✨ KI-Vorschlag'}</Button> : null}>
          <div className="space-y-4">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {['ausgabe', 'einnahme'].map((t) => (
                <button key={t} onClick={() => setForm({ ...form, typ: t, aufteilung_modus: t === 'einnahme' ? 'direkt' : 'flaeche', konto: '' })}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${form.typ === t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                  {t === 'ausgabe' ? 'Ausgabe' : 'Einnahme'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="USt-Satz"><Select value={form.ust_satz} onChange={(e) => setForm({ ...form, ust_satz: e.target.value })}><option value="19">19 %</option><option value="7">7 %</option><option value="frei">steuerfrei</option></Select></Field>
              <Field label="Konto"><Select value={form.konto} onChange={(e) => setForm({ ...form, konto: e.target.value })}><option value="">— wählen —</option>{kontenGefiltert.map((k) => <option key={k.id} value={k.nummer}>{k.nummer} · {k.bezeichnung}</option>)}</Select></Field>
            </div>
            {einnahme ? (
              <Field label="Einheit"><Select value={form.einheit_id} onChange={(e) => setForm({ ...form, einheit_id: e.target.value })}><option value="">— wählen —</option>{einheiten.map((e2) => <option key={e2.id} value={e2.id}>{e2.bezeichnung}</option>)}</Select></Field>
            ) : (
              <>
                <Field label="Aufteilung"><Select value={form.aufteilung_modus} onChange={(e) => setForm({ ...form, aufteilung_modus: e.target.value })}><option value="flaeche">Flächenschlüssel</option><option value="direkt">Direkt einer Einheit</option><option value="umsatz">Umsatzschlüssel</option><option value="anteil">Miteigentumsanteil</option><option value="keine">Keine Aufteilung</option></Select></Field>
                {form.aufteilung_modus === 'direkt' ? (
                  <Field label="Einheit"><Select value={form.einheit_id} onChange={(e) => setForm({ ...form, einheit_id: e.target.value })}><option value="">— wählen —</option>{einheiten.map((e2) => <option key={e2.id} value={e2.id}>{e2.bezeichnung}</option>)}</Select></Field>
                ) : (
                  <Field label="Objekt (für Schlüssel)"><Select value={form.objekt_id} onChange={(e) => setForm({ ...form, objekt_id: e.target.value })}><option value="">Alle Objekte</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
                )}
              </>
            )}
            {kiFehler && <Hinweis ton="warn">{kiFehler}</Hinweis>}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => weiter('uebersprungen')}>Überspringen</Button>
        <div className="flex gap-2">
          {it.kind === 'bank' && <Button variant="danger" onClick={ignorieren}>Ignorieren</Button>}
          <Button onClick={buchen}>Buchen &amp; weiter →</Button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, wert }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-800">{wert}</div>
    </div>
  );
}

function Zus({ label, wert }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-800">{wert}</div>
    </div>
  );
}
