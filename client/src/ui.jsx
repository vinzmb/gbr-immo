// Wiederverwendbare UI-Komponenten im einheitlichen Stil.
import React from 'react';

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            {title && <h3 className="font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
    danger: 'bg-white hover:bg-red-50 text-red-600 border border-red-200',
    subtle: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
  };
  return (
    <button
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint, info }) {
  return (
    <label className="block">
      {label && (
        <span className="flex items-center text-sm font-medium text-slate-600 mb-1">
          {label}
          {info && <InfoTip text={info} />}
        </span>
      )}
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

// Kleines Fragezeichen mit Erklärung beim Überfahren — für Fachbegriffe.
export function InfoTip({ text }) {
  return (
    <span className="relative inline-flex group align-middle">
      <span className="ml-1.5 w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center cursor-help select-none">?</span>
      <span className="pointer-events-none invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-64 bg-slate-800 text-white text-xs leading-relaxed rounded-lg px-3 py-2 shadow-lg font-normal normal-case">
        {text}
      </span>
    </span>
  );
}

// Einklappbarer Erklärkasten ("Was passiert hier?") in einfacher Sprache.
export function Erklaerung({ titel = 'Was passiert hier?', children }) {
  return (
    <details className="bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3 text-sm group">
      <summary className="font-medium text-blue-900 cursor-pointer flex items-center gap-2 list-none">
        <span className="text-blue-500">ℹ️</span> {titel}
        <span className="ml-auto text-blue-400 text-xs group-open:hidden">anzeigen</span>
      </summary>
      <div className="mt-2 space-y-1.5 text-blue-800 leading-relaxed">{children}</div>
    </details>
  );
}

const inputBase =
  'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500';

export function Input(props) {
  return <input className={inputBase} {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className={inputBase} {...props}>
      {children}
    </select>
  );
}

export function Textarea(props) {
  return <textarea className={`${inputBase} min-h-20`} {...props} />;
}

export function Badge({ children, color = 'slate' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}

export function Table({ columns, rows, leer = 'Keine Einträge vorhanden.' }) {
  return (
    <div className="overflow-x-auto -mx-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-100">
            {columns.map((c, i) => (
              <th key={i} className={`px-5 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.kopf}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-slate-400">
                {leer}
              </td>
            </tr>
          ) : (
            rows.map((r, ri) => (
              <tr key={ri} className="border-b border-slate-50 hover:bg-slate-50/60">
                {columns.map((c, ci) => (
                  <td key={ci} className={`px-5 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                    {c.zelle(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ titel, offen, onClose, children, breit }) {
  if (!offen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${breit ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">{titel}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Hinweis({ children, ton = 'info' }) {
  const toene = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };
  return <div className={`text-sm rounded-xl border px-4 py-3 ${toene[ton]}`}>{children}</div>;
}

export function StatCard({ label, wert, sub, ton = 'slate' }) {
  const toene = {
    slate: 'text-slate-800',
    green: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toene[ton]}`}>{wert}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
