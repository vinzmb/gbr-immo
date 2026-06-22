import React, { useEffect, useState } from 'react';
import { api, fmtEuro, fmtProzent } from '../api.js';
import { StatCard, Card, Hinweis, Button } from '../ui.jsx';

export default function Dashboard({ gehe }) {
  const [d, setD] = useState(null);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setD).catch((e) => setFehler(e.message));
  }, []);

  if (fehler) return <Hinweis ton="warn">Fehler beim Laden: {fehler}</Hinweis>;
  if (!d) return <div className="text-slate-400">Lädt …</div>;

  const u = d.aktuelleUstva;
  const leer = d.objekte === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Übersicht</h1>
        <p className="text-slate-500 mt-1">{d.mandant.name || 'Grundstücks-GbR'}</p>
      </header>

      {leer && (
        <Hinweis ton="info">
          <strong>Willkommen!</strong> Lege zuerst dein Objekt mit den Mieteinheiten und Flächen an —
          danach kannst du Belege erfassen, Bankumsätze importieren und die USt-Voranmeldung erstellen.
          <div className="mt-3">
            <Button onClick={() => gehe('stammdaten')}>Jetzt einrichten →</Button>
          </div>
        </Hinweis>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Objekte" wert={d.objekte} />
        <StatCard label="Mieteinheiten" wert={d.einheiten} />
        <StatCard label="Offene Belege" wert={d.belege_offen} ton={d.belege_offen ? 'amber' : 'slate'} />
        <StatCard label="Offene Bankumsätze" wert={d.bank_offen} ton={d.bank_offen ? 'amber' : 'slate'} />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card title={`USt-Voranmeldung ${u.periode}`} subtitle="aktueller Zeitraum (Vorschau)" className="md:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Kennzahl label="Umsätze 19 % (netto)" wert={fmtEuro(u.kz81)} />
            <Kennzahl label="Umsätze 7 % (netto)" wert={fmtEuro(u.kz86)} />
            <Kennzahl label="USt (19 % + 7 %)" wert={fmtEuro(u.ust_19 + u.ust_7)} />
            <Kennzahl label="Vorsteuer" wert={fmtEuro(u.kz66)} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">{u.kz83 >= 0 ? 'Voraussichtliche Zahllast' : 'Voraussichtliche Erstattung'}</div>
              <div className={`text-2xl font-bold ${u.kz83 >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmtEuro(Math.abs(u.kz83))}
              </div>
            </div>
            <Button variant="ghost" onClick={() => gehe('ustva')}>Zur Voranmeldung →</Button>
          </div>
        </Card>

        <Card title="Vorsteuerquote" subtitle="nach Flächenschlüssel">
          <div className="text-3xl font-bold text-slate-800">{fmtProzent(d.quote)}</div>
          <p className="text-sm text-slate-500 mt-2">
            Anteil der steuerpflichtig vermieteten Fläche an der Gesamtfläche. So viel der Vorsteuer
            aus Gemeinkosten ist abziehbar.
          </p>
        </Card>
      </div>

      <Card title="Schnellzugriff">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Schnell label="Beleg erfassen" onClick={() => gehe('belege')} />
          <Schnell label="Buchung anlegen" onClick={() => gehe('buchen')} />
          <Schnell label="Bankumsätze importieren" onClick={() => gehe('bank')} />
          <Schnell label="DATEV-Export" onClick={() => gehe('ustva')} />
        </div>
      </Card>
    </div>
  );
}

function Kennzahl({ label, wert }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800 tabular-nums">{wert}</div>
    </div>
  );
}

function Schnell({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors text-sm font-medium text-slate-700"
    >
      {label}
    </button>
  );
}
