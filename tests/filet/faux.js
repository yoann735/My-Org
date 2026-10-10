// Faux GitHub (API Git Data + contents) et faux Supabase (PostgREST + liste du Storage) EN MÉMOIRE,
// injectés via `fetchFn` : tests de la copie quotidienne sans réseau.
import { createHash } from 'node:crypto';

const rep = (status, obj) => ({ ok: status < 400, status, text: async () => (obj == null ? '' : JSON.stringify(obj)), json: async () => obj });
const sha1 = (s) => createHash('sha1').update(s).digest('hex');

export function fauxGithub(depot = 'moi/medrevise-backups-test') {
  const objets = new Map(); // sha → { type, ... }
  const refs = new Map(); // 'heads/main' → sha
  let horloge = Date.UTC(2026, 9, 11, 1, 30);
  const blobSha = (texte) => { const b = Buffer.from(texte, 'utf8'); return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex'); };
  const arbreComplet = (sha) => { const t = objets.get(sha); return t ? t.entrees : []; };
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url); const m = init.method || 'GET';
    const base = `/repos/${depot}`;
    if (!u.pathname.startsWith(base)) return rep(404, { message: 'Not Found' });
    const p = u.pathname.slice(base.length);
    const corps = init.body ? JSON.parse(init.body) : null;
    if (m === 'GET' && p === '/git/ref/heads/main') return refs.has('heads/main') ? rep(200, { object: { sha: refs.get('heads/main') } }) : rep(409, { message: 'Git Repository is empty.' });
    if (m === 'PUT' && p.startsWith('/contents/')) {
      const contenu = Buffer.from(corps.content, 'base64').toString('utf8'); const b = blobSha(contenu); objets.set(b, { type: 'blob', contenu });
      const t = sha1('tree' + b); objets.set(t, { type: 'tree', entrees: [{ path: p.slice('/contents/'.length), sha: b, type: 'blob' }] });
      const c = sha1('commit' + t + horloge); objets.set(c, { type: 'commit', tree: t, parents: [], message: corps.message, date: new Date(horloge).toISOString() });
      refs.set('heads/main', c); return rep(201, { commit: { sha: c } });
    }
    let mm;
    if (m === 'GET' && (mm = /^\/git\/commits\/(\w+)$/.exec(p))) { const c = objets.get(mm[1]); return rep(200, { sha: mm[1], tree: { sha: c.tree } }); }
    if (m === 'GET' && (mm = /^\/git\/trees\/(\w+)$/.exec(p))) return rep(200, { sha: mm[1], tree: arbreComplet(mm[1]) });
    if (m === 'POST' && p === '/git/blobs') { const contenu = Buffer.from(corps.content, 'base64').toString('utf8'); const b = blobSha(contenu); objets.set(b, { type: 'blob', contenu }); return rep(201, { sha: b }); }
    if (m === 'POST' && p === '/git/trees') {
      const entrees = new Map(arbreComplet(corps.base_tree).map((e) => [e.path, e]));
      for (const e of corps.tree) { if (e.sha === null) entrees.delete(e.path); else entrees.set(e.path, { path: e.path, sha: e.sha, type: 'blob' }); }
      const liste = [...entrees.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
      const t = sha1('tree' + JSON.stringify(liste)); objets.set(t, { type: 'tree', entrees: liste }); return rep(201, { sha: t });
    }
    if (m === 'POST' && p === '/git/commits') { horloge += 60000; const c = sha1('commit' + corps.tree + horloge); objets.set(c, { type: 'commit', tree: corps.tree, parents: corps.parents, message: corps.message, date: new Date(horloge).toISOString() }); return rep(201, { sha: c }); }
    if (m === 'PATCH' && p === '/git/refs/heads/main') { refs.set('heads/main', corps.sha); return rep(200, { object: { sha: corps.sha } }); }
    if (m === 'GET' && (mm = /^\/commits\/(\w+)$/.exec(p))) { const c = objets.get(mm[1]); return rep(200, { sha: mm[1], commit: { message: c.message, committer: { date: c.date } } }); }
    if (m === 'GET' && p === '/contents/manifest.json') {
      const c = objets.get(u.searchParams.get('ref')); const e = arbreComplet(c.tree).find((x) => x.path === 'manifest.json');
      return e ? rep(200, { content: Buffer.from(objets.get(e.sha).contenu).toString('base64') }) : rep(404, { message: 'Not Found' });
    }
    return rep(404, { message: 'route inconnue ' + m + ' ' + p });
  };
  const commits = () => { const out = []; let c = refs.get('heads/main'); while (c) { const o = objets.get(c); out.push({ sha: c, ...o }); c = o.parents[0]; } return out; };
  const fichiers = () => { const c = objets.get(refs.get('heads/main')); return Object.fromEntries(arbreComplet(c.tree).map((e) => [e.path, objets.get(e.sha).contenu])); };
  return { fetchFn, commits, fichiers, avancer: (ms) => { horloge += ms; } };
}

export function fauxSupabase(records, { journalAbsent = true, fichiers = [] } = {}) {
  return async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/rest/v1/medrevise_records') {
      const off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit') || 1000);
      const tri = [...records].sort((a, b) => (a.store + '\0' + a.record_id < b.store + '\0' + b.record_id ? -1 : 1));
      return rep(200, tri.slice(off, off + lim));
    }
    if (u.pathname === '/rest/v1/medrevise_review_log') return journalAbsent ? rep(404, { code: 'PGRST205', message: "Could not find the table 'public.medrevise_review_log' in the schema cache" }) : rep(200, []);
    if (u.pathname === '/storage/v1/object/list/medrevise-blobs') {
      const b = JSON.parse(init.body || '{}');
      return rep(200, b.prefix ? [] : fichiers.slice(b.offset || 0, (b.offset || 0) + (b.limit || 1000)).map((f) => ({ name: f.nom, id: 'x' + f.nom, updated_at: '2026-10-01T10:00:00Z', metadata: { size: f.taille, eTag: `"${f.empreinte}"`, mimetype: f.type } })));
    }
    return rep(404, { message: 'inconnu ' + u.pathname });
  };
}

/** routeur : GitHub et Supabase derrière un seul fetchFn */
export const routeur = (gh, sb) => (url, init) => (String(url).includes('api.github.com') ? gh(url, init) : sb(url, init));
