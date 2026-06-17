/*
 * sync.js — free cross-device cloud sync via a PRIVATE GitHub Gist.
 *
 * The user pastes a GitHub token (scope: gist) once per device. The whole app
 * state (settings, presets, months, translation cache) lives in one private gist
 * file. Token + gist id are stored ONLY in this browser's localStorage.
 *
 * Merge strategy (avoids clobbering across devices): months are merged per-month
 * by their `_u` timestamp; the translation cache is unioned; settings/presets take
 * the newer whole-payload. Sequential device use never loses data; concurrent edits
 * to the SAME month fall back to newest-wins.
 */
const Sync = (() => {
  const KEY = 'kinmu.gh';          // { token, gistId }
  const FILE = 'kinmu-report-data.json';
  const DESC = 'kinmu-report sync — jangan hapus';

  const cfg = () => Store.get(KEY, {});
  const setCfg = (c) => Store.set(KEY, c);
  const hasToken = () => !!cfg().token;
  const configured = () => { const c = cfg(); return !!(c.token && c.gistId); };
  const clear = () => Store.set(KEY, {});
  const gistId = () => cfg().gistId;

  function headers(token) {
    return {
      'Authorization': 'Bearer ' + (token || cfg().token),
      'Accept': 'application/vnd.github+json',
    };
  }
  async function api(path, opts, token) {
    const r = await fetch('https://api.github.com' + path, Object.assign({ headers: headers(token) }, opts || {}));
    if (r.status === 401) throw new Error('Token GitHub tidak valid / kedaluwarsa');
    if (r.status === 403) throw new Error('Akses ditolak (cek scope token = gist)');
    if (r.status === 404) throw new Error('Gist tidak ditemukan');
    if (!r.ok) throw new Error('GitHub API error ' + r.status);
    return r.json();
  }

  // Validate token, reuse an existing kinmu gist if present, else create one.
  async function connect(token) {
    token = (token || '').trim();
    if (!token) throw new Error('Token kosong');
    const list = await api('/gists?per_page=100', { method: 'GET' }, token);
    const existing = Array.isArray(list) ? list.find((g) => g.files && g.files[FILE]) : null;
    let id;
    if (existing) {
      id = existing.id;
    } else {
      const created = await api('/gists', {
        method: 'POST',
        body: JSON.stringify({ description: DESC, public: false,
          files: { [FILE]: { content: JSON.stringify({ _app: 'kinmu-report', _v: 1, updatedAt: 0 }) } } }),
      }, token);
      id = created.id;
    }
    setCfg({ token, gistId: id });
    return id;
  }

  async function pull() {
    const c = cfg();
    if (!c.token || !c.gistId) return null;
    const g = await api('/gists/' + c.gistId, { method: 'GET' });
    const f = g.files && g.files[FILE];
    if (!f) return null;
    let content = f.content;
    if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
    try { return JSON.parse(content); } catch (e) { return null; }
  }

  async function push(data) {
    const c = cfg();
    if (!c.token || !c.gistId) throw new Error('Belum terhubung');
    await api('/gists/' + c.gistId, {
      method: 'PATCH',
      body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(data) } } }),
    });
  }

  return { cfg, setCfg, hasToken, configured, clear, gistId, connect, pull, push, FILE };
})();
