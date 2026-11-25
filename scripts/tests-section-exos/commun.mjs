// Banc « section Exos » (25/11/2026, docs/compte-rendu-section-exos.md). DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud :
//   faux Supabase :54399 (scripts/faux-supabase.mjs), Vite :5300 (config « medrevise-faux-cloud » de .claude/launch.json),
//   Chrome HEADLESS et MUET (--mute-audio), profils NEUFS : 9431 ordinateur A 1440×900 (souris), 9432 iPad 1024×1366
//   (tactile), 9433 téléphone 390×844 (tactile), 9434 ordinateur B 1440×900 (2ᵉ appareil, synchro).
//   Fichiers de test (PDF, HTML d'exercices, HTML malveillant) générés HORS du dépôt dans $TRAVAIL.
// Usage : node lancer-chrome.mjs, puis les t-*.mjs (voir tout.sh). CDP brut, sans dépendance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const BASE = process.env.BASE || 'http://localhost:5300';
export const FAUX_SB = 'http://localhost:54399';
export const TRAVAIL = process.env.TRAVAIL || path.join(os.tmpdir(), 'banc-section-exos');
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/section-exos/', import.meta.url));
export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(DOSSIER_IMG, { recursive: true }); fs.mkdirSync(TRAVAIL, { recursive: true });
export const PORTS = { ordi: 9431, ipad: 9432, tel: 9433, ordiB: 9434 };
const TAILLES = { ordi: [1440, 900, false], ipad: [1024, 1366, true], tel: [390, 844, true], ordiB: [1440, 900, false] };
export const NOMS = { ordi: 'ordinateur', ipad: 'iPad', tel: 'téléphone', ordiB: 'ordinateur B' };
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const sb = (chemin, methode = 'GET') => fetch(FAUX_SB + chemin, { method: methode }).then((r) => r.json());

/* ---------------- fichiers de test ---------------- */
async function pdf(chemin, titre, pages, teinte) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.HelveticaBold); const g = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = d.addPage([595, 842]);
    p.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(...teinte) });
    p.drawText(titre, { x: 40, y: 785, size: 24, font: f, color: rgb(1, 1, 1) });
    p.drawText(`Page ${i} / ${pages}`, { x: 40, y: 760, size: 11, font: g, color: rgb(1, 1, 1) });
    for (let l = 0; l < 26; l++) p.drawText(`${l + 1}. Notion de test : tampon bicarbonate, pH = pKa + log (HCO3- / CO2), anion gap, compensation.`, { x: 40, y: 700 - l * 24, size: 10.5, font: g, color: rgb(0.12, 0.12, 0.16) });
  }
  fs.writeFileSync(chemin, await d.save());
}
const QCM = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>QCM — Équilibre acido-basique</title>
<style>body{font:16px system-ui,sans-serif;margin:24px;max-width:720px}button{margin:4px;padding:8px 12px;border-radius:8px;border:1px solid #aaa;cursor:pointer}.ok{background:#c8f7d4}.ko{background:#fbd0d0}</style></head>
<body><h1>QCM — Équilibre acido-basique</h1>
<p id="q1">1. pH normal du sang artériel ?</p>
<button id="r1a" data-ok="0">7,25</button><button id="r1b" data-ok="1">7,40</button><button id="r1c" data-ok="0">7,60</button>
<p>2. HCO3- normal (mmol/L) : <input id="champ" type="text" placeholder="ta réponse"> <button id="corriger">Corriger</button></p>
<p id="resultat"></p><p>Score enregistré (localStorage) : <span id="score">0</span></p>
<script>
let score = Number(localStorage.getItem('score') || 0); document.getElementById('score').textContent = score;
document.querySelectorAll('button[data-ok]').forEach(function (b) { b.addEventListener('click', function () {
  b.className = b.dataset.ok === '1' ? 'ok' : 'ko'; if (b.dataset.ok === '1') { score++; localStorage.setItem('score', score); sessionStorage.setItem('vu', '1'); document.getElementById('score').textContent = localStorage.getItem('score'); } }); });
document.getElementById('corriger').addEventListener('click', function () {
  const v = Number(document.getElementById('champ').value.replace(',', '.'));
  document.getElementById('resultat').textContent = v >= 22 && v <= 26 ? 'Correct : 24 mmol/L' : 'Faux : attendu 22 à 26 mmol/L'; alert('Correction affichée'); });
</script></body></html>`;
// essaie de sortir de la zone isolée ; écrit ce qu'il obtient dans SA page (lu par le banc dans le contexte de l'iframe)
const MALVEILLANT = `<!doctype html><html><head><meta charset="utf-8"><title>Exercice piégé</title></head><body><h1>Exercice piégé</h1><pre id="rapport"></pre>
<script>
const r = {};
const essai = (nom, f) => { try { const v = f(); r[nom] = 'LU : ' + String(v).slice(0, 80); } catch (e) { r[nom] = 'BLOQUÉ (' + e.name + ')'; } };
essai('cookie', () => document.cookie);
essai('parentDocument', () => window.parent.document.title);
essai('parentLocalStorage', () => window.parent.localStorage.getItem('app.current'));
essai('topLocation', () => window.top.location.href);
essai('origine', () => window.origin);
r.indexedDB = 'en cours';
try { const q = indexedDB.open('medrevise-fiches'); q.onsuccess = () => { r.indexedDB = 'OUVERT'; ecrire(); }; q.onerror = () => { r.indexedDB = 'BLOQUÉ (erreur)'; ecrire(); }; } catch (e) { r.indexedDB = 'BLOQUÉ (' + e.name + ')'; }
essai('cleSupabaseDeLApp', () => window.parent.__mrSupabase || window.parent.eval('1'));
essai('cookieParent', () => window.parent.document.cookie);
function ecrire() { document.getElementById('rapport').textContent = JSON.stringify(r, null, 1); }
ecrire();
setTimeout(() => { try { window.top.location.href = 'https://example.com/?vol'; r.redirectionTop = 'TENTÉE sans erreur'; } catch (e) { r.redirectionTop = 'BLOQUÉ (' + e.name + ')'; } ecrire(); }, 300);
setTimeout(() => { try { window.parent.postMessage({ vol: true }, '*'); r.postMessage = 'envoyé (l’app n’écoute rien)'; } catch (e) { r.postMessage = 'BLOQUÉ'; } try { const w = window.open('https://example.com'); r.popup = w ? 'OUVERTE' : 'BLOQUÉE (null)'; } catch (e) { r.popup = 'BLOQUÉE (' + e.name + ')'; } ecrire(); }, 500);
</script></body></html>`;
export async function fixtures() {
  const f = (n) => path.join(TRAVAIL, n);
  if (!fs.existsSync(f('ok'))) {
    await pdf(f('Fiche-acido-basique.pdf'), 'Fiche — Équilibre acido-basique', 3, [0.05, 0.45, 0.42]);
    await pdf(f('Fiche-potentiel-membrane.pdf'), 'Fiche — Potentiel de membrane', 2, [0.35, 0.2, 0.6]);
    await pdf(f('Exos-calculs-doses.pdf'), 'Exercices — Calculs de doses', 2, [0.75, 0.4, 0.1]);
    await pdf(f('Exos-gaz-du-sang.pdf'), 'Exercices — Gaz du sang', 1, [0.15, 0.35, 0.7]);
    await pdf(f('Exos-nernst.pdf'), 'Exercices — Équation de Nernst', 1, [0.6, 0.15, 0.3]);
    await pdf(f('Fiche-acido-basique-v2.pdf'), 'Fiche v2 — Acido-basique', 2, [0.1, 0.55, 0.5]);
    fs.writeFileSync(f('QCM-acido-basique.html'), QCM);
    fs.writeFileSync(f('Exo-piege.html'), MALVEILLANT);
    fs.writeFileSync(f('Exos-goldman.html'), QCM.replace(/Équilibre acido-basique/g, 'Équation de Goldman'));
    fs.writeFileSync(f('ok'), '1');
  }
  return f;
}

/* ---------------- Chrome du banc ---------------- */
export async function lancerChrome(type, { garder = false } = {}) {
  const port = PORTS[type];
  try { await fetch(`http://localhost:${port}/json/version`); return null; } catch (e) { /* pas encore lancé */ }
  const dir = path.join(TRAVAIL, 'chrome-' + type);
  if (!garder) fs.rmSync(dir, { recursive: true, force: true });
  const p = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--headless=new', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-background-timer-throttling', `--window-size=${TAILLES[type][0]},${TAILLES[type][1]}`, 'about:blank'], { stdio: 'ignore', detached: true });
  p.unref();
  for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${port}/json/version`); break; } catch (e) { await dormir(250); } }
  return p.pid;
}

/** onglet de l'app dans le Chrome de l'appareil, émulation de l'écran, journal des erreurs */
export async function appareil(type) {
  await lancerChrome(type, { garder: true });
  const port = PORTS[type]; const [W, H, tactile] = TAILLES[type];
  const l = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((x) => x.type === 'page');
  const cible = l[0] || await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let n = 0; const att = new Map(); const auditeurs = new Set();
  const b = { type, nom: NOMS[type], port, tactile, W, H, erreurs: [], echecs: 0, contextes: new Map(), resultats: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') b.erreurs.push(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text) + ' @' + (m.params.exceptionDetails.url || ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') b.erreurs.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    if (m.method === 'Runtime.executionContextCreated') b.contextes.set(m.params.context.id, m.params.context);
    if (m.method === 'Runtime.executionContextDestroyed') b.contextes.delete(m.params.executionContextId);
    if (m.method === 'Runtime.executionContextsCleared') b.contextes.clear();
    if (m.method === 'Page.javascriptDialogOpening') { b.erreurs.push('dialogue natif : ' + m.params.message); b.send('Page.handleJavaScriptDialog', { accept: false }); }
    auditeurs.forEach((f) => f(m));
  });
  b.send = (method, params = {}, sessionId = null) => new Promise((res) => { const id = ++n; att.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  b.fermerWs = () => { try { ws.close(); } catch (e) { /* ignore */ } };
  b.ecouter = (f) => { auditeurs.add(f); return () => auditeurs.delete(f); }; // (26/11) événements CDP (banc séances liées)
  await b.send('Page.enable'); await b.send('Runtime.enable'); await b.send('Network.enable'); await b.send('DOM.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: tactile ? 2 : 1, mobile: tactile });
  if (tactile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (type === 'ipad') await b.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  if (type === 'tel') await b.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { try { performance.setResourceTimingBufferSize(20000); } catch (e) {}
    window.__imp = (p) => import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.split('?')[0].endsWith(p)) || p);
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => sessionStorage.getItem('__horsLigne') !== '1' }); })();` });
  b.ev = async (expression, sessionId) => {
    const r = await b.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId || null);
    if (r.result && r.result.exceptionDetails) throw new Error('ev: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  b.S = (code) => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); ${code} })()`);
  b.N = (code) => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); const N = await __imp('/src/medrevise/exos/notions.js'); ${code} })()`);
  b.dormir = dormir;
  b.attendre = async (expr, ms = 10000, pas = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await b.ev(expr)) return true; } catch (e) { /* chargement */ } await dormir(pas); } return false; };
  b.ok = (c, m, d = '') => { console.log(`[${b.nom}] ` + (c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); b.resultats.push({ ok: !!c, m, d }); if (!c) b.echecs++; return c; };
  b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '.png', Buffer.from(s.result.data, 'base64')); return nom; };
  b.rect = (js) => b.ev(`(() => { const e = ${js}; if (!e) return null; e.scrollIntoView && e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  b.point = async (x, y, att = 300) => {
    if (tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await dormir(40);
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: t === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await dormir(att);
  };
  b.clic = async (js, att = 350) => { const r = await b.rect(js); if (!r) return false; await b.point(r.cx, r.cy, att); return true; };
  b.glisser = async (x0, y0, x1, y1, pas = 10) => {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pas; i++) { await dormir(16); await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / pas, y: y0 + ((y1 - y0) * i) / pas, button: 'left', buttons: 1 }); }
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    await dormir(400);
  };
  b.ecrire = (t) => b.send('Input.insertText', { text: t });
  b.touche = async (key, code = key, kc = 0) => {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc }); await dormir(150);
  };
  /** met des fichiers dans un <input type=file> (même caché) — comme le sélecteur de fichiers */
  b.fichiers = async (selecteur, chemins) => {
    const { root } = (await b.send('DOM.getDocument', { depth: -1, pierce: true })).result;
    const q = (await b.send('DOM.querySelector', { nodeId: root.nodeId, selector: selecteur })).result;
    if (!q || !q.nodeId) return false;
    await b.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: chemins });
    await dormir(400); return true;
  };
  /** contexte JS de l'iframe du lecteur HTML (pour LIRE ce qu'elle voit, comme le ferait l'élève) */
  // l'iframe isolée tourne dans un PROCESSUS À PART (cible « iframe about:srcdoc ») : on s'y attache (session CDP)
  b.contexteIframe = async () => {
    const t = (await b.send('Target.getTargets')).result.targetInfos.filter((x) => x.type === 'iframe' && /^about:srcdoc/.test(x.url));
    if (!t.length) return null;
    const r = await b.send('Target.attachToTarget', { targetId: t[t.length - 1].targetId, flatten: true });
    return (r.result && r.result.sessionId) || null;
  };
  b.horsLigne = async (oui) => {
    await b.send('Network.setBlockedURLs', { urls: oui ? [FAUX_SB + '/*'] : [] });
    await b.ev(`(sessionStorage.setItem('__horsLigne', ${oui ? "'1'" : "'0'"}), window.dispatchEvent(new Event(${JSON.stringify(oui ? 'offline' : 'online')})), 1)`);
  };
  b.ouvrirApp = async () => {
    await b.send('Page.navigate', { url: BASE + '/' }); await b.attendre(`document.readyState === 'complete'`, 20000);
    await b.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
    await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000);
    for (let k = 0; k < 60; k++) {
      if (await b.ev(`!!document.querySelector('.sb-item, .mrm-app')`).catch(() => false)) break;
      await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card, [role=button], button, a')].find((e) => /MedRevise/.test(e.innerText || '') && /Ouvrir|Révise/.test(e.innerText || '')); x && x.click(); return 1; })()`).catch(() => {});
      await dormir(500);
    }
    await b.attendre(`!!document.querySelector('.sb-item, .mrm-app')`, 30000);
    await dormir(1500);
  };
  b.attendreSynchro = async (ms = 30000) => { await dormir(500); return b.attendre(`['ajour','local'].includes(document.documentElement.getAttribute('data-mr-synchro'))`, ms, 200); };
  /** passe de synchro complète (même déclencheur que le retour sur l'onglet) */
  b.synchro = async () => { await b.ev(`(window.dispatchEvent(new Event('focus')), 1)`); return b.attendreSynchro(); };
  b.fin = () => {
    const errs = b.erreurs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED_BY_CLIENT|Failed to fetch|NetworkError|validateDOMNesting/.test(e || ''));
    b.ok(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 600));
    console.log(b.echecs ? `[${b.nom}] ❌ ${b.echecs} échec(s)` : `[${b.nom}] ✅ tout est vert`);
    return b.echecs;
  };
  return b;
}

/* ---------------- gestes de la section Exos ---------------- */
export function gestes(b) {
  const g = {};
  g.allerExos = async () => {
    if (b.type === 'tel') {
      if (await b.ev(`!!document.querySelector('.exo-ecran')`)) return true;
      await b.clic(`document.querySelector('[data-entree="exos"]')`, 700);
    } else await b.clic(`[...document.querySelectorAll('.sb-item')].find((e) => (e.title || '') === 'Exos')`, 700);
    return b.attendre(`!!document.querySelector('.exo-ecran')`, 8000);
  };
  g.cartes = () => b.ev(`[...document.querySelectorAll('.exo-carte .lv-carte-titre, .exo-ligne-nom')].map((e) => e.innerText.trim())`);
  g.nouvelle = async () => { await b.clic(`[...document.querySelectorAll('.exo-actions .btn.primary, .exo-vide .btn.primary')][0]`, 500); return b.attendre(`!!document.querySelector('[data-feuille="notion"]')`, 4000); };
  g.remplir = async ({ nom, cours = null, fiche = null, exos = [] }) => {
    if (nom != null) {
      await b.ev(`(() => { const i = document.querySelector('input[aria-label="Nom de la notion"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, ${JSON.stringify(nom)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    }
    if (cours) {
      await b.clic(`document.querySelector('#exo-cours')`, 300);
      await b.clic(`[...document.querySelectorAll('.fc-option')].find((o) => o.innerText.trim() === ${JSON.stringify(cours)})`, 300);
    }
    if (fiche) await b.fichiers('input[data-champ="fiche"]', [fiche]);
    if (exos.length) await b.fichiers('input[data-champ="exos"]', exos);
    await dormir(300);
  };
  g.valider = async () => { await b.clic(`document.querySelector('[data-feuille="notion"] button[type="submit"]')`, 400); return b.attendre(`!document.querySelector('[data-feuille="notion"]')`, 15000); };
  g.retourGrille = () => b.clic(`document.querySelector('.exo-tete .icon-btn')`, 500);
  g.ouvrirNotion = async (nom) => { await b.clic(`[...document.querySelectorAll('.exo-carte, .exo-ligne')].find((c) => c.querySelector('.lv-carte-titre, .exo-ligne-nom').innerText.trim() === ${JSON.stringify(nom)})`, 600); return b.attendre(`!!document.querySelector('.exo-tuiles')`, 5000); };
  g.ouvrirTuile = async (texte) => { await b.clic(`[...document.querySelectorAll('.exo-tuile[data-fichier]')].find((t) => t.innerText.includes(${JSON.stringify(texte)}))`, 800); };
  /** boîte de texte écrite sur la page 1 du PDF ouvert (outil Texte → Boîte), au point (fx, fy) */
  g.annoter = async (texte, fx = 0.5, fy = 0.3) => {
    const outil = async (grp, sous) => {
      if ((await b.ev(`(document.querySelector('[data-outil="${grp}"]')||{}).getAttribute?.('aria-pressed')`)) !== 'true') await b.clic(`document.querySelector('[data-outil="${grp}"]')`, 300);
      if (sous && (await b.ev(`(document.querySelector('[data-sous-outil="${sous}"]')||{}).getAttribute?.('aria-pressed')`)) !== 'true') await b.clic(`document.querySelector('[data-sous-outil="${sous}"]')`, 300);
    };
    await outil('ecrire', 'boite');
    const p = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
    const x = p.x + p.w * fx, y = Math.min(p.y + p.h * fy, b.H * 0.6);
    for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: t === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: b.tactile ? 'pen' : 'mouse' });
    await b.attendre(`!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.note-box .ProseMirror'))`, 4000);
    await b.ecrire(texte); await dormir(1800);
    await b.touche('Escape', 'Escape', 27); await b.touche('Escape', 'Escape', 27);
  };
  g.fermerPdf = async () => { await b.clic(`[...document.querySelectorAll('button')].find((x) => x.title === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour')`, 900); return b.attendre(`!!document.querySelector('.exo-tuiles')`, 6000); };
  g.attendrePdf = () => b.attendre(`!!document.querySelector('[data-lecteur="pdf"] .pdfr-page[data-cle="1"] canvas')`, 25000);
  g.modifier = async () => { await b.clic(`[...document.querySelectorAll('.exo-tete-actions .btn')].find((x) => /Modifier/.test(x.innerText))`, 500); return b.attendre(`!!document.querySelector('[data-feuille="notion"]')`, 4000); };
  g.ligne = (texte) => `[...document.querySelectorAll('[data-fichier-ligne]')].find((l) => l.querySelector('.exo-f-nom').innerText.includes(${JSON.stringify(texte)}))`;
  // lignes des fichiers d'EXERCICES de la feuille (celles qui ont « Monter »), dans l'ordre affiché
  g.lignes = () => b.ev(`[...document.querySelectorAll('[data-fichier-ligne]')].filter((l) => l.querySelector('[aria-label="Monter"]')).map((l) => (l.querySelector('.exo-f-nom') || {}).innerText || (l.querySelector('input') || {}).value)`);
  g.notions = () => b.N(`return JSON.stringify(await N.lireNotions())`).then(JSON.parse);
  return g;
}
