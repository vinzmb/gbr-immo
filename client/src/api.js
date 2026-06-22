// Schmale Fetch-Hülle für die API.
const BASIS = '/api';

async function req(pfad, opt = {}) {
  const res = await fetch(BASIS + pfad, {
    headers: { 'content-type': 'application/json' },
    ...opt,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.message || j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const api = {
  get: (p) => req(p),
  post: (p, body) => req(p, { method: 'POST', body: JSON.stringify(body) }),
  put: (p, body) => req(p, { method: 'PUT', body: JSON.stringify(body) }),
  del: (p) => req(p, { method: 'DELETE' }),
};

// Hilfsfunktionen Formatierung
export const fmtEuro = (cent) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((cent || 0) / 100);

export const fmtProzent = (q) =>
  new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(q || 0);

export const fmtDatum = (s) => {
  if (!s) return '';
  const d = s.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : s;
};

// Euro-String -> Cent
export const euroZuCent = (s) => {
  if (s == null || s === '') return 0;
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
