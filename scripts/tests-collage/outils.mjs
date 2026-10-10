// Banc « collage d'image au survol » (11/10) — client CDP minimal : vrais événements souris / clavier /
// toucher, vrai ⌘V (presse-papiers autorisé), modules de l'app (même instance), captures.
// Profil de TEST (copie restaurée de la sauvegarde) + faux Supabase local : jamais le vrai cloud.
import { writeFileSync, mkdirSync } from 'node:fs';

export async function appareil(port = 9335, { largeur = 1440, hauteur = 900, tactile = false, captures = '/tmp/collage' } = {}) {
  const liste = await (await fetch(`http://localhost:${port}/json`)).json();
  const t = liste.find((x) => x.type === 'page' && x.url.includes('5199'));
  await fetch(`http://localhost:${port}/json/activate/${t.id}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const att = new Map(); const erreurs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && att.has(m.id)) { const { ok, ko } = att.get(m.id); att.delete(m.id); m.error ? ko(new Error(JSON.stringify(m.error))) : ok(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((ok, ko) => { const i = ++id; att.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: tactile ? 2 : 1, mobile: tactile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: tactile, maxTouchPoints: tactile ? 5 : 1 });
  await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' }).catch(() => {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const attendre = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await dormir(150); } throw new Error('délai : ' + expr); };
  /** centre d'un élément (CSS px), après scrollIntoView */
  const pos = (js) => ev(`(() => { const e = ${js}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const survoler = async (p) => { if (!p) throw new Error('cible de survol introuvable'); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await dormir(150); };
  const clic = async (p) => { if (!p) throw new Error('cible introuvable'); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 }); await dormir(300); };
  const toucher = async (p) => { if (!p) throw new Error('cible introuvable'); await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await dormir(400); };
  const touche = async (key, { meta = false, code = null, vk = 0, commandes } = {}) => {
    const modifiers = meta ? 4 : 0;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key, windowsVirtualKeyCode: vk, modifiers, ...(commandes ? { commands: commandes } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key, windowsVirtualKeyCode: vk, modifiers });
    await dormir(80);
  };
  const cmdV = () => touche('v', { meta: true, code: 'KeyV', vk: 86, commandes: ['paste'] });
  const cmdZ = () => touche('z', { meta: true, code: 'KeyZ', vk: 90, commandes: ['undo'] });
  const ecrire = async (txt) => { for (const ch of txt) await send('Input.dispatchKeyEvent', { type: 'char', text: ch }); await dormir(60); };
  /** place une IMAGE dans le presse-papiers : canvas `l`×`h`, fond `fond`, texte lisible (pour l'OCR) */
  const pressePapierImage = (l, h, fond, texte) => ev(`(async () => {
    const c = new OffscreenCanvas(${l}, ${h}); const x = c.getContext('2d');
    x.fillStyle = ${JSON.stringify(fond)}; x.fillRect(0, 0, ${l}, ${h}); x.fillStyle = '#fff'; x.fillRect(12, 12, ${l} - 24, ${h} - 24);
    x.fillStyle = '#111'; x.font = 'bold 30px Arial'; ${JSON.stringify(texte)}.split('|').forEach((t, i) => x.fillText(t, 26, 52 + i * 40));
    const b = await c.convertToBlob({ type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); return b.size; })()`);
  const pressePapierTexte = (t) => ev(`navigator.clipboard.writeText(${JSON.stringify(t)}).then(() => true)`);
  const capture = async (nom) => { mkdirSync(captures, { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${captures}/${nom}.png`, Buffer.from(r.data, 'base64')); };
  const st = `(await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/medrevise/lib/storage.js'))))`;
  return { send, ev, dormir, attendre, pos, survoler, clic, toucher, touche, cmdV, cmdZ, ecrire, pressePapierImage, pressePapierTexte, capture, st, erreurs, fermer: () => ws.close() };
}

let n = 0, ko = 0;
export const ok = (cond, msg, det = '') => { n++; if (!cond) ko++; console.log((cond ? '✅' : '❌') + ' ' + msg + (det ? ' — ' + det : '')); return cond; };
export const bilan = () => { console.log(`\n${n - ko}/${n} vérifications réussies`); return ko; };
