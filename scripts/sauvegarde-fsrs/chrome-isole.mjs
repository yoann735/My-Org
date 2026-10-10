// Chrome headless ISOLÉ pour lire / restaurer l'IndexedDB de MedRevise sans jamais exécuter l'app.
// - aucun réseau : --host-resolver-rules bloque toute résolution DNS ;
// - l'origine https://my-org-blue.vercel.app reçoit une page VIDE servie par interception CDP
//   (Fetch), toute autre requête est refusée : le code de l'app ne tourne jamais, donc ni synchro
//   ni migration ;
// - profil dédié (--user-data-dir) : jamais le profil réel d'Aside ou de Chrome.
import { spawn } from 'node:child_process';

// origine restaurée : l'app déployée par défaut ; ORIGINE=http://localhost:5199 pour un banc de test local
export const ORIGINE = process.env.ORIGINE || 'https://my-org-blue.vercel.app';
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ouvrirChromeIsole(profil, port = 9361) {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`,
    '--host-resolver-rules=MAP * ~NOTFOUND', '--no-first-run', '--disable-background-networking',
    '--disable-sync', '--disable-extensions', '--remote-allow-origins=*', 'about:blank'], { stdio: 'ignore' });
  let cible;
  for (let i = 0; i < 60 && !cible; i++) {
    await attendre(250);
    try { cible = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  if (!cible) { chrome.kill(); throw new Error('Chrome headless injoignable sur le port ' + port); }
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let n = 0; const att = new Map();
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++n; att.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const bloquees = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') {
      const p = m.params;
      if (p.resourceType === 'Document' && p.request.url.startsWith(ORIGINE + '/')) {
        cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<!doctype html><title>sauvegarde hors ligne</title>').toString('base64') });
      } else { bloquees.push(p.request.url); cdp('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }); }
    }
  });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: ORIGINE + '/sauvegarde-hors-ligne' });
  await attendre(1500);
  /** évalue une expression (promesse attendue) dans la page vide de l'origine, renvoie la valeur */
  const evaluer = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 500));
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result.result.value;
  };
  const fermer = async () => { try { ws.close(); } catch {} chrome.kill(); await attendre(500); };
  return { evaluer, fermer, bloquees, cdp };
}

/* Sérialisation sans perte des valeurs IndexedDB (clone structuré → JSON) : Blob/File, ArrayBuffer,
   vues typées, Date, undefined. Un objet qui aurait lui-même une clé « __t » est enveloppé. Ce code
   tourne DANS la page (chaîne injectée). */
export const SERIALISEUR_PAGE = `
const __b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const __debin = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
async function __ser(v) {
  if (v === undefined) return { __t: 'undef' };
  if (v === null || typeof v !== 'object') return v;
  if (typeof File !== 'undefined' && v instanceof File) return { __t: 'file', name: v.name, type: v.type, lastModified: v.lastModified, b64: __b64(await v.arrayBuffer()) };
  if (v instanceof Blob) return { __t: 'blob', type: v.type, b64: __b64(await v.arrayBuffer()) };
  if (v instanceof ArrayBuffer) return { __t: 'ab', b64: __b64(v) };
  if (ArrayBuffer.isView(v)) return { __t: 'ta', kind: v.constructor.name, b64: __b64(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
  if (v instanceof Date) return { __t: 'date', v: isNaN(v) ? null : v.toISOString() };
  if (v instanceof Map) return { __t: 'map', v: await Promise.all([...v.entries()].map(async ([k, x]) => [await __ser(k), await __ser(x)])) };
  if (v instanceof Set) return { __t: 'set', v: await Promise.all([...v].map(__ser)) };
  if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await __ser(x)); return o; }
  const o = {};
  for (const k of Object.keys(v)) o[k] = await __ser(v[k]);
  return Object.prototype.hasOwnProperty.call(v, '__t') ? { __t: 'obj', v: o } : o;
}
function __deser(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(__deser);
  switch (v.__t) {
    case 'undef': return undefined;
    case 'file': return new File([__debin(v.b64)], v.name, { type: v.type, lastModified: v.lastModified });
    case 'blob': return new Blob([__debin(v.b64)], { type: v.type });
    case 'ab': return __debin(v.b64).buffer;
    case 'ta': { const u = __debin(v.b64); return new (globalThis[v.kind] || Uint8Array)(u.buffer); }
    case 'date': return new Date(v.v);
    case 'map': return new Map(v.v.map(([k, x]) => [__deser(k), __deser(x)]));
    case 'set': return new Set(v.v.map(__deser));
    case 'obj': { const o = {}; for (const k of Object.keys(v.v)) o[k] = __deser(v.v[k]); return o; }
    default: { const o = {}; for (const k of Object.keys(v)) o[k] = __deser(v[k]); return o; }
  }
}
`;
