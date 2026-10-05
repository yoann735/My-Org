// OUTIL DE TEST (02/10, docs/mecanique-dessin-mobile.md) — jamais chargé par l'app.
// Faux Supabase local pour tester la synchro SANS toucher au vrai cloud :
//   node scripts/faux-supabase.mjs
//   VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=cle-de-test npx vite --port 5199
// État et journal des requêtes : http://localhost:54399/__etat (en mémoire, perdu à l'arrêt).
// Faux Supabase local (tests uniquement) : RPC medrevise_push (LWW conditionnel),
// lecture de medrevise_records (filtres eq, order, offset/limit ou Range), Storage
// (upload / download / list) du bucket medrevise-blobs. Journal des requêtes.
import http from 'http';
import fs from 'fs';
const rows = new Map(); // store:id → row
const blobs = new Map(); // id → { type, buf }
const journal = [];
let refuses = new Set((process.env.REFUSER_STORES || '').split(',').filter(Boolean));
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Range' };
const lire = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
function multipart(buf, ct) {
  const m = /boundary=(.+)$/.exec(ct || ''); if (!m) return null;
  const b = Buffer.from('--' + m[1]);
  let i = buf.indexOf(b);
  while (i >= 0) {
    const j = buf.indexOf(b, i + b.length); if (j < 0) break;
    const part = buf.slice(i + b.length + 2, j - 2);
    const h = part.indexOf('\r\n\r\n'); const tete = part.slice(0, h).toString();
    if (/filename=|Content-Type:/i.test(tete) && !/name="cacheControl"/.test(tete)) {
      const type = (/Content-Type:\s*([^\r\n]+)/i.exec(tete) || [])[1] || 'application/octet-stream';
      return { type, buf: part.slice(h + 4) };
    }
    i = j;
  }
  return null;
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const body = await lire(req);
  const out = (code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors, ...extra }); res.end(JSON.stringify(obj)); };
  journal.push({ t: new Date().toISOString(), m: req.method, p: u.pathname, q: u.search.slice(0, 160) });
  if (u.pathname === '/__etat') return out(200, { rows: [...rows.values()], blobs: [...blobs.keys()].map((k) => ({ id: k, taille: blobs.get(k).buf.length, type: blobs.get(k).type })), journal: journal.slice(-200) });
  // PANNE INJECTABLE (05/10, transcription) : POST /__refuser?stores=a,b → la RPC refuse
  // tout lot contenant ces stores (comme une contrainte CHECK côté base) ; ?stores= rétablit.
  if (u.pathname === '/__refuser') { refuses = new Set((u.searchParams.get('stores') || '').split(',').filter(Boolean)); return out(200, { refuses: [...refuses] }); }
  if (u.pathname === '/rest/v1/rpc/medrevise_push') {
    const { records } = JSON.parse(body.toString() || '{}'); let n = 0;
    if ((records || []).some((r) => refuses.has(r.store))) return out(400, { code: '23514', message: 'new row violates check constraint (panne simulée)' });
    for (const r of records || []) {
      const k = r.store + ':' + r.record_id, cur = rows.get(k);
      if (!cur || Date.parse(r.updated_at) > Date.parse(cur.updated_at)) { rows.set(k, { store: r.store, record_id: r.record_id, data: r.data || {}, updated_at: r.updated_at, deleted: !!r.deleted }); n++; }
    }
    return out(200, n);
  }
  if (u.pathname === '/rest/v1/medrevise_records' && req.method === 'GET') {
    let liste = [...rows.values()];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'offset', 'limit'].includes(k)) continue;
      if (v.startsWith('eq.')) liste = liste.filter((r) => String(r[k]) === v.slice(3));
      const mIn = /^(not\.)?in\.\((.*)\)$/.exec(v);
      if (mIn) { const vals = mIn[2].split(',').map((x) => x.replace(/^"|"$/g, '')); liste = liste.filter((r) => (mIn[1] ? !vals.includes(String(r[k])) : vals.includes(String(r[k])))); }
    }
    liste.sort((a, b) => (a.store + '\u0000' + a.record_id).localeCompare(b.store + '\u0000' + b.record_id));
    let off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit') || 1e9);
    const rg = /(\d+)-(\d+)/.exec(req.headers['range'] || ''); if (rg) { off = +rg[1]; lim = +rg[2] - off + 1; }
    const page = liste.slice(off, off + lim);
    return out(200, page, { 'Content-Range': `${off}-${off + page.length - 1}/${liste.length}` });
  }
  let m = /^\/storage\/v1\/object\/list\/medrevise-blobs$/.exec(u.pathname);
  if (m) return out(200, [...blobs.keys()].map((name) => ({ name })));
  m = /^\/storage\/v1\/object\/(?:authenticated\/)?medrevise-blobs\/(.+)$/.exec(u.pathname);
  if (m && (req.method === 'POST' || req.method === 'PUT')) {
    const mp = multipart(body, req.headers['content-type']);
    blobs.set(decodeURIComponent(m[1]), mp || { type: req.headers['content-type'] || 'application/octet-stream', buf: body });
    return out(200, { Key: 'medrevise-blobs/' + m[1] });
  }
  if (m && req.method === 'GET') {
    const b = blobs.get(decodeURIComponent(m[1])); if (!b) return out(404, { error: 'not found', statusCode: '404' });
    res.writeHead(200, { 'Content-Type': b.type, ...cors }); return res.end(b.buf);
  }
  out(404, { message: 'route inconnue du faux Supabase : ' + u.pathname });
}).listen(54399, () => console.log('faux Supabase sur :54399'));
