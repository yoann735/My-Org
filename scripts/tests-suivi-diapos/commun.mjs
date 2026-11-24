// Banc « suivi automatique des diapos » (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md). DONNÉES DE TEST UNIQUEMENT.
//   Vite :5304 (config « medrevise-banc-diapos » de .claude/launch.json : SANS cloud, faux Deepgram :54410) ;
//   faux Deepgram :54410 (« faux-deepgram-diapos », seuil de parole très bas) ; faux Teams :54411 (« faux-teams »).
//   Chrome FENÊTRÉ hors de l'écran (la capture d'onglet ne marche pas en headless), profil neuf, port 9402, choix de
//   l'onglet partagé AUTOMATIQUE (--auto-select-tab-capture-source-by-title=Faux Teams) : c'est le vrai partage
//   d'onglet de Chrome, avec sa vraie piste vidéo et son vrai son.
//   SILENCE : le son du faux Teams est très faible (≈ −50 dB) ET n'est jamais joué localement — le banc ajoute
//   `suppressLocalAudioPlayback` à la demande de partage de la page (dans le banc seulement, l'app n'est pas modifiée)
//   et le faux Teams ne lance son son qu'APRÈS le début de la capture.
// Le PDF d'histologie (PDF_HISTO, ou celui généré par gen-histo.mjs) reste hors du dépôt ($TRAVAIL).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TRAVAIL = process.env.TRAVAIL || path.join(os.tmpdir(), 'banc-suivi-diapos');
export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const BASE = process.env.BASE || 'http://localhost:5304';
export const TEAMS = process.env.TEAMS || 'http://localhost:54411';
export const DEEPGRAM = process.env.DEEPGRAM || 'http://localhost:54410';
export const PORT_CHROME = Number(process.env.PORT_CHROME || 9402);
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/suivi-auto-diapos/', import.meta.url));
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(TRAVAIL, { recursive: true });

/** client CDP minimal sur la page `cible` (ou une nouvelle page) */
export async function cdp(port, { url = null, cible = null } = {}) {
  let t = cible;
  if (!t) {
    const l = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((x) => x.type === 'page');
    t = url ? await (await fetch(`http://localhost:${port}/json/new?${url}`, { method: 'PUT' })).json() : l[0];
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let n = 0; const att = new Map(); const ecouteurs = new Set();
  const b = { id: t.id, erreurs: [], console: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') b.erreurs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') { const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' '); b.console.push(m.params.type + ' ' + txt); if (m.params.type === 'error') b.erreurs.push(txt); }
    ecouteurs.forEach((f) => f(m));
  });
  b.send = (method, params = {}) => new Promise((res) => { const id = ++n; att.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  b.on = (f) => ecouteurs.add(f);
  b.ev = async (expression) => {
    const r = await b.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('ev: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 700));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  b.attendre = async (expr, ms = 15000, pas = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await b.ev(expr)) return true; } catch (e) { /* chargement */ } await dormir(pas); } return false; };
  b.point = async (x, y) => { for (const ty of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: ty, x, y, button: 'left', clickCount: 1 }); };
  b.clic = async (js, att = 300) => {
    const r = await b.ev(`(() => { const e = ${js}; if (!e) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
    if (!r) return false; await b.point(r.x, r.y); await dormir(att); return true;
  };
  b.capture = async (fichier, clip = null) => { const s = await b.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); fs.writeFileSync(fichier, Buffer.from(s.result.data, 'base64')); return fichier; };
  b.S = (corps) => b.ev(`(async () => { const S = await import('/src/medrevise/lib/storage.js'); ${corps} })()`);
  b.fermer = () => { try { ws.close(); } catch (e) { /* ignore */ } };
  await b.send('Runtime.enable'); await b.send('Page.enable');
  return b;
}

/** Chrome du banc : fenêtré HORS de l'écran (jamais devant toi), profil neuf, partage d'onglet automatique */
export async function lancerChrome({ profil = 'chrome-banc', autoriser = false, garder = false } = {}) {
  const dir = path.join(TRAVAIL, profil);
  if (!garder) fs.rmSync(dir, { recursive: true, force: true });
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT_CHROME}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--window-position=-3000,0', '--window-size=1440,900', '--auto-select-tab-capture-source-by-title=Faux Teams',
    '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', // micro FACTICE : jamais le vrai micro du Mac '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling',
    ...(autoriser ? ['--use-fake-ui-for-media-stream'] : []), // accepte la demande de micro (factice) sans fenêtre
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT_CHROME}/json/version`); break; } catch (e) { await dormir(250); } }
  // micro (factice) autorisé d'avance pour l'app : aucune fenêtre d'autorisation
  try {
    const v = await (await fetch(`http://localhost:${PORT_CHROME}/json/version`)).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
    await new Promise((r) => { ws.addEventListener('message', r, { once: true }); ws.send(JSON.stringify({ id: 1, method: 'Browser.grantPermissions', params: { origin: BASE, permissions: ['audioCapture'] } })); });
    ws.close();
  } catch (e) { /* sans autorisation : la feuille le dira */ }
  return { process: p, arreter: () => { try { p.kill('SIGKILL'); } catch (e) { /* déjà arrêté */ } } };
}

/** CPU cumulé (s) de tous les processus du Chrome du banc (CDP SystemInfo.getProcessInfo, cible « navigateur ») */
export async function cpuChrome() {
  const v = await (await fetch(`http://localhost:${PORT_CHROME}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const rep = await new Promise((r) => { ws.addEventListener('message', (e) => r(JSON.parse(e.data))); ws.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' })); });
  ws.close();
  const l = (rep.result && rep.result.processInfo) || [];
  return { total: l.reduce((s, p) => s + (p.cpuTime || 0), 0), parType: l.reduce((o, p) => { o[p.type] = (o[p.type] || 0) + (p.cpuTime || 0); return o; }, {}) };
}

export const ok = (() => { const r = []; const f = (c, m, d = '') => { const l = (c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : ''); console.log(l); r.push({ ok: !!c, m, d }); return c; }; f.resultats = r; return f; })();
