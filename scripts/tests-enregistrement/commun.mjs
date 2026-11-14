// Banc « boîtes disparues + enregistrement continu + historique des versions » (14/11/2026,
// docs/compte-rendu-boites-disparues-et-sauvegarde-continue.md). DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud :
//   faux Supabase :54399 (scripts/faux-supabase.mjs), faux GitHub :54398 (../tests-sauvegarde-statut/faux-github.mjs),
//   Vite :5303 (config « medrevise-banc-sauvegarde » de .claude/launch.json),
//   Chrome headless aux profils NEUFS : 9335 ordinateur 1440×900 (souris), 9336 téléphone 390×844 (tactile),
//   9337 tablette 1024×1366 (tactile). CDP brut, sans dépendance.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const BASE = process.env.BASE || 'http://localhost:5303';
export const URL_APP = BASE + '/?banc=enr';
export const FAUX_SB = 'http://localhost:54399';
export const FAUX_GH = 'http://localhost:54398';
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/boites-sauvegarde/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });
const PORTS = { ordi: 9335, tel: 9336, tablette: 9337, reel: 9340 }; // reel : copie restaurée, captures privées (hors dépôt)
const TAILLES = { ordi: [1440, 900, false], tel: [390, 844, true], tablette: [1024, 1366, true], reel: [1440, 900, false] };
export const NOMS = { ordi: 'ordinateur', tel: 'téléphone', tablette: 'tablette', reel: 'copie' };
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const sb = (chemin, methode = 'POST') => fetch(FAUX_SB + chemin, { method: methode }).then((r) => r.json());
export const gh = (chemin, methode = 'POST') => fetch(FAUX_GH + chemin, { method: methode }).then((r) => r.json());

/** PDF de test : `n` pages A4 de texte (cours fictif) */
export async function pdfDeTest(n = 40, titre = 'Cours de test') {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(`${titre} — page ${i}`, { x: 50, y: 790, size: 20, font: f, color: rgb(0.1, 0.1, 0.2) });
    for (let l = 0; l < 30; l++) p.drawText(`Ligne ${l + 1} de la page ${i} : texte de test pour le lecteur, glandes, épithélium, sécrétion.`, { x: 50, y: 740 - l * 22, size: 10, font: f });
  }
  return Buffer.from(await d.save()).toString('base64');
}

/** onglet de l'app dans le Chrome de l'appareil (un seul), émulation de l'écran, journal des erreurs */
export async function appareil(type, { nouvelOnglet = false } = {}) {
  const port = PORTS[type]; const [W, H, tactile] = TAILLES[type];
  let l = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((x) => x.type === 'page');
  let cible = !nouvelOnglet && l.find((x) => x.url.startsWith(BASE));
  if (!cible) cible = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  if (!nouvelOnglet) for (const x of l) if (x.id !== cible.id) await fetch(`http://localhost:${port}/json/close/${x.id}`, { method: 'PUT' });
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let n = 0; const att = new Map(); const auditeurs = new Set();
  const b = { type, nom: NOMS[type], port, tactile, W, H, id: cible.id, erreurs: [], echecs: 0, dialogues: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') b.erreurs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') b.erreurs.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    if (m.method === 'Page.javascriptDialogOpening') { b.dialogues.push(m.params); b.send('Page.handleJavaScriptDialog', { accept: true }); }
    auditeurs.forEach((f) => f(m));
  });
  b.send = (method, params = {}) => new Promise((res) => { const id = ++n; att.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  b.surEvenement = (f) => { auditeurs.add(f); return () => auditeurs.delete(f); };
  b.fermerWs = () => { try { ws.close(); } catch (e) { /* ignore */ } };
  await b.send('Runtime.enable'); await b.send('Page.enable'); await b.send('Network.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: tactile ? 2 : 1, mobile: tactile });
  if (tactile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // « hors ligne » simulé pour l'APP (navigator.onLine + requêtes vers le faux Supabase bloquées) : Vite reste joignable,
  // ce qui permet de RECHARGER la page « hors ligne » sur le banc (le vrai mode avion couperait aussi le serveur de dev)
  // les MÊMES instances de modules que l'app (Vite ajoute ?t=… après une modification : une autre URL = une autre instance)
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { try { performance.setResourceTimingBufferSize(20000); } catch (e) {}
    window.__imp = (p) => import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.split('?')[0].endsWith(p)) || p); })();` });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const h = sessionStorage.getItem('__horsLigne') === '1';
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => sessionStorage.getItem('__horsLigne') !== '1' }); })();` });
  b.ev = async (expression) => {
    const r = await b.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('ev: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  b.S = (code) => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); ${code} })()`);
  b.M = (nom) => `(await __imp('/src/medrevise/lib/${nom}'))`;
  b.dormir = dormir;
  b.attendre = async (expr, ms = 10000, pas = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await b.ev(expr)) return true; } catch (e) { /* page en chargement */ } await dormir(pas); } return false; };
  b.ok = (c, m, d = '') => { console.log(`[${b.nom}] ` + (c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) b.echecs++; return c; };
  b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '.png', Buffer.from(s.result.data, 'base64')); };
  b.horsLigne = async (oui) => {
    await b.send('Network.setBlockedURLs', { urls: oui ? [FAUX_SB + '/*', 'http://localhost:54399/*'] : [] });
    await b.ev(`(sessionStorage.setItem('__horsLigne', ${oui ? "'1'" : "'0'"}), window.dispatchEvent(new Event(${JSON.stringify(oui ? 'offline' : 'online')})), 1)`);
  };
  b.charger = async (url = URL_APP) => {
    await b.send('Page.navigate', { url });
    await b.attendre(`document.readyState === 'complete'`, 20000);
    await b.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
  };
  b.ouvrirApp = async () => {
    await b.charger();
    if (!(await b.ev(`localStorage.getItem('app.current')`))) await b.charger();
    await b.send('Page.reload', { ignoreCache: false });
    await b.attendre(`document.readyState === 'complete'`, 20000);
    for (let k = 0; k < 60; k++) {
      if (await b.ev(`!!document.querySelector('.sb-item, .mrm-app, .mrm-home')`).catch(() => false)) break;
      await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card')].find((e) => /MedRevise/.test(e.innerText || '')); x && x.click(); return 1; })()`).catch(() => {});
      await dormir(500);
    }
    await b.attendre(`!!document.querySelector('.sb-item, [class*="mrm-"]')`, 30000);
    await dormir(1500);
  };
  b.phase = () => b.ev(`document.documentElement.getAttribute('data-mr-synchro')`);
  b.attendreSynchro = async (ms = 30000) => { await dormir(400); return b.attendre(`document.documentElement.getAttribute('data-mr-synchro') === 'ajour'`, ms, 200); };
  b.rect = (js) => b.ev(`(() => { const e = ${js}; if (!e) return null; e.scrollIntoView && e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  b.point = async (x, y, att = 300) => {
    if (tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await dormir(40);
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 });
    await dormir(att);
  };
  /** pointe d'un stylet (tablette : le doigt fait défiler, le stylet annote) ; souris sur ordinateur */
  b.stylet = async (x, y, att = 300) => {
    for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: t === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: tactile ? 'pen' : 'mouse' });
    await dormir(att);
  };
  b.clic = async (js, att = 300) => { const r = await b.rect(js); if (!r) return false; await b.point(r.cx, r.cy, att); return true; };
  b.glisser = async (x0, y0, x1, y1, pas = 10) => {
    if (tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= pas; i++) { await dormir(16); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / pas, y: y0 + ((y1 - y0) * i) / pas, id: 1 }] }); }
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= pas; i++) { await dormir(16); await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / pas, y: y0 + ((y1 - y0) * i) / pas, button: 'left', buttons: 1 }); }
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    }
    await dormir(400);
  };
  b.ecrire = async (t) => { await b.send('Input.insertText', { text: t }); };
  b.touche = async (key, code = key, kc = 0, mods = 0) => {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc, modifiers: mods });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc, modifiers: mods });
    await dormir(150);
  };
  b.echap = () => b.touche('Escape', 'Escape', 27);
  b.fin = () => {
    const errs = b.erreurs.filter((e) => !/validateDOMNesting|Failed to load resource|cannot be a descendant|cannot contain a nested|ERR_BLOCKED_BY_CLIENT|net::ERR|\[enregistrement\] écriture locale impossible|Failed to fetch|NetworkError|panne simulée/.test(e || ''));
    b.ok(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 500));
    console.log(b.echecs ? `[${b.nom}] ❌ ${b.echecs} échec(s)` : `[${b.nom}] ✅ tout est vert`);
    return b.echecs;
  };

  /* ---- lecteur ---- */
  b.bibliotheque = async () => {
    await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /Biblioth/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`); await dormir(1000);
    await b.ev(`(() => { const r = [...document.querySelectorAll('button')].find((x) => (x.title || '') === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour'); r && r.click(); return 1; })()`); await dormir(600);
  };
  b.ouvrirCours = async (titre) => {
    await b.bibliotheque();
    const ok = await b.clic(`[...document.querySelectorAll('.lt-fiche')].find((e) => e.innerText.trim().startsWith(${JSON.stringify(titre)}))`, 600);
    if (!ok) return false;
    const pret = await b.attendre(`!!document.querySelector('.pdfr-page')`, 20000);
    // la position de lecture se restaure après l'ouverture : on attend, puis on revient en haut (page 1)
    await dormir(1500);
    for (let i = 0; i < 5; i++) { await b.ev(`(() => { const s = document.querySelector('.pdfr-scroll'); if (s) s.scrollTop = 0; return 1; })()`); await dormir(400); }
    return pret && b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"]')`, 8000);
  };
  b.fermerCours = async () => { await b.ev(`(() => { const r = [...document.querySelectorAll('button')].find((x) => (x.title || '') === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour'); r && r.click(); return 1; })()`); await dormir(900); };
  const SOUS = { 'Boîte': ['ecrire', 'boite'], Texte: ['ecrire', 'texte'], Crayon: ['dessin', 'crayon'], Gomme: ['dessin', 'gomme'], Forme: ['forme', null] };
  b.outil = async (label) => {
    const g = SOUS[label];
    if (g && await b.ev(`!!document.querySelector('[data-outil="${g[0]}"]')`)) {
      const actif = await b.ev(`document.querySelector('[data-outil="${g[0]}"]').getAttribute('aria-pressed')`);
      if (actif !== 'true' || !g[1]) await b.clic(`document.querySelector('[data-outil="${g[0]}"]')`, 250);
      if (g[1] && (await b.ev(`(document.querySelector('[data-sous-outil="${g[1]}"]')||{}).getAttribute?.('aria-pressed')`)) !== 'true') await b.clic(`document.querySelector('[data-sous-outil="${g[1]}"]')`, 250);
      return;
    }
    await b.clic(`[...document.querySelectorAll('.ptb-outil, .tab-outil, [data-outil]')].find((x) => (x.getAttribute('aria-label') || x.title || '').startsWith(${JSON.stringify(label)}))`, 250);
  };
  b.page = (cle = 1) => b.rect(`document.querySelector('.pdfr-page[data-cle="${cle}"]')`);
  /** coordonnées écran du point (fx, fy) de la page `cle`, amené au milieu de l'écran si besoin */
  b.pointPage = async (cle, fx, fy) => {
    let r = await b.ev(`(() => { const e = document.querySelector('.pdfr-page[data-cle="${cle}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    if (!r) return null;
    const cy = r.y + r.h * fy;
    const z = await b.ev(`(() => { const r = document.querySelector('.pdfr-scroll').getBoundingClientRect(); return { haut: r.top, bas: Math.min(r.bottom, innerHeight) }; })()`);
    if (cy < z.haut + 60 || cy > z.bas - 60) { // au milieu de la zone de lecture VISIBLE (le volet du bas de la tablette la réduit)
      await b.ev(`(() => { const s = document.querySelector('.pdfr-scroll'); s.scrollTop += ${cy - (z.haut + z.bas) / 2}; return 1; })()`); await dormir(500);
      r = await b.ev(`(() => { const r = document.querySelector('.pdfr-page[data-cle="${cle}"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    }
    return Object.assign([r.x + r.w * fx, r.y + r.h * fy], { w: r.w, h: r.h });
  };
  b.focusBoite = () => b.attendre(`!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.note-box .ProseMirror'))`, 3000);
  /** nouvelle boîte au point (fx, fy) de la page `cle` ; renvoie son id une fois l'éditeur prêt */
  b.nouvelleBoite = async (fx, fy, cle = 1) => {
    if (!(await b.ev(`(document.querySelector('[data-sous-outil="boite"]')||{}).getAttribute?.('aria-pressed') === 'true'`))) await b.outil('Boîte');
    const pt = await b.pointPage(cle, fx, fy);
    await b.stylet(pt[0], pt[1], 500);
    await b.focusBoite();
    return b.ev(`(() => { const n = document.querySelector('.note-box.active'); return n ? n.dataset.boite : null; })()`);
  };
  /** retire les annotations créées par un passage précédent du banc (garde le jeu semé) */
  b.nettoyer = (ns = 'f-enr') => b.S(`let n = 0; for (const a of await S.getAll('annotations')) if (a.ficheId === ${JSON.stringify(ns)} && !/^an-(seed|trait)-/.test(a.id)) { await S.remove('annotations', a.id); n++; } return n;`);
  b.etatEnr = () => b.ev(`(() => { const e = document.querySelector('[data-enregistrement]'); return e ? e.dataset.enregistrement : null; })()`);
  b.annots = (ns) => b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === ${JSON.stringify(ns)})`);
  b.texte = (a) => JSON.stringify(a && a.content || '').match(/"text":"([^"]*)"/g)?.map((x) => x.slice(8, -1)).join(' ') || '';
  return b;
}
