// Auto-Update über GitHub Releases (browserbasierte App).

/** Vergleicht zwei Versionsstrings ("1.2.0"). -1 a<b, 0 gleich, 1 a>b. */
export function versionVergleich(a, b) {
  const teile = (s) => String(s).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const x = teile(a);
  const y = teile(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Prüft, ob auf GitHub eine neuere Version vorliegt.
 * @param {object} p { repo:'owner/name', token?, aktuelleVersion }
 */
export async function pruefeUpdate({ repo, token, aktuelleVersion }) {
  if (!repo || !repo.includes('/')) return { error: 'Keine gültige Update-Quelle hinterlegt (Format: benutzer/projekt).' };
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'GBR-Immo-Updater' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (res.status === 404) return { error: 'Keine Veröffentlichung gefunden (noch kein Release im Repo?).' };
  if (!res.ok) return { error: `GitHub-Fehler ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const r = await res.json();

  const neueste = (r.tag_name || r.name || '0.0.0').replace(/^v/, '');
  const zip = (r.assets || []).find((a) => /\.zip$/i.test(a.name));
  return {
    aktuell: aktuelleVersion,
    neueste,
    updateVerfuegbar: versionVergleich(neueste, aktuelleVersion) > 0,
    name: r.name || neueste,
    notiz: (r.body || '').slice(0, 1000),
    seite: r.html_url || '',
    asset: zip ? { name: zip.name, url: zip.browser_download_url } : null,
  };
}
