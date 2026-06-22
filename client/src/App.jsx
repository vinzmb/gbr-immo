import React, { useState, useEffect } from 'react';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Stammdaten from './pages/Stammdaten.jsx';
import Belege from './pages/Belege.jsx';
import Buchen from './pages/Buchen.jsx';
import Bank from './pages/Bank.jsx';
import Ustva from './pages/Ustva.jsx';
import Dokumente from './pages/Dokumente.jsx';
import Nebenkosten from './pages/Nebenkosten.jsx';
import Einstellungen from './pages/Einstellungen.jsx';
import Hilfe from './pages/Hilfe.jsx';
import Assistent from './pages/Assistent.jsx';
import SetupWizard from './components/SetupWizard.jsx';

const NAV = [
  { id: 'dashboard', label: 'Übersicht', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { id: 'assistent', label: 'Assistent', icon: 'M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z' },
  { id: 'stammdaten', label: 'Objekte & Mieter', icon: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6' },
  { id: 'belege', label: 'Belege', icon: 'M7 3h7l5 5v13H7zM14 3v5h5' },
  { id: 'buchen', label: 'Buchen', icon: 'M4 6h16M4 12h16M4 18h10' },
  { id: 'bank', label: 'Bank', icon: 'M3 10l9-6 9 6M5 10v8h14v-8M3 18h18' },
  { id: 'ustva', label: 'USt-Voranmeldung', icon: 'M9 7h6M9 11h6M9 15h4M5 3h14v18H5z' },
  { id: 'nebenkosten', label: 'Nebenkosten', icon: 'M3 13h2l2 5 3-12 3 9 2-5h6' },
  { id: 'dokumente', label: 'Dokumente', icon: 'M6 2h9l5 5v15H6zM15 2v5h5' },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2m12 0h2M12 4v2m0 12v2' },
  { id: 'hilfe', label: 'Hilfe & Lexikon', icon: 'M12 17h.01M12 13a2 2 0 10-2-2M12 21a9 9 0 110-18 9 9 0 010 18z' },
];

export default function App() {
  const [seite, setSeite] = useState('dashboard');
  const [seitenArg, setSeitenArg] = useState(null);
  const [setupOffen, setSetupOffen] = useState(false);

  // Beim ersten Start automatisch den Einrichtungs-Assistenten anbieten.
  useEffect(() => {
    api.get('/dashboard').then((d) => {
      if (d.objekte === 0 && !localStorage.getItem('setupErledigt')) setSetupOffen(true);
    }).catch(() => {});
  }, []);

  const gehe = (id, arg = null) => { setSeite(id); setSeitenArg(arg); };
  const oeffneSetup = () => setSetupOffen(true);
  const schliesseSetup = () => { localStorage.setItem('setupErledigt', '1'); setSetupOffen(false); };

  const seiten = {
    dashboard: <Dashboard gehe={gehe} />,
    assistent: <Assistent gehe={gehe} startModus={seitenArg} oeffneSetup={oeffneSetup} />,
    stammdaten: <Stammdaten />,
    belege: <Belege />,
    buchen: <Buchen />,
    bank: <Bank />,
    ustva: <Ustva />,
    nebenkosten: <Nebenkosten />,
    dokumente: <Dokumente />,
    einstellungen: <Einstellungen />,
    hilfe: <Hilfe />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 shrink-0 bg-slate-900 text-slate-300 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold">GB</div>
            <div>
              <div className="text-white font-semibold leading-tight">GBR-Immo</div>
              <div className="text-xs text-slate-400">Immobilien &amp; Finanzen</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => gehe(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                seite === n.id ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={n.icon} />
              </svg>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-slate-500 border-t border-slate-800">
          Lokal &amp; privat · Daten bleiben auf diesem PC
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{seiten[seite]}</div>
      </main>

      {setupOffen && (
        <SetupWizard onClose={schliesseSetup} onFertig={schliesseSetup} gehe={gehe} />
      )}
    </div>
  );
}
