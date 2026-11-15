// Banc « mode file d'attente » (15/11/2026, docs/compte-rendu-mode-file-attente.md). DONNÉES DE TEST UNIQUEMENT.
//   Vite :5310 (config « fa-local » de .claude/launch.json, sans cloud) — ordinateur, tablette, téléphone ;
//   Vite :5311 + faux Supabase :54409 (« fa-cloud », « fa-faux-supabase ») — deux appareils synchronisés ;
//   Vite :5312 = le code d'AVANT le chantier (git archive 481184d) — comparaison mode désactivé.
//   Chrome headless aux profils neufs : 9345 ordinateur 1440×900 (souris), 9346 téléphone 390×844 (tactile),
//   9347 tablette iPad 820×1180 (tactile), 9348 second ordinateur. CDP brut, sans dépendance.
// HORLOGE SIMULÉE : `Date` est décalé dans la page (localStorage `__decalageMs`, posé avant le chargement de l'app) —
// la vraie horloge de la machine n'est jamais touchée.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/file-attente/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });
const PORTS = { ordi: 9345, tel: 9346, tablette: 9347, ordi2: 9348 };
const TAILLES = { ordi: [1440, 900, false], tel: [390, 844, true], tablette: [820, 1180, true], ordi2: [1440, 900, false] };
export const NOMS = { ordi: 'ordinateur', tel: 'téléphone', tablette: 'tablette', ordi2: 'ordinateur 2' };
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const ajouterJours = (j, n) => { const [y, m, d] = j.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };

/** cartes de test : `n` flashcards par jour à partir de `debut` pendant `nbJours` jours, dernière révision `vue` */
export function paquets(debut, nbJours, n, { prefixe = 'c', vue = ajouterJours(debut, -1), fiches = ['fa-f1', 'fa-f2', 'fa-f3'] } = {}) {
  const out = [];
  for (let k = 0; k < nbJours; k++) {
    const j = ajouterJours(debut, k);
    for (let i = 0; i < n; i++) out.push({ id: `${prefixe}${j}-${String(i).padStart(2, '0')}`, type: 'flashcard', ficheId: fiches[i % fiches.length], theme: 'Test', recto: `Question ${j} n° ${i + 1} ?`, verso: `Réponse ${i + 1}`, intervalDays: 3, dueDate: j, j0Date: vue, nouvelle: false, historique: [{ date: vue, qualite: 5 }] });
  }
  return out;
}
export const nouvelles = (n) => Array.from({ length: n }, (_, i) => ({ id: `nv-${String(i).padStart(2, '0')}`, type: 'flashcard', ficheId: 'fa-f1', theme: 'Test', recto: `Nouvelle ${i + 1} ?`, verso: 'R', historique: [], nouvelle: true, intervalDays: 1, dueDate: '2026-11-01', j0Date: '2026-11-01' }));

export async function appareil(type, base = 'http://localhost:5310') {
  const port = PORTS[type]; const [W, H, tactile] = TAILLES[type];
  const l = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((x) => x.type === 'page');
  let cible = l.find((x) => x.url.startsWith(base));
  if (!cible) cible = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  for (const x of l) if (x.id !== cible.id) await fetch(`http://localhost:${port}/json/close/${x.id}`, { method: 'PUT' });
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let n = 0; const att = new Map();
  const b = { type, nom: NOMS[type], base, tactile, W, H, erreurs: [], echecs: 0, resultats: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') b.erreurs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') b.erreurs.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    if (m.method === 'Page.javascriptDialogOpening') b.send('Page.handleJavaScriptDialog', { accept: true });
  });
  b.send = (method, params = {}) => new Promise((res) => { const id = ++n; att.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  b.fermerWs = () => { try { ws.close(); } catch (e) { /* ignore */ } };
  await b.send('Runtime.enable'); await b.send('Page.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: tactile ? 2 : 1, mobile: tactile });
  if (tactile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { try { performance.setResourceTimingBufferSize(20000); } catch (e) {}
    window.__imp = (p) => import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.split('?')[0].endsWith(p)) || p); })();` });
  // horloge simulée : Date décalé de __decalageMs (posé par b.horloge), AVANT tout module de l'app
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const off = Number(localStorage.getItem('__decalageMs') || 0); if (!off) return;
    const D = Date; class FD extends D { constructor(...a) { if (a.length === 0) super(D.now() + off); else super(...a); } static now() { return D.now() + off; } }
    FD.UTC = D.UTC; FD.parse = D.parse; window.Date = FD; })();` });
  b.ev = async (expression) => {
    const r = await b.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('ev: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  b.attendre = async (expr, ms = 10000, pas = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await b.ev(expr)) return true; } catch (e) { /* chargement */ } await dormir(pas); } return false; };
  b.ok = (c, m, d = '') => { const l = `[${b.nom}] ` + (c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : ''); console.log(l); b.resultats.push({ ok: !!c, m, d }); if (!c) b.echecs++; return c; };
  b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '.png', Buffer.from(s.result.data, 'base64')); };
  b.rect = (js) => b.ev(`(() => { const e = ${js}; if (!e) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  b.point = async (x, y, att = 300) => {
    if (tactile) { await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await dormir(40); await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 });
    await dormir(att);
  };
  b.clic = async (js, att = 300) => { await dormir(150); const r = await b.rect(js); if (!r) return false; await dormir(150); await b.point(r.cx, r.cy, att); return true; };

  /** charge l'app (MedRevise) à l'heure simulée courante */
  b.ouvrir = async () => {
    await b.send('Page.navigate', { url: base + '/' });
    await b.attendre(`document.readyState === 'complete'`, 20000);
    if (await b.ev(`localStorage.getItem('app.current')`) !== '"medrevise"') {
      await b.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
      await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000);
    }
    for (let k = 0; k < 60; k++) {
      if (await b.ev(`!!document.querySelector('.sb-item, .mrm-app, .mrm-home')`).catch(() => false)) break;
      await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card')].find((e) => /MedRevise/.test(e.innerText || '')); x && x.click(); return 1; })()`).catch(() => {});
      await dormir(500);
    }
    await b.attendre(`['ajour','local','incomplet'].includes(document.documentElement.getAttribute('data-mr-synchro'))`, 40000);
    await dormir(1500);
  };
  /** horloge simulée : `jour` à `heure` (Europe/Brussels, UTC+1 en novembre), puis rechargement de l'app */
  b.horloge = async (jour, heure = '10:00') => {
    const cible = new Date(`${jour}T${heure}:00+01:00`).getTime();
    // écart calculé depuis l'heure RÉELLE de node (le Date de la page est peut-être déjà décalé)
    await b.ev(`(localStorage.setItem('__decalageMs', String(${cible} - ${Date.now()})), 1)`);
    await b.ouvrir();
  };
  /** efface toutes les données de l'origine (IndexedDB, localStorage) — profil neuf */
  b.vider = async () => {
    await b.send('Page.navigate', { url: base + '/' }); await b.attendre(`document.readyState === 'complete'`, 20000);
    await b.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'indexeddb,local_storage,cache_storage,service_workers' });
    await dormir(400);
  };
  /** sème un cours planifié et ses cartes (en écrivant par le module de stockage de l'app) */
  b.semer = async (cartes) => {
    await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js');
      await S.put('sources', { id: 'fa-src', nom: 'Section test', rappelsJ: true });
      await S.put('matieres', { id: 'fa-mat', nom: 'Matière test', sourceId: 'fa-src' });
      for (const [i, id] of ['fa-f1', 'fa-f2', 'fa-f3'].entries()) await S.put('fiches', { id, matiereId: 'fa-mat', dossierId: null, titre: 'Cours test ' + (i + 1), type: 'standard', ordre: i });
      await S.putMany('questions', ${JSON.stringify(cartes)}); return 1; })()`);
  };
  /** état calculé par les MÊMES modules que l'app : catégories, séance, décalage, enregistrement du mode */
  b.etat = () => b.ev(`(async () => {
    const P = await __imp('/src/medrevise/lib/planning.js'); const C = await __imp('/src/medrevise/lib/categoriesFC.js');
    const F = await __imp('/src/medrevise/lib/fileAttente.js'); const S = await __imp('/src/medrevise/lib/storage.js');
    const sm2 = await __imp('/src/medrevise/lib/sm2.js'); const Q = await __imp('/src/medrevise/session/SeanceFC.jsx');
    const db = { sources: await S.getAll('sources'), matieres: await S.getAll('matieres'), fiches: await S.getAll('fiches'), questions: await S.getAll('questions') };
    const cartes = Q.flashcardsPlanifiees(db); const t = sm2.todayISO();
    const cats = C.categoriser(cartes, t, P.nextDate, F.departageFile(P.dateBase));
    const rec = await S.getFileAttente();
    return { today: t, jourFile: F.jourFile(), retard: cats.retard.map((q) => q.id), revisions: cats.revisions.map((q) => q.id), nouvelles: cats.nouvelles.length,
      decalage: F.decalageAffiche(rec, cartes, P.dateBase), rec, etatModule: F.etatFile() };
  })()`);
  /** chiffres affichés par l'écran de séance (SeanceAujourdhui) */
  b.ecran = () => b.ev(`(() => { const n = (c) => { const e = document.querySelector('[data-cat="' + c + '"] .sfa-cat-n[data-n]'); return e ? Number(e.dataset.n) : null; };
    const d = document.querySelector('[data-sfa="decalage"]');
    return { retard: n('retard'), revisions: n('revisions'), nouvelles: n('nouvelles'), decalage: d ? { n: Number(d.dataset.n), texte: d.innerText.trim(), alerte: d.classList.contains('alerte'), couleur: getComputedStyle(d).color } : null,
      paquet: !!document.querySelector('[data-sfa="paquet-suivant"]'), vide: !!document.querySelector('.sfa.vide') }; })()`);
  /** note des cartes par le chemin de l'app (scheduler/repondre.js, journal compris) — pour les journées « faites » hors écran */
  b.noter = (ids, note = 3) => b.ev(`(async () => { const R = await __imp('/src/medrevise/scheduler/repondre.js'); const S = await __imp('/src/medrevise/lib/storage.js');
    let k = 0; for (const id of ${JSON.stringify(ids)}) { const q = await S.getOne('questions', id); if (!q) continue; await R.repondreFlashcard(q, ${note}, { sauver: (c) => S.put('questions', c) }); k++; } return k; })()`);
  b.aller = async (libelle) => { await b.clic(`[...document.querySelectorAll('.sb-item, .tab-item, .bb-item, nav button')].find((e) => new RegExp(${JSON.stringify(libelle)}).test((e.title || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + e.innerText))`, 900); };
  b.fin = () => {
    const errs = b.erreurs.filter((e) => !/validateDOMNesting|Failed to load resource|ERR_|Failed to fetch|NetworkError|timetable|emploi/i.test(e || ''));
    b.ok(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 500));
    console.log(b.echecs ? `[${b.nom}] ❌ ${b.echecs} échec(s)` : `[${b.nom}] ✅ tout est vert`);
    return b.echecs;
  };
  return b;
}
