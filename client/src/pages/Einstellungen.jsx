import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, Button, Field, Input, Select, Hinweis, Textarea, Erklaerung } from '../ui.jsx';

export default function Einstellungen() {
  const [m, setM] = useState(null);
  const [meldung, setMeldung] = useState('');
  const [version, setVersion] = useState('');
  const [importMeldung, setImportMeldung] = useState(null);
  const [importLaedt, setImportLaedt] = useState(false);

  useEffect(() => {
    api.get('/mandant').then(setM);
    api.get('/version').then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  const datenExportieren = () => window.open('/api/sync/export', '_blank');

  const datenImportieren = (file) => {
    if (!file) return;
    if (!confirm('Achtung: Beim Import werden alle aktuellen Daten durch den Inhalt der Datei ersetzt. Vorher wird automatisch eine Sicherung angelegt. Fortfahren?')) return;
    const r = new FileReader();
    r.onload = async () => {
      setImportLaedt(true); setImportMeldung(null);
      try {
        const res = await api.post('/sync/import', JSON.parse(r.result));
        if (res.error) setImportMeldung({ ton: 'warn', text: res.error });
        else {
          setImportMeldung({ ton: 'ok', text: `${res.zeilen} Datensätze und ${res.dateien} Dateien importiert. Die App lädt neu …` });
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (e) {
        setImportMeldung({ ton: 'warn', text: 'Die Datei konnte nicht gelesen werden: ' + e.message });
      }
      setImportLaedt(false);
    };
    r.readAsText(file, 'utf-8');
  };
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
          <Field label="Kontenrahmen" hint="Wirkt sich auf neue Buchungen aus; frag im Zweifel deinen Steuerberater, welchen er nutzt." info="Ein Nummernsystem für Buchhaltungskonten. Musst du nicht verstehen – die App wählt die Konten automatisch. Viele Steuerberater nutzen SKR 03, andere SKR 04.">
            <Select value={m.kontenrahmen} onChange={(e) => setM({ ...m, kontenrahmen: e.target.value })}>
              <option value="skr04">SKR 04</option>
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

      <Card title="Daten sichern & an andere weitergeben" subtitle="Für Sicherungen und das Arbeiten zu mehreren">
        <div className="space-y-4">
          <Erklaerung titel="Wie arbeitet ihr zu mehreren?">
            <p>So gebt ihr den Stand sicher weiter, ohne dass etwas durcheinandergerät:</p>
            <p><strong>1.</strong> Wer fertig ist, klickt <strong>„Daten exportieren“</strong> – es entsteht eine Datei (Endung <code>.gbr</code>).</p>
            <p><strong>2.</strong> Diese Datei schickst du dem Nächsten (z. B. per E-Mail oder USB-Stick).</p>
            <p><strong>3.</strong> Der Nächste wählt sie unter <strong>„Daten importieren“</strong> aus und arbeitet weiter.</p>
            <p>Es arbeitet also immer nur eine Person zur Zeit am Stand – so kann nichts kollidieren. Die Datei enthält alles: Buchungen, Belege, Dokumente.</p>
          </Erklaerung>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={datenExportieren}>📤 Daten exportieren (Sicherung)</Button>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 cursor-pointer">
              📥 Daten importieren
              <input type="file" accept=".gbr,.json" className="hidden" onChange={(e) => datenImportieren(e.target.files[0])} disabled={importLaedt} />
            </label>
          </div>
          <Hinweis ton="warn">Beim Import werden die aktuellen Daten <strong>ersetzt</strong> (vorher wird automatisch eine Sicherung im Ordner <code>daten/backups</code> angelegt).</Hinweis>
          {importMeldung && <Hinweis ton={importMeldung.ton}>{importMeldung.text}</Hinweis>}
        </div>
      </Card>

      <Card title="Version & Updates">
        <div className="space-y-3">
          <div className="text-sm text-slate-600">Installierte Version: <strong className="text-slate-800">{version || '…'}</strong></div>
          <Erklaerung titel="Wie aktualisiere ich die App?">
            <p><strong>1.</strong> Sichere zur Sicherheit kurz deine Daten (Knopf oben).</p>
            <p><strong>2.</strong> Lade die neue Version herunter und entpacke sie.</p>
            <p><strong>3.</strong> Ersetze die Programmdateien – <strong>aber behalte den Ordner <code>daten/</code></strong> (darin liegen alle deine Eingaben).</p>
            <p><strong>4.</strong> Führe einmal <strong><code>update.bat</code></strong> aus und starte dann wie gewohnt mit <code>start.bat</code>.</p>
            <p>Deine Daten bleiben dabei erhalten; nötige Anpassungen an der Datenbank macht die App beim Start automatisch.</p>
          </Erklaerung>
        </div>
      </Card>
    </div>
  );
}
